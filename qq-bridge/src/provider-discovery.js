// Metadata requests only: this module never invokes model inference or changes settings.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'js-yaml';
import {resolveDshHome} from './dsh-client.js';
import {normalizeProviderConnection,providerProtocols} from './model-manager.js';
import {documentedImageHint} from './provider-image-hints.js';
import {isSiliconFlowEndpoint,SILICONFLOW_KEY_REF} from './shared-siliconflow.js';

const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const maxModels=5000,maxBytes=4*1024*1024;
const refPattern=/^[A-Za-z_][A-Za-z0-9_]*$/;
function networkProblem(error){
  const codes=new Set(),seen=new Set(),pending=[error];let redirected=false;
  while(pending.length&&seen.size<16){const item=pending.shift();if(!item||seen.has(item))continue;seen.add(item);if(typeof item.code==='string')codes.add(item.code);if(/unexpected redirect/i.test(String(item.message||'')))redirected=true;if(item.cause)pending.push(item.cause);if(Array.isArray(item.errors))pending.push(...item.errors);}
  if(redirected)return{retry:false,message:'模型列表接口要求跳转，已停止请求。请核对最终 API 根地址；不会把密钥发送到跳转地址。'};
  if([...codes].some(code=>/CERT|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/.test(code)))return{retry:false,message:'模型服务证书验证失败，请检查代理证书或 API 根地址；未关闭证书校验。'};
  if(codes.has('ENOTFOUND')||codes.has('EAI_AGAIN'))return{retry:codes.has('EAI_AGAIN'),message:'无法解析模型服务地址，请检查 API 根地址、DNS 和网络代理。'};
  const transient=['ETIMEDOUT','ECONNRESET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET','ENETUNREACH','EHOSTUNREACH'];
  if([...codes].some(code=>transient.includes(code)))return{retry:true,message:'连接模型服务超时或中断，请检查网络与代理后重试。'};
  if(codes.has('ECONNREFUSED'))return{retry:false,message:'模型服务连接被拒绝，请检查 API 地址、端口及代理是否正常运行。'};
  return{retry:false,message:'无法连接模型服务，请检查网络、API 根地址和代理。'};
}
async function fetchCatalogPage(fetchImpl,url,headers,signal){
  for(let attempt=0;attempt<2;attempt++){
    signal.throwIfAborted();const attemptSignal=AbortSignal.any([signal,AbortSignal.timeout(8000)]);
    try{return await fetchImpl(url,{method:'GET',headers,signal:attemptSignal,redirect:'error'});}
    catch(error){
      if(signal.aborted)throw error;
      const problem=networkProblem(error);
      if(attempt===0&&(problem.retry||attemptSignal.aborted))continue;
      throw fail(attemptSignal.aborted?'连接模型服务超时，请检查网络与代理后重试。':problem.message);
    }
  }
}
export function readStoredKey(ref){
  if(!refPattern.test(ref))throw fail('服务的密钥引用无效，请重新填写密钥');
  try{
    const doc=YAML.load(fs.readFileSync(path.join(resolveDshHome(),'.credentials.yaml'),'utf8'));
    const value=doc?.refs?.[ref] ?? process.env[ref];
    return typeof value==='string'?value:'';
  }catch{throw fail('无法读取本机保存的服务密钥，请在密钥框重新填写');}
}
function inputModalities(row){
  const source=row.input_modalities??row.inputModalities??row.supported_input_modalities??row.architecture?.input_modalities??row.modalities?.input??row.input;
  if(Array.isArray(source))return source.filter(v=>typeof v==='string');
  if(typeof row.capabilities?.image_input?.supported==='boolean')return row.capabilities.image_input.supported?['text','image']:['text'];
  if(typeof row.supports_vision==='boolean')return row.supports_vision?['text','image']:['text'];
  return null;
}
export function modelDescriptor(row,{baseUrl}={}){
  if(typeof row==='string')row={id:row};
  if(!row||typeof row!=='object')return null;
  const rawId=String(row.id??row.name??'');
  const id=(row.id===undefined&&Array.isArray(row.supportedGenerationMethods)?rawId.replace(/^models\//,''):rawId).trim();
  if(!id||id.length>160||/[\x00-\x20\x7f]/.test(id))return null;
  const methods=row.supportedGenerationMethods;
  const type=[row.type,row.sub_type,row.category].filter(Boolean).join(' ').toLowerCase();
  const nonChat=/(?:^|\/)(text-embedding|gemini-embedding|embedding|rerank|bge-|whisper|tts-|gpt-image|dall-e|imagen-|veo-|sora-)/i.test(id)||/(?:realtime|transcrib|text-to-speech|(?:^|[-/])(?:embedding|reranker?)(?:[-/]|$))/i.test(id)||/(embedding|rerank|text-to-image|text-to-speech|speech-to-text|image-generation|video-generation)/.test(type)||Array.isArray(methods)&&!methods.includes('generateContent');
  const input=inputModalities(row);
  const hint=nonChat?null:documentedImageHint(baseUrl,id);
  return{id,name:String(row.displayName??row.display_name??row.name??id).slice(0,200),owner:String(row.publisher??(id.includes('/')?id.split('/')[0]:row.owned_by??row.owner??'')).slice(0,100),supportsImages:input===null?(hint?.supportsImages??null):input.includes('image'),...(input===null&&hint?{imageCapabilitySource:hint.imageCapabilitySource}:{}),...(hint?.visionNote?{visionNote:hint.visionNote}:{}),chat:!nonChat,kind:nonChat?'其他用途':'对话 / 待确认'};
}
async function readJson(response){
  if(Number(response.headers?.get('content-length'))>maxBytes)throw fail('模型目录响应过大，请改用手动填写');
  let text='';
  if(response.body){
    const reader=response.body.getReader();let bytes=0;const decoder=new TextDecoder();
    try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>maxBytes){await reader.cancel();throw fail('模型目录响应过大，请改用手动填写');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  }else text=await response.text();
  try{return JSON.parse(text);}catch{throw fail('服务未返回有效的模型列表 JSON，请检查 API 根地址');}
}
export async function discoverProviderModels(rpc,input,{fetchImpl=globalThis.fetch,readKey=readStoredKey,signal:callerSignal}={}){
  const value=normalizeProviderConnection(input);
  const doc=await rpc('settings.describe',{}),ns=(doc.namespaces||[]).find(n=>n.ns==='llm-pi-ai');
  if(!ns)throw fail('当前引擎未开放模型服务设置');
  const profiles=ns.value?.providers||{},existing=Object.hasOwn(profiles,value.id)?profiles[value.id]:null;
  const api=value.api||existing?.api||'openai-completions';
  if(!providerProtocols.includes(api))throw fail('此服务的协议需要在引擎设置中配置');
  let key=value.apiKey;
  if(!key&&isSiliconFlowEndpoint(value.baseUrl)){try{key=await readKey(SILICONFLOW_KEY_REF);}catch{}}
  if(!key){
    if(input.editing!==true||!existing?.apiKeyEnv)throw fail('请先填写此服务的 API 密钥，获取列表不会保存密钥');
    if((existing.baseURL||'').replace(/\/+$/,'')!==value.baseUrl||existing.api!==api)throw fail('地址或协议已更改，请重新填写对应服务的密钥');
    key=await readKey(existing.apiKeyEnv);
  }
  if(typeof key!=='string'||!/^[\x21-\x7e]{8,8192}$/.test(key))throw fail('没有可用的服务密钥，请只填写密钥本身，不要附带中文说明或 Bearer 前缀');
  const base=new URL(value.baseUrl),anthropic=api==='anthropic-messages';
  const endpoint=new URL(value.baseUrl+(anthropic&&!/\/v1$/.test(base.pathname)?'/v1':'')+'/models');
  const headers=anthropic?{'x-api-key':key,'anthropic-version':'2023-06-01',accept:'application/json'}:{authorization:'Bearer '+key,accept:'application/json'};
  const signal=callerSignal?AbortSignal.any([callerSignal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000);
  const models=new Map(),visited=new Set();let next=endpoint,truncated=false;
  try{
    for(let page=0;next&&page<20;page++){
      if(visited.has(next.href))throw fail('服务返回了重复的分页标识，请稍后重试');visited.add(next.href);
      const response=await fetchCatalogPage(fetchImpl,next.href,headers,signal);
      if(!response.ok){
        if(response.status===401||response.status===403)throw fail('密钥无效或没有模型列表权限，请检查密钥与服务地址');
        if(response.status===404||response.status===405)throw fail('此服务未开放模型列表接口，请手动填写模型 ID');
        if(response.status===429)throw fail('服务限制了模型列表请求频率，请稍后重试');
        throw fail('获取模型列表失败（HTTP '+response.status+'），请检查服务地址或稍后重试');
      }
      const data=await readJson(response),rows=Array.isArray(data)?data:data?.data??data?.models;
      if(!Array.isArray(rows))throw fail('此服务返回的模型列表格式无法识别，请手动填写模型 ID');
      for(const row of rows){const model=modelDescriptor(row,{baseUrl:value.baseUrl});if(!model||model.id.includes(key))continue;model.name=model.name.split(key).join('[密钥已隐藏]');model.owner=model.owner.split(key).join('[密钥已隐藏]');if(!models.has(model.id))models.set(model.id,model);if(models.size>=maxModels){truncated=true;break;}}
      if(truncated)break;
      next=null;
      if(data.nextPageToken){next=new URL(endpoint);next.searchParams.set('pageToken',String(data.nextPageToken));}
      else if(data.has_more){const last=data.last_id??rows.at(-1)?.id;if(typeof last!=='string'||!last)throw fail('服务未返回有效的分页标识');next=new URL(endpoint);next.searchParams.set(anthropic?'after_id':'after',last);}
      else if(data.next||data.links?.next){const candidate=new URL(String(data.next||data.links.next),endpoint);if(candidate.origin!==endpoint.origin||candidate.pathname!==endpoint.pathname||candidate.username||candidate.password||candidate.hash)throw fail('模型分页地址不属于当前服务，已停止获取');next=candidate;}
      if(page===19&&next)truncated=true;
    }
  }catch(error){
    if(error.statusCode)throw error;
    if(signal.aborted)throw fail('获取模型列表已取消或超时，请检查网络后重试');
    throw fail(networkProblem(error).message);
  }
  return{ok:true,models:[...models.values()].sort((a,b)=>a.id.localeCompare(b.id)),count:models.size,truncated,message:models.size?'已获取服务返回的 '+models.size+' 个模型。勾选需要的模型后添加并保存。':'服务返回的模型列表为空，可以手动填写模型 ID。'};
}
