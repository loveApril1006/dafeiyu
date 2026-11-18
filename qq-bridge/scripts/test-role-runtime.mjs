import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {roleRuntime,roleInjectionText,RoleDeliveryTracker} from '../src/role-runtime.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';

const oldCard='你叫小蓝，说话简短、带点俏皮。你的哥哥用QQ100001，妈妈用QQ100002。';
const nextCard='你叫青柚，说话简短、带点俏皮。你的妈妈用QQ100001，哥哥用QQ100002。';
const long='普通表达示例。\n'.repeat(1500)+'你叫青柚。你把使用QQ100001的人叫哥哥。';
const limited=roleInjectionText(long,1000);assert(limited.length<=1000);assert.match(limited,/你叫青柚/);assert.match(limited,/QQ100001的人叫哥哥/);
const tracker=new RoleDeliveryTracker(),a=roleRuntime({sourceName:'小鸽子',sourceText:oldCard,hint:oldCard}),b=roleRuntime({sourceName:'小鸽子',sourceText:nextCard,hint:nextCard});
assert.notEqual(a.revision,b.revision);assert(tracker.prepare('s',a).changed);assert(tracker.prepare('s',a).changed,'preparing a failed submission cannot mark a card delivered');tracker.commit('s',a.revision);assert(!tracker.prepare('s',a).changed);assert(tracker.prepare('s',b).changed);assert(tracker.prepare('other',a).changed);

const h=await bridgeHarness({files:{'state/current-role.json':{role:'小鸽子',mode:'active'},'roles/小鸽子.md':oldCard},config:{socialV2:{sticker:{enabled:false},proactive:{enabled:false},wait:{minMs:1,maxMs:100,minQuietAfterNewMs:0}}}});
let server;
try{
  h.setMode('reserved2');h.setReady(true);h.setSelfIdentity('旧昵称小鸽子','200001');
  const key='private:123',st=h.getSocialV2State(key);await h.ensureSession(key);server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
  const request=(route,agent=true)=>new Promise((resolve,reject)=>{
    const req=http.get({hostname:'127.0.0.1',port:server.address().port,path:route,headers:{'x-console-token':'fixture-console-token',...(agent?{'x-agent-token':st.agentToken}:{})}},res=>{let raw='';res.setEncoding('utf8');res.on('data',c=>raw+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(raw)}));});req.on('error',reject);
  });
  h.appendSocialV2Message(key,'同一个昵称','你叫什么','你叫什么',false,false,'m1',[],'100001');
  let result=await request('/api/socialV2/unread?key='+key);assert.equal(result.status,200);assert(result.body.roleUpdate.changed);assert.match(result.body.roleUpdate.hint,/你叫小蓝/);assert.match(result.body.roleUpdate.hint,/哥哥用QQ100001/);assert.equal(result.body.messages[0].userId,'100001');assert.equal(result.body.roleUpdate.displayName,undefined);assert.equal(result.body.roleUpdate.relationships,undefined,'model receives original prose, not regex-imposed names or relationships');
  result=await request('/api/socialV2/unread?key='+key);assert(!result.body.roleUpdate.changed);assert.equal(result.body.roleUpdate.hint,undefined,'unchanged reads must not repeat the full card');
  // Edit in place with equal byte count and a restored mtime: ctime must still
  // invalidate the reader, and a live agent must see the new name/relationship.
  const file=path.join(h.temp,'roles/小鸽子.md'),stat=fs.statSync(file);fs.writeFileSync(file,nextCard);fs.utimesSync(file,stat.atime,stat.mtime);
  result=await request('/api/socialV2/unread?key='+key);assert(result.body.roleUpdate.changed);assert.match(result.body.roleUpdate.hint,/你叫青柚/);assert.match(result.body.roleUpdate.hint,/妈妈用QQ100001/);
  result=await request('/api/socialV2/prompt?key='+key);assert.equal(result.body.role.sourceName,'小鸽子');assert.equal(result.body.role.name,undefined);assert.match(result.body.self.line,/不是角色名字/);assert.match(result.body.role.hint,/卡片文件名、QQ账号昵称/);
  const admin=await request('/api/socialV2/unread?key='+key,false);assert.equal(admin.body.roleUpdate,undefined,'admin polling must not consume a model delivery revision');
  fs.writeFileSync(file,oldCard);await h.deliverPrompt(key,'合成唤醒，只测试传入模型的提示');assert.match(h.calls.prompts.at(-1).content[0].text,/管理端最新人格更新/);assert.match(h.calls.prompts.at(-1).content[0].text,/你叫小蓝/);assert.equal(h.calls.sent.length,0);
  console.log('PASS free-form persona prose, no regex name/relationship overrides, file-name/nickname separation, long-card identity retention, in-place hot edits, live authenticated read updates, deduped revisions and actual prompt delivery; isolated peers, no QQ sends.');
}finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await h.close();}
