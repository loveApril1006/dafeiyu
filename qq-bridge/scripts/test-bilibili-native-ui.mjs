import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readConsoleDocument,serveConsoleAsset} from '../src/console-assets.js';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {createNativePond} from '../companion/bilibili-native.mjs';
import {biliDay} from '../companion/bilibili-core.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fs.mkdtempSync(path.resolve('state/bili-native-fixture-'));fs.mkdirSync(path.join(root,'companion'));
fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({dsh:{baseUrl:'http://127.0.0.1:1',provider:'fixture',model:'fixture'}}));
const app=createNativePond({root:path.join(root,'companion'),legacy:{request:async()=>({})},runtimePath:path.resolve('integrations/bilibili-runtime'),loadCatalog:async()=>[]});
const day=biliDay();
fs.writeFileSync(path.join(app.home,'history.jsonl'),JSON.stringify({date:day,ts:Date.now(),bvid:'BV1EPnG6DEJC',title:'原版封面墙测试视频',owner:'测试UP',picked:true,pic:'https://i0.hdslb.com/test.jpg',keywords:['开源'],note:'实际字幕总结'})+'\n');
fs.writeFileSync(path.join(app.home,'memory.jsonl'),JSON.stringify({t:'记忆测试：喜欢开源工具',d:day,bv:'BV1EPnG6DEJC'})+'\n');
fs.mkdirSync(path.join(app.home,'diary'),{recursive:true});fs.writeFileSync(path.join(app.home,'diary',day+'.md'),'今天阅读了一个开源工具视频，这是日记测试。');
const html=fs.readFileSync('integrations/bili-standalone/dist/index.html');
const consoleSource=readConsoleDocument(path.resolve('.'));
const lightPalette=consoleSource.match(/:root\s*\{([\s\S]*?)\}/)[1],darkPalette=consoleSource.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)[1];
const themeHost=`<!doctype html><html data-theme="light"><style>:root{${lightPalette}}[data-theme="dark"]{${darkPalette}}iframe{width:100%;height:900px;border:0}</style><button id="themeToggle" onclick="document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'">切换主题</button><iframe id="biliNativeFrame" src="/bilibili/?token=fixture"></iframe></html>`;
const writes=[];const flow={loggedIn:false,running:false,override:{},normalize:false,rejectConfig:false,holdPond:false};
const server=http.createServer(async(req,res)=>{
 if(serveConsoleAsset(req,res,new URL(req.url,'http://localhost'),{root:process.cwd()}))return;
 if(req.url==='/theme-host'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(themeHost);return;}
 if(req.url.startsWith('/api/bili-pond/')){
  if(req.method==='POST')writes.push(req.url);
  if(req.url==='/api/bili-pond/model-account-state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,account:'unknown'}));return;}
  if(req.method==='GET'&&req.url.startsWith('/api/bili-pond/pond')){const value=await app.request('GET',req.url);const snapshot=structuredClone({...value,config:{...value.config,...flow.override}});if(flow.holdPond){flow.holdPond=false;await new Promise(resolve=>{flow.releasePond=resolve;flow.onHold?.();});}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot));return;}
  if(req.method==='POST'&&req.url==='/api/bili-pond/config'){let raw='';for await(const part of req)raw+=part;const patch=JSON.parse(raw);res.setHeader('Content-Type','application/json');if(flow.rejectConfig){res.end(JSON.stringify({ok:false,error:'fixture save rejected'}));return;}Object.assign(flow.override,patch,flow.normalize?{transcribe:false}:{});const value=await app.request('GET','/api/bili-pond/pond');res.end(JSON.stringify({ok:true,config:{...value.config,...flow.override}}));return;}
  if(req.url==='/api/bili-pond/status'){const value=await app.request('GET','/api/bili-pond/status');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...value,loggedIn:flow.loggedIn,running:flow.running}));return;}
  if(req.url==='/api/bili-pond/run'){flow.running=true;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,started:true}));return;}
  if(req.url==='/api/bili-pond/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,providers:[],current:{},profileKnown:true}));return;}
  if(req.url==='/api/bili-pond/login/start'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,key:'fixture',qr:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+k3ioAAAAASUVORK5CYII='}));return;}
  if(req.method==='POST'&&req.url!=='/api/bili-pond/config'){res.writeHead(400);res.end('{}');return;}
  await app.handle(req,res);return;
 }
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],missing=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()===404)missing.push(new URL(response.url()).pathname);});
 await context.route('https://i0.hdslb.com/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+k3ioAAAAASUVORK5CYII=','base64')}));
 await page.goto(url+'/?token=fixture');
 await page.getByText('原版封面墙测试视频',{exact:true}).waitFor();
 assert.ok(await page.locator('.pond-v img').count());
 await page.waitForFunction(()=>{const image=document.querySelector('.pond-account-icon img');return image?.complete&&image.naturalWidth>0;});
 await page.locator('.pond-v img').evaluate(image=>image.dispatchEvent(new Event('error')));
 await page.waitForFunction(()=>{const image=document.querySelector('.pond-cover-fallback');return image?.complete&&image.naturalWidth>0;});
 assert.equal((await app.request('GET','/api/bili-pond/pond')).config.autoComment,false);
 assert(await page.getByRole('button',{name:'开始观看',exact:true}).isDisabled(),'logged-out state must block starting');
 await page.getByRole('searchbox',{name:'搜索视频',exact:true}).fill('不存在的视频');await page.getByText('没有匹配的视频',{exact:true}).waitFor();await page.getByRole('searchbox',{name:'搜索视频',exact:true}).fill('');
 flow.loggedIn=true;await page.getByRole('button',{name:'刷新',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='开始观看'&&!b.disabled));
 flow.loggedIn=false;await page.getByRole('button',{name:'开始观看',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='开始观看'&&b.disabled));assert.equal(writes.filter(x=>x==='/api/bili-pond/run').length,0,'fresh login failure must block stale ready UI');flow.loggedIn=true;await page.getByRole('button',{name:'刷新',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='开始观看'&&!b.disabled));
 await page.getByRole('button',{name:'开始观看',exact:true}).dblclick();await page.getByRole('button',{name:/观看中/}).waitFor();assert(await page.getByRole('button',{name:/观看中/}).isDisabled());assert.equal(writes.filter(x=>x==='/api/bili-pond/run').length,1,'double click must start only one mock run');
 flow.running=false;await page.getByRole('button',{name:'刷新',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='开始观看'&&!b.disabled));
 await page.locator('.pond-interaction-policy>summary').click();
 const transcribe=page.locator('.pond-quick-sw').filter({hasText:'自动转写'}).getByRole('switch');
 async function saveTranscribe(){const response=page.waitForResponse(r=>r.url().endsWith('/api/bili-pond/config')&&r.request().method()==='POST');await transcribe.click();await response;await page.waitForFunction(()=>!document.querySelector('.pond-quick-sw:last-child [role=switch]').disabled);}
 flow.normalize=true;await saveTranscribe();assert.equal(await transcribe.getAttribute('aria-checked'),'false','server-normalized false must override optimistic true');
 flow.normalize=false;flow.holdPond=true;const held=new Promise(resolve=>flow.onHold=resolve);await page.getByRole('button',{name:'刷新',exact:true}).click();await held;
 await saveTranscribe();assert.equal(await transcribe.getAttribute('aria-checked'),'true');flow.releasePond();await page.getByRole('button',{name:'刷新',exact:true}).waitFor();assert.equal(await transcribe.getAttribute('aria-checked'),'true','late pre-save snapshot must not roll back saved config');
 await saveTranscribe();assert.equal(await transcribe.getAttribute('aria-checked'),'false');
 flow.rejectConfig=true;await saveTranscribe();assert.equal(await transcribe.getAttribute('aria-checked'),'false','rejected save must roll back');flow.rejectConfig=false;
 await page.locator('.pond-interaction-policy>summary').click();
 await page.locator('.pond-tabs').getByText('笔记',{exact:true}).click();await page.getByText('记忆测试：喜欢开源工具',{exact:false}).waitFor();
 await page.locator('.pond-tabs').getByText('日记',{exact:true}).click();await page.getByText('今天阅读了一个开源工具视频，这是日记测试。',{exact:true}).waitFor();
 await page.locator('.pond-tabs').getByText('设置',{exact:true}).click();await page.locator('.pond-settings [data-bd-page]').waitFor();
 assert.equal(await page.locator('[data-bd-card-body]').first().evaluate(e=>getComputedStyle(e).paddingLeft),'24px','settings retain shared card padding');
 assert.deepEqual(await page.locator('[data-bd-sw]').first().evaluate(e=>({height:getComputedStyle(e).height,padding:getComputedStyle(e).padding})),{height:'22px',padding:'0px'},'switch must not inherit ordinary button padding');
 await page.locator('.pond-tabs').getByText('视频',{exact:true}).click();
 const initialTheme=await page.evaluate(()=>({mode:document.documentElement.dataset.theme,bg:getComputedStyle(document.body).backgroundColor}));
 await page.evaluate(()=>{localStorage.setItem('qq-console-theme','dark');dispatchEvent(new StorageEvent('storage',{key:'qq-console-theme',newValue:'dark'}));});
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),initialTheme.bg);
 await page.evaluate(()=>{localStorage.setItem('qq-console-theme','light');dispatchEvent(new StorageEvent('storage',{key:'qq-console-theme',newValue:'light'}));});
 fs.mkdirSync('state/bilibili-verification',{recursive:true});await page.screenshot({path:'state/bilibili-verification/native-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.pond-library').evaluate(e=>getComputedStyle(e).paddingLeft),'16px','mobile uses compact shared spacing');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'state/bilibili-verification/native-mobile.png',fullPage:true});
 const host=await context.newPage();await host.goto(url+'/theme-host');
 const embedded=host.frameLocator('#biliNativeFrame');await embedded.locator('.pond-tabs').waitFor();
 const themeSnapshot=()=>host.evaluate(()=>{const p=document.documentElement,d=document.getElementById('biliNativeFrame').contentDocument;return {mode:d.documentElement.dataset.theme,accent:d.defaultView.getComputedStyle(d.documentElement).getPropertyValue('--accent').trim(),expected:getComputedStyle(p).getPropertyValue('--accent').trim(),bg:d.defaultView.getComputedStyle(d.querySelector('.pond-workspace-bar')).backgroundColor};});
 const lightTheme=await themeSnapshot();assert.equal(lightTheme.mode,'light');assert.equal(lightTheme.accent,lightTheme.expected);
 await embedded.locator('.pond-tabs').getByText('笔记',{exact:true}).click();
 await host.locator('#themeToggle').click();await host.waitForFunction(()=>document.getElementById('biliNativeFrame').contentDocument.documentElement.dataset.theme==='dark');
 const darkTheme=await themeSnapshot();assert.equal(darkTheme.accent,darkTheme.expected);assert.notEqual(darkTheme.bg,lightTheme.bg);
 await embedded.getByRole('heading',{name:'观看笔记',exact:true}).waitFor();
 await host.evaluate(()=>document.documentElement.style.setProperty('--accent','#a23c89'));
 await host.waitForFunction(()=>document.getElementById('biliNativeFrame').contentDocument.documentElement.style.getPropertyValue('--accent').trim()==='#a23c89');
 await host.close();
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.deepEqual(writes.filter(x=>!['/api/bili-pond/run','/api/bili-pond/config'].includes(x)),[]);
 console.log('PASS redesigned pond workspace: fresh readiness guard, normalized saves, late-read isolation, rollback, search, single mock run, videos/notes/diary/settings, original backend contracts, themes/mobile and no real external writes.');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));app.close();}
