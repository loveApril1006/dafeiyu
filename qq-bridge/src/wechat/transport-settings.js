import fs from 'node:fs';
import path from 'node:path';
export const TRANSPORT_DEFAULTS={mode:'dbocr',dataRoot:'',account:'',pollSeconds:5,maxCacheMB:256};
export function transportSettings(value={}){
 const next={...TRANSPORT_DEFAULTS,...value};if(!['dbocr','uia'].includes(next.mode))throw Error('微信接法无效');
 for(const key of ['dataRoot','account'])if(typeof next[key]!=='string'||next[key].length>260||/[\x00-\x1f]/.test(next[key]))throw Error('微信数据路径或账号目录无效');
 next.dataRoot=next.dataRoot.trim();next.account=next.account.trim();
 if(next.dataRoot&&(!/^[A-Za-z]:[\\/]/.test(next.dataRoot)||next.dataRoot.startsWith('\\\\')))throw Error('微信数据目录需为本机磁盘上的绝对路径');
 if(next.account&&(/[\\/:]/.test(next.account)||['.','..'].includes(next.account)))throw Error('账号只填写数据目录名称，不填写完整路径');
 for(const [key,min,max] of [['pollSeconds',5,60],['maxCacheMB',64,2048]])if(!Number.isInteger(next[key])||next[key]<min||next[key]>max)throw Error('微信检查间隔或缓存上限超出范围');
 return Object.fromEntries(Object.keys(TRANSPORT_DEFAULTS).map(k=>[k,next[k]]));
}
export function locateWechatData(configured=''){
 const candidates=[];if(configured)candidates.push(configured);else{
  const config=path.join(process.env.APPDATA||'','Tencent/xwechat/config');
  try{for(const row of fs.readdirSync(config)){if(!row.endsWith('.ini'))continue;const file=path.join(config,row);if(fs.statSync(file).size>8192)continue;const value=fs.readFileSync(file,'utf8').replace(/^[\s\x00"']+|[\s\x00"']+$/g,'');if(/^[A-Za-z]:[\\/]/.test(value))candidates.push(value);}}catch{}
  if(process.env.USERPROFILE)candidates.push(path.join(process.env.USERPROFILE,'Documents'),process.env.USERPROFILE);
 }
 for(const root of [...new Set(candidates)])for(const directory of [root,path.join(root,'xwechat_files'),path.join(root,'WeChat Files')]){
  try{const accounts=fs.readdirSync(directory,{withFileTypes:true}).filter(d=>d.isDirectory()&&fs.existsSync(path.join(directory,d.name,'db_storage'))).map(d=>d.name);if(accounts.length)return {root:directory,accounts};}catch{}
 }
 return {root:configured||'',accounts:[]};
}
