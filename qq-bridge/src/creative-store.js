// Private, bounded storage shared by optional recreation modules.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function readJson(file,fallback){try{const st=fs.statSync(file);if(st.size>8*1024*1024)throw Error('数据文件过大');return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw Error('本地创作数据无法读取，请检查文件；原文件未覆盖');}}
export function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});fs.renameSync(temp,file);}finally{try{fs.unlinkSync(temp);}catch{}}}
export function shortText(value,max=2000){if(typeof value!=='string'||value.length>max)throw Error('文字内容为空或过长');return value.trim();}
export function inside(directory,file){const base=fs.realpathSync(directory),target=fs.realpathSync(file),relative=path.relative(base,target);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('文件不在授权目录');return target;}
export function imageKind(bytes){if(bytes.length<12)return null;if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';if(/^GIF8[79]a$/.test(bytes.toString('ascii',0,6)))return 'gif';if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';return null;}
export function validScope(scope){if(typeof scope!=='string'||!/^((?:private|group):\d{5,16}|local|console)$/.test(scope)||scope.includes(':')&&!Number.isSafeInteger(Number(scope.split(':')[1])))throw Error('会话范围无效');return scope;}
export const FEATURE_NAMES={rpg:'跑团冒险',images:'画图工作台',memes:'表情包'};
