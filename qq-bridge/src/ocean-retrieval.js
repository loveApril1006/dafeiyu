// Read-only, bounded retrieval over the authoritative ocean store. The small
// concept lexicon is an explainable local fallback, not a semantic embedding.
const BODY_KINDS = new Set(['fact', 'event', 'experience', 'topic', 'thought', 'impression', 'reflection', 'selfTalk', 'review', 'memo', 'promise', 'diary']);
const STOP = new Set(['什么', '那个', '这个', '一下', '记得', '记不', '不记', '之前', '以前', '时候', '可以', '能不', '不能', '有没', '没有', '我们', '你们', '他们', '知道', '说说', '告诉', '关于', '一下', '一下子']);
const CONCEPTS = [
  ['失眠', '睡不着', '难以入睡'], ['熬夜', '晚睡'],
  ['生病', '身体不适', '不舒服'], ['难过', '伤心'], ['开心', '高兴'],
  ['担心', '忧虑'], ['约定', '说好了', '答应'], ['完成', '做完', '办妥'],
  ['电脑', '计算机'], ['图片', '图像'], ['音乐', '歌曲'],
];
const STAGES = [
  { stage: 'direct', label: '人物与关键词' },
  { stage: 'synonym', label: '本地词义线索' },
  { stage: 'fuzzy', label: '有限字面近似' },
  { stage: 'relation', label: '有来源的一跳关联' },
];
const trim = (value, max = 1200) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').normalize('NFKC').toLowerCase().trim().slice(0, max);
const unique = values => [...new Set(values)];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

// Existing ocean_fts indexes Chinese bigrams and complete Latin words.
function termsOf(value, max = 32) {
  const terms = [...value.matchAll(/[a-z0-9_]{2,40}/g)].map(match => match[0]);
  for (const run of value.match(/[\u4e00-\u9fff]{2,}/g) || []) for (let i = 0; i < run.length - 1; i++) if (!STOP.has(run.slice(i, i + 2))) terms.push(run.slice(i, i + 2));
  const all = unique(terms);
  if (all.length <= max) return all;
  // Retain terms throughout long questions, instead of always losing the end.
  return unique(Array.from({ length: max }, (_, i) => all[Math.floor(i * (all.length - 1) / (max - 1))]));
}
const matchQuery = terms => terms.map(term => '"' + term.replaceAll('"', '""') + '"').join(' OR ');
function phrasesOf(query) {
  return unique((query.match(/[a-z][a-z0-9_]{3,30}|[\u4e00-\u9fff]{3,16}/g) || []).map(phrase => phrase.replace(/^(?:你还记得|还记得|请问|你知道|关于|那个|上次|之前)/, '').replace(/(?:是什么|怎么样|还记得吗|了吗|的吗|吗)$/, '')).filter(phrase => phrase.length >= 3 && phrase.length <= 16)).slice(0, 4);
}
function withinOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
}
function fuzzyHit(phrases, body) {
  for (const phrase of phrases) {
    if (/^[a-z]/.test(phrase)) {
      for (const word of body.match(/[a-z][a-z0-9_]{2,31}/g) || []) if (word !== phrase && withinOne(phrase, word)) return { query: phrase, matched: word };
    } else {
      for (const run of body.match(/[\u4e00-\u9fff]{2,}/g) || []) for (const size of [phrase.length, phrase.length - 1, phrase.length + 1]) for (let i = 0; i + size <= run.length; i++) {
        const word = run.slice(i, i + size);
        if (word !== phrase && withinOne(phrase, word)) return { query: phrase, matched: word };
      }
    }
  }
  return null;
}

