import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createConversationMemory} from '../src/conversation-memory.js';
import {createOceanMemory} from '../src/ocean-memory.js';
import {createOceanContinuity} from '../src/ocean-continuity.js';

function lab(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ocean-continuity-state-'));
  let clock=Date.UTC(2026,9,28,2),role={sourceName:'测试卡片',selfName:'青柚',sourceText:'我叫青柚，习惯先听人说完。',revision:'one'};
  let history,ocean,continuity;
  function open() {
    history=createConversationMemory(path.join(root,'memory.sqlite'));
    ocean=createOceanMemory({database:history.database,now:()=>clock,getRole:()=>role});
    history.setEvidencePolicy((key,row)=>ocean.evidenceAllowed(key,row));
    continuity=createOceanContinuity({ocean,getRole:()=>role,getHistory:()=>history,now:()=>clock,
      getEmotion:()=>({mood:'平静'}),getState:()=>({unread:[]}),
      redact:value=>value.replaceAll('fixture-secret','[已隐藏]')});
  }
  open();
  const env={root,get history(){return history;},get ocean(){return ocean;},
    get continuity(){return continuity;},now:()=>clock,tick:ms=>clock+=ms,
    setRole:value=>role={...role,...value},reopen:()=>{history.close();open();}};
  try {return fn(env);} finally {
    history.close();const resolved=path.resolve(root);
    assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(resolved,{recursive:true,force:true});
  }
}

test('read-only continuity uses the current card and only this chat, survives restart, and stays within prompt budget',()=>lab(env=>{
  const key='private:123';
  env.history.append(key,{messageId:'one',sender:'阿明',userId:'123',text:'我们刚才讨论了茶。',time:env.now()});
  env.history.append('group:456',{messageId:'other',sender:'其他群',text:'跨群秘密不能进入快照',time:env.now()});
  env.ocean.upsert(key,{sourceKey:'todo',kind:'thought',title:'核对周末安排',body:'先确认时间，不要自动联系别人。',stamp:env.now()});
  const before=env.ocean.db.prepare('SELECT count(*) n,sum(version) versions FROM ocean_nodes').get();
  const first=env.continuity.snapshot(key);assert.equal(first.identity.name,'青柚');assert.equal(first.revision,'one');
  assert.equal(first.recent.length,1);assert.equal(first.pending.length,1);
  assert(!JSON.stringify(first).includes('跨群秘密'));assert.deepEqual(env.ocean.db.prepare('SELECT count(*) n,sum(version) versions FROM ocean_nodes').get(),before);
  for(const cap of [0,50,179,180,240,400,800,1800]) assert(env.continuity.context(key,{maxChars:cap}).length<=cap);
  assert.equal(env.continuity.context(key,{maxChars:50}),'');
  assert(env.continuity.context(key,{maxChars:1200}).includes('核对周末安排'));
  env.setRole({selfName:'小蓝',sourceText:'我现在叫小蓝。',revision:'two'});
  const changed=env.continuity.snapshot(key);assert.equal(changed.identity.name,'小蓝');assert.equal(changed.revision,'two');
  assert(!env.continuity.context(key,{maxChars:800}).includes('青柚'));
  env.reopen();assert.equal(env.continuity.snapshot(key).identity.name,'小蓝');
  assert.equal(env.continuity.snapshot(key).recent[0].text,'我们刚才讨论了茶。');
  env.setRole({selfName:null,sourceText:'正文只写了一个自由角色。',revision:'three'});
  assert.equal(env.continuity.snapshot(key).identity.name,null,'card filename became a character name');
  assert.throws(()=>env.continuity.snapshot('console'),/有效/);
}));

