import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, renderTable } from '../table.js'

function setup() {
  const tools = []
  const ctx = { tools: { register: def => tools.push(def) } }
  apply(ctx, {})
  const byName = name => tools.find(t => t.name === name)
  return { update: byName('table_update'), state: byName('table_state'), tools }
}

const agent = (id) => ({ session: { id } })

test('registers table_state and table_update', () => {
  const { tools } = setup()
  assert.deepEqual(tools.map(t => t.name).sort(), ['table_state', 'table_update'])
})

test('table_update records note, npc, initiative; table_state reads them back', async () => {
  const { update, state } = setup()
  const a = agent('s1')
  const after = await update.execute({
    note: '酒馆起火',
    set_npc: { name: '老板娘', description: '红头发' },
    set_initiative: { name: '老板娘', value: 18 },
  }, { agent: a })
  assert.ok(after.notes.includes('酒馆起火'))
  assert.equal(after.npcs.length, 1)
  assert.equal(after.initiative.length, 1)

  const read = await state.execute({}, { agent: a })
  assert.equal(read.notes.length, 1)
  assert.equal(read.npcs[0].name, '老板娘')
  assert.equal(read.initiative[0].value, 18)
})

test('state is isolated per session', async () => {
  const { update, state } = setup()
  await update.execute({ note: 'A 的团' }, { agent: agent('A') })
  const other = await state.execute({}, { agent: agent('B') })
  assert.equal(other.notes.length, 0)
})

test('initiative sorts descending', async () => {
  const { update } = setup()
  const a = agent('init')
  await update.execute({ set_initiative: { name: '甲', value: 5 } }, { agent: a })
  await update.execute({ set_initiative: { name: '乙', value: 20 } }, { agent: a })
  const s = await update.execute({ set_initiative: { name: '丙', value: 10 } }, { agent: a })
  assert.deepEqual(s.initiative.map(i => i.name), ['乙', '丙', '甲'])
})

test('remove_npc and clear work', async () => {
  const { update } = setup()
  const a = agent('x')
  await update.execute({ set_npc: { name: '怪' } }, { agent: a })
  const afterRemove = await update.execute({ remove_npc: '怪' }, { agent: a })
  assert.equal(afterRemove.npcs.length, 0)
  await update.execute({ set_npc: { name: '怪' } }, { agent: a })
  const cleared = await update.execute({ clear: true }, { agent: a })
  assert.equal(cleared.npcs.length, 0)
})

test('renderTable is readable', async () => {
  const { state } = setup()
  const a = agent('render')
  const read = await state.execute({}, { agent: a })
  assert.match(renderTable(read), /桌台状态/)
})
