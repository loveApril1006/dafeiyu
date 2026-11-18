// Independent transport for the public OneBot v11 forward-WebSocket protocol.
// API requests are never replayed automatically after reconnecting.
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';

export const text=value=>({type:'text',data:{text:String(value)}});
const message=value=>typeof value==='string'||Array.isArray(value)?value:[value];
export class OneBotWebSocketClient extends EventEmitter {
  constructor({url,accessToken,reconnect=true,requestTimeoutMs=30000,reconnectDelayMs=800}={}){
    super();this.url=url;this.accessToken=accessToken;this.reconnect=reconnect;
    this.timeoutMs=requestTimeoutMs;this.delayMs=reconnectDelayMs;this.pending=new Map();
    this.socket=null;this.connecting=null;this.retry=null;this.closed=false;this.failures=0;
  }
  onEvent(handler){this.on('event',handler);return this;}
  onPrivateMessage(handler){this.on('private-message',handler);return this;}
  onGroupMessage(handler){this.on('group-message',handler);return this;}
  onNotice(type,handler){this.on('notice:'+type,handler);return this;}
  onBotStatus(handler){return this.onNotice('bot_status',handler);}
  connect(){
    if(this.socket?.readyState===WebSocket.OPEN)return Promise.resolve();
    if(this.connecting)return this.connecting;
    const endpoint=new URL(this.url);
    if(!['ws:','wss:'].includes(endpoint.protocol)||endpoint.username||endpoint.password)throw Error('OneBot WebSocket 地址无效');
    this.closed=false;clearTimeout(this.retry);this.retry=null;
    const socket=new WebSocket(endpoint,{headers:this.accessToken?{Authorization:'Bearer '+this.accessToken}:{},handshakeTimeout:10000,maxPayload:10*1024*1024});
    this.socket=socket;
    let settled=false,resolveConnect,rejectConnect;
    const connection=new Promise((resolve,reject)=>{resolveConnect=resolve;rejectConnect=reject;});
    this.connecting=connection;
    const fail=error=>{if(!settled){settled=true;rejectConnect(error);}};this.rejectConnect=fail;
    socket.on('open',()=>{if(this.socket!==socket)return;settled=true;this.connecting=null;this.rejectConnect=null;this.failures=0;resolveConnect();this.emit('open');});
    socket.on('message',data=>{if(this.socket!==socket)return;let packet;try{packet=JSON.parse(data.toString());}catch{return;}
      if(!packet||typeof packet!=='object'||Array.isArray(packet))return;
      if(Object.hasOwn(packet,'echo')){const item=this.pending.get(String(packet.echo));if(item){this.pending.delete(String(packet.echo));clearTimeout(item.timer);item.resolve(packet);}return;}
      if(!packet.post_type)return;this.emit('event',packet);
      if(packet.post_type==='message'||packet.post_type==='message_sent'){
        if(packet.message_type==='private')this.emit('private-message',packet);
        if(packet.message_type==='group')this.emit('group-message',packet);
      }else if(packet.post_type==='notice')this.emit('notice:'+packet.notice_type,packet);
    });
    socket.on('error',error=>{if(this.socket!==socket)return;fail(error);if(this.listenerCount('error'))this.emit('error',error);});
    socket.on('close',(code,reason)=>{if(this.socket!==socket)return;this.connecting=null;fail(Error('QQ 网关在连接建立前关闭'));
      this.rejectPending(Error('QQ 网关连接断开；未重放请求，请检查实际发送结果'));
      this.emit('close',{code,reason:reason.toString()});
      if(this.reconnect&&!this.closed){const delay=Math.min(30000,this.delayMs*2**Math.min(6,this.failures++));this.retry=setTimeout(()=>{this.retry=null;if(!this.closed)this.connect().catch(()=>{});},delay);this.retry.unref?.();}
    });
    return connection;
  }
  rejectPending(error){for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error);}this.pending.clear();}
  close(code=1000,reason='client-close'){
    this.closed=true;clearTimeout(this.retry);this.retry=null;this.rejectConnect?.(Error('QQ 网关连接已取消'));this.rejectConnect=null;this.connecting=null;
    this.rejectPending(Error('QQ 网关连接已关闭'));
    const socket=this.socket;this.socket=null;
    if(socket){if(socket.readyState===WebSocket.CONNECTING)socket.terminate();else socket.close(code,reason);}
  }
  request(action,params={}){
    if(this.socket?.readyState!==WebSocket.OPEN)return Promise.reject(Error('QQ 网关未连接，请先启动自行安装的框架'));
    if(this.pending.size>=1024)return Promise.reject(Error('QQ 网关待处理请求过多'));
    const echo=randomUUID(),socket=this.socket;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(echo);reject(Error('OneBot '+action+' 请求超时；未自动重试'));},this.timeoutMs);
      this.pending.set(echo,{resolve,reject,timer});
      socket.send(JSON.stringify({action,params,echo}),error=>{if(!error)return;const item=this.pending.get(echo);if(item){this.pending.delete(echo);clearTimeout(timer);reject(error);}});
    });
  }
  async raw(action,params={}){const result=await this.request(action,params);if(result.status==='failed'||(result.retcode!=null&&Number(result.retcode)!==0))throw Object.assign(Error('OneBot '+action+' 失败（'+(result.retcode??'unsupported')+'）：'+String(result.wording||result.message||'请检查框架是否支持此接口').slice(0,300)),{retcode:result.retcode});return result.data;}
  getLoginInfo(){return this.raw('get_login_info');}
  getStatus(){return this.raw('get_status');}
  getGroupMemberList(group_id){return this.raw('get_group_member_list',{group_id});}
  getGroupMemberInfo(group_id,user_id,no_cache=false){return this.raw('get_group_member_info',{group_id,user_id,no_cache});}
  getMessage(message_id){return this.raw('get_msg',{message_id});}
  getImage(params){return this.raw('get_image',typeof params==='string'?{file:params}:params);}
  fetchFaceEntity(face_id){return this.raw('fetch_face_entity',{face_id});}
  sendPrivateMessage(user_id,value){return this.raw('send_private_msg',{user_id,message:message(value)});}
  sendGroupMessage(group_id,value){return this.raw('send_group_msg',{group_id,message:message(value)});}
}
