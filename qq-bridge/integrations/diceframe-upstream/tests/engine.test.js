import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDice,
  rollDice,
  resolveCheck,
  parseWorldBook,
  parseCharacterCard,
  isDiceFrameWorld,
  isDiceFrameCharacter,
  renderDiceFrameWorld,
  renderDiceFrameCharacter,
  renderDiceFrameEntry,
} from '../engine.js'

// ---- dice ----

test('parseDice parses common notation', () => {
  assert.deepEqual(parseDice('3d6'), { count: 3, sides: 6, modifier: 0, keep: 3, keepTop: true, explode: false })
  assert.equal(parseDice('d20').count, 1)
  assert.equal(parseDice('d%').sides, 100)
  assert.equal(parseDice('d100').sides, 100)
  assert.equal(parseDice('2d20kh1').keep, 1)
  assert.equal(parseDice('2d20kh1').keepTop, true)
  assert.equal(parseDice('2d20kl1').keepTop, false)
  assert.equal(parseDice('4d6dl1').keep, 3)
  assert.equal(parseDice('4d6dl1').keepTop, true)
  assert.equal(parseDice('3d6+2').modifier, 2)
  assert.equal(parseDice('3d6-1').modifier, -1)
  assert.equal(parseDice('1d6!').explode, true)
})

test('parseDice rejects garbage', () => {
  assert.equal(parseDice('garbage'), null)
  assert.equal(parseDice(''), null)
  assert.equal(parseDice('3d0'), null)
  assert.equal(parseDice(42), null)
})

test('rollDice sums within bounds', () => {
  for (let i = 0; i < 500; i++) {
    const r = rollDice('2d6')
    assert.ok(r.ok)
    assert.equal(r.rolls.length, 2)
    assert.ok(r.total >= 2 && r.total <= 12, `total ${r.total}`)
  }
})

test('rollDice advantage keeps the highest die', () => {
  for (let i = 0; i < 500; i++) {
    const r = rollDice('2d20kh1')
    assert.ok(r.ok)
    assert.equal(r.rolls.length, 1)
    assert.ok(r.rolls[0] >= 1 && r.rolls[0] <= 20)
    assert.equal(r.total, r.rolls[0])
  }
})

test('rollDice drop lowest keeps the top dice', () => {
  for (let i = 0; i < 500; i++) {
    const r = rollDice('4d6dl1')
    assert.ok(r.ok)
    assert.equal(r.rolls.length, 3)
    assert.equal(r.dropped, 1)
  }
})

test('rollDice exploding stays bounded and legal', () => {
  for (let i = 0; i < 500; i++) {
    const r = rollDice('1d6!')
    assert.ok(r.ok)
    assert.ok(r.total >= 1)
    assert.ok(r.allRolls.length <= 300)
  }
})

test('rollDice modifier applies', () => {
  const r = rollDice('1d20+5')
  assert.ok(r.ok)
  assert.equal(r.total, r.rolls[0] + 5)
})

test('rollDice invalid input returns error, not throw', () => {
  const r = rollDice('hello')
  assert.equal(r.ok, false)
  assert.ok(r.error)
})

// ---- check resolution ----

test('resolveCheck d100: <= difficulty succeeds, crit and fumble take precedence', () => {
  for (let i = 0; i < 2000; i++) {
    const r = resolveCheck({ action: '侦察', expression: 'd100', difficulty: 55 })
    assert.equal(r.ok, true)
    if (r.total === 100) assert.equal(r.outcome, 'fumble')
    else if (r.total <= 5) assert.equal(r.outcome, 'critical-success')
    else if (r.total <= 55) assert.equal(r.outcome, 'success')
    else assert.equal(r.outcome, 'failure')
  }
})

