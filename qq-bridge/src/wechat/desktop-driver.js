// Owns only the optional Python driver process. It never loads Python while off.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {hash,cleanError} from './store.js';
import {transportSettings,locateWechatData} from './transport-settings.js';
export function desktopTargets(input){
 if(!Array.isArray(input)||input.length>8)throw Error('电脑版微信最多监听8个明确指定的会话');const seen=new Set();
 return input.map(row=>{const name=String(row.name||'').trim(),nickname=String(row.nickname||'').trim(),kind=row.kind==='group'?'group':'private';if(!name||name.length>80||/[\x00-\x1f]/.test(name)||nickname.length>80)throw Error('请填写1～80字的唯一好友备注名或群名');const id=hash(kind+'\0'+name);if(seen.has(id))throw Error('微信名单有重复会话');seen.add(id);return {id,name,kind,nickname};});
}
export function createDesktopDriver({root,store,spawnImpl=spawn,locateData=locateWechatData}){
 let transport=transportSettings(store.read('transport.json',{}));
 let targets=desktopTargets(store.read('desktop-targets.json',[])),diagnostic=store.read('desktop-diagnostic.json',{passed:false,reason:'请保存接法和监听名单，再检查本机数据源'}),child=null,starting=null,probeChild=null,closed=false,lastError='',pending=new Map(),dataInfo=null,dataChecked=0,databaseReady=false,sendingVerified=false;
 const paths=()=>{const runtime=transport.mode==='dbocr'?'wechat-db-runtime':'wechat-desktop-runtime';return {python:path.join(root,'integrations',runtime,'Scripts/python.exe'),manifest:path.join(root,'integrations',runtime,'installed.json'),worker:path.join(root,'companion',transport.mode==='dbocr'?'wechat-db-worker.py':'wechat-desktop-worker.py')};};
 const installed=()=>fs.existsSync(paths().python)&&fs.existsSync(paths().manifest);
 function sourceInfo(){if(!dataInfo||Date.now()-dataChecked>30000){dataInfo=locateData(transport.dataRoot);dataChecked=Date.now();}return dataInfo;}
 const status=()=>({driver:'desktop',name:transport.mode==='dbocr'?'个人微信：本机数据库＋OCR':'个人微信：界面控件',transport:{...transport},dataInfo:sourceInfo(),installed:installed(),ready:installed()&&diagnostic.passed&&diagnostic.mode===transport.mode&&targets.length>0,owner:'',targets:structuredClone(targets),diagnostic,databaseReady,sendingVerified,workerRunning:!!child,lastError,requires:transport.mode==='dbocr'?'总开关开启时才读取本机微信密钥和消息库；只监听指定好友或群，OCR发送需要已登录且桌面可用。':'使用已登录的Windows微信，好友或群须有唯一名称。需要可读聊天控件；当前先支持文字收发。'});
 async function updateTargets(input){if(child)throw Error('请先关闭微信通道再修改监听名单');targets=desktopTargets(input);store.write('desktop-targets.json',targets);return status();}
 async function updateTransport(patch){if(child||starting||probeChild)throw Error('请先停止通道和诊断再修改微信接法');transport=transportSettings({...transport,...patch});dataInfo=null;dataChecked=0;diagnostic={passed:false,mode:transport.mode,reason:'接法配置已修改，请重新检查本机数据源'};store.write('transport.json',transport);store.write('desktop-diagnostic.json',diagnostic);return status();}
 function launch(args){const p=paths();if(transport.mode==='dbocr')store.write('transport.json',{...transport,resolvedRoot:sourceInfo().root});return spawnImpl(p.python,['-u',p.worker,...args],{cwd:store.home,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});}
 async function diagnose(){
  if(child||starting||probeChild)throw Error('请先关闭微信通道并等待当前诊断结束');if(!installed())throw Error('所选微信驱动未安装，请运行本机准备脚本');
  return new Promise((resolve,reject)=>{const probe=launch(['--probe']);probeChild=probe;let output='';const timer=setTimeout(()=>{probe.kill();},15000);probe.stdout.on('data',bytes=>{output=(output+bytes).slice(-10000);});probe.stderr.resume();probe.once('error',()=>{clearTimeout(timer);reject(Error('微信诊断进程未启动'));});probe.once('close',()=>{probeChild=null;clearTimeout(timer);try{const row=output.trim().split(/\r?\n/).map(text=>JSON.parse(text)).find(row=>row.diagnostic);diagnostic={...(row?.diagnostic||{passed:false,reason:'微信驱动未读到可用数据源'}),mode:transport.mode,checkedAt:new Date().toISOString()};store.write('desktop-diagnostic.json',diagnostic);resolve(status());}catch{reject(Error('微信数据源检查未完成'));}});});
 }
 async function open(){
  if(starting)return starting;if(child)return;if(closed)throw Error('微信通道服务已关闭');if(!status().ready)throw Error(diagnostic.reason||'请先添加名单并完成数据源检查');
  starting=new Promise((resolve,reject)=>{
   const process=launch([]);child=process;let buffer='',ready=false;const timer=setTimeout(()=>{process.kill();reject(Error('微信驱动启动超时，任务已停止'));},transport.mode==='dbocr'?60000:15000);
   process.stdout.on('data',bytes=>{buffer+=bytes;if(buffer.length>2*1024*1024){process.kill();return;}let split;while((split=buffer.indexOf('\n'))>=0){const text=buffer.slice(0,split);buffer=buffer.slice(split+1);try{const row=JSON.parse(text);if(row.event==='ready'){ready=true;databaseReady=row.databaseReady===true;lastError='';clearTimeout(timer);resolve();}else if(row.event==='blocked'){lastError=cleanError({message:row.error});reject(Error(lastError));process.kill();}else{const request=pending.get(row.id);if(request){pending.delete(row.id);request.finish();if(row.ok)request.resolve(row.result);else request.reject(Error(cleanError({message:row.error})));}}}catch{lastError='微信驱动返回了无效响应';process.kill();}}});
   process.stderr.on('data',()=>{});process.once('error',()=>{clearTimeout(timer);reject(Error('微信驱动无法启动'));});process.once('close',()=>{clearTimeout(timer);if(child===process){child=null;databaseReady=false;}for(const request of pending.values()){request.finish();request.reject(Error('微信桌面驱动已停止'));}pending.clear();if(!ready)reject(Error(lastError||'微信驱动未就绪'));});
  }).then(()=>rpc('configure',{targets})).catch(async error=>{await stop();throw error;}).finally(()=>{starting=null;});await starting;
 }
 async function rpc(op,args={},signal){
  signal?.throwIfAborted();if(!child)throw Error('微信桌面驱动未运行');
  return new Promise((resolve,reject)=>{const id=randomUUID(),process=child;const abort=()=>{process.kill();};const timer=setTimeout(()=>{pending.delete(id);signal?.removeEventListener('abort',abort);process.kill();reject(Error('微信本机操作超时，结果未确认'));},transport.mode==='dbocr'?60000:25000);
   const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};pending.set(id,{resolve,reject,finish});signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();else process.stdin.write(JSON.stringify({id,op,...args})+'\n');});
 }
 async function stop(){probeChild?.kill();const process=child;if(!process)return;await new Promise(resolve=>{process.once('close',resolve);process.kill();});}
 return {status,updateTargets,updateTransport,diagnose,open,stop,poll:async(cursor,signal)=>{await open();const result=await rpc('poll',{cursor},signal);return {...result,delayMs:transport.pollSeconds*1000};},send:async({peer,item},signal)=>{const result=await rpc('send',{peer,item},signal);sendingVerified=true;return result;},download:async()=>{throw Error('电脑版微信通道当前只支持文字，附件适配器尚未启用');},close:async()=>{closed=true;await stop();}};
}
