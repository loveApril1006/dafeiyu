/**
 * dsh-diceframe — pure engine
 *
 * Dependency-free TRPG logic: dice parsing/rolling, check resolution, and
 * world-book / character-card parsing. No DSH imports here, so these functions
 * are unit-testable with zero dependencies (`node --test`).
 *
 * @module dsh-diceframe/engine
 */

import { randomInt } from 'node:crypto'

// ---------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------

// Grammar: [count]d<sides>[kh|kl|dh|dl][n][!][+|-mod]
//   d20       → 1d20
//   3d6       → three d6, summed
//   2d20kh1   → advantage (keep the highest 1)
//   2d20kl1   → disadvantage (keep the lowest 1)
//   4d6dl1    → roll 4 d6, drop the lowest 1 (classic ability scores)
//   d100 / d% → percentile
//   1d6!      → exploding (a die that rolls max is rerolled and added)
//   3d6+2     → apply a modifier
const DICE_RE = /^([+-]?\d*)?d(%|100|\d+)(kh|kl|dh|dl)?(\d+)?(!)?([+-]\d+)?$/i

/** Parse a dice expression into a spec, or null when it is not valid notation. */
export function parseDice(expression) {
  if (typeof expression !== 'string') return null
  const m = expression.trim().match(DICE_RE)
  if (!m) return null

  const countRaw = m[1]
  const sidesRaw = m[2]
  const keepKind = (m[3] ?? '').toLowerCase()
  const keepRaw = m[4]
  const explode = Boolean(m[5])
  const modRaw = m[6]

  const sides = sidesRaw === '%' ? 100 : Number(sidesRaw)
  if (!Number.isFinite(sides) || sides < 1 || sides > 1_000_000) return null

  let count = countRaw === '' || countRaw === '+' ? 1 : Math.abs(Number(countRaw))
  count = Number.isFinite(count) ? Math.min(Math.max(Math.trunc(count), 1), 100) : 1

  const modifier = modRaw ? Number(modRaw) : 0
  // kh / kl: the number is the keep count. dh / dl: the number is the drop
  // count, so kept = count - dropped.
  const drop = keepKind === 'dh' || keepKind === 'dl'
  // kh / dl keep the top N; kl / dh keep the bottom N; plain keeps everything.
  const keepTop = !keepKind || keepKind === 'kh' || keepKind === 'dl'
  let keep = count
  if (keepRaw) {
    const n = Math.trunc(Number(keepRaw))
    keep = drop
      ? Math.max(count - Math.max(n, 0), 1) // drop N → keep count - N
      : Math.min(Math.max(n, 1), count)     // keep N
  }

  return { count, sides, modifier, keep, keepTop, explode }
}

/** One uniform die over [1, sides] using crypto randomness. */
function die(sides) {
  return randomInt(sides) + 1
}

/**
 * Roll a dice expression. Never throws for a valid string; returns
 * `{ ok: false, error }` for unparseable input.
 */
export function rollDice(expression) {
  const spec = parseDice(expression)
  if (!spec) {
    return {
      ok: false,
      error: `无法解析骰子表达式：${expression}（示例：3d6、d20、2d20kh1、4d6dl1、d100、3d6+2、1d6!）`,
    }
  }

  const MAX_ROLLS = 300
  const rolls = []
  let dieCount = 0
  while (dieCount < spec.count && rolls.length < MAX_ROLLS) {
    let value = die(spec.sides)
    rolls.push(value)
    dieCount += 1
    while (spec.explode && value === spec.sides && rolls.length < MAX_ROLLS) {
      value = die(spec.sides)
      rolls.push(value)
    }
  }

  const descending = [...rolls].sort((a, b) => b - a)
  const kept = spec.keepTop ? descending.slice(0, spec.keep) : descending.slice(-spec.keep)
  const dropped = rolls.length - kept.length
  const total = kept.reduce((sum, v) => sum + v, 0) + spec.modifier

  const detailParts = [`[${kept.join(', ')}]`]
  if (spec.modifier) detailParts.push(`${spec.modifier > 0 ? '+' : ''}${spec.modifier}`)
  if (dropped) detailParts.push(`(dropped ${dropped})`)

  return {
    ok: true,
    expression: expression.trim(),
    total,
    rolls: kept,
    allRolls: rolls,
    dropped,
    modifier: spec.modifier,
    sides: spec.sides,
    count: spec.count,
    detail: detailParts.join(' '),
  }
}

