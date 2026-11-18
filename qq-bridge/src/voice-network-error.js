// Classify network failures without echoing request text, credentials, URLs or local paths.
export function voiceNetworkError(error, stage, { uncertain = false } = {}) {
  const codes = [];
  const visit = (item, depth = 0) => {
    if (!item || depth > 5) return;
    for (const value of [item.code, item.name]) if (/^[A-Za-z0-9_]{1,64}$/.test(value || '')) codes.push(value);
    visit(item.cause, depth + 1);
    if (Array.isArray(item.errors)) for (const child of item.errors.slice(0, 5)) visit(child, depth + 1);
  };
  visit(error);
  const code = codes.find(v => /^(ECONN|ENOTFOUND|EAI_|UND_ERR_|ETIMEDOUT|CERT_|DEPTH_|ERR_TLS)/.test(v))
    || codes.find(v => /^(TimeoutError|AbortError)$/.test(v));
  let hint = '连接意外中断，请检查对应服务的运行日志';
  if (codes.includes('ECONNREFUSED')) hint = '服务未启动或端口未监听，请检查对应服务';
  else if (codes.some(v => /TIMEOUT|ETIMEDOUT|TimeoutError|AbortError/.test(v))) hint = '请求超时；语音模型首次加载可能较慢，可缩短文字或在语音设置中延长模型驻留时间';
  else if (codes.some(v => /ENOTFOUND|EAI_/.test(v))) hint = '地址解析失败，请检查服务地址和 DNS';
  else if (codes.some(v => /ECONNRESET|UND_ERR_SOCKET/.test(v))) hint = '连接被中断，请检查服务是否重启或异常退出';
  const suffix = uncertain ? '；发送结果未确认，请先核对 QQ 聊天，避免重复发送' : '；尚未进入 QQ 发送';
  return new Error(`${stage}失败${code ? `（${code}）` : ''}：${hint}${suffix}`, { cause: error });
}
