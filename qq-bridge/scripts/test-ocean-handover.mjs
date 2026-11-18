import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';import path from 'node:path';
import {contextCapacity,requestContextTokens,contextMemoryConfig} from '../src/context-capacity.js';
import {createPortableSettings} from '../src/portable-settings.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';

const usage=(n=350000)=>({type:'assistant/message',data:{usage:{inputTokens:271,cacheReadTokens:n-271,outputTokens:146}}});
async function fixture(fn){const h=await bridgeHarness({files:{'state/current-role.json':{role:'接续测试鱼',mode:'active'},'roles/接续测试鱼.md':'你叫接续测试鱼，按最新人格描述说话。'},config:{socialV2:{proactive:{enabled:false},sticker:{enabled:false}}}});try{
 h.setMode('reserved2');const key='private:123',hub=h.memoryHub();await hub.synchronize();
 h.appendSocialV2Message(key,'用户','继续修改星图的圆环效果，明天检查手机显示','继续修改星图的圆环效果，明天检查手机显示',false,true,'current-task',[],'123');
 h.appendSocialV2Message('group:456','别群成员','另一群的独有保密话题','另一群的独有保密话题',false,false,'other-scope',[],'456');
 const st=h.getSocialV2State(key);st.activeTopics=[{text:'圆环的手机布局',lastMentionAt:Date.now()}];st.wakeConfig.batchWindowMs=3600000;
 const memo=hub.continuity.saveMemo(key,{kind:'commitment',body:'还要检查手机显示，尚未完成'});
 const sid=await h.ensureSession(key);await fn({h,key,hub,st,sid,memo});
 assert.equal(h.calls.sent.length,0,'tests must not send QQ messages');
 }finally{await h.close();}}

test('capacity uses one request including cache reads, conservative limits and real output reserve',()=>{
 assert.equal(requestContextTokens(usage(449807).data.usage),449953);
 assert.equal(requestContextTokens({inputTokens:-1}),null);assert.equal(requestContextTokens({totalTokens:9999999}),null);assert.equal(requestContextTokens({outputTokens:100}),null);
 assert.equal(contextMemoryConfig(null).maxContextTokens,400000);
 const sample={usedTokens:350000,windowTokens:1048576,outputTokens:8192,updatedAt:100};
 const c=contextCapacity(sample,{}, {now:100});assert.equal(c.windowTokens,400000);assert.equal(c.reportedWindowTokens,1048576);assert(c.shouldHandover);
 assert.equal(contextCapacity(sample,{}, {now:100000}),null,'stale runtime projections are not fresh observations');
 assert(contextCapacity({...sample,source:'provider-request-usage'}, {}, {now:100000}).shouldHandover,'idle must not erase the last per-request sample');
 assert(!contextCapacity({...sample,usedTokens:1000},{},{now:100}).shouldHandover);
 assert.equal(contextCapacity(sample,{maxContextTokens:0},{now:100}).windowTokens,1048576);
 assert.deepEqual(createPortableSettings({bridge:{contextMemory:{enabled:true,maxContextTokens:300000,handoverRatio:.8}}}).settings.bridge.contextMemory,{enabled:true,maxContextTokens:300000,handoverRatio:.8});
});

test('pre-dispatch handover preserves current question, pending work, workspace, memory and queued order',()=>fixture(async({h,key,hub,st,sid})=>{
 const count=hub.ocean.db.prepare('SELECT count(*) n FROM messages').get().n;
 h.recordSessionUsage(sid,usage());assert(hub.capacity(key).shouldHandover);
 const originalUnread=st.unread.map(r=>r.messageId);
 await Promise.all([h.deliverPrompt(key,'当前问题：把圆环和手机显示接着完善'),h.deliverPrompt(key,'第二个排队问题：保留聊天轨道')]);
 const next=h.state.sessions[key];assert.notEqual(next,sid);assert(h.calls.archived.includes(sid));assert.equal(h.calls.created.length,2);
 assert.equal(h.calls.created[0].workspaceId,h.calls.created[1].workspaceId);
 assert.equal(h.calls.prompts.length,2);const first=h.calls.prompts[0].content[0].text,second=h.calls.prompts[1].content[0].text;
 assert.match(first,/当前问题：把圆环/);assert.match(first,/会话连续性笔记/);assert.match(first,/尚未完成/);assert.match(first,/圆环的手机布局/);assert.match(first,/你叫接续测试鱼/);
 assert.doesNotMatch(first,/另一群的独有保密话题/);assert.match(second,/第二个排队问题/);assert.doesNotMatch(second,/【会话连续性笔记】/);
 assert.deepEqual(st.unread.map(r=>r.messageId),originalUnread);assert.equal(hub.ocean.db.prepare('SELECT count(*) n FROM messages').get().n,count);
 const saved=JSON.parse(fs.readFileSync(path.join(h.temp,'state/context-health.json'),'utf8'))[key];
 assert.equal(saved.deliveredTo,next);assert.equal(JSON.parse(saved.handover).format,1);assert(saved.handover.length<=7000);
 assert.equal(h.contextHealth[key].attempts.length,0,'healthy proactive handovers do not consume failure-retry allowance');assert.equal(h.contextHealth[key].handovers,1);
}));

