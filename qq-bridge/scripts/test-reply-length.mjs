import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
import {createReplyOptions} from '../src/reply-options.js';
import {createRobotOptionsService} from '../src/robot-options-service.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-reply-length-'));
try{
 fs.mkdirSync(path.join(root,'companion'));const file=path.join(root,'companion/reply-options.json');
 const old={revision:7,text:true,images:false,voice:false,stickers:true};fs.writeFileSync(file,JSON.stringify(old));const replies=createReplyOptions(root);
 assert.equal(replies.get().replyLength,'natural');assert(replies.lengthPrompt().includes('10～300字'));assert.deepEqual(JSON.parse(fs.readFileSync(file)),old,'reading migrated defaults must not rewrite user settings');
 for(const replyLength of ['invalid',500,null,{},true])assert.throws(()=>replies.configure({revision:7,replyLength}));assert.deepEqual(JSON.parse(fs.readFileSync(file)),old);
 replies.configure({revision:7,replyLength:'detailed'});assert.throws(()=>replies.configure({revision:7,replyLength:'natural'}),e=>e.status===409);
 const next=createReplyOptions(root).get();for(const key of ['text','images','voice','stickers'])assert.equal(next[key],old[key]);assert.equal(next.replyLength,'detailed');
}finally{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}

const h=await bridgeHarness({files:{'public/robot-options.html':fs.readFileSync(new URL('../public/robot-options.html',import.meta.url),'utf8'),'companion/reply-options.json':{revision:3,text:true,images:false,voice:false,stickers:true},'state/current-role.json':{role:'测试鱼',mode:'active'},'roles/测试鱼.md':'你叫测试鱼，口吻俏皮，习惯短句。'},globals:{createRobotOptionsService:options=>createRobotOptionsService({...options,callPond:async()=>({status:200,data:{policy:{enabled:true}}})})}});
const server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port,headers={'x-console-token':'fixture-console-token','content-type':'application/json'};
const request=async(body,extra={})=>{const r=await fetch(base+'/api/robot-options/'+(body?'replies':'status'),{headers:{...headers,...extra},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};};
let browser;
try{
 assert.equal((await fetch(base+'/api/robot-options/status')).status,401);let snapshot=(await request()).body;const originalFlags={...snapshot.replies};
 const patch={revision:snapshot.replies.revision,replyLength:'detailed'};
 assert.equal((await request(patch,{'x-agent-call':'1'})).status,403);assert.equal((await request(patch,{origin:'https://evil.invalid'})).status,403);
 assert.equal((await request({...patch,replyLength:'invalid'})).status,400);snapshot=(await request(patch)).body;assert.equal(snapshot.replies.replyLength,'detailed');assert.equal((await request(patch)).status,409);
 const key='private:123';h.setMode('reserved2');h.setReady(true);
 const wake=h.buildWakePromptV2(key,'anyMessage');assert.equal(wake.split('【本轮回复篇幅】').length-1,1);assert(wake.includes('300～600字'));
 await h.deliverPrompt(key,'说说你今天的想法');let actual=h.calls.prompts.at(-1).content[0].text;assert(actual.includes('300～600字'));assert(actual.includes('你叫测试鱼'));assert.equal(h.calls.prompts.length,1);
 snapshot=(await request({revision:snapshot.replies.revision,replyLength:'natural'})).body;assert(h.buildWakePromptV2(key,'anyMessage').includes('自然长短'));
 h.setMode('reserved');await h.deliverPrompt(key,'你觉得呢');actual=h.calls.prompts.at(-1).content[0].text;assert(actual.includes('自然长短'));assert(actual.includes('10～300字'));assert(!actual.includes('优先写约180～300字'));assert(actual.includes('不默认列点'));assert.equal(h.calls.prompts.length,2);
 snapshot=(await request({revision:snapshot.replies.revision,replyLength:'expanded'})).body;for(const field of ['text','images','voice','stickers'])assert.equal(snapshot.replies[field],originalFlags[field]);assert.equal(h.calls.sent.length,0);
 if(process.argv.includes('--ui')){
  const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1100,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('consoleToken','fixture-console-token'));await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const loaded=async()=>{await page.waitForFunction(()=>document.querySelector('#message')?.textContent!=='正在读取设置…',null,{timeout:5000});assert.match(await page.locator('#message').innerText(),/按需调整/,JSON.stringify(errors));};
  await page.goto(base+'/robot-options/?token=fixture-console-token');await loaded();assert.equal(await page.locator('#replyLength').inputValue(),'expanded');
  await page.locator('#text').uncheck();await page.locator('#replyLength').selectOption('detailed');await page.locator('#saveReplyLength').click();await page.getByText('设置已保存。',{exact:true}).waitFor();assert.equal(await page.locator('#text').isChecked(),false,'saving length must preserve another section draft');await page.goto(base+'/robot-options/?token=fixture-console-token');await loaded();assert.equal(await page.locator('#replyLength').inputValue(),'detailed');
  assert.equal(await page.locator('#voice').isChecked(),false);assert.equal(await page.locator('#images').isChecked(),false);
  await page.setViewportSize({width:390,height:844});assert(await page.locator('#saveReplyLength').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 }
 console.log('PASS reply length: old settings preserved, validated revisions/auth, live prompt updates in both QQ modes, no extra model calls, optional browser save/reload/mobile. Isolated peers only.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));await h.close();}
