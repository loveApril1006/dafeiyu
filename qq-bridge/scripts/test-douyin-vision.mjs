import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
import {createVisionChecks,visionTestImageUrl} from '../companion/douyin-vision.mjs';
import {completionBlocks} from '../companion/douyin-model.mjs';

// Decode the actual embedded probe: a corrupt or wrong-color image must fail
// locally, without contacting a model or depending on an integrations asset.
const imageBlock=completionBlocks([{role:'user',content:[{type:'image_url',image_url:{url:visionTestImageUrl}}]}]).find(b=>b.type==='image');
assert.equal(imageBlock.mediaType,'image/png');
const png=Buffer.from(imageBlock.data,'base64');
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
const chunks=[];
function crc32(data){let crc=0xffffffff;for(const byte of data){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
for(let offset=8;offset<png.length;){
  const size=png.readUInt32BE(offset),end=offset+8+size,type=png.toString('ascii',offset+4,offset+8);
  assert(end+4<=png.length,'complete PNG chunk');
  assert.equal(crc32(png.subarray(offset+4,end)),png.readUInt32BE(end),'valid PNG checksum');
  chunks.push({type,data:png.subarray(offset+8,end)});offset=end+4;
}
const header=chunks.find(c=>c.type==='IHDR').data,width=header.readUInt32BE(0),height=header.readUInt32BE(4);
assert.equal(width,64);assert.equal(height,64);assert.deepEqual([...header.subarray(8)],[8,2,0,0,0]);
const pixels=inflateSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data))),stride=1+width*3;
assert.equal(pixels.length,height*stride);assert.equal(chunks.at(-1).type,'IEND');
for(let y=0;y<height;y++){
  assert.equal(pixels[y*stride],0,'unfiltered scanline');
  for(let x=0;x<width;x++)assert.deepEqual([...pixels.subarray(y*stride+1+x*3,y*stride+4+x*3)],[255,0,0],'red probe pixel');
}

const home=fs.mkdtempSync(path.join(os.tmpdir(),'douyin-vision-')),at=Date.parse('2026-10-26T00:00:00Z');
let now=at;
const checks=createVisionChecks(home,{now:()=>now}),a={provider:'one',model:'visual-a'},b={provider:'one',model:'visual-b'},c={provider:'two',model:'visual-a'};
const record=(model,passed=true)=>({...model,passed,at:new Date(now).toISOString(),reply:'fixture image check'});
try{
  assert.equal(checks.get(a).reason,'untested');assert(!fs.existsSync(path.join(home,'vision-check.json')));
  fs.writeFileSync(path.join(home,'vision-check.json'),JSON.stringify(record(a)));assert(checks.get(a).valid,'original single-model records remain valid');
  checks.save(record(b));assert(checks.get(a).valid);assert(checks.get(b).valid);assert(!checks.get(c).valid,'same ID at another provider is separate');
  checks.save(record(c,false));assert.equal(checks.get(c).reason,'failed');assert(checks.get(a).valid);assert(checks.get(b).valid);
  checks.save(record(a,false));assert.equal(checks.get(a).reason,'failed');assert(checks.get(b).valid);
  now=at+7*86400000;assert.equal(checks.get(b).reason,'expired');assert(!checks.get(b).valid);
  now=at-1;assert(!checks.get(b).valid,'future records cannot pass');now=at;
  checks.save(record(a));checks.save(record(a));assert.equal(JSON.parse(fs.readFileSync(path.join(home,'vision-check.json'))).records.filter(r=>r.model===a.model&&r.provider===a.provider).length,1);
  checks.clear(a);assert.equal(checks.get(a).reason,'untested');assert(checks.get(b).valid,'changing one model key only invalidates that model test');
  fs.writeFileSync(path.join(home,'vision-check.json'),'broken-fixture');assert.throws(()=>checks.get(a),/无法读取/);assert.throws(()=>checks.save(record(a)),/无法读取/);assert.equal(fs.readFileSync(path.join(home,'vision-check.json'),'utf8'),'broken-fixture','damaged history is preserved');
  console.log('PASS embedded PNG decoding/checksums/red pixels and model image conversion; independent per-model/per-provider tests, legacy migration, failure retention, seven-day expiry, future records, duplicate replacement and corruption rejection; no model calls.');
}finally{assert(path.resolve(home).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(home,{recursive:true,force:true});}
