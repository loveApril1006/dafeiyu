import fs from 'node:fs';
import {suiteNode} from './suite-runtime.js';
import path from 'node:path';
import {spawn} from 'node:child_process';
let starting;
const allowed=new Set(['native','settings','media-key','status','models','select-model','vision-check','caption','open','start','stop','schedule','comments','persona','persona-sync','options','contacts','chat-config','interactions','share-config','video-policy','report','task','publish-prepare','publish-upload','publish-submit']);
async function health(){try{const r=await fetch('http://127.0.0.1:17869/health',{signal:AbortSignal.timeout(1500)});const d=await r.json();if(d.service!=='xiaoge-douyin')throw Error('17869端口被其他服务占用');if(d.closing)throw Object.assign(Error('抖音模块正在停止，请稍后重试'),{code:'SERVICE_STOPPING',status:503});return d.ok;}catch(e){if(e.message.includes('占用')||e.code==='SERVICE_STOPPING')throw e;return false;}}
export function assertDouyinRuntime(root){
 const required=['companion/douyin-service.mjs','integrations/douyin-agent-upstream/app.mjs','integrations/douyin-agent-upstream/api-agent.mjs','integrations/douyin-agent-upstream/model-errors.mjs'];
 const missing=required.filter(name=>!fs.existsSync(path.join(root,name)));
 if(missing.length)throw Object.assign(Error('抖音安装包缺少运行文件：'+missing.join('、')+'。请使用完整修复更新包覆盖更新'),{status:503,code:'DOUYIN_BUNDLE_INCOMPLETE'});
}
async function ensure(root){
  if(await health())return;
  assertDouyinRuntime(root);
  if(!starting)starting=(async()=>{
    const entry=path.join(root,'companion/douyin-service.mjs'),node=suiteNode(path.resolve(root,'..'));
    const log=fs.openSync(path.join(root,'state/douyin-service.log'),'a');
    try{const child=spawn(node,['--expose-internals',entry],{cwd:root,windowsHide:true,detached:true,stdio:['ignore',log,log]});child.on('error',()=>{});child.unref();}finally{fs.closeSync(log);}
    for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));if(await health())return;}
    throw Object.assign(Error('抖音模块启动失败，请查看 state/douyin-service.log；可能是运行文件、账号或网络配置未就绪'),{status:503,code:'DOUYIN_STARTUP_FAILED'});
  })().finally(()=>{starting=null;});
  await starting;
}
export async function callDouyinConsole(root,action,args={}){
  if(!allowed.has(action)&&!['publish-library','open-folder'].includes(action))throw Error('未知抖音操作');await ensure(root);
  const token=fs.readFileSync(path.join(root,'companion/companion-token'),'utf8').trim();
  const response=await fetch('http://127.0.0.1:17869/douyin',{method:'POST',headers:{'content-type':'application/json','x-companion-token':token},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(action.startsWith('publish-')?360000:95000)});
  const data=await response.json();if(!response.ok||!data.ok)throw Object.assign(Error(data.error||data.message||'抖音模块返回失败'),{status:response.ok?400:response.status});return data;
}
export async function callDouyinCommand(root,name,arg=''){
  const actions={'抖音状态':'status','打开抖音':'open','刷抖音':'start','停止抖音':'stop','抖音日报':'report'};
  if(name==='发抖音') {const m=/^(.+?)\s*\|\s*(.+)$/.exec(arg);if(!m)throw Error('格式：#发抖音 视频绝对路径 | 标题（先准备私密草稿）');const r=await callDouyinConsole(root,'publish-prepare',{videoPath:m[1].trim(),title:m[2].trim(),visibility:'private'});return '已准备视频草稿：'+r.draft.id+'。请到机器人后台“抖音”核对可见范围并上传或发布。';}
  const result=await callDouyinConsole(root,actions[name]);
  if(name==='抖音状态')return '抖音模块已连接；模型：'+result.model.provider+'/'+result.model.model+'；观看：'+(result.watch.running?'运行中':'已停止')+'。登录与设置请在机器人后台“抖音”操作。';
  if(name==='抖音日报')return JSON.stringify(result.data);
  return name==='停止抖音'?'已停止自动观看。':name==='打开抖音'?'已请求打开专用抖音浏览器，请扫码登录。':'已请求开始刷抖音，请在后台查看实际状态。';
}
