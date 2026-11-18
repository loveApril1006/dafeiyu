import fs from 'node:fs';
import path from 'node:path';
export function readQQStartupState(installation, { now = Date.now, isAlive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } } } = {}) {
  const read = name => JSON.parse(fs.readFileSync(path.join(installation, name), 'utf8').replace(/^\uFEFF/, ''));
  let port = 5099;
  try { const ports = read('local-ports.json'); if (Number.isInteger(ports.web) && ports.web > 0 && ports.web < 65536) port = ports.web; } catch {}
  const webUrl = `http://127.0.0.1:${port}/`;
  if (fs.existsSync(path.join(installation, 'runtime-control/qq.stopped'))) return { state: 'stopped', message: 'QQ 上游已关闭，请从大肥鱼管理窗口启动 QQ 后台', webUrl };
  try {
    const state = read('runtime-control/qq-upstream-status.json'), record = read('runtime-control/qq.json');
    const age = now() - Date.parse(state.at);
    if (state.parentPid !== record.pid || !Number.isInteger(record.pid) || age < 0 || age > 45000 || !isAlive(record.pid)) return null;
    return { state: String(state.state).slice(0,60), message: String(state.message).slice(0,400), webUrl };
  } catch { return null; }
}
