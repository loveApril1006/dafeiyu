import fs from 'node:fs';
import path from 'node:path';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);

export function chooseProcess(list, mainPids = null) {
  const eligible = (list || []).filter(p => Number.isInteger(p.pid) && p.pid > 0 && p.pid <= 4194304);
  if (eligible.some(p => p.connected || p.injected || p.loggedIn)) return null;
  let candidates = eligible.filter(p => p.status === 'available');
  if (Array.isArray(mainPids)) candidates = candidates.filter(p => mainPids.includes(p.pid));
  // Never guess which of several QQ accounts/processes the user wants to control.
  return candidates.length === 1 ? candidates[0] : null;
}

export function createUpstream(root, { request = fetch, launchClient, inspectClient, port = 5099, now = Date.now } = {}) {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''));
  let bearer = '', loginFingerprint = '', launches = 0, nextLaunchAt = 0;
  const attempted = new Set();
  const waiting = new Map();
  const waitFor = (process, phase) => {
    const previous = waiting.get(process.pid);
    if (!previous || previous.phase !== phase) waiting.set(process.pid, { phase, at: now() });
    return now() - waiting.get(process.pid).at;
  };
  const state = (status, message, online = false) => ({ state: status, message, online, at: new Date(now()).toISOString() });
  const web = async (route, body, timeoutMs = 12000) => {
    const response = await request('http://127.0.0.1:' + port + '/api/' + route, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
    });
    const data = await response.json();
    if (response.status === 401) { bearer = ''; loginFingerprint = ''; }
    if (data.consentRequired) return { gate: 'consent' };
    if (data.mustChangePassword) return { gate: 'password' };
    if (!response.ok) throw new Error('web-request-failed');
    return data;
  };
  async function login() {
    if (bearer) return true;
    let password, auth;
    try { password = read('安装信息.json').qqWebPassword; auth = read('SnowLuma/config/webui.json'); } catch { return false; }
    if (!password || auth.totp?.enabled) return false;
    const fingerprint = String(auth.passwordHash);
    if (fingerprint === loginFingerprint) return false;
    loginFingerprint = fingerprint;
    const expected = Buffer.from(auth.passwordHash || '', 'hex');
    const actual = scryptSync(password, Buffer.from(auth.passwordSalt || '', 'hex'), 64, { N: 16384, r: 8, p: 1 });
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
    const result = await web('login', { password });
    if (!result.success || !result.token || result.needsTotp || result.mustChangePassword) return false;
    bearer = result.token; return true;
  }
  return {
    async tick() {
      try {
        const cfg = read('qq-bridge/config.json');
        let gatewayUnauthorized = false;
        const api = new URL(cfg.snowluma?.httpUrl || 'http://127.0.0.1:3000');
        if (api.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname) || api.username || api.password || api.search || api.hash) throw new Error('nonlocal');
        try {
          const result = await request(new URL('get_status', api.href.endsWith('/') ? api : api.href + '/'), {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(cfg.snowluma?.accessToken ? { Authorization: 'Bearer ' + cfg.snowluma.accessToken } : {}) }, body: '{}', signal: AbortSignal.timeout(2500), redirect: 'error',
          });
          const data = await result.json();
          gatewayUnauthorized = result.status === 401 || result.status === 403;
          if (result.ok && data.data?.online === true && data.data?.good !== false) return state('online', 'QQ上游已连接', true);
        } catch { /* Web panel and QQ upstream are independent services. */ }
        if (!await login()) return state('web-login-required', 'SnowLuma网页已启动；请打开5099登录后台，再选择QQ进程加载连接');
        const agreements = await web('agreements');
        if (agreements.consentRequired || agreements.gate === 'consent') return state('consent-required', '请在5099网页阅读并确认协议；确认后会自动继续连接QQ');
        if (agreements.gate) return state('web-login-required', '请在5099网页完成密码修改或安全验证');
        const processes = await web('processes');
        if (processes.gate) return state('web-login-required', '请在5099网页完成登录和安全验证');
        const list = processes.list || [];
        let inspection = null;
        if (inspectClient) {
          try { const value = await inspectClient(); inspection = Array.isArray(value) ? {mainPids:value,unknownPids:[]} : value; }
          catch { return state('process-inspect-failed', 'Windows QQ进程检查失败；请让QQ与大肥鱼使用相同用户和权限，然后重新启动QQ后台'); }
          if (!Array.isArray(inspection?.mainPids)) return state('process-inspect-failed', 'QQ进程检查未返回有效结果，请重新启动QQ后台');
        }
        if (!list.length) {
          if (inspection?.mainPids.length || inspection?.unknownPids?.length) return state('process-not-detected', 'Windows检测到QQ，但SnowLuma进程列表为空；请在5099刷新进程，并检查两者是否同一用户、相同管理员权限及QQ版本是否兼容');
          if (launches < 3 && now() >= nextLaunchAt && launchClient) {
            launches++; nextLaunchAt = now() + 30000;
            try { await launchClient(); } catch { return state('qq-client-required', '未找到或无法启动电脑版QQ，请手动打开QQ；启动检查稍后会有限重试'); }
          }
          return state('qq-login-required', 'QQ客户端已尝试启动；请在QQ窗口扫码登录，登录后会自动连接');
        }
        if (list.some(p => p.loggedIn)) return gatewayUnauthorized
          ? state('gateway-auth', 'QQ已登录，但QQ接口令牌不匹配；请检查本安装的OneBot网络配置与桥接令牌，不要连接另一套旧版网关')
          : state('onebot-not-ready', 'QQ已登录，但OneBot接口未就绪；请检查本安装的HTTP/WS端口，5099网页可访问并不代表QQ网关已启动');
        const loading = list.find(p => p.status === 'loading' || p.loadPending);
        if (loading) return waitFor(loading, 'loading') >= 30000 || loading.loadPending
          ? state('load-timeout', 'QQ进程加载超时；可能仍在后台加载，请检查旧版SnowLuma、QQ与后台的用户/权限及QQ版本；不要重复加载')
          : state('connecting', 'SnowLuma正在加载QQ进程，等待加载结果（最多30秒后给出诊断）');
        if (list.some(p => p.connected)) return state('qq-login-required', 'QQ连接组件已连通，等待QQ账号扫码登录；登录后桥接自动重连');
        const injected = list.find(p => p.injected || p.status === 'connecting');
        if (injected) return waitFor(injected, 'pipe') >= 45000
          ? state('pipe-timeout', 'QQ组件尚未连回SnowLuma；请正常退出旧版SnowLuma和QQ后重新打开，确认同一用户/权限及QQ版本兼容。不会反复加载')
          : state('connecting', 'QQ组件已加载，正在等待QQ进程连接；这一步尚未证明网关可用');
        if (list.some(p => p.status === 'error')) return state('load-failed', 'QQ进程加载失败；请在SnowLuma进程页查看错误，检查权限、版本与旧版残留，不会自动重复加载');
        const mainPids = inspection ? inspection.mainPids : null;
        const target = chooseProcess(list, mainPids);
        if (!target) return state('select-process', '发现多个QQ进程或连接异常，请在5099的进程页面选择需要连接的QQ');
        if (attempted.has(target.pid)) return state('load-failed', '已尝试加载QQ连接，请在5099查看进程状态；不会反复加载或切换账号');
        attempted.add(target.pid);
        try {
          const result = await web('processes/' + target.pid + '/load', {}, 35000);
          return result.success ? state('connecting', 'QQ加载请求已完成，继续确认进程连接、账号登录和OneBot就绪') : state('load-failed', 'QQ连接组件加载失败，请在SnowLuma进程页面查看原因');
        } catch { return state('load-timeout', 'QQ加载未在限定时间完成；请检查SnowLuma进程页和日志，不会重复加载同一进程'); }
      } catch { return state('unavailable', 'QQ上游尚未就绪，请检查5099网页、QQ客户端和logs中的qq-upstream日志'); }
    },
  };
}

