import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL}from'node:url';
import {createMemoryContext} from '../src/memory-context.js';
import {createMnemonMemoryAdapter} from '../src/mnemon-memory-adapter.js';
import {createConversationMemory} from '../src/conversation-memory.js';
import {qqMemoryWorkspace} from '../src/qq-memory-scope.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';
import {memoryFacts} from '../src/memory-facts.js';

const lab=fs.mkdtempSync(path.join(os.tmpdir(),'memory-unified-')),root=path.join(lab,'qq-bridge');fs.mkdirSync(root);
const modulePath=path.resolve(process.env.MNEMON_SOURCE_MODULE || '../engine-home/profiles/web/node_modules/dsh-mnemon-source-runtime/lib/index.js');
const {createRuntimeMemorySource}=await import(pathToFileURL(modulePath));
const source=(key,limits={})=>{const directory=path.join(qqMemoryWorkspace(root,key),'.mnemon');return createRuntimeMemorySource({dataDir:directory,userDataDir:directory,...limits}).create({sourceInstanceKey:'runtime',configuration:{}});};
const snapshot=async src=>(await src.manage({mode:'read',operation:'snapshot',input:{}})).value;
const mutate=(src,input)=>src.manage({mode:'mutate',operation:'mutate',confirmed:true,input});
let clock=Date.UTC(2026,9,27,8),active=true,used=1000,write=true,lifecycle=true,scope='storage';
const states=new Map([['group:123',{activeTopics:[{text:'周末去杭州',lastMentionAt:clock}],memberImpressions:{'小明':{traits:['喜欢乌龙茶'],lastSeenAt:clock}}}],['private:123',{memberImpressions:{'用户':{traits:['私聊的独立偏好'],lastSeenAt:clock}}}]]);
const ids={'group:123':'group-session','private:123':'private-session'},history=createConversationMemory(path.join(root,'history.sqlite'));
history.append('group:123',{messageId:'old',time:clock-3600000,text:'乌龙茶适合周末安排',sender:'小明'});history.append('private:123',{messageId:'secret',time:clock-3600000,text:'乌龙茶私聊秘密'});
states.get('group:123').recentMessages=[{time:clock,text:'周末喝乌龙茶怎么安排',isSelf:false}];
const existing=source('group:123');await mutate(existing,{action:'add',target:'user',content:'operator manual note',importance:'normal'});const manual=(await snapshot(existing)).entries[0];
const adapter=createMnemonMemoryAdapter({root,modulePath});let runtimeReads=0;
const getRuntime=async()=>{runtimeReads++;return {bundles:[{name:'dsh-mnemon',enabled:active},{name:'dsh-context',enabled:true}],mnemon:{storageScope:'workspace',runtimeUserScope:scope,writeEnabled:write,lifecycleEnabled:lifecycle},sessions:Object.values(ids).map(sessionId=>({sessionId,projections:{values:{contextTimeline:{current:{total:used},contextWindow:10000,maxOutputTokens:1000}}}}))};};
const hub=createMemoryContext({root,getHistory:()=>history,getStates:()=>states,getSessionIds:()=>ids,getRuntime,adapter,now:()=>clock});
try{
 const first=await hub.synchronize();assert.equal(first.notes,3);assert.equal(first.runtime.user,3);assert.equal(first.runtime.project,1);assert.equal(first.extraModelCalls,0);assert.equal(first.history.messages,2);
 assert.deepEqual((await snapshot(existing)).entries.find(e=>e.content==='operator manual note'),manual);
 const group=await snapshot(existing),privateStore=await snapshot(source('private:123'));
 assert(!JSON.stringify(group).includes('私聊的独立偏好'));assert(!JSON.stringify(privateStore).includes('喜欢乌龙茶'));
 const file=path.join(qqMemoryWorkspace(root,'group:123'),'.mnemon/runtime/memories.json'),raw=fs.readFileSync(file);
 await hub.synchronize();assert(fs.readFileSync(file).equals(raw),'repeat sync rewrote unchanged facts');
 hub.invalidate();await hub.prepare('group:123',states.get('group:123'));assert(fs.readFileSync(file).equals(raw),'provider refresh rewrote canonical entries');
 assert.equal(hub.promptFacts('group:123',states.get('group:123')),'','Mnemon-projected facts duplicated in QQ prompt');
 states.get('group:123').memberImpressions['小明'].traits=['改为喜欢红茶'];
 assert(hub.promptFacts('group:123',states.get('group:123')).includes('红茶'),'new correction hidden behind old projection');
 await hub.prepare('group:123',states.get('group:123'));assert.equal(hub.promptFacts('group:123',states.get('group:123')),'');
 assert(JSON.stringify(await snapshot(existing)).includes('红茶'));assert(!JSON.stringify(await snapshot(existing)).includes('喜欢乌龙茶'));
 const recall=hub.historyHint('group:123',states.get('group:123'));assert(recall.includes('乌龙茶适合周末安排'));assert(!recall.includes('私聊秘密'));
 assert.equal(hub.historyHint('group:123',states.get('group:123'),'乌龙茶适合周末安排'),'');
 used=9900;hub.invalidate();await hub.prepare('group:123',states.get('group:123'));assert.equal(hub.historyHint('group:123',states.get('group:123')),'','high context pressure did not reduce recall');
 delete states.get('group:123').memberImpressions['小明'];await hub.queue('group:123',states.get('group:123'));assert(!(await snapshot(existing)).entries.some(e=>e.content.includes('红茶')));assert((await snapshot(existing)).entries.some(e=>e.content==='operator manual note'));
 await mutate(existing,{action:'add',target:'memory',content:'new manual project entry',importance:'normal'});const fresh=await hub.status();assert.equal(fresh.channels.find(r=>r.key==='group:123').mnemon.project,2,'external Mnemon edit not reflected');
 active=false;hub.invalidate();await hub.prepare('group:123',states.get('group:123'));assert(hub.promptFacts('group:123',states.get('group:123')).includes('杭州'));
 active=true;write=false;hub.invalidate();await hub.prepare('group:123',states.get('group:123'));assert(hub.promptFacts('group:123',states.get('group:123')).includes('杭州'));
 write=true;scope='global';hub.invalidate();const isolated=await hub.synchronize();assert.equal(isolated.providers.isolated,false);assert(hub.promptFacts('group:123',states.get('group:123')).includes('杭州'));
 scope='storage';lifecycle=false;hub.invalidate();await hub.prepare('group:123',states.get('group:123'));assert(hub.promptFacts('group:123',states.get('group:123')).includes('杭州'),'disabled Mnemon injection hid QQ facts');
 lifecycle=true;hub.invalidate();for(let i=0;i<12;i++){states.get('group:123').activeTopics=[{text:'latest-'+i,lastMentionAt:clock}];void hub.queue('group:123',states.get('group:123'));}await hub.synchronize();const final=await snapshot(existing);assert(final.entries.some(e=>e.content.includes('latest-11')));assert(!final.entries.some(e=>e.content.includes('latest-0')));
 assert(fs.readdirSync(path.join(qqMemoryWorkspace(root,'group:123'),'.mnemon/qq-bridge-backups')).length>=1);
 const ownedTopic=(await snapshot(existing)).entries.find(e=>e.content.includes('latest-11'));
 const corrected=ownedTopic.content.replace('latest-11','operator corrected topic');
 await mutate(existing,{action:'replace',target:'memory',oldText:ownedTopic.content,content:corrected});hub.invalidate();await hub.prepare('group:123',states.get('group:123'));
 assert((await snapshot(existing)).entries.some(e=>e.content===corrected));assert.equal((await hub.status()).channels.find(r=>r.key==='group:123').mnemon.conflicts,1);
 const reloaded=createMnemonMemoryAdapter({root,modulePath});const protectedResult=await reloaded.sync('group:123',memoryFacts(states.get('group:123'),{now:clock}));assert.equal(protectedResult.conflicts,1);assert((await snapshot(existing)).entries.some(e=>e.content===corrected));
 await mutate(existing,{action:'replace',target:'memory',oldText:corrected,content:ownedTopic.content});hub.invalidate();await hub.prepare('group:123',states.get('group:123'));assert.equal((await hub.status()).channels.find(r=>r.key==='group:123').mnemon.conflicts,0);
 await mutate(existing,{action:'remove',target:'memory',oldText:ownedTopic.content});hub.invalidate();await hub.prepare('group:123',states.get('group:123'));assert(!(await snapshot(existing)).entries.some(e=>e.content===ownedTopic.content),'manual deletion was recreated');
 states.get('group:123').activeTopics=[];await hub.prepare('group:123',states.get('group:123'));assert.equal((await hub.status()).channels.find(r=>r.key==='group:123').mnemon.conflicts,0);
 console.log('PASS persisted conflict ledger: edits/deletions in Mnemon survive sync and adapter restart; explicit reconciliation resolves conflicts; no duplicate source of fact text.');
 console.log('PASS official Mnemon + real SQLite: scoped migration, manual entries preserved, idempotent updates/deletions, corrected facts, no duplicate injection, private/group isolation, live Context budgets, provider disable/global-scope/read-only/lifecycle fallback, concurrent coalescing and backups.');

 const full=source('group:999',{userLimitBytes:512});await mutate(full,{action:'add',target:'user',content:'x'.repeat(480),importance:'normal'});
 const small=createMnemonMemoryAdapter({root,modulePath,getLimits:()=>({userLimitBytes:512})});const result=await small.sync('group:999',[{id:'limited',target:'user',content:'cannot fit '.repeat(12),stamp:clock}]);assert.equal(result.covered.length,0);assert.equal(result.skipped.length,1);assert.equal((await snapshot(full)).entries[0].content,'x'.repeat(480));
 const linked=path.join(qqMemoryWorkspace(root,'private:999'),'.mnemon');fs.mkdirSync(path.dirname(linked),{recursive:true});fs.symlinkSync(path.join(qqMemoryWorkspace(root,'group:123'),'.mnemon'),linked,'junction');await assert.rejects(()=>adapter.sync('private:999',[]),/链接/);fs.unlinkSync(linked);
 console.log('PASS capacity and link boundaries: no manual-note eviction, no cross-channel symlink writes.');
}finally{await hub.close();history.close();assert(lab.startsWith(path.join(os.tmpdir(),'memory-unified-')));fs.rmSync(lab,{recursive:true,force:true});}

