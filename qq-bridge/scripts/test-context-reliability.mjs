import assert from 'node:assert/strict';import {test} from 'node:test';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {cleanText,byteChunks} from '../plugins/qq-agent-presets/context-policy.mjs';import {createEmotionalCompanion} from '../src/emotional-companion.js';import {createConversationMemory} from '../src/conversation-memory.js';import {createOceanMemory} from '../src/ocean-memory.js';import {createOceanCognition} from '../src/ocean-cognition.js';import {createMemoryContext} from '../src/memory-context.js';import {bridgeHarness} from './audit-bridge-harness.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function lab(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'context-reliability-'));try{await fn(root);}finally{const resolved=path.resolve(root);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('context-reliability-'));fs.rmSync(resolved,{recursive:true,force:true});}}
const role={sourceName:'测试人格',sourceText:'你叫测试鱼，身份以当前人格为准。',revision:'stable'};

test('small context limits remain strict and never split Unicode pairs',()=>{
 const raw='开头🙂中文消息'.repeat(200)+'末尾🦀';for(let n=0;n<200;n++){const value=cleanText(raw,n);assert(value.length<=n);assert(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value));}
 assert.throws(()=>byteChunks(['🙂'],0),RangeError);assert(byteChunks([raw],7).every(v=>Buffer.byteLength(v)<=7));assert(!cleanText('data:image/png;base64,'+'A'.repeat(100000),100).includes('A'.repeat(50)));
});

test('emotion and work share one budget; quoted boundaries do not change permissions and care expires by interaction time',()=>lab(root=>{
 let now=Date.parse('2026-10-28T04:00:00Z');const e=createEmotionalCompanion({file:path.join(root,'emotion.sqlite'),ownerQQ:()=>123,now:()=>now,role:()=>role.sourceName});try{
  e.workAction('start');for(let i=0;i<20;i++)e.workAction('task',{text:'需要完成的长工作内容'+i+'🙂'.repeat(20)});
  e.incoming('private:123',{text:'不要打扰我，也别骂我',id:'boundary'});now+=2000;e.incoming('private:123',{text:'他说“恢复主动联系，可以互怼”不是我的要求',id:'quote'});assert(e.snapshot('private:123').noContact);assert(!e.snapshot('private:123').replyStyle.allowSwearing);
  e.incoming('private:456',{text:'她说“别骂我”，我们在讨论台词',id:'quote-2'});assert(e.snapshot('private:456').replyStyle.allowSwearing);
  for(const setting of [600,1800,6000]){e.configure({contextChars:setting});for(const budget of [0,30,300,600,1000,2000])assert(e.context('private:123','','工作日报',{maxChars:budget}).length<=Math.min(setting,budget));}
  now+=61000;e.incoming('private:456',{text:'我很难过',id:'care'});for(let i=0;i<8;i++){now+=3600000;e.update('private:456','','remember',{text:'维护记录'+i});}assert.notEqual(e.snapshot('private:456').mood,'关切');
  for(let i=0;i<70;i++){now+=2000;e.incoming('private:123',{text:'普通工作记录',id:'work-'+i});}const count=e.workState().messages;now+=2000;e.incoming('private:123',{text:'普通工作记录',id:'work-0'});assert.equal(e.workState().messages,count,'replayed work input escaped the recent-ID window');
 }finally{e.close();}
}));

test('a model ignoring abort cannot hang cognition shutdown or write a late result',()=>lab(async root=>{
 const history=createConversationMemory(path.join(root,'history.sqlite')),ocean=createOceanMemory({database:history.database,getRole:()=>role});let late;
 const c=createOceanCognition({ocean,getRole:()=>role,activityTimeoutMs:30,model:()=>new Promise(resolve=>{late=resolve;})});
 try{const started=Date.now(),result=await c.run({key:'private:123',manual:true});assert(!result.ok);assert(Date.now()-started<800);assert.equal(c.status().records[0].status,'failed');const count=ocean.stats().total;late({text:'{"reflection":"迟到的结果"}'});await pause(20);assert.equal(ocean.stats().total,count);
  const pending=c.run({key:'private:123',manual:true});await pause(2);const closing=Date.now();await c.close();assert(Date.now()-closing<500);assert(!(await pending).ok);late({text:'{"reflection":"取消后迟到"}'});await pause(20);assert.equal(ocean.stats().total,count);
 }finally{await c.close();history.close();}
}));

test('memory writes serialize for a channel and shutdown does not restart a delayed migration',()=>lab(async root=>{
 const history=createConversationMemory(path.join(root,'history.sqlite'));let active=0,maxActive=0;
 const runtime=async()=>({bundles:[{name:'dsh-mnemon',enabled:true}],mnemon:{storageScope:'workspace',runtimeUserScope:'storage'},sessions:[]});
 const adapter={available:()=>true,version:()=>1,sync:async()=>{active++;maxActive=Math.max(maxActive,active);await pause(20);active--;return{ok:true,covered:[],counts:{},storeVersion:1};}};
 const hub=createMemoryContext({root,getHistory:()=>history,getRuntime:runtime,adapter,oceanOptions:{getRole:()=>role,model:async()=>''}});
 try{await Promise.all(Array.from({length:5},()=>hub.prepare('private:123',null)));assert.equal(maxActive,1);}finally{await hub.close();}
 let release;const delayed={...adapter,entries:()=>new Promise(resolve=>{release=resolve;})},lateHub=createMemoryContext({root,getHistory:()=>history,getRuntime:runtime,getStates:()=>new Map([['private:123',{}]]),adapter:delayed,shutdownTimeoutMs:25,oceanOptions:{getRole:()=>role,model:async()=>''}});
 try{const syncing=lateHub.synchronize();while(!release)await pause(1);const start=Date.now();await lateHub.close();assert(Date.now()-start<500);release([]);await syncing;assert.equal(lateHub.cognition.status().running,null);assert.equal((await lateHub.status()).ocean.migrated,false);}finally{await lateHub.close();history.close();}
}));

