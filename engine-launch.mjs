// Installation-local Web startup. Keep invocation settings out of the user's
// model/profile patch, and avoid depending on app CLI flag availability.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function within(root, relative) {
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) throw Error('启动文件路径越界');
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    try { if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('启动配置路径包含目录链接，未修改'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return file;
}

export function prepareEngineLaunch(root) {
  root = path.resolve(root);
  const cfg = JSON.parse(fs.readFileSync(within(root, 'qq-bridge/config.json'), 'utf8').replace(/^\uFEFF/, ''));
  const url = new URL(cfg.dsh.baseUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('聊天引擎地址必须是本机HTTP根地址');
  const port = Number(url.port || 80);
  const manifest = within(root, 'engine-home/profiles/web/package.json');
  let original;
  try { original = fs.readFileSync(manifest); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const pkg = original ? JSON.parse(original.toString('utf8').replace(/^\uFEFF/, '')) : { name: 'xiaoge-web', private: true, dependencies: {} };
  if (pkg.dsh?.profile?.bundles !== undefined && !Array.isArray(pkg.dsh.profile.bundles)) throw Error('DSH Web配置中的bundles格式错误，未覆盖');
  const before = pkg.dsh?.profile?.bundles || [];
  const otherApps = new Set(['@deepseek-ai/dsh-headless','@deepseek-ai/dsh-acp-app','@deepseek-ai/dsh-sdk-app']);
  const core = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];
  let repaired = false;
  if (core.some(bundle => !before.includes(bundle)) || before.some(bundle => otherApps.has(bundle))) {
    if (original) {
      const backup = within(root, `runtime-control/engine-profile-backups/${Date.now()}/package.json`);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(backup, original, { mode: 0o600 });
    }
    pkg.dsh ??= {}; pkg.dsh.profile ??= {};
    // These are alternative applications with their own argument parsers. They
    // belong in their own profiles; loading one here can reject Web flags.
    pkg.dsh.profile.bundles = [...core, ...before.filter(bundle => !core.includes(bundle) && !otherApps.has(bundle))];
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    const temporary = manifest + '.launch-tmp-' + process.pid;
    fs.writeFileSync(temporary, JSON.stringify(pkg, null, 2) + '\n');
    fs.renameSync(temporary, manifest);
    repaired = true;
  }
  const patch = [
    { id: 'webserver', config: { host: url.hostname === '[::1]' ? '::1' : '127.0.0.1', port, compression: 'gzip', compressionLevel: 1, compressionThresholdBytes: 1024 } },
    { id: 'web-runtime', config: { openBrowser: false, printUrl: true, surfaceContext: true } },
  ];
  const patchFile = within(root, 'runtime-control/engine-launch.patch.json');
  fs.mkdirSync(path.dirname(patchFile), { recursive: true });
  fs.writeFileSync(patchFile, JSON.stringify(patch, null, 2) + '\n');
  return { repaired, port };
}

export async function probeEngine(root) {
  process.env.DSH_HOME = path.join(path.resolve(root), 'engine-home');
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'qq-bridge/config.json'), 'utf8').replace(/^\uFEFF/, ''));
  const { NodeApiClient, unwrap } = await import('./qq-bridge/src/dsh-client.js');
  const client = new NodeApiClient(cfg.dsh.baseUrl, 2500, { token: cfg.dsh.authToken, tokenExplicit: Boolean(cfg.dsh.authToken) });
  unwrap(await client.callUnary('account.getState', {}, AbortSignal.timeout(2500)), 'account/getState');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, root] = process.argv.slice(2);
    if (!root) throw Error('缺少安装目录');
    if (action === 'prepare') {
      const result = prepareEngineLaunch(root);
      if (result.repaired) console.log('已补齐DSH Web核心注册（原配置已备份）');
    } else if (action === 'probe') {
      await probeEngine(root);
      console.log('DSH接口已就绪');
    } else throw Error('未知启动检查操作');
  } catch (error) {
    // Do not print raw RPC/HTTP errors or credentials in launcher dialogs.
    if (process.argv[2] === 'probe') console.log('DSH接口暂未就绪（进程可能仍在加载或认证尚未完成）');
    else console.error(error.message);
    process.exitCode = 1;
  }
}
