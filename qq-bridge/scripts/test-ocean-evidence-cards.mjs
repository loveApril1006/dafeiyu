import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildEvidenceCard,renderEvidenceCard,preferenceClaim} from '../src/ocean-summary.js';
import {createConversationMemory} from '../src/conversation-memory.js';
import {createOceanMemory} from '../src/ocean-memory.js';

test('extractive cards keep late negations, results and unfinished agreements without inventing claims',()=>{
  const rows=[{id:1,stamp:1,user_id:'123',sender:'阿明',body:'普通聊天。'.repeat(200),direction:'user'},
    {id:2,stamp:2,user_id:'123',sender:'阿明',body:'我没有答应周六出门。最后取消了聚会。下次提醒我核对时间。',direction:'user'}];
  const card=buildEvidenceCard(rows,{limit:380});assert(card.summary.includes('没有答应'));
  assert(card.summary.includes('取消了聚会'));assert(card.sourceIds.includes(2));
  assert(renderEvidenceCard(card,260).length<=260);assert.equal(card.kind,'evidence-extract');
  assert.equal(preferenceClaim('以前我喜欢咖啡'),null);
  assert.equal(preferenceClaim('我喜欢咖啡吗'),null);
  assert.equal(preferenceClaim('我不喜欢咖啡').value,'dislike');
});

test('trace readback drops edited anchors and changed records, and an empty new prompt clears old activation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ocean-trace-'));
  const history=createConversationMemory(path.join(root,'history.sqlite'));
  const ocean=createOceanMemory({database:history.database,getRole:()=>({sourceName:'鱼',revision:'one'})});
  try{
    const key='private:123',anchor=ocean.upsert(key,{kind:'person',sourceKey:'anchor',subject:'99887',title:'已撤回称呼',body:'人物线索'}),event=ocean.upsert(key,{kind:'event',sourceKey:'event',title:'相关经历',body:'这是一条有出处的旧经历'});
    ocean.link(key,anchor.id,event.id,'participated');ocean.recall(key,'99887');assert(ocean.inspectRecall(key).hits.some(h=>h.via));
    ocean.mutate(key,anchor.id,'edit',{title:'新称呼',body:'已更新'});
    assert(!JSON.stringify(ocean.inspectRecall(key)).includes('已撤回称呼'));
    ocean.recall(key,'相关经历');assert(ocean.inspectRecall(key).hits.length);
    ocean.notePromptEvidence(key,'相关经历',[]);assert.equal(ocean.inspectRecall(key).hits.length,0);
    ocean.recall(key,'相关经历');ocean.mutate(key,event.id,'edit',{title:'新经历',body:'新内容'});assert.equal(ocean.inspectRecall(key).hits.length,0);
  }finally{history.close();assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
});

test('cards, current corrections and inspectable retrieval preserve archives, identity boundaries and original messages',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ocean-cards-'));
  let clock=Date.now(),role={sourceName:'测试人格',sourceText:'你叫青柚',revision:'a'};
  const history=createConversationMemory(path.join(root,'history.sqlite'));
  const ocean=createOceanMemory({database:history.database,getRole:()=>role,now:()=>clock});history.subscribe(m=>ocean.observeMessage(m));
  try{
    const key='private:123';history.append(key,{messageId:'one',userId:'123',sender:'阿明',text:'我喜欢咖啡',time:clock});
    clock+=1000;history.append(key,{messageId:'two',userId:'123',sender:'阿明',text:'我现在不喜欢咖啡',time:clock});
    const facts=ocean.list(key,{kind:'fact'}).items,old=facts.find(r=>r.title==='我喜欢咖啡');
    assert(old.supersededBy);assert(!ocean.recall(key,'咖啡').includes('"summary":"我喜欢咖啡"'));
    assert(ocean.recall(key,'以前的咖啡偏好',{includeArchive:true}).includes('validTo'));
    const event=ocean.list(key,{kind:'event'}).items[0],detail=ocean.detail(key,event.id);
    assert(detail.memory.card.points.some(p=>p.text.includes('不喜欢')));assert.equal(detail.evidence.length,2);
    const before=history.database.prepare('SELECT count(*) n FROM messages').get().n;
    const preview=ocean.inspectRecall(key,{query:'咖啡'});assert(preview.preview);assert(preview.hits.some(r=>r.title.includes('不喜欢')));
    assert.equal(ocean.inspectRecall('group:456').hits.length,0);assert.equal(history.database.prepare('SELECT count(*) n FROM messages').get().n,before);
    role={...role,sourceText:'你叫小蓝',revision:'b'};assert.equal(ocean.inspectRecall(key).hits.length,0);
    ocean.mutate(key,facts.find(r=>r.title.includes('不喜欢')).id,'delete');assert(!ocean.recall(key,'咖啡').includes('不喜欢咖啡'));
    assert.equal(history.stats().messages,2);
  }finally{history.close();assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
});
