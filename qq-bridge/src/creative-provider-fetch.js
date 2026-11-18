// Provider adapters share a request-scoped network policy, including downloads.
// Model keys belong only to the endpoint explicitly configured by the admin.
import {AsyncLocalStorage} from 'node:async_hooks';
import {validateFetchUrl} from './safe-fetch.js';
import {setTimeout as pause} from 'node:timers/promises';
const context=new AsyncLocalStorage();
export function withImageFetchPolicy(settings,run){return context.run({origin:new URL(settings.baseURL).origin,signal:settings.signal,onImageResult:settings.onImageResult},run);}
export async function preserveImageResult(url,traceId,timings){const seconds=timings?.inference;await context.getStore()?.onImageResult?.({url,traceId,inferenceSeconds:typeof seconds==='number'&&Number.isFinite(seconds)&&seconds>=0?seconds:undefined});}
export async function creativeProviderFetch(input,options={}){
 const policy=context.getStore();if(!policy)throw Error('图像请求缺少范围限制');
 let url=new URL(typeof input==='string'||input instanceof URL?input:input.url),opts={...options,headers:new Headers(options.headers)};
 for(let i=0;i<6;i++){
  policy.signal.throwIfAborted();
  if(url.origin!==policy.origin){for(const name of ['authorization','cookie','api-key','x-api-key','x-goog-api-key'])opts.headers.delete(name);}
  // Only replay read-only downloads. A generation POST may already be billed.
  let response;const download=url.origin!==policy.origin&&['GET','HEAD'].includes(String(opts.method||'GET').toUpperCase());
  for(let attempt=0;attempt<(download?3:1);attempt++){
   policy.signal.throwIfAborted();
   try{if(url.origin!==policy.origin)await validateFetchUrl(url.toString());policy.signal.throwIfAborted();response=await fetch(url,{...opts,redirect:'manual',signal:opts.signal?AbortSignal.any([policy.signal,opts.signal]):policy.signal});if(!download||![408,429,500,502,503,504].includes(response.status)||attempt===2)break;await response.body?.cancel();}
   catch(error){if(!download||attempt===2||policy.signal.aborted||opts.signal?.aborted)throw error;}
   await pause(300*(attempt+1),undefined,{signal:policy.signal});
  }
  if(![301,302,303,307,308].includes(response.status))return response;
  if(opts.redirect==='error'){await response.body?.cancel();throw Error('图像服务返回了不允许的重定向，本次未自动重试');}
  const location=response.headers.get('location');if(!location)return response;const next=new URL(location,url);await response.body?.cancel();
  if(opts.method&&!['GET','HEAD'].includes(opts.method)&&next.origin!==url.origin)throw Error('图像服务不能跨站转交生成请求');
  if(response.status===303){opts.method='GET';delete opts.body;opts.headers.delete('content-type');opts.headers.delete('content-length');}url=next;
 }
 throw Error('图像服务重定向过多');
}
export async function recoverImageDownload(job,{signal,maxBytes=12*1024*1024}={}){
 return withImageFetchPolicy({baseURL:job.baseURL,signal},async()=>{const response=await creativeProviderFetch(job.url,{method:'GET',signal,redirect:'follow'});if(!response.ok){await response.body?.cancel();throw Error('图片下载失败 HTTP '+response.status);}const chunks=[];let size=0;for await(const chunk of response.body){signal.throwIfAborted();size+=chunk.length;if(size>maxBytes)throw Error('图片超过12MB');chunks.push(chunk);}return {data:Buffer.concat(chunks)};});
}
