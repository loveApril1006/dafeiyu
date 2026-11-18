import path from 'node:path';
import {readJson,writeJson} from './creative-store.js';
export const ROLE_CATEGORIES=['我的人格','群友游戏流','性格调配流','家庭陪伴流','特色人格流'];
export function readRoleCatalog(root){const value=readJson(path.join(root,'roles/catalog.json'),{version:1,roles:{}});if(!value.roles||typeof value.roles!=='object'||Array.isArray(value.roles))throw Error('人格分类文件格式无效');return value;}
export function roleMetadata(root,name,catalog=readRoleCatalog(root)){
 const row=Object.hasOwn(catalog.roles,name)?catalog.roles[name]:{};
 return {category:typeof row?.category==='string'?row.category:'我的人格',description:typeof row?.description==='string'?row.description:'',tags:Array.isArray(row?.tags)?row.tags.filter(t=>typeof t==='string').slice(0,8):[],source:row?.source||null,adapted:row?.adapted===true};
}
export function validateRoleMetadata(patch){
 const result={};for(const [key,max]of [['category',24],['description',180]])if(Object.hasOwn(patch,key)){if(typeof patch[key]!=='string'||patch[key].trim().length>max||/[\x00-\x1f]/.test(patch[key]))throw Error('人格分类或简介格式无效');result[key]=patch[key].trim()||(key==='category'?'我的人格':'');}
 if(Object.hasOwn(patch,'tags')){if(!Array.isArray(patch.tags)||patch.tags.length>8||patch.tags.some(t=>typeof t!=='string'||t.length>20||/[\x00-\x1f]/.test(t)))throw Error('人格标签最多8个，每个20字符');result.tags=[...new Set(patch.tags.map(t=>t.trim()).filter(Boolean))];}return result;
}
export function saveRoleMetadata(root,name,patch){const next=validateRoleMetadata(patch);if(!Object.keys(next).length)return;const c=readRoleCatalog(root),old=Object.hasOwn(c.roles,name)?c.roles[name]:{};c.roles={...c.roles,[name]:{...old,...next}};writeJson(path.join(root,'roles/catalog.json'),c);}
export function renameRoleMetadata(root,from,to){const c=readRoleCatalog(root);if(!Object.hasOwn(c.roles,from))return;c.roles={...c.roles,[to]:c.roles[from]};delete c.roles[from];writeJson(path.join(root,'roles/catalog.json'),c);}
export function deleteRoleMetadata(root,name){const c=readRoleCatalog(root);if(!Object.hasOwn(c.roles,name))return;delete c.roles[name];writeJson(path.join(root,'roles/catalog.json'),c);}
