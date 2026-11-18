import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
import {safeLiveText} from './bilibili-live-core.js';
export function createLiveVideoReader({root,reading,secrets=()=>[],spawnImpl=spawn}){
 const read=async(bvid,{signal}={})=>{
   if(!/^BV[a-zA-Z0-9]{10}$/.test(bvid))throw Error('视频编号无效');signal?.throwIfAborted();
   const cached=reading().find(n=>n.bvid===bvid&&n.note);if(cached)return{...cached,source:'reading'};
   const python=path.join(root,'integrations/bilibili-runtime/Scripts/python.exe'),entry=path.join(root,'companion/bilibili-live-reader.py');if(!fs.existsSync(python))throw Error('B站读取环境未安装');
   const result=await new Promise((resolve,reject)=>{
     const child=spawnImpl(python,['-X','utf8',entry],{cwd:path.dirname(entry),windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',settled=false;
     const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
     const abort=()=>{child.kill();finish(signal.reason||Error('读取已取消'));};
     const timer=setTimeout(()=>{child.kill();finish(Error('视频字幕读取超时'));},45000);
     child.stdout.on('data',part=>{output+=part;if(output.length>150000){child.kill();finish(Error('视频内容过大'));}});child.stderr.resume();child.stdin.on('error',()=>{});
     child.once('error',()=>finish(Error('B站读取环境无法启动')));child.once('close',()=>{try{const d=JSON.parse(output);if(!d.ok||d.bvid!==bvid)throw Error();finish(null,d);}catch{finish(Error('没有取得该视频的可读字幕，请检查B站登录或视频字幕'));}});
     signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}child.stdin.end(JSON.stringify({bvid}));
   });
   return{bvid,title:safeLiveText(result.title||bvid,secrets(),120),note:safeLiveText(result.note,secrets(),18000),source:'subtitle',truncated:result.truncated===true};
 };
 function save(content){
   if(!/^BV[a-zA-Z0-9]{10}$/.test(content.bvid))return;
   const note=safeLiveText(content.note,secrets(),900),title=safeLiveText(content.title||content.bvid,secrets(),120);
   // A concise live review must never replace the operator's longer reading note.
   if(reading().some(n=>n.bvid===content.bvid&&n.note))return;
   const file=path.join(root,'companion/bili-native-data/history.jsonl');fs.mkdirSync(path.dirname(file),{recursive:true});
   fs.appendFileSync(file,JSON.stringify({date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date()),ts:Date.now(),bvid:content.bvid,title,note,picked:true,source:'live-request'})+'\n');
 }
 return{read,save};
}
