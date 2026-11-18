// Run the actual transparent Electron helper against an isolated local fixture.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {bridgeHarness} from './audit-bridge-harness.mjs';import {createBilibiliLive} from '../src/bilibili-live-service.js';
import net from 'node:net';import {randomBytes} from 'node:crypto';
const executablePath=process.env.BILIBILI_TEST_ELECTRON;
const testVideo=process.env.BILIBILI_TEST_VIDEO;
assert(executablePath && testVideo,'Set BILIBILI_TEST_ELECTRON and BILIBILI_TEST_VIDEO to local fixture paths');
const {_electron}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const files={};for(const n of ['bilibili-live-television.html','bilibili-live-television.css','bilibili-live-television-ui.js','bilibili-live-television-poster.png'])files['public/'+n]=fs.readFileSync(new URL('../public/'+n,import.meta.url));
const actions=[];const desktop={state:()=>({available:true,running:false}),open:async url=>{actions.push({action:'open',url});return{running:true};},close:()=>{actions.push({action:'close'});return{running:false};},pin:()=>({running:true}),dispose(){actions.push({action:'dispose'});}};
let writes=0,models=0;const h=await bridgeHarness({files,globals:{createBilibiliLive:o=>createBilibiliLive({...o,dependencies:{skipAcl:true,desktopTelevision:desktop,core:{autoTick:false},studio:{autoTick:false},api:{login:()=>({}),room:async()=>({}),send:async()=>writes++},model:async()=>models++}})}});
const server=h.startConsoleServer();await new Promise(r=>server.listening?r():server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,headers={'x-console-token':'fixture-console-token','content-type':'application/json'};
let app;try{
 let r=await fetch(base+'/api/bili-live/native-tv',{method:'POST',headers,body:JSON.stringify({action:'open',url:'https://evil.invalid'})});assert.equal(r.status,200);assert(actions[0].url.startsWith(base+'/bili-live-view/television?view='));assert(!actions[0].url.includes('evil'));
 r=await fetch(base+'/api/bili-live/native-tv',{method:'POST',headers:{...headers,'x-agent-call':'1'},body:'{"action":"open"}'});assert.equal(r.status,403);
 const url=new URL(actions[0].url);url.searchParams.set('native','1');url.searchParams.set('floating','1');
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoge-native-tv-')),controlPipe='\\\\.\\pipe\\xiaoge-tv-'+randomBytes(16).toString('hex'),controlToken=randomBytes(32).toString('hex'),env={...process.env,XIAOGE_TELEVISION_BOOT:JSON.stringify({url:url.href,home,ownerPid:process.pid,controlPipe,controlToken})};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 app=await _electron.launch({executablePath,args:[path.resolve('native-television/main.cjs')],env,timeout:30000});
 const page=await app.firstWindow();await page.waitForFunction(()=>document.getElementById('poster').naturalWidth>1000&&!!window.xiaogeTelevision&&document.documentElement.classList.contains('native'));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const props=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],p=w.webContents.getLastWebPreferences();return{background:w.getBackgroundColor(),top:w.isAlwaysOnTop(),frame:p,menu:w.isMenuBarVisible(),bounds:w.getBounds()};});
 assert(['#000000','#00000000'].includes(props.background));assert(props.top);assert(!props.menu);assert.equal(props.frame.nodeIntegration,false);assert.equal(props.frame.contextIsolation,true);assert.equal(props.frame.sandbox,true);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgba(0, 0, 0, 0)');assert(await page.locator('.window-caption').isHidden());
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();});await page.waitForTimeout(200);
 const screenshot=await page.screenshot({path:path.join(os.tmpdir(),'native-television.png'),omitBackground:true});
 const pixels=await app.evaluate(({nativeImage},base64)=>{const image=nativeImage.createFromBuffer(Buffer.from(base64,'base64')),size=image.getSize(),pixels=image.toBitmap();return {cornerAlpha:pixels[3],centerAlpha:pixels[4*(Math.floor(size.height/2)*size.width+Math.floor(size.width/2))+3]};},screenshot.toString('base64'));assert.equal(pixels.cornerAlpha,0,'native screenshot corner must have real alpha');assert(pixels.centerAlpha>240);
 await page.evaluate(()=>window.xiaogeTelevision.command('larger'));await page.waitForTimeout(200);let bigger=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());assert(bigger.width>props.bounds.width);
 await page.evaluate(()=>window.xiaogeTelevision.command('pin'));assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isAlwaysOnTop()),false);
 await app.evaluate(({ipcMain,BrowserWindow})=>{globalThis.resizeTrace=[];ipcMain.on('xiaoge-tv-window',(_e,a)=>globalThis.resizeTrace.push({a}));ipcMain.on('xiaoge-tv-resize',(_e,dx,dy)=>{const w=BrowserWindow.getAllWindows()[0];globalThis.resizeTrace.push({dx,dy,min:w.getMinimumSize(),max:w.getMaximumSize()});});});
 await page.evaluate(()=>window.xiaogeTelevision.command('resize-start'));await page.waitForTimeout(80);await page.evaluate(()=>window.xiaogeTelevision.resize(-90,-50));await page.waitForTimeout(150);await page.evaluate(()=>window.xiaogeTelevision.command('resize-end'));const resized=await app.evaluate(({BrowserWindow})=>({bounds:BrowserWindow.getAllWindows()[0].getBounds(),trace:globalThis.resizeTrace}));assert(resized.bounds.width<bigger.width,JSON.stringify({bigger,resized}));
 await page.locator('#localFile').setInputFiles(testVideo);await page.waitForFunction(()=>document.getElementById('localVideo').videoWidth>0);if(await page.locator('#localVideo').evaluate(v=>v.paused))await page.locator('#playButton').click();await page.waitForFunction(()=>document.getElementById('localVideo').currentTime>.1);assert(await page.locator('#localVideo').evaluate(v=>v.videoWidth>0));
 await page.evaluate(()=>{const frame=document.createElement('iframe');frame.id='untrustedChild';frame.srcdoc='<script>window.parent.postMessage(typeof window.xiaogeTelevision,"*")<\/script>';document.body.append(frame);});await page.waitForTimeout(100);assert.equal(await page.frameLocator('#untrustedChild').locator('body').evaluate(()=>typeof window.xiaogeTelevision),'undefined');
 await page.evaluate(()=>window.open('https://evil.invalid'));assert.equal((await app.windows()).length,1);
 const pipeCommand=(token,action)=>new Promise(resolve=>{const s=net.createConnection(controlPipe);s.on('error',()=>{});s.once('connect',()=>s.end(JSON.stringify({token,action})+'\n'));s.once('close',resolve);});
 await pipeCommand('wrong-control-token','close');await page.waitForTimeout(100);assert(!page.isClosed());await pipeCommand(controlToken,'pin');await page.waitForTimeout(100);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isAlwaysOnTop()),true);
 assert.deepEqual(errors,[]);assert.equal(models,0);assert.equal(writes,0);
 await Promise.all([page.waitForEvent('close'),page.evaluate(()=>window.xiaogeTelevision.command('close'))]);
 console.log('PASS actual Electron transparent corner alpha, opaque video center, no browser chrome/menu, topmost, resize, sandbox/preload isolation, local video decode and scoped close; private named-pipe auth and Windows control; admin-only fixed native launch route, no agent privilege or external writes');
}finally{if(app)await app.close().catch(()=>{});server.close();}
