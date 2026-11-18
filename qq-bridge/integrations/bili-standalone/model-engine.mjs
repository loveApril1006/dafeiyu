import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NodeApiClient,unwrap,readBrowserSessionSecret,mintBrowserSessionCookie} from '../../src/dsh-client.js';
import {getProviderSettings,saveProvider} from '../../src/model-manager.js';
import {initializePondModelHome} from './model-home.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));

export function createPondModelEngine({home,suiteRoot,executable=path.join(suiteRoot,'engine/DeepSeek Harness.exe')}){
  initializePondModelHome(home);
  let child,baseUrl='',client,flight,closed=false;
  const rpc=async(method,args={})=>{await start();return unwrap(await client.callUnary(method,args),method);};
  async function start(){
    if(closed)throw Error('鱼塘模型服务已停止');
    if(child&&child.exitCode===null&&client)return;
    if(flight)return flight;
    flight=(async()=>{
      const cli=path.join(path.dirname(executable),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js');
      if(!fs.existsSync(executable))throw Error('缺少鱼塘模型引擎，请修复安装');
      const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
      const out=fs.openSync(path.join(home,'engine.log'),'a'),err=fs.openSync(path.join(home,'engine-error.log'),'a');
      const env={...process.env,DSH_HOME:home,DSH_PROFILE:'web',DSH_PROFILE_DIR:path.join(home,'profiles/web'),ELECTRON_RUN_AS_NODE:'1'};
      for(const key of ['NODE_OPTIONS','NODE_PATH','XIAOGE_BACKEND_ROOT','XIAOGE_BACKEND_SERVICE'])delete env[key];
      try{child=spawn(executable,['--require',path.join(here,'model-engine-control.cjs'),'--expose-internals',cli,'--profile','web','--host','127.0.0.1','--port',String(port),'--no-open'],{cwd:home,env,windowsHide:true,shell:false,stdio:['ignore',out,err,'ipc']});}
      finally{fs.closeSync(out);fs.closeSync(err);}
      const running=child;let spawnError;running.once('error',e=>spawnError=e);
      baseUrl='http://127.0.0.1:'+port;
      client=new NodeApiClient(baseUrl,15000,{});client.browserSessionSecret=()=>readBrowserSessionSecret(home);
      running.once('exit',()=>{if(child===running){client=null;baseUrl='';}});
      for(let i=0;i<120;i++){
        if(closed)throw Error('鱼塘模型服务正在停止');
        if(spawnError||running.exitCode!==null)throw Error('鱼塘模型引擎启动失败，请查看鱼塘数据目录中的 engine-error.log');
        if(readBrowserSessionSecret(home)){
          try{await client.callUnary('account.getState',{});return;}catch{}
        }
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      throw Error('鱼塘模型引擎启动超时，请查看鱼塘数据目录中的 engine-error.log');
    })();
    try{await flight;}catch(e){if(child?.connected)child.send({type:'xiaoge-pond-stop'},()=>{});client=null;throw e;}finally{flight=null;}
  }
  return {
    home,
    async account(){const result=await rpc('account.getState');return {ok:true,isolated:true,status:result.status==='credential-stored'?'signed-in':'signed-out'};},
    async session(){await start();return {url:baseUrl+'/',cookie:mintBrowserSessionCookie(baseUrl,readBrowserSessionSecret(home),{lifetimeMs:30*60*1000})+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800'};},
    async catalog(){return (await rpc('session.modelCatalog')).groups||[];},
    async providers(){return {ok:true,...await getProviderSettings(rpc)};},
    async saveProvider(input){return saveProvider(rpc,input);},
    close(){closed=true;if(child?.connected)child.send({type:'xiaoge-pond-stop'},()=>{});},
  };
}
