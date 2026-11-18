import assert from 'node:assert/strict';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const h=await bridgeHarness(),server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port,admin={'X-Console-Token':'fixture-console-token','content-type':'application/json'};
async function call(route,{body,headers={}}={}){return fetch(base+route,{headers:{...admin,...headers},...(body?{method:'POST',body:JSON.stringify(body)}:{})});}
try{
 let response=await call('/api/creative/status');assert.equal(response.status,200);const state=await response.json();assert.equal(state.config.music,undefined);assert.equal(state.config.images.apiKey,undefined);
 response=await call('/api/creative/songs');assert.equal(response.status,404);
 for(const route of ['/music/','/dsh-music/manifest','/api/creative/song-audio/00000000-0000-0000-0000-000000000000'])assert.equal((await call(route)).status,404,route);
 response=await call('/api/creative/config',{body:{revision:state.config.revision,music:{enabled:true}}});assert.equal(response.status,404,'旧设置不能重新启用已删除的功能');
 response=await call('/api/creative/action',{body:{feature:'music',action:'song-create',args:{topic:'test'}}});assert.equal(response.status,404);assert.equal(h.calls.prompts.length,0);
 response=await fetch(base+'/api/creative/songs');assert.equal(response.status,401);
 response=await call('/api/creative/songs',{headers:{'x-agent-call':'1','x-agent-token':'invalid'}});assert.equal(response.status,403);
 response=await call('/api/creative/config',{body:{revision:0,rpg:{enabled:true}},headers:{origin:'https://evil.example'}});assert.equal(response.status,403);
 response=await call('/api/creative/config',{body:{revision:0,rpg:{enabled:true}},headers:{'x-agent-call':'1','x-agent-token':'invalid'}});assert.equal(response.status,403);
 response=await call('/api/creative/config',{body:{revision:0,rpg:{enabled:true}}});assert.equal(response.status,200);
 response=await call('/api/creative/action',{body:{feature:'rpg',action:'roll',args:{expression:'d20'},scope:'group:123456'}});assert.equal(response.status,200);assert((await response.json()).result.total>=1);assert.equal(h.calls.prompts.length,0);
 response=await call('/api/creative/action',{body:{feature:'images',action:'generate',args:{prompt:'test'}}});assert.equal(response.status,409);assert.equal(h.calls.prompts.length,0);
 response=await call('/creative-media/'+'a'.repeat(48)+'/audio');assert.equal(response.status,403);
 response=await call('/api/creative/config',{body:{revision:0,rpg:{enabled:false}}});assert.equal(response.status,409);
 console.log('PASS real bridge creative routes: authentication, origin and agent guards, revision conflicts, scoped no-model dice and disabled generation');
}finally{await new Promise(r=>server.close(r));await h.close();}
