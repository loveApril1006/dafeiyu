import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
export const name='qq-harness-isolated-tools';export const inject=['tools'];
async function core(){const native=pathToFileURL(path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js')).href;if(process.versions.electron)return import(native);try{return await import('@deepseek-ai/dsh-tools');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;return import(native);}}
function bridgeRoot(){let dir=path.dirname(fileURLToPath(import.meta.url));for(let i=0;i<9;i++){
  for(const candidate of [dir,path.join(dir,'qq-bridge')])try{if(JSON.parse(fs.readFileSync(path.join(candidate,'package.json'),'utf8')).name==='qq-bridge'&&fs.existsSync(path.join(candidate,'src/harness-control.js')))return candidate;}catch{}
  const parent=path.dirname(dir);if(parent===dir)break;dir=parent;
}throw Error('Cannot locate the installed QQ bridge');}
export function capability(exec,root=bridgeRoot()){
  const sid=exec?.agent?.session?.id,cwd=exec?.agent?.session?.header?.cwd;
  if(typeof sid!=='string'||!sid||typeof cwd!=='string')throw Error('执行会话身份不可验证');
  const file=path.join(root,'state/harness-control/capabilities',createHash('sha256').update(sid).digest('hex')+'.json');
  const cap=JSON.parse(fs.readFileSync(file,'utf8'));
  const url=new URL(cap.baseURL);
  if(cap.sessionId!==sid||fs.realpathSync(cwd)!==cap.cwd||cap.deadline<=Date.now()||!/^[a-f0-9]{64}$/.test(cap.token)||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('任务能力已失效或工作区不匹配');
  return cap;
}
export async function apply(ctx){
  // No inherited file, shell, browser, MCP, subagent or developer tools. The
  // guard also rejects execution by name if an unlisted tool is guessed.
  ctx.tools.restrict({allow:[]});
  ctx.tools.guard(exec=>{if(exec?.name!=='harness_project')return '此任务只允许授权项目文件工具';try{capability(exec);}catch{return '任务文件权限已收回或会话不匹配';}});
  ctx.on('agent/request',async(payload,next)=>{const route=await next();return route?{...route,maxTokens:Math.min(2048,route.maxTokens||2048)}:route;},{prepend:true});
  const {defineTool}=await core();
  const definition=defineTool({name:'harness_project',description:'只在管理员授权项目内列目录、读取、创建或修改文本文件。不能执行命令、删除、访问网络或发布。read返回sha256；覆盖前提供expectedSha256，文件有变更时重新读。大文件用edit做唯一文本替换。',
    parameters:{operation:{type:'string',required:true},path:{type:'string'},content:{type:'string'},expectedSha256:{type:'string'},find:{type:'string'},replace:{type:'string'},offset:{type:'integer'}},
    output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    async execute(args,exec){const cap=capability(exec);const response=await fetch(new URL('/api/harness/tool',cap.baseURL),{method:'POST',headers:{'Content-Type':'application/json','X-Harness-Session':cap.sessionId,'X-Harness-Capability':cap.token},body:JSON.stringify(args),redirect:'error',signal:exec.signal?AbortSignal.any([exec.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
      let data;try{data=await response.json();}catch{throw Error('项目文件工具响应无效');}if(!response.ok||data.ok===false)throw Error(data.error||'项目文件权限拒绝');return JSON.stringify(data);
    },
  });
  // Presets are parent scopes. Their allow:[] also hides parent-registered
  // tools from Agents. Register this capability in each actual Agent's own
  // scope, whose local tool remains visible while inherited tools stay hidden.
  ctx.on('agent/created',({agent})=>{
    agent.ctx.tools.restrict({allow:[]});
    agent.ctx.tools.presentAs('native');
    agent.ctx.tools.register(definition);
  });
}
