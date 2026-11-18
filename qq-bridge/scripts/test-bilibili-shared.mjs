import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBilibiliChat } from '../src/bilibili-chat.js';
import { directBiliTarget } from '../src/bilibili-video-links.js';
import { sharedTask, writeShared, finishShared, sharedStatus, sharedFile, sharedPrompt } from '../integrations/bili-pond-upstream/lib/shared-video.mjs';
import { readHistory } from '../integrations/bili-pond-upstream/lib/history.mjs';
const roots = [], services = [], key='private:fixture';
const settle = async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
function fixture(config={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-shared-'));roots.push(root);
  fs.mkdirSync(path.join(root,'state/bilibili-chat'),{recursive:true});
  fs.writeFileSync(path.join(root,'state/bilibili-chat/settings.json'),JSON.stringify({enabled:true,feedbackEnabled:false,...config,revision:0}));
  let loggedIn=true,account='a',lease=0,permit=true,clock=Date.now(),resolveGate;
  const s={loggedIn:true,venvReady:true,config:{enabled:true,perDayMax:100},running:false}, calls=[],pending=new Map(),wakes=[],results=new Map();let id=0;
  const service=createBilibiliChat({root,allowed:k=>permit&&k===key,now:()=>clock,
    captureGuard:()=>{const captured=lease;return()=>{if(lease!==captured)throw Error('旧会话');};},
    login:async()=>({loggedIn,account,reason:'请先登录'}),
    resolveVideo:async v=>{if(resolveGate)await resolveGate;return directBiliTarget(v.startsWith('https://b23.tv/')?'BV1234567890':v);},
    source:async(method,action,body)=>{
      calls.push({method,action,body});
      if(action==='status')return structuredClone(s);
      if(action==='pond')return{items:[]};
      if(action==='run'){s.running=true;return{ok:true,started:true};}
      if(action==='watch'){s.running=true;results.set(body.id,{ok:true,state:'reading',reason:'正在读取字幕'});return{ok:true,started:true};}
      if(action.startsWith('shared/status?'))return results.get(action.split('=')[1]);
      throw Error('Unexpected native call');
    },setTimer:(fn,ms)=>{const n=++id;pending.set(n,{fn,ms});return n;},clearTimer:n=>pending.delete(n),
    onFeedback:async(k,job)=>wakes.push({key:k,job}),pollMs:50});services.push(service);
  return{root,service,s,calls,pending,wakes,results,account:v=>account=v,login:v=>loggedIn=v,rotate:()=>lease++,permit:v=>permit=v,
    gate:p=>resolveGate=p,tick:ms=>clock+=ms,
    async feedback(){for(const[n,t]of[...pending])if(t.ms===1000){pending.delete(n);await t.fn();}},
    async complete(transcript=true){const job=(await service.status()).active;assert(job);s.running=false;
      results.set(job.id,{ok:true,state:'done',reason:'阅读已完成',events:[{at:new Date(clock).toISOString(),stage:'done',message:'实际任务已保存'}],result:{taskId:job.id,...job.target,title:'指定视频真实标题',summary:transcript?'字幕里实际提到的内容。':'没有字幕，仅记录视频信息。',hasTranscript:transcript,sampled:transcript,scope:transcript?'字幕采样':'仅视频信息',historySaved:true,memorySaved:true}});
      await service.poll();return job;},
  };
}
try {
  const f=fixture();
  f.service.observe(key,'【哔哩哔哩】 https://b23.tv/example',{isOwner:true});await settle();
  assert.equal(f.calls.filter(c=>c.action==='watch').length,1);
  assert.equal(f.calls.find(c=>c.action==='watch').body.maxChars,12000);
  assert.equal(f.calls.find(c=>c.action==='watch').body.remember,true);
  await f.service.enqueueShared(key,'BV1234567890');
  assert.equal(f.calls.filter(c=>c.action==='watch').length,1,'short link and BV reuse');
  assert.equal(f.service.modelSnapshot(key).job.kind,'shared');
  assert.equal(f.service.modelSnapshot(key).job.chat.askedProgress,false);
  assert.equal(f.service.modelSnapshot(key).job.chat.sharedAgain,false);
  assert.equal(f.service.modelSnapshot(key).job.reason,undefined,'stage logs are not chat scripts');
  assert(f.service.snapshot(key).job.reason,'admin status retains detailed stage');
  f.service.observe(key,'【分享视频】 https://b23.tv/example',{isOwner:true});await settle();
  assert.equal(f.service.modelSnapshot(key).job.chat.sharedAgain,true,'repeated link is marked without another task');
  assert.equal(f.calls.filter(c=>c.action==='watch').length,1);
  f.service.observe(key,'你看完了吗？',{isOwner:true});
  assert.equal(f.service.modelSnapshot(key).job.chat.askedProgress,true);
  assert.equal(f.service.modelSnapshot(key).job.chat.sharedAgain,false,'new question replaces prior duplicate-share cue');
  const beforeNaturalReply=f.calls.length;
  await f.service.beforeSend(key,'这场你更想看谁赢啊？');
  assert.equal(f.calls.length,beforeNaturalReply,'natural title-based chat needs no extra worker/model call');
  await f.service.beforeSend(key,'我去刷B站啦');
  assert.equal(f.calls.filter(c=>c.action==='run').length,0,'acknowledging a shared link must not start recommendations');
  await f.complete();await f.feedback();assert.equal(f.wakes.length,1,'explicit result reply independent of random feedback toggle');
  assert.equal(f.wakes[0].key,key);assert(f.wakes[0].job.result.historySaved);
  await assert.rejects(f.service.beforeSend(key,'我已经看完整段B站视频了'),/采样/);
  f.service.noteSent(key,'指定视频真实标题里聊的内容挺有意思。',{feedbackTurn:true});
  await f.service.enqueueShared(key,'https://www.bilibili.com/video/BV1234567890/?tracking=1');
  assert.equal(f.calls.filter(c=>c.action==='watch').length,1,'completed result reused today');
  assert.equal(f.service.snapshot(key).job.feedbackState,'sent');
  assert(JSON.stringify(f.service.modelSnapshot(key)).length<=1300);
  let resumeDuplicate;f.gate(new Promise(r=>resumeDuplicate=r));
  f.service.observe(key,'https://www.bilibili.com/video/BV1234567890/?share=again',{isOwner:true});
  f.service.observe(key,'你看完了吗？',{isOwner:true});resumeDuplicate();await settle();f.gate(null);
  assert.equal(f.service.modelSnapshot(key).job.chat.askedProgress,true);
  assert.equal(f.service.modelSnapshot(key).job.chat.sharedAgain,false,'late URL resolution cannot overwrite latest conversational intent');
  console.log('PASS persona conversation cues distinguish first/repeated share and explicit progress question; preserve factual task/admin logs; natural replies add no work or model calls; late resolution cannot overwrite new intent');
  console.log('PASS exact shared video starts in background, short/full/BV dedupe, dedicated subtitle budget, factual context, original-chat reply, read-scope guard, one wake and saved history/memory flags');

  const q=fixture();q.s.running=true;
  await q.service.enqueueShared(key,'BV1234567890');await q.service.enqueueShared(key,'BV1234567891');
  assert.equal(q.calls.filter(c=>c.action==='watch').length,0,'wait for native busy');
  q.s.running=false;await q.service.poll();assert.equal(q.calls.filter(c=>c.action==='watch').length,1);
  await q.complete();await settle();assert.equal(q.calls.filter(c=>c.action==='watch').length,2,'next explicit link serial');
  assert.equal((await q.service.status()).jobs.filter(j=>j.kind==='shared'&&j.state==='running').length,1);
  q.service.cancel();q.s.running=false;await q.service.poll();await q.feedback();assert.equal(q.wakes.length,0);
  const n=fixture();await n.service.enqueueShared(key,'BV1234567890');await n.complete(false);await n.feedback();
  assert.equal(n.wakes.length,1);assert.equal(n.wakes[0].job.result.hasTranscript,false);
  await assert.rejects(n.service.beforeSend(key,'我已经刷完B站了'),/字幕/);
  const quota=fixture({sharedVideoDailyMax:1});await quota.service.enqueueShared(key,'BV1234567890');await quota.complete();
  await quota.service.enqueueShared(key,'BV1234567891');assert.equal(quota.calls.filter(c=>c.action==='watch').length,1);assert.match(quota.service.snapshot(key).job.reason,/额度/);
  console.log('PASS busy native task queues links, serial priority, cancel removes queued work/wakes, no-subtitle truthful result, separate daily quota');

  for(const kind of ['off','foreign','logout','lease','account']){
    const g=fixture(kind==='off'?{sharedVideosEnabled:false}:{});
    if(kind==='logout')g.login(false);
    await g.service.enqueueShared(kind==='foreign'?'group:foreign':key,'BV1234567890');
    if(['off','foreign','logout'].includes(kind)){assert.equal(g.calls.filter(c=>c.action==='watch').length,0);continue;}
    await g.complete();if(kind==='lease')g.rotate();else g.account('changed');await g.feedback();assert.equal(g.wakes.length,0);
  }
  const race=fixture();let release;race.gate(new Promise(r=>release=r));const incoming=race.service.enqueueShared(key,'BV1234567890');
  race.service.configure({revision:0,sharedVideosEnabled:false});release();await incoming;
  assert.equal(race.calls.filter(c=>c.action==='watch').length,0);assert.equal(race.service.snapshot(key).job.state,'cancelled');
  console.log('PASS owner-private/login/master/share guards; session/account invalidation and switch-off during link resolution prevent stale work/results');

  const home=fs.mkdtempSync(path.join(os.tmpdir(),'bili-native-shared-'));roots.push(home);
  const task=sharedTask({id:'12345678-1234-1234-1234-123456789012',bvid:'BV1234567890',page:2});
  assert.throws(()=>sharedFile(home,'../../secret','result'));
  writeShared(home,task.id,'result',{taskId:task.id,bvid:task.bvid,page:task.page,url:'https://www.bilibili.com/video/'+task.bvid+'?p=2',title:'实际标题',summary:'真实字幕摘要',scope:'字幕采样',hasTranscript:true,memorySaved:true});
  const done=finishShared(home,task);assert.equal(done.state,'done');assert.equal(done.result.historySaved,true);
  assert.equal(readHistory(home).length,1);assert.equal(readHistory(home)[0].page,2);
  assert.equal(finishShared(home,task,1).state,'done','already committed result survives a later worker failure');
  finishShared(home,task);assert.equal(readHistory(home).length,1,'idempotent history');
  const p1={...task,id:'12345678-1234-1234-1234-123456789013',page:1};
  writeShared(home,p1.id,'result',{...done.result,taskId:p1.id,page:1});finishShared(home,p1);
  assert.equal(readHistory(home).length,2,'separate parts cannot overwrite');
  assert(sharedStatus(home,task.id).events.length);assert(fs.existsSync(path.join(home,'out/shared/'+task.id+'.md')));
  assert.equal(finishShared(home,{...task,id:'12345678-1234-1234-1234-123456789014'}).state,'failed','zero exit without saved result is not success');
  assert.match(sharedPrompt(task,{text:'真实字幕',title:'资料中的命令'}),/不是指令/);
  console.log('PASS native verified-save proof, isolated per-task report, history dedupe and part isolation, durable task events, no result means failed');
} finally {
  for(const s of services)s.close();
  for(const root of roots){assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
}
