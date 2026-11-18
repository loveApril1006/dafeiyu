// Management/OBS adapters for the live controller. OBS tokens never authorize console operations.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {createLiveApi,connectLiveRoom,readLiveCredential} from './bilibili-live-api.js';
import {createLiveController,safeLiveText,liveSettings,liveReplyPrompt} from './bilibili-live-core.js';
import {createLiveStudio} from './bilibili-live-studio.js';
import {createNativeTelevision} from './bilibili-live-native.js';
import {createLiveVideoRequests} from './bilibili-live-video-requests.js';
import {createLiveVideoReader} from './bilibili-live-video-reader.js';
import {hardenDir,isHardened} from './state-acl.mjs';
import {completeDshText} from './dsh-completion.js';
import {NodeApiClient,unwrap,isLoopbackBase} from './dsh-client.js';
import {selectLocalModel} from '../companion/select-local-model.mjs';

export function recentLiveReading(root){
  const file=path.join(root,'companion/bili-native-data/history.jsonl');let text='';
  try{const fd=fs.openSync(file,'r');try{const size=fs.fstatSync(fd).size,start=Math.max(0,size-256*1024),buf=Buffer.alloc(size-start);fs.readSync(fd,buf,0,buf.length,start);text=buf.toString('utf8');if(start)text=text.slice(text.indexOf('\n')+1);}finally{fs.closeSync(fd);}}catch{return [];}
  const result=[];for(const line of text.trim().split(/\r?\n/).reverse()){
    try{const row=JSON.parse(line);if(!/^BV[a-zA-Z0-9]{10}$/.test(row.bvid)||!row.note)continue;if(result.some(n=>n.bvid===row.bvid))continue;
      result.push({bvid:row.bvid,title:String(row.title||'').slice(0,120),note:String(row.note).slice(0,900),url:'https://www.bilibili.com/video/'+row.bvid});if(result.length===8)break;
    }catch{}
  }return result;
}
function wavDuration(audio){
  if(audio.length<44||audio.toString('ascii',0,4)!=='RIFF'||audio.toString('ascii',8,12)!=='WAVE')throw Error('语音服务未返回有效WAV');
  let rate=0,data=0;for(let offset=12;offset+8<=audio.length;){const tag=audio.toString('ascii',offset,offset+4),length=audio.readUInt32LE(offset+4);if(tag==='fmt '&&length>=16&&offset+24<=audio.length)rate=audio.readUInt32LE(offset+16);if(tag==='data'){data=Math.min(length,audio.length-offset-8);break;}offset+=8+length+(length%2);}
  if(!rate||!data)throw Error('语音WAV缺少有效音频数据');return Math.max(300,Math.min(120000,Math.round(data/rate*1000)));
}
export function demoWave(){const b=Buffer.alloc(16044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(16000,40);for(let i=0;i<8000;i++)b.writeInt16LE(Math.sin(i*2*Math.PI*440/16000)*1200*Math.min(1,i/200,(8000-i)/200),44+i*2);return b;}
export function createBilibiliLive({root,getDsh,fetchImpl=fetch,dependencies={}}){
  const home=path.join(root,'companion/bilibili-live-data');fs.mkdirSync(home,{recursive:true});
  if(!dependencies.skipAcl&&!isHardened(home)&&!hardenDir(home).ok)throw Error('无法保护直播数据目录，请检查当前用户权限');
  const audioHome=path.join(home,'audio');fs.mkdirSync(audioHome,{recursive:true});
  const tokenFile=path.join(home,'overlay-token');let viewToken;
  try{viewToken=fs.readFileSync(tokenFile,'utf8').trim();}catch{}
  if(!/^[a-f0-9]{64}$/.test(viewToken||'')){viewToken=randomBytes(32).toString('hex');fs.writeFileSync(tokenFile,viewToken);}
  const api=dependencies.api||createLiveApi({root,fetchImpl});let player=null,previewController=null;const controls=new Map(),controlNow=dependencies.controlNow||(()=>Date.now());
  const desktopTelevision=dependencies.desktopTelevision||createNativeTelevision({root});
  const getSecrets=()=>{const result=[viewToken,...[...controls.values()].map(c=>c.value)];try{result.push(...readLiveCredential(root).secrets);}catch{}try{result.push(fs.readFileSync(path.join(root,'state/console-token'),'utf8').trim());}catch{}const cfg=getDsh();if(cfg?.authToken)result.push(cfg.authToken);return result;};
  const model=dependencies.model||async function(prompt,{signal,demo}){
    if(demo)return prompt.includes('直播总结')?'演练总结：已验证弹幕问答、欢迎观众与礼物感谢的本地流程。本地演练没有连接直播间或发送真实弹幕。':prompt.includes('点评小电视当前选择的视频')?'这是一条小电视点评演练。正式互动会根据当前BV号对应的阅读笔记来说，不会把上一条视频的内容带过来。':'我最近在整理看过的视频笔记，咱们可以聊聊AI工具和开源项目呀。';
    const cfg=getDsh();if(!isLoopbackBase(cfg?.baseUrl))throw Error('请先连接本机DSH聊天引擎');
    const cwd=path.join(home,'model-workspace');fs.mkdirSync(cwd,{recursive:true});
    return completeDshText({baseUrl:cfg.baseUrl,cwd,preset:'bilibili-live',signal,timeoutMs:45000,content:[{type:'text',text:prompt}],selectModel:(client,id,s)=>selectLocalModel(client,unwrap,id,cfg,s)});
  };
  const tts=dependencies.tts||async function(text,{signal,demo}){
    let audio;if(demo)audio=demoWave();else{
      const res=await fetchImpl('http://127.0.0.1:17866/synthesize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,voice:'hutao-playful'}),signal:AbortSignal.any([signal,AbortSignal.timeout(90000)])});
      if(!res.ok)throw Error('语音服务不可用');if(Number(res.headers.get('content-length'))>20*1024*1024)throw Error('语音过大');const chunks=[];let length=0;
      for await(const chunk of res.body){length+=chunk.length;if(length>20*1024*1024)throw Error('语音过大');chunks.push(chunk);}audio=Buffer.concat(chunks);
    }
    signal.throwIfAborted();const durationMs=wavDuration(audio),id=randomUUID();fs.writeFileSync(path.join(audioHome,id+'.wav'),audio,{flag:'wx'});
    const old=fs.readdirSync(audioHome).filter(n=>/^[a-f0-9-]{36}\.wav$/.test(n)).map(n=>({n,time:fs.statSync(path.join(audioHome,n)).mtimeMs})).sort((a,b)=>b.time-a.time);
    for(const row of old.slice(30))fs.unlinkSync(path.join(audioHome,row.n));return {id,durationMs};
  };
  const mirror=dependencies.mirror||async function(text,{signal}){
    const cfg=getDsh();if(!isLoopbackBase(cfg?.baseUrl))throw Error('DSH不可用');const client=new NodeApiClient(cfg.baseUrl,4000,{}),cookie=await client.ensureAuth(signal);signal.throwIfAborted();
    const q='?pet=main&surface=desktop',headers={'content-type':'application/json',cookie};
    const send=async(p,b)=>{signal.throwIfAborted();const r=await fetchImpl(new URL('/dsh-pet-7340/'+p,cfg.baseUrl),{method:'POST',headers,body:JSON.stringify(b),signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])});const result=await r.json();if(!r.ok||result.ok===false)throw Error('桌宠同步未完成');return result;};
    const lock=await send('lock'+q,{ttl:20000});try{await send('broadcast'+q+'&lock='+encodeURIComponent(lock.lockId),{text,voice:false,duration:15000,anim:'talk'});}finally{void fetchImpl(new URL('/dsh-pet-7340/lock/release'+q,cfg.baseUrl),{method:'POST',headers,body:JSON.stringify({lockId:lock.lockId,pet:'main'}),signal:AbortSignal.timeout(3000)}).catch(()=>{});}
  };
  const inspectRoom=async(id,signal)=>{
    if(!dependencies.api){const cfg=getDsh();if(!isLoopbackBase(cfg?.baseUrl))throw Error('请先启动本机DSH聊天引擎');const client=new NodeApiClient(cfg.baseUrl,5000,{});const presets=unwrap(await client.callUnary('agentPresets.list',{},signal),'agentPresets/list').presets||[];
      const live=presets.find(p=>p.id==='bilibili-live');if(!live||live.broken)throw Error('请先关闭全部并重新启动大肥鱼，以加载直播专用的无工具预设');}
    return api.room(id,signal);
  };
  let core,videoRequests,localPort;
  const studio=createLiveStudio({home,getCore:()=>core,reading:()=>recentLiveReading(root),secrets:getSecrets,onVideoChange:video=>videoRequests?.changed(video),autoFollowBlocked:()=>videoRequests?.busy||false,...(dependencies.studio||{})});
  const videoReader=createLiveVideoReader({root,reading:()=>recentLiveReading(root),secrets:getSecrets});
  videoRequests=createLiveVideoRequests({getCore:()=>core,studio,readVideo:videoReader.read,saveReading:videoReader.save,openTelevision:async()=>{if(desktopTelevision.state().available&&localPort)await desktopTelevision.open('http://127.0.0.1:'+localPort+'/bili-live-view/television?view='+viewToken);},...(dependencies.videoRequests||{})});
  core=createLiveController({home,model,tts,sendDanmaku:(...args)=>api.send(...args),inspectRoom,connect:options=>(dependencies.connect||connectLiveRoom)({root,...options}),reading:async()=>recentLiveReading(root),images:studio.images,videoCurrent:studio.current,onVideoRequest:event=>videoRequests.ingest(event),onPause:()=>videoRequests.cancel('互动已暂停'),onStop:()=>{videoRequests.cancel('互动已停止');studio.stopVideo();},mirror,secrets:getSecrets,...(dependencies.core||{})});
  function viewerAuthorized(req,url){
    const v=Buffer.from(String(url.searchParams.get('view')||'')),expected=Buffer.from(viewToken);
    return req.headers['x-agent-call']===undefined&&req.headers['x-agent-token']===undefined&&v.length===expected.length&&timingSafeEqual(v,expected);
  }
  const json=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
  const html=(res,file)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; img-src 'self' data: blob: https://*.hdslb.com; frame-src 'self' https://player.bilibili.com; frame-ancestors 'self'; connect-src 'self'"});res.end(fs.readFileSync(path.join(root,'public',file),'utf8'));};
  function controlToken(){for(const [key,row]of controls)if(row.until<controlNow())controls.delete(key);while(controls.size>=12)controls.delete(controls.keys().next().value);const value=randomBytes(24).toString('hex');controls.set(createHash('sha256').update(value).digest('hex'),{value,until:controlNow()+4*3600000,lastAt:0});return value;}
  function viewBody(req){return new Promise((resolve,reject)=>{let bytes=0,done=false;const chunks=[],finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);},timer=setTimeout(()=>finish(Error('请求超时，请重试')),10000);req.on('data',b=>{if(done)return;bytes+=b.length;if(bytes>800000){finish(Error('图片或消息过大'));req.resume();return;}chunks.push(b);});req.on('aborted',()=>finish(Error('请求已取消')));req.on('error',()=>finish(Error('请求已中断')));req.on('end',()=>{if(done)return;try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();finish(null,value);}catch{finish(Error('请求内容需要JSON对象'));}});});}
  async function interactive(req,res){
    const expected='http://'+String(req.headers.host||'').toLowerCase(),origin=String(req.headers.origin||'').toLowerCase(),value=String(req.headers['x-studio-control']||''),grant=/^[a-f0-9]{48}$/.test(value)?controls.get(createHash('sha256').update(value).digest('hex')):null;
    if(origin!==expected||!grant||grant.until<controlNow()||req.headers['sec-fetch-site']==='cross-site'){json(res,403,{ok:false,error:'浮窗操作权限无效，请从后台重新打开独立浮窗'});return;}
    if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||''))){json(res,415,{ok:false,error:'只接受JSON消息'});return;}
    try{
      const body=await viewBody(req);if(body.action==='hello'){json(res,200,{ok:true,interactive:true});return;}
      const feed=core.publicFeed();if(!feed.live||feed.paused||body.sessionId!==feed.sessionId)throw Error('请先开始或恢复当前直播互动，再发送消息');
      if(controlNow()-grant.lastAt<1500){json(res,429,{ok:false,error:'发送太快了，请稍候再试'});return;}grant.lastAt=controlNow();
      let result;const hostName=studio.publicState().hostName;
      if(body.action==='ask')result=core.askStudio(String(body.text||''),hostName);
      else if(body.action==='danmaku')result=await core.hostDanmaku(String(body.text||''),hostName);
      else if(body.action==='picture'){const state=core.status();if(state.queue.length>=state.config.maxQueue)throw Error('回复队列已满，请稍后再发送图片');const text=body.text?safeLiveText(String(body.text),getSecrets(),state.config.maxReplyChars):'';const picture=studio.upload(body);core.enqueueStudio({imageId:picture.id,text});result={ok:true,queued:true};}
      else throw Error('这个操作不在浮窗权限范围内');
      json(res,200,result);
    }catch(error){let message='发送未完成，请检查当前直播或模型状态';try{message=safeLiveText(error.message,getSecrets(),180);}catch{}json(res,400,{ok:false,error:message});}
  }
  const image=(res,id)=>{const row=studio.imageFile(id);if(!row||!fs.existsSync(row.file)){json(res,404,{ok:false,error:'图片不存在'});return;}res.writeHead(200,{'content-type':row.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'"});fs.createReadStream(row.file).pipe(res);};
  async function handleView(req,res,url){
    if(!url.pathname.startsWith('/bili-live-view/'))return false;
    const staticFiles={'/bili-live-view/studio.css':['bilibili-live-studio.css','text/css; charset=utf-8'],'/bili-live-view/studio-ui.js':['bilibili-live-studio-ui.js','text/javascript; charset=utf-8'],'/bili-live-view/television.css':['bilibili-live-television.css','text/css; charset=utf-8'],'/bili-live-view/television-ui.js':['bilibili-live-television-ui.js','text/javascript; charset=utf-8'],'/bili-live-view/television-poster.png':['bilibili-live-television-poster.png','image/png']};
    if(req.method==='GET'&&staticFiles[url.pathname]){const [name,type]=staticFiles[url.pathname];res.writeHead(200,{'content-type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(fs.readFileSync(path.join(root,'public',name)));return true;}
    if(!viewerAuthorized(req,url)){json(res,403,{ok:false,error:'直播展示地址无效或已更新，请从后台重新复制'});return true;}
    if(req.method==='POST'&&url.pathname==='/bili-live-view/action'){await interactive(req,res);return true;}
    if(req.method!=='GET'){json(res,405,{ok:false,error:'展示地址仅接受读取'});return true;}
    if(url.pathname==='/bili-live-view/'){html(res,'bilibili-live-overlay.html');return true;}
    if(url.pathname==='/bili-live-view/studio'){html(res,'bilibili-live-studio.html');return true;}
    if(url.pathname==='/bili-live-view/television'){html(res,'bilibili-live-television.html');return true;}
    if(url.pathname==='/bili-live-view/state'){
      const client=String(url.searchParams.get('client')||'');const monitor=url.searchParams.get('monitor')==='1';
      if(!monitor&&/^[a-f0-9-]{36}$/.test(client)&&(!player||player.until<Date.now()||player.id===client))player={id:client,until:Date.now()+8000};
      const value=core.observer();json(res,200,{...value,chat:core.publicFeed(),studio:studio.publicState(),playAudio:!monitor&&player?.id===client});return true;
    }
    const picture=/^\/bili-live-view\/images\/([a-f0-9-]{36})$/.exec(url.pathname);
    if(picture){if(!studio.publicImage(picture[1]))json(res,404,{ok:false});else image(res,picture[1]);return true;}
    const match=/^\/bili-live-view\/audio\/([a-f0-9-]{36})\.wav$/.exec(url.pathname);
    if(match){const current=core.observer();if(!current.active||current.output.audioId!==match[1]){json(res,404,{ok:false,error:'音频已过期'});return true;}const file=path.join(audioHome,match[1]+'.wav');if(!fs.existsSync(file)){json(res,404,{ok:false});return true;}res.writeHead(200,{'content-type':'audio/wav','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);return true;}
    json(res,404,{ok:false});return true;
  }
  async function handle(req,res,url,readBody){
    localPort=req.socket.localPort;
    if(url.pathname==='/bilibili-live/'&&req.method==='GET'){html(res,'bilibili-live.html');return true;}
    if(!url.pathname.startsWith('/api/bili-live/'))return false;
    if(req.headers['x-agent-token']!==undefined||req.headers['x-agent-call']!==undefined){json(res,403,{ok:false,error:'直播管理仅控制台可用'});return true;}
    try{
      const action=url.pathname.slice('/api/bili-live/'.length);
      if(req.method==='GET'){
        if(action==='status'){const value=core.status();let loggedIn=false;try{api.login();loggedIn=true;}catch{}json(res,200,{...value,studio:studio.status(),videoRequests:videoRequests.status(),loggedIn,desktopTelevision:desktopTelevision.state()});return true;}
        if(action==='reading'){json(res,200,{ok:true,notes:recentLiveReading(root)});return true;}
        if(action==='studio'){json(res,200,studio.status());return true;}
        const picture=/^images\/([a-f0-9-]{36})$/.exec(action);if(picture){image(res,picture[1]);return true;}
        if(action==='reports'){json(res,200,{ok:true,reports:core.histories().filter(s=>s.summaryShared&&s.summary)});return true;}
      }
      if(req.method==='POST'){
        const body=await readBody();let result;
        if(action==='config')result=core.configure(body);
        else if(action==='persona/preview'){
          if(previewController)throw Error('直播人格试聊正在进行，请稍后重试');
          if(Object.keys(body).some(k=>!['persona','message'].includes(k)))throw Error('直播人格试聊只接受人格描述和测试弹幕');
          const config=liveSettings({persona:body.persona},core.status().config),message=typeof body.message==='string'?body.message.trim():'';
          if(!message||message.length>500)throw Error('直播测试弹幕需要1～500字');
          const controller=previewController=new AbortController(),cancel=()=>controller.abort(Error('直播人格试聊已取消'));req.once('aborted',cancel);res.once('close',cancel);
          try{const prompt=liveReplyPrompt(config,{kind:'question',user:'试聊观众',text:safeLiveText(message,getSecrets(),500)});const text=await model(prompt,{signal:controller.signal,demo:false});controller.signal.throwIfAborted();result={ok:true,text:safeLiveText(text,getSecrets(),config.maxReplyChars,true),preview:true};}
          finally{if(previewController===controller)previewController=null;req.removeListener('aborted',cancel);res.removeListener('close',cancel);}
        }
        else if(action==='start')result=await core.start(body);
        else if(action==='pause')result=core.pause(body.paused!==false);
        else if(action==='stop')result=await core.stop({summarize:body.summarize===true});
        else if(action==='summary'){await core.summarizeSession(String(body.id||''));result=core.status();}
        else if(action==='simulate'){core.demoEvent(body.kind,body.text);result=core.status();}
        else if(action==='overlay'){if(body.mode!=='television')player=null;const page={studio:'studio',television:'television'}[body.mode]||'';result={ok:true,url:'/bili-live-view/'+page+'?view='+viewToken+(body.mode==='studio'&&body.interactive===true?'#control='+controlToken():'')};}
        else if(action==='native-tv'){
          if(body.action==='open'){const address=new URL('/bili-live-view/television?view='+viewToken,'http://127.0.0.1:'+req.socket.localPort);result={ok:true,...await desktopTelevision.open(address.href)};}
          else if(body.action==='close')result={ok:true,...desktopTelevision.close()};
          else if(body.action==='pin')result={ok:true,...desktopTelevision.pin()};
          else throw Error('小电视窗口操作无效');
        }
        else if(action==='studio'){result=studio.configure(body);if(!result.settings.allowVideoRequests)videoRequests.cancel('已关闭弹幕点播');}
        else if(action==='video-requests/cancel'){videoRequests.cancel('主播取消点播');result={ok:true};}
        else if(action==='images/upload'){studio.upload(body);result=studio.status();}
        else if(action==='images/delete'){studio.remove(String(body.id||''));result=studio.status();}
        else if(action==='publish'){core.enqueueStudio({text:body.text?String(body.text):'',imageId:body.imageId?String(body.imageId):null});result={ok:true};}
        else if(action==='video')result=studio.setVideo(body);
        else if(action==='video/comment')result=studio.comment();
        else{json(res,404,{ok:false,error:'未知直播操作'});return true;}
        json(res,200,result);return true;
      }
      json(res,405,{ok:false,error:'不支持的直播请求'});
    }catch(error){let safe='直播操作未完成，请检查本机模型、B站登录和语音服务';if(/^(请|已有|该直播|直播|没有|B站|本场|本版本|主播|停止|自动|同一|图片|视频|小电视|图库|min|max|user|welcome|gift|room)/.test(error.message))try{safe=safeLiveText(error.message,getSecrets(),240);}catch{}json(res,400,{ok:false,error:safe});}
    return true;
  }
  return {handle,handleView,core,studio,videoRequests,close:()=>{previewController?.abort(Error('直播服务正在关闭'));videoRequests.close();desktopTelevision.dispose();controls.clear();studio.close();core.close();}};
}
