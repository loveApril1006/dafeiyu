async function loadSocialForm() {
  try {
    const s = await api('/api/social');
    const c = s.config;
    document.getElementById('sTrigger').value = c.triggerProbability;
    document.getElementById('sCheckMin').value = Math.round((c.activeCheckMinMs || 0) / 1000);
    document.getElementById('sCheckMax').value = Math.round((c.activeCheckMaxMs || 0) / 1000);
    document.getElementById('sActiveDelayMin').value = Math.round((c.activeReplyDelayMinMs || 0) / 1000);
    document.getElementById('sActiveDelayMax').value = Math.round((c.activeReplyDelayMaxMs || 0) / 1000);
    document.getElementById('sActiveDurationEnabled').checked = c.activeDurationEnabled !== false;
    document.getElementById('sActiveDurationMin').value = Math.round((c.activeDurationMinMs || 0) / 60000);
    document.getElementById('sActiveDurationMax').value = Math.round((c.activeDurationMaxMs || 0) / 60000);
    document.getElementById('sIdleWindow').value = Math.round((c.idleWindowMs || 0) / 60000);
    document.getElementById('sIdleRetry').value = c.idleRetryProbability;
    document.getElementById('sIdleWait').value = Math.round((c.idleRetryWaitMs || 0) / 60000);
    document.getElementById('sSkipProb').value = c.skipProbability ?? 0.15;
    document.getElementById('sSurrenderProb').value = c.surrenderProbability ?? 0.08;
    document.getElementById('sContextWindow').value = c.contextWindow;
    document.getElementById('sMaxChars').value = c.maxReplyChars ?? 500;
    document.getElementById('sBurstEnabled').checked = c.burstEnabled !== false;
    document.getElementById('sBurstIntervalMin').value = c.burstIntervalMinMs ?? 1000;
    document.getElementById('sBurstIntervalMax').value = c.burstIntervalMaxMs ?? 3000;
    document.getElementById('sLongGapProb').value = c.longGapProbability ?? 0.1;
    document.getElementById('sLongGapMin').value = c.longGapMinMs ?? 2500;
    document.getElementById('sLongGapMax').value = c.longGapMaxMs ?? 5000;
    document.getElementById('sKeywords').value = (c.mustReplyKeywords || []).join(', ');
    document.getElementById('sProactiveEnabled').checked = c.proactiveEnabled !== false;
    document.getElementById('sProactiveIdle').value = Math.round((c.proactiveIdleThresholdMs || 0) / 60000);
    document.getElementById('sProactiveCheckMin').value = Math.round((c.proactiveCheckMinMs || 0) / 60000);
    document.getElementById('sProactiveCheckMax').value = Math.round((c.proactiveCheckMaxMs || 0) / 60000);
    document.getElementById('sProactiveProb').value = c.proactiveProbability;
  } catch {}
}

// 每 3 秒只刷新状态徽章/摘要缓冲，不碰输入框
async function refreshSocialStatus() {
  try {
    const s = await api('/api/social');
    const buff = Object.entries(s.pendingSummaries || {}).map(([k, n]) => k + ':' + n).join('  ') || '无';
    const phaseLabel = { idle: '观望', active: '活跃', probing: '试探', exiting: '退场中' };
    const phaseClass = { idle: 'pill g', active: 'pill b', probing: 'pill r', exiting: 'pill' };
    const stateEntries = Object.entries(s.states || {});
    const sel = document.getElementById('sStateKey');
    const prevSel = sel.value;
    sel.innerHTML = '<option value="">选择会话</option>';
    for (const [k] of stateEntries) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      sel.appendChild(opt);
    }
    if (prevSel && [...sel.options].some(o => o.value === prevSel)) sel.value = prevSel;
    let html = '摘要缓冲: ' + esc(buff) + '<br>状态:';
    if (!stateEntries.length) html += ' 暂无（发过消息的群会显示状态）';
    for (const [k, v] of stateEntries) {
      html += ` <span class="${phaseClass[v.phase] || 'pill'}">${esc(k)} · ${phaseLabel[v.phase] || esc(v.phase)}</span>`;
    }
    document.getElementById('socialStatus').innerHTML = html;
  } catch {}
}

