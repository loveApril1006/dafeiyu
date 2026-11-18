import assert from 'node:assert/strict';
import {withImageFetchPolicy,creativeProviderFetch} from '../src/creative-provider-fetch.js';
const original=globalThis.fetch,calls=[];
try{
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),headers:new Headers(options.headers)});return new Response('fixture');};
 const signal=new AbortController().signal;
 await withImageFetchPolicy({baseURL:'https://provider.example/v1',signal},async()=>{
  await creativeProviderFetch('https://provider.example/v1/images/generations',{headers:{authorization:'Bearer private-key'}});
  await creativeProviderFetch('https://93.184.216.34/image.png',{headers:{authorization:'Bearer private-key','x-goog-api-key':'private-key'}});
  await assert.rejects(()=>creativeProviderFetch('http://127.0.0.1:17866/private'),/禁止|公网|私有|不允许/);
 });
 assert.equal(calls.length,2);assert.equal(calls[0].headers.get('authorization'),'Bearer private-key');assert.equal(calls[1].headers.get('authorization'),null);assert.equal(calls[1].headers.get('x-goog-api-key'),null);
 globalThis.fetch=async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1:3100/api/status'}});
 await assert.rejects(()=>withImageFetchPolicy({baseURL:'https://provider.example/v1',signal},()=>creativeProviderFetch('https://provider.example/v1/images/generations',{method:'POST',redirect:'error',headers:{authorization:'secret'}})),/重定向/);
 const abort=new AbortController();abort.abort(Error('cancelled'));let called=false;globalThis.fetch=async()=>{called=true;throw Error('should not run');};await assert.rejects(()=>withImageFetchPolicy({baseURL:'https://provider.example',signal:abort.signal},()=>creativeProviderFetch('https://provider.example/test')),/cancelled/);assert.equal(called,false);
 console.log('PASS image network policy: keys stay at selected origin, public downloads omit credentials, internal addresses/redirects rejected, cancellation prevents late requests');
}finally{globalThis.fetch=original;}
