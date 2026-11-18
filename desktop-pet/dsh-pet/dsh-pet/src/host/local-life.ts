/** Forward explicit user commands to the existing local life service; never interpret generated text as an action. */
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultLog } from './log-file';

type EmotionEngine = {
  incoming(channel: string, input: { text: string }): unknown;
  context(channel: string, subject: string, text: string): string;
  snapshot(channel: string): { enabled: boolean; expression: { voiceProbability: number; stickerProbability: number; delayMs: number } };
  autonomy(channel: string): { allowed: boolean };
  sent(channel: string): void;
  close(): void;
};
const emotionEngines = new Map<string, EmotionEngine>();
let emotionWarningAt = 0;
export function closeLocalEmotion() {
  for (const engine of emotionEngines.values()) engine.close();
  emotionEngines.clear();
}
/** Reuse the suite's single state engine without changing the desktop model/provider. */
export async function localEmotion(root: string, petId: string, text = '') {
  try {
    const settings = JSON.parse(readFileSync(join(root, 'local-integrations.json'), 'utf8'));
    if (!isAbsolute(settings.companionTokenFile || '')) return undefined;
    const bridgeRoot = resolve(dirname(settings.companionTokenFile), '..');
    let engine = emotionEngines.get(bridgeRoot);
    if (!engine) {
      const moduleFile = join(bridgeRoot, 'src/emotional-companion.js');
      const moduleUrl = pathToFileURL(moduleFile);
      moduleUrl.searchParams.set('revision', String(statSync(moduleFile).mtimeMs));
      const module = await import(moduleUrl.href);
      engine = module.createEmotionalCompanion({ file: join(bridgeRoot, 'state/emotional-companion.sqlite'), ownerQQ: () => {
        try { return JSON.parse(readFileSync(join(bridgeRoot, 'config.json'), 'utf8')).ownerQQ || ''; } catch { return ''; }
      }, role: () => {
        try { return JSON.parse(readFileSync(join(bridgeRoot, 'state/current-role.json'), 'utf8')).role || 'default'; } catch { return 'default'; }
      } });
      emotionEngines.set(bridgeRoot, engine!);
    }
    const channel = 'desktop:' + petId;
    if (text) engine!.incoming(channel, { text });
    const snapshot = engine!.snapshot(channel);
    return { context: engine!.context(channel, '', text), snapshot, autonomy: engine!.autonomy(channel), sent: () => {
      if(emotionEngines.get(bridgeRoot)===engine)engine!.sent(channel);
    } };
  } catch (error) {
    if (Date.now() - emotionWarningAt > 60_000) {
      emotionWarningAt = Date.now(); defaultLog('warn', '桌宠角色状态暂不可用：' + String(error));
    }
    return undefined;
  }
}

const isWorkCommand = (text: string) => /^#?(?:(?:开启工作模式|关闭工作模式|工作日报|工作状态)$|(?:工作任务|完成任务|工作记录)[：:]\s*.+$)/.test(text.trim());
export function isLifeCommand(text: string): boolean {
  if (isWorkCommand(text)) return true;
  if (/^#?(?:跑团|掷骰|检定|画图|改图|表情)(?:[：:\s]|$)/.test(text.trim())) return true;
  return /^(?:(?:帮我)?(?:写日记|记日记|读日记|看日记|发(?:一条|条)?说说|发表说说|逛空间|读空间|看看空间|换签名|改签名|签名改为|把签名改成|拍一拍)|(?:给)?第\s*\d+\s*条(?:说说)?点赞|(?:评论|评论说说)第\s*\d+\s*条)(?:[：:，,\s]|$|\d)/.test(text.trim());
}
export async function localLife(root: string, text: string, request = fetch): Promise<{ ok: true; text: string; image?: string } | undefined> {
  if (!isLifeCommand(text)) return undefined;
  if (isWorkCommand(text)) {
    const result = await localWork(root, { action: 'command', input: { text } }, request);
    return { ok: true, text: String(result.text || '工作模式已更新。') };
  }
  const settings = JSON.parse(readFileSync(join(root, 'local-integrations.json'), 'utf8'));
  if (!isAbsolute(settings.companionTokenFile || '')) throw new Error('本地生活服务尚未配置');
  if (/^#?(?:跑团|掷骰|检定|画图|改图|表情)(?:[：:\s]|$)/.test(text.trim())) {
    const bridgeRoot = resolve(dirname(settings.companionTokenFile), '..');
    const config = JSON.parse(readFileSync(join(bridgeRoot, 'config.json'), 'utf8'));
    const consoleToken = config.consoleToken || readFileSync(join(bridgeRoot, 'state/console-token'), 'utf8').trim();
    const port = Number(config.consolePort) || 3100;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('机器人后台端口无效');
    const response = await request('http://127.0.0.1:' + port + '/api/creative/desktop-request', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Console-Token': consoleToken }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(185_000) });
    const result = await response.json() as { ok?: boolean; text?: string; image?: string; error?: string };
    if (!response.ok || !result.ok || typeof result.text !== 'string') throw new Error(result.error || '创作功能尚未完成，请检查后台开关');
    return { ok: true, text: result.text, ...(result.image ? { image: result.image } : {}) };
  }
  const token = readFileSync(settings.companionTokenFile, 'utf8').trim();
  const response = await request('http://127.0.0.1:17867/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Companion-Token': token },
    body: JSON.stringify({ text, channel: 'local' }), signal: AbortSignal.timeout(185_000),
  });
  const result = await response.json() as { ok?: boolean; text?: string; image?: string; error?: string };
  if (!response.ok || !result.ok || typeof result.text !== 'string') throw new Error(result.error || '本地生活操作未完成，请检查生活服务或命令格式');
  return { ok: true, text: result.text, ...(result.image ? { image: result.image } : {}) };
}

/** Only explicit user/menu actions reach this owner-only management route. */
export async function localWork(root: string, body?: Record<string, unknown>, request = fetch): Promise<Record<string, unknown>> {
  const settings = JSON.parse(readFileSync(join(root, 'local-integrations.json'), 'utf8'));
  if (!isAbsolute(settings.companionTokenFile || '')) throw new Error('工作陪伴尚未连接本机后台');
  const bridgeRoot = resolve(dirname(settings.companionTokenFile), '..');
  const config = JSON.parse(readFileSync(join(bridgeRoot, 'config.json'), 'utf8'));
  const token = config.consoleToken || readFileSync(join(bridgeRoot, 'state/console-token'), 'utf8').trim();
  const port = Number(config.consolePort) || 3100;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('后台端口无效');
  const response = await request('http://127.0.0.1:' + port + '/api/work-companion', {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Console-Token': token },
    body: body ? JSON.stringify({ ...body, source: 'desktop' }) : undefined, signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok || result.ok !== true) throw new Error(String(result.error || '工作模式操作失败，请重启机器人后台'));
  return result;
}
