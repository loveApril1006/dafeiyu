// Read-only deployment smoke check. Never prompts a model or sends platform messages.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const token=fs.readFileSync('state/console-token','utf8').trim();
const headers={'X-Console-Token':token,'content-type':'application/json',Origin:'http://127.0.0.1:3100'};
async function request(path,body){const response=await fetch('http://127.0.0.1:3100'+path,{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);const result=await response.json();if(Object.hasOwn(result,'ok'))assert.equal(result.ok,true);return result;}
const status=await request('/api/status');assert.equal(status.dshReady,true);
const features=(await request('/api/dsh/plugins')).bundles.filter(row=>row.feature);
assert.equal(features.length,4);assert(features.every(row=>row.enabled===false));
const companion=await(await fetch('http://127.0.0.1:17867/health',{signal:AbortSignal.timeout(5000)})).json();
assert.equal(companion.version,'economy-1');assert.equal(companion.activeModelRequests,0);
const bili=await request('/api/bili-pond/status');
const douyin=await request('/api/douyin',{action:'status',args:{}});
const before=JSON.parse(fs.readFileSync('state/performance-audit/pre-deploy-state.json','utf8'));
assert.equal(bili.config.autoRun,before.biliAuto);assert.equal(!!douyin.watch?.running,before.douyinRunning);
const result={at:new Date().toISOString(),consoleOnline:true,dshReady:status.dshReady,optionalPluginsOff:features.length,
 companionVersion:companion.version,activeModelRequests:companion.activeModelRequests,biliConfigPreserved:true,douyinConfigPreserved:true};
fs.writeFileSync('state/performance-audit/live-check.json',JSON.stringify(result,null,2));
console.log('PASS live robot: bridge, companion, Bilibili and Douyin online; optional states and automatic settings preserved; no model calls');