async function main() {
  const args = process.argv.slice(2), root = path.resolve(args[args.indexOf('--root') + 1] || '.'), port = Number(args[args.indexOf('--port') + 1]) || 5099;
  const parent = Number(args[args.indexOf('--parent') + 1]) || 0, once = args.includes('--once');
  if (port < 1 || port > 65535 || !fs.existsSync(path.join(root, 'SnowLuma/index.mjs'))) throw new Error('invalid installation');
  const directory = path.join(root, 'runtime-control'); fs.mkdirSync(directory, { recursive: true });
  const upstream = createUpstream(root, { port, inspectClient: async () => {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'Start-QQClient.ps1'), '-InspectDetails'], { windowsHide: true, timeout: 15000 });
    return JSON.parse(stdout.trim());
  }, launchClient: async () => {
    await exec('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'Start-QQClient.ps1')], { windowsHide: true, timeout: 15000 });
  } });
  let previous = '';
  for (;;) {
    if (!once && parent) { try { process.kill(parent, 0); } catch { break; } }
    if (!once && parent) {
      try { const current = JSON.parse(fs.readFileSync(path.join(directory, 'qq.json'), 'utf8')); if (current.pid !== parent) break; } catch { break; }
    }
    if (!once && fs.existsSync(path.join(directory, 'qq.stopped'))) break;
    const result = await upstream.tick();
    fs.writeFileSync(path.join(directory, 'qq-upstream-status.json'), JSON.stringify({ ...result, parentPid: parent }));
    if (once) { console.log(JSON.stringify(result)); return; }
    if (result.state !== previous) { console.log(result.message); previous = result.state; }
    await new Promise(r => setTimeout(r, 8000));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('QQ连接助手未能启动，请查看QQ后台。'); process.exitCode = 1; });
