import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {scryptSync,timingSafeEqual} from 'node:crypto';
const [action,root,portText]=process.argv.slice(2),port=Number(portText)||17860;
try{
 if(action==='pet'){
  if(fs.existsSync(path.join(root,'engine-home'))){process.env.DSH_HOME=path.join(root,'engine-home');process.env.DSH_PROFILE='web';}
  else{try{process.env.DSH_PROFILE=JSON.parse(fs.readFileSync(path.join(root,'desktop-pet/deployment.json'),'utf8')).profile||'desktop';}catch{process.env.DSH_PROFILE='desktop';}}
  const {NodeApiClient,unwrap}=await import(pathToFileURL(path.join(root,'qq-bridge/src/dsh-client.js')).href);
  const api=new NodeApiClient('http://127.0.0.1:'+port,8000,{});
  const r=unwrap(await api.callUnary('pluginManager.setBundleEnabled',{name:'dsh-pet',enabled:false}),'pluginManager/setBundleEnabled');
  if(r.application==='failed')throw Error();
 }else if(action==='bridge'){
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'qq-bridge/config.json'),'utf8').replace(/^\uFEFF/,''));
  const token=cfg.consoleToken||fs.readFileSync(path.join(root,'qq-bridge/state/console-token'),'utf8').trim();
  let stopped=false;
  for(const route of ['/api/shutdown','/api/restart']){const r=await fetch('http://127.0.0.1:'+port+route,{method:'POST',headers:{'content-type':'application/json','X-Console-Token':token},body:'{}',signal:AbortSignal.timeout(8000),redirect:'error'});if(r.ok){const data=await r.json();if(data.ok){stopped=true;break;}}}
  if(!stopped)throw Error();
 }else if(action==='unload-qq'){
  const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8').replace(/^\uFEFF/,''));
  const auth=read('SnowLuma/config/webui.json'),password=read('安装信息.json').qqWebPassword;
  if(!password||auth.totp?.enabled)throw Error();
  const actual=scryptSync(password,Buffer.from(auth.passwordSalt,'hex'),64,{N:16384,r:8,p:1}),expected=Buffer.from(auth.passwordHash,'hex');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error();
  let token='';
  const web=async(route,body)=>{
   const r=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(8000),redirect:'error'});
   if(!r.ok)throw Error();return r.json();
  };
  const login=await web('login',{password});if(!login.success||!login.token||login.needsTotp||login.mustChangePassword)throw Error();token=login.token;
  const list=await web('processes');if(!Array.isArray(list.list))throw Error();
  for(const p of list.list.filter(p=>p.connected||p.injected||p.loggedIn)){
   if(!Number.isInteger(p.pid)||p.pid<=0)throw Error();
   const result=await web('processes/'+p.pid+'/unload',{});if(!result.success)throw Error();
  }
 }else throw Error();
 console.log(JSON.stringify({ok:true}));
}catch{console.log(JSON.stringify({ok:false,message:'组件退出请求未完成，继续检查本安装的剩余进程。'}));process.exitCode=1;}
