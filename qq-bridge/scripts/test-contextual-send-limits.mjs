import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {bridgeHarness} from './audit-bridge-harness.mjs';
import {createRobotOptionsService} from '../src/robot-options-service.js';
const h=await bridgeHarness({config:{socialV2:{send:{maxSendPerMinute:8,maxSendPerHour:80,burstMaxMessages:3,maxMessageChars:100,burstIntervalMinMs:1234},voice:{enabled:true,maxPerMinute:2,maxPerHour:10,defaultVolume:0.8}},unrelated:'must-preserve'},globals:{createRobotOptionsService:options=>createRobotOptionsService({...options,callPond:async()=>({status:200,data:{policy:{enabled:true}}})})}});
const server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port,headers={'x-console-token':'fixture-console-token','content-type':'application/json'};
const call=async(route,body,extra={})=>{const r=await fetch(base+route,{headers:{...headers,...extra},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
try{
 assert.equal((await fetch(base+'/api/robot-options/status')).status,401);
 let state=(await call('/api/robot-options/status')).body;
 assert.equal(state.sendLimits.send.maxSendPerMinute,8);
 const payload=structuredClone(state.sendLimits);payload.send.maxSendPerMinute=1;payload.send.maxMessageChars=5;payload.voice.maxPerMinute=1;
 assert.equal((await call('/api/robot-options/send-limits',payload,{origin:'https://evil.invalid'})).status,403);
 assert.equal((await call('/api/robot-options/send-limits',payload,{'x-agent-call':'1'})).status,403);
 for(const value of [-1,1.5,'2',null]){const bad=structuredClone(payload);bad.voice.maxPerMinute=value;assert.equal((await call('/api/robot-options/send-limits',bad)).status,400);}
 const saved=await call('/api/robot-options/send-limits',payload);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(h.cfg.socialV2.voice.maxPerMinute,1);
 const disk=JSON.parse(fs.readFileSync(path.join(h.temp,'config.json'),'utf8'));assert.equal(disk.unrelated,'must-preserve');assert.equal(disk.socialV2.voice.defaultVolume,0.8);assert.equal(disk.socialV2.voice.enabled,true);assert.equal(disk.socialV2.send.burstIntervalMinMs,1234);
 assert.equal((await call('/api/robot-options/send-limits',payload)).status,409);
 h.setMode('reserved2');const st=h.getSocialV2State('private:123'),agent={'x-agent-call':'1','x-agent-token':st.agentToken};
 const long=await call('/api/socialV2/send-message',{key:'private:123',messages:['this is too long']},agent);assert.equal(long.status,400);assert.match(long.body.error,/5/);
 st.sendTimes=[Date.now()];const rate=await call('/api/socialV2/send-message',{key:'private:123',messages:['hi']},agent);assert.equal(rate.status,429);assert.equal(st.sendTimes.length,1);
 const latest=structuredClone(saved.body.sendLimits);latest.send.maxSendPerMinute=0;latest.send.maxMessageChars=0;assert.equal((await call('/api/robot-options/send-limits',latest)).status,200);assert.equal(h.cfg.socialV2.send.maxMessageChars,0);
 const changedDisk=JSON.parse(fs.readFileSync(path.join(h.temp,'config.json'),'utf8'));changedDisk.socialV2.voice.maxPerHour=9;fs.writeFileSync(path.join(h.temp,'config.json'),JSON.stringify(changedDisk));assert.equal((await call('/api/robot-options/send-limits',latest)).status,409);const current=(await call('/api/robot-options/status')).body.sendLimits;assert.equal(current.voice.maxPerHour,9);assert.equal((await call('/api/robot-options/send-limits',current)).status,200);
 console.log('PASS: protected limits API, validation, revisions, preserve unrelated config and counts, immediate text size/rate enforcement, zero unlimited. No live QQ or paid calls.');
}finally{await new Promise(r=>server.close(r));await h.close();}
