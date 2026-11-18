import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { apply } from '../commands.js'
import { getStore } from '../table.js'

function setup() {
  const commands = []
  const ctx = { commands: { register: def => commands.push(def) } }
  apply(ctx, {})
  return commands
}

const byName = (cmds, name) => cmds.find(c => c.name === name)

test('registers roll / check / trpg / state / save', () => {
  const cmds = setup()
  assert.deepEqual(cmds.map(c => c.name).sort(), ['check', 'roll', 'save', 'state', 'trpg'])
})

test('/roll returns a real structured result', () => {
  const roll = byName(setup(), 'roll')
  const r = roll.handler({ rawInput: ' 2d6 ' })
  assert.equal(r.kind, 'success')
  assert.match(r.text, /2d6/)
  assert.match(r.text, /\*\*/) // markdown total
})

test('/roll with empty input errors', () => {
  const roll = byName(setup(), 'roll')
  assert.equal(roll.handler({ rawInput: ' ' }).kind, 'error')
})

test('/roll with bad notation errors', () => {
  const roll = byName(setup(), 'roll')
  assert.equal(roll.handler({ rawInput: 'garbage' }).kind, 'error')
})

test('/check parses action expr dc', () => {
  const check = byName(setup(), 'check')
  const r = check.handler({ rawInput: '侦察 d20 12' })
  assert.equal(r.kind, 'success')
  assert.match(r.text, /侦察/)
  assert.match(r.text, /大成功|成功|失败|大失败/)
})

test('/check with bad dc errors', () => {
  const check = byName(setup(), 'check')
  assert.equal(check.handler({ rawInput: '侦察 d20 abc' }).kind, 'error')
})

test('/check with too few args errors', () => {
  const check = byName(setup(), 'check')
  assert.equal(check.handler({ rawInput: 'd20' }).kind, 'error')
})

test('/trpg returns the ready guidance', () => {
  const trpg = byName(setup(), 'trpg')
  const r = trpg.handler({ rawInput: '' })
  assert.equal(r.kind, 'success')
  assert.match(r.text, /起始场景/)
})

test('/state renders the table state', () => {
  const agent = { session: { id: 'state-cmd' } }
  const store = getStore(agent)
  store.world = { id: 'w', name: '星火镇' }
  store.characters.set('林', { hp: 10 })
  const state = byName(setup(), 'state')
  const r = state.handler({ rawInput: '', agent })
  assert.equal(r.kind, 'success')
  assert.match(r.text, /桌台状态/)
  assert.match(r.text, /星火镇/)
})

test('/save export writes state.json + zip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'df-save-cmd-'))
  try {
    const agent = { session: { id: 'save-cmd' } }
    const store = getStore(agent)
    store.world = { id: 'w', name: '星火镇' }
    store.characters.set('林', { hp: 10 })
    const save = byName(setup(), 'save')
    const r = save.handler({ rawInput: `export ${dir}`, agent })
    assert.equal(r.kind, 'success')
    assert.match(r.text, /state\.json/)
    assert.ok(existsSync(join(dir, 'state.json')))
    assert.ok(existsSync(join(dir, 'chatlog.jsonl')))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('/save import reads a state.json back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'df-imp-cmd-'))
  try {
    const agent = { session: { id: 'imp-cmd' } }
    const store = getStore(agent)
    store.world = { id: 'w', name: '星火镇' }
    store.characters.set('林', { hp: 10 })
    const save = byName(setup(), 'save')
    const exported = save.handler({ rawInput: `export ${dir}`, agent })
    assert.equal(exported.kind, 'success')
    // fresh agent, import the exported state.json
    const agent2 = { session: { id: 'imp-cmd-2' } }
    const r = save.handler({ rawInput: `import ${join(dir, 'state.json')}`, agent: agent2 })
    assert.equal(r.kind, 'success')
    assert.match(r.text, /已导入 DiceFrame 存档/)
    assert.match(r.text, /星火镇/)
    assert.match(r.text, /林/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('/save bad action errors', () => {
  const save = byName(setup(), 'save')
  assert.equal(save.handler({ rawInput: 'frobnicate x', agent: { session: { id: 'x' } } }).kind, 'error')
})
