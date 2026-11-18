// Real console guards + real live adapter, with all Bilibili/model operations replaced locally.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import os from 'node:os';import assert from 'node:assert/strict';
import {bridgeHarness} from './audit-bridge-harness.mjs';
import {createBilibiliLive} from '../src/bilibili-live-service.js';
const files={};for(const n of ['bilibili-live.html','bilibili-live-overlay.html'])files['public/'+n]=fs.readFileSync(new URL('../public/'+n,import.meta.url),'utf8');
files['companion/bili-native-data/history.jsonl']=JSON.stringify({bvid:'BV1234567890',title:'本地测试视频',note:'真实看过的测试笔记'})+'\n';
let service,writes=0,now=Date.now();const h=await bridgeHarness({files,globals:{createBilibiliLive:options=>service=createBilibiliLive({...options,dependencies:{skipAcl:true,core:{autoTick:false,clock:()=>now},api:{login:()=>({}),room:async()=>({roomId:123,live:true,selfUid:'999'}),send:async()=>{writes++;return {confirmed:true};}},connect:async({onState})=>{onState('connected');return {close(){}};}}})}});
const server=h.startConsoleServer();await new Promise(r=>server.listening?r():server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,headers={'x-console-token':'fixture-console-token','content-type':'application/json'};
const api=async(action,body)=>{const r=await fetch(base+'/api/bili-live/'+action,{headers,method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};};
try{
 assert.equal((await fetch(base+'/api/bili-live/status')).status,401);
 assert.equal((await api('status')).status,200);
 assert.equal((await fetch(base+'/api/bili-live/status',{headers:{...headers,'x-agent-call':'1','x-agent-token':'anything'}})).status,403);
 assert.equal((await fetch(base+'/api/bili-live/config',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/bili-live/config',{method:'POST',headers:{'x-console-token':'fixture-console-token','content-type':'text/plain'},body:'{}'})).status,415);
 assert.equal((await api('start',{confirmBroadcast:true})).status,400,'missing room cannot start');
 await api('config',{roomId:'123',sendDanmaku:true,useReading:true});assert.equal((await api('reading')).data.notes[0].title,'本地测试视频');
 assert.equal((await fetch(base+'/bilibili-live/',{headers})).status,200);
 const address=(await api('overlay',{})).data.url;assert(!address.includes('fixture-console-token'));const viewToken=new URL(address,base).searchParams.get('view');
 assert.equal((await fetch(base+'/api/bili-live/status',{headers:{'x-console-token':viewToken}})).status,401);
 assert.equal((await fetch(base+'/bili-live-view/?view=wrong')).status,403);
 assert.equal((await fetch(base+address)).status,200);
 const badHost=await new Promise((resolve,reject)=>{http.get(base+address,{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(badHost,403);
 assert.equal((await fetch(base+address,{headers:{'x-agent-call':'1'}})).status,403);
 await api('start',{demo:true});await api('simulate',{kind:'question'});await service.core.tick();let state=(await api('status')).data;assert(state.outputs[0].audioId);assert.equal(writes,0);
 const obs=base+'/bili-live-view/state?view='+viewToken+'&client=00000000-0000-4000-8000-000000000001';const one=await (await fetch(obs)).json();assert(one.active&&one.playAudio);const two=await (await fetch(obs.replace(/1$/,'2'))).json();assert(!two.playAudio,'one audio player at a time');
 const audio=base+'/bili-live-view/audio/'+state.outputs[0].audioId+'.wav?view='+viewToken;assert.equal((await fetch(audio)).status,200);
 await api('pause',{paused:true});assert.equal((await (await fetch(obs)).json()).active,false);assert.equal((await fetch(audio)).status,404);
 await api('stop',{summarize:true});assert.equal((await api('reports')).data.reports.length,1);assert((await api('reports')).data.reports[0].summary.includes('演练'));
 assert.equal((await api('simulate',{kind:'gift'})).status,400);
 assert.equal((await api('summary',{id:'../../config'})).status,400);
 assert.equal((await api('config',{sendDanmaku:true})).status,200);await api('start',{confirmBroadcast:true});service.core.ingest({kind:'gift',id:'real-fixture',timestamp:now,user:{uid:'1',uname:'测试'},gift_name:'心心',amount:2});now+=4000;
 // Use no TTS/model for this mock real-write check; it never leaves this fixture server.
 await api('config',{voice:false});await service.core.tick();assert.equal(writes,1);await api('stop',{});
 console.log('PASS real bridge token/Host/Origin/content-type/agent guards; OBS token has no management authority; private audio source lease and expired-audio denial');
 console.log('PASS actual live HTTP config/demo/events/WAV/summary/reading workflow and only explicit-start mocked platform writes; no real Bilibili or model call');
 console.log('LIVE_HTTP_FIXTURE='+base);
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));assert(fs.realpathSync(h.temp).startsWith(fs.realpathSync(os.tmpdir())+path.sep+'qq-audit-bridge-'));await h.close();}
