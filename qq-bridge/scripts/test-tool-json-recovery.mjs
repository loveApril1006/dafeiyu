import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createToolJsonRecovery,isToolJsonFailure} from '../src/tool-json-recovery.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';

const key='private:123';
const error={message:'DeepSeek Messages stream: tool input is invalid JSON'};
const end=(turn=1)=>({type:'turn/end',data:{turn,reason:{kind:'error',error}}});
const start=(turn=1)=>({type:'turn/start',data:{turn}});

test('仅处理这类流式工具 JSON 错误，不混淆余额、历史坏参数或截断',()=>{
  assert.equal(isToolJsonFailure(error),true);
  for(const message of ['DeepSeek Messages historical tool input is invalid JSON','Insufficient Balance','max_tokens','transport failed'])assert.equal(isToolJsonFailure({message}),false);
});

test('最多一次无工具重试，任何工具调用/未知回合证据均不自动重放',()=>{
  const c=createToolJsonRecovery();
  c.observe('s',start());
  const evidence=c.finish('s',{turn:1});
  assert.equal(c.fail(key,1,evidence).retry,true);
  assert.equal(c.allows(key,1,'proactiveCheck'),false);
  assert.equal(c.allows(key,1,'toolJsonRetry',true),true);
  assert.equal(c.allows(key,1,'toolJsonRetry',true),false);
  assert.equal(c.fail(key,1,{noTools:true}).retry,false);
  assert.equal(c.fail(key,1,{noTools:true}).notify,false);
  assert.equal(c.allows(key,2,'private'),true);
  c.observe('s',start());
  c.observe('s',{type:'tool/call',data:{name:'mcp__snowluma__qq_wait_for_messages'}});
  assert.equal(c.fail(key,2,c.finish('s',{turn:1})).retry,false);
  assert.equal(c.allows(key,2,'admin'),true);
  c.observe('s',start());c.disconnect();
  assert.equal(c.fail(key,3,c.finish('s',{turn:1})).retry,false);
  c.complete(key);
  assert.equal(c.allows(key,3,'toolJsonRetry'),false,'已完成后残留定时器不得多请求一次');
  assert.equal(c.fail(key,4,{noTools:true,hasText:true}).retry,false);
});

// Feed the real event loop. Pause each fake SSE stream after its last frame, so
// there is no real DSH/QQ request, reconnect loop, or production state access.
async function fixture(){
  const h=await bridgeHarness();h.setMode('reserved2');
  const sid=await h.ensureSession(key);
  const st=h.getSocialV2State(key);st.lastUnreadSeq=1;
  const frames=[];let resume=null;let done=null;
  h.api.events.mux=async function*(){for(;;){
    while(frames.length)yield{payload:{type:'session/event',sessionId:sid,event:frames.shift()}};
    done?.();done=null;await new Promise(resolve=>{resume=resolve;});
  }};
  void h.pumpMux();
  const feed=async(events)=>{frames.push(...events);const p=new Promise(resolve=>{done=resolve;});resume?.();await p;};
  return {h,sid,st,feed};
}

test('真实事件循环：调用过工具后报错不催促、不重置唤醒、不自动重放',async()=>{
  const {h,st,feed}=await fixture();
  try{
    st.wakeConfig.noActionCount=2;const mode=st.wakeConfig.mode;
    h.pendingWakeKeys.add(key);h.wakeConfigMissCount.set(key,1);
    const before=h.calls.prompts.length;
    await feed([start(),{type:'tool/call',data:{name:'mcp__snowluma__qq_send_voice',callId:'voice'}},
      {type:'tool/result',data:{message:{source:{callId:'voice'},content:[{type:'text',text:'sent'}]}}},end()]);
    assert.equal(st.wakeConfig.noActionCount,2);
    assert.equal(st.wakeConfig.mode,mode);
    assert.equal(h.wakeConfigMissCount.has(key),false);
    assert.equal(h.pendingWakeKeys.has(key),false);
    assert.equal(st.pendingWakeTimer,null);
    assert.equal(h.calls.prompts.length,before);
    assert.equal(h.calls.sent.length,1);
    assert.match(h.calls.sent[0].text,/暂停自动重试/);
    assert.equal(h.replayPendingWakeReasonsV2(key).action,'tool-json-paused');
    await h.sendWakePromptV2(key,'proactiveCheck');
    assert.equal(h.calls.prompts.length,before);
  }finally{await h.close();}
});

test('真实事件循环：无工具只续答一次；再次错误停止；新来信恢复',async()=>{
  const {h,st,feed}=await fixture();
  try{
    h.pendingWakeKeys.add(key);const before=h.calls.prompts.length;
    await feed([start(),end()]);
    assert.ok(st.pendingWakeTimer);assert.equal(h.calls.sent.length,0);
    clearTimeout(st.pendingWakeTimer);st.pendingWakeTimer=null;st.pendingWakeReason=null;
    await h.sendWakePromptV2(key,'toolJsonRetry');
    assert.equal(h.calls.prompts.length,before+1);
    await feed([start(2),end(2)]);
    assert.equal(st.pendingWakeTimer,null);
    assert.equal(h.calls.sent.length,1);
    assert.equal(h.pendingWakeKeys.has(key),false);
    assert.equal(h.replayPendingWakeReasonsV2(key).action,'tool-json-paused');
    st.lastUnreadSeq=2;
    await h.sendWakePromptV2(key,'private');
    assert.equal(h.calls.prompts.length,before+2,'新消息允许恢复，旧消息不反复请求');
  }finally{await h.close();}
});
