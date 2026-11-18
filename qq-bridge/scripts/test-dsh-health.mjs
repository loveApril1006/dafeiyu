import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createDshHealth, probeDsh, dshFailureKind } from '../src/dsh-health.js';
import { NodeApiClient, unwrap } from '../src/dsh-client.js';

const timeout = () => Object.assign(new Error('request timed out'), { name: 'TimeoutError' });
const refused = () => Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
const reply = (value) => ({ result: { ok: true, value } });

test('short failures preserve readiness; sustained failure goes offline; recovery resets', () => {
  let time = 1000;
  const health = createDshHealth({ now: () => time });
  assert.equal(health.snapshot().ready, false);
  health.success();
  for (const next of [6000, 11000]) {
    time = next;
    assert.equal(health.failure(timeout()).state, 'reconnecting');
    assert.equal(health.snapshot().ready, true);
  }
  time = 16000;
  assert.equal(health.failure(refused()).state, 'offline');
  assert.equal(health.snapshot().ready, false);
  assert.equal(health.snapshot().reason, 'network');
  time = 17000;
  const restored = health.success();
  assert.equal(restored.state, 'connected');
  assert.equal(restored.ready, true);
  assert.equal(restored.failures, 0);
  assert.equal(restored.reason, null);
});

test('startup failures never report ready, and rapid failures require the grace period', () => {
  let time = 0;
  const health = createDshHealth({ now: () => time });
  for (let i = 0; i < 3; i++) health.failure(timeout());
  assert.equal(health.snapshot().state, 'reconnecting');
  assert.equal(health.snapshot().ready, false);
  time = 15000;
  assert.equal(health.failure(timeout()).state, 'offline');
});

test('intermittent failures do not accumulate across successful checks', () => {
  let time = 0;
  const health = createDshHealth({ now: () => time });
  health.success();
  for (let i = 0; i < 8; i++) {
    time += 20000;
    assert.equal(health.failure(timeout()).ready, true);
    health.success();
  }
  assert.equal(health.snapshot().failures, 0);
});

test('healthy settings return the document without a fallback call', async () => {
  const calls = [];
  const api = { callUnary: async (method, args, signal) => {
    calls.push(method);
    assert.ok(signal instanceof AbortSignal);
    return reply({ mode: 'reserved2' });
  } };
  const result = await probeDsh(api, unwrap);
  assert.deepEqual(result, { ok: true, settings: { mode: 'reserved2' }, degraded: false });
  assert.deepEqual(calls, ['settings.describe']);
});

test('a settings timeout with a working basic RPC stays connected, even signed out', async () => {
  const calls = [];
  const result = await probeDsh({ callUnary: async (method) => {
    calls.push(method);
    if (method === 'settings.describe') throw timeout();
    return reply({ status: 'signed-out' });
  } }, unwrap);
  assert.equal(result.ok, true);
  assert.equal(result.degraded, true);
  assert.deepEqual(calls, ['settings.describe', 'account.getState']);
  assert.equal(createDshHealth().success(result).state, 'connected');
});

test('a rejected RPC envelope is not a successful fallback; auth refresh runs before retry', async () => {
  let invalidated = false;
  const result = await probeDsh({
    invalidateAuth() { invalidated = true; },
    callUnary: async (method) => {
      if (method === 'settings.describe') throw new Error('HTTP 401');
      assert.equal(invalidated, true);
      return { result: { ok: false, error: { code: 'FORBIDDEN', message: 'HTTP 403' } } };
    },
  }, unwrap);
  assert.equal(result.ok, false);
  assert.equal(dshFailureKind(result.error), 'authentication');
});

test('a refused connection on both RPCs is offline evidence, with a sanitized reason', async () => {
  const result = await probeDsh({ callUnary: async () => { throw refused(); } }, unwrap);
  assert.equal(result.ok, false);
  const health = createDshHealth();
  assert.equal(health.failure(result.error).reason, 'network');
  assert.ok(!JSON.stringify(health.snapshot()).includes('fetch failed'));
});

test('a client started before credentials exist discovers them on the next request', () => {
  // Keep generated test credentials inside this workspace; never touch the real vault.
  const testRoot = path.resolve(import.meta.dirname, '../../maintenance/dsh-health-20261026');
  fs.mkdirSync(testRoot, { recursive: true });
  const home = fs.mkdtempSync(path.join(testRoot, 'late-credentials-'));
  const previous = process.env.DSH_HOME;
  try {
    process.env.DSH_HOME = home;
    const client = new NodeApiClient('http://127.0.0.1:17860');
    assert.equal(client.hasAuth(), false);
    const secret = randomBytes(32);
    fs.writeFileSync(path.join(home, '.credentials.yaml'), JSON.stringify({ records: {
      'client-connection/browser-session': { kind: 'grant', payload: { version: 1, secret: secret.toString('base64url') } },
    } }));
    assert.equal(client.hasAuth(), true);
    assert.deepEqual(client.browserSessionSecret(), secret);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    fs.unlinkSync(path.join(home, '.credentials.yaml'));
    fs.rmdirSync(home);
  }
});
