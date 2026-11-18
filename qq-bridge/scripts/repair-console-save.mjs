import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const marker = 'console-save-repair-20261028';
const movedControls = new Map([
  ['v2BurstMax', 'burstMaxMessages'],
  ['v2MaxSendMin', 'maxSendPerMinute'],
  ['v2MaxSendHour', 'maxSendPerHour'],
  ['v2MaxMsgChars', 'maxMessageChars'],
]);

function functionRange(source, name) {
  const start = source.indexOf(`async function ${name}() {`);
  if (start < 0) throw new Error(`找不到 ${name}，本修复不适用于这份脚本，未修改任何文件。`);
  const close = /^\}/gm;
  close.lastIndex = start;
  const match = close.exec(source);
  if (!match) throw new Error(`无法确认 ${name} 的边界，未修改任何文件。`);
  return { start, end: match.index + 1 };
}

export function patchConsoleSave(source, html) {
  let next = source.replace(/\r\n/g, '\n');
  const removed = [];
  for (const name of ['loadV2Config', 'saveV2Config']) {
    const { start, end } = functionRange(next, name);
    let section = next.slice(start, end).replace('(w.sleepMinMs || 60000)', '(w.sleepMinMs ?? 60000)');
    section = section.split('\n').filter(line => {
      for (const [id, key] of movedControls) {
        if (new RegExp(`\\bid=["']${id}["']`).test(html)) continue;
        if (!line.includes(`getElementById('${id}')`)) continue;
        const expected = name === 'loadV2Config'
          ? line.trimStart().startsWith(`document.getElementById('${id}').value = `)
          : line.trimStart().startsWith(`${key}: `);
        if (!expected) throw new Error(`控件 ${id} 的代码结构不同，未修改任何文件。`);
        removed.push(`${name}:${id}`);
        return false;
      }
      return true;
    }).join('\n');
    if (!section.includes(marker)) {
      if (name === 'loadV2Config') {
        if (!section.includes('  } catch {}')) throw new Error('读取函数结构不同，未修改任何文件。');
        section = section.replace('  } catch {}', `    return c;
  } catch (error) {
    const msg = document.getElementById('v2ConfigMsg');
    if (msg) {
      msg.textContent = '❌ 参数读取失败：' + (error.message || String(error));
      msg.className = 'meta err';
    }
    return null;
  }`);
        section = section.replace(`async function ${name}() {`, `async function ${name}() {\n  // ${marker}`);
      } else {
        const tail = section.indexOf("  const r = await api('/api/socialV2/config', 'POST', body);");
        if (tail < 0) throw new Error('保存函数结构不同，未修改任何文件。');
        const buildBody = section.slice(section.indexOf('\n') + 1, tail);
        section = `async function saveV2Config() {
  // ${marker}
  const msg = document.getElementById('v2ConfigMsg');
  if (msg) { msg.textContent = '保存中…'; msg.className = 'meta'; }
  try {
${buildBody.split('\n').map(line => '  ' + line).join('\n')}
    const r = await api('/api/socialV2/config', 'POST', body);
    if (!r.ok) throw new Error(r.error || '保存失败');
    const loaded = await loadV2Config();
    if (!loaded) throw new Error('参数已提交，但重新读取失败，请检查页面是否已完整更新');
    for (const key of ['defaultMode', 'lockMode', 'replyEveryMessageWhenActive', 'maxWakePerMinute', 'maxWakePerHour', 'batchWindowMs']) {
      if (Object.prototype.hasOwnProperty.call(body.wake, key) && loaded.wake?.[key] !== body.wake[key]) {
        throw new Error('保存后读回的 ' + key + ' 与提交值不同，请检查后台版本和实际运行目录');
      }
    }
    if (msg) { msg.textContent = '✅ 已保存，唤醒参数已读回核对'; msg.className = 'meta ok'; }
  } catch (error) {
    if (msg) {
      msg.textContent = '❌ 保存未完成：' + (error instanceof TypeError ? '页面控件不完整，请按 Ctrl+F5 重新加载。' : '') + (error.message || String(error));
      msg.className = 'meta err';
    }
  }
}`;
      }
    }
    next = next.slice(0, start) + section + next.slice(end);
  }
  for (const name of ['loadV2Config', 'saveV2Config']) {
    const { start, end } = functionRange(next, name);
    for (const match of next.slice(start, end).matchAll(/getElementById\('([^']+)'\)/g)) {
      if (!new RegExp(`\\bid=["']${match[1]}["']`).test(html)) {
        throw new Error(`页面还缺少 ${match[1]}，需要对应版本的界面，未修改任何文件。`);
      }
    }
  }
  new vm.Script(next, { filename: 'social-v2.js' });
  return { source: next, removed, changed: next !== source.replace(/\r\n/g, '\n') };
}

export function repairConsoleSave(root, { check = false } = {}) {
  const target = path.join(root, 'public/console/social-v2.js');
  const html = fs.readFileSync(path.join(root, 'public/console.html'), 'utf8');
  const original = fs.readFileSync(target, 'utf8');
  const result = patchConsoleSave(original, html);
  if (check || !result.changed) return { ...result, target };
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const backup = path.join(root, 'state/maintenance-backups', `console-save-${suffix}`, 'social-v2.js');
  const temp = `${target}.${suffix}.tmp`;
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
  try {
    fs.writeFileSync(temp, result.source, 'utf8');
    for (let attempt = 0; ; attempt++) {
      try { fs.renameSync(temp, target); break; }
      catch (error) {
        if (attempt >= 3 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80 * (attempt + 1));
      }
    }
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return { ...result, target, backup };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const index = process.argv.indexOf('--root');
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const bases = index >= 0 ? [path.resolve(process.argv[index + 1])] : [scriptDir, path.dirname(scriptDir), process.cwd()];
    const candidates = [...new Set(bases.flatMap(base => [base, path.join(base, 'qq-bridge')]))];
    const root = candidates.find(candidate => fs.existsSync(path.join(candidate, 'public/console/social-v2.js')) && fs.existsSync(path.join(candidate, 'public/console.html')));
    if (!root) throw new Error('未找到安装目录。请将修复文件夹放进安装根目录，或用 --root 指定 qq-bridge 所在目录。');
    const result = repairConsoleSave(root, { check: process.argv.includes('--check') });
    console.log(`目标：${result.target}`);
    console.log(result.changed ? (process.argv.includes('--check') ? '检测到需要修复的保存脚本。' : '保存按钮修复完成。') : '保存脚本已修复，无需重复修改。');
    if (result.backup) console.log(`原脚本备份：${result.backup}`);
    console.log('本工具只修改界面脚本，不改 config.json、聊天记录、人格、记忆或账号。');
    console.log('请在后台按 Ctrl+F5，重新将唤醒上限设为 0/0、合并窗口设为 1000，再点击保存。');
    console.log('成功时会显示“已保存，唤醒参数已读回核对”。');
  } catch (error) {
    console.error(`修复未完成：${error.message}`);
    process.exitCode = 1;
  }
}
