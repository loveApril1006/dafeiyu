import assert from 'node:assert/strict';
import {SILICONFLOW_KEY_REF}from'../src/shared-siliconflow.js';
import {installDouyinModelProfile,describeDouyinModelProfile,saveDouyinModelKey,douyinModelProfile,fixedDouyinSelection} from '../companion/douyin-model-profile.mjs';

const original={displayName:'Existing service',api:'openai-completions',baseURL:'https://api.siliconflow.cn/v1',apiKeyEnv:'SOURCE_KEY',models:[{id:'Qwen/Qwen3-VL-8B-Instruct',input:['text','image']},{id:'text-only',input:['text']}]};
function fixture(source=original){
  const ns={ns:'llm-pi-ai',revision:'1',value:{providers:{source:structuredClone(source),other:{api:'openai-completions',baseURL:'https://other.example/v1',models:['other']}}}},keys=new Map([['SOURCE_KEY','fixture-source-secret']]),writes=[];
  const rpc=async(method,args)=>{
    if(method==='settings.describe')return {writable:true,namespaces:[structuredClone(ns)]};
    if(method==='credentials.describe')return Object.fromEntries(args.refs.map(ref=>[ref,{configured:keys.has(ref)}]));
    if(method==='settings.update'){assert.equal(args.expectedRevision,ns.revision);assert(Object.keys(args.patch.providers).every(id=>id===douyinModelProfile.provider||id==='source'));assert(!Object.hasOwn(args.patch.providers,'other'));Object.assign(ns.value.providers,structuredClone(args.patch.providers));ns.revision=String(Number(ns.revision)+1);writes.push(method);return{};}
    if(method==='credentials.set'){assert.equal(args.ref,SILICONFLOW_KEY_REF);keys.set(args.ref,args.value);writes.push(method);return{};}
    throw Error('Unexpected RPC');
  };return {rpc,ns,keys,writes};
}
{
  const f=fixture(),before=structuredClone(f.ns.value.providers);
  const result=await installDouyinModelProfile(f.rpc,{sourceProvider:'source',readKey:ref=>f.keys.get(ref)});
  assert(result.fixed&&result.configured&&result.hasKey);assert.equal(result.baseUrl,'https://api.siliconflow.cn/v1');assert.equal(result.model,'Qwen/Qwen3-VL-8B-Instruct');assert.equal(result.registerUrl,'https://cloud.siliconflow.cn/i/HtBsfZYI');
  for(const [id,value]of Object.entries(before))assert.deepEqual(f.ns.value.providers[id],value);
  assert.equal(f.keys.get('SOURCE_KEY'),'fixture-source-secret');assert.equal(f.keys.get(SILICONFLOW_KEY_REF),'fixture-source-secret');assert(!JSON.stringify(result).includes('secret'));assert(!JSON.stringify(result).includes('KEY'));
  assert.deepEqual(fixedDouyinSelection(),{provider:douyinModelProfile.provider,model:douyinModelProfile.model});
  assert.deepEqual(f.ns.value.providers[douyinModelProfile.provider].models.map(m=>m.id),[douyinModelProfile.model]);
  const writes=f.writes.length;await installDouyinModelProfile(f.rpc,{sourceProvider:'other',readKey:()=>{throw Error('must not remigrate an installed profile');}});assert.equal(f.writes.length,writes);
  for(const input of [{apiKey:'fixture-replacement-secret',baseUrl:'https://bad.example'},{apiKey:'fixture-replacement-secret',model:'other'},{apiKey:'Bearer fixture-key'},{apiKey:''}])await assert.rejects(()=>saveDouyinModelKey(f.rpc,input));
  assert.equal(f.writes.length,writes);
  await saveDouyinModelKey(f.rpc,{apiKey:'fixture-replacement-secret'});assert.equal(f.keys.get(SILICONFLOW_KEY_REF),'fixture-replacement-secret');assert.equal(f.keys.get('SOURCE_KEY'),'fixture-source-secret');for(const [id,value]of Object.entries(before))assert.deepEqual(f.ns.value.providers[id],id==='source'?{...value,apiKeyEnv:SILICONFLOW_KEY_REF}:value);
  const status=await describeDouyinModelProfile(f.rpc);assert(!JSON.stringify(status).includes('replacement-secret'));
  f.ns.value.providers[douyinModelProfile.provider].baseURL='https://unwanted.example/v1';assert(!(await describeDouyinModelProfile(f.rpc)).configurationValid);
  await saveDouyinModelKey(f.rpc,{apiKey:'fixture-replacement-secret'});assert((await describeDouyinModelProfile(f.rpc)).configurationValid);assert.equal(f.ns.value.providers[douyinModelProfile.provider].baseURL,douyinModelProfile.baseUrl);
}
{
  const f=fixture({...original,baseURL:'https://other.example/v1'});let reads=0;
  const result=await installDouyinModelProfile(f.rpc,{sourceProvider:'source',readKey:()=>{reads++;return 'must-not-copy';}});
  assert.equal(reads,0);assert(!result.hasKey&&!result.configured&&result.configurationValid);assert.equal(f.keys.get(SILICONFLOW_KEY_REF),undefined);
}
console.log('PASS fixed model/API/profile, one-time official-service key migration, shared credential updates preserving model IDs and legacy stored keys, rejected endpoint/model overrides, empty-key setup, idempotence and no key exposure.');
