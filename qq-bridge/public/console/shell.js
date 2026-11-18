function openNativeLive(){const frame=document.getElementById('biliLiveFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/bilibili-live/?token='+encodeURIComponent(value);}}
async function refreshLiveRecaps(){const box=document.getElementById('biliLiveRecaps');try{const d=await api('/api/bili-live/reports');box.replaceChildren(...(d.reports||[]).slice(0,3).map(r=>{const el=document.createElement('details'),title=document.createElement('summary'),body=document.createElement('p');title.textContent=new Date(r.startedAt).toLocaleString('zh-CN')+(r.demo?' · 演练':' · 房间 '+r.roomId);body.textContent=r.summary;el.append(title,body);return el;}));if(!d.reports?.length)box.textContent='还没有共享的直播总结。结束直播互动并总结后，可在这里回顾。';}catch(error){box.textContent='直播回顾暂不可用，可在直播工作台检查。';}}

// Keep the memory explorer in the main page's scroll flow instead of trapping
// its graph and drill-down inside another fixed-height scrolling frame.
(()=>{window.addEventListener('message',event=>{
  const data=event.data;
  if(!['qq-ocean-height','qq-robot-options-height','qq-workbench-height','qq-fish-home-height'].includes(data?.type))return;
  const workbenchFrames={'/creative/':'creativeFrame','/resources/':'resourceFrame','/qzone/':'qzoneFrame','/wechat/':'wechatFrame','/bilibili-chat/':'bilibiliChatFrame','/bilibili-live/':'biliLiveFrame','/bilibili/':'biliNativeFrame'};
  const frame=document.getElementById(data.type==='qq-workbench-height'?workbenchFrames[data.path]:data.type==='qq-fish-home-height'?'fishHomeFrame':data.type==='qq-ocean-height'?'memoryContextFrame':'robotOptionsFrame');
  if(event.origin!==location.origin||!frame||event.source!==frame.contentWindow)return;
  const height=Number(data.height);if(!Number.isFinite(height)||height<100)return;
  const target=Math.max(650,Math.min(16000,Math.ceil(height)+20));
  if(Math.abs((parseFloat(frame.style.height)||0)-target)>8)frame.style.height=target+'px';
});})();

