import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConversationMemory } from '../src/conversation-memory.js';
import { createOceanMemory } from '../src/ocean-memory.js';
import { createOceanRetrieval } from '../src/ocean-retrieval.js';

function lab(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-ranked-'));
  let role = 'test-role', clock = Date.UTC(2026, 9, 28, 8), blocked = new Set();
  const history = createConversationMemory(path.join(root, 'memory.sqlite'));
  const ocean = createOceanMemory({ database: history.database, getRole: () => ({ sourceName: role }), now: () => clock });
  const retrieval = createOceanRetrieval({ db: history.database, scope: key => [key, role], view: ocean.view, now: () => clock, allowRow: (row, memory, options) => !blocked.has(row.id) && (!memory.supersededBy || options.includeArchive) });
  try { return fn({ ocean, history, retrieval, setRole: value => role = value, tick: value => clock += value, now: () => clock, block: id => blocked.add(id) }); }
  finally { history.close(); assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(root, { recursive: true, force: true }); }
}

test('ranked SQL candidates include a relevant new record beyond an old insertion-order prefix', () => lab(({ ocean, retrieval, now }) => {
  const key = 'group:123';
  ocean.transaction(() => {
    for (let i = 0; i < 350; i++) ocean.upsert(key, { sourceKey: 'common:' + i, kind: 'fact', title: '共同话题', body: '共同话题里的无关旧资料编号' + i, stamp: now() - 100000 - i, importance: .9 });
  });
  const desired = ocean.upsert(key, { sourceKey: 'new-target', kind: 'fact', title: '共同话题里答应修好显卡', body: '共同话题：答应帮阿明修好显卡，周日完成。', stamp: now(), importance: .5 });
  const start = performance.now(), result = retrieval.search(key, '共同话题，答应修好显卡', { budget: 2400 });
  assert(result.candidates.some(hit => hit.row.id === desired.id));
  assert.equal(result.candidates[0].row.id, desired.id);
  assert(result.candidates.every(hit => hit.memory.id === hit.row.id && hit.reasons.length));
  assert(result.candidates.length <= 24);
  console.log(JSON.stringify({ rankedCandidates: 351, searchMs: Math.round(performance.now() - start) }));
}));

test('local concept, bounded spelling fallback and explicit QQ lookup are labelled and explainable', () => lab(({ ocean, retrieval, now }) => {
  const key = 'private:123';
  const sleep = ocean.upsert(key, { sourceKey: 'sleep', kind: 'fact', title: '夜间情况', body: '阿明那晚失眠，后来出门散步。', stamp: now() });
  const tea = ocean.upsert(key, { sourceKey: 'tea', kind: 'fact', title: '饮品', body: '喜欢乌龙茶。', stamp: now() });
  const identity = ocean.upsert(key, { sourceKey: 'identity', kind: 'fact', title: '生日约定', body: '月底提醒生日。', subject: '10001234', stamp: now() });
  const synonym = retrieval.search(key, '睡不着', { budget: 2000 });
  const hit = synonym.candidates.find(item => item.row.id === sleep.id);
  assert.equal(hit.stage, 'synonym'); assert(hit.reasons.join('').includes('睡不着→失眠'));
  const fuzzy = retrieval.search(key, '乌笼茶', { budget: 1600 }).candidates.find(item => item.row.id === tea.id);
  assert.equal(fuzzy.stage, 'fuzzy'); assert(fuzzy.reasons.join('').includes('需核对'));
  const qq = retrieval.search(key, 'QQ 10001234', { budget: 1600 }).candidates.find(item => item.row.id === identity.id);
  assert(qq.reasons.join('').includes('明确 QQ 身份'));
  assert(retrieval.search(key, '乌笼茶', { budget: 300 }).candidates.every(item => item.stage !== 'fuzzy'));
  assert.equal(retrieval.search(key, '！！！ ...', { budget: 2400 }).candidates.length, 0);
  assert.equal(retrieval.search(key, '失眠', { budget: 99 }).candidates.length, 0);
}));

test('scope, role, exclusions, source opt-outs and retracted anchors constrain every retrieval stage', () => lab(({ ocean, retrieval, now, setRole, block }) => {
  const key = 'group:123', other = 'private:123';
  const local = ocean.upsert(key, { sourceKey: 'local', kind: 'fact', title: '失眠', body: '本群独有失眠记录。', stamp: now() });
  const privateRow = ocean.upsert(other, { sourceKey: 'private', kind: 'fact', title: '失眠', body: '不能出现在群里的私聊秘密。', stamp: now() });
  const person = ocean.upsert(key, { sourceKey: 'person:12345', kind: 'person', subject: '12345', title: '阿明', body: '本聊天的人物，QQ 12345。', stamp: now() });
  const hidden = ocean.upsert(key, { sourceKey: 'hidden-source', kind: 'experience', title: '资料内容', body: '已关闭的来源。', stamp: now() });
  ocean.link(key, local.id, hidden.id, 'related'); ocean.link(key, person.id, hidden.id, 'participated'); block(hidden.id);
  let result = retrieval.search(key, '失眠', { budget: 2400 });
  assert(result.candidates.some(hit => hit.row.id === local.id));
  assert(!result.candidates.some(hit => [privateRow.id, hidden.id].includes(hit.row.id)));
  assert(!retrieval.search(key, '失眠', { excludeIds: [local.id], budget: 2400 }).candidates.some(hit => hit.row.id === local.id));
  setRole('other-role'); assert.equal(retrieval.search(key, '失眠', { budget: 2400 }).candidates.length, 0); setRole('test-role');
  ocean.mutate(key, local.id, 'delete');
  assert(!retrieval.search(key, '失眠', { budget: 2400 }).candidates.some(hit => hit.row.id === local.id));
  ocean.mutate(key, person.id, 'delete');
  assert.equal(retrieval.search(key, '阿明', { budget: 2400 }).candidates.length, 0);
}));

test('one-hop association has real provenance, stays bounded and does not write or reinforce memories', () => lab(({ ocean, history, retrieval, now }) => {
  const key = 'group:123', person = ocean.upsert(key, { sourceKey: 'person:12345', kind: 'person', subject: '12345', title: '阿明', body: '本聊天的人物，QQ 12345。', stamp: now() });
  for (let i = 0; i < 40; i++) {
    const row = ocean.upsert(key, { sourceKey: 'event:' + i, kind: 'event', title: '一次共同活动' + i, body: '活动结果保留在原文。', stamp: now() - i });
    ocean.link(key, person.id, row.id, 'participated');
  }
  const before = history.database.prepare('SELECT count(*) n,sum(version) versions,sum(reinforced_at) reinforced FROM ocean_nodes').get();
  const result = retrieval.search(key, '阿明', { budget: 2400, limit: 8 });
  assert(result.candidates.length > 0 && result.candidates.length <= 6);
  assert(result.candidates.every(hit => hit.stage === 'relation' && hit.via.id === person.id && hit.via.relation === 'participated'));
  assert.deepEqual(history.database.prepare('SELECT count(*) n,sum(version) versions,sum(reinforced_at) reinforced FROM ocean_nodes').get(), before);
  assert.equal(retrieval.search(key, '阿明', { budget: 300 }).candidates.length, 0);
  const long = retrieval.search(key, '你还记得'.repeat(200) + '阿明', { budget: 2400, limit: 500 });
  assert(long.terms.length <= 32); assert(long.candidates.length <= 60);
  assert.throws(() => retrieval.search('../other', '阿明'), /范围/);
}));