test('ordinary 400 keeps session; high-context 400 can recover once without inferring an error body',()=>fixture(async({h,key,hub,sid})=>{
 const failure={code:'INVALID_REQUEST',status:400,message:'DeepSeek Messages request failed (400)'};
 assert.equal(await h.recoverContextOverflow(key,sid,failure),false);assert.equal(h.state.sessions[key],sid);
 h.recordSessionUsage(sid,usage(449807));assert(hub.capacity(key).shouldHandover);h.setReady(false);
 assert(await h.recoverContextOverflow(key,sid,failure));const next=h.state.sessions[key];assert.notEqual(next,sid);
 assert.equal(await h.recoverContextOverflow(key,sid,failure),false,'late old-session failures cannot rotate a healthy new one');
 assert.equal(await h.recoverContextOverflow(key,next,failure),false,'new session has no pressure evidence');
 assert.equal(h.calls.prompts.length,0,'failure recovery must not submit while the engine is offline');
}));

test('handover revalidates withdrawal and role before the new session sees any saved text',()=>fixture(async({h,key,hub,sid})=>{
 h.appendSocialV2Message(key,'用户','我喜欢撤回专用旧偏好','我喜欢撤回专用旧偏好',false,true,'old-fact',[],'123');
 h.setReady(false);await h.handoverContext(key,sid);const next=h.state.sessions[key];
 const fact=hub.ocean.list(key,{kind:'fact'}).items.find(r=>r.title.includes('撤回专用旧偏好'));assert(fact);hub.ocean.mutate(key,fact.id,'delete');
 const note=h.contextHandover(key,next);assert.doesNotMatch(note,/撤回专用旧偏好/);assert.match(note,/尚未完成/);
 fs.writeFileSync(path.join(h.temp,'roles/接续测试鱼.md'),'你叫更新后的鱼，新人格正文优先。');
 assert.equal(h.contextHandover(key,next),'','old role revision cannot replay a saved handover');
 assert.equal(h.contextHealth[key].handover,'');
}));

test('snapshot recovery uses request samples, never lifetime billing totals; active turns are not interrupted',()=>fixture(async({h,key,hub,sid})=>{
 h.recordSessionSnapshot(sid,{projections:{values:{tokenUsage:{total:999999999}}},records:[]});assert.equal(hub.capacity(key),null);
 h.recordSessionSnapshot(sid,{records:[{event:usage()}]});assert(hub.capacity(key).shouldHandover);
 h.trackTurnEvent(sid,{type:'turn/start',data:{turn:1}});
 const result=await h.deliverPrompt(key,'正在运行的回合结束后再处理我');assert(result.queued);assert.equal(h.state.sessions[key],sid);assert.equal(h.calls.prompts.length,0);assert.equal(h.calls.archived.length,0);assert(h.queued.get(key)?.length);
 h.trackTurnEvent(sid,{type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});h.finishingContextTurns.add(sid);
 assert((await h.deliverPrompt(key,'正在发出的旧回复不能因交接被取消')).queued);assert.equal(h.state.sessions[key],sid);assert.equal(h.calls.archived.length,0);h.finishingContextTurns.delete(sid);
}));

test('a failed new-session creation keeps the pending prompt and persisted handover for reconnect',()=>fixture(async({h,key,sid})=>{
 h.recordSessionUsage(sid,usage());const create=h.api.sessions.create;h.api.sessions.create=async()=>{throw Error('fixture disconnected');};
 const result=await h.deliverPrompt(key,'网络恢复后继续这个当前问题');assert(result.queued);assert(h.queued.get(key).some(r=>r.promptText.includes('网络恢复后继续这个当前问题')));
 const saved=JSON.parse(fs.readFileSync(path.join(h.temp,'state/context-health.json'),'utf8'))[key];assert(saved.handover);assert.equal(saved.deliveredTo,null);
 h.api.sessions.create=create;await h.flushQueue();assert.equal(h.calls.prompts.length,1);assert.match(h.calls.prompts[0].content[0].text,/网络恢复后继续这个当前问题/);assert.match(h.calls.prompts[0].content[0].text,/会话连续性笔记/);
}));
