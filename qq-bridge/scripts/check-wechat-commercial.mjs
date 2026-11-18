// Read-only check of an explicit unpacked staging directory. Never alters a release.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(fs.readFileSync(path.join(project, 'packaging/wechat-commercial-policy.json'), 'utf8'));
const forbidden = new Set(policy.blockedDirectoryNames.map(value => value.toLowerCase()));
const modules = policy.blockedPythonModules.join('|');
const pythonImport = new RegExp(`(?:^|\\n)\\s*(?:from\\s+(?:${modules})(?:\\b|\\.)|import\\s+[^\\n#]*(?:${modules})\\b)|(?:import_module|__import__)\\(\\s*['"](?:${modules})(?:['"]|\\.)`, 'm');
const runtimeRoots = new Set(['src', 'companion', 'public', 'plugins', 'integrations', 'node_modules']);

export function checkWechatCommercial(staging) {
  const root = fs.realpathSync(staging);
  if (!fs.statSync(root).isDirectory()) throw Error('Staging must be a directory');
  const blockers = [];
  let scannedFiles = 0;
  function visit(directory, relative = '', active = false) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const rel = path.posix.join(relative, entry.name);
      const full = path.join(directory, entry.name);
      const lower = entry.name.toLowerCase();
      if (entry.isSymbolicLink()) { blockers.push({path: rel, reason: 'Symlink/reparse target requires separate review'}); continue; }
      if (entry.isDirectory()) {
        if (forbidden.has(lower)) { blockers.push({path: rel, reason: 'Uncleared WeChat component excluded by release policy'}); continue; }
        if (['.git', '__pycache__'].includes(lower)) continue;
        visit(full, rel, active || runtimeRoots.has(lower));
      } else if (entry.isFile() && active && /\.(?:py|js|mjs|cjs)$/i.test(entry.name)) {
        scannedFiles++;
        if (fs.statSync(full).size > 2 * 1024 * 1024) { blockers.push({path: rel, reason: 'Runtime source too large for this limited scan; review required'}); continue; }
        const source = fs.readFileSync(full, 'utf8');
        if (pythonImport.test(source)) blockers.push({path: rel, reason: 'Runtime import of an uncleared WeChat SDK'});
      }
    }
  }
  visit(root);
  return {
    status: blockers.length ? 'BLOCKED' : 'NO_KNOWN_WECHAT_BLOCKERS',
    staging: root, scannedFiles, blockers,
    limitation: 'Static exclusion check only. Does not detect renamed/copied code, all dynamic imports, third-party transitive dependencies, media rights, patents, platform permission or confer legal/commercial approval. Review the actual final artifact separately.'
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--staging') throw Error('Usage: node scripts/check-wechat-commercial.mjs --staging <unpacked-release-directory>');
    const report = checkWechatCommercial(process.argv[3]);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exitCode = report.blockers.length ? 1 : 0;
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 2;
  }
}
