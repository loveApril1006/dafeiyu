// No SDK or platform protocol here: {poll,send,download,status} is the driver contract.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {openWechatStore,readJson,writeJson,identifier,hash,cleanError} from './store.js';
import {imageKind} from '../creative-store.js';
const DEFAULTS={revision:0,enabled:false,autoReply:true,images:false,files:false,voiceTranscript:true,dailyLimit:30,historyTurns:6,maxInputChars:4000,maxReplyChars:1500,cooldownSeconds:8,allowUsers:[],allowGroups:[],groupMentionOnly:true};
export function createWechatCore({root,driver,model,harden=true,now=()=>Date.now()}){
 const store=openWechatStore(root,{harden}),configFile='settings.json';let config={...DEFAULTS,...store.read(configFile,{})};
 let journal=store.read('inbox.json',{cursor:'',rows:[],seen:[]}),controller=null,loop=null,draining=null,active=null,manual=null,closed=false,mutating=false,lastError='',lastPollAt=0,failures=0;
 if(!Array.isArray(journal.rows)||!Array.isArray(journal.seen))throw Error('微信收件记录损坏，原文件已保留');
 for(const row of journal.rows)if(['running','sending'].includes(row.state)){row.state=row.state==='sending'?'uncertain':'interrupted';row.error='上次运行中断，未自动重试';}
 const persist=()=>{journal.rows=journal.rows.slice(-100);journal.seen=journal.seen.slice(-2000);store.write('inbox.json',journal);};persist();
 const budget=()=>{const date=new Date(now()).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),value=store.read('daily.json',{date,used:0});return value.date===date?value:{date,used:0};};
 function consume(){const b=budget();if(b.used>=config.dailyLimit)throw Error('微信今日模型任务额度已用完');b.used++;store.write('daily.json',b);}
 const session=peer=>readJson(store.session(peer),{history:[],updatedAt:0,lastModelAt:0});
 const account=()=>driver.status();
 function allowed(message){if(message.kind==='group')return config.allowGroups.includes(message.peer)&&(!config.groupMentionOnly||message.mentioned===true);const bound=account().owner;return message.peer===bound||config.allowUsers.includes(message.peer);}
 function safeRow(row){return {id:row.id,peer:row.peer,kind:row.kind,state:row.state,at:row.at,preview:row.text?.slice(0,120)||'[附件]',reply:row.reply?.slice(0,200)||'',error:row.error||''};}
 function status(){return {ok:true,config:structuredClone(config),connection:{...account(),running:!!loop,failures,lastError,lastPollAt},budget:budget(),pending:journal.rows.filter(r=>r.state==='pending').length,active:active?{id:active.id,peer:active.peer}:null,messages:journal.rows.slice(-40).reverse().map(safeRow)};}
 function check(signal){signal?.throwIfAborted();if(!config.enabled||closed)throw Error('微信通道已关闭');}
 async function applyConfig(patch){
  if(patch.revision!==config.revision)throw Object.assign(Error('设置已在别处更新，请刷新后保存'),{status:409});const next=structuredClone(config);
  for(const key of ['enabled','autoReply','images','files','voiceTranscript','groupMentionOnly'])if(Object.hasOwn(patch,key)){if(typeof patch[key]!=='boolean')throw Error('开关格式无效');next[key]=patch[key];}
  for(const [key,min,max] of [['dailyLimit',0,1000],['historyTurns',0,8],['maxInputChars',100,6000],['maxReplyChars',100,3000],['cooldownSeconds',2,300]])if(Object.hasOwn(patch,key)){if(!Number.isInteger(patch[key])||patch[key]<min||patch[key]>max)throw Error('额度或长度设置超出范围');next[key]=patch[key];}
  for(const key of ['allowUsers','allowGroups'])if(Object.hasOwn(patch,key)){if(!Array.isArray(patch[key])||patch[key].length>32)throw Error('允许名单最多32项');next[key]=[...new Set(patch[key].map(identifier))];}
  if(next.enabled&&!account().ready)throw Error(account().diagnostic?.reason||'微信驱动尚未就绪，请先完成名单和兼容性诊断');
  const mustStop=config.enabled&&(!next.enabled||next.autoReply!==config.autoReply||JSON.stringify([next.allowUsers,next.allowGroups])!==JSON.stringify([config.allowUsers,config.allowGroups]));
  next.revision++;store.write(configFile,next);config=next;if(mustStop)await stop();
  if(config.enabled&&!loop)try{await start();}catch(error){config.enabled=false;config.revision++;store.write(configFile,config);throw error;}return status();
 }
 async function configure(patch){if(mutating)throw Object.assign(Error('微信设置正在更新，请稍后再试'),{status:409});mutating=true;try{return await applyConfig(patch);}finally{mutating=false;}}
 function ingest(messages,cursor){
  if(!Array.isArray(messages)||messages.length>200)throw Error('微信返回消息数量异常');
  const previous=journal,journalNext={cursor:journal.cursor,rows:[...journal.rows],seen:[...journal.seen]},seen=new Set(journal.seen);let pending=journal.rows.filter(r=>r.state==='pending').length;
  // Do not advance the upstream cursor if durable inbox capacity is exhausted.
  const fresh=messages.filter(m=>m&&m.id&&!seen.has(String(m.id))&&allowed(m));if(pending+fresh.length>16)throw Error('微信待处理队列已满，等待当前任务完成后继续收取');
  for(const message of messages){
   if(!message||typeof message.id!=='string'||message.id.length>200||!message.id||seen.has(message.id))continue;
   identifier(message.peer);journalNext.seen.push(message.id);seen.add(message.id);
   if(!allowed(message))continue;
   if(message.attachments&&!Array.isArray(message.attachments))throw Error('微信附件列表无效');
   const text=String(message.text||'').slice(0,config.maxInputChars),row={id:message.id,peer:message.peer,kind:message.kind==='group'?'group':'private',mentioned:message.mentioned===true,text,at:now(),state:config.autoReply?'pending':'received',context:String(message.context||''),attachments:(message.attachments||[]).slice(0,3),voice:message.voice===true};
   if(row.context.length>4096||JSON.stringify(row.attachments).length>30000)throw Error('微信消息结构超出限制');journalNext.rows.push(row);
  }
  if(typeof cursor==='string'&&cursor.length<=65536&&cursor)journalNext.cursor=cursor;journal=journalNext;try{persist();}catch(error){journal=previous;throw error;}
 }
 async function reply(row,text,signal){
  check(signal);if(!allowed(row))throw Error('此会话已不在允许名单');
  text=String(text).trim().slice(0,config.maxReplyChars);if(!text)throw Error('回复为空');
  row.state='sending';row.reply=text;row.outboundId||=randomUUID();persist();
  try{await driver.send({peer:row.peer,context:row.context,item:{type:'text',text},clientId:row.outboundId},signal);check(signal);row.state='replied';persist();}
  catch(error){row.state='uncertain';row.error='发送失败或结果未确认，未自动重发';persist();throw error;}
 }
 async function materialize(row,signal){
  const images=[],notes=[];
  for(const item of row.attachments){
   check(signal);if(item.type==='image'&&!config.images){notes.push('用户附带图片；图片理解开关未开启。');continue;}
   if(item.type==='file'&&!config.files){notes.push('用户附带文件；文件读取开关未开启。');continue;}
   if(!['image','file'].includes(item.type))continue;
   const bytes=await driver.download(item,signal);check(signal);if(!bytes?.length||bytes.length>8*1024*1024)throw Error('微信附件为空或超过8MB');
   if(item.type==='image'){if(!imageKind(bytes))throw Error('微信图片格式无效');images.push(bytes);}
   else{const name=path.basename(String(item.name||'附件').replaceAll('\\','/')).slice(0,100);if(/\.(txt|md|csv|json|log)$/i.test(name))notes.push('文件 '+name+'（最多前6000字符）：\n'+bytes.toString('utf8').slice(0,6000));else notes.push('收到文件 '+name+'，当前只支持读取txt/md/csv/json/log文本附件。');}
  }
  return {images,notes};
 }
 async function processRow(row,signal){
  check(signal);if(!allowed(row)){row.state='ignored';persist();return;}
  row.state='running';persist();const data=session(row.peer);
  if(/^\/(help|帮助)$/i.test(row.text)){await reply(row,'大肥鱼微信：当前支持文字聊天；/new 清空此微信会话的上下文；/status 查看状态。回复开关和额度可在机器人后台配置。',signal);return;}
  if(/^\/(new|reset)$/i.test(row.text)){writeJson(store.session(row.peer),{history:[],updatedAt:now(),lastModelAt:0});await reply(row,'已清空当前微信会话的上下文。',signal);return;}
  if(/^\/status$/i.test(row.text)){const b=budget();await reply(row,'大肥鱼微信在线。今日模型任务 '+b.used+'/'+config.dailyLimit+'；上下文最多 '+config.historyTurns+' 轮。',signal);return;}
  if(row.voice&&!config.voiceTranscript)throw Error('语音转写入口已关闭');
  if(data.lastModelAt&&now()-data.lastModelAt<config.cooldownSeconds*1000)throw Error('微信消息过于频繁，本条未调用模型');
  if(!row.text&&!row.attachments.length)throw Error('没有可处理的文字或附件');
  const media=await materialize(row,signal);check(signal);
  if(!row.text&&!media.images.length&&!media.notes.some(n=>n.includes('最多前6000字符')))throw Error(media.notes.join('；')||'当前消息没有可处理内容');
  consume();data.lastModelAt=now();writeJson(store.session(row.peer),data);
  let history=config.historyTurns?data.history.slice(-config.historyTurns*2):[];while(JSON.stringify(history).length>6000)history.shift();
  const text=await model({text:row.text,history,images:media.images,notes:media.notes,peer:row.peer,workspace:path.join(store.home,'workspaces',hash(row.peer))},signal);check(signal);
  await reply(row,text,signal);data.history=[...history,{role:'user',text:row.text||'[附件]'},{role:'assistant',text:String(text).slice(0,config.maxReplyChars)}].slice(-config.historyTurns*2);if(!config.historyTurns)data.history=[];data.updatedAt=now();writeJson(store.session(row.peer),data);
 }
 async function drain(signal){
  if(draining)return draining;draining=(async()=>{while(!signal.aborted&&config.enabled&&config.autoReply&&!manual){const row=journal.rows.find(r=>r.state==='pending');if(!row)break;active=row;try{await processRow(row,signal);}catch(error){if(!['uncertain','replied'].includes(row.state))row.state=signal.aborted?'interrupted':'failed';row.error=cleanError(error);persist();}finally{active=null;}}})().catch(error=>{lastError=cleanError(error);controller?.abort(error);}).finally(()=>{draining=null;});return draining;
 }
 async function start(){
  if(closed||!config.enabled||loop)return;if(!account().ready)throw Error(account().diagnostic?.reason||account().requires||'微信连接尚未就绪');await driver.open?.();
  controller=new AbortController();const signal=controller.signal;
  loop=(async()=>{void drain(signal);while(!signal.aborted&&config.enabled){try{
   const result=await driver.poll(journal.cursor,signal);check(signal);ingest(result.messages,result.cursor);lastPollAt=now();lastError='';failures=0;void drain(signal);
   // A fast empty response must not turn into a hot loop.
   await delay(Math.max(1000,Math.min(Number(result.delayMs)||1000,60000)),undefined,{signal});
  }catch(error){if(signal.aborted)break;lastError=cleanError(error);failures++;if(error.code==='AUTH_EXPIRED'){lastError='微信登录已失效，请重新绑定';break;}await delay(Math.min(60000,2000*2**Math.min(failures,5)),undefined,{signal}).catch(()=>{});}}})().finally(()=>{loop=null;controller=null;});
 }
 async function stop(){controller?.abort(Error('微信通道已关闭或设置已变化'));manual?.abort(Error('微信通道已关闭'));for(const row of journal.rows)if(row.state==='pending'){row.state='interrupted';row.error='通道停止，未自动重试';}persist();await Promise.all([loop,draining,driver.stop?.()]);}
 async function sendManual({peer,text,type='text',base64,name},signal){
  check(signal);if(active||manual)throw Error('微信正在处理任务，请稍后再发送');peer=identifier(peer);const row=[...journal.rows].reverse().find(r=>r.peer===peer&&now()-r.at<24*3600000&&r.context);if(!row||!allowed(row))throw Error('请先由允许的微信会话发来一条消息，再从后台回复');
  if(type==='image'&&!config.images)throw Error('微信图片开关已关闭');
  if(type==='file'&&!config.files)throw Error('微信文件开关已关闭');
  const item=type==='text'?{type,text:String(text||'').trim().slice(0,config.maxReplyChars)}:{type,bytes:Buffer.from(String(base64||''),'base64'),name:String(name||'附件').slice(0,100)};
  if(type==='text'&&!item.text)throw Error('请填写回复内容');
  if(!['text','image','file'].includes(type)||item.bytes?.length>8*1024*1024||item.bytes?.length===0)throw Error('附件类型无效或超过8MB');
  if(type==='image'&&!imageKind(item.bytes))throw Error('图片格式无效');
  manual=new AbortController();signal=signal?AbortSignal.any([signal,manual.signal]):manual.signal;
  const record={id:randomUUID(),peer,kind:row.kind,text:'[后台手动发送]',state:'sending',at:now(),context:row.context};journal.rows.push(record);persist();
  try{await driver.send({peer,context:row.context,item,clientId:record.id},signal);check(signal);record.state='replied';record.reply=type==='text'?item.text:'['+type+']';persist();return status();}catch(error){record.state='uncertain';record.error=cleanError(error);persist();throw error;}finally{manual=null;}
 }
 async function clearSession(peer){identifier(peer);if(active?.peer===peer)throw Error('此会话正在处理，请先停止通道');writeJson(store.session(peer),{history:[],updatedAt:now(),lastModelAt:0});return status();}
 return {store,status,configure,start,stop,ingest,drain,sendManual,clearSession,close:async()=>{closed=true;await stop();await driver.close?.();}};
}
