const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  fs: {
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
    exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
    readdir: (dirPath) => ipcRenderer.invoke('fs:readdir', dirPath),
    mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
  },
  hash: {
    bcrypt: (pass) => ipcRenderer.invoke('hash:bcrypt', pass),
    verify: (pass, hash) => ipcRenderer.invoke('hash:verify', pass, hash),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getDataPath: () => ipcRenderer.invoke('app:getDataPath'),
    openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
    getDeviceId: () => ipcRenderer.invoke('app:getDeviceId'),
    getSharedFolder: () => ipcRenderer.invoke('app:getSharedFolder'),
    setSharedFolder: () => ipcRenderer.invoke('app:setSharedFolder'),
  },
  db: {
    query: (sql, params) => ipcRenderer.invoke('db:query', { sql, params }),
    run: (sql, params) => ipcRenderer.invoke('db:run', { sql, params }),
    exec: (sql) => ipcRenderer.invoke('db:exec', { sql }),
  },
  zoom: {
    in: () => ipcRenderer.invoke('zoom:in'),
    out: () => ipcRenderer.invoke('zoom:out'),
    reset: () => ipcRenderer.invoke('zoom:reset'),
    getLevel: () => ipcRenderer.invoke('zoom:getLevel'),
    setLevel: (level) => ipcRenderer.invoke('zoom:setLevel', level),
    onChanged: (callback) => {
      ipcRenderer.on('zoom:changed', (_event, level) => callback(level));
    },
  },
});
