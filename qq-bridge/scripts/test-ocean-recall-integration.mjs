import assert from 'node:assert/strict';
import {test} from 'node:test';
import {bridgeHarness} from './audit-bridge-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createConversationMemory} from '../src/conversation-memory.js';
import {createMemoryContext} from '../src/memory-context.js';

test('actual authenticated recall, continuity and versioned memo APIs stay scoped and affect only the QQ prompt',async()=>{
 const h=await bridgeHarness({files:{'roles/测试鱼.md':'你叫青柚，身份以当前卡片为准。','state/current-role.json':{role:'测试鱼',mode:'active'}},config:{ownerQQ:123,allow:{private:['123','999'],groups:['456']}}});
 const server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port,headers={'x-console-token':'fixture-console-token','content-type':'application/json'};
 const api=async(route,body,extra={})=>fetch(base+route,{method:body?'POST':'GET',headers:{...headers,...extra},body:body?JSON.stringify(body):undefined});
 try{
  const hub=h.memoryHub(),key='private:123';hub.ocean.upsert(key,{kind:'fact',sourceKey:'sleepless',title:'失眠那晚',body:'阿明那晚失眠，后来取消了出门。'});
  const route='/api/memory-context/recall?key='+key+'&query='+encodeURIComponent('睡不着');
  assert.equal((await fetch(base+route)).status,401);assert.equal((await api(route,null,{'x-agent-call':'1'})).status,403);
  const trace=await(await api(route)).json();assert(trace.preview);assert(trace.hits.some(r=>r.title==='失眠那晚'));assert.equal(h.calls.prompts.length,0);
  const initial=await(await api('/api/memory-context/continuity?key='+key)).json();
  let response=await api('/api/memory-context/memos',{key,role:initial.state.role,revision:initial.state.revision,action:'create',input:{kind:'commitment',title:'核对行程',body:'私聊专属约定，明天核对行程'}});assert.equal(response.status,200);let memo=(await response.json()).memo;
  assert.equal((await api('/api/memory-context/memos',{key,role:'旧人格',action:'create',input:{kind:'note',body:'不应保存'}})).status,409);
  assert.equal((await api('/api/memory-context/memos',{key,action:'update',id:memo.id,input:{version:99,state:'completed'}})).status,409);
  assert.equal((await api('/api/memory-context/memos',{key,action:'update',id:memo.id,input:{version:1,state:'completed'}},{origin:'https://evil.invalid'})).status,403);
  assert.equal((await(await api('/api/memory-context/continuity?key=group:456')).json()).memos.items.length,0);
  await h.deliverPrompt(key,'还记得那晚睡不着吗');const prompt=h.calls.prompts.at(-1).content[0].text;assert(prompt.includes('失眠'));assert(prompt.includes('私聊专属约定'));assert(prompt.includes('当前会话连续状态'));
  await h.deliverPrompt('private:999','还记得失眠吗');assert(!h.calls.prompts.at(-1).content[0].text.includes('私聊专属约定'));
  const actual=await(await api('/api/memory-context/recall?key='+key)).json();assert(!actual.preview);assert(actual.hits.some(r=>r.title==='失眠那晚'));
  response=await api('/api/memory-context/memos',{key,action:'update',id:memo.id,input:{version:memo.version,state:'completed'}});assert.equal(response.status,200);
  const completed=await(await api('/api/memory-context/continuity?key='+key)).json();assert(!completed.state.pending.some(r=>r.id===memo.id));
  const note=hub.continuity.saveMemo(key,{kind:'note',body:'我猜今天有点紧张。'});const diary=hub.continuity.updateMemo(key,note.id,{kind:'diary',version:note.version});assert.equal(hub.ocean.detail(key,diary.nodeId).memory.kind,'reflection');assert.equal(hub.ocean.detail(key,diary.nodeId).memory.confidence,'inferred');hub.ocean.mutate(key,diary.nodeId,'edit',{body:'主观感受',confidence:'confirmed'});assert.equal(hub.ocean.detail(key,diary.nodeId).memory.confidence,'inferred');
  assert.equal(h.calls.sent.length,0);assert.equal(h.calls.prompts.length,2);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await h.close();}
});

test('high context pressure prepares an evidence-backed handover once without model calls or premature session retirement',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ocean-checkpoint-'));const history=createConversationMemory(path.join(root,'history.sqlite'));
 const role={sourceName:'鱼',sourceText:'你叫青柚',selfName:'青柚',revision:'one'},key='private:123';
 let calls=0;history.append(key,{messageId:'first',userId:'123',sender:'朋友',text:'还没核对周六行程',time:Date.now()});
 const hub=createMemoryContext({root,getHistory:()=>history,getStates:()=>new Map(),getSessionIds:()=>({[key]:'session-one'}),adapter:{available:()=>false},oceanOptions:{getRole:()=>role,model:async()=>{calls++;return '{}';}},getRuntime:async()=>({bundles:[{name:'dsh-context',enabled:true}],sessions:[{sessionId:'session-one',projections:{values:{contextTimeline:{current:{total:8000},contextWindow:10000,maxOutputTokens:1000}}}}]})});
 try{await hub.prepare(key);const checkpoint=hub.continuityCheckpoint(key);assert(checkpoint);assert(checkpoint.body.includes('周六行程'));assert.equal(calls,0);await hub.prepare(key);assert.equal(hub.continuityCheckpoint(key).version,checkpoint.version);
  const memo=hub.continuity.saveMemo(key,{kind:'commitment',body:'不能撤回后复活的约定'});await hub.prepare(key);assert(hub.continuityCheckpoint(key).body.includes('不能撤回后复活'));
  // Legacy tools can withdraw a main record without going through a new UI route.
  hub.ocean.mutate(key,memo.nodeId,'delete');assert(!hub.continuityCheckpoint(key).body.includes('不能撤回后复活'));
  hub.invalidate();assert.equal(hub.continuityCheckpoint(key),null);}
 finally{await hub.close();history.close();assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
});