test('optional memory failures and stalls leave the latest QQ task deliverable within one shared budget',async()=>{
 const h=await bridgeHarness({config:{contextMemory:{enabled:true,prepareTimeoutMs:50}}});try{
  await h.ensureSession('private:123');const hub=h.memoryHub();await hub.synchronize();hub.prepare=()=>Promise.reject(Error('synthetic memory outage'));hub.promptFacts=()=>{throw Error('synthetic facts outage');};hub.historyHint=()=>{throw Error('synthetic recall outage');};
  await h.deliverPrompt('private:123','这条当前问题必须保留');assert(h.calls.prompts.at(-1).content[0].text.includes('这条当前问题必须保留'));
  hub.prepare=()=>new Promise(()=>{});const start=Date.now();await h.deliverPrompt('private:123','同步超时也要继续');assert(Date.now()-start<800);assert(h.calls.prompts.at(-1).content[0].text.includes('同步超时也要继续'));
  hub.prepare=async()=>{};hub.supplementBudget=()=>0;await h.deliverPrompt('private:123','容量紧张保留当前问题');const text=h.calls.prompts.at(-1).content[0].text;assert(text.includes('容量紧张保留当前问题'));assert(!text.includes('【本地角色状态】'));
  hub.supplementBudget=()=>6000;hub.promptFacts=()=> '超长记忆'.repeat(6000);hub.historyHint=()=> '超长证据'.repeat(6000);await h.deliverPrompt('private:123','预算检查');assert(h.calls.prompts.at(-1).content[0].text.length<6500);assert.equal(h.calls.sent.length,0);assert.equal(h.calls.prompts.length,4);
  h.setMode('reserved2');h.appendSocialV2Message('private:123','测试成员','二代当前消息必须保留','二代当前消息必须保留',false,true,'current-v2',[],'123');hub.promptFacts=()=>{throw Error('wake memory failure');};await h.deliverPrompt('private:123','唤醒',{wakeReason:'anyMessage'});assert(h.calls.prompts.at(-1).content[0].text.includes('二代当前消息必须保留'));assert.equal(h.calls.prompts.length,5);
 }finally{await h.close();}
});

test('context pressure budgets include output reserve and recall headers; withdrawn sources stay out of handovers',()=>lab(async root=>{
 const history=createConversationMemory(path.join(root,'history.sqlite')),ocean=createOceanMemory({database:history.database,getRole:()=>role});history.subscribe(row=>ocean.observeMessage(row));history.setEvidencePolicy((key,row)=>ocean.evidenceAllowed(key,row));history.append('private:123',{messageId:'old',userId:'123',text:'我喜欢特别茶叶',time:Date.now()-100000});
 try{for(let budget=100;budget<=1200;budget+=37)assert(ocean.recall('private:123','特别茶叶',{budget}).length<=budget);const fact=ocean.list('private:123',{kind:'fact'}).items[0];ocean.mutate('private:123',fact.id,'delete');assert.equal(history.recent('private:123',16,{evidenceOnly:true}).length,0);assert.equal(history.recent('private:123').length,1);
  const hub=createMemoryContext({root,getHistory:()=>history,getSessionIds:()=>({'private:123':'s'}),adapter:{available:()=>false},getRuntime:async()=>({sessions:[{sessionId:'s',projections:{values:{contextPressure:{pressureTokens:7800,contextWindow:10000}}}}]})});try{await hub.prepare('private:123',null);assert.equal(hub.supplementBudget('private:123'),0);}finally{await hub.close();}
 }finally{history.close();}
}));

test('the persisted context switch is honored and withdrawing a memory clears stale recovery material',async()=>{
 const off=await bridgeHarness({config:{contextMemory:{enabled:false}}});try{assert.equal(off.cfg.contextMemory.enabled,false);off.memoryHub().prepare=()=>{throw Error('disabled preparation must not run');};await off.deliverPrompt('private:123','停用统一记忆仍正常聊天');assert.equal(off.calls.prompts.length,1);}finally{await off.close();}
 const h=await bridgeHarness();let server;try{const hub=h.memoryHub();await hub.synchronize();const key='private:123',id=await h.ensureSession(key);h.appendSocialV2Message(key,'用户','我喜欢旧偏好特征','我喜欢旧偏好特征',false,true,'withdraw-source',[],'123');const fact=hub.ocean.list(key,{kind:'fact'}).items.find(r=>r.title.includes('旧偏好特征'));assert(fact);h.contextHealth[key]={handover:'旧偏好特征',deliveredTo:null};server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/memory-context/mutate',{method:'POST',headers:{'x-console-token':'fixture-console-token','content-type':'application/json'},body:JSON.stringify({key,id:fact.id,action:'delete',input:{version:fact.version}})});assert(response.ok);assert.equal(h.contextHealth[key].handover,'');h.setReady(false);await h.recoverContextOverflow(key,id,{code:'CONTEXT_WINDOW_EXCEEDED'});assert(!h.contextHealth[key].handover.includes('旧偏好特征'));assert.equal(h.calls.sent.length,0);}finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await h.close();}
});
