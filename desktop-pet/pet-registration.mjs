// Repair only the selected web profile's desktop-pet registration.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

function context(root) {
  root=path.resolve(root);
  const within=relative=>{const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('修复路径必须位于所选安装目录');return file;};
  for(const relative of ['', 'engine-home','engine-home/profiles','engine-home/profiles/web','engine-home/profiles/web/node_modules','runtime-control','runtime-control/pet-registration-backups']) {
    const file=relative?within(relative):root;
    try {if(fs.lstatSync(file).isSymbolicLink())throw Error('修复路径不能经过目录链接：'+(relative||root));}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const target=within('desktop-pet/dsh-pet/dsh-pet');
  for(const name of ['package.json','lib/index.js','cordis.patch.yml'])if(!fs.existsSync(path.join(target,name)))throw Error('桌宠组件缺失：'+name);
  const manifest=within('engine-home/profiles/web/package.json');
  const original=fs.readFileSync(manifest);
  const pkg=JSON.parse(original.toString('utf8').replace(/^\uFEFF/,''));
  if(pkg.dependencies!=null&&(typeof pkg.dependencies!=='object'||Array.isArray(pkg.dependencies)))throw Error('Profile dependencies格式无效，未覆盖');
  if(pkg.dsh!=null&&(typeof pkg.dsh!=='object'||Array.isArray(pkg.dsh)))throw Error('Profile dsh格式无效，未覆盖');
  if(pkg.dsh?.profile!=null&&(typeof pkg.dsh.profile!=='object'||Array.isArray(pkg.dsh.profile)))throw Error('Profile设置格式无效，未覆盖');
  if(pkg.dsh?.profile?.bundles!=null&&!Array.isArray(pkg.dsh.profile.bundles))throw Error('Profile bundles格式无效，未覆盖');
  const link=within('engine-home/profiles/web/node_modules/dsh-pet');
  let linkExists=false;
  try {
    const stat=fs.lstatSync(link);linkExists=true;
    if(!stat.isSymbolicLink()||fs.realpathSync(link).toLowerCase()!==fs.realpathSync(target).toLowerCase())throw Error('桌宠注册位置已有其他目录或旧链接，未覆盖：'+link);
  }catch(e){if(e.code!=='ENOENT'||linkExists)throw e;}
  const dependency='link:'+target.replaceAll('\\','/');
  return {root,within,target,manifest,original,pkg,link,linkExists,dependency};
}
export function inspectPetRegistration(root) {
  const c=context(root);
  return {needsRepair:!c.linkExists||c.pkg.dependencies?.['dsh-pet']!==c.dependency||!c.pkg.dsh?.profile?.bundles?.includes('dsh-pet'),linkMissing:!c.linkExists,dependencyMissing:!c.pkg.dependencies?.['dsh-pet'],bundleMissing:!c.pkg.dsh?.profile?.bundles?.includes('dsh-pet')};
}
export function ensurePetRegistration(root) {
  const c=context(root),plan=inspectPetRegistration(root);
  if(!plan.needsRepair)return {changed:false};
  const backup=c.within('runtime-control/pet-registration-backups/'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());
  fs.mkdirSync(backup,{recursive:true});
  fs.writeFileSync(path.join(backup,'package.json'),c.original,{mode:0o600});
  fs.writeFileSync(path.join(backup,'registration.json'),JSON.stringify({linkPreviouslyPresent:c.linkExists,link:c.link,target:c.target}),{mode:0o600});
  const temporary=c.manifest+'.pet-registration-'+randomUUID();let created=false;
  try {
    if(!c.linkExists){fs.mkdirSync(path.dirname(c.link),{recursive:true});fs.symlinkSync(c.target,c.link,'junction');created=true;}
    c.pkg.dependencies??={};c.pkg.dependencies['dsh-pet']=c.dependency;
    c.pkg.dsh??={};c.pkg.dsh.profile??={};c.pkg.dsh.profile.bundles??=[];
    if(!c.pkg.dsh.profile.bundles.includes('dsh-pet'))c.pkg.dsh.profile.bundles.push('dsh-pet');
    fs.writeFileSync(temporary,JSON.stringify(c.pkg,null,2)+'\n',{mode:0o600});
    if(!fs.readFileSync(c.manifest).equals(c.original))throw Error('Profile在修复期间被其他程序修改，未覆盖；请退出该安装DSH后重试');
    fs.renameSync(temporary,c.manifest);
  }catch(e){
    if(fs.existsSync(temporary))fs.unlinkSync(temporary);
    if(created)fs.rmdirSync(c.link); // Remove only this newly-created junction, never its target.
    throw e;
  }
  return {changed:true,backup};
}
export async function runtimePetRegistration(root) {
  root=path.resolve(root);
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'qq-bridge/config.json'),'utf8').replace(/^\uFEFF/,''));
  const url=new URL(cfg.dsh.baseUrl);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash)throw Error('DSH地址必须是本机HTTP地址');
  process.env.DSH_HOME=path.join(root,'engine-home');process.env.DSH_PROFILE='web';
  const {NodeApiClient,unwrap}=await import(pathToFileURL(path.join(root,'qq-bridge/src/dsh-client.js')).href);
  const api=new NodeApiClient(url.origin,5000,{});
  const bundles=unwrap(await api.callUnary('pluginManager.listBundles',{}),'pluginManager/listBundles');
  if(!Array.isArray(bundles))throw Error('DSH插件管理尚未就绪');
  return {registered:bundles.some(row=>row.name==='dsh-pet')};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [root,mode='--check']=process.argv.slice(2);
    if(!root)throw Error('缺少安装目录');
    const result=mode==='--repair'?ensurePetRegistration(root):mode==='--runtime'?await runtimePetRegistration(root):inspectPetRegistration(root);
    if(mode==='--verify'&&result.needsRepair)throw Error('桌宠注册不完整：缺少依赖、bundle声明或目录链接');
    console.log(JSON.stringify(result));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
