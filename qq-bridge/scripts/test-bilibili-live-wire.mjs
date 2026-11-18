import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {deflateSync,brotliCompressSync} from 'node:zlib';
import {liveRuntime,connectLiveRoom} from '../src/bilibili-live-api.js';
const runtime=await liveRuntime(process.cwd()),require=createRequire(import.meta.url);const {WebSocketServer}=createRequire(require.resolve('../integrations/bilibili-live-runtime/node_modules/tiny-bilibili-ws/dist/index.cjs'))('ws');
const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>server.once('listening',r));let peer,auth;
const events=[],states=[];const signal=new AbortController();
function packet(op,value,version=0){const body=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),head=Buffer.alloc(16);head.writeUInt32BE(body.length+16,0);head.writeUInt16BE(16,4);head.writeUInt16BE(version,6);head.writeUInt32BE(op,8);head.writeUInt32BE(1,12);return Buffer.concat([head,body]);}
server.on('connection',ws=>{peer=ws;ws.on('message',async bytes=>{const d=await runtime.deserialize(new Uint8Array(bytes));if(d[0].meta.op===7){auth=JSON.parse(Buffer.from(bytes).subarray(16).toString('utf8'));ws.send(packet(8,{code:0},1));}});});
const connection=await connectLiveRoom({root:process.cwd(),info:{roomId:123,selfUid:'42',url:'ws://127.0.0.1:'+server.address().port,auth:{uid:42,roomid:123,protover:3,platform:'web',key:'fixture'}},signal:signal.signal,onEvent:e=>events.push(e),onState:s=>states.push(s)});
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('fixture timed out');};
try{
 await wait(()=>states.includes('connected'));assert.equal(auth.roomid,123);
 const rawDanmu={cmd:'DANMU_MSG',info:[[0,1,25,16777215,Date.now(),8765,0,'',0,0,0,'',0,'','',{extra:'{}'}],'小鸽子，这是模拟弹幕？',[777,'测试观众',0,0,0,10000,1,''],[],[0,0],[],0,0,{},{}]};
 peer.send(packet(5,deflateSync(packet(5,rawDanmu)),2));await wait(()=>events.some(e=>e.kind==='question'));assert.equal(events[0].user.uname,'测试观众');assert.equal(events[0].content,'小鸽子，这是模拟弹幕？');
 peer.send(packet(5,brotliCompressSync(packet(5,{cmd:'GUARD_BUY',data:{uid:778,username:'上舰观众',gift_name:'舰长',guard_level:3}})),3));await wait(()=>events.some(e=>e.kind==='guard'));
 peer.send(packet(5,{cmd:'SEND_GIFT',data:{uid:779,uname:'送礼朋友',giftName:'心心',num:3,tid:'fixture-gift-1',timestamp:Math.floor(Date.now()/1000)}}));await wait(()=>events.some(e=>e.kind==='gift'));assert.equal(events.find(e=>e.kind==='gift').amount,3);
 peer.send(packet(5,{cmd:'INTERACT_WORD',data:{uid:780,uname:'新观众',msg_type:1,trigger_time:Date.now()*1000}}));await wait(()=>events.some(e=>e.kind==='welcome'));
 const v=n=>{const b=[];while(n>127){b.push((n&127)|128);n=Math.floor(n/128);}return Buffer.from([...b,n]);};
 const field=(id,value)=>typeof value==='number'?Buffer.concat([v(id*8),v(value)]):Buffer.concat([v(id*8+2),v(Buffer.byteLength(value)),Buffer.from(value)]);
 const gift=Buffer.concat([field(1,1),field(2,'新协议礼物'),field(3,2),field(10,Math.floor(Date.now()/1000))]);
 const pb=Buffer.concat([field(1,781),field(2,'新协议观众'),field(10,gift)]).toString('base64');
 peer.send(packet(5,{cmd:'SEND_GIFT_V2',data:{pb}}));await wait(()=>events.filter(e=>e.kind==='gift').length===2);assert.equal(events.filter(e=>e.kind==='gift').at(-1).gift_name,'新协议礼物');
 const welcomePb=Buffer.concat([field(1,782),field(2,'新协议进房观众'),field(5,1),field(7,Math.floor(Date.now()/1000)),field(15,Date.now()*1000)]).toString('base64');peer.send(packet(5,{cmd:'INTERACT_WORD_V2',data:{pb:welcomePb}}));await wait(()=>events.filter(e=>e.kind==='welcome').length===2);assert.equal(events.filter(e=>e.kind==='welcome').at(-1).user.uname,'新协议进房观众');
 peer.send(packet(5,rawDanmu));await wait(()=>events.filter(e=>e.kind==='question').length===2);assert.equal(events.filter(e=>e.kind==='question')[0].id,events.filter(e=>e.kind==='question')[1].id,'reconnect duplicates retain same ID');
 signal.abort();await wait(()=>peer.readyState===3);assert(!states.includes('disconnected'),'intentional close must not reconnect');
 console.log('PASS actual local WebSocket auth, zlib/brotli, danmaku/guard/welcome/legacy gift and SEND_GIFT_V2 protobuf, stable dedupe IDs and abort/close without reconnect');
}finally{connection.close();for(const ws of server.clients)ws.terminate();await new Promise(r=>server.close(r));}
