import assert from 'node:assert/strict';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const requests=[];
const h=await bridgeHarness({config:{petFeed:{enabled:false}},globals:{callCompanionCommand:async(root,owner,name,arg)=>{requests.push({owner,name,arg});return '生活命令测试回执';}}});
try{
  h.setMode('reserved2');
  const event=(user,text,id)=>({user_id:user,self_id:999,group_id:456,message_id:id,message:[{type:'text',data:{text}}]});
  await h.handleIncoming('group',456,event(123,'#说说 不应在群里操作',201),h.cfg);
  assert.equal(requests.length,0,'Owner group commands must not operate the account');
  await h.handleIncoming('private',123,event(123,'#说说 管理员明确要求的正文',202),h.cfg);
  assert.equal(requests.length,1);assert.equal(requests[0].name,'说说');assert.equal(requests[0].arg,'管理员明确要求的正文');
  await h.handleIncoming('private',124,event(124,'#签名 非管理员的要求',203),h.cfg);
  assert.equal(requests.length,1,'Non-owner must not reach the life service');
  await h.handleIncoming('group',456,event(123,'#刷B站',204),h.cfg);
  await h.handleIncoming('private',124,event(124,'#B站评论 BV1EPnG6DEJC 不应发送',205),h.cfg);
  assert.equal(requests.length,1,'Bilibili commands require owner private chat');
  await h.handleIncoming('private',123,event(123,'#搜B站 开源项目',206),h.cfg);
  assert.equal(requests.length,2);assert.equal(requests[1].name,'搜B站');
  await h.handleIncoming('group',456,event(123,'#刷抖音',207),h.cfg);
  await h.handleIncoming('private',124,event(124,'#发抖音 E:\\video.mp4 | 不应发布',208),h.cfg);
  assert.equal(requests.length,2,'Douyin requires owner private chat');
  await h.handleIncoming('private',123,event(123,'#抖音状态',209),h.cfg);
  assert.equal(requests.length,3);assert.equal(requests[2].name,'抖音状态');
  console.log('PASS: life commands require owner private chat; group and non-owner writes denied; QQ result stays separate from pet. All peers mocked.');
}finally{await h.close();}
