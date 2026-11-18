import assert from 'node:assert/strict';
import {completeDshText} from '../src/dsh-completion.js';
import {createTurnCollector} from '../src/dsh-client.js';
import {compactChatHistory} from '../companion/companion-core.mjs';
import {buildSlangContext,buildRelevantSlangContext,SLANG_STATUS} from '../src/slang-learner.js';
import {installEmbeddedPolling} from '../integrations/ui-idle-polling.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';
import fs from 'node:fs';

function fixture({snapshot=true,answer=true,stopFails=false,createDelay=0,closeAfterAnswer=false,reason='completed',responseText='fixture answer',responseBlocks}={}){
 const calls=[];let socket;
 class Socket extends EventTarget {
  constructor(){super();socket=this;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
  emit(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({...value,streamId:this.id})}));}
  send(value){this.id=JSON.parse(value).streamId;if(snapshot)queueMicrotask(()=>this.emit({type:'item',value:{type:'snapshot'}}));}
  close(){calls.push('socket.close');this.dispatchEvent(new Event('close'));}
 }
 const api={ensureAuth:async()=>'',stopSessionWork:async()=>{calls.push('stop');if(stopFails)throw Error('stop unavailable');},
  async callUnary(method){
   calls.push(method);let value={};
   if(method==='workspace.create')value={workspace:{workspaceId:'ws'}};
   if(method==='session.create'){if(createDelay)await new Promise(r=>setTimeout(r,createDelay));value={sessionId:'session'};}
   if(method==='session.prompt'&&answer)queueMicrotask(()=>{
    for(const event of [{type:'turn/start',data:{turn:1}},{type:'assistant/message',data:{turn:1,message:{content:responseBlocks??[{type:'text',text:responseText}]}}},{type:'turn/end',data:{turn:1,reason}}])socket.emit({type:'item',value:{type:'event',event}});
    if(closeAfterAnswer)socket.close();
   });
   return {result:{ok:true,value}};
  }};
 return {calls,api,createSocket:()=>new Socket(),get socket(){return socket;}};
}
for(const options of [{},{stopFails:true},{closeAfterAnswer:true}]){
 const f=fixture(options);assert.equal(await completeDshText({baseUrl:'http://127.0.0.1',cwd:'.',content:[],...f}),'fixture answer');
 assert(f.calls.includes('stop'));assert(f.calls.includes('workspace.archiveSession'));
}
for(const options of [{snapshot:false},{createDelay:80}]){
 const f=fixture(options);await assert.rejects(()=>completeDshText({baseUrl:'http://127.0.0.1',cwd:'.',content:[],timeoutMs:25,...f}),/超时/);
 f.socket?.emit({type:'item',value:{type:'snapshot'}});
 await Promise.resolve();assert(!f.calls.includes('session.prompt'));assert(f.calls.includes('stop'));assert(f.calls.includes('workspace.archiveSession'));
}
{
 const f=fixture({answer:false}),controller=new AbortController();
 const work=completeDshText({baseUrl:'http://127.0.0.1',cwd:'.',content:[],signal:controller.signal,...f});
 await new Promise(r=>setTimeout(r,15));controller.abort(Error('cancel fixture'));
 await assert.rejects(()=>work,/cancel fixture/);assert(f.calls.includes('stop'));assert(f.calls.includes('workspace.archiveSession'));
}
console.log('PASS inference success, timeout before snapshot, delayed create, abort and archival even if stop fails; no late prompts');

for(const [message,expected]of [
 ['402: {"code":30001,"message":"Sorry, your account balance is insufficient","data":null}',/余额或额度不足（HTTP 402）/],
 ['401: bad key fixture-sensitive-value',/密钥无效.*HTTP 401/],
 ['403: forbidden fixture-sensitive-value',/访问权限.*HTTP 403/],
 ['429: rate limit fixture-sensitive-value',/请求受限.*HTTP 429/],
 ['400: image input not supported fixture-sensitive-value',/不支持图片输入/],
 ['404: model missing fixture-sensitive-value',/模型或接口不存在.*HTTP 404/],
 ['400: unsupported parameters fixture-sensitive-value',/模型服务拒绝请求.*HTTP 400/],
 ['DeepSeek Messages request failed (400)',/模型服务拒绝请求.*HTTP 400/],
 ['DeepSeekMessages request failed (400)',/模型服务拒绝请求.*HTTP 400/],
 ['DeepSeek Messages request failed (429)',/请求受限.*HTTP 429/],
 ['503: unavailable fixture-sensitive-value',/暂时不可用.*HTTP 503/],
 ['unknown upstream error fixture-sensitive-value',/模型服务调用失败/]
]){
 for(const responseText of ['', 'partial output must not be returned']){
  const f=fixture({reason:{kind:'error',error:{code:'PI_AI_ERROR',message}},responseText});
  await assert.rejects(()=>completeDshText({baseUrl:'http://127.0.0.1',cwd:'.',content:[],...f}),e=>expected.test(e.message)&&!e.message.includes('fixture-sensitive-value'));
  assert(f.calls.includes('stop'));assert(f.calls.includes('workspace.archiveSession'));
 }
}
{
 const f=fixture({reason:{kind:'cancelled'},responseText:'partial'});
 await assert.rejects(()=>completeDshText({baseUrl:'http://127.0.0.1',cwd:'.',content:[],...f}),/已取消/);
}
console.log('PASS provider balance/auth/rate-limit/image/model/service failures and cancellation stay actionable and redacted, reject partial answers and archive the temporary sessions.');

