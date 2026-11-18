// Optional live integration check: one empty owned session, no prompt, model,
// tool execution or QQ message. The probe session is archived in finally.
import fs from 'node:fs';import path from 'node:path';import {NodeApiClient,unwrap} from '../src/dsh-client.js';import {HARNESS_PRESET} from '../src/harness-control.js';
const cfg=JSON.parse(fs.readFileSync('config.json','utf8')),api=new NodeApiClient(cfg.dsh.baseUrl,15000,{token:cfg.dsh.authToken,tokenExplicit:cfg.dsh.authTokenExplicit});
const base=path.resolve('state/harness-control-audit'),folder=fs.mkdtempSync(path.join(base,'native-probe-'));let sid;
try{
 const created=unwrap(await api.sessions.create({cwd:folder,agentPreset:HARNESS_PRESET}),'probe.create');sid=created.sessionId;
 if(created.agentPreset!==HARNESS_PRESET)throw Error('Probe preset mismatch');
 const selected=unwrap(await api.callUnary('agentPresets.select',{agentId:sid,agentPreset:HARNESS_PRESET}),'probe.pin');
 if(selected!==HARNESS_PRESET)throw Error('Probe pin mismatch');
 const projection=unwrap(await api.callUnary('session/projections',{sessionId:sid}),'probe.projections');
 if(projection?.values?.agentPreset!==HARNESS_PRESET)throw Error('Probe preset projection mismatch');
 let roleDelegateReady=null;try{const card=unwrap(await api.callUnary('agentPresets.read',{agentPreset:'qq-chat-v2'}),'probe.card');roleDelegateReady=String(card.content).includes('qq_harness_task');}catch{}
 console.log(JSON.stringify({nativePresetMounted:true,pinningSupported:true,presetProjectionVerified:true,roleDelegateReady,promptsSent:0,modelCalls:0,qqMessages:0}));
}finally{
 if(sid){try{unwrap(await api.workspace.archiveSession({sessionId:sid}),'probe.archive');}catch{console.log(JSON.stringify({probeArchiveFailed:true}));}}
 if(path.dirname(folder)!==base||!path.basename(folder).startsWith('native-probe-'))throw Error('Probe cleanup path mismatch');fs.rmSync(folder,{recursive:true,force:true});
}
