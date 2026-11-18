// A local virtual home. Observing/animation never sends messages or calls models.
import {createHash,randomUUID} from 'node:crypto';
import {createFishHomeVitals} from './fish-home-vitals.js';
import {activityPlacement} from './fish-home-space.js';
import {activityRoom,HQ_SPACES} from './fish-hq-layout.js';
export const HOME_CATALOG=Object.freeze([
 {kind:'sofa',name:'软云沙发',hint:'窝一会儿，什么也不着急',activity:'idle',color:'sky'},
 {kind:'bed',name:'月牙小床',hint:'把今天暂时放下',activity:'rest',color:'mint'},
 {kind:'desk',name:'小书桌',hint:'翻翻书，留一点自己的时间',activity:'read',color:'cream'},
 {kind:'bookshelf',name:'回忆书架',hint:'那些值得留下的小事',activity:'remember',color:'sky'},
 {kind:'table',name:'圆圆茶几',hint:'慢下来，喝一杯想象中的茶',activity:'idle',color:'cream'},
 {kind:'plant',name:'小绿植',hint:'和小小的绿色一起发呆',activity:'sunbathe',color:'mint'},
 {kind:'lamp',name:'晚安灯',hint:'给家留一盏暖光',activity:'rest',color:'cream'},
 {kind:'rug',name:'柔软地毯',hint:'随意待着就很好',activity:'wander',color:'lilac'},
 {kind:'pearl',name:'记忆小珍珠',hint:'把一段心事放在这里',activity:'remember',color:'lilac'}
]);
const presets=[['sofa','sofa',-3,-1.8,0],['bed','bed',3.5,2.1,0],['desk','desk',-3.8,2.5,0],['bookshelf','bookshelf',3.7,-3.25,0],['table','table',-.5,.5,0],['plant','plant',-4.8,-3.1,0],['lamp','lamp',4.9,1,0],['rug','rug',-.2,1.1,0],['pearl','pearl',.7,-3.8,0]];
const actions={idle:'窝在沙发里',rest:'好好休息',sleep:'在小床上睡觉',read:'翻一会儿书',sunbathe:'在窗边发呆',wander:'自由走走',remember:'看看旧时光',play:'玩一会儿玩具',feed:'吃一点小零食',touch:'被轻轻摸了摸',tidy:'整理一下小窝',create:'琢磨一点新点子'};
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
const digest=v=>createHash('sha256').update(String(v)).digest('hex');
export function createFishHome({ocean,getOwner=()=>'',getRole=()=>({}),getEmotion=()=>null,getRuntime=()=>null,getLifeDecision=()=>null,getAvatar=()=>({available:false}),onExperience=()=>{},canRemember=()=>true,redact=String,now=Date.now}={}){
 let chat=null,receipt=null;
 const db=ocean.db;db.exec('CREATE TABLE IF NOT EXISTS ocean_home_journal(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,role TEXT NOT NULL,channel TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,stamp INTEGER NOT NULL,node_id TEXT,request_hash TEXT NOT NULL);CREATE INDEX IF NOT EXISTS ocean_home_scope ON ocean_home_journal(role,channel,seq);');
 const clean=(v,n=300)=>{const value=String(redact(String(v??''))).toWellFormed().replace(/[\x00-\x1f]/g,' ').trim().slice(0,n);return /[\uD800-\uDBFF]$/.test(value)?value.slice(0,-1):value;};
 const vitals=createFishHomeVitals({ocean,now});
 function scope(){const owner=String(getOwner()||'');return{role:ocean.role(),channel:/^[1-9]\d*$/.test(owner)?'private:'+owner:''};}
 const roleVersion=()=>String(getRole()?.revision||'');
 function settings(){return ocean.meta.get('fish-home:'+ocean.role(),{version:0,name:'本鱼的小窝',ambience:'auto',auto:true,manual:null,items:presets.map(([id,kind,x,z,rotation])=>({id,kind,x,z,rotation,color:HOME_CATALOG.find(v=>v.kind===kind).color}))});}
 function assertCurrent(input){const s=scope();if(input.role!==s.role||input.roleRevision!==roleVersion())fail('人格已经变化，请刷新鱼窝',409);if(input.version!==settings().version)fail('家里的布置已经变化，请重新读取后保存',409);return s;}
 function mood(key=scope().channel){try{const value=getEmotion(key);return clean(typeof value==='string'?value:value?.mood||value?.label||'平静',30);}catch{return'平静';}}
 function activity(c=settings()){
  const timestamp=now(),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hour12:false}).format(timestamp))%24;
  let live;try{live=getRuntime();}catch{}if(!live&&chat?.role===ocean.role()&&chat.until>timestamp)live=chat;
  const currentMood=mood(/^(group|private):[1-9]\d*$/.test(live?.key||'')?live.key:scope().channel),period=Math.floor(timestamp/180000),seed=parseInt(digest(ocean.role()).slice(0,6),16);
  const manual=c.manual&&c.manual.until>timestamp,ended=!live&&!manual&&receipt?.role===ocean.role()&&receipt.until>timestamp?receipt:null;
  const levels=Object.fromEntries(vitals.snapshot().values.map(v=>[v.id,v.value]));
  const free=!c.auto?'idle':hour>=23||hour<7||levels.energy<25?'sleep':/生气|烦躁|委屈|低落|难过/.test(currentMood)?'sunbathe':levels.order<40?'tidy':levels.creativity>72?'create':levels.curiosity>72?'read':['idle','read','sunbathe','play','wander','idle'][(period+seed)%6];
  const decision=c.auto?getLifeDecision():null,critical=hour>=23||hour<7||levels.energy<25,modelChoice=!live&&!ended&&!manual&&!critical&&decision;
  const kind=live?.kind||ended?.kind||(manual?c.manual.kind:modelChoice?decision.activity:free),freeReason=levels.energy<25?'精力有点低，先睡一会儿':hour>=23||hour<7?'夜深了，躺下来慢慢睡':free==='tidy'?'秩序感有些低，整理一下更安心':free==='create'?'有一点创作欲，坐下来酝酿想法':levels.talk>72?'有点想说话，先在家里酝酿着，仍按原设置联系':'跟着本地生活节奏，随心换个地方';
  const placement=activityPlacement(c.items,kind),target=placement.target||{x:0,z:1.8};
  return{kind,decisionSource:modelChoice?'model':live?'runtime':manual?'manual':'local',focusFurniture:modelChoice?decision.focusFurniture:null,title:live?.title||ended?.title||actions[kind],reason:live?.reason||ended?.reason||(modelChoice?decision.reason:manual?'你为它留了一段放松时间':!c.auto?'自由活动已暂停，安静待在家里':/生气|烦躁|委屈|低落|难过/.test(currentMood)&&free==='sunbathe'?'根据当前心情，选择安静的角落':freeReason),target,entry:placement.entry,supportId:placement.supportId,spaceBlocked:!placement.entry,until:live?.until||ended?.until||(manual?c.manual.until:((period+1)*180000)),mood:currentMood,virtual:!live,localOnly:true,linked:!!live,source:live?.source||ended?.source||'home',canInterrupt:!live};
 }
 function memories(){const s=scope();if(!s.channel||!canRemember())return[];return db.prepare("SELECT * FROM ocean_nodes WHERE channel=? AND role=? AND deleted=0 AND kind IN ('event','fact','experience','reflection') ORDER BY pinned DESC,stamp DESC LIMIT 30").all(s.channel,s.role).filter(r=>!JSON.parse(r.meta||'{}').supersededBy&&ocean.recallAllowed(r)!==false).slice(0,8).map(r=>({id:r.id,title:r.title,summary:r.summary.slice(0,240),kind:r.kind,stamp:r.stamp,activitySource:JSON.parse(r.meta||'{}').activitySource||null,virtual:JSON.parse(r.meta||'{}').virtual===true}));}
 function journal(){const s=scope();return db.prepare('SELECT j.id,j.kind,j.text,j.stamp,j.node_id nodeId FROM ocean_home_journal j LEFT JOIN ocean_nodes n ON n.id=j.node_id AND n.role=j.role AND n.channel=j.channel WHERE j.role=? AND j.channel=? AND (j.node_id IS NULL OR (n.id IS NOT NULL AND n.deleted=0 AND n.edited=0)) ORDER BY j.seq DESC LIMIT 20').all(s.role,s.channel);}
 function presence(){const role=getRole()||{},a=activity();return{ok:true,role:ocean.role(),roleRevision:roleVersion(),identity:{name:clean(role.selfName||'本鱼',30),mood:a.mood},avatar:getAvatar(),activity:a,vitals:vitals.snapshot(a.kind)};}
 function state(){const c=settings(),s=scope(),role=getRole()||{},a=activity(c);return{ok:true,role:s.role,roleRevision:roleVersion(),scope:s.channel,identity:{name:clean(role.selfName||'本鱼',30),mood:a.mood},home:c,avatar:getAvatar(),activity:a,vitals:vitals.snapshot(a.kind),catalog:HOME_CATALOG,memories:memories(),journal:journal(),memoryEnabled:canRemember(),extraModelCalls:0};}
 function configure(input){assertCurrent(input);const old=settings(),next={...old};if(input.name!==undefined){if(typeof input.name!=='string'||!clean(input.name,30))fail('请填写鱼窝的名字');next.name=clean(input.name,30);}if(input.ambience!==undefined){if(!['auto','day','night'].includes(input.ambience))fail('光线设置无效');next.ambience=input.ambience;}if(input.auto!==undefined){if(typeof input.auto!=='boolean')fail('自由活动开关无效');next.auto=input.auto;next.manual=null;}
  if(input.items!==undefined){if(!Array.isArray(input.items)||input.items.length>24)fail('最多摆放24件家具');const seen=new Set();next.items=input.items.map(v=>{if(!v||typeof v.id!=='string'||!/^[a-z0-9-]{1,48}$/.test(v.id)||seen.has(v.id)||!HOME_CATALOG.some(x=>x.kind===v.kind))fail('家具资料无效');seen.add(v.id);if(!Number.isFinite(v.x)||!Number.isFinite(v.z)||Math.abs(v.x)>5.1||Math.abs(v.z)>3.9||!Number.isInteger(v.rotation)||v.rotation<0||v.rotation>3||!['sky','mint','cream','lilac','coral'].includes(v.color))fail('家具位置或颜色超出范围');return{id:v.id,kind:v.kind,x:Math.round(v.x*4)/4,z:Math.round(v.z*4)/4,rotation:v.rotation,color:v.color};});}
  next.version++;ocean.meta.set('fish-home:'+ocean.role(),next);if(input.items&&JSON.stringify(input.items)!==JSON.stringify(old.items))try{vitals.event('layout',String(next.version));}catch{}tick();return state();
 }
 function act(input){const s=scope();if(input.role!==s.role||input.roleRevision!==roleVersion())fail('人格已经变化，请刷新鱼窝',409);if(!s.channel)fail('请先设置管理员，再保存鱼窝经历');if(!['activity','diary'].includes(input.kind))fail('未知的鱼窝操作');const text=input.kind==='diary'?clean(input.text,1200):'';if(input.kind==='diary'&&!text)fail('先写下一句今天的心事');if(input.kind==='activity'&&!Object.hasOwn(actions,input.activity))fail('未知的生活活动');
  if(!/^[a-zA-Z0-9-]{16,64}$/.test(input.requestId||''))fail('操作编号无效');const id=digest(s.role+':'+s.channel+':'+input.requestId),fingerprint=digest(JSON.stringify([input.kind,input.activity||'',text])),old=db.prepare('SELECT * FROM ocean_home_journal WHERE id=?').get(id);if(old){if(old.request_hash!==fingerprint)fail('操作编号已经使用，请重试',409);return state();}
  const latest=db.prepare('SELECT max(stamp) stamp FROM ocean_home_journal WHERE role=? AND channel=?').get(s.role,s.channel).stamp||0;if(now()-latest<2000)fail('慢一点，家里不用着急',429);
  let effect; ocean.transaction(()=>{const c=settings(),description=input.kind==='diary'?'在虚拟鱼窝记下心事：'+text:'在虚拟鱼窝安排了“'+actions[input.activity]+'”活动。';let node=null;if(canRemember())node=ocean.upsert(s.channel,{sourceKey:'fish-home:'+id,kind:input.kind==='diary'?'reflection':'experience',title:input.kind==='diary'?'鱼窝日记 · '+text.slice(0,32):'鱼窝 · '+actions[input.activity],body:'【虚拟家园记录】这是数字家园里的'+(input.kind==='diary'?'主观日记，不代表外部事实。':'活动安排，不代表现实世界行为或已完成任务。')+'\n'+description,origin:'fish-home',confidence:input.kind==='diary'?'inferred':'confirmed',importance:.45,stamp:now(),meta:{virtual:true,subjective:input.kind==='diary',homeActivity:input.activity||'',source:'console-home',...(input.kind==='activity'?{activitySource:'home',status:'arranged'}:{})}});
   db.prepare('INSERT INTO ocean_home_journal(id,role,channel,kind,text,stamp,node_id,request_hash) VALUES(?,?,?,?,?,?,?,?)').run(id,s.role,s.channel,input.kind,description,now(),node?.id||null,fingerprint);if(input.kind==='activity')ocean.meta.set('fish-home:'+s.role,{...c,version:c.version+1,manual:{kind:input.activity,until:now()+(input.activity==='sleep'?3600000:600000)}});
   if(node&&input.kind==='activity')effect={id,nodeId:node.id,role:s.role,source:'home',status:'completed',kind:input.activity,key:s.channel,at:now()};
  });try{if(input.kind==='activity')vitals.event('home',id,{kind:input.activity});}catch{}if(effect)try{onExperience(effect);}catch{}tick();return state();
 }
 function context(key,query,{maxChars=500}={}){if(!canRemember()||key!==scope().channel||!/生活总部|总部|书房|放映厅|茶水间|创作坊|鱼窝|小窝|你.{0,3}家|家里|回家|放松|休息|精力|好奇|想说话|秩序|创造|困|睡/.test(query||''))return '';const c=settings(),a=activity(c),value='\n【本机虚拟鱼窝状态】'+JSON.stringify({home:c.name,place:HQ_SPACES.find(r=>r.id===activityRoom(a))?.name,activity:a.title,mood:mood(),vitals:Object.fromEntries(vitals.snapshot(a.kind).values.map(v=>[v.label,v.value])),virtual:true})+'\n这是数字家园中的本地生活状态，不据此声称真实世界行为、已完成阅读或外出。\n';return value.length<=maxChars?value:'';}
 function observeChat(row){if(row.direction!=='self')return;try{if(row.digest||row.id!=null)vitals.event('chat',String(row.digest||row.id));}catch{}chat={role:ocean.role(),key:row.channel,kind:'chat',source:'qq',title:row.channel.startsWith('group:')?'在电脑前和群友聊天':'在电脑前回复私聊',reason:'刚刚实际回复了消息，原文已保存在对应聊天的识海',until:now()+18000};tick();}
 function experience(value){if(value.role!==ocean.role()||now()-value.at>30000)return;try{vitals.event('experience',String(value.id),value);}catch{}receipt={role:ocean.role(),kind:value.status==='failed'?'sad':'celebrate',source:value.source,title:value.status==='failed'?'刚才的事情没有做好，缓一会儿':'刚做完一件事，放松一下',reason:'根据已有功能回执显示，识海和情感沿用同一条来源记录',until:now()+12000};}
 function tick(){try{vitals.tick(activity());return true;}catch{return false;}}
 return{state,presence,configure,act,context,observeChat,experience,tick,vitals};
}
