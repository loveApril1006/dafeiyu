// Console-only model management. Credentials are written through DSH's store;
// only redacted descriptors and provider metadata cross back to the browser.
import { createHash } from 'node:crypto';
import {bindSharedSiliconFlow,isSiliconFlowEndpoint,SILICONFLOW_KEY_REF} from './shared-siliconflow.js';
const reject = message => { const error = new Error(message); error.statusCode = 400; throw error; };
const idPattern = /^[a-z][a-z0-9_-]{1,63}$/;
const refFor = id => 'XIAOGE_' + id.toUpperCase().replace(/-/g, '_') + '_' + createHash('sha256').update(id).digest('hex').slice(0,8).toUpperCase() + '_API_KEY';
export const providerProtocols = ['openai-completions','openai-responses','anthropic-messages'];

export function normalizeProviderConnection(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('模型服务设置必须是有效的对象');
  const id = String(input.id || '').trim();
  if (!idPattern.test(id) || ['__proto__', 'constructor', 'prototype', 'deepseek-account', 'deepseek-official'].includes(id)) reject('服务标识请使用 2～64 位小写字母、数字、横线或下划线，并以字母开头');
  const displayName = String(input.displayName || id).trim();
  if (displayName.length > 100 || /[\r\n]/.test(displayName)) reject('服务名称过长或包含换行');
  let url;
  try { url = new URL(String(input.baseUrl || '').trim()); } catch { reject('请填写完整的 API 根地址'); }
  if (url.username || url.password || url.search || url.hash) reject('API 地址不能包含账号密码、查询参数或片段');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) reject('API 地址请使用 HTTPS，本机服务可以使用 HTTP');
  if (/\/(?:models|chat\/completions)\/?$/.test(url.pathname)) reject('请填写 API 根地址，不要附加 /models 或 /chat/completions');
  if (url.hostname === 'generativelanguage.googleapis.com' && /^\/v1(?:beta)?\/?$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/,'')+'/openai';
  if (url.hostname === 'api.siliconflow.cn' && url.pathname === '/') url.pathname = '/v1';
  const api = input.api === undefined ? null : String(input.api);
  if (api !== null && !providerProtocols.includes(api)) reject('请选择受支持的接口协议');
  if (api === 'anthropic-messages') url.pathname = url.pathname.replace(/\/v1\/?$/,'') || '/';
  const apiKey = String(input.apiKey || '').trim();
  if (apiKey && !/^[\x21-\x7e]{8,8192}$/.test(apiKey)) reject('API 密钥格式不正确，请只粘贴密钥本身，不要包含中文说明、空格或 Bearer 前缀');
  return { id, displayName, baseUrl:url.href.replace(/\/+$/, ''), apiKey, api };
}

export function normalizeProvider(input) {
  const connection = normalizeProviderConnection(input);
  const modelIds = [...new Set(String(input.models || '').split(/[\s,，]+/).filter(Boolean))];
  if (!modelIds.length || modelIds.length > 1000 || modelIds.some(id => id.length > 160 || /[\x00-\x20\x7f]/.test(id))) reject('请获取或填写模型 ID，每行一个，最多 1000 个');
  let visionModels = null;
  if (input.visionModels !== undefined) {
    if (!Array.isArray(input.visionModels) || input.visionModels.length > 1000 || input.visionModels.some(id => typeof id !== 'string' || !modelIds.includes(id))) reject('图片模型必须从本服务的模型列表中勾选');
    visionModels = [...new Set(input.visionModels)];
  }
  return { ...connection, modelIds, visionModels };
}

export function providerVisionModels(provider) {
  return (provider.models || []).filter(model => {
    const input = typeof model === 'object' && Array.isArray(model.input) ? model.input : provider.defaultInput;
    return Array.isArray(input) && input.includes('image');
  }).map(model => typeof model === 'string' ? model : model.id).filter(Boolean);
}

