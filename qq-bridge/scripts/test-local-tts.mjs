import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { synthesizeGptSovits } from '../src/local-tts.js';
import { bridgeHarness } from './audit-bridge-harness.mjs';

const wav = Buffer.alloc(32044);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(32000, 40);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-local-tts-'));
let requests = 0;
try {
  const name = await synthesizeGptSovits('哼，今天也要开心。', { dir: tmp, voice: 'hutao-playful', fetchImpl: async (url, options) => {
    requests++;
    assert.equal(url, 'http://127.0.0.1:17866/synthesize');
    assert.equal(JSON.parse(options.body).voice, 'hutao-playful');
    return new Response(wav, { headers: { 'content-type': 'audio/wav' } });
  }});
  assert.deepEqual(fs.readFileSync(path.join(tmp, name)), wav);
  await synthesizeGptSovits('字'.repeat(301), { dir: tmp, fetchImpl: async (_url, options) => {
    requests++;
    assert.equal(JSON.parse(options.body).voice, undefined, 'Unspecified voice follows the saved service selection');
    return new Response(wav);
  }});
  await assert.rejects(synthesizeGptSovits('', { dir: tmp }), /1～500/);
  await assert.rejects(synthesizeGptSovits('字'.repeat(501), { dir: tmp }), /1～500/);
  await assert.rejects(synthesizeGptSovits('你好', { dir: tmp, fetchImpl: async () => new Response('bad') }), /WAV/);
  await assert.rejects(synthesizeGptSovits('你好', { dir: tmp, fetchImpl: async () => new Response('down', { status: 503 }) }), /503/);
  assert.equal(requests, 2);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

let synthCalls = 0;
const h = await bridgeHarness({ config: {
  petFeed: { enabled: false },
  socialV2: { voice: { enabled: true }, tools: { sendVoice: true } }
}, globals: {
  synthesizeGptSovits: async (text, { dir }) => {
    synthCalls++; fs.mkdirSync(dir, { recursive: true });
    const name = 'tts-fixture.wav'; fs.writeFileSync(path.join(dir, name), wav); return name;
  },
  inspectAudio: async () => ({ ok: true, duration: 1, size: wav.length, codec: 'pcm_s16le', sampleRate: 16000, channels: 1 })
}});
try {
  h.setMode('reserved2');
  const file = await h.synthesizeVoiceFile('胡桃说一句。');
  assert.equal(file, 'tts-fixture.wav');
  await assert.rejects(h.synthesizeVoiceFile('password=very-secret-value'), /凭据/);
  await assert.rejects(h.synthesizeVoiceFile('字'.repeat(501)), /1～500/);
  const state = h.getSocialV2State('private:123');
  await assert.rejects(h.synthesizeVoiceFile(state.agentToken), /凭据/);
  assert.equal(synthCalls, 1, 'Rejected text must never reach the speech model');
  const prompt = h.buildWakePromptV2('private:123', 'bootstrap');
  assert.match(prompt, /qq_send_voice/); assert.match(prompt, /tts:/);
  await h.handleIncoming('private', 123, { user_id: 123, self_id: 999, message_id: 100,
    message: [{ type: 'text', data: { text: '#语音 哼，听到我说话了吗。' } }] }, h.cfg);
  assert.equal(synthCalls, 2, 'Owner voice command must use the new speech model');
  const server = h.startConsoleServer();
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body, extra = {}) => fetch(base + url, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-console-token': 'fixture-console-token', ...extra
    }, body: JSON.stringify(body) });
    const unauthorized = await fetch(base + '/api/voice/synthesize', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '你好' }) });
    assert.equal(unauthorized.status, 401);
    const preview = await post('/api/voice/synthesize', { text: '本地合成检查' });
    assert.equal((await preview.json()).sent, false);
    const before = synthCalls;
    const badToken = await post('/api/socialV2/send-voice', { key: 'private:123', token: 'invalid', voice: 'tts:你好', dryRun: true });
    assert.equal(badToken.status, 403); assert.equal(synthCalls, before);
    const response = await post('/api/socialV2/send-voice', { key: 'private:123', token: state.agentToken, voice: 'tts:你好', dryRun: true });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result)); assert.equal(result.dryRun, true);
    assert.equal(synthCalls, before + 1);
    const feed = await fetch(base + '/api/pet/feed', { headers: { 'x-console-token': 'fixture-console-token' } });
    assert.equal(feed.status, 404, 'Legacy desktop feed endpoint must be removed');
  } finally { await new Promise((resolve) => server.close(resolve)); }
  console.log('PASS: Hu Tao synthesis, WAV validation, text auditing, QQ command, removed desktop feed, AI voice instructions. No real QQ message sent.');
} finally { await h.close(); }
