import fs from 'node:fs';import path from 'node:path';
import {readJson,writeJson}from'./creative-store.js';
export const IMAGE_PRESET=Object.freeze({provider:'siliconflow',baseURL:'https://api.siliconflow.cn/v1',model:'Qwen/Qwen-Image',editModel:'Qwen/Qwen-Image-Edit-2509',size:'1024x1024',quality:'',useDefaultReferences:true,referenceLimit:1,inferenceSteps:20});
export function bundledImageDefaults(root){
 const seed=readJson(path.join(root,'integrations/creative-standalone/assets/image-defaults.json'),IMAGE_PRESET);
 const out={...IMAGE_PRESET};
 for(const key of ['provider','baseURL','model','editModel','size','quality'])if(typeof seed[key]==='string'&&seed[key].length<=2048)out[key]=seed[key];
 const url=new URL(out.baseURL);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('打包的生图服务地址无效');
 if(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('打包的生图服务需要HTTPS');
 for(const [key,min,max]of [['referenceLimit',1,3],['inferenceSteps',1,100]])if(Number.isInteger(seed[key])&&seed[key]>=min&&seed[key]<=max)out[key]=seed[key];
 if(typeof seed.useDefaultReferences==='boolean')out.useDefaultReferences=seed.useDefaultReferences;
 return out;
}
// Only initialize absent settings. Existing credentials, custom providers,
// gallery selections and feature switches remain the user's source of truth.
export function seedCreativeSettings(root){
 const file=path.join(root,'companion/creative-data/settings.json');if(fs.existsSync(file))return false;
 writeJson(file,{revision:0,images:bundledImageDefaults(root)});return true;
}