document.getElementById('socialSave').addEventListener('click', async () => {
  const n = (id) => Number(document.getElementById(id).value);
  const r = await api('/api/social', 'POST', {
    triggerProbability: Math.min(1, Math.max(0, n('sTrigger'))),
    activeCheckMinMs: Math.max(5, n('sCheckMin')) * 1000,
    activeCheckMaxMs: Math.max(5, n('sCheckMax')) * 1000,
    activeReplyDelayMinMs: Math.max(0, n('sActiveDelayMin')) * 1000,
    activeReplyDelayMaxMs: Math.max(0, n('sActiveDelayMax')) * 1000,
    activeDurationEnabled: document.getElementById('sActiveDurationEnabled').checked,
    activeDurationMinMs: Math.max(1, n('sActiveDurationMin')) * 60000,
    activeDurationMaxMs: Math.max(1, n('sActiveDurationMax')) * 60000,
    idleWindowMs: Math.max(1, n('sIdleWindow')) * 60000,
    idleRetryProbability: Math.min(1, Math.max(0, n('sIdleRetry'))),
    idleRetryWaitMs: Math.max(1, n('sIdleWait')) * 60000,
    skipProbability: Math.min(1, Math.max(0, n('sSkipProb'))),
    surrenderProbability: Math.min(1, Math.max(0, n('sSurrenderProb'))),
    contextWindow: Math.min(100, Math.max(1, n('sContextWindow'))),
    maxReplyChars: Math.max(1, n('sMaxChars')),
    burstEnabled: document.getElementById('sBurstEnabled').checked,
    burstIntervalMinMs: Math.max(0, n('sBurstIntervalMin')),
    burstIntervalMaxMs: Math.max(0, n('sBurstIntervalMax')),
    longGapProbability: Math.min(1, Math.max(0, n('sLongGapProb'))),
    longGapMinMs: Math.max(0, n('sLongGapMin')),
    longGapMaxMs: Math.max(0, n('sLongGapMax')),
    mustReplyKeywords: document.getElementById('sKeywords').value.split(/[,，]/).map(x => x.trim()).filter(Boolean),
    proactiveEnabled: document.getElementById('sProactiveEnabled').checked,
    proactiveIdleThresholdMs: Math.max(1, n('sProactiveIdle')) * 60000,
    proactiveCheckMinMs: Math.max(1, n('sProactiveCheckMin')) * 60000,
    proactiveCheckMaxMs: Math.max(1, n('sProactiveCheckMax')) * 60000,
    proactiveProbability: Math.min(1, Math.max(0, n('sProactiveProb')))
  });
  document.getElementById('socialMsg').textContent = r.ok ? '✅ 已保存' : ('❌ ' + (r.error || '失败'));
  document.getElementById('socialMsg').className = r.ok ? 'meta ok' : 'meta err';
  if (r.ok) { loadSocialForm(); refreshSocialStatus(); }
});
document.getElementById('socialFlush').addEventListener('click', async () => {
  const r = await api('/api/social/flush', 'POST', {});
  document.getElementById('socialMsg').textContent = r.ok ? '✅ 已触发摘要投喂' : ('❌ ' + (r.error || '失败'));
  document.getElementById('socialMsg').className = r.ok ? 'meta ok' : 'meta err';
});
async function setSocialPhase(phase) {
  const key = document.getElementById('sStateKey').value;
  if (!key) { alert('请先选择会话'); return; }
  const r = await api('/api/social/state', 'POST', { key, phase });
  document.getElementById('socialMsg').textContent = r.ok ? ('✅ 已设为' + (phase === 'active' ? '活跃' : '观望')) : ('❌ ' + (r.error || '失败'));
  document.getElementById('socialMsg').className = r.ok ? 'meta ok' : 'meta err';
  refreshSocialStatus();
}
document.getElementById('sStateActive').addEventListener('click', () => setSocialPhase('active'));
document.getElementById('sStateIdle').addEventListener('click', () => setSocialPhase('idle'));

let slangEntriesCache = [];
let slangSelected = new Set();
let slangActiveTab = 'candidate';
let slangModalId = null;
let slangModalMode = 'confirm'; // confirm | edit

