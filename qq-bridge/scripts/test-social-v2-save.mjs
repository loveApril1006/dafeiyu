import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { bridgeHarness } from './audit-bridge-harness.mjs';
import { patchConsoleSave, repairConsoleSave } from './repair-console-save.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const legacyArg = process.argv.find(arg => arg.startsWith('--legacy-root='));
const legacyRoot = legacyArg?.slice('--legacy-root='.length);
const h = await bridgeHarness({ config: {
  socialV2: {
    wake: { maxWakePerMinute: 1, maxWakePerHour: 12, batchWindowMs: 8000 },
    send: { burstMaxMessages: 27, maxMessageChars: 713, maxSendPerMinute: 19, maxSendPerHour: 81 },
    voice: { enabled: true, volume: 1.8 },
  },
} });
const server = h.startConsoleServer();
if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let writes = 0;
let failWrite = false;
let mismatch = false;

async function api(route, method = 'GET', body) {
  if (method === 'POST') {
    if (failWrite) throw new Error('fixture network failure');
    writes++;
  }
  const response = await fetch(base + route, {
    method,
    headers: { 'x-console-token': 'fixture-console-token', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (mismatch && method === 'GET') result.config.wake.maxWakePerHour = 12;
  return result;
}

function browser(source, html) {
  // Only IDs actually present in HTML exist. Missing elements return null as in a browser.
  const controls = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], { value: '', checked: false, textContent: '', className: '' }]));
  const tools = [...html.matchAll(/<[^>]+data-v2-tool="([^"]+)"[^>]*>/g)].map(match => ({ dataset: { v2Tool: match[1] }, checked: true }));
  const context = vm.createContext({ document: { getElementById: id => controls.get(id) ?? null, querySelectorAll: () => tools }, api });
  for (const name of ['loadV2Config', 'saveV2Config']) {
    const start = source.indexOf(`async function ${name}() {`);
    const close = /^\}/gm; close.lastIndex = start;
    const end = close.exec(source).index + 1;
    vm.runInContext(source.slice(start, end), context);
  }
  return { controls, load: () => context.loadV2Config(), save: () => context.saveV2Config() };
}

function changeWake(page) {
  for (const [id, value] of [['v2MaxWakeMin', '0'], ['v2MaxWakeHour', '0'], ['v2BatchWindowMs', '1000'], ['v2SleepMinMs', '0'], ['v2WakeDefaultMode', 'active']]) page.controls.get(id).value = value;
  for (const id of ['v2ActiveReply', 'v2LockActive']) page.controls.get(id).checked = true;
}

try {
  const source = fs.readFileSync(path.join(root, 'public/console/social-v2.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/console.html'), 'utf8');
  const page = browser(source, html);
  await page.load(); changeWake(page); await page.save();
  assert.match(page.controls.get('v2ConfigMsg').textContent, /已保存.*读回核对/);
  let disk = JSON.parse(fs.readFileSync(path.join(h.temp, 'config.json'), 'utf8'));
  assert.equal(disk.socialV2.wake.maxWakePerMinute, 0);
  assert.equal(disk.socialV2.wake.maxWakePerHour, 0);
  assert.equal(disk.socialV2.wake.batchWindowMs, 1000);
  assert.equal(disk.socialV2.wake.sleepMinMs, 0);
  assert.equal(disk.socialV2.wake.lockMode, 'active');
  assert.equal(disk.socialV2.wake.replyEveryMessageWhenActive, true);
  assert.equal(disk.socialV2.send.burstMaxMessages, 27);
  assert.equal(disk.socialV2.send.maxMessageChars, 713);
  assert.equal(disk.socialV2.send.maxSendPerMinute, 19);
  assert.equal(disk.socialV2.send.maxSendPerHour, 81);
  assert.equal(disk.socialV2.voice.volume, 1.8);
  await page.load();
  assert.equal(Number(page.controls.get('v2MaxWakeHour').value), 0);
  assert.equal(Number(page.controls.get('v2SleepMinMs').value), 0);
  console.log('PASS real HTML IDs -> save handler -> HTTP -> config.json -> reload; zero values and hidden settings retained');

  const originalControl = page.controls.get('v2MaxWakeHour');
  page.controls.delete('v2MaxWakeHour');
  const before = writes;
  await page.save();
  assert.equal(writes, before);
  assert.match(page.controls.get('v2ConfigMsg').textContent, /保存未完成.*控件不完整/);
  page.controls.set('v2MaxWakeHour', originalControl);
  failWrite = true; await page.save(); failWrite = false;
  assert.match(page.controls.get('v2ConfigMsg').textContent, /保存未完成.*network failure/);
  mismatch = true; await page.save(); mismatch = false;
  assert.match(page.controls.get('v2ConfigMsg').textContent, /保存未完成.*读回/);
  console.log('PASS missing control/network error/readback mismatch cannot leave a stale success notice or unhandled rejection');

  if (legacyRoot) {
    const legacySource = fs.readFileSync(path.join(legacyRoot, 'public/console/social-v2.js'), 'utf8');
    const legacyHtml = fs.readFileSync(path.join(legacyRoot, 'public/console.html'), 'utf8');
    const legacy = browser(legacySource, legacyHtml);
    await legacy.load(); changeWake(legacy);
    const before = writes;
    await assert.rejects(legacy.save(), /null/);
    assert.equal(writes, before);
    const patched = patchConsoleSave(legacySource, legacyHtml);
    assert.equal(patched.removed.length, 8);
    const fixed = browser(patched.source, legacyHtml);
    await fixed.load(); changeWake(fixed); await fixed.save();
    assert.match(fixed.controls.get('v2ConfigMsg').textContent, /已保存.*读回核对/);
    assert.equal(patchConsoleSave(patched.source, legacyHtml).changed, false);
    console.log('PASS reproduce released v26 null.value before any POST; patch removes all eight orphan references and saves successfully');

    const target = path.join(h.temp, 'public/console/social-v2.js');
    fs.writeFileSync(target, legacySource);
    fs.writeFileSync(path.join(h.temp, 'public/console.html'), legacyHtml);
    const configBefore = fs.readFileSync(path.join(h.temp, 'config.json'));
    const result = repairConsoleSave(h.temp);
    assert.equal(fs.readFileSync(result.backup, 'utf8'), legacySource);
    assert.deepEqual(fs.readFileSync(path.join(h.temp, 'config.json')), configBefore);
    assert.equal(repairConsoleSave(h.temp).changed, false);
    console.log('PASS portable repair makes an exact script backup, preserves private configuration bytes and is idempotent');
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  await h.close();
}
