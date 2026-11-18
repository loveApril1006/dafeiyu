import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readConsoleDocument,serveConsoleAsset} from '../src/console-assets.js';
import http from 'node:http';
import {createRequire} from 'node:module';
import {callDouyinConsole} from '../src/douyin-console.js';
import {nativeRequest,needsVision} from '../companion/douyin-native.mjs';
import {douyinModelProfile,fixedDouyinSelection} from '../src/douyin-model-contract.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
for(const route of ['https://example.com/api/state','/api/../state','/api/model/configure','/api/state?token=x','/api/state#x','/api//state'])assert.throws(()=>nativeRequest({route,method:'GET'}));
assert.equal(nativeRequest({route:'/api/memory?query=%E8%AE%B0%E5%BF%86',method:'GET'}).pathname,'/api/memory');
assert.equal(needsVision(nativeRequest({route:'/api/watch/schedule',method:'POST',body:{enabled:true}})),true);
assert.equal(needsVision(nativeRequest({route:'/api/watch/schedule',method:'POST',body:{enabled:false}})),false);
assert.equal(needsVision(nativeRequest({route:'/api/interactions/configure',method:'POST',body:{enabled:true}})),true);
const cache=process.env.DOUYIN_UI_FIXTURE?JSON.parse(fs.readFileSync(process.env.DOUYIN_UI_FIXTURE,'utf8')):{};
for(const route of ['/api/bootstrap','/api/state','/api/watch/schedule','/api/interactions/state','/api/video/status','/api/task/limits','/api/mode/state','/api/comments/state','/api/chat/state','/api/media/state','/api/watch/state','/api/share/state','/api/persona','/api/usage','/api/reports/state'])if(!process.env.DOUYIN_UI_FIXTURE)cache[route]=(await callDouyinConsole(process.cwd(),'native',{method:'GET',route})).data;
cache['/api/persona']={...cache['/api/persona'],manualText:'隔离的人格测试',personaText:'隔离的人格测试'};
cache['/api/chat/contacts']={contacts:[],loginRequired:false,verificationRequired:false,blocked:false,listDiscovery:{scannedToEnd:true,count:0}};
cache['/api/bootstrap']={...cache['/api/bootstrap'],videoTime:{...cache['/api/bootstrap'].videoTime,enabled:true}};
cache['/api/video/status']={...cache['/api/video/status'],allowed:false,reason:'隔离：当前不在允许观看时段。',policy:{...cache['/api/video/status'].policy,enabled:true,dailyMinutes:10},daily:{...cache['/api/video/status'].daily,usedSeconds:0,remainingSeconds:600,requests:0,timeLimitMinutes:10}};
const html=fs.readFileSync('integrations/douyin-standalone/dist/index.html'),consoleHtml=readConsoleDocument(process.cwd());
const light=consoleHtml.match(/:root\s*\{([\s\S]*?)\}/)[1],dark=consoleHtml.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)[1];
const writes=[],external=[],errors=[];let publishing=[],selectedModel=fixedDouyinSelection(),failVision=false,capable=true;
const visions=new Map();
const models=[{provider:'fixture',model:'vision',name:'视觉模型一',supportsImages:true},{provider:'fixture',model:'vision-two',name:'视觉模型二',supportsImages:true},{provider:'fixture',model:'text',name:'文字模型',supportsImages:false}];
const fixtureVision=model=>visions.get(model)||{valid:false,reason:'untested'};
const server=http.createServer(async(req,res)=>{
 if(serveConsoleAsset(req,res,new URL(req.url,'http://localhost'),{root:process.cwd()}))return;
  const url=new URL(req.url,'http://localhost');const json=value=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/douyin/'){res.writeHead(200,{'content-type':'text/html'});return res.end(html);}
  if(url.pathname==='/host'){res.writeHead(200,{'content-type':'text/html'});return res.end(`<html data-theme="light"><head><style>:root{${light}}:root[data-theme=dark]{${dark}}body{margin:0}iframe{width:100%;height:900px;border:0}</style></head><body><iframe id="frame" src="/douyin/"></iframe></body></html>`);}
  if(url.pathname!=='/api/douyin'){res.writeHead(404);return res.end();}
  let raw='';for await(const c of req)raw+=c;const {action,args={}}=JSON.parse(raw);
  if(action==='settings')return json({ok:true,features:{perModelVision:capable,fixedModel:capable},profile:{...douyinModelProfile,fixed:true,hasKey:true,configured:true,configurationValid:true},settings:{configured:true,model:selectedModel.model,memoryFolder:'隔离的测试目录'},model:selectedModel,vision:fixtureVision(selectedModel.model)});
  if(action==='models')return json({ok:true,models:models.map(m=>({...m,vision:fixtureVision(m.model)}))});
  if(action==='status')return json({ok:true,publishing});
  if(action==='native'){
    const request=nativeRequest(args),route=request.pathname;
    if(args.method==='GET')return json({ok:true,data:cache[route]||{}});
    writes.push({action,...args});
    if(route==='/api/persona/card'){cache['/api/persona']={...cache['/api/persona'],manualText:args.body.text,revision:'fixture-saved'};return json({ok:true,data:cache['/api/persona']});}
    if(route==='/api/reports/generate')return json({ok:true,data:{content:'隔离日报测试'}});
    return json({ok:true,data:cache[route.replace('/configure','/state')]||{}});
  }
  writes.push({action,args});
  if(action==='publish-prepare'){publishing=[{id:'fixture-draft',state:'prepared',at:new Date().toISOString(),options:args,check:{ok:true,steps:[]}}];return json({ok:true,draft:publishing[0]});}
  if(action==='publish-upload')publishing[0].state='uploaded';
  if(action==='publish-submit')publishing[0].state='submitted';
  if(action==='select-model'){assert.deepEqual(Object.keys(args),['apiKey']);visions.delete(selectedModel.model);return json({ok:true,message:'隔离密钥已保存'});}
  if(action==='vision-check'){visions.set(selectedModel.model,{valid:!failVision,reason:failVision?'failed':'passed'});return json({ok:!failVision,...(failVision?{error:'隔离视觉测试失败'}:{message:'隔离视觉测试通过'})});}
  return json({ok:true});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();external.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/host');
  const frame=page.frameLocator('#frame');await frame.locator('.settings-tabs').waitFor();
  assert.equal(await frame.locator('.settings-page .panel').first().evaluate(e=>getComputedStyle(e).paddingLeft),'24px','settings panel retains shared inner padding');
  assert.equal(await frame.locator('.persona-section').evaluate(e=>getComputedStyle(e).paddingLeft),'24px','persona section must not lose padding to legacy settings reset');
  for(const name of ['视频观看','好友互动','公开评论','音频与密钥','观看日报','自检与用量','基础设置']){await frame.getByRole('tab',{name,exact:true}).click();await page.waitForTimeout(100);if(errors.length)throw Error(errors.join('\n'));}
  const beforeReadRetry=writes.length;let failedContactRead=false;
  await page.route('**/api/douyin',route=>{const body=route.request().postDataJSON();if(body?.action==='native'&&body.args?.route==='/api/chat/contacts'&&!failedContactRead){failedContactRead=true;return route.abort('failed');}return route.continue();});
  await frame.getByRole('tab',{name:'好友互动',exact:true}).click();await frame.getByRole('button',{name:'读取联系人与群聊',exact:true}).click();
  await frame.getByRole('button',{name:'重新读取会话列表',exact:true}).waitFor();assert(await frame.getByText(/本机连接已恢复，请重新读取会话列表/).isVisible());
  await frame.getByRole('button',{name:'重新读取会话列表',exact:true}).click();await frame.getByText(/本次读取：个人 0 个/).waitFor();assert(!(await frame.getByRole('button',{name:'重新读取会话列表',exact:true}).isVisible()));assert.equal(writes.length,beforeReadRetry,'retrying a list read must never save contacts or toggle interactions');await page.unroute('**/api/douyin');
  await frame.getByRole('button',{name:'◌ 对话与视频',exact:true}).click();const taskInput=frame.getByRole('textbox',{name:'视频任务',exact:true}),startTask=frame.getByRole('button',{name:'开始任务 ↑',exact:true});await taskInput.fill('隔离任务草稿，不执行');assert(await startTask.isDisabled());assert.equal(await frame.locator('#manualTaskStartHint').textContent(),'隔离：当前不在允许观看时段。');
  await frame.getByRole('button',{name:'调整观看时段与额度',exact:true}).click();assert(await frame.getByRole('tab',{name:'视频观看',exact:true}).getAttribute('aria-selected')==='true');assert(await frame.getByText(/今日剩余 600 秒（每日上限 10 分钟）/).isVisible());assert.equal(writes.length,beforeReadRetry,'opening quota settings does not change saved limits');
  await frame.getByRole('button',{name:'◌ 对话与视频',exact:true}).click();cache['/api/video/status']={...cache['/api/video/status'],allowed:true,reason:''};await page.waitForFunction(()=>{const d=document.querySelector('#frame').contentDocument;return [...d.querySelectorAll('button')].some(b=>b.textContent==='开始任务 ↑'&&!b.disabled);});assert(await startTask.isEnabled());await taskInput.fill('');assert(await startTask.isDisabled());assert.equal(await frame.locator('#manualTaskStartHint').textContent(),'请先填写任务内容，或点击“看推荐”等示例。');assert(!writes.some(w=>w.route==='/api/task'));
  cache['/api/video/status']={...cache['/api/video/status'],allowed:false,reason:'隔离：当前不在允许观看时段。'};await frame.getByRole('button',{name:'☷ 业务设置',exact:true}).click();await frame.getByRole('tab',{name:'基础设置',exact:true}).click();
  await frame.getByRole('button',{name:'固定模型与 API',exact:true}).click();await frame.getByRole('dialog',{name:'抖音模型设置'}).waitFor();
  for(const [label,value]of [['服务商',douyinModelProfile.providerName],['固定模型 ID',douyinModelProfile.model],['固定 API 根地址',douyinModelProfile.baseUrl]]){
    const field=frame.getByRole('textbox',{name:label,exact:true});assert.equal(await field.inputValue(),value);assert.notEqual(await field.getAttribute('readonly'),null);
  }
  assert.equal(await frame.getByRole('combobox',{name:'抖音独立模型'}).count(),0);
  const registerLink=frame.getByRole('link',{name:'注册硅基流动（推荐链接） ↗',exact:true});assert.equal(await registerLink.getAttribute('href'),douyinModelProfile.registerUrl);assert.equal(await registerLink.getAttribute('target'),'_blank');assert.match(await registerLink.getAttribute('rel'),/noreferrer/);
  const keyInput=frame.getByRole('textbox',{name:'硅基流动 API 密钥',exact:true});assert.equal(await keyInput.getAttribute('type'),'password');assert.equal(await keyInput.inputValue(),'');
  await keyInput.fill('fixture-personal-secret');assert(await frame.getByRole('button',{name:'测试视觉连接',exact:true}).isDisabled());
  await frame.getByRole('button',{name:'保存 API 密钥',exact:true}).click();await frame.getByText('隔离密钥已保存',{exact:true}).waitFor();assert.equal(await keyInput.inputValue(),'');assert.equal(writes.find(w=>w.action==='select-model').args.apiKey,'fixture-personal-secret');
  await frame.getByRole('button',{name:'测试视觉连接',exact:true}).click();await frame.getByText('隔离视觉测试通过',{exact:true}).waitFor();assert(visions.get(selectedModel.model).valid);
  failVision=true;await frame.getByRole('button',{name:'测试视觉连接',exact:true}).click();await frame.getByText('隔离视觉测试失败',{exact:true}).waitFor();await frame.getByText('支持图片输入 · 视觉连接：测试未通过',{exact:true}).waitFor();
  fs.mkdirSync('state/douyin-ui-check',{recursive:true});await page.screenshot({path:'state/douyin-ui-check/vision-models-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:1000});assert(await frame.locator('body').evaluate(e=>e.scrollWidth<=innerWidth));await page.screenshot({path:'state/douyin-ui-check/vision-models-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1100});
  await frame.getByRole('button',{name:'返回',exact:true}).click();
  await frame.getByRole('tab',{name:'视频观看',exact:true}).click();
  const input=frame.getByRole('textbox',{name:'每日允许时段',exact:true});await input.fill('18:00-23:00');
  await page.waitForTimeout(850);
  const theme=()=>page.evaluate(()=>{const d=document.getElementById('frame').contentDocument;return{theme:d.documentElement.dataset.theme,bg:d.defaultView.getComputedStyle(d.body).backgroundColor,accent:d.defaultView.getComputedStyle(d.documentElement).getPropertyValue('--dsw-alias-brand-primary').trim()};});
  const lightTheme=await theme();assert.equal(lightTheme.theme,'light');
  assert.equal(await frame.getByRole('button',{name:'开始自主观看',exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(77, 107, 254)');
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.waitForFunction(()=>document.getElementById('frame').contentDocument.documentElement.dataset.theme==='dark');
  assert.notEqual((await theme()).bg,lightTheme.bg);assert.equal(await input.inputValue(),'18:00-23:00');
  await page.evaluate(()=>document.documentElement.style.setProperty('--accent','#a23c89'));await page.waitForFunction(()=>getComputedStyle(document.getElementById('frame').contentDocument.documentElement).getPropertyValue('--dsw-alias-brand-primary').trim()==='#a23c89');
  assert.equal(await frame.getByRole('button',{name:'开始自主观看',exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(162, 60, 137)');
  await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.style.removeProperty('--accent');});
  await frame.getByRole('button',{name:'↗ 作品发布',exact:true}).click();await frame.getByRole('textbox',{name:'视频文件绝对路径',exact:true}).fill('E:/fixture.mp4');await frame.getByRole('textbox',{name:'作品标题',exact:true}).fill('测试作品');
  await frame.getByText('封面与配乐',{exact:true}).click();await frame.getByRole('spinbutton',{name:'封面时间（秒，0 为保留默认）'}).fill('2.5');await frame.getByRole('textbox',{name:'本地配乐文件绝对路径'}).fill('E:/fixture.mp3');
  await frame.getByRole('button',{name:'预检并准备作品',exact:true}).click();await frame.getByRole('button',{name:'上传并停在发布前',exact:true}).waitFor();
  assert.equal(writes.find(w=>w.action==='publish-prepare').args.visibility,'private');assert.equal(writes.find(w=>w.action==='publish-prepare').args.coverTime,2.5);
  await frame.getByRole('button',{name:'上传并停在发布前',exact:true}).click();await frame.getByText('抖音 · 仅自己可见 · 已上传，停在发布前',{exact:true}).waitFor();
  page.once('dialog',d=>d.dismiss());await frame.getByRole('button',{name:'确认发布',exact:true}).click();assert(!writes.some(w=>w.action==='publish-submit'));
  page.once('dialog',d=>d.accept());await frame.getByRole('button',{name:'确认发布',exact:true}).click();await frame.getByText('抖音 · 仅自己可见 · 已点击发布，待平台核对',{exact:true}).waitFor();
  await frame.getByRole('button',{name:'☷ 业务设置',exact:true}).click();await frame.getByRole('tab',{name:'视频观看',exact:true}).click();
  fs.mkdirSync('state/douyin-ui-check',{recursive:true});await page.screenshot({path:'state/douyin-ui-check/native-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:1000});await page.waitForTimeout(150);assert.equal(await frame.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true);await page.screenshot({path:'state/douyin-ui-check/native-mobile.png',fullPage:true});
  capable=false;await frame.getByRole('tab',{name:'基础设置',exact:true}).click();await frame.getByRole('button',{name:'固定模型与 API',exact:true}).click();
  await frame.getByText('运行中的抖音后台尚未加载固定配置，请刷新连接后重试。',{exact:true}).waitFor();
  const beforeLegacy=writes.length;assert(await frame.getByRole('button',{name:'保存 API 密钥',exact:true}).isDisabled());assert(await frame.getByRole('button',{name:'测试视觉连接',exact:true}).isDisabled());assert.equal(writes.length,beforeLegacy);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert(writes.some(w=>w.route==='/api/video/policy'&&w.body.windows?.[0]==='18:00-23:00'));
  console.log((process.env.DOUYIN_UI_FIXTURE?'PASS isolated fixture UI':'PASS original UI')+' all seven categories, fixed SiliconFlow model/API, private key field and referral link, read-only API snapshots, isolated autosave, publishing controls/private/cancel/confirm, live light/dark/custom accent, draft preservation, mobile, no external traffic.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
