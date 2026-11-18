import fs from 'node:fs';
import path from 'node:path';
import {createVideoMemoryPolicy} from './reply-options.js';
import {callNativePondConsole} from './bilibili-console.js';
export function createRobotOptionsService({root,replies,getCreative,getQzone,getSendLimits=()=>null,saveSendLimits,callPond=callNativePondConsole}){
 const douyin=createVideoMemoryPolicy(root);
 async function status(){let bili;try{const result=await callPond(root,'GET','/api/bili-pond/long-memory/status');bili=result.status===200?{available:true,enabled:result.data.policy.enabled}:{available:false};}catch{bili={available:false};}
  const images=getCreative().core.status().config.images;return {ok:true,replies:replies.get(),sendLimits:getSendLimits(),images:{enabled:images.enabled,configured:images.configured,model:images.model,provider:images.provider},qzone:getQzone().status().config,bilibili:bili,douyin:{...douyin.get(),available:true},memoryFolders:{bilibili:'companion/bili-native-data/memory-v2',douyin:'companion/douyin-data/memory'}};
 }
 async function handle(req,res,url,readBody){if(url.pathname!=='/robot-options/'&&!url.pathname.startsWith('/api/robot-options/'))return false;
  const send=(code,value)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
  try{if(req.headers['x-agent-token']!==undefined||req.headers['x-agent-call']!==undefined)throw Error('机器人开关仅后台可修改');
   if(req.method==='GET'&&url.pathname==='/robot-options/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'"});res.end(fs.readFileSync(path.join(root,'public/robot-options.html'),'utf8'));return true;}
   if(req.method==='GET'&&url.pathname==='/api/robot-options/status'){send(200,await status());return true;}
   if(req.method!=='POST')throw Error('未知机器人开关接口');const body=await readBody(),action=url.pathname.split('/').pop();
   if(action==='replies'){replies.configure(body);if(body.images===false)for(const job of getCreative().core.status().running)if(job.feature==='images'&&job.scope!=='console')getCreative().core.cancel(job.id);}
   else if(action==='send-limits'){if(!saveSendLimits)throw Error('发送限制服务未就绪，请刷新');await saveSendLimits(body);}
   else if(action==='douyin-memory')douyin.configure(body);
   else if(action==='bili-memory'){if(typeof body.enabled!=='boolean')throw Error('B站记忆开关无效');const r=await callPond(root,'POST','/api/bili-pond/long-memory/policy',{enabled:body.enabled});if(r.status!==200)throw Error(r.data.error||'B站记忆服务暂不可用');}
   else if(action==='qzone'){const current=getQzone().status().config;if(current.revision!==body.revision)throw Error('空间设置已更新，请刷新');if(typeof body.autoPublish!=='boolean')throw Error('自动说说开关无效');await getQzone().core.configure({revision:current.revision,enabled:body.autoPublish||current.enabled,autoWrite:body.autoPublish||current.autoWrite,scheduled:body.autoPublish||current.scheduled,autoPublish:body.autoPublish});}
   else throw Error('未知机器人开关接口');send(200,await status());
  }catch(error){send(error.status||400,{ok:false,error:String(error.message||'设置未完成').slice(0,200)});}return true;
 }
 return {handle,status};
}
