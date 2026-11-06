const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('thirsty', {
  onUpdate: (fn) => ipcRenderer.on('update', (_e, s) => fn(s)),
  onMove: (fn) => ipcRenderer.on('pos', (_e, p) => fn(p)),
  menu: () => ipcRenderer.send('menu'),
  vessel: (name) => ipcRenderer.send('vessel', name),
});
