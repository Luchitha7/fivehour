const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timer', {
  getSnapshot: () => ipcRenderer.invoke('get-snapshot'),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),
  connect: () => ipcRenderer.invoke('connect'),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  anchorNow: () => ipcRenderer.invoke('anchor-now'),
  quit: () => ipcRenderer.invoke('quit'),
  setOpenAtLogin: (on) => ipcRenderer.invoke('set-open-at-login', on),
  openUpdate: () => ipcRenderer.invoke('open-update'),
  openPopup: () => ipcRenderer.invoke('open-popup'),
  onSnapshot: (fn) => ipcRenderer.on('snapshot', (_e, s) => fn(s)),
});
