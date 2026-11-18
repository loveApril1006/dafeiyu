
(function () {
  // 如果通过 ?token= 进入（控制台启用鉴权时根路径会重定向带 token），存到 localStorage
  const qs = new URLSearchParams(location.search);
  const token = qs.get('token');
  if (token) {
    localStorage.setItem('consoleToken', token);
    history.replaceState({}, '', location.pathname + location.hash);
  }
})();

const apiReadFlights = new Map();
let consoleAuthRecovery=null,consoleAuthCancelled=false;
function recoverConsoleToken(rejectedToken){
 const current=localStorage.getItem('consoleToken');if(current&&current!==rejectedToken)return Promise.resolve(current);
 if(consoleAuthCancelled)return Promise.reject(new Error('未授权：请刷新页面重新登录'));
 if(consoleAuthRecovery)return consoleAuthRecovery;
 consoleAuthRecovery=Promise.resolve().then(()=>{const value=prompt('请输入控制台访问令牌：'),token=String(value||'').trim();if(!token){consoleAuthCancelled=true;localStorage.removeItem('consoleToken');throw new Error('未授权');}localStorage.setItem('consoleToken',token);return token;});
 const clear=()=>{consoleAuthRecovery=null;};consoleAuthRecovery.then(clear,clear);return consoleAuthRecovery;
}
function api(path, method, body, signal) {
  if ((method || 'GET').toUpperCase() !== 'GET' || signal) return requestApi(path,method,body,0,signal);
  if (apiReadFlights.has(path)) return apiReadFlights.get(path);
  const work = requestApi(path,method,body);apiReadFlights.set(path,work);
  const clear = () => { if (apiReadFlights.get(path) === work) apiReadFlights.delete(path); };
  work.then(clear,clear);return work;
}
async function requestApi(path, method, body, _retried = 0, signal) {
  const headers = body ? {'content-type':'application/json'} : {};
  const token = localStorage.getItem('consoleToken');
  if (token) headers['x-console-token'] = token;
  const res = await fetch(path, { method: method || 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal });
  if (res.status === 401) {
    if (_retried >= 2) {
      localStorage.removeItem('consoleToken');
      throw new Error('未授权');
    }
    await recoverConsoleToken(token);
    return requestApi(path, method, body, _retried + 1, signal);
  }
  return res.json();
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
let emLoaded = false;
const emElement = id => document.getElementById(id);
function emScheduleRow(row={start:'08:00',end:'09:00',activity:'自由活动',quiet:false}) {
  const el=document.createElement('div');el.className='row em-schedule';
  el.innerHTML='<input type="time" aria-label="作息开始"><input type="time" aria-label="作息结束"><input aria-label="活动名称" placeholder="活动"><label><input type="checkbox"> 安静时段</label><button type="button">移除</button>';
  const fields=el.querySelectorAll('input');fields[0].value=row.start;fields[1].value=row.end;fields[2].value=row.activity;fields[3].checked=row.quiet;
  el.querySelector('button').onclick=()=>el.remove();emElement('emScheduleRows').append(el);
}
async function emRun(work) {
  const status=emElement('emMessage');status.textContent='处理中…';
  try{await work();status.textContent='已完成。';}catch(error){status.textContent=error.message;}
}
async function emLoadConfig() {
  const r=await api('/api/emotional-companion');if(!r.ok)throw new Error(r.error);
  const c=r.config;emElement('emEnabled').checked=c.enabled;emElement('emQuietStart').value=c.quietStart;emElement('emQuietEnd').value=c.quietEnd;
  emElement('emDaily').value=c.dailyProactiveLimit;emElement('emVoice').value=c.voiceProbability;emElement('emSticker').value=c.stickerProbability;
  emElement('emGrace').value=c.graceDays;emElement('emDecay').value=c.decayPerDay;emElement('emScheduleQuiet').checked=c.respectSchedule;
  emElement('emMemoryLimit').value=c.memoryContextLimit??3;emElement('emContextChars').value=c.contextChars??1800;
  emElement('emScheduleRows').replaceChildren();c.schedule.forEach(emScheduleRow);
  emElement('emKnown').replaceChildren(...r.profiles.map(p=>{const o=document.createElement('option');o.value=p.channel;o.label=p.label||p.subject;return o;}));
  emLoaded=true;
}
async function emLoadProfile() {
  const key=emElement('emKey').value.trim(),subject=emElement('emSubject').value.trim();
  const r=await api('/api/emotional-companion?'+new URLSearchParams({key,subject}));if(!r.ok)throw new Error(r.error);if(!r.profile)throw new Error('请填写会话');
  const p=r.profile;
  emElement('emSnapshot').textContent=`${p.label||p.subject} · ${p.relationshipLabel} · 心情 ${p.mood} · 作息 ${p.activity?.activity||'自由安排'} · 互动 ${p.interactions} 次`;
  for(const [id,value]of [['emFavor',p.favor],['emTrust',p.trust],['emIntimacy',p.intimacy]])emElement(id).value=Number(value.toFixed(1));
  emElement('emRelationship').value=p.relationship;emElement('emNoContact').checked=p.noContact;
  function list(id,rows,text,removeAction){
    const box=emElement(id);box.replaceChildren();
    if(!rows.length){box.textContent='暂无记录';return;}
    for(const row of rows){const el=document.createElement('div');el.className='row';const label=document.createElement('span');label.textContent=text(row);label.style.flex='1';el.append(label);
      if(removeAction){const button=document.createElement('button');button.type='button';button.textContent='删除';button.onclick=()=>emRun(()=>emAction(removeAction,{id:row.id}));el.append(button);}box.append(el);}
  }
  list('emDates',p.dates,x=>`${x.date} ${x.title}`,'removeDate');
  list('emMemories',p.memories.slice().reverse(),x=>x.text,'forget');
  list('emDiaries',p.diaries.slice(-7).reverse(),x=>`${x.day}  来信 ${x.count} 条：${x.notes.join(' / ')}`);
}
async function emAction(action,input={}) {
  const r=await api('/api/emotional-companion','POST',{action,key:emElement('emKey').value.trim(),subject:emElement('emSubject').value.trim(),input});if(!r.ok)throw new Error(r.error);await emLoadProfile();
}
emElement('emotionPanel').addEventListener('toggle',()=>{if(emElement('emotionPanel').open&&!emLoaded)void emRun(emLoadConfig);});
emElement('emAddSchedule').onclick=()=>emScheduleRow();
emElement('emLoad').onclick=()=>emRun(emLoadProfile);
emElement('emSaveConfig').onclick=()=>emRun(async()=>{
  const schedule=[...document.querySelectorAll('.em-schedule')].map(el=>{const x=el.querySelectorAll('input');return {start:x[0].value,end:x[1].value,activity:x[2].value,quiet:x[3].checked};});
  const r=await api('/api/emotional-companion','POST',{action:'config',config:{enabled:emElement('emEnabled').checked,quietStart:emElement('emQuietStart').value,quietEnd:emElement('emQuietEnd').value,dailyProactiveLimit:Number(emElement('emDaily').value),voiceProbability:Number(emElement('emVoice').value),stickerProbability:Number(emElement('emSticker').value),graceDays:Number(emElement('emGrace').value),decayPerDay:Number(emElement('emDecay').value),memoryContextLimit:Number(emElement('emMemoryLimit').value),contextChars:Number(emElement('emContextChars').value),respectSchedule:emElement('emScheduleQuiet').checked,schedule}});if(!r.ok)throw new Error(r.error);
});
emElement('emSaveProfile').onclick=()=>emRun(()=>emAction('profile',{favor:Number(emElement('emFavor').value),trust:Number(emElement('emTrust').value),intimacy:Number(emElement('emIntimacy').value),relationship:emElement('emRelationship').value,noContact:emElement('emNoContact').checked}));
emElement('emAddDate').onclick=()=>emRun(()=>emAction('date',{date:emElement('emDate').value.trim(),title:emElement('emDateTitle').value.trim()}));
emElement('emRemember').onclick=()=>emRun(()=>emAction('remember',{text:emElement('emMemory').value.trim()}));
let localVoiceUrl = '', localVoiceBusy = false;
async function refreshLocalVoices() {
  if (localVoiceBusy) return;
  const select = document.getElementById('localVoiceSelect'), status = document.getElementById('localVoiceStatus');
  try {
    const data = await api('/api/voice/settings'); if (!data.ok) throw new Error(data.error);
    select.replaceChildren(...data.voices.map(v => new Option(v.name, v.id))); select.value = data.selected;
    select.disabled = false; document.getElementById('localVoiceSave').disabled = document.getElementById('localVoicePreview').disabled = false;
    status.textContent = '当前音色：' + data.voices.find(v => v.id === data.selected).name;
  } catch (error) {
    select.disabled = true; document.getElementById('localVoiceSave').disabled = document.getElementById('localVoicePreview').disabled = true;
    status.textContent = (error.message || '本地语音未就绪') + '；可点击“重启语音服务”恢复。';
  }
}
document.getElementById('localVoiceRefresh').onclick = refreshLocalVoices;
document.getElementById('localVoiceRestart').onclick = async () => {
  if (localVoiceBusy) return;
  localVoiceBusy = true;
  const status = document.getElementById('localVoiceStatus'), button = document.getElementById('localVoiceRestart');
  const controls = ['localVoiceSelect','localVoiceSave','localVoicePreview','localVoiceRefresh'];
  for (const id of controls) document.getElementById(id).disabled = true;
  button.disabled = true; button.textContent = '正在重启…';
  document.getElementById('localVoiceAudio').pause();
  let restored = false;
  try {
    status.textContent = '正在重启语音服务，旧日志会先备份；正在等待健康检查…';
    let data = await api('/api/voice/restart','POST',{});
    if (!data.ok) throw Error(data.error || '重启未开始');
    const deadline = Date.now() + 250000;
    while (data.job?.state === 'restarting') {
      if (Date.now() > deadline) throw Error('等待超时，请刷新音色或查看语音服务日志；不要连续重复点击。');
      await new Promise(resolve => setTimeout(resolve,1500));
      data = await api('/api/voice/service');
      if (!data.ok) throw Error(data.error || '读取重启状态失败');
    }
    if (data.job?.state !== 'ready' || !data.health?.available) throw Error(data.job?.message || '重启后语音服务仍未就绪');
    restored = true;
  } catch (error) { status.textContent = error.message || '重启未完成，请查看语音服务日志'; }
  finally {
    localVoiceBusy = false; button.disabled = false; button.textContent = '重启语音服务';
    document.getElementById('localVoiceRefresh').disabled = false;
  }
  if (restored) { await refreshLocalVoices(); status.textContent = '语音服务已重启，健康检查通过；' + status.textContent; }
};
async function localVoiceAction(preview) {
  if (localVoiceBusy) return; localVoiceBusy = true;
  const save = document.getElementById('localVoiceSave'), test = document.getElementById('localVoicePreview'), status = document.getElementById('localVoiceStatus');
  save.disabled = test.disabled = true;
  try {
    const voice = document.getElementById('localVoiceSelect').value;
    if (!preview) {
      const data = await api('/api/voice/settings', 'POST', { voice }); if (!data.ok) throw new Error(data.error);
      status.textContent = '已保存：' + data.voices.find(v => v.id === data.selected).name + '，下一句生效。';
    } else {
      status.textContent = '正在合成试听，CPU模式可能需要稍等…';
      const response = await fetch('/api/voice/preview', { method: 'POST', headers: { 'content-type': 'application/json', 'x-console-token': localStorage.getItem('consoleToken') || '' }, body: JSON.stringify({ voice }) });
      if (!response.ok) throw new Error((await response.json()).error || '试听失败');
      const player = document.getElementById('localVoiceAudio'); player.pause();
      if (localVoiceUrl) URL.revokeObjectURL(localVoiceUrl);
      localVoiceUrl = URL.createObjectURL(await response.blob()); player.src = localVoiceUrl; player.hidden = false;
      status.textContent = '试听已生成，不会发给QQ，也不会修改已保存音色。';
      try { await player.play(); } catch { status.textContent += ' 点击播放按钮即可。'; }
    }
  } catch (error) { status.textContent = error.message; }
  finally { localVoiceBusy = false; save.disabled = test.disabled = false; }
}
document.getElementById('localVoiceSave').onclick = () => localVoiceAction(false);
document.getElementById('localVoicePreview').onclick = () => localVoiceAction(true);
function openNativePond(){const frame=document.getElementById('biliNativeFrame');if(!frame.getAttribute('src')){const value=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';frame.src='/bilibili/?token='+encodeURIComponent(value);}}
function fmtAgoMs(ms) {
  if (ms === null || ms === undefined || ms === '') return '未知';
  const n=Number(ms);if(!Number.isFinite(n)||n<0)return '未知';
  if(n<1000)return '刚刚';if(n<60000)return Math.round(n/1000)+' 秒';
  if(n<3600000)return Math.round(n/60000)+' 分钟';if(n<86400000)return Math.round(n/3600000)+' 小时';
  return Math.round(n/86400000)+' 天';
}
// SnowLuma 上游健康：控制台是唯一的可视化出口（桥接侧只有日志）。
// 旧版桥接的 /api/status 没有 snowluma 字段，一律当「未知」处理，不抛错。
function renderQQGatewayHealth(sl) {
  const el = document.getElementById('qqGatewayWarn');
  const strong = document.getElementById('metricQQGateway');
  const hint = document.getElementById('metricQQGatewayHint');
  if (!el || !strong || !hint) return;
  if(sl?.transport==='official'){el.style.display='none';strong.textContent=sl.connected?'官方QQ · 已连接':'官方QQ · 未连接';strong.className=sl.connected?'ok':'err';hint.textContent=sl.hint||(sl.connected?(Number.isFinite(sl.lastPacketAgoMs)?'最近消息在'+fmtAgoMs(sl.lastPacketAgoMs)+'前':'网关已就绪，等待官方机器人消息；平台权限与白名单需另外配置'):'请前往“官方QQ机器人”配置凭据与事件权限');return;}
  if (!sl || typeof sl !== 'object') {
    el.style.display = 'none';
    strong.textContent = '未知';
    strong.className = '';
    hint.textContent = '桥接未上报上游健康（旧版桥接）';
    return;
  }
  const degraded = sl.degraded === true;
  const connected = sl.connected === true;
  const ago = sl.lastPacketAgoMs;
  const receiving = Number.isFinite(ago);
  const goodText = sl.good === true ? 'good=true' : sl.good === false ? 'good=false' : 'good 未知';
  if (degraded) {
    strong.textContent = '已连接 · 状态异常';
    strong.className = 'err';
    hint.textContent = 'QQ 上游自报异常，请检查框架状态';
  } else if (!connected) {
    const labels = { stopped:'后台已关闭', connecting:'QQ连接准备中', 'load-timeout':'QQ加载超时', 'pipe-timeout':'QQ组件连接超时', 'qq-login-required':'等待QQ登录', 'web-login-required':'等待后台登录', 'consent-required':'等待确认协议', 'onebot-not-ready':'QQ接口未就绪', 'gateway-auth':'QQ接口认证失败', 'load-failed':'QQ加载失败', 'select-process':'请选择QQ进程' };
    strong.textContent = labels[sl.startup?.state] || '未连接';
    strong.className = 'err';
    hint.textContent = sl.startup?.message?.replace(/SnowLuma/g, 'QQ 上游') || '尚未连上QQ接口；QQ 上游管理页面可访问时，仍需完成 QQ 进程加载与账号登录';
  } else {
    strong.textContent = '正常 · 接收中';
    strong.className = 'ok';
    hint.textContent = (receiving ? '最近一份上游事件包在 ' + fmtAgoMs(ago) + '前 · ' : '')
      + (sl.good === false ? 'good=false' : sl.good === true ? 'good=true' : 'good 未上报');
  }
  if (!degraded) { el.style.display = 'none'; return; }
  document.getElementById('qqGatewayWarnHint').textContent = sl.hint?.replace(/SnowLuma/g, 'QQ 上游')
    || '桥接与 QQ 网关的 WebSocket 连着，但一直收不到 QQ 侧的数据。';
  document.getElementById('qqGatewayWarnPkt').textContent = (receiving ? fmtAgoMs(ago) + '前' : '从未收到')
    + (sl.lastPacketKind ? '（' + sl.lastPacketKind + '）' : '');
  document.getElementById('qqGatewayWarnGood').textContent = goodText;
  el.style.display = '';
}

async function refresh() {
  try {
    const s = await api('/api/status');
    document.querySelectorAll('#modeRow button').forEach(b => (b.classList.toggle('active', b.dataset.mode === s.mode), b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode))));
    document.getElementById('roleText').textContent = s.role || '无';
    document.getElementById('roleModeText').textContent = s.roleMode === 'silent' ? '静默' : '正常';
    const modeLabel = s.mode === 'reserved' ? '一代仿真模式' : s.mode === 'reserved2' ? '二代仿真模式' : s.mode === 'closed-agent' ? '封闭 Agent' : '聊天模式';
    updateOverview(s, modeLabel);
    document.getElementById('activity').textContent = s.activity || '（空）';
    const presetSel = document.getElementById('closedPreset');
    if (presetSel && document.activeElement !== presetSel) presetSel.value = s.closedAgentPreset || '';
  } catch (e) { document.getElementById('statusText').textContent = '连接中断 · 请检查桥接服务'; setConnectionError(e); }
}

async function refreshPresets() {
  try {
    const r = await api('/api/presets');
    const sel = document.getElementById('closedPreset');
    sel.innerHTML = '';
    // 空值 = 使用 DSH 自己声明的默认 preset（closed-agent 的推荐选择）
    const defOpt = document.createElement('option');
    defOpt.value = '';
    defOpt.textContent = '（DSH 默认 preset）';
    sel.appendChild(defOpt);
    for (const p of r.presets) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.id + (p.trust === 'user' ? '（用户）' : '');
      sel.appendChild(opt);
    }
    refresh();
  } catch {}
}

async function saveMode(mode) {
  // 不再硬编码 'router-standard'（DSH 0.1.5 已无此 preset）；
  // 留空表示让桥接使用 DSH 自己声明的默认 preset。
  const preset = document.getElementById('closedPreset').value || '';
  const r = await api('/api/mode', 'POST', { mode, closedAgentPreset: preset });
  if (r.ok) {
    refresh();
    // 桥接会把模式写穿到 DSH 设置；写穿失败时本地值会在下一次 5 秒轮询被覆盖回滚。
    // 不提示的话用户只会看到「刚切过去又自己变回来了」，无从判断原因。
    if (r.dshSynced === false) {
      alert('模式已写入本地，但未能同步到 DSH 设置（DSH 未运行？）——\n下一次轮询（约 5 秒）会把模式改回去。请检查 DSH 与桥接日志。');
    }
  } else {
    alert(r.error || '切换失败');
  }
  return r;
}

