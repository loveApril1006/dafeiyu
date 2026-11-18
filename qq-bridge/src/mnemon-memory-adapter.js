import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {qqMemoryWorkspace} from './qq-memory-scope.js';

const PREFIX='[QQ Bridge memory:';
const hash=text=>createHash('sha256').update(text).digest('hex');
const ownedId=entry=>entry.content.match(/^\[QQ Bridge memory:([a-zA-Z0-9-]+)\]\s+/)?.[1];
// Runtime Memory stores one-line entries; compare its canonical form, not input formatting.
const projectContent=fact=>PREFIX+fact.id+'] '+String(fact.content).replace(/\s+/g,' ').trim();
export function createMnemonMemoryAdapter({root,engineHome=path.resolve(root,'../engine-home'),modulePath=path.join(engineHome,'profiles/web/node_modules/dsh-mnemon-source-runtime/lib/index.js'),getLimits=()=>({}),getWorkspace=key=>qqMemoryWorkspace(root,key)}={}){
 let imported;const sources=new Map(),backedUp=new Set();
 const available=()=>fs.existsSync(modulePath);
 const storeFile=key=>path.join(getWorkspace(key),'.mnemon/runtime/memories.json');
 function assertSafe(key){for(let cursor=storeFile(key);cursor!==path.dirname(cursor);cursor=path.dirname(cursor))try{if(fs.lstatSync(cursor).isSymbolicLink())throw Error('记忆目录包含链接，已停止同步');}catch(error){if(error.code!=='ENOENT')throw error;}}
 const version=key=>{assertSafe(key);try{const stat=fs.statSync(storeFile(key));return stat.mtimeMs+':'+stat.size;}catch{return null;}};
 async function source(key){
  const workspace=getWorkspace(key),directory=path.join(workspace,'.mnemon');
  assertSafe(key);
  if(!available())throw Error('Mnemon 运行时依赖尚未安装');
  imported??=import(pathToFileURL(modulePath).href);
  const api=await imported;
  const limits=getLimits(),memoryLimitBytes=limits.memoryLimitBytes??4096,userLimitBytes=limits.userLimitBytes??1024,cacheKey=path.resolve(workspace)+':'+memoryLimitBytes+':'+userLimitBytes;
  if(!sources.has(cacheKey))sources.set(cacheKey,api.createRuntimeMemorySource({dataDir:directory,userDataDir:directory,memoryLimitBytes,userLimitBytes}).create({sourceInstanceKey:'runtime',configuration:{}}));
  return {runtime:sources.get(cacheKey),directory};
 }
 const read=async runtime=>(await runtime.manage({mode:'read',operation:'snapshot',input:{}})).value;
 const mutate=(runtime,input)=>runtime.manage({mode:'mutate',operation:'mutate',confirmed:true,input});
 function backup(directory){
  if(backedUp.has(directory))return;
  const backupRoot=path.join(directory,'qq-bridge-backups');if(fs.existsSync(backupRoot)&&fs.lstatSync(backupRoot).isSymbolicLink())throw Error('记忆备份路径包含链接，已停止同步');
  const base=path.join(directory,'qq-bridge-backups',randomUUID());fs.mkdirSync(base,{recursive:true});
  for(const name of ['memories.json','USER.md','MEMORY.md']){
   const file=path.join(directory,'runtime',name);
   if(fs.existsSync(file)){if(!fs.lstatSync(file).isFile())throw Error('记忆源不是普通文件');fs.copyFileSync(file,path.join(base,name),fs.constants.COPYFILE_EXCL);}
  }
  const ledger=path.join(directory,'qq-bridge-sync.json');if(fs.existsSync(ledger)){if(!fs.lstatSync(ledger).isFile())throw Error('同步索引不是普通文件');fs.copyFileSync(ledger,path.join(base,'qq-bridge-sync.json'),fs.constants.COPYFILE_EXCL);}
  backedUp.add(directory);
 }
 async function sync(key,facts){
  assertSafe(key);
  if(!facts.length&&!fs.existsSync(storeFile(key)))return {ok:true,covered:[],skipped:[],conflicts:0,changed:0,counts:{user:0,project:0,bytes:0},storeVersion:null};
  const {runtime,directory}=await source(key),before=await read(runtime);
  const ledgerFile=path.join(directory,'qq-bridge-sync.json');
  let ledger={entries:{}};if(fs.existsSync(ledgerFile)){if(!fs.lstatSync(ledgerFile).isFile())throw Error('记忆同步索引不是普通文件');ledger=JSON.parse(fs.readFileSync(ledgerFile,'utf8'));if(ledger.version!==1||!ledger.entries||typeof ledger.entries!=='object')throw Error('记忆同步索引无效，未覆盖原记忆');}
  const conflicts=new Set(),allOwned=before.entries.filter(row=>ownedId(row)),desiredById=new Map(facts.map(f=>[f.id,projectContent(f)]));
  for(const row of allOwned){const id=ownedId(row),expected=ledger.entries[id];if(row.content!==desiredById.get(id)&&(expected?hash(row.content)!==expected:true))conflicts.add(id);}
  for(const [id,expected]of Object.entries(ledger.entries))if(!allOwned.some(e=>ownedId(e)===id)&&desiredById.has(id)&&hash(desiredById.get(id))===expected)conflicts.add(id);
  const owned=allOwned.filter(row=>!conflicts.has(ownedId(row))),manual=before.entries.filter(row=>!owned.includes(row));
  const {runtimeBytes}=await import(pathToFileURL(path.join(path.dirname(modulePath),'contracts.js')).href);
  const desired=[],covered=[],skipped=[];
  for(const fact of facts.slice().sort((a,b)=>b.stamp-a.stamp)){
   if(conflicts.has(fact.id)){skipped.push(fact.id);continue;}
   const entry={target:fact.target,content:projectContent(fact),importance:'normal'};
   if(runtimeBytes([...manual,...desired,entry],fact.target)>before.targets[fact.target].limit){skipped.push(fact.id);continue;}
   desired.push(entry);covered.push(fact.id);
  }
  let changed=0;
  // Only the adapter's marked projection is reconciled. Existing Mnemon entries remain intact.
  const remove=owned.filter(row=>!desired.some(w=>w.target===row.target&&w.content===row.content));
  const add=desired.filter(row=>!owned.some(w=>w.target===row.target&&w.content===row.content));
  if(remove.length||add.length)backup(directory);
  try{
   for(const row of remove){await mutate(runtime,{action:'remove',target:row.target,oldText:row.content});changed++;}
   for(const row of add){await mutate(runtime,{action:'add',...row});changed++;}
  }catch(error){
   // Return the actual committed coverage: QQ continues to inject every unsynced fact.
   const current=await read(runtime);const retained=facts.filter(f=>current.entries.some(e=>e.target===f.target&&e.content===projectContent(f))).map(f=>f.id);
   return {ok:false,covered:retained,skipped:facts.filter(f=>!retained.includes(f.id)).map(f=>f.id),changed,counts:counts(current),storeVersion:version(key),error:'Mnemon 同步未完成，未同步的记忆继续由 QQ 提供'};
  }
  const after=await read(runtime);
  const nextEntries={};for(const [id,value]of Object.entries(ledger.entries))if(conflicts.has(id))nextEntries[id]=value;
  for(const row of desired)nextEntries[ownedId(row)]=hash(row.content);
  const data=JSON.stringify({version:1,entries:Object.fromEntries(Object.entries(nextEntries).sort(([a],[b])=>a.localeCompare(b)))},null,2)+'\n';
  if(!fs.existsSync(ledgerFile)||fs.readFileSync(ledgerFile,'utf8')!==data){const temporary=ledgerFile+'.'+randomUUID();try{fs.writeFileSync(temporary,data,{mode:0o600,flag:'wx'});fs.renameSync(temporary,ledgerFile);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}}
  return {ok:true,covered,skipped,changed,conflicts:conflicts.size,counts:counts(after),storeVersion:version(key)};
 }
 const counts=snapshot=>({user:snapshot.entries.filter(e=>e.target==='user').length,project:snapshot.entries.filter(e=>e.target==='memory').length,bytes:snapshot.targets.user.used+snapshot.targets.memory.used});
 async function inspect(key){
  assertSafe(key);
  const file=storeFile(key);if(!fs.existsSync(file))return {user:0,project:0,bytes:0};
  // Read-only inventory uses the provider's published schema; it does not create stores.
  const {summarizeRuntimeMemories}=await import(pathToFileURL(path.join(path.dirname(modulePath),'contracts.js')).href);
  const summary=summarizeRuntimeMemories(JSON.parse(fs.readFileSync(file,'utf8')));if(!summary.valid)throw Error('Mnemon 记忆格式无效，未修改原文件');
  return {user:summary.user,project:summary.memory,bytes:fs.statSync(file).size};
 }
 async function entries(key){assertSafe(key);if(!fs.existsSync(storeFile(key)))return [];const {runtime}=await source(key);return (await read(runtime)).entries;}
 return {available,sync,version,inspect,entries};
}
