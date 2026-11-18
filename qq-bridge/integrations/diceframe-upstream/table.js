/**
 * dsh-diceframe — table state module
 *
 * Per-session table state: world, scene notes, player character sheets, NPCs,
 * and initiative order. The GM records facts through `table_update` and reads
 * them back with `table_state`, so the agent keeps a consistent picture across
 * turns. State is keyed per session and lives for the process lifetime —
 * cross-restart persistence is a roadmap item.
 *
 * The character sheets + world here are what `save_export` serializes into a
 * DiceFrame save, and what `save_import` fills from one.
 *
 * Zero runtime imports beyond local files — `ctx.tools` is injected by the host.
 *
 * @module dsh-diceframe/table
 */

export const name = 'dsh-diceframe-table'
export const inject = ['tools']

/** Per-process store: sessionId → table state. */
const stores = new Map()

function storeFor(agent) {
  const key = agent?.session?.id ?? 'default'
  let store = stores.get(key)
  if (!store) {
    store = {
      world: {},
      notes: [],
      characters: new Map(),
      npcs: new Map(),
      initiative: [],
    }
    stores.set(key, store)
  }
  return store
}

function snapshot(store) {
  return {
    world: { ...store.world },
    notes: [...store.notes],
    characters: [...store.characters.entries()].map(([name, sheet]) => ({ name, character_sheet: sheet })),
    npcs: [...store.npcs.entries()].map(([name, description]) => ({ name, description })),
    initiative: [...store.initiative],
  }
}

/** Shared accessor so sibling modules (save) can read/update the same store. */
export function getStore(agent) {
  return storeFor(agent)
}

/** Snapshot accessor for renderers/commands (serializable table state). */
export function getSnapshot(agent) {
  return snapshot(storeFor(agent))
}

const stateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    world: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
      description: '当前世界（id/name，来自内容包或存档）',
    },
    notes: { type: 'array', items: { type: 'string' }, description: '场景笔记' },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          character_sheet: { type: 'object' },
        },
      },
      description: '玩家角色卡（name + character_sheet）',
    },
    npcs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
      },
      description: 'NPC 列表',
    },
    initiative: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          value: { type: 'integer' },
        },
      },
      description: '先攻顺序',
    },
  },
  required: ['world', 'notes', 'characters', 'npcs', 'initiative'],
}

export function apply(ctx, config = {}) {
  if (config.enabled === false) return

  ctx.tools.register({
    name: 'table_state',
    description: '查看当前桌台状态（TRPG）：世界、场景笔记、玩家角色卡、NPC 列表、先攻顺序。',
    parameters: {
      type: 'object',
      properties: {},
    },
    output: { schema: stateSchema, render: (_args, value) => [{ type: 'text', text: renderTable(value) }] },
    async execute(_args, exec) {
      return snapshot(storeFor(exec.agent))
    },
  })

  ctx.tools.register({
    name: 'table_update',
    description: '更新桌台状态（TRPG）：设世界、追加场景笔记、增删玩家角色卡、增删 NPC、记录先攻。返回更新后的完整状态。',
    parameters: {
      type: 'object',
      properties: {
        set_world: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          description: '记录当前世界（来自内容包或存档）',
        },
        note: { type: 'string', description: '追加一条场景笔记' },
        set_character: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            character_sheet: { type: 'object' },
          },
          required: ['name', 'character_sheet'],
          description: '新增或更新一个玩家角色卡',
        },
        remove_character: { type: 'string', description: '按名字移除一个玩家角色卡' },
        set_npc: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['name'],
          description: '新增或更新一个 NPC',
        },
        remove_npc: { type: 'string', description: '按名字移除一个 NPC' },
        set_initiative: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'integer' },
          },
          required: ['name', 'value'],
          description: '记录某人的先攻值',
        },
        clear: { type: 'boolean', description: '清空桌台状态' },
      },
    },
    output: { schema: stateSchema, render: (_args, value) => [{ type: 'text', text: renderTable(value) }] },
    async execute(args, exec) {
      const store = storeFor(exec.agent)
      if (args.clear) {
        store.world = {}
        store.notes = []
        store.characters = new Map()
        store.npcs = new Map()
        store.initiative = []
      }
      if (args.set_world) store.world = { ...args.set_world }
      if (args.note) store.notes.push(String(args.note))
      if (args.set_character && args.set_character.name && args.set_character.character_sheet) {
        store.characters.set(String(args.set_character.name), args.set_character.character_sheet)
      }
      if (args.remove_character) store.characters.delete(String(args.remove_character))
      if (args.set_npc && args.set_npc.name) {
        store.npcs.set(String(args.set_npc.name), args.set_npc.description ? String(args.set_npc.description) : '')
      }
      if (args.remove_npc) store.npcs.delete(String(args.remove_npc))
      if (args.set_initiative && args.set_initiative.name && Number.isFinite(args.set_initiative.value)) {
        const entry = { name: String(args.set_initiative.name), value: Number(args.set_initiative.value) }
        const idx = store.initiative.findIndex(item => item.name === entry.name)
        if (idx >= 0) store.initiative[idx] = entry
        else store.initiative.push(entry)
        store.initiative.sort((a, b) => b.value - a.value)
      }
      return snapshot(store)
    },
  })
}

/** Render table state for the chat transcript. */
export function renderTable(value) {
  const lines = ['🗂 桌台状态']
  if (value.world && value.world.name) lines.push(`世界：${value.world.name}`)
  if (value.notes && value.notes.length) {
    lines.push('场景笔记：')
    for (const n of value.notes) lines.push(`- ${n}`)
  }
  if (value.characters && value.characters.length) {
    lines.push('玩家角色：')
    for (const c of value.characters) {
      const cs = c.character_sheet ?? {}
      const bits = []
      if (cs.race) bits.push(cs.race)
      if (cs.class) bits.push(cs.class)
      if (typeof cs.hp === 'number') bits.push(`HP ${cs.hp}${typeof cs.max_hp === 'number' ? `/${cs.max_hp}` : ''}`)
      if (bits.length) lines.push(`- ${c.name}（${bits.join(' · ')}）`)
      else lines.push(`- ${c.name}`)
    }
  }
  if (value.npcs && value.npcs.length) {
    lines.push('NPC：')
    for (const npc of value.npcs) lines.push(`- ${npc.name}${npc.description ? `：${npc.description}` : ''}`)
  }
  if (value.initiative && value.initiative.length) {
    lines.push('先攻：')
    for (const item of value.initiative) lines.push(`- ${item.name} (${item.value})`)
  }
  if (lines.length === 1) lines.push('（暂无记录）')
  return lines.join('\n')
}
