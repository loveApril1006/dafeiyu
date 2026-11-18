/**
 * dsh-diceframe — dice module
 *
 * Registers the `roll_dice` tool and a short system-prompt section teaching the
 * model to use it. All dice logic lives in the dependency-free engine.
 *
 * This module has ZERO runtime imports beyond Node core and local files — the
 * tool is registered as a raw ToolDefinition via `ctx.tools.register()`, so the
 * package never needs `@deepseek-ai/*` installed to load.
 *
 * @module dsh-diceframe/dice
 */

import { rollDice, renderRoll } from './engine.js'

export const name = 'dsh-diceframe-dice'
export const inject = ['tools', 'systemPrompt']

const DICE_GUIDE = `## TRPG 掷骰
需要随机性时调用 roll_dice，不要自己编造骰子结果。
- 骰子写法：d20、3d6、2d20kh1（优势）、2d20kl1（劣势）、4d6dl1（去掉最低1颗）、d100、3d6+2、1d6!（爆炸骰）。
- 【复述契约】掷完必须把 roll_dice 返回的 total 和 detail 在正文里原样复述（如「掷 2d20kh1 → 18（[18] dropped 1）」），再叙述结果，不能只留在工具卡片里。
- 普通检定用 resolve_check；暗骰时仍调用工具，但只向玩家叙述结论，不展示具体点数。`

export function apply(ctx, config = {}) {
  if (config.enabled === false) return
  ctx.systemPrompt.section({ name: 'trpg:dice', order: 210, text: config.guide ?? DICE_GUIDE })

  ctx.tools.register({
    name: 'roll_dice',
    description: '掷一颗或多颗骰子并返回结果（TRPG 用）。支持 d20、3d6、2d20kh1（优势）、2d20kl1（劣势）、4d6dl1、d100、3d6+2、1d6!（爆炸骰）。返回 total 和每颗骰子明细。',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: '骰子表达式，如 "3d6"、"d20"、"2d20kh1"、"4d6dl1"、"d100"、"3d6+2"、"1d6!"。',
        },
        reason: {
          type: 'string',
          description: '这次掷骰要决定什么（用于让 GM 正确叙述），可省略。',
        },
      },
      required: ['expression'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', description: '是否解析成功' },
          error: { type: 'string', description: '解析失败原因（ok 为 false 时存在）' },
          expression: { type: 'string', description: '原始骰子表达式' },
          total: { type: 'integer', description: '最终总和（含修正值）' },
          rolls: { type: 'array', items: { type: 'integer' }, description: '计入总和的骰子' },
          allRolls: { type: 'array', items: { type: 'integer' }, description: '实际掷出的全部骰子' },
          dropped: { type: 'integer', description: '被丢弃的骰子数' },
          modifier: { type: 'integer', description: '修正值' },
          sides: { type: 'integer', description: '骰子面数' },
          count: { type: 'integer', description: '骰子个数' },
          detail: { type: 'string', description: '人类可读的掷骰摘要' },
        },
        required: ['ok'],
      },
      render: (_args, value) => [{ type: 'text', text: renderRoll(value) }],
    },
    async execute(args, _exec) {
      return rollDice(args.expression)
    },
  })
}
