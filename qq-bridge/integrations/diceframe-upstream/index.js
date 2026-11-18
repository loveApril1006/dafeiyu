/**
 * dsh-diceframe — combined entry
 *
 * Mounts dice, GM, and lore in a single plugin row. Prefer the granular rows in
 * cordis.patch.yml; this module exists for "just give me everything".
 *
 * @module dsh-diceframe
 */

import { apply as applyDice } from './dice.js'
import { apply as applyGm } from './gm.js'
import { apply as applyLore } from './lore.js'
import { apply as applyCommands } from './commands.js'
import { apply as applyTable } from './table.js'
import { apply as applySave } from './save.js'

export const name = 'dsh-diceframe'
export const inject = ['tools', 'systemPrompt', 'commands']

export function apply(ctx, config = {}) {
  applyDice(ctx, { ...(config.dice ?? {}) })
  applyGm(ctx, { ...(config.gm ?? {}) })
  applyLore(ctx, { ...(config.lore ?? {}) })
  applyCommands(ctx, { ...(config.commands ?? {}) })
  applyTable(ctx, { ...(config.table ?? {}) })
  applySave(ctx, { ...(config.save ?? {}) })
}