// Presentation layer: keep every existing control mounted so drafts and API contracts survive navigation.
const consolePages = {
  'qq-official':['官方QQ机器人','腾讯官方QQ机器人','AppID / AppSecret接入；独立管理官方会话与回复权限。'],
  'fish-home':['肥鱼生活总部','一条肥鱼，一个家。','探索生活总部，看看真实活动、心情和识海；也可以回自己的房间。'],
  'memory-context':['识海记忆','记忆、情感与上下文','分层记忆、久远召回、内部反思和三维星图统一管理。'],
  'harness-control':['Harness 控制','QQ任务与自主创作','授权项目范围、独立开关、执行预算和任务记录。'],
  'robot-options':['发送与视频记忆','聊天表达与视频记忆','设置发送方式、回复篇幅和视频记忆。'],
  creative:['娱乐与创作','娱乐与创作','画图、跑团和表情，按需开启。'],
  wechat:['微信通道','微信通道','管理连接、回复名单与消息。'],
  qzone:['QQ空间','QQ空间','设置发布节奏，查看草稿与记录。'],
  resources:['资源与开关','资源与开关','集中管理模型功能和自动任务，查看磁盘占用。'],
  'bilibili-chat':['B站聊天联动','B站聊天联动','把看过的视频带回聊天。'],
  'bili-live': ['B站直播','B站直播','管理直播互动、声音与画面。'],
  bilibili: ['B站鱼塘', 'B站鱼塘', '浏览视频，管理笔记与互动。'],
  overview: ['运行总览', '让每一次连接，都自然发生。', '掌握桥接状态，轻松管理你的 QQ 智能伙伴。'],
  sessions: ['会话与审批', '让每一段对话，都有迹可循。', '查看 QQ 与 DSH 的会话映射，以及等待你回复的审批和提问。'],
  persona: ['人格与角色', '给你的伙伴，一点独特个性。', '选择已有角色，或用自己的语言写下新的性格与表达方式。'],
  models: ['模型与账号', '选择合适的模型，聊得更顺畅。', '查看可用模型、切换聊天模型、添加 API 服务与密钥，或登录 DeepSeek 账号。'],
  plugins: ['插件管理', '插件管理', '查看状态，按需启停。'],
  douyin: ['抖音助手', '抖音助手', '管理观看、互动与发布。'],
  'social-v2': ['二代仿真', '自主参与，恰到好处。', '管理 AI 的工具、唤醒与发言节奏。展开需要调整的分组，修改后保存参数。'],
  'social-v1': ['一代仿真', '为自然对话，设定合适的节奏。', '调整参与概率、活跃周期和分条发送；所有配置项完整保留。'],
  slang: ['黑话词库', '读懂群聊里的，言外之意。', '从候选到确认，让 AI 逐渐熟悉大家的表达习惯。'],
  usage: ['令牌与花费', '每一次思考，都算得清楚。', '实时查看 AI 的 token 消耗与花费，可下钻到每个群、每个好友、每一轮对话。'],
  whitelist: ['群聊与私聊白名单', '设置群聊与私聊白名单', '分别管理允许 AI 参与的群聊和私聊，保存后立即生效，无需重启。'],
  access: ['访问与安全', '明确边界，安心连接。', '管理安全拦截通知与控制台访问凭证；群聊、私聊及管理员设置请前往侧边栏「群聊与私聊白名单」。'],
  operations: ['调试与运维', '让桥接，始终井然有序。', '测试消息、引导 AI，或维护桥接进程与会话工作区。'],
  reference: ['工具参考', '每一种能力，都清晰可见。', '查看桥接提供给 DSH 的 MCP 工具与用途。']
};
window.addEventListener('message',event=>{const d=event.data,frame=document.getElementById('fishHomeFrame');if(d?.type!=='qq-hq-open-feature'||event.origin!==location.origin||event.source!==frame?.contentWindow)return;const allowed=new Set(['whitelist','robot-options','sessions','persona','memory-context','bilibili','douyin','creative','harness-control','bili-live','qzone']);if(allowed.has(d.page))setConsolePage(d.page,{focus:true});});
let currentConsolePage = 'overview';
const initializedConsolePages = new Set();
const consolePageLoads = new Map();
let consolePollFlight;
function initializeConsolePage(page) {
  if (initializedConsolePages.has(page)) return;
  initializedConsolePages.add(page);
  const initializers = {
    overview:[refreshPresets], sessions:[refreshPresets], persona:[refreshRoles,refreshSimPrompt],
    'social-v1':[loadSocialForm],
    'social-v2':[loadV2Config,loadV2ToolLog,loadV2SessionOptions,loadVoiceLibrary],
    slang:[loadSlangConfig], whitelist:[refreshWhitelist], access:[loadSecurity],
    operations:[refreshPresets,loadV2SessionOptions,refreshDshModel]
  };
  const work = Promise.allSettled((initializers[page] || []).map(fn => fn()));
  consolePageLoads.set(page,work);work.then(() => consolePageLoads.delete(page));
}
function pollConsolePage() {
  if (document.hidden || consolePollFlight) return consolePollFlight;
  const page = currentConsolePage;
  const readers = {overview:[refreshSessions,refreshPending,refreshSocialStatus],sessions:[refreshSessions,refreshPending],
    'social-v1':[refreshSocialStatus],'social-v2':[refreshSocialStatus,refreshV2Activity],slang:[refreshSlang],
    usage:[refreshUsage,refreshUsageChart,refreshUsageRecent]};
  const work = Promise.allSettled([refresh(),...(readers[page] || []).map(fn => fn())]);
  consolePollFlight = work;
  work.finally(() => {consolePollFlight = null;if (!document.hidden && page !== currentConsolePage) pollConsolePage();});
  return work;
}
let toastTimer;
function showConsoleToast(message) {
  const toast = document.getElementById('consoleToast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}
function setConsolePage(page, { updateHash = true, focus = false, target = '' } = {}) {
  if(page==='hq')page='fish-home';
  if (!Object.hasOwn(consolePages, page)) page = 'overview';
  currentConsolePage = page;
  document.querySelectorAll('[data-page]').forEach(el => { el.hidden = el.dataset.page !== page; });
  document.querySelectorAll('#mainNav [data-view]').forEach(button => {
    const selected = button.dataset.view === page;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('breadcrumbPage').textContent = consolePages[page][0];
  document.getElementById('pageTitle').textContent = consolePages[page][0];
  document.getElementById('pageDescription').textContent = consolePages[page][2];
  document.querySelectorAll('section[data-page="'+page+'"]>h2').forEach(heading=>heading.classList.toggle('sr-only',heading.textContent.trim()===consolePages[page][0]));
  document.title = consolePages[page][0] + ' · QQ 桥接控制台';
  if (updateHash && location.hash !== '#' + page) history.pushState({}, '', '#' + page);
  closeConsoleSearch();
  setConsoleNavigation(false);
  // Load editable forms once so navigation preserves drafts; poll only this page.
  initializeConsolePage(page);
  pollConsolePage();
  if(page==='qq-official')loadOfficialQQ();
  if (page === 'models') { refreshModelManager(); refreshDshModel(); refreshLocalVoices(); }
  if (page === 'plugins') refreshDshPlugins();
  if (page === 'douyin') openNativeDouyin();
  if(page==='fish-home'){const frame=document.getElementById('fishHomeFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/fish-home/hq/?token='+encodeURIComponent(value);}}
  if(page==='memory-context'){const frame=document.getElementById('memoryContextFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/memory-context/?token='+encodeURIComponent(value);}}
  if(page==='robot-options'){const frame=document.getElementById('robotOptionsFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/robot-options/?token='+encodeURIComponent(value);}}
  if(page==='creative'){const frame=document.getElementById('creativeFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/creative/?token='+encodeURIComponent(value);}}
  if(page==='wechat'){const frame=document.getElementById('wechatFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/wechat/?token='+encodeURIComponent(value);}}
  if(page==='qzone'){const frame=document.getElementById('qzoneFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/qzone/?token='+encodeURIComponent(value);}}
  if(page==='resources'){const frame=document.getElementById('resourceFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/resources/?token='+encodeURIComponent(value);}}
  if(page==='bilibili-chat'){const frame=document.getElementById('bilibiliChatFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/bilibili-chat/?token='+encodeURIComponent(value);}}
  if(page==='harness-control'){const frame=document.getElementById('harnessControlFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/harness-control/?token='+encodeURIComponent(value);}}
  if(page==='bili-live')openNativeLive();
  if(page==='bilibili'){openNativePond();refreshLiveRecaps();}

  if (focus) {
    document.getElementById('mainContent').focus({ preventScroll: true });
    document.getElementById(target || 'mainContent')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  setConsolePage(button.dataset.view, { focus: true, target: button.dataset.target });
}));
window.addEventListener('hashchange', () => {
  const page = location.hash.slice(1);
  if (Object.hasOwn(consolePages, page) || page==='hq' || !page) setConsolePage(page, { updateHash: false });
});
document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  document.getElementById('mainContent').focus();
  document.getElementById('mainContent').scrollIntoView({ block: 'start', behavior: 'instant' });
});
function updateOverview(status, modeLabel) {
  const connection = document.getElementById('statusText');
  const dshPhase=status.dshConnection?.state||(status.dshReady?'connected':'offline');
  const dshRetry=dshPhase==='reconnecting'||dshPhase==='checking';
  connection.textContent=dshRetry?'DSH 正在重连':status.dshReady?'DSH 已连接':'DSH 未连接';
  connection.className='status-badge '+(dshRetry?'reconnecting':status.dshReady?'online':'offline');
  document.getElementById('metricDsh').textContent=dshRetry?'正在重连':status.dshReady?'已连接':'未连接';
  document.getElementById('metricDsh').className=dshRetry?'warn':status.dshReady?'ok':'err';
  document.getElementById('metricDshHint').textContent=status.dshConnection?.hint||(status.dshReady?'桥接状态已同步':'请检查 DSH 是否运行');
  renderQQGatewayHealth(status.snowluma);
  document.getElementById('metricMode').textContent = modeLabel.replace('模式', '');
  document.getElementById('metricRole').textContent = '角色 · ' + (status.role || '默认人格');
  document.getElementById('accessSummary').textContent = '管理员 ' + (status.ownerQQ || '未设置') + ' · ' + (status.allowGroups || []).length + ' 个白名单群 · ' + (status.allowPrivate || []).length + ' 位白名单好友';
  document.getElementById('lastUpdated').textContent = '状态同步于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
  document.getElementById('connectionAlert').hidden = true;
  const silent = status.roleMode === 'silent';
  for (const [id, active] of [['silentOn', silent], ['silentOff', !silent]]) {
    const button = document.getElementById(id);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}
function setConnectionError(error) {
  document.getElementById('statusText').className = 'status-badge offline';
  document.getElementById('metricDsh').textContent = '连接中断';
  document.getElementById('metricDsh').className = 'err';
  document.getElementById('metricDshHint').textContent = '当前状态可能已过期';
  // 上游健康也一起过期：桥接都联系不上时，别让上一次的 SnowLuma 结论继续挂着。
  document.getElementById('metricQQGateway').textContent = '未知';
  document.getElementById('metricQQGateway').className = '';
  document.getElementById('metricQQGatewayHint').textContent = '当前状态可能已过期';
  document.getElementById('qqGatewayWarn').style.display = 'none';
  const alert = document.getElementById('connectionAlert');
  alert.textContent = error.message === '未授权' ? '访问令牌无效或已取消输入。请使用启动日志中的控制台链接重新打开。' : '无法连接桥接服务，当前显示的是上次同步结果。请检查桥接是否运行，再点击右上角刷新。';
  alert.hidden = false;
}
document.getElementById('refreshConsole').addEventListener('click', async function () {
  this.disabled = true;
  await Promise.allSettled([refresh(), refreshSessions(), refreshPending(), refreshSocialStatus(), refreshV2Activity()]);
  this.disabled = false;
  if (document.getElementById('connectionAlert').hidden) showConsoleToast('运行状态已刷新');
});

// Attach real accessible names to the original form controls, including paired min/max inputs.
document.querySelectorAll('input,select,textarea').forEach(input => {
  if (input.labels?.length || input.hasAttribute('aria-label')) return;
  let label = input.previousElementSibling;
  while (label && label.tagName !== 'LABEL') label = label.previousElementSibling;
  if (label) {
    const siblings = [];
    let next = label.nextElementSibling;
    while (next && next.tagName !== 'LABEL') {
      if (next.matches('input,select,textarea')) siblings.push(next);
      next = next.nextElementSibling;
    }
    input.setAttribute('aria-label', label.textContent.trim() + (siblings.length > 1 ? (siblings.indexOf(input) === 0 ? '（下限）' : '（上限）') : ''));
  } else {
    const names = { consoleTokenInput: '新的控制台访问令牌', closedPreset: '封闭 Agent 使用的 DSH 预设', tsKind: '测试消息目标类型', aiNotifyKind: '后台提醒目标类型', sStateKey: '一代仿真会话', v2SessionSelect: '二代仿真白名单会话', slangLimitCand: '候选词显示数量', slangLimitConfirmed: '已确认词显示数量', slangLimitRejected: '已拒绝词显示数量' };
    input.setAttribute('aria-label', names[input.id] || input.placeholder || input.closest('section')?.querySelector('h2')?.textContent || '设置');
  }
});
const primaryActions = ['roleSet','roleCreate','socialSave','v2ConfigSave','v2ConfigSaveTop','wlSave','secSave','consoleTokenSave','tsSend','aiNotifySend','slangAdd','slangConfigSave','slangModalDirectConfirm'];
primaryActions.forEach(id => document.getElementById(id)?.classList.add('primary'));
document.querySelectorAll('.meta[id$="Msg"], .meta[id$="Msg2"]').forEach(el => el.setAttribute('role','status'));
document.getElementById('section-mode').querySelector('h2').dataset.note = '选择后即时生效';
document.getElementById('section-activity').querySelector('h2').dataset.note = '每 3 秒自动同步';

const searchInput = document.getElementById('consoleSearch');
const searchResults = document.getElementById('searchResults');
const featureIndex = [];
document.querySelectorAll('section[data-page]').forEach(section => {
  const page = section.dataset.page;
  const pageInfo = consolePages[page];
  if (!pageInfo) return;
  const title = section.querySelector('h2')?.textContent?.trim() || section.getAttribute('aria-label') || pageInfo[0];
  featureIndex.push({ page, label: title, target: section });
  section.querySelectorAll('details.settings-group>summary,input,textarea,select').forEach(el => {
    let label = el.tagName === 'SUMMARY' ? el.textContent : (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.placeholder);
    if (label) featureIndex.push({ page, label: label.trim(), target: el });
  });
});
function closeConsoleSearch() { searchResults.hidden = true; searchInput.setAttribute('aria-expanded','false'); }
searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();
  searchResults.replaceChildren();
  if (!query) return closeConsoleSearch();
  const matches = featureIndex.filter(entry => (consolePages[entry.page][0] + entry.label + entry.target.id).toLowerCase().includes(query)).slice(0,12);
  if (!matches.length) { const empty = document.createElement('p'); empty.textContent = '未找到匹配功能，试试「唤醒」「白名单」或「表情」。'; searchResults.append(empty); }
  matches.forEach(entry => {
    const button = document.createElement('button');
    const title = document.createElement('span'); title.textContent = entry.label;
    const caption = document.createElement('small'); caption.textContent = consolePages[entry.page][0];
    button.append(title,caption);
    button.addEventListener('click', () => {
      setConsolePage(entry.page);
      let ancestor = entry.target.closest('details');
      while (ancestor) { ancestor.open = true; ancestor = ancestor.parentElement.closest('details'); }
      if (entry.target.closest('.slang-panel')) {
        const panels = { slangPanelCandidate: 'candidate', slangPanelConfirmed: 'confirmed', slangPanelRejected: 'rejected' };
        setSlangTab(panels[entry.target.closest('.slang-panel').id]);
      }
      entry.target.scrollIntoView({ block:'center', behavior:'instant' });
      if (!entry.target.hasAttribute('tabindex') && !entry.target.matches('input,textarea,select,button,summary')) entry.target.tabIndex = -1;
      entry.target.focus({ preventScroll:true });
      entry.target.classList.add('search-highlight');
      setTimeout(() => entry.target.classList.remove('search-highlight'), 2000);
    });
    searchResults.append(button);
  });
  searchResults.hidden = false;
  searchInput.setAttribute('aria-expanded','true');
});
searchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeConsoleSearch();
  if ((event.key === 'ArrowDown' || event.key === 'Enter') && !searchResults.hidden) { event.preventDefault(); searchResults.querySelector('button')?.focus(); }
});
document.addEventListener('click', event => { if (!event.target.closest('.search-wrap')) closeConsoleSearch(); });
searchResults.addEventListener('keydown', event => { if (event.key === 'Escape') { closeConsoleSearch(); searchInput.focus(); } });

