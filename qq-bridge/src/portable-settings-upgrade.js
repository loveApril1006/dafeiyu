// Add public defaults without replacing any existing user value or history row.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import yaml from 'js-yaml';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);
export function mergeMissing(current, defaults, added = [], prefix = '') {
  if (!object(current) || !object(defaults)) return current;
  const result = { ...current };
  for (const [key, value] of Object.entries(defaults)) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      Object.defineProperty(result, key, { value: clone(value), enumerable: true, configurable: true, writable: true });
      added.push(field);
    } else if (object(current[key]) && object(value)) {
      Object.defineProperty(result, key, { value: mergeMissing(current[key], value, added, field), enumerable: true, configurable: true, writable: true });
    }
  }
  return result;
}

function parseJson(text, jsonc = false) {
  text = text.replace(/^\uFEFF/, '');
  if (!jsonc) return JSON.parse(text);
  let cleaned = '', quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      cleaned += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') { quoted = true; cleaned += ch; continue; }
    if (ch === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; cleaned += '\n'; continue; }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { cleaned += text[i] === '\n' ? '\n' : ' '; i++; }
      if (i >= text.length) throw Error('JSONC 注释未闭合');
      i++; continue;
    }
    if (ch === ',') { let next = i + 1; while (/\s/.test(text[next] || '') && next < text.length) next++; if (/[}\]]/.test(text[next] || '')) continue; }
    cleaned += ch;
  }
  cleaned = cleaned.replace(/("(?:\\.|[^"\\])*")|,(\s*[}\]])/g, (match, literal, close) => literal ?? close);
  return JSON.parse(cleaned);
}

