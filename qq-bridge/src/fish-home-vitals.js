import {createHash} from 'node:crypto';

const HOUR=3600000,DAY=24*HOUR,clamp=v=>Math.max(0,Math.min(100,v));
const defaults={energy:76,curiosity:58,talk:48,order:72,creativity:56};
const labels={energy:'精力',curiosity:'好奇',talk:'想说话',order:'秩序',creativity:'创造'};
const rates={
 sleep:[20,0,-1,0,1],rest:[9,.3,.5,.4,1],idle:[2,1,3,-.4,1],sunbathe:[5,1,1,.3,1.5],
 chat:[-7,.4,-4,-.8,.8],work:[-10,1,-.5,-1.5,-2],watch:[-5,-3,1,-.6,2],read:[-4,-4,1,.4,1],
 remember:[-2,-1,0,5,1],wander:[-2,2,1,-.4,1],play:[-5,-2,1,-2,2],feed:[2,0,1,0,0],touch:[1,0,-1,0,0],
 tidy:[-3,0,0,12,1],create:[-7,1,1,-1,-6],celebrate:[-1,1,2,0,2],sad:[0,-1,-1,-.3,0]
};
const deltas={sleep:[0,0,0,0,0],rest:[0,0,0,0,0],play:[-1,-1,1,-.5,1],feed:[2,0,.5,0,0],touch:[0,0,-1,0,.3],read:[-.3,-1,.3,.4,.5],remember:[-.3,0,0,1,.3],tidy:[-.5,0,0,4,.5],create:[-.5,.5,.5,-.5,-1],wander:[-.3,1,0,-.2,.3],sunbathe:[0,.3,0,0,.3],idle:[0,0,0,0,0],layout:[-.2,0,0,3,1],chat:[-.4,.3,-2,-.1,.3]};
const descriptions={energy:['需要睡一觉','有些疲倦','精神不错'],curiosity:['先消化一下','慢慢观察','想发现新东西'],talk:['想安静待会','愿意聊聊','有话想说'],order:['想整理一下','有点散乱','心里有条理'],creativity:['先歇歇脑袋','慢慢酝酿','灵感冒泡']};
const hour=t=>Math.floor((t+8*HOUR)/HOUR)%24;

// Local, persisted life simulation. Reads are pure; only activity ticks/events checkpoint.
// It neither writes narrative memories nor grants permission to send or run tools.
export function createFishHomeVitals({ocean,now=Date.now}={}){
 const db=ocean.db,starts=new Map();
 db.exec('CREATE TABLE IF NOT EXISTS ocean_home_signals(role TEXT NOT NULL,id TEXT NOT NULL,stamp INTEGER NOT NULL,PRIMARY KEY(role,id));CREATE INDEX IF NOT EXISTS ocean_home_signal_time ON ocean_home_signals(role,stamp);');
 const key=()=> 'fish-home-vitals:'+ocean.role();
 function base(){const role=ocean.role(),saved=ocean.meta.get(key(),null);if(saved&&Number.isFinite(saved.at)&&saved.at>0&&saved.at<8640000000000000&&Object.keys(defaults).every(k=>Number.isFinite(saved.values?.[k])))return{...saved,values:Object.fromEntries(Object.entries(saved.values).filter(([k])=>Object.hasOwn(defaults,k)).map(([k,v])=>[k,clamp(v)]))};if(!starts.has(role))starts.set(role,{at:now(),values:{...defaults},activity:'idle',until:now(),lastChange:null});return structuredClone(starts.get(role));}
 function integrate(values,kind,ms){const h=ms/HOUR,r=rates[kind]||rates.idle;Object.keys(defaults).forEach((k,i)=>{if(k==='energy')values[k]=clamp(values[k]+r[i]*h);else{const equilibrium=defaults[k]+r[i]*8;values[k]=clamp(equilibrium+(values[k]-equilibrium)*Math.exp(-h/8));}});}
 function projected(){const s=base(),t=Math.max(s.at,now()),values={...s.values};let cursor=s.at,activity=s.activity;if(t-cursor>DAY){const gap=t-cursor-DAY;for(const k of Object.keys(defaults))values[k]=k==='energy'?clamp(values[k]+gap/HOUR*8):defaults[k]+(values[k]-defaults[k])*Math.exp(-gap/(8*HOUR));cursor=t-DAY;}const stop=Math.min(t,Number(s.until)||cursor);if(stop>cursor){integrate(values,s.activity,stop-cursor);cursor=stop;}while(cursor<t){const end=Math.min(t,(Math.floor(cursor/HOUR)+1)*HOUR),h=hour(cursor);activity=h>=23||h<7?'sleep':'idle';integrate(values,activity,end-cursor);cursor=end;}return{...s,values,at:t,activity,until:Math.max(t,Number(s.until)||0)};}
 function snapshot(kind){const s=projected(),r=rates[kind||s.activity]||rates.idle;return{localOnly:true,values:Object.keys(defaults).map((id,i)=>{const n=s.values[id];return{id,label:labels[id],value:Math.round(n),state:descriptions[id][n<35?0:n<70?1:2],trend:r[i]>.2?'慢慢恢复':r[i]<-.2?'缓慢消耗':'趋于平稳'};}),lastChange:s.lastChange||null};}
 function tick(activity){const s=projected(),until=activity.linked?now()+90000:Math.min(now()+DAY,Math.max(now()+1000,activity.until||now()+60000));ocean.meta.set(key(),{...s,activity:Object.hasOwn(rates,activity.kind)?activity.kind:'idle',until});}
 function event(type,id,{kind='',source='',status='completed'}={}){
  if(typeof id!=='string'||!id||id.length>200)return false;const role=ocean.role(),token=createHash('sha256').update(type+':'+id).digest('hex');let applied=false;
  ocean.transaction(()=>{if(db.prepare('SELECT 1 FROM ocean_home_signals WHERE role=? AND id=?').get(role,token))return;const s=projected(),bucket=Math.floor(now()/HOUR),quota={hour:bucket,...Object.fromEntries(['chat','home','experience','layout'].map(k=>[k,s.quota?.hour===bucket&&Number.isFinite(s.quota[k])?Math.max(0,s.quota[k]):0]))},limit={chat:12,home:6,experience:12,layout:2}[type];if(!limit)return;db.prepare('INSERT INTO ocean_home_signals(role,id,stamp) VALUES(?,?,?)').run(role,token,now());if(quota[type]>=limit)return;
   let delta=type==='experience'?(status==='failed'?[-.5,-.5,-.5,-1,-.5]:[-.5,1,1,.3,source==='creative'?2:1]):deltas[type==='home'?kind:type]||[0,0,0,0,0];Object.keys(defaults).forEach((k,i)=>s.values[k]=clamp(s.values[k]+delta[i]));quota[type]++;s.quota=quota;s.lastChange={label:type==='chat'?'刚聊了一会儿':type==='experience'?'刚处理完一件事':type==='layout'?'重新布置了小窝':({sleep:'准备睡一会儿',rest:'留了一段休息时间',play:'玩了一会儿',feed:'吃了一点零食',touch:'收到了轻轻摸摸',tidy:'安排整理小窝',create:'开始酝酿点子',read:'安排翻翻书'}[kind]||'换了一种放松方式'),at:now()};ocean.meta.set(key(),s);applied=true;
  });return applied;
 }
 return{snapshot,tick,event};
}