// Keyboard support for the existing editor dialog without replacing its save flow.
let modalPreviousFocus;
const slangOverlay = document.getElementById('slangModalOverlay');
new MutationObserver(() => {
  if (slangOverlay.classList.contains('open')) {
    modalPreviousFocus = document.activeElement;
    document.getElementById('slangModalMeaning').focus();
  } else modalPreviousFocus?.focus();
}).observe(slangOverlay, { attributes:true, attributeFilter:['class'] });
slangOverlay.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeSlangModal(); }
  if (event.key === 'Tab') {
    const controls = [...slangOverlay.querySelectorAll('button,input,textarea,select')].filter(el => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
const tokenToggle = document.createElement('button');
tokenToggle.id = 'consoleTokenToggle'; tokenToggle.className = 'small'; tokenToggle.textContent = '显示令牌'; tokenToggle.type = 'button'; tokenToggle.setAttribute('aria-pressed','false');
tokenToggle.addEventListener('click', () => {
  const input = document.getElementById('consoleTokenInput');
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  tokenToggle.textContent = visible ? '隐藏令牌' : '显示令牌';
  tokenToggle.setAttribute('aria-pressed',String(visible));
});
document.getElementById('consoleTokenInput').after(tokenToggle);
// ── 消耗走势图（手写 SVG） ───────────────────────────────────────────────
// 为什么不用图表库：控制台 CSP 是 default-src 'self'，不能引外部脚本；
// 而 SVG 用 document.createElementNS 生成既没有 innerHTML 转义风险，
// 也能直接用 CSS 变量跟随深浅主题。
let usageChartHours = 24;
let usageChartMetric = 'cost';
let usageChartData = null;

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}
function usageBucketValue(b, metric) {
  return metric === 'tokens' ? (Number(b.tokens) || 0) : (Number(b.cost) || 0);
}
function usageMetricLabel(metric) {
  return metric === 'tokens' ? 'token' : '花费';
}
function usageAxisValue(v, metric, sym) {
  if (metric === 'tokens') return usageNum(v);
  if (v === 0) return sym + '0';
  return v < 0.01 ? sym + v.toFixed(4) : sym + v.toFixed(2);
}
function usageBucketClock(ms, bucketMs) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  // 桶宽 ≥ 1 天时只显示日期，否则显示「日 时:分」，跨天也能分辨。
  if (bucketMs >= 24 * 3600 * 1000) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderUsageChart(series) {
  const box = document.getElementById('usageChart');
  const totalEl = document.getElementById('usageChartTotal');
  const hintEl = document.getElementById('usageChartHint');
  const noteEl = document.getElementById('usageChartNote');
  usageChartData = series;
  const sym = series?.symbol || '¥';
  const buckets = Array.isArray(series?.buckets) ? series.buckets : [];
  if (!buckets.length) {
    box.innerHTML = '';
    box.textContent = '暂无数据';
    totalEl.textContent = '—';
    hintEl.textContent = '还没有用量记录';
    noteEl.textContent = '';
    return;
  }
  const metric = usageChartMetric;
  const values = buckets.map((b) => usageBucketValue(b, metric));
  const max = Math.max(...values, 0);
  // 全零时给一个假上限，避免除零；同时让空图看起来是"平"的而不是报错。
  const scaleMax = max > 0 ? max : 1;

  const W = 960;
  const H = 240;
  const padL = 62;
  const padR = 12;
  const padT = 12;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const step = plotW / buckets.length;
  const barW = Math.max(2, step * 0.72);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${usageMetricLabel(metric)}随时间的走势图` });

  // 横向网格 + 纵轴刻度（3 条线即可：0 / 一半 / 最大）
  // 窗口内完全没有用量时（max === 0）三条刻度都写 0：不能编出一个 ¥1 的假量程，
  // 那会让人以为"有量但很小"。
  for (let i = 0; i <= 2; i += 1) {
    const y = padT + plotH - (plotH * i) / 2;
    svg.appendChild(svgEl('line', { class: 'usage-grid', x1: padL, y1: y, x2: W - padR, y2: y }));
    const label = svgEl('text', { class: 'usage-axis', x: padL - 8, y: y + 3, 'text-anchor': 'end' });
    label.textContent = usageAxisValue(max > 0 ? (scaleMax * i) / 2 : 0, metric, sym);
    svg.appendChild(label);
  }

  // 柱：颜色 = 该桶的峰谷档位，所以"什么时候贵"是一眼可见的
  for (let i = 0; i < buckets.length; i += 1) {
    const b = buckets[i];
    const v = values[i];
    const x = padL + i * step + (step - barW) / 2;
    const h = v > 0 ? Math.max(1.5, (v / scaleMax) * plotH) : 0;
    const tooltip = svgEl('title');
    tooltip.textContent = `${usageBucketClock(b.t, series.bucketMs)}\n${usageMetricLabel(metric)}：${usageAxisValue(v, metric, sym)}`
      + `\n未命中输入：${usageNum(b.cacheMiss)} ｜ 命中输入：${usageNum(b.cacheHit)} ｜ 输出：${usageNum(b.output)}`
      + `\n步数：${usageNum(b.steps)} ｜ 轮次：${usageNum(b.turns)}`
      + `\n时段：${b.tier === 'peak' ? '高峰（单价 ×2）' : (b.tier === 'mixed' ? '跨时段' : '空闲')}`
      + (b.keys?.length ? `\n会话：${b.keys.join('、')}` : '');
    if (h > 0) {
      const rect = svgEl('rect', { x, y: padT + plotH - h, width: barW, height: h, rx: 2, class: `usage-bar-${b.tier === 'peak' ? 'peak' : (b.tier === 'mixed' ? 'mixed' : 'off')}` });
      rect.appendChild(tooltip);
      svg.appendChild(rect);
    }
    // 透明命中区：0 值的桶也能 hover（鼠标移到空白处也要能看出那一刻是空闲还是高峰）
    const hit = svgEl('rect', { x: padL + i * step, y: padT, width: step, height: plotH, class: 'usage-hit' });
    hit.appendChild(tooltip.cloneNode(true));
    svg.appendChild(hit);
  }

  // 横轴：最多 6 个刻度，避免挤在一起
  const tickEvery = Math.max(1, Math.ceil(buckets.length / 6));
  for (let i = 0; i < buckets.length; i += tickEvery) {
    const label = svgEl('text', { class: 'usage-axis', x: padL + i * step + step / 2, y: H - padB + 16, 'text-anchor': 'middle' });
    label.textContent = usageBucketClock(buckets[i].t, series.bucketMs);
    svg.appendChild(label);
  }

  box.innerHTML = '';
  box.appendChild(svg);

  const windowTotal = buckets.reduce((sum, b) => sum + usageBucketValue(b, metric), 0);
  totalEl.textContent = metric === 'tokens' ? `${usageNum(windowTotal)} token` : usageMoney(windowTotal, sym);
  const busiest = series.busiest;
  hintEl.textContent = `窗口内合计 ｜ 每格 ${Math.round(series.bucketMs / 60000)} 分钟`
    + (busiest && metric === 'cost' ? ` ｜ 最贵一格：${usageBucketClock(busiest.t, series.bucketMs)} ${usageMoney(busiest.cost, sym)}` : '')
    + (series.estimated ? ' ｜ ⚠️ 含按兜底价估算的模型' : '');

  // 图上一定要能看出"还有多少没画进来"：投影基线覆盖的更早历史没有逐时明细。
  const notes = [];
  if (Number(series.offChartCost) > 0.0001) {
    notes.push(`另有 ${usageMoney(series.offChartCost, sym)}（约 ${usageNum(series.offChartTokens)} token）属于更早的历史，只有累计值、没有逐时明细，因此不在上图里；所以本图合计会小于「总花费」。`);
  }
  if (series.countedSamples === 0) {
    notes.push('所选时间窗内没有采样：要么这段时间真的没调用，要么逐轮明细已被容量上限淘汰（累计总量仍然准确）。');
  }
  noteEl.textContent = notes.join(' ');
}

async function refreshUsageChart() {
  try {
    const r = await api(`/api/tokens/series?hours=${usageChartHours}`);
    renderUsageChart(r);
  } catch (error) {
    document.getElementById('usageChart').textContent = `走势读取失败：${error?.message || '未知错误'}`;
  }
}

document.getElementById('usageChartControls').addEventListener('click', (ev) => {
  const hoursBtn = ev.target.closest('[data-usage-hours]');
  const metricBtn = ev.target.closest('[data-usage-metric]');
  if (hoursBtn) {
    usageChartHours = Number(hoursBtn.dataset.usageHours) || 24;
    document.querySelectorAll('#usageChartControls [data-usage-hours]').forEach((b) => b.classList.toggle('active', b === hoursBtn));
    refreshUsageChart();
  } else if (metricBtn) {
    usageChartMetric = metricBtn.dataset.usageMetric === 'tokens' ? 'tokens' : 'cost';
    document.querySelectorAll('#usageChartControls [data-usage-metric]').forEach((b) => b.classList.toggle('active', b === metricBtn));
    // 只换纵轴：不重新请求，直接重画现有数据。
    if (usageChartData) renderUsageChart(usageChartData);
  }
});

// ── 令牌与花费 ───────────────────────────────────────────────────────────
// 数据分三层：累计总量（DSH tokenUsage 投影，权威）→ 按会话归并 → 逐轮明细。
// 金额一律在渲染时算，价目表改了不需要重算历史。
let usageSelectedKey = '';
let usageConversationsCache = [];

function usageNum(n) {
  const v = Number(n) || 0;
  if (v >= 1e8) return (v / 1e8).toFixed(2) + ' 亿';
  if (v >= 1e5) return (v / 1e4).toFixed(0) + ' 万';
  if (v >= 1e4) return (v / 1e4).toFixed(1) + ' 万';
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function usageMoney(n, sym) {
  const s = sym || '¥';
  const v = Number(n) || 0;
  if (v === 0) return s + '0';
  if (v < 0.01) return s + v.toFixed(4);
  return s + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function usagePct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return (v * 100).toFixed(1) + '%';
}
function usageRate(buckets) {
  const b = buckets || {};
  const input = (b.cacheMiss || 0) + (b.cacheHit || 0) + (b.cacheWrite || 0);
  return input > 0 ? (b.cacheHit || 0) / input : 0;
}
function usageTime(ms) {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleString('zh-CN', { hour12: false }); } catch (error) { return '—'; }
}
function usageBar(share) {
  const ratio = Math.max(0, Math.min(1, Number(share) || 0));
  const width = Math.max(2, Math.round(ratio * 100));
  return `<span class="usage-bar-wrap"><span class="usage-bar-track"><span class="usage-bar-fill" style="width:${width}%"></span></span><span class="meta">${(ratio * 100).toFixed(1)}%</span></span>`;
}
function usageTierTag(tier) {
  if (tier === 'peak') return '<span class="pill r usage-tier">高峰</span>';
  if (tier === 'off') return '<span class="pill g usage-tier">空闲</span>';
  if (tier === 'mixed') return '<span class="pill b usage-tier">跨时段</span>';
  return '<span class="meta">—</span>';
}

function syncUsageKeySelect(keys) {
  const sel = document.getElementById('usageKeySelect');
  if (!sel) return;
  if (!keys.includes(usageSelectedKey)) usageSelectedKey = keys[0] || '';
  const signature = keys.join('\u0000');
  if (sel.dataset.signature !== signature) {
    sel.dataset.signature = signature;
    sel.innerHTML = keys.length
      ? keys.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')
      : '<option value="">（暂无会话）</option>';
  }
  // 每 3 秒的轮询不得覆盖用户正在操作的控件。
  if (document.activeElement !== sel) sel.value = usageSelectedKey;
}

function renderUsageConversations(r) {
  const box = document.getElementById('usageConversations');
  const list = r.conversations || [];
  const sym = r.symbol || '¥';
  usageConversationsCache = list;
  if (!list.length) {
    box.innerHTML = '<div class="empty-state"><strong>还没有用量记录</strong><p>QQ 会话产生一次 LLM 调用后，这里会按群 / 好友列出 token 与花费。新账本从桥接重启后开始记账。</p></div>';
    return;
  }
  const maxCost = Math.max(...list.map(x => Number(x.cost) || 0), 0);
  let html = '<table><tr><th>会话</th><th>类型</th><th class="num">轮数</th><th class="num">步数</th><th class="num">未命中输入</th><th class="num">命中输入</th><th class="num">命中率</th><th class="num">输出</th><th class="num">花费</th><th>占比</th></tr>';
  for (const c of list) {
    const key = String(c.key ?? '');
    const isInternal = key.startsWith('internal:');
    const type = isInternal ? '<span class="pill b">内部</span>'
      : (key.startsWith('private:') ? '<span class="pill b">私聊</span>' : '<span class="pill g">群</span>');
    const b = c.buckets || {};
    html += '<tr>'
      + `<td class="usage-key"><button class="usage-key-button" data-usage-key="${esc(key)}" aria-pressed="${key === usageSelectedKey}">${esc(key)}</button></td>`
      + `<td>${type}</td>`
      + `<td class="num">${usageNum(c.turns)}</td>`
      + `<td class="num">${usageNum(c.steps)}</td>`
      + `<td class="num">${usageNum(b.cacheMiss)}</td>`
      + `<td class="num">${usageNum(b.cacheHit)}</td>`
      + `<td class="num">${usagePct(usageRate(b))}</td>`
      + `<td class="num">${usageNum(b.output)}</td>`
      + `<td class="num">${usageMoney(c.cost, sym)}</td>`
      + `<td>${usageBar(maxCost > 0 ? (Number(c.cost) || 0) / maxCost : 0)}</td>`
      + '</tr>';
  }
  html += '</table>';
  const totals = r.totals || {};
  if (Number(totals.unattributedCost) > 0) {
    html += `<div class="meta" style="padding:8px 10px">其中 ${usageMoney(totals.unattributedCost, sym)} 来自更早的回合：它们只剩累计值（在逐轮快照窗口之外），无法再拆到具体某一轮。</div>`;
  }
  if (totals.estimated) {
    html += '<div class="meta" style="padding:8px 10px">⚠️ 有模型未登记在价目表里，这部分按 <code>deepseek-flash</code> 兜底价估算，可在 <code>config.json</code> 的 <code>pricing.models</code> 补充。</div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('[data-usage-key]').forEach(btn => btn.addEventListener('click', () => {
    usageSelectedKey = btn.dataset.usageKey;
    box.querySelectorAll('[data-usage-key]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.usageKey === usageSelectedKey)));
    const sel = document.getElementById('usageKeySelect');
    if (sel) sel.value = usageSelectedKey;
    refreshUsageTurns();
  }));
}

function renderUsageTurns(r) {
  const box = document.getElementById('usageTurns');
  const scope = document.getElementById('usageTurnScope');
  const rows = r.turns || [];
  const sym = r.symbol || '¥';
  if (scope) {
    scope.textContent = `${esc(r.key || '')} ｜ 共 ${rows.length} 轮可追溯 ｜ 已归属 ${usageMoney(r.attributedCost, sym)}`
      + (Number(r.unattributedCost) > 0 ? ` ｜ 未逐轮归属 ${usageMoney(r.unattributedCost, sym)}` : '');
  }
  if (!rows.length) {
    box.innerHTML = '<span class="meta">该会话还没有可追溯的逐轮记录（只有累计值）。</span>';
    return;
  }
  let html = '<table><tr><th class="num">轮次</th><th>结束时间</th><th class="num">步数</th><th class="num">未命中输入</th><th class="num">命中输入</th><th class="num">命中率</th><th class="num">输出</th><th class="num">花费</th><th>时段</th></tr>';
  for (const t of rows) {
    const b = t.buckets || {};
    html += '<tr>'
      + `<td class="num">#${esc(t.turn)}</td>`
      + `<td>${esc(usageTime(t.endedAt))}</td>`
      + `<td class="num">${usageNum(t.steps)}</td>`
      + `<td class="num">${usageNum(b.cacheMiss)}</td>`
      + `<td class="num">${usageNum(b.cacheHit)}</td>`
      + `<td class="num">${usagePct(usageRate(b))}</td>`
      + `<td class="num">${usageNum(b.output)}</td>`
      + `<td class="num">${usageMoney(t.cost, sym)}</td>`
      + `<td>${usageTierTag(t.tier)}</td>`
      + '</tr>';
  }
  box.innerHTML = html + '</table>';
}

