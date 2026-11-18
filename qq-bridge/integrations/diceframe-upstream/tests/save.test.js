import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import {
  writeZip, readZipEntry, parseDiceFrameSave,
  buildDiceFrameState, applyImport,
} from '../save.js'
import { getStore } from '../table.js'

test('zip write/read round-trip (store method)', () => {
  const zip = writeZip({ 'state.json': Buffer.from('{"a":1}'), 'chatlog.jsonl': Buffer.from('x\n') })
  assert.equal(readZipEntry(zip, 'state.json').toString('utf8'), '{"a":1}')
  assert.equal(readZipEntry(zip, 'chatlog.jsonl').toString('utf8'), 'x\n')
})

test('buildDiceFrameState has required fields and maps table state', () => {
  const store = {
    world: { id: 'w', name: '世界' },
    notes: ['n1'],
    characters: new Map([['艾琳', { hp: 10, race: '精灵' }]]),
    npcs: new Map([['怪', 'x']]),
    initiative: [],
  }
  const s = buildDiceFrameState(store)
  assert.ok(Array.isArray(s.game_key))
  assert.ok(s.state)
  assert.equal(s.players['艾琳'].character_name, '艾琳')
  assert.equal(s.players['艾琳'].character_sheet.hp, 10)
  assert.equal(s.npcs['怪'], 'x')
  assert.ok(Array.isArray(s.log))
})

test('exported state.json can be parsed back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'df-save-'))
  try {
    const store = { world: { id: 'w', name: '世界' }, notes: ['n1'], characters: new Map([['艾琳', { hp: 10 }]]), npcs: new Map(), initiative: [] }
    const p = join(dir, 'state.json')
    writeFileSync(p, JSON.stringify(buildDiceFrameState(store)), 'utf8')
    const parsed = parseDiceFrameSave(p)
    assert.equal(parsed.world_name, '世界')
    assert.equal(parsed.players['艾琳'].character_sheet.hp, 10)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('exported zip can be imported', () => {
  const dir = mkdtempSync(join(tmpdir(), 'df-savez-'))
  try {
    const store = { world: { id: 'w', name: '世界' }, notes: ['n1'], characters: new Map(), npcs: new Map(), initiative: [] }
    const s = buildDiceFrameState(store)
    const zip = writeZip({ 'state.json': Buffer.from(JSON.stringify(s), 'utf8'), 'chatlog.jsonl': Buffer.from('') })
    const p = join(dir, 'save.zip')
    writeFileSync(p, zip)
    const parsed = parseDiceFrameSave(p)
    assert.equal(parsed.world_name, '世界')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('applyImport fills the table store and returns context', () => {
  const agent = { session: { id: 'imp' } }
  const store = getStore(agent)
  const state = {
    game_key: ['web', 'k', 'a'],
    world_id: 'w', world_name: '世界',
    players: { p1: { character_name: '艾琳', character_sheet: { hp: 10, race: '精灵' } } },
    npcs: { 老板: '红发' },
    initiative_order: ['老板', '艾琳'],
    scene: '酒馆里',
    log: [{ content: '你们来到小镇。' }],
  }
  const ctx = applyImport(store, state)
  assert.equal(store.world.name, '世界')
  assert.equal(store.characters.get('艾琳').hp, 10)
  assert.equal(store.npcs.get('老板'), '红发')
  assert.equal(store.initiative.length, 2)
  assert.ok(store.notes.some(n => n.includes('酒馆')))
  assert.match(ctx, /世界：世界/)
  assert.match(ctx, /艾琳/)
})

test('parseDiceFrameSave rejects non-save JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'df-bad-'))
  try {
    const p = join(dir, 'state.json')
    writeFileSync(p, '{"foo":1}', 'utf8')
    assert.throws(() => parseDiceFrameSave(p))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
