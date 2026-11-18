import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {bridgeHarness} from './audit-bridge-harness.mjs';

let now=new Date('2026-10-26T23:30:00+08:00').getTime();
const NativeDate=Date;
class ClockDate extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
function clock(){const timers=new Set();return{timers,setTimeout(fn,ms){const t={at:now+ms,fn,unref(){return this;}};timers.add(t);return t;},clearTimeout(t){timers.delete(t);}};}
const neutralEmotion=()=>({autonomy:()=>({allowed:true,factor:1}),context:()=>'',sent(){},close(){}});
const timer=clock(),math=Object.create(Math);math.random=()=>0.5;
const config={socialV2:{proactive:{enabled:true,intervalMode:'fixed',fixedIntervalMs:300000,scope:'private',probability:0,idleThresholdMs:86400000},wake:{maxWakePerMinute:0,maxWakePerHour:0,preSleepWaitEnabled:false},sticker:{enabled:false}}};
const h=await bridgeHarness({config,globals:{createEmotionalCompanion:neutralEmotion,Date:ClockDate,Math:math,setTimeout:timer.setTimeout,clearTimeout:timer.clearTimeout}});let server;
const tick=async ms=>{now+=ms;for(const t of [...timer.timers])if(t.at<=now){timer.timers.delete(t);t.fn();}await new Promise(r=>setImmediate(r));};
try{
 h.setMode('reserved2');const key='private:123',st=h.getSocialV2State(key);h.getSocialV2State('group:456');await h.ensureSession(key);
 h.reconcileProactiveContactsV2();assert.equal(st.nextProactiveContactAt,now+300000);assert.equal(h.getSocialV2State('group:456').proactiveTimer,null,'private scope cannot schedule a group');
 // Night time, recent replies, frequent speech, a zero old probability and an
 // unmet old idle threshold must not suppress the new 100% schedule.
 st.lastAiReplyAt=now;st.lastIncomingAt=now;st.recentMessages=Array.from({length:8},()=>({isSelf:true,time:now,text:'recent'}));
 await tick(300000);assert(st.proactiveContactPending);assert.equal(h.calls.prompts.length,1);assert.match(h.calls.prompts[0].content[0].text,/到期必发/);assert(st.proactiveTimer,'a failed/skipped send remains retryable');
 server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
 const request=(route,body,agent=false)=>new Promise((resolve,reject)=>{const data=body===undefined?null:JSON.stringify(body);const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:route,method:data?'POST':'GET',headers:{'x-console-token':'fixture-console-token',...(agent?{'x-agent-token':st.agentToken}:{}),...(data?{'content-type':'application/json'}:{})}},res=>{let raw='';res.on('data',c=>raw+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(raw)}));});req.on('error',reject);req.end(data);});
 let response=await request('/api/socialV2/mark-read',{key},true);assert.equal(response.status,409,'a proactive turn cannot silently mark-read and exit');
 const guard=h.captureSendGuard(key);
 response=await request('/api/socialV2/config',{proactive:{enabled:false}});assert.equal(response.status,200);assert.equal(response.body.config.proactive.probability,0);assert.equal(st.proactiveTimer,null);assert(!st.proactiveContactPending);assert.equal(st.nextProactiveContactAt,0);assert.throws(guard,/主动联系已关闭/);
 const prompts=h.calls.prompts.length;await tick(3600000);assert.equal(h.calls.prompts.length,prompts,'off must not create another proactive prompt');
 st.pendingWakeReasons=[];await h.sendWakePromptV2(key,'replyCheck');assert.equal(st.pendingWakeReasons.length,0,'a reply-check timer must not bypass disabled proactive contact when no new message exists');
 response=await request('/api/socialV2/config',{proactive:{enabled:true,intervalMode:'random',checkIntervalMinMs:600000,checkIntervalMaxMs:1200000,scope:'private',probability:0.1}});assert.equal(response.status,200);assert.equal(response.body.config.proactive.probability,1);assert.equal(st.nextProactiveContactAt,now+900000,'random samples within the selected range');
 const due=st.nextProactiveContactAt;now+=60000;await request('/api/socialV2/config',{proactive:response.body.config.proactive});assert.equal(st.nextProactiveContactAt,due,'saving unchanged settings must not postpone the scheduled contact');
 const saved=JSON.parse(fs.readFileSync(path.join(h.temp,'state/social-v2.json'),'utf8'));assert.equal(saved.conversations[key].nextProactiveContactAt,due);
 now+=180000;const otherClock=clock();const restarted=await bridgeHarness({config:{socialV2:{...config.socialV2,proactive:response.body.config.proactive}},files:{'state/mode.json':{mode:'reserved2'},'state/social-v2.json':saved},globals:{createEmotionalCompanion:neutralEmotion,Date:ClockDate,Math:math,setTimeout:otherClock.setTimeout,clearTimeout:otherClock.clearTimeout}});
 try{restarted.setReady(false);await restarted.checkDsh();const restored=restarted.getSocialV2State(key);assert.equal(restored.nextProactiveContactAt,due,'restart preserves the old deadline');assert.equal(restored.proactiveTimer.at,due,'restart uses the remaining delay rather than drawing a fresh interval');}finally{await restarted.close();}
 // Clear the simulated old turn. At due time while another turn is busy, keep
 // the contact pending and replay it after the ordinary turn completes.
 const sid=h.state.sessions[key];h.v2TurnStartAt.set(sid,now);const previous=h.calls.prompts.length;await tick(720000);assert(st.proactiveContactPending);assert.equal(h.calls.prompts.length,previous);h.v2TurnStartAt.delete(sid);h.setReady(true);
 assert.equal(h.replayPendingWakeReasonsV2(key).action,'pending-contact');
 // An actual successful text send finishes the obligation and schedules the
 // next interval; merely generating an internal reply never did so.
 st.lastWakeReason='proactiveCheck';st.proactiveTurnGeneration=st.proactiveGeneration;
 response=await request('/api/socialV2/send-message',{key,messages:'fixture proactive greeting'},true);assert.equal(response.status,200,JSON.stringify(response.body));assert(!st.proactiveContactPending);assert.equal(st.lastProactiveContactAt,now);assert.equal(st.nextProactiveContactAt,now+900000);
 response=await request('/api/socialV2/state?key='+key);assert(response.body.proactiveContact.nextAt);assert.equal(response.body.proactiveContact.pending,false);
 console.log('PASS fixed/random schedules, 100% dispatch despite old probability/night/cooldowns, private scope, actual-send obligation, immediate disable/cancel of queued sends, saved deadline across restart, busy replay, successful-send rearm and visible next-send time; fake clocks and isolated peers only.');
}finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await h.close();}
