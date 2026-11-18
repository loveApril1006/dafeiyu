import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {callDouyinConsole} from '../src/douyin-console.js';
const original=globalThis.fetch;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoge-douyin-control-'));
fs.mkdirSync(path.join(root,'companion'));fs.writeFileSync(path.join(root,'companion/companion-token'),'fixture-only');
try {
 let requests=[];
 globalThis.fetch=async(url,options)=>{requests.push({url,options});return {json:async()=>({service:'xiaoge-douyin',ok:false,closing:true})};};
 await assert.rejects(()=>callDouyinConsole(root,'status'),error=>error.status===503&&error.code==='SERVICE_STOPPING');
 assert.equal(requests.length,1,'A stopping service must not spawn a duplicate server');
 requests=[];globalThis.fetch=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>String(url).endsWith('/health')?{service:'xiaoge-douyin',ok:true}:{ok:true,watch:{running:false}}};};
 assert.equal((await callDouyinConsole(root,'status')).watch.running,false);
 assert.deepEqual(JSON.parse(requests.at(-1).options.body),{action:'status',args:{}});
 console.log('PASS stopping Douyin rejects new work without duplicate startup; healthy read routing preserved');
}finally{globalThis.fetch=original;assert(root.startsWith(path.join(os.tmpdir(),'xiaoge-douyin-control-')));fs.rmSync(root,{recursive:true,force:true});}
