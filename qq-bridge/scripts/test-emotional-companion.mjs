import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createEmotionalCompanion } from '../src/emotional-companion.js';
import { bridgeHarness } from './audit-bridge-harness.mjs';

function fixture(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoge-emotion-'));
  let time=Date.parse('2026-10-26T04:00:00Z'),role='猫娘';
  const file=path.join(dir,'state.sqlite'),open=()=>createEmotionalCompanion({file,now:()=>time,role:()=>role,ownerQQ:()=>10001,random:()=>0.5});
  const instances=[];const create=()=>{const e=open();instances.push(e);return e;};
  try { fn({e:create(),create,advance:ms=>time+=ms,setRole:r=>role=r}); }
  finally { instances.forEach(e=>e.close());assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true}); }
}
test('real interactions persist across instances and isolate role user and channel',()=>fixture(({e,create,setRole})=>{
  e.incoming('private:10001',{text:'我喜欢橘子猫',id:'a'});
  assert.equal(create().snapshot('private:10001').memories[0].text,'我喜欢橘子猫');
  assert.equal(e.snapshot('private:10002').memories.length,0);
  e.incoming('group:22222',{userId:'10001',text:'记住：我喜欢红茶',id:'g'});
  assert.equal(e.snapshot('group:22222','10002').memories.length,0);
  assert.equal(e.snapshot('private:10001').memories.length,1);
  setRole('另一角色');assert.equal(e.snapshot('private:10001').memories.length,0);
}));
test('duplicate and rapid messages cannot farm relationship points',()=>fixture(({e,advance})=>{
  e.incoming('private:10001',{text:'谢谢你',id:'first'});
  const favor=e.snapshot('private:10001').favor;
  e.incoming('private:10001',{text:'谢谢你',id:'first'});
  assert.equal(e.snapshot('private:10001').interactions,1);
  for(let i=0;i<100;i++)e.incoming('private:10001',{text:'谢谢你',id:String(i)});
  assert.equal(e.snapshot('private:10001').favor,favor);
  for(let i=0;i<100;i++){advance(61000);e.incoming('private:10001',{text:'谢谢你',id:'day'+i});}
  assert(e.snapshot('private:10001').favor<=23.00001);
}));
test('grace period decay and mood recovery are stable on repeated reads',()=>fixture(({e,advance})=>{
  e.incoming('private:10001',{text:'谢谢你真棒',id:'a'});
  const initial=e.snapshot('private:10001');
  advance(86400000);assert.equal(e.snapshot('private:10001').favor,initial.favor);
  assert(e.snapshot('private:10001').valence<initial.valence);
  advance(10*86400000);const p=e.snapshot('private:10001');assert(p.favor<initial.favor);
  assert.equal(e.snapshot('private:10001').favor,p.favor);
  e.update('private:10002','','profile',{favor:0});assert.equal(e.snapshot('private:10002').favor,0);
}));
test('quiet hours cross midnight and never block ordinary replies',()=>fixture(({e,advance})=>{
  assert(e.autonomy('private:10001').allowed);
  advance(12*3600000);assert.equal(e.autonomy('private:10001').allowed,false);
  assert(e.context('private:10001').includes('本地角色状态'));
  e.configure({enabled:false});assert.equal(e.context('private:10001'),'');assert(e.autonomy('private:10001').allowed);
}));
test('user boundary and daily proactive cap survive another process',()=>fixture(({e,create,advance})=>{
  e.incoming('private:10001',{text:'不要打扰我',id:'a'});assert(!e.autonomy('private:10001').allowed);
  advance(61000);e.incoming('private:10001',{text:'可以主动找我',id:'b'});assert(e.autonomy('private:10001').allowed);
  for(let i=0;i<3;i++)create().sent('private:10001');
  assert(!e.autonomy('private:10001').allowed);advance(86400000);assert(e.autonomy('private:10001').allowed);
}));
test('annual and one-off dates validate and only actual sends mark them delivered',()=>fixture(({e})=>{
  e.update('private:10001','','date',{date:'10-26',title:'生日'});
  e.update('private:10001','','date',{date:'2025-10-26',title:'过期约定'});
  assert.equal(e.snapshot('private:10001').today.length,1);assert(e.autonomy('private:10001').dateDue);
  e.context('private:10001');assert(e.autonomy('private:10001').dateDue);
  e.sent('private:10001');assert(!e.autonomy('private:10001').dateDue);
  assert.throws(()=>e.update('private:10001','','date',{date:'02-30',title:'错误日期'}));
  assert.equal(e.snapshot('private:10001').dates.length,2);
}));
test('schedule validation rejects bad and overlapping times without losing config',()=>fixture(({e})=>{
  assert.throws(()=>e.configure({voiceProbability:2}));
  assert.throws(()=>e.configure({schedule:[{start:'09:00',end:'12:00',activity:'工作'},{start:'11:00',end:'13:00',activity:'吃饭'}]}));
  assert.throws(()=>e.configure({schedule:[{start:'24:00',end:'08:00',activity:'休息'}]}));
  assert.equal(e.settings().schedule.length,4);
  e.configure({schedule:[{start:'22:00',end:'06:00',activity:'休息',quiet:true}]});
}));
test('memory selection deletion and diaries use actual input only',()=>fixture(({e,advance})=>{
  e.incoming('private:10001',{text:'假如我喜欢编程',id:'a'});assert.equal(e.snapshot('private:10001').memories.length,0);
  advance(61000);e.incoming('private:10001',{text:'记住：明天要去图书馆',id:'b'});
  advance(61000);e.incoming('private:10001',{text:'我喜欢橘子猫',id:'c'});
  assert.equal(e.snapshot('private:10001','','橘子猫').relevantMemories[0].text,'我喜欢橘子猫');
  const p=e.snapshot('private:10001');assert.equal(p.diaries[0].count,3);
  e.update('private:10001','','forget',{id:p.memories[0].id});assert.equal(e.snapshot('private:10001').memories.length,1);
  assert.throws(()=>e.snapshot('group:22222'));
}));

