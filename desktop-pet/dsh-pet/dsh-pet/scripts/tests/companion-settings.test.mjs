import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
test('companion settings renders, renames, switches watching off and surfaces failed vision tests', async () => {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 560, height: 760 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const watch = { enabled: true, interval: 45, model: { provider: 'deepseek-account', model: 'deepseek-flash' }, status: '正在陪你看屏幕' };
      window.saved = [];
      window.companion = {
        voices: async () => ({ selected: 'klee-cute', voices: [{ id: 'klee-cute', name: '可莉' }] }),
        read: async () => ({ name: '小鸽子', watch, models: { providers: [{ id: 'deepseek-account', name: 'DeepSeek', models: [{ id: 'deepseek-flash', name: 'Flash（视觉）' }] }] } }),
        status: async () => watch,
        workStatus: async () => ({ work: { active: false, totalMinutes: 0 } }),
        rename: async name => ({ ok: true, name: name.trim() }),
        save: async v => { window.saved.push(v); Object.assign(watch, v, { status: v.enabled ? '正在陪你看屏幕' : '屏幕陪伴已关闭' }); return watch; },
        probe: async () => { throw new Error('模型没有正确识别测试图'); },
        look: async () => ({ status: '正在看屏幕…' }),
      };
    });
    await page.goto(new URL('../../runtime/electron-helper/companion-settings.html', import.meta.url).href);
    await page.waitForFunction(() => document.getElementById('name').value === '小鸽子');
    await page.getByLabel('桌宠名字').fill('阿璃'); await page.getByRole('button', { name: '保存名字' }).click();
    await page.waitForFunction(() => document.getElementById('notice').textContent.includes('阿璃'));
    await page.getByRole('button', { name: '验证看图能力' }).click();
    await page.waitForFunction(() => document.getElementById('notice').textContent.includes('没有正确识别'));
    await page.locator('#enabled').uncheck(); await page.getByRole('button', { name: '保存陪伴设置' }).click();
    await page.waitForFunction(() => window.saved.length >= 1);
    assert.equal(await page.evaluate(() => window.saved[0].enabled), false);
    assert.deepEqual(errors, []);
    const output = fileURLToPath(new URL('../../../../settings-preview', import.meta.url)); mkdirSync(output, { recursive: true });
    await page.screenshot({ path: output + '/companion-settings.png', fullPage: true });
  } finally { await browser.close(); }
});

test('voice settings recover after service refusal, validate choices and never stay in loading state', async () => {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 560, height: 760 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.voiceMode = 'offline'; window.voiceSelected = 'klee-cute'; window.voiceWrites = [];
      const watch = { enabled: false, interval: 45, status: '屏幕陪伴已关闭' };
      window.companion = {
        read: async () => ({ name: '小鸽子', watch, models: { providers: [] } }), status: async () => watch,
        voices: async () => {
          if (window.voiceMode === 'offline') throw new Error("Error invoking remote method 'pet:companion': Error: fetch failed");
          return { selected: window.voiceMode === 'invalid' ? 'missing' : window.voiceSelected, voices: [{ id: 'klee-cute', name: '可莉' }, { id: 'hutao-playful', name: '胡桃' }] };
        },
        selectVoice: async voice => {
          if (window.voiceMode === 'disconnect-on-save') { window.voiceMode = 'offline'; throw new Error('fetch failed'); }
          window.voiceSelected = voice; window.voiceWrites.push(voice); return { ok: true };
        }
      };
    });
    await page.goto(new URL('../../runtime/electron-helper/companion-settings.html', import.meta.url).href);
    await page.waitForFunction(() => document.getElementById('voice-status').textContent.includes('语音服务未连接'));
    assert.equal(await page.locator('#voice').isDisabled(), true);
    assert.equal(await page.locator('#voice-save').isDisabled(), true);
    assert.equal(await page.locator('#voice-refresh').isEnabled(), true);
    assert.equal(await page.locator('#voice option').textContent(), '音色读取失败，请刷新重试');
    assert.equal(await page.locator('#voice-hint').isVisible(), false);
    await page.evaluate(() => { window.voiceMode = 'ok'; });
    await page.locator('#voice-refresh').click();
    await page.waitForFunction(() => document.getElementById('voice-status').textContent.includes('当前：可莉'));
    assert.equal(await page.locator('#voice-save').isEnabled(), true);
    await page.locator('#voice').selectOption('hutao-playful'); await page.locator('#voice-save').click();
    await page.waitForFunction(() => document.getElementById('voice-status').textContent.includes('当前：胡桃'));
    assert.equal(await page.locator('#voice-hint').isVisible(), true);
    assert.deepEqual(await page.evaluate(() => window.voiceWrites), ['hutao-playful']);
    await page.evaluate(() => { window.voiceMode = 'invalid'; }); await page.locator('#voice-refresh').click();
    await page.waitForFunction(() => document.getElementById('voice-status').textContent.includes('音色列表无效'));
    assert.equal(await page.locator('#voice-save').isDisabled(), true);
    await page.evaluate(() => { window.voiceMode = 'ok'; }); await page.locator('#voice-refresh').click();
    await page.waitForFunction(() => !document.getElementById('voice').disabled);
    await page.evaluate(() => { window.voiceMode = 'disconnect-on-save'; }); await page.locator('#voice-save').click();
    await page.waitForFunction(() => document.getElementById('notice').textContent.includes('语音服务未连接'));
    assert.equal(await page.locator('#voice-save').isDisabled(), true);
    assert.equal(await page.locator('#voice-status').textContent().then(t => t.includes('fetch failed')), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('status reads never overlap, pause while hidden and stop when the settings page closes', async () => {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
  try {
    const page = await browser.newPage();
    await page.clock.install();
    await page.addInitScript(() => {
      const watch = { enabled: false, interval: 45, status: '已关闭' };
      window.statusReads = 0; window.fakeHidden = false;
      Object.defineProperty(document, 'hidden', { get: () => window.fakeHidden });
      window.companion = {
        read: async () => ({ name: '测试鱼', watch, models: { providers: [] } }),
        voices: async () => ({ selected: 'test', voices: [{ id: 'test', name: '测试音色' }] }),
        workStatus: async () => ({ work: { active: false, totalMinutes: 0 } }),
        status: () => { window.statusReads++; return new Promise(resolve => { window.finishStatus = () => resolve(watch); }); }
      };
    });
    await page.goto(new URL('../../runtime/electron-helper/companion-settings.html', import.meta.url).href);
    await page.waitForFunction(() => document.getElementById('name').value === '测试鱼');
    await page.clock.runFor(2501); assert.equal(await page.evaluate(() => window.statusReads), 1);
    await page.clock.runFor(30000); assert.equal(await page.evaluate(() => window.statusReads), 1);
    await page.evaluate(() => { window.fakeHidden = true; document.dispatchEvent(new Event('visibilitychange')); window.finishStatus(); });
    await page.clock.runFor(30000); assert.equal(await page.evaluate(() => window.statusReads), 1);
    await page.evaluate(() => { window.fakeHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.evaluate(() => window.statusReads), 2);
    await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.finishStatus(); });
    await page.clock.runFor(30000); assert.equal(await page.evaluate(() => window.statusReads), 2);
  } finally { await browser.close(); }
});
