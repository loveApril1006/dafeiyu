// Actual hot-load smoke test. Never prompts a model or sends images/messages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getDshConnection} from '../../desktop-pet/dsh-connection.mjs';
import {unwrap} from '../src/dsh-client.js';
const names=['dsh-mnemon','dsh-context','dsh-vision-router','@liustack/modsearch'];
const ids={'dsh-mnemon':'mnemon','dsh-context':'dsh-context','dsh-vision-router':'vision-router','@liustack/modsearch':'modsearch'};
const {api,baseUrl,cookie}=await getDshConnection();
const rpc=async(method,args={})=>unwrap(await api.callUnary(method,args),method);
const isEntry=(row,id)=>row.entryId===id || row.entryId==='include:'+id;
const before=await rpc('pluginManager.listBundles');
const beforeSettings=await rpc('settings.describe');
const beforeWeb=beforeSettings.namespaces.find(row=>row.ns==='web')?.value;
assert(names.every(name=>before.find(row=>row.name===name)?.enabled===false),'Smoke test requires all optional plugins initially off');
const report=[];
try {
 for(const name of names){
  console.log('Checking '+name);
  const start=await rpc('pluginManager.setBundleEnabled',{name,enabled:true});
  assert(['applied','restart-required'].includes(start.application),JSON.stringify(start.error));
  let entries=[];
  for(let i=0;i<20;i++){
   entries=await rpc('pluginManager.listPlugins');
   if(entries.some(row=>isEntry(row,ids[name])&&row.fiberPhase==='active'))break;
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  const matches=entries.filter(row=>isEntry(row,ids[name])||row.moduleName===name);
  console.log(JSON.stringify({name,entries:matches.map(row=>({id:row.entryId,phase:row.fiberPhase,enabled:row.enabled}))}));
  assert(matches.some(row=>row.fiberPhase==='active'),name+' failed to activate');
  if(name==='dsh-mnemon'){
   const settings=await rpc('settings.describe');
   const ns=settings.namespaces.find(row=>row.ns==='mnemon');
   assert(ns,'Mnemon settings missing');
   assert.equal(ns.value.storageScope,'workspace');assert.equal(ns.value.runtimeUserScope,'storage');
   assert.equal(ns.value.idleReview.enabled,false);assert.equal(ns.value.syncEnabled,false);
   assert.equal(ns.value.skills?.evolution ?? false,false);
  }
  if(name==='dsh-vision-router'){
   // DVR adapts the newer Host ConfigEditor into its own local settings route.
   const response=await fetch(baseUrl+'/_dsh/vision-router/local-settings',{headers:{cookie},signal:AbortSignal.timeout(10000)});
   assert.equal(response.status,200);const data=await response.json();assert.equal(data.ok,true);
   const ns=data.value;
   assert.equal(ns.value.desktopScreenshot,false);assert.equal(ns.value.structuredVisionBootstrap,false);
   assert.equal(ns.value.visionDepthMaxCalls,2);assert.equal(ns.value.visionTurnBudgetMs,60000);
   assert.equal(ns.value.backgroundBenchmarking,'off');
  }
  if(name==='@liustack/modsearch'){
   const settings=await rpc('settings.describe');
   assert.equal(settings.namespaces.find(row=>row.ns==='web')?.value.searchProvider,'modsearch');
  }
  const stop=await rpc('pluginManager.setBundleEnabled',{name,enabled:false});
  assert(['applied','restart-required'].includes(stop.application));
  const remaining=await rpc('pluginManager.listPlugins');
  assert(!remaining.some(row=>(isEntry(row,ids[name])||row.moduleName===name)&&row.fiberPhase==='active'),name+' still active after stop');
  if(name==='@liustack/modsearch'){
   const settings=await rpc('settings.describe');assert.deepEqual(settings.namespaces.find(row=>row.ns==='web')?.value,beforeWeb);
  }
  report.push({name,start:start.application,stop:stop.application,active:true,unloaded:true});
 }
} finally {
 for(const name of names){
  const rows=await rpc('pluginManager.listBundles');
  if(rows.find(row=>row.name===name)?.enabled) await rpc('pluginManager.setBundleEnabled',{name,enabled:false});
 }
 fs.mkdirSync('state/optional-dsh-check',{recursive:true});
 fs.writeFileSync('state/optional-dsh-check/lifecycle.json',JSON.stringify(report,null,2));
}
console.log('PASS real activation/unload checked; native restart notices preserved; all four returned to OFF');
