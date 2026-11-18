import {readStoredKey} from '../src/provider-discovery.js';
import {bindSharedSiliconFlow,SILICONFLOW_KEY_REF} from '../src/shared-siliconflow.js';

import {douyinModelProfile,fixedDouyinSelection} from '../src/douyin-model-contract.js';
export {douyinModelProfile,fixedDouyinSelection};
const ownRef=SILICONFLOW_KEY_REF;
const refValid=ref=>typeof ref==='string'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref);
const keyValid=key=>typeof key==='string'&&/^[\x21-\x7e]{8,8192}$/.test(key);
const namespace=doc=>doc.namespaces?.find(n=>n.ns==='llm-pi-ai');
const matches=p=>p?.api===douyinModelProfile.api&&String(p.baseURL||'').replace(/\/+$/,'')===douyinModelProfile.baseUrl;
function fixedProvider(previous={}) {
  const model=previous.models?.find(m=>(typeof m==='string'?m:m.id)===douyinModelProfile.model);
  return {...previous,displayName:'抖音专用 · 硅基流动',api:douyinModelProfile.api,baseURL:douyinModelProfile.baseUrl,apiKeyEnv:refValid(previous.apiKeyEnv)?previous.apiKeyEnv:ownRef,
    models:[{...(typeof model==='object'?model:{}),id:douyinModelProfile.model,input:['text','image'],maxTokens:2048}]};
}
function requireWritable(doc,ns) { if(!ns||doc.writable===false)throw Error('本机模型服务暂不允许配置，请检查连接后重试。'); }

export async function describeDouyinModelProfile(rpc) {
  const ns=namespace(await rpc('settings.describe',{})),provider=ns?.value?.providers?.[douyinModelProfile.provider];
  const model=provider?.models?.find(m=>(typeof m==='string'?m:m.id)===douyinModelProfile.model);
  const valid=matches(provider)&&Array.isArray(model?.input)&&model.input.includes('image');
  const keyInfo=refValid(provider?.apiKeyEnv)?(await rpc('credentials.describe',{refs:[provider.apiKeyEnv]}))[provider.apiKeyEnv]:null;
  return {...douyinModelProfile,fixed:true,hasKey:keyInfo?.configured===true,configured:valid&&keyInfo?.configured===true,configurationValid:valid};
}

// Create a private provider once. Only migrate from the selected official SF
// provider; other provider definitions and credentials are never changed.
export async function installDouyinModelProfile(rpc,{sourceProvider,readKey=readStoredKey}={}) {
  const doc=await rpc('settings.describe',{}),ns=namespace(doc);requireWritable(doc,ns);
  const providers=ns.value?.providers||{};
  if(!Object.hasOwn(providers,douyinModelProfile.provider)) {
    const source=Object.hasOwn(providers,sourceProvider)?providers[sourceProvider]:null;
    const info=matches(source)&&refValid(source.apiKeyEnv)?(await rpc('credentials.describe',{refs:[source.apiKeyEnv]}))[source.apiKeyEnv]:null;
    const sharedInfo=(await rpc('credentials.describe',{refs:[ownRef]}))[ownRef];
    let key='';if(!sharedInfo?.configured&&info?.configured){try{key=await readKey(source.apiKeyEnv);}catch{}}
    await rpc('settings.update',{ns:ns.ns,patch:{providers:{[douyinModelProfile.provider]:fixedProvider()}},expectedRevision:ns.revision});
    if(keyValid(key))await rpc('credentials.set',{ref:ownRef,value:key});
  }
  return describeDouyinModelProfile(rpc);
}

export async function saveDouyinModelKey(rpc,input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='apiKey'))throw Error('抖音模型与 API 地址已固定，只接受 API 密钥。');
  const key=typeof input.apiKey==='string'?input.apiKey.trim():'';
  if(!keyValid(key))throw Error('请填写有效的硅基流动 API 密钥，不要包含空格、中文说明或 Bearer 前缀。');
  const doc=await rpc('settings.describe',{}),ns=namespace(doc);requireWritable(doc,ns);
  const provider=fixedProvider(ns.value?.providers?.[douyinModelProfile.provider]);
  await bindSharedSiliconFlow(rpc,{apiKey:key,providerPatches:{[douyinModelProfile.provider]:provider},expectedRevision:ns.revision});
  return {ok:true,message:'硅基流动统一密钥已保存，聊天、B站、抖音和生图无需重复填写。请测试视觉连接。'};
}
