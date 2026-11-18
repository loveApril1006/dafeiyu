import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const within = (base, file) => { const r=path.relative(base,file);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r)); };
const DENIED = /^(?:\..*|node_modules|state|logs?|runtime-control|engine-home|bili-native-data|.*-data|.*token.*|.*credential.*|.*secret.*|id_rsa|id_ed25519)$/i;
const EXT = new Set(['.txt','.md','.json','.html','.css','.js','.mjs','.cjs','.ts','.tsx','.jsx','.py','.yml','.yaml','.toml','.xml','.csv','.svg','.sql','.gitignore']);
const literalSecret = /(?:sk-[a-zA-Z0-9_-]{16,}|Bearer\s+[a-zA-Z0-9_.-]{16,}|(?:api[_-]?key|password|sessdata|bili_jct|access[_-]?token)["']?\s*[:=]\s*["'][a-zA-Z0-9_.\/-]{12,}["'])/i;
export function canonicalProject(value, bridgeRoot) {
  if(typeof value!=='string'||!path.isAbsolute(value)||value.startsWith('\\\\')||value.length>240)throw Error('项目路径必须是本机绝对路径');
  const file=fs.realpathSync(value),stat=fs.statSync(file);
  if(!stat.isDirectory()||path.dirname(file)===file)throw Error('请选择具体项目目录');
  const suite=path.resolve(bridgeRoot,'..');
  const protectedRoots=[bridgeRoot,...['engine','engine-home','SnowLuma','GPT-SoVITS','local-tts','desktop-pet','runtime-control'].map(n=>path.join(suite,n)),
    ...[process.env.WINDIR,process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean)];
  if(protectedRoots.some(p=>within(file,path.resolve(p))||within(path.resolve(p),file)))throw Error('机器人、引擎、系统和凭据目录受保护；请使用独立项目或项目副本');
  if(file.split(path.sep).some(p=>DENIED.test(p)))throw Error('此目录不允许作为远程工作项目');
  return {path:file,identity:stat.dev+':'+stat.ino};
}
export function createHarnessFiles({root,backupRoot,validateText=()=>{}}) {
  function checkRoot(project){const s=fs.lstatSync(project.path);if(s.isSymbolicLink()||!s.isDirectory()||s.dev+':'+s.ino!==project.identity||fs.realpathSync(project.path)!==project.path)throw Error('项目目录发生变化，请后台重新授权');}
  function target(project,relative,{directory=false,missing=false}={}){
    checkRoot(project);
    if(typeof relative!=='string'||relative.length>220||/[\\:\x00-\x1f]/.test(relative)||path.isAbsolute(relative))throw Error('只允许项目内相对路径，使用 / 分隔');
    const parts=relative.split('/').filter(Boolean);
    if(parts.some(p=>p==='..'||p==='.'||DENIED.test(p)||/[. ]$/.test(p)||/^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(p)))throw Error('路径包含受保护或无效目录');
    const file=path.resolve(project.path,...parts);
    if(!within(project.path,file))throw Error('路径越过项目范围');
    let current=project.path;
    for(let i=0;i<parts.length;i++){
      current=path.join(current,parts[i]);
      if(!fs.existsSync(current)){if(missing)break;throw Error('项目文件不存在');}
      const s=fs.lstatSync(current);if(s.isSymbolicLink()||s.nlink>1&&!s.isDirectory())throw Error('不允许符号链接、联接或硬链接');
      if(!within(project.path,fs.realpathSync(current)))throw Error('文件实际位置越过授权范围');
    }
    if(!directory&&(!parts.length||!EXT.has(path.extname(file).toLowerCase())))throw Error('本版本只开放项目内文本、代码和SVG文件');
    return file;
  }
  function readBytes(file){const s=fs.lstatSync(file);if(!s.isFile()||s.size>256*1024||s.nlink>1)throw Error('文件不可读、过大或为硬链接');const bytes=fs.readFileSync(file);if(bytes.includes(0))throw Error('不读取二进制文件');const text=bytes.toString('utf8');if(literalSecret.test(text))throw Error('文件可能包含凭据，不提供给任务模型');validateText(text);return bytes;}
  return {
    operate(job,project,args){
      if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['operation','path','content','expectedSha256','find','replace','offset'].includes(k)))throw Error('文件操作参数无效');
      const operation=args.operation;
      if(operation==='list'){
        const file=target(project,args.path||'',{directory:true});
        return {ok:true,entries:fs.readdirSync(file,{withFileTypes:true}).filter(e=>!DENIED.test(e.name)&&!e.isSymbolicLink()).slice(0,120).map(e=>({name:e.name,directory:e.isDirectory()}))};
      }
      if(operation==='read'){
        const bytes=readBytes(target(project,args.path)),text=bytes.toString('utf8'),offset=args.offset??0;
        if(!Number.isInteger(offset)||offset<0||offset>text.length)throw Error('读取偏移无效');
        return {ok:true,path:args.path,sha256:hash(bytes),content:text.slice(offset,offset+20000),offset,totalChars:text.length,truncated:offset+20000<text.length};
      }
      if(!['write','edit'].includes(operation))throw Error('只允许 list/read/write/edit；没有命令执行、删除、网络或发布工具');
      if(!project.write)throw Error('此项目未授权写入，请管理员在后台设置');
      const file=target(project,args.path,{missing:true});const exists=fs.existsSync(file);
      let content=args.content;
      if(operation==='edit'){
        if(!exists||typeof args.find!=='string'||!args.find||args.find.length>4000||typeof args.replace!=='string'||args.replace.length>8000)throw Error('edit需要唯一的find文本及replace文本');
        const old=readBytes(file).toString('utf8');if(old.split(args.find).length!==2)throw Error('find必须在文件中恰好出现一次');content=old.replace(args.find,()=>args.replace);
      }
      if(typeof content!=='string'||!content||Buffer.byteLength(content)>256*1024||content.includes('\0')||literalSecret.test(content))throw Error('内容过大、为空、含凭据或格式无效');
      if(operation==='write'&&exists&&readBytes(file).toString('utf8').length>20000)throw Error('大文件请用edit局部替换，避免遗漏未读取的内容');
      validateText(content);
      if(exists){
        const old=readBytes(file);if(typeof args.expectedSha256!=='string'||args.expectedSha256!==hash(old))throw Error('覆盖前必须先读文件并提供对应 sha256；文件已变更时重新读取');
        const directory=path.join(backupRoot,job.id);fs.mkdirSync(directory,{recursive:true});
        const count=fs.readdirSync(directory).length;if(count>=60)throw Error('本任务备份数量已到上限');
        const total=fs.readdirSync(directory).reduce((sum,n)=>sum+fs.statSync(path.join(directory,n)).size,0);if(total+old.length>8*1024*1024)throw Error('本任务备份容量已到8MB上限');
        fs.writeFileSync(path.join(directory,count+'-'+hash(old)+'.txt'),old,{flag:'wx'});
      }else if(args.expectedSha256&&args.expectedSha256!=='new')throw Error('文件尚不存在，请使用 new');
      // Recheck the parent chain after creating subdirectories. All paths here
      // are derived from the approved canonical root, never command strings.
      fs.mkdirSync(path.dirname(file),{recursive:true});target(project,args.path,{missing:true});
      const temp=file+'.harness-'+randomUUID()+'.tmp';
      try{fs.writeFileSync(temp,content,{flag:'wx'});target(project,args.path,{missing:true});
        if(exists&&hash(readBytes(file))!==args.expectedSha256)throw Error('文件刚刚被其他程序修改，已停止覆盖');
        if(!exists&&fs.existsSync(file))throw Error('文件刚刚被其他程序创建，已停止覆盖');
        fs.renameSync(temp,file);
      }finally{try{fs.rmSync(temp,{force:true});}catch{}}
      return {ok:true,path:args.path,sha256:hash(content),bytes:Buffer.byteLength(content)};
    },
  };
}
