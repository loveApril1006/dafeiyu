import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {createConversationMemory}from'../src/conversation-memory.js';
import {cleanText,byteChunks,summaryRecords,overflowFailure}from'../plugins/qq-agent-presets/context-policy.mjs';
import {bridgeHarness}from'./audit-bridge-harness.mjs';
const lab=fs.mkdtempSync(path.join(process.env.TEMP||process.cwd(),'context-test-'));
const dbfile=path.join(lab,'history.sqlite');let memory=createConversationMemory(dbfile);
memory.append('group:123',{messageId:'m1',sender:'小明',userId:'456',time:1,text:'我喜欢喝乌龙茶，不喜欢咖啡。'});
memory.append('group:999',{messageId:'m2',sender:'另一群',time:2,text:'乌龙茶是另一个群的秘密。'});
memory.append('private:123',{messageId:'m3',sender:'私聊',time:3,text:'私聊乌龙茶偏好不允许进入群。'});
memory.append('group:123',{messageId:'m1',sender:'小明',userId:'456',time:4,text:'我喜欢喝乌龙茶，不喜欢咖啡。'});
assert.equal(memory.stats().messages,3);let rows=memory.recall('group:123','还记得乌龙茶吗');assert.equal(rows.length,1);assert.equal(rows[0].messageId,'m1');assert.equal(rows[0].userId,'456');assert(!rows.some(r=>r.sender==='私聊'||r.sender==='另一群'));
memory.close();memory=createConversationMemory(dbfile);assert.equal(memory.recall('group:123','乌龙茶')[0].text,'我喜欢喝乌龙茶，不喜欢咖啡。');
memory.append('group:123',{messageId:'old',sender:'小明',time:5,text:'约定周六喝红茶'});
for(let i=0;i<1100;i++)memory.append('group:123',{messageId:'noise-'+i,time:10+i,text:'无关的日常讨论'+i});
assert.equal(memory.recall('group:123','红茶')[0].messageId,'old','two-character Chinese evidence remains searchable beyond the recent slice');
memory.close();
const raw='前缀🙂'.repeat(30000);const chunks=byteChunks([raw],15000);assert(chunks.every(c=>Buffer.byteLength(c)<=15000));assert.equal(chunks.join(''),raw+'\n');assert(!cleanText('data:image/png;base64,'+'A'.repeat(100000)).includes('A'.repeat(1000)));assert(overflowFailure({message:"This model's maximum context length is 1048576 tokens"}));assert(!overflowFailure({message:'Rate limit exceeded'}));
assert(summaryRecords([{role:'tool',content:[{type:'image',data:'A'.repeat(10000)}]}])[0].includes('历史图片'));
const h=await bridgeHarness({files:{'state/current-role.json':{role:'青柚',mode:'active'},'roles/青柚.md':'你叫青柚，偏好和关系按用户当前明确设定。','state/social-v2.json':{paused:false,conversations:{'private:123':{recentMessages:[{messageId:'cached',sender:'管理员',time:1,text:'我喜欢乌龙茶',plain:'我喜欢乌龙茶'}]}}}},config:{socialV2:{proactive:{enabled:false},sticker:{enabled:false},wake:{defaultMode:'active',lockMode:'active',replyEveryMessageWhenActive:true,maxWakePerMinute:0,maxWakePerHour:0}}}});
let server;
try{
 h.setMode('reserved2');const key='private:123',st=h.getSocialV2State(key);st.activeTopics=[{text:'周末去杭州',lastMentionAt:Date.now()}];st.memberImpressions={'QQ100001':{traits:['喜欢乌龙茶']}};st.wakeConfig.batchWindowMs=3600000;
 h.appendSocialV2Message(key,'管理员','周末杭州怎么安排','周末杭州怎么安排',false,true,'real-msg',[],'123');
 const sid=await h.ensureSession(key),oldToken=st.agentToken;h.setReady(false);
 server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
 const req=(route,token)=>new Promise((resolve,reject)=>{const r=http.get({hostname:'127.0.0.1',port:server.address().port,path:route,headers:{'x-console-token':'fixture-console-token',...(token?{'x-agent-token':token}:{})}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(body)}));});r.on('error',reject);});
 let r=await req('/api/socialV2/memory?key='+key+'&q='+encodeURIComponent('乌龙茶'),oldToken);assert.equal(r.status,200);assert.equal(r.data.history[0].messageId,'cached','pre-update persisted previews are indexed after loading');
 r=await req('/api/socialV2/memory?key='+key+'&q='+encodeURIComponent('杭州'),oldToken);assert.equal(r.status,200);assert.equal(r.data.history[0].messageId,'real-msg');
 assert.equal((await req('/api/socialV2/memory?key=group:456&q='+encodeURIComponent('杭州'),oldToken)).status,403,'token cannot recall another channel');
 assert.equal(await h.recoverContextOverflow(key,sid,{code:'CONTEXT_WINDOW_EXCEEDED'}),true);assert.notEqual(h.state.sessions[key],sid);assert(h.calls.archived.includes(sid));assert.equal(st.activeTopics[0].text,'周末去杭州');assert.equal(st.memberImpressions.QQ100001.traits[0],'喜欢乌龙茶');assert.equal(st.unread[0].messageId,'real-msg');assert.equal(st.unread[0].requiresReply,true);assert.notEqual(st.agentToken,oldToken);assert.equal(h.calls.created[0].workspaceId,h.calls.created[1].workspaceId);
 assert.equal((await req('/api/socialV2/memory?key='+key+'&q='+encodeURIComponent('杭州'),oldToken)).status,403,'retired agent loses tool access');
 h.setReady(true);await h.deliverPrompt(key,'请继续未完成的问题');assert.match(h.calls.prompts.at(-1).content[0].text,/会话连续性笔记/);assert.match(h.calls.prompts.at(-1).content[0].text,/周末去杭州/);assert.match(h.calls.prompts.at(-1).content[0].text,/你叫青柚/);
 await h.deliverPrompt(key,'继续');assert.doesNotMatch(h.calls.prompts.at(-1).content[0].text,/【会话连续性笔记】/,'handover only once per new session');
 assert.equal(await h.recoverContextOverflow(key,sid,{code:'CONTEXT_WINDOW_EXCEEDED'}),false,'duplicate old failure cannot restart a healthy session');
 h.setReady(false);await h.recoverContextOverflow(key,h.state.sessions[key],{code:'CONTEXT_WINDOW_EXCEEDED'});const id=h.state.sessions[key];assert.equal(await h.recoverContextOverflow(key,id,{code:'CONTEXT_WINDOW_EXCEEDED'}),false,'bounded recovery prevents unbounded billed loops');
 assert.equal(h.calls.sent.length,0);console.log('PASS SQLite persistence/deduplication/scoped recall, Unicode budgets and media projection, authenticated retrieval, original memory and pending replies retained, same workspace, old-token invalidation, one-time handover and bounded automatic overflow recovery; no QQ sends.');
}finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await h.close();fs.rmSync(lab,{recursive:true,force:true});}
const plain=await bridgeHarness();
try{plain.setMode('chat');const key='private:123',id=await plain.ensureSession(key);plain.setReady(false);assert.equal(await plain.recoverContextOverflow(key,id,{code:'CONTEXT_WINDOW_EXCEEDED'}),true);assert.equal(plain.socialV2.conversations.size,0,'chat recovery must not create reserved2 state');assert.equal(plain.calls.created[0].workspaceId,plain.calls.created[1].workspaceId);}finally{await plain.close();}
