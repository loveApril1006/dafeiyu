// Add missing full-edition registrations; never run the first-install account reset.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';import {isDeepStrictEqual} from 'node:util';
try{
const root=path.resolve(process.argv[2]),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8').replace(/^\uFEFF/,''));
const original=fs.existsSync(path.join(root,'xiaoge-install.json'))?read('xiaoge-install.json'):{installedAt:null,qqEnabled:true};
const cfg=read('qq-bridge/config.json');if(!cfg.dsh||!cfg.snowluma)throw Error('原安装核心配置不完整，未初始化覆盖');
const retain=new Map();for(const name of ['engine-home/dsh-pet/local-voice.json','engine-home/dsh-pet/local-integrations.json','desktop-pet/deployment.json'])if(fs.existsSync(path.join(root,name)))retain.set(name,fs.readFileSync(path.join(root,name)));
const profile=path.join(root,'engine-home/profiles/web/package.json');if(!fs.existsSync(profile))throw Error('原DSH配置缺失，请先恢复原Profile，未新建账号或覆盖记录');
const profileBefore=fs.readFileSync(profile),previousProfile=JSON.parse(profileBefore.toString('utf8').replace(/^\uFEFF/,''));
const patchFile=path.join(root,'engine-home/profiles/web/cordis.patch.yml'),patchBefore=fs.existsSync(patchFile)?fs.readFileSync(patchFile):null;
const yaml=createRequire(path.join(root,'qq-bridge/package.json'))('js-yaml');
const previousPatch=patchBefore?yaml.load(patchBefore.toString('utf8')):null;
const {configureFull}=await import(pathToFileURL(path.join(root,'configure-full.mjs')).href);configureFull(root,{seedDefaults:false});
// Add only missing registrations. Existing providers, model choices, switches,
// custom dependencies and original formatting remain the user's configuration.
const generated=read('engine-home/profiles/web/package.json');
const optionalBundles=new Set(['dsh-mnemon','dsh-context','dsh-vision-router','@liustack/modsearch','dsh-pet']);
const additions=(generated.dsh?.profile?.bundles??[]).filter(id=>!optionalBundles.has(id)||(id==='dsh-pet'&&original.desktopPet?.enabled!==false));
const mergedProfile={...generated,...previousProfile,dependencies:{...generated.dependencies,...previousProfile.dependencies},dsh:{...generated.dsh,...previousProfile.dsh,profile:{...generated.dsh?.profile,...previousProfile.dsh?.profile,bundles:Object.hasOwn(previousProfile.dsh?.profile??{},'bundles')?previousProfile.dsh.profile.bundles:additions}}};
fs.writeFileSync(profile,isDeepStrictEqual(mergedProfile,previousProfile)?profileBefore:JSON.stringify(mergedProfile,null,2)+'\n');
if(Array.isArray(previousPatch)){
 const generatedPatch=yaml.load(fs.readFileSync(patchFile,'utf8'))||[],ids=new Set(previousPatch.map(row=>row?.id));
 const mergedPatch=previousPatch.length?[...previousPatch,...generatedPatch.filter(row=>!ids.has(row?.id))]:[];
 const memory=mergedPatch.find(row=>row?.id==='mnemon'),generatedMemory=generatedPatch.find(row=>row?.id==='mnemon');
 let pathChanged=false;
 if(memory?.config&&generatedMemory?.config?.cliPath&&memory.config.cliPath!==generatedMemory.config.cliPath){memory.config={...memory.config,cliPath:generatedMemory.config.cliPath};pathChanged=true;}
 fs.writeFileSync(patchFile,!pathChanged&&mergedPatch.length===previousPatch.length?patchBefore:yaml.dump(mergedPatch,{lineWidth:-1,noRefs:true}));
}
for(const [name,bytes]of retain){
 if(name.endsWith('local-voice.json')){fs.writeFileSync(path.join(root,name),bytes);continue;}
 const previous=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),generated=read(name),value={...generated,...previous};
 if(name.endsWith('deployment.json')){value.version=generated.version;value.dshExe=generated.dshExe;}
 fs.writeFileSync(path.join(root,name),isDeepStrictEqual(value,previous)?bytes:JSON.stringify(value,null,2));
}
const next={...read('xiaoge-install.json'),...original,edition:'full',version:26,updatedAt:new Date().toISOString()};next.desktopPet={...next.desktopPet,pluginDirectory:'desktop-pet',enabled:next.desktopPet?.enabled??true};
fs.writeFileSync(path.join(root,'xiaoge-install.json'),JSON.stringify(next,null,2)+'\n');
const {migrateReleaseProfile}=await import(pathToFileURL(path.join(root,'qq-bridge/release-profile.mjs')).href);
const migration=migrateReleaseProfile(root,{addMissing:true});
const {hardenInstalledData}=await import(pathToFileURL(path.join(root,'qq-bridge/src/state-acl.mjs')).href);
hardenInstalledData(path.join(root,'qq-bridge'));
console.log('已保留原账号、模型配置、聊天/记忆数据；仅补齐缺失的公开配置：'+(migration.changes?.length||0)+' 个配置位置。');

}catch{console.error("兼容性迁移未完成，请检查原配置；原配置未重新初始化，安装器将恢复本次程序改动。");process.exitCode=1;}
