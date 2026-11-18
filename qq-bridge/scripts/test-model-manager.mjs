import assert from 'node:assert/strict';
import { normalizeProvider, saveProvider, getProviderSettings } from '../src/model-manager.js';

const secret = 'fixture-secret-key';
const ns = { ns: 'llm-pi-ai', revision: 4, value: { providers: {} } };
const keys = {};
const writes = [];
async function rpc(method, body) {
  if (method === 'settings.describe') return { writable: true, namespaces: [ns] };
  if (method === 'credentials.describe') return Object.fromEntries(body.refs.map(ref => [ref, { configured: !!keys[ref] }]));
  writes.push({ method, body });
  if (method === 'settings.update') {
    assert.equal(body.expectedRevision, ns.revision);
    Object.assign(ns.value.providers, body.patch.providers);
    ns.revision++;
  } else if (method === 'credentials.set') keys[body.ref] = body.value;
  else throw new Error('Unexpected RPC: ' + method);
}
const input = { id: 'test-api', displayName: 'Test API', baseUrl: 'https://example.com/v1', models: 'model-a\nmodel-b，model-a', apiKey: secret };
assert.deepEqual(normalizeProvider(input).modelIds, ['model-a', 'model-b']);
for (const invalid of [{id:'__proto__'}, {baseUrl:'http://example.com'}, {baseUrl:'https://example.com/chat/completions'}, {apiKey:'short'}, {models:''}]) {
  assert.throws(() => normalizeProvider({...input, ...invalid}));
}
await saveProvider(rpc, input);
assert.deepEqual(ns.value.providers['test-api'].models.map(model=>model.input),[['text'],['text']]);
const ref = ns.value.providers['test-api'].apiKeyEnv;
assert.equal(keys[ref], secret);
await assert.rejects(() => saveProvider(rpc, input), /已经存在/);
const keyWrites = writes.filter(row => row.method === 'credentials.set').length;
await saveProvider(rpc, {...input, editing:true, apiKey:'', models:'model-b\nmodel-c'});
assert.equal(writes.filter(row => row.method === 'credentials.set').length, keyWrites);
assert.equal(keys[ref], secret);
await assert.rejects(() => saveProvider(rpc, {...input, editing:true, apiKey:'', baseUrl:'https://other.example.com'}), /重新填写/);
const settings = await getProviderSettings(rpc);
assert.equal(settings.providers[0].hasKey, true);
assert(!JSON.stringify(settings).includes(secret));
assert.deepEqual(settings.providers[0].models, ['model-b', 'model-c']);
console.log('PASS provider validation, add/edit, blank-key preservation, URL changes and credential redaction (mock RPC only)');
await saveProvider(rpc,{...input,id:'test_api'});
assert.notEqual(ref,ns.value.providers.test_api.apiKeyEnv);
const beforeConflict=writes.length;
await assert.rejects(()=>saveProvider(async(method,args)=>method==='settings.update'?Promise.reject(Error('settings/conflict')):rpc(method,args),{...input,id:'conflict-api'}),/conflict/);
assert.equal(writes.length,beforeConflict);
console.log('PASS credential-reference collision protection and revision conflicts leave credentials untouched');
ns.value.providers['native-oauth']={models:[]};
const guardedRpc=async(method,body)=>{if(method==='credentials.describe')assert(body.refs.every(ref=>typeof ref==='string'));return rpc(method,body);};
assert.equal((await getProviderSettings(guardedRpc)).providers.find(row=>row.id==='native-oauth').editable,false);
const imageInput={...input,id:'vision-api',models:'vision-one\nvision-two\ntext-only',visionModels:['vision-one','vision-two']};
await saveProvider(rpc,imageInput);
assert.deepEqual(ns.value.providers['vision-api'].models.map(model=>model.input),[['text','image'],['text','image'],['text']]);
assert.deepEqual((await getProviderSettings(rpc)).providers.find(p=>p.id==='vision-api').visionModels,['vision-one','vision-two']);
await saveProvider(rpc,{...imageInput,editing:true,apiKey:'',visionModels:['vision-two']});
assert.deepEqual(ns.value.providers['vision-api'].models[0].input,['text']);
const legacyEdit={...imageInput,editing:true,apiKey:''};delete legacyEdit.visionModels;
await saveProvider(rpc,legacyEdit);assert.deepEqual(ns.value.providers['vision-api'].models[1].input,['text','image'],'older clients must preserve image capabilities');
for(const visionModels of ['vision-one',['not-in-service'],[1]])assert.throws(()=>normalizeProvider({...imageInput,visionModels}),/图片模型/);
assert.equal(keys[ns.value.providers['vision-api'].apiKeyEnv],secret);
console.log('PASS multiple image models, explicit capability removal, older-client preservation, subset validation, and unchanged credentials.');
await saveProvider(rpc,{...input,id:'responses-api',api:'openai-responses'});
await saveProvider(rpc,{...input,id:'claude-api',api:'anthropic-messages',baseUrl:'https://api.anthropic.com/v1'});
assert.equal(ns.value.providers['responses-api'].api,'openai-responses');assert.equal(ns.value.providers['claude-api'].api,'anthropic-messages');assert.equal(ns.value.providers['claude-api'].baseURL,'https://api.anthropic.com');
await saveProvider(rpc,{...input,id:'claude-api',editing:true,apiKey:'',baseUrl:'https://api.anthropic.com'});assert.equal(ns.value.providers['claude-api'].api,'anthropic-messages','editing older clients preserves protocol');
const protocols=await getProviderSettings(rpc);assert(protocols.canDiscoverModels);assert(protocols.providers.find(p=>p.id==='claude-api').editable);assert.equal(protocols.providers.find(p=>p.id==='responses-api').api,'openai-responses');
assert.equal(normalizeProvider({...input,id:'google-api',baseUrl:'https://generativelanguage.googleapis.com/v1beta'}).baseUrl,'https://generativelanguage.googleapis.com/v1beta/openai');
assert.throws(()=>normalizeProvider({...input,api:'unsupported-protocol'}));assert.throws(()=>normalizeProvider(null));assert.throws(()=>normalizeProvider({...input,models:Array.from({length:1001},(_,i)=>'model-'+i).join('\n')}));
assert.equal(normalizeProvider({...input,models:Array.from({length:1000},(_,i)=>'model-'+i).join('\n')}).modelIds.length,1000);
console.log('PASS protocol-aware save/edit, native Claude endpoint normalization, Gemini compatible endpoint, 1000-model limit and discovery feature flag.');
