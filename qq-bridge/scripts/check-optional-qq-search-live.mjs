import fs from 'node:fs';
import assert from 'node:assert/strict';
import {optionalModsearch} from '../src/optional-modsearch.js';
import {webSearch} from '../src/web-search.js';
const token=fs.readFileSync('state/console-token','utf8').trim();
async function toggle(enabled){
 const response=await fetch('http://127.0.0.1:3100/api/dsh/plugins/toggle',{method:'POST',headers:{'X-Console-Token':token,'Content-Type':'application/json',Origin:'http://127.0.0.1:3100'},body:JSON.stringify({kind:'bundle',id:'@liustack/modsearch',enabled}),signal:AbortSignal.timeout(40000)});
 const value=await response.json();assert.equal(value.ok,true);return value;
}
assert.equal(optionalModsearch(),null,'Start with plugin off');
try {
 const start=await toggle(true);assert(optionalModsearch());console.log('Real backend switch enabled ModSearch: '+start.application);
 const result=await webSearch('DeepSeek Harness official GitHub',{root:process.cwd()});
 assert.equal(result.provider,'modsearch');assert(result.results.length>0);assert(result.results.length<=5);
 fs.mkdirSync('state/optional-dsh-check',{recursive:true});
 fs.writeFileSync('state/optional-dsh-check/search.json',JSON.stringify({provider:result.provider,resultCount:result.results.length,query:result.query},null,2));
 console.log('PASS public query through the QQ search adapter: '+result.results.length+' bounded results');
} finally {await toggle(false);assert.equal(optionalModsearch(),null);console.log('ModSearch returned to OFF; original QQ search selected');}