export function createOceanRetrieval({ db, scope, view, allowRow = () => true, now = Date.now }) {
  if (!db || typeof scope !== 'function' || typeof view !== 'function') throw Error('识海检索缺少主库接口');
  const fts = db.prepare(`SELECT n.*,bm25(ocean_fts) AS _rank FROM ocean_nodes n
    JOIN ocean_fts ON ocean_fts.rowid=n.seq
    WHERE n.channel=? AND n.role=? AND n.deleted=0 AND ocean_fts MATCH ?
    ORDER BY bm25(ocean_fts),n.stamp DESC,n.seq DESC LIMIT ? OFFSET ?`);
  const exactSubjects = db.prepare('SELECT * FROM ocean_nodes WHERE channel=? AND role=? AND deleted=0 AND subject=? ORDER BY pinned DESC,stamp DESC,seq DESC LIMIT 40');
  const recent = db.prepare('SELECT * FROM ocean_nodes WHERE channel=? AND role=? AND deleted=0 ORDER BY stamp DESC,seq DESC LIMIT 128');
  const linked = db.prepare(`SELECT n.*,e.kind AS _relation FROM ocean_edges e JOIN ocean_nodes n
    ON n.id=CASE WHEN e.a=? THEN e.b ELSE e.a END
    WHERE e.channel=? AND e.role=? AND (e.a=? OR e.b=?) AND n.channel=e.channel AND n.role=e.role AND n.deleted=0
    ORDER BY n.importance DESC,n.stamp DESC,n.seq DESC LIMIT 24`);

  function search(key, rawQuery, options = {}) {
    const parts = scope(key);
    if (!Array.isArray(parts) || parts.length !== 2 || !/^(private|group):[1-9]\d*$/.test(String(parts[0])) || typeof parts[1] !== 'string') throw Error('识海检索范围无效');
    const normalized = trim(rawQuery, 20000), query = normalized.length <= 1200 ? normalized : normalized.slice(0, 700) + ' ' + normalized.slice(-499);
    const terms = termsOf(query), excluded = new Set(options.excludeIds || []), subject = String(options.subject || '');
    const limit = clamp(Math.floor(Number(options.limit) || 24), 1, 60), budget = Math.max(0, Number.isFinite(options.budget) ? options.budget : 2400);
    const steps = STAGES.map(stage => ({ ...stage, count: 0 })), found = new Map(), anchors = new Map(), expansions = [];
    const phrases = phrasesOf(query), explicitIds = unique(query.match(/(?<!\d)[1-9]\d{4,19}(?!\d)/g) || []).slice(0, 4);
    if (!terms.length || budget < 100) return { candidates: [], steps, terms, expansions };
    const decode = row => {
      if (!row || row.deleted || row.channel !== parts[0] || row.role !== parts[1] || excluded.has(row.id)) return null;
      try {
        const memory = view(row);
        if ((!options.includeArchive && (memory.supersededBy || memory.stage === 'archive' && !memory.pinned)) || !allowRow(row, memory, options)) return null;
        return memory;
      } catch { return null; }
    };
    const quality = (row, memory) => {
      const age = Math.max(0, now() - Number(row.stamp || 0));
      return clamp(Number(memory.importance) || 0, 0, 1) * .12 + clamp(Number(memory.activation) || 0, 0, 1) * .1 + .05 / (1 + age / 86400000)
        + (memory.confidence === 'confirmed' ? .06 : memory.confidence === 'inferred' ? -.06 : 0)
        + (memory.edited ? .04 : 0) + (subject && row.subject === subject ? .12 : 0);
    };
    function add(row, stage, base, reasons, via) {
      const memory = decode(row); if (!memory) return;
      const score = base + quality(row, memory), previous = found.get(row.id);
      if (memory.kind === 'person') { if (!anchors.has(row.id)) anchors.set(row.id, { row, memory, score, stage }); return; }
      if (!BODY_KINDS.has(memory.kind)) return;
      const candidate = { row, memory, score: Math.round(score * 1000) / 1000, reasons, stage, ...(via ? { via } : {}) };
      if (!previous) { found.set(row.id, candidate); steps.find(step => step.stage === stage).count++; }
      else if (score > previous.score) { steps.find(step => step.stage === previous.stage).count--; steps.find(step => step.stage === stage).count++; found.set(row.id, candidate); }
    }
    function lexical(searchTerms, stage, evidence) {
      const expression = matchQuery(searchTerms); if (!expression) return;
      const size = Math.max(40, Math.min(128, limit * 4));
      // Permission filters can hide a run of records. Read at most three ranked
      // pages, never an unbounded whole-store scan or an insertion-order prefix.
      for (let page = 0; page < 3; page++) {
        const rows = fts.all(...parts, expression, size, page * size);
        for (let index = 0; index < rows.length; index++) {
          const row = rows[index], value = trim(row.title + ' ' + row.body, 18000), matches = searchTerms.filter(term => value.includes(term));
          const exact = phrases.find(phrase => value.includes(phrase)), base = (stage === 'direct' ? 1 : .7) + Math.min(.45, matches.length / Math.max(1, searchTerms.length) * .45)
            + (stage === 'direct' && exact ? .2 : 0) + .08 / (1 + page * size + index);
          add(row, stage, base, stage === 'direct' ? [exact ? '字面线索：' + exact : '关键词：' + matches.slice(0, 4).join('、')] : [evidence]);
        }
        if (rows.length < size || found.size >= Math.min(limit, 12)) break;
      }
    }
    for (const id of explicitIds) for (const row of exactSubjects.all(...parts, id)) add(row, 'direct', 1.4, ['明确 QQ 身份：' + id]);
    lexical(terms, 'direct');
    const directCount = found.size;
    if (directCount < Math.min(limit, 6)) {
      for (const group of CONCEPTS) {
        const from = group.find(term => query.includes(term)); if (!from) continue;
        for (const to of group) if (to !== from && !query.includes(to)) expansions.push({ from, to, type: 'local-concept' });
      }
      const selected = expansions.slice(0, 8);
      if (selected.length) lexical(unique(selected.flatMap(item => termsOf(item.to, 8))).slice(0, 24), 'synonym', '本地词义线索：' + selected.map(({ from, to }) => from + '→' + to).join('；'));
    }
    if (found.size < Math.min(limit, 4) && phrases.length && !explicitIds.length && budget >= 400) {
      let accepted = 0;
      for (const row of recent.all(...parts)) {
        if (found.has(row.id) || !BODY_KINDS.has(row.kind) || !decode(row)) continue;
        const hit = fuzzyHit(phrases, trim(row.title + ' ' + row.body, 900));
        if (hit) { add(row, 'fuzzy', .42, ['字面近似（需核对）：' + hit.query + '≈' + hit.matched]); if (++accepted >= 8) break; }
      }
    }
    if (budget >= 500) {
      const seeds = [...anchors.values(), ...[...found.values()].filter(item => item.stage === 'direct' || item.stage === 'synonym')].sort((a, b) => b.score - a.score).slice(0, 4);
      let total = 0;
      for (const seed of seeds) {
        // Recheck the anchor's source permissions immediately before expansion.
        if (!decode(seed.row)) continue;
        let count = 0;
        for (const row of linked.all(seed.row.id, ...parts, seed.row.id, seed.row.id)) {
          if (found.has(row.id) || !BODY_KINDS.has(row.kind)) continue;
          const memory = decode(row); if (!memory) continue;
          add(row, 'relation', .3, ['沿已记录的“' + row._relation + '”关系回溯；关联不表示事实已核验'], { id: seed.row.id, title: seed.memory.title, relation: row._relation });
          count++; total++; if (count >= 2 || total >= 6) break;
        }
        if (total >= 6) break;
      }
    }
    const candidates = [...found.values()].sort((a, b) => b.score - a.score || b.memory.updated - a.memory.updated || b.row.seq - a.row.seq).slice(0, limit);
    return { candidates, steps, terms, expansions: expansions.slice(0, 8) };
  }
  return { search };
}
