/**
 * 热切换 QQ 桥接使用的 DSH 模型（不重启桥接、不重启 DSH）。
 *
 * 用法：
 *   node switch-model.mjs                 # 只看当前模型与可选清单
 *   node switch-model.mjs deepseek-v4-pro # 按模型名切（provider 唯一匹配时）
 *   node switch-model.mjs siliconflow zai-org/GLM-5.3-Flash  # 显式 provider + model（两个参数）
 *
 * 生效时机：已在运行的 QQ 会话在下一条消息重新 selectModel。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:3100';

function token() {
  try {
    return fs.readFileSync(path.join(ROOT, 'state', 'console-token'), 'utf8').trim();
  } catch {
    console.error('读不到 state/console-token：桥接可能没在运行');
    process.exit(1);
  }
}

async function call(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'X-Console-Token': token(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

const target = process.argv[2];
const current = await call('GET', '/api/dsh/model');
if (!current.ok) {
  console.error(`读取当前模型失败（HTTP ${current.status}）：${current.json?.error ?? ''}`);
  process.exit(1);
}
const cur = current.json;

if (!target) {
  console.log(`当前：${cur.provider}/${cur.model}，思考强度 ${cur.reasoningEffort}`);
  console.log('用 `node switch-model.mjs <模型名>` 切换；模型清单见控制台「模型与强度」或 /api/dsh/model。');
  process.exit(0);
}

// 两个参数 = <provider> <model>；一个参数 = 当前 provider 下的模型名。
// 不能按 “/” 拆：模型 id 自身可能带斜杠（如 zai-org/GLM-5.3-Flash）。
const hasProvider = typeof process.argv[3] === 'string' && process.argv[3].trim() !== '';
const provider = hasProvider ? String(target).trim() : cur.provider;
const model = hasProvider ? String(process.argv[3]).trim() : target;

const r = await call('POST', '/api/dsh/model', { provider, model });
if (!r.ok) {
  console.error(`切换失败（HTTP ${r.status}）：${r.json?.error ?? ''}`);
  if (Array.isArray(r.json?.models)) console.error(`该 provider 下可用：${r.json.models.join(', ')}`);
  process.exit(1);
}
console.log(`已切换为 ${r.json.provider}/${r.json.model}（下一条消息生效）`);