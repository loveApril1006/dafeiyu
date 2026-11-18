import * as React from 'react';
import {createPortal} from 'react-dom';

const css=`
.xg-bili-qr-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}
.xg-bili-qr-dialog{box-sizing:border-box;width:400px;max-width:100%;max-height:calc(100dvh - 32px);overflow:auto;padding:20px;border-radius:16px;background:var(--surface,#fff);color:var(--text,#18202b);box-shadow:0 20px 70px rgba(0,0,0,.28);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;}
.xg-bili-qr-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
.xg-bili-qr-heading h2{font-size:18px;line-height:1.5;margin:0;}
.xg-bili-qr-dialog button{font:inherit;color:var(--text,#18202b);border:1px solid var(--card-border,#d8dde5);background:var(--surface-subtle,#f4f6f8);padding:7px 14px;border-radius:8px;cursor:pointer;}
.xg-bili-qr-dialog button:focus-visible{outline:3px solid var(--accent,#2563eb);outline-offset:2px;}
.xg-bili-qr-dialog button:disabled{opacity:.6;cursor:wait;}
.xg-bili-qr-dialog [data-bd-qr]{display:flex;flex-direction:column;align-items:center;gap:14px;margin:0;padding:0;}
.xg-bili-qr-dialog [data-bd-qr] img{display:block;box-sizing:content-box;width:240px;max-width:calc(100vw - 112px);height:auto;background:#fff;padding:10px;border:1px solid #e2e6eb;border-radius:8px;image-rendering:pixelated;}
.xg-bili-qr-dialog [data-bd-qr-note]{text-align:center;font-size:13px;color:var(--text-secondary,#5f6877);}
.xg-bili-qr-status{margin:12px 0;text-align:center;min-height:24px;color:var(--text-secondary,#5f6877);}
.xg-bili-qr-status[data-tone=warn]{color:var(--err,#b42318);}
.xg-bili-qr-actions{display:flex;justify-content:center;gap:10px;}
@media(max-height:540px){.xg-bili-qr-dialog{padding:14px;}.xg-bili-qr-dialog [data-bd-qr] img{width:170px;}.xg-bili-qr-status{margin:6px 0;}}
`;

export function PondQrDialog({status,tone,busy,onRefresh,onClose,children}) {
  const panel=React.useRef(null),close=React.useRef(onClose);close.current=onClose;
  const title=React.useId();
  let host=document;
  try{if(parent!==window&&parent.document.body)host=parent.document;}catch{}
  React.useEffect(()=>{
    const previous=host.activeElement,overflow=host.body.style.overflow;
    host.body.style.overflow='hidden';panel.current?.querySelector('button')?.focus();
    const key=event=>{
      if(event.key==='Escape'){event.preventDefault();close.current?.();return;}
      if(event.key!=='Tab')return;
      const buttons=Array.from(panel.current?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')||[]);
      if(!buttons.length)return;
      const first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&(host.activeElement===first||!panel.current.contains(host.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(host.activeElement===last||!panel.current.contains(host.activeElement))){event.preventDefault();first.focus();}
    };
    host.addEventListener('keydown',key,true);
    return()=>{host.removeEventListener('keydown',key,true);host.body.style.overflow=overflow;previous?.focus?.();};
  },[host]);
  return createPortal(React.createElement('div',{className:'xg-bili-qr-overlay',onMouseDown:event=>{if(event.target===event.currentTarget)onClose?.();}},
    React.createElement('style',null,css),
    React.createElement('section',{ref:panel,className:'xg-bili-qr-dialog',role:'dialog','aria-modal':'true','aria-labelledby':title},
      React.createElement('div',{className:'xg-bili-qr-heading'},React.createElement('h2',{id:title},'B站扫码登录'),React.createElement('button',{type:'button','aria-label':'关闭扫码登录',onClick:onClose},'关闭')),
      React.createElement('div',{'data-bd-qr':''},children),
      React.createElement('div',{className:'xg-bili-qr-status','data-tone':tone||'',role:'status','aria-live':'polite'},status||'请使用手机 B站扫描二维码'),
      React.createElement('div',{className:'xg-bili-qr-actions'},React.createElement('button',{type:'button',disabled:busy,onClick:onRefresh},'刷新二维码')))),host.body);
}
