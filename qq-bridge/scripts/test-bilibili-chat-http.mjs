import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bridgeHarness } from './audit-bridge-harness.mjs';
import { createBilibiliChat } from '../src/bilibili-chat.js';
let service, starts = 0, loggedIn = true, running = false, items = [], feedback, sharedStarts = [], sharedResult;
const settings = { enabled: true, feedbackDelayMinSeconds: 0, feedbackDelayMaxSeconds: 0, revision: 0 };
const h = await bridgeHarness({ files: {
  'state/bilibili-chat/settings.json': JSON.stringify(settings),
  'public/bilibili-chat.html': fs.readFileSync('public/bilibili-chat.html', 'utf8'),
  'state/current-role.json': {role:'角色卡甲',mode:'active'},
  'roles/角色卡甲.md': '# 当前身份\n你叫甲，自称甲，说话简练克制。',
  'roles/角色卡乙.md': '# 当前身份\n你叫乙，自称乙，用温和耐心的语气交流。',
},config:{socialV2:{voice:{enabled:true},tools:{sendVoice:true}}}, globals: {
  synthesizeGptSovits:async(_text,{dir})=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/bili-preview-fixture.wav',Buffer.alloc(32044));return 'bili-preview-fixture.wav';},
  inspectAudio:async()=>({ok:true,duration:1,size:32044,codec:'pcm_s16le',sampleRate:16000,channels:1}),
  createBilibiliChat: options => {
  service = createBilibiliChat({ ...options, random: () => .2,
    resolveVideo: async () => ({bvid:'BV1234567891',page:1,url:'https://www.bilibili.com/video/BV1234567891'}),
    login: async () => ({ loggedIn, account: 'fixture-account', reason: loggedIn ? '' : '请先登录B站' }),
    source: async (method, action, body) => {
      if (action === 'status') return { ok: true, loggedIn, venvReady: true, running, config: { enabled: true }, runStartedAt: running ? new Date().toISOString() : null };
      if (action === 'pond') return { ok: true, items };
      if (action === 'watch') { sharedStarts.push(body); running=true; return {ok:true,started:true}; }
      if (action.startsWith('shared/status?')) return sharedResult || {ok:true,state:'reading',reason:'正在读取指定视频'};
      assert.equal(action, 'run'); starts++; running = true; return { ok: true, started: true };
    }, setTimer: (fn, ms) => { if (ms === 0 || ms === 1000) feedback = fn; return { unref() {} }; }, clearTimer() {},
  }); return service;
} } });
let server;
try {
  h.setMode('reserved2');
  const st = h.getSocialV2State('private:123');
  service = h.biliChat();
  service.observe('private:123', '你自己去刷b站吧', { isOwner: true });
  server = h.startConsoleServer();
  if (!server.listening) await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const admin = { 'X-Console-Token': 'fixture-console-token' };
  const post = (route, value, headers = {}) => fetch(base + route, { method: 'POST', headers: {
    ...admin, 'content-type': 'application/json', ...headers,
  }, body: JSON.stringify(value) });
  assert.equal((await fetch(base + '/api/bilibili-chat/status')).status, 401);
  assert.equal((await fetch(base + '/api/bilibili-chat/status', { headers: { ...admin, 'x-agent-call': '1', 'x-agent-token': st.agentToken } })).status, 403);
  assert.equal((await post('/api/bilibili-chat/config', { revision: 0, enabled: false }, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await post('/api/bilibili-chat/config', { revision: 99, enabled: false })).status, 409);
  const page = await fetch(base + '/bilibili-chat/', { headers: admin }); assert.equal(page.status, 200);
  assert.match(await page.text(), /B站聊天联动/);
  assert.match(page.headers.get('content-security-policy'), /default-src/);
  assert.equal(page.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'self'/);
  const preview=await post('/api/socialV2/send-voice',{key:'private:123',token:st.agentToken,voice:'tts:我去刷B站啦',dryRun:true},{'x-agent-call':'1','x-agent-token':st.agentToken});
  assert.equal(preview.status,200);assert.equal(starts,0,'TTS preview cannot start a real browsing task');
  await h.sendToQQ('private:123', '行，那我刷会儿去，刷到好玩的再来烦你。');
  assert.equal(starts, 1); assert.equal(h.calls.sent.length, 1);
  const prompt = await fetch(base + '/api/socialV2/prompt?key=private:123', { headers: { ...admin, 'x-agent-call': '1', 'x-agent-token': st.agentToken } }).then(r => r.json());
  assert.equal(prompt.bilibili.job.state, 'running');
  assert.equal(prompt.bilibili.job.key, undefined);
  const recent=await fetch(base+'/api/socialV2/recent?key=private:123',{headers:{...admin,'x-agent-call':'1','x-agent-token':st.agentToken}}).then(r=>r.json());
  assert.equal(recent.bilibili.job.state,'running','Reading a message also exposes current browsing progress');
  const denial = await post('/api/socialV2/send-message', { key: 'private:123', token: st.agentToken, messages: ['还没刷呢，刚要去你就来了。'] }, { 'x-agent-call': '1', 'x-agent-token': st.agentToken });
  assert(!denial.ok, 'Contradictory reply is not sent'); assert.match((await denial.json()).error, /实际B站/);
  assert.equal(h.calls.sent.length, 1);
  running = false; items = [{ bvid: 'BV1234567890', title: '实际字幕中的开源项目', note: '作者对比了两个实现的资源占用。', ts: Date.now() }];
  await service.poll(); assert(feedback);
  st.busy = false;
  await feedback();
  assert.match(service.context('private:123'), /实际字幕中的开源项目/);
  const wake = h.buildWakePromptV2('private:123', 'bilibiliDone'); assert.match(wake, /B站浏览完成/);
  assert(!service.context('group:456').includes('实际字幕'));
  const changed = await post('/api/bilibili-chat/config', { revision: 0, feedbackEnabled: false });
  assert.equal(changed.status, 200); const saved = await changed.json(); assert.equal(saved.config.maxRounds, 3); assert.equal(saved.config.feedbackEnabled, false);
  const callsBefore = h.calls.prompts.length;
  await h.sendWakePromptV2('private:123', 'bilibiliDone'); assert.equal(h.calls.prompts.length, callsBefore);
  const event={user_id:123,self_id:999,message_id:1001,message:[{type:'json',data:{data:JSON.stringify({meta:{detail_1:{qqdocurl:'https://b23.tv/fixture'}}})}}]};
  await h.handleIncoming('private',123,event,h.cfg);
  for(let i=0;i<20&&!sharedStarts.length;i++)await new Promise(r=>setImmediate(r));
  assert.equal(sharedStarts.length,1,'incoming QQ card actually starts exact video');assert.equal(starts,1);
  assert.equal(sharedStarts[0].bvid,'BV1234567891');
  let sharedPrompt=await fetch(base+'/api/socialV2/prompt?key=private:123',{headers:{...admin,'x-agent-call':'1','x-agent-token':st.agentToken}}).then(r=>r.json());
  assert.equal(sharedPrompt.bilibili.job.kind,'shared');assert.equal(sharedPrompt.bilibili.job.target.bvid,'BV1234567891');
  assert.equal(sharedPrompt.bilibili.job.chat.askedProgress,false);assert.equal(sharedPrompt.bilibili.job.reason,undefined);
  assert(sharedPrompt.bilibili.job.chat.replyGuide);
  assert.equal(sharedPrompt.role.sourceName,'角色卡甲');assert.match(sharedPrompt.role.hint,/你叫甲/);
  fs.writeFileSync(h.temp+'/state/current-role.json',JSON.stringify({role:'角色卡乙',mode:'active'}));
  sharedResult={ok:true,state:'done',reason:'已保存分享视频',result:{taskId:sharedStarts[0].id,bvid:'BV1234567891',page:1,title:'真实分享视频',summary:'字幕里实际谈到的技术。',hasTranscript:true,sampled:true,scope:'字幕采样',historySaved:true,memorySaved:true}};running=false;
  await service.poll();st.busy=false;await feedback();
  assert.match(h.buildWakePromptV2('private:123','bilibiliDone'),/分享视频任务已收尾/);
  assert.match(h.buildWakePromptV2('private:123','bilibiliDone'),/人格与角色/);
  assert.match(h.buildWakePromptV2('private:123','bilibiliDone'),/角色卡乙/);
  sharedPrompt=await fetch(base+'/api/socialV2/prompt?key=private:123',{headers:{...admin,'x-agent-call':'1','x-agent-token':st.agentToken}}).then(r=>r.json());
  assert.equal(sharedPrompt.bilibili.job.read.memorySaved,true);assert.equal(sharedPrompt.bilibili.job.read.historySaved,true);
  assert.equal(sharedPrompt.role.sourceName,'角色卡乙');assert.match(sharedPrompt.role.hint,/你叫乙/);assert(!sharedPrompt.role.hint.includes('你叫甲'));
  assert.equal((await post('/api/bilibili-chat/config',{revision:1,sharedVideoReplyEnabled:false})).status,200);
  const beforeCancel=h.calls.prompts.length;await h.sendWakePromptV2('private:123','bilibiliDone');assert.equal(h.calls.prompts.length,beforeCancel);
  console.log('PASS incoming QQ share-card -> native exact-BV task -> verified result/history/memory -> original-chat wake; independent reply switch cancels queued generation, native/model/QQ peers mocked');
  console.log('PASS real bridge linkage: console/auth/Origin/agent/revision guards, actual send preflight, truthful progress API, contradictory reply blocked, source-only wake and disable-before-wake. All native/model/QQ peers mocked.');
} finally {
  if (server) await new Promise(r => server.close(r));
  await h.close();
}
