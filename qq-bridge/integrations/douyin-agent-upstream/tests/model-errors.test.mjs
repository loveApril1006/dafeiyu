import test from 'node:test';
import assert from 'node:assert/strict';
import { modelFailureResponse, modelHttpFailure } from '../model-errors.mjs';
import { ApiAgent } from '../api-agent.mjs';

const secret = 'fixture-private-key-and-request';
test('bridge failures retain a useful category and status without exposing exception bodies', () => {
  for (const [message, code, status] of [
    ['无法连接硅基流动模型服务，请检查网络后重试。', 'model_network', 503],
    ['模型服务余额或额度不足（HTTP 402）', 'model_balance', 402],
    ['模型服务密钥无效或没有访问权限（HTTP 401）', 'model_auth', 401],
    ['模型服务拒绝请求（HTTP 400）', 'model_request', 400],
    ['当前抖音模型未通过视觉测试', 'model_vision', 400],
    ['模型没有返回文本', 'model_output', 502],
    ['模型请求已取消或超时，请稍后重试。', 'model_timeout', 504],
    ['transport failure for /api/session/modelCatalog: HTTP 401', 'model_runtime', 503],
    ['unexpected private failure', 'model_unavailable', 502],
  ]) {
    const result = modelFailureResponse(Error(message + ' ' + secret));
    assert.equal(result.status, status); assert.equal(result.error.code, code);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  assert.match(modelFailureResponse(Object.assign(Error(secret),{code:'MODEL_DNS'})).error.message,/解析失败/);
  assert.match(modelFailureResponse(Object.assign(Error(secret),{code:'MODEL_TLS'})).error.message,/证书验证失败/);
});

test('HTTP errors accept known diagnostic codes, never arbitrary remote text, with bounded reads', async () => {
  let error = await modelHttpFailure(new Response(JSON.stringify({ error: { code: 'model_network', message: secret } }), { status: 503 }), '自主观看模型');
  assert.match(error.message, /HTTP 503.*无法连接模型服务/); assert.ok(!error.message.includes(secret));
  for (const body of [JSON.stringify({ error: { code: '__proto__', message: secret } }), JSON.stringify({ error: secret }), '<html>' + secret, 'x'.repeat(9000)]) {
    error = await modelHttpFailure(new Response(body, { status: 400 }), '自主观看模型');
    assert.match(error.message, /HTTP 400.*模型服务拒绝请求/); assert.ok(!error.message.includes(secret));
  }
  assert.match((await modelHttpFailure(new Response(null, { status: 402 }))).message, /余额或额度不足/);
});

test('autonomous watch reports the real network cause and does not retry or execute browser actions', async () => {
  let requests = 0;
  const agent = new ApiAgent({ controller: { execute() { throw Error('No browser action allowed'); } }, config: { apiKey: secret, baseUrl: 'https://synthetic.example', model: 'synthetic' }, fetchImpl: async () => {
    requests++;
    const failure = modelFailureResponse(Error('无法连接硅基流动模型服务，请检查网络后重试。'));
    return new Response(JSON.stringify({ error: failure.error }), { status: failure.status });
  } });
  const id = '7579432563794584933';
  await assert.rejects(() => agent.decideWatch({ observation: { state: { video: { id } }, frames: [{ mimeType: 'image/png', data: 'eA==', videoId: id }] } }), /自主观看模型请求失败（HTTP 503）：无法连接模型服务/);
  assert.equal(requests, 1);
});
