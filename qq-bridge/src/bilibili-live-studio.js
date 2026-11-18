// Approved local pictures + a BV-bound television. No arbitrary remote URL fetching.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {safeLiveText} from './bilibili-live-core.js';
const idRE=/^[a-f0-9-]{36}$/;
const defaults={displayName:'大肥鱼',hostName:'大肥鱼',autoFollow:false,autoComment:false,commentDelaySec:20,allowVideoRequests:true,videoRequestCooldownSec:60,videoRequestPlaySec:45};
function save(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);}
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw Error('直播浮窗数据无法读取，请检查原文件');}}
function bvid(value){const input=String(value||'').trim();if(/^BV[a-zA-Z0-9]{10}$/.test(input))return input;let u;try{u=new URL(input);}catch{}if(u?.protocol==='https:'&&['www.bilibili.com','bilibili.com'].includes(u.hostname)){const m=/^\/video\/(BV[a-zA-Z0-9]{10})(?:\/|$)/.exec(u.pathname);if(m)return m[1];}throw Error('请填写有效BV号或B站视频链接');}
function imageType(bytes){
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(16)<=8192&&bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(20)<=8192)return 'image/png';
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[bytes.length-2]===255&&bytes.at(-1)===217)return 'image/jpeg';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length)return 'image/webp';
 if(bytes.length>=14&&/^GIF8[79]a$/.test(bytes.toString('ascii',0,6))&&bytes.readUInt16LE(6)>0&&bytes.readUInt16LE(8)>0&&bytes.readUInt16LE(6)<=8192&&bytes.readUInt16LE(8)<=8192&&bytes.at(-1)===59)return 'image/gif';
 throw Error('图片格式无效，仅支持PNG、JPEG、WebP或GIF');
}
export function createLiveStudio({home,getCore,reading,secrets=()=>[],clock=()=>Date.now(),autoTick=true,onVideoChange=()=>{},autoFollowBlocked=()=>false}){
 const file=path.join(home,'studio.json'),imageHome=path.join(home,'images'),indexFile=path.join(imageHome,'index.json');fs.mkdirSync(imageHome,{recursive:true});
 let settings={...defaults,...read(file,{})},library=read(indexFile,[]),video=null,timer,closed=false,armed=false,readingAt=0,notes=[],seen=new Set(),submitted=new Set();
 // Playback is deliberately ephemeral; restarting the app never resumes public media or commentary.
 function configure(patch={}){
   const next={...settings};if('displayName'in patch)next.displayName=safeLiveText(patch.displayName,secrets(),18);
   if('hostName'in patch)next.hostName=safeLiveText(patch.hostName,secrets(),18);
   for(const k of ['autoFollow','autoComment','allowVideoRequests'])if(k in patch){if(typeof patch[k]!=='boolean')throw Error('直播浮窗开关需要布尔值');next[k]=patch[k];}
   for(const [k,min,max]of [['videoRequestCooldownSec',10,600],['videoRequestPlaySec',15,300]])if(k in patch){const v=Number(patch[k]);if(!Number.isInteger(v)||v<min||v>max)throw Error('视频点播间隔超出允许范围');next[k]=v;}
   if('commentDelaySec'in patch){const v=Number(patch.commentDelaySec);if(!Number.isInteger(v)||v<10||v>120)throw Error('视频点评等待时间需要10～120秒');next.commentDelaySec=v;}
   if('autoFollow'in patch&&next.autoFollow){armed=true;if(!settings.autoFollow)seen.clear();}settings=next;save(file,settings);return status();
 }
 function images(){return library.map(({id,label,tags,mime,size})=>({id,label,tags,mime,size}));}
 function imageFile(id){if(!idRE.test(String(id)))throw Error('图片编号无效');const row=library.find(r=>r.id===id);if(!row)return null;return {...row,file:path.join(imageHome,id+'.image')};}
 function upload({dataUrl,label='图片',tags=''}={}){
   if(library.length>=40)throw Error('图库最多40张，请先删除不用的图片');
   const match=/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl||''));if(!match||match[2].length>720000)throw Error('图片需要PNG、JPEG、WebP或GIF，大小不超过512KB');
   const bytes=Buffer.from(match[2],'base64');if(bytes.length>512*1024||bytes.toString('base64')!==match[2])throw Error('图片超过512KB或编码无效');const mime=imageType(bytes);if(mime!==match[1])throw Error('图片格式与内容不符');
   const row={id:randomUUID(),label:safeLiveText(label||'图片',secrets(),40),tags:tags?safeLiveText(String(tags),secrets(),100):'',mime,size:bytes.length};
   fs.writeFileSync(path.join(imageHome,row.id+'.image'),bytes,{flag:'wx'});library.push(row);save(indexFile,library);return row;
 }
 function remove(id){const row=imageFile(id);if(!row)throw Error('图片不存在');library=library.filter(i=>i.id!==id);save(indexFile,library);try{fs.unlinkSync(row.file);}catch(e){if(e.code!=='ENOENT')throw e;}return images();}
 function cleanNote(value,max=900){if(!value)return '';try{return safeLiveText(value,secrets(),max);}catch{return '';}}
 function select(input={}){
   const id=bvid(input.bvid),note=reading().find(n=>n.bvid===id),title=safeLiveText(note?.title||input.title||id,secrets(),120);
   const current={bvid:id,title,note:cleanNote(note?.note),source:input.requestId?'viewer':note?'reading':'manual',selectedAt:clock(),revision:randomUUID(),playId:randomUUID(),enabled:true,...(input.requestId?{requestId:input.requestId,demo:input.demo===true}:{})};
   getCore()?.cancelVideo();armed=true;video=current;seen.add(id);onVideoChange(video);return status();
 }
 function setVideo({enabled,...input}={}){if(input.bvid)return select(input);if(typeof enabled!=='boolean')throw Error('请填写视频或选择开启/关闭小电视');if(enabled&&!video)throw Error('请先选择小电视播放的视频');getCore()?.cancelVideo();armed=enabled;if(video){video={...video,enabled,requestId:undefined,revision:randomUUID(),playId:randomUUID(),selectedAt:clock()};}onVideoChange(video);return status();}
 const current=expected=>!!video?.enabled&&expected?.bvid===video.bvid&&expected?.revision===video.revision;
 function attachReading(expected,content){if(!current(expected)||content.bvid!==video.bvid)return false;const note=cleanNote(content.note,18000);if(!note)return false;video={...video,title:safeLiveText(content.title||video.title,secrets(),120),note,noteSource:content.source||'reading'};return true;}
 function comment({request=null}={}){if(!video?.enabled||!video.note)throw Error('请先选择已生成阅读笔记的视频，再进行点评');const accepted=getCore().enqueueStudio({video:{...video},request});if(accepted)submitted.add(video.revision);return {ok:true,queued:accepted};}
 function state(){const core=getCore();return {settings:{...settings},video:video?{...video,note:undefined}:null,commentary:video?(core?.publicFeed().messages||[]).findLast(o=>o.role==='assistant'&&o.video?.revision===video.revision)?.text||'':'',hasNote:!!video?.note};}
 function status(){return {ok:true,...state(),images:images()};}
 function publicState(){const {settings,video,commentary}=state();return {displayName:settings.displayName,hostName:settings.hostName,video,commentary};}
 function publicImage(id){return !!getCore()?.publicFeed().messages.some(m=>m.role==='assistant'&&m.imageId===id);}
 function tick(){
   if(closed)return;const core=getCore();if(!core)return;
   if(clock()-readingAt>=5000){readingAt=clock();notes=reading();if(armed&&settings.autoFollow&&!autoFollowBlocked()){const fresh=notes.find(n=>!seen.has(n.bvid));for(const n of notes)seen.add(n.bvid);while(seen.size>200)seen.delete(seen.values().next().value);if(fresh)select({bvid:fresh.bvid});}}
   const s=core.publicFeed();if(settings.autoComment&&!autoFollowBlocked()&&s.live&&!s.paused&&video?.enabled&&video.note&&!submitted.has(video.revision)&&clock()-video.selectedAt>=settings.commentDelaySec*1000){try{comment();}catch{}}
   if(submitted.size>200)submitted.delete(submitted.values().next().value);
 }
 function stopVideo(){armed=false;getCore()?.cancelVideo();if(video)video={...video,enabled:false,requestId:undefined,revision:randomUUID()};onVideoChange(video);}
 function close(){closed=true;clearInterval(timer);stopVideo();}
 if(autoTick){timer=setInterval(()=>{try{tick();}catch{}},2000);timer.unref?.();}
 return {configure,status,images,upload,remove,imageFile,select,setVideo,current,comment,attachReading,tick,publicState,publicImage,stopVideo,close};
}
