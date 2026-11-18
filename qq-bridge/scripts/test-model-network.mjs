import assert from 'node:assert/strict';
import {configureModelNetwork,parseWindowsProxy,fetchModelCompletion,modelNetworkProblem} from '../src/model-network.js';

const registry='\n    ProxyEnable    REG_DWORD    0x1\n    ProxyServer    REG_SZ    127.0.0.1:7897\n    ProxyOverride    REG_SZ    <local>;*.example.org\n';
assert.deepEqual(parseWindowsProxy(registry),{http:'http://127.0.0.1:7897/',https:'http://127.0.0.1:7897/',bypass:'*.example.org'});
assert.equal(parseWindowsProxy(registry.replace('0x1','0x0')),null);
assert.equal(parseWindowsProxy(registry.replace('127.0.0.1:7897','socks=127.0.0.1:1080')),null);
assert.deepEqual(parseWindowsProxy(registry.replace('127.0.0.1:7897','http=127.0.0.1:7890;https=127.0.0.1:7891')).https,'http://127.0.0.1:7891/');
const env={NO_PROXY:'private.example'},before=structuredClone(env);let applied;
assert.equal(configureModelNetwork({env,platform:'win32',readWindowsProxy:()=>parseWindowsProxy(registry),applyProxy:value=>{applied=value;}}).source,'windows-system');
assert.equal(applied.https_proxy,'http://127.0.0.1:7897/');assert.match(applied.no_proxy,/private.example/);assert.match(applied.no_proxy,/127.0.0.1/);assert.match(applied.no_proxy,/localhost/);assert.deepEqual(env,before);
assert.equal(configureModelNetwork({env:{HTTPS_PROXY:'http://explicit.example:3128'},platform:'win32',readWindowsProxy:()=>{throw Error('explicit environment must take priority');},applyProxy:value=>{applied=value;}}).source,'environment');
assert.equal(applied.https_proxy,'http://explicit.example:3128');
assert.equal(configureModelNetwork({env:{NODE_USE_ENV_PROXY:'0'},platform:'win32',readWindowsProxy:()=>{throw Error('explicit opt-out');}}).source,'disabled');
assert.equal(configureModelNetwork({env:{},platform:'linux'}).source,'direct');
assert.equal(configureModelNetwork({env:{},platform:'win32',readWindowsProxy:()=>parseWindowsProxy(registry),applyProxy:null}).source,'unsupported-runtime');

const request={method:'POST',body:'synthetic',headers:{authorization:'Bearer fixture-secret'},redirect:'error',signal:AbortSignal.timeout(5000)};
let attempts=0,diagnostics=[];
const timeout=()=>Object.assign(Error('private request'),{cause:Object.assign(Error('private upstream'),{code:'UND_ERR_CONNECT_TIMEOUT'})});
const response=await fetchModelCompletion('https://synthetic.example',request,{fetchImpl:async(_url,options)=>{assert.equal(options,request);if(++attempts===1)throw timeout();return new Response('ok');},wait:async()=>{},onDiagnostic:r=>diagnostics.push(r)});
assert.equal(await response.text(),'ok');assert.equal(attempts,2);assert.deepEqual(diagnostics.map(x=>x.stage),['connect-retry','response']);assert.ok(!JSON.stringify(diagnostics).includes('private'));assert.ok(!JSON.stringify(diagnostics).includes('fixture-secret'));
for(const error of [Object.assign(Error('ambiguous'),{code:'UND_ERR_SOCKET'}),Object.assign(Error('reset'),{code:'ECONNRESET'}),Object.assign(Error('certificate'),{code:'CERT_HAS_EXPIRED'})]){
  attempts=0;await assert.rejects(()=>fetchModelCompletion('https://synthetic.example',request,{fetchImpl:async()=>{attempts++;throw error;},wait:async()=>{throw Error('must not retry');}}));assert.equal(attempts,1);
}
attempts=0;await assert.rejects(()=>fetchModelCompletion('https://synthetic.example',request,{fetchImpl:async()=>{attempts++;throw timeout();},wait:async()=>{}}),e=>e.code==='MODEL_CONNECT');assert.equal(attempts,2);
attempts=0;assert.equal((await fetchModelCompletion('https://synthetic.example',request,{fetchImpl:async()=>{attempts++;return new Response('no',{status:503});}})).status,503);assert.equal(attempts,1,'HTTP failure must not replay a processed inference');
const abort=new AbortController();attempts=0;await assert.rejects(()=>fetchModelCompletion('https://synthetic.example',{...request,signal:abort.signal},{fetchImpl:async()=>{attempts++;throw timeout();},wait:async()=>{abort.abort();}}));assert.equal(attempts,1);
assert.deepEqual(modelNetworkProblem(Object.assign(Error(),{code:'EAI_AGAIN'})),{code:'MODEL_DNS',retry:true});
assert.equal(modelNetworkProblem(Object.assign(Error(),{code:'ETIMEDOUT',syscall:'read'})).retry,false);
assert.equal(modelNetworkProblem(Object.assign(Error(),{code:'ECONNREFUSED',syscall:'connect'})).retry,true);
console.log('PASS existing Windows/environment proxy, local bypass, opt-out, unchanged environment, bounded pre-connect retry, no ambiguous/HTTP replay, cancellation and private diagnostics.');
