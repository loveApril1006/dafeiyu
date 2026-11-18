import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {startConsoleFixture} from './console-ui-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'console-model-entry-')),file=path.join(temporary,'console.html');
const html=fs.readFileSync('public/console.html','utf8').replace('</main>','<section data-page="models" id="untitled-test-module" class="card" aria-label="无标题设置模块"><p>隔离检查：此模块没有h2。</p></section><section data-page="unregistered-fixture"><p>未注册模块。</p></section></main>');
fs.writeFileSync(file,html);
const fixture=await startConsoleFixture({htmlPath:file}),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>new URL(r.request().url()).origin===fixture.url?r.continue():r.abort());
  await page.goto(fixture.url+'/#models');await page.waitForFunction(()=>document.getElementById('modelSelect').options.length>0);
  const jump=page.getByRole('button',{name:'添加服务商 / 获取模型列表',exact:true});assert(await jump.isVisible());await jump.click();
  assert(await page.locator('#modelPreset').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
  const labels=await page.locator('#modelPreset option').allTextContents();for(const label of ['阿里云百炼','Google Gemini','OpenAI / GPT','硅基流动 API','Anthropic / Claude'])assert(labels.includes(label));
  await page.getByRole('button',{name:'运行总览',exact:true}).click();await page.getByRole('button',{name:'模型与账号',exact:true}).click();await jump.waitFor({state:'visible'});
  await page.locator('#consoleSearch').fill('无标题设置模块');await page.locator('#searchResults button').click();assert(await page.locator('#searchResults').evaluate(e=>e.hidden));
  await page.setViewportSize({width:390,height:844});await jump.click();assert(await page.locator('#modelPreset').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);assert.deepEqual(fixture.unknownRequests,[]);assert(!fixture.requests.some(r=>r.method==='POST'),'navigation never saves model settings');
  console.log('PASS headerless/unknown modules cannot break startup, model navigation/search initializes, all provider options remain present, jump entry scrolls into view on desktop/mobile, and no settings are changed.');
}finally{await browser.close();await fixture.close();assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(temporary,{recursive:true,force:true});}
