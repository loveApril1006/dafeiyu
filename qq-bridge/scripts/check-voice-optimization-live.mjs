// Local audio verification only. No QQ, WeChat, model API or social publication.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { synthesizeGptSovitsAudio } from '../src/local-tts.js';
const endpoint = 'http://127.0.0.1:17866';
const directory = path.resolve('state/voice-audit');
fs.mkdirSync(directory, { recursive: true });
const get = route => fetch(endpoint + route, { signal: AbortSignal.timeout(5000) }).then(r => {
  assert(r.ok); return r.json();
});
const configure = async seconds => {
  const response = await fetch(endpoint + '/performance', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idleUnloadSeconds: seconds }) });
  assert(response.ok); return response.json();
};
const memory = pid => JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `Get-Process -Id ${Number(pid)} | Select-Object Id,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`],
  { encoding: 'utf8', windowsHide: true }).trim());
const serverPid = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command',
  '(Get-NetTCPConnection -LocalPort 17866 -State Listen).OwningProcess'],
  { encoding: 'utf8', windowsHide: true }).trim());
const before = await get('/voices');
const original = await get('/performance');
const result = { selected: before.selected, voices: Object.keys(before.voices).length,
  lazyHost: memory(serverPid), initiallyLoaded: original.modelLoaded,
  startedAt: new Date().toISOString(), externalMessages: 0 };
try {
  await configure(60);
  const initialDeadline = Date.now() + 90000;
  while ((await get('/performance')).workerPid && Date.now() < initialDeadline)
    await new Promise(r => setTimeout(r, 2000));
  assert.equal((await get('/performance')).workerPid, null, 'Other active speech prevented a cold-load check');
  for (const [name, text] of [['cold', '今天也要开开心心的。'], ['warm', '别着急，慢慢来，我在呢。']]) {
    const start = performance.now();
    const audio = await synthesizeGptSovitsAudio(text, { voice: before.selected });
    const file = path.join(directory, `verified-${name}.wav`);
    fs.writeFileSync(file, audio);
    execFileSync(path.resolve('bin/ffmpeg.exe'), ['-v', 'error', '-i', file, '-f', 'null', '-'],
      { windowsHide: true, timeout: 15000, stdio: 'pipe' });
    const state = await get('/performance');
    assert.equal(state.compute, 'cuda');
    assert.equal(state.modelLoaded, true);
    result[name] = { seconds: +( (performance.now() - start) / 1000 ).toFixed(2),
      wavBytes: audio.length, worker: memory(state.workerPid), host: memory(serverPid) };
    console.log(JSON.stringify({ phase: name, seconds: result[name].seconds, wavBytes: audio.length }));
  }
  const deadline = Date.now() + 75000;
  while ((await get('/performance')).workerPid && Date.now() < deadline)
    await new Promise(r => setTimeout(r, 2000));
  const idle = await get('/performance');
  assert.equal(idle.modelState, 'unloaded');
  assert.equal(idle.workerPid, null);
  result.afterIdle = { state: idle.modelState, host: memory(serverPid) };
  assert.deepEqual(await get('/voices'), before);
  result.ok = true;
} finally {
  await configure(original.idleUnloadSeconds);
  result.restoredIdleUnloadSeconds = original.idleUnloadSeconds;
  fs.writeFileSync(path.join(directory, 'live-result.json'), JSON.stringify(result, null, 2));
}
console.log('PASS: CUDA cold/warm WAV decoded, automatic idle worker exit, selected voices unchanged, performance setting restored, zero external messages');
