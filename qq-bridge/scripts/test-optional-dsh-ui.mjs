import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {startConsoleFixture} from './console-ui-fixture.mjs';
import {OPTIONAL_DSH_FEATURES} from '../src/optional-dsh-features.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture=await startConsoleFixture();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],calls=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===fixture.url?route.continue():route.abort());
 const rows=Object.entries(OPTIONAL_DSH_FEATURES).map(([id,feature])=>({id,title:feature.title,description:feature.description,feature,enabled:false,version:'fixture'}));
 await page.route('**/api/dsh/plugins',route=>route.fulfill({json:{ok:true,bundles:rows,plugins:[]}}));
 await page.route('**/api/dsh/plugins/toggle',route=>{
  const input=route.request().postDataJSON();calls.push(input);rows.find(row=>row.id===input.id).enabled=input.enabled;
  return route.fulfill({json:{ok:true,application:'restart-required',message:'插件设置已保存，需要重启 DSH 才能生效'}});
 });
 await page.goto(fixture.url+'/#plugins');
 for(const row of rows){
  const start=page.getByRole('button',{name:'启动 '+row.title,exact:true});await start.waitFor();await start.click();
  await page.getByRole('button',{name:'关闭 '+row.title,exact:true}).waitFor();
  assert.match(await page.locator('#pluginManagerMsg').innerText(),/重启 DSH/);
  await page.getByRole('button',{name:'关闭 '+row.title,exact:true}).click();await start.waitFor();
 }
 assert.equal(calls.length,8);assert(rows.every(row=>row.enabled===false));
 assert.match(await page.locator('#pluginBundleList').innerText(),/500 字符/);
 assert.match(await page.locator('#pluginBundleList').innerText(),/工作区/);
 await page.locator('#pluginSearch').fill('缓存');assert.equal(await page.locator('#pluginBundleList strong').count(),3);
 await page.locator('#pluginSearch').fill('');
 fs.mkdirSync('state/optional-dsh-check',{recursive:true});
 await page.screenshot({path:'state/optional-dsh-check/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'state/optional-dsh-check/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS four feature cards, all initially off, eight real UI actions, restart notices, usage search and mobile layout');
} finally {await browser.close();await fixture.close();}
