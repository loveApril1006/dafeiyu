const {contextBridge,ipcRenderer}=require('electron');
if(process.isMainFrame){
  contextBridge.exposeInMainWorld('xiaogeTelevision',Object.freeze({
    command(action,value){if(['close','pin','smaller','larger','resize-start','resize-end','regions'].includes(action))ipcRenderer.send('xiaoge-tv-window',action,value);},
    resize(dx,dy){if(Number.isFinite(dx)&&Number.isFinite(dy))ipcRenderer.send('xiaoge-tv-resize',dx,dy);}
  }));
}
