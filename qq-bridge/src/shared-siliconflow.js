import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'js-yaml';
import {readJson,writeJson} from './creative-store.js';
import {hardenDir,isHardened} from './state-acl.mjs';
export const SILICONFLOW_KEY_REF='XIAOGE_SHARED_SILICONFLOW_API_KEY';
export function isSiliconFlowEndpoint(value){try{const u=new URL(value);return u.origin==='https://api.siliconflow.cn'&&u.pathname.replace(/\/+$/,'')==='/v1'&&!u.search&&!u.hash&&!u.username&&!u.password;}catch{return false;}}
const validKey=key=>typeof key==='string'&&/^[\x21-\x7e]{8,8192}$/.test(key);
const refOK=ref=>typeof ref==='string'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref);
function yamlRead(file){try{if(fs.statSync(file).size>8*1024*1024)throw Error();return YAML.load(fs.readFileSync(file,'utf8'))||{};}catch(e){if(e.code==='ENOENT')return {};throw Error('本机密钥库暂不可读，原文件已保留');}}
export function readDshCredential(ref,{home=process.env.DSH_HOME||path.join(os.homedir(),'.dsh')}={}){if(!refOK(ref))return '';return yamlRead(path.join(home,'.credentials.yaml')).refs?.[ref]||process.env[ref]||'';}

// Update credential references only. Model IDs, model settings and account login
// records are deliberately left independent and never copied into responses.
export async function bindSharedSiliconFlow(rpc,{apiKey='',providerPatches={},readKey=readDshCredential,expectedRevision}={}){
 const doc=await rpc('settings.describe',{}),ns=doc.namespaces?.find(n=>n.ns==='llm-pi-ai');if(!ns||doc.writable===false)throw Error('模型设置暂不可写，请启动 DSH 后再保存统一密钥');
 if(expectedRevision!==undefined&&ns.revision!==expectedRevision)throw Error('模型设置已在别处更新，请刷新后再保存');
 const providers={...(ns.value?.providers||{}),...providerPatches},oldRefs=[...new Set(Object.values(providers).filter(p=>isSiliconFlowEndpoint(p.baseURL)).map(p=>p.apiKeyEnv).filter(refOK))];
 const info=await rpc('credentials.describe',{refs:[...new Set([SILICONFLOW_KEY_REF,...oldRefs])]}),configured=info[SILICONFLOW_KEY_REF]?.configured===true;
 let key=apiKey.trim();if(key&&!validKey(key))throw Error('硅基流动密钥格式无效');
 if(!key&&!configured){const candidates=new Set();for(const ref of oldRefs)if(info[ref]?.configured){const value=await readKey(ref);if(validKey(value))candidates.add(value);}if(candidates.size>1)throw Error('现有硅基流动密钥不一致，请在任一设置页填写要统一使用的密钥');key=[...candidates][0]||'';if(!key)throw Error('请先填写一次硅基流动 API Key');}
 const patch={};for(const [id,p]of Object.entries(providers))if(isSiliconFlowEndpoint(p.baseURL))patch[id]={...p,apiKeyEnv:SILICONFLOW_KEY_REF};
 if(key)await rpc('credentials.set',{ref:SILICONFLOW_KEY_REF,value:key});
 if(Object.keys(patch).length)await rpc('settings.update',{ns:ns.ns,patch:{providers:patch},expectedRevision:ns.revision});
 return {ok:true,ref:SILICONFLOW_KEY_REF,shared:true};
}

export function createSharedSiliconFlow(root,{saveKey,harden=true}={}){
 const engineHome=path.resolve(root,'../engine-home'),localFile=path.join(root,'state/shared-siliconflow.json');
 const installed=()=>fs.existsSync(engineHome);
 function read(legacyKey=''){
  if(!installed())return readJson(localFile,{}).apiKey||legacyKey||'';
  const vault=yamlRead(path.join(engineHome,'.credentials.yaml')),canonical=vault.refs?.[SILICONFLOW_KEY_REF];if(validKey(canonical))return canonical;
  const rows=yamlRead(path.join(engineHome,'profiles/web/cordis.patch.yml')),providers=Array.isArray(rows)?rows.find(r=>r.id==='llm-pi-ai')?.config?.providers||{}:{};
  const candidates=new Set(Object.values(providers).filter(p=>isSiliconFlowEndpoint(p.baseURL)).map(p=>vault.refs?.[p.apiKeyEnv]).filter(validKey));if(validKey(legacyKey))candidates.add(legacyKey);
  if(candidates.size>1)throw Error('硅基流动密钥不一致，请先保存统一密钥');return [...candidates][0]||'';
 }
 async function save(key){if(!validKey(key))throw Error('请填写有效的硅基流动 API Key');if(saveKey)return saveKey(key);if(installed())throw Error('请连接 DSH 后在后台保存统一密钥');const folder=path.dirname(localFile);fs.mkdirSync(folder,{recursive:true});if(harden&&!isHardened(folder)&&!hardenDir(folder).ok)throw Error('无法保护统一密钥目录');writeJson(localFile,{apiKey:key});}
 return {read,save,describe(legacyKey=''){try{return {hasKey:!!read(legacyKey),shared:true};}catch{return {hasKey:false,shared:true,conflict:true};}}};
}
