/** Local speech adapter. The shared service owns the selected voice. */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export function createLocalSpeech(root: string, warn: (message: string) => void = () => {}, request = fetch) {
  const settingsFile = join(root, 'local-voice.json');
  const cache = new Map<string, string>();
  const reports = new Map<string, { status: string; at: number }>();
  let pending = 0;
  let tail = Promise.resolve();
  const settings = (): { enabled: boolean } => {
    try { return { enabled: JSON.parse(readFileSync(settingsFile, 'utf8')).enabled === true }; }
    catch { return { enabled: false }; }
  };
  const voices = async () => {
    const response = await request('http://127.0.0.1:17866/voices', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('请先启动本地语音服务');
    const data = await response.json() as { selected: string; voices: Record<string, string> };
    const options = Object.entries(data.voices || {}).filter(([id, name]) => /^[a-z0-9_-]{1,80}$/.test(id) && typeof name === 'string' && name.length <= 80).map(([id, name]) => ({ id, name }));
    if (!options.some(v => v.id === data.selected)) throw new Error('音色配置无效');
    return { selected: data.selected, voices: options };
  };
  return {
    settings,
    voices,
    async selectVoice(voice: string) {
      const data = await voices();
      if (!data.voices.some(v => v.id === voice)) throw new Error('请选择列表中的音色');
      const response = await request('http://127.0.0.1:17866/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice }), signal: AbortSignal.timeout(120_000) });
      if (!response.ok || (await response.json() as { ok?: boolean }).ok !== true) throw new Error('音色保存失败');
      return { ...data, selected: voice };
    },
    status(id: string) { return reports.get(id) ?? null; },
    report(id: string, status: string) {
      if (!cache.has(id) || !['playing', 'ended', 'error', 'cancelled'].includes(status)) return false;
      reports.set(id, { status, at: Date.now() });
      return true;
    },
    configure(enabled: boolean) {
      mkdirSync(root, { recursive: true });
      writeFileSync(settingsFile, JSON.stringify({ enabled }, null, 2));
      return settings();
    },
    file(id: string) {
      if (!/^[a-f0-9-]{36}\.wav$/.test(id)) return undefined;
      const path = cache.get(id);
      return path && existsSync(path) ? path : undefined;
    },
    async prepare(text: string, foreground = false): Promise<{ speech?: string }> {
      if (!settings().enabled || (pending > 0 && !foreground) || pending >= 2 || !text.trim() || text.length > 300) return {};
      pending++;
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        if (!settings().enabled) return {};
        const response = await request('http://127.0.0.1:17866/synthesize', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }), signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error('synthesis failed');
        const audio = Buffer.from(await response.arrayBuffer());
        if (audio.length < 44 || audio.length > 12_000_000 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw new Error('invalid WAV');
        const directory = join(root, 'voice-cache');
        mkdirSync(directory, { recursive: true });
        const id = randomUUID() + '.wav';
        const file = join(directory, id);
        writeFileSync(file, audio);
        cache.set(id, file);
        reports.set(id, { status: 'ready', at: Date.now() });
        while (cache.size > 12) {
          const oldest = cache.keys().next().value!;
          try { unlinkSync(cache.get(oldest)!); } catch { /* A player may still hold the file. */ }
          cache.delete(oldest);
          reports.delete(oldest);
        }
        return { speech: id };
      } catch {
        warn('[dsh-pet] 本地语音暂不可用，本条只显示文字。');
        return {};
      } finally { pending--; release(); }
    },
  };
}

/** Compare normalized recent phrases, including small wording changes. */
export function repeatedPhrase(text: string, recent: string[]): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const grams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const current = normalize(text);
  return recent.some((previous) => {
    const old = normalize(previous);
    if (current === old) return true;
    const a = grams(current), b = grams(old);
    if (a.size < 4 || b.size < 4) return false;
    const common = [...a].filter((g) => b.has(g)).length;
    return common / (a.size + b.size - common) > 0.6;
  });
}
