import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {test} from 'node:test';
import {createConversationMemory} from '../src/conversation-memory.js';import {createOceanMemory} from '../src/ocean-memory.js';import {createFishHomeVitals} from '../src/fish-home-vitals.js';import {createFishHome} from '../src/fish-home.js';
const HOUR=3600000;
function lab(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'home-vitals-'));let clock=Date.parse('2026-10-29T04:00:00Z'),role={sourceName:'鱼',selfName:'鱼',revision:'one'};const history=createConversationMemory(path.join(root,'history.sqlite')),ocean=createOceanMemory({database:history.database,getRole:()=>role,now:()=>clock});try{fn({ocean,now:()=>clock,advance:ms=>clock+=ms,role:()=>role,setRole:r=>role=r});}finally{history.close();assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}}
const value=(v,id)=>v.snapshot().values.find(r=>r.id===id).value;
test('five durable states evolve with elapsed activity, not read count, and sleep recovers energy',()=>lab(({ocean,now,advance})=>{
 const v=createFishHomeVitals({ocean,now}),before=v.snapshot(),meta=()=>ocean.db.prepare('SELECT count(*) n FROM ocean_meta').get().n;
 const count=meta();for(let i=0;i<200;i++)assert.deepEqual(v.snapshot(),before);assert.equal(meta(),count);assert.equal(ocean.stats().total,0);
 v.tick({kind:'work',until:now()+HOUR});advance(HOUR);assert.equal(value(v,'energy'),66);const saved=v.snapshot();assert.deepEqual(createFishHomeVitals({ocean,now}).snapshot(),saved);
 v.tick({kind:'sleep',until:now()+HOUR});advance(HOUR);assert.equal(value(v,'energy'),86);for(let i=0;i<10;i++)assert.equal(value(v,'energy'),86);
 assert.equal(ocean.stats().total,0,'numeric states must not create narrative memories');
}));
test('signals deduplicate, have bounded effects, isolate personas and remain finite after offline time or clock rollback',()=>lab(({ocean,now,advance,setRole})=>{
 const v=createFishHomeVitals({ocean,now});assert(v.event('chat','one'));const after=v.snapshot();for(let i=0;i<30;i++)assert.equal(v.event('chat','one'),false);assert.deepEqual(v.snapshot(),after);
 for(let i=0;i<100;i++)v.event('home','food:'+i,{kind:'feed'});assert(value(v,'energy')<=88);assert(value(v,'talk')>0);
 const count=ocean.db.prepare('SELECT count(*) n FROM ocean_home_signals').get().n;assert.equal(count,101);setRole({sourceName:'另一条鱼',revision:'two'});assert.equal(value(v,'energy'),76);setRole({sourceName:'鱼',selfName:'鱼',revision:'one'});assert.equal(value(v,'energy'),after.values[0].value+12);
 advance(30*24*HOUR);assert(v.snapshot().values.every(r=>Number.isFinite(r.value)&&r.value>=0&&r.value<=100));advance(-60*24*HOUR);assert(v.snapshot().values.every(r=>Number.isFinite(r.value)&&r.value>=0&&r.value<=100));assert.equal(ocean.stats().total,0);
}));
test('low energy chooses bed sleep, real work takes priority, and sleep/wake stay virtual and scoped',()=>lab(({ocean,now,advance,role})=>{
 let live=null;const home=createFishHome({ocean,getOwner:()=>123,getRole:role,getRuntime:()=>live,now});home.vitals.tick({kind:'work',until:now()+6*HOUR});advance(6*HOUR);assert.equal(home.state().activity.kind,'sleep');assert.equal(home.state().vitals.values[0].value,16);live={kind:'chat',source:'qq',title:'正在聊天'};assert.equal(home.state().activity.kind,'chat');live=null;
 const s=home.state(),call={role:s.role,roleRevision:s.roleRevision,kind:'activity',activity:'sleep',requestId:'sleep-request-12345678'};home.act(call);home.act(call);assert.equal(home.state().journal.length,1);assert.equal(home.state().activity.kind,'sleep');advance(HOUR);assert(home.state().vitals.values[0].value>=36);advance(3000);home.act({...call,activity:'idle',requestId:'wake-request-123456789'});assert.equal(home.state().activity.kind,'idle');assert.equal(ocean.list('group:456',{kind:'experience'}).items.length,0);assert.equal(home.presence().vitals.values.length,5);assert(!Object.hasOwn(home.presence(),'journal'));
}));
