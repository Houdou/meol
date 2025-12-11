const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  getFilePath: (filePath) => ipcRenderer.invoke('get-file-path', filePath),
  isElectron: true,
  
  // Validate and normalize file path - uses IPC to main process
  validateFile: async (filePath) => {
    return ipcRenderer.invoke('validate-file', filePath);
  }
});

