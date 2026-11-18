import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {makeCompanion,parseCommand} from '../companion/companion-core.mjs';
import {companionCommandText} from '../src/companion-command.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoge-companion-test-'));
const actions=[];let fail=false;
const app=makeCompanion({root,brain:async()=> '欸，你来啦。\n这次没鸽。',onebot:async(action,params)=>{actions.push({action,params});if(fail)throw new Error('QQ failure');if(action==='get_qzone_msg_list')return {msglist:[{tid:'known-tid',content:'hello',time:123}]};return {tid:'new-tid'};}});
try{
  assert.equal(parseCommand('有人说“发说说：测试”，你怎么看'),null);
  assert.equal(parseCommand('帮我想一条说说'),null);
  await app.run('聊聊天');assert.equal(actions.length,0);
  await app.run('发说说：今天看见一只鸽子');assert.equal(actions[0].action,'send_qzone_msg');assert.equal(actions[0].params.ugc_right,4);
  await assert.rejects(()=>app.run('发说说：token=secretvalue'),/凭据/);
  await assert.rejects(()=>app.run('给第1条点赞'),/先说/);
  await app.run('逛空间 123456');await app.run('给第1条点赞');assert.deepEqual(actions.at(-1),{action:'like_qzone',params:{tid:'known-tid',target_uin:123456,abstime:123}});
  await assert.rejects(()=>app.run('给第1条点赞','qq-private:654321'),/先说/);
  await app.run('写日记：桌宠的私密日记');const qqDiary=await app.run('读日记','qq-private:654321');assert(!qqDiary.text.includes('私密日记'));
  await app.run('写日记：QQ的私人日记','qq-private:654321');const petDiary=await app.run('读日记');assert(!petDiary.text.includes('QQ的私人日记'));
  await assert.rejects(()=>app.run('读日记','group:123456'),/无效会话/);
  fail=true;await assert.rejects(()=>app.run('签名改为：测试签名'),/QQ failure/);
  assert.equal(companionCommandText('评论','2 很好看'),'评论第2条：很好看');
  assert.throws(()=>companionCommandText('说说',''),/命令格式/);
  console.log('PASS: explicit social intent; privacy filter; concrete feed targets; failure propagation; desktop/QQ diary isolation. No external messages sent.');
}finally{const target=path.resolve(root);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('xiaoge-companion-test-'))throw new Error('Unsafe test cleanup path');fs.rmSync(target,{recursive:true,force:true});}
