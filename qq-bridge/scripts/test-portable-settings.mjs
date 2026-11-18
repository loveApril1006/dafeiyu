import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import yaml from 'js-yaml';
import {createPortableSettings,applyPortableSettings} from '../src/portable-settings.js';
import {createReplyOptions} from '../src/reply-options.js';

const secret='sk-test-0b509464e4a38b144479',owner=1770011223;
const exported=createPortableSettings({bridge:{ownerQQ:owner,consoleToken:secret,allow:{groups:['5588990011']},dsh:{authToken:secret,provider:'private-account',reasoningEffort:'max'},socialV2:{enabled:true,wake:{defaultMode:'active',replyEveryMessageWhenActive:true,recommendedHint:'联系 '+owner+' token '+secret},proactive:{enabled:true,scope:'group',checkIntervalMinMs:600000,checkIntervalMaxMs:3600000},context:{wakeMaxChars:3000},tools:{sendVoice:true}},unknownFutureSecret:secret},
 mode:{mode:'reserved2',closedAgentPreset:''},role:{name:'测试角色',text:'你叫测试角色；管理员 '+owner+'；不要公开 '+secret,selfName:'测试角色',mode:'active'},
 creative:{images:{enabled:true,apiKey:secret,baseURL:'https://example.com/?api_key='+secret,workflowJson:secret},rpg:{enabled:true,history:[secret]}},
 wechat:{enabled:true,allowUsers:['friend-private'],dailyLimit:7,groupMentionOnly:true},qzone:{enabled:true,autoPublish:false,withImages:true,dailyGenerations:2,journal:[secret]},
 bilibili:{autoRun:true,mentionUid:owner,dmUid:owner,guardWhitelist:String(owner),keywords:['开源']},
 harnessControl:{enabled:true,adminEnabled:true,autonomousEnabled:true,maxMinutes:10,projects:[{id:'private',path:'E:/private-harness-project',capability:secret}],jobs:[secret],capabilities:[secret]},
 emotion:{enabled:true,emotionalReplies:false,personalityLearning:false,allowSwearing:false,expressionIntensity:.4,contextChars:1200,memoryContextLimit:2,schedule:[{start:'00:00',end:'08:00',activity:'休息',quiet:true}],profiles:[secret]},
 replies:{text:true,images:true,voice:false,stickers:false,replyLength:'expanded',apiKey:secret,history:[secret]},
 cognition:{enabled:true,selfTalk:true,reflection:false,review:true,intervalMinutes:40,minNewMessages:4,dailyCalls:8,dailyTokens:24000,jobs:[secret]},
 activities:{enabled:true,emotionInfluence:false,audience:'owner',sources:{qzone:true,bilibili:false,douyin:true},revision:42,records:[secret]},
 bilibiliLive:{config:{roomId:'1234567',persona:'按当前人格直播，QQ7654321不要公开',voice:false,maxReplyChars:90,apiKey:secret},studio:{autoFollow:true,displayName:'测试主播',videoRequestPlaySec:60,images:[secret]}},
 videoMemory:{bilibili:{enabled:false,autoClean:true,rawDays:14,records:[secret]},douyin:{enabled:false,apiKey:secret}},
 localVoice:{enabled:true,voice:'hutao-playful'},tts:{voice:'hutao-playful',speed:1},desktop:{chatMemoryRounds:4,pets:[{id:'main',name:'测试角色',whisperEnabled:false,size:300}]},screen:{enabled:false,interval:60},
 optional:{mnemon:{defaultRecallLimit:2,cliPath:'E:/private/mnemon.exe',embedding:{apiKey:secret,enabled:false}}},bundles:{'dsh-mnemon':true,'dsh-pet':false},
 douyin:{video:{enabled:true,windows:['18:00-23:00'],dailyMinutes:15,usedMinutes:13},chat:{enabled:true,allowlist:[secret],groupMentionNames:['测试角色']}}});
const raw=JSON.stringify(exported.settings);assert(!raw.includes(secret));assert(!raw.includes(String(owner)));assert(!raw.includes('5588990011'));assert(!raw.includes('friend-private'));assert(!raw.includes('private-account'));assert(!raw.includes('E:/private'));assert(!raw.includes('history'));
assert.equal(exported.settings.bridge.socialV2.proactive.checkIntervalMaxMs,3600000);assert.equal(exported.settings.bridge.socialV2.tools.sendVoice,true);assert.equal(exported.settings.wechat.enabled,true);assert.deepEqual(exported.settings.wechat.allowUsers,[]);assert(!Object.hasOwn(exported.settings.creative.images,'apiKey'));assert(!Object.hasOwn(exported.settings.creative.images,'baseURL'));assert(!Object.hasOwn(exported.settings.bilibili,'mentionUid'));assert.equal(exported.settings.douyin.video.dailyMinutes,15);assert(!Object.hasOwn(exported.settings.douyin.video,'usedMinutes'));assert(!raw.includes('7654321'));assert(!Object.hasOwn(exported.settings.bilibiliLive.config,'roomId'));