function renderUsageRecent(r) {
  const box = document.getElementById('usageRecent');
  const list = r.entries || [];
  const sym = r.symbol || '¥';
  if (!list.length) { box.innerHTML = '<span class="meta">（空）</span>'; return; }
  let html = '<table><tr><th>时间</th><th>会话</th><th class="num">轮</th><th class="num">步</th><th class="num">未命中</th><th class="num">命中</th><th class="num">输出</th><th class="num">花费</th><th>时段</th></tr>';
  for (const e of list) {
    html += '<tr>'
      + `<td>${esc(usageTime(e.time))}</td>`
      + `<td>${esc(e.key || '未归属')}</td>`
      + `<td class="num">#${esc(e.turn)}</td>`
      + `<td class="num">${esc(e.step)}</td>`
      + `<td class="num">${usageNum(e.cacheMiss)}</td>`
      + `<td class="num">${usageNum(e.cacheHit)}</td>`
      + `<td class="num">${usageNum(e.output)}</td>`
      + `<td class="num">${usageMoney(e.cost, sym)}</td>`
      + `<td>${usageTierTag(e.tier)}</td>`
      + '</tr>';
  }
  box.innerHTML = html + '</table>';
}

function renderUsagePrices(pt) {
  const box = document.getElementById('usagePrices');
  if (!pt || !pt.models) { box.textContent = '（价目表不可用）'; return; }
  const sym = pt.symbol || '¥';
  const tier = pt.nowTier;
  let html = `<div style="margin-bottom:6px">价目表版本 <code>${esc(pt.version)}</code> ｜ 高峰时段为北京时间的 2 倍价（周一至周五 9:00-12:00、14:00-18:00，法定节假日除外，已内置 ${esc(pt.holidayCount)} 天假期）</div>`;
  html += '<table><tr><th>模型</th><th class="num">缓存命中</th><th class="num">缓存未命中</th><th class="num">输出</th></tr>';
  for (const [name, m] of Object.entries(pt.models)) {
    // 单价与货币符号都可能来自 config.json 的 pricing 覆盖项（运维可写），
    // 不能直接拼进 innerHTML：这里统一走 esc() （数字原样显示仍然是数字）。
    const price = (v) => esc(sym + (Number.isFinite(Number(v)) ? Number(v) : (v ?? '')));
    html += `<tr><td><code>${esc(name)}</code><div class="meta">${esc(m.label)}</div></td>`
      + `<td class="num">${price(m.off?.cacheHit)}</td>`
      + `<td class="num">${price(m.off?.cacheMiss)}</td>`
      + `<td class="num">${price(m.off?.output)}</td></tr>`;
  }
  html += '</table>';
  html += `<div class="meta" style="padding:8px 10px">上表为<b>空闲时段</b>单价（元 / 百万 token）。当前时刻属于 <b>${tier ? esc(tier.tierLabel) : '—'}</b>${tier?.estimated ? '，且价目表里没有 <code>' + esc(tier.model) + '</code>，按兜底价估算' : ''}。</div>`;
  box.innerHTML = html;
}