export async function getProviderSettings(rpc) {
  const doc = await rpc('settings.describe', {});
  const ns = (doc.namespaces || []).find(row => row.ns === 'llm-pi-ai');
  const profiles = ns?.value?.providers || {};
  const refs = [...new Set(Object.values(profiles).map(p => p.apiKeyEnv).filter(ref => typeof ref === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)))];
  let credentials = {};
  for (let index = 0; index < refs.length; index += 64) Object.assign(credentials, await rpc('credentials.describe', {refs:refs.slice(index,index+64)}));
  return {
    canConfigureImages:true,
    canDiscoverModels:true,
    canAdd:!!ns && doc.writable !== false,
    providers:Object.entries(profiles).filter(([id]) => idPattern.test(id)).map(([id,p]) => ({
      id, displayName:String(p.displayName || id), baseUrl:String(p.baseURL || ''), api:p.api || '',
      models:(p.models || []).map(m => typeof m === 'string' ? m : m.id).filter(Boolean),
      visionModels:providerVisionModels(p),
      hasKey:p.apiKeyEnv ? credentials[p.apiKeyEnv]?.configured === true : false,
      editable:providerProtocols.includes(p.api)
    }))
  };
}

export async function saveProvider(rpc, input) {
  const value = normalizeProvider(input);
  const doc = await rpc('settings.describe', {});
  const ns = (doc.namespaces || []).find(row => row.ns === 'llm-pi-ai');
  if (!ns || doc.writable === false) reject('当前聊天引擎没有开放 API 服务设置，请打开引擎设置检查');
  const profiles = ns.value?.providers || {};
  const existing = Object.hasOwn(profiles, value.id) ? profiles[value.id] : null;
  if (existing && input.editing !== true) reject('这个服务标识已经存在，请从“已有 API 服务”中选择并编辑，或换一个标识');
  if (!existing && input.editing === true) reject('该服务已被移除，请刷新列表后新增');
  if (existing && !providerProtocols.includes(existing.api)) reject('此服务使用其他 API 协议，请在引擎的模型设置中编辑');
  const ref = existing?.apiKeyEnv===SILICONFLOW_KEY_REF&&!isSiliconFlowEndpoint(value.baseUrl)?refFor(value.id):existing?.apiKeyEnv || refFor(value.id);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) reject('此服务的密钥引用需要在引擎设置中编辑');
  const info = (await rpc('credentials.describe', {refs:[ref]}))[ref];
  const sharedInfo=isSiliconFlowEndpoint(value.baseUrl)?(await rpc('credentials.describe',{refs:[SILICONFLOW_KEY_REF]}))[SILICONFLOW_KEY_REF]:null;
  if (!value.apiKey && (!existing || !info?.configured)&&!sharedInfo?.configured) reject('请填写这个服务的 API 密钥');
  if (existing && (existing.baseURL || '').replace(/\/+$/, '') !== value.baseUrl && !value.apiKey) reject('修改 API 地址时，请重新填写对应服务的密钥');
  const api = value.api || existing?.api || 'openai-completions';
  const oldModels = new Map((existing?.models || []).map(model => [typeof model === 'string' ? model : model.id, model]));
  const profile = {...existing, displayName:value.displayName, api, baseURL:value.baseUrl, apiKeyEnv:ref,
    models:value.modelIds.map(id => {
      const old = oldModels.get(id);
      const model = typeof old === 'object' ? {...old} : {id,input:Array.isArray(existing?.defaultInput) ? [...existing.defaultInput] : ['text']};
      if (value.visionModels !== null) {
        const previous = Array.isArray(model.input) ? model.input : existing?.defaultInput || ['text'];
        model.input = [...new Set(['text',...previous.filter(type => type !== 'image'),...(value.visionModels.includes(id) ? ['image'] : [])])];
      }
      return model;
    })};
  // Optimistic revision checking protects edits made in the native settings UI.
  if(isSiliconFlowEndpoint(value.baseUrl)){
    await bindSharedSiliconFlow(rpc,{apiKey:value.apiKey,providerPatches:{[value.id]:profile},expectedRevision:ns.revision});
    return {ok:true,id:value.id,message:'服务模型已保存；硅基流动密钥已统一，其他功能无需重复填写。'};
  }
  await rpc('settings.update', {ns:ns.ns, patch:{providers:{[value.id]:profile}}, expectedRevision:ns.revision});
  if (value.apiKey) {
    try { await rpc('credentials.set', {ref, value:value.apiKey}); }
    catch { throw new Error('服务配置已保存，但密钥保存失败，请重新填写密钥后再保存'); }
  }
  return {ok:true,id:value.id,message:'服务与模型已保存。请在上方选择模型并点击“使用此模型”。'};
}
