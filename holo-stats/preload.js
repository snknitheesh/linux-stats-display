const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('statsAPI', {
  onStats: (callback) => ipcRenderer.on('stats-update', (_event, data) => callback(data)),
  getDisplayInfo: () => ipcRenderer.invoke('get-display-info'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
});
