export function dshFailureKind(error){
  const value=String(error?.code||error?.cause?.code||'')+' '+String(error?.name||'')+' '+String(error?.message||'');
  if(/401|403|unauthori[sz]ed|token exchange|authentication|鉴权/i.test(value))return 'authentication';
  if(/timeout|timed out|abort|超时/i.test(value))return 'timeout';
  if(/ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|fetch failed|socket|network/i.test(value))return 'network';
  return 'rpc';
}
const reasons={authentication:'引擎登录会话需要重新连接',timeout:'引擎响应超时',network:'无法连接引擎接口',rpc:'引擎接口暂未就绪'};
// A slow settings aggregator alone does not prove the host is offline. Both
// probes use authenticated local RPC; neither starts a model request.
export async function probeDsh(api, unwrap) {
  try {
    const settings = unwrap(await api.callUnary('settings.describe', {}, AbortSignal.timeout(8000)), 'settings/describe');
    return { ok: true, settings, degraded: false };
  } catch (settingsError) {
    if (dshFailureKind(settingsError) === 'authentication') api.invalidateAuth();
    try {
      unwrap(await api.callUnary('account.getState', {}, AbortSignal.timeout(2500)), 'account/getState');
      return { ok: true, degraded: true };
    } catch (fallbackError) {
      const kind = dshFailureKind(fallbackError);
      return { ok: false, error: kind === 'authentication' || kind === 'network' ? fallbackError : settingsError };
    }
  }
}
export function createDshHealth({now=Date.now,failureThreshold=3,graceMs=15000}={}){
  const started=now();let state='checking',ready=false,failures=0,lastSuccessAt=null,lastFailureAt=null,reason=null,settingsDegraded=false;
  return {
    success({degraded=false}={}){state='connected';ready=true;failures=0;lastSuccessAt=now();reason=null;settingsDegraded=degraded;return this.snapshot();},
    failure(error){failures++;lastFailureAt=now();reason=dshFailureKind(error);settingsDegraded=false;
      if(failures>=failureThreshold&&now()-(lastSuccessAt??started)>=graceMs){state='offline';ready=false;}else state='reconnecting';
      return this.snapshot();},
    snapshot(){return {state,ready,failures,failureThreshold,lastSuccessAt,lastFailureAt,reason,settingsDegraded,hint:state==='connected'?(settingsDegraded?'引擎可连接，设置同步稍后重试':'引擎连接正常'):state==='checking'?'正在检查引擎连接':state==='reconnecting'?`${reasons[reason]||'连接暂时中断'}，正在自动重试（${Math.min(failures,failureThreshold)}/${failureThreshold}）`:`${reasons[reason]||'引擎不可用'}，连续检查失败，正在自动重连`};}
  };
}
