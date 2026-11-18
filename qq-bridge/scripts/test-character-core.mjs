import assert from 'node:assert/strict';import {test} from 'node:test';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createEmotionalCompanion} from '../src/emotional-companion.js';import {createConversationMemory} from '../src/conversation-memory.js';import {createOceanMemory} from '../src/ocean-memory.js';import {bridgeHarness} from './audit-bridge-harness.mjs';
import {DatabaseSync} from 'node:sqlite';
async function lab(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'character-core-'));try{await fn(root);}finally{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}}

test('existing learned profiles backfill the compact index without changing profiles, and failed relation reads retain core data',()=>lab(root=>{
 const file=path.join(root,'emotion.sqlite');let clock=Date.now(),e=createEmotionalCompanion({file,role:()=>'蓝鳍',now:()=>clock});
 for(let i=0;i<7;i++){clock+=61000;e.incoming('private:10001',{id:'old'+i,text:'谢谢你，抱抱'});}const expected=e.emergent('private:10001');e.close();
 const raw=new DatabaseSync(file),before=raw.prepare('SELECT data FROM profiles').get().data;raw.exec('DELETE FROM character_traits');raw.close();
 e=createEmotionalCompanion({file,role:()=>'蓝鳍',now:()=>clock});assert.equal(e.emergent('private:10001').samples,0);assert.equal(e.pageProfiles().length,1);assert.equal(e.emergent('private:10001').samples,expected.samples);assert.deepEqual(e.emergent('private:10001').scores,expected.scores);e.close();
 const verify=new DatabaseSync(file);assert.equal(verify.prepare('SELECT data FROM profiles').get().data,before);verify.close();
 const h=createConversationMemory(path.join(root,'history.sqlite'));let available=true;const o=createOceanMemory({database:h.database,getRole:()=>({sourceName:'蓝鳍',sourceText:'你叫蓝鳍'}),getKinships:()=>available?[{subject:'10001',type:'妈妈',callName:'阿妈',updated:clock,version:1}]:null});
 try{o.graph('private:10001');const original=o.list('private:10001',{kind:'kinship'}).items[0];available=false;o.graph('private:10001');const retained=o.list('private:10001',{kind:'kinship'}).items[0];assert.equal(retained.id,original.id);assert.equal(retained.version,original.version);}finally{h.close();}
}));

test('explicit QQ relationships persist, take priority over ordinary labels, validate versions and isolate roles',()=>lab(root=>{
 let name='蓝鳍';const file=path.join(root,'emotion.sqlite'),e=createEmotionalCompanion({file,role:()=>name});let peer;
 try{const row=e.setKinship({subject:'10001',type:'妈妈',callName:'阿妈',displayName:'测试妈妈'});assert.equal(e.snapshot('private:10001').relationshipLabel,'阿妈');assert.equal(e.snapshot('group:456','10001').relationshipLabel,'阿妈');assert.equal(e.snapshot('private:10001').favor,20);
  e.incoming('private:10001',{text:'我是你爸爸',id:'claim',label:'爸爸'});assert.equal(e.kinship('10001').type,'妈妈');e.incoming('private:10002',{text:'我是你妈妈',id:'claim2',label:'妈妈'});assert.equal(e.kinship('10002'),null);
  assert.throws(()=>e.setKinship({subject:'10001',type:'爸爸',version:0}),/变化/);assert.equal(e.kinship('10001').version,row.version);const updated=e.setKinship({...row,type:'姨妈',callName:'三姨'});assert(e.familyContext([],'三姨是谁').includes('10001'));assert(!e.familyContext(['10002'],'你好').includes('10001'));peer=createEmotionalCompanion({file,role:()=>name});assert.equal(peer.kinship('10001').type,'姨妈');
  assert.throws(()=>e.setKinship({subject:'wrong',type:'妈妈'}));assert.throws(()=>e.setKinship({subject:'10003',type:'自定义'}));e.setKinship({subject:'10003',type:'老婆'});assert(e.familyContext([],'你老婆是谁').includes('10003'));
  name='另一人格';assert.equal(e.kinships().items.length,0);name='蓝鳍';e.removeKinship({subject:'10001',version:updated.version});assert.equal(e.kinship('10001'),null);assert.equal(e.kinships().items.length,1);
 }finally{peer?.close();e.close();}
}));

