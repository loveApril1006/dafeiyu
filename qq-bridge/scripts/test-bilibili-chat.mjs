import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBilibiliChat } from '../src/bilibili-chat.js';
import { biliIncomingIntent, biliOutgoingIntent } from '../src/bilibili-chat-intent.js';
import { createBiliLoginCheck } from '../src/bilibili-chat-login.js';

assert(biliIncomingIntent('你自己去刷b站吧'));
for (const s of ['别去刷B站', '你会不会看B站', '如果让你去刷B站呢', '不要假装去刷B站']) assert.equal(biliIncomingIntent(s), false, s);
assert.deepEqual(biliOutgoingIntent('行，那我刷会儿去，刷到好玩的再来烦你。', { recentRequest: true }), { kind: 'start', rounds: undefined, promisedFeedback: true });
assert.equal(biliOutgoingIntent('我去刷两轮B站，回来跟你说。').rounds, 2);
assert.equal(biliOutgoingIntent('我刚刷到一个好看的B站视频').kind, 'claim');
assert.equal(biliOutgoingIntent('我还没刷呢，刚要去你就来了。', { recentRequest: true }).kind, 'denial');
for (const s of ['我不去刷B站了', '你去刷B站吧', '那你自己去刷B站吧', 'B站这个教程挺好看的', '建议去看看B站教程', '如果我去刷B站呢', '“我去刷B站”是他的原话', '我没说要去刷B站']) assert.equal(biliOutgoingIntent(s), null, s);
for (const s of ['我去刷牙了', '我去看电影了', '我去刷抖音了']) assert.equal(biliOutgoingIntent(s, {recentRequest:true}), null, s);
assert.equal(biliOutgoingIntent('我去跑两轮B站').rounds,2);
assert.equal(biliOutgoingIntent('我刷完两轮B站了').kind,'claim');
assert.equal(biliOutgoingIntent('刚刷完一轮B站').kind,'claim');

