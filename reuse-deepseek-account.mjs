// Runs with the bundled Harness Electron/Node. Never prints or transfers a grant over HTTP.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const accountKey='deepseek-account-platform/default';
const fingerprint=record=>createHash('sha256').update(JSON.stringify(record.payload)).digest('hex');
function usable(record){
  try {
    const p=record?.payload,u=new URL(p?.issuer);
    return record.kind==='grant' && p.version===1 && typeof p.token==='string' && p.token.length>0 && !p.token.startsWith('dsh_mock_') && u.origin==='https://platform.deepseek.com' && !u.username && !u.password;
  }catch{return false;}
}
async function read(file,fallback){try{return await fs.readFile(file,'utf8');}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;}}
export async function reuseAccount(root,sourceHome=path.join(os.homedir(),'.dsh')){
  root=path.resolve(root);sourceHome=path.resolve(sourceHome);
  const home=path.join(root,'engine-home');
  if(home.toLowerCase()===sourceHome.toLowerCase())return {ok:true,status:'same-home'};
  const cfg=JSON.parse((await read(path.join(root,'qq-bridge/config.json'))).replace(/^\uFEFF/,''));
  if(cfg.dsh?.provider!=='deepseek-account')return {ok:true,status:'api-mode'};
  const require=createRequire(path.join(root,'engine/resources/app.asar/dsh/package.json'));
  const load=name=>import(pathToFileURL(require.resolve(name)).href);
  const [{withFileLock,writeFileAtomic},{parseCredentialsDocument},{parseDocument}]=await Promise.all([load('@deepseek-ai/dsh-atomic-write'),load('@deepseek-ai/dsh-credentials-local'),load('yaml')]);
  const source=path.join(sourceHome,'.credentials.yaml'),target=path.join(home,'.credentials.yaml');
  const sourceText=await read(source,'');
  if(!sourceText)return {ok:true,status:'source-not-signed-in'};
  const record=parseCredentialsDocument(sourceText,'Harness account source').records.get(accountKey);
  if(!usable(record))return {ok:true,status:'source-not-signed-in'};
  const markFile=path.join(home,'.xiaoge-account-reuse.json');
  return withFileLock(target,async()=>{
    const text=await read(target,'version: 1\nrefs: {}\nrecords: {}\n');
    const current=parseCredentialsDocument(text,'Xiaoge account target').records.get(accountKey);
    let previous;try{previous=JSON.parse(await read(markFile,'{}'));}catch{previous={};}
    const nextHash=fingerprint(record);
    if(current){
      if(!usable(current))return {ok:true,status:'target-kept'};
      if(fingerprint(current)===nextHash)return {ok:true,status:'already-linked'};
      // An independently signed-in target always wins over a different desktop account.
      if(fingerprint(current)!==previous.fingerprint || (previous.sourceHome && path.resolve(previous.sourceHome).toLowerCase()!==sourceHome.toLowerCase()))return {ok:true,status:'target-kept'};
    }else if(previous.fingerprint===nextHash){
      // A rejected or explicitly removed grant must not be silently restored each launch.
      return {ok:true,status:'source-login-required'};
    }
    const doc=parseDocument(text,{uniqueKeys:true});doc.set('version',1);doc.setIn(['records',accountKey],record);
    await writeFileAtomic(target,doc.toString(),{mode:0o600,dirMode:0o700});
    await writeFileAtomic(markFile,JSON.stringify({version:1,fingerprint:nextHash,sourceHome})+'\n',{mode:0o600,dirMode:0o700});
    return {ok:true,status:current?'refreshed':'imported'};
  },{waitMs:8000});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await reuseAccount(process.argv[2],process.argv[3])));}
  catch{console.log(JSON.stringify({ok:false,status:'account-reuse-failed',message:'本机账号复用未完成，原有记录保持；请检查Harness是否已登录及凭据版本是否兼容。'}));process.exitCode=1;}
}
