import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {bridgeHarness} from './audit-bridge-harness.mjs';
import {readOfficialSettings} from '../src/official-qq-settings.js';
const token='fixture-console-token';
const h=await bridgeHarness({files:{'public/console.html':fs.readFileSync(new URL('../public/console.html',import.meta.url),'utf8')},globals:{probeOfficialCredentials:async()=>({ok:true,message:'fixture read-only probe'})}});
const server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
const request=async(route,body,headers={})=>{const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'X-Console-Token':token,...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
let officialHarness,officialServer;
try{
  assert.equal((await fetch(base+'/api/qq-official')).status,401);
  const original=fs.readFileSync(path.join(h.temp,'config.json'));
  const before=await request('/api/qq-official');assert.equal(before.body.enabled,false);assert.equal(before.body.active,false);
  const denied=await request('/api/qq-official/config',{enabled:true,appId:'123456789',appSecret:'fixture-only-secret'},{'x-agent-call':'1'});assert.equal(denied.status,403);assert.equal(readOfficialSettings(h.temp).enabled,false);
  const saved=await request('/api/qq-official/config',{enabled:true,appId:'123456789',appSecret:'fixture-only-secret',localPort:17871,allowProactive:false});assert.equal(saved.body.ok,true,JSON.stringify(saved));
  assert.deepEqual(fs.readFileSync(path.join(h.temp,'config.json')),original,'official credentials must not overwrite OneBot/model/private settings');
  const snapshot=await request('/api/qq-official');assert.equal(snapshot.body.enabled,true);assert.equal(snapshot.body.active,false);assert.equal(snapshot.body.hasSecret,true);assert(!JSON.stringify(snapshot).includes('fixture-only-secret'));assert(!JSON.stringify(snapshot).includes(readOfficialSettings(h.temp).localToken));
  assert.equal((await request('/api/qq-official/probe',{})).body.ok,true);
  assert.equal((await request('/api/qq-official/restart',{}, {'x-agent-call':'1'})).status,403);
  // New runtime gets a distinct official ACL and must not inherit a human QQ owner.
  officialHarness=await bridgeHarness({files:{'state/qq-official/config.json':readOfficialSettings(h.temp)}});
  officialServer=officialHarness.startConsoleServer();if(!officialServer.listening)await new Promise(r=>officialServer.once('listening',r));const officialBase='http://127.0.0.1:'+officialServer.address().port;
  const officialRequest=async(route,body)=>{const res=await fetch(officialBase+route,{method:body===undefined?'GET':'POST',headers:{'X-Console-Token':token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,body:await res.json()};};
  const aclBefore=await officialRequest('/api/whitelist');assert.equal(aclBefore.body.transport,'official');assert.equal(aclBefore.body.ownerQQ,null);assert.equal(aclBefore.body.allow.private.length,0);
  officialHarness.bot.me={id:'bot-native'};officialHarness.bot.selfId=99999999;
  officialHarness.bot.receive({op:0,t:'C2C_MESSAGE_CREATE',d:{id:'inbox-1',author:{user_openid:'official-user'},timestamp:new Date().toISOString(),content:'test'}});
  const contacts=(await officialRequest('/api/qq-official')).body.contacts;assert.equal(contacts.length,1);const id=Number(contacts[0].id);
  const deniedQQ=await officialRequest('/api/whitelist',{allow:{private:[12345],groups:[]},ownerQQ:12345});assert.equal(deniedQQ.status,400);
  const originalOfficialConfig=fs.readFileSync(path.join(officialHarness.temp,'config.json'));
  const allowed=await officialRequest('/api/whitelist',{allow:{private:[id],groups:[]},deny:{private:[],groups:[]},ownerQQ:id});assert.equal(allowed.body.ok,true,JSON.stringify(allowed));assert.equal(readOfficialSettings(officialHarness.temp).access.ownerQQ,id);assert.deepEqual(fs.readFileSync(path.join(officialHarness.temp,'config.json')),originalOfficialConfig);
  await officialHarness.refreshMode({namespaces:[{ns:'qq-mode',entries:[{key:'mode',value:'reserved2'},{key:'ownerQQ',value:'12345'}]}]});assert.equal(officialHarness.cfg.ownerQQ,id,'DSH personal QQ settings cannot overwrite the official owner');
  const noAgent=await fetch(officialBase+'/api/qq-official',{headers:{'X-Console-Token':token,'x-agent-token':'invalid'}});assert.equal(noAgent.status,403);
  const html=await fetch(base+'/?token='+token).then(r=>r.text());assert(html.includes('officialQQEnabled'));assert(html.includes('官方QQ机器人'));assert.equal(h.calls.sent.length,0);assert.equal(officialHarness.calls.sent.length,0);
  console.log('PASS official console: auth and agent isolation, masked secret persistence, pending-vs-active UI state, separate OpenID ACL/owner, legacy settings protection, rendered settings controls; zero live QQ sends');
}finally{officialHarness?.bot.close();if(officialServer)await new Promise(r=>officialServer.close(r));await new Promise(r=>server.close(r));await officialHarness?.close();await h.close();}
