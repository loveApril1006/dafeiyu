import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const catalog=JSON.parse(fs.readFileSync('roles/catalog.json','utf8')),rows=Object.entries(catalog.roles).filter(([,r])=>r.adapted),files={'public/console.html':fs.readFileSync('public/console.html','utf8'),'roles/catalog.json':catalog,'roles/安全预览.md':'# 安全预览\n\n<img src=x onerror="window.readerInjected=true">\n\n**加粗文字**\n\n## 第二章\n- 原样显示正文。','state/role-identities.json':Object.fromEntries(rows.map(([n])=>[n,{selfName:'大肥鱼'}])),'state/current-role.json':{role:rows[0][0],mode:'active'}};
for(const [name]of rows)files['roles/'+name+'.md']=fs.readFileSync(path.join('roles',name+'.md'),'utf8');
const h=await bridgeHarness({files,config:{role:{maxInjectChars:23000}}}),server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
const api=async(route,body)=>{const r=await fetch(base+route,{headers:{'x-console-token':'fixture-console-token','content-type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});assert.equal(r.status,200);return r.json();};
let browser;
try{
 const list=await api('/api/roles');assert.equal(list.summaries.filter(r=>r.adapted).length,25);assert(list.summaries.every(r=>!r.truncated));
 await api('/api/roles/limit',{maxInjectChars:32000});assert.equal((await api('/api/roles')).limits.injectMaxChars,32000);await api('/api/roles/limit',{maxInjectChars:23000});
 for(const [name]of rows){await api('/api/role',{role:name});const runtime=h.currentRoleRuntime(),content=files['roles/'+name+'.md'];assert.equal(runtime.sourceName,name);assert.equal(runtime.selfName,'大肥鱼');assert(!runtime.hint.includes('人格正文超出注入上限'));assert(runtime.hint.includes('连续相处的细节'));assert(runtime.hint.length>content.length-500,'long-card details must reach runtime: '+name);}
 await api('/api/role',{role:rows[0][0]});
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());await page.goto(base+'/?token=fixture-console-token#persona');await page.getByRole('button',{name:'阅读人格 大肥鱼-暖心妈妈版',exact:true}).waitFor();
 assert.equal(await page.locator('#roleAdvancedPanel').evaluate(d=>d.open),false);assert.equal(await page.locator('#simPromptText').isVisible(),false);assert.equal(await page.locator('#emEnabled').isVisible(),false);
 if(process.env.PERSONA_SIMPLE_SCREENSHOT){await page.getByRole('button',{name:'群友游戏流 7',exact:true}).click();await page.screenshot({path:process.env.PERSONA_SIMPLE_SCREENSHOT});await page.getByRole('button',{name:'全部 26',exact:true}).click();}
 const active=h.currentRoleRuntime().sourceName;await page.getByRole('button',{name:'阅读人格 大肥鱼-暖心妈妈版',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('roleReaderDownload').disabled);
 assert.equal(h.currentRoleRuntime().sourceName,active);assert((await page.locator('#roleReaderBody').innerText()).includes('游戏偏好'));assert(await page.locator('#roleReaderToc button').count()>15);assert(await page.locator('#roleReaderBody strong').count()>0);
 const downloadPromise=page.waitForEvent('download');await page.locator('#roleReaderDownload').click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'大肥鱼-暖心妈妈版.txt');const downloadFile=await download.path();assert.equal(fs.readFileSync(downloadFile,'utf8'),files['roles/大肥鱼-暖心妈妈版.md']);
 if(process.env.PERSONA_FULL_SCREENSHOT){fs.mkdirSync(path.dirname(process.env.PERSONA_FULL_SCREENSHOT),{recursive:true});await page.screenshot({path:process.env.PERSONA_FULL_SCREENSHOT});}
 await page.setViewportSize({width:390,height:844});const mobile=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,right:document.getElementById('roleReader').getBoundingClientRect().right,top:document.getElementById('roleReader').getBoundingClientRect().top,zoom:getComputedStyle(document.body).zoom}));assert(mobile.scroll<=mobile.width&&mobile.right<=mobile.width,JSON.stringify(mobile));await page.keyboard.press('Escape');assert.equal(await page.locator('#roleReader').evaluate(d=>d.open),false);
 await page.locator('#roleSearch').fill('安全预览');await page.getByRole('button',{name:'阅读人格 安全预览',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('roleReaderDownload').disabled);assert.equal(await page.locator('#roleReaderBody img').count(),0);assert.equal(await page.evaluate(()=>window.readerInjected),undefined);assert((await page.locator('#roleReaderBody').innerText()).includes('<img'));await page.locator('#roleReaderClose').click();
 await page.locator('#roleSearch').fill('');await page.setViewportSize({width:1440,height:1000});if(process.env.PERSONA_GALLERY_SCREENSHOT){await page.locator('#roleCategories').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.PERSONA_GALLERY_SCREENSHOT});}assert.deepEqual(errors,[]);
 console.log('PASS full 25-card runtime delivery, 32k configurable limit, full-text reader and chapters, unchanged active persona, exact text download, safe Markdown, Escape and mobile layout.');
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await h.close();}
