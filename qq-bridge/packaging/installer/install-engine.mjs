// Offline, allowlisted program updates. User data is never a mirror/delete target.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const atomic=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.xg-'+crypto.randomBytes(5).toString('hex');try{fs.writeFileSync(temp,data,{flag:'wx'});fs.renameSync(temp,file);}finally{try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}};
const mutableFiles=new Set(['external-qq-gateway.json','qq-bridge/default-role.md','qq-bridge/config.json','model-settings.json','local-ports.json','安装信息.json','后台登录信息.txt','xiaoge-install.json','desktop-pet/deployment.json','GPT-SoVITS/pet-voice.json','GPT-SoVITS/GPT_SoVITS/configs/tts_infer.yaml','local-tts/config.json','qq-bridge/companion/companion-persona.txt']);
// Existing user media and storage never become program replacement targets.
const userContentRoots=['user-data/','user-assets/','uploads/','pictures/','images/','memories/','chat-history/','qq-bridge/uploads/','qq-bridge/data/','qq-bridge/user-data/','qq-bridge/public/uploads/','qq-bridge/public/user-assets/','desktop-pet/user-assets/','desktop-pet/user-data/'];
const userContentExtension=/\.(?:png|jpe?g|gif|webp|bmp|avif|heic|heif|tiff?|svg|ico|wav|mp3|flac|ogg|opus|m4a|aac|mp4|webm|mkv|mov|avi|sqlite3?|db|jsonl)$/i;
export function preserveExisting(rel){
 if(/^qq-bridge\/companion\/[^/]+\.(?:jsonc?|ya?ml|txt|env)$/i.test(rel))return true;
 if(userContentRoots.some(root=>rel.startsWith(root))||userContentExtension.test(rel))return true;
 return rel.startsWith('qq-bridge/roles/')||rel.startsWith('qq-bridge/qq-memory-channels/')||rel.startsWith('qq-bridge/audio/')||/^qq-bridge\/dsh\/agent-presets\/[^/]+\/(?:agent\.cordis|preset)\.yml$/.test(rel)||/^qq-bridge\/companion\/[^/]+-data\//.test(rel)||mutableFiles.has(rel)||rel.startsWith('qq-bridge/state/')||rel.startsWith('SnowLuma/config/')||rel.startsWith('SnowLuma/data/')||rel.startsWith('SnowLuma/logs/')||rel.startsWith('GPT-SoVITS/voices/')||rel.startsWith('GPT-SoVITS/GPT_SoVITS/pretrained_models/')||rel.startsWith('qq-bridge/integrations/whisper-models/')||rel.startsWith('logs/')||rel.startsWith('runtime-control/')||rel.startsWith('maintenance/')||rel.startsWith('engine-home/')&&!rel.startsWith('engine-home/electron/')&&!/^engine-home\/profiles\/[^/]+\/node_modules\//.test(rel)||/^qq-bridge\/plugins\/qq-agent-presets\/presets\/.*\.patch\.yml$/.test(rel)||/\.(?:pt|pth|ckpt|safetensors|onnx|gguf|ggml)$/.test(rel);
}
export function detectInstallation(target){
 target=path.resolve(target);const exists=fs.existsSync(target),marker=path.join(target,'xiaoge-install.json');let metadata=null;
 if(fs.existsSync(marker)){try{metadata=json(marker);}catch{throw Error('旧安装信息损坏，未改动文件；请先备份并修复 xiaoge-install.json');}}
 const layout=fs.existsSync(path.join(target,'qq-bridge/config.json'));
 if(!metadata&&fs.existsSync(path.join(target,'.xiaoge-installing')))return{mode:'new',edition:'full',interrupted:false};
 const legacy=layout&&['full-release.json','voice-release.json','basic-release.json','Start-All.ps1'].some(n=>fs.existsSync(path.join(target,n)));
 if(metadata||legacy){if(!layout)throw Error('检测到旧安装，但核心配置不完整；未按新安装覆盖');let version=Number(metadata?.version)||0;for(const n of ['full','voice','basic'])try{version=Math.max(version,Number(json(path.join(target,n+'-release.json')).version)||0);}catch{}return{mode:'update',edition:metadata?.edition||(['full','voice','basic'].find(e=>fs.existsSync(path.join(target,e+'-release.json')))||'legacy'),version,interrupted:fs.existsSync(path.join(target,'.xiaoge-updating'))};}
 if(!exists||fs.readdirSync(target).length===0||fs.existsSync(path.join(target,'.xiaoge-installing')))return{mode:'new',edition:'full',interrupted:false};
 throw Error('此目录包含其他文件，无法确认是大肥鱼安装；请选择旧安装目录或新的空文件夹');
}
function boundary(root,rel,{links=false}={}){
 if(typeof rel!=='string'||!rel||rel.includes('\\')||rel.includes(':')||rel.split('/').some(p=>['','..','.'].includes(p))||path.isAbsolute(rel))throw Error('安装清单包含非法路径');
 const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))throw Error('安装路径越界');let cursor=root;
 for(const part of rel.split('/')){cursor=path.join(cursor,part);try{if(fs.lstatSync(cursor).isSymbolicLink()&&!(links&&cursor===file))throw Error('更新程序路径包含目录链接：'+rel);}catch(e){if(e.code!=='ENOENT')throw e;}}
 return file;
}
function checkRoot(root){if(root===path.parse(root).root||root.startsWith('\\\\'))throw Error('安装目录需要是本机独立文件夹');for(let p=root;p!==path.dirname(p);p=path.dirname(p)){try{if(fs.lstatSync(p).isSymbolicLink())throw Error('安装目录不能经过链接');}catch(e){if(e.code!=='ENOENT')throw e;}}}
function cancel(file){if(file&&fs.existsSync(file)){const e=Error('操作已停止');e.cancelled=true;throw e;}}
async function hashFile(file,cancelFile){const h=crypto.createHash('sha256');for await(const data of fs.createReadStream(file,{highWaterMark:1024*1024})){cancel(cancelFile);h.update(data);}return h.digest('hex');}
export async function verifySource(source,cancelFile){
 source=path.resolve(source);const manifest=json(path.join(source,'payload/bundle-manifest.json')),bytes=fs.readFileSync(path.join(source,'工具/payload-index.json'));if(sha(bytes)!==manifest.fileIndexSha256)throw Error('安装文件索引校验失败');
 const rows=JSON.parse(bytes);let count=0,total=0;const seen=new Set(),verified=new Map();if(rows.length!==manifest.fileCount)throw Error('安装索引缺少文件');
 for(const row of rows){cancel(cancelFile);if(typeof row.file!=='string'||seen.has(row.file.toLowerCase())||!/^[a-f0-9]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.size)||row.size<0)throw Error('安装索引无效或路径重复');seen.add(row.file.toLowerCase());const file=boundary(path.join(source,'payload'),row.file);const stat=fs.statSync(file);if(!stat.isFile()||stat.size!==row.size)throw Error('数据包不完整，请完整解压：'+row.file);if(await hashFile(file,cancelFile)!==row.sha256)throw Error('安装源文件校验失败：'+row.file);verified.set(row.file,row.sha256);total+=stat.size;if(++count%3000===0)console.log('STATUS|3|正在校验完整组件（'+count+'/'+rows.length+'）');}
 if(total!==manifest.totalBytes)throw Error('数据包总大小不正确');let checked=0;const entries=Object.entries(manifest.sha256||{});
 for(const [rel,digest]of entries){cancel(cancelFile);if(verified.get(rel)!==digest)throw Error('关键组件索引不一致：'+rel);if(++checked%400===0)console.log('STATUS|4|正在校验关键程序与模型（'+checked+'/'+entries.length+'）');}
 return{ok:true,files:count,criticalFiles:entries.length};
}
async function copyVerified(source,target,expected,cancelFile){
 fs.mkdirSync(path.dirname(target),{recursive:true});const temp=target+'.xg-install-'+crypto.randomBytes(5).toString('hex'),h=crypto.createHash('sha256');let fd;
 try{fd=fs.openSync(temp,'wx');for await(const chunk of fs.createReadStream(source,{highWaterMark:1024*1024})){cancel(cancelFile);h.update(chunk);fs.writeSync(fd,chunk);}fs.closeSync(fd);fd=undefined;if(h.digest('hex')!==expected)throw Error('源文件校验失败：'+path.basename(source));cancel(cancelFile);fs.renameSync(temp,target);}finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
const migrationFiles=['qq-bridge/config.json','qq-bridge/state/current-role.json','qq-bridge/roles/大肥鱼.md','xiaoge-install.json','engine-home/profiles/web/package.json','engine-home/profiles/web/cordis.patch.yml','engine-home/dsh-pet/main-config.jsonc','engine-home/dsh-pet/local-voice.json','engine-home/dsh-pet/local-integrations.json','desktop-pet/deployment.json','qq-bridge/integrations/bili-standalone/engine.json',...['wechat-desktop-runtime','wechat-db-runtime'].map(n=>'qq-bridge/integrations/'+n+'/pyvenv.cfg')];
// Missing-only defaults migration snapshots, including SQLite WAL/SHM for rollback.
for(const file of ["qq-bridge/config.json","qq-bridge/companion/creative-data/settings.json","qq-bridge/companion/wechat-data/settings.json","qq-bridge/companion/qzone-data/settings.json","qq-bridge/companion/reply-options.json","qq-bridge/state/bilibili-chat/settings.json","qq-bridge/state/harness-control/settings.json","qq-bridge/companion/bilibili-live-data/config.json","qq-bridge/companion/bilibili-live-data/studio.json","qq-bridge/companion/bili-native-data/config.json","qq-bridge/companion/bili-native-data/memory-v2/state.json","qq-bridge/companion/douyin-data/memory-policy.json","qq-bridge/companion/douyin-data/state/chat-policy.json","qq-bridge/companion/douyin-data/state/video-policy.json","qq-bridge/companion/douyin-data/state/watch-mode.json","qq-bridge/companion/douyin-data/state/watch-schedule-policy.json","qq-bridge/companion/douyin-data/state/friend-interactions-policy.json","engine-home/dsh-pet/main-config.jsonc","engine-home/dsh-pet/local-voice.json","engine-home/dsh-pet/screen-companion.json","GPT-SoVITS/pet-voice.json","qq-bridge/state/emotional-companion.sqlite","qq-bridge/state/emotional-companion.sqlite-wal","qq-bridge/state/emotional-companion.sqlite-shm","qq-bridge/state/conversation-memory.sqlite","qq-bridge/state/conversation-memory.sqlite-wal","qq-bridge/state/conversation-memory.sqlite-shm"])if(!migrationFiles.includes(file))migrationFiles.push(file);
// SQLite hot rollback journals must not survive restoration of a prior database.
for(const file of ['qq-bridge/state/emotional-companion.sqlite-journal','qq-bridge/state/conversation-memory.sqlite-journal'])if(!migrationFiles.includes(file))migrationFiles.push(file);
const migrationLinks=['engine-home/profiles/web/node_modules/dsh-pet','qq-bridge/companion/bili-native-data/.venv','qq-bridge/companion/bili-native-data/.venv-asr','qq-bridge/companion/bili-native-data/.hf-cache/hub'];
function append(job,row){fs.appendFileSync(path.join(job,'journal.jsonl'),JSON.stringify(row)+'\n');}
function snapshot(root,job,rel,type='config'){
 const target=boundary(root,rel,{links:type==='link'});let stat;try{stat=fs.lstatSync(target);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(type==='link'){append(job,{type:'link',file:rel,existed:!!stat});return;}
 if(stat&&!stat.isFile())throw Error('需要更新的配置不是普通文件：'+rel);
 const before=stat?sha(fs.readFileSync(target)):null;if(stat){const file=boundary(job,'before/'+rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(target,file);}
 append(job,{type,file:rel,before});
}
function jobMeta(root,job){checkRoot(root);const canonical=fs.realpathSync(root),backupRoot=fs.realpathSync(path.join(root,'maintenance/install-backups')),prefix=backupRoot+path.sep;job=fs.realpathSync(job);if(!backupRoot.startsWith(canonical+path.sep)||!job.startsWith(prefix)||!/^v[0-9]+-[a-f0-9-]+$/.test(path.basename(job)))throw Error('不是本安装的更新备份');const meta=json(path.join(job,'transaction.json'));if(fs.realpathSync(meta.root)!==canonical||meta.format!==1)throw Error('更新备份不匹配');return{job,meta};}
export async function rollback(root,job){
 const checked=jobMeta(root,job);job=checked.job;const meta=checked.meta;if(meta.status==='committed')throw Error('已完成的更新不能自动回退覆盖新记录');
 const rows=fs.readFileSync(path.join(job,'journal.jsonl'),'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse),restored=new Set();
 for(const row of rows.reverse()){
   if(row.type==='program'&&migrationFiles.includes(row.file))continue;
   if(restored.has(row.file))continue;restored.add(row.file);const target=boundary(root,row.file,{links:row.type==='link'});
   if(row.type==='link'){if(!row.existed){let stat;try{stat=fs.lstatSync(target);}catch(e){if(e.code!=='ENOENT')throw e;}if(stat){if(!stat.isSymbolicLink())throw Error('新增链接已变成普通目录，未删除：'+row.file);fs.rmdirSync(target);}}continue;}
   const exists=fs.existsSync(target),current=exists?await hashFile(target):null;if(current===row.before)continue;
   if(row.before!==null){const backup=boundary(job,'before/'+row.file);await copyVerified(backup,target,row.before);}else if(exists){if(row.type==='program'&&row.after&&current!==row.after)throw Error('新增程序文件被其他软件改动，未删除：'+row.file);fs.unlinkSync(target);}
 }
 meta.status='rolled-back';atomic(path.join(job,'transaction.json'),JSON.stringify(meta,null,2));try{fs.unlinkSync(path.join(root,'.xiaoge-updating'));}catch(e){if(e.code!=='ENOENT')throw e;}
 return{ok:true,restored:restored.size};
}
export async function apply({source,root,cancelFile,job}){
 source=path.resolve(source);root=path.resolve(root);checkRoot(root);const existing=detectInstallation(root),mode=existing.mode;
 if(mode==='update'){let cfg;try{cfg=json(path.join(root,'qq-bridge/config.json'));}catch{throw Error('旧配置格式错误，未开始更新：qq-bridge/config.json');}if(!cfg||typeof cfg!=='object'||Array.isArray(cfg))throw Error('旧配置必须是对象，未开始更新');}
 const manifest=json(path.join(source,'payload/bundle-manifest.json')),indexBytes=fs.readFileSync(path.join(source,'工具/payload-index.json'));
 if(sha(indexBytes)!==manifest.fileIndexSha256)throw Error('安装文件索引校验失败');const index=JSON.parse(indexBytes);if(index.length!==manifest.fileCount)throw Error('安装索引不完整');if(existing.version>manifest.version)throw Error('当前已安装的版本更新，不能使用旧安装包降级覆盖');
 if(mode==='update'&&fs.existsSync(path.join(root,'.xiaoge-updating')))throw Error('存在中断更新，请先恢复');
 fs.mkdirSync(root,{recursive:true});if(mode==='new')fs.writeFileSync(path.join(root,'.xiaoge-installing'),'v26');const backupRoot=boundary(root,'maintenance/install-backups');fs.mkdirSync(backupRoot,{recursive:true});
 job=job||path.join(backupRoot,'v26-'+crypto.randomUUID());job=path.resolve(job);if(!job.startsWith(backupRoot+path.sep)||!/^v26-[a-f0-9-]+$/.test(path.basename(job)))throw Error('备份路径无效');
 fs.mkdirSync(job,{recursive:false});fs.writeFileSync(path.join(job,'journal.jsonl'),'');const meta={format:1,root,mode,status:'planning',createdAt:new Date().toISOString()};atomic(path.join(job,'transaction.json'),JSON.stringify(meta));
 const plan=[],seen=new Set();let required=128*1024*1024,done=0,skipped=0,examined=0;
 try{
  for(const row of index){
   cancel(cancelFile);if(++examined%300===0)console.log('STATUS|'+Math.min(22,6+Math.floor(examined/index.length*16))+'|正在比较程序文件（'+examined+'/'+index.length+'）；原账号与记录保留');if(seen.has(row.file)||!/^[a-f0-9]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.size)||row.size<0)throw Error('安装索引无效');seen.add(row.file);
   const src=boundary(path.join(source,'payload'),row.file),target=boundary(root,row.file);if(!fs.statSync(src).isFile()||fs.statSync(src).size!==row.size)throw Error('安装源文件缺失或大小不符：'+row.file);
   const exists=fs.existsSync(target);let before;
   // Do not recreate deleted cards or reactivate a missing role selection during an update.
   if(mode==='update'&&(row.file.startsWith('qq-bridge/roles/')||row.file==='qq-bridge/default-role.md'||row.file==='qq-bridge/state/current-role.json')){skipped++;continue;}
   if(exists&&preserveExisting(row.file)){
    const prompt=/^qq-bridge\/(?:dsh\/agent-presets\/qq-chat(?:-v2)?\/(?:agent\.cordis|preset)\.yml|plugins\/qq-agent-presets\/presets\/qq-chat(?:-v2)?\.patch\.yml)$/.test(row.file);
    const managedAsset=/^(?:qq-bridge\/public\/|qq-bridge\/integrations\/[^/]+\/(?:dist|assets)\/|desktop-pet\/(?!user-))/.test(row.file)&&userContentExtension.test(row.file);
    const defaults=(prompt||managedAsset)&&manifest.replaceUnmodifiedDefaults?.[row.file];
    if(!Array.isArray(defaults)){skipped++;continue;}
    before=await hashFile(target,cancelFile);
    if(!defaults.includes(before)){skipped++;continue;}
   }
   if(exists&&!fs.statSync(target).isFile())throw Error('程序文件目标被其他目录占用：'+row.file);
   if(before===undefined)before=exists?await hashFile(target,cancelFile):null;if(before===row.sha256){skipped++;continue;}
   plan.push({...row,src,target,before});required+=row.size+(mode==='update'&&exists?fs.statSync(target).size:0);
  }
  const disk=fs.statfsSync(root);if(Number(disk.bavail)*Number(disk.bsize)<required)throw Error('磁盘空间不足，需要约 '+Math.ceil(required/1024**3)+' GB 用于新增文件与更新备份');
  meta.status='applying';meta.changed=plan.length;atomic(path.join(job,'transaction.json'),JSON.stringify(meta));
  if(mode==='update')atomic(path.join(root,'.xiaoge-updating'),JSON.stringify({format:1,job}));else fs.writeFileSync(path.join(root,'.xiaoge-installing'),'v26');
  for(const rel of migrationFiles)snapshot(root,job,rel);for(const rel of migrationLinks)snapshot(root,job,rel,'link');
  done=0;for(const row of plan){
   cancel(cancelFile);if(mode==='update'&&row.before!==null){const backup=boundary(job,'before/'+row.file);fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(row.target,backup);}
   // Write ahead of replacement: interrupted updates can restore every applied file.
   append(job,{type:'program',file:row.file,before:row.before,after:row.sha256});await copyVerified(row.src,row.target,row.sha256,cancelFile);
   if(++done%100===0||done===plan.length)console.log('STATUS|'+(24+Math.floor(done/Math.max(1,plan.length)*25))+'|'+(mode==='update'?'正在替换程序并保留原数据':'正在安装完整组件')+'（'+done+'/'+plan.length+'）');
  }
  meta.status='configured-pending';atomic(path.join(job,'transaction.json'),JSON.stringify(meta));return{ok:true,mode,job,changed:plan.length,preserved:skipped};
 }catch(error){
  meta.status='failed';atomic(path.join(job,'transaction.json'),JSON.stringify(meta));if(mode==='update'){try{await rollback(root,job);}catch(restore){throw Error('更新未完成，自动恢复尚未完成。备份保留在 '+job+'；请关闭占用程序后重试恢复。原因：'+restore.message);}}
  throw error;
 }
}
export function commit(root,job){const checked=jobMeta(root,job),meta=checked.meta;if(meta.status!=='configured-pending')throw Error('更新事务尚未就绪');for(const n of ['.xiaoge-updating','.xiaoge-installing'])try{fs.unlinkSync(path.join(root,n));}catch(e){if(e.code!=='ENOENT')throw e;}meta.status='committed';meta.completedAt=new Date().toISOString();atomic(path.join(job,'transaction.json'),JSON.stringify(meta,null,2));return{ok:true,mode:meta.mode,job};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [action,source,target,cancelFile,job]=process.argv.slice(2);
 try{let result;if(action==='detect')result={ok:true,...detectInstallation(path.resolve(target||source))};else if(action==='verify')result=await verifySource(source,cancelFile);else if(action==='apply')result=await apply({source,root:target,cancelFile:cancelFile||'',job:job||undefined});else if(action==='rollback')result=await rollback(path.resolve(target),job);else if(action==='commit')result=commit(path.resolve(target),job);else if(action==='recover'){const r=path.resolve(target),marker=json(path.join(r,'.xiaoge-updating'));result=await rollback(r,marker.job);}else throw Error('未知安装动作');console.log('RESULT|'+JSON.stringify(result));}catch(error){console.log('ERROR|'+error.message);process.exitCode=error.cancelled?2:1;}
}