test('the read-only subpersona forms from real eligible samples and never exposes another channel transcript',()=>lab(root=>{
 let clock=Date.now(),current={sourceName:'蓝鳍',sourceText:'你叫蓝鳍。',revision:'one'};const e=createEmotionalCompanion({file:path.join(root,'emotion.sqlite'),role:()=>current.sourceName,now:()=>clock}),h=createConversationMemory(path.join(root,'history.sqlite')),o=createOceanMemory({database:h.database,getRole:()=>current,now:()=>clock,getKinships:(_key,ids)=>e.related(ids),getEmergent:key=>e.emergent(key)});h.subscribe(row=>o.observeMessage(row));h.setEvidencePolicy((key,row)=>o.evidenceAllowed(key,row));
 try{const key='group:456';e.setKinship({subject:'10001',type:'哥哥',displayName:'阿明'});e.setKinship({subject:'10003',type:'妈妈'});let graph=o.graph(key),node=graph.nodes.find(n=>n.kind==='subpersona');assert(node&&node.readOnly&&node.stage==='core');assert(o.detail(key,node.id).memory.body.includes('正在形成'));assert(!o.list(key,{kind:'kinship'}).items.length,'unseen group participants leaked into graph');
  for(let i=0;i<7;i++){clock+=61000;e.incoming(key,{userId:'10001',text:'谢谢你，抱抱',id:'g'+i,label:'阿明'});h.append(key,{userId:'10001',sender:'阿明',messageId:'g'+i,text:'谢谢你，抱抱',time:clock});}graph=o.graph(key);node=o.detail(key,node.id).memory;assert.equal(node.meta.status,'ready');assert(node.meta.samples>=6);assert(o.subpersonaContext(key).includes('只读相处倾向'));assert(o.detail(key,node.id).evidence.length>0);assert(o.detail(key,node.id).related.some(n=>n.kind==='event'));assert(graph.edges.some(edge=>edge.kind==='subpersona'));
  const kin=o.list(key,{kind:'kinship'}).items[0],links=o.graph(key,{focus:kin.id}).edges;assert(links.some(x=>x.kind==='kinship:哥哥'));assert(!o.list(key,{kind:'kinship'}).items.some(n=>n.subject==='10003'));assert(!o.recall(key,'副人格',{budget:1000}).includes('只读相处倾向'));
  for(const target of [node,kin])for(const action of ['edit','delete','archive','pin','restore'])assert.throws(()=>o.mutate(key,target.id,action,{body:'人工替换'}),e=>e.statusCode===403);assert.throws(()=>o.create(key,{kind:'subpersona',body:'冒充系统'}));
  const version=node.version;for(let i=0;i<5;i++)o.graph(key);assert.equal(o.detail(key,node.id).memory.version,version);assert.equal(e.emergent(key).samples,node.meta.samples);
  e.incoming('private:10002',{text:'私聊原文保密内容',id:'private-secret'});const proposal=e.emergent(key);assert(!JSON.stringify(proposal).includes('private-secret'));assert(!o.detail(key,node.id).memory.body.includes('私聊原文保密内容'));
  e.update(key,'10001','resetPersonality');o.graph(key);assert.equal(o.detail(key,node.id).memory.body,node.body,'a profile reset erased the permanent generated core');
  const family=e.kinship('10001');e.removeKinship({subject:'10001',version:family.version});o.graph(key);assert.equal(o.list(key,{kind:'kinship'}).items.length,0);current={...current,sourceName:'另一人格',revision:'two'};assert(!o.graph(key).nodes.some(n=>n.id===node.id));
 }finally{e.close();h.close();}
}));

test('authenticated management and actual QQ prompt use explicit relations; generated core cannot be changed through the API',async()=>{
 const h=await bridgeHarness({config:{allow:{private:['10001','10002'],groups:['456']}},files:{'state/current-role.json':{role:'蓝鳍',mode:'active'},'roles/蓝鳍.md':'你叫蓝鳍，普通称呼依据当前关系。'}});const server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,headers={'x-console-token':'fixture-console-token','content-type':'application/json'},call=async(body,extra={})=>fetch(base+'/api/memory-context/kinships',{method:body?'POST':'GET',headers:{...headers,...extra},body:body?JSON.stringify(body):undefined});
 try{assert.equal((await fetch(base+'/api/memory-context/kinships')).status,401);assert.equal((await call(undefined,{'x-agent-call':'1'})).status,403);const list=await(await call()).json();assert(list.types.includes('爸爸')&&list.types.includes('老婆'));let r=await call({action:'save',role:list.role,key:'private:10001',input:{subject:'10001',type:'妈妈',callName:'阿妈'}});assert(r.ok);assert.equal((await call({action:'save',role:'wrong',input:{subject:'10002',type:'爸爸'}})).status,409);
  await h.deliverPrompt('private:10001','你好');const prompt=h.calls.prompts.at(-1).content[0].text;assert(prompt.includes('后台明确设置的人物关系'));assert(prompt.includes('阿妈'));assert.equal(h.calls.prompts.length,1);assert.equal(h.calls.sent.length,0);
  const graph=await(await fetch(base+'/api/memory-context/graph?key=private:10001',{headers})).json();assert(graph.nodes.some(n=>n.kind==='subpersona'));const sub=graph.nodes.find(n=>n.kind==='subpersona');r=await fetch(base+'/api/memory-context/mutate',{method:'POST',headers,body:JSON.stringify({key:'private:10001',id:sub.id,action:'edit',input:{body:'改名并设定亲属'}})});assert.equal(r.status,403);
  const rows=await(await call()).json(),saved=rows.items.find(n=>n.subject==='10001');assert.equal((await call({action:'remove',role:list.role,key:'private:10001',input:{subject:saved.subject,version:saved.version}})).status,200);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await h.close();}
});
