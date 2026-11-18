// Synthetic local profiles only. No model calls, live account or stored user memory.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {performance} from 'node:perf_hooks';
import {createEmotionalCompanion} from '../src/emotional-companion.js';
const phase=process.argv[2]||'current';if(!/^[a-z-]+$/.test(phase))throw Error('Invalid benchmark label');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'emotion-economy-')),e=createEmotionalCompanion({file:path.join(root,'profiles.sqlite'),now:()=>Date.parse('2026-10-27T04:00:00Z'),role:()=> 'fixture-role',ownerQQ:()=> '10001',random:()=>0.9});
try{
 for(let i=0;i<200;i++)e.update('private:10001','','remember',{text:'我喜欢第'+i+'种测试口味，'+ '柔软甜香的小面包。'.repeat(24)});
 for(let i=0;i<5;i++)e.snapshot('private:10001','','月球地质');
 const started=performance.now();for(let i=0;i<100;i++)e.snapshot('private:10001','','月球地质');const snapshotMs=performance.now()-started;
 const result={synthetic:true,iterations:100,snapshotMs:Math.round(snapshotMs*100)/100,unrelatedContextChars:e.context('private:10001','','月球地质').length,matchingContextChars:e.context('private:10001','','测试口味面包').length,storedMemories:e.snapshot('private:10001').memories.length,modelCalls:0};
 fs.mkdirSync('state/system-audit',{recursive:true});fs.writeFileSync('state/system-audit/emotion-benchmark-'+phase+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{e.close();assertTemp();fs.rmSync(root,{recursive:true,force:true});}
function assertTemp(){if(!root.startsWith(path.join(os.tmpdir(),'emotion-economy-')))throw Error('Unsafe temporary path');}
