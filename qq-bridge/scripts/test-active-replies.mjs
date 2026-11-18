import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {bridgeHarness} from './audit-bridge-harness.mjs';
import {synthesizeGptSovitsAudio} from '../src/local-tts.js';

const config={socialV2:{wake:{defaultMode:'active',replyEveryMessageWhenActive:true,maxWakePerMinute:0,maxWakePerHour:0,preSleepWaitEnabled:false},send:{burstMaxMessages:0,maxMessageChars:0,maxSendPerMinute:0,maxSendPerHour:0,burstIntervalMinMs:0,burstIntervalMaxMs:0},voice:{enabled:true,maxPerMinute:0,maxPerHour:0},tools:{sendVoice:true},sticker:{enabled:false},proactive:{enabled:false}}};
const wav=Buffer.alloc(48);wav.write('RIFF');wav.write('WAVE',8);
const outbound=[];let failSend=false;
const h=await bridgeHarness({config,globals:{
 fetch:async(url,init={})=>{const body=JSON.parse(init.body||'{}');outbound.push({url:String(url),body});if(failSend&&String(url).endsWith('send_group_msg'))throw Error('fixture transport failure');return{ok:true,status:200,json:async()=>({status:'ok',retcode:0,data:String(url).endsWith('get_msg')?{message_id:9001,message:[{type:'record',data:{file:'fixture-record.amr'}}]}:{message_id:9001}})};},
 safeFetchBuffer:async()=>({buffer:Buffer.from('89504e470d0a1a0a00000000','hex')}),
 inspectAudio:async()=>({ok:true,size:48,duration:1,codec:'pcm',warnings:[]}),synthesizeGptSovits:async(text,{dir})=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'fixture.wav'),wav);return 'fixture.wav';}}});