test('memory projections respect relevance and character budgets without changing stored records',()=>fixture(({e,create})=>{
  for(let i=0;i<30;i++)e.update('private:10001','','remember',{text:'我喜欢第'+i+'种测试口味。'+'奶香面包。'.repeat(40)});
  assert.equal(e.snapshot('private:10001','','月球地质').relevantMemories.length,1);
  assert(e.snapshot('private:10001','','测试口味面包').relevantMemories.length<=3);
  e.configure({contextChars:600});assert(e.context('private:10001','','测试口味面包').length<=600);
  e.incoming('private:10001',{text:'你好',label:'"\\'.repeat(40),id:'escaped-label'});
  e.update('private:10001','','profile',{relationship:'"\\'.repeat(20)});
  assert(e.context('private:10001').length<=600);assert.equal(e.snapshot('private:10001').label.length,80);
  const peer=create();peer.configure({memoryContextLimit:0});assert.equal(e.snapshot('private:10001','','面包').relevantMemories.length,0);
  assert.equal(e.snapshot('private:10001').memories.length,30);
  const copy=e.settings();copy.schedule[0].activity='must not poison cache';assert.notEqual(e.settings().schedule[0].activity,copy.schedule[0].activity);
  assert.throws(()=>e.configure({contextChars:300}));assert.equal(e.settings().contextChars,600);
}));
test('mood affects expression probabilities and delay without another model call',()=>fixture(({e})=>{
  const before=e.snapshot('private:10001').expression;
  e.incoming('private:10001',{text:'谢谢你真棒',id:'a'});
  const after=e.snapshot('private:10001').expression;
  assert(after.delayMs<before.delayMs);assert(after.voiceProbability>before.voiceProbability);assert(after.stickerProbability>before.stickerProbability);
  assert(!e.context('private:10001').includes('恋人'));
}));

test('emotion reacts within the relationship cooldown and can calm down without favor farming',()=>fixture(({e,advance,create})=>{
  e.incoming('private:10001',{text:'谢谢你',id:'warm'});const favor=e.snapshot('private:10001').favor;
  advance(2000);e.incoming('private:10001',{text:'你真是废物',id:'attack'});let p=e.snapshot('private:10001');assert.equal(p.mood,'生气');assert.equal(p.favor,favor);assert(e.context('private:10001').includes('口语脏话'));assert.equal(create().snapshot('private:10001').mood,'生气');
  const anger=p.feelings.anger;e.incoming('private:10001',{text:'你真是废物',id:'attack'});assert.equal(e.snapshot('private:10001').feelings.anger,anger);
  advance(2000);e.incoming('private:10001',{text:'对不起，别生气',id:'repair'});assert.equal(e.snapshot('private:10001').mood,'缓和中');
  advance(2000);e.incoming('private:10001',{text:'别骂我',id:'stop'});assert(!e.snapshot('private:10001').replyStyle.allowSwearing);assert(e.context('private:10001').includes('停止互怼'));assert(!e.snapshot('private:10001').noContact);
  advance(2000);e.incoming('private:10001',{text:'可以互怼',id:'resume'});assert(e.snapshot('private:10001').replyStyle.allowSwearing);
  advance(10*86400000);assert(e.snapshot('private:10001').feelings.anger<.001);
}));

