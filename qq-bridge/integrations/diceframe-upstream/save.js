/**
 * dsh-diceframe — save interoperability module
 *
 * Two-way bridge between a DSH session and DiceFrame saves:
 *
 * - `save_import <path>`: read a DiceFrame save (`state.json` or the portable
 *   zip) and load its world, players (character sheets), NPCs, scene and recent
 *   history into the table state + a GM prompt section, so the agent continues
 *   that campaign in DSH.
 * - `save_export <dir>`: serialize the current session's table state into a
 *   valid DiceFrame `state.json` (plus `chatlog.jsonl` and a portable zip) that
 *   DiceFrame can import/load as a new game.
 *
 * The export targets DiceFrame's `GameState.to_dict()` shape: only `game_key`
 * and `state` are strictly required by `from_dict`, everything else defaults.
 * This is an "essential state" bridge, not a bit-perfect replica of every
 * DiceFrame mechanic.
 *
 * Zero runtime imports beyond Node core (`node:fs`, `node:path`, `node:zlib`).
 *
 * @module dsh-diceframe/save
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename, extname, resolve as resolvePath } from 'node:path'
import { inflateRawSync, crc32 } from 'node:zlib'
import { getStore } from './table.js'

export const name = 'dsh-diceframe-save'
export const inject = ['tools', 'systemPrompt']

// ---------------------------------------------------------------------------
// Minimal ZIP support (store + deflate) — enough for DiceFrame save zips.
// ---------------------------------------------------------------------------

/** Extract one entry from a ZIP buffer (method 0 = store, 8 = deflate). */
export function readZipEntry(zipBuffer, targetName) {
  const buf = Buffer.from(zipBuffer)
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('不是有效的 zip（找不到结束标记）')
  const cdOffset = buf.readUInt32LE(eocd + 16)
  const cdCount = buf.readUInt16LE(eocd + 10)
  let off = cdOffset
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('zip 中央目录损坏')
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOffset = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    if (name === targetName) {
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('zip 本地头损坏')
      const lNameLen = buf.readUInt16LE(localOffset + 26)
      const lExtraLen = buf.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + lNameLen + lExtraLen
      const data = buf.subarray(dataStart, dataStart + compSize)
      if (method === 0) return data
      if (method === 8) return inflateRawSync(data)
      throw new Error(`不支持的 zip 压缩方式 ${method}`)
    }
    off += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`zip 中没有 ${targetName}`)
}

/** Build a store-method ZIP from { name: Buffer } (readable by Python zipfile). */
export function writeZip(files) {
  const parts = []
  const central = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content)
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8) // method: store
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    parts.push(local, nameBuf, data)

    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(0, 8)
    cen.writeUInt16LE(0, 10)
    cen.writeUInt16LE(0, 12)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(data.length, 20)
    cen.writeUInt32LE(data.length, 24)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt16LE(0, 30)
    cen.writeUInt16LE(0, 32)
    cen.writeUInt16LE(0, 34)
    cen.writeUInt16LE(0, 36)
    cen.writeUInt32LE(0, 38)
    cen.writeUInt32LE(offset, 42)
    central.push(cen, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }

  const centralStart = offset
  const centralBuffer = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(central.length / 2, 8)
  eocd.writeUInt16LE(central.length / 2, 10)
  eocd.writeUInt32LE(centralBuffer.length, 12)
  eocd.writeUInt32LE(centralStart, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...parts, centralBuffer, eocd])
}

// ---------------------------------------------------------------------------
// DiceFrame save parsing / building
// ---------------------------------------------------------------------------

/** Parse a DiceFrame save file (`state.json` or portable zip) → state object. */
export function parseDiceFrameSave(filePath) {
  const raw = readFileSync(resolvePath(filePath))
  const isZip = extname(filePath).toLowerCase() === '.zip'
  const text = isZip ? readZipEntry(raw, 'state.json').toString('utf8') : raw.toString('utf8')
  let state
  try {
    state = JSON.parse(text)
  } catch {
    throw new Error('存档不是有效 JSON')
  }
  if (!state || typeof state !== 'object' || !('game_key' in state)) {
    throw new Error('不是有效的 DiceFrame 存档（缺少 game_key）')
  }
  return state
}

