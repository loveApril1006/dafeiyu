// iLink wire adapter, independently implemented from Tencent/openclaw-weixin
// 874637a0dbc24050f72d1385add4fc6170a2d726 (MIT). See integrations/Wechat-README.md.
import {randomBytes,randomUUID,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
export const API_BASE='https://ilinkai.weixin.qq.com',CDN_BASE='https://novac2c.cdn.weixin.qq.com/c2c';
export function officialUrl(value,{baseOnly=false,cdn=false}={}){
 const url=new URL(value);const host=url.hostname.toLowerCase(),valid=cdn?(host.endsWith('.cdn.weixin.qq.com')||host==='novac2c.cdn.weixin.qq.com'):(host==='ilinkai.weixin.qq.com'||host.endsWith('.weixin.qq.com'));
 if(url.protocol!=='https:'||!valid||url.username||url.password||url.port||url.hash||(baseOnly&&(url.pathname!=='/'||url.search)))throw Error('微信服务返回了未经允许的地址');return url;
}
export function aesKey(value){const raw=Buffer.from(String(value||''),'base64');if(raw.length===16)return raw;if(raw.length===32&&/^[a-f0-9]{32}$/i.test(raw.toString()))return Buffer.from(raw.toString(),'hex');throw Error('微信附件加密参数无效');}
export function crypt(bytes,key,decrypt=false){const engine=decrypt?createDecipheriv('aes-128-ecb',key,null):createCipheriv('aes-128-ecb',key,null);return Buffer.concat([engine.update(bytes),engine.final()]);}
async function limited(response,max){if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw Error('微信响应超过大小限制');}let size=0,chunks=[];for await(const b of response.body){size+=b.length;if(size>max)throw Error('微信响应超过大小限制');chunks.push(b);}return Buffer.concat(chunks);}
export function createIlinkClient({fetchImpl=fetch}={}){
 const common=()=>({'iLink-App-Id':'bot','iLink-App-ClientVersion':'132106'}),baseInfo={channel_version:'2.4.10',bot_agent:'XiaogeWechat/1.0.0'};
 async function request(endpoint,{base=API_BASE,token,body,signal,timeout=15000,get=false,qr=false}={}){
  const origin=officialUrl(base,{baseOnly:true}),url=new URL(endpoint,origin);if(url.origin!==origin.origin||!url.pathname.startsWith('/ilink/bot/'))throw Error('微信接口路径无效');
  const headers=common();if(!get){Object.assign(headers,{'Content-Type':'application/json',AuthorizationType:'ilink_bot_token','X-WECHAT-UIN':Buffer.from(String(randomBytes(4).readUInt32BE())).toString('base64')});if(token)headers.Authorization='Bearer '+token;}
  const deadline=AbortSignal.timeout(timeout);signal=signal?AbortSignal.any([signal,deadline]):deadline;
  let response;try{response=await fetchImpl(url,{method:get?'GET':'POST',headers,redirect:'error',signal,...(!get?{body:JSON.stringify(qr?body:{...body,base_info:baseInfo})}:{})});}catch(error){if(signal.aborted)throw signal.reason;throw Error('微信网络连接失败，请检查本机网络');}
  if(!response.ok)throw Error('微信接口 HTTP '+response.status);let result;try{result=JSON.parse((await limited(response,2*1024*1024)).toString('utf8'));}catch{throw Error('微信接口返回无效数据');}
  const code=Number(result.ret||result.errcode||0);if(code){const error=Error(code===-14?'微信登录已失效，请重新绑定':'微信接口拒绝请求，错误码 '+code);if(code===-14||[401,403].includes(code))error.code='AUTH_EXPIRED';throw error;}return result;
 }
 async function download(item,signal){
  const media=item.media||{},url=media.full_url||CDN_BASE+'/download?encrypted_query_param='+encodeURIComponent(media.encrypt_query_param||'');officialUrl(url,{cdn:true});
  const timeout=AbortSignal.timeout(30000);const response=await fetchImpl(url,{redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout});if(!response.ok)throw Error('微信附件下载失败');const raw=await limited(response,8*1024*1024+16),key=item.aesHex?Buffer.from(item.aesHex,'hex'):media.aes_key?aesKey(media.aes_key):null;if(key&&key.length!==16)throw Error('微信附件密钥格式无效');return key?crypt(raw,key,true):raw;
 }
 async function send(credentials,{peer,context,item,clientId=randomUUID()},signal){
  let wire;if(item.type==='text')wire={type:1,text_item:{text:item.text}};
  else{
   const bytes=item.bytes;if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>8*1024*1024)throw Error('微信发送附件超过8MB或为空');
   const key=randomBytes(16),encrypted=crypt(bytes,key),filekey=randomBytes(16).toString('hex');
   const args={filekey,media_type:item.type==='image'?1:3,to_user_id:peer,rawsize:bytes.length,rawfilemd5:createHash('md5').update(bytes).digest('hex'),filesize:encrypted.length,no_need_thumb:true,aeskey:key.toString('hex')};
   const uploaded=await request('/ilink/bot/getuploadurl',{...credentials,body:args,signal});
   const target=uploaded.upload_full_url||uploaded.upload_param&&CDN_BASE+'/upload?encrypted_query_param='+encodeURIComponent(uploaded.upload_param)+'&filekey='+filekey;if(!target)throw Error('微信没有返回附件上传地址');officialUrl(target,{cdn:true});
   const timeout=AbortSignal.timeout(30000),response=await fetchImpl(target,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:encrypted,redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout});
   const encryptedParam=response.headers.get('x-encrypted-param');if(!response.ok||!encryptedParam)throw Error('微信附件上传未确认');await response.body?.cancel();
   const media={encrypt_query_param:encryptedParam,aes_key:Buffer.from(key.toString('hex')).toString('base64'),encrypt_type:1};wire=item.type==='image'?{type:2,image_item:{media,mid_size:encrypted.length}}:{type:4,file_item:{media,file_name:String(item.name||'附件').replace(/[\\/\x00-\x1f]/g,'_'),len:String(bytes.length)}};
  }
  signal?.throwIfAborted();return request('/ilink/bot/sendmessage',{...credentials,body:{msg:{from_user_id:'',to_user_id:peer,client_id:clientId,message_type:2,message_state:2,item_list:[wire],context_token:context}},signal});
 }
 return {request,download,send};
}
export function normalizeIlinkMessage(msg){
 if(msg.message_type!==1||!msg.from_user_id||msg.group_id)return null;
 const texts=[],attachments=[];let voice=false;for(const item of (msg.item_list||[]).slice(0,6)){
  if(item.type===1&&item.text_item?.text)texts.push(String(item.text_item.text));
  if(item.type===3){voice=true;if(item.voice_item?.text)texts.push(String(item.voice_item.text));}
  if(item.type===2&&item.image_item?.media)attachments.push({type:'image',media:item.image_item.media,aesHex:item.image_item.aeskey});
  if(item.type===4&&item.file_item?.media)attachments.push({type:'file',media:item.file_item.media,name:item.file_item.file_name});
 }
 const id=msg.message_id??msg.client_id??msg.seq;if(id===undefined)return null;
 return {id:String(id),peer:String(msg.from_user_id),kind:'private',text:texts.join('\n'),voice,attachments,context:String(msg.context_token||'')};
}
