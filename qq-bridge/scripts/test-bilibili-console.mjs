import assert from 'node:assert/strict';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const calls=[];
const h=await bridgeHarness({globals:{callBilibiliConsole:async(root,action,args)=>{calls.push({action,args});return {ok:true,config:{autoRun:false},loggedIn:false};},callNativePondConsole:async(root,method,requestPath,body)=>({status:200,data:{ok:true,method,requestPath,body}})}});
const server=h.startConsoleServer();
await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
const url='http://127.0.0.1:'+server.address().port+'/api/bilibili';
try{
  const headers={'X-Console-Token':'fixture-console-token','Content-Type':'application/json'};
  assert.equal((await fetch(url)).status,401);
  const good=await fetch(url,{headers});assert.equal(good.status,200);assert.equal((await good.json()).loggedIn,false);assert.equal(calls.length,1);
  const agent=await fetch(url,{headers:{...headers,'X-Agent-Token':'anything','X-Agent-Call':'1'}});assert.equal(agent.status,403);assert.equal(calls.length,1);
  const foreign=await fetch(url,{method:'POST',headers:{...headers,Origin:'https://foreign.example'},body:JSON.stringify({action:'login-start'})});assert.equal(foreign.status,403);assert.equal(calls.length,1);
  const save=await fetch(url,{method:'POST',headers,body:JSON.stringify({action:'config',args:{keywords:'开源'}})});assert.equal(save.status,200);assert.equal(calls[1].action,'config');assert.equal(calls[1].args.keywords,'开源');
  const native=url.replace('/api/bilibili','/api/bili-pond/pond');
  assert.equal((await fetch(native)).status,401);
  assert.equal((await fetch(native,{headers:{...headers,'X-Agent-Token':'anything','X-Agent-Call':'1'}})).status,403);
  const nativeReply=await fetch(native,{headers});assert.equal(nativeReply.status,200);assert.equal((await nativeReply.json()).requestPath,'/api/bili-pond/pond');
  console.log('PASS Bilibili console: real bridge token, agent isolation, origin check and config proxy. No external calls.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await h.close();}
