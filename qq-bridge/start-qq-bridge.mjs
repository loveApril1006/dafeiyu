/**
 * 适配桌面版 DeepSeek Harness 的桥接启动器。
 *
 * 桌面版 DSH 启动 Web 应用时固定传 `--port 0`（由系统分配随机端口），
 * 所以 config.json 里写死的 dsh.baseUrl 会在 DSH 每次重启后失配。
 * 这里在启动桥接前自动发现当前 DSH Web 地址并写回 config.json。
 *
 * 发现顺序：
 *   1. 环境变量 DSH_WEB_URL（从 DSH 内部启动时天然可用）
 *   2. 本机正在监听的 DeepSeek Harness 端口，逐个探测是否是 DSH Web 界面
 *   3. 以上都失败则沿用 config.json 里的值（DSH 没开时桥接仍能起，只是连不上）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(ROOT, 'config.json');

function log(msg) { console.log(`[launcher] ${msg}`); }

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch (error) {
    log(`读取 config.json 失败：${error.message}`);
    process.exit(1);
  }
}

function listeningPorts() {
  const cmd = [
    "$ErrorActionPreference='SilentlyContinue'",
    "Get-Process -Name 'DeepSeek Harness' | ForEach-Object {",
    '  Get-NetTCPConnection -State Listen -OwningProcess $_.Id',
    '} | Select-Object -ExpandProperty LocalPort -Unique',
  ].join('\n');
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    });
    return [...new Set(out.split(/\r?\n/).map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0 && n < 65536))];
  } catch {
    return [];
  }
}

async function looksLikeDsh(port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal });
    if (!res.ok) return false;
    const html = (await res.text()).slice(0, 4000);
    return /deepseek/i.test(html) || /__DSH_BOOT__/.test(html);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverBaseUrl() {
  const fromEnv = process.env.DSH_WEB_URL;
  if (fromEnv && /^https?:\/\//.test(fromEnv)) {
    log(`使用环境变量 DSH_WEB_URL=${fromEnv}`);
    return fromEnv.replace(/\/+$/, '');
  }
  const ports = listeningPorts();
  for (const port of ports) {
    if (await looksLikeDsh(port)) {
      const url = `http://127.0.0.1:${port}`;
      log(`发现 DSH Web 端口 ${port}`);
      return url;
    }
  }
  return null;
}

function syncBaseUrl(cfg, url) {
  const current = String(cfg?.dsh?.baseUrl ?? '');
  if (!url || current.replace(/\/+$/, '') === url) return false;
  cfg.dsh = { ...(cfg.dsh ?? {}), baseUrl: url };
  const tmp = `${CONFIG}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, CONFIG);
  log(`config.json dsh.baseUrl 已更新：${current || '(空)'} -> ${url}`);
  return true;
}

const cfg = readConfig();
const baseUrl = await discoverBaseUrl();
if (baseUrl) syncBaseUrl(cfg, baseUrl);
else log(`未能发现 DSH Web 地址，沿用 config.json 的 ${cfg?.dsh?.baseUrl ?? '(空)'}；DSH 未运行时属正常`);

// 同一进程内拉起桥接，避免依赖 PATH 里的 node（桌面版不提供独立 node.exe）。
await import(pathToFileURL(path.join(ROOT, 'src', 'bridge.js')).href);
