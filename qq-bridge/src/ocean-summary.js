// Evidence cards use bounded original quotations, never invented event outcomes.
const clip=(s,n)=>{const value=String(s).slice(0,Math.max(0,n));return /[\uD800-\uDBFF]$/.test(value)?value.slice(0,-1):value;};
const clean = value => String(value ?? '').replace(/\u0000/g, '').trim();
const flagsFor = value => [
  [/不|没|并非|取消|更正|改成|不是|否认/.test(value) && 'correction'],
  [/约定|答应|提醒|明天|下次|记得|待办|还没|尚未/.test(value) && 'pending'],
  [/完成|结果|失败|成功|后来|最后|已经|取消/.test(value) && 'outcome']
].flat().filter(Boolean);

export function buildEvidenceCard(rows, { limit = 700, total = rows.length } = {}) {
  const ordered = [...rows].sort((a, b) => a.stamp - b.stamp || a.id - b.id);
  const people = new Map(), pieces = [];
  for (const row of ordered) {
    const label = clean(row.sender).slice(0, 40), id = clean(row.user_id);
    if (id || label) people.set(id || label, { id, label, self: row.direction === 'self' });
    const sentences = clean(row.body).split(/(?<=[。！？!?])\s*|\n+/).filter(Boolean);
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i], flags = flagsFor(sentence);
      pieces.push({ text: sentence, messageId: row.id, stamp: row.stamp,
        flags, priority: flags.length * 3 + (i === sentences.length - 1 ? 1 : 0) });
    }
  }
  // Prefer corrections/unfinished commitments/results, then recent context.
  const ranked = pieces.sort((a, b) => b.priority - a.priority || b.stamp - a.stamp);
  const selected = [], seen = new Set(); let used = 0;
  for (const point of ranked) {
    if (seen.has(point.text)) continue;
    const available = Math.max(0, limit - used - 18);
    if (available < 35 || selected.length >= 7) break;
    const tooLong = point.text.length > available;
    // A shortened quotation is explicitly marked incomplete, not called a summary.
    const value = tooLong ? clip(point.text, available - 15) + '…〔长句节选，见原文〕' : point.text;
    selected.push({ text: value, messageId: point.messageId, stamp: point.stamp,
      flags: point.flags, truncated: tooLong });
    seen.add(point.text); used += value.length + 18;
  }
  selected.sort((a, b) => a.stamp - b.stamp || a.messageId - b.messageId);
  return { kind: 'evidence-extract', version: 1,
    time: { start: ordered[0]?.stamp || 0, end: ordered.at(-1)?.stamp || 0 },
    participants: [...people.values()].slice(0, 20), points: selected,
    sourceIds: [...new Set(selected.map(p => p.messageId))],
    omittedMessages: Math.max(0, total - new Set(selected.map(p => p.messageId)).size),
    summary: selected.map(p => '原句：' + p.text).join('\n') };
}

export function preferenceClaim(body) {
  const value = clean(body).replace(/[。！!]+$/, '');
  if (/[?？]|吗$|么$|如果|假如|比如|例如|以前|曾经|他说|她说|引用/.test(value)) return null;
  const match = /^我(?:现在|目前|其实|已经)?(不再喜欢|不喜欢|讨厌|喜欢)(.{1,32})$/.exec(value);
  if (!match) return null;
  const object = match[2].replace(/了$/, '').replace(/^(?:喝|吃|用|玩)/, '').trim();
  if (!object || /[，,；;：:“”"'、]|但是|而且|因为|和|或者/.test(object)) return null;
  return { slot: 'preference:' + object.toLowerCase(), value: match[1] === '喜欢' ? 'like' : 'dislike' };
}

export function renderEvidenceCard(card, limit = 420) {
  const ranked = [...(card?.points || [])].sort((a, b) => b.flags.length - a.flags.length || b.stamp - a.stamp);
  const selected = []; let used = 0;
  for (const point of ranked) {
    if (used + point.text.length + 4 > limit) continue;
    selected.push(point); used += point.text.length + 4;
  }
  if (!selected.length && ranked[0] && limit > 50) {
    return '原句节选：' + clip(ranked[0].text, limit - 30) + '…〔未完整展开，见原文〕';
  }
  return selected.sort((a, b) => a.stamp - b.stamp || a.messageId - b.messageId).map(p => '原句：' + p.text).join('\n');
}