/** Render a roll result for the chat transcript. */
export function renderRoll(result) {
  if (!result.ok) return result.error
  return `🎲 ${result.expression} → **${result.total}**  ${result.detail}`
}

// ---------------------------------------------------------------------------
// Check resolution
// ---------------------------------------------------------------------------

/** Resolve a skill / ability check against a difficulty. */
export function resolveCheck(args) {
  const action = String(args.action ?? '')
  const expression = String(args.expression ?? '')
  const difficulty = Number(args.difficulty)
  const modifier = Number(args.modifier ?? 0) || 0
  const modeRaw = String(args.mode ?? 'auto')

  if (!Number.isFinite(difficulty)) {
    return { ok: false, error: 'difficulty 必须是数字' }
  }

  const roll = rollDice(expression)
  if (!roll.ok) return roll

  const auto = expression.trim().toLowerCase()
  const mode = modeRaw === 'auto'
    ? (auto.startsWith('d%') || auto.startsWith('d100') ? 'd100' : auto.startsWith('d20') ? 'd20' : 'sum')
    : modeRaw

  const total = roll.total + modifier
  const natural = roll.rolls[0]

  let outcome
  let label
  let margin

  if (mode === 'd100') {
    margin = difficulty - total
    if (roll.total === 100) { outcome = 'fumble'; label = '大失败' }
    else if (roll.total <= 5) { outcome = 'critical-success'; label = '大成功' }
    else { outcome = total <= difficulty ? 'success' : 'failure'; label = outcome === 'success' ? '成功' : '失败' }
  } else if (mode === 'd20') {
    margin = total - difficulty
    if (natural === 20) { outcome = 'critical-success'; label = '大成功' }
    else if (natural === 1) { outcome = 'fumble'; label = '大失败' }
    else { outcome = total >= difficulty ? 'success' : 'failure'; label = outcome === 'success' ? '成功' : '失败' }
  } else {
    margin = total - difficulty
    const allMax = roll.allRolls.length > 0 && roll.allRolls.every(v => v === roll.sides)
    const allMin = roll.allRolls.length > 0 && roll.allRolls.every(v => v === 1)
    if (allMax) { outcome = 'critical-success'; label = '大成功' }
    else if (allMin) { outcome = 'fumble'; label = '大失败' }
    else { outcome = total >= difficulty ? 'success' : 'failure'; label = outcome === 'success' ? '成功' : '失败' }
  }

  return {
    ok: true,
    action,
    expression,
    total,
    rolls: roll.rolls,
    detail: roll.detail,
    modifier,
    mode,
    difficulty,
    outcome,
    label,
    margin,
  }
}

/** Render a check result for the chat transcript. */
export function renderCheck(value) {
  if (!value.ok) return value.error
  const emoji = value.outcome === 'critical-success' ? '💥' : value.outcome === 'fumble' ? '💀' : value.outcome === 'success' ? '✅' : '❌'
  const modText = value.modifier ? (value.modifier > 0 ? `+${value.modifier}` : String(value.modifier)) : ''
  const marginText = value.margin > 0 ? `+${value.margin}` : String(value.margin)
  return `🎲 检定「${value.action || value.expression}」${value.expression}${modText} → **${value.total}** vs ${value.difficulty} → **${emoji} ${value.label}**（margin ${marginText}）`
}

// ---------------------------------------------------------------------------
// Lore: world book + character card
// ---------------------------------------------------------------------------

/**
 * Parse a world book (markdown headings) into [{ title, body }].
 * Plain leading text without a heading becomes an implicit "(前言)" section.
 */
export function parseWorldBook(text) {
  const sections = []
  let current = null

  const flush = () => {
    if (current && current.body.join('\n').trim()) {
      sections.push({ title: current.title, body: current.body.join('\n').trim() })
    }
    current = null
  }

  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const m = raw.match(/^#{1,3}\s+(.+)$/)
    if (m) {
      flush()
      current = { title: m[1].trim(), body: [] }
    } else if (current) {
      current.body.push(raw)
    } else if (raw.trim()) {
      current = { title: '(设定前言)', body: [raw] }
    }
  }
  flush()
  return sections
}

/**
 * Parse a character card ("Key: value" lines, indented lines continue the value)
 * into [{ key, value }].
 */
