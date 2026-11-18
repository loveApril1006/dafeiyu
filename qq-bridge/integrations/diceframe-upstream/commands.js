/**
 * dsh-diceframe — slash commands module
 *
 * Human-facing commands surfaced in the web chat UI. They run DIRECTLY against
 * the engine (never through the model), so `/roll` always returns a real
 * crypto-random result and `/check` a real resolved outcome.
 *
 * Zero runtime imports beyond local files — `ctx.commands` is injected by the
 * host, so nothing external is needed to load.
 *
 * @module dsh-diceframe/commands
 */

import { rollDice, renderRoll, resolveCheck, renderCheck } from './engine.js'
import { getSnapshot, renderTable } from './table.js'
import { importSaveTo, exportTableTo } from './save.js'

export const name = 'dsh-diceframe-commands'
export const inject = ['commands']

export function apply(ctx, config = {}) {
  if (config.enabled === false) return

  ctx.commands.register({
    name: 'roll',
    description: '掷骰（TRPG）：返回真实随机结果。',
    input: { hint: '3d6 / d20 / 2d20kh1 / 4d6dl1 / d100 / 3d6+2 / 1d6!' },
    handler: ({ rawInput }) => {
      const expr = rawInput.trim()
      if (!expr) return { kind: 'error', text: '用法：/roll 3d6' }
      const result = rollDice(expr)
      return result.ok
        ? { kind: 'success', text: renderRoll(result) }
        : { kind: 'error', text: result.error }
    },
  })

  ctx.commands.register({
    name: 'check',
    description: '检定判定（TRPG）：掷骰与难度比较，返回大成功/成功/失败/大失败。',
    input: { hint: '侦察 d20 12' },
    handler: ({ rawInput }) => {
      const parts = rawInput.trim().split(/\s+/).filter(Boolean)
      if (parts.length < 2) {
        return { kind: 'error', text: '用法：/check <检定名> <骰子> <难度>，例如 /check 侦察 d20 12' }
      }
      const difficulty = Number(parts[parts.length - 1])
      const expression = parts[parts.length - 2]
      if (!Number.isFinite(difficulty)) return { kind: 'error', text: '难度必须是数字' }
      const action = parts.slice(0, parts.length - 2).join(' ') || expression
      const result = resolveCheck({ action, expression, difficulty })
      return result.ok
        ? { kind: 'success', text: renderCheck(result) }
        : { kind: 'error', text: result.error }
    },
  })

  ctx.commands.register({
    name: 'trpg',
    description: '开始跑团：GM 会使用世界书的「起始场景」直接开场。',
    handler: () => ({
      kind: 'success',
      text: '开团就绪。GM 已按规则直接进入世界书的「起始场景」开场——说「开始吧」即可。',
    }),
  })

  ctx.commands.register({
    name: 'state',
    description: '查看当前桌台状态（TRPG）：世界、角色卡、场景、NPC、先攻。',
    handler: ({ agent }) => ({
      kind: 'success',
      text: renderTable(getSnapshot(agent)),
    }),
  })

  ctx.commands.register({
    name: 'save',
    description: '存档互通：/save export <目录> 导出当前进度为 DiceFrame 存档；/save import <路径> 导入 DiceFrame 存档。',
    input: { hint: 'export <目录> | import <路径>' },
    handler: ({ agent, rawInput }) => {
      const parts = rawInput.trim().split(/\s+/).filter(Boolean)
      const action = parts[0]
      const rest = rawInput.trim().slice((parts[0] ?? '').length).trim()
      if (action === 'export') {
        if (!rest) return { kind: 'error', text: '用法：/save export <目录>' }
        try {
          const result = exportTableTo(agent, rest)
          return {
            kind: 'success',
            text: `已导出到：\n${result.files.join('\n')}\n把 zip 用 DiceFrame 的「导入存档」加载即可继续。`,
          }
        } catch (error) {
          return { kind: 'error', text: `导出失败：${error instanceof Error ? error.message : String(error)}` }
        }
      }
      if (action === 'import') {
        if (!rest) return { kind: 'error', text: '用法：/save import <state.json 或 zip 路径>' }
        try {
          const result = importSaveTo(agent, rest)
          return { kind: 'success', text: result.context }
        } catch (error) {
          return { kind: 'error', text: `导入失败：${error instanceof Error ? error.message : String(error)}` }
        }
      }
      return { kind: 'error', text: '用法：/save export <目录> 或 /save import <路径>' }
    },
  })
}
