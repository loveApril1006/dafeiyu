const path = require('node:path');
const { signature, distance, maskWindows } = require('./screen-policy.js');

function installLocalCompanion({ app, BrowserWindow, ipcMain, screen, desktopCapturer, nativeImage, powerMonitor, windows, hostRequest, route, onRename }) {
  let settingsWindow, scanning = false, pending = false, locked = false, scene = '', baseline, previous, attempted;
  let sequence = 0, lastRequest = 0, lastOpen = 0, lastAttempt = 0, frames = 0, captureAt = 0;
  let runtimeStatus = '屏幕陪伴已关闭';
  let settingsReady = false;
  const call = async (method, name, value) => {
    const response = await hostRequest(method, route + '/' + name, value === undefined ? undefined : JSON.stringify(value));
    const data = JSON.parse(response.body || '{}');
    if (response.status >= 400 || data.ok === false) throw new Error(data.message || '操作未完成');
    return data;
  };
  const allOwned = () => [...windows.values(), settingsWindow].filter(w => w && !w.isDestroyed());
  const owns = event => allOwned().some(w => w.webContents === event.sender) && event.senderFrame === event.sender.mainFrame;
  const runtime = () => ({ status: runtimeStatus, frames, captureAt, pending, settingsOpen: !!settingsWindow && !settingsWindow.isDestroyed(), settingsReady });
  const report = () => call('POST', 'screen/runtime', runtime()).catch(() => {});
  powerMonitor.on('lock-screen', () => { locked = true; scene = 'locked:' + (++sequence); void call('POST', 'screen/scene', { scene }); });
  powerMonitor.on('unlock-screen', () => { locked = false; });
  powerMonitor.on('suspend', () => { locked = true; scene = 'suspended:' + (++sequence); void call('POST', 'screen/scene', { scene }); });
  powerMonitor.on('resume', () => { locked = false; });

  async function scan(force = false) {
    if (scanning || locked) return;
    scanning = true;
    try {
      const config = await call('GET', 'screen/settings');
      if (config.openId > lastOpen) { lastOpen = config.openId; open(); }
      const manual = force || config.requestId > lastRequest;
      lastRequest = config.requestId || 0;
      if (!config.enabled && !manual) { runtimeStatus = '屏幕陪伴已关闭'; return; }
      if (!config.model) { runtimeStatus = '请先选择视觉模型'; return; }
      if (!manual && powerMonitor.getSystemIdleTime() > 120) { runtimeStatus = '你暂时离开了，暂停看屏幕'; return; }
      if (![...windows.values()].some(w => !w.isDestroyed() && w.isVisible())) { runtimeStatus = '桌宠已隐藏，暂停看屏幕'; return; }
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 }, fetchWindowIcons: false });
      const source = sources.find(s => s.display_id === String(display.id)) || (sources.length === 1 ? sources[0] : null);
      if (!source || source.thumbnail.isEmpty()) throw new Error('未获取到画面');
      const image = maskWindows(source.thumbnail, display.bounds, allOwned().filter(w => w.isVisible()).map(w => w.getBounds()), nativeImage);
      const next = signature(image);
      captureAt = Date.now(); frames++;
      if (!scene || !scene.startsWith(display.id + ':') || distance(baseline, next) > 0.16) {
        scene = display.id + ':' + (++sequence); baseline = next;
        await call('POST', 'screen/scene', { scene });
      }
      const stable = distance(previous, next) < 0.06;
      previous = next;
      runtimeStatus = pending ? '正在看屏幕…' : '屏幕陪伴开启中';
      if (pending || (!manual && (!stable || Date.now() - lastAttempt < config.interval * 1000 || distance(attempted, next) < 0.025))) return;
      pending = true; lastAttempt = Date.now(); attempted = next;
      // Do not await: sampling continues while the model/TTS is busy, cancelling obsolete scenes.
      void call('POST', 'screen/comment', { image: 'data:image/jpeg;base64,' + image.toJPEG(75).toString('base64'), scene, pet: 'main', manual })
        .then(result => { runtimeStatus = result.text ? '点评已送到桌宠' : result.skipped === 'quiet' ? '你正在聊天，暂时不打扰' : '在陪着你，暂时不打扰'; })
        .catch(error => { runtimeStatus = error.message; })
        .finally(() => { pending = false; void report(); });
    } catch { runtimeStatus = '屏幕采集未完成，请检查系统录屏权限或模型设置'; }
    finally { scanning = false; void report(); }
  }

  function open() {
    if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
    settingsWindow = new BrowserWindow({ width: 560, height: Math.min(900, screen.getPrimaryDisplay().workArea.height - 60), minWidth: 500, minHeight: 620, title: '桌宠 · 名字与屏幕陪伴', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'companion-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    settingsWindow.webContents.on('will-navigate', e => e.preventDefault());
    settingsWindow.on('closed', () => { settingsWindow = null; settingsReady = false; });
    void settingsWindow.loadFile(path.join(__dirname, 'companion-settings.html'));
  }
  ipcMain.on('pet:companion-settings', event => { if (owns(event)) open(); });
  ipcMain.handle('pet:work-mode', async(event,action)=>{
    if(!owns(event)||!['start','stop'].includes(action))throw new Error('invalid work action');
    return call('POST','local-work',{action});
  });
  ipcMain.handle('pet:companion', async (event, action, value) => {
    if (!settingsWindow || event.sender !== settingsWindow.webContents || !owns(event)) throw new Error('invalid sender');
    if (action === 'read') {
      const [config, watch, models] = await Promise.all([call('GET', 'config'), call('GET', 'screen/settings'), call('GET', 'models')]);
      const pet = Object.values(config).flatMap(c => c.pets || []).find(p => p.id === 'main');
      settingsReady = true;
      return { name: pet?.name || '桌宠', watch, models, runtime: runtime() };
    }
    if (action === 'status') return { ...await call('GET', 'screen/settings'), runtime: runtime() };
    if (action === 'voices') return call('GET', 'local-voice/options');
    if (action === 'work-status') return call('GET','local-work');
    if (action === 'work') {
      if(!value||!['start','stop','task','done','note','report','config'].includes(value.action))throw new Error('invalid work action');
      return call('POST','local-work',value);
    }
    if (action === 'selectVoice') return call('POST', 'local-voice/select', { voice: value });
    if (action === 'rename') {
      const result = await call('POST', 'local-name', { id: 'main', name: value });
      for (const win of windows.values()) if (!win.isDestroyed()) win.webContents.send('pet:renamed', { id: 'main', name: result.name });
      onRename?.();
      return result;
    }
    if (action === 'probe') return call('POST', 'screen/probe', value);
    if (action === 'save') { const result = await call('POST', 'screen/settings', value); lastAttempt = 0; attempted = null; void scan(); return result; }
    if (action === 'look') {
      await call('POST', 'screen/look', {});
      void scan();
      return { ...runtime(), status: '正在准备看屏幕…' };
    }
    throw new Error('unsupported action');
  });
  const timer = setInterval(() => { void scan(); }, 4000);
  timer.unref?.();
  app.on('before-quit', () => clearInterval(timer));
  return { open, scan };
}
module.exports = { installLocalCompanion };
