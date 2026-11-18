import fs from 'node:fs';
import path from 'node:path';

// Observe existing local state only. Reading does not launch a player or create an experience.
export function createFishHomeRuntime({root,now=Date.now,getRuntime=()=>null}={}){
 const cache=new Map();
 function read(rel){try{const file=path.join(root,rel),s=fs.statSync(file),v=s.mtimeMs+':'+s.size;if(s.size>4*1024*1024)return{};if(cache.get(rel)?.v===v)return cache.get(rel).data;const data=JSON.parse(fs.readFileSync(file,'utf8'));cache.set(rel,{v,data});return data;}catch{return{};}}
 return()=>{
  try{const live=getRuntime();if(live)return live;}catch{}
  const stamp=v=>typeof v==='number'?v:Date.parse(v)||0,alive=pid=>{try{if(!Number.isSafeInteger(pid)||pid<1)return false;process.kill(pid,0);return true;}catch{return false;}},recent=(r,time)=>time>0&&time<=now()+60000&&now()-time<6*3600000;
  for(const[rel,source,kind,title]of [
   ['state/bilibili-chat/jobs.json','bilibili','watch','在电脑前看 B站资料'],
   ['state/harness-control/jobs.json','harness','work','在电脑前处理任务']
  ]){const d=read(rel),r=(d.jobs||[]).find(j=>['running','starting','resolving','waiting','queued'].includes(j.state)&&recent(j,stamp(j.updatedAt||j.startedAt||j.createdAt)));if(r)return{kind,source,title,reason:'对应功能正在运行，显示实际活动状态',id:String(r.id),key:r.key||'',active:true};}
  const manual=read('companion/douyin-data/state/watch-manual.lock');
  if(alive(manual.pid))return{kind:'watch',source:'douyin',title:'在电脑前处理抖音互动',reason:'手动互动任务正在运行',id:'douyin-manual',active:true};
  const watch=read('companion/douyin-data/state/watch-loop.lock');
  if(watch.status==='running'&&alive(watch.pid)&&now()-stamp(watch.heartbeatAt)<15000&&stamp(watch.heartbeatAt)<=now()+1000)return{kind:'watch',source:'douyin',title:'在电脑前看抖音',reason:'自主观看正在运行',id:'douyin-watch',active:true};
  return null;
 };
}
