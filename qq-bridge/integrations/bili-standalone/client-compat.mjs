import {adaptPondReliability} from './pond-reliability.mjs';
// Keep the published upstream source unchanged; adapt only the embedded robot build.
export function adaptPondClient(source) {
  source=source.replace(/\r\n/g,'\n');
  source=source.replace(/const POND_ICON = 'data:image\/png;base64,[^']+'/, "const POND_ICON = '/console-assets/assistant-avatar.webp'");
  const replaceWorkspace=(before,after)=>{
    if(source.split(before).length!==2)throw new Error('鱼塘工作台源代码边界不匹配：'+before.slice(0,60));
    source=source.replace(before,after);
  };
  replaceWorkspace("const [finalizing, setFinalizing] = React.useState(false)","const [finalizing, setFinalizing] = React.useState(false)\n      const [gatewayStatus, setGatewayStatus] = React.useState(null)\n      const previousWorkspaceTab = React.useRef('history')");
  replaceWorkspace("React.useEffect(() => {\n        if (tab !== 'history') return","React.useEffect(() => {\n        if (previousWorkspaceTab.current === tab) return\n        previousWorkspaceTab.current = tab\n        if (tab !== 'history') return");
  replaceWorkspace('setRunning(state.running)\n          setFinalizing(state.finalizing)','setGatewayStatus(s)\n          setRunning(state.running)\n          setFinalizing(state.finalizing)');
  replaceWorkspace("return h('div', { className: 'pond' }, [","return h('div', { className: 'pond', qqPondWorkspace: {data, status: gatewayStatus, error: err, tab, setTab, busy, running, finalizing, runElapsed, quickBusy, quickMsg, run, load, syncRun, likedMap, undoArm, undoBusy, onUndoLike} }, [");
  replaceWorkspace('return state\n        } catch { return null }','return state\n        } catch { setGatewayStatus({unavailable:true}); return null }');
  replaceWorkspace("h('h2', { key: 'h' }, '鱼记得')","h('h2', { key: 'h' }, '观看笔记')");
  const rowDescription="desc ? h('div', { 'data-bd-row-desc': '' }, desc) : null";
  if(source.split(rowDescription).length!==2)throw new Error('鱼塘设置说明边界不匹配');
  source=source.replace(rowDescription,"desc ? (typeof desc === 'string' && desc.length > 65 ? h('details', { className: 'studio-help' }, h('summary', null, '使用说明'), h('div', { 'data-bd-row-desc': '' }, desc)) : h('div', { 'data-bd-row-desc': '' }, desc)) : null");
  // Embedded settings should size labels and notices by their content.
  source=source.replace('[data-bd-row-main]{flex:1 1 220px;min-width:0;}', '[data-bd-row-main]{min-width:0;}')
    .replace('[data-bd-msg][data-bd-msg-flex]{flex:1 1 220px;}', '');
  const panel="\n      return h('div', { 'data-bd-page': '', 'data-bd-layout': layout },";
  if(source.split(panel).length!==2)throw new Error('鱼塘模型账号设置边界不匹配');
  source=source.replace(panel,panel+"\n        h('div', { 'data-xiaoge-memory': '' }),\n        h('div', { 'data-xiaoge-model-account': '', xiaogeProvider: dutyProv ?? cfg.dutyProvider, xiaogeModel: dutyModel ?? cfg.dutyModel, xiaogeError: st.lastError, xiaogeLines: st.running ? [] : (runLog?.lines || []), xiaogeRefreshModels: async () => setModels(await jget('/models')) }),");
  source=source.replace("const provOpts = [h('option', { value: '', key: '__default' }, '跟随 headless 默认（推荐）')]", "const provOpts = []");
  const failure="h('div', { 'data-bd-msg': '', 'data-warn': '' }, '⚠️ 上一轮没成功：' + st.lastError.hint)";
  if(source.split(failure).length!==2)throw new Error('鱼塘运行错误提示边界不匹配');
  source=source.replace(failure,"h('div', { 'data-xiaoge-run-failure': '', xiaogeProvider: dutyProv ?? cfg.dutyProvider, xiaogeError: st.lastError, xiaogeLines: runLog?.lines || [] })");
  const qr="h('div', { 'data-bd-qr': '' },";
  if(source.split(qr).length!==3)throw new Error('鱼塘扫码界面版本不匹配，请先检查上游变更');
  const props="h('div', { 'data-bd-qr': '', xiaogeStatus: loginState, xiaogeTone: loginTone, xiaogeBusy: busy === 'login', xiaogeRefresh: onLoginStart, xiaogeClose: () => { if (loginTimer.current) { clearInterval(loginTimer.current); loginTimer.current = null; } setLogin(null); setLoginState(''); } },";
  source=source.replaceAll(qr,props);
  const start="const onLoginStart = async () => {\n        setBusy('login')";
  if(source.split(start).length!==2)throw new Error('鱼塘扫码启动边界不匹配');
  source=source.replace(start,"const onLoginStart = async () => {\n        if (loginTimer.current) { clearInterval(loginTimer.current); loginTimer.current = null; }\n        setLogin(null)\n        setBusy('login')");
  const generated="const r = await jpost('/login/start', {})";
  if(source.split(generated).length!==2)throw new Error('鱼塘扫码生成边界不匹配');
  source=source.replace(generated,generated+"\n          if (!alive.current) return");
  const polled="const p = await jpost('/login/poll', { key: r.key })";
  if(source.split(polled).length!==2)throw new Error('鱼塘扫码轮询边界不匹配');
  return adaptPondReliability(source.replace(polled,polled+"\n              if (!alive.current || loginTimer.current !== timer) return"));
}