test('memos are scoped versioned main memories; diaries stay subjective and completion never sends anything',()=>lab(env=>{
  const key='private:123',memo=env.continuity.saveMemo(key,{kind:'commitment',title:'周末约定',body:'确认后再讨论出发时间 fixture-secret',dueAt:env.now()-1});
  assert.equal(memo.kind,'commitment');assert.equal(memo.version,1);assert.equal(memo.overdue,true);
  assert(memo.body.includes('[已隐藏]'));assert.equal(env.continuity.snapshot(key).pending[0].id,memo.id);
  assert.equal(env.continuity.listMemos('group:456').items.length,0);
  assert.throws(()=>env.continuity.updateMemo('group:456',memo.id,{version:1,state:'completed'}),/不属于/);
  env.setRole({sourceName:'另一个人格',revision:'other'});assert.equal(env.continuity.listMemos(key).items.length,0);
  env.setRole({sourceName:'测试卡片',revision:'one'});
  assert.throws(()=>env.continuity.updateMemo(key,memo.id,{version:0,state:'completed'}),/刷新/);
  const done=env.continuity.updateMemo(key,memo.id,{version:1,state:'completed'});
  assert.equal(done.version,2);assert.equal(done.state,'completed');assert.equal(done.overdue,false);
  assert.equal(env.continuity.snapshot(key).pending.length,0);
  assert.equal(env.ocean.detail(key,memo.nodeId).memory.stage,'archive');
  const reopened=env.continuity.updateMemo(key,memo.id,{version:2,state:'pending'});
  assert.equal(reopened.version,3);assert.notEqual(env.ocean.detail(key,memo.nodeId).memory.stage,'archive');
  const cancelled=env.continuity.updateMemo(key,memo.id,{version:3,state:'cancelled'});
  assert.equal(cancelled.state,'cancelled');assert.equal(env.continuity.snapshot(key).pending.length,0);
  assert.equal(env.ocean.detail(key,memo.nodeId).memory.stage,'archive');
  const activeAgain=env.continuity.updateMemo(key,memo.id,{version:4,state:'pending'});
  assert.equal(activeAgain.state,'pending');assert.equal(env.continuity.snapshot(key).pending.length,1);
  assert.notEqual(env.ocean.detail(key,memo.nodeId).memory.stage,'archive');
  const diary=env.continuity.saveMemo(key,{kind:'diary',title:'今天的感受',body:'我猜自己今天有些紧张。'});
  assert.equal(diary.confidence,'inferred');assert.equal(env.ocean.detail(key,diary.nodeId).memory.confidence,'inferred');
  assert(!env.continuity.snapshot(key).pending.some(row=>row.id===diary.id));
  const note=env.continuity.saveMemo(key,{kind:'note',body:'管理员备忘，不代表事实已经发生。'});
  const page=env.continuity.listMemos(key,{limit:2});assert.equal(page.items.length,2);assert(page.next);
  assert.equal(env.continuity.listMemos(key,{after:page.next,limit:2}).items[0].id,note.id);
  env.reopen();assert.equal(env.continuity.listMemos(key).items.length,3);
  assert.equal(env.continuity.listMemos(key,{kind:'diary'}).items[0].confidence,'inferred');
  assert.throws(()=>env.continuity.saveMemo(key,{body:'x',dueAt:'not-date'}),/时间/);
  assert.throws(()=>env.continuity.saveMemo(key,{body:'x',kind:'fact'}),/类型/);
  assert.throws(()=>env.continuity.saveMemo(key,{body:'x',apiKey:'bad'}),/未知/);
}));

