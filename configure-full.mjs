// Configure only the selected installation. No source-machine profiles or credentials.
import fs from 'node:fs';
import {suiteNode} from './qq-bridge/src/suite-runtime.js';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {ensurePetRegistration} from './desktop-pet/pet-registration.mjs';
import {seedCreativeSettings} from './qq-bridge/src/creative-defaults.js';

export function configureFull(root,{seedDefaults=true}={}) {
  if (!fs.existsSync(path.join(root,'full-release.json'))) return;
  const home=path.join(root,'engine-home'),profile=path.join(home,'profiles/web');
  const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2));};
  const junction=(target,link)=>{
    if (!fs.existsSync(target)) throw new Error('完整组件缺失：'+path.relative(root,target));
    fs.mkdirSync(path.dirname(link),{recursive:true});
    try {if(fs.realpathSync(link).toLowerCase()===fs.realpathSync(target).toLowerCase())return;}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(fs.existsSync(link))throw new Error('组件路径已被其他目录占用：'+path.relative(root,link));
    fs.symlinkSync(target,link,'junction');
  };
  const manifest=path.join(profile,'package.json'),pkg=read(manifest);
  const pet=path.join(root,'desktop-pet/dsh-pet/dsh-pet');
  pkg.dependencies={...pkg.dependencies,'dsh-pet':'link:'+pet.replaceAll('\\','/'),
    'dsh-mnemon':'0.5.34','dsh-context':'0.76.0','dsh-vision-router':'3.1.0','@liustack/modsearch':'5.10.10'};
  pkg.dsh??={};pkg.dsh.profile??={};
  pkg.dsh.profile.bundles=[...new Set([...(pkg.dsh.profile.bundles||[]),'dsh-pet'])];
  write(manifest,pkg);
  junction(pet,path.join(profile,'node_modules/dsh-pet'));
  const run=relative=>{
    const result=spawnSync(suiteNode(root),[path.join(root,relative)],{
      cwd:root,windowsHide:true,encoding:'utf8',env:{...process.env,DSH_HOME:home,DSH_PROFILE:'web'}});
    if(result.error||result.status!==0)throw new Error('完整功能配置失败：'+relative+' '+(result.error?.message||result.stderr?.slice(-1200)||''));
  };
  const yaml=createRequire(path.join(root,'qq-bridge/package.json'))('js-yaml');
  const patchFile=path.join(profile,'cordis.patch.yml'),patch=yaml.load(fs.readFileSync(patchFile,'utf8'))||[];
  if(!patch.some(row=>['mnemon','vision-router','modsearch'].includes(row.id)))run('qq-bridge/scripts/configure-optional-dsh.mjs');
  else {
    const memory=patch.find(row=>row.id==='mnemon');
    if(memory?.config)memory.config.cliPath=path.join(root,'qq-bridge/integrations/mnemon-runtime/node_modules/@mnemon-dev/mnemon-win32-x64/bin/mnemon.exe');
    fs.writeFileSync(patchFile,yaml.dump(patch,{lineWidth:-1,noRefs:true}));
  }
  if(!fs.existsSync(path.join(home,'dsh-pet/main-config.jsonc')))run('desktop-pet/configure-local.mjs');
  write(path.join(home,'dsh-pet/local-integrations.json'),{companionTokenFile:path.join(root,'qq-bridge/companion/companion-token')});
  write(path.join(root,'desktop-pet/deployment.json'),{version:'0.3.8',profile:'web',dshExe:path.join(root,'engine/DeepSeek Harness.exe'),petId:'main',qqLinked:false});
  write(path.join(root,'qq-bridge/integrations/bili-standalone/engine.json'),{executable:path.join(root,'engine/DeepSeek Harness.exe')});
  const biliHome=path.join(root,'qq-bridge/companion/bili-native-data');
  junction(path.join(root,'qq-bridge/integrations/bilibili-runtime'),path.join(biliHome,'.venv'));
  junction(path.join(root,'qq-bridge/integrations/bilibili-asr-runtime'),path.join(biliHome,'.venv-asr'));
  junction(path.join(root,'qq-bridge/integrations/whisper-models'),path.join(biliHome,'.hf-cache/hub'));
  const install=path.join(root,'xiaoge-install.json'),settings=read(install);
  settings.version=11;settings.desktopPet={enabled:true,pluginDirectory:'desktop-pet'};
  write(install,settings);
  for(const [name,args] of [['启动桌宠.cmd',''],['关闭桌宠.cmd',' -Hide']]){
    fs.writeFileSync(path.join(root,'desktop-pet',name),'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Pet.ps1"'+args+'\r\n');
  }
  if(seedDefaults)seedCreativeSettings(path.join(root,'qq-bridge'));
  ensurePetRegistration(root);
  console.log('新版桌宠、B站转写、抖音和四项可选插件已配置；桌宠注册检查通过，可选插件默认关闭。');
}