const roots = [];
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-chat-test-')); roots.push(root);
  fs.mkdirSync(path.join(root, 'state/bilibili-chat'), { recursive: true });
  fs.writeFileSync(path.join(root, 'state/bilibili-chat/settings.json'), JSON.stringify({ enabled: true, feedbackDelayMinSeconds: 0, feedbackDelayMaxSeconds: 0, ...options.config, revision: 0 }));
  let clock = Date.parse('2026-10-27T04:00:00Z'), permit = true, lease = 0, loggedIn = true, account = 'account-a', starts = 0;
  let state = { ok: true, loggedIn: true, venvReady: true, running: false, finalizing: false,
    config: { enabled: true, perRoundMax: 2, perDayMax: 20 }, pickedToday: 0 };
  let items = [], pending = new Map(), timerId = 0, shares = [], nativeCalls = [];
  const setTimer = (fn, ms) => { const id = ++timerId; pending.set(id, { fn, ms }); return id; };
  const service = createBilibiliChat({ root, now: () => clock, random: () => .2,
    allowed: key => permit && key === 'private:123',
    captureGuard: () => { const captured = lease; return () => { if (!permit || lease !== captured) throw Error('会话已变'); }; },
    login: async () => ({ loggedIn, account, reason: loggedIn ? '' : '请先登录B站' }),
    source: async (method, action) => {
      nativeCalls.push({ method, action });
      if (action === 'status') return structuredClone(state);
      if (action === 'pond') return { items: structuredClone(items) };
      assert.equal(action, 'run'); starts++; state.running = true; state.runStartedAt = new Date(clock).toISOString();
      if(options.beforeRun)await options.beforeRun();
      return { ok: true, started: true };
    }, onFeedback: async (key, job) => shares.push({ key, job }), setTimer, clearTimer: id => pending.delete(id), pollMs: 50,
  });
  const complete = (title = '实际读过的视频', note = '字幕讲了一个开源项目的实现和限制。') => {
    clock += 1000;
    if (title) items.unshift({ bvid: 'BV' + String(items.length + 1).padStart(10, '0'), title, note, ts: clock });
    state.running = false;
  };
  return { root, service, complete, state, pending, shares, nativeCalls,
    get starts() { return starts; }, tick: ms => { clock += ms; },
    permitted: value => { permit = value; }, rotate: () => lease++, login: value => { loggedIn = value; },
    account: value => { account = value; }, items: value => { items = value; },
    async feedback() { for (const [id, t] of [...pending]) if (t.ms === 0) { pending.delete(id); await t.fn(); } },
    async nextRound() { for (const [id, t] of [...pending]) if (t.ms === 3000) { pending.delete(id); t.fn(); await new Promise(r => setImmediate(r)); } },
  };
}
const services = [];
const make = options => { const f = fixture(options); services.push(f.service); return f; };
try {
  const f = make(); f.service.observe('private:123', '你自己去刷b站吧', { isOwner: true });
  await f.service.beforeSend('private:123', '行，那我刷会儿去，刷到好玩的再来烦你。');
  assert.equal(f.starts, 1); assert.equal(f.service.snapshot('private:123').job.state, 'running');
  await f.service.beforeSend('private:123', '我去刷B站。'); assert.equal(f.starts, 1, 'Already running is reused');
  await assert.rejects(f.service.beforeSend('private:123', '还没刷呢，刚要去你就来了。'), /实际B站/);
  assert.match(f.service.context('private:123'), /实际任务运行中/);
  f.complete(); await f.service.poll(); await f.feedback();
  assert.equal(f.shares.length, 1); assert.match(JSON.stringify(f.shares[0].job), /实际读过/);
  assert.match(f.service.context('private:123'), /任务已完成/);
  assert(!f.service.context('private:124').includes('实际读过'));
  await assert.rejects(f.service.start('private:123'), /间隔/);
  assert.equal(f.shares[0].key, 'private:123');
  console.log('PASS natural promise starts real work; repeated promises reuse it; factual progress and source-only feedback stay in the originating chat');

  const multi = make(); await multi.service.start('private:123', 3);
  for (let i = 0; i < 3; i++) { multi.complete(); await multi.service.poll(); if (i < 2) await multi.nextRound(); }
  assert.equal(multi.starts, 3); assert.equal(multi.service.snapshot('private:123').job.finishedRounds, 3);
  await multi.feedback(); assert.equal(multi.shares.length, 1, 'One feedback per batch');
  console.log('PASS assistant chooses 1–3 serial rounds within budgets; one completion share per batch');

  const denied = make(); denied.login(false);
  await assert.rejects(denied.service.beforeSend('private:123', '我去刷B站啦'), /登录/); assert.equal(denied.starts, 0);
  await assert.rejects(denied.service.start('group:456'), /会话/);
  await assert.rejects(denied.service.beforeSend('private:123', '我刚刷到B站一个好看的视频'), /没有本次/);
  const off = make({ config: { enabled: false } });
  await assert.rejects(off.service.start('private:123'), /关闭/); assert.equal(off.nativeCalls.length, 0);
  const disabledMid = make(); await disabledMid.service.start('private:123', 3);
  disabledMid.service.configure({ revision: 0, enabled: false });
  disabledMid.complete(); await disabledMid.service.poll(); await disabledMid.feedback();
  assert.equal(disabledMid.starts, 1); assert.equal(disabledMid.shares.length, 0);
  console.log('PASS missing login, disabled feature and foreign chat cannot start; switch-off cancels continuation/feedback without disturbing an existing native round');
  let releaseRun;const runPending=new Promise(r=>releaseRun=r);const pendingRun=make({beforeRun:()=>runPending});
  const beginning=pendingRun.service.start('private:123');await new Promise(r=>setImmediate(r));pendingRun.service.configure({revision:0,enabled:false});releaseRun();
  await assert.rejects(beginning,/关闭/);assert.equal(pendingRun.service.snapshot('private:123').job.state,'cancelled');assert.equal(pendingRun.pending.size,0);

  for (const invalidation of ['lease', 'permission', 'account']) {
    const g = make(); await g.service.start('private:123'); g.complete(); await g.service.poll();
    if (invalidation === 'lease') g.rotate();
    if (invalidation === 'permission') g.permitted(false);
    if (invalidation === 'account') g.account('new-account');
    await g.feedback(); assert.equal(g.shares.length, 0);
  }
  const empty = make(); await empty.service.start('private:123', 3); empty.complete(''); await empty.service.poll();
  assert.equal(empty.starts, 1); assert.equal(empty.service.snapshot('private:123').job.videos.length, 0); await empty.feedback(); assert.equal(empty.shares.length, 0);
  const stale = make(); stale.items([{ bvid: 'BV0000000001', title: '旧视频', note: '旧内容', ts: 1 }]);
  await stale.service.start('private:123'); stale.complete(''); await stale.service.poll();
  assert.equal(stale.service.snapshot('private:123').job.videos.length, 0);
  console.log('PASS account/session/permission changes suppress stale feedback; empty and old records never fabricate watched content');
  const queuedShare=make();await queuedShare.service.start('private:123');queuedShare.complete();await queuedShare.service.poll();await queuedShare.feedback();
  await queuedShare.service.beforeSend('private:123','这个开源实现有点意思',{feedbackTurn:true});
  queuedShare.login(false);await assert.rejects(queuedShare.service.beforeSend('private:123','这个开源实现有点意思',{feedbackTurn:true}),/退出登录/);
  queuedShare.login(true);queuedShare.service.cancel();await assert.rejects(queuedShare.service.beforeSend('private:123','这个开源实现有点意思',{feedbackTurn:true}),/已取消/);
  const answered=make();answered.service.observe('private:123','你去刷B站吧',{isOwner:true});await answered.service.start('private:123');answered.complete();await answered.service.poll();
  assert(answered.service.modelSnapshot('private:123').job);
  answered.service.noteSent('private:123','我刚刷到一个B站视频，实际读过的视频挺有意思。');await answered.feedback();
  assert.equal(answered.shares.length,0,'An answer already discussing the viewed content cancels the later duplicate');
  assert.equal(answered.service.snapshot('private:123').job.feedbackState,'sent');
  answered.service.observe('private:123','今天吃什么饭',{isOwner:true});
  assert.equal(answered.service.context('private:123'),'');assert.equal(answered.service.modelSnapshot('private:123').job,undefined);

  const limits = make({ config: { dailyRounds: 1 } });
  await assert.rejects(limits.service.start('private:123', 2), /剩余/);
  await limits.service.start('private:123', 1); limits.complete(); await limits.service.poll(); limits.tick(21 * 60000);
  await assert.rejects(limits.service.start('private:123'), /用完/);
  assert.throws(() => limits.service.configure({ revision: 0, maxRounds: 99 }), /范围/);
  assert.throws(() => limits.service.configure({ revision: 99, enabled: false }), /已变化/);
  assert.equal(limits.starts, 1);

  const loginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-chat-login-test-')); roots.push(loginRoot);
  fs.mkdirSync(path.join(loginRoot, 'companion/bili-native-data'), { recursive: true });
  const file = path.join(loginRoot, 'companion/bili-native-data/bili_credential.json'); let http = 0;
  const check = createBiliLoginCheck({ root: loginRoot, fetchImpl: async (url, options) => {
    http++; assert.equal(url, 'https://api.bilibili.com/x/web-interface/nav'); assert.match(options.headers.Cookie, /^SESSDATA=/);
    return Response.json({ code: 0, data: { isLogin: true, mid: 98765, secret: 'never-return' } });
  } });
  assert.equal((await check()).loggedIn, false); assert.equal(http, 0);
  fs.writeFileSync(file, JSON.stringify({ sessdata: 'test-session-only' }));
  const identity = await check(); assert.equal(identity.loggedIn, true); await check(); assert.equal(http, 1);
  assert(!JSON.stringify(identity).includes('test-session-only')); assert(!JSON.stringify(identity).includes('98765'));
  fs.unlinkSync(file); assert.equal((await check()).loggedIn, false);
  console.log('PASS strict authenticated login check, credential-change invalidation, bounded caching, no account secrets or identifiers returned');
} finally {
  for (const service of services) service.close();
  for (const root of roots) { assert(root.startsWith(path.join(os.tmpdir(), 'bili-chat-'))); fs.rmSync(root, { recursive: true, force: true }); }
}
