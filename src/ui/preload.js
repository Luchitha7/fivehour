const { contextBridge, ipcRenderer } = require('electron');

// Mac gets the frosted-glass look (see html.mac in popup.html).
if (process.platform === 'darwin') {
  window.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('mac'));
}

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
