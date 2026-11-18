// Read-only production checks. Never submits a model prompt or platform command.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const raw = fs.readFileSync(path.join(root, 'config.json'), 'utf8');
const cfg = JSON.parse(raw);
const token = cfg.consoleToken || fs.readFileSync(path.join(root, 'state/console-token'), 'utf8').trim();
const base = 'http://127.0.0.1:' + (cfg.consolePort || 3100);
const get = async route => {
  const response = await fetch(base + route, { headers: { 'X-Console-Token': token }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error(route + ': HTTP ' + response.status);
  return response.json();
};
const [status, creative, wechat, qzone, emotion] = await Promise.all([
  '/api/status', '/api/creative/status', '/api/wechat/status', '/api/qzone/status', '/api/emotional-companion'
].map(get));
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const result = {
  at: new Date().toISOString(), configHash: createHash('sha256').update(raw).digest('hex'),
  health: { dshReady: status.dshReady, mode: status.mode, qqConnected: status.snowluma?.connected, qqOnline: status.snowluma?.accountOnline, qqGood: status.snowluma?.good },
  switches: {
    proactive: pick(cfg.socialV2?.proactive || {}, ['enabled', 'intervalMode', 'scope', 'fixedIntervalMs', 'checkIntervalMinMs', 'checkIntervalMaxMs', 'probability']),
    qqVoice: { enabled: cfg.socialV2?.voice?.enabled, tool: cfg.socialV2?.tools?.sendVoice },
    creative: Object.fromEntries(['rpg', 'images', 'memes'].map(key => [key, pick(creative.config[key], ['enabled', 'qq', 'desktop', 'dailyLimit'])])),
    wechat: pick(wechat.config, ['enabled', 'autoReply', 'images', 'files', 'voiceTranscript', 'dailyLimit']),
    qzone: pick(qzone.config, ['enabled', 'autoWrite', 'autoPublish', 'withImages', 'scheduled', 'linkCompanion', 'workReports']),
    emotion: pick(emotion.config, ['enabled', 'workQQReports'])
  },
  memoryProjection: pick(emotion.config, ['memoryContextLimit', 'contextChars']),
  requests: 5, modelPrompts: 0, platformWrites: 0
};
if (process.argv.includes('--after')) {
  const resource = await get('/api/resources/status');
  const html = await fetch(base + '/resources/', { headers: { 'X-Console-Token': token }, signal: AbortSignal.timeout(5000) });
  if (html.status !== 200) throw Error('Resource page did not load');
  result.resourceControls = { desktopAvailable: resource.desktop.available, storageAvailable: resource.storage.available, pageHttp: html.status };
  const before = JSON.parse(fs.readFileSync(path.join(root, 'state/system-audit/production-before.json'), 'utf8'));
  result.switchesUnchanged = JSON.stringify(before.switches) === JSON.stringify(result.switches);
  result.configUnchanged = before.configHash === result.configHash;
  if (!result.switchesUnchanged || !result.configUnchanged) throw Error('Settings changed across restart; inspect sanitized snapshots');
}
fs.mkdirSync(path.join(root, 'state/system-audit'), { recursive: true });
fs.writeFileSync(path.join(root, 'state/system-audit/production-' + (process.argv.includes('--after') ? 'after' : 'before') + '.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(pick(result, ['health', 'memoryProjection', 'resourceControls', 'switchesUnchanged', 'configUnchanged', 'modelPrompts', 'platformWrites'])));