let server;
try{
 h.setMode('reserved2');const key='group:456',st=h.getSocialV2State(key);await h.ensureSession(key);
 server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
 const request=(route,body,agent=true)=>new Promise((resolve,reject)=>{
  const data=body===undefined?null:JSON.stringify(body),req=http.request({hostname:'127.0.0.1',port:server.address().port,path:route,method:data===null?'GET':'POST',headers:{'x-console-token':'fixture-console-token',...(agent?{'x-agent-token':st.agentToken}:{}),...(data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{})}},res=>{let raw='';res.setEncoding('utf8');res.on('data',c=>raw+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(raw)}));});req.on('error',reject);req.end(data);
 });
 const incoming=(n)=>h.appendSocialV2Message(key,'fixture peer','message '+n,'message '+n,false,false,String(100+n),[],'777');
 incoming(1);incoming(2);incoming(3);
 let result=await request('/api/socialV2/unread?key='+key);assert.equal(result.body.interaction.pendingCount,3);assert.equal(result.body.interaction.mode,'reply-every-message');
 let through=result.body.readThroughSeq;
 result=await request('/api/socialV2/mark-read',{key,throughSeq:through});assert.equal(result.status,409);assert.equal(st.unread.length,3);
 result=await request('/api/socialV2/wake-config',{key,throughSeq:through,config:{mode:'diving'}});assert.equal(result.status,409);
 const long='一段较长的说明。'.repeat(220);
 result=await request('/api/socialV2/send-message',{key,messages:[long,'second','third','fourth','fifth','sixth','seventh','eighth','ninth'],gapMode:'fixed',gapMs:0});
 assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.sent,9);assert.equal(outbound.filter(c=>c.url.endsWith('send_group_msg')).length,9);assert.equal(outbound.find(c=>c.url.endsWith('send_group_msg')).body.message[0].data.text,long);assert.equal(h.requiredRepliesV2(st).length,0);
 result=await request('/api/socialV2/mark-read',{key,throughSeq:through});assert.equal(result.status,200);assert.equal(st.unread.length,0);
 // Pending replies cannot be evicted by a small unread/context window or persisted truncation.
 h.cfg.socialV2.context.unreadLimit=2;
 for(let i=4;i<=108;i++)incoming(i);
 assert.equal(h.requiredRepliesV2(st).length,105);
 const persisted=JSON.parse(fs.readFileSync(path.join(h.temp,'state/social-v2.json'),'utf8'));assert.equal(persisted.conversations[key].unread.length,105);
 const restarted=await bridgeHarness({config,files:{'state/mode.json':{mode:'reserved2'},'state/social-v2.json':persisted}});
 try{restarted.setReady(false);await restarted.checkDsh();const restored=restarted.getSocialV2State(key);assert.equal(restarted.requiredRepliesV2(restored).length,105);assert(restored.pendingWakeTimer,'persisted replies must resume on startup');}finally{await restarted.close();}
 // Read only one message. A send may not acknowledge any incoming message the model has not seen.
 result=await request('/api/socialV2/unread?key='+key+'&limit=1');
 result=await request('/api/socialV2/send-message',{key,messages:['one','extra'],gapMode:'fixed',gapMs:0});assert.equal(result.status,200);assert.equal(h.requiredRepliesV2(st).length,104);
 // Transport failure does not mark a message replied.
 await request('/api/socialV2/unread?key='+key+'&limit=2');const pendingBefore=h.requiredRepliesV2(st).length;
 failSend=true;
 result=await request('/api/socialV2/send-message',{key,messages:'failed send'});assert.equal(result.status,500);assert.equal(h.requiredRepliesV2(st).length,pendingBefore);failSend=false;
 // Voice is a real record-segment send, and fulfils one seen pending reply.
 result=await request('/api/socialV2/send-voice',{key,voice:'tts:这是主动语音回复',verify:true});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.verified,true);assert.equal(h.requiredRepliesV2(st).length,pendingBefore-1);assert(outbound.some(c=>c.url.endsWith('send_group_msg')&&c.body.message[0].type==='record'));
 assert.equal(st.recentMessages.at(-1).kind,'voice');
 h.cfg.socialV2.sticker.enabled=true;await request('/api/socialV2/unread?key='+key+'&limit=3');
 result=await request('/api/socialV2/send-sticker',{key,stickerId:'fixture-sticker'});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(h.requiredRepliesV2(st).length,pendingBefore-2);assert.equal(st.recentMessages.at(-1).kind,'sticker');assert(outbound.some(c=>c.url.endsWith('send_group_msg')&&c.body.message.some(m=>m.type==='image')));
 // Operator control can clear/disable active requirements, without forging agent delivery.
 result=await request('/api/socialV2/mark-read',{key},false);assert.equal(result.status,200);
 st.wakeConfig.mode='diving';incoming(109);result=await request('/api/socialV2/unread?key='+key);assert.equal(result.body.interaction.mode,'natural');
 result=await request('/api/socialV2/mark-read',{key,throughSeq:result.body.readThroughSeq});assert.equal(result.status,200);
 // Unlimited remains explicit 0 after a config round-trip; positive values still work when configured.
 result=await request('/api/socialV2/config',{send:{burstMaxMessages:0,maxMessageChars:0,maxSendPerMinute:0,maxSendPerHour:0},wake:{replyEveryMessageWhenActive:true,lockMode:'active'}},false);assert.equal(result.status,200);assert.equal(h.cfg.socialV2.send.maxMessageChars,0);assert.equal(st.wakeConfig.mode,'active');
 h.cfg.socialV2.send.maxMessageChars=3;result=await request('/api/socialV2/send-message',{key,messages:'1234'});assert.equal(result.status,400);h.cfg.socialV2.send.maxMessageChars=0;
 // Unseen pending replies remain in the queue across a no-action turn.
 incoming(110);assert.equal(h.replayPendingWakeReasonsV2(key).action,'pending-replies');assert(st.pendingWakeTimer);
 await request('/api/socialV2/activity',{paused:true},false);assert.equal(st.pendingWakeTimer,null);
 await request('/api/socialV2/activity',{paused:false},false);assert(st.pendingWakeTimer,'resume must reschedule pending replies');
 const prompt=h.buildWakePromptV2(key,'anyMessage');assert.match(prompt,/reply-every-message/);assert.match(prompt,/不用等待群里安静/);
 // The supported 500-character request reaches the service intact; oversize
 // input fails locally instead of reaching the synthesis service.
 let ttsBody;const ttsFetch=async(_url,options)=>{ttsBody=JSON.parse(options.body);return{ok:true,headers:{get:()=>null},body:[wav]};};await synthesizeGptSovitsAudio('一'.repeat(500),{fetchImpl:ttsFetch});assert.equal(ttsBody.text.length,500);await assert.rejects(()=>synthesizeGptSovitsAudio('一'.repeat(501),{fetchImpl:()=>{throw Error('must not call service');}}),/1～500/);
 console.log('PASS active per-message delivery, no silent mark-read, unlimited long text and 9+ bubbles, 105 pending messages retained on disk, unseen-message protection, failure accounting, voice record/verification and sticker image segments, natural optional replies, config zero round-trip and pending-turn retry; isolated peers only.');
}finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await h.close();}
