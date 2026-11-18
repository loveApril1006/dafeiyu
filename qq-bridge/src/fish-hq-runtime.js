// SPDX-License-Identifier: MIT
import fs from 'node:fs';
import path from 'node:path';
const liveStates=new Set(['queued','resolving','starting','running','waiting','stopping','processing','generating']);
const stateNames={queued:'等待处理',resolving:'读取资料',starting:'准备开始',running:'正在处理',waiting:'等待回应',stopping:'正在停止',processing:'正在处理',generating:'正在生成'};
// Local receipts only. Never starts a model, platform request or service.
export function createHeadquartersRuntime({root,getLiveTasks=()=>[],now=Date.now}={}){
 const cache=new Map();
 function read(rel){if(!root)return{};try{const file=path.join(root,rel),stat=fs.statSync(file);if(stat.size>2*1024*1024)return{};const version=stat.size+':'+stat.mtimeMs;if(cache.get(rel)?.version===version)return cache.get(rel).value;const value=JSON.parse(fs.readFileSync(file,'utf8'));cache.set(rel,{version,value});return value;}catch{return{};}}
 return()=>{
  let current=[];try{current=getLiveTasks()||[];}catch{}
  const rows=current.slice(0,12).map(t=>({source:t.source,state:stateNames[t.state]||'正在处理',label:({qq:'处理聊天',creative:'创作进行中',qzone:'整理空间',live:'直播互动'})[t.source]||'处理任务',startedAt:Number(t.startedAt)||0,completed:null,total:null,unit:'',count:Math.max(1,Math.min(1000,Number(t.count)||1))}));
  for(const[rel,source,label]of [['state/bilibili-chat/jobs.json','bilibili','B站观看任务'],['state/harness-control/jobs.json','harness','生活事务任务'],['companion/creative-data/songs/jobs.json','creative','歌曲创作']]){
   const data=read(rel);for(const job of (Array.isArray(data.jobs)?data.jobs:[]).slice(-30)){
    const state=job.state||job.status,at=Number(job.startedAt||job.updatedAt)||Date.parse(job.startedAt||job.updatedAt)||0;
    if(!liveStates.has(state)||!at||now()-at>6*3600000||at>now()+60000)continue;
    const measurable=source==='bilibili'&&Number.isFinite(job.plannedRounds)&&job.plannedRounds>0&&Number.isFinite(job.finishedRounds);
    rows.push({source,label,state:stateNames[state],startedAt:at,completed:measurable?Math.max(0,Math.min(job.plannedRounds,job.finishedRounds)):null,total:measurable?job.plannedRounds:null,unit:measurable?'轮':'',count:1});
   }
  }
  return rows.slice(0,16);
 };
}