for(const [reason,expected]of [
 [{kind:'error',error:{status:400,code:'INVALID_REQUEST',message:'fixture-sensitive-value'}},/模型服务拒绝请求.*HTTP 400/],
 [{kind:'error',error:{status:413,code:'CONTEXT_WINDOW_EXCEEDED',message:'fixture-sensitive-value'}},/上下文容量已超限.*HTTP 413/],
 [{kind:'error',failure:{status:402,code:'QUOTA',message:'fixture-sensitive-value'}},/余额或额度不足.*HTTP 402/],
 [{kind:'error',error:{code:'AUTH',message:'fixture-sensitive-value'}},/密钥无效/]
]){
 const f=fixture({reason,responseText:'partial output must not be returned'});
 await assert.rejects(()=>completeDshText({baseUrl:'http://127.0.0.1',cwd:'.',content:[],...f}),e=>expected.test(e.message)&&!e.message.includes('fixture-sensitive-value'));
 assert.equal(f.calls.filter(c=>c==='session.prompt').length,1,'provider error must not cause a new paid request');
 assert(f.calls.includes('stop'));assert(f.calls.includes('workspace.archiveSession'));
}
console.log('PASS DeepSeek fallback status and structured provider codes remain classifiable without raw-body disclosure or automatic retries.');

for(const responseBlocks of [[{type:'reasoning',text:'{"color":"red"}'}],[{type:'thinking',text:'fixture private reasoning'}]]){
 const f=fixture({responseBlocks,reason:{kind:'completed'}});
 await assert.rejects(()=>completeDshText({baseUrl:'http://127.0.0.1',cwd:'.',content:[],...f}),e=>/只返回了推理内容/.test(e.message)&&!e.message.includes('fixture private reasoning')&&!e.message.includes('"color"'));
 assert(f.calls.includes('workspace.archiveSession'));
}
{
 const f=fixture({responseBlocks:[{type:'reasoning',text:'fixture private reasoning'},{type:'text',text:'visible final answer'}]});
 assert.equal(await completeDshText({baseUrl:'http://127.0.0.1',cwd:'.',content:[],...f}),'visible final answer');
}
console.log('PASS reasoning-only completions produce a format-specific error, reasoning JSON cannot pass as a final answer, and ordinary final text remains separate.');

const collector=createTurnCollector({maxChars:100,maxTurns:3});
for(let turn=0;turn<100;turn++)collector.push({type:'turn/start',data:{turn}});
assert.equal(collector.size(),3);
collector.push({type:'assistant/message',data:{turn:99,message:{content:[{type:'text',text:'x'.repeat(10000)}]}}});
assert.equal(collector.push({type:'turn/end',data:{turn:99}}).text.length,100);

const history=Array.from({length:100},(_,i)=>({role:i%2?'assistant':'user',text:i+' '+ '测'.repeat(4000),at:'2026-01-01'}));
const rawHistory=JSON.stringify(history.slice(-16)).length,compactHistory=JSON.stringify(compactChatHistory(history)).length;
assert(compactHistory<=8000);assert.equal(history[99].text.length,4003);assert.equal(compactChatHistory(history).at(-1).text.slice(0,3),'99 ');
const entries=Array.from({length:12},(_,i)=>({content:'词语'+i,meaning:'释义'.repeat(140),status:SLANG_STATUS.CONFIRMED,count:12-i}));
assert.equal(buildRelevantSlangContext(entries,'今天看天气'), '');
assert.match(buildRelevantSlangContext(entries,'词语3 是什么意思'),/词语3/);
assert(!buildRelevantSlangContext(entries,'词语3 是什么意思').includes('词语1：'));
assert(buildRelevantSlangContext(entries,entries.map(e=>e.content).join(' ')).length<=1600);
fs.mkdirSync('state/performance-audit',{recursive:true});
fs.writeFileSync('state/performance-audit/context-budget.json',JSON.stringify({synthetic:true,historyBeforeChars:rawHistory,historyAfterChars:compactHistory,unrelatedGlossaryBeforeChars:buildSlangContext(entries,12).length,unrelatedGlossaryAfterChars:0},null,2));
console.log('PASS bounded collector and contextual projections; stored chat history stays unchanged');

