// Real hosted native HTTP handlers; failing local child, no model/B站/QQ calls.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createNativePond} from '../companion/bilibili-native.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-host-'));
fs.mkdirSync(path.join(root,'companion'));
fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({dsh:{baseUrl:'http://127.0.0.1:1',provider:'fixture',model:'fixture'}}));
let app;
try{
 app=createNativePond({root:path.join(root,'companion'),legacy:{request:async()=>({})},runtimePath:path.resolve('integrations/bilibili-runtime'),loadCatalog:async()=>[],checkLogin:async()=>({loggedIn:true})});
 const file=path.join(app.home,'config.json'),config=JSON.parse(fs.readFileSync(file,'utf8'));
 // Node refuses -X before executing the Python script; an intentional local
 // reader startup failure exercises cleanup without reaching any network.
 fs.writeFileSync(file,JSON.stringify({...config,pythonPath:process.execPath,autoRun:false,guardOn:false}));
 fs.writeFileSync(path.join(app.home,'bili_credential.json'),'{}');
 const id='12345678-1234-1234-1234-123456789012';
 await assert.rejects(app.request('POST','/api/bili-pond/watch',{id:'../../bad',bvid:'BV1234567890'}));
 const start=await app.request('POST','/api/bili-pond/watch',{id,bvid:'BV1234567890',page:1,remember:false});assert.equal(start.started,true,JSON.stringify(start));
 const busy=await app.request('POST','/api/bili-pond/watch',{id:'12345678-1234-1234-1234-123456789013',bvid:'BV1234567891'});assert.equal(busy.busy,true);
 let result;
 for(let i=0;i<60;i++){result=await app.request('GET','/api/bili-pond/shared/status?id='+id);if(result.state==='failed')break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(result.state,'failed');assert(result.events.some(e=>e.stage==='reading'));assert(result.events.some(e=>e.stage==='failed'));
 const status=await app.request('GET','/api/bili-pond/status');assert.equal(status.running,false);assert.equal(status.finalizing,false);
 assert(!fs.existsSync(path.join(app.home,'history.jsonl')));assert(!fs.existsSync(path.join(app.home,'out/shared',id+'.md')));
 const reused=await app.request('POST','/api/bili-pond/watch',{id,bvid:'BV1234567890'});assert.equal(reused.reused,true,'same task UUID cannot blindly replay');
 console.log('PASS real native watch/status handlers: exact task validation, shared lock acquired before async reader, busy refusal, child failure cleanup, durable log and no false history/result, UUID replay guard');
}finally{app?.close();assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
