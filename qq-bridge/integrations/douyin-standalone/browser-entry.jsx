import './robot-theme.css';
import {installEmbeddedPolling} from '../ui-idle-polling.js';
installEmbeddedPolling();
const originalFetch=window.fetch.bind(window);
const token=()=>localStorage.getItem('consoleToken')||'';
export async function robotAction(action,args={}){
  const response=await originalFetch('/api/douyin',{method:'POST',headers:{'content-type':'application/json','X-Console-Token':token()},body:JSON.stringify({action,args})});
  const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||result.message||'操作未完成');return result;
}
let observer;
function syncTheme(){
  let source;try{if(parent!==window)source=parent.document.documentElement;}catch{}
  const root=document.documentElement;
  root.classList.toggle('embedded',!!source);
  root.dataset.theme=source?.dataset.theme||localStorage.getItem('qq-console-theme')||'light';
  root.style.colorScheme=root.dataset.theme;
  if(source){const style=parent.getComputedStyle(source);for(const name of style)if(name.startsWith('--')&&!name.startsWith('--dsw-')&&!name.startsWith('--ui-'))root.style.setProperty(name,style.getPropertyValue(name));}
}
syncTheme();
try{if(parent!==window){observer=new MutationObserver(syncTheme);observer.observe(parent.document.documentElement,{attributes:true,attributeFilter:['data-theme','style','class']});}}catch{}
addEventListener('storage',syncTheme);addEventListener('pagehide',()=>observer?.disconnect());
history.replaceState(null,'','/douyin/');
window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))throw Error('抖音界面仅连接本机机器人服务');
  try{
    const response=await originalFetch('/api/douyin',{method:'POST',headers:{'content-type':'application/json','X-Console-Token':token()},signal:options.signal,body:JSON.stringify({action:'native',args:{method:options.method||'GET',route:url.pathname+url.search,...(options.body?{body:JSON.parse(options.body)}:{})}})});
    const result=await response.json();return new Response(JSON.stringify(result.ok?result.data:{error:result.error||'抖音操作未完成'}),{status:response.status,headers:{'content-type':'application/json'}});
  }catch(error){throw error;}
};
window.douyinDesktop={
  getSettings:async()=>(await robotAction('settings')).settings,
  saveMediaKey:async input=>(await robotAction('media-key',input)).data,
  openMemoryFolder:()=>robotAction('open-folder',{kind:'memory'}),
  openPersonaFolder:()=>robotAction('open-folder',{kind:'persona'}),
  checkUpdates:async()=>({currentVersion:'1.4.5',status:'current',message:'当前使用机器人集成版。升级由 QQ Bridge 统一管理，保留本地登录和记忆。'})
};
window.robotDouyinAction=robotAction;
// Load after the browser transport and the live palette have been installed.
import('../douyin-agent-upstream/desktop/ui-api/src/main.jsx');
