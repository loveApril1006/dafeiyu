import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
test('captions start with playback; stale audio errors cannot cancel the newer response', async () => {
  const audios = [], shown = [];
  class Audio {
    constructor() { this.events = {}; this.duration = 12; audios.push(this); }
    addEventListener(name, fn) { this.events[name] = fn; }
    play() { return new Promise((resolve, reject) => { this.reject = reject; }); }
    pause() { this.paused = true; }
    removeAttribute() {} load() {}
  }
  const window = { addEventListener() {} };
  vm.runInNewContext(readFileSync(new URL('../../runtime/electron-helper/local-speech.js', import.meta.url), 'utf8'), { window, Audio, setTimeout, clearTimeout });
  const sprite = { pet: { id: 'main' }, showWhisper: (...args) => shown.push(args) };
  const cue = { text: '你好' }, id = '00000000-0000-0000-0000-000000000001.wav';
  window.XiaogeSpeech.deliver(sprite, cue, id, 'local');
  assert.equal(shown.length, 0);
  audios[0].events.playing(); assert.equal(shown.length, 1); assert(shown[0][3] >= 12000);
  window.XiaogeSpeech.deliver(sprite, { text: '新回复' }, id, 'local');
  assert(audios[0].paused);
  audios[0].reject(new Error('stale')); await Promise.resolve();
  assert(!audios[1].paused);
  audios[1].events.error(); assert.equal(shown[1][0], '新回复');
});
