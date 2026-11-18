import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {PondQrDialog} from './qr-dialog.js';
import {ModelAccountPanel,ModelRunFailure} from './model-account.js';
import {PondMemoryPanel} from './memory-panel.js';
import {PondWorkspace} from './pond-workspace.jsx';
import {installEmbeddedPolling} from '../ui-idle-polling.js';
installEmbeddedPolling();

// The iframe shares its host's current palette; standalone mode uses the same saved theme.
let themeObserver;
const media=matchMedia('(prefers-color-scheme: dark)');
function syncRobotTheme(){
  const root=document.documentElement;
  let source;
  try{if(parent!==window)source=parent.document.documentElement;}catch{}
  if(source){
    root.classList.add('embedded');
    root.dataset.theme=source.dataset.theme==='dark'?'dark':'light';
    const computed=parent.getComputedStyle(source);
    for(const name of computed){if(name.startsWith('--')&&!name.startsWith('--dsw-')&&!name.startsWith('--ui-'))root.style.setProperty(name,computed.getPropertyValue(name));}
    root.style.colorScheme=root.dataset.theme;
  }else{
    const saved=localStorage.getItem('qq-console-theme');
    root.dataset.theme=saved==='dark'||saved==='light'?saved:media.matches?'dark':'light';
  }
}
syncRobotTheme();
try{if(parent!==window){themeObserver=new MutationObserver(syncRobotTheme);themeObserver.observe(parent.document.documentElement,{attributes:true,attributeFilter:['data-theme','style','class']});}}catch{}
addEventListener('storage',syncRobotTheme);media.addEventListener('change',syncRobotTheme);

const token=new URL(location.href).searchParams.get('token')||localStorage.getItem('consoleToken')||'';
if(token)localStorage.setItem('consoleToken',token);
history.replaceState(null,'','/bilibili/');
const nativeFetch=window.fetch.bind(window);
window.fetch=(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin===location.origin&&url.pathname.startsWith('/api/bili-pond/')){
    const headers=new Headers(options.headers);headers.set('X-Console-Token',token);
    return nativeFetch(input,{...options,headers});
  }
  return nativeFetch(input,options);
};
const root=createRoot(document.getElementById('pond-root'));
const dispose=[];
let renderPond;
const slots={
  inject(_name,register){return register();},
  register(slot,render){if(slot.name==='main')renderPond=render;return {dispose(){}};},
};
const pageReact={...React,createElement(type,props,...children){
  if(props?.qqPondWorkspace)return React.createElement(PondWorkspace,{...props.qqPondWorkspace,originalChildren:children});
  if(props&&Object.hasOwn(props,'data-xiaoge-memory'))return React.createElement(PondMemoryPanel);
  if(props&&Object.hasOwn(props,'data-xiaoge-run-failure'))return React.createElement(ModelRunFailure,{provider:props.xiaogeProvider,error:props.xiaogeError,lines:props.xiaogeLines});
  if(props&&Object.hasOwn(props,'data-xiaoge-model-account'))return React.createElement(ModelAccountPanel,{provider:props.xiaogeProvider,model:props.xiaogeModel,error:props.xiaogeError,lines:props.xiaogeLines,onModelsChanged:props.xiaogeRefreshModels,openSession:async()=>{
    const response=await nativeFetch('/api/dsh/web-session',{method:'POST',headers:{'Content-Type':'application/json','X-Console-Token':token},body:'{}'});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'打开登录失败：HTTP '+response.status);return result;
  }});
  if(props?.className==='pond-meta'||props?.className==='pond-foot')return null;
  if(props&&Object.hasOwn(props,'data-bd-qr'))return React.createElement(PondQrDialog,{status:props.xiaogeStatus,tone:props.xiaogeTone,busy:props.xiaogeBusy,onRefresh:props.xiaogeRefresh,onClose:props.xiaogeClose},...children);
  return React.createElement(type,props,...children);
}};
window.__ModuleLoader__={load(definition){
  const module=definition.factory(name=>{if(name==='react')return pageReact;throw new Error('Unsupported browser dependency '+name);});
  module.apply({get:name=>name==='slots'?slots:name==='layout'?{selectPanel:()=>root.render(renderPond())}:undefined,slots,effect:fn=>{const result=fn();if(typeof result==='function')dispose.push(result);}});
  if(!renderPond)throw new Error('原版鱼塘页面未注册');
  root.render(renderPond());
}};
import('../bili-pond-upstream/client.js').catch(()=>{document.getElementById('pond-root').textContent='鱼塘界面加载失败，请刷新后重试。';});
let sizeFrame;
const sizeObserver=new ResizeObserver(()=>{
  if(parent===window)return;
  cancelAnimationFrame(sizeFrame);
  sizeFrame=requestAnimationFrame(()=>parent.postMessage({type:'qq-workbench-height',path:'/bilibili/',height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin));
});
sizeObserver.observe(document.body);
addEventListener('pagehide',()=>{sizeObserver.disconnect();cancelAnimationFrame(sizeFrame);},{once:true});
addEventListener('pagehide',()=>{themeObserver?.disconnect();removeEventListener('storage',syncRobotTheme);media.removeEventListener('change',syncRobotTheme);root.unmount();for(const fn of dispose)fn();});
