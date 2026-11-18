// Independent robot integration. Neither upstream bundle is registered in DSH.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {hardenDir,isHardened} from '../src/state-acl.mjs';
import {robotDouyinCompletion} from './douyin-model.mjs';
import {makeDouyinPublisher} from './douyin-publisher.mjs';
import {NodeApiClient,unwrap} from '../src/dsh-client.js';
import {SENSITIVE_RE} from '../src/sensitive.js';
import {nativeRequest,needsVision} from './douyin-native.mjs';
import {saveSharedMediaKey} from '../integrations/douyin-agent-upstream/media/key-store.mjs';
import {createVisionChecks,visionTestImageUrl} from './douyin-vision.mjs';
import {modelFailureResponse} from '../integrations/douyin-agent-upstream/model-errors.mjs';
import {configureModelNetwork} from '../src/model-network.js';
import {douyinModelProfile,fixedDouyinSelection,installDouyinModelProfile,describeDouyinModelProfile,saveDouyinModelKey} from './douyin-model-profile.mjs';

const root=path.dirname(fileURLToPath(import.meta.url)),home=path.join(root,'douyin-data');
fs.mkdirSync(home,{recursive:true});if(!isHardened(home)&&!hardenDir(home).ok)throw Error('无法保护抖音登录与记录目录');
const network=configureModelNetwork();
fs.writeFileSync(path.join(home,'model-network-config.json'),JSON.stringify(network));
process.env.XIAOGE_DOUYIN_HOME=home;
process.env.XIAOGE_DOUYIN_BROWSER_PORT='9238';
process.env.DOUYIN_STATE_DIR=path.join(home,'state');
process.env.DEEPSEEK_SHARED_MEMORY_DB=path.join(home,'memory','shared.sqlite');
process.env.DOUYIN_RUNTIME_LOCATION_FILE=path.join(home,'runtime-location.json');
process.env.DOUYIN_MEDIA_ENV_FILE=path.join(home,'media.env');
process.env.DOUYIN_MEDIA_SETTINGS_FILE=path.join(home,'media-settings.json');
process.env.DOUYIN_MEDIA_RUNTIME_ROOT=path.join(home,'media-runtime');
process.env.DOUYIN_NODE_EXECUTABLE=process.execPath;
fs.mkdirSync(process.env.DOUYIN_STATE_DIR,{recursive:true});
const friendPolicy=path.join(process.env.DOUYIN_STATE_DIR,'friend-interactions-policy.json');
if(!fs.existsSync(friendPolicy))fs.writeFileSync(friendPolicy,JSON.stringify({version:1,enabled:false}),{mode:0o600});
const token=fs.readFileSync(path.join(root,'companion-token'),'utf8').trim();
const bridgeConfig=()=>JSON.parse(fs.readFileSync(path.join(root,'../config.json'),'utf8'));
const profileApi=new NodeApiClient(bridgeConfig().dsh.baseUrl,15000,{});
const profileRpc=async(method,args)=>unwrap(await profileApi.callUnary(method,args),method);
let sourceProvider;try{sourceProvider=JSON.parse(fs.readFileSync(path.join(home,'model.json'),'utf8')).provider;}catch(e){if(e.code!=='ENOENT')throw Error('抖音模型选择记录无法读取');sourceProvider=bridgeConfig().dsh.provider;}
await installDouyinModelProfile(profileRpc,{sourceProvider});
const chosenModel=fixedDouyinSelection;
fs.writeFileSync(path.join(home,'model.json'),JSON.stringify(chosenModel()));
const visionChecks=createVisionChecks(home);
function visionState(){return visionChecks.get(chosenModel());}
const localKey=randomBytes(32).toString('hex');
let modelBusy=false,modelConfigBusy=false,closing=false;
const modelServer=http.createServer(async(req,res)=>{
  const send=(status,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(req.headers.authorization!=='Bearer '+localKey||req.url!=='/chat/completions'||req.method!=='POST')return send(403,{error:'Unauthorized'});
  if(closing)return send(503,{error:'抖音模块正在停止'});
  if(modelConfigBusy)return send(409,{error:'正在保存抖音 API 配置，请稍后重试'});
  if(modelBusy)return send(429,{error:'机器人抖音模型正在处理上一条请求'});
  modelBusy=true;const abort=new AbortController();req.on('aborted',()=>abort.abort());res.on('close',()=>{if(!res.writableEnded)abort.abort();});
  try {
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12_000_000)throw Error('请求过大');}
    const body=JSON.parse(raw);
    if((body.messages||[]).some(m=>Array.isArray(m.content)&&m.content.some(c=>c.type==='image_url'))&&!visionState().valid)throw Error('当前抖音模型未通过视觉测试');
    const messages=(body.messages||[]).map(m=>m.role==='tool'?{role:'user',content:'工具执行结果：'+m.content}:m.tool_calls?{role:'assistant',content:JSON.stringify({toolCalls:m.tool_calls})}:m.role==='system'&&typeof m.content==='string'?{...m,content:m.content.replace(/你是[“"]大肥鱼[”"]/g,'你是用户配置人格的机器人')}:m);
    if(body.tools?.length)messages.push({role:'user',content:'请只输出JSON：需要调用工具时 {"toolCalls":[{"name":"工具名","arguments":{}}]}，完成时 {"text":"回答"}。只允许下列工具且严格遵守其参数结构：'+JSON.stringify(body.tools)});
    let usage;
    const text=await robotDouyinCompletion(root,messages,{signal:abort.signal,onUsage:value=>{usage=value;}});
    let message={role:'assistant',content:text};
    if(body.tools?.length){let value;try{value=JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw Error('模型未返回合法工具决策，未执行动作');}
      if(value.toolCalls?.length){if(value.toolCalls.length>4||value.toolCalls.some(c=>!body.tools.some(t=>t.function?.name===c.name)))throw Error('模型请求未授权工具');message={role:'assistant',content:null,tool_calls:value.toolCalls.map((c,i)=>({id:'call_'+i+'_'+Date.now(),type:'function',function:{name:c.name,arguments:JSON.stringify(c.arguments||{})}}))};}else message.content=String(value.text||'');}
    send(200,{choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}],...(usage?{usage}:{})});
  } catch(error){const failure=modelFailureResponse(error);send(failure.status,{error:failure.error});}finally{modelBusy=false;}
});
await new Promise((r,j)=>{modelServer.once('error',j);modelServer.listen(0,'127.0.0.1',r);});
const [{startApiServer},{PersonaMemory},{BrowserController}]=await Promise.all([import('../integrations/douyin-agent-upstream/app.mjs'),import('../integrations/douyin-agent-upstream/persona-memory.mjs'),import('../integrations/douyin-agent-upstream/core.mjs')]);
const personaMemory=new PersonaMemory({memoryDir:path.join(home,'memory'),legacyRoleCardFile:path.join(home,'no-legacy-card.md')});
personaMemory.initialize({importLegacy:false});
function robotPersona(){
  let role;try{role=JSON.parse(fs.readFileSync(path.join(root,'../state/current-role.json'),'utf8')).role;}catch{}
  if(role&&typeof role==='string'&&!/[\\/]/.test(role)){const file=path.join(root,'../roles',role+'.md');if(fs.existsSync(file))return fs.readFileSync(file,'utf8');}
  return fs.readFileSync(path.join(root,'companion-persona.txt'),'utf8');
}
const seed=path.join(home,'persona-seeded.json');
if(!fs.existsSync(seed)){const snapshot=personaMemory.snapshot();personaMemory.saveManualText({text:robotPersona(),expectedRevision:snapshot.revision},{explicit:true});fs.writeFileSync(seed,JSON.stringify({at:new Date().toISOString()}));}
const controller=new BrowserController({source:'api',personaMemory});
const upstream=await startApiServer({port:0,controller,personaMemory,config:{apiKey:localKey,baseUrl:'http://127.0.0.1:'+modelServer.address().port,model:'robot-current',keySource:'机器人模型路由'}});
const base='http://127.0.0.1:'+upstream.address().port;
const bootstrap=await (await fetch(base+'/api/bootstrap')).json();
async function call(method,route,body){
  const response=await fetch(base+route,{method,headers:{'x-session-token':bootstrap.token,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body||{})}:{}),signal:AbortSignal.timeout(85000)});
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'抖音操作失败'),{status:response.status});return data;
}
const publisher=makeDouyinPublisher({home,controller,stopWatch:()=>call('POST','/api/watch/stop',{})});
const routes={
  open:['POST','/api/browser/open'],start:['POST','/api/watch/start'],stop:['POST','/api/watch/stop'],
  schedule:['POST','/api/watch/schedule'],comments:['POST','/api/comments/configure'],
  persona:['POST','/api/persona/card'],options:['POST','/api/watch/options'],
  'contacts':['GET','/api/chat/contacts'],'chat-config':['POST','/api/chat/configure'],
  'interactions':['POST','/api/interactions/configure'],'share-config':['POST','/api/share/configure'],
  'video-policy':['POST','/api/video/policy'],
  'report':['POST','/api/reports/generate'],task:['POST','/api/task']
};
const server=http.createServer(async(req,res)=>{
  const send=(status,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
  if(req.method==='GET'&&req.url==='/health')return send(200,{ok:!closing,service:'xiaoge-douyin',version:'economy-1',closing});
  const supplied=Buffer.from(String(req.headers['x-companion-token']||'')),expected=Buffer.from(token);
  if(req.headers.origin||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return send(403,{ok:false,error:'Unauthorized'});
  try{
    if(req.url==='/shutdown'&&req.method==='POST'){if(closing)return send(200,{ok:true,closing});closing=true;send(200,{ok:true});try{await upstream.stop();}finally{modelServer.close();modelServer.closeIdleConnections();server.close();server.closeIdleConnections();}return;}
    if(closing)return send(503,{ok:false,error:'抖音模块正在停止，请稍后重试'});
    if(req.url!=='/douyin'||req.method!=='POST')return send(404,{ok:false,error:'not found'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>256000)throw Error('请求过大');}
    const {action,args={}}=JSON.parse(raw);
    if(action==='open-folder'){
      if(!['memory','persona'].includes(args.kind))throw Error('无效的目录类型');
      const folder=args.kind==='memory'?path.join(home,'memory'):personaMemory.snapshot().personaFolder||path.join(home,'memory');
      fs.mkdirSync(folder,{recursive:true});const child=spawn('explorer.exe',[folder],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return send(200,{ok:true,message:'已请求打开本地目录'});
    }
    if(action==='settings'){const profile=await describeDouyinModelProfile(profileRpc);return send(200,{ok:true,features:{perModelVision:true,fixedModel:true},profile,settings:{configured:profile.configured,model:profile.providerName+' / '+profile.model,memoryFolder:path.join(home,'memory')},vision:visionState(),model:chosenModel()});}
    if(action==='media-key')return send(200,{ok:true,data:await saveSharedMediaKey(args,{envFile:process.env.DOUYIN_MEDIA_ENV_FILE,explicit:true})});
    if(action==='native'){
      const request=nativeRequest(args);
      if(modelConfigBusy&&request.method==='POST')throw Error('正在保存抖音 API 密钥，请稍后重试。');
      if(needsVision(request)&&!visionState().valid)throw Error('当前模型尚未通过视觉测试，请到基础设置测试或选择视觉模型');
      if(request.method==='POST'&&['/api/task','/api/watch/start','/api/video/start'].includes(request.pathname)||request.method==='POST'&&request.pathname==='/api/watch/schedule'&&request.body.enabled===true)await call('POST','/api/video/policy',{enabled:true});
      if(request.method==='POST'&&request.pathname==='/api/watch/schedule'&&request.body.enabled===false)await call('POST','/api/video/policy',{enabled:false});
      const data=await call(request.method,request.route,request.body);
      if(request.pathname==='/api/bootstrap'){const profile=await describeDouyinModelProfile(profileRpc);data.token='qq-bridge-native';data.config={configured:profile.configured,model:profile.model,keySource:'硅基流动统一密钥（模型独立）'};data.memory.description='抖音模块的人格与观看记忆，独立保存在机器人目录。';}
      return send(200,{ok:true,data});
    }
    if(action==='caption'){
      const topic=String(args.topic||'').trim();if(!topic||topic.length>1200)throw Error('请填写1～1200字的作品内容说明');
      const text=await robotDouyinCompletion(root,[{role:'user',content:'按下面的人格语气，为用户自己提供的视频内容说明拟一份抖音作品文案。没有观看过素材，不虚构观看经历或事实。人格只作为文风，不引用其中的私聊、联系方式、账号、路径或秘密。只输出JSON：{"title":"最多30字","description":"最多1000字","topics":["话题"]}。这是待用户检查的草稿，不执行发布。\n人格：'+personaMemory.snapshot().manualText+'\n内容说明：'+topic}]);
      let data;try{data=JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw Error('模型未返回合法文案，请重试或手动填写');}
      if(typeof data.title!=='string'||!data.title||data.title.length>30||typeof data.description!=='string'||data.description.length>1000||!Array.isArray(data.topics)||data.topics.length>10||data.topics.some(t=>typeof t!=='string'||t.length>50)||SENSITIVE_RE.test(JSON.stringify(data)))throw Error('生成文案无效或包含私人信息，请手动填写');
      return send(200,{ok:true,data,message:'已生成待检查文案，没有上传或发布'});
    }
    if(action==='vision-check'){
      const model=chosenModel();
      const text=await robotDouyinCompletion(root,[{role:'user',content:[{type:'text',text:'看这张合成测试图。只输出JSON：{"color":"图片的主要颜色"}，不要调用工具。'},{type:'image_url',image_url:{url:visionTestImageUrl}}]}],{modelSelection:model});
      const passed=/红|red/i.test(text)&&!/白|white/i.test(text);const record={...model,at:new Date().toISOString(),passed,reply:text.slice(0,160)};
      visionChecks.save(record);
      return send(200,{ok:passed,message:passed?'固定模型通过合成图片识别测试，可以继续登录并设置观看':'固定模型未通过图片识别测试，请检查硅基流动密钥和模型权限后重试'});
    }
    if((action==='start'||action==='task'||action==='schedule'&&args.enabled===true)&&!visionState().valid)throw Error('当前抖音模型尚未通过视觉测试，请到“固定模型与 API”检查密钥并测试视觉连接');
    if(action==='models'||action==='select-model'){
      const models=[{...chosenModel(),name:douyinModelProfile.providerName+' / '+douyinModelProfile.model,supportsImages:true,vision:visionState(),fixed:true}];
      if(action==='models')return send(200,{ok:true,models});
      if(!Object.hasOwn(args,'apiKey'))throw Error('抖音模型与 API 地址已固定为硅基流动 Qwen3-VL，请刷新页面，只需配置 API 密钥。');
      if(modelBusy||modelConfigBusy)throw Error('模型请求或配置正在处理，请稍后保存密钥。');
      modelConfigBusy=true;
      try{const [watch,task]=await Promise.all([call('GET','/api/watch/state'),call('GET','/api/state')]);if(watch.running||task.running)throw Error('请先停止观看或等待任务完成，再保存 API 密钥。');const result=await saveDouyinModelKey(profileRpc,args);visionChecks.clear(chosenModel());return send(200,result);}finally{modelConfigBusy=false;}
    }
    if(action==='status') {
      const [watch,schedule,comments,persona,options,interactions,video,task]=await Promise.all(['/api/watch/state','/api/watch/schedule','/api/comments/state','/api/persona','/api/watch/options','/api/interactions/state','/api/video/status','/api/state'].map(p=>call('GET',p)));
      return send(200,{ok:true,watch,schedule,comments,persona,options,interactions,video,task,model:chosenModel(),vision:visionState(),publishing:publisher.history()});
    }
    if(action==='persona-sync'){const snapshot=personaMemory.snapshot();return send(200,{ok:true,data:personaMemory.saveManualText({text:robotPersona(),expectedRevision:snapshot.revision},{explicit:true})});}
    if(action==='stop'){await call('POST','/api/watch/schedule',{enabled:false});await call('POST','/api/video/policy',{enabled:false});await call('POST','/api/stop',{});return send(200,{ok:true,message:'自动观看与当前任务已停止，自动观看开关已关闭'});}
    if(action==='start'||action==='task'||action==='schedule'&&args.enabled===true)await call('POST','/api/video/policy',{enabled:true});
    if(action==='schedule'&&args.enabled===false)await call('POST','/api/video/policy',{enabled:false});
    if(action?.startsWith('publish-'))return send(200,await publisher.request(action,args));
    const route=routes[action];if(!route)throw Error('未知抖音操作');
    send(200,{ok:true,data:await call(route[0],route[1],args)});
  }catch(error){send(error.status||400,{ok:false,error:error.message});}
});
server.listen(17869,'127.0.0.1',()=>console.log('READY xiaoge-douyin 17869; independent robot integration'));
process.once('SIGTERM',()=>{closing=true;void upstream.stop().catch(()=>{}).finally(()=>{server.close();server.closeIdleConnections();modelServer.close();modelServer.closeIdleConnections();});});
