import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createCreativeCore} from '../src/creative-core.js';
import {createQzoneCore} from '../src/qzone/core.js';
import {createQzoneService} from '../src/qzone/service.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qzone-ready-images-'));
const home=path.join(root,'companion/creative-data'),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+k3ioAAAAASUVORK5CYII=','base64');
const put=(name,value)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};
put('companion/creative-data/settings.json',{images:{enabled:true,provider:'comfyui',baseURL:'http://127.0.0.1:8188',model:'fixture'}});
const prompt='matching illustration',imageRows=[];
for(const [scope,generated,text]of [['private:123',true,prompt],['console',true,'unrelated illustration'],['console',false,prompt],['console',true,prompt]]){
 const id=randomUUID();imageRows.push({id,scope,generated,prompt:text,filename:id+'.png',mime:'image/png'});put('companion/creative-data/images/'+id+'.png',png);
}
put('companion/creative-data/gallery.json',imageRows);
put('companion/creative-data/image-jobs.json',[{id:randomUUID(),scope:'console',state:'uncertain',prompt:'old unresolved request'}]);
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const oldJobs=digest(path.join(home,'image-jobs.json'));
const creative=createCreativeCore({root,harden:false});let paidCalls=0,clock=Date.UTC(2026,9,27,2),drafts=0;const sent=[];
creative.action=()=>{paidCalls++;return new Promise(()=>{});};
const service=createQzoneService({root,getDsh:()=>({model:'fixture'}),getCreative:()=>({core:creative}),dependencies:{harden:false,model:async()=>JSON.stringify({text:'mock post '+(++drafts),imagePrompt:prompt}),checkPublisher:async()=>{},publish:async value=>{sent.push(value);return {tid:'fixture-'+sent.length};},core:{now:()=>clock}}});
try{
 assert.equal(creative.readyImage(prompt,'console').file,path.join(home,'images',imageRows[3].filename));
 assert.equal(creative.readyImage('not found','console'),null);
 await service.core.configure({revision:0,enabled:true,autoWrite:true,autoPublish:true,withImages:true,minGapHours:1,dailyGenerations:20,dailyPublishes:20});
 await service.core.generate();assert(sent[0].imageFile);assert.equal(service.status().imagePolicy,'ready-only');
 put('companion/creative-data/gallery.json',imageRows.slice(0,3));clock+=3600000;
 await Promise.race([service.core.generate(),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Text publication waited for image generation')),1000);timer.unref();})]);
 assert.equal(sent.length,2);assert.equal(sent[1].imageFile,undefined);assert.match(service.status().posts[0].imageDecision,/不等待生图/);
 assert.equal(paidCalls,0);assert.equal(digest(path.join(home,'image-jobs.json')),oldJobs);
 assert.equal(imageRows.slice(0,3).every(row=>fs.existsSync(path.join(home,'images',row.filename))),true);
 console.log('PASS real creative lookup: only matching generated console images reused; private/unrelated/imported images excluded; unresolved job untouched; missing image publishes text without waiting or generating.');
}finally{await service.close();await creative.close();}

const legacyRoot=path.join(root,'legacy'),id=randomUUID();
const settings={enabled:true,autoWrite:true,autoPublish:true,withImages:true,minGapHours:1,dailyGenerations:20,dailyPublishes:20};
fs.mkdirSync(path.join(legacyRoot,'companion/qzone-data'),{recursive:true});
fs.writeFileSync(path.join(legacyRoot,'companion/qzone-data/settings.json'),JSON.stringify(settings));
fs.writeFileSync(path.join(legacyRoot,'companion/qzone-data/journal.json'),JSON.stringify({rows:[{id,state:'draft',text:'legacy draft',requiresImage:true,imageFile:'missing.png'}],lastError:'old image failure'}));
let legacySent;
const legacy=createQzoneCore({root:legacyRoot,harden:false,now:()=>clock,publish:async value=>{legacySent=value;return {tid:'legacy-fixture'};}});
try{
 await legacy.publishDraft(id);assert.equal(legacySent.imageFile,undefined);assert.equal(legacy.status().posts[0].state,'published');assert.equal(legacy.status().posts[0].imageUrl,undefined);assert.equal(legacy.status().lastError,'');
 await assert.rejects(()=>legacy.publishDraft(id),/不会重发/);
 console.log('PASS legacy image-required draft with missing file publishes text once; stale image error cleared; duplicate-send guard preserved.');
}finally{await legacy.close();}

const aborter=new AbortController();let cancelledPosts=0;
const cancelled=createQzoneCore({root:path.join(root,'cancelled'),harden:false,model:async()=>JSON.stringify({text:'cancel fixture',imagePrompt:prompt}),getReadyImage:()=>{aborter.abort(Error('user cancelled'));return png;},publish:async()=>{cancelledPosts++;return {tid:'must-not-publish'};}});
try{
 await cancelled.configure({revision:0,enabled:true,autoWrite:true,autoPublish:true,withImages:true});
 await assert.rejects(()=>cancelled.generate({},aborter.signal),/user cancelled/);assert.equal(cancelledPosts,0);assert.equal(cancelled.status().posts[0].state,'interrupted');
 console.log('PASS cancellation during image lookup stops the whole task; text fallback does not bypass stop.');
}finally{await cancelled.close();assert(root.startsWith(path.join(os.tmpdir(),'qzone-ready-images-')));fs.rmSync(root,{recursive:true,force:true});}
