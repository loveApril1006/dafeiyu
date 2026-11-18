import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {createQzoneCore} from '../src/qzone/core.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qzone-core-'));let clock=Date.UTC(2026,0,1,2),models=0,images=0,posts=[],mode='normal',imageReady=false;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2TnYQAAAAASUVORK5CYII=','base64');
const dependencies={root,harden:false,now:()=>clock,checkImage:()=>{if(!imageReady)throw Error('生图尚未配置');},checkPublisher:async()=>{},
 model:async(_prompt,{signal})=>{models++;if(mode==='slow')await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));return JSON.stringify({text:'想给今天留一点轻松的小空白，第'+models+'个小愿望。',imagePrompt:'温暖的小鸽子和窗边的阳光'});},
 getReadyImage:()=>{images++;if(mode==='image-fail')throw Error('fixture image failure');return imageReady?png:null;},
 publish:async(value)=>{posts.push(value);if(mode==='uncertain')throw Object.assign(Error('fixture lost response'),{uncertain:true});return {tid:'fixture-'+posts.length};}};
let core=createQzoneCore(dependencies);const config=patch=>core.configure({revision:core.status().config.revision,...patch});
try{
 await core.tick();await assert.rejects(()=>core.generate(),/已关闭/);assert.equal(models,0);assert.equal(images,0);assert.equal(posts.length,0);
 await config({enabled:true,autoWrite:true,autoPublish:true,withImages:true,dailyGenerations:20,dailyPublishes:20,minGapHours:1});
 await core.generate({preview:true});assert.equal(models,1);assert.equal(core.status().posts[0].imageUrl,undefined);assert.match(core.status().posts[0].imageDecision,/不等待生图/);
 imageReady=true;mode='image-fail';await core.generate({preview:true});assert.equal(posts.length,0);assert.equal(core.status().posts[0].state,'draft');assert.match(core.status().posts[0].imageDecision,/纯文字/);
 mode='normal';await core.generate({preview:true});const draft=core.status().posts[0];assert.equal(draft.state,'draft');assert(draft.imageUrl);assert.equal(posts.length,0);assert(fs.existsSync(core.image(draft.id).file));
 await core.publishDraft(draft.id);assert.equal(posts.length,1);assert.equal(posts[0].visibility,4);assert(posts[0].imageFile.startsWith(root));assert.equal(core.status().posts[0].state,'published');await assert.rejects(()=>core.publishDraft(draft.id),/不会重发/);
 const before=models;await assert.rejects(()=>core.generate(),/最短间隔/);assert.equal(models,before);
 clock+=3600000;mode='uncertain';await assert.rejects(()=>core.generate(),/lost response/);const uncertain=core.status().posts[0];assert.equal(uncertain.state,'uncertain');await assert.rejects(()=>core.publishDraft(uncertain.id),/不会重发/);
 await core.close();core=createQzoneCore(dependencies);assert.equal(core.status().posts[0].state,'uncertain');assert.equal(core.status().budget.published,2);
 clock+=3600000;await config({dailyGenerations:core.status().budget.generated});const limited=models;await assert.rejects(()=>core.generate({preview:true}),/今日写稿/);assert.equal(models,limited);
 await config({dailyGenerations:20,withImages:false,autoPublish:false});mode='slow';const slow=core.generate();slow.catch(()=>{});for(let i=0;i<30&&core.status().active?.stage!=='writing';i++)await new Promise(r=>setTimeout(r,2));await Promise.resolve();
 await assert.rejects(()=>core.generate(),/正在运行/);await config({enabled:false});await assert.rejects(()=>slow,/取消/);assert.equal(core.status().posts[0].state,'interrupted');assert.equal(posts.length,2);
 mode='normal';await config({enabled:true,scheduled:true,intervalHours:2});const scheduled=models;clock+=2*3600000;await core.tick();assert.equal(models,scheduled+1);assert.equal(core.status().posts[0].state,'draft');await core.tick();assert.equal(models,scheduled+1);
 clock=Date.UTC(2026,0,1,15);await core.tick();assert.equal(models,scheduled+1);await core.stop();assert.equal(core.status().config.enabled,false);assert.equal(core.status().nextAt,0);
 console.log('PASS Qzone: off means no work; optional ready image and text fallback; preview; single publication; quota/gap; cancellation; schedule/window; durable uncertain-send suppression');
}finally{await core.close();assert(root.startsWith(path.join(os.tmpdir(),'qzone-core-')));fs.rmSync(root,{recursive:true,force:true});}