function slangStatusLabel(status) {
  return { candidate: '候选', confirmed: '已确认', rejected: '已拒绝' }[status] || esc(status);
}
function slangStatusClass(status) {
  return { candidate: 'pill b', confirmed: 'pill g', rejected: 'pill r' }[status] || 'pill';
}
function slangSourceLabel(e) {
  if (e.source === 'manual') return '手动';
  if (Array.isArray(e.evidence) && e.evidence.some((ev) => ev.sender === 'AI提交')) return 'AI提交';
  return '自动提取';
}
function slangEvidenceHtml(e) {
  return Array.isArray(e.evidence) && e.evidence.length
    ? e.evidence.slice(-2).map((ev) => `<span class="meta">${esc(String(ev.sender || '未知'))}：${esc(String(ev.text || '').slice(0, 30))}</span>`).join('<br>')
    : '<span class="meta">—</span>';
}
function slangSourcesHtml(e) {
  return Array.isArray(e.sources) && e.sources.length
    ? e.sources.slice(0, 5).map((s) => `<span class="meta">🔗 ${esc(s)}</span>`).join('<br>')
    : '';
}
function slangSearchFields(e) {
  return [e.content, e.meaning, e.usage, e.example, e.risk, Array.isArray(e.sources) ? e.sources.join(' ') : '', Array.isArray(e.evidence) ? e.evidence.map((x) => x.text || '').join(' ') : ''].join(' ').toLowerCase();
}
function getSlangLimit() {
  const id = slangActiveTab === 'candidate' ? 'slangLimitCand' : slangActiveTab === 'confirmed' ? 'slangLimitConfirmed' : 'slangLimitRejected';
  return Math.max(10, Number(document.getElementById(id)?.value) || 100);
}
function getSlangSearch() {
  const id = slangActiveTab === 'candidate' ? 'slangSearchCand' : slangActiveTab === 'confirmed' ? 'slangSearchConfirmed' : 'slangSearchRejected';
  return String(document.getElementById(id)?.value || '').trim().toLowerCase();
}
function selectedIdsForStatus(status) {
  return [...slangSelected].filter((id) => slangEntriesCache.some((e) => e.id === id && e.status === status));
}
function setSlangMsg(text, ok = true) {
  const msg = document.getElementById('slangMsg');
  if (!msg) return;
  msg.textContent = text;
  msg.className = ok ? 'meta ok' : 'meta err';
}
function setSlangTab(tab) {
  slangActiveTab = tab;
  document.querySelectorAll('.slang-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.slangTab === tab));
  document.querySelectorAll('.slang-panel').forEach((panel) => panel.classList.toggle('active', panel.id === 'slangPanel' + tab[0].toUpperCase() + tab.slice(1)));
  renderSlangPanel();
}
function updateSlangSelectAll(status) {
  const id = status === 'candidate' ? 'slangCandidateSelectAll' : status === 'confirmed' ? 'slangConfirmedSelectAll' : 'slangRejectedSelectAll';
  const el = document.getElementById(id);
  if (!el) return;
  const list = slangEntriesCache.filter((e) => e.status === status);
  const q = getSlangSearch();
  const filtered = q ? list.filter((e) => slangSearchFields(e).includes(q)) : list;
  el.checked = filtered.length > 0 && filtered.every((e) => slangSelected.has(e.id));
  el.indeterminate = filtered.some((e) => slangSelected.has(e.id)) && !el.checked;
}

function renderSlangPanel() {
  const status = slangActiveTab;
  const containerId = status === 'candidate' ? 'slangCandidateList' : status === 'confirmed' ? 'slangConfirmedList' : 'slangRejectedList';
  const box = document.getElementById(containerId);
  if (!box) return;
  const list = slangEntriesCache.filter((e) => e.status === status);
  const q = getSlangSearch();
  const filtered = q ? list.filter((e) => slangSearchFields(e).includes(q)) : list;
  if (!filtered.length) {
    box.innerHTML = '<div class="meta" style="padding:8px">' + (list.length ? '没有符合条件的词条' : (status === 'candidate' ? '暂无候选黑话，等 DSH 自动提取、AI 提交或手动添加' : status === 'confirmed' ? '暂无已确认黑话' : '暂无已拒绝词条')) + '</div>';
    updateSlangSelectAll(status);
    return;
  }
  const limit = getSlangLimit();
  const shown = filtered.slice(0, limit);
  let html = `<div class="meta" style="padding:6px 8px">共 ${filtered.length} 条，显示 ${shown.length} 条（可滚动查找）</div>`;
  html += '<table><tr><th>选择</th><th>词条</th><th>次数</th><th>来源</th><th>含义 / 用法 / 示例</th><th>参考来源</th><th>语境证据</th><th>操作</th></tr>';
  for (const e of shown) {
    const meaning = e.meaning ? esc(e.meaning) : (status === 'candidate' ? '<span class="meta">待研究</span>' : '<span class="meta">无</span>');
    const checked = slangSelected.has(e.id) ? ' checked' : '';
    const actions = [];
    if (status === 'candidate') {
      actions.push(`<button class="small" data-slang-confirm="${esc(e.id)}">确认</button>`);
      actions.push(`<button class="small" data-slang-edit="${esc(e.id)}">编辑</button>`);
      actions.push(`<button class="small" data-slang-reject="${esc(e.id)}">拒绝</button>`);
    } else if (status === 'confirmed') {
      actions.push(`<button class="small" data-slang-edit="${esc(e.id)}">编辑</button>`);
    } else {
      actions.push(`<button class="small" data-slang-restore="${esc(e.id)}">恢复候选</button>`);
    }
    actions.push(`<button class="small danger" data-slang-del="${esc(e.id)}">删</button>`);
    html += `<tr>
      <td><input type="checkbox" data-slang-select="${esc(e.id)}"${checked}></td>
      <td><b>${esc(e.content)}</b><br><span class="${slangStatusClass(status)}">${slangStatusLabel(status)}</span></td>
      <td>${esc(e.count)}</td>
      <td>${esc(slangSourceLabel(e))}</td>
      <td>${meaning}${e.usage ? '<br><span class="meta">用法：' + esc(e.usage) + '</span>' : ''}${e.example ? '<br><span class="meta">例：' + esc(e.example) + '</span>' : ''}${e.risk ? '<br><span class="meta">风险：' + esc(e.risk) + '</span>' : ''}</td>
      <td>${slangSourcesHtml(e) || '<span class="meta">—</span>'}</td>
      <td>${slangEvidenceHtml(e)}</td>
      <td class="row">${actions.join('')}</td>
    </tr>`;
  }
  box.innerHTML = html + '</table>';
  box.querySelectorAll('[data-slang-select]').forEach((cb) => cb.addEventListener('change', () => {
    const id = cb.dataset.slangSelect;
    if (cb.checked) slangSelected.add(id); else slangSelected.delete(id);
    updateSlangSelectAll(status);
  }));
  box.querySelectorAll('[data-slang-confirm]').forEach((btn) => btn.addEventListener('click', () => openSlangModal(btn.dataset.slangConfirm, 'confirm')));
  box.querySelectorAll('[data-slang-edit]').forEach((btn) => btn.addEventListener('click', () => openSlangModal(btn.dataset.slangEdit, 'edit')));
  box.querySelectorAll('[data-slang-reject]').forEach((btn) => btn.addEventListener('click', async () => {
    const r2 = await api('/api/slang/' + btn.dataset.slangReject + '/reject', 'POST', {});
    if (!r2.ok) alert(r2.error || '拒绝失败');
    setSlangMsg(r2.ok ? '✅ 已拒绝' : ('❌ ' + (r2.error || '失败')), r2.ok);
    refreshSlang();
  }));
  box.querySelectorAll('[data-slang-restore]').forEach((btn) => btn.addEventListener('click', async () => {
    const e = slangEntriesCache.find((x) => x.id === btn.dataset.slangRestore);
    if (!e) return;
    const r2 = await api('/api/slang/' + e.id, 'PATCH', { status: 'candidate' });
    if (!r2.ok) alert(r2.error || '恢复失败');
    setSlangMsg(r2.ok ? '✅ 已恢复为候选' : ('❌ ' + (r2.error || '失败')), r2.ok);
    refreshSlang();
  }));
  box.querySelectorAll('[data-slang-del]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('确定删除该黑话？')) return;
    const r2 = await api('/api/slang/' + btn.dataset.slangDel, 'DELETE', {});
    if (!r2.ok) alert(r2.error || '删除失败');
    setSlangMsg(r2.ok ? '✅ 已删除' : ('❌ ' + (r2.error || '失败')), r2.ok);
    slangSelected.delete(btn.dataset.slangDel);
    refreshSlang();
  }));
  updateSlangSelectAll(status);
}