const root=fs.mkdtempSync(path.join(os.tmpdir(),'portable-settings-')),put=(rel,value)=>{const p=path.join(root,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof value==='string'?value:JSON.stringify(value));};
try{
 put('qq-bridge/config.json',{ownerQQ:99887766,consoleToken:'new-device-token',allow:{private:['99887766'],groups:[]},dsh:{provider:'new-device-provider',model:'new-device-model',authToken:'new-device-key'},socialV2:{voice:{ffmpegPath:'D:/new/bin/ffmpeg.exe'}}});
 put('engine-home/profiles/web/package.json',{dsh:{profile:{bundles:['@deepseek-ai/dsh-base','dsh-pet']}}});put('engine-home/profiles/web/cordis.patch.yml',yaml.dump([{id:'mnemon',config:{cliPath:'D:/new/mnemon.exe'}}]));put('GPT-SoVITS/pet-voice.json',{voice:'klee-cute',voices:{}});
 put('qq-bridge/companion/reply-options.json',{revision:8,text:true,images:false,voice:false,stickers:true});
 applyPortableSettings(root,exported.settings,{fresh:true});
 const read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
 const replies=createReplyOptions(path.join(root,'qq-bridge'));assert.equal(replies.get().replyLength,'expanded');assert.equal(replies.get().voice,false);assert.equal(replies.get().images,true);assert.equal(replies.get().stickers,false);assert.equal(replies.get().revision,0);
 assert.deepEqual(exported.settings.replies,{text:true,images:true,voice:false,stickers:false,replyLength:'expanded'});assert.deepEqual(createPortableSettings({replies:{replyLength:'detailed',apiKey:secret,history:[secret]}}).settings.replies,{replyLength:'detailed'});assert.deepEqual(createPortableSettings({replies:{replyLength:secret}}).settings.replies,{replyLength:'natural'});
 const cfg=read('qq-bridge/config.json');assert.equal(cfg.ownerQQ,99887766);assert.equal(cfg.consoleToken,'new-device-token');assert.equal(cfg.dsh.authToken,'new-device-key');assert.equal(cfg.dsh.provider,'new-device-provider');assert.equal(cfg.socialV2.voice.ffmpegPath,'D:/new/bin/ffmpeg.exe');assert.equal(cfg.socialV2.proactive.scope,'group');
 assert.equal(read('qq-bridge/companion/bili-native-data/config.json').dutyProvider,'new-device-provider');assert.equal(read('engine-home/dsh-pet/screen-companion.json').model.model,'new-device-model');assert(!read('engine-home/profiles/web/package.json').dsh.profile.bundles.includes('dsh-pet'));
 assert.equal(yaml.load(fs.readFileSync(path.join(root,'engine-home/profiles/web/cordis.patch.yml'),'utf8'))[0].config.cliPath,'D:/new/mnemon.exe');
 assert.equal(read('qq-bridge/state/current-role.json').role,'测试角色');assert.equal(read('GPT-SoVITS/pet-voice.json').voice,'hutao-playful');
 assert.deepEqual(read('qq-bridge/state/harness-control/settings.json').projects,[]);assert.equal(read('qq-bridge/state/harness-control/settings.json').maxMinutes,10);assert(!JSON.stringify(exported.settings.harnessControl).includes('private-harness-project'));
 const db=new DatabaseSync(path.join(root,'qq-bridge/state/emotional-companion.sqlite'),{readOnly:true});try{assert.equal(JSON.parse(db.prepare('SELECT data FROM settings').get().data).memoryContextLimit,2);assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n,1);}finally{db.close();}
 const historyDb=new DatabaseSync(path.join(root,'qq-bridge/state/conversation-memory.sqlite'),{readOnly:true});try{assert.deepEqual(JSON.parse(historyDb.prepare("SELECT value FROM ocean_meta WHERE key='cognition-settings'").get().value),exported.settings.cognition);assert.equal(historyDb.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n,1);}finally{historyDb.close();}
 const activityDb=new DatabaseSync(path.join(root,'qq-bridge/state/conversation-memory.sqlite'),{readOnly:true});try{const value=JSON.parse(activityDb.prepare("SELECT value FROM ocean_meta WHERE key='activity-settings'").get().value);assert.equal(value.audience,'owner');assert.equal(value.emotionInfluence,false);assert.equal(value.sources.bilibili,false);assert.equal(value.revision,0);assert(!Object.hasOwn(value,'records'));}finally{activityDb.close();}
 assert.equal(read('qq-bridge/companion/bilibili-live-data/config.json').roomId,'');assert.equal(read('qq-bridge/companion/bilibili-live-data/config.json').voice,false);assert.equal(read('qq-bridge/companion/bilibili-live-data/studio.json').autoFollow,true);
 assert.deepEqual(read('qq-bridge/companion/bili-native-data/memory-v2/state.json').records,[]);assert.equal(read('qq-bridge/companion/bili-native-data/memory-v2/state.json').policy.enabled,false);assert.equal(read('qq-bridge/companion/douyin-data/memory-policy.json').enabled,false);
 put('qq-bridge/state/chat-history.json',{private:'keep exactly'});put('engine-home/.credentials.yaml','private credentials unchanged');
 replies.configure({revision:replies.get().revision,replyLength:'natural'});
 const protectedFiles=['qq-bridge/config.json','qq-bridge/state/chat-history.json','engine-home/.credentials.yaml','GPT-SoVITS/pet-voice.json','qq-bridge/companion/qzone-data/settings.json','qq-bridge/companion/reply-options.json','qq-bridge/state/conversation-memory.sqlite','qq-bridge/state/emotional-companion.sqlite','qq-bridge/companion/bilibili-live-data/config.json','qq-bridge/companion/bili-native-data/memory-v2/state.json','qq-bridge/roles/测试角色.md'];
 const hashes=protectedFiles.map(f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex'));
 assert.equal(applyPortableSettings(root,exported.settings,{fresh:false}).changed,false);
 assert.deepEqual(protectedFiles.map(f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')),hashes);
 console.log('PASS portable defaults: positive schemas, nested credential/account/history traps excluded, new-device account/model paths retained, behavior/voice/plugins seeded, memory settings only, existing installation byte-identical.');
}finally{assert(root.startsWith(path.join(os.tmpdir(),'portable-settings-')));fs.rmSync(root,{recursive:true,force:true});}
