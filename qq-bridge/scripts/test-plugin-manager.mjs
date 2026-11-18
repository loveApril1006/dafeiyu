import assert from 'node:assert/strict';
import {listDshPlugins,setDshPluginEnabled} from '../src/plugin-manager.js';
const bundles = [
  {name:'fixture',availability:'profile',enabled:true,meta:{title:{zh:'测试插件'}},config:{secret:'never expose'}},
  {name:'core',availability:'installation',enabled:true,readOnlyReason:'management-required'},
  {name:'missing',availability:'missing',enabled:false}
];
const plugins = [{entryId:'include:fixture',moduleName:'fixture',enabled:true,fiberPhase:'active',config:{secret:'never expose'}}];
let outcome = 'applied'; let mutations = [];
async function rpc(method,args) {
  if (method === 'pluginManager.listBundles') return bundles;
  if (method === 'pluginManager.listPlugins') return plugins;
  mutations.push({method,args}); return {changed:true,application:outcome};
}
const listed = await listDshPlugins(rpc);
assert.equal(listed.bundles.length,2);
assert.equal(listed.bundles[0].title,'测试插件');
assert(!JSON.stringify(listed).includes('never expose'));
for (const input of [{kind:'bundle',id:'missing',enabled:true},{kind:'bundle',id:'core',enabled:false},{kind:'other',id:'fixture',enabled:true},{kind:'bundle',id:'fixture',enabled:'false'}]) await assert.rejects(() => setDshPluginEnabled(rpc,input));
assert.equal(mutations.length,0);
let result = await setDshPluginEnabled(rpc,{kind:'bundle',id:'fixture',enabled:false});
assert.equal(result.ok,true);
assert.deepEqual(mutations.at(-1),{method:'pluginManager.setBundleEnabled',args:{name:'fixture',enabled:false}});
outcome='restart-required'; result=await setDshPluginEnabled(rpc,{kind:'plugin',id:'include:fixture',enabled:false});
assert.match(result.message,/重启 DSH/);
assert.deepEqual(mutations.at(-1).args,{id:'include:fixture',enabled:false});
outcome='overridden'; assert.equal((await setDshPluginEnabled(rpc,{kind:'bundle',id:'fixture',enabled:true})).ok,false);
outcome='failed'; await assert.rejects(() => setDshPluginEnabled(rpc,{kind:'bundle',id:'fixture',enabled:true}),/未完成/);
console.log('PASS installed-only inventory, config redaction, protected/unknown targets, strict input, native RPC mapping and accurate outcomes');
