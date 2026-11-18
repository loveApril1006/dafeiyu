import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {readJson,writeJson,imageKind,inside,shortText} from './creative-store.js';
const mimes={png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif'};
export function createCreativeReferences(root){
 const home=path.join(root,'companion/creative-data/references'),file=path.join(home,'catalog.json'),bundled=path.join(root,'integrations/creative-standalone/assets/reference-defaults');
 fs.mkdirSync(home,{recursive:true});
 const relative=path.relative(fs.realpathSync(root),fs.realpathSync(home));if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('参考图库必须保存在安装目录内');
 function load(){if(!fs.existsSync(file))reset();const doc=readJson(file,null);if(!doc||!Array.isArray(doc.images)||doc.images.length>8)throw Error('默认参考图库不可读，请恢复默认参考图');return doc;}
 function store(bytes,name){const kind=imageKind(bytes);if(!kind||bytes.length>8*1024*1024)throw Error('参考图片需要是8MB以内的PNG、JPEG、WebP或GIF');const safeName=shortText(name||'参考图',60),id=randomUUID(),filename=id+'.'+kind;fs.writeFileSync(path.join(fs.realpathSync(home),filename),bytes,{flag:'wx'});return {id,filename,name:safeName,mime:mimes[kind],size:bytes.length,enabled:true};}
 function reset(){const manifest=readJson(path.join(bundled,'manifest.json'),null);if(!Array.isArray(manifest?.images)||!manifest.images.length)throw Object.assign(Error('安装包缺少默认角色参考图，请安装完整修复更新包'),{code:'CREATIVE_REFERENCE_ASSETS_MISSING',status:503});const assets=manifest.images.slice(0,8).map(row=>({row,bytes:fs.readFileSync(inside(bundled,path.join(bundled,row.file)))}));for(const {bytes}of assets)if(!imageKind(bytes)||bytes.length>8*1024*1024)throw Error('打包的默认角色参考图无效');const images=assets.map(({row,bytes})=>({...store(bytes,row.name),tags:row.tags||[]})),old=readJson(file,{images:[]});writeJson(file,{version:1,primary:images[0]?.id||'',images});for(const row of old.images||[])removeFile(row);return list();}
 function removeFile(row){if(/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(row.filename||'')){const target=inside(home,path.join(home,row.filename));try{fs.unlinkSync(target);}catch(e){if(e.code!=='ENOENT')throw e;}}}
 function list(){const doc=load();return {ok:true,primary:doc.primary,images:doc.images.map(({filename,...row})=>({...row,url:'/api/creative/reference/'+row.id}))};}
 function action(name,args){if(name==='list')return list();if(name==='reset')return reset();const doc=load();if(name==='upload'){if(doc.images.length>=8)throw Error('最多保存8张默认参考图，请先删除不需要的图片');const row=store(Buffer.from(shortText(args.base64,12*1024*1024),'base64'),args.name);doc.images.push(row);if(!doc.primary)doc.primary=row.id;}
 else{const row=doc.images.find(r=>r.id===args.id);if(!row)throw Error('参考图不存在');if(name==='remove'){doc.images=doc.images.filter(r=>r!==row);if(doc.primary===row.id)doc.primary=doc.images[0]?.id||'';writeJson(file,doc);removeFile(row);return list();}if(name!=='update')throw Error('未知参考图操作');if(Object.hasOwn(args,'name'))row.name=shortText(args.name,60);if(Object.hasOwn(args,'enabled')){if(typeof args.enabled!=='boolean')throw Error('开关格式无效');row.enabled=args.enabled;}if(args.primary===true){doc.primary=row.id;row.enabled=true;}}
 writeJson(file,doc);return list();}
 function asset(id){const row=load().images.find(r=>r.id===id);if(!row)throw Error('参考图不存在');return {file:inside(home,path.join(home,row.filename)),mime:row.mime};}
 function select(prompt,limit=3){const doc=load(),hash=createHash('sha256').update(prompt).digest().readUInt32BE(0),rows=doc.images.filter(r=>r.enabled!==false);rows.sort((a,b)=>{const score=r=>(r.id===doc.primary?100:0)+(r.tags||[]).filter(t=>prompt.includes(t)).length*10;return score(b)-score(a)||((doc.images.indexOf(a)+hash)%Math.max(1,rows.length))-((doc.images.indexOf(b)+hash)%Math.max(1,rows.length));});return rows.slice(0,limit).map(r=>{const v=asset(r.id);return {data:new Uint8Array(fs.readFileSync(v.file)),mediaType:v.mime};});}
 return {list,action,asset,select};
}
