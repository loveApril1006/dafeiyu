import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {bridgeHarness} from './audit-bridge-harness.mjs';

for(const [images,tool,expected] of [[false,undefined,false],[true,false,false],[true,undefined,true]]){
 const h=await bridgeHarness({config:{socialV2:{sticker:{enabled:false},tools:tool===undefined?{}:{generateImage:tool}}},files:{'companion/reply-options.json':{revision:2,text:true,images,voice:true,stickers:true},'companion/user-note.txt':'original user note'}});
 h.setMode('reserved2');
 const server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port,headers={'X-Console-Token':'fixture-console-token'};
 try{
  const key='private:123';h.getSocialV2State(key);
  const wake=h.buildWakePromptV2(key,'message');
  assert(wake.includes('本轮实时状态：生成图片开关'+(expected?'已开启':'已关闭')));
  assert(wake.includes('历史中的旧开关、旧报错'));
  assert(wake.includes('没有本轮真实工具调用'));
  assert(wake.includes('不为验证开关发起收费生图'));
  const response=await fetch(base+'/api/socialV2/prompt?key='+encodeURIComponent(key),{headers});assert.equal(response.status,200);
  const status=await response.json();assert.equal(status.enabledTools.includes('qq_generate_image'),expected);
  if(tool===undefined){
   const file=path.join(h.temp,'companion/reply-options.json');
   fs.writeFileSync(file,JSON.stringify({revision:3,text:true,images:!images,voice:true,stickers:true}));
   assert(h.buildWakePromptV2(key,'message').includes('本轮实时状态：生成图片开关'+(!images?'已开启':'已关闭')));
   const changed=await (await fetch(base+'/api/socialV2/prompt?key='+encodeURIComponent(key),{headers})).json();
   assert.equal(changed.enabledTools.includes('qq_generate_image'),!images);
  }
  assert.equal(h.calls.sent.length,0);assert.equal(h.calls.prompts.length,0);
  assert.equal(fs.readFileSync(path.join(h.temp,'companion/user-note.txt'),'utf8'),'original user note');
  console.log('PASS image reply='+images+', advanced tool='+tool+': current prompt and advertised tools agree; toggle refreshes without generation or QQ sends');
 }finally{await new Promise(r=>server.close(r));await h.close();}
}
