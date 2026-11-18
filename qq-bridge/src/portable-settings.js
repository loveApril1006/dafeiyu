// Positive schemas for distributable preferences. Unknown fields never ship.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import yaml from 'js-yaml';

const fields=(type,names)=>Object.fromEntries(names.split(/\s+/).filter(Boolean).map(k=>[k,type]));
const schema=(booleans='',numbers='',texts='',arrays='')=>({...fields('b',booleans),...fields('n',numbers),...fields('s',texts),...fields('a',arrays)});
const bridgeSchema={
 ...schema('allowAllWhenEmpty','sendDelayMs questionTimeoutMs','agentPreset workspaceTitle ackMessage'),
 dsh:schema('','','reasoningEffort'),role:schema('','maxInjectChars'),security:schema('interceptNotify'),
 snowluma:schema('followDiscoveredEndpoint'),petFeed:schema('enabled'),
 contextMemory:schema('enabled','prepareTimeoutMs maxContextTokens handoverRatio'),
 slang:schema('enabled autoResearch','extractMinMessages extractCooldownMs injectMax','learnerPreset workspaceTitle','inferenceThresholds'),
 social:schema('enabled proactiveEnabled activeDurationEnabled burstEnabled','maxReplyChars contextWindow triggerProbability activeCheckMinMs activeCheckMaxMs idleWindowMs idleRetryProbability proactiveIdleThresholdMs proactiveCheckMinMs proactiveCheckMaxMs proactiveProbability activeReplyDelayMinMs activeReplyDelayMaxMs activeDurationMinMs activeDurationMaxMs skipProbability surrenderProbability idleRetryWaitMs burstIntervalMinMs burstIntervalMaxMs longGapProbability longGapMinMs longGapMaxMs','','mustReplyKeywords'),
 socialV2:{...schema('enabled provideRecommendations','autoReplyCheckMs initialPromptMaxChars','agentPreset'),
  tools:schema('getPrompt getUnread getRecent socialState sendGroup sendPrivate reply sendBurst sendMessage waitMessages feedback getMyRecent getMessageDetail getActiveMembers setWakeConfig markRead memory slangQuery slangSubmit getImages getForwardMsg sendPoke listStickers getStickerImage sendSticker setStickerRemark stickerNote collectSticker getSelfImage sendVoice generateImage'),
  wake:schema('preSleepWaitEnabled recommendedDefaultInfinite recommendedAtMention recommendedNameMention recommendedQuestion recommendedPoke replyEveryMessageWhenActive','preSleepWaitMs staleChatMinutes staleSilentMinutes sleepMinMs sleepMaxMs recommendedSleepMinMs recommendedSleepMaxMs recommendedProbability batchWindowMs maxWakePerMinute maxWakePerHour noActionLimit maxWakeConfigReminders','defaultMode lockMode recommendedHint','recommendedKeywords'),
  send:schema('burstEnabled','burstMaxMessages burstIntervalMinMs burstIntervalMaxMs longGapProbability longGapMinMs longGapMaxMs maxSendPerMinute maxSendPerHour maxMessageChars maxGapMs gapBaseMs gapPerCharMs','recommendedHint'),
  wait:schema('','defaultMs minMs maxMs defaultQuietMs minQuietAfterNewMs'),
  sticker:{...schema('enabled includeInPrompt','syncTtlMs maxListCount promptMaxStickers'),collect:schema('enabled','maxPerMinute maxPerHour maxRemarkChars')},
  voice:schema('enabled allowAbsolutePath autoReadback','maxSeconds maxBytes maxPerMinute maxPerHour defaultVolume','ttsVoice loudness'),
  proactive:schema('enabled','checkIntervalMinMs checkIntervalMaxMs idleThresholdMs probability fixedIntervalMs','intervalMode scope'),
  feedback:schema('notifyOwnerOnError','maxLength'),context:schema('inlineWakeMessages','recentLimit unreadLimit contextWindow wakeMessageLimit wakeRecentLimit wakeMaxChars'),
  media:schema('normalize','maxBytes maxPixels maxCount maxModelBytes maxLongEdge gifFrames gifTile normalizeTimeoutMs')},
 webSearch:{...schema('','maxUses maxTokens maxResults timeoutMs','provider model apiKeyEnv'),baseURL:'u'}
};
const featureSchema={
 rpg:schema('enabled qq desktop','dailyLimit maxTurns'),
 images:{...schema('enabled qq desktop useDefaultReferences','dailyLimit referenceLimit inferenceSteps','provider model editModel size quality'),baseURL:'u'},
 memes:schema('enabled qq desktop generateWhenMissing')
};
const emotionSchema={...schema('enabled respectSchedule workQQReports emotionalReplies personalityLearning allowSwearing','decayPerDay graceDays moodHalfLifeHours dailyGainLimit dailyProactiveLimit voiceProbability stickerProbability memoryContextLimit contextChars expressionIntensity','timezone quietStart quietEnd'),schedule:[schema('quiet','','start end activity')]};
const cognitionSchema=schema('enabled selfTalk reflection review','intervalMinutes minNewMessages dailyCalls dailyTokens');
const liveSchema=schema('questions questionOnly welcome gifts voice sendDanmaku pet useReading shareSummary autoImages','minReplySec userCooldownSec welcomeSec giftMergeSec maxQueue maxAgeSec maxReplyChars','persona');
const studioSchema=schema('autoFollow autoComment allowVideoRequests','commentDelaySec videoRequestCooldownSec videoRequestPlaySec','displayName hostName');
const pondMemorySchema=schema('enabled autoClean','rawDays summaryDays traceDays intervalHours contextChars maxRecords maxPerSweep');
const wechatSchema=schema('enabled autoReply groupMentionOnly','dailyLimit historyTurns maxInputChars maxReplyChars cooldownSeconds');
const qzoneSchema=schema('enabled autoWrite autoPublish withImages scheduled linkCompanion workReports','intervalHours dailyGenerations dailyPublishes minGapHours startHour endHour maxChars visibility','topics imageStyle publishMode');
const biliSchema=schema('enabled peakValley autoRun peakValleyOnly preferSubtitle noon night autoComment circleMode transcribe dmOn overlayMcp reuseRoutes replyToComments guardOn guardOwnAll guardEmoji likeOn favOn','perDay autoRunsPerDay autoGapMinutes perRoundMax perDayMax transcribePerDay minDurationMin maxDurationMin subtitleProbeMax commentPerRound replyPerRound guardDailyCap guardScope guardPerRound guardPollMinutes likePerRound likePerDay favPerDay','asrModel dmMode reportLevel guardTone likeRule likeRuleExtra','keywords');
const petSchema={...schema('notificationsEnabled confineToScreen clickSoundEnabled','chatMemoryRounds','whisperPrompt'),eventsRefreshSec:schema('','balance whisper'),pets:[{...schema('balanceEnabled whisperEnabled workStatusEnabled fixedEnabled','size','id name display whisperPrompt'),position:schema('','marginX marginY x y','corner')}]};
const optionalSchemas={
 mnemon:{...schema('routingGuidance lifecycleEnabled tabEnabled writeEnabled syncEnabled','timeoutMs defaultRecallLimit idleReviewMs','storageScope runtimeUserScope recallMode writebackMode remoteAccess'),
  runtimeMemory:schema('','memoryLimitBytes userLimitBytes maintenanceMaxTokens'),idleReview:schema('enabled runtimeMemory','minIntervalMs maxPerSession maxContextChars maxTokens','provider fallback agentTeams'),skills:schema('evolution autoBacktest hints sidebar'),
  embedding:{...schema('enabled','','model'),endpoint:'u'},recallQuality:schema('','lowScoreThreshold highScoreThreshold candidateMultiplier maxMediumResults maxUnknownResults','policy')},
 'vision-router':schema('progressiveTools routing structuredVisionBootstrap instantDescribe desktopScreenshot cache downscale onboardingSeen','visionDepthMaxCalls visionTurnBudgetMs cacheTtlSeconds cacheMaxEntries downscaleMaxPixels timeoutMs visionTaskTimeoutMs','visionDepth'),
 modsearch:schema('searchProvider xSearch readPage settingsCard')
};
export const OPTIONAL_BUNDLES=['dsh-mnemon','dsh-context','dsh-vision-router','@liustack/modsearch','dsh-pet'];
const builtinVoices=new Set(['keqing-tsundere','hutao-playful','klee-cute','furina-proud']);
const replyLength=value=>['natural','expanded','detailed'].includes(value)?value:'natural';
const read=(file,fallback={})=>{try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch(e){if(e.code==='ENOENT')return fallback;throw Error('无法读取设置：'+path.basename(file));}};
const atomic=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.defaults-'+randomBytes(5).toString('hex');try{fs.writeFileSync(temp,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}};
function merge(base,patch){const out={...base};for(const[k,v]of Object.entries(patch||{}))out[k]=v&&typeof v==='object'&&!Array.isArray(v)?merge(base?.[k],v):structuredClone(v);return out;}
export function createPortableSettings(input){
 const privateValues=new Set();
 function secrets(value,key=''){if(Array.isArray(value))value.forEach(x=>secrets(x,key));else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>secrets(v,k));else if(typeof value==='string'&&value.length>=8&&/token|password|secret|api.?key|cookie|sessdata|skey/i.test(key)&&!/env|path|file|ref/i.test(key))privateValues.add(value);}
 secrets(input);
 const accounts=[input.bridge?.ownerQQ,...Object.values(input.bridge?.allow||{}).flat(),...Object.values(input.bridge?.deny||{}).flat()].filter(Boolean).map(String);
 const redacted=[];
 const clean=(value,label)=>{let s=String(value).slice(0,64000);for(const secret of [...privateValues,...accounts.filter(s=>s.length>=5)])if(s.includes(secret)){s=s.split(secret).join('[本机私有信息]');redacted.push(label);}
  s=s.replace(/(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9_.-]{12,}|(?:SESSDATA|bili_jct|api_key|access_token|password)\s*[=:]\s*[^\s,;]+|wxid_[a-zA-Z0-9_-]+)/gi,'[本机私有信息]').replace(/((?:QQ|群号|用户号|userId)\s*[:：]?\s*)[1-9]\d{4,19}/gi,'$1[本机私有信息]').replace(/[A-Za-z]:[\\/][^\s"'<>]+/g,'[本机路径]');return s;};
 const url=value=>{try{const u=new URL(value);if(u.username||u.password||u.search||u.hash)return undefined;if(!['https:','http:'].includes(u.protocol))return undefined;const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);if(u.protocol==='http:'&&!local)return undefined;if(/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u.hostname))return undefined;if(clean(value,'service-url')!==value)return undefined;return u.href.replace(/\/$/,'');}catch{return undefined;}};
 function select(value,spec,label=''){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const out={};for(const[k,rule]of Object.entries(spec)){const v=value[k],key=label?label+'.'+k:k;if(v===undefined)continue;let next;
   if(rule==='b'&&typeof v==='boolean')next=v;
   else if(rule==='n'&&typeof v==='number'&&Number.isFinite(v))next=v;
   else if(rule==='s'&&typeof v==='string')next=clean(v,key);
   else if(rule==='u'&&typeof v==='string')next=v?url(v):'';
   else if(rule==='a'&&Array.isArray(v)&&v.length<=128)next=v.filter(x=>typeof x==='string'||typeof x==='number').map(x=>typeof x==='string'?clean(x,key):x);
   else if(Array.isArray(rule)&&Array.isArray(v))next=v.slice(0,32).map(x=>select(x,rule[0],key));
   else if(rule&&typeof rule==='object')next=select(v,rule,key);
   if(next!==undefined)out[k]=next;
  }return out;
 }
 const settings={format:1,bridge:select(input.bridge,bridgeSchema,'bridge'),mode:select(input.mode,schema('','','mode closedAgentPreset'),'mode'),creative:select(input.creative,featureSchema,'creative'),wechat:select(input.wechat,wechatSchema,'wechat'),qzone:select(input.qzone,qzoneSchema,'qzone'),bilibili:select(input.bilibili,biliSchema,'bilibili'),bilibiliChat:select(input.bilibiliChat,schema('enabled feedbackEnabled sharedVideosEnabled sharedVideoReplyEnabled rememberSharedVideos sharedTranscribeEnabled','maxRounds dailyRounds minGapMinutes feedbackDailyMax feedbackProbability feedbackDelayMinSeconds feedbackDelayMaxSeconds sharedVideoDailyMax sharedSubtitleChars sharedAudioSeconds'),'bilibiliChat'),harnessControl:select(input.harnessControl,schema('enabled adminEnabled autonomousEnabled notify','dailyAdminTurns dailyAutoTasks maxMinutes maxTokens maxToolCalls'),'harnessControl'),emotion:select(input.emotion,emotionSchema,'emotion'),desktop:select(input.desktop,petSchema,'desktop'),screen:select(input.screen,schema('enabled','interval'),'screen'),optional:{},bundles:{},douyin:{}};
 // Account bindings, media references and counters have no portable defaults.
 settings.bridge.allowAllWhenEmpty=false;
 if(input.bridge?.pricing&&typeof input.bridge.pricing==='object'){
  const pricing=select(input.bridge.pricing,schema('','unit peakMultiplier','version currency symbol'),'pricing');pricing.models={};
  for(const[id,model]of Object.entries(input.bridge.pricing.models||{}))if(/^[a-zA-Z0-9_./:-]{1,120}$/.test(id)&&clean(id,'pricing.model')===id)pricing.models[id]=select(model,{label:'s',off:schema('','cacheHit cacheMiss cacheWrite output'),peak:schema('','cacheHit cacheMiss cacheWrite output')},'pricing.model');
  settings.bridge.pricing=pricing;
 }
 settings.chatPaused=input.chatPaused===true;
 settings.replies={...select(input.replies,schema('text images voice stickers'),'replies'),replyLength:replyLength(input.replies?.replyLength)};
 settings.cognition=select(input.cognition,cognitionSchema,'cognition');
 settings.activities=select(input.activities,{...schema('enabled emotionInfluence'),sources:schema('qzone bilibili douyin live creative harness')},'activities');if(['owner','public'].includes(input.activities?.audience))settings.activities.audience=input.activities.audience;
 settings.bilibiliLive={config:select(input.bilibiliLive?.config,liveSchema,'bilibiliLive.config'),studio:select(input.bilibiliLive?.studio,studioSchema,'bilibiliLive.studio')};
 settings.videoMemory={bilibili:select(input.videoMemory?.bilibili,pondMemorySchema,'videoMemory.bilibili'),douyin:select(input.videoMemory?.douyin,schema('enabled'),'videoMemory.douyin')};
 if(typeof input.companionPersona==='string')settings.companionPersona=clean(input.companionPersona,'companionPersona');
 settings.wechat={...settings.wechat,images:false,files:false,voiceTranscript:false,allowUsers:[],allowGroups:[]};
 const localVoice=select(input.localVoice,schema('enabled','','voice'),'localVoice');if(!builtinVoices.has(localVoice.voice))delete localVoice.voice;settings.localVoice=localVoice;
 settings.tts={};if(builtinVoices.has(input.tts?.voice))settings.tts.voice=input.tts.voice;if(typeof input.tts?.speed==='number'&&input.tts.speed>0&&input.tts.speed<=4)settings.tts.speed=input.tts.speed;
 const idle=input.tts?.performance?.idleUnloadSeconds;if([0,60,300,600,1800].includes(idle))settings.tts.performance={idleUnloadSeconds:idle};
 for(const[id,spec]of Object.entries(optionalSchemas))settings.optional[id]=select(input.optional?.[id],spec,'optional.'+id);
 for(const id of OPTIONAL_BUNDLES)if(typeof input.bundles?.[id]==='boolean')settings.bundles[id]=input.bundles[id];
 const policies={chat:{...schema('enabled','dailyReplyLimit','','groupMentionNames')},video:schema('enabled','dailyMinutes dailyRequests','timeZone','windows'),watchMode:schema('silent'),watchSchedule:schema('enabled'),friendInteractions:schema('enabled')};
 for(const[k,spec]of Object.entries(policies))settings.douyin[k]=select(input.douyin?.[k],spec,'douyin.'+k);
 if(input.douyin?.chat?.dailyReplyLimit===null)settings.douyin.chat.dailyReplyLimit=null;
 settings.douyin.chat.allowlist=[];
 const name=String(input.role?.name||'').trim();
 if(name&&name.length<=40&&!/[\\/:*?"<>|\x00-\x1f]/.test(name)&&!name.includes('..'))settings.role={name,text:clean(input.role.text||'','role.text'),selfName:clean(input.role.selfName||'','role.selfName').slice(0,48),mode:input.role.mode==='silent'?'silent':'active'};
 else settings.role={name:null,mode:input.role?.mode==='silent'?'silent':'active'};
 settings.qzone.publishMode=settings.qzone.publishMode==='mood'?'mood':'scheduled';
 const serialized=JSON.stringify(settings);for(const secret of privateValues)if(serialized.includes(secret))throw Error('导出内容含有本机私有值，已停止');
 return {settings,redactedFields:[...new Set(redacted)],fingerprint:createHash('sha256').update(serialized).digest('hex')};
}

export async function capturePortableSettings(root){
 const file=relative=>path.join(root,relative),bridge=read(file('qq-bridge/config.json'));
 const mode=read(file('qq-bridge/state/mode.json')),roleState=read(file('qq-bridge/state/current-role.json'));
 const role={name:roleState.role,mode:roleState.mode};
 if(role.name&&typeof role.name==='string'&&!/[\\/:*?"<>|]/.test(role.name)&&!role.name.includes('..')){role.text=fs.readFileSync(file('qq-bridge/roles/'+role.name+'.md'),'utf8');role.selfName=read(file('qq-bridge/state/role-identities.json'))[role.name]?.selfName||'';}
 let emotion={};const database=file('qq-bridge/state/emotional-companion.sqlite');if(fs.existsSync(database)){const db=new DatabaseSync(database,{readOnly:true});try{emotion=JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get()?.data||'{}');}finally{db.close();}}
 let cognition={...(await import('./ocean-cognition.js')).COGNITION_DEFAULTS},activities={...(await import('./activity-memory.js')).ACTIVITY_DEFAULTS};const historyDatabase=file('qq-bridge/state/conversation-memory.sqlite');if(fs.existsSync(historyDatabase)){const db=new DatabaseSync(historyDatabase,{readOnly:true});try{if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ocean_meta'").get()){cognition={...cognition,...JSON.parse(db.prepare("SELECT value FROM ocean_meta WHERE key='cognition-settings'").get()?.value||'{}')};activities={...activities,...JSON.parse(db.prepare("SELECT value FROM ocean_meta WHERE key='activity-settings'").get()?.value||'{}')};}}finally{db.close();}}
 const patch=yaml.load(fs.readFileSync(file('engine-home/profiles/web/cordis.patch.yml'),'utf8'))||[];
 const token=bridge.consoleToken||fs.readFileSync(file('qq-bridge/state/console-token'),'utf8').trim();
 let plugins,pluginSource='console';
 try{const response=await fetch('http://127.0.0.1:'+(bridge.consolePort||3100)+'/api/dsh/plugins',{headers:{'X-Console-Token':token},signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error();plugins=await response.json();}catch{
  try{const old=process.env.DSH_HOME;process.env.DSH_HOME=file('engine-home');try{const {NodeApiClient,unwrap}=await import('./dsh-client.js');const api=new NodeApiClient(bridge.dsh.baseUrl,3000,{token:bridge.dsh.authToken||'',tokenExplicit:bridge.dsh.authTokenExplicit===true});const rows=unwrap(await api.callUnary('pluginManager.listBundles',{},AbortSignal.timeout(3000)),'pluginManager/listBundles');plugins={bundles:rows.map(r=>({id:r.name,enabled:r.enabled}))};pluginSource='engine';}finally{if(old===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=old;}}catch{
   const previous=read(file('qq-bridge/packaging/default-settings.json')),pkg=read(file('engine-home/profiles/web/package.json'));
   plugins={bundles:OPTIONAL_BUNDLES.map(id=>({id,enabled:previous.bundles?.[id]??(pkg.dsh?.profile?.bundles||[]).includes(id)}))};pluginSource=previous.bundles?'last-confirmed-plugin-snapshot':'profile';
  }
 }
 const chatPaused=read(file('qq-bridge/state/social-v2.json')).paused===true;
 const bundles=Object.fromEntries((plugins.bundles||[]).filter(r=>OPTIONAL_BUNDLES.includes(r.id)).map(r=>[r.id,r.enabled===true]));
 const home='qq-bridge/companion/douyin-data/state/';
 const result=createPortableSettings({bridge,mode,role,emotion,cognition,activities,bundles,chatPaused,replies:read(file('qq-bridge/companion/reply-options.json')),
  bilibiliLive:{config:read(file('qq-bridge/companion/bilibili-live-data/config.json')),studio:read(file('qq-bridge/companion/bilibili-live-data/studio.json'))},
  videoMemory:{bilibili:read(file('qq-bridge/companion/bili-native-data/memory-v2/state.json')).policy,douyin:read(file('qq-bridge/companion/douyin-data/memory-policy.json'))},
  companionPersona:fs.existsSync(file('qq-bridge/companion/companion-persona.txt'))?fs.readFileSync(file('qq-bridge/companion/companion-persona.txt'),'utf8'):undefined,
  creative:read(file('qq-bridge/companion/creative-data/settings.json')),wechat:read(file('qq-bridge/companion/wechat-data/settings.json')),qzone:read(file('qq-bridge/companion/qzone-data/settings.json')),bilibili:read(file('qq-bridge/companion/bili-native-data/config.json')),bilibiliChat:read(file('qq-bridge/state/bilibili-chat/settings.json')),
  harnessControl:read(file('qq-bridge/state/harness-control/settings.json')),desktop:read(file('engine-home/dsh-pet/main-config.jsonc')),localVoice:read(file('engine-home/dsh-pet/local-voice.json')),screen:read(file('engine-home/dsh-pet/screen-companion.json')),tts:read(file('GPT-SoVITS/pet-voice.json')),
  optional:Object.fromEntries(Object.keys(optionalSchemas).map(id=>[id,patch.find(r=>r.id===id)?.config||{}])),
  douyin:{chat:read(file(home+'chat-policy.json')),video:read(file(home+'video-policy.json')),watchMode:read(file(home+'watch-mode.json')),watchSchedule:read(file(home+'watch-schedule-policy.json')),friendInteractions:read(file(home+'friend-interactions-policy.json'))}});
 return {...result,pluginSource};
}

export function applyPortableSettings(root,settings,{fresh=false}={}){
 if(settings?.format!==1)throw Error('默认设置格式无效');
 if(!fresh)return {changed:false,preservedExisting:true};
 const file=relative=>path.join(root,relative),cfg=merge(read(file('qq-bridge/config.json')),settings.bridge);
 cfg.ownerQQ=read(file('qq-bridge/config.json')).ownerQQ??null; // installation input, never the packaging machine
 cfg.releaseProfile={version:27,name:'用户选择的公开行为默认值',settingsSha256:createHash('sha256').update(JSON.stringify(settings)).digest('hex')};
 atomic(file('qq-bridge/config.json'),cfg);
 atomic(file('qq-bridge/state/mode.json'),settings.mode);
 atomic(file('qq-bridge/state/social-v2.json'),{paused:settings.chatPaused===true,conversations:{}});
 atomic(file('qq-bridge/state/current-role.json'),{role:settings.role.name,mode:settings.role.mode});
 if(settings.role.name){atomic(file('qq-bridge/roles/'+settings.role.name+'.md'),settings.role.text);atomic(file('qq-bridge/default-role.md'),settings.role.text);if(settings.role.selfName)atomic(file('qq-bridge/state/role-identities.json'),{[settings.role.name]:{selfName:settings.role.selfName}});}
 for(const[k,folder]of Object.entries({creative:'creative-data',wechat:'wechat-data',qzone:'qzone-data'}))atomic(file('qq-bridge/companion/'+folder+'/settings.json'),{...settings[k],revision:0});
 atomic(file('qq-bridge/state/bilibili-chat/settings.json'),{...settings.bilibiliChat,revision:0});
 atomic(file('qq-bridge/state/harness-control/settings.json'),{...settings.harnessControl,projects:[],revision:0});
 const replyFile=file('qq-bridge/companion/reply-options.json');atomic(replyFile,{...read(replyFile),...settings.replies,replyLength:replyLength(settings.replies?.replyLength),revision:0});
 if(settings.companionPersona!==undefined)atomic(file('qq-bridge/companion/companion-persona.txt'),settings.companionPersona);
 if(Object.keys(settings.bilibiliLive?.config||{}).length)atomic(file('qq-bridge/companion/bilibili-live-data/config.json'),{...settings.bilibiliLive.config,roomId:''});
 if(Object.keys(settings.bilibiliLive?.studio||{}).length)atomic(file('qq-bridge/companion/bilibili-live-data/studio.json'),settings.bilibiliLive.studio);
 if(Object.keys(settings.videoMemory?.bilibili||{}).length)atomic(file('qq-bridge/companion/bili-native-data/memory-v2/state.json'),{schema:1,policy:settings.videoMemory.bilibili,records:[],seen:[],tombstones:[],journal:[],lastSweep:null});
 if(Object.keys(settings.videoMemory?.douyin||{}).length)atomic(file('qq-bridge/companion/douyin-data/memory-policy.json'),{revision:0,...settings.videoMemory.douyin});
 const biliHome=file('qq-bridge/companion/bili-native-data');atomic(path.join(biliHome,'config.json'),{...settings.bilibili,mentionUid:0,mentionName:'',dmUid:0,guardWhitelist:'',headlessProfile:'headless',reuseRoutes:true,pythonPath:path.join(biliHome,'.venv/Scripts/python.exe'),dshBin:file('qq-bridge/integrations/bili-standalone/dsh-cli.mjs'),dutyProvider:cfg.dsh.provider,dutyModel:cfg.dsh.model,workspace:path.join(biliHome,'persona')});
 const douyinFiles={chat:'chat-policy.json',video:'video-policy.json',watchMode:'watch-mode.json',watchSchedule:'watch-schedule-policy.json',friendInteractions:'friend-interactions-policy.json'};
 for(const[k,name]of Object.entries(douyinFiles))atomic(file('qq-bridge/companion/douyin-data/state/'+name),{version:1,...settings.douyin[k]});
 const model={provider:cfg.dsh.provider,model:cfg.dsh.model};
 const desktop=merge(read(file('engine-home/dsh-pet/main-config.jsonc')),settings.desktop);desktop.chatModel=model;desktop.whisperModel=model;atomic(file('engine-home/dsh-pet/main-config.jsonc'),desktop);
 atomic(file('engine-home/dsh-pet/local-voice.json'),settings.localVoice);atomic(file('engine-home/dsh-pet/screen-companion.json'),{...settings.screen,model});
 const tts=read(file('GPT-SoVITS/pet-voice.json'));Object.assign(tts,settings.tts);atomic(file('GPT-SoVITS/pet-voice.json'),tts);
 const database=file('qq-bridge/state/emotional-companion.sqlite');fs.mkdirSync(path.dirname(database),{recursive:true});const db=new DatabaseSync(database);try{db.exec('CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,data TEXT NOT NULL)');db.prepare('INSERT INTO settings(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(settings.emotion));}finally{db.close();}
 if(Object.keys(settings.cognition||{}).length){const history=new DatabaseSync(file('qq-bridge/state/conversation-memory.sqlite'));try{history.exec('CREATE TABLE IF NOT EXISTS ocean_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');history.prepare("INSERT INTO ocean_meta VALUES('cognition-settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(settings.cognition));}finally{history.close();}}
 if(Object.keys(settings.activities||{}).length){const history=new DatabaseSync(file('qq-bridge/state/conversation-memory.sqlite'));try{history.exec('CREATE TABLE IF NOT EXISTS ocean_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');history.prepare("INSERT INTO ocean_meta VALUES('activity-settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({...settings.activities,revision:0}));}finally{history.close();}}
 const profileFile=file('engine-home/profiles/web/package.json'),pkg=read(profileFile);pkg.dsh??={};pkg.dsh.profile??={};const enabled=new Set(pkg.dsh.profile.bundles||[]);for(const[id,on]of Object.entries(settings.bundles)){if(on)enabled.add(id);else enabled.delete(id);}pkg.dsh.profile.bundles=[...enabled];atomic(profileFile,pkg);
 const patchFile=file('engine-home/profiles/web/cordis.patch.yml'),patch=yaml.load(fs.readFileSync(patchFile,'utf8'))||[];for(const[id,config]of Object.entries(settings.optional)){let row=patch.find(r=>r.id===id);if(!row){row={id};patch.push(row);}row.config=merge(row.config,config);}atomic(patchFile,yaml.dump(patch,{lineWidth:-1,noRefs:true}));
 return {changed:true,settingsSha256:cfg.releaseProfile.settingsSha256};
}