/** Build a DiceFrame `state.json` from the session table store. */
export function buildDiceFrameState(store) {
  const players = {}
  for (const [name, sheet] of store.characters) {
    players[name] = { character_name: name, character_sheet: sheet }
  }
  const log = store.notes.map((content, i) => ({
    round: 1, seq: i + 1, role: 'system', content,
  }))
  return {
    game_key: ['web', `dsh-${Date.now()}`, 'dsh_diceframe'],
    world_id: store.world?.id ?? '',
    rule_id: '',
    scene_image: {},
    map_background: {},
    world_name: store.world?.name ?? '',
    group_name: '',
    state: 'active_action',
    players,
    npcs: Object.fromEntries(store.npcs),
    round_number: 1,
    action_queue: [],
    pending_actions: [],
    ready_players: [],
    away_players: [],
    combat_active: false,
    combat_enemies: [],
    combat_state: 'none',
    initiative_order: store.initiative.map(i => i.name),
    initiative_current: 0,
    scene: store.notes.join('\n'),
    game_time: '',
    log,
    summary: {},
    key_facts: [],
    total_llm_calls: 0,
    total_tokens: 0,
    started_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),
    solo_mode: true,
    seed_code: '',
    difficulty: '标准',
    language: 'zh-CN',
    luck_timeout_seconds: 60,
    entry_point: 'web',
    max_players: 6,
    gm_uid: 'gm',
    player_access_open: false,
    bot_bind_token: '',
    room_password: '',
    room_token: '',
    pending_combat_results: [],
    lorebook_timed_state: {},
    quick_actions: [],
    pending_payments: [],
    health_events: [],
    health_status: {},
    last_check: null,
    last_checks: [],
    round_checks_prepared: false,
    round_start_snapshot: {},
    last_state_update: null,
    last_token_budget_bump: null,
    gm_directives: [],
    confirmed_items: [],
    private_log: {},
  }
}

/** Load a parsed DiceFrame state into the session table store; returns context text. */
export function applyImport(store, state) {
  store.world = {
    id: typeof state.world_id === 'string' ? state.world_id : '',
    name: typeof state.world_name === 'string' ? state.world_name : '',
  }
  store.characters = new Map()
  const players = state.players ?? {}
  for (const [uid, p] of Object.entries(players)) {
    if (p && typeof p === 'object') {
      store.characters.set(typeof p.character_name === 'string' && p.character_name ? p.character_name : uid, p.character_sheet ?? {})
    }
  }
  store.npcs = new Map()
  const npcs = state.npcs ?? {}
  for (const [name, desc] of Object.entries(npcs)) store.npcs.set(name, typeof desc === 'string' ? desc : '')
  store.initiative = (Array.isArray(state.initiative_order) ? state.initiative_order : [])
    .map(name => ({ name: String(name), value: 0 }))
  store.notes = []
  if (typeof state.scene === 'string' && state.scene.trim()) store.notes.push(`场景：${state.scene.trim()}`)
  const log = Array.isArray(state.log) ? state.log : []
  for (const entry of log.slice(-8)) {
    if (entry && typeof entry.content === 'string' && entry.content.trim()) {
      store.notes.push(entry.content.trim())
    }
  }
  return renderImportedContext(state)
}

