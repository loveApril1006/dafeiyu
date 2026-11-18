// Read-only live UI acceptance. Blocks every browser write and external request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const token = cfg.consoleToken || fs.readFileSync('state/console-token', 'utf8').trim();
const headers = { 'X-Console-Token': token }, base = 'http://127.0.0.1:' + (cfg.consolePort || 3100);
const r = await fetch(base + '/api/bilibili-chat/status', { headers, signal: AbortSignal.timeout(35000) });
assert(r.ok); const status = await r.json();
assert(status.ok && status.config.enabled && status.config.feedbackEnabled && status.native.available && status.native.environmentReady);
assert.equal((await fetch(base + '/api/bilibili-chat/status')).status, 401);
assert.equal((await fetch(base + '/api/bilibili-chat/status', { headers: { ...headers, 'x-agent-call': '1' } })).status, 403);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const context = await browser.newContext({ extraHTTPHeaders: headers, viewport: { width: 1280, height: 960 } });
  await context.addInitScript(t => localStorage.setItem('consoleToken', t), token);
  let writes = 0;
  await context.route('**/*', route => {
    const req = route.request(), url = new URL(req.url());
    if (!['GET', 'HEAD'].includes(req.method())) writes++;
    return url.origin === base && ['GET', 'HEAD'].includes(req.method()) ? route.continue() : route.abort();
  });
  const page = await context.newPage(); let errors = 0;
  page.on('pageerror', () => errors++);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-view="bilibili-chat"]').click();
  const frame = page.frameLocator('#bilibiliChatFrame');
  await frame.locator('#fields:not([disabled])').waitFor({ timeout: 35000 });
  assert.equal(await frame.locator('#enabled').isChecked(), true);
  assert.equal(await frame.locator('#maxRounds').inputValue(), String(status.config.maxRounds));
  assert.equal(await frame.locator('#sharedVideosEnabled').isChecked(),true);
  assert.equal(await frame.locator('#sharedVideoReplyEnabled').isChecked(),true);
  assert.equal(await frame.locator('#rememberSharedVideos').isChecked(),true);
  assert.equal(await frame.locator('#sharedSubtitleChars').inputValue(),String(status.config.sharedSubtitleChars));
  assert.equal(await frame.locator('#sharedAudioSeconds').inputValue(),String(status.config.sharedAudioSeconds));
  assert.match(await frame.locator('#connection').textContent(), /已登录|登录|验证/);
  fs.mkdirSync('state/bilibili-chat-audit', { recursive: true });
  await frame.locator('#settings').screenshot({ path: 'state/bilibili-chat-audit/live-settings.png' });
  assert.equal(errors, 0); assert.equal(writes, 0);
  const model = JSON.parse(fs.readFileSync('companion/bili-native-data/config.json', 'utf8'));
  const report = { enabled: true, feedbackEnabled: true, loggedIn: status.native.loggedIn,
    environmentReady: status.native.environmentReady, maxRounds: status.config.maxRounds,
    dailyRounds: status.config.dailyRounds, minGapMinutes: status.config.minGapMinutes,
    feedbackDailyMax: status.config.feedbackDailyMax, modelSelected: !!model.dutyProvider && !!model.dutyModel,
    activeJob: !!status.active, jobs: status.jobs.length, liveUiValidated: true,
    sharedVideosEnabled:status.config.sharedVideosEnabled,sharedVideoReplyEnabled:status.config.sharedVideoReplyEnabled,
    rememberSharedVideos:status.config.rememberSharedVideos,sharedVideoDailyMax:status.config.sharedVideoDailyMax,
    sharedSubtitleChars:status.config.sharedSubtitleChars,sharedTranscribeEnabled:status.config.sharedTranscribeEnabled,sharedAudioSeconds:status.config.sharedAudioSeconds,
    uiErrors: errors, testWrites: writes, realTestMessagesSent: 0, realTestBrowseRounds: 0 };
  fs.writeFileSync('state/bilibili-chat-audit/final-status.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
