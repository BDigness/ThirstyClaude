const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('thirsty', {
  onUpdate: (fn) => ipcRenderer.on('update', (_e, s) => fn(s)),
  menu: () => ipcRenderer.send('menu'),
});