async function refreshSlang() {
  try {
    const r = await api('/api/slang');
    slangEntriesCache = r.entries || [];
    renderSlangPanel();
  } catch (e) {
    const box = document.getElementById('slangCandidateList');
    if (box) box.innerHTML = '<span class="meta">加载失败</span>';
  }
}

function openSlangModal(id, mode) {
  const e = slangEntriesCache.find((x) => x.id === id);
  if (!e) return;
  slangModalId = id;
  slangModalMode = mode;
  document.getElementById('slangModalTitle').textContent = mode === 'confirm' ? `确认黑话：${e.content}` : `编辑黑话：${e.content}`;
  document.getElementById('slangModalContent').textContent = mode === 'confirm'
    ? '你可以直接填写含义/用法并转正，也可以先送 DSH 深度联网研究，研究结果回来后在此处删改再确认。'
    : '修改后保存；候选不会转正，已确认仍保持已确认。';
  document.getElementById('slangModalMeaning').value = e.meaning || '';
  document.getElementById('slangModalUsage').value = e.usage || '';
  document.getElementById('slangModalExample').value = e.example || '';
  document.getElementById('slangModalRisk').value = e.risk || '';
  document.getElementById('slangModalSources').value = Array.isArray(e.sources) ? e.sources.join('\n') : '';
  document.getElementById('slangModalDirectConfirm').textContent = mode === 'confirm' ? '直接确认（转正）' : '保存修改';
  document.getElementById('slangModalSendResearch').style.display = mode === 'confirm' && e.status === 'candidate' ? '' : 'none';
  document.getElementById('slangModalOverlay').classList.add('open');
}
function closeSlangModal() {
  document.getElementById('slangModalOverlay').classList.remove('open');
  slangModalId = null;
}
function readSlangModalPayload() {
  return {
    meaning: document.getElementById('slangModalMeaning').value.trim(),
    usage: document.getElementById('slangModalUsage').value.trim(),
    example: document.getElementById('slangModalExample').value.trim(),
    risk: document.getElementById('slangModalRisk').value.trim(),
    sources: document.getElementById('slangModalSources').value.split(/\n/).map((s) => s.trim()).filter(Boolean)
  };
}

