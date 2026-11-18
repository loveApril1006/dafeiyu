import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// A credential file's existence is not proof that the account is logged in.
export function createBiliLoginCheck({ root, fetchImpl = fetch, now = Date.now } = {}) {
  const file = path.join(root, 'companion/bili-native-data/bili_credential.json');
  let cache, flight;
  return async function check() {
    let bytes;
    try {
      if (fs.statSync(file).size > 16384) throw Error();
      bytes = fs.readFileSync(file);
    } catch { cache = null; return { loggedIn: false, reason: '请先到后台 B站 页面扫码登录' }; }
    const fingerprint = crypto.createHash('sha256').update(bytes).digest('hex');
    if (cache?.fingerprint === fingerprint && now() < cache.until) return cache.value;
    if (flight?.fingerprint === fingerprint) return flight.promise;
    const promise = (async () => {
      let value;
      try {
        const credential = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
        const sessdata = credential.sessdata;
        if (typeof sessdata !== 'string' || !sessdata || /[;\r\n]/.test(sessdata))
          value = { loggedIn: false, reason: 'B站登录信息不完整，请重新扫码登录' };
        else {
          const response = await fetchImpl('https://api.bilibili.com/x/web-interface/nav', {
            headers: { Cookie: 'SESSDATA=' + sessdata, 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' },
            signal: AbortSignal.timeout(15000), redirect: 'error',
          });
          const data = await response.json();
          value = response.ok && data.code === 0 && data.data?.isLogin === true && Number(data.data.mid) > 0
            ? { loggedIn: true, account: crypto.createHash('sha256').update(String(data.data.mid)).digest('hex').slice(0, 24) }
            : { loggedIn: false, reason: 'B站账号未登录或登录已失效，请重新扫码登录' };
        }
      } catch { value = { loggedIn: false, unavailable: true, reason: '暂时无法验证B站登录状态，没有启动浏览任务' }; }
      cache = { fingerprint, until: now() + (value.loggedIn ? 60000 : 15000), value };
      return value;
    })();
    flight = { fingerprint, promise };
    try { return await promise; } finally { if (flight?.promise === promise) flight = null; }
  };
}
