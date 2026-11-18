/**
 * dsh-diceframe — GM module
 *
 * Registers the `resolve_check` tool and a system-prompt section stating how
 * the model should conduct the table as a GM. Check logic lives in the
 * dependency-free engine.
 *
 * This module has ZERO runtime imports beyond Node core and local files — the
 * tool is registered as a raw ToolDefinition via `ctx.tools.register()`, so the
 * package never needs `@deepseek-ai/*` installed to load.
 *
 * @module dsh-diceframe/gm
 */

import { resolveCheck, renderCheck } from './engine.js'

export const name = 'dsh-diceframe-gm'
export const inject = ['tools', 'systemPrompt']

const GM_GUIDE = `## GM 规则
- 你以 GM（主持人）身份主持 TRPG 会话：叙述世界、扮演 NPC、执行规则，但不要替玩家做决定。
- 需要随机性时调用 roll_dice；需要判定时调用 resolve_check，不要自己编造骰子结果。
- 【复述契约，必须遵守】检定/掷骰的结果必须在正文里原样复述，不能只留在工具卡片里：
  1. 先一句话叙述玩家的行动（如「我用宝箱判别魔法检查这口木箱」）；
  2. 再原样复述结果，固定格式：「检定：<行动> · <骰子表达式> → <点数> vs <难度> → <大成功/成功/失败/大失败>（margin +N）」（掷骰则写「掷 <表达式> → <总点数>」）；
  3. 最后一行叙述后果。三步缺一不可，结果数字必须出现在正文里。
- 保持中立：规则解释一致，不偏袒，不为了剧情强行改写成功的掷骰。
- 判定失败不等于故事结束：让玩家承担后果，并给出新的选择。
- 开局：如果世界书提供了「起始场景」，直接从它开场叙述，不要反问玩家要玩什么。`

export function apply(ctx, config = {}) {
  if (config.enabled === false) return
  ctx.systemPrompt.section({ name: 'trpg:gm', order: 220, text: config.rules ?? GM_GUIDE })

  ctx.tools.register({
    name: 'resolve_check',
    description: '检定判定（TRPG 用）：掷骰并与难度比较，返回大成功/成功/失败/大失败及 margin。支持 d100（≤难度成功，1-5 大成功，100 大失败）、d20（20 大成功，1 大失败）、以及 NdM 求和模式。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '检定内容描述，例如「侦察：搜索房间」。',
        },
        expression: {
          type: 'string',
          description: '骰子表达式，如 "d100"、"d20"、"3d6"。',
        },
        difficulty: {
          type: 'integer',
          description: '难度值：d100 模式为成功率（如 55 表示 ≤55 成功）；d20/求和模式为需达到的目标值。',
        },
        mode: {
          type: 'string',
          enum: ['auto', 'd100', 'd20', 'sum'],
          description: '判定模式；auto 根据表达式自动判断。',
        },
        modifier: {
          type: 'integer',
          description: '额外修正值，加到骰子总数上。',
        },
      },
      required: ['action', 'expression', 'difficulty'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', description: '是否解析成功' },
          error: { type: 'string', description: '解析失败原因（ok 为 false 时存在）' },
          action: { type: 'string', description: '检定内容' },
          expression: { type: 'string', description: '骰子表达式' },
          total: { type: 'integer', description: '最终总和（含修正值）' },
          rolls: { type: 'array', items: { type: 'integer' }, description: '计入总和的骰子' },
          detail: { type: 'string', description: '人类可读的掷骰摘要' },
          modifier: { type: 'integer', description: '修正值' },
          mode: { type: 'string', description: '判定模式' },
          difficulty: { type: 'integer', description: '难度值' },
          outcome: { type: 'string', enum: ['critical-success', 'success', 'failure', 'fumble'], description: '判定结果' },
          label: { type: 'string', description: '结果中文标签' },
          margin: { type: 'integer', description: '与难度之差（正为盈余，负为不足）' },
        },
        required: ['ok'],
      },
      render: (_args, value) => [{ type: 'text', text: renderCheck(value) }],
    },
    async execute(args, _exec) {
      return resolveCheck(args)
    },
  })
}
