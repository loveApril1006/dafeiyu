// Storage and validation shared by replaceable WeChat transports.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readJson,writeJson} from '../creative-store.js';
import {hardenDir,isHardened} from '../state-acl.mjs';
export {readJson,writeJson};
export const hash=value=>createHash('sha256').update(String(value)).digest('hex');
export function identifier(value){if(typeof value!=='string'||!value||value.length>160||/[\s\x00-\x1f]/.test(value))throw Error('微信会话标识无效');return value;}
export function openWechatStore(root,{harden=true}={}){
 const home=path.join(root,'companion/wechat-data');fs.mkdirSync(home,{recursive:true,mode:0o700});
 if(harden&&!isHardened(home)&&!hardenDir(home).ok)throw Error('无法保护微信本机数据目录');
 for(const dir of ['sessions','media','workspaces'])fs.mkdirSync(path.join(home,dir),{recursive:true,mode:0o700});
 return {home,read:(name,fallback)=>readJson(path.join(home,name),fallback),write:(name,value)=>writeJson(path.join(home,name),value),session:peer=>path.join(home,'sessions',hash(identifier(peer))+'.json')};
}
export function cleanError(error){
 // Transport errors deliberately omit remote response bodies and request URLs.
 return String(error?.publicMessage||error?.message||'微信任务失败').replace(/https?:\/\/\S+/g,'[服务地址]').replace(/Bearer\s+\S+/gi,'Bearer [已隐藏]').replace(/[A-Za-z0-9_+/=-]{40,}/g,'[已隐藏]').slice(0,240);
}
