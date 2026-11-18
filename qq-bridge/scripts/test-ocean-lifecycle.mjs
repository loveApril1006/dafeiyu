import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createConversationMemory} from '../src/conversation-memory.js';
import {createOceanMemory} from '../src/ocean-memory.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ocean-lifecycle-'));
let time=Date.UTC(2026,9,29),role='atlas-test';
const history=createConversationMemory(path.join(root,'history.sqlite'));
const ocean=createOceanMemory({database:history.database,now:()=>time,getRole:()=>({sourceName:role})});
const key='private:123';
try{
 const start=ocean.lifecycle(key);assert.equal(start.cursor,0);assert.deepEqual(start.events,[]);
 const make=(kind='event',pinned=false)=>ocean.create(key,{kind,pinned,title:'隔离测试',body:'不应出现在陨星回执中的记忆正文'});
 const archived=make();ocean.mutate(key,archived.id,'archive');ocean.mutate(key,archived.id,'archive');
 let feed=ocean.lifecycle(key,{after:0});assert.equal(feed.events.length,1);assert.equal(feed.events[0].reason,'archived');
 assert(!JSON.stringify(feed).includes('记忆正文'));assert(!JSON.stringify(feed).includes('隔离测试'));
 ocean.mutate(key,archived.id,'restore');assert.equal(ocean.detail(key,archived.id).memory.stage,'active');
 ocean.mutate(key,archived.id,'archive');ocean.mutate(key,archived.id,'delete');
 assert.equal(ocean.lifecycle(key,{after:feed.cursor}).events.length,2);
 assert.throws(()=>ocean.mutate(key,archived.id,'delete'),/不存在/);
 const rollback=make();assert.throws(()=>ocean.transaction(()=>{ocean.mutate(key,rollback.id,'delete');throw Error('rollback');}),/rollback/);
 assert(ocean.detail(key,rollback.id));assert(!ocean.lifecycle(key,{after:0}).events.some(e=>e.node===rollback.id));
 const faded=make(),locked=make('fact',true),persona=ocean.persona(key);
 time+=200*86400000;ocean.maintain({limit:200});ocean.maintain({limit:200});ocean.maintain({limit:200});
 const fades=ocean.lifecycle(key,{after:0}).events.filter(e=>e.reason==='faded');assert(fades.some(e=>e.node===faded.id));assert.equal(fades.filter(e=>e.node===faded.id).length,1);assert(!fades.some(e=>[locked.id,persona.id].includes(e.node)));
 assert.equal(ocean.detail(key,faded.id).memory.stage,'archive');assert.equal(ocean.detail(key,locked.id).memory.stage,'core');
 assert.deepEqual(ocean.lifecycle('group:456',{after:0}).events,[]);
 role='another-persona';assert.deepEqual(ocean.lifecycle(key,{after:0}).events,[]);role='atlas-test';
 assert.deepEqual(ocean.lifecycle(key,{after:0,expectedRole:'another-persona'}).events,[]);
 assert.deepEqual(ocean.lifecycle(key).events,[],'opening a page replayed historic losses');
 assert.throws(()=>ocean.lifecycle('invalid',{after:0}),/有效/);assert.throws(()=>ocean.lifecycle(key,{after:-1}),/游标/);
 const before=ocean.lifecycle(key).cursor;
 for(let i=0;i<70;i++)ocean.mutate(key,make('fact').id,'delete');
 const first=ocean.lifecycle(key,{after:before}),second=ocean.lifecycle(key,{after:first.cursor});assert.equal(first.events.length,64);assert(first.more);assert.equal(second.events.length,6);assert(!second.more);assert.equal(new Set([...first.events,...second.events].map(e=>e.seq)).size,70);
 for(let i=0;i<8;i++)make('fact');ocean.create('group:456',{kind:'fact',title:'其他会话独有标题',body:'其他会话独有正文'});const versions=ocean.db.prepare('SELECT id,version,reinforced_at FROM ocean_nodes ORDER BY seq').all(),overview=ocean.panorama(key),facts=overview.groups.find(g=>g.kind==='fact');assert.equal(facts.examples.length,3);assert(facts.count>facts.examples.length);assert(!JSON.stringify(overview).includes('其他会话独有'));assert(!overview.groups.some(g=>['persona','subpersona'].includes(g.kind)));assert(!overview.groups.flatMap(g=>g.examples).some(e=>e.id===archived.id));assert.deepEqual(ocean.db.prepare('SELECT id,version,reinforced_at FROM ocean_nodes ORDER BY seq').all(),versions,'overview strengthened or changed memories');role='empty-role';assert.deepEqual(ocean.panorama(key).groups,[]);role='atlas-test';assert.throws(()=>ocean.panorama('invalid'),/有效/);
 console.log('PASS lifecycle: actual changes, transaction rollback, stable cursors, dedup, paging, scope/persona isolation, protected core, recoverable archive and no content in receipts.');
}finally{
 history.close();const target=path.resolve(root);assert(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('ocean-lifecycle-'));fs.rmSync(target,{recursive:true,force:true});
}
