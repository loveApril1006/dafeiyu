import assert from 'node:assert/strict';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const h=await bridgeHarness(),server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port,headers={'X-Console-Token':'fixture-console-token','content-type':'application/json'};
async function call(route,body,extra={}){return fetch(base+route,{headers:{...headers,...extra},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});}
try{
 let r=await call('/api/wechat/status');assert.equal(r.status,200);const state=await r.json();assert.equal(state.config.enabled,false);assert.equal(state.connection.workerRunning,false);assert.equal(state.connection.driver,'desktop');assert.equal(JSON.stringify(state).includes('bot_token'),false);
 r=await call('/api/wechat/config',{revision:0,enabled:true},{origin:'https://evil.example'});assert.equal(r.status,403);
 r=await call('/api/wechat/status',undefined,{'x-agent-call':'1'});assert.equal(r.status,403);
 r=await fetch(base+'/api/wechat/status');assert.equal(r.status,401);
 r=await call('/api/wechat/transport',{revision:0,transport:{mode:'dbocr',pollSeconds:15,maxCacheMB:128}});assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.config.enabled,false);assert.equal(saved.connection.transport.pollSeconds,15);
 r=await call('/api/wechat/targets',{revision:saved.config.revision,targets:[{name:'测试好友',kind:'private'},{name:'测试群',kind:'group',nickname:'小鸽子'}]});assert.equal(r.status,200);const targets=await r.json();assert.equal(targets.connection.targets.length,2);assert.equal(targets.config.allowGroups.length,1);
 r=await call('/api/wechat/config',{revision:targets.config.revision,enabled:true});assert.equal(r.status,400);assert.equal(h.calls.prompts.length,0);assert.equal(h.calls.sent.length,0);
 r=await call('/api/wechat/config',{revision:0,dailyLimit:100});assert.equal(r.status,409);
 r=await call('/api/wechat/send',{peer:'anything',text:'test'});assert.equal(r.status,400);assert.equal(h.calls.sent.length,0);
 r=await call('/api/wechat/send',{peer:'anything',type:'image',base64:'eA=='});assert.equal(r.status,400);assert.match((await r.json()).error,/只开放文字/);assert.equal(h.calls.sent.length,0);
 console.log('PASS real bridge WeChat routes: console authentication, Host/Origin/agent boundaries, target save, revision guard and incompatible-driver refusal; zero live messages/models');
}finally{await new Promise(r=>server.close(r));await h.close();}