{
 let next=1,observerCallback;const handles=new Map(),doc=new EventTarget();doc.hidden=false;
 const panel={hidden:false};const win={document:doc,frameElement:{closest:()=>panel},
  setInterval(fn){const id=next++;handles.set(id,fn);return id;},clearInterval(id){handles.delete(id);},clearTimeout(){},
  MutationObserver:class{constructor(fn){observerCallback=fn;}observe(){}disconnect(){}},addEventListener(){}};
 const dispose=installEmbeddedPolling(win);let ticks=0;const id=win.setInterval(()=>ticks++,1000);
 for(const fn of handles.values())fn();await Promise.resolve();assert.equal(ticks,1);
 panel.hidden=true;observerCallback();assert.equal(handles.size,0);
 panel.hidden=false;observerCallback();await Promise.resolve();assert.equal(handles.size,1);assert.equal(ticks,2);
 doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(handles.size,0);
 doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));win.clearInterval(id);dispose();assert.equal(handles.size,0);
}
console.log('PASS embedded UI interval pause, resume, visibility handling and disposal');

{
 const h=await bridgeHarness();try{
  let resolve,requests=0;const call=h.api.callUnary;
  h.api.callUnary=(method,args,signal)=>method==='settings.describe'?(requests++,new Promise(r=>resolve=r)):call(method,args,signal);
  const first=h.checkDsh();await h.checkDsh();assert.equal(requests,1);
  resolve({result:{ok:true,value:{namespaces:[]}}});await first;assert.equal(requests,1);
 }finally{await h.close();}
}
console.log('PASS DSH health polling is single-flight and reuses one settings response');

{
 let scheduled=0;const h=await bridgeHarness({globals:{setTimeout:()=>{scheduled++;return {unref(){}};},clearTimeout(){}}});
 try{
  h.setMode('chat');h.setReady(true);h.setPresets(['qq-chat']);
  for(let i=0;i<100;i++)h.enqueueForRetry('private:123','same pending message',{silent:true});
  assert.equal(scheduled,1);assert.equal(h.queued.get('private:123').length,1);
  let prompts=0;h.api.sessions.prompt=async()=>{prompts++;return {result:{ok:false,error:{message:'fixture unavailable'}}};};
  await h.flushQueue();assert.equal(prompts,1);assert(h.queueRetryAt.get('private:123')>Date.now());
  await h.flushQueue();assert.equal(prompts,1,'Another flush must respect the per-channel retry deadline');
 }finally{await h.close();}
}
console.log('PASS burst retries share one timer and preserve channel-specific backoff');

{
 const h=await bridgeHarness({config:{slang:{enabled:true,extractMinMessages:1,autoResearch:false}}});
 try{
  h.setReady(true);h.setPresets(['qq-chat']);
  const old=Array.from({length:80},(_,i)=>({sender:'fixture',text:'old '+i,time:i}));h.slangWindows.set('group:456',old.slice());
  const work=h.queueSlangExtraction('group:456');assert.equal(h.queueSlangExtraction('group:456'),work);
  while(!h.learnerWaiters.size)await new Promise(r=>setImmediate(r));
  const [sid,waiters]=[...h.learnerWaiters][0];
  const arrived=Array.from({length:20},(_,i)=>({sender:'fixture',text:'new '+i,time:100+i}));
  const live=h.slangWindows.get('group:456');live.push(...arrived);live.splice(0,20);
  clearTimeout(waiters[0].timer);h.learnerWaiters.delete(sid);waiters[0].resolve('[]');await work;
  assert.deepEqual(h.slangWindows.get('group:456').map(m=>m.text),arrived.map(m=>m.text));
  const active=h.queueSlangExtraction('group:456');
  while(!h.learnerWaiters.size)await new Promise(r=>setImmediate(r));
  const jobs=h.calls.prompts.length;
  h.queueSlangResearch([{id:'candidate',content:'test'}]);h.queueSlangResearch([{id:'candidate',content:'test'}]);
  assert.equal(h.slangResearchingIds.size,1);
  h.cfg.slang.enabled=false;await h.invalidateSlangLearnerSession();await active;
  while(h.slangResearchingIds.size)await new Promise(r=>setImmediate(r));
  assert.equal(h.calls.prompts.length,jobs);assert.equal(h.learnerSessions.size,0);assert.equal(h.learnerWaiters.size,0);
  assert(h.calls.cancelled.includes(sid));assert(h.calls.archived.includes(sid));
 }finally{await h.close();}
}
console.log('PASS learner snapshot keeps new/rolled messages; duplicate jobs coalesce and disable stops active sessions');

{
 const h=await bridgeHarness({config:{slang:{enabled:true,extractMinMessages:1,autoResearch:false}}});
 try{
  h.setReady(true);h.setPresets(['qq-chat']);h.slangWindows.set('group:456',[{sender:'fixture',text:'one',time:1}]);
  h.api.sessions.prompt=async()=>{
   const [sid,waiters]=[...h.learnerWaiters][0] || [];assert(waiters?.length,'Subscribe before sending the prompt');
   clearTimeout(waiters[0].timer);h.learnerWaiters.delete(sid);waiters[0].resolve('[]');
   return {result:{ok:true,value:{}}};
  };
  await h.runSlangExtraction('group:456');assert.equal(h.slangWindows.get('group:456').length,0);
 }finally{await h.close();}
}
console.log('PASS a learner result arriving before the prompt HTTP response is not lost');