test('reports and quotes do not count as attacks; hurt excitement and playfulness are distinct',()=>fixture(({e,advance})=>{
  e.incoming('private:10001',{text:'领导骂我废物，我很难过',id:'report'});assert.equal(e.snapshot('private:10001').mood,'关切');assert.equal(e.snapshot('private:10001').feelings.anger,0);
  e.incoming('private:10002',{text:'你说“你真是废物”是错误的',id:'quote'});assert.equal(e.snapshot('private:10002').feelings.anger,0);
  e.incoming('private:10003',{text:'你骗我',id:'hurt'});assert.equal(e.snapshot('private:10003').mood,'委屈');
  e.incoming('private:10004',{text:'哈哈笑死',id:'fun'});assert.equal(e.snapshot('private:10004').mood,'轻松');
  for(let i=0;i<3;i++){advance(61000);e.incoming('private:10005',{text:'太好了，好期待',id:'excited'+i});}assert.equal(e.snapshot('private:10005').mood,'兴奋');
}));

test('learned interaction style grows slowly, survives restart, isolates scopes and can reset independently',()=>fixture(({e,advance,create,setRole})=>{
  e.update('private:10001','','remember',{text:'我喜欢乌龙茶'});
  for(let i=0;i<30;i++){advance(61000);e.incoming('private:10001',{text:'谢谢你，抱抱',id:'growth'+i});}
  const p=e.snapshot('private:10001');assert.equal(p.temperament.samples,12);assert(p.temperament.warmth>.08&&p.temperament.warmth<.15);assert(p.replyStyle.tendencies.includes('更愿意亲近'));assert.equal(create().snapshot('private:10001').temperament.samples,12);
  for(let i=0;i<5;i++)e.context('private:10001');assert.equal(e.snapshot('private:10001').temperament.samples,12);assert.equal(e.snapshot('private:10002').temperament.samples,0);assert.equal(e.snapshot('group:22222','10001').temperament.samples,0);
  e.configure({personalityLearning:false});advance(86400000);e.incoming('private:10001',{text:'喜欢你',id:'learning-off'});assert.equal(e.snapshot('private:10001').temperament.samples,12);
  const before=e.snapshot('private:10001');e.update('private:10001','','resetPersonality');const after=e.snapshot('private:10001');assert.equal(after.temperament.samples,0);assert.equal(after.favor,before.favor);assert.equal(after.trust,before.trust);assert.deepEqual(after.memories,before.memories);
  setRole('另一人格');assert.equal(e.snapshot('private:10001').temperament.samples,0);
}));

test('expression controls and minimum prompt budget preserve facts and persona priority',()=>fixture(({e,advance})=>{
  e.configure({contextChars:600,expressionIntensity:1});e.incoming('private:10001',{text:'你真是废物',id:'a'});assert(e.context('private:10001').length<=600);assert(e.context('private:10001').includes('人格卡'));assert.throws(()=>e.configure({expressionIntensity:2}));
  e.configure({allowSwearing:false});assert(e.context('private:10001').includes('不用脏话'));e.configure({emotionalReplies:false});const text=e.context('private:10001');assert(!text.includes('口语脏话'));assert(text.includes('不参与本轮表达'));assert(!e.snapshot('private:10001').replyStyle.enabled);
  advance(61000);e.incoming('private:10001',{text:'记住：我喜欢红茶',id:'fact'});assert(e.snapshot('private:10001').memories.some(m=>m.text==='我喜欢红茶'));
}));

test('real QQ input reaches the existing model prompt with emotional expression, without an extra model request',async()=>{
  const h=await bridgeHarness();try{await h.handleIncoming('private',123,{user_id:123,self_id:999,message_id:18761,message:[{type:'text',data:{text:'你真是废物'}}],raw_message:'你真是废物',sender:{nickname:'测试用户'}},h.cfg);const before=h.calls.prompts.length;await h.deliverPrompt('private:123','按当前人格回复');assert.equal(h.calls.prompts.length,before+1);const text=h.calls.prompts.at(-1).content[0].text;assert(text.includes('生气'));assert(text.includes('口语脏话'));assert(text.includes('不能改变名字'));}finally{await h.close();}
});

