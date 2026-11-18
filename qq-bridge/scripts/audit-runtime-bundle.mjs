import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath}from'node:url';
export const RUNTIME_ENTRIES=['qq-bridge/start-qq-bridge.mjs','qq-bridge/src/bridge.js','qq-bridge/companion/companion-service.mjs','qq-bridge/companion/douyin-service.mjs','qq-bridge/integrations/douyin-agent-upstream/app.mjs','qq-bridge/plugins/qq-agent-presets/qq-compaction.mjs'];
export const REQUIRED_RUNTIME_ASSETS=['qq-bridge/integrations/douyin-agent-upstream/model-errors.mjs','qq-bridge/integrations/douyin-standalone/dist/index.html','qq-bridge/integrations/creative-standalone/dist/image-adapters.mjs','qq-bridge/integrations/creative-standalone/assets/image-defaults.json','qq-bridge/integrations/creative-standalone/assets/reference-defaults/manifest.json','qq-bridge/integrations/bili-pond-upstream/lib/shared-video-reader.py','qq-bridge/integrations/bili-pond-upstream/lib/shared-audio-reader.py','qq-bridge/companion/qzone-autopost.py','qq-bridge/companion/qzone_transport.py'];
// Full-edition launch and dynamic adapter closure.
RUNTIME_ENTRIES.push(...["official-qq.mjs","qq-framework.mjs","qq-gateway.mjs","configure-full.mjs","model-settings.mjs","engine-launch.mjs","desktop-pet/configure-local.mjs","desktop-pet/pet-registration.mjs","qq-bridge/release-profile.mjs","qq-bridge/integrations/creative-standalone/dist/image-adapters.mjs"]);
REQUIRED_RUNTIME_ASSETS.push(...["runtime/node.exe","engine/DeepSeek Harness.exe","engine/resources/app.asar","GPT-SoVITS/runtime/python.exe","GPT-SoVITS/pet_server.py","GPT-SoVITS/tools/voice_engine.py","GPT-SoVITS/tools/voice_lifecycle.py","GPT-SoVITS/tools/voice_worker.py","local-tts/runtime/python.exe","qq-bridge/bin/ffmpeg.exe"]);
// PowerShell entry points and their dot-sourced helper are runtime dependencies too.
REQUIRED_RUNTIME_ASSETS.push('Runtime-Common.ps1','qq-framework.mjs','Manage-QQFramework.ps1','Connect-QQBridge.ps1','Manage-Gateway.ps1','qq-gateway.mjs','GPT-SoVITS/Start-GPT-SoVITS.ps1','GPT-SoVITS/Voice-Service-Common.ps1','GPT-SoVITS/Restart-GPT-SoVITS.ps1');
function checkEngineArchive(root){
 const file=path.join(root,'engine/resources/app.asar');if(!fs.existsSync(file))return[];
 const fd=fs.openSync(file,'r');try{const head=Buffer.alloc(16);fs.readSync(fd,head,0,16,0);const length=head.readUInt32LE(12);if(length<1||length>64*1024*1024)throw Error('ASAR header length');const buffer=Buffer.alloc(length);if(fs.readSync(fd,buffer,0,length,16)!==length)throw Error('ASAR header truncated');const tree=JSON.parse(buffer.toString('utf8')),errors=[];
  for(const relative of ['dsh/package.json','dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js']){let entry=tree;for(const part of relative.split('/'))entry=entry?.files?.[part];if(!entry)errors.push('引擎归档缺少 '+relative);else if(entry.unpacked&&!fs.existsSync(file+'.unpacked/'+relative))errors.push('引擎归档外置文件缺失 '+relative);}
  return errors;
 }catch(error){return ['引擎ASAR归档不可读取：'+error.message];}finally{fs.closeSync(fd);}
}
export function auditRuntimeBundle({root,files,entries=RUNTIME_ENTRIES}){
 if(typeof vm.SourceTextModule!=='function')throw Error('依赖审计需要 node --experimental-vm-modules');
 const available=files?new Set(files):null,missing=new Map(),seen=new Set(),queue=[...entries],consoleErrors=[],archiveErrors=checkEngineArchive(root);
 const exists=name=>available?available.has(name):fs.existsSync(path.join(root,name));
 const report=(name,from)=>{if(!missing.has(name))missing.set(name,new Set());missing.get(name).add(from);};
 const requireAsset=(name,from)=>{if(!exists(name))report(name,from);};
 for(const file of REQUIRED_RUNTIME_ASSETS)requireAsset(file,'运行资源清单');
 const consoleHtml='qq-bridge/public/console.html',consoleJs='qq-bridge/public/console/social-v2.js';
 for(const file of [consoleHtml,consoleJs])requireAsset(file,'后台保存界面');
 if(fs.existsSync(path.join(root,consoleHtml))&&fs.existsSync(path.join(root,consoleJs))){
  const html=fs.readFileSync(path.join(root,consoleHtml),'utf8'),source=fs.readFileSync(path.join(root,consoleJs),'utf8');
  const ids=new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]));
  for(const name of ['loadV2Config','saveV2Config']){
   const start=source.indexOf(`async function ${name}() {`),close=/^\}/gm;close.lastIndex=start;
   const end=start<0?null:close.exec(source);
   if(!end){consoleErrors.push(`${name} 缺失`);continue;}
   for(const m of source.slice(start,end.index).matchAll(/getElementById\('([^']+)'\)/g)){
    if(!ids.has(m[1]))consoleErrors.push(`${name} 引用了页面不存在的控件 #${m[1]}`);
   }
  }
 }
 const manifest='qq-bridge/integrations/creative-standalone/assets/reference-defaults/manifest.json';
 if(fs.existsSync(path.join(root,manifest))){
  const doc=JSON.parse(fs.readFileSync(path.join(root,manifest),'utf8').replace(/^\uFEFF/,''));
  if(!Array.isArray(doc.images)||doc.images.length!==4)throw Error('默认角色参考图库应包含四张图片');
  for(const row of doc.images){const name=path.posix.normalize(path.posix.join(path.posix.dirname(manifest),row.file));if(!name.startsWith(path.posix.dirname(manifest)+'/'))throw Error('参考图清单路径越界');requireAsset(name,manifest);}
 }
 while(queue.length){
  const name=queue.pop();if(seen.has(name))continue;seen.add(name);requireAsset(name,'入口或导入依赖');
  const disk=path.join(root,name);if(!fs.existsSync(disk)||!['.js','.mjs','.cjs'].includes(path.extname(name))||name.includes('/node_modules/'))continue;
  const source=fs.readFileSync(disk,'utf8');let imports;
  try{imports=[...new vm.SourceTextModule(source,{identifier:name}).dependencySpecifiers];}catch(error){throw Error('运行文件语法检查失败：'+name+' '+error.message);}
  // Static imports are parsed by Node itself, so examples and comments cannot
  // masquerade as dependencies. Also collect literal lazy imports/require.
  for(const m of source.matchAll(/\b(?:import|require)\s*\(\s*['"](\.[^'"\r\n]+)['"]\s*\)/g))imports.push(m[1]);
  for(const spec of imports){
   if(!spec.startsWith('.'))continue;
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(name),decodeURIComponent(spec.split(/[?#]/)[0])));
   if(target.startsWith('../')||path.posix.isAbsolute(target))throw Error('运行导入越界：'+name);
   const candidates=[target,target+'.js',target+'.mjs',target+'.cjs',target+'.json',target+'/index.js'];
   const resolved=candidates.find(exists)||candidates.find(p=>fs.existsSync(path.join(root,p)))||target;
   if(!exists(resolved))report(resolved,name);
   if(!resolved.includes('/node_modules/'))queue.push(resolved);
  }
 }
 return {ok:missing.size===0&&consoleErrors.length===0&&archiveErrors.length===0,checkedModules:seen.size,archiveErrors,modules:[...seen].sort(),consoleErrors:[...new Set(consoleErrors)],missing:[...missing].sort(([a],[b])=>a.localeCompare(b)).map(([file,from])=>({file,from:[...from]}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(process.argv[2]||path.join(fileURLToPath(new URL('../..',import.meta.url))));
 const index=process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3],'utf8')):null;
 const {modules,...result}=auditRuntimeBundle({root,files:index?.map(v=>typeof v==='string'?v:v.file)});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
}
