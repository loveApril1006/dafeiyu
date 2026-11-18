import {suiteNode} from '../src/suite-runtime.js';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {makeCompanion} from './companion-core.mjs';
import {makeBilibili} from './bilibili-core.mjs';
import {createNativePond} from './bilibili-native.mjs';
import {parseCreativeCommand} from '../src/creative-commands.js';
import {integrationFailure} from '../src/integration-errors.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const keyFile=path.join(root,'companion-token');
if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,randomBytes(32).toString('hex'));
const token=fs.readFileSync(keyFile,'utf8').trim(),node=suiteNode(path.resolve(root,'../..'));
let activeBrains=0;
const brainChildren=new Set();
function cancelBrainRequests(){for(const child of brainChildren)if(child.connected)child.send({type:'cancel'},()=>{});}
function brain(prompt,{signal,channel='local'}={}){
 if(signal?.aborted)return Promise.reject(signal.reason);
 if(activeBrains>=2)return Promise.reject(new Error('本地模型正在处理其他请求，请等待结果'));
 activeBrains++;
 return new Promise((resolve,reject)=>{
  const child=spawn(node,['--expose-internals',path.join(root,'chat-via-dsh.mjs')],{windowsHide:true,stdio:['pipe','pipe','pipe','ipc']});
  brainChildren.add(child);
  const cancel=()=>{if(child.connected)child.send({type:'cancel'},()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  let output='',err='',finished=false;
  const timer=setTimeout(()=>{finished=true;child.kill();reject(new Error('聊天模型超时'));},90000);
  child.stdout.on('data',b=>{if(finished)return;output+=b;if(output.length>300000){output='';cancel();finished=true;reject(new Error('模型返回内容过大'));}});child.stderr.on('data',b=>err=(err+b).slice(-2000));
  child.on('error',e=>{brainChildren.delete(child);clearTimeout(timer);signal?.removeEventListener('abort',cancel);finished=true;reject(e);});
  child.on('close',()=>{brainChildren.delete(child);clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(finished)return;try{const result=JSON.parse(output.trim());if(!result.ok)throw new Error(result.error);resolve(result.text);}catch(e){reject(new Error(e.message||err||'模型返回无效内容'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({prompt,channel}));
 }).finally(()=>{activeBrains--;});
}
async function onebot(action,params){
  const cfg=JSON.parse(fs.readFileSync(path.resolve(root,'../config.json'),'utf8'));
  const bodyText=JSON.stringify(params);
  const secrets=[token,cfg.snowluma?.accessToken,cfg.dsh?.authToken];
  try{secrets.push(fs.readFileSync(path.resolve(root,'../state/console-token'),'utf8').trim());}catch{}
  if(secrets.some(value=>typeof value==='string'&&value.length>=12&&bodyText.includes(value)))throw new Error('内容包含访问凭据，已拦截');
  if(['get_qzone_msg_list','send_qzone_msg','like_qzone','comment_qzone'].includes(action))return new Promise((resolve,reject)=>{
    const portablePython=path.resolve(root,'../../local-tts/runtime/python.exe');
    const child=spawn(fs.existsSync(portablePython)?portablePython:path.resolve(root,'../../local-tts/.venv/Scripts/python.exe'),[path.join(root,'qzone_transport.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('空间请求超时；请先检查实际结果，避免重复操作'));},65000);
    child.stdout.on('data',data=>{output+=data;if(output.length>2_000_000)child.kill();});child.stderr.resume();
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',()=>{clearTimeout(timer);try{const result=JSON.parse(output);if(!result.ok)throw new Error(result.error);resolve(result.data);}catch(e){reject(e);}});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({action,params}));
  });
  const base=cfg.snowluma?.httpUrl;if(!base)throw new Error('SnowLuma HTTP 未配置');
  const url=new URL(action,base.endsWith('/')?base:base+'/');if(!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('只允许本机 SnowLuma');
  const result=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(cfg.snowluma.accessToken?{Authorization:'Bearer '+cfg.snowluma.accessToken}:{})},body:JSON.stringify(params),signal:AbortSignal.timeout(25000)});
  const body=await result.json();if(!result.ok||body.status==='failed'||Number(body.retcode||0)!==0)throw new Error(String(body.message||body.wording||'QQ接口执行失败').slice(0,180));return body.data;
}
let bilibili;
let nativePond;
let nativePondFailure;
try{const legacy=makeBilibili({root,brain:prompt=>brain(prompt,{channel:'bilibili'})});nativePond=createNativePond({root,legacy});bilibili=nativePond.compatibility;}
catch(error){nativePondFailure=integrationFailure(error,'B站');nativePondFailure.status=503;console.error('[B站启动失败] '+nativePondFailure.data.code+' '+nativePondFailure.data.error);bilibili={request:async()=>{throw Object.assign(new Error(nativePondFailure.data.error),{status:503,code:nativePondFailure.data.code});},tick:async()=>{}};}
const app=makeCompanion({root,brain,onebot,bilibili});
async function stopRobotDouyin(){try{await fetch('http://127.0.0.1:17869/shutdown',{method:'POST',headers:{'content-type':'application/json','x-companion-token':token},body:'{}',signal:AbortSignal.timeout(2500)});}catch{}}
const server=http.createServer(async(req,res)=>{
  function send(status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
  if(req.method==='GET'&&req.url==='/health'){send(200,{ok:true,service:'xiaoge-companion',version:'economy-1',activeModelRequests:activeBrains,socialMode:'explicit-only',desktopPet:false});return;}
  const supplied=Buffer.from(String(req.headers['x-companion-token']||'')),expected=Buffer.from(token);
  if(req.headers.origin||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){send(403,{ok:false,error:'Unauthorized'});return;}
  try{
    if(req.method==='POST'&&req.url==='/shutdown'){cancelBrainRequests();await stopRobotDouyin();nativePond?.close();send(200,{ok:true});server.close();server.closeIdleConnections();return;}
    if(req.url.startsWith('/api/bili-pond/')){if(!nativePond){send(503,nativePondFailure?.data||{ok:false,code:'BILI_NOT_STARTED',error:'B站模块未启动，请查看生活服务错误日志'});return;}await nativePond.handle(req,res);return;}
    if(req.method==='POST'&&req.url==='/bilibili'){
      let body='';for await(const part of req){body+=part;if(body.length>20000)throw new Error('Request too large');}
      const data=JSON.parse(body);send(200,await bilibili.request(data.action,data.args));return;
    }
    if(req.method!=='POST'||req.url!=='/chat'){send(404,{ok:false});return;}
    let body='';for await(const part of req){body+=part;if(body.length>20000)throw new Error('Request too large');}
    const data=JSON.parse(body),text=String(data.text||'').trim();if(!text||text.length>4000)throw new Error('请说一句短一点的话');
    const controller=new AbortController(),cancel=()=>{if(!res.writableEnded)controller.abort(new Error('客户端已断开'));};
    req.once('aborted',cancel);res.once('close',cancel);if(res.destroyed||req.aborted)cancel();
    try{
      if((data.channel||'local')==='local'&&parseCreativeCommand(text)){
        const cfg=JSON.parse(fs.readFileSync(path.join(root,'../config.json'),'utf8')),consoleToken=cfg.consoleToken||fs.readFileSync(path.join(root,'../state/console-token'),'utf8').trim(),port=cfg.consolePort||3100;
        const response=await fetch('http://127.0.0.1:'+port+'/api/creative/desktop-request',{method:'POST',headers:{'content-type':'application/json','X-Console-Token':consoleToken,Origin:'http://127.0.0.1:'+port},body:JSON.stringify({text}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'创作功能未完成');send(200,result);
      }else send(200,await app.run(text,data.channel||'local',{signal:controller.signal}));
    }
    finally{req.removeListener('aborted',cancel);res.removeListener('close',cancel);}
  }catch(e){const failure=integrationFailure(e,req.url.startsWith('/api/bili-pond/')?'B站':'生活服务');send(failure.status,failure.data);}
});
server.listen(17867,'127.0.0.1',()=>console.log('READY companion 17867; social explicit-only; QQ isolated'));

process.once('SIGTERM',()=>{cancelBrainRequests();void stopRobotDouyin();nativePond?.close();server.close();server.closeIdleConnections();});
process.once('SIGINT',()=>{cancelBrainRequests();void stopRobotDouyin();nativePond?.close();server.close();server.closeIdleConnections();});
