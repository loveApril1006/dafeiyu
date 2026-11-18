import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire}from'node:module';
import {createQzoneService}from'../src/qzone/service.js';
const repo=path.resolve('.'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'qzone-schedule-ui-'));
fs.symlinkSync(path.join(repo,'public'),path.join(temp,'public'),'junction');
const service=createQzoneService({root:temp,getDsh:()=>({}),getCreative:()=>({core:{status:()=>({config:{images:{}}})}}),dependencies:{harden:false,model:async()=>{throw Error('test must not request a model')},publish:async()=>{throw Error('test must not publish')},checkPublisher:async()=>{}}});
const token='fixture-ui-only-token',errors=[];
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(req.headers['x-console-token']!==token&&url.searchParams.get('token')!==token){res.writeHead(401);res.end('{}');return;}if(!await service.handle(req,res,url)){res.writeHead(404,{'content-type':'application/json'});res.end('{}');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||path.join(repo,'integrations/douyin-agent-upstream/node_modules/playwright'));
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser=await chromium.launch({headless:true,executablePath});
try{
 const page=await browser.newPage(),base='http://127.0.0.1:'+server.address().port;page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.goto(base+'/qzone/?token='+token);await page.waitForFunction(()=>document.getElementById('publishMode').value==='scheduled');
 for(const id of ['enabled','autoWrite','autoPublish','scheduled','linkCompanion'])await page.locator('#'+id).check();
 await page.locator('#dailyPublishes').fill('0');await page.locator('#save').click();await page.getByText('空间设置已保存。',{exact:true}).waitFor();await page.locator('#decision').getByText(/每日发布额度为0/).waitFor();
 await page.locator('#dailyPublishes').fill('4');await page.locator('#publishMode').selectOption('mood');await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('save').disabled===false);
 assert.equal(service.status().config.dailyPublishes,4);assert.equal(service.status().config.publishMode,'mood');assert.equal(service.status().config.linkCompanion,true);assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS real browser and HTTP: quota-zero explanation, four-per-day save, explicit mood/scheduled selection and companionship toggle; zero model or publication calls.');
}finally{await browser.close();await new Promise(r=>server.close(r));await service.close();assert(temp.startsWith(path.join(os.tmpdir(),'qzone-schedule-ui-')));fs.rmSync(temp,{recursive:true,force:true});}
