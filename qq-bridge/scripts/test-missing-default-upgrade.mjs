import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { upgradePortableSettings, UPGRADE_JSON_FILES, UPGRADE_DATABASE_FILES } from '../src/portable-settings-upgrade.js';
import { apply, rollback } from '../packaging/installer/install-engine.mjs';

const lab = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-defaults-'));
const root = path.join(lab, '旧安装 中文 空格'), source = path.join(lab, '发行包');
const put = (base, relative, value) => { const file = path.join(base, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const hash = relative => fs.existsSync(path.join(root, relative)) ? createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex') : null;
const settings = JSON.parse(fs.readFileSync('packaging/default-settings.json', 'utf8'));
try {
  put(root, 'xiaoge-install.json', { version: 20 }); put(root, 'full-release.json', { version: 20 });
  const original = { dsh: { provider: 'custom-provider', model: '', authToken: 'private-fixture' }, snowluma: { accessToken: 'private-onebot-fixture' }, ownerQQ: 100001, allow: { groups: [], private: [] }, socialV2: { enabled: false, wake: { lockMode: '', maxWakePerMinute: 0, maxWakePerHour: 0, recommendedKeywords: [], replyEveryMessageWhenActive: false }, proactive: { enabled: false, scope: '', fixedIntervalMs: 0 } }, userCustom: { zero: 0, off: false, empty: '', items: [], nullable: null } };
  put(root, 'qq-bridge/config.json', original);
  put(root, 'qq-bridge/state/sessions.json', 'original session and context bytes');
  put(root, 'qq-bridge/roles/自己的角色.md', 'original private persona');
  put(root, 'qq-bridge/companion/reply-options.json', { voice: false, images: false, revision: 0 });
  put(root, 'engine-home/profiles/web/cordis.patch.yml', '- id: mnemon\n  config:\n    timeoutMs: 0\n    routingGuidance: false\n    custom: []\n');
  put(root, 'engine-home/dsh-pet/main-config.jsonc', '// retain all values\n{"notificationsEnabled":false,"chatMemoryRounds":0,"whisperPrompt":"https://example.invalid//a","custom":[], // comment\n}\n');
  for (const [relative, sql, data] of [
    [UPGRADE_DATABASE_FILES[0], 'CREATE TABLE settings(id INTEGER PRIMARY KEY,data TEXT NOT NULL)', { enabled: false, dailyProactiveLimit: 0, schedule: [], custom: '' }],
    [UPGRADE_DATABASE_FILES[1], 'CREATE TABLE ocean_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)', { enabled: false, dailyCalls: 0, custom: [] }],
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    const db = new DatabaseSync(path.join(root, relative));
    db.exec(sql + '; CREATE TABLE private_evidence(id INTEGER PRIMARY KEY,content TEXT); INSERT INTO private_evidence VALUES(1,\'original evidence\')');
    if (relative === UPGRADE_DATABASE_FILES[0]) db.prepare('INSERT INTO settings VALUES(1,?)').run(JSON.stringify(data));
    else db.prepare('INSERT INTO ocean_meta VALUES(?,?)').run('cognition-settings', JSON.stringify(data));
    db.close();
  }
  const protectedFiles = ['qq-bridge/config.json', 'qq-bridge/companion/reply-options.json', 'engine-home/profiles/web/cordis.patch.yml', 'engine-home/dsh-pet/main-config.jsonc', ...UPGRADE_DATABASE_FILES];
  const before = new Map(protectedFiles.map(relative => [relative, hash(relative)]));
  const untouched = new Map(['qq-bridge/state/sessions.json', 'qq-bridge/roles/自己的角色.md'].map(relative => [relative, hash(relative)]));
  const program = 'new program'; put(source, 'payload/qq-bridge/src/new.js', program);
  const rows = [{ file: 'qq-bridge/src/new.js', size: Buffer.byteLength(program), sha256: createHash('sha256').update(program).digest('hex') }];
  const index = JSON.stringify(rows); put(source, '工具/payload-index.json', index); put(source, 'payload/bundle-manifest.json', { version: 26, fileCount: 1, totalBytes: rows[0].size, fileIndexSha256: createHash('sha256').update(index).digest('hex'), sha256: {} });
  const transaction = await apply({ source, root });
  const migrated = upgradePortableSettings(root, settings);
  assert(migrated.changed);
  const cfg = read('qq-bridge/config.json');
  assert.deepEqual(cfg.userCustom, original.userCustom); assert.deepEqual(cfg.allow, original.allow);
  for (const [key, value] of Object.entries(original.socialV2.wake)) assert.deepEqual(cfg.socialV2.wake[key], value);
  for (const [key, value] of Object.entries(original.socialV2.proactive)) assert.deepEqual(cfg.socialV2.proactive[key], value);
  assert.equal(cfg.socialV2.enabled, false); assert.equal(cfg.dsh.model, ''); assert.equal(cfg.dsh.authToken, 'private-fixture');
  assert.equal(cfg.socialV2.wake.batchWindowMs, settings.bridge.socialV2.wake.batchWindowMs);
  const desktop = read('engine-home/dsh-pet/main-config.jsonc');
  assert.equal(desktop.notificationsEnabled, false); assert.equal(desktop.chatMemoryRounds, 0); assert.equal(desktop.whisperPrompt, 'https://example.invalid//a'); assert.deepEqual(desktop.custom, []);
  for (const relative of UPGRADE_DATABASE_FILES) {
    const db = new DatabaseSync(path.join(root, relative));
    assert.equal(db.prepare('SELECT content FROM private_evidence WHERE id=1').get().content, 'original evidence');
    const value = relative === UPGRADE_DATABASE_FILES[0] ? JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data) : JSON.parse(db.prepare('SELECT value FROM ocean_meta WHERE key=?').get('cognition-settings').value);
    assert.equal(value.enabled, false); assert.equal(value[relative === UPGRADE_DATABASE_FILES[0] ? 'dailyProactiveLimit' : 'dailyCalls'], 0); db.close();
  }
  for (const [relative, digest] of untouched) assert.equal(hash(relative), digest);
  const once = new Map([...protectedFiles, ...UPGRADE_JSON_FILES].map(relative => [relative, hash(relative)]));
  assert.equal(upgradePortableSettings(root, settings).changed, false);
  for (const [relative, digest] of once) assert.equal(hash(relative), digest, relative);
  console.log('PASS missing-only upgrade retains zero/false/empty strings/arrays/null, unknown fields, private credentials, JSONC values, evidence, roles and sessions; repeated migration is byte-idempotent');
  for(const relative of UPGRADE_DATABASE_FILES)put(root,relative+'-journal','simulated interrupted migration journal');
  await rollback(root, transaction.job);
  for(const relative of UPGRADE_DATABASE_FILES)assert(!fs.existsSync(path.join(root,relative+'-journal')));
  for (const [relative, digest] of before) assert.equal(hash(relative), digest, relative);
  for (const relative of UPGRADE_JSON_FILES) if (!before.has(relative) && !untouched.has(relative)) assert(!fs.existsSync(path.join(root, relative)), relative);
  assert(!fs.existsSync(path.join(root, 'qq-bridge/src/new.js')));
  console.log('PASS actual installer rollback restores changed JSON/YAML/SQLite bytes and removes newly added defaults');
  const originalConfig = hash('qq-bridge/config.json'); put(root, 'qq-bridge/companion/creative-data/settings.json', '{broken');
  assert.throws(() => upgradePortableSettings(root, settings)); assert.equal(hash('qq-bridge/config.json'), originalConfig);
  console.log('PASS malformed existing settings abort before writing any defaults');
} finally {
  if (!path.resolve(lab).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(lab).startsWith('missing-defaults-')) throw Error('Unexpected fixture deletion path');
  fs.rmSync(lab, { recursive: true, force: true });
}
