const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('companion', {
  read: () => ipcRenderer.invoke('pet:companion', 'read'),
  status: () => ipcRenderer.invoke('pet:companion', 'status'),
  voices: () => ipcRenderer.invoke('pet:companion', 'voices'),
  selectVoice: voice => ipcRenderer.invoke('pet:companion', 'selectVoice', voice),
  rename: name => ipcRenderer.invoke('pet:companion', 'rename', name),
  probe: model => ipcRenderer.invoke('pet:companion', 'probe', model),
  save: settings => ipcRenderer.invoke('pet:companion', 'save', settings),
  look: () => ipcRenderer.invoke('pet:companion', 'look'),
  workStatus: () => ipcRenderer.invoke('pet:companion', 'work-status'),
  work: value => ipcRenderer.invoke('pet:companion', 'work', value),
});
