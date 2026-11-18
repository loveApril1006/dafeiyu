import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright'),root=path.resolve('.');
const h=await bridgeHarness({files:{'public/console.html':fs.readFileSync(path.join(root,'public/console.html'),'utf8')}}),server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),context=await browser.newContext();let prompts=0,currentToken='fixture-console-token';
function dialogs(page){page.on('dialog',async d=>{prompts++;await d.accept(currentToken);});}
async function ready(page){await page.waitForFunction(()=>document.getElementById('statusText')&&localStorage.getItem('consoleToken')&&location.search==='');}
try{
 const page=await context.newPage();dialogs(page);await page.goto(base+'/#persona');await ready(page);assert.equal(prompts,1,'first visit asks once');
 await page.reload();await ready(page);await page.reload();await ready(page);assert.equal(prompts,1,'refreshes restore saved token before prompting');assert.equal(new URL(page.url()).hash,'#persona');
 const another=await context.newPage();dialogs(another);await another.goto(base+'/');await ready(another);assert.equal(prompts,1,'new tab restores the same browser credential');await another.close();
 assert.equal((await fetch(base+'/api/status')).status,401,'API without a token stays unauthorized');
 await page.evaluate(()=>localStorage.setItem('consoleToken','expired-fixture-token'));await page.reload();await ready(page);assert.equal(prompts,2,'expired credential prompts once without redirect loops');
 await page.evaluate(()=>localStorage.setItem('consoleToken','wrong-parallel-token'));const before=prompts;
 await page.evaluate(()=>Promise.all([api('/api/status'),api('/api/roles'),api('/api/whitelist')]));assert.equal(prompts,before+1,'concurrent 401s share one recovery prompt');
 const newToken='rotated-fixture-token-20261029';const rotation=await fetch(base+'/api/console/token',{method:'POST',headers:{'X-Console-Token':currentToken,'content-type':'application/json'},body:JSON.stringify({token:newToken})});assert.equal(rotation.status,200);currentToken=newToken;
 const prior=prompts;await page.reload();await ready(page);assert.equal(prompts,prior+1,'server-side token rotation invalidates the old remembered token');await page.reload();await ready(page);assert.equal(prompts,prior+1,'new credential remains remembered');
 console.log('PASS browser authentication: first login, repeated refresh, hash retention, new tab, expired token, concurrent 401 recovery, rotation invalidation and protected unauthenticated API.');
}finally{await browser.close();await new Promise(r=>server.close(r));await h.close();}
