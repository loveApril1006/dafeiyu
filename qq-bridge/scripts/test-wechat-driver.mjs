import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
import http from 'node:http';
import {openWechatStore} from '../src/wechat/store.js';import {createDesktopDriver} from '../src/wechat/desktop-driver.js';import {transportSettings,locateWechatData} from '../src/wechat/transport-settings.js';
import {createWechatService} from '../src/wechat/service.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-driver-')),store=openWechatStore(root,{harden:false});let launches=0,kills=0,neverReady=false;
const source=path.join(root,'xwechat_files');fs.mkdirSync(path.join(source,'fixture-account/db_storage/message'),{recursive:true});fs.writeFileSync(path.join(source,'fixture-account/db_storage/message/message_0.db'),'metadata fixture');
for(const name of ['wechat-db-runtime','wechat-desktop-runtime']){fs.mkdirSync(path.join(root,'integrations',name,'Scripts'),{recursive:true});fs.writeFileSync(path.join(root,'integrations',name,'Scripts/python.exe'),'fixture not executable');fs.writeFileSync(path.join(root,'integrations',name,'installed.json'),'{}');}
function spawnImpl(exe,args){launches++;assert(exe.startsWith(root));const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new Writable({write(bytes,_encoding,done){const row=JSON.parse(String(bytes));queueMicrotask(()=>child.stdout.write(JSON.stringify({id:row.id,ok:true,result:row.op==='poll'?{messages:[],cursor:'cursor'}:{ok:true}})+'\n'));done();}});child.kill=()=>{kills++;queueMicrotask(()=>child.emit('close',0));};queueMicrotask(()=>{if(args.includes('--probe')){child.stdout.write(JSON.stringify({diagnostic:{passed:true,metadataOnly:true,reason:'fixture source ready'}})+'\n');child.emit('close',0);}else if(!neverReady)child.stdout.write(JSON.stringify({event:'ready',databaseReady:true})+'\n');});return child;}
const driver=createDesktopDriver({root,store,spawnImpl,locateData:()=>({root:source,accounts:['fixture-account']})});
try{
 assert.equal(driver.status().workerRunning,false);assert.equal(launches,0);assert.equal(driver.status().transport.mode,'dbocr');
 assert.equal(locateWechatData(source).accounts.length,1);assert.throws(()=>transportSettings({dataRoot:'\\\\server\\share'}),/本机磁盘/);assert.throws(()=>transportSettings({account:'../account'}),/账号/);assert.throws(()=>transportSettings({pollSeconds:1}),/超出/);assert.throws(()=>transportSettings({maxCacheMB:32}),/超出/);
 await driver.updateTransport({dataRoot:source,pollSeconds:15,maxCacheMB:128});await driver.updateTargets([{name:'测试好友',kind:'private'}]);assert.equal(launches,0);assert.equal(fs.existsSync(path.join(store.home,'database-cache')),false);
 await driver.diagnose();assert.equal(driver.status().diagnostic.metadataOnly,true);assert.equal(driver.status().databaseReady,false);assert.equal(driver.status().ready,true);assert.equal(fs.existsSync(path.join(store.home,'database-cache')),false);
 await driver.open();assert.equal(driver.status().databaseReady,true);const result=await driver.poll('',new AbortController().signal);assert.equal(result.delayMs,15000);await assert.rejects(()=>driver.updateTransport({mode:'uia'}),/先停止/);await driver.stop();assert.equal(driver.status().workerRunning,false);assert.equal(driver.status().databaseReady,false);
 neverReady=true;const opening=driver.open();opening.catch(()=>{});await driver.stop();await assert.rejects(()=>opening,/未就绪|停止/);assert.equal(driver.status().workerRunning,false);assert(kills>=2);
 console.log('PASS transport settings, metadata-only diagnostics, no off-state process/cache, independent runtime selection, polling interval, start/stop and cancellation during initialization; fake subprocesses only');
}finally{await driver.close();assert(root.startsWith(path.join(os.tmpdir(),'wechat-driver-')));fs.rmSync(root,{recursive:true,force:true});}

// The emergency stop route must remain usable while the enable request is waiting
// for key initialization. No production files, WeChat window or process is used.
const serviceRoot=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-start-stop-'));let workerRunning=false,rejectOpen,notifyOpening;
const didOpen=new Promise(resolve=>{notifyOpening=resolve;});
const startupDriver={
 status:()=>({ready:true,workerRunning,targets:[],diagnostic:{passed:true}}),
 open:()=>{workerRunning=true;return new Promise((_resolve,reject)=>{rejectOpen=reject;notifyOpening();});},
 stop:async()=>{workerRunning=false;rejectOpen?.(Error('fixture initialization cancelled'));rejectOpen=null;},
 close:async()=>{},poll:async()=>{throw Error('Initialization must be stopped before polling');}
};
const service=createWechatService({root:serviceRoot,getDsh:()=>({model:'fixture'}),dependencies:{driver:startupDriver,harden:false,model:async()=>{throw Error('No real model');}}});
const server=http.createServer(async(req,res)=>{if(!await service.handle(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
try{
 const enable=fetch(base+'/api/wechat/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:0,enabled:true})});
 await didOpen;const stopped=await fetch(base+'/api/wechat/stop',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 assert.equal(stopped.status,200);const final=await stopped.json();assert.equal(final.config.enabled,false);assert.equal(final.connection.workerRunning,false);
 assert.equal((await enable).status,400);assert.equal(service.status().config.enabled,false);
 console.log('PASS HTTP stop during an in-flight enable request: initialization cancelled and enabled=false persisted; no live WeChat access');
}finally{await service.close();await new Promise(resolve=>server.close(resolve));assert(serviceRoot.startsWith(path.join(os.tmpdir(),'wechat-start-stop-')));fs.rmSync(serviceRoot,{recursive:true,force:true});}
