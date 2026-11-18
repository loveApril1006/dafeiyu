import assert from 'node:assert/strict';
import {completeSiliconFlowText} from '../src/siliconflow-completion.js';

const selection={provider:'sf-fixture',model:'Qwen/Qwen3-VL-8B-Instruct'},secret='fixture-siliconflow-key';
const profile={api:'openai-completions',baseURL:'https://api.siliconflow.cn/v1',apiKeyEnv:'FIXTURE_SF_KEY',models:[{id:selection.model,input:['text','image']}],defaultMaxTokens:32768};
const messages=[{role:'system',content:'No tools'},{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,fixture'}},{type:'text',text:'Return the image color'}]}];
let value=structuredClone(profile),reads=0,calls=[],response;
const rpc=async(method)=>{assert.equal(method,'settings.describe');return{namespaces:[{ns:'llm-pi-ai',value:{providers:{[selection.provider]:value}}}]};};
const options={readKey:async ref=>{assert.equal(ref,profile.apiKeyEnv);reads++;return secret;},fetchImpl:async(url,args)=>{calls.push({url,args});return response;}};
const reply=(message,status=200,finish_reason='stop')=>new Response(JSON.stringify(status===200?{choices:[{message,finish_reason}]}:message),{status});
response=reply({content:' {"color":"red"} ',reasoning_content:'fixture private reasoning'});
assert.equal(await completeSiliconFlowText(rpc,selection,messages,options),'{"color":"red"}');
const request=JSON.parse(calls[0].args.body);assert.equal(request.stream,false);assert.equal(request.max_tokens,4096);assert.deepEqual(request.messages,messages);assert.equal(request.enable_thinking,undefined,'do not send unsupported reasoning controls to Instruct models');assert.equal(calls[0].args.redirect,'error');assert.equal(calls[0].url,'https://api.siliconflow.cn/v1/chat/completions');assert.equal(calls[0].args.headers.authorization,'Bearer '+secret);
for(const [status,pattern]of [[401,/密钥无效/],[402,/余额或额度不足/],[429,/请求受限/],[503,/暂时不可用/]]){
 response=reply({message:'fixture private error '+secret},status);await assert.rejects(()=>completeSiliconFlowText(rpc,selection,messages,options),e=>pattern.test(e.message)&&!e.message.includes(secret)&&!e.message.includes('fixture private error'));
}
response=reply({reasoning_content:'{"color":"red"}',content:null});await assert.rejects(()=>completeSiliconFlowText(rpc,selection,messages,options),e=>/只返回了推理内容/.test(e.message)&&!e.message.includes('"color"'));
response=reply({content:'partial'},200,'length');await assert.rejects(()=>completeSiliconFlowText(rpc,selection,messages,options),/长度上限/);
response=reply({content:[{type:'text',text:'red'},{type:'reasoning',text:'private'}]});assert.equal(await completeSiliconFlowText(rpc,selection,messages,options),'red');
response=reply({content:secret});assert.equal(await completeSiliconFlowText(rpc,selection,messages,options),'[密钥已隐藏]');
response=new Response(JSON.stringify({choices:[{message:{content:'red'},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:4,total_tokens:16,private_field:secret}}));
let usage;assert.equal(await completeSiliconFlowText(rpc,selection,messages,{...options,onUsage:value=>{usage=value;}}),'red');assert.deepEqual(usage,{prompt_tokens:12,completion_tokens:4,total_tokens:16});
response=new Response('not JSON');await assert.rejects(()=>completeSiliconFlowText(rpc,selection,messages,options),/有效 JSON/);
response=new Response('x'.repeat(2*1024*1024+1));await assert.rejects(()=>completeSiliconFlowText(rpc,selection,messages,options),/内容过大/);
const beforeCalls=calls.length,beforeReads=reads;
for(const patch of [{baseURL:'https://another.example/v1'},{baseURL:'https://api.siliconflow.cn.example/v1'},{baseURL:'http://api.siliconflow.cn/v1'},{baseURL:'https://api.siliconflow.cn/v1?key=bad'},{api:'openai-responses'}]){value={...profile,...patch};assert.equal(await completeSiliconFlowText(rpc,selection,messages,options),undefined);}
assert.equal(calls.length,beforeCalls);assert.equal(reads,beforeReads,'unrelated services never read the SiliconFlow key');
value={...profile,models:[]};await assert.rejects(()=>completeSiliconFlowText(rpc,selection,messages,options),/已不可用/);assert.equal(calls.length,beforeCalls);
value=profile;const controller=new AbortController();controller.abort();await assert.rejects(()=>completeSiliconFlowText(rpc,selection,messages,{...options,signal:controller.signal}));assert.equal(calls.length,beforeCalls);
await assert.rejects(()=>completeSiliconFlowText(rpc,selection,messages,{...options,fetchImpl:async()=>{throw Error(secret);}}),e=>/无法连接/.test(e.message)&&!e.message.includes(secret));
console.log('PASS exact-service non-streaming transport, server-side credentials, normal final text only, image messages, bounded output, provider errors/redaction, truncation rejection, cancellation and unchanged transport for other services; mocked requests only.');
