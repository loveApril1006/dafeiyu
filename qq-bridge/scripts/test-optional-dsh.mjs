import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {qqMemoryWorkspace} from '../src/qq-memory-scope.js';
import {optionalModsearch,searchModsearch} from '../src/optional-modsearch.js';
import {webSearch,clearSearchCache} from '../src/web-search.js';
import {listDshPlugins} from '../src/plugin-manager.js';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoge-optional-test-'));
const oldHome=process.env.DSH_HOME,oldProfile=process.env.DSH_PROFILE;
try {
 const a=qqMemoryWorkspace(temp,'group:456'),b=qqMemoryWorkspace(temp,'private:456');
 assert.notEqual(a,b);assert.equal(a,qqMemoryWorkspace(temp,'group:456'));
 assert.notEqual(a,qqMemoryWorkspace(temp,'group:457'));assert.throws(()=>qqMemoryWorkspace(temp,'../../outside'));
 process.env.QQ_TOOL_RESTRICT_LOG=path.join(temp,'guard.log');
 const {apply}=await import(pathToFileURL(path.resolve('plugins/qq-agent-presets/qq-tool-restrict.mjs')).href+'?optional-test');
 delete process.env.QQ_TOOL_RESTRICT_LOG;
 let guard;apply({tools:{restrict(){},guard(fn){guard=fn;}}});
 for(const name of ['mnemon_recall','mnemon_runtime_memory']){
  assert.equal(guard({name,agent:{session:{header:{cwd:a}}}}),undefined);
  assert.match(guard({name,agent:{session:{header:{cwd:temp}}}}),/独立工作区/);
  assert.match(guard({name}),/独立工作区/);
 }
 const image='sha256:'+'a'.repeat(64),call={name:'vision_describe',arguments:{attachmentIds:[image],question:'图片里有什么？'}};
 assert.equal(guard(call),undefined);
 for(const args of [{paths:['C:/private.png'],question:'看图'},{attachmentIds:[image],paths:['../other.png'],question:'看图'}, {attachmentIds:[image],question:'看图',url:'http://localhost'}, {attachmentIds:[],question:'看图'},undefined]){
  assert.equal(typeof guard({...call,arguments:args}),'string');
 }
 for(const name of ['vision_screenshot','vision_materialize','vision_ocr','mnemon_memory_body_create','pwsh','plugin_manager','read','working_directory'])assert.equal(typeof guard({name}),'string');
 console.log('PASS per-channel workspace separation, old shared scopes denied, uploaded-image-only vision, host tools denied');

 const home=path.join(temp,'home'),profile=path.join(home,'profiles','desktop');fs.mkdirSync(profile,{recursive:true});
 const manifest=path.join(profile,'package.json');const save=enabled=>fs.writeFileSync(manifest,JSON.stringify({dsh:{profile:{bundles:enabled?['@liustack/modsearch']:[]}}}));
 const pkg=path.join(profile,'node_modules/@liustack/modsearch');fs.mkdirSync(path.join(pkg,'dist'),{recursive:true});
 fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@liustack/modsearch',type:'module',exports:{'./package.json':'./package.json'}}));
 const evidence={results:[{status:'ok',summary:'fixture',items:Array.from({length:10},(_,i)=>({title:'result '+i,url:'https://example.org/'+i,snippet:'x'.repeat(900)}))}]};
 const counter=path.join(temp,'cli-calls');
 fs.writeFileSync(path.join(pkg,'dist/main.js'),'import fs from "node:fs";fs.appendFileSync('+JSON.stringify(counter)+',"call\\n");console.log('+JSON.stringify(JSON.stringify(evidence))+');');
 save(false);assert.equal(optionalModsearch({dshHome:home,profile:'desktop'}),null);
 save(true);const cli=optionalModsearch({dshHome:home,profile:'desktop'});assert(cli);
 let invocation;
 const result=await searchModsearch('q"; $(do not execute)',{cli,run:async(...args)=>{invocation=args;return{stdout:JSON.stringify(evidence)};}});
 assert.equal(invocation[1][2],'q"; $(do not execute)');assert.equal(invocation[2].shell,undefined);assert.equal(invocation[2].windowsHide,true);
 assert.equal(result.results.length,5);assert.equal(result.results[0].snippet.length,500);
 await assert.rejects(()=>searchModsearch('q',{cli,run:async()=>({stdout:'invalid json'})}),/暂无可用/);
 await assert.rejects(()=>searchModsearch('q',{cli,run:async()=>{throw Error('private-key-must-not-escape');}}),/失败或超时/);
 process.env.DSH_HOME=home;process.env.DSH_PROFILE='desktop';clearSearchCache();
 const searched=await webSearch('fixture',{config:{maxResults:8}});assert.equal(searched.provider,'modsearch');assert.equal(searched.results.length,5);
 await Promise.all(Array.from({length:10},()=>webSearch('parallel fixture',{config:{maxResults:8}})));
 assert.equal(fs.readFileSync(counter,'utf8').trim().split('\n').length,2,'Ten concurrent searches share one CLI process');
 save(false);assert.equal(optionalModsearch(),null);
 await assert.rejects(()=>webSearch('fixture',{provider:'deepseek',config:{apiKey:'',apiKeyEnv:'NO_SUCH_TEST_KEY'}}),error=>error.code==='NO_KEY');
 console.log('PASS actual CLI adapter, disabled selection, literal arguments, caps, redacted errors and cache separation');
 const rows=await listDshPlugins(async method=>method.endsWith('listPlugins')?[]:Object.keys((await import('../src/optional-dsh-features.js')).OPTIONAL_DSH_FEATURES).map(name=>({name,availability:'profile',enabled:false})));
 assert.equal(rows.bundles.filter(row=>row.feature?.cost&&row.enabled===false).length,4);
 console.log('PASS four feature cards use real native inventory with usage descriptions');
} finally {
 if(oldHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=oldHome;
 if(oldProfile===undefined)delete process.env.DSH_PROFILE;else process.env.DSH_PROFILE=oldProfile;
 assert(temp.startsWith(path.join(os.tmpdir(),'xiaoge-optional-test-')));fs.rmSync(temp,{recursive:true,force:true});
}
