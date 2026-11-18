import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { NodeApiClient, isLoopbackBase } from '../qq-bridge/src/dsh-client.js';

// Desktop DSH uses a new port after a restart. Discover it without changing the QQ configuration.
export async function getDshConnection() {
  const installation = fileURLToPath(new URL('../', import.meta.url));
  const portable = fs.existsSync(path.join(installation, 'full-release.json')) || fs.existsSync(path.join(installation, 'voice-release.json'));
  if (portable) { process.env.DSH_HOME = path.join(installation, 'engine-home'); process.env.DSH_PROFILE = 'web'; }
  const cfg = JSON.parse(fs.readFileSync(new URL('../qq-bridge/config.json', import.meta.url), 'utf8')).dsh;
  if (!isLoopbackBase(cfg.baseUrl)) throw new Error('桌宠接口只允许连接本机 DSH');
  const connect = async (baseUrl) => {
    try {
      const api = new NodeApiClient(baseUrl, 30_000, {});
      const cookie = await api.ensureAuth();
      const res = await fetch(new URL('/', baseUrl), { headers: { cookie }, signal: AbortSignal.timeout(1500) });
      if (res.ok && /deepseek|__DSH_BOOT__/i.test((await res.text()).slice(0, 8000))) return { baseUrl, api, cookie };
    } catch { /* A previous desktop port may no longer be listening. */ }
    return null;
  };
  const current = await connect(cfg.baseUrl);
  if (current) return current;
  if (portable) throw new Error('本安装的DSH尚未就绪，请在大肥鱼管理窗口点击一键启动，或检查logs/engine-error.log；不会连接另一套DSH');
  const script = "Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | ForEach-Object {Get-NetTCPConnection -State Listen -OwningProcess $_.Id -ErrorAction SilentlyContinue} | Select-Object -ExpandProperty LocalPort -Unique";
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  for (const port of [...new Set(output.trim().split(/\s+/).map(Number))]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
    const found = await connect(`http://127.0.0.1:${port}`);
    if (found) return found;
  }
  throw new Error('DSH 尚未就绪，请先打开 DeepSeek Harness，再启动桌宠。');
}
