const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');

// Fixed installation action only; renderer input never supplies a command or path.
function createSuitePetControl({runtimeDir=__dirname,platform=process.platform,env=process.env,exists=fs.existsSync,run=execFile}={}){
  if(platform!=='win32')return null;
  const root=path.resolve(runtimeDir,'../../../../..');
  const script=path.join(root,'Manage-Pet.ps1');
  if(!exists(script)||!exists(path.join(root,'full-release.json')))return null;
  let flight;
  return {exit(){
    if(flight)return flight;
    flight=new Promise((resolve,reject)=>{
      const powershell=path.join(env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
      run(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Action','stop','-Root',root],{windowsHide:true,shell:false,timeout:90000},error=>error?reject(new Error('桌宠退出失败，请在大肥鱼管理窗口重试。')):resolve());
    }).finally(()=>{flight=null;});
    return flight;
  }};
}
module.exports={createSuitePetControl};
