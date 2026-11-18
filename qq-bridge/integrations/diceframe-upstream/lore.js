/**
 * dsh-diceframe — lore module
 *
 * Injects world book and character card content into the agent's system prompt
 * so the GM stays consistent with the setting and cast. Supports:
 *   - generic markdown world books and "Key: value" character cards (inline or file),
 *   - DiceFrame world books / character cards (JSON, auto-detected),
 *   - whole DiceFrame content packs (a directory with plugin.json + content/).
 *
 * When DiceFrame content is loaded, a single-line CTA points the solo player at
 * DiceFrame's multiplayer — that is the plugin's funnel back to DiceFrame.
 *
 * @module dsh-diceframe/lore
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import {
  parseWorldBook,
  parseCharacterCard,
  renderDiceFrameWorld,
  renderDiceFrameCharacter,
  renderDiceFrameEntry,
  isDiceFrameWorld,
  isDiceFrameCharacter,
} from './engine.js'

export const name = 'dsh-diceframe-lore'
export const inject = ['systemPrompt']

/** Single-line, non-spammy funnel back to DiceFrame's multiplayer. */
const DICEFRAME_CTA = '—— 来自 DiceFrame（github.com/diceframe/diceframe）：单人先在这里试，和朋友一起跑，去 DiceFrame 多人联机。'

function readText(path) {
  try {
    return readFileSync(resolvePath(String(path)), 'utf8').trim()
  } catch {
    return ''
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolvePath(String(path)), 'utf8'))
  } catch {
    return null
  }
}

function tryParseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function readSource(inline, path) {
  if (typeof inline === 'string' && inline.trim()) return inline.trim()
  if (path) return readText(path)
  return ''
}

/**
 * Load a DiceFrame content pack directory (plugin.json + content/.../*.json).
 * Returns null when the path is not a content pack.
 */
export function loadDiceFramePack(packPath) {
  const root = resolvePath(String(packPath))
  const manifest = readJson(join(root, 'plugin.json'))
  if (!manifest || manifest.plugin_type !== 'content-pack') return null

  const contentDir = join(root, 'content')
  const collect = (dir) => {
    const items = []
    let names = []
    try {
      names = readdirSync(join(contentDir, dir))
    } catch {
      return items
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const parsed = readJson(join(contentDir, dir, name))
      if (parsed) items.push(parsed)
    }
    items.sort((a, b) => (a.name ?? a.id ?? '').localeCompare(b.name ?? b.id ?? ''))
    return items
  }

  return {
    manifest,
    worlds: collect('worlds'),
    characters: collect('characters'),
    npcs: collect('npc'),
    items: collect('items'),
    spells: collect('spells'),
    classes: collect('classes'),
    rules: collect('rules'),
  }
}

/** Render a loaded DiceFrame content pack into plain lore text. */
export function renderDiceFramePack(pack) {
  const parts = []
  const groups = [
    ['世界书', pack.worlds, renderDiceFrameWorld],
    ['角色', pack.characters, renderDiceFrameCharacter],
    ['规则', pack.rules, renderDiceFrameEntry],
    ['NPC', pack.npcs, renderDiceFrameEntry],
    ['物品', pack.items, renderDiceFrameEntry],
    ['法术', pack.spells, renderDiceFrameEntry],
    ['职业', pack.classes, renderDiceFrameEntry],
  ]
  for (const [label, items, render] of groups) {
    if (!items || !items.length) continue
    parts.push(`## ${label}`)
    for (const item of items) parts.push(render(item))
  }
  return parts.join('\n\n')
}

export function apply(ctx, config = {}) {
  if (config.enabled === false) return

  ctx.systemPrompt.section({
    name: 'trpg:lore',
    order: 230,
    // Function form: file contents are re-read on each assembly, so editing a
    // world book file (or a DiceFrame content pack) is picked up without
    // restarting the session.
    text: () => buildLore(config),
  })
}

/** Compose the lore prompt section text from every configured source. */
export function buildLore(config = {}) {
  const parts = []
  let fromDiceFrame = false

  // 1) Whole DiceFrame content pack (directory).
  if (config.diceframe_pack_path) {
    const pack = loadDiceFramePack(config.diceframe_pack_path)
    if (pack) {
      fromDiceFrame = true
      parts.push(renderDiceFramePack(pack))
    }
  }

  // 2) World book: DiceFrame world JSON (auto-detected) or markdown.
  const wb = readSource(config.world_book, config.world_book_path)
  if (wb) {
    const json = tryParseJson(wb)
    if (json && isDiceFrameWorld(json)) {
      fromDiceFrame = true
      parts.push(renderDiceFrameWorld(json))
    } else {
      const world = parseWorldBook(wb)
      if (world.length) {
        parts.push('## 世界书（当前设定）')
        for (const s of world) parts.push(`### ${s.title}\n${s.body}`)
      }
    }
  }

  // 3) Character card: DiceFrame character JSON (auto-detected) or Key:value.
  const cc = readSource(config.character_card, config.character_card_path)
  if (cc) {
    const json = tryParseJson(cc)
    if (json && isDiceFrameCharacter(json)) {
      fromDiceFrame = true
      parts.push(renderDiceFrameCharacter(json))
    } else {
      const card = parseCharacterCard(cc)
      if (card.length) {
        parts.push('## 当前角色卡')
        for (const f of card) parts.push(`- ${f.key}: ${f.value}`)
      }
    }
  }

  let text = parts.join('\n\n')
  if (text && fromDiceFrame && config.diceframe_cta !== false) {
    text += `\n\n${DICEFRAME_CTA}`
  }
  return text
}