const h=await bridgeHarness(),server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,headers={'X-Console-Token':'fixture-console-token','content-type':'application/json'};
async function call(route,body,extra={}){return fetch(base+route,{headers:{...headers,...extra},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});}
try{
 assert.equal((await fetch(base+'/api/qzone/status')).status,401);assert.equal((await call('/api/qzone/status',undefined,{'x-agent-call':'1'})).status,403);
 assert.equal((await call('/api/qzone/config',{revision:0,enabled:true},{origin:'https://evil.example'})).status,403);
 const response=await call('/api/qzone/status');assert.equal(response.status,200);const state=await response.json();assert.equal(state.config.enabled,false);
 const changed=await call('/api/qzone/config',{revision:0,enabled:true,autoWrite:true,withImages:true});assert.equal(changed.status,200);
 const run=await call('/api/qzone/run',{preview:true});assert.equal(run.status,400);assert.match((await run.json()).error,/Fixture model/);assert.equal(h.calls.prompts.length,0);assert.equal(h.calls.sent.length,0);
 assert.equal((await call('/api/qzone/config',{revision:0,enabled:false})).status,409);assert.equal((await call('/api/qzone/stop',{})).status,200);
 console.log('PASS real bridge Qzone HTTP: authentication, Host/Origin and agent boundaries, revisions and missing-image text fallback; no live models or publications');
}finally{await new Promise(r=>server.close(r));await h.close();}

const linkedRoot=fs.mkdtempSync(path.join(os.tmpdir(),'qzone-linked-'));let linkedTime=Date.UTC(2026,9,26,2),chance=0.99,linkedModels=0,linkedImages=0,linkedPosts=0,remembered=[];
const companion={available:true,allowed:false,reason:'免打扰时段',probability:0.5,version:'today-v1',context:'主人今天在整理安装教程，心情平静',workReport:null};
const linked=createQzoneCore({root:linkedRoot,harden:false,now:()=>linkedTime,random:()=>chance,getCompanion:()=>companion,
 model:async prompt=>{linkedModels++;assert(prompt.includes(companion.context));return JSON.stringify({text:'今天陪主人整理教程，小鱼也认真营业了一会儿。',imagePrompt:'小鱼和工作笔记'});},
 getReadyImage:()=>{linkedImages++;return png;},checkImage:()=>{},checkPublisher:async()=>{},publish:async()=>({tid:'verified-'+(++linkedPosts)}),onPublished:value=>remembered.push(value)});
const configureLinked=patch=>linked.configure({revision:linked.status().config.revision,...patch});
try{
 await configureLinked({enabled:true,autoWrite:true,autoPublish:true,withImages:true,scheduled:true,linkCompanion:true,publishMode:'mood',intervalHours:1,minGapHours:1,dailyGenerations:20,dailyPublishes:20,startHour:0,endHour:24});
 linkedTime+=3600000;await linked.tick();assert.equal(linkedModels,0);assert.equal(linkedImages,0);assert.match(linked.status().lastDecision,/免打扰/);
 companion.allowed=true;linkedTime+=3600000;await linked.tick();assert.equal(linkedModels,0);assert.equal(linked.status().budget.generated,0);
 chance=0;linkedTime+=3600000;await linked.tick();assert.equal(linkedModels,1);assert.equal(linkedImages,1);assert.equal(linkedPosts,1);assert.equal(remembered.length,1);
 linkedTime+=3600000;await linked.tick();assert.equal(linkedModels,1);assert.match(linked.status().lastDecision,/没有新的陪伴内容/);
 companion.workReport={id:'work-day-1',text:'🐟 大肥鱼の工作日报 🐟\n今天完成整理安装教程，进度100%，今天很开心。',imagePrompt:'可爱的小鱼与笔记，无文字'};
 await configureLinked({workReports:true});linked.wakeForWorkReport();linkedTime+=1001;await linked.tick();
 assert.equal(linkedModels,1,'local work report must not call a writing model');assert.equal(linkedImages,2);assert.equal(linkedPosts,2);assert.equal(remembered.length,2);assert.equal(linked.status().posts[0].kind,'work-report');
 await assert.rejects(()=>linked.generate({report:true,preview:true}),/不会重复生成/);
 linkedTime+=3600000;await linked.tick();assert.equal(linkedPosts,2);assert.equal(linkedModels,1);
 await linked.stop();linkedTime+=3600000;await linked.tick();assert.equal(linkedPosts,2);
 console.log('PASS linked Qzone: quiet/mood/unchanged context cost zero; one writing call and one image; factual local work report uses no writing tokens; no duplicate report or publication; only confirmed posts become memories');
}finally{await linked.close();assert(linkedRoot.startsWith(path.join(os.tmpdir(),'qzone-linked-')));fs.rmSync(linkedRoot,{recursive:true,force:true});}
