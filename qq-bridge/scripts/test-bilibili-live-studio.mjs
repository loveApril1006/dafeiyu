// Real bridge HTTP with local fixtures; never connects to Bilibili, QQ or a paid model.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {bridgeHarness} from './audit-bridge-harness.mjs';import {createBilibiliLive} from '../src/bilibili-live-service.js';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
const notes=[{bvid:'BV1234567890',title:'视频甲',note:'只属于视频甲的真实笔记'},{bvid:'BV1234567891',title:'视频乙',note:'只属于视频乙的真实笔记'}];
const files={'companion/bili-native-data/history.jsonl':notes.map(n=>JSON.stringify(n)).join('\n')+'\n'};for(const n of ['bilibili-live.html','bilibili-live-studio.html','bilibili-live-overlay.html','bilibili-live-studio.css','bilibili-live-studio-ui.js'])files['public/'+n]=fs.readFileSync(new URL('../public/'+n,import.meta.url),'utf8');
let svc,now=Date.now(),imageId,block=false,finish,started,prompts=[],writes=0;
const dependencies={skipAcl:true,core:{autoTick:false,clock:()=>now},studio:{autoTick:false,clock:()=>now},api:{login:()=>({}),room:async()=>({roomId:123,live:true}),send:async()=>writes++},connect:async()=>({close(){}}),model:async prompt=>{prompts.push(prompt);if(block){started?.();return new Promise(r=>finish=r);}return JSON.stringify({text:prompt.includes('点评小电视')?'这是当前视频的点评。':'大肥鱼的配图回答。',imageId});}};
const h=await bridgeHarness({files,globals:{createBilibiliLive:o=>svc=createBilibiliLive({...o,dependencies})}}),server=h.startConsoleServer();await new Promise(r=>server.listening?r():server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,headers={'x-console-token':'fixture-console-token','content-type':'application/json'};
async function api(action,body){const r=await fetch(base+'/api/bili-live/'+action,{headers,method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})});return {code:r.status,data:await r.json()};}
try{
 await api('status');const view=(await api('overlay',{mode:'studio'})).data.url;assert(view.includes('/studio?'));assert.equal((await fetch(base+view)).status,200);
 const token=new URL(view,base).searchParams.get('view'),stateURL=base+'/bili-live-view/state?view='+token+'&monitor=1';
 assert.equal((await api('images/upload',{dataUrl:'data:image/svg+xml;base64,PHN2Zz4=',label:'拒绝SVG'})).code,400);
 assert.equal((await api('images/upload',{dataUrl:'data:image/png;base64,'+Buffer.from('not png').toString('base64')})).code,400);
 assert.equal((await api('images/upload',{dataUrl:'data:image/png;base64,'+'A'.repeat(720001)})).code,400);
 assert.equal((await api('images/upload',{dataUrl:'data:image/png;base64,'+png,label:'谢谢啦',tags:'开心，感谢，送礼'})).code,200);imageId=svc.studio.images()[0].id;
 const picture=base+'/bili-live-view/images/'+imageId+'?view='+token;assert.equal((await fetch(picture)).status,404,'unpublished gallery is not exposed to OBS');
 assert.equal((await fetch(base+'/api/bili-live/images/'+imageId,{headers})).status,200);
 assert.equal((await fetch(base+'/api/bili-live/images/'+imageId)).status,401);
 assert.equal((await fetch(base+'/api/bili-live/publish',{method:'POST',headers:{...headers,'x-agent-call':'1'},body:'{}'})).status,403);
 assert.equal((await api('publish',{text:'不能在停止时发言',imageId})).code,400);
 await api('start',{demo:true});await api('publish',{text:'这是主播分享的图片',imageId});await svc.core.tick();assert.equal((await fetch(picture)).status,200);assert.equal((await fetch(picture)).headers.get('content-type'),'image/png');
 let state=await(await fetch(stateURL)).json();assert(state.chat.messages.some(m=>m.role==='assistant'&&m.imageId===imageId));assert(!JSON.stringify(state).includes('fixture-console-token'));assert(!JSON.stringify(state).includes('"uid"'));assert(!JSON.stringify(state).includes('真实笔记'));
 await api('config',{autoImages:true});now+=20000;svc.core.ingest({kind:'question',id:'with-picture',timestamp:now,user:{uid:'100',uname:'观众'},content:'大肥鱼，看看图片？'});await svc.core.tick();assert.equal(svc.core.status().outputs.at(-1).imageId,imageId);assert.equal(svc.core.status().outputs.at(-1).text,'大肥鱼的配图回答。');
 assert.equal((await api('video',{bvid:'https://evil.example/video/BV1234567890'})).code,400);
 await api('video',{bvid:notes[0].bvid});now+=20000;await api('video/comment',{});await svc.core.tick();assert(prompts.at(-1).includes(notes[0].note));assert(!prompts.at(-1).includes(notes[1].note));assert.equal(svc.core.status().outputs.at(-1).video.bvid,notes[0].bvid);
 // A source switch while the model is pending must cancel the entire old publication.
 now+=20000;block=true;const waiting=new Promise(r=>started=r);await api('video/comment',{});const job=svc.core.tick();await waiting;const count=svc.core.status().outputs.length;await api('video',{bvid:notes[1].bvid});finish('旧视频的回答不应该出现');await job;assert.equal(svc.core.status().outputs.length,count);assert.equal(svc.core.observer().output,null);block=false;
 // Auto-follow uses newly completed notes once; polling never restarts the same video.
 await api('studio',{displayName:'大肥鱼',autoFollow:true,autoComment:true,commentDelaySec:10});svc.studio.tick();const selected=svc.studio.status().video;now+=5000;svc.studio.tick();assert.equal(svc.studio.status().video.playId,selected.playId);
 now+=20000;svc.studio.tick();await svc.core.tick();const autoCount=svc.core.status().outputs.length;svc.studio.tick();await svc.core.tick();assert.equal(svc.core.status().outputs.length,autoCount,'only one automatic commentary per selected video');
 state=await(await fetch(stateURL)).json();assert.equal(state.studio.video.bvid,selected.bvid);assert(!('note'in state.studio.video));assert(state.studio.commentary);
 await api('stop',{});now+=30000;svc.studio.tick();assert(!svc.studio.status().video.enabled,'stopping does not auto-follow back into playback');assert.equal(writes,0);
 assert.equal((await api('images/delete',{id:imageId})).code,200);assert.equal((await fetch(picture)).status,404);
 // Saved follow settings do not resume playback on a new bridge instance.
 svc.close();const next=createBilibiliLive({root:h.temp,getDsh:()=>({}),dependencies});next.studio.tick();assert.equal(next.studio.status().video,null);assert.equal(next.core.status().active,false);next.close();
 console.log('PASS studio admin/view isolation, approved local image upload/display/delete, agent denial, manual/image and AI library replies, BV-only video validation, matching-note commentary, cancellation on video switch, stable playback, one-shot auto commentary, stop/restart isolation; no external writes');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));assert(fs.realpathSync(h.temp).startsWith(fs.realpathSync(os.tmpdir())+path.sep+'qq-audit-bridge-'));await h.close();}
