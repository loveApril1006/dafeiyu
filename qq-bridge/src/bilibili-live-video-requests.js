// Deterministic public commands. Video data is never an instruction to an agent.
import {randomUUID} from 'node:crypto';

const bv=/^BV[a-zA-Z0-9]{10}$/;
export function videoReference(value){
 const text=String(value||'').trim().replace(/[。！!，,；;]+$/u,'');if(bv.test(text))return {bvid:text,target:text};
 let u;try{u=new URL(text);}catch{}if(!u||u.protocol!=='https:'||u.username||u.password||u.port)throw Error('请发送“点评视频 BV号”或B站视频链接');
 if(['www.bilibili.com','bilibili.com','m.bilibili.com'].includes(u.hostname)){const id=/^\/video\/(BV[a-zA-Z0-9]{10})(?:\/|$)/.exec(u.pathname)?.[1];if(id)return {bvid:id,target:id};}
 if(u.hostname==='b23.tv'&&/^\/[a-zA-Z0-9]{4,24}\/?$/.test(u.pathname))return {target:'https://b23.tv'+u.pathname.replace(/\/$/,'')};
 throw Error('请提供B站视频链接、b23.tv短链或BV号');
}
export function parseVideoRequest(text){const match=/^点评视频\s*(?:[+＋:：]\s*)?(.*)$/u.exec(String(text||'').trim());return match?{input:match[1].trim()}:null;}
export async function resolveVideoReference(value,{signal,request=fetch}={}){
 let ref=videoReference(value);for(let count=0;!ref.bvid&&count<3;count++){
   signal?.throwIfAborted();const response=await request(ref.target,{method:'GET',redirect:'manual',headers:{'User-Agent':'Mozilla/5.0'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
   const location=response.headers.get('location');await response.body?.cancel();if(![301,302,303,307,308].includes(response.status)||!location)throw Error('B站短链暂时无法解析，请改发BV号');
   ref=videoReference(new URL(location,ref.target).href);
 }if(!ref.bvid)throw Error('B站短链跳转过多，请改发BV号');return ref.bvid;
}
const wait=(ms,signal)=>new Promise((resolve,reject)=>{signal.throwIfAborted();const cancel=()=>{clearTimeout(timer);reject(signal.reason);},timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});});
export function createLiveVideoRequests({getCore,studio,readVideo,saveReading=()=>{},openTelevision=async()=>{},resolve=resolveVideoReference,clock=()=>Date.now(),sleep=wait}={}){
 let jobs=[],pending=[],current=null,worker=false,closed=false,controller=null,lastAccepted=-Infinity;const users=new Map(),seen=new Map();
 const settings=()=>studio.status().settings;
 const status=()=>({busy:worker,queue:pending.length,current:current?publicJob(current):null,jobs:jobs.slice(-30).reverse().map(publicJob)});
 function publicJob(j){return{id:j.id,bvid:j.bvid||'',user:j.user,state:j.state,message:j.message||'',at:j.at,sessionId:j.sessionId};}
 const mark=(j,state,message='')=>{j.state=state;j.message=message;};
 function notify(event,text){try{getCore().enqueueStudio({text,request:event});}catch{}}
 function ingest(event){
   const parsed=parseVideoRequest(event.text);if(!parsed)return false;const s=getCore().publicFeed(),cfg=settings();
   if(closed||!s.live||s.paused)return true;
   if(!cfg.allowVideoRequests)return true;
   const user=event.uid||event.user,now=clock();if((users.get(user)||0)>now||now-lastAccepted<5000)return true;
   lastAccepted=now;users.set(user,now+cfg.videoRequestCooldownSec*1000);while(users.size>3000)users.delete(users.keys().next().value);
   let ref;try{ref=videoReference(parsed.input);}catch{notify(event,'点播格式：点评视频＋BV号，或发送B站视频链接。');return true;}
   if(pending.length>=5){notify(event,'点播队列暂时满了，请稍后再发送。');return true;}
   if(jobs.some(j=>j.sessionId===s.sessionId&&j.target===ref.target&&!['failed','cancelled'].includes(j.state)&&now-j.at<300000))return true;
   const job={...ref,id:randomUUID(),user:event.user,request:{id:event.id,user:event.user},sessionId:s.sessionId,demo:s.demo,at:now,state:'waiting'};
   lastAccepted=now;pending.push(job);jobs.push(job);jobs=jobs.slice(-40);queueMicrotask(()=>void work());return true;
 }
 function cancel(message='点播已取消'){
   controller?.abort();for(const j of pending)mark(j,'cancelled',message);pending=[];
   if(current&&!['done','failed','cancelled'].includes(current.state))mark(current,'cancelled',message);
   getCore()?.cancelVideo();
 }
 function changed(video){if(!worker&&!pending.length)return;if(current&&video?.requestId===current.id)return;cancel('主播切换或停止视频，已取消排队点播');}
 async function work(){
   if(worker||closed)return;worker=true;
   try{while(pending.length&&!closed){
     const j=current=pending.shift();controller=new AbortController();const signal=controller.signal;let selected;
     const active=()=>{signal.throwIfAborted();const s=getCore().publicFeed();if(!s.live||s.paused||s.sessionId!==j.sessionId||!settings().allowVideoRequests||selected&&!studio.current(selected))throw Error('点播已取消');};
     try{
       active();if(clock()-j.at>600000)throw Error('点播已过期');mark(j,'resolving','正在解析B站视频');
       j.bvid=j.demo?(j.bvid||'BV1234567890'):await resolve(j.target,{signal});active();
       const previous=seen.get(j.bvid);if(previous&&previous.session===j.sessionId&&clock()-previous.at<300000){mark(j,'cancelled','同一视频五分钟内不重复点播');continue;}
       seen.set(j.bvid,{session:j.sessionId,at:clock()});while(seen.size>200)seen.delete(seen.keys().next().value);
       studio.select({bvid:j.bvid,requestId:j.id,demo:j.demo});selected=studio.status().video;mark(j,'reading','正在读取该视频的字幕或已有笔记');
       if(!j.demo)try{await openTelevision();}catch{j.message='桌面电视未打开；已有电视/OBS来源仍可跟随，正在读取内容';}
       active();const content=j.demo?{bvid:j.bvid,title:'弹幕点播本地演练',note:'这是弹幕点播本地演练的示例资料。没有访问真实视频，也不能据此评价真实视频。',source:'demo'}:await readVideo(j.bvid,{signal});active();
       if(content.bvid!==j.bvid||!content.note?.trim())throw Error('没有可读字幕');
       if(!studio.attachReading(selected,content))throw Error('点播已取消');selected=studio.status().video;
       if(!studio.comment({request:j.request}).queued)throw Error('视频点评未能入队');mark(j,'commenting','资料已读，等待大肥鱼点评');
       const deadline=clock()+180000;let output;
       while(!output){active();if(clock()>deadline)throw Error('点评等待超时');output=getCore().publicFeed().messages.find(o=>o.role==='assistant'&&o.video?.revision===selected.revision);if(!output){if(!getCore().videoCommentPending(selected.revision))throw Error('点评未生成');await sleep(250,signal);}}
       active();if(!j.demo)try{saveReading({...content,note:output.text});}catch{j.message='点评已完成，视频笔记保存未完成';}
       mark(j,'playing','点评已完成，正在播放');
       const until=Math.max(clock()+Math.min(60000,getCore().observer().output?.durationMs||15000)+1500,selected.selectedAt+settings().videoRequestPlaySec*1000);
       while(clock()<until){active();await sleep(250,signal);}mark(j,'done','播放与点评已完成');
     }catch(error){
       if(signal.aborted||/取消|过期/.test(error.message))mark(j,'cancelled',j.message||'点播已取消');
       else{const commenting=j.state==='commenting';if(j.bvid)seen.delete(j.bvid);mark(j,'failed','视频读取或点评未完成；可检查B站登录、字幕与模型状态');try{active();notify(j.request,commenting?'视频已切换，但点评暂未生成，请稍后再试。':'这个视频暂时无法读取字幕或对应笔记，可以播放，但我先不编造点评。');}catch{}}
     }finally{controller=null;current=null;}
   }}finally{worker=false;}
 }
 return{ingest,status,cancel,changed,get busy(){return worker;},close(){closed=true;cancel('服务关闭');}};
}
