import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const reserved=new Set(['qq-bridge','runtime','engine','engine-home','desktop-pet','gpt-sovits','local-tts','maintenance','release-tools','迁移包']);
const supported=new Set(['.exe','.cmd','.bat','.ps1','.mjs','.js']);
const readMeta=root=>{try{return JSON.parse(fs.readFileSync(path.join(root,'external-qq-gateway.json'),'utf8').replace(/^\uFEFF/,''));}catch(e){if(e.code==='ENOENT')return {};throw Error('QQ框架启动配置无法读取');}};
export function launcherPath(root,value){
 if(!String(value||'').trim())return '';
 const base=path.resolve(root),file=path.resolve(base,String(value).trim()),relative=path.relative(base,file);
 if(!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||!relative.includes(path.sep)||reserved.has(relative.split(path.sep)[0].toLowerCase()))throw Error('请选择安装目录内、独立QQ框架子文件夹中的正式启动文件');
 if(!supported.has(path.extname(file).toLowerCase()))throw Error('启动文件需要是 exe、cmd、bat、ps1、mjs 或 js');
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw Error('QQ框架启动文件不存在，请先完成安装');
 const realBase=fs.realpathSync(base),real=fs.realpathSync(file),inside=path.relative(realBase,real);
 if(path.isAbsolute(inside)||inside==='..'||inside.startsWith('..'+path.sep))throw Error('QQ框架启动文件不能通过链接指向安装目录之外');
 if(/[\r\n"%&|<>^!]/.test(file))throw Error('框架启动路径包含脚本不支持的特殊字符，请使用普通文件夹名称');
 return relative.replaceAll(path.sep,'/');
}
export function frameworkInfo(root,meta=readMeta(root)){
 const autoStart=meta.autoStart!==false;
 let relative='',source='none',error='';
 if(meta.launcherPath){try{relative=launcherPath(root,meta.launcherPath);source='selected';}catch(e){error=e.message;}}
 else{
  const entry=path.join(root,'SnowLuma/index.mjs'),node=path.join(root,'SnowLuma/node.exe');
  if(fs.existsSync(entry)&&fs.existsSync(node)){
   try{relative=launcherPath(root,'SnowLuma/index.mjs');source='detected';}catch(e){error=e.message;}
  }
 }
 const folders=['SnowLuma','QQBot','qqbot','OneBot','NapCat','NapCat.Shell'].filter(name=>fs.existsSync(path.join(root,name))&&fs.statSync(path.join(root,name)).isDirectory());
 const found=!!relative;
 return {autoStart,launcherPath:meta.launcherPath||'',detectedLauncher:relative,found,source,folders,
  message:error||(found?(source==='selected'?'已设置QQ框架启动入口':'已检测到QQ框架启动入口'):(folders.length?'检测到候选框架目录，请选择正式启动文件':'未检测到可启动的QQ框架，请先自行安装，再重新检测'))};
}
export function frameworkPlan(root){
 const info=frameworkInfo(root);if(!info.found)return {...info,ok:true,kind:'missing'};
 const entry=path.resolve(root,info.detectedLauncher),cwd=path.dirname(entry),extension=path.extname(entry).toLowerCase();
 if(extension==='.mjs'||extension==='.js'){
  const node=fs.existsSync(path.join(cwd,'node.exe'))?path.join(cwd,'node.exe'):path.join(root,'runtime/node.exe');
  if(!fs.existsSync(node))throw Error('框架缺少所需Node运行环境，请检查框架官方安装说明');
  // Validate a package-local runtime too, including junction/symlink destinations.
  if(node!==path.join(root,'runtime/node.exe'))launcherPath(root,path.relative(root,node));
  return {...info,ok:true,kind:'node',entry,executable:node,cwd};
 }
 return {...info,ok:true,kind:extension.slice(1),entry,executable:entry,cwd};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){try{console.log(JSON.stringify(frameworkPlan(process.argv[2])));}catch(e){console.log(JSON.stringify({ok:false,found:false,error:e.message}));process.exitCode=1;}}
