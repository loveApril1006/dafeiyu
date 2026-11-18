'use strict';
const $ = id => document.getElementById(id);
let loaded = false, voiceRequest = 0, statusTimer, statusPending = false, disposed = false;
function model() { return $('model').value ? JSON.parse($('model').value) : null; }
function watch() { return { enabled: $('enabled').checked, interval: Number($('interval').value), model: model() }; }
function errorText(error) { return String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, ''); }
function voiceError(error) { const text = errorText(error); return /fetch failed|failed to fetch|econnrefused|network|timeout|timed out|启动.*语音服务/i.test(text) ? '语音服务未连接，请先启动语音服务，再点击“刷新音色”。' : text; }
async function action(button, fn) {
  $(button).disabled = true; $('notice').textContent = '';
  try { await fn(); } catch (error) { $('notice').textContent = errorText(error); }
  finally { $(button).disabled = button === 'voice-save' ? $('voice').disabled : false; }
}
async function init() {
  const data = await window.companion.read();
  $('name').value = data.name; $('enabled').checked = data.watch.enabled; $('interval').value = data.watch.interval;
  $('model').replaceChildren(new Option('选择一个支持图片的模型', ''));
  for (const provider of data.models.providers || []) for (const m of provider.models || []) {
    $('model').add(new Option(provider.name + ' · ' + m.name, JSON.stringify({ provider: provider.id, model: m.id })));
  }
  if (data.watch.model) $('model').value = JSON.stringify(data.watch.model);
  loaded = true; showStatus(data.watch);
}
function showStatus(data) { $('status').textContent = data.busy ? '正在看屏幕并准备点评…' : !data.enabled ? data.status : data.status.includes('失败') || data.status.includes('不支持') ? data.status : data.runtime?.status || data.status; }
async function loadVoices() {
  const request = ++voiceRequest;
  $('voice').disabled = $('voice-save').disabled = $('voice-refresh').disabled = true;
  $('voice').replaceChildren(new Option('正在读取音色…', ''));
  $('voice-status').textContent = '正在连接语音服务…'; $('voice-hint').hidden = true;
  try {
    const data = await window.companion.voices();
    if (request !== voiceRequest) return;
    if (!Array.isArray(data?.voices) || !data.voices.length || !data.voices.every(v => typeof v.id === 'string' && typeof v.name === 'string') || !data.voices.some(v => v.id === data.selected)) throw new Error('音色列表无效，请检查语音服务后刷新音色。');
    $('voice').replaceChildren(...data.voices.map(v => new Option(v.name, v.id)));
    $('voice').value = data.selected; $('voice').disabled = $('voice-save').disabled = false;
    $('voice-status').textContent = '当前：' + data.voices.find(v => v.id === data.selected).name + '；桌宠和QQ语音下一句生效。';
    $('voice-hint').hidden = data.selected !== 'hutao-playful';
  } catch (error) {
    if (request !== voiceRequest) return;
    $('voice').replaceChildren(new Option('音色读取失败，请刷新重试', ''));
    $('voice-status').textContent = voiceError(error);
  } finally { if (request === voiceRequest) $('voice-refresh').disabled = false; }
}
$('voice-refresh').onclick = () => action('voice-refresh', loadVoices);
$('voice-save').onclick = () => action('voice-save', async () => { try { await window.companion.selectVoice($('voice').value); } catch (error) { await loadVoices(); throw new Error(voiceError(error)); } await loadVoices(); });
void loadVoices();
$('rename').onsubmit = e => { e.preventDefault(); void action('rename-button', async () => { const result = await window.companion.rename($('name').value); $('name').value = result.name; $('notice').textContent = '以后就叫我“' + result.name + '”啦。'; }); };
$('probe').onclick = () => action('probe', async () => { if (!model()) throw new Error('请先选择模型'); $('notice').textContent = '正在用测试图片验证，稍等一下…'; const result = await window.companion.probe(model()); $('notice').textContent = result.message; });
$('save').onclick = () => action('save', async () => { showStatus(await window.companion.save(watch())); $('notice').textContent = '陪伴设置已保存。'; });
$('enabled').onchange = () => { if (!$('enabled').checked) void action('save', async () => { showStatus(await window.companion.save(watch())); $('notice').textContent = '屏幕陪伴已关闭。'; }); };
$('look').onclick = () => action('look', async () => { await window.companion.save(watch()); const result = await window.companion.look(); $('status').textContent = result.status; });
function scheduleStatus() { clearTimeout(statusTimer); if (!disposed && !document.hidden) statusTimer = setTimeout(pollStatus, 2500); }
async function pollStatus() {
  if (disposed || document.hidden || !loaded || statusPending) return;
  statusPending = true;
  try { showStatus(await window.companion.status()); } catch { /* Keep the last known status. */ }
  finally { statusPending = false; scheduleStatus(); }
}
document.addEventListener('visibilitychange', () => { clearTimeout(statusTimer); if (!document.hidden && !disposed) void pollStatus(); });
addEventListener('pagehide', () => { disposed = true; clearTimeout(statusTimer); });
void init().then(scheduleStatus).catch(e => { $('status').textContent = '连接失败，请重新打开此窗口'; $('notice').textContent = errorText(e); });
function showWork(result) {
  const w=result.work;
  $('work-status').textContent=w.active?'🐟 一起营业中，陪伴模式已开启 '+w.totalMinutes+' 分钟。':'🐟 工作模式已关闭，今天陪伴 '+w.totalMinutes+' 分钟。';
  $('work-qq').checked=w.qqReports;
  $('work-report').textContent=result.report||result.text||w.summary||'';
  $('work-start').disabled=w.active;$('work-stop').disabled=!w.active;
}
async function readWork(){showWork(await window.companion.workStatus());}
for(const mode of ['start','stop'])$('work-'+mode).onclick=()=>action('work-'+mode,async()=>{const r=await window.companion.work({action:mode});showWork(r);if(r.qqNotice)$('notice').textContent=r.qqNotice;});
$('work-refresh').onclick=()=>action('work-refresh',readWork);
$('work-config').onclick=()=>action('work-config',async()=>{showWork(await window.companion.work({action:'config',workQQReports:$('work-qq').checked}));$('notice').textContent='工作日报开关已保存。';});
for(const [id,kind]of [['work-add','task'],['work-done','done']])$(id).onclick=()=>action(id,async()=>{showWork(await window.companion.work({action:kind,input:{text:$('work-task').value.trim()}}));});
void readWork().catch(e=>{$('work-status').textContent=errorText(e);});
