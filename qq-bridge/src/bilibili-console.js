import fs from 'node:fs';
import path from 'node:path';
import {pondModelAccountState} from './pond-model-status.js';
const allowed=new Set(['status','config','login-start','login-poll','search','watch','run','report']);
export async function callNativePondConsole(root,method,requestPath,body,{request=fetch}={}){
  if(!requestPath.startsWith('/api/bili-pond/'))throw new Error('无效鱼塘接口');
  if(method==='GET'&&requestPath.split('?')[0]==='/api/bili-pond/model-account-state')return {status:200,data:await pondModelAccountState(root)};
  let token;try{token=fs.readFileSync(path.join(root,'companion/companion-token'),'utf8').trim();}catch{return {status:503,data:{ok:false,error:'B站鱼塘生活服务尚未就绪，请检查 companion-error.log 中的启动错误。'}};}
  try{
    const response=await request(new URL(requestPath,'http://127.0.0.1:17867'),{method,headers:{'Content-Type':'application/json','X-Companion-Token':token},...(method==='POST'?{body:JSON.stringify(body||{})}:{}),signal:AbortSignal.timeout(120000)});
    let data;try{data=await response.json();}catch{return {status:502,data:{ok:false,error:'B站鱼塘服务返回了无效数据，请查看生活服务日志。'}};}
    if(response.status===403&&data?.error==='Unauthorized')return {status:403,data:{ok:false,code:'COMPANION_AUTH_FAILED',error:'本机B站生活服务令牌不匹配，请通过原启动器关闭并重新启动生活服务；B站账号和记录保留'}};
    return {status:response.status,data};
  }catch(error){
    const timeout=error.name==='TimeoutError'||error.name==='AbortError';
    return {status:timeout?504:503,data:{ok:false,error:timeout?'B站鱼塘服务响应超时，请稍后刷新；若持续出现，请查看生活服务日志。':'B站鱼塘服务未连接，可能启动失败或进程已退出；请查看 companion-error.log，修复后重启生活服务。'}};
  }
}
// Called only after the bridge's console-only token and origin checks.
export async function callBilibiliConsole(root,action,args={}){
  if(!allowed.has(action))throw new Error('未知B站后台操作');
  let token;try{token=fs.readFileSync(path.join(root,'companion/companion-token'),'utf8').trim();}catch{throw new Error('请先启动机器人生活服务');}
  const response=await fetch('http://127.0.0.1:17867/bilibili',{method:'POST',headers:{'Content-Type':'application/json','X-Companion-Token':token},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(120000)});
  const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'B站后台请求失败');return result;
}