const h=await bridgeHarness({files:{'public/memory-context.html':fs.readFileSync(new URL('../public/memory-context.html',import.meta.url),'utf8'),'state/social-v2.json':{conversations:{'private:123':{activeTopics:[{text:'existing topic',lastMentionAt:Date.now()}]}}}}});const server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,headers={'X-Console-Token':'fixture-console-token','content-type':'application/json'};
try{
 assert.equal((await fetch(base+'/api/memory-context/status')).status,401);
 assert.equal((await fetch(base+'/api/memory-context/status',{headers:{...headers,'x-agent-call':'1'}})).status,403);
 assert.equal((await fetch(base+'/api/memory-context/sync',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:'{}'})).status,403);
 const response=await fetch(base+'/api/memory-context/status',{headers});assert.equal(response.status,200);const state=await response.json();assert.equal(state.notes,1);assert.equal(state.providers.available,false);
 assert.equal((await fetch(base+'/api/memory-context/sync',{method:'POST',headers,body:'{}'})).status,200);
 const page=await(await fetch(base+'/memory-context/?token=fixture-console-token')).text();assert(page.includes('记忆与上下文'));
 assert.equal(h.calls.sent.length,0);assert.equal(h.calls.prompts.length,0);
 console.log('PASS live bridge fixture: unified page/API, auth/origin/agent guards, missing-dependency fallback, no live QQ or model calls.');
}finally{await new Promise(r=>server.close(r));await h.close();}
