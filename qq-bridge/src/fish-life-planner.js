// SPDX-License-Identifier: MIT
import {createHash} from 'node:crypto';
import {HQ_ROOMS} from './fish-hq-layout.js';
import {HQ_FURNITURE,LIFE_ACTIVITIES} from './fish-hq-furniture.js';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function createFishLifePlanner({ocean,getHome,getOwner,getRole,now=Date.now,redact=String}={}){
 let inFlight=null;const scope=()=>/^[1-9]\d*$/.test(String(getOwner()||''))?'private:'+getOwner():'',store=()=> 'fish-life-plan:'+ocean.role(),attempt=()=> 'fish-life-attempt:'+ocean.role();
 const clean=(v,n)=>String(redact(String(v||''))).replace(/[\x00-\x1f]/g,' ').toWellFormed().slice(0,n);
 function state(){const p=ocean.meta.get(store());if(!p||p.key!==scope()||p.revision!==(getRole().revision||'')||p.expiresAt<=now())return null;const n=ocean.db.prepare('SELECT * FROM ocean_nodes WHERE id=? AND role=? AND channel=? AND deleted=0 AND edited=0').get(p.nodeId,ocean.role(),scope());if(!n||!ocean.recallAllowed(n))return null;if((p.messageIds||[]).some(id=>!ocean.evidenceAllowed(scope(),{id})))return null;return p;}
 function input(key){if(!scope()||key!==scope())return null;const h=getHome().state();return{current:h.activity.kind,automaticLife:h.home.auto,vitals:Object.fromEntries(h.vitals.values.map(v=>[v.id,v.value])),allowedActivities:LIFE_ACTIVITIES,rooms:HQ_ROOMS.map(r=>({id:r.id,name:r.name,furniture:HQ_FURNITURE.filter(f=>f.room===r.id).map(f=>f.id)})),rules:'只选择虚拟家园活动。真实任务与手动安排优先。不启动平台、不发布、不发消息、不改变人格关系。房间想法是主观计划，不是完成记录。'};}
 function apply(key,value,source={}){
  if(key!==scope()||!value||typeof value!=='object'||Array.isArray(value)||!LIFE_ACTIVITIES.includes(value.activity)||typeof value.reason!=='string'||!value.reason.trim()||!Array.isArray(value.rooms)||value.rooms.length>8)return null;
  const seen=new Set(),rooms=[];for(const r of value.rooms){if(!r||!HQ_ROOMS.some(x=>x.id===r.id)||seen.has(r.id)||!['calm','focused','playful'].includes(r.ambience)||typeof r.thought!=='string')return null;seen.add(r.id);rooms.push({id:r.id,ambience:r.ambience,thought:clean(r.thought,70)});}
  const focus=HQ_FURNITURE.find(f=>f.id===value.focusFurniture),plan={activity:value.activity,reason:clean(value.reason,120),rooms,focusFurniture:focus?.id||null,key,revision:getRole().revision||'',at:now(),expiresAt:now()+30*60000,messageIds:source.messageIds||[]};
  const n=ocean.upsert(key,{sourceKey:'life-plan:'+source.id,kind:'thought',title:'肥鱼的生活想法',body:'【模型生成的虚拟生活计划，并非已完成事实】'+JSON.stringify({activity:plan.activity,reason:plan.reason,rooms}),origin:'autonomy',confidence:'inferred',importance:.25,stamp:now(),meta:{job:source.id,virtual:true,lifePlan:true,subjective:true,reviewIds:source.reviewIds||[],experienceIds:source.experienceIds||[]}});
  for(const id of plan.messageIds)ocean.db.prepare('INSERT OR IGNORE INTO ocean_refs VALUES(?,?)').run(n.id,id);ocean.meta.set(store(),{...plan,nodeId:n.id});return n.id;
 }
 function fingerprint(){const key=scope(),role=ocean.role();return sha([role,getRole().revision,key,ocean.db.prepare("SELECT max(updated) n,max(seq) s FROM ocean_nodes WHERE channel=? AND role=? AND deleted=0 AND origin!='autonomy'").get(key,role),Math.floor(now()/(4*3600000))]);}
 async function request(input,run){const h=getHome().state();if(input.role!==h.role||input.roleRevision!==h.roleRevision)throw Object.assign(Error('人格已变化，请刷新后再想一想'),{statusCode:409});if(!scope())throw Object.assign(Error('请先设置管理员'),{statusCode:400});if(inFlight)return inFlight;
  const id=fingerprint(),old=ocean.meta.get(attempt());if(old?.fingerprint===id)return{ok:true,skipped:true,reason:'没有新的经历，沿用现有想法'};if(old&&now()-old.at<15*60000)return{ok:true,skipped:true,reason:'刚刚已经想过，先让生活继续一会儿'};
  const role=ocean.role();inFlight=(async()=>{ocean.meta.set(attempt(),{fingerprint:id,at:now()});try{const result=await run({key:scope(),manual:true});return{...result,reason:result.deferred?result.reason:result.ok?'已整理新的生活想法':'本次思考未完成，暂不重复请求'};}finally{inFlight=null;}})();return inFlight;
 }
 return{state,input,apply,request};
}
