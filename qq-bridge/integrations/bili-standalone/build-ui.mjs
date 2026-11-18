import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {adaptPondClient} from './client-compat.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
let host=fs.readFileSync(path.join(root,'../bili-pond-upstream/index.js'),'utf8').replace(/\r\n/g,'\n');
const hostRoute='const hostPatchFile = () => {';
for(const marker of [hostRoute,'refreshCfg()          //','try { if (readJson(dutyStateFile, {}).lastError) bumpState({ lastError: null }) }'])if(host.split(marker).length!==2)throw new Error('鱼塘独立模型宿主边界不匹配');
host=host.replace(hostRoute,hostRoute+"\n    const isolated = ctx.get?.('xiaogePondRoutes'); if (isolated) return isolated;")
 .replace('refreshCfg()          //',"ctx.get?.('xiaogePondValidate')?.();\n    refreshCfg()          //")
 .replace('try { if (readJson(dutyStateFile, {}).lastError) bumpState({ lastError: null }) }',"try { bumpState({ lastError: null, xiaogeLastSuccessAt: new Date().toISOString() }) }");
const memoryPrompt='const dutyPrompt = promptFor(why)';
if(host.split(memoryPrompt).length!==2||host.split('let dutyFinalizing = false').length!==2||host.split("'bili_memory_append', 'bili_diary_write', 'bili_say']").length!==2)throw new Error('鱼塘记忆运行边界不匹配');
host=host.replace(memoryPrompt,"let dutyPrompt = promptFor(why)\n    if(why !== 'guard')try{dutyPrompt += ctx.get?.('xiaogePondMemoryContext')?.() || ''}catch{log('记忆读取暂不可用，本轮继续运行')}")
  .replace(/  let dutyFinalizing = false[^\n]*/,line=>line+"\n  ctx.get?.('xiaogePondMemoryBusy')?.(()=>Boolean(dutyRun)||dutyFinalizing)")
  .replace("'bili_memory_append', 'bili_diary_write', 'bili_say']","'bili_memory_append', 'bili_diary_write', 'bili_say', 'bili_memory_note', 'bili_memory_search', 'bili_memory_update']");
fs.writeFileSync(path.join(root,'../bili-pond-upstream/robot-host.js'),host);
let pythonSource=fs.readFileSync(path.join(root,'../bili-pond-upstream/vendor/bilibili-mcp/mcp_server.py'),'utf8');
for(const name of ['bili_memory_append','bili_diary_write']){
 const start=pythonSource.indexOf('async def '+name+'('),docStart=pythonSource.indexOf('"""',start),docEnd=pythonSource.indexOf('"""',docStart+3),insertAt=pythonSource.indexOf('\n',docEnd+3)+1;
 if(start<0||docStart<start||docEnd<docStart||insertAt<=docEnd)throw Error('鱼塘记忆写入工具边界不匹配：'+name);
 pythonSource=pythonSource.slice(0,insertAt)+'    if not _xiaoge_memory_enabled():\n        return json.dumps({"ok": False, "disabled": True, "message": "视频长期记忆已关闭，本条未保存"}, ensure_ascii=False)\n'+pythonSource.slice(insertAt);
}

const pythonExtra=fs.readFileSync(path.join(root,'memory-tools.py'),'utf8');
const pythonMain='if __name__ == "__main__":';
if(pythonSource.split(pythonMain).length!==2)throw new Error('鱼塘记忆MCP入口不匹配');
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist/memory-mcp.py'),pythonSource.replace(pythonMain,pythonExtra+'\n\n'+pythonMain));
const consoleHtml=fs.readFileSync(path.join(root,'../../public/console.html'),'utf8');
const consoleCss=consoleHtml.includes('/console-assets/')?fs.readFileSync(path.join(root,'../../public/console/console.css'),'utf8'):consoleHtml;
const light=consoleCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1];
const dark=consoleCss.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)?.[1];
if(!light||!dark)throw new Error('Robot console theme definitions not found');
const themeCss=`:root{${light}}\n:root[data-theme="dark"]{${dark}}\n`+fs.readFileSync(path.join(root,'robot-theme.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'../../public/console/design-system.css'),'utf8');
await build({entryPoints:[path.join(root,'browser-entry.js')],bundle:true,minify:true,format:'iife',target:'es2020',outfile:path.join(root,'dist/browser.js'),legalComments:'eof',plugins:[{name:'robot-chart-colors',setup(builder){builder.onLoad({filter:/bili-pond-upstream[\\/]client\.js$/},async({path:sourcePath})=>({contents:adaptPondClient(fs.readFileSync(sourcePath,'utf8')).replace("const POND_COLORS = ['#2563eb', '#7c3aed', '#0d9488', '#d97706', '#db2777', '#0891b2']","const POND_COLORS = ['var(--accent)', 'var(--accent-hover)', 'var(--ok)', 'var(--warn-fg)', 'var(--err)', 'var(--accent-soft-fg)']"),loader:'js'}));}}]});
const script=fs.readFileSync(path.join(root,'dist/browser.js'),'utf8').replace(/<\/script/gi,'<\\/script');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>B站鱼塘 · 小鸽子</title><script>try{var t=parent!==window?parent.document.documentElement.dataset.theme:localStorage.getItem('qq-console-theme');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{document.documentElement.dataset.theme='light'}</script><style>${themeCss}</style></head><body><div id="pond-root">正在加载 B站鱼塘…</div><script>${script}</script></body></html>`;
fs.writeFileSync(path.join(root,'dist/index.html'),html);
console.log('QQ Bridge pond workspace built with upstream data and task handlers.');
