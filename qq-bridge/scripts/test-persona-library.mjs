import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {bridgeHarness} from './audit-bridge-harness.mjs';import {readRoleCatalog} from '../src/role-catalog.js';
const root=path.resolve('.'),catalog=readRoleCatalog(root),adapted=Object.entries(catalog.roles).filter(([,v])=>v.adapted);
assert.equal(adapted.length,25);
for(const [name,row] of adapted){
  const text=fs.readFileSync(path.join(root,'roles',name+'.md'),'utf8');
  assert(text.length<32000);
  assert(Buffer.byteLength(text)<=64*1024);
  assert(text.length>=row.originalPromptChars,'complete source details must not collapse into a short summary: '+name);
  assert.equal(text.length,row.contentChars);
  assert(row.description.length>=60);
}
const h=await bridgeHarness({files:{'roles/甲.md':'你是青柚，安静温柔。','roles/乙.md':'你是星澜，机灵有趣。','state/current-role.json':{role:'甲',mode:'active'},'state/role-identities.json':{甲:{selfName:'青柚'},乙:{selfName:'星澜'}}}}),server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
async function api(route,body){const r=await fetch(url+route,{headers:{'X-Console-Token':'fixture-console-token','content-type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,v:await r.json()};}
try{
 await api('/api/role',{role:'乙'});assert.equal(h.currentRoleRuntime().sourceName,'乙');assert.equal(h.currentRoleRuntime().selfName,'星澜');assert(h.currentRoleRuntime().hint.includes('机灵有趣'));
 let r=await api('/api/roles/update',{name:'乙',content:'你是星澜，保持清晰和机灵。',selfName:'星澜',category:'性格调配流',description:'独立测试卡',tags:['温柔','私聊']});assert.equal(r.status,200);
 r=await api('/api/roles');assert.equal(r.v.summaries.find(x=>x.name==='乙').category,'性格调配流');
 r=await api('/api/roles/update',{name:'乙',content:'不应写入',tags:['x'.repeat(21)]});assert.equal(r.status,400);assert(!fs.readFileSync(path.join(h.temp,'roles/乙.md'),'utf8').includes('不应写入'));
 await api('/api/roles/rename',{from:'乙',to:'丙'});r=await api('/api/roles/content?name='+encodeURIComponent('丙'));assert.equal(r.v.metadata.description,'独立测试卡');assert.equal(h.currentRoleRuntime().sourceName,'丙');assert.equal(h.currentRoleRuntime().selfName,'星澜');
 console.log('PASS 25 adapted cards, source hashes, bounded injection, metadata validation before write, non-first role activation, runtime identity and metadata-preserving rename.');
}finally{await new Promise(r=>server.close(r));await h.close();}
