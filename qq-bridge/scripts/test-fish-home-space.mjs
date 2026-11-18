import assert from 'node:assert/strict';import {test} from 'node:test';import {activityPlacement,isStandingClear,planWalkingPath,walkingSegmentClear,localPoint} from '../src/fish-home-space.js';
const items=[['sofa','sofa',-3,-1.8],['bed','bed',3.5,2.1],['desk','desk',-3.8,2.5],['bookshelf','bookshelf',3.7,-3.25],['table','table',-.5,.5],['plant','plant',-4.8,-3.1],['lamp','lamp',4.9,1],['rug','rug',-.2,1.1],['pearl','pearl',.7,-3.8]].map(([id,kind,x,z])=>({id,kind,x,z,rotation:0}));
const kinds=['idle','rest','chat','watch','work','read','create','tidy','remember','sunbathe','feed','play','wander','sleep'];
test('standing anchors stay outside real furniture footprints and bed sleep has a separate approach point',()=>{
 const original=JSON.stringify(items);for(const kind of kinds){const p=activityPlacement(items,kind);assert(p.entry&&isStandingClear(p.entry,items),kind+' entry is blocked');if(kind!=='sleep')assert(isStandingClear(p.target,items),kind+' target is inside furniture');else{assert.equal(p.supportId,'bed');assert(!isStandingClear(p.target,items));assert(Math.hypot(p.target.x-3.5,p.target.z-2.1)<.2);}}
 const feed=activityPlacement(items,'feed').target;assert(Math.hypot(feed.x+.5,feed.z-.5)>1.5);assert.equal(JSON.stringify(items),original,'positions must not modify user furniture');
});
test('walks detour around furniture, do not cut corners and handle rotated desks/beds',()=>{
 for(const turn of [0,1,2,3]){const layout=items.map(v=>({...v,rotation:['desk','bed','bookshelf'].includes(v.kind)?turn:0}));let from=activityPlacement(layout,'idle').entry;for(const kind of kinds){const target=activityPlacement(layout,kind).entry,route=planWalkingPath(from,target,layout);assert(route,kind+' unreachable under rotation '+turn);let previous=route.start;for(const p of route.points){assert(walkingSegmentClear(previous,p,layout),kind+' crosses an obstacle');previous=p;}from=route.goal;}}
 const start={x:-2.4,z:-1},end={x:1.5,z:2.2},route=planWalkingPath(start,end,items);assert(route);assert(route.points.length>1,'a blocked direct path was not routed');
});
test('furniture local offsets rotate with the object and obstructed clicks resolve safely',()=>{
 const base={x:2,z:1,rotation:1};assert.deepEqual(localPoint(base,0,2),{x:4,z:1.0000000000000002});const route=planWalkingPath({x:0,z:3},{x:-.5,z:.5},items);assert(route&&isStandingClear(route.goal,items));assert(Math.hypot(route.goal.x+.5,route.goal.z-.5)>1.5);
});
