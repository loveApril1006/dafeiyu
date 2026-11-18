// SPDX-License-Identifier: MIT
import {HQ_ROOMS,activityRoom} from './fish-hq-layout.js';
import {createHeadquartersRuntime} from './fish-hq-runtime.js';
import {furnitureStates} from './fish-hq-furniture.js';
const sourceRoom={qq:'chat',bilibili:'media',douyin:'media',creative:'creative',qzone:'qzone',live:'live',harness:'affairs'};
// This view observes existing systems. It never starts a model, task or publisher.
export function createFishHeadquarters({root,getHome,getOcean,getActivities,getHistory,getConnection=()=>({}),getLiveTasks=()=>[],getLifeStatus=()=>({plan:null}),now=Date.now}={}){
 let last=null,until=0;const runtime=createHeadquartersRuntime({root,getLiveTasks,now});
 function snapshot(){const home=getHome().state(),ocean=getOcean(),activities=getActivities().status(),key=home.scope,role=ocean.role(),stats=ocean.stats();let pending=0;
  if(key)pending=ocean.db.prepare("SELECT count(*) n FROM ocean_memos m JOIN ocean_nodes n ON n.id=m.node_id WHERE m.role=? AND m.channel=? AND m.deleted=0 AND n.deleted=0 AND m.state='pending' AND m.kind!='diary'").get(role,key).n;
  let connection={};try{connection=getConnection()||{};}catch{}
  if(!last||now()>until){last={messages:getHistory()?.stats().messages||0};until=now()+15000;}
  const active=activityRoom(home.activity),source=id=>activities.sources.find(s=>s.id===id),count=id=>source(id)?.count||0,tasks=runtime();
  const memos=key?ocean.db.prepare("SELECT m.node_id id,n.title,m.due_at dueAt FROM ocean_memos m JOIN ocean_nodes n ON n.id=m.node_id WHERE m.role=? AND m.channel=? AND m.deleted=0 AND n.deleted=0 AND m.state='pending' AND m.kind!='diary' ORDER BY m.due_at IS NULL,m.due_at,m.seq DESC LIMIT 4").all(role,key):[];
  if(home.activity.linked&&!tasks.some(t=>sourceRoom[t.source]===active))tasks.push({source:home.activity.source,label:'真实功能活动',state:'正在进行',completed:null,total:null,count:1});
  const schedule=home.home.manual&&home.home.manual.until>now()?{kind:home.home.manual.kind,until:home.home.manual.until,duration:home.home.manual.kind==='sleep'?3600000:600000}:null;
  const rooms=HQ_ROOMS.map(r=>{const roomTasks=tasks.filter(t=>sourceRoom[t.source]===r.id),recorded=r.id==='chat'?last.messages:r.id==='affairs'?pending:r.id==='memory'?stats.total:r.id==='media'?count('bilibili')+count('douyin'):r.source?count(r.source):null,allowed=r.id==='media'?['bilibili','douyin'].some(id=>source(id)?.allowed!==false):r.source?source(r.source)?.allowed!==false:r.id==='memory'?home.memoryEnabled:true;
   let progress={mode:'idle',label:allowed?'等待新的活动':'记忆联动已关闭',value:null};
   if(roomTasks.length){const t=roomTasks[0],measurable=t.total>0&&Number.isFinite(t.completed);progress={mode:measurable?'measured':'running',label:t.label+' · '+t.state,value:measurable?Math.round(t.completed/t.total*100):null,completed:t.completed,total:t.total,unit:t.unit||''};}
   else if(r.id==='rest')progress={mode:'level',label:'当前精力',value:home.vitals.values.find(v=>v.id==='energy')?.value??0};
   else if(r.id==='memory')progress={mode:'distribution',label:'记忆分层分布',value:null};
   else if(active===r.id)progress={mode:'local',label:'本地生活 · '+home.activity.title,value:null};
   return{id:r.id,name:r.name,active:active===r.id,status:active===r.id?'肥鱼正在这里':roomTasks.length?'任务进行中':!allowed?'记忆联动已关闭':'安静待命',allowed,recorded,detail:r.id==='memory'?'识海主记录':r.id==='affairs'?'待处理备忘与约定':r.id==='rest'?'精力 '+progress.value:r.id==='chat'?(connection.qqReady?'QQ 已连接':'QQ 待连接'):'已记录功能经历',page:r.page,progress,tasks:roomTasks.slice(0,4)};});
  const life=getLifeStatus(),furniture=furnitureStates({currentRoom:active,activity:home.activity,rooms,lifePlan:life.plan});
  for(const room of rooms){room.thought=life.plan?.rooms?.find(r=>r.id===room.id)||null;room.furniture=furniture.filter(f=>f.room===room.id);}
  // Metadata only from the existing owner-private shelf/journal; no other chat transcript.
  const timeline=[...home.journal.map(r=>({id:r.id,title:r.text,at:r.stamp,kind:r.kind==='diary'?'心事':'家园',source:'home',memoryId:r.nodeId||''})),...home.memories.map(r=>({id:r.id,title:r.title,at:r.stamp,kind:'识海',source:r.activitySource||(r.virtual?'home':'memory'),memoryId:r.id}))].sort((a,b)=>b.at-a.at).filter((r,i,all)=>all.findIndex(x=>x.memoryId&&x.memoryId===r.memoryId||x.id===r.id)===i).slice(0,12);
  return{ok:true,role:home.role,roleRevision:home.roleRevision,scope:key,identity:home.identity,activity:home.activity,vitals:home.vitals,currentRoom:active,rooms,tasks,furniture,life,memos,timeline,homePreferences:{auto:home.home.auto,version:home.home.version},schedule,metrics:{memories:stats.total,experiences:activities.total,pending,messages:last.messages},memoryStages:stats.byStage,connection:{engineReady:connection.engineReady===true,qqReady:connection.qqReady===true},memoryEnabled:home.memoryEnabled,extraModelCalls:0,visual:{kind:'original-procedural-fish',thirdPartyCharacterAssets:false},observedAt:now()};
 }
 return{snapshot};
}
