// Read-only diagnostics. No account login, QQ loading or message actions.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]);
const result={node:process.version,arch:process.arch};
try{result.snowluma=JSON.parse(fs.readFileSync(path.join(root,'SnowLuma/package.json'),'utf8')).version;}catch{result.snowluma='unknown';}
(async()=>{
 try{
  const addon=require(path.join(root,'SnowLuma/native/snowluma-win32-x64.node'));
  const list=typeof addon.getAllMainProcessAsync==='function'?await addon.getAllMainProcessAsync():addon.getAllMainProcess();
  result.nativeMainPids=[...new Set(list)].filter(n=>Number.isInteger(n)&&n>0);result.nativeLoaded=true;
 }catch{result.nativeLoaded=false;result.error='QQ原生进程枚举不可用，请检查Node与native是否为同一发行包以及安全软件拦截记录。';}
 console.log(JSON.stringify(result));
})().catch(()=>{console.log(JSON.stringify({nativeLoaded:false,error:'QQ进程检查未完成'}));process.exitCode=1;});
