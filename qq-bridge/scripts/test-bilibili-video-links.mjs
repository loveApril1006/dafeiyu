import assert from 'node:assert/strict';
import { directBiliTarget, extractBiliVideoLinks, resolveBiliVideo } from '../src/bilibili-video-links.js';
const bv = 'BV1234567890', canonical = 'https://www.bilibili.com/video/' + bv;
assert.deepEqual(directBiliTarget(canonical + '/?vd_source=private-tracker&p=2'), { bvid: bv, page: 2, url: canonical + '?p=2' });
assert.deepEqual(extractBiliVideoLinks('【比赛分享】 https://b23.tv/dgeYe3l https://b23.tv/dgeYe3l'), ['https://b23.tv/dgeYe3l']);
assert.deepEqual(extractBiliVideoLinks('', [{ type: 'json', data: { data: '{"url":"https:\\/\\/b23.tv\\/dgeYe3l"}' } }]), ['https://b23.tv/dgeYe3l']);
let requests = 0;
assert.equal((await resolveBiliVideo('https://b23.tv/dgeYe3l', { fetchImpl: async (url, options) => {
  requests++; assert.equal(url, 'https://b23.tv/dgeYe3l'); assert.equal(options.redirect, 'manual'); assert.equal(options.headers.Cookie, undefined);
  return new Response(null, { status: 302, headers: { location: canonical + '/?vd_source=private-tracker' } });
} })).url, canonical);
assert.equal(requests, 1);
for (const location of ['http://127.0.0.1/private', 'file:///C:/private', 'https://www.bilibili.com.evil.test/video/' + bv, 'https://user:secret@www.bilibili.com/video/' + bv, 'https://b23.tv:1234/x']) {
  await assert.rejects(resolveBiliVideo('https://b23.tv/example', { fetchImpl: async () => new Response(null, { status: 302, headers: { location } }) }));
}
await assert.rejects(resolveBiliVideo('https://b23.tv/loop', { fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://b23.tv/loop' } }) }), /循环/);
await assert.rejects(resolveBiliVideo('https://b23.tv/html', { fetchImpl: async () => new Response('<script>location="http://localhost"</script>') }), /未返回/);
console.log('PASS B站文本/分享卡/BV/分P/短链解析、去追踪参数、重定向白名单、循环/端口/凭据/本机地址隔离；不访问视频内容或账户');
