import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {readJson,writeJson} from './creative-store.js';
const pendingStates=['submitted','generated','download-failed','uncertain','ready'];
export function createImageJobs(home){
 const file=path.join(home,'image-jobs.json');
 const load=()=>{const rows=readJson(file,[]);if(!Array.isArray(rows)||rows.length>200)throw Error('生图回执记录无效，已停止新请求');return rows;};
 function update(id,patch){const rows=load(),row=rows.find(r=>r.id===id);if(!row)throw Error('生图任务不存在');Object.assign(row,patch,{updatedAt:Date.now()});writeJson(file,rows);return row;}
 function start(scope,prompt,baseURL,parameters={}){const rows=load();if(rows.length>=200)throw Error('生图记录已达200条，请在后台清理已完成任务后再生成');const row={id:randomUUID(),scope,prompt,baseURL,parameters,state:'submitted',createdAt:Date.now(),updatedAt:Date.now()};rows.unshift(row);writeJson(file,rows);return row;}
 function pending(scope){return load().find(r=>r.scope===scope&&pendingStates.includes(r.state));}
 function list(scope='console'){const gallery=readJson(path.join(home,'gallery.json'),[]);return load().filter(r=>scope==='console'||r.scope===scope).map(({url,baseURL,...row})=>{const returned=row.providerResultAt||(row.expiresAt?row.expiresAt-55*60000:null),downloaded=row.downloadedAt||Date.parse(gallery.find(g=>g.id===row.imageId)?.at)||null,sent=row.deliveredAt||(row.state==='delivered'?row.updatedAt:null);return {...row,prompt:row.prompt.slice(0,120),recoverable:!!url&&row.expiresAt>Date.now(),expired:!!url&&row.expiresAt<=Date.now(),timing:{providerMs:returned?Math.max(0,returned-row.createdAt):null,downloadMs:downloaded&&returned?Math.max(0,downloaded-returned):null,sendMs:sent&&downloaded?Math.max(0,sent-downloaded):null,totalMs:sent?Math.max(0,sent-row.createdAt):null}};});}
 function find(id,scope){return load().find(r=>r.id===id&&(scope==='console'||r.scope===scope));}
 function receipt(id,{url,traceId,inferenceSeconds}){if(typeof url!=='string'||url.length>12000)return;const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('生图返回了无效图片地址');return update(id,{url,state:'generated',providerResultAt:Date.now(),inferenceSeconds,expiresAt:Date.now()+55*60000,traceId:String(traceId||'').slice(0,100)});}
 function abandon(id){const row=find(id,'console');if(!row)throw Error('生图任务不存在');return update(id,{state:'abandoned',url:undefined,error:''});}
 function prune(){const rows=load();writeJson(file,rows.filter(r=>pendingStates.includes(r.state)));}
 return {start,update,pending,list,find,receipt,abandon,prune,delivered:id=>update(id,{state:'delivered',deliveredAt:Date.now(),url:undefined,error:''})};
}
