import assert from 'node:assert/strict';
import {requireImageModel,douyinModelMessages} from '../companion/douyin-model.mjs';

{
  const original=[{role:'system',content:'watch JSON schema'},{role:'system',content:'extra internal instructions'},{role:'user',content:[{type:'text',text:'synthetic sample'},{type:'image_url',image_url:{url:'data:image/png;base64,eA=='}}]}];
  const before=structuredClone(original),messages=douyinModelMessages(original);
  assert.equal(messages.filter(m=>m.role==='system').length,1);
  assert.match(messages[0].content,/不发送QQ消息/);assert.match(messages[0].content,/watch JSON schema/);assert.match(messages[0].content,/extra internal instructions/);
  assert.deepEqual(messages[1],original[2]);assert.deepEqual(original,before,'normalization must not change the caller messages');
  assert.equal(douyinModelMessages([original[2]])[1],original[2]);
}

const selection={provider:'fixture-api',model:'deepseek-ai/DeepSeek-V3'};
function fixture({catalogInput,configuredInput=['text'],defaultInput=['text'],configuredModel=true,catalogModel=true}={}) {
  const calls=[];
  const api={async callUnary(method) {
    calls.push(method);
    let value;
    if(method==='session.modelCatalog')value={groups:[{id:selection.provider,models:catalogModel?[{id:selection.model,...(catalogInput===undefined?{}:{inputModalities:catalogInput})}]:[]}]};
    else if(method==='settings.describe')value={namespaces:[{ns:'llm-pi-ai',value:{providers:{[selection.provider]:{defaultInput,models:configuredModel?[{id:selection.model,...(configuredInput===undefined?{}:{input:configuredInput})}]:[]}}}}]};
    else throw Error('Image preflight must never create sessions, submit prompts or change settings');
    return {result:{ok:true,value}};
  }};
  return{api,calls};
}
for(const model of ['deepseek-ai/DeepSeek-V3','Kev-4B']) {
  selection.model=model;
  const f=fixture();await assert.rejects(()=>requireImageModel(f.api,selection),e=>e.message.includes(model)&&/未配置图片输入/.test(e.message));
  assert.deepEqual(f.calls,['session.modelCatalog','settings.describe']);
}
{
  const f=fixture({configuredInput:['text','image']});await requireImageModel(f.api,selection);assert.deepEqual(f.calls,['session.modelCatalog','settings.describe']);
}
{
  const f=fixture({catalogInput:['text','image']});await requireImageModel(f.api,selection);assert.deepEqual(f.calls,['session.modelCatalog']);
}
{
  const f=fixture({catalogInput:['text']});await assert.rejects(()=>requireImageModel(f.api,selection),/未配置图片输入/);assert.deepEqual(f.calls,['session.modelCatalog']);
}
{
  const f=fixture({catalogInput:'image'});await assert.rejects(()=>requireImageModel(f.api,selection),/未配置图片输入/);
}
{
  const f=fixture({catalogModel:false});await assert.rejects(()=>requireImageModel(f.api,selection),/已不可用/);assert.deepEqual(f.calls,['session.modelCatalog']);
}
console.log('PASS ID-only catalogs fall back to live provider input settings; text and unknown models stop before session/prompt, declared image models remain available, malformed metadata fails closed; read-only mocked RPC.');
