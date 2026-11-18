import fs from 'node:fs';
import path from 'node:path';
// Applies only to this robot's isolated Douyin service, not another installation.
export function douyinMemoryEnabled(){
 const home=process.env.XIAOGE_DOUYIN_HOME;if(!home)return true;
 try{const v=JSON.parse(fs.readFileSync(path.join(home,'memory-policy.json'),'utf8'));return v.enabled===true;}catch(e){return e.code==='ENOENT';}
}
