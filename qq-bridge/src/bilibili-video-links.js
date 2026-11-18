// Strict public-link normalization. Never forwards cookies to a shared URL.
const BV = /^BV[a-zA-Z0-9]{10}$/;
const VIDEO_HOSTS = new Set(['www.bilibili.com', 'bilibili.com', 'm.bilibili.com']);
const SHORT_HOSTS = new Set(['b23.tv', 'bili2233.cn']);
function checkResponse(response){
 const text={401:'B站链接需要登录，请在后台重新扫码后再读取',403:'B站拒绝访问这个链接，请检查账号、视频权限或改发BV号',404:'B站视频或短链已失效',412:'B站暂时限制了这个链接的访问，请稍后再试或改发BV号',429:'B站链接解析过于频繁，请稍后再试'}[response.status];
 if(text)throw Object.assign(Error(text),{status:response.status,code:'BILI_LINK_HTTP_'+response.status});
 if(response.status>=400)throw Object.assign(Error('B站链接服务暂时不可用（HTTP '+response.status+'），请稍后再试'),{status:response.status>=500?503:400,code:'BILI_LINK_UNAVAILABLE'});
}
export function directBiliTarget(value) {
  const text = String(value || '').trim();
  if (BV.test(text)) return { bvid: text, page: 1, url: 'https://www.bilibili.com/video/' + text };
  let url; try { url = new URL(text); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
  if (!VIDEO_HOSTS.has(url.hostname)) return null;
  const match = /^\/video\/(BV[a-zA-Z0-9]{10})(?:\/|$)/.exec(url.pathname);
  if (!match) return null;
  const page = Number(url.searchParams.get('p') || 1);
  if (!Number.isInteger(page) || page < 1 || page > 100) throw Error('B站分P超出支持范围');
  return { bvid: match[1], page, url: 'https://www.bilibili.com/video/' + match[1] + (page > 1 ? '?p=' + page : '') };
}
export function extractBiliVideoLinks(text, segments = []) {
  const strings = [String(text || '').slice(0, 32000)];
  for (const segment of Array.isArray(segments) ? segments.slice(0, 30) : []) {
    if (['json', 'xml'].includes(segment?.type)) strings.push(String(segment.data?.data || '').slice(0, 32000));
  }
  const links = new Set();
  for (const raw of strings) {
    const value = raw.replace(/\\\//g, '/').replace(/\\u002f/gi, '/').replace(/\\u0026/gi, '&').replace(/&amp;/gi, '&');
    for (const match of value.matchAll(/https?:\/\/(?:b23\.tv|bili2233\.cn)\/[a-zA-Z0-9]+|https?:\/\/(?:(?:www|m)\.)?bilibili\.com\/video\/(?:BV[a-zA-Z0-9]{10}|av\d{1,14})\/?(?:\?[^\s<>"'\]\)）】\\]*)?|\bBV[a-zA-Z0-9]{10}\b/gi)) {
      if (match[0].length <= 2048) links.add(match[0]); if (links.size >= 3) return [...links];
    }
  }
  return [...links];
}
function safeUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port ||
      !VIDEO_HOSTS.has(url.hostname) && !SHORT_HOSTS.has(url.hostname)) throw Error('短链跳转到不支持的地址，未继续访问');
  url.protocol = 'https:'; url.hash = ''; return url;
}
export async function resolveBiliVideo(value, { fetchImpl = fetch, signal } = {}) {
  const direct = directBiliTarget(value); if (direct) return direct;
  let url; try { url = safeUrl(value); } catch { throw Error('请分享B站视频长链、b23短链或BV号'); }
  const visited = new Set();
  for (let i = 0; i < 5; i++) {
    const found = directBiliTarget(url.href); if (found) return found;
    if (visited.has(url.href)) throw Error('B站短链跳转循环，未继续访问');
    visited.add(url.href);
    const aid = VIDEO_HOSTS.has(url.hostname) && /^\/video\/av(\d{1,14})(?:\/|$)/.exec(url.pathname)?.[1];
    if (aid) {
      const response = await fetchImpl('https://api.bilibili.com/x/web-interface/view?aid=' + aid, {
        headers: { 'User-Agent': 'Mozilla/5.0',Referer:'https://www.bilibili.com/' }, signal: signal || AbortSignal.timeout(15000), redirect: 'error',
      });
      checkResponse(response);
      const data = await response.json();
      if (!response.ok || data.code !== 0 || !BV.test(String(data.data?.bvid))) throw Error('没有解析到这个av号对应的视频');
      return directBiliTarget('https://www.bilibili.com/video/' + data.data.bvid + '?p=' + (url.searchParams.get('p') || 1));
    }
    if (!SHORT_HOSTS.has(url.hostname)) throw Error('这个B站链接不是支持的视频页面');
    const response = await fetchImpl(url.href, { method: 'GET', redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0',Referer:'https://www.bilibili.com/' }, signal: signal || AbortSignal.timeout(15000) });
    if(response.status>=400){try{await response.body?.cancel();}catch{}checkResponse(response);}
    const location = response.headers.get('location');
    try { await response.body?.cancel(); } catch {}
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) throw Error('B站短链暂时未返回视频地址，请稍后再试或发送BV号');
    url = safeUrl(new URL(location, url).href);
  }
  throw Error('B站短链跳转次数过多，未继续访问');
}
