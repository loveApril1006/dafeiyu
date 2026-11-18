// Browser-window send capability never grants console/OBS management. All platform writes are fake.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {bridgeHarness} from './audit-bridge-harness.mjs';import {createBilibiliLive} from '../src/bilibili-live-service.js';import {liveAvatar,safeLiveText} from '../src/bilibili-live-core.js';
const files={};for(const n of ['bilibili-live-studio.html','bilibili-live-studio.css','bilibili-live-studio-ui.js'])files['public/'+n]=fs.readFileSync(new URL('../public/'+n,import.meta.url),'utf8');
let svc,now=Date.now(),writes=0,uncertain=false;
const h=await bridgeHarness({files,globals:{createBilibiliLive:o=>svc=createBilibiliLive({...o,dependencies:{skipAcl:true,controlNow:()=>now,core:{autoTick:false,clock:()=>now},studio:{autoTick:false,clock:()=>now},api:{login:()=>({}),room:async()=>({roomId:123,live:true}),send:async()=>{writes++;if(uncertain)throw Error('uncertain');}},connect:async()=>({close(){}})}})}}),server=h.startConsoleServer();await new Promise(r=>server.listening?r():server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
async function admin(action,body={}){const r=await fetch(base+'/api/bili-live/'+action,{method:'POST',headers:{'x-console-token':'fixture-console-token','content-type':'application/json'},body:JSON.stringify(body)});return {code:r.status,data:await r.json()};}
try{
 const plain=(await admin('overlay',{mode:'studio'})).data.url,live=(await admin('overlay',{mode:'studio',interactive:true})).data.url,view=new URL(live,base).searchParams.get('view'),token=new URLSearchParams(new URL(live,base).hash.slice(1)).get('control');assert(!plain.includes('#control='));assert(/^[a-f0-9]{48}$/.test(token));
 const actionURL=base+'/bili-live-view/action?view='+view;
 const post=async(body,extra={},auth=token)=>{const r=await fetch(actionURL,{method:'POST',headers:{Origin:base,'content-type':'application/json','x-studio-control':auth,...extra},body:typeof body==='string'?body:JSON.stringify({sessionId:svc.core.publicFeed().sessionId,...body})});return {code:r.status,data:await r.json()};};
 assert.equal((await post({action:'hello'})).code,200);
 assert.equal((await post({action:'hello'},{Origin:'https://evil.example'})).code,403);
 assert.equal((await post({action:'hello'},{Origin:''})).code,403);
 assert.equal((await post({action:'hello'},{'x-agent-call':'1'})).code,403);
 assert.equal((await post({action:'hello'},{},view)).code,403,'OBS token cannot send');
 assert.equal((await post({action:'hello'},{'content-type':'text/plain'})).code,415);
 assert.equal((await post('[]')).code,400);
 assert.equal((await post({action:'danmaku',text:'stopped'})).code,400);
 await admin('start',{demo:true});assert.equal((await post({action:'danmaku',text:'大家好'})).code,200);assert.equal(writes,0);assert(svc.core.publicFeed().messages.some(m=>m.role==='host'&&m.side==='viewers'&&m.text==='大家好'));
 assert.equal((await post({action:'ask',text:'马上重发'})).code,429);now+=2000;
 assert.equal((await post({action:'ask',text:'你好大肥鱼'})).code,200);await svc.core.tick();assert(svc.core.publicFeed().messages.some(m=>m.role==='host'&&m.side==='assistant'));assert(svc.core.publicFeed().messages.some(m=>m.role==='assistant'&&m.replyTo));
 now+=2000;assert.equal((await post({action:'danmaku',text:'字'.repeat(21)})).code,400);now+=2000;
 assert.equal((await post({action:'ask',text:token})).code,400,'control token cannot be publicly echoed');now+=2000;
 assert.equal((await post({action:'config',sendDanmaku:true})).code,400);assert.equal((await fetch(base+'/api/bili-live/status',{headers:{'x-console-token':token}})).status,401);
 now+=2000;assert.equal((await post({action:'ask',text:'stale',sessionId:'old-session'})).code,400);
 assert.equal((await fetch(base+'/bili-live-view/studio.css')).status,200);assert.equal((await fetch(base+'/bili-live-view/studio-ui.js')).status,200);
 const publicState=JSON.stringify(await(await fetch(base+'/bili-live-view/state?view='+view)).json());assert(!publicState.includes(token));assert(!publicState.includes('fixture-console-token'));
 await admin('pause',{paused:true});now+=2000;assert.equal((await post({action:'ask',text:'paused'})).code,400);await admin('stop',{});
 await admin('config',{roomId:'123',voice:false});await admin('start',{confirmBroadcast:true});now+=2000;assert.equal((await post({action:'danmaku',text:'真实路径模拟'})).code,200);assert.equal(writes,1);
 now+=2000;uncertain=true;assert.equal((await post({action:'danmaku',text:'不确定路径模拟'})).code,400);assert.equal(writes,2);await svc.core.tick();assert.equal(writes,2,'uncertain manual sends never retry automatically');
 await admin('stop',{});now+=4*3600000+1;assert.equal((await post({action:'hello'})).code,403,'expired grant rejected');
 assert.equal(liveAvatar('javascript:alert(1)'),null);assert.equal(liveAvatar('https://i0.hdslb.com.evil.test/bfs/a.png'),null);assert.equal(liveAvatar('http://i1.hdslb.com/bfs/face/a.jpg?tracking=1'),'https://i1.hdslb.com/bfs/face/a.jpg');
 assert.equal(safeLiveText('第一段\n• 第二条',[],150,true),'第一段\n• 第二条');assert.equal(safeLiveText('第一段\n第二条',[],20),'第一段 第二条');assert.throws(()=>safeLiveText('公开内容\n'+token,[token],150,true),/敏感/);
 console.log('PASS scoped interactive windows: Origin/type/agent/token/TTL/rate/session checks; OBS read-only; independent host danmaku and AI questions, local demo isolation, exact 20-character validation, sensitive output blocks, narrow actions, fixed assets/avatar hosts and no retry of uncertain manual sends; no real platform/model calls');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));assert(fs.realpathSync(h.temp).startsWith(fs.realpathSync(os.tmpdir())+path.sep+'qq-audit-bridge-'));await h.close();}
