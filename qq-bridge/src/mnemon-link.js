import path from 'node:path';
const samePath=(a,b)=>{const x=path.resolve(a),y=path.resolve(b);return process.platform==='win32'?x.toLowerCase()===y.toLowerCase():x===y;};
// Read the plugin's own scoped snapshot. Never fall back to a global store.
export function scopedMnemonSnapshot(result,{workspace,redact=String}={}){
 if(result?.ok!==true||!Array.isArray(result.value?.entries))throw Error('Mnemon 官方接口暂未返回当前会话的记忆');
 const v=result.value,targets={};
 for(const name of ['user','memory']){const t=v.targets?.[name],expected=path.join(workspace,'.mnemon/runtime',name==='user'?'USER.md':'MEMORY.md');if(!t||typeof t.markdownPath!=='string'||!samePath(t.markdownPath,expected))throw Error('Mnemon 返回了其他工作区，未展示其内容');targets[name]={count:v.entries.filter(e=>e.target===name).length,used:Math.max(0,Number(t.used)||0),limit:Math.max(0,Number(t.limit)||0)};}
 const entries=v.entries.filter(e=>['user','memory'].includes(e.target));
 return {verified:true,counts:{user:targets.user.count,project:targets.memory.count},targets,entries:entries.slice(0,100).map(e=>{const text=String(e.content||''),match=/^\[QQ Bridge memory:([a-zA-Z0-9-]+)\]\s+/.exec(text);return{target:e.target,origin:match?'ocean':'mnemon',nodeId:match?.[1]||null,text:String(redact(text.replace(/^\[QQ Bridge memory:[a-zA-Z0-9-]+\]\s+/,''))).slice(0,2000)};}),truncated:entries.length>100};
}