export function parseCharacterCard(text) {
  const fields = []
  let current = null
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (!raw.trim()) {
      current = null
      continue
    }
    const m = raw.match(/^([^:\n]{1,40}):\s*(.*)$/)
    if (m) {
      current = { key: m[1].trim(), value: m[2].trim() }
      fields.push(current)
    } else if (current) {
      current.value = current.value ? `${current.value}\n${raw.trim()}` : raw.trim()
    }
  }
  return fields
}

/** Build the lore prompt section text from raw world book / character card text. */
export function renderLore(wbText, ccText) {
  const parts = []

  const world = parseWorldBook(wbText)
  if (world.length) {
    parts.push('## 世界书（当前设定）')
    for (const s of world) parts.push(`### ${s.title}\n${s.body}`)
  }

  const card = parseCharacterCard(ccText)
  if (card.length) {
    parts.push('## 当前角色卡')
    for (const f of card) parts.push(`- ${f.key}: ${f.value}`)
  }

  return parts.join('\n\n')
}

// ---------------------------------------------------------------------------
// DiceFrame format: world books, character cards, content packs
// ---------------------------------------------------------------------------

/** True when a parsed JSON value is a DiceFrame world book. */
export function isDiceFrameWorld(value) {
  return value !== null && typeof value === 'object' && typeof value.world_id === 'string'
}

/** True when a parsed JSON value is a DiceFrame character card. */
export function isDiceFrameCharacter(value) {
  return value !== null && typeof value === 'object' && typeof value.character_name === 'string'
}

/** True when a parsed JSON value is a generic DiceFrame entry (item/npc/spell/class/rule). */
export function isDiceFrameEntry(value) {
  return value !== null && typeof value === 'object'
    && typeof value.name === 'string'
    && (typeof value.description === 'string' || typeof value.effect === 'string')
}

/** Normalize one DiceFrame world book JSON into plain lore text. */
export function renderDiceFrameWorld(world) {
  const lines = []
  lines.push(`# 世界：${world.world_name ?? world.world_id}`)
  if (world.description) lines.push(world.description)
  if (world.world_setting) lines.push('## 背景设定\n' + world.world_setting)
  if (world.starter_scene) lines.push('## 起始场景\n' + world.starter_scene)
  const book = Array.isArray(world.starter_lorebook) ? world.starter_lorebook : []
  if (book.length) {
    lines.push('## 设定条目')
    for (const entry of book) {
      const kw = Array.isArray(entry.keywords) && entry.keywords.length ? `（${entry.keywords.join('、')}）` : ''
      lines.push(`### ${entry.name ?? entry.id}${kw}\n${entry.content ?? ''}`)
    }
  }
  return lines.join('\n\n')
}

/** Normalize one DiceFrame character card JSON into plain lore text. */
export function renderDiceFrameCharacter(char) {
  const lines = []
  lines.push(`# 角色：${char.character_name ?? char.name ?? char.id}`)
  const meta = []
  if (char.race) meta.push(`种族 ${char.race}`)
  if (char.class) meta.push(`职业 ${char.class}`)
  if (meta.length) lines.push(meta.join(' · '))
  if (char.description) lines.push(char.description)
  if (char.attributes && typeof char.attributes === 'object') {
    const attrs = Object.entries(char.attributes).map(([k, v]) => `${k} ${v}`).join('、')
    if (attrs) lines.push('属性：' + attrs)
  }
  if (Array.isArray(char.skills) && char.skills.length) {
    lines.push('技能：' + char.skills.map(s => `${s.name}${typeof s.value === 'number' ? ` +${s.value}` : ''}`).join('、'))
  }
  if (char.background) lines.push('背景：' + char.background)
  if (Array.isArray(char.equipment) && char.equipment.length) {
    lines.push('装备：' + char.equipment.map(e => (e && typeof e === 'object' ? e.name : String(e))).join('、'))
  }
  return lines.join('\n')
}

/** Normalize one generic DiceFrame entry (item / npc / spell / class / rule) into plain text. */
export function renderDiceFrameEntry(entry) {
  const lines = []
  lines.push(`### ${entry.name ?? entry.id}`)
  const kw = Array.isArray(entry.keywords) && entry.keywords.length ? `（${entry.keywords.join('、')}）` : ''
  if (kw) lines.push(kw)
  if (entry.description) lines.push(entry.description)
  if (entry.effect) lines.push('效果：' + entry.effect)
  if (entry.content) lines.push(entry.content)
  return lines.join('\n')
}
