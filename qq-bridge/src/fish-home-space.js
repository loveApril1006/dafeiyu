// Shared room geometry for the server's activity anchors and the local renderer.
// Furniture coordinates are untouched. Only character positions/paths are resolved.
export const ACTOR_RADIUS=.6;
export const ROOM_BOUNDS=Object.freeze({minX:-5.45,maxX:5.55,minZ:-4.25,maxZ:4.35});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const shapes={sofa:[[-1.52,1.52,-.78,.78]],bed:[[-1.1,1.1,-1.23,1.2]],desk:[[-1.2,1.2,-.64,.64],[-.4,.4,.58,1.34]],bookshelf:[[-1.02,1.02,-.45,.45]],table:[.98],plant:[.52],lamp:[.5],pearl:[.56]};
const obstacles=items=>items.filter(v=>shapes[v.kind]).map(v=>{const t=(v.rotation||0)*Math.PI/2;return{...v,c:Math.cos(t),s:Math.sin(t),parts:shapes[v.kind]};});
export function localPoint(item,x,z){const t=(item.rotation||0)*Math.PI/2;return{x:item.x+x*Math.cos(t)+z*Math.sin(t),z:item.z-x*Math.sin(t)+z*Math.cos(t)};}
function clear(p,obs,r){const b=ROOM_BOUNDS;if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||p.x<b.minX||p.x>b.maxX||p.z<b.minZ||p.z>b.maxZ)return false;for(const o of obs){const dx=p.x-o.x,dz=p.z-o.z,x=dx*o.c-dz*o.s,z=dx*o.s+dz*o.c;if(typeof o.parts[0]==='number'){if(Math.hypot(x,z)<o.parts[0]+r-.0001)return false;}else for(const a of o.parts){if(Math.hypot(x-clamp(x,a[0],a[1]),z-clamp(z,a[2],a[3]))<r-.0001)return false;}}return true;}
export const isStandingClear=(p,items,r=ACTOR_RADIUS)=>clear(p,obstacles(items),r);
function nearest(goal,obs,r){const b=ROOM_BOUNDS,p={x:clamp(goal.x,b.minX,b.maxX),z:clamp(goal.z,b.minZ,b.maxZ)};if(clear(p,obs,r))return p;for(let distance=.15;distance<14;distance+=.15){let best=null,score=Infinity;const count=Math.max(24,Math.ceil(distance*35));for(let i=0;i<count;i++){const t=i/count*Math.PI*2,q={x:p.x+Math.cos(t)*distance,z:p.z+Math.sin(t)*distance};if(!clear(q,obs,r))continue;const d=Math.hypot(q.x-goal.x,q.z-goal.z);if(d<score){best=q;score=d;}}if(best)return best;}return null;}
export const nearestStandingPosition=(p,items,r=ACTOR_RADIUS)=>nearest(p,obstacles(items),r);
export function activityPlacement(items,kind){
 const wanted={chat:'desk',work:'desk',watch:'desk',read:'desk',create:'desk',sleep:'bed',rest:'bed',idle:'sofa',touch:'sofa',sad:'sofa',remember:'bookshelf',tidy:'bookshelf',sunbathe:'plant',feed:'table',play:'rug',wander:'rug',celebrate:'rug'}[kind],item=items.find(v=>v.kind===wanted),obs=obstacles(items);
 const offsets={desk:[0,2.05],bed:[0,1.95],sofa:[0,1.55],bookshelf:[0,1.2],plant:[0,1.3],table:[1.75,0],rug:[0,.9]},offset=offsets[wanted]||[0,0],goal=item?localPoint(item,...offset):{x:0,z:1.8},entry=nearest(goal,obs,ACTOR_RADIUS);
 if(kind==='sleep')return{target:item?localPoint(item,0,.08):entry,entry,supportId:item?.id||null};
 return{target:entry,entry,supportId:null};
}
function segment(a,b,obs,r){const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.12));for(let i=0;i<=n;i++)if(!clear({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n},obs,r))return false;return true;}
export const walkingSegmentClear=(a,b,items,r=ACTOR_RADIUS)=>segment(a,b,obstacles(items),r);
export function planWalkingPath(from,to,items){
 const obs=obstacles(items),start=nearest(from,obs,ACTOR_RADIUS),goal=nearest(to,obs,ACTOR_RADIUS);if(!start||!goal)return null;if(segment(start,goal,obs,ACTOR_RADIUS))return{start,goal,points:[goal]};
 const b=ROOM_BOUNDS,step=.25,nx=Math.floor((b.maxX-b.minX)/step)+1,nz=Math.floor((b.maxZ-b.minZ)/step)+1,total=nx*nz,states=new Int8Array(total),scores=new Float64Array(total).fill(Infinity),parent=new Int32Array(total).fill(-1),closed=new Uint8Array(total),pos=id=>({x:b.minX+(id%nx)*step,z:b.minZ+Math.floor(id/nx)*step}),allowed=id=>{if(!states[id])states[id]=clear(pos(id),obs,ACTOR_RADIUS)?1:-1;return states[id]===1;};
 function cell(p){const ids=Array.from({length:total},(_,id)=>id).sort((a,b)=>Math.hypot(pos(a).x-p.x,pos(a).z-p.z)-Math.hypot(pos(b).x-p.x,pos(b).z-p.z));return ids.find(id=>allowed(id)&&segment(p,pos(id),obs,ACTOR_RADIUS))??-1;}
 const first=cell(start);let last=cell(goal);if(first<0)return null;const open=[first];scores[first]=0;let found=false,resolved=goal;
 while(open.length){let pick=0,best=Infinity;for(let i=0;i<open.length;i++){const q=pos(open[i]),v=scores[open[i]]+Math.hypot(q.x-goal.x,q.z-goal.z);if(v<best){best=v;pick=i;}}const id=open.splice(pick,1)[0];if(closed[id])continue;closed[id]=1;if(id===last){found=true;break;}const x=id%nx,z=Math.floor(id/nx);for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const xx=x+dx,zz=z+dz;if(xx<0||xx>=nx||zz<0||zz>=nz)continue;const next=zz*nx+xx;if(closed[next]||!allowed(next)||!segment(pos(id),pos(next),obs,ACTOR_RADIUS))continue;const cost=scores[id]+step*Math.hypot(dx,dz);if(cost<scores[next]){scores[next]=cost;parent[next]=id;open.push(next);}}}
 if(!found){let distance=Infinity;last=-1;for(let id=0;id<total;id++)if(closed[id]){const p=pos(id),d=Math.hypot(p.x-goal.x,p.z-goal.z);if(d<distance){distance=d;last=id;}}if(last<0||distance>3.5)return null;resolved=pos(last);}
 const raw=[resolved];for(let id=last;id>=0;id=parent[id])raw.unshift(pos(id));const points=[];let current=start,index=0;while(index<raw.length){let far=raw.length-1;while(far>index&&!segment(current,raw[far],obs,ACTOR_RADIUS))far--;points.push(raw[far]);current=raw[far];index=far+1;}return{start,goal:resolved,points,adjustedGoal:!found};
}
