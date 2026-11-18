// Apply to the embedded build only. Exact boundaries fail closed on upstream changes.
export function adaptPondReliability(source) {
  function replace(before,after) {
    if(source.split(before).length!==2)throw new Error('鱼塘状态同步边界不匹配：'+before.slice(0,65));
    source=source.replace(before,after);
  }
  replace("const previousWorkspaceTab = React.useRef('history')", "const previousWorkspaceTab = React.useRef('history')\n      const configEpoch = React.useRef(0)\n      const loadFlight = React.useRef(null)\n      const statusFlight = React.useRef(null)");
  replace(`const load = React.useCallback(async () => {
        try {
          const r = await jget('/pond?limit=120')
          if (r && r.ok !== false) { setData(r); setErr('') }
        } catch (e) { setErr(String(e && e.message ? e.message : e)) }
        await loadLikes()
      }, [loadLikes])`, `const load = React.useCallback(async () => {
        if (loadFlight.current) return loadFlight.current
        const epoch = configEpoch.current
        const work = (async () => {
          try {
            const r = await jget('/pond?limit=120')
            if (r && r.ok !== false) {
              setData(prev => epoch === configEpoch.current ? r : { ...r, config: prev?.config || r.config })
              setErr('')
            }
          } catch (e) { setErr(String(e?.message || e)) }
          await loadLikes()
        })()
        loadFlight.current = work
        try { await work } finally { if (loadFlight.current === work) loadFlight.current = null }
      }, [loadLikes])`);
  const statusStart="const syncRun = React.useCallback(async () => {";
  const start=source.indexOf(statusStart), end=source.indexOf('\n      }, [])',start);
  if(start<0||end<start||source.indexOf(statusStart,start+1)!==-1)throw new Error('鱼塘运行状态读取边界不匹配');
  source=source.slice(0,start)+`const syncRun = React.useCallback(async () => {
        if (statusFlight.current) return statusFlight.current
        const work = (async () => {
          try {
            const s = await jget('/status')
            if (!s || s.ok === false) throw new Error(s?.error || '无法读取运行状态')
            const state = { ...s, running: Boolean(s.running), finalizing: Boolean(s.finalizing) }
            setGatewayStatus(state)
            setRunning(state.running)
            setFinalizing(state.finalizing)
            setRunElapsed(Number(s.runElapsedSec) || 0)
            return state
          } catch { setGatewayStatus({unavailable:true}); return null }
        })()
        statusFlight.current = work
        try { return await work } finally { if (statusFlight.current === work) statusFlight.current = null }
      }, [])`+source.slice(end+'\n      }, [])'.length);
  replace("const tick = async () => {\n          try {\n            const s = await jget('/status')", "const tick = async () => {\n          try {\n            const s = await syncRun()\n            if (!s) return");
  replace('}, [running, finalizing, load])','}, [running, finalizing, load, syncRun])');
  replace('const previous = (data && data.config) || {}','const previous = (data && data.config) || {}\n        const saveEpoch = ++configEpoch.current');
  replace('setData((prev) => prev ? { ...prev, config: { ...(prev.config || {}), ...(r.config || {}), ...patch } } : prev)', 'const applySavedConfig = configEpoch.current === saveEpoch\n          setData((prev) => prev ? { ...prev, config: applySavedConfig ? { ...(prev.config || {}), ...patch, ...(r.config || {}) } : prev.config } : prev)');
  replace('// 意图 patch 放最后：宿主回包若还是旧快照，也不能把刚点下的模式视觉回滚。','// 以服务端保存结果为准，并隔离保存前已发出的旧读取。');
  replace('setData((prev) => prev ? { ...prev, config: previous } : prev)','const rollbackAllowed = configEpoch.current === saveEpoch\n          setData((prev) => prev ? { ...prev, config: rollbackAllowed ? previous : prev.config } : prev)');
  replace("quickLock.current = false\n          setQuickBusy('')", "configEpoch.current += 1\n          quickLock.current = false\n          setQuickBusy('')");
  replace('onConfigChanged: (p) => setData((prev) => prev ? { ...prev, config: { ...(prev.config || {}), ...p } } : prev)', 'onConfigChanged: (p) => { configEpoch.current += 1; setData((prev) => prev ? { ...prev, config: { ...(prev.config || {}), ...p } } : prev) }');
  return source;
}
