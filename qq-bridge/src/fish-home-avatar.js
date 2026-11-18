import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

function jsonc(text){
 let out='',quoted=false,escaped=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){out+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;out+=c;}else if(c==='/'&&text[i+1]==='/'){while(i<text.length&&text[i]!=='\n')i++;out+='\n';}else if(c==='/'&&text[i+1]==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i++;}else out+=c;}
 return JSON.parse(out.replace(/^\uFEFF/,'').replace(/("(?:\\.|[^"\\])*")|,(\s*[}\]])/g,(match,literal,close)=>literal??close));
}
const names={idle:['待机呼吸休闲','东张西望'],chat:['工作状态-忙碌点按','轻快记录'],work:['工作状态-思考冒泡','工作状态-忙碌点按'],watch:['东张西望','待机呼吸休闲'],read:['轻快记录','工作状态-清点归档'],play:['原地专心玩魔方','原地蹲下玩玩具汽车','点击回应-开心跃动'],feed:['大口吃零食','吃白饭'],touch:['点击回应-挠痒咯咯笑','点击回应-开心跃动'],sleep:['睡觉','熟睡','午睡','哈欠连天','待机呼吸休闲'],tidy:['工作状态-清点归档','轻快记录'],create:['工作状态-思考冒泡','轻快记录'],rest:['哈欠连天','超大伸懒腰','待机呼吸休闲'],wander:['螃蟹走路','原地左转奔跑'],sunbathe:['超大伸懒腰','东张西望'],remember:['工作状态-清点归档','轻快记录'],celebrate:['工作状态-雀跃庆祝','点击回应-开心跃动'],sad:['工作状态-垂头叹气冒汗','点击回应-傲娇生气']};
const safeName=s=>typeof s==='string'&&s.length<100&&!/[\\/\x00-\x1f]/.test(s)&&!s.startsWith('.');
export function createFishHomeAvatar({root,now=Date.now}={}){
 const suite=path.dirname(root),user=path.join(suite,'engine-home/dsh-pet');let cached=null,until=0;
 const read=file=>{try{if(fs.statSync(file).size>2*1024*1024)return{};const data=jsonc(fs.readFileSync(file,'utf8'));return data&&typeof data==='object'?data:{};}catch{return{};}};
 function resolve(){if(cached&&now()<until)return cached;until=now()+5000;
  const cfg=read(path.join(user,'main-config.jsonc')),pets=Array.isArray(cfg.pets)?cfg.pets.filter(p=>p&&typeof p==='object'):[],pet=pets.find(p=>p.id==='main'&&p.display!=='hidden')||pets.find(p=>p.display!=='hidden');
  if(!pet)return cached={available:false,clips:{},reason:'尚未找到桌宠形象，暂用小鱼'};
  const asset=safeName(pet.assetRoot)?pet.assetRoot:safeName(pet.id)?pet.id:'main',own=path.join(user,'pet',asset+'-animation'),ownOnly=fs.existsSync(own);
  const bundle=[path.join(suite,'desktop-pet/dsh-pet/dsh-pet/assets/webm'),path.join(suite,'engine-home/profiles/web/node_modules/dsh-pet/assets/webm')].find(fs.existsSync);
  const dirs=ownOnly?[path.join(own,'webm'),own]:[path.join(user,'main-animation/webm'),...(bundle?[bundle]:[])];
  const clips={},files={};for(const[k,candidates]of Object.entries(names)){for(const base of candidates){const name=base+'.webm';for(const dir of dirs){const file=path.join(dir,name);try{const realDir=fs.realpathSync(dir),realFile=fs.realpathSync(file),stat=fs.statSync(realFile);if(path.dirname(realFile)!==realDir||!stat.isFile()||stat.size>30*1024*1024)continue;files[k]={file:realFile,size:stat.size,mtime:stat.mtimeMs};clips[k]=k;break;}catch{}}if(files[k])break;}}
  // A custom pet uses only its own files; never silently replace it with the bundled character.
  if(ownOnly&&!files.idle){for(const dir of dirs)try{const first=fs.readdirSync(dir).find(n=>safeName(n)&&n.endsWith('.webm'));if(first){const f=path.join(dir,first),stat=fs.statSync(f);if(fs.realpathSync(path.dirname(f))===path.dirname(fs.realpathSync(f))&&stat.isFile()&&stat.size<=30*1024*1024){files.idle={file:f,size:stat.size,mtime:stat.mtimeMs};clips.idle='idle';break;}}}catch{}}
  const version=createHash('sha256').update(JSON.stringify([asset,files])).digest('hex').slice(0,20);return cached={available:!!files.idle,clips,version,files,format:'transparent-webm',modelType:'desktop-animation'};
 }
 return{state(){const{files,...view}=resolve();return view;},asset(clip,version){const data=resolve();if(!Object.hasOwn(data.clips,clip)||version!==data.version)return null;return data.files[clip];}};
}
