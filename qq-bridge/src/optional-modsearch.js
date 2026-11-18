import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const runFile = promisify(execFile);

export function optionalModsearch({dshHome = process.env.DSH_HOME || path.join(os.homedir(),'.dsh'), profile = process.env.DSH_PROFILE || 'desktop'} = {}) {
  const anchor = path.join(dshHome,'profiles',profile,'package.json');
  try {
    const doc = JSON.parse(fs.readFileSync(anchor,'utf8'));
    if (!doc.dsh?.profile?.bundles?.includes('@liustack/modsearch')) return null;
    const entry = createRequire(anchor).resolve('@liustack/modsearch/package.json');
    const cli = path.join(path.dirname(entry),'dist/main.js');
    return fs.existsSync(cli) ? cli : null;
  } catch { return null; }
}

export async function searchModsearch(query, {cli, run = runFile, maxResults = 5, timeoutMs = 55000} = {}) {
  if (!cli) throw new Error('ModSearch 尚未启用或安装不完整');
  const limit = Math.min(5, Math.max(1, Number(maxResults) || 5));
  // Pass arguments directly, never through a shell; user queries cannot become commands.
  let stdout;
  try {
    ({stdout} = await run(process.execPath,[cli,'-q',String(query).slice(0,120),'--source','web','--max-results',String(limit),'--timeout','35000','--deadline',String(timeoutMs)],{
      windowsHide:true,timeout:timeoutMs+3000,maxBuffer:2*1024*1024,encoding:'utf8',
      env:process.versions.electron ? {...process.env,ELECTRON_RUN_AS_NODE:'1'} : process.env
    }));
  } catch { throw new Error('ModSearch 搜索失败或超时；可在后台关闭后使用原有搜索'); }
  let entry;
  try { entry = JSON.parse(stdout)?.results?.[0]; } catch {}
  if (!entry || !['ok','degraded'].includes(entry.status) || !Array.isArray(entry.items)) throw new Error('ModSearch 暂无可用结果；请稍后再试，避免重复搜索');
  const results = entry.items.filter(item => {
    try { const u = new URL(item.url); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
  }).slice(0,limit).map(item => ({title:String(item.title || item.url).slice(0,200),url:String(item.url).slice(0,2000),snippet:String(item.snippet || '').slice(0,500)}));
  return {query,provider:'modsearch',results,...(entry.status === 'degraded' ? {note:'搜索源降级，结果仅作参考'} : {})};
}
