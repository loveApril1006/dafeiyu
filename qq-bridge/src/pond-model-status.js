import fs from 'node:fs';
import path from 'node:path';
import {NodeApiClient,unwrap} from './dsh-client.js';

// Read-only projection: a previous run error must not stand in for live login state.
export async function pondModelAccountState(root,{rpc}={}){
  const config=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
  const api=rpc?null:new NodeApiClient(config.dsh.baseUrl,10000,{});
  try{
    const state=await (rpc?rpc('account.getState',{}):api.callUnary('account.getState',{}).then(r=>unwrap(r,'account/getState')));
    return {ok:true,sharedAccount:true,account:state.status==='credential-stored'?'signed-in':'signed-out',checkedAt:new Date().toISOString()};
  }catch{return {ok:true,sharedAccount:true,account:'unknown',checkedAt:new Date().toISOString(),message:'暂时无法读取模型账号状态，请确认聊天引擎正在运行。'};}
}