document.querySelectorAll('.slang-tab').forEach((btn) => btn.addEventListener('click', () => setSlangTab(btn.dataset.slangTab)));
document.getElementById('slangSearchCand').addEventListener('input', renderSlangPanel);
document.getElementById('slangSearchConfirmed').addEventListener('input', renderSlangPanel);
document.getElementById('slangSearchRejected').addEventListener('input', renderSlangPanel);
document.getElementById('slangLimitCand').addEventListener('change', renderSlangPanel);
document.getElementById('slangLimitConfirmed').addEventListener('change', renderSlangPanel);
document.getElementById('slangLimitRejected').addEventListener('change', renderSlangPanel);
document.getElementById('slangCandidateSelectAll').addEventListener('change', (e) => {
  const list = slangEntriesCache.filter((x) => x.status === 'candidate');
  const q = getSlangSearch();
  const filtered = q ? list.filter((x) => slangSearchFields(x).includes(q)) : list;
  for (const x of filtered) { if (e.target.checked) slangSelected.add(x.id); else slangSelected.delete(x.id); }
  renderSlangPanel();
});
document.getElementById('slangConfirmedSelectAll').addEventListener('change', (e) => {
  const list = slangEntriesCache.filter((x) => x.status === 'confirmed');
  const q = getSlangSearch();
  const filtered = q ? list.filter((x) => slangSearchFields(x).includes(q)) : list;
  for (const x of filtered) { if (e.target.checked) slangSelected.add(x.id); else slangSelected.delete(x.id); }
  renderSlangPanel();
});
document.getElementById('slangRejectedSelectAll').addEventListener('change', (e) => {
  const list = slangEntriesCache.filter((x) => x.status === 'rejected');
  const q = getSlangSearch();
  const filtered = q ? list.filter((x) => slangSearchFields(x).includes(q)) : list;
  for (const x of filtered) { if (e.target.checked) slangSelected.add(x.id); else slangSelected.delete(x.id); }
  renderSlangPanel();
});
document.getElementById('slangBatchResearch').addEventListener('click', async () => {
  const ids = selectedIdsForStatus('candidate');
  if (!ids.length) { alert('请先勾选要研究的候选词'); return; }
  const r = await api('/api/slang/research', 'POST', { ids });
  setSlangMsg(r.ok ? `✅ 已送 ${r.count} 条候选到 DSH 深度联网研究，完成后刷新查看结果` : ('❌ ' + (r.error || '失败')), r.ok);
  if (r.ok) refreshSlang();
});
document.getElementById('slangBatchConfirm').addEventListener('click', async () => {
  const ids = selectedIdsForStatus('candidate');
  if (!ids.length) { alert('请先勾选要确认的候选词'); return; }
  if (!confirm(`确定批量确认 ${ids.length} 条候选？缺少含义的会被跳过。`)) return;
  const r = await api('/api/slang/batch-confirm', 'POST', { ids });
  setSlangMsg(r.ok ? `✅ 已确认 ${r.confirmedCount} 条，跳过 ${r.skippedCount} 条` : ('❌ ' + (r.error || '失败')), r.ok);
  if (r.ok) { slangSelected.clear(); refreshSlang(); }
});
document.getElementById('slangBatchReject').addEventListener('click', async () => {
  const ids = selectedIdsForStatus('candidate');
  if (!ids.length) { alert('请先勾选要拒绝的候选词'); return; }
  if (!confirm(`确定拒绝 ${ids.length} 条候选？`)) return;
  const r = await api('/api/slang/batch-reject', 'POST', { ids });
  setSlangMsg(r.ok ? `✅ 已拒绝 ${r.rejectedCount} 条` : ('❌ ' + (r.error || '失败')), r.ok);
  if (r.ok) { slangSelected.clear(); refreshSlang(); }
});
document.getElementById('slangBatchDeleteCand').addEventListener('click', async () => {
  const ids = selectedIdsForStatus('candidate');
  if (!ids.length) { alert('请先勾选要删除的候选词'); return; }
  if (!confirm(`确定删除 ${ids.length} 条候选？此操作不可恢复！`)) return;
  const r = await api('/api/slang/batch-delete', 'POST', { ids });
  setSlangMsg(r.ok ? `✅ 已删除 ${r.removedCount} 条候选` : ('❌ ' + (r.error || '失败')), r.ok);
  if (r.ok) { slangSelected.clear(); refreshSlang(); }
});
document.getElementById('slangBatchDeleteConfirmed').addEventListener('click', async () => {
  const ids = selectedIdsForStatus('confirmed');
  if (!ids.length) { alert('请先勾选要删除的已确认词条'); return; }
  if (!confirm(`确定删除 ${ids.length} 条已确认黑话？此操作不可恢复！`)) return;
  const r = await api('/api/slang/batch-delete', 'POST', { ids });
  setSlangMsg(r.ok ? `✅ 已删除 ${r.removedCount} 条已确认` : ('❌ ' + (r.error || '失败')), r.ok);
  if (r.ok) { slangSelected.clear(); refreshSlang(); }
});
document.getElementById('slangBatchDeleteRejected').addEventListener('click', async () => {
  const ids = selectedIdsForStatus('rejected');
  if (!ids.length) { alert('请先勾选要删除的已拒绝词条'); return; }
  if (!confirm(`确定删除 ${ids.length} 条已拒绝词条？此操作不可恢复！`)) return;
  const r = await api('/api/slang/batch-delete', 'POST', { ids });
  setSlangMsg(r.ok ? `✅ 已删除 ${r.removedCount} 条已拒绝` : ('❌ ' + (r.error || '失败')), r.ok);
  if (r.ok) { slangSelected.clear(); refreshSlang(); }
});
document.getElementById('slangBatchRestore').addEventListener('click', async () => {
  const ids = selectedIdsForStatus('rejected');
  if (!ids.length) { alert('请先勾选要恢复的已拒绝词条'); return; }
  let okCount = 0;
  for (const id of ids) {
    const r = await api('/api/slang/' + id, 'PATCH', { status: 'candidate' });
    if (r.ok) okCount++;
  }
  setSlangMsg(`✅ 已恢复 ${okCount}/${ids.length} 条为候选`);
  if (okCount) { slangSelected.clear(); refreshSlang(); }
});
document.getElementById('slangModalDirectConfirm').addEventListener('click', async () => {
  if (!slangModalId) return;
  const payload = readSlangModalPayload();
  if (!payload.meaning) { alert('请先填写含义，确认后才会注入 AI 上下文'); return; }
  const e = slangEntriesCache.find((x) => x.id === slangModalId);
  if (!e) return;
  const path = slangModalMode === 'confirm' ? `/api/slang/${e.id}/confirm` : `/api/slang/${e.id}`;
  const r2 = await api(path, slangModalMode === 'confirm' ? 'POST' : 'PATCH', payload);
  if (!r2.ok) alert(r2.error || '保存失败');
  setSlangMsg(r2.ok ? (slangModalMode === 'confirm' ? '✅ 已确认转正' : '✅ 已保存') : ('❌ ' + (r2.error || '失败')), r2.ok);
  closeSlangModal();
  refreshSlang();
});
document.getElementById('slangModalSendResearch').addEventListener('click', async () => {
  if (!slangModalId) return;
  const r = await api('/api/slang/research', 'POST', { ids: [slangModalId] });
  setSlangMsg(r.ok ? `✅ 已送「${slangEntriesCache.find((x) => x.id === slangModalId)?.content || ''}」到 DSH 深度联网研究，稍后刷新查看结果` : ('❌ ' + (r.error || '失败')), r.ok);
  closeSlangModal();
  refreshSlang();
});
document.getElementById('slangModalCancel').addEventListener('click', closeSlangModal);
document.getElementById('slangModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'slangModalOverlay') closeSlangModal(); });

document.getElementById('slangAdd').addEventListener('click', async () => {
  const content = document.getElementById('slangContent').value.trim();
  const meaning = document.getElementById('slangMeaning').value.trim();
  const usage = document.getElementById('slangUsage').value.trim();
  const example = document.getElementById('slangExample').value.trim();
  if (!content) { alert('词条不能为空'); return; }
  const r = await api('/api/slang', 'POST', { content, meaning, usage, example });
  document.getElementById('slangMsg').textContent = r.ok ? '✅ 已添加' : ('❌ ' + (r.error || '失败'));
  document.getElementById('slangMsg').className = r.ok ? 'meta ok' : 'meta err';
  if (r.ok) {
    document.getElementById('slangContent').value = '';
    document.getElementById('slangMeaning').value = '';
    document.getElementById('slangUsage').value = '';
    document.getElementById('slangExample').value = '';
    refreshSlang();
  }
});
document.getElementById('slangExtract').addEventListener('click', async () => {
  const r = await api('/api/slang/extract', 'POST', {});
  setSlangMsg(r.ok ? '✅ 已触发提取' : ('❌ ' + (r.error || '失败')), r.ok);
});
document.getElementById('slangResearch').addEventListener('click', async () => {
  const r = await api('/api/slang/research', 'POST', {});
  setSlangMsg(r.ok ? ('✅ 已触发研究 ' + r.count + ' 条') : ('❌ ' + (r.error || '失败')), r.ok);
});
function loadSlangConfig() {
  api('/api/slang').then(r => {
    const c = r.config || {};
    document.getElementById('slangEnabled').checked = c.enabled !== false;
    document.getElementById('slangExtractMin').value = c.extractMinMessages ?? 10;
    document.getElementById('slangCooldown').value = c.extractCooldownMs ?? 300000;
    document.getElementById('slangThresholds').value = (c.inferenceThresholds || [2, 4, 8]).join(', ');
    document.getElementById('slangInjectMax').value = c.injectMax ?? 8;
    document.getElementById('slangLearnerPreset').value = c.learnerPreset || 'qq-chat';
    document.getElementById('slangWorkspaceTitle').value = c.workspaceTitle || 'QQ 黑话学习';
    document.getElementById('slangAutoResearch').checked = c.autoResearch !== false;
  }).catch(() => {});
}
document.getElementById('slangConfigSave').addEventListener('click', async () => {
  const r = await api('/api/slang/config', 'POST', {
    enabled: document.getElementById('slangEnabled').checked,
    extractMinMessages: Number(document.getElementById('slangExtractMin').value) || 10,
    extractCooldownMs: Number(document.getElementById('slangCooldown').value) || 300000,
    inferenceThresholds: document.getElementById('slangThresholds').value.split(/[,，\s]+/).map(Number).filter(Boolean),
    injectMax: Number(document.getElementById('slangInjectMax').value) || 8,
    learnerPreset: document.getElementById('slangLearnerPreset').value.trim(),
    workspaceTitle: document.getElementById('slangWorkspaceTitle').value.trim(),
    autoResearch: document.getElementById('slangAutoResearch').checked
  });
  const msg = document.getElementById('slangConfigMsg');
  msg.textContent = r.ok ? '✅ 已保存' : ('❌ ' + (r.error || '失败'));
  msg.className = r.ok ? 'meta ok' : 'meta err';
  if (r.ok) loadSlangConfig();
});

function loadSecurity() {
  api('/api/security').then(r => {
    document.getElementById('secInterceptNotify').checked = r.security?.interceptNotify !== false;
    // state/ 的 ACL 是否收紧（Windows 上需要管理员权限，未提权时会失败）。
    // 明确警示 + 给出可复制的命令，而不是让用户以为已经安全。
    const warn = document.getElementById('stateDirWarn');
    const hardened = r.stateDir?.hardened;
    if (hardened === false) {
      document.getElementById('stateDirPath').textContent = r.stateDir?.path || 'state/';
      document.getElementById('stateDirCmd').textContent = r.stateDir?.manualCommand || '';
      warn.style.display = '';
    } else {
      warn.style.display = 'none';
    }
  }).catch(() => {});
}
document.getElementById('secSave').addEventListener('click', async () => {
  const r = await api('/api/security', 'POST', { interceptNotify: document.getElementById('secInterceptNotify').checked });
  const msg = document.getElementById('secMsg');
  msg.textContent = r.ok ? '✅ 已保存' : ('❌ ' + (r.error || '失败'));
  msg.className = r.ok ? 'meta ok' : 'meta err';
  if (r.ok) loadSecurity();
});
document.getElementById('stateDirReharden').addEventListener('click', async () => {
  const msg = document.getElementById('stateDirMsg');
  msg.textContent = '检测中…';
  const r = await api('/api/security', 'POST', { rehardenStateDir: true });
  msg.textContent = r.hardened === true ? '✅ 权限已收紧' : '❌ 仍未收紧（改 ACL 需要管理员权限；请按上面两种做法之一操作后复检）';
  msg.className = r.hardened === true ? 'meta ok' : 'meta err';
  loadSecurity();
});

async function changeConsoleToken(generate) {
  const input = document.getElementById('consoleTokenInput');
  const msg = document.getElementById('consoleTokenMsg');
  const token = generate ? '' : input.value.trim();
  if (!generate && token && token.length < 16) {
    msg.textContent = '❌ 令牌至少需要 16 位';
    msg.className = 'meta err';
    return;
  }
  const r = await api('/api/console/token', 'POST', { token });
  if (!r.ok) {
    msg.textContent = '❌ ' + (r.error || '修改失败');
    msg.className = 'meta err';
    return;
  }
  // 保存到 localStorage，当前页面继续使用新令牌
  localStorage.setItem('consoleToken', r.token);
  input.value = r.token;
  msg.textContent = r.generated ? '已生成随机令牌，当前页面已自动使用。可点击显示后复制。' : '已保存新令牌';
  msg.className = 'meta ok';
}
document.getElementById('consoleTokenSave').addEventListener('click', () => changeConsoleToken(false));
document.getElementById('consoleTokenRandom').addEventListener('click', () => changeConsoleToken(true));

