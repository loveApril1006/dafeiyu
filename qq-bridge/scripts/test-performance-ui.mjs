// Compare actual console request traffic with deterministic poll ticks, no live services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {startConsoleFixture} from './console-ui-fixture.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture=await startConsoleFixture();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report={};
try {
 for(const version of ['before','after']){
  const page=await browser.newPage();let requests=0;
  await page.route('**/*',route=>new URL(route.request().url()).origin===fixture.url?route.continue():route.abort());
  if(version==='before'&&fs.existsSync('state/performance-console-before.html'))await page.route(fixture.url+'/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync('state/performance-console-before.html','utf8')}));
  else if(version==='before'){await page.close();continue;}
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))requests++;});
  await page.addInitScript(()=>{
   window.__pollCallbacks=[];window.__readsPending=0;
   const fetch=window.fetch.bind(window),interval=window.setInterval.bind(window);
   window.fetch=(...args)=>{window.__readsPending++;return fetch(...args).finally(()=>window.__readsPending--);};
   window.setInterval=(fn,ms,...args)=>ms===3000?(window.__pollCallbacks.push(()=>fn(...args)),-1):interval(fn,ms,...args);
  });
  await page.goto(fixture.url+'/#plugins');
  await page.waitForFunction(()=>document.getElementById('metricDsh').textContent==='已连接'&&window.__readsPending===0);
  const startup=requests;
  const tick=async()=>{await page.evaluate(()=>{for(const fn of window.__pollCallbacks)fn();});await page.waitForFunction(()=>window.__readsPending===0);};
  for(let i=0;i<3;i++)await tick();const visible=requests-startup;
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const beforeHidden=requests;for(let i=0;i<3;i++)await tick();const hidden=requests-beforeHidden;
  report[version]={startupRequests:startup,visibleRequestsPerThreeTicks:visible,hiddenRequestsPerThreeTicks:hidden};
  if(version==='after'){
   assert.equal(hidden,0);assert.equal(visible,3);
   const start=requests;
   await page.evaluate(()=>Promise.all([api('/api/status'),api('/api/status'),api('/api/status')]));
   assert.equal(requests-start,1,'Concurrent same-path GETs must share one request');
  }
  await page.close();
 }
 if(report.before)assert(report.after.startupRequests<report.before.startupRequests);
 fs.mkdirSync('state/performance-audit',{recursive:true});fs.writeFileSync('state/performance-audit/ui-requests.json',JSON.stringify(report,null,2));
 console.log('PASS console traffic:',JSON.stringify(report));
} finally {await browser.close();await fixture.close();}
