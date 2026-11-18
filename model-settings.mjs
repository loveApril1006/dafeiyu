import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
export const defaults={
  deepseek:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',provider:'xiaoge-deepseek',env:'XIAOGE_DEEPSEEK_API_KEY'},
  siliconflow:{baseUrl:'https://api.siliconflow.cn/v1',model:'moonshotai/Kimi-K2.7-Code',provider:'siliconflow',env:'SILICONFLOW_API_KEY'},
  custom:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',provider:'xiaoge-custom',env:'XIAOGE_CUSTOM_API_KEY'},
  account:{baseUrl:'',model:'deepseek-flash',provider:'deepseek-account',env:null}
};
function context(root){
  const yaml=createRequire(path.join(root,'qq-bridge/package.json'))('js-yaml');
  const read=(name,fallback={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,name),'utf8').replace(/^\uFEFF/,''));}catch(error){if(error.code==='ENOENT')return fallback;throw new Error('配置文件损坏，请从安装工具修复：'+name);}};
  const yread=(name,fallback)=>{try{return yaml.load(fs.readFileSync(path.join(root,name),'utf8'))||fallback;}catch(error){if(error.code==='ENOENT')return fallback;throw new Error('配置文件损坏：'+name);}};
  const write=(name,data,isYaml=false)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.writing';fs.writeFileSync(temporary,isYaml?yaml.dump(data,{lineWidth:-1,noRefs:true}):JSON.stringify(data,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(temporary,file);};
  return {yaml,read,yread,write};
}
export function getModelSettings(root){
  const {read,yread}=context(root),cfg=read('qq-bridge/config.json'),install=read('dafeiyu-install.json',read('xiaoge-install.json',{qqEnabled:!!cfg.snowluma}));
  let saved=read('model-settings.json',null);
  if(!saved){const kind=cfg.dsh?.provider==='siliconflow'?'siliconflow':cfg.dsh?.provider==='deepseek-account'?'account':'deepseek';saved={kind,baseUrl:defaults[kind].baseUrl,model:cfg.dsh?.model||defaults[kind].model};}
  const def=defaults[saved.kind]||defaults.deepseek,credentials=yread('engine-home/.credentials.yaml',{records:{},refs:{}});
  return {...saved,qqEnabled:!!install.qqEnabled,owner:cfg.ownerQQ?String(cfg.ownerQQ):'',hasKey:!!(def.env&&credentials.refs?.[def.env])};
}
function normalize(input){
  const kind=input.kind||'deepseek',def=defaults[kind];if(!def)throw new Error('请选择有效的模型服务');
  const model=String(input.model||def.model).trim(),key=String(input.apiKey||'').trim();
  if(!model||model.length>160||/[\r\n\s]/.test(model))throw new Error('请填写有效的模型名称，不能包含空格');
  if(key&&key.length<8)throw new Error('API密钥太短，请重新粘贴');
  if(/[\r\n]/.test(key))throw new Error('API密钥不能包含换行');
  let baseUrl=kind==='account'?'':String(input.baseUrl||def.baseUrl).trim().replace(/\/+$/,'');
  if(kind!=='account'){
    let url;try{url=new URL(baseUrl);}catch{throw new Error('接口地址无效，请填写完整的https://地址');}
    if(url.username||url.password||url.search||url.hash)throw new Error('接口地址不能包含密码、查询参数或片段');
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('接口地址必须使用HTTPS（本机调试允许HTTP）');
    if(/\/(chat\/completions|models)$/.test(url.pathname))throw new Error('请填写API根地址，不要附加/chat/completions或/models');
  }
  const owner=String(input.owner||'').trim();
  if(owner&&!/^(?!0+$)\d{5,12}$/.test(owner))throw new Error('管理员QQ号格式不正确；可以留空，安装后再设置');
  return {kind,baseUrl,model,key,owner,qqEnabled:!!input.qqEnabled,def};
}
export function saveModelSettings(root,input){
  const n=normalize(input),{read,yread,write}=context(root);
  const credentials=yread('engine-home/.credentials.yaml',{version:1,records:{},refs:{}});credentials.records??={};credentials.refs??={};
  if(n.key&&n.def.env)credentials.refs[n.def.env]=n.key;
  const cfg=read('qq-bridge/config.json'),oldOwner=String(cfg.ownerQQ||'');
  const reasoningEffort=['low','high','max'].includes(cfg.dsh?.reasoningEffort)?cfg.dsh.reasoningEffort:'max';
  cfg.dsh={...cfg.dsh,baseUrl:'http://127.0.0.1:17860',provider:n.def.provider,model:n.model,reasoningEffort,allowRemote:false};
  cfg.ownerQQ=n.owner?Number(n.owner):null;cfg.allow??={private:[],groups:[]};cfg.allow.private=[...new Set([...(cfg.allow.private||[]).map(String).filter(x=>x!==oldOwner),...(n.owner?[n.owner]:[])])];cfg.petFeed={enabled:false};
  const patch=yread('engine-home/profiles/web/cordis.patch.yml',[]);
  if(!Array.isArray(patch))throw new Error('聊天引擎配置格式不正确，请修复安装');
  let providers=patch.find(x=>x.id==='llm-pi-ai');if(!providers){providers={id:'llm-pi-ai',name:'@deepseek-ai/dsh-llm-pi-ai',config:{providers:{}}};patch.push(providers);}
  providers.config??={};providers.config.providers??={};
  if(n.kind!=='account')providers.config.providers[n.def.provider]={displayName:n.kind==='deepseek'?'DeepSeek API':n.kind==='siliconflow'?'SiliconFlow':'自定义API',api:'openai-completions',baseURL:n.baseUrl,apiKeyEnv:n.def.env,defaultInput:['text',...(n.kind==='deepseek'&&n.model.includes('pro')?[]:['image'])],models:[{id:n.model,input:['text',...(n.kind==='deepseek'&&n.model.includes('pro')?[]:['image'])]}]};
  let selected=patch.find(x=>x.id==='agent-default-model');if(!selected){selected={id:'agent-default-model',name:'@deepseek-ai/dsh-agent-default-model'};patch.push(selected);}selected.config={provider:n.def.provider,model:n.model};
  const install=read('xiaoge-install.json',{version:2,installedAt:new Date().toISOString()});install.qqEnabled=n.qqEnabled;
  write('engine-home/.credentials.yaml',credentials,true);write('engine-home/profiles/web/cordis.patch.yml',patch,true);write('qq-bridge/config.json',cfg);write('xiaoge-install.json',install);
  write('model-settings.json',{kind:n.kind,baseUrl:n.baseUrl,model:n.model,updatedAt:new Date().toISOString()});
  return getModelSettings(root);
}
export function validateModelSettings(input){normalize(input);}
export async function testModelConnection(root,input){
  const n=normalize({...input,qqEnabled:false});if(n.kind==='account')throw new Error('账号模式请使用“登录AI账号”按钮登录');
  const {yread}=context(root),key=n.key||yread('engine-home/.credentials.yaml',{refs:{}}).refs?.[n.def.env];
  if(!key)throw new Error('请先填入API密钥');
  let response;try{response=await fetch(n.baseUrl+'/models',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(12000)});}catch{throw new Error('无法连接API，请检查接口地址、网络或代理');}
  if(!response.ok)throw new Error(response.status===401||response.status===403?'密钥认证失败，请检查密钥和对应的平台':'API返回HTTP '+response.status+'，请检查接口地址或服务状态');
  let data;try{data=await response.json();}catch{throw new Error('接口未返回模型列表，请检查API根地址');}
  if(!Array.isArray(data.data)||!data.data.some(x=>x.id===n.model))throw new Error('密钥可连接，但模型列表中没有填写的模型，请检查模型名称');
  return {ok:true,message:'连接成功：密钥有效，模型列表中已找到该模型。'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [command,root,inputFile]=process.argv.slice(2);
  try{const input=command==='read'?null:JSON.parse(fs.readFileSync(inputFile,'utf8').replace(/^\uFEFF/,''));const output=command==='read'?getModelSettings(root):command==='save'?saveModelSettings(root,input):command==='test'?await testModelConnection(root,input):(()=>{throw new Error('未知设置操作');})();console.log(JSON.stringify(output));}
  catch(error){console.error('ERROR|'+error.message);process.exitCode=1;}
}
