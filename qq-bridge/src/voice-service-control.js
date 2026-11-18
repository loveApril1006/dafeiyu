import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

// A long-lived Python child can inherit a pipe handle from PowerShell. Wait for
// the script's exit and read its result file, rather than waiting for pipe EOF.
function runFile(file,args,options) {
  return new Promise((resolve,reject)=>{
    const fd=fs.openSync(options.logPath,'a',0o600);
    let child;
    try{child=spawn(file,args,{cwd:options.cwd,windowsHide:true,stdio:['ignore',fd,fd]});}
    catch(error){reject(error);return;}finally{fs.closeSync(fd);}
    const timer=setTimeout(()=>{child.kill();reject(Object.assign(Error('Voice restart timed out'),{code:'RESTART_TIMEOUT'}));},options.timeout);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{
      clearTimeout(timer);
      let stdout='';try{stdout=fs.readFileSync(options.reportPath,'utf8');}catch{}
      if(code===0)resolve({stdout});else reject(Object.assign(Error('Voice restart script failed'),{code,stdout}));
    });
  });
}
const endpoint = 'http://127.0.0.1:17866/health';
export function createVoiceServiceControl({root, execute=runFile, fetchImpl=fetch, platform=process.platform}) {
  const voiceRoot=path.resolve(root,'../GPT-SoVITS');
  let job={state:'idle'}, pending=null;
  async function health() {
    try {
      const response=await fetchImpl(endpoint,{signal:AbortSignal.timeout(2000),redirect:'error'});
      if(!response.ok)return {available:false};
      const value=await response.json();
      if(value.ok!==true||value.engine!=='gpt-sovits')return {available:false};
      return {available:true,voice:String(value.voice||''),name:String(value.name||''),compute:String(value.compute||''),modelState:String(value.modelState||'')};
    } catch { return {available:false}; }
  }
  function record(message) {
    try{fs.mkdirSync(path.join(root,'state'),{recursive:true});fs.appendFileSync(path.join(root,'state/voice-service-control.log'),new Date().toISOString()+' '+message+'\n');}catch{}
  }
  async function status(){return {ok:true,job:{...job},health:await health()};}
  function restart() {
    if(pending)return {ok:true,job:{...job}};
    if(platform!=='win32')throw Object.assign(Error('语音服务重启目前仅支持 Windows'),{status:400});
    const script=path.join(voiceRoot,'Restart-GPT-SoVITS.ps1');
    if(!fs.existsSync(script))throw Object.assign(Error('语音重启脚本缺失，请更新安装目录中的 GPT-SoVITS 文件'),{status:503});
    job={state:'restarting',startedAt:new Date().toISOString(),message:'正在重启语音服务…'};
    record('Restart requested.');
    const reportPath=path.join(root,'state',`voice-restart-${randomUUID()}.json`);
    pending=(async()=>{
      let result;
      try {
        result=await execute('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-ReportPath',reportPath],{cwd:voiceRoot,windowsHide:true,timeout:240000,reportPath,logPath:path.join(root,'state/voice-service-process.log')});
        const value=JSON.parse(String(result.stdout||'').trim());
        if(value.ok!==true)throw Object.assign(Error('Voice restart failed'),{stdout:result.stdout});
        const current=await health();
        if(!current.available)throw Error('Voice health check failed');
        job={...job,state:'ready',finishedAt:new Date().toISOString(),message:'语音服务已重启，健康检查通过。'};
        record('Restart completed; health check passed.');
      } catch(error) {
        let detail='语音重启未完成，请查看 qq-bridge/state/voice-service-control.log 和 GPT-SoVITS/pet-service-error.log';
        try {const value=JSON.parse(String(error.stdout||result?.stdout||'').trim());if(typeof value.error==='string'&&/^(语音|17866)/.test(value.error))detail=value.error.slice(0,250);}catch{}
        job={...job,state:'failed',finishedAt:new Date().toISOString(),message:detail};
        // The script emits only a fixed result object, never credentials or synthesized text.
        record('Restart failed: '+detail);
        record('Process detail: '+JSON.stringify({code:error.code||'',stdout:String(error.stdout||result?.stdout||'').slice(0,4000),stderr:String(error.stderr||result?.stderr||'').slice(0,4000)}));
      } finally {pending=null;try{fs.unlinkSync(reportPath);}catch{}}
    })();
    return {ok:true,job:{...job}};
  }
  return {restart,status,wait:()=>pending};
}