function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.upgrade-' + randomBytes(6).toString('hex');
  try { fs.writeFileSync(temp, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

export const UPGRADE_JSON_FILES = [
  'qq-bridge/config.json',
  'qq-bridge/companion/creative-data/settings.json', 'qq-bridge/companion/wechat-data/settings.json', 'qq-bridge/companion/qzone-data/settings.json',
  'qq-bridge/companion/reply-options.json', 'qq-bridge/state/bilibili-chat/settings.json', 'qq-bridge/state/harness-control/settings.json',
  'qq-bridge/companion/bilibili-live-data/config.json', 'qq-bridge/companion/bilibili-live-data/studio.json',
  'qq-bridge/companion/bili-native-data/config.json', 'qq-bridge/companion/bili-native-data/memory-v2/state.json',
  'qq-bridge/companion/douyin-data/memory-policy.json',
  ...['chat-policy', 'video-policy', 'watch-mode', 'watch-schedule-policy', 'friend-interactions-policy'].map(name => 'qq-bridge/companion/douyin-data/state/' + name + '.json'),
  'engine-home/dsh-pet/main-config.jsonc', 'engine-home/dsh-pet/local-voice.json', 'engine-home/dsh-pet/screen-companion.json', 'GPT-SoVITS/pet-voice.json',
];
export const UPGRADE_DATABASE_FILES = ['qq-bridge/state/emotional-companion.sqlite', 'qq-bridge/state/conversation-memory.sqlite'];

export function upgradePortableSettings(root, settings) {
  if (settings?.format !== 1) throw Error('默认设置格式无效，未迁移');
  root = path.resolve(root);
  const file = relative => path.join(root, relative);
  const read = relative => fs.existsSync(file(relative)) ? parseJson(fs.readFileSync(file(relative), 'utf8'), relative.endsWith('.jsonc')) : {};
  const current = read('qq-bridge/config.json');
  if (!object(current) || !object(current.dsh)) throw Error('原配置缺少模型设置，未重新初始化');
  const model = { provider: Object.hasOwn(current.dsh, 'provider') ? current.dsh.provider : 'deepseek-account', model: Object.hasOwn(current.dsh, 'model') ? current.dsh.model : 'deepseek-flash' };
  const biliHome = file('qq-bridge/companion/bili-native-data');
  const defaults = new Map([
    ['qq-bridge/config.json', settings.bridge],
    ...Object.entries({ creative: 'creative-data', wechat: 'wechat-data', qzone: 'qzone-data' }).map(([key, folder]) => ['qq-bridge/companion/' + folder + '/settings.json', { ...settings[key], revision: 0 }]),
    ['qq-bridge/companion/reply-options.json', { ...settings.replies, revision: 0 }],
    ['qq-bridge/state/bilibili-chat/settings.json', { ...settings.bilibiliChat, revision: 0 }],
    ['qq-bridge/state/harness-control/settings.json', { ...settings.harnessControl, projects: [], revision: 0 }],
    ['qq-bridge/companion/bilibili-live-data/config.json', { ...settings.bilibiliLive?.config, roomId: '' }],
    ['qq-bridge/companion/bilibili-live-data/studio.json', settings.bilibiliLive?.studio || {}],
    ['qq-bridge/companion/bili-native-data/config.json', { ...settings.bilibili, mentionUid: 0, mentionName: '', dmUid: 0, guardWhitelist: '', headlessProfile: 'headless', pythonPath: path.join(biliHome, '.venv/Scripts/python.exe'), dshBin: file('qq-bridge/integrations/bili-standalone/dsh-cli.mjs'), dutyProvider: model.provider, dutyModel: model.model, workspace: path.join(biliHome, 'persona') }],
    ['qq-bridge/companion/bili-native-data/memory-v2/state.json', { schema: 1, policy: settings.videoMemory?.bilibili || {}, records: [], seen: [], tombstones: [], journal: [], lastSweep: null }],
    ['qq-bridge/companion/douyin-data/memory-policy.json', { ...settings.videoMemory?.douyin, revision: 0 }],
    ['engine-home/dsh-pet/main-config.jsonc', { ...settings.desktop, chatModel: model, whisperModel: model }],
    ['engine-home/dsh-pet/local-voice.json', settings.localVoice || {}],
    ['engine-home/dsh-pet/screen-companion.json', { ...settings.screen, model }],
    ['GPT-SoVITS/pet-voice.json', settings.tts || {}],
  ]);
  for (const [key, name] of Object.entries({ chat: 'chat-policy', video: 'video-policy', watchMode: 'watch-mode', watchSchedule: 'watch-schedule-policy', friendInteractions: 'friend-interactions-policy' })) {
    defaults.set('qq-bridge/companion/douyin-data/state/' + name + '.json', { version: 1, ...settings.douyin?.[key] });
  }
  const plans = [], changes = [];
  // Parse every configuration first; a malformed user file must never be reset.
  for (const [relative, baseline] of defaults) {
    const before = read(relative);
    if (!object(before)) throw Error('用户配置顶层不是对象：' + relative);
    const added = [], value = mergeMissing(before, baseline, added);
    if (!isDeepStrictEqual(before, value)) { plans.push({ relative, value }); changes.push({ file: relative, added }); }
  }
  const patchFile = 'engine-home/profiles/web/cordis.patch.yml';
  if (fs.existsSync(file(patchFile))) {
    const before = yaml.load(fs.readFileSync(file(patchFile), 'utf8'));
    if (!Array.isArray(before)) throw Error('原引擎插件配置不是数组，未重新初始化');
    const value = clone(before), added = [];
    for (const row of value) if (object(row) && Object.prototype.hasOwnProperty.call(settings.optional || {}, row.id)) {
      if (!Object.prototype.hasOwnProperty.call(row, 'config')) { row.config = clone(settings.optional[row.id]); added.push(row.id + '.config'); }
      else if (object(row.config)) row.config = mergeMissing(row.config, settings.optional[row.id], added, row.id);
    }
    if (!isDeepStrictEqual(before, value)) { plans.push({ relative: patchFile, value: yaml.dump(value, { lineWidth: -1, noRefs: true }) }); changes.push({ file: patchFile, added }); }
  }
  const databasePlans = [];
  for (const [relative, table, key, baseline] of [
    [UPGRADE_DATABASE_FILES[0], 'settings', 1, settings.emotion],
    [UPGRADE_DATABASE_FILES[1], 'ocean_meta', 'cognition-settings', settings.cognition],
  ]) {
    if (!object(baseline) || !Object.keys(baseline).length) continue;
    let before = {};
    if (fs.existsSync(file(relative))) {
      const db = new DatabaseSync(file(relative), { readOnly: true });
      try {
        if (db.prepare('SELECT 1 FROM sqlite_master WHERE type=\'table\' AND name=?').get(table)) {
          const row = table === 'settings' ? db.prepare('SELECT data AS value FROM settings WHERE id=?').get(key) : db.prepare('SELECT value FROM ocean_meta WHERE key=?').get(key);
          if (row) before = JSON.parse(row.value);
        }
      } finally { db.close(); }
    }
    if (!object(before)) throw Error('原数据库设置不是对象：' + relative);
    const added = [], value = mergeMissing(before, baseline, added);
    if (!isDeepStrictEqual(before, value)) { databasePlans.push({ relative, table, key, value }); changes.push({ file: relative, added }); }
  }
  for (const plan of plans) atomic(file(plan.relative), plan.value);
  for (const plan of databasePlans) {
    fs.mkdirSync(path.dirname(file(plan.relative)), { recursive: true });
    const db = new DatabaseSync(file(plan.relative));
    try {
      db.exec('BEGIN IMMEDIATE');
      if (plan.table === 'settings') {
        db.exec('CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,data TEXT NOT NULL)');
        db.prepare('INSERT INTO settings(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(plan.key, JSON.stringify(plan.value));
      } else {
        db.exec('CREATE TABLE IF NOT EXISTS ocean_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
        db.prepare('INSERT INTO ocean_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(plan.key, JSON.stringify(plan.value));
      }
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    finally { db.close(); }
  }
  return { changed: changes.length > 0, changes, preservedExisting: true };
}
