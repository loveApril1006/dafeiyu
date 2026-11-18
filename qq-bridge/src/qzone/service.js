import fs from 'node:fs';
import path from 'node:path';
import {createQzoneCore} from './core.js';
import {publishQzone} from './transport.js';
import {completeDshText} from '../dsh-completion.js';
import {unwrap,isLoopbackBase} from '../dsh-client.js';
import {selectLocalModel} from '../../companion/select-local-model.mjs';

export function explainQzoneImageFailure(error){
 const messages=[];let item=error;for(let i=0;item&&i<5;i++,item=item.cause)messages.push(String(item.message||'').slice(0,8000));
 const first=messages[0]||'',all=messages.join('\n'),job=first.match(/任务\s+([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})/i)?.[1];
 let reason;
 if(/每日任务上限/.test(first))reason='画图工作台的每日生成次数已用完，请检查本地额度设置';
 else if(/此会话还有未完成的生图任务/.test(first))reason='后台还有未完成的生图任务，已阻止新的付费生成；请到画图工作台先取回或核对旧任务';
 else if(/任务正在运行|这项任务尚未完成/.test(first))reason='画图服务正忙，已有任务尚未完成';
 else if(/图片已生成但下载失败|旧图片下载仍失败/.test(first))reason='图片已生成，但下载未完成；已保留旧图回执，请在画图工作台取回旧图，不要重新生图';
 else if(/图库.*(?:上限|空间不足)|图库空间不足/.test(first))reason='本地图库容量已满，请先清理不需要的图片';
 else if(/已关闭|请先配置生图/.test(first))reason='画图总开关、模型或密钥尚未就绪，请检查画图工作台配置';
 else if(/Insufficient.?Balance|insufficient.*balance|余额不足|account balance is insufficient|image request failed \(402\)/i.test(all))reason='生图接口拒绝请求，返回余额或可用额度不足；请核对当前生图密钥对应的账号';
 else if(/image request failed \((?:401|403)\)/i.test(all))reason='生图接口拒绝认证或权限不足，请核对当前生图模型与密钥';
 else if(/image request failed \((?:400|404|422)\)/i.test(all))reason='生图接口拒绝了模型或图片参数，请检查模型、参考图与接口配置';
 else if(/生图请求未完成或结果不确定/.test(first))reason='生图请求结果尚未确认，已暂停重复提交；请到画图工作台核对旧任务';
 else reason='自动说说配图未完成，具体原因尚未确认；请查看画图工作台任务记录和空间配图诊断日志';
 return '配图失败：'+reason+(job?'（任务 '+job+'）':'')+'；本次未发布。';
}

export function createQzoneService({root,getDsh,getApi,getRole=()=>'',getCreative,getCompanion=()=>null,onPublished=()=>{},dependencies={}}){
 let core;
 async function model(prompt,{signal}){const cfg=getDsh(),api=getApi();if(!api||!isLoopbackBase(cfg?.baseUrl))throw Error('请先连接本机聊天模型');
  const presets=unwrap(await api.callUnary('agentPresets.list',{},signal),'agentPresets/list').presets||[];if(!presets.some(p=>p.id==='bilibili-live'&&!p.broken))throw Error('缺少无工具写稿预设，请先更新本机引擎');
  const cwd=path.join(core.home,'writer-workspace');fs.mkdirSync(cwd,{recursive:true});return completeDshText({baseUrl:cfg.baseUrl,api,cwd,preset:'bilibili-live',content:[{type:'text',text:prompt}],signal,timeoutMs:65000,selectModel:(client,id,s)=>selectLocalModel(client,unwrap,id,cfg,s)});
 }
 // This lookup reads only completed local images for the same prompt and console scope.
 // Missing images never start a paid generation or wait for an old job/download.
 function getReadyImage(prompt,signal){signal?.throwIfAborted();return getCreative()?.core.readyImage?.(prompt,'console')||null;}
 core=createQzoneCore({root,model:dependencies.model||model,getReadyImage:dependencies.getReadyImage||getReadyImage,publish:dependencies.publish||((value,signal)=>publishQzone(root,value,signal)),checkPublisher:dependencies.checkPublisher||(signal=>publishQzone(root,{probe:true},signal)),getRole,getCompanion,onPublished,harden:dependencies.harden!==false,...dependencies.core});
 function status(){const images=getCreative?.().core.status().config.images;return {...core.status(),imageService:{enabled:!!images?.enabled,configured:!!images?.configured},model:{model:getDsh()?.model||'',reuseExisting:true}};}
 const json=(res,code,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 async function handle(req,res,url){if(url.pathname!=='/qzone/'&&!url.pathname.startsWith('/api/qzone/'))return false;
  try{
   if(req.headers['x-agent-token']!==undefined||req.headers['x-agent-call']!==undefined){json(res,403,{ok:false,error:'空间管理仅控制台可用'});return true;}
   if(req.method==='GET'&&url.pathname==='/qzone/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'"});res.end(fs.readFileSync(path.join(root,'public/qzone.html'),'utf8'));return true;}
   if(req.method==='GET'&&url.pathname==='/api/qzone/status'){json(res,200,status());return true;}
   const match=/^\/api\/qzone\/image\/([a-f0-9-]{36})$/.exec(url.pathname);if(req.method==='GET'&&match){const image=core.image(match[1]);res.writeHead(200,{'content-type':image.mime,'cache-control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(image.file).pipe(res);return true;}
   if(req.method!=='POST'){json(res,404,{ok:false,error:'未知空间接口'});return true;}
   let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>32000)throw Error('空间请求过大');chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'),controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort(Error('客户端已断开'));});
   if(url.pathname==='/api/qzone/config')await core.configure(body);
   else if(url.pathname==='/api/qzone/run')await core.generate({preview:body.preview===true,report:body.report===true},controller.signal);
   else if(url.pathname==='/api/qzone/publish')await core.publishDraft(body.id,controller.signal);
   else if(url.pathname==='/api/qzone/stop')await core.stop();
   else{json(res,404,{ok:false,error:'未知空间接口'});return true;}
   json(res,200,status());return true;
  }catch(error){json(res,Number(error.status)||400,{ok:false,error:String(error.publicMessage||'空间操作未完成：'+(error.message||'请检查配置')).replace(/https?:\/\/\S+/g,'[服务地址]').replace(/[A-Za-z0-9_+/=-]{40,}/g,'[已隐藏]').slice(0,240)});return true;}
 }
 return {core,status,handle,resume:()=>core.resume(),close:()=>core.close()};
}
