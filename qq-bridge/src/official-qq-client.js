// Independent implementation of Tencent's public QQ Bot API (2026 protocol).
// No personal-QQ framework, native injection or automatic replay of send requests.
import {EventEmitter} from 'node:events';
import {createHash,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';
import {OFFICIAL_API,atomicOfficialJson} from './official-qq-settings.js';
import {safeFetchBuffer,looksLikeImageBuffer} from './safe-fetch.js';

const MAX_MEDIA=5*1024*1024;
const terminalCodes=new Set([4013,4014,4914,4915]);
const unescapeText=s=>String(s).replace(/&#91;/g,'[').replace(/&#93;/g,']').replace(/&#44;/g,',').replace(/&amp;/g,'&');
const equal=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);};
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!/[\x00-\x1f]/.test(value);
export function validateOfficialGateway(value){
  const url=new URL(value);
  // The current REST API can still return the legacy Tencent gateway hostname.
  if(url.protocol!=='wss:'||!['api.bot.qq.com','api.sgroup.qq.com'].includes(url.hostname)||url.username||url.password||url.port&&url.port!=='443'||!/^\/websocket\/?$/.test(url.pathname))throw Error('官方QQ返回了未认可的网关地址');
  return url;
}

export class OfficialQQClient extends EventEmitter {
  constructor({root,settings,fetchImpl=fetch,Socket=WebSocket,now=Date.now,approvedFiles=new Set(),reconnect=true,retryBaseMs=1500}={}){
    super();this.root=root;this.settings={...settings};this.fetch=fetchImpl;this.Socket=Socket;this.now=now;this.reconnect=reconnect;this.retryBaseMs=retryBaseMs;this.approvedFiles=approvedFiles;
    this.url='腾讯官方QQ WebSocket';this.ready=false;this.closed=false;this.failures=0;this.lastEventAt=0;this.lastAckAt=0;this.lastError='';this.chains=new Map();
    const scope=createHash('sha256').update(String(settings.appId)).digest('hex').slice(0,24);
    this.stateFile=path.join(root,'state/qq-official',scope+'.json');
    try{this.state=JSON.parse(fs.readFileSync(this.stateFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('官方QQ身份映射损坏，已停止以避免发错会话');this.state={contacts:{},messages:{},seen:[]};}
    if(!this.state.contacts||!this.state.messages||!Array.isArray(this.state.seen))throw Error('官方QQ身份映射格式无效');
    this.seen=new Set(this.state.seen);this.abort=new AbortController();
  }
  onEvent(handler){this.on('event',handler);return this;}
  onPrivateMessage(handler){this.on('private-message',handler);return this;}
  onGroupMessage(handler){this.on('group-message',handler);return this;}
  onNotice(type,handler){this.on('notice:'+type,handler);return this;}
  onBotStatus(handler){return this.onNotice('bot_status',handler);}
  flush(){this.state.seen=[...this.seen].slice(-3000);const rows=Object.entries(this.state.messages);if(rows.length>2000)for(const [id] of rows.slice(0,rows.length-2000))delete this.state.messages[id];atomicOfficialJson(this.stateFile,this.state);}
  numericId(scope,native){
    if(!identifier(native))throw Error('官方QQ返回的OpenID无效');
    let salt=0,id;
    do{id=String(8e12+parseInt(createHash('sha256').update(this.settings.appId+'\0'+scope+'\0'+native+'\0'+salt++).digest('hex').slice(0,12),16));}while(this.state.contacts[id]&&(this.state.contacts[id].native!==native||this.state.contacts[id].scope!==scope));
    this.state.contacts[id]??={scope,native,label:scope==='private'?'官方私聊':scope==='group'?'官方群聊':'官方身份',lastAt:0};
    return Number(id);
  }
  messageId(native,scene){return Number(8e12+parseInt(createHash('sha256').update(this.settings.appId+'\0msg\0'+scene+'\0'+native).digest('hex').slice(0,12),16));}
  contacts(){return Object.entries(this.state.contacts).filter(([,v])=>['private','group'].includes(v.scope)&&v.lastAt).sort((a,b)=>b[1].lastAt-a[1].lastAt).map(([id,v])=>({id,key:v.scope+':'+id,kind:v.scope,label:v.label,lastAt:v.lastAt,lastMessagePreview:String(this.state.messages[v.lastMessage]?.event?.raw_message||'').slice(0,100)}));}
  health(){const age=this.lastAckAt?this.now()-this.lastAckAt:null;return {transport:'official',connected:this.ready,accountOnline:this.ready,good:this.ready&&age!==null&&age<120000,goodSource:'官方网关心跳确认',lastPacketAgoMs:this.lastEventAt?this.now()-this.lastEventAt:null,lastPacketKind:'官方消息事件',degraded:false,silent:false,hint:this.lastError||null,startup:{state:'official',message:this.lastError||'请在“官方QQ机器人”页面填写接入凭据并重启QQ桥接。'},nickname:this.me?.nickname||this.me?.username||'',allowProactive:this.settings.allowProactive===true};}
  report(error){this.lastError=String(error.message||error).slice(0,400);if(this.listenerCount('error'))this.emit('error',Error(this.lastError));}
  retry(){if(this.closed||!this.reconnect||this.retryTimer)return;this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.connect().catch(()=>{});},Math.min(60000,this.retryBaseMs*2**Math.min(this.failures++,6)));this.retryTimer.unref?.();}
  async responseJson(response,label){
    const chunks=[];let size=0;
    for await(const chunk of response.body||[]){size+=chunk.length;if(size>1024*1024)throw Error(label+'响应过大');chunks.push(Buffer.from(chunk));}
    let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error(label+'返回非JSON；发送请求不会自动重试，请核对实际结果');}
    const code=data.err_code??data.code??0;
    if(!response.ok||Number(code)!==0){if(response.status===401)this.token=null;const trace=String(data.trace_id||response.headers?.get('x-tps-trace-id')||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);
      const hints={40034005:'被动回复已过期，请用户重新发送消息',11253:'平台未授予对应权限',850019:'平台不支持该媒体格式，请检查语音编码',850026:'平台下载媒体失败',850031:'媒体超过平台大小限制',304023:'平台正在审核，尚未确认发送',304024:'平台正在审核，尚未确认发送'};
      throw Error(label+'失败（HTTP '+response.status+'，code='+String(code).replace(/[^\w-]/g,'').slice(0,32)+'）'+(hints[code]||'请检查官方平台权限、额度或服务状态')+(trace?'；trace='+trace:''));}
    if(response.status===201||response.status===202)throw Error(label+'已提交审核，尚未确认发送；请勿立即重发');
    return data;
  }
  async accessToken(){
    if(this.token&&this.token.until>this.now()+60000)return this.token.value;
    if(this.tokenFlight)return this.tokenFlight;
    this.tokenFlight=(async()=>{
      if(!this.settings.appId||!this.settings.appSecret)throw Error('请先填写官方机器人AppID和AppSecret');
      const response=await this.fetch(OFFICIAL_API+'/app/getAppAccessToken',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({appId:this.settings.appId,clientSecret:this.settings.appSecret}),redirect:'error',signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(15000)])});
      const data=await this.responseJson(response,'官方QQ凭据校验');
      if(!identifier(data.access_token)||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=0)throw Error('官方QQ未返回有效访问凭证');
      this.token={value:data.access_token,until:this.now()+Number(data.expires_in)*1000};return this.token.value;
    })();try{return await this.tokenFlight;}finally{this.tokenFlight=null;}
  }
  async api(route,body){
    const token=await this.accessToken();
    try{const response=await this.fetch(OFFICIAL_API+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'QQBot '+token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(25000)])});return await this.responseJson(response,'官方QQ接口');}
    catch(error){if(error.message?.startsWith('官方QQ'))throw error;throw Error('官方QQ网络请求失败；发送结果可能未确认，未自动重试，请核对QQ聊天');}
  }
  async checkCredentials(){const me=await this.api('/users/@me');if(!identifier(me.id))throw Error('平台未返回机器人身份');return {ok:true,nickname:me.username||me.nickname||'',message:'凭据校验成功。收消息、沙箱范围和发送权限仍以官方平台设置为准。'};}
  async connect(){
    if(this.ready)return;if(this.connecting)return this.connecting;
    this.closed=false;clearTimeout(this.retryTimer);this.retryTimer=null;
    this.connecting=(async()=>{
      await this.startFacade();const token=await this.accessToken(),gateway=await this.api('/gateway');
      const url=validateOfficialGateway(gateway.url);
      await new Promise((resolve,reject)=>{
        const socket=new this.Socket(url.href,{handshakeTimeout:15000,maxPayload:10*1024*1024});this.socket=socket;let settled=false;
        const settle=error=>{if(settled)return;settled=true;clearTimeout(loginTimer);error?reject(error):resolve();};
        const loginTimer=setTimeout(()=>{settle(Error('官方QQ网关登录超时'));socket.terminate();},25000);
        const write=value=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(value));};
        socket.on('message',raw=>{if(this.socket!==socket)return;
          try{const packet=JSON.parse(raw.toString());if(Number.isInteger(packet.s))this.seq=packet.s;
            if(packet.op===10){
              const interval=Number(packet.d?.heartbeat_interval);if(!Number.isFinite(interval)||interval<1000||interval>120000)throw Error('官方QQ心跳间隔无效');
              clearInterval(this.heartbeat);this.awaitingAck=false;
              this.heartbeat=setInterval(()=>{if(this.awaitingAck){socket.terminate();return;}this.awaitingAck=true;write({op:1,d:this.seq??null});},interval);this.heartbeat.unref?.();
              write(this.sessionId?{op:6,d:{token:'QQBot '+token,session_id:this.sessionId,seq:this.seq??null}}:{op:2,d:{token:'QQBot '+token,intents:1<<25,shard:[0,1]}});
            }else if(packet.op===11){this.awaitingAck=false;this.lastAckAt=this.now();this.emit('event',{post_type:'meta_event',meta_event_type:'heartbeat',status:{online:this.ready,good:this.ready}});
            }else if(packet.op===1){write({op:1,d:this.seq??null});
            }else if(packet.op===7){socket.close(1000,'reconnect');
            }else if(packet.op===9){this.sessionId=null;this.seq=null;socket.close(1000,'invalid-session');
            }else if(packet.op===0){
              if(packet.t==='READY'||packet.t==='RESUMED'){
                if(packet.t==='READY'){if(!identifier(packet.d?.session_id)||!identifier(packet.d?.user?.id))throw Error('官方QQ READY缺少身份');this.sessionId=packet.d.session_id;this.me=packet.d.user;this.selfId=this.numericId('bot',this.me.id);}
                this.ready=true;this.failures=0;this.lastError='';this.lastAckAt=this.now();settle();this.emit('open');
              }else if(this.ready)this.receive(packet);
            }
          }catch(error){this.report(error);settle(error);socket.terminate();}
        });
        socket.on('error',()=>{const error=Error('官方QQ网关网络连接失败');this.report(error);settle(error);});
        socket.on('close',code=>{if(this.socket!==socket)return;clearInterval(this.heartbeat);this.socket=null;this.ready=false;
          settle(Error('官方QQ网关在就绪前断开（'+code+'）'));if([4006,4007,4009].includes(code)){this.sessionId=null;this.seq=null;}if(code===4004)this.token=null;
          if(terminalCodes.has(code)){this.lastError='官方QQ拒绝连接（'+code+'）：请检查事件权限、机器人发布/沙箱范围或封禁状态';this.closed=true;this.report(Error(this.lastError));}
          this.emit('close',{code,reason:this.lastError});this.retry();
        });
      });
    })();
    try{return await this.connecting;}catch(error){this.report(error);this.retry();throw error;}finally{this.connecting=null;}
  }
  receive(packet){
    const group=['GROUP_AT_MESSAGE_CREATE','GROUP_MESSAGE_CREATE'].includes(packet.t);if(!group&&packet.t!=='C2C_MESSAGE_CREATE')return;
    const d=packet.d||{},author=d.author||{},kind=group?'group':'private',native=group?d.group_openid:(author.user_openid||author.id),person=group?(author.member_openid||author.id):native;
    if(author.bot||person===this.me?.id||!identifier(d.id)||!identifier(native)||!identifier(person))return;
    const keyNative=kind+':'+native,seenKey=keyNative+':'+d.id;if(this.seen.has(seenKey))return;
    const target=this.numericId(kind,native),user=group?this.numericId('member:'+native,person):target,key=kind+':'+target,contact=this.state.contacts[target];
    const eventTime=Date.parse(d.timestamp),at=Number.isFinite(eventTime)?Math.min(this.now(),eventTime):this.now();
    contact.label=String(group?'官方群聊':author.username||'官方私聊').slice(0,100);contact.lastAt=this.now();
    const content=String(d.content||'').slice(0,12000).replace(/^\s*<@!?([^>]+)>\s*/,(match,id)=>[String(this.me?.id),String(this.settings.appId)].includes(id)?'':match);
    const segments=[];if(group&&packet.t==='GROUP_AT_MESSAGE_CREATE')segments.push({type:'at',data:{qq:String(this.selfId)}});if(content)segments.push({type:'text',data:{text:content}});
    for(const attachment of (Array.isArray(d.attachments)?d.attachments:[]).slice(0,10)){
      const mime=String(attachment.content_type||'');let url=String((/voice|audio/i.test(mime)?attachment.voice_wav_url:'')||attachment.url||'');if(url.startsWith('//'))url='https:'+url;if(url.length>8000||!/^https:\/\//i.test(url))continue;
      if(mime.startsWith('image/'))segments.push({type:'image',data:{file:url,url}});
      else if(/voice|audio/i.test(mime)){segments.push({type:'record',data:{file:url,url}});if(attachment.asr_refer_text)segments.push({type:'text',data:{text:'[语音转写] '+String(attachment.asr_refer_text).slice(0,4000)}});}
      else segments.push({type:'text',data:{text:'[官方QQ附件：'+String(attachment.filename||mime||'文件').slice(0,120)+']'}});
    }
    const mid=this.messageId(d.id,key);if(this.state.messages[mid]&&(this.state.messages[mid].native!==d.id||this.state.messages[mid].key!==key))throw Error('官方QQ消息编号冲突，未处理该事件');
    const event={post_type:'message',message_type:kind,sub_type:group?'normal':'friend',self_id:this.selfId,user_id:user,...(group?{group_id:target}:{}),message_id:mid,time:Math.floor(at/1000),raw_message:content,message:segments,sender:{user_id:user,nickname:String(author.username||'QQ用户').slice(0,100)},official:true};
    this.state.messages[mid]={native:d.id,key,at,seq:0,event};contact.lastMessage=mid;this.lastEventAt=this.now();this.seen.add(seenKey);if(this.seen.size>3000)this.seen.delete(this.seen.values().next().value);this.flush();
    this.emit('event',event);this.emit(group?'group-message':'private-message',event);
  }
  async media(segment){
    const file=String(segment.data?.file||segment.data?.url||'');let buffer,name='';
    if(file.startsWith('base64://')){const raw=file.slice(9);if(raw.length>Math.ceil(MAX_MEDIA/3)*4||!/^[a-zA-Z0-9+/]*={0,2}$/.test(raw))throw Error('官方QQ媒体编码或大小无效');buffer=Buffer.from(raw,'base64');}
    else if(/^https:\/\//i.test(file)){if(segment.type!=='image')throw Error('官方QQ远程语音请先下载到已校验的本地语音库');buffer=(await safeFetchBuffer(file,MAX_MEDIA)).buffer;}
    else{let local=file;if(local.startsWith('file:'))throw Error('官方QQ本地媒体请使用已检查的文件路径');local=path.resolve(local);
      const real=fs.realpathSync(local);if(!this.approvedFiles.has(real))throw Error('官方QQ拒绝读取未经桥接检查的本地媒体');
      const stat=fs.statSync(real);if(!stat.isFile()||stat.size>MAX_MEDIA)throw Error('官方QQ单个媒体直传限制为5MiB，请先缩小文件');buffer=fs.readFileSync(real);name=path.basename(real);
    }
    if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_MEDIA)throw Error('官方QQ媒体为空或超过5MiB直传限制');
    if(segment.type==='image'){if(!looksLikeImageBuffer(buffer))throw Error('待发送文件不是受支持的图片');name='image.'+(buffer.subarray(0,4).toString()==='GIF8'?'gif':buffer[0]===0x89?'png':buffer[0]===0xff?'jpg':'webp');}
    else{const header=buffer.subarray(0,16).toString('latin1'),wav=header.startsWith('RIFF')&&header.slice(8,12)==='WAVE';if(!wav&&!/^(?:OggS|ID3|\x02?#!SILK_V3)/.test(header)&&buffer[0]!==0xff)throw Error('待发送文件不是受支持的语音');name=wav?'voice.wav':header.startsWith('OggS')?'voice.ogg':/ID3/.test(header)||buffer[0]===0xff?'voice.mp3':'voice.silk';}
    return {file_type:segment.type==='image'?1:3,file_data:buffer.toString('base64'),file_name:name,srv_send_msg:false};
  }
  async send(kind,id,message){
    const key=kind+':'+id,previous=this.chains.get(key)||Promise.resolve();
    const task=previous.catch(()=>{}).then(()=>this.sendNow(kind,String(id),message));this.chains.set(key,task);
    try{return await task;}finally{if(this.chains.get(key)===task)this.chains.delete(key);}
  }
  async sendNow(kind,id,value){
    if(!this.ready)throw Error('官方QQ机器人尚未连接');const contact=this.state.contacts[id];if(!contact||contact.scope!==kind||!contact.lastAt)throw Error('只能向本机器人收到过消息的对应OpenID会话发送，不能填写个人QQ号');
    const key=kind+':'+id,parts=typeof value==='string'?[{type:'text',data:{text:value}}]:Array.isArray(value)?value:[value];if(parts.length>24)throw Error('单次发送段数过多');
    const media=[],texts=[];for(const segment of parts){if(segment?.type==='text')texts.push(unescapeText(segment.data?.text||''));else if(['image','record'].includes(segment?.type))media.push(segment);else if(segment?.type==='reply'){const quoted=this.state.messages[String(segment.data?.id)];if(!quoted||quoted.key!==key)throw Error('引用消息不属于当前官方会话');/* Official reference uses separate REFIDX; omit quote, preserve reply target. */}else if(segment?.type==='at'){throw Error('官方QQ适配暂不支持单独@成员，请用普通文字回复');}else throw Error('官方QQ不支持该消息段：'+String(segment?.type));}
    const content=texts.join('');if(content.length>4000)throw Error('官方QQ单条文本过长，请分段发送');const count=media.length+(content?1:0);if(!count)throw Error('消息内容不能为空');
    // Conservative 5-minute passive window: current official per-endpoint docs
    // and overview disagree for C2C. Never assume a broader entitlement.
    const incoming=this.state.messages[contact.lastMessage],passive=incoming&&this.now()-incoming.at<5*60000&&incoming.seq+count<=(kind==='private'?4:5);
    if(!passive&&!this.settings.allowProactive)throw Error('官方QQ被动回复窗口或条数已用尽，请用户重新发消息；需平台授权主动消息时可在后台单独开启');
    const prepared=[];for(const segment of media)prepared.push({segment,body:await this.media(segment)});
    const route='/v2/'+(kind==='private'?'users':'groups')+'/'+encodeURIComponent(contact.native),responses=[];
    const push=async body=>{
      if(passive){if(this.now()-incoming.at>=5*60000)throw Error('官方QQ回复窗口在发送前已过期，请用户重新发消息');incoming.seq++;this.flush();body={...body,msg_id:incoming.native,msg_seq:incoming.seq};}
      const result=await this.api(route+'/messages',body);
      if(!identifier(result.id))throw Error('官方QQ未返回消息编号，发送结果未确认，请检查QQ后再操作');
      const sentType=prepared[responses.length-(content?1:0)]?.segment?.type;
      const message_id=this.messageId(result.id,key),event={message_id,message_type:kind,...(kind==='private'?{user_id:Number(id)}:{group_id:Number(id)}),sender:{user_id:this.selfId,nickname:this.me?.username||'机器人'},message:body.msg_type===0?[{type:'text',data:{text:body.content}}]:[{type:sentType,data:{file:'official-sent-'+sentType}}]};
      this.state.messages[message_id]={native:result.id,key,at:this.now(),seq:0,event};this.flush();responses.push({message_id});
    };
    try{if(content)await push({msg_type:0,content});for(const item of prepared){const uploaded=await this.api(route+'/files',item.body);if(!identifier(uploaded.file_info)&&!(typeof uploaded.file_info==='string'&&uploaded.file_info.length<20000&&uploaded.file_info.length>0))throw Error('官方QQ上传未返回媒体凭证');await push({msg_type:7,media:{file_info:uploaded.file_info}});}}
    catch(error){throw Error((responses.length?'已有'+responses.length+'条发送成功，后续未完成；请勿整条重发。':'')+error.message);}
    return {...responses.at(-1),message_ids:responses.map(v=>v.message_id)};
  }
  async raw(action,params={}){
    if(action==='get_login_info'){if(!this.ready||!this.me)throw Error('官方QQ尚未完成网关登录');return {user_id:this.selfId,nickname:this.me.username||this.me.nickname||'官方QQ机器人'};}
    if(action==='get_status')return {online:this.ready,good:this.health().good};
    if(action==='get_msg'){const item=this.state.messages[String(params.message_id)];if(!item)throw Error('官方QQ仅能查询本适配器缓存的消息');return item.event;}
    if(action==='send_private_msg')return this.send('private',String(params.user_id),params.message);
    if(action==='send_group_msg')return this.send('group',String(params.group_id),params.message);
    throw Error('腾讯官方机器人不提供此个人QQ框架接口：'+String(action).slice(0,70)+'。本地表情图片可通过图片消息发送；QQ空间须另行登录。');
  }
  async request(action,params={}){try{return {status:'ok',retcode:0,data:await this.raw(action,params)};}catch(error){return {status:'failed',retcode:1400,wording:error.message};}}
  getLoginInfo(){return this.raw('get_login_info');}
  getStatus(){return this.raw('get_status');}
  getMessage(message_id){return this.raw('get_msg',{message_id});}
  getGroupMemberList(group_id){return this.raw('get_group_member_list',{group_id});}
  getGroupMemberInfo(group_id,user_id){return this.raw('get_group_member_info',{group_id,user_id});}
  getImage(params){return this.raw('get_image',params);}
  fetchFaceEntity(face_id){return this.raw('fetch_face_entity',{face_id});}
  sendPrivateMessage(user_id,value){return this.raw('send_private_msg',{user_id,message:value});}
  sendGroupMessage(group_id,value){return this.raw('send_group_msg',{group_id,message:value});}
  async startFacade(){
    if(this.server?.listening)return;if(this.serverFlight)return this.serverFlight;
    if(!this.settings.localToken||this.settings.localToken.length<32)throw Error('官方QQ本机适配凭据缺失，请在后台重新保存配置');
    this.serverFlight=new Promise((resolve,reject)=>{
      const server=http.createServer(async(req,res)=>{
        const reply=(status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
        if(req.headers.origin||!equal(req.headers.authorization,'Bearer '+this.settings.localToken)){reply(403,{status:'failed',retcode:1403,wording:'仅供本机已认证桥接调用'});return;}
        let action;try{const url=new URL(req.url,'http://127.0.0.1');action=url.pathname.slice(1);if(url.search||!['get_status','get_login_info','get_msg','send_private_msg','send_group_msg'].includes(action))throw Error('不支持该官方QQ动作');if(req.method!=='POST'&&!(req.method==='GET'&&['get_status','get_login_info'].includes(action)))throw Error('请求方法无效');}catch(error){reply(400,{status:'failed',retcode:1400,wording:error.message});return;}
        try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024){reply(413,{status:'failed',retcode:1413,wording:'媒体请求超过限制'});return;}chunks.push(chunk);}const input=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};reply(200,await this.request(action,input));}catch{reply(400,{status:'failed',retcode:1400,wording:'本机适配请求格式无效'});}
      });
      this.server=server;server.requestTimeout=15000;server.headersTimeout=10000;server.on('error',error=>{if(!server.listening)reject(Error(error.code==='EADDRINUSE'?'官方QQ本机适配端口被占用，请在后台更换端口':'官方QQ本机适配服务启动失败'));else this.report(Error('官方QQ本机适配服务异常'));});server.listen(this.settings.localPort??17871,'127.0.0.1',resolve);
    });try{await this.serverFlight;}finally{this.serverFlight=null;}
  }
  close(){this.closed=true;this.ready=false;this.abort.abort();clearTimeout(this.retryTimer);clearInterval(this.heartbeat);this.socket?.terminate();this.socket=null;this.server?.closeAllConnections();this.server?.close();}
}

export async function probeOfficialCredentials(root,settings,options={}){const client=new OfficialQQClient({root,settings,reconnect:false,...options});try{return await client.checkCredentials();}finally{client.close();}}
