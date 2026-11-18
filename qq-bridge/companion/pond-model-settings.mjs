import fs from 'node:fs';
import path from 'node:path';
import YAML from 'js-yaml';
import {normalizeProvider} from '../src/model-manager.js';
import {bindSharedSiliconFlow,isSiliconFlowEndpoint,SILICONFLOW_KEY_REF,readDshCredential} from '../src/shared-siliconflow.js';
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}};
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);};
const yamlRead=file=>{try{return YAML.load(fs.readFileSync(file,'utf8'))||{};}catch{return {};}};
function updateVault(file,change){
  const lock=file+'.lock';let fd;
  for(let i=0;i<100;i++){try{fd=fs.openSync(lock,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}}
  if(fd===undefined)throw new Error('鱼塘密钥正在更新，请稍后重试');
  try{const doc=yamlRead(file);change(doc);const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,YAML.dump(doc,{lineWidth:-1}));fs.renameSync(temp,file);}
  finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
export function createPondModelSettings({home,engineHome,configFile,rpc}){
  const file=path.join(home,'model-settings.json'),privateHome=path.join(home,'model-engine');
  const routeFile=path.join(privateHome,'profiles/web/cordis.patch.yml');
  const vaultFile=path.join(privateHome,'.credentials.yaml');
  function render(doc){
    fs.mkdirSync(path.dirname(routeFile),{recursive:true});
    fs.writeFileSync(routeFile,YAML.dump([{id:'llm-pi-ai',name:'@deepseek-ai/dsh-llm-pi-ai',config:{providers:doc.providers}}],{lineWidth:-1}));
    const headless=path.join(privateHome,'profiles/headless');fs.mkdirSync(headless,{recursive:true});
    fs.writeFileSync(path.join(headless,'package.json'),JSON.stringify({name:'xiaoge-bili-models',private:true,dependencies:{},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-headless']}}},null,2));
    fs.writeFileSync(path.join(headless,'cordis.yml'),'[]\n');fs.writeFileSync(path.join(headless,'cordis.patch.yml'),'[]\n');
  }
  if(!fs.existsSync(file)){
    const entries=yamlRead(path.join(engineHome,'profiles/web/cordis.patch.yml'));
    const providers=Array.isArray(entries)?structuredClone(entries.find(e=>e.id==='llm-pi-ai')?.config?.providers||{}):{};
    const shared=yamlRead(path.join(engineHome,'.credentials.yaml')),refs={};
    for(const p of Object.values(providers))if(p.apiKeyEnv&&typeof shared.refs?.[p.apiKeyEnv]==='string')refs[p.apiKeyEnv]=shared.refs[p.apiKeyEnv];
    // Only API values used by the initial snapshot are copied; account records stay shared at run time.
    fs.mkdirSync(privateHome,{recursive:true});fs.writeFileSync(vaultFile,YAML.dump({version:1,refs,records:{}},{lineWidth:-1}));
    const cfg=read(configFile,{});const doc={version:1,createdAt:new Date().toISOString(),providers,accountModels:[cfg.dutyProvider==='deepseek-account'&&cfg.dutyModel?cfg.dutyModel:'deepseek-flash']};
    render(doc);write(file,doc);
  }else render(read(file,{}));
  function catalog(){const doc=read(file,{});return [{id:'deepseek-account',name:'DeepSeek 账号（共用登录）',models:doc.accountModels.map(id=>({id,name:id}))},...Object.entries(doc.providers||{}).map(([id,p])=>({id,name:p.displayName||id,models:(p.models||[]).map(m=>typeof m==='string'?{id:m,name:m}:{...m,name:m.name||m.id})}))];}
  async function describe(){
    const cfg=read(configFile,{});let account='unknown';
    try{account=(await rpc('account.getState',{})).status==='credential-stored'?'signed-in':'signed-out';}catch{}
    const doc=read(file,{}),p=doc.providers[cfg.dutyProvider],vault=yamlRead(vaultFile);
    const hasKey=p=>isSiliconFlowEndpoint(p?.baseURL)?!!readDshCredential(SILICONFLOW_KEY_REF,{home:engineHome}):!!vault.refs?.[p?.apiKeyEnv];
    const configured=cfg.dutyProvider==='deepseek-account'?account==='signed-in':Boolean(p&&(!p.apiKeyEnv||hasKey(p)));
    const state=read(path.join(home,'state.json'),{});
    return {ok:true,isolated:true,sharedAccount:true,account,configured,provider:cfg.dutyProvider||'',model:cfg.dutyModel||'',lastSuccessAt:state.xiaogeLastSuccessAt||null,
      providers:Object.entries(doc.providers||{}).map(([id,p])=>({id,displayName:p.displayName||id,baseUrl:p.baseURL||'',api:p.api||'',models:(p.models||[]).map(m=>typeof m==='string'?m:m.id),hasKey:hasKey(p),keySource:isSiliconFlowEndpoint(p.baseURL)?'shared-siliconflow':'private'}))};
  }
  async function save(input){
    const value=normalizeProvider(input),doc=read(file,{}),existing=doc.providers[value.id];
    if(Boolean(existing)!==Boolean(input.editing))throw new Error(existing?'此鱼塘服务已存在，请选择后编辑':'此鱼塘服务不存在，请刷新后新增');
    const sharedSF=isSiliconFlowEndpoint(value.baseUrl),vault=yamlRead(vaultFile),ref=sharedSF?SILICONFLOW_KEY_REF:existing?.apiKeyEnv===SILICONFLOW_KEY_REF?'BILI_'+value.id.toUpperCase().replaceAll('-','_')+'_API_KEY':existing?.apiKeyEnv||'BILI_'+value.id.toUpperCase().replaceAll('-','_')+'_API_KEY';
    if(!sharedSF&&!value.apiKey&&!vault.refs?.[ref])throw new Error('请填写此服务的鱼塘专用密钥');
    if(existing&&(existing.baseURL||'').replace(/\/+$/,'')!==value.baseUrl&&!value.apiKey)throw new Error('修改 API 地址时请重新填写密钥');
    if(sharedSF)await bindSharedSiliconFlow(rpc,{apiKey:value.apiKey,readKey:ref=>readDshCredential(ref,{home:engineHome})});
    else if(value.apiKey)updateVault(vaultFile,doc=>{doc.refs||={};doc.refs[ref]=value.apiKey;});
    const oldModels=new Map((existing?.models||[]).map(m=>[typeof m==='string'?m:m.id,m]));
    doc.providers[value.id]={...existing,displayName:value.displayName,api:value.api||existing?.api||'openai-completions',baseURL:value.baseUrl,apiKeyEnv:ref,models:value.modelIds.map(id=>typeof oldModels.get(id)==='object'?oldModels.get(id):{id,input:['text']})};
    render(doc);write(file,doc);return {ok:true,id:value.id,message:sharedSF?'鱼塘模型已保存；硅基流动密钥统一复用，模型选择保持独立。':'鱼塘专用服务已保存，仅影响鱼塘。请在运行模型线路中选择。'};
  }
  return {routeFile,privateHome,catalog,describe,save};
}

export function preparePondCliHome({home,engineHome}){
  const privateHome=path.join(home,'model-engine');
  if(!fs.existsSync(path.join(home,'model-settings.json')))throw new Error('鱼塘独立模型设置尚未初始化，请先启动生活服务');
  const vaultFile=path.join(privateHome,'.credentials.yaml'),shared=yamlRead(path.join(engineHome,'.credentials.yaml'));
  updateVault(vaultFile,vault=>{vault.refs||={};if(shared.refs?.[SILICONFLOW_KEY_REF])vault.refs[SILICONFLOW_KEY_REF]=shared.refs[SILICONFLOW_KEY_REF];else delete vault.refs[SILICONFLOW_KEY_REF];vault.records||={};for(const key of ['deepseek-account-platform/default','deepseek-account-platform/device']){
    if(shared.records?.[key])vault.records[key]=shared.records[key];else delete vault.records[key];
  }});
  const settingsFile=path.join(home,'model-settings.json'),settings=read(settingsFile,{});let changed=false;
  for(const provider of Object.values(settings.providers||{}))if(isSiliconFlowEndpoint(provider.baseURL)&&provider.apiKeyEnv!==SILICONFLOW_KEY_REF){provider.apiKeyEnv=SILICONFLOW_KEY_REF;changed=true;}
  if(changed){write(settingsFile,settings);const route=path.join(privateHome,'profiles/web/cordis.patch.yml'),rows=yamlRead(route);if(!Array.isArray(rows))throw Error('鱼塘模型配置格式无效');const row=rows.find(r=>r.id==='llm-pi-ai');if(row){row.config||={};row.config.providers=settings.providers;fs.writeFileSync(route,YAML.dump(rows,{lineWidth:-1}));}}
  return privateHome;
}
