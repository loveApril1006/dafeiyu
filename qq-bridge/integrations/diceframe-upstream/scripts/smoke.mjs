// Dev-time smoke test: verifies the dsh-diceframe plugin modules load against the
// REAL @deepseek-ai/dsh-tools and register working tools + prompt sections.
// Not shipped; requires the node_modules junction to the DSH checkout.

import { apply as applyDice } from '../dice.js'
import { apply as applyGm } from '../gm.js'
import { apply as applyLore } from '../lore.js'

const tools = []
const sections = []
const ctx = {
  tools: { register: def => tools.push(def) },
  systemPrompt: { section: s => sections.push(s) },
}

applyDice(ctx, {})
applyGm(ctx, {})
applyLore(ctx, {
  world_book: '## 王国\n迷雾王国位于大陆北端。\n## 种族\n精灵与矮人并存。',
  character_card: '姓名: 艾琳\n职业: 游侠\n背景: 边境猎人',
})

console.log('registered tools:', tools.map(t => t.name).join(', '))
console.log('registered sections:', sections.map(s => `${s.name}@${s.order}`).join(', '))

if (tools.length !== 2) throw new Error('expected 2 tools')
if (sections.length !== 3) throw new Error('expected 3 sections')

const rollTool = tools.find(t => t.name === 'roll_dice')
const checkTool = tools.find(t => t.name === 'resolve_check')
if (!rollTool || !checkTool) throw new Error('missing tool')

const roll = await rollTool.execute({ expression: '2d20kh1', reason: '侦察' }, {})
console.log('roll_dice →', JSON.stringify(roll))
if (!roll.ok || roll.rolls.length !== 1) throw new Error('roll_dice bad result')

const check = await checkTool.execute({ action: '侦察', expression: 'd20', difficulty: 12 }, {})
console.log('resolve_check →', JSON.stringify(check))
if (!check.ok || !['critical-success', 'success', 'failure', 'fumble'].includes(check.outcome)) {
  throw new Error('resolve_check bad result')
}

const loreText = sections.find(s => s.name === 'trpg:lore').text()
console.log('lore section text:\n' + loreText)
if (!loreText.includes('世界书') || !loreText.includes('艾琳')) throw new Error('lore section missing content')

console.log('\nSMOKE OK')
