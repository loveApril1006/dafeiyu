// Bilibili live uses the operator's existing local Bilibili login. Never return credentials to a model or browser.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {EventEmitter} from 'node:events';
const MIX=[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
export function signLiveQuery(params,img,sub,now=Date.now()){
  const key=MIX.map(i=>(img+sub)[i]||'').join('').slice(0,32);
  const values={...params,wts:Math.floor(now/1000)};
  const q=Object.keys(values).sort().map(k=>encodeURIComponent(k)+'='+encodeURIComponent(String(values[k]).replace(/[!'()*]/g,''))).join('&');
  return q+'&w_rid='+crypto.createHash('md5').update(q+key).digest('hex');
}
export function liveRoomId(value){
  const input=String(value??'').trim();const id=/^https:\/\/live\.bilibili\.com\/(\d+)(?:[/?#].*)?$/.exec(input)?.[1]||input;
  if(!/^[1-9]\d{0,13}$/.test(id)||!Number.isSafeInteger(Number(id)))throw Error('请填写B站直播间号或 live.bilibili.com/房间号 链接');
  return Number(id);
}
export function readLiveCredential(root){
  for(const relative of ['companion/bili-native-data/bili_credential.json','companion/bilibili-data/bili_credential.json']){
    try{const c=JSON.parse(fs.readFileSync(path.join(root,relative),'utf8').replace(/^\uFEFF/,''));
      const pairs={SESSDATA:c.sessdata||c.SESSDATA,bili_jct:c.bili_jct,DedeUserID:c.dedeuserid||c.DedeUserID,buvid3:c.buvid3,buvid4:c.buvid4};
      if(!pairs.SESSDATA||!pairs.bili_jct)continue;
      for(const v of Object.values(pairs))if(v&&/[\r\n;]/.test(String(v)))throw Error('invalid cookie');
      return {csrf:String(pairs.bili_jct),cookie:Object.entries(pairs).filter(([,v])=>v).map(([k,v])=>k+'='+v).join('; '),secrets:Object.values(pairs).filter(Boolean).map(String)};
    }catch{}
  }
  throw Error('请先在「B站鱼塘」扫码登录，再开启直播互动');
}
export function createLiveApi({root,fetchImpl=fetch}={}){
  const login=()=>readLiveCredential(root);
  async function request(url,{signal,form}={}){
    const u=new URL(url);if(!['api.bilibili.com','api.live.bilibili.com'].includes(u.hostname)||u.protocol!=='https:')throw Error('不允许的B站接口');
    const auth=login();const response=await fetchImpl(u,{method:form?'POST':'GET',redirect:'error',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',Referer:'https://live.bilibili.com/',Cookie:auth.cookie,...(form?{'content-type':'application/x-www-form-urlencoded'}:{})},...(form?{body:new URLSearchParams(form).toString()}:{}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('B站接口不可用（HTTP '+response.status+'），请稍后重试');
    const raw=await response.text();if(raw.length>1_000_000)throw Error('B站返回内容过大');let data;try{data=JSON.parse(raw);}catch{throw Error('B站返回了无效数据');}
    if(Number(data.code)!==0){const e=Error([ -101,-111].includes(Number(data.code))?'B站登录已失效，请重新扫码':'B站未确认请求成功（代码 '+Number(data.code)+'），请检查登录、房间权限或平台限制');e.uncertain=!!form;throw e;}
    return data.data||{};
  }
  return {login,async room(id,signal){
    id=liveRoomId(id);const info=await request('https://api.live.bilibili.com/room/v1/Room/room_init?id='+id,{signal});
    const nav=await request('https://api.bilibili.com/x/web-interface/nav',{signal});if(!nav.isLogin)throw Error('B站登录已失效，请重新扫码');
    const key=url=>path.posix.basename(new URL(url).pathname).split('.')[0];
    const query=signLiveQuery({id:info.room_id,type:0},key(nav.wbi_img.img_url),key(nav.wbi_img.sub_url));
    const dm=await request('https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?'+query,{signal});
    const host=dm.host_list?.find(h=>typeof h.host==='string'&&/^[a-z0-9.-]+\.chat\.bilibili\.com$/i.test(h.host));
    if(!host||!dm.token)throw Error('没有取得有效的直播弹幕连接信息');
    let buvid='';try{buvid=(await request('https://api.bilibili.com/x/frontend/finger/spi',{signal})).b_3||'';}catch{}
    return {roomId:Number(info.room_id),ownerUid:String(info.uid),selfUid:String(nav.mid),selfAvatar:String(nav.face||''),live:Number(info.live_status)===1,url:'wss://'+host.host+':'+(Number(host.wss_port)||443)+'/sub',auth:{uid:Number(nav.mid),roomid:Number(info.room_id),protover:3,platform:'web',type:2,key:dm.token,buvid}};
  },async send(roomId,text,signal){
    const auth=login();await request('https://api.live.bilibili.com/msg/send',{signal,form:{roomid:String(liveRoomId(roomId)),msg:Array.from(text).slice(0,20).join(''),rnd:String(Math.floor(Date.now()/1000)),fontsize:'25',color:'16777215',mode:'1',bubble:'0',csrf:auth.csrf,csrf_token:auth.csrf}});
    return {confirmed:true};
  }};
}
let runtime;
export async function liveRuntime(root){
  if(runtime)return runtime;
  const require=createRequire(path.join(root,'integrations/bilibili-live-runtime/package.json'));
  const {WebSocket}=createRequire(require.resolve('tiny-bilibili-ws'))('ws');
  const wire=require('tiny-bilibili-ws');
  const entry=require.resolve('blive-message-listener');
  const chunk=fs.readdirSync(path.dirname(entry)).find(n=>/^chunk-.*\.js$/.test(n));
  if(!chunk)throw Error('直播依赖不完整，请重新安装直播更新包');
  const {listenAll}=await import(pathToFileURL(path.join(path.dirname(entry),chunk)).href);
  runtime={WebSocket,listenAll,...wire};return runtime;
}
export async function connectLiveRoom({root,info,onEvent,onState,signal,loadRuntime=liveRuntime}){
  const {WebSocket,serialize,deserialize,listenAll}=await loadRuntime(root);signal?.throwIfAborted();
  const events=new EventEmitter();events.roomId=info.roomId;
  const socket=new WebSocket(info.url,{handshakeTimeout:12000,maxPayload:2*1024*1024});
  let ready=false,closed=false,heartbeat,authTimer;const close=()=>{if(closed)return;closed=true;clearInterval(heartbeat);clearTimeout(authTimer);signal?.removeEventListener('abort',close);socket.close();if(socket.readyState===0)socket.terminate();};
  const emit=(kind,msg)=>{const source=msg.raw||{},d=source.data||{};let stamp=Number(d.timestamp||source.info?.[0]?.[4]||msg.timestamp);if(stamp<1e12)stamp*=1000;
    onEvent({kind,...msg.body,id:createStableEventId(kind,source),timestamp:stamp});};
  listenAll(events,info.roomId,{onIncomeDanmu:m=>emit('question',m),onIncomeSuperChat:m=>emit('superchat',m),onGift:m=>emit('gift',m),onGuardBuy:m=>emit('guard',m),onUserAction:m=>{if(m.body.action==='enter')emit('welcome',m);},onLiveEnd:()=>onState('ended'),onLiveStart:()=>onState('live'),onRoomWarn:m=>onState(m.body.type==='cut'?'ended':'platform-warning')});
  const fail=()=>{if(!closed)onState('disconnected');close();};
  socket.on('open',()=>{if(closed)return;socket.send(serialize(7,info.auth));authTimer=setTimeout(fail,15000);authTimer.unref?.();});
  let chain=Promise.resolve();socket.on('message',data=>{chain=chain.then(async()=>{
    if(closed||signal?.aborted)return;const packets=await deserialize(new Uint8Array(data));
    if(packets.length>300)throw Error('Too many packets');
    for(const packet of packets){if(closed)break;
      if(packet.meta.op===8){if(Number(packet.data?.code)!==0){onState('auth-error');close();break;}ready=true;clearTimeout(authTimer);onState('connected');socket.send(serialize(2));heartbeat=setInterval(()=>{if(!closed&&socket.readyState===1)socket.send(serialize(2));},25000);heartbeat.unref?.();}
      else if(packet.meta.op===5&&ready){let cmd=String(packet.data?.cmd||'').split(':')[0];if(cmd==='SEND_GIFT_V2'){
        const {parseSendGiftV2}=await loadRuntime(root);for(const gift of parseSendGiftV2(packet.data.data.pb))events.emit('SEND_GIFT',{...packet,data:{cmd:'SEND_GIFT',data:{...gift,giftId:gift.gift_id,giftName:gift.gift_name}}});
      }else events.emit(cmd==='DANMU_MSG'?'DANMU_MSG':cmd,packet);}
    }
  }).catch(fail);});
  socket.on('error',fail);socket.on('close',()=>{if(!closed)onState('disconnected');close();});
  signal?.addEventListener('abort',close,{once:true});if(signal?.aborted)close();
  return {close};
}
function createStableEventId(kind,raw){return crypto.createHash('sha256').update(kind+'\n'+JSON.stringify(raw)).digest('hex');}
