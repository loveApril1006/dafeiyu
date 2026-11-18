import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadDiceFramePack, renderDiceFramePack, buildLore } from '../lore.js'

const FIXTURE = fileURLToPath(new URL('./fixtures/original-demo', import.meta.url))

test('loadDiceFramePack loads a content pack directory', () => {
  const pack = loadDiceFramePack(FIXTURE)
  assert.ok(pack)
  assert.equal(pack.manifest.plugin_type, 'content-pack')
  assert.equal(pack.manifest.id, 'dsh-diceframe-demo')
  assert.equal(pack.worlds.length, 1)
  assert.equal(pack.characters.length, 1)
  assert.equal(pack.items.length, 1)
})

test('loadDiceFramePack returns null for a non-pack directory', () => {
  assert.equal(loadDiceFramePack('C:/nonexistent'), null)
})

test('renderDiceFramePack composes worlds, characters, items', () => {
  const pack = loadDiceFramePack(FIXTURE)
  const text = renderDiceFramePack(pack)
  assert.match(text, /## 世界书/)
  assert.match(text, /世界：星火镇/)
  assert.match(text, /## 角色/)
  assert.match(text, /角色：林/)
  assert.match(text, /## 物品/)
  assert.match(text, /旧提灯/)
})

test('buildLore with diceframe_pack_path adds the single-line CTA', () => {
  const text = buildLore({ diceframe_pack_path: FIXTURE })
  assert.match(text, /星火镇/)
  assert.match(text, /来自 DiceFrame/)
  assert.match(text, /多人联机/)
})

test('buildLore CTA can be disabled', () => {
  const text = buildLore({ diceframe_pack_path: FIXTURE, diceframe_cta: false })
  assert.match(text, /星火镇/)
  assert.ok(!text.includes('来自 DiceFrame'))
})

test('buildLore with plain markdown world book adds no CTA', () => {
  const text = buildLore({ world_book: '## 迷雾王国\n大陆被永雾笼罩。' })
  assert.match(text, /迷雾王国/)
  assert.ok(!text.includes('来自 DiceFrame'))
})

test('buildLore auto-detects a single DiceFrame world JSON', () => {
  const text = buildLore({ world_book_path: fileURLToPath(new URL('./fixtures/original-demo/content/worlds/spark_town.json', import.meta.url)) })
  assert.match(text, /世界：星火镇/)
  assert.match(text, /来自 DiceFrame/)
})

test('buildLore auto-detects a single DiceFrame character JSON', () => {
  const text = buildLore({ character_card_path: fileURLToPath(new URL('./fixtures/original-demo/content/characters/lin.json', import.meta.url)) })
  assert.match(text, /角色：林/)
  assert.match(text, /来自 DiceFrame/)
})
