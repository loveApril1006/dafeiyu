// SiliconFlow's non-streaming Chat Completions response keeps the final answer
// in message.content for models whose SSE output may contain only reasoning.
// Use saved server-side provider credentials; never promote reasoning to text.
import {readStoredKey} from './provider-discovery.js';
import {SILICONFLOW_KEY_REF} from './shared-siliconflow.js';
import {modelTurnFailure} from './dsh-completion.js';
import {fetchModelCompletion} from './model-network.js';

const maxResponseBytes=2*1024*1024;
async function readResponse(response) {
  if(Number(response.headers.get('content-length'))>maxResponseBytes)throw Error('模型返回内容过大，请缩短请求后重试。');
  const reader=response.body?.getReader();
  if(!reader)throw Error('模型服务未返回有效内容。');
  const chunks=[];let size=0;
  try {
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxResponseBytes){await reader.cancel();throw Error('模型返回内容过大，请缩短请求后重试。');}chunks.push(value);}
  } finally {reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('模型服务未返回有效 JSON，请检查模型与接口设置。');}
}

export async function completeSiliconFlowText(rpc,selection,messages,{signal,fetchImpl=globalThis.fetch,readKey=readStoredKey,onUsage,onNetworkDiagnostic}={}) {
  const doc=await rpc('settings.describe',{}),provider=doc.namespaces?.find(n=>n.ns==='llm-pi-ai')?.value?.providers?.[selection.provider];
  if(!provider||provider.api!=='openai-completions')return undefined;
  let url;try{url=new URL(provider.baseURL);}catch{return undefined;}
  if(url.origin!=='https://api.siliconflow.cn'||url.pathname.replace(/\/+$/,'')!=='/v1'||url.search||url.hash||url.username||url.password)return undefined;
  const configured=provider.models?.find(m=>(typeof m==='string'?m:m.id)===selection.model);
  if(!configured)throw Error('当前抖音模型已不可用，请刷新模型列表并重新选择。');
  if(!provider.apiKeyEnv)throw Error('硅基流动服务未配置 API 密钥，请到模型与账号中设置。');
  let key='';try{key=await readKey(SILICONFLOW_KEY_REF);}catch{}if(!key)key=await readKey(provider.apiKeyEnv);
  if(typeof key!=='string'||key.length<8||/[\r\n\x00]/.test(key))throw Error('硅基流动服务没有可用密钥，请到模型与账号中重新填写。');
  const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(65000)]):AbortSignal.timeout(65000);
  deadline.throwIfAborted();
  const maxTokens=typeof configured==='object'?configured.maxTokens:undefined;
  const body=JSON.stringify({model:selection.model,messages,stream:false,max_tokens:Math.max(1,Math.min(4096,maxTokens||provider.defaultMaxTokens||2048))});
  if(Buffer.byteLength(body)>12_000_000)throw Error('模型请求过大，请减少图片或文字。');
  let response;
  try {
    response=await fetchModelCompletion('https://api.siliconflow.cn/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body,signal:deadline,redirect:'error'},{fetchImpl,onDiagnostic:onNetworkDiagnostic});
  } catch(error) {
    if(deadline.aborted)throw Error('模型请求已取消或超时，请稍后重试。');
    throw Object.assign(Error('无法连接硅基流动模型服务，请检查网络后重试。'),{code:error.code});
  }
  let data;
  if(!response.ok){try{data=await readResponse(response);}catch{}throw modelTurnFailure({kind:'error',error:{message:response.status+': '+String(data?.message??data?.error?.message??'')}});}
  try{data=await readResponse(response);}catch(error){if(deadline.aborted)throw Error('模型请求已取消或超时，请稍后重试。');if(/^(?:模型返回内容过大|模型服务未返回有效)/.test(error.message))throw error;throw Error('模型响应读取失败，请检查网络后重试。');}
  const choice=data.choices?.[0];
  if(onUsage&&data.usage&&typeof data.usage==='object'){
    const usage=Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].filter(k=>Number.isSafeInteger(data.usage[k])&&data.usage[k]>=0).map(k=>[k,data.usage[k]]));
    if(Object.keys(usage).length)onUsage(usage);
  }
  if(choice?.finish_reason==='length')throw Error('模型回答达到长度上限，请缩短请求后重试。');
  const content=choice?.message?.content;
  const text=typeof content==='string'?content:Array.isArray(content)?content.filter(b=>b?.type==='text'&&typeof b.text==='string').map(b=>b.text).join(''):'';
  if(!text.trim())throw Error(choice?.message?.reasoning_content ? '模型接口只返回了推理内容，没有返回正式答案。请检查该服务的返回格式或改用其他视觉模型后重试。' : '模型没有返回文本');
  return text.trim().split(key).join('[密钥已隐藏]');
}