/** Human-readable summary of an imported DiceFrame save. */
export function renderImportedContext(state) {
  const lines = ['## 已导入 DiceFrame 存档']
  const world = state.world_name || state.world_id || '（未知名）'
  lines.push(`世界：${world}`)
  const players = Object.entries(state.players ?? {})
  if (players.length) {
    lines.push('玩家角色：')
    for (const [uid, p] of players) {
      lines.push(`- ${p?.character_name ?? uid}`)
    }
  }
  if (typeof state.scene === 'string' && state.scene.trim()) {
    lines.push(`当前场景：${state.scene.trim()}`)
  }
  const log = Array.isArray(state.log) ? state.log : []
  if (log.length) {
    lines.push('最近进展：')
    for (const entry of log.slice(-5)) {
      if (entry && typeof entry.content === 'string' && entry.content.trim()) {
        lines.push(`- ${entry.content.trim()}`)
      }
    }
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Plugin half
// ---------------------------------------------------------------------------

/** Imported context per session, rendered into the GM prompt section. */
const importedContexts = new Map()

export function apply(ctx, config = {}) {
  if (config.enabled === false) return

  ctx.systemPrompt.section({
    name: 'dsh-diceframe:save',
    order: 240,
    text: () => {
      // The section is shared; render only the current session's import via
      // the agent context is not available here, so keep it global-latest.
      // (The imported state also lives in table_state, which the GM reads.)
      return importedContexts.get('latest') ?? ''
    },
  })

  ctx.tools.register({
    name: 'save_import',
    description: '导入 DiceFrame 存档（state.json 或可移植 zip），把世界、玩家角色卡、NPC、场景与最近进展载入本局。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'DiceFrame 存档文件路径（state.json 或导出 zip）。',
        },
      },
      required: ['path'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          error: { type: 'string' },
          context: { type: 'string' },
          players: { type: 'array', items: { type: 'string' } },
        },
        required: ['ok'],
      },
      render: (_args, value) => [{ type: 'text', text: value.ok ? value.context : value.error }],
    },
    async execute(args, exec) {
      try {
        const state = parseDiceFrameSave(args.path)
        const store = getStore(exec.agent)
        const context = applyImport(store, state)
        importedContexts.set('latest', context)
        return {
          ok: true,
          context,
          players: Object.keys(state.players ?? {}).map(uid => state.players[uid]?.character_name ?? uid),
        }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  })

  ctx.tools.register({
    name: 'save_export',
    description: '把当前桌台状态导出为 DiceFrame 可导入的存档（state.json + chatlog.jsonl + 可移植 zip），写入指定目录。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '目标目录（将写入 state.json、chatlog.jsonl 和一个可移植 zip）。',
        },
      },
      required: ['path'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          error: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
        },
        required: ['ok'],
      },
      render: (_args, value) => {
        if (!value.ok) return value.error
        return `已导出到：\n${value.files.join('\n')}\n把 zip 用 DiceFrame 的「导入存档」加载，即可继续。`
      },
    },
    async execute(args, exec) {
      try {
        const store = getStore(exec.agent)
        const state = buildDiceFrameState(store)
        const dir = resolvePath(args.path)
        mkdirSync(dir, { recursive: true })
        const stateJson = JSON.stringify(state, null, 2)
        const chatlog = (state.log.map(e => JSON.stringify(e))).join('\n') + '\n'
        const statePath = join(dir, 'state.json')
        const chatlogPath = join(dir, 'chatlog.jsonl')
        writeFileSync(statePath, stateJson, 'utf8')
        writeFileSync(chatlogPath, chatlog, 'utf8')
        const zipName = `dsh-diceframe-export-${Date.now()}.zip`
        const zipPath = join(dir, zipName)
        writeFileSync(zipPath, writeZip({
          'state.json': Buffer.from(stateJson, 'utf8'),
          'chatlog.jsonl': Buffer.from(chatlog, 'utf8'),
        }))
        return { ok: true, files: [statePath, chatlogPath, zipPath] }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Thin wrappers reused by the slash-command layer (/save).
// ---------------------------------------------------------------------------

/** Full import for one agent: parse → apply to its table store → record context. */
export function importSaveTo(agent, path) {
  const state = parseDiceFrameSave(path)
  const store = getStore(agent)
  const context = applyImport(store, state)
  importedContexts.set('latest', context)
  return { ok: true, context, players: Object.keys(state.players ?? {}).map(uid => state.players[uid]?.character_name ?? uid) }
}

/** Full export for one agent: build state from its table store and write files. */
export function exportTableTo(agent, dir) {
  const store = getStore(agent)
  const state = buildDiceFrameState(store)
  const resolved = resolvePath(dir)
  mkdirSync(resolved, { recursive: true })
  const stateJson = JSON.stringify(state, null, 2)
  const chatlog = (state.log.map(e => JSON.stringify(e))).join('\n') + '\n'
  const statePath = join(resolved, 'state.json')
  const chatlogPath = join(resolved, 'chatlog.jsonl')
  writeFileSync(statePath, stateJson, 'utf8')
  writeFileSync(chatlogPath, chatlog, 'utf8')
  const zipName = `dsh-diceframe-export-${Date.now()}.zip`
  const zipPath = join(resolved, zipName)
  writeFileSync(zipPath, writeZip({
    'state.json': Buffer.from(stateJson, 'utf8'),
    'chatlog.jsonl': Buffer.from(chatlog, 'utf8'),
  }))
  return { ok: true, files: [statePath, chatlogPath, zipPath] }
}
