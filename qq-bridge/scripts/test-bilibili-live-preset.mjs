// Real isolated DSH with a local fake LLM. The prompt reaches zero model tools, never an external provider.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import net from 'node:net';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';
import {NodeApiClient,unwrap} from '../src/dsh-client.js';import {completeDshText} from '../src/dsh-completion.js';
const src=path.resolve('.'),lab=fs.mkdtempSync(path.join(path.resolve('../maintenance/bilibili-live-v1'),'dsh-fixture-')),home=path.join(lab,'engine-home');
const write=(n,v)=>{const p=path.join(lab,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2));};
function copy(a,b){if(fs.statSync(a).isDirectory()){fs.mkdirSync(b,{recursive:true});for(const n of fs.readdirSync(a))copy(path.join(a,n),path.join(b,n));}else{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b);}}
for(const n of ['src','dsh','plugins','roles','scripts/setup-dsh.mjs','scripts/build-agent-preset-patches.mjs','package.json'])copy(path.join(src,n),path.join(lab,'qq-bridge',n));
fs.symlinkSync(path.join(src,'node_modules'),path.join(lab,'qq-bridge/node_modules'),'junction');
let requests=[];const fake=http.createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);requests.push(body);assert.equal(req.url,'/v1/chat/completions');
 res.writeHead(200,{'content-type':'text/event-stream'});const frame=(delta,finish_reason=null)=>'data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1700000000,model:'fixture-live-model',choices:[{index:0,delta,finish_reason}]})+'\n\n';res.write(frame({role:'assistant',content:'隔离直播模型测试回复。'}));res.write(frame({},'stop'));res.end('data: [DONE]\n\n');});await new Promise(r=>fake.listen(0,'127.0.0.1',r));
write('qq-bridge/config.json',{dsh:{baseUrl:'http://127.0.0.1:1'},consolePort:1,ownerQQ:null,allow:{groups:[],private:[]},allowAllWhenEmpty:false,socialV2:{voice:{enabled:false}},role:{maxInjectChars:8000}});
write('engine-home/profiles/web/package.json',{private:true,dependencies:{},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}});
write('engine-home/profiles/web/cordis.patch.yml',`- id: llm-pi-ai\n  name: '@deepseek-ai/dsh-llm-pi-ai'\n  config:\n    providers:\n      live-fixture:\n        displayName: Live Fixture\n        api: openai-completions\n        baseURL: http://127.0.0.1:${fake.address().port}/v1\n        apiKeyEnv: XIAOGE_FIXTURE_KEY\n        models:\n          - id: fixture-live-model\n            input: [text]\n`);
const node=path.resolve('../SnowLuma/node.exe'),engine=path.resolve('../engine/DeepSeek Harness.exe'),env={...process.env,DSH_HOME:home,DSH_PROFILE:'web',QQ_BRIDGE_SKIP_DSH_INSTALL:'1',XIAOGE_FIXTURE_KEY:'local-fixture-only'};
const setup=spawnSync(node,[path.join(lab,'qq-bridge/scripts/setup-dsh.mjs'),'web'],{env,encoding:'utf8',windowsHide:true});assert.equal(setup.status,0,setup.stderr);
const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const fd=fs.openSync(path.join(lab,'engine.log'),'w');const child=spawn(engine,['--expose-internals',path.resolve('../engine/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'),'--profile','web','--host','127.0.0.1','--port',String(port),'--no-open'],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},cwd:lab,windowsHide:true,stdio:['ignore',fd,fd]});
let passed=false;
try{
 process.env.DSH_HOME=home;process.env.DSH_PROFILE='web';let api,presets,lastError,lastKeys;
 for(let i=0;i<60;i++){try{api=new NodeApiClient('http://127.0.0.1:'+port,3000,{});const value=unwrap(await api.callUnary('agentPresets.list',{}),'agentPresets/list');lastKeys=Object.keys(value||{});presets=value.presets;if(presets)break;}catch(e){lastError=e.message;}await new Promise(r=>setTimeout(r,500));}
 assert(presets?.some(p=>p.id==='bilibili-live'&&!p.broken),'Live preset missing: '+String(lastError||lastKeys));
 // Preset RPCs register before appReady mounts the mux route. Wait for an
 // authenticated upgrade, without submitting any prompt or changing live state.
 let muxReady=false;
 for(let i=0;i<30&&!muxReady;i++){
  const cookie=await api.ensureAuth();
  muxReady=await new Promise(resolve=>{
   const socket=new WebSocket('ws://127.0.0.1:'+port+'/api/remote.mux',{headers:{cookie}});
   let settled=false;const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);try{socket.close();}catch{}resolve(ok);};
   const timer=setTimeout(()=>finish(false),1000);socket.addEventListener('open',()=>finish(true));socket.addEventListener('error',()=>finish(false));socket.addEventListener('close',()=>finish(false));
  });
  if(!muxReady)await new Promise(r=>setTimeout(r,100));
 }
 assert(muxReady,'Isolated host did not finish mounting its authenticated stream route');
 const cwd=path.join(lab,'live-workspace');fs.mkdirSync(cwd);
 const answer=await completeDshText({baseUrl:'http://127.0.0.1:'+port,cwd,preset:'bilibili-live',api,timeoutMs:30000,content:[{type:'text',text:'这是隔离测试，不执行任何操作。请输出一句话。'}],selectModel:async(client,id)=>{unwrap(await client.callUnary('session.selectModel',{sessionId:id,provider:'live-fixture',model:'fixture-live-model'}),'session/selectModel');}});
 assert(answer.includes('隔离直播模型测试回复'));assert(requests.length>0);for(const body of requests)assert(!body.tools||body.tools.length===0,'Live model must have zero tools');
 console.log('PASS actual isolated DSH mounts dedicated live preset and completes a local fake-LLM turn with zero offered tools; no paid inference, QQ tools, private context or external writes');
 passed=true;
}finally{
 if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited;}
 fs.closeSync(fd);fake.closeAllConnections();await new Promise(r=>fake.close(r));
 if(passed){const parent=path.resolve('../maintenance/bilibili-live-v1')+path.sep;assert(path.resolve(lab).startsWith(parent));assert(!fs.lstatSync(lab).isSymbolicLink());fs.rmSync(lab,{recursive:true,force:true});}
}
