// SPDX-License-Identifier: MIT — original procedural furniture and interactions.
const item=(id,room,kind,x,z,label,action,yaw=0)=>({id,room,kind,x,z,label,action,yaw});
export const HQ_FURNITURE=Object.freeze([
 item('home-desk','home','desk',0,-1.65,'肥鱼的书桌','profile'),item('home-books','home','shelf',-3.6,-1,'随手读的书','read'),item('home-cabinet','home','shelf',3.4,-1,'生活收藏柜','remember'),
 item('chat-sofa-a','chat','sofa',-14.5,-9.3,'会客沙发','touch',Math.PI/2),item('chat-sofa-b','chat','sofa',-10.1,-9.3,'聊天沙发','sessions',-Math.PI/2),item('chat-tea','chat','table',-12.3,-10.3,'小茶几','feed'),
 ...[-6.8,-5,-3.2,-1.4].map((x,i)=>item('memory-shelf-'+i,'memory','shelf',x,-11.7,['核心书架','近期书架','往事书架','久远书架'][i],'memory')),
 item('memory-desk','memory','desk',-6.3,-8.8,'回忆整理台','tidy'),item('media-screen','media','screen',4.1,-11.9,'影音大屏','bilibili'),item('media-seat-a','media','sofa',1.7,-9.1,'放映座椅','bilibili',Math.PI/2),item('media-seat-b','media','sofa',6.5,-9.1,'观影沙发','douyin',-Math.PI/2),
 item('creative-desk-a','creative','desk',10.1,-9.6,'画画工作台','creative'),item('creative-desk-b','creative','desk',14.5,-9.6,'灵感书桌','create'),item('creative-shelf','creative','shelf',12.3,-11.5,'作品收纳架','creative'),item('creative-board','creative','board',15,-7.4,'灵感画板','note'),
 item('affairs-desk-a','affairs','desk',-14.2,-2,'事务工作台','harness-control'),item('affairs-desk-b','affairs','desk',-14.2,2,'约定整理桌','memory'),item('affairs-shelf','affairs','shelf',-15.5,0,'备忘档案柜','memory'),item('affairs-tea','affairs','table',-10.3,-2.3,'等一会的小桌','rest'),
 item('live-backdrop','live','backdrop',15.7,0,'直播背景墙','bili-live'),item('live-desk','live','desk',13.6,-2.5,'直播控制台','bili-live'),item('live-sofa','live','sofa',13.6,2.6,'下播休息椅','rest'),item('live-mic','live','mic',12.4,1.4,'弹幕话筒','bili-live'),
 item('qzone-desk-a','qzone','desk',-14.1,8.7,'说说编辑台','qzone'),item('qzone-desk-b','qzone','desk',-10.9,10,'日常灵感桌','note'),item('qzone-shelf','qzone','shelf',-14.1,11.3,'日记收纳架','note'),item('qzone-board','qzone','board',-15.7,8,'生活便签墙','memory'),
 item('rest-bed','rest','bed',12.4,9.3,'安心小床','sleep'),item('rest-lamp','rest','lamp',14.7,10.5,'晚安灯','rest'),
 item('lobby-table','lobby','meeting',-3.5,10.3,'围坐圆桌','play'),item('tea-counter','tea','counter',3.4,11.6,'零食茶水台','feed'),item('tea-table','tea','table',3.4,9.5,'发呆小圆桌','sunbathe')
]);
export const LIFE_ACTIVITIES=Object.freeze(['idle','rest','sleep','read','sunbathe','wander','remember','play','feed','touch','tidy','create']);
export function furnitureStates({currentRoom,activity,rooms=[],lifePlan}){return HQ_FURNITURE.map(f=>{const room=rooms.find(r=>r.id===f.room),active=currentRoom===f.room,focused=lifePlan?.focusFurniture===f.id,busy=!!room?.tasks?.length,ambience=lifePlan?.rooms?.find(r=>r.id===f.room)?.ambience;return{id:f.id,room:f.room,label:f.label,action:f.action,active,focused,busy,mode:activity.kind==='sleep'&&active?'sleep':busy?'working':ambience|| (active?'focused':'calm'),status:activity.kind==='sleep'&&f.kind==='bed'?'正在安睡':busy?'功能运行中':focused?'本次想用这里':active?'正在这个房间':'安静待用'};});}
