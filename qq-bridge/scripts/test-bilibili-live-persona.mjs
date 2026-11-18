import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createLiveController,liveReplyPrompt} from '../src/bilibili-live-core.js';
import {createBilibiliLive} from '../src/bilibili-live-service.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';

const lab=fs.mkdtempSync(path.join(os.tmpdir(),'live-persona-test-'));let now=1700000000000,requests=[],sent=[],release,hold=false;
const oldPersona='你叫青柚，是个慢热但有主见的直播搭档，和观众自然聊音乐。',newPersona='你叫晏宁，是个活泼的游戏主播，喜欢接观众的梗。';
const core=createLiveController({home:lab,clock:()=>now,autoTick:false,model:async prompt=>{requests.push(prompt);if(hold)return new Promise(resolve=>release=resolve);return '这首歌我也喜欢，咱们听完再聊。';},inspectRoom:async()=>({roomId:1,live:true,selfUid:'self'}),connect:async()=>({close(){}}),sendDanmaku:async(_room,text)=>sent.push(text)});
try{
  core.configure({roomId:'1',persona:oldPersona,questionOnly:false,voice:false,minReplySec:6,userCooldownSec:10});await core.start({confirmBroadcast:true});
  core.ingest({kind:'question',id:'p1',timestamp:now,user:{uid:'viewer',uname:'测试观众'},content:'这首歌真好听'});await core.tick();assert.equal(requests.length,1);assert(requests[0].includes(oldPersona));assert(requests[0].includes('这首歌真好听'));assert.equal(sent.length,1);
  now+=20000;hold=true;core.ingest({kind:'question',id:'p2',timestamp:now,user:{uid:'viewer2',uname:'另一位观众'},content:'今天聊游戏吧'});const pending=core.tick();await new Promise(resolve=>setImmediate(resolve));assert(release);
  core.configure({persona:newPersona});release('旧人格的回答不应继续发送');await pending;assert.equal(sent.length,1,'changing live persona cancels an obsolete generated reply');
  now+=20000;hold=false;core.ingest({kind:'question',id:'p3',timestamp:now,user:{uid:'viewer3',uname:'第三位观众'},content:'这个关卡我也喜欢'});await core.tick();assert(requests.at(-1).includes(newPersona));assert(!requests.at(-1).includes(oldPersona));assert.equal(sent.length,2);
  const direct=liveReplyPrompt(core.status().config,{kind:'question',user:'试聊观众',text:'你叫什么？'});assert(direct.includes(newPersona));assert(direct.includes('你叫什么'));assert(direct.includes('之前回复中的旧自称不能覆盖'));
}finally{core.close();assert.equal(path.dirname(path.resolve(lab)),path.resolve(os.tmpdir()));fs.rmSync(lab,{recursive:true,force:true});}

let service,externalWrites=0,previewCalls=[];
const h=await bridgeHarness({globals:{createBilibiliLive:options=>service=createBilibiliLive({...options,dependencies:{skipAcl:true,model:async(prompt,options)=>{previewCalls.push({prompt,demo:options.demo});return '我叫青柚，咱们聊聊你喜欢的音乐吧。';},api:{login:()=>({}),room:async()=>{externalWrites++;throw Error('No platform connection allowed');},send:async()=>{externalWrites++;throw Error('No platform send allowed');}},connect:async()=>{externalWrites++;throw Error('No live room allowed');}}})}});
const server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
try{
  const base='http://127.0.0.1:'+server.address().port,headers={'x-console-token':'fixture-console-token','content-type':'application/json'};
  const api=async(action,body,extra={})=>{const response=await fetch(base+'/api/bili-live/'+action,{method:body===undefined?'GET':'POST',headers:{...headers,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,value:await response.json()};};
  const initial=(await api('status')).value.config.persona;
  const reply=await api('persona/preview',{persona:oldPersona,message:'你叫什么？'});assert.equal(reply.status,200);assert(reply.value.preview);assert.match(reply.value.text,/青柚/);assert.equal(previewCalls.length,1);assert.equal(previewCalls[0].demo,false);assert(previewCalls[0].prompt.includes(oldPersona));
  let state=(await api('status')).value;assert(!state.active);assert.equal(state.config.persona,initial,'preview must not save draft persona');assert.equal(externalWrites,0);assert.equal(state.outputs.length,0);
  assert.equal((await api('persona/preview',{persona:oldPersona,message:'你叫什么？'},{'x-agent-call':'1'})).status,403);
  assert.equal((await api('persona/preview',{persona:oldPersona,message:''})).status,400);
  assert.equal((await api('persona/preview',{persona:oldPersona,message:'你好',roomId:'999'})).status,400);assert.equal(previewCalls.length,1);
  await api('config',{persona:newPersona});state=(await api('status')).value;assert.equal(state.config.persona,newPersona);assert(!state.active);assert.equal(externalWrites,0);
  console.log('PASS live persona prose, ordinary danmaku, hot updates/cancellation, shared live/preview prompt, unsaved-draft preview, scoped auth and no live connection/tts/platform writes in preview.');
}finally{service?.close();server.closeAllConnections();await new Promise(r=>server.close(r));await h.close();}