async function refreshUsage() {
  const msg = document.getElementById('usageMsg');
  try {
    const r = await api('/api/tokens/summary?limit=200');
    const t = r.totals || {};
    const b = t.buckets || {};
    const sym = r.symbol || '¥';
    document.getElementById('metricUsageCost').textContent = usageMoney(t.cost, sym);
    document.getElementById('metricUsageCostHint').textContent =
      `高峰 ${usageMoney(t.byTier?.peak, sym)} ｜ 空闲 ${usageMoney(t.byTier?.off, sym)}`;
    document.getElementById('metricUsageTokens').textContent = usageNum(t.totalTokens);
    document.getElementById('metricUsageTokensHint').textContent =
      `输入 ${usageNum(t.inputTokens)} ｜ 输出 ${usageNum(b.output)}`;
    document.getElementById('metricUsageHitRate').textContent = usagePct(t.cacheHitRate);
    document.getElementById('metricUsageHitHint').textContent =
      `命中 ${usageNum(b.cacheHit)} ｜ 未命中 ${usageNum(b.cacheMiss)}`;
    document.getElementById('metricUsagePerTurn').textContent = usageMoney(t.avgCostPerTurn, sym);
    document.getElementById('metricUsagePerTurnHint').textContent =
      `${usageNum(t.turns)} 轮 ｜ ${usageNum(t.steps)} 步 ｜ 当前${r.nowTier?.tier === 'peak' ? '高峰' : '空闲'}时段`;
    renderUsageConversations(r);
    renderUsagePrices(r.priceTable ? { ...r.priceTable, nowTier: r.nowTier } : null);
    syncUsageKeySelect((r.conversations || []).map(c => String(c.key ?? '')));
    if (!document.getElementById('usageTurns').dataset.loaded && usageSelectedKey) refreshUsageTurns();
    msg.textContent = `✅ 已同步于 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
    msg.className = 'meta ok';
  } catch (error) {
    msg.textContent = `❌ 读取失败：${error?.message || '未知错误'}`;
    msg.className = 'meta err';
  }
}

async function refreshUsageTurns() {
  const box = document.getElementById('usageTurns');
  if (!usageSelectedKey) {
    box.innerHTML = '<span class="meta">选择一个会话后加载逐轮明细…</span>';
    box.dataset.loaded = '';
    return;
  }
  try {
    const r = await api('/api/tokens/turns?key=' + encodeURIComponent(usageSelectedKey) + '&limit=200');
    renderUsageTurns(r);
    box.dataset.loaded = '1';
  } catch (error) {
    box.innerHTML = `<span class="meta err">读取失败：${esc(error?.message || '未知错误')}</span>`;
    box.dataset.loaded = '';
  }
}

async function refreshUsageRecent() {
  try {
    renderUsageRecent(await api('/api/tokens/recent?limit=40'));
  } catch (error) {
    document.getElementById('usageRecent').innerHTML = '<span class="meta">（读取失败）</span>';
  }
}

document.getElementById('usageRefresh').addEventListener('click', () => {
  refreshUsage();
  refreshUsageChart();
  refreshUsageTurns();
  refreshUsageRecent();
  showConsoleToast('用量已刷新');
});
document.getElementById('usageTurnsLoad').addEventListener('click', () => refreshUsageTurns());
document.getElementById('usageKeySelect').addEventListener('change', (ev) => {
  usageSelectedKey = ev.target.value;
  refreshUsageTurns();
});
document.getElementById('usageClear').addEventListener('click', async () => {
  if (!confirm('确定清空 token 用量账本？累计花费与逐轮明细都会被删除，且不可恢复（下一次同步会从 DSH 重新拉取会话累计值）。')) return;
  const msg = document.getElementById('usageMsg');
  try {
    const r = await api('/api/tokens/reset', 'POST', {});
    msg.textContent = r.ok ? '✅ 账本已清空' : ('❌ ' + (r.error || '失败'));
    msg.className = r.ok ? 'meta ok' : 'meta err';
  } catch (error) {
    msg.textContent = '❌ ' + (error?.message || '失败');
    msg.className = 'meta err';
  }
  usageSelectedKey = '';
  document.getElementById('usageTurnScope').textContent = '—';
  document.getElementById('usageTurns').dataset.loaded = '';
  refreshUsage();
  refreshUsageRecent();
});

function setConsoleNavigation(open) {
  document.body.classList.toggle('nav-open', open);
  document.getElementById('navToggle').setAttribute('aria-expanded', String(open));
  document.getElementById('navToggle').setAttribute('aria-label', open ? '关闭导航' : '打开导航');
  document.getElementById('navBackdrop').hidden = !open;
  if (open) document.querySelector('#mainNav .active')?.focus();
}
document.getElementById('navToggle').addEventListener('click', () => {
  setConsoleNavigation(!document.body.classList.contains('nav-open'));
});
document.getElementById('navBackdrop').addEventListener('click', () => {
  setConsoleNavigation(false);
  document.getElementById('navToggle').focus();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('nav-open')) {
    setConsoleNavigation(false);
    document.getElementById('navToggle').focus();
  }
  if (document.body.classList.contains('nav-open') && matchMedia('(max-width:950px)').matches && event.key === 'Tab') {
    const buttons = [...document.querySelectorAll('#sidebar a, #sidebar button')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
matchMedia('(max-width:950px)').addEventListener('change', () => setConsoleNavigation(false));

// Consistent line icons; all paths are local presentation assets.
const navigationIcons = {
  overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  sessions:'M21 11a8 8 0 0 1-8 8H7l-4 3V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z M7 8h10 M7 12h6',
  persona:'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2 M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  models:'m12 2 9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10',
  'harness-control':'m8 5-6 7 6 7 M16 5l6 7-6 7 M14 3l-4 18',
  bilibili:'M3 6h18v15H3z M8 2l4 4 4-4 M8 11v4 M16 11v4',
  'bilibili-chat':'M3 3h13v11H8l-5 4z M16 8h5v13l-4-3h-6v-4',
  'bili-live':'M3 5h13v14H3z m13 5 6-3v10l-6-3',
  'memory-context':'M9 3a3 3 0 0 0-5 3 4 4 0 0 0-1 7 4 4 0 0 0 6 6h3V3z M15 3a3 3 0 0 1 5 3 4 4 0 0 1 1 7 4 4 0 0 1-6 6h-3 M7 8h5 M12 14h5',
  plugins:'M4 4h6V2h4v2h6v6h2v4h-2v6h-6v2h-4v-2H4v-6H2v-4h2z',
  resources:'M4 5h16 M4 12h16 M4 19h16 M8 2v6 M16 9v6 M10 16v6',
  douyin:'M9 18V3h4c0 4 3 5 6 5 M9 14H6a4 4 0 1 0 4 4',
  creative:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
  wechat:'M21 10a7 7 0 0 1-7 7H7l-4 3V6a3 3 0 0 1 3-3h8a7 7 0 0 1 7 7 M8 9h.01 M15 9h.01',
  qzone:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  'robot-options':'m3 3 19 9-19 9 4-9z M7 12h15',
  'social-v2':'M9 3h6v4H9z M4 11h16v10H4z M12 7v4 M8 15h.01 M16 15h.01 M9 18h6 M1 14v4 M23 14v4',
  'social-v1':'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h4',
  slang:'M4 3h16v18H4z M8 7h8 M8 11h8 M8 15h5',
  usage:'M3 3v18h18 M7 16v-5 M12 16V6 M17 16V9',
  whitelist:'M9 3h11v18H4V3h2 M8 2h8v4H8z m0 10 3 3 5-6',
  access:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z m-4 10 3 3 5-6',
  operations:'m14 6 4-4a6 6 0 0 0-7 8l-8 8 3 3 8-8a6 6 0 0 0 8-7l-4 4z',
  reference:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M12 10v7 M12 6h.01'
};
document.querySelectorAll('#mainNav [data-view]').forEach(button => {
  const icon = button.querySelector('.nav-icon');
  if (icon && navigationIcons[button.dataset.view]) icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="' + navigationIcons[button.dataset.view] + '"/></svg>';
});
setConsolePage(location.hash.slice(1), { updateHash:false });

setInterval(pollConsolePage, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollConsolePage(); });
// 主题切换（纯前端，不发任何请求；选择写入 localStorage，未选择时跟随系统）
(function () {
  var root = document.documentElement;
  var button = document.getElementById('themeToggle');
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  function stored() {
    try { return localStorage.getItem('qq-console-theme'); } catch (error) { return null; }
  }
  function apply(theme, persist) {
    root.dataset.theme = theme;
    if (persist) { try { localStorage.setItem('qq-console-theme', theme); } catch (error) {} }
    var dark = theme === 'dark';
    button.textContent = dark ? '☀' : '☾';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? '切换浅色模式' : '切换深色模式');
    button.title = dark ? '切换到浅色主题' : '切换到深色主题';
  }
  apply(root.dataset.theme === 'dark' ? 'dark' : 'light', false);
  button.addEventListener('click', function () {
    apply(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });
  media.addEventListener('change', function (event) {
    if (!stored()) apply(event.matches ? 'dark' : 'light', false);
  });
})();

window.addEventListener('message',event=>{const frame=document.getElementById('fishHomeFrame'),data=event.data;if(event.origin!==location.origin||event.source!==frame?.contentWindow||data?.type!=='qq-fish-open-memory')return;setConsolePage('memory-context');const target=document.getElementById('memoryContextFrame'),payload={type:'qq-home-memory',key:data.key,id:data.id};const send=()=>target.contentWindow?.postMessage(payload,location.origin);target.addEventListener('load',send,{once:true});setTimeout(send,250);});
