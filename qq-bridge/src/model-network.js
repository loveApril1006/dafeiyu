import * as http from 'node:http';
import {execFileSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';

const loopback='localhost,127.0.0.1,::1,[::1]';
function proxyUrl(value) {
  try { const url=new URL(value.includes('://')?value:'http://'+value);return ['http:','https:'].includes(url.protocol)&&!url.search&&!url.hash&&url.pathname==='/'?url.href:undefined; } catch { return undefined; }
}
export function parseWindowsProxy(output) {
  if(!/^\s*ProxyEnable\s+REG_DWORD\s+0x1\s*$/im.test(output))return null;
  const server=/^\s*ProxyServer\s+REG_SZ\s+(.+)$/im.exec(output)?.[1]?.trim();if(!server)return null;
  const values={};
  if(server.includes('=')){for(const entry of server.split(';')){const [protocol,...parts]=entry.split('=');if(['http','https'].includes(protocol.trim().toLowerCase()))values[protocol.trim().toLowerCase()]=proxyUrl(parts.join('=').trim());}}
  else values.http=values.https=proxyUrl(server);
  const bypass=/^\s*ProxyOverride\s+REG_SZ\s+(.+)$/im.exec(output)?.[1]?.trim();
  values.bypass=(bypass||'').split(';').map(s=>s.trim()).filter(s=>s&&s!=='<local>').join(',');
  return values.http||values.https?values:null;
}
function windowsProxy() {
  try { return parseWindowsProxy(execFileSync('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],{encoding:'utf8',timeout:3000,windowsHide:true,stdio:['ignore','pipe','ignore']})); } catch { return null; }
}

// Called once, before requests in the independent Douyin process. This follows
// the user's existing network settings; it does not change Windows or keys.
export function configureModelNetwork({env=process.env,platform=process.platform,readWindowsProxy=windowsProxy,applyProxy=http.setGlobalProxyFromEnv}={}) {
  if(env.NODE_USE_ENV_PROXY==='0')return {source:'disabled',proxyEnabled:false};
  const explicit=env.https_proxy||env.HTTPS_PROXY||env.http_proxy||env.HTTP_PROXY;
  const system=!explicit&&platform==='win32'?readWindowsProxy():null;
  if(!explicit&&!system)return {source:'direct',proxyEnabled:false};
  if(typeof applyProxy!=='function')return {source:'unsupported-runtime',proxyEnabled:false};
  const bypass=[env.no_proxy||env.NO_PROXY||system?.bypass,loopback].filter(Boolean).join(',');
  const settings=explicit?{
    http_proxy:env.http_proxy||env.HTTP_PROXY,https_proxy:env.https_proxy||env.HTTPS_PROXY,no_proxy:bypass,
  }:{http_proxy:system.http,https_proxy:system.https,no_proxy:bypass};
  applyProxy(settings);
  return {source:explicit?'environment':'windows-system',proxyEnabled:true,localBypass:true};
}

function causes(error) {
  const pending=[error],seen=new Set(),result=[];
  while(pending.length&&seen.size<16){const item=pending.shift();if(!item||seen.has(item))continue;seen.add(item);if(typeof item.code==='string')result.push(item);if(item.cause)pending.push(item.cause);if(Array.isArray(item.errors))pending.push(...item.errors);}
  return result;
}
export function modelNetworkProblem(error) {
  const items=causes(error),codes=items.map(x=>x.code);
  if(codes.some(c=>/CERT|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/.test(c)))return {code:'MODEL_TLS',retry:false};
  if(codes.includes('EAI_AGAIN'))return {code:'MODEL_DNS',retry:items.every(x=>x.code==='EAI_AGAIN')};
  if(codes.includes('ENOTFOUND'))return {code:'MODEL_DNS',retry:false};
  // Only errors proving that no HTTP request reached the service can be replayed.
  const beforeSend=items.length>0&&items.every(x=>x.code==='UND_ERR_CONNECT_TIMEOUT'||['ETIMEDOUT','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH'].includes(x.code)&&x.syscall==='connect');
  if(beforeSend)return {code:'MODEL_CONNECT',retry:true};
  return {code:'MODEL_NETWORK',retry:false};
}

export async function fetchModelCompletion(url,options,{fetchImpl=globalThis.fetch,wait=pause,onDiagnostic=()=>{}}={}) {
  const start=Date.now(),report=value=>{try{onDiagnostic({at:new Date().toISOString(),elapsedMs:Date.now()-start,...value});}catch{}};
  for(let attempt=1;attempt<=2;attempt++){
    options.signal?.throwIfAborted();
    try { const response=await fetchImpl(url,options);report({attempt,stage:'response',status:response.status});return response; }
    catch(error){
      if(options.signal?.aborted)throw error;
      const problem=modelNetworkProblem(error),retry=attempt===1&&problem.retry;
      report({attempt,stage:retry?'connect-retry':'network-error',code:problem.code});
      if(!retry)throw Object.assign(Error('模型网络连接失败'),{code:problem.code});
      await wait(250,undefined,{signal:options.signal});
    }
  }
}
