// Real HTTP/WS transports against loopback fixtures only. No QQ account/API calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import WebSocket,{WebSocketServer} from 'ws';
import {OfficialQQClient,probeOfficialCredentials,validateOfficialGateway} from '../src/official-qq-client.js';
import {OFFICIAL_API,readOfficialSettings,saveOfficialSettings,officialRuntimeConfig,saveOfficialAccess} from '../src/official-qq-settings.js';
const baseRoot=path.resolve('..','maintenance','official-qq-20261029','fixtures');fs.mkdirSync(baseRoot,{recursive:true});
const root=fs.mkdtempSync(path.join(baseRoot,'adapter-'));
let now=1800000000000,tokenCalls=0,sends=[],uploads=[],failure='',sock,gatewayHost='api.sgroup.qq.com';
const server=http.createServer(async(req,res)=>{const chunks=[];for await(const b of req)chunks.push(b);const input=chunks.length?JSON.parse(Buffer.concat(chunks)):{};
  const json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  if(req.url==='/app/getAppAccessToken'){tokenCalls++;assert.equal(input.clientSecret,'fixture-app-secret');json({access_token:'fixture-access-token',expires_in:'7200'});return;}
  assert.equal(req.headers.authorization,'QQBot fixture-access-token');
  if(req.url==='/users/@me'){json({id:'bot-native',username:'Fixture鱼'});return;}
  if(req.url==='/gateway'){json({url:'wss://'+gatewayHost+'/websocket/'});return;}
  if(req.url.endsWith('/files')){uploads.push({url:req.url,input});assert.equal(input.srv_send_msg,false);json({file_info:'opaque-file-info',ttl:3600});return;}
  if(req.url.endsWith('/messages')){sends.push({url:req.url,input});const mode=failure;failure='';if(mode==='network'){req.socket.destroy();return;}if(mode==='business'){json({code:11253,trace_id:'fixture-trace'});return;}if(mode==='empty'){json({timestamp:now});return;}if(mode==='audit'){json({id:'pending'},202);return;}json({id:'native-send-'+sends.length,timestamp:new Date(now).toISOString()});return;}
  json({code:404},404);
});
const wss=new WebSocketServer({server});let logins=0,resumes=0;
wss.on('connection',socket=>{sock=socket;socket.send(JSON.stringify({op:10,d:{heartbeat_interval:1000}}));socket.on('message',raw=>{const p=JSON.parse(raw);if(p.op===2){logins++;assert.equal(p.d.token,'QQBot fixture-access-token');assert.equal(p.d.intents,1<<25);socket.send(JSON.stringify({op:0,t:'READY',s:1,d:{session_id:'fixture-session',user:{id:'bot-native',username:'Fixture鱼'}}}));}if(p.op===6){resumes++;socket.send(JSON.stringify({op:0,t:'RESUMED',s:2,d:{}}));}if(p.op===1)socket.send(JSON.stringify({op:11}));});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
class FixtureSocket extends WebSocket{constructor(endpoint,options){assert(['api.bot.qq.com','api.sgroup.qq.com'].includes(new URL(endpoint).hostname));super(url.replace('http:','ws:')+'/',options);}}
const requests=[];const fetchImpl=(target,init)=>{assert(String(target).startsWith(OFFICIAL_API+'/'));requests.push(String(target));return fetch(url+String(target).slice(OFFICIAL_API.length),init);};
const settings={enabled:true,appId:'123456789',appSecret:'fixture-app-secret',localPort:17871,localToken:'f'.repeat(64),allowProactive:false};
const tick=()=>new Promise(r=>setTimeout(r,25));const wait=async(fn)=>{for(let i=0;i<100&&!fn();i++)await tick();assert(fn(),'fixture event did not arrive');};
let client;
try{
  for(const host of ['api.bot.qq.com','api.sgroup.qq.com'])assert.equal(validateOfficialGateway('wss://'+host+'/websocket').hostname,host);
  for(const target of ['wss://evil.example/websocket','wss://api.bot.qq.com.evil.example/websocket','ws://api.bot.qq.com/websocket','wss://token@api.bot.qq.com/websocket','wss://api.bot.qq.com:8443/websocket','wss://api.bot.qq.com/other'])assert.throws(()=>validateOfficialGateway(target));
  const publicData=saveOfficialSettings(root,settings);assert(!JSON.stringify(publicData).includes('fixture-app-secret'));assert(!JSON.stringify(publicData).includes(settings.localToken));
  const original={snowluma:{httpUrl:'http://127.0.0.1:3000',accessToken:'old-onebot-token'},ownerQQ:11111,allow:{private:[11111],groups:[22222]},dsh:{model:'keep'}};
  const runtime=officialRuntimeConfig(root,original);assert.equal(runtime.ownerQQ,null);assert.deepEqual(runtime.allow,{private:[],groups:[]});assert.equal(runtime.dsh.model,'keep');assert.equal(original.snowluma.accessToken,'old-onebot-token');
  saveOfficialAccess(root,{ownerQQ:12345,allow:{private:[12345],groups:[]},deny:{private:[],groups:[]}});saveOfficialSettings(root,{appSecret:''});assert.equal(readOfficialSettings(root).appSecret,settings.appSecret);assert.equal(readOfficialSettings(root).access.ownerQQ,12345);
  const options={root,settings,fetchImpl,Socket:FixtureSocket,now:()=>now,reconnect:false};client=new OfficialQQClient(options);
  await Promise.all([client.accessToken(),client.accessToken(),client.accessToken()]);assert.equal(tokenCalls,1);
  await client.checkCredentials();assert.equal(sends.length,0,'credential probe must never send a QQ message');
  // Bind a dynamic facade port to avoid depending on installed services.
  client.settings.localPort=0;await client.startFacade();const facade='http://127.0.0.1:'+client.server.address().port;
  const message=(native='incoming-1',group=false)=>({op:0,t:group?'GROUP_AT_MESSAGE_CREATE':'C2C_MESSAGE_CREATE',s:10,d:{id:native,...(group?{group_openid:'group-openid'}:{}),author:group?{member_openid:'member-openid'}:{user_openid:'user-openid',username:'测试用户'},content:group?'<@123456789> 你好':'你好',timestamp:new Date(now).toISOString(),message_scene:{ext:[{key:'auth_token',value:'must-never-store'}]}}});
  let received=[];client.onPrivateMessage(e=>received.push(e));client.onGroupMessage(e=>received.push(e));
  await client.connect();assert.equal(logins,1);assert.equal(client.health().connected,true);
  sock.send(JSON.stringify(message()));await wait(()=>received.length===1);sock.send(JSON.stringify(message()));await tick();assert.equal(received.length,1,'duplicate dispatch must not retrigger AI');
  const id=received[0].user_id;assert(Number.isSafeInteger(id));assert.notEqual(id,11111);assert.equal(received[0].message_type,'private');
  const text=await client.sendPrivateMessage(id,{type:'text',data:{text:'你好 &#91;测试&#93;'}});assert(Number.isSafeInteger(text.message_id));assert.equal(sends[0].input.content,'你好 [测试]');assert.equal(sends[0].input.msg_id,'incoming-1');assert.equal(sends[0].input.msg_seq,1);assert(sends[0].url.includes('/users/user-openid/'));
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN4kAAAAASUVORK5CYII=';
  await client.sendPrivateMessage(id,[{type:'image',data:{file:'base64://'+png}}]);assert.equal(uploads[0].input.file_type,1);assert.equal(sends[1].input.msg_type,7);assert.equal(sends[1].input.media.file_info,'opaque-file-info');
  const wav=path.join(root,'voice.wav'),wave=Buffer.alloc(44);wave.write('RIFF',0);wave.write('WAVE',8);fs.writeFileSync(wav,wave);
  await assert.rejects(client.sendPrivateMessage(id,[{type:'record',data:{file:wav}}]),/未经桥接检查/);client.approvedFiles.add(fs.realpathSync(wav));
  const voiceResult=await fetch(facade+'/send_private_msg',{method:'POST',headers:{authorization:'Bearer '+settings.localToken,'content-type':'application/json'},body:JSON.stringify({user_id:id,message:[{type:'record',data:{file:wav}}]})}).then(r=>r.json());assert.equal(voiceResult.retcode,0,voiceResult.wording);assert.equal(uploads[1].input.file_type,3);assert.equal(uploads[1].input.file_name,'voice.wav');assert.equal((await client.getMessage(voiceResult.data.message_id)).message[0].type,'record');
  assert.equal((await fetch(facade+'/get_status')).status,403);assert.equal((await fetch(facade+'/get_status',{headers:{authorization:'Bearer '+settings.localToken,origin:'https://evil.example'}})).status,403);
  await assert.rejects(client.sendPrivateMessage(11111,'wrong identity'),/OpenID/);
  failure='network';await assert.rejects(client.sendPrivateMessage(id,'ambiguous'),/未自动重试/);assert.equal(sends.length,4);await assert.rejects(client.sendPrivateMessage(id,'should not replay'),/条数已用尽/);assert.equal(sends.length,4);
  sock.send(JSON.stringify(message('incoming-2')));await wait(()=>received.length===2);failure='business';await assert.rejects(client.sendPrivateMessage(id,'no permission'),/11253/);assert.equal(sends.length,5);
  failure='empty';await assert.rejects(client.sendPrivateMessage(id,'missing result'),/未确认/);assert.equal(sends.length,6);
  failure='audit';await assert.rejects(client.sendPrivateMessage(id,'audit pending'),/审核/);assert.equal(sends.length,7);
  sock.send(JSON.stringify(message('group-1',true)));await wait(()=>received.length===3);const group=received[2].group_id;assert.notEqual(group,id);assert.notEqual(received[2].user_id,id);assert.equal(received[2].message[0].type,'at');
  await assert.rejects(client.sendGroupMessage(group,[{type:'reply',data:{id:received[0].message_id}},{type:'text',data:{text:'cross-chat'}}]),/不属于/);
  await client.sendGroupMessage(group,'group reply');assert(sends.at(-1).url.includes('/groups/group-openid/'));now+=301000;await assert.rejects(client.sendGroupMessage(group,'expired'),/回复窗口/);
  assert.equal((await client.request('fetch_custom_face_detail')).status,'failed');
  client.lastAckAt=0;await wait(()=>client.lastAckAt>0);assert.equal(client.health().good,true,'must observe a real server heartbeat ACK');
  const sentBeforeResume=sends.length;gatewayHost='api.bot.qq.com';client.reconnect=true;client.retryBaseMs=10;sock.terminate();await wait(()=>resumes>0&&client.ready);assert.equal(sends.length,sentBeforeResume,'reconnect must not replay an uncertain send');
  const disk=fs.readFileSync(client.stateFile,'utf8');assert(!disk.includes('must-never-store'));assert(!disk.includes(settings.appSecret));assert(!disk.includes(png));assert(!disk.includes(wav));
  const persisted=new OfficialQQClient(options);let repeated=0;persisted.onPrivateMessage(()=>repeated++);persisted.me={id:'bot-native'};persisted.selfId=client.selfId;persisted.receive(message());assert.equal(repeated,0);assert.equal(persisted.numericId('private','user-openid'),id);persisted.close();
  saveOfficialSettings(root,{appId:'987654321',appSecret:'fixture-app-secret'});assert.equal(readOfficialSettings(root).access.ownerQQ,null);const different=new OfficialQQClient({...options,settings:{...settings,appId:'987654321'}});assert.notEqual(different.numericId('private','user-openid'),id);different.close();
  saveOfficialSettings(root,{enabled:false});assert.strictEqual(officialRuntimeConfig(root,original),original);
  sock.close(4014,'not permitted');await wait(()=>client.closed);assert.equal(client.ready,false);assert.match(client.health().hint,/4014/);
  console.log('PASS official QQ: token singleflight, READY/identity mapping, C2C/group dispatch + dedup, text/image/voice facade, private file gate, sequence reservation, platform/uncertain errors, reply limits, secret isolation and transport fallback; no live QQ calls');
}finally{client?.close();for(const s of wss.clients)s.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));assert(root.startsWith(baseRoot+path.sep));fs.rmSync(root,{recursive:true,force:true});}
