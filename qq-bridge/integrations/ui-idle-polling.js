// Pause display polling in hidden robot panels without stopping server-side jobs.
export function installEmbeddedPolling(win=window){
  const timers=new Map();let serial=-1,disposed=false;
  const set=win.setInterval.bind(win),clear=win.clearInterval.bind(win),clearTimeout=win.clearTimeout.bind(win);
  const active=()=>{
    if(win.document.hidden)return false;
    try{let frame=win.frameElement;while(frame){if(frame.hidden||frame.closest('[hidden]')?.hidden||frame.closest('[data-page]')?.hidden)return false;frame=frame.ownerDocument?.defaultView?.frameElement;}return true;}catch{return true;}
  };
  const tick=entry=>{
    if(!active()||entry.running||!timers.has(entry.id))return;
    entry.running=true;
    try{Promise.resolve(entry.fn(...entry.args)).then(()=>entry.running=false,error=>{entry.running=false;win.reportError?.(error);});}
    catch(error){entry.running=false;win.reportError?.(error);}
  };
  const sync=()=>{for(const entry of timers.values()){
    if(active()&&entry.handle===null){entry.handle=set(()=>tick(entry),entry.ms);tick(entry);}
    else if(!active()&&entry.handle!==null){clear(entry.handle);entry.handle=null;}
  }};
  win.setInterval=(fn,ms,...args)=>{
    if(typeof fn!=='function')return set(fn,ms,...args);
    const entry={id:serial--,fn,ms,args,handle:null,running:false};timers.set(entry.id,entry);
    if(active())entry.handle=set(()=>tick(entry),ms);
    return entry.id;
  };
  const remove=id=>{const entry=timers.get(id);if(entry){if(entry.handle!==null)clear(entry.handle);timers.delete(id);return true;}return false;};
  win.clearInterval=id=>{if(!remove(id))clear(id);};
  win.clearTimeout=id=>{if(!remove(id))clearTimeout(id);};
  let observer;
  try{const panel=win.frameElement?.closest('[data-page]');let frame=win.frameElement;if(panel||frame?.ownerDocument){observer=new win.MutationObserver(sync);if(panel)observer.observe(panel,{attributes:true,attributeFilter:['hidden']});while(frame){for(let el=frame;el;el=el.parentElement)observer.observe(el,{attributes:true,attributeFilter:['hidden']});frame=frame.ownerDocument?.defaultView?.frameElement;}}}catch{}
  win.document.addEventListener('visibilitychange',sync);
  const dispose=()=>{if(disposed)return;disposed=true;observer?.disconnect();win.document.removeEventListener('visibilitychange',sync);for(const id of [...timers.keys()])remove(id);win.setInterval=set;win.clearInterval=clear;win.clearTimeout=clearTimeout;};
  win.addEventListener('pagehide',dispose,{once:true});
  return dispose;
}
