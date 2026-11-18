import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWechatCore} from '../src/wechat/core.js';
import {desktopTargets} from '../src/wechat/desktop-driver.js';
import {createIlinkClient,officialUrl,aesKey,crypt,normalizeIlinkMessage} from '../src/wechat/ilink.js';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoge-wechat-'));let now=1800000000000,calls=0,sends=[],mode='normal',releasePoll;
const driver={status:()=>({ready:true,owner:'owner',driver:'fixture'}),poll:async(_cursor,signal)=>new Promise((resolve,reject)=>{releasePoll=resolve;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});}),send:async(row)=>{sends.push(row);if(mode==='send-error')throw Error('mock uncertain');},stop:async()=>{},download:async()=>Buffer.from('test')};
const model=async({history},signal)=>{calls++;assert(JSON.stringify(history).length<=6000);if(mode==='slow')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));return '小鸽子：收到啦。';};
const core=createWechatCore({root:temp,driver,model,harden:false,now:()=>now});
const configure=patch=>core.configure({revision:core.status().config.revision,...patch});
const message=(id,text='你好',more={})=>({id,peer:'owner',kind:'private',text,context:'fixture-context',...more});
const tick=()=>new Promise(r=>setTimeout(r,5));
try{
 assert.equal(core.status().config.enabled,false);assert.equal(calls,0);await assert.rejects(()=>core.sendManual({peer:'owner',text:'test'}),/已关闭/);
 await configure({enabled:true,allowGroups:['group-fixture'],cooldownSeconds:2});
 core.ingest([message('one'),message('one'),message('outsider','不得处理',{peer:'stranger'}),message('group-ignore','普通群消息',{peer:'group-fixture',kind:'group',mentioned:false})],'cursor-1');await core.drain(new AbortController().signal);assert.equal(calls,1);assert.equal(sends.length,1);assert.equal(core.status().messages.length,1);
 now+=3000;core.ingest([message('two','@小鸽子 你好',{peer:'group-fixture',kind:'group',mentioned:true})],'cursor-2');await core.drain(new AbortController().signal);assert.equal(calls,2);assert.equal(sends.at(-1).peer,'group-fixture');
 const beforeInvalid={journal:fs.readFileSync(path.join(core.store.home,'inbox.json'),'utf8'),sends:sends.length,calls};
 for(const value of [{text:' '},{type:'image',base64:'eA=='},{type:'file',base64:'eA=='},{type:'unknown',base64:'eA=='}])await assert.rejects(()=>core.sendManual({peer:'owner',...value}));
 assert.equal(fs.readFileSync(path.join(core.store.home,'inbox.json'),'utf8'),beforeInvalid.journal);assert.equal(sends.length,beforeInvalid.sends);assert.equal(calls,beforeInvalid.calls);
 now+=3000;mode='send-error';core.ingest([message('three')],'cursor-3');await core.drain(new AbortController().signal);assert.equal(core.status().messages[0].state,'uncertain');const sent=sends.length;core.ingest([message('three')],'cursor-4');await core.drain(new AbortController().signal);assert.equal(sends.length,sent,'Ambiguous sends must not be retried');mode='normal';
 const before=fs.readFileSync(path.join(core.store.home,'inbox.json'),'utf8');assert.throws(()=>core.ingest([message('bad','x',{context:'x'.repeat(5000)})],'bad-cursor'),/结构超出/);assert.equal(fs.readFileSync(path.join(core.store.home,'inbox.json'),'utf8'),before);
 await configure({dailyLimit:core.status().budget.used});now+=3000;core.ingest([message('quota')],'cursor-quota');await core.drain(new AbortController().signal);assert.equal(calls,3);assert.match(core.status().messages[0].error,/额度/);
 await configure({dailyLimit:30,historyTurns:0});now+=3000;core.ingest([message('zero-history')],'cursor-zero');await core.drain(new AbortController().signal);const state=JSON.parse(fs.readFileSync(core.store.session('owner'),'utf8'));assert.equal(state.history.length,0);
 // Ingest another batch while a model is active: keep the active row identity.
 mode='slow';now+=3000;releasePoll({messages:[message('slow')],cursor:'cursor-slow'});for(let i=0;i<250&&!core.status().active;i++)await tick();assert(core.status().active);core.ingest([message('next')],'cursor-next');await configure({enabled:false});assert.equal(core.status().active,null);assert.equal(core.status().messages.find(r=>r.id==='slow').state,'interrupted');assert.equal(core.status().messages.find(r=>r.id==='next').state,'interrupted');assert.equal(sends.some(r=>r.item.text==='late'),false);
 await assert.rejects(()=>core.configure({revision:0,enabled:true}),/别处/);
 assert.equal(desktopTargets([{name:'测试好友',kind:'private'}])[0].id.length,64);assert.throws(()=>desktopTargets([{name:'重复'},{name:'重复'}]),/重复/);
 assert.throws(()=>officialUrl('http://127.0.0.1:9000'),/未经允许/);assert.throws(()=>officialUrl('https://ilinkai.weixin.qq.com.evil.example'),/未经允许/);
 const key=Buffer.alloc(16,7),audio=Buffer.from('private fixture');assert(crypt(crypt(audio,key),key,true).equals(audio));assert(aesKey(Buffer.from(key.toString('hex')).toString('base64')).equals(key));
 const requests=[],client=createIlinkClient({fetchImpl:async(url,init)=>{requests.push({url:String(url),init});return new Response(JSON.stringify({ret:0}),{headers:{'content-type':'application/json'}});}});await client.send({base:'https://ilinkai.weixin.qq.com',token:'fixture-token'},{peer:'owner',context:'fixture-context',item:{type:'text',text:'fixture'}},new AbortController().signal);assert.equal(requests.length,1);assert.equal(JSON.parse(requests[0].init.body).msg.item_list[0].text_item.text,'fixture');assert.equal(requests[0].init.redirect,'error');
 assert.equal(normalizeIlinkMessage({message_type:1,group_id:'group',from_user_id:'owner'}),null);assert.equal(normalizeIlinkMessage({message_type:1,message_id:'voice',from_user_id:'owner',item_list:[{type:3,voice_item:{text:'转写'}}]}).text,'转写');
 console.log('PASS WeChat: off means no work, allowlists/@ trigger, durable deduplication, ambiguous-send suppression, atomic cursor, budgets, bounded/zero history and stop cancellation');
 console.log('PASS desktop target identity and iLink wire/crypto/origin checks; all models, transports and messages are fixtures');
}finally{await core.close();assert(temp.startsWith(path.join(os.tmpdir(),'xiaoge-wechat-')));fs.rmSync(temp,{recursive:true,force:true});}
