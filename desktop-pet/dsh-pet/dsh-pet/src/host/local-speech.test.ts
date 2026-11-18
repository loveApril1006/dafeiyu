import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalSpeech, repeatedPhrase } from './local-speech.ts';

function wav() {
  const data = Buffer.alloc(46);
  data.write('RIFF'); data.writeUInt32LE(38, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22); data.writeUInt32LE(32000, 24); data.writeUInt32LE(64000, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(2, 40);
  return data;
}
test('speech opt-in, fixed loopback destination, valid WAV and path boundaries', async () => {
  let calls = 0;
  const root = mkdtempSync(join(tmpdir(), 'dsh-pet-speech-'));
  const speech = createLocalSpeech(root, () => {}, async (url, options) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:17866/synthesize');
    assert.equal(JSON.parse(String(options?.body)).voice, undefined, 'follow the shared service selection');
    return new Response(wav());
  });
  assert.deepEqual(await speech.prepare('你好'), {}); assert.equal(calls, 0);
  speech.configure(true);
  const result = await speech.prepare('你好');
  assert(result.speech); assert.deepEqual(readFileSync(speech.file(result.speech)!), wav());
  assert.equal(speech.status(result.speech)?.status, 'ready');
  assert(speech.report(result.speech, 'playing'));
  assert.equal(speech.status(result.speech)?.status, 'playing');
  assert(!speech.report(result.speech, 'arbitrary'));
  assert(!speech.report('../unknown', 'playing'));
  assert.equal(speech.file('../local-voice.json'), undefined);
  assert.equal(speech.file('00000000-0000-0000-0000-000000000000.wav'), undefined);
  assert.deepEqual(await speech.prepare('长'.repeat(301)), {});
  speech.configure(false); assert.deepEqual(await speech.prepare('停用'), {});
});
test('invalid responses fall back to text and simultaneous synthesis does not pile up', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pet-speech-'));
  let release!: (r: Response) => void;
  const speech = createLocalSpeech(root, () => {}, () => new Promise<Response>((r) => { release = r; }));
  speech.configure(true);
  const first = speech.prepare('第一句');
  await Promise.resolve();
  assert.deepEqual(await speech.prepare('第二句'), {});
  release(new Response('not wav'));
  assert.deepEqual(await first, {});
});
test('foreground speech waits for an in-flight synthesis without being silently dropped', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pet-speech-'));
  let release!: (r: Response) => void;
  let calls = 0;
  const speech = createLocalSpeech(root, () => {}, () => { calls++; return calls === 1 ? new Promise<Response>((r) => { release = r; }) : Promise.resolve(new Response(wav())); });
  speech.configure(true);
  const background = speech.prepare('后台');
  await Promise.resolve();
  const foreground = speech.prepare('用户回复', true);
  assert.equal(calls, 1);
  release(new Response(wav()));
  assert((await background).speech);
  assert((await foreground).speech);
  assert.equal(calls, 2);
});
test('muttering detects repetitions while allowing new topics', () => {
  assert(repeatedPhrase('哼，才没有等你呢！', ['哼才没有等你呢']));
  assert(repeatedPhrase('今天也想吃一碗热乎乎的面呀', ['今天也想吃一碗热乎乎的面呢']));
  assert(!repeatedPhrase('窗边的光刚好落在桌上', ['今天想吃面']));
});
test('voice choices are validated and later speech follows the shared default', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pet-voices-'));
  const voices = { 'hutao-playful': '胡桃', 'keqing-tsundere': '刻晴', 'klee-cute': '可莉', 'furina-proud': '芙宁娜' };
  let selected = 'hutao-playful', updates = 0, spoken = '';
  const speech = createLocalSpeech(root, () => {}, async (url, options) => {
    if (url.endsWith('/voices')) return Response.json({ selected, voices });
    if (url.endsWith('/voice')) { selected = JSON.parse(String(options?.body)).voice; updates++; return Response.json({ ok: true }); }
    assert.equal(JSON.parse(String(options?.body)).voice, undefined);
    spoken = selected; return new Response(wav());
  });
  assert.equal((await speech.voices()).voices.length, 4);
  await assert.rejects(speech.selectVoice('../file'), /请选择/); assert.equal(updates, 0);
  for (const voice of Object.keys(voices)) assert.equal((await speech.selectVoice(voice)).selected, voice);
  speech.configure(true); assert((await speech.prepare('你好')).speech); assert.equal(spoken, 'furina-proud');
  assert.equal(updates, 4);
});
