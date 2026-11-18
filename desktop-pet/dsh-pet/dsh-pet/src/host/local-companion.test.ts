import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createScreenCompanion, petName, generateScreenComment } from './local-companion.ts';
import { renamePet } from './local-name.ts';

const image = 'data:image/png;base64,aGVsbG8=';
const model = { provider: 'test', model: 'vision' };
const root = () => mkdtempSync(join(tmpdir(), 'pet-companion-'));
test('rename preserves other pets, ids, custom settings and replaces old persona name', async () => {
  const dir = root(), userFile = join(dir, 'main.json'), defaultFile = join(dir, 'default.json');
  const a = { id: 'main', name: '小鸽子', size: 360, display: 'desktop', balanceEnabled: false, position: { corner: 'bottom-right', marginX: 24, marginY: 24 }, whisperPrompt: '你是小鸽子，嘴硬心软。' };
  const b = { ...a, id: 'other', name: '另一只' };
  const data = { pets: [a, b], customSetting: { keep: true }, chatMemoryRounds: 12, whisperPrompt: '共享人设：小鸽子' };
  writeFileSync(defaultFile, JSON.stringify(data)); writeFileSync(userFile, JSON.stringify(data));
  const paths = { defaultFile, userFile, petDir: join(dir, 'pet') }; mkdirSync(paths.petDir);
  assert.equal(await renamePet(paths, 'main', '  阿璃  '), '阿璃');
  const result = JSON.parse(readFileSync(userFile, 'utf8'));
  assert.deepEqual(result.customSetting, data.customSetting); assert.equal(result.chatMemoryRounds, 12);
  for (const [key, value] of Object.entries(b)) assert.deepEqual(result.pets[1][key], value);
  assert.equal(result.pets[0].id, 'main');
  assert.equal(result.pets[0].name, '阿璃'); assert.equal(result.pets[0].whisperPrompt, '你是阿璃，嘴硬心软。');
  await assert.rejects(renamePet(paths, 'main', '\n'), /名字/);
  await assert.rejects(renamePet(paths, 'missing', '新名'), /没有找到/);
});
test('names accept Chinese/emoji and reject controls/oversized inputs', () => {
  assert.equal(petName(' 小猫🐱 '), '小猫🐱');
  for (const value of ['', 'a\nb', 'a'.repeat(25), null]) assert.throws(() => petName(value));
});

test('off never analyzes screenshots; quiet windows, cooldown and duplicate replies suppress interruptions', async () => {
  const dir = root(), screen = createScreenCompanion(dir);
  let calls = 0, delivered = 0, clock = 100_000, foreground = false;
  const options = { now: () => clock, foreground: () => foreground, generate: async () => { calls++; return '这关有点难呀。'; }, voice: async () => ({}), deliver: () => { delivered++; } };
  screen.observe('one');
  assert.equal((await screen.comment({ image, scene: 'one' }, options)).skipped, 'disabled');
  assert.equal(calls, 0);
  screen.configure({ enabled: true, interval: 45, model }); foreground = true;
  assert.equal((await screen.comment({ image, scene: 'one' }, options)).skipped, 'quiet'); foreground = false;
  assert.equal((await screen.comment({ image, scene: 'one' }, options)).text, '这关有点难呀。');
  assert.equal((await screen.comment({ image, scene: 'one' }, options)).skipped, 'quiet');
  clock += 46_000;
  assert.equal((await screen.comment({ image, scene: 'one' }, options)).skipped, 'repeated');
  assert.equal(delivered, 1); assert.equal(calls, 2);
  assert.deepEqual(readdirSync(dir), ['screen-companion.json']);
  assert(!readFileSync(join(dir, 'screen-companion.json'), 'utf8').includes('aGVsbG8'));
});
test('turning off or changing the scene cancels an in-flight comment before caption/voice delivery', async () => {
  for (const stage of ['generate', 'voice']) {
    const screen = createScreenCompanion(root()); screen.configure({ enabled: true, interval: 20, model }); screen.observe('a');
    let release!: () => void, delivered = 0, voiceCalls = 0;
    const waiting = new Promise<void>(r => { release = r; });
    const job = screen.comment({ image, scene: 'a' }, {
      foreground: () => false,
      generate: async (_image, _model, _recent, signal) => { if (stage === 'generate') await waiting; if (signal.aborted) throw new Error('aborted'); return '一起看电影～'; },
      voice: async () => { voiceCalls++; if (stage === 'voice') await waiting; return { speech: 'id' }; },
      deliver: () => { delivered++; },
    });
    await new Promise(r => setImmediate(r));
    if (stage === 'generate') screen.configure({ enabled: false, interval: 20, model }); else screen.observe('b');
    release(); await job;
    assert.equal(delivered, 0); assert.equal(voiceCalls, stage === 'generate' ? 0 : 1);
  }
});
test('the image request uses DSH attachment admission and has no action tools or chat history', async () => {
  let admission = false;
  const ref = { attachmentId: 'sha256:test', width: 10, height: 10 };
  const ctx = {
    get: (name: string) => { assert.equal(name, 'attachments'); return { saveImage: async () => { admission = true; return ref; } }; },
    llm: {
      resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
      async *stream(options: unknown) {
        const v = options as { messages: Array<{ content: Array<{ type: string; attachment?: unknown; text?: string }> }>; tools?: unknown };
        assert(admission); assert.equal(v.messages.length, 1); assert.deepEqual(v.messages[0].content[1].attachment, ref);
        assert.match(v.messages[0].content[0].text ?? '', /不可信素材/); assert.equal(v.tools, undefined);
        yield { type: 'text-delta', text: '今晚的风景真好。' };
      },
    },
  };
  assert.equal(await generateScreenComment(ctx, image, model, '人设', [], new AbortController().signal), '今晚的风景真好。');
});
