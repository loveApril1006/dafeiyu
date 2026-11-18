import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const [root,inputFile]=process.argv.slice(2);
const require=createRequire(path.join(root,'qq-bridge','package.json'));
const yaml=require('js-yaml');
const settings=JSON.parse(fs.readFileSync(inputFile,'utf8').replace(/^\uFEFF/,''));
const apiMode=!!String(settings.apiKey||'').trim();
const modelSettings=await import(pathToFileURL(path.join(root,'model-settings.mjs')).href);
const requested={...settings,kind:settings.kind||(apiMode?'siliconflow':'account')};
modelSettings.validateModelSettings(requested);
const provider='deepseek-account',model='deepseek-flash';
const write=(relative,data)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data,null,2));};
const configFile=path.join(root,'qq-bridge/config.json');
const cfg=JSON.parse(fs.readFileSync(configFile,'utf8').replace(/^\uFEFF/,''));
requested.owner=String(settings.owner||cfg.ownerQQ||'').trim();
let consoleToken=String(cfg.consoleToken||'').trim();
if(!consoleToken){try{consoleToken=fs.readFileSync(path.join(root,'qq-bridge/state/console-token'),'utf8').trim();}catch{}}
if(!consoleToken)consoleToken=randomBytes(24).toString('hex');
write('qq-bridge/state/console-token',consoleToken);
cfg.dsh={...cfg.dsh,baseUrl:'http://127.0.0.1:17860',authToken:'',provider,model,allowRemote:false};
cfg.snowluma={...cfg.snowluma,external:true,httpUrl:'http://127.0.0.1:3000',wsUrl:'ws://127.0.0.1:3001',accessToken:'',wsAccessToken:'',homeDir:'',launcherPath:'',followDiscoveredEndpoint:false};
cfg.ownerQQ=requested.owner?Number(requested.owner):null;cfg.allow??={private:[],groups:[]};cfg.allow.private=[...new Set([...(cfg.allow.private||[]).map(String),...(requested.owner?[requested.owner]:[])])];cfg.deny??={private:[],groups:[]};cfg.allowAllWhenEmpty=false;cfg.consoleToken='';cfg.petFeed={enabled:false};cfg.sessionCwd=path.join(root,'qq-bridge');
cfg.socialV2??={};cfg.socialV2.voice={...cfg.socialV2.voice,enabled:true,ffmpegPath:path.join(root,'qq-bridge/bin/ffmpeg.exe')};
write('qq-bridge/config.json',cfg);
const vc=JSON.parse(fs.readFileSync(path.join(root,'GPT-SoVITS/pet-voice.json'),'utf8').replace(/^\uFEFF/,''));
for(const [id,voice] of Object.entries(vc.voices)){voice.ref_audio_path=path.join(root,'GPT-SoVITS/voices',id,'reference.wav');for(const style of Object.values(voice.styles||{}))style.ref_audio_path=path.join(root,'GPT-SoVITS/voices',id,path.win32.basename(style.ref_audio_path));}
write('GPT-SoVITS/pet-voice.json',vc);
const fullRelease=fs.existsSync(path.join(root,'full-release.json'));
if(!fullRelease||!fs.existsSync(path.join(root,'engine-home/profiles/web/package.json')))write('engine-home/profiles/web/package.json',{name:'xiaoge-web',private:true,dependencies:{},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}});
const patch=[{id:'llm-pi-ai',name:'@deepseek-ai/dsh-llm-pi-ai',config:{providers:{siliconflow:{displayName:'SiliconFlow',api:'openai-completions',baseURL:'https://api.siliconflow.cn/v1',apiKeyEnv:'SILICONFLOW_API_KEY',defaultInput:['text','image'],models:[{id:'moonshotai/Kimi-K2.7-Code',input:['text','image']}]}}}},{id:'agent-default-model',name:'@deepseek-ai/dsh-agent-default-model',config:{provider,model}},{id:'locale',name:'@deepseek-ai/dsh-client-locale',config:{preference:'zh'}}];
if(!fullRelease||!fs.existsSync(path.join(root,'engine-home/profiles/web/cordis.patch.yml')))write('engine-home/profiles/web/cordis.patch.yml',yaml.dump(patch,{lineWidth:-1,noRefs:true}));
let credentials={version:1,records:{},refs:{}};
try{credentials=yaml.load(fs.readFileSync(path.join(root,'engine-home/.credentials.yaml'),'utf8'))||credentials;}catch{}
credentials.records??={};credentials.refs??={};
write('engine-home/.credentials.yaml',yaml.dump(credentials,{lineWidth:-1,noRefs:true}));
write('qq-bridge/state/mode.json',{mode:'reserved2',closedAgentPreset:''});
write('qq-bridge/state/current-role.json',{role:'大肥鱼',mode:'active'});
write('xiaoge-install.json',{version:1,installedAt:new Date().toISOString(),qqEnabled:!!settings.qqEnabled,desktopPet:{enabled:false,pluginDirectory:'desktop-pet'}});
write('external-qq-gateway.json',{version:1,mode:'external',webUrl:''});
write('安装信息.json',{qqWebUrl:'',qqWebPassword:'',consoleUrl:'http://127.0.0.1:3100',consoleToken});
write('后台登录信息.txt','大肥鱼本机后台登录信息\r\n桥接控制台：http://127.0.0.1:3100/\r\n登录令牌：'+consoleToken+'\r\n\r\nQQ框架需自行从官方下载安装并登录。请在大肥鱼设置中填写OneBot HTTP、正向WebSocket和Token。\r\n');
modelSettings.saveModelSettings(root,requested);
if(fs.existsSync(path.join(root,'full-release.json'))){
  const {configureFull}=await import(pathToFileURL(path.join(root,'configure-full.mjs')).href);
  configureFull(root);
}
console.log('目标路径、模型、QQ端口和独立聊天配置已生成。');

const editionInstall=JSON.parse(fs.readFileSync(path.join(root,'xiaoge-install.json'),'utf8'));editionInstall.edition='full';editionInstall.version=31;write('xiaoge-install.json',editionInstall);

const {migrateReleaseProfile}=await import(pathToFileURL(path.join(root,'qq-bridge/release-profile.mjs')).href);migrateReleaseProfile(root,{fresh:true});
const {hardenInstalledData}=await import(pathToFileURL(path.join(root,'qq-bridge/src/state-acl.mjs')).href);
hardenInstalledData(path.join(root,'qq-bridge'));