test('emoji clipping preserves well-formed UTF-16 across identity, memo, snapshot and prompt budgets',()=>lab(env=>{
  const key='private:123',emoji='🐟';
  env.setRole({selfName:'鱼'.repeat(99)+emoji+'名字',sourceText:'卡'.repeat(2399)+emoji+'尾部',revision:'版'.repeat(11)+emoji});
  env.history.append(key,{messageId:'emoji',sender:'人'.repeat(79)+emoji,userId:'123',
    text:'话'.repeat(149)+emoji+'内容'.repeat(160),time:env.now()});
  const memo=env.continuity.saveMemo(key,{kind:'commitment',title:'题'.repeat(119)+emoji,
    body:'约'.repeat(179)+emoji+'补充'.repeat(4000)});
  function strings(value) {
    if(typeof value==='string') return [value];
    if(Array.isArray(value)) return value.flatMap(strings);
    if(value&&typeof value==='object') return Object.values(value).flatMap(strings);
    return [];
  }
  assert(strings(memo).every(value=>value.isWellFormed()));
  const state=env.continuity.snapshot(key);assert(strings(state).every(value=>value.isWellFormed()));
  assert.equal(state.identity.name.length,99);assert.equal(state.identity.description.length,2399);
  assert(memo.title.length<=120);assert(memo.body.length<=6000);
  for(const cap of [180,260,400,600,800,1200,1800,3000]) {
    const prompt=env.continuity.context(key,{maxChars:cap});
    assert(prompt.length<=cap);assert(prompt.isWellFormed());
    if(prompt) {
      const json=JSON.parse(prompt.split('\n')[2]);
      assert(strings(json).every(value=>value.isWellFormed()),'JSON concealed a split surrogate');
    }
  }
  const derived=env.continuity.saveMemo(key,{body:'文'.repeat(59)+emoji+'尾部'});
  assert.equal(derived.title.length,59);assert(derived.title.isWellFormed());
}));

test('manual edits and deletions are respected, withdrawn evidence cannot return through continuity, and overdue is only a label',()=>lab(env=>{
  const key='group:456',memo=env.continuity.saveMemo(key,{kind:'note',title:'原始笔记',body:'原始正文'});
  env.ocean.mutate(key,memo.nodeId,'edit',{title:'手工修正',body:'管理员在星图中的修正'});
  assert.equal(env.continuity.listMemos(key).items[0].body,'管理员在星图中的修正');
  assert.throws(()=>env.continuity.updateMemo(key,memo.id,{version:1,body:'不允许覆盖'}),/手工修改/);
  const removed=env.continuity.updateMemo(key,memo.id,{version:1,deleted:true});assert(removed.deleted);
  assert.equal(env.continuity.listMemos(key).items.length,0);
  assert.throws(()=>env.continuity.updateMemo(key,memo.id,{version:2,body:'不得复活'}),/不存在/);
  const second=env.continuity.saveMemo(key,{kind:'commitment',body:'尚未完成的旧约定',dueAt:env.now()+1000});
  env.tick(2000);const pending=env.continuity.listMemos(key).items[0];assert(pending.overdue);assert.equal(pending.state,'pending');
  env.ocean.mutate(key,second.nodeId,'delete');assert.equal(env.continuity.snapshot(key).pending.length,0);
  assert.throws(()=>env.continuity.updateMemo(key,second.id,{version:1,state:'pending'}),/不会重新创建/);
  env.history.append(key,{messageId:'source',sender:'阿明',userId:'123',text:'这条原文已经撤回记忆',time:env.now()});
  const row=env.history.scan(0,20)[0],fact=env.ocean.upsert(key,{sourceKey:'source-fact',kind:'fact',body:'这条原文已经撤回记忆'});
  env.ocean.db.prepare('INSERT INTO ocean_refs VALUES(?,?)').run(fact.id,row.id);
  env.ocean.mutate(key,fact.id,'delete');assert.equal(env.continuity.snapshot(key).recent.length,0);
  const old=env.ocean.upsert(key,{sourceKey:'expired',kind:'thought',title:'过期待办',body:'已经失效',stamp:env.now(),meta:{expiresAt:env.now()-1}});
  assert.equal(env.continuity.snapshot(key).pending.length,0);
  assert(env.ocean.detail(key,old.id).memory.body.includes('失效'));
  env.reopen();assert.equal(env.continuity.listMemos(key).items.length,0);
  assert.equal(env.continuity.snapshot(key).pending.length,0);
}));