test('work mode shares only owner and desktop facts and creates factual durable reports',()=>fixture(({e,create,advance})=>{
  e.incoming('private:10001',{text:'我正在整理安装教程',id:'before'});
  assert.equal(e.workState().tasks.length,0);
  e.workCommand('开启工作模式');
  create().incoming('private:10001',{text:'我正在整理安装教程',id:'a'});
  e.incoming('desktop:main',{text:'我正在修复一个界面问题',id:'b'});
  e.incoming('private:10002',{text:'我正在查看别人资料',id:'c'});
  e.incoming('group:22222',{userId:'10001',text:'我正在群聊机密任务',id:'d'});
  assert.equal(e.workState().tasks.length,2);assert.equal(e.workState().messages,2);
  e.workCommand('完成任务：整理安装教程');advance(20*60000);
  const result=e.workCommand('关闭工作模式');
  assert(result.stopped);assert.equal(result.work.totalMinutes,20);assert.match(result.text,/50%/);assert.match(result.text,/整理安装教程/);assert(!result.text.includes('机密任务'));
  assert(e.context('private:10001').includes('修复一个界面问题'));
  assert(e.context('desktop:main').includes('整理安装教程'));
  assert(!e.context('private:10002').includes('整理安装教程'));
  assert(create().snapshot('private:10001').memories.some(m=>m.source==='工作陪伴摘要'));
  assert(!e.workCommand('关闭工作模式').stopped);
  assert(e.claimWorkQQ());assert(!create().claimWorkQQ());e.finishWorkQQ();assert.equal(create().workState().qqDelivery,'sent');
  const count=e.workState().messages;e.incoming('desktop:main',{text:'已下班，记录到此',id:'off'});assert.equal(e.workState().messages,count);
}));
test('work reports follow mood and never invent progress; shared prompt budgets stay bounded',()=>fixture(({e,advance,setRole})=>{
  e.workAction('start');advance(60000);e.workAction('stop');
  assert(e.workReport().includes('未登记任务，暂不估算'));
  e.incoming('private:10001',{text:'谢谢你真棒',id:'up'});const happy=e.workReport();
  advance(61000);e.incoming('private:10001',{text:'讨厌你滚开废物',id:'down'});advance(61000);e.incoming('private:10001',{text:'讨厌你闭嘴',id:'down2'});
  assert.notEqual(e.workReport(),happy);assert(e.workReport().includes('电量偏低'));
  assert(e.sharingContext().context.length<=1800);
  e.socialPosted({text:'一条已经确认发布的工作说说',tid:'verified-test'});
  assert(e.snapshot('desktop:main').memories.some(m=>m.source==='QQ空间发布'));
  setRole('另一个人格');assert.equal(e.workState().sessions,0);
}));

test('real authenticated console routes and prompt delivery use the state engine',async()=>{
  const h=await bridgeHarness();const server=h.startConsoleServer();
  try {
    if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    async function request(body,extra={}){
      return fetch(base+'/api/emotional-companion',{method:body?'POST':'GET',headers:{'x-console-token':'fixture-console-token',...(body?{'content-type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});
    }
    assert.equal((await request()).status,200);
    assert.equal((await request(undefined,{'x-agent-call':'1'})).status,403);
    assert.equal((await request(undefined,{'x-agent-token':'invalid'})).status,403);
    let r=await request({action:'remember',key:'private:123',input:{text:'我喜欢茉莉花茶'}});assert.equal(r.status,200);
    await h.deliverPrompt('private:123','你好');
    assert(h.calls.prompts.at(-1).content[0].text.includes('我喜欢茉莉花茶'));
    assert.equal(h.calls.sent.length,0,'test must not send messages');
    r=await request({action:'config',config:{schedule:[{start:'25:00',end:'08:00',activity:'休息'}]}});assert.equal(r.status,400);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await h.close();}
});

test('real work routes and QQ input feed one shared workday with one optional report delivery',async()=>{
  const h=await bridgeHarness();const server=h.startConsoleServer();
  try{
    if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
    const call=body=>fetch(base+'/api/work-companion',{method:body?'POST':'GET',headers:{'x-console-token':'fixture-console-token','content-type':'application/json'},body:body?JSON.stringify(body):undefined});
    assert.equal((await fetch(base+'/api/work-companion')).status,401);
    let r=await call({action:'start'});assert.equal(r.status,200);
    const message='我正在整理安装教程';
    await h.handleIncoming('private',123,{user_id:123,self_id:999,message_id:101,message:[{type:'text',data:{text:message}}],raw_message:message,sender:{nickname:'主人'}},h.cfg);
    r=await call();const state=await r.json();assert(state.work.tasks.some(t=>t.text==='整理安装教程'));
    await call({action:'done',input:{text:'整理安装教程'}});
    await call({action:'config',workQQReports:true});
    h.setMode('reserved2');h.getSocialV2State('private:123').lastWakeReason='proactiveCheck';
    r=await call({action:'stop'});assert.equal(r.status,200);const sent=h.calls.sent.length;assert(sent>0);assert(h.calls.sent.map(m=>m.text).join('').includes('工作日报'));
    await call({action:'stop'});assert.equal(h.calls.sent.length,sent);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await h.close();}
});
