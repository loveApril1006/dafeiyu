// Tencent QQ official bot credentials are separate from OneBot and model keys.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

export const OFFICIAL_API='https://api.bot.qq.com';
export function officialSettingsFile(root){return path.join(root,'state/qq-official/config.json');}
export function readOfficialSettings(root){
  const file=officialSettingsFile(root);
  try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
  catch(error){if(error.code==='ENOENT')return {enabled:false};throw Error('官方QQ配置无法读取，原文件已保留');}
}
export function atomicOfficialJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+randomBytes(6).toString('hex')+'.tmp';
  try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}
  finally{try{fs.unlinkSync(temp);}catch{}}
}
export function officialPublicSettings(value){return {enabled:value.enabled===true,appId:String(value.appId||''),hasSecret:!!value.appSecret,localPort:value.localPort||17871,allowProactive:value.allowProactive===true,transport:'腾讯官方 WebSocket',apiBase:OFFICIAL_API};}
export function saveOfficialSettings(root,input){
  const old=readOfficialSettings(root),value={...old};
  for(const key of ['enabled','allowProactive'])if(Object.hasOwn(input,key)){if(typeof input[key]!=='boolean')throw Error('官方QQ开关格式无效');value[key]=input[key];}
  if(Object.hasOwn(input,'appId')){const id=String(input.appId).trim();if(id&&!/^\d{4,32}$/.test(id))throw Error('AppID应填写平台提供的数字编号');if(id!==old.appId){value.access={ownerQQ:null,allow:{private:[],groups:[]},deny:{private:[],groups:[]}};value.localToken=randomBytes(32).toString('hex');value.appSecret='';}value.appId=id;}
  if(input.appSecret){const secret=String(input.appSecret).trim();if(!secret||secret.length>512||/[\s\x00-\x1f]/.test(secret))throw Error('AppSecret格式无效');value.appSecret=secret;}
  if(Object.hasOwn(input,'localPort')){const port=Number(input.localPort);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('本机适配端口应为1024—65535');value.localPort=port;}
  value.localPort??=17871;value.localToken||=randomBytes(32).toString('hex');value.version=1;
  if(value.enabled&&(!value.appId||!value.appSecret))throw Error('启用官方机器人前请填写AppID和AppSecret');
  // Do not rewrite ordinary QQ numbers, OneBot addresses, memory or model settings.
  atomicOfficialJson(officialSettingsFile(root),value);return {...officialPublicSettings(value),restartRequired:true};
}
export function officialRuntimeConfig(root,cfg){
  const value=readOfficialSettings(root);if(value.enabled!==true)return cfg;
  const access=value.access||{};
  return {...cfg,qqTransport:'official',qqOfficialProactive:value.allowProactive===true,ownerQQ:access.ownerQQ??null,allow:access.allow||{private:[],groups:[]},deny:access.deny||{private:[],groups:[]},allowAllWhenEmpty:false,
    snowluma:{...cfg.snowluma,external:true,httpUrl:'http://127.0.0.1:'+(value.localPort||17871),accessToken:value.localToken||'',wsAccessToken:'',followDiscoveredEndpoint:false}};
}
export function saveOfficialAccess(root,access){const value=readOfficialSettings(root);atomicOfficialJson(officialSettingsFile(root),{...value,access});}
