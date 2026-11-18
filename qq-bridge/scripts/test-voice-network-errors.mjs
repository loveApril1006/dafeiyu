import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {voiceNetworkError} from '../src/voice-network-error.js';
import {synthesizeGptSovitsAudio} from '../src/local-tts.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const fail=code=>new TypeError('fetch failed secret-value', {cause:Object.assign(new Error('private path'),{code})});
for(const [code,pattern] of [['ECONNREFUSED',/未启动|未监听/],['UND_ERR_CONNECT_TIMEOUT',/超时/],['ECONNRESET',/中断/],['EAI_AGAIN',/解析/]]){
 let calls=0;await assert.rejects(synthesizeGptSovitsAudio('测试',{fetchImpl:async()=>{calls++;throw fail(code);}}),error=>{assert.match(error.message,/本地语音合成服务（17866）/);assert.match(error.message,pattern);assert.match(error.message,/尚未进入 QQ 发送/);assert.ok(!error.message.includes('secret-value'));return true;});assert.equal(calls,1);
}
await assert.rejects(synthesizeGptSovitsAudio('测试',{fetchImpl:async()=>({ok:true,headers:new Headers(),body:{async *[Symbol.asyncIterator](){yield Buffer.from('RIFF');throw fail('UND_ERR_SOCKET');}}})}),/接收本地合成音频.*UND_ERR_SOCKET/);
assert.match(voiceNetworkError({cause:new AggregateError([Object.assign(new Error(),{code:'ECONNREFUSED'})])},'测试').message,/ECONNREFUSED/);
for(const outcome of ['fetch','body','missing-id']){
 let posts=0;const h=await bridgeHarness({config:{socialV2:{voice:{enabled:true,maxPerMinute:1,maxPerHour:1}}},files:{'audio/fixture.wav':Buffer.alloc(100)},globals:{
  inspectAudio:async()=>({ok:true,size:100,duration:1,codec:'pcm_s16le'}),
  fetch:async(url)=>{if(String(url).endsWith('/send_private_msg')){posts++;if(outcome==='fetch')throw fail('ECONNRESET');if(outcome==='body')return {ok:true,json:async()=>{throw fail('UND_ERR_SOCKET');}};return {ok:true,json:async()=>({status:'ok',retcode:0,data:{}})};}throw Error('Unexpected network call '+url);}
 }});
 try{h.setMode('reserved2');h.getSocialV2State('private:123');await assert.rejects(h.sendVoiceForV2('private:123','fixture.wav',{verify:false}),/发送结果未确认.*核对 QQ/);assert.equal(posts,1,'Uncertain QQ send must never retry');h.voiceBudgetCheck('private:123',h.voiceCfg());}finally{await h.close();}
}
// Execute the real MCP helper against a dropped bridge connection; it must report the stage.
const source=fs.readFileSync(new URL('../src/mcp-snowluma-safe.js',import.meta.url),'utf8'),start=source.indexOf('async function agentApi(path,'),end=source.indexOf('\n/**',start);
const context=vm.createContext({AbortSignal,voiceNetworkError,agentHeaders:()=>({}),agentApiBase:()=> 'http://127.0.0.1:3100',fetch:async()=>{throw fail('ECONNREFUSED');}});vm.runInContext(source.slice(start,end)+'\nglobalThis.run=agentApi;',context);
await assert.rejects(context.run('/api/socialV2/send-voice',{timeoutMs:300000}),/QQ Bridge 语音接口.*ECONNREFUSED.*核对 QQ/);
console.log('PASS: TTS connect/stream errors, nested cause codes without secrets, QQ failure/missing result not counted or retried, MCP bridge errors. No real QQ calls.');
