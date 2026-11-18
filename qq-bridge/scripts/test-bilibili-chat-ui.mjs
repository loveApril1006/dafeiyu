import {serveConsoleAsset} from '../src/console-assets.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { BILI_CHAT_DEFAULTS } from '../src/bilibili-chat.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let config = { ...BILI_CHAT_DEFAULTS, revision: 0 }, posts = 0, reads = 0;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if(serveConsoleAsset(req,res,url,{root:process.cwd()}))return;
  const json = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<html style="--accent:#d97792;--bg:#f7f5f9"><body><section data-page="bilibili-chat"><iframe id="frame" style="width:100%;height:1300px;border:0" src="/bilibili-chat/?token=fixture-token"></iframe></section></body></html>'); return;
  }
  if (url.pathname === '/bilibili-chat/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync('public/bilibili-chat.html')); return;
  }
  if (req.headers['x-console-token'] !== 'fixture-token') return json(401, {});
  if (url.pathname === '/api/bilibili-chat/status') {
    reads++; return json(200, { ok: true, config, native: { available: true, loggedIn: false, environmentReady: true, enabled: true, loginReason: '请先登录B站' },
      usage: { rounds: 0, feedback: 0 }, active: null,
      jobs: [{ state: 'done', startedAt: Date.now(), finishedRounds: 1, plannedRounds: 1, reason: '真实记录', feedbackState: 'none', videos: [
        { bvid: 'BV1234567890', title: '<img src=x onerror="window.injected=true">', note: '<script>window.injected=true</script>', url: 'https://www.bilibili.com/video/BV1234567890' }] }] });
  }
  if (url.pathname === '/api/bilibili-chat/config') {
    let text = ''; for await (const chunk of req) text += chunk;
    const patch = JSON.parse(text); assert.equal(patch.revision, config.revision);
    config = { ...config, ...patch, revision: config.revision + 1 }; posts++; return json(200, { ok: true, config });
  }
  return json(404, {});
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin); const frame = page.frameLocator('#frame');
  await frame.locator('#fields:not([disabled])').waitFor();
  assert.match(await frame.locator('#connection').textContent(), /请先登录/);
  assert.equal(await frame.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--accent').trim()), '#d97792');
  assert.equal(await frame.locator('#jobs img').count(), 0); assert.equal(await frame.locator('body').evaluate(() => window.injected), undefined);
  await frame.locator('#enabled').check(); await frame.locator('#maxRounds').selectOption('2');
  await frame.locator('#dailyRounds').fill('4'); await frame.locator('#feedbackProbability').fill('75');
  await frame.locator('#sharedVideoDailyMax').fill('3');await frame.locator('#sharedSubtitleChars').fill('8000');await frame.locator('#sharedAudioSeconds').fill('90');await frame.locator('#sharedTranscribeEnabled').uncheck();
  await frame.locator('#save').click(); await frame.locator('#fields:not([disabled])').waitFor();
  assert.equal(posts, 1); assert.equal(config.enabled, true); assert.equal(config.maxRounds, 2); assert.equal(config.dailyRounds, 4); assert.equal(config.feedbackProbability, .75);
  assert.equal(config.minGapMinutes, 20); assert.equal(config.feedbackEnabled, true);
  assert.equal(config.sharedVideoDailyMax,3);assert.equal(config.sharedSubtitleChars,8000);assert.equal(config.sharedAudioSeconds,90);assert.equal(config.sharedTranscribeEnabled,false);
  assert.equal(await frame.locator('#enabled').isChecked(), true); assert.equal(await frame.locator('#maxRounds').inputValue(), '2');
  fs.mkdirSync('state/bilibili-chat-audit', { recursive: true });
  await page.locator('#frame').screenshot({ path: 'state/bilibili-chat-audit/settings-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.locator('#frame').screenshot({ path: 'state/bilibili-chat-audit/settings-mobile.png' });
  assert.deepEqual(errors, []); assert(reads < 6, 'No perpetual idle polling');
  console.log('PASS linkage UI: inherited palette, not-logged-in explanation, numeric/boolean settings, round/probability saves, XSS-safe records, mobile layout and no idle polling. No model/platform calls.');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
