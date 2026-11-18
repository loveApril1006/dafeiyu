// Stable, public diagnostics only. Never forward provider bodies or request data.
const failures = Object.freeze({
  model_network: { status: 503, message: '无法连接模型服务，请检查网络、API 根地址和代理后重试。' },
  model_dns: { status: 503, message: '模型服务地址解析失败，请检查 DNS 和网络代理后重试。' },
  model_connect: { status: 503, message: '模型服务连接超时或被拒绝，请检查网络和代理是否可用。' },
  model_tls: { status: 503, message: '模型服务证书验证失败，请检查系统时间和代理证书。' },
  model_timeout: { status: 504, message: '模型请求已取消或超时，请稍后重试。' },
  model_auth: { status: 401, message: '模型服务密钥无效或没有访问权限，请检查密钥和模型权限。' },
  model_balance: { status: 402, message: '模型服务余额或额度不足，请补充余额或切换有额度的模型。' },
  model_rate_limit: { status: 429, message: '模型服务请求受限，请稍后重试并检查请求限额。' },
  model_not_found: { status: 404, message: '模型或接口不存在，请检查模型 ID、API 根地址和接口协议。' },
  model_request: { status: 400, message: '模型服务拒绝请求，请检查模型 ID、接口协议及图片输入支持。' },
  model_vision: { status: 400, message: '当前模型尚未通过视觉测试，请检查模型配置和密钥并重新测试。' },
  model_image: { status: 400, message: '当前模型或画面不支持图片输入，请检查视觉模型和采样图片。' },
  model_output: { status: 502, message: '模型未返回完整有效的正式答案，请重试或更换视觉模型。' },
  model_runtime: { status: 503, message: '机器人模型服务连接失效，请检查本机模型服务和登录状态。' },
  model_unavailable: { status: 502, message: '模型服务暂时不可用，请稍后重试或切换模型。' },
});

export function modelFailureResponse(error) {
  const networkCode={MODEL_DNS:'model_dns',MODEL_CONNECT:'model_connect',MODEL_TLS:'model_tls'}[error?.code];
  if(networkCode)return {status:failures[networkCode].status,error:{code:networkCode,message:failures[networkCode].message}};
  const text = String(error?.message || '');
  const rules = [
    ['model_network', /无法连接.*模型服务|模型连接失败|模型连接已关闭/],
    ['model_timeout', /模型请求.*(?:取消|超时)|模型响应.*超时/],
    ['model_auth', /模型服务密钥无效|硅基流动服务.*(?:密钥|API)/],
    ['model_balance', /模型服务余额或额度不足/],
    ['model_rate_limit', /模型服务请求受限/],
    ['model_not_found', /模型或接口不存在|当前抖音模型已不可用/],
    ['model_vision', /当前抖音模型.*(?:未通过|尚未通过).*视觉测试/],
    ['model_image', /未配置图片输入|不支持图片输入|视频画面格式|抖音采样超出限制/],
    ['model_request', /模型服务拒绝请求|模型请求过大|请求过大/],
    ['model_output', /模型没有返回文本|模型接口只返回了推理内容|模型回答达到长度上限|模型服务未返回有效|模型返回内容过大|模型未返回合法工具决策|模型请求未授权工具/],
    ['model_runtime', /transport failure for \/api\/|本机.*(?:认证|登录)/],
  ];
  const code = rules.find(([, pattern]) => pattern.test(text))?.[0] || 'model_unavailable';
  return { status: failures[code].status, error: { code, message: failures[code].message } };
}

export async function modelHttpFailure(response, label = '模型') {
  // Bound even malformed/HTML error responses. Only known codes select text;
  // arbitrary upstream message strings are never displayed.
  let code;
  const reader = response.body?.getReader();
  if (reader) {
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 8192) { await reader.cancel(); break; }
        chunks.push(value);
      }
      if (size <= 8192) code = JSON.parse(Buffer.concat(chunks).toString('utf8'))?.error?.code;
    } catch {} finally { reader.releaseLock(); }
  }
  const detail = Object.hasOwn(failures, code) ? failures[code].message : ({
    400: failures.model_request.message, 401: failures.model_auth.message,
    403: failures.model_auth.message, 402: failures.model_balance.message,
    404: failures.model_not_found.message, 429: failures.model_rate_limit.message,
    502: failures.model_unavailable.message, 503: failures.model_unavailable.message,
    504: failures.model_timeout.message,
  })[response.status] || '请检查模型服务的可用状态。';
  return new Error(`${label}请求失败（HTTP ${response.status}）：${detail}`);
}