test('resolveCheck d20: natural 20 critical, natural 1 fumble', () => {
  // Force the path by asserting invariants across many rolls.
  let sawCrit = false
  let sawFumble = false
  for (let i = 0; i < 2000; i++) {
    const r = resolveCheck({ action: '攻击', expression: 'd20', difficulty: 12 })
    if (r.rolls[0] === 20) { assert.equal(r.outcome, 'critical-success'); sawCrit = true }
    if (r.rolls[0] === 1) { assert.equal(r.outcome, 'fumble'); sawFumble = true }
  }
  assert.ok(sawCrit && sawFumble, 'should observe both crit and fumble over 2000 rolls')
})

test('resolveCheck invalid difficulty errors', () => {
  const r = resolveCheck({ action: 'x', expression: 'd20', difficulty: 'abc' })
  assert.equal(r.ok, false)
})

test('resolveCheck sum mode', () => {
  const r = resolveCheck({ action: '力量', expression: '3d6', difficulty: 10 })
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'sum')
  assert.equal(typeof r.margin, 'number')
})

// ---- lore parsing ----

test('parseWorldBook splits markdown headings', () => {
  const sections = parseWorldBook('## 王国\n迷雾王国位于大陆北端。\n## 种族\n精灵与矮人并存。')
  assert.equal(sections.length, 2)
  assert.equal(sections[0].title, '王国')
  assert.match(sections[0].body, /迷雾王国/)
  assert.equal(sections[1].title, '种族')
})

test('parseCharacterCard parses key: value lines', () => {
  const fields = parseCharacterCard('姓名: 艾琳\n职业: 游侠\n背景: 边境猎人')
  assert.deepEqual(fields, [
    { key: '姓名', value: '艾琳' },
    { key: '职业', value: '游侠' },
    { key: '背景', value: '边境猎人' },
  ])
})

test('parseCharacterCard continues multi-line values', () => {
  const fields = parseCharacterCard('背景: 出生于边境\n  在迷雾中长大')
  assert.equal(fields.length, 1)
  assert.match(fields[0].value, /迷雾中长大/)
})

// ---- DiceFrame format ----

const WORLD = {
  world_id: 'spark_town_world',
  world_name: '星火镇',
  description: '山顶小镇。',
  world_setting: '镇下有一座古老熔炉。',
  starter_scene: '你在旅店放下行李。',
  starter_lorebook: [
    { id: 'lamp', name: '灯花', type: 'location', keywords: ['灯花'], content: '发光植物。', tier: 'core' },
  ],
}

const CHARACTER = {
  id: 'lin',
  character_name: '林',
  race: '人类',
  class: '巡山人',
  description: '沉默的巡山人。',
  attributes: { str: 12, dex: 14 },
  skills: [{ name: '攀爬', value: 4 }],
  background: '被灯花指引回家。',
  equipment: [{ name: '旧提灯' }],
}

test('isDiceFrameWorld / isDiceFrameCharacter detect by marker field', () => {
  assert.equal(isDiceFrameWorld(WORLD), true)
  assert.equal(isDiceFrameWorld({ name: 'x' }), false)
  assert.equal(isDiceFrameCharacter(CHARACTER), true)
  assert.equal(isDiceFrameCharacter({ name: 'x' }), false)
})

test('renderDiceFrameWorld builds a world section with lorebook', () => {
  const text = renderDiceFrameWorld(WORLD)
  assert.match(text, /世界：星火镇/)
  assert.match(text, /古老熔炉/)
  assert.match(text, /起始场景/)
  assert.match(text, /灯花.*发光植物/s)
})

test('renderDiceFrameCharacter builds a character section', () => {
  const text = renderDiceFrameCharacter(CHARACTER)
  assert.match(text, /角色：林/)
  assert.match(text, /种族 人类 · 职业 巡山人/)
  assert.match(text, /str 12、dex 14/)
  assert.match(text, /攀爬 \+4/)
  assert.match(text, /旧提灯/)
})

test('renderDiceFrameEntry renders generic entries', () => {
  const text = renderDiceFrameEntry({ id: 'lamp', name: '旧提灯', description: '旧灯。', effect: '照亮。' })
  assert.match(text, /旧提灯/)
  assert.match(text, /效果：照亮/)
})
