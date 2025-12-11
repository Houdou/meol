const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Import backend server
let serverProcess = null;
let mainWindow = null;

// Start backend server
function startBackendServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '../backend/server.js');
    
    // Set PORT environment variable
    process.env.PORT = '3000';
    
    serverProcess = spawn('node', [serverPath], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '3000' }
    });

    let serverReady = false;

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Server]', output);
      if (output.includes('Server running') && !serverReady) {
        serverReady = true;
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[Server Error]', data.toString());
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
      reject(error);
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Server exited with code ${code}`);
      }
    });

    // Timeout fallback
    setTimeout(() => {
      if (!serverReady) {
        console.log('Server starting (assuming ready)...');
        resolve();
      }
    }, 3000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false, // Allow local file access
      sandbox: false // Disable sandbox to allow file drag & drop
    },
    titleBarStyle: 'default',
    backgroundColor: '#f8f9fa',
    show: false, // Don't show until ready
    acceptFirstMouse: true // Enable drag & drop
  });

  // Load the frontend from local server
  mainWindow.loadURL('http://localhost:3000');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle preload script errors
  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('Preload script error:', preloadPath, error);
  });

  // Log when preload script is loaded
  mainWindow.webContents.on('did-frame-finish-load', () => {
    console.log('Page loaded, checking Electron API availability...');
    mainWindow.webContents.executeJavaScript(`
      console.log('Electron API available:', typeof window.electronAPI !== 'undefined');
      console.log('electronAPI object:', window.electronAPI);
    `);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle file drag and drop - prevent navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
  });
  
  // Handle file drops in main process
  mainWindow.webContents.on('dom-ready', () => {
    // Inject script to capture file paths and send to main process via IPC
    mainWindow.webContents.executeJavaScript(`
      (function() {
        // Override drop event to capture file paths
        document.addEventListener('drop', function(e) {
          e.preventDefault();
          e.stopPropagation();
          
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            
            // In Electron, File objects have a path property
            // Try to access it in multiple ways
            let filePath = null;
            
            // Direct access
            if (file.path) {
              filePath = file.path;
            }
            
            // Try descriptor
            if (!filePath) {
              try {
                const desc = Object.getOwnPropertyDescriptor(file, 'path');
                if (desc && desc.value) filePath = desc.value;
              } catch(e) {}
            }
            
            // Try property names
            if (!filePath) {
              try {
                const props = Object.getOwnPropertyNames(file);
                const idx = props.indexOf('path');
                if (idx !== -1) filePath = file[props[idx]];
              } catch(e) {}
            }
            
            if (filePath) {
              // Send to renderer via custom event
              window.dispatchEvent(new CustomEvent('electron-file-dropped', {
                detail: { 
                  path: filePath, 
                  name: file.name || filePath.split(/[\\\\/]/).pop(), 
                  size: file.size || 0 
                }
              }));
            } else {
              console.error('Could not extract file path. File object:', file);
              console.error('File properties:', Object.getOwnPropertyNames(file));
            }
          }
        }, true);
        
        // Prevent default drag behaviors
        document.addEventListener('dragover', function(e) {
          e.preventDefault();
          e.stopPropagation();
        }, true);
      })();
    `);
  });
}

// IPC Handlers
ipcMain.handle('select-file', async (event) => {
  try {
    console.log('File picker dialog opening...');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        {
          name: 'Video/Audio Files',
          extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'mpeg', 'mpg', 'mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'wma']
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    console.log('File picker result:', result);

    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      console.log('File selected:', selectedPath);
      return selectedPath;
    }
    
    console.log('File selection cancelled');
    return null;
  } catch (error) {
    console.error('Error in select-file handler:', error);
    throw error;
  }
});

ipcMain.handle('get-file-path', (event, filePath) => {
  // Validate and return normalized path
  const fs = require('fs');
  const normalizedPath = path.normalize(filePath);
  
  if (fs.existsSync(normalizedPath)) {
    return normalizedPath;
  }
  return null;
});

// Validate file and return file info
ipcMain.handle('validate-file', async (event, filePath) => {
  const fs = require('fs');
  
  try {
    const normalizedPath = path.normalize(filePath);
    const stats = await fs.promises.stat(normalizedPath);
    
    if (stats.isFile()) {
      return {
        path: normalizedPath,
        name: path.basename(normalizedPath),
        size: stats.size,
        exists: true
      };
    }
    
    return { exists: false, error: 'Path is not a file' };
  } catch (error) {
    return { exists: false, error: error.message };
  }
});

// App lifecycle
app.whenReady().then(async () => {
  try {
    await startBackendServer();
    createWindow();
  } catch (error) {
    console.error('Failed to start application:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Cleanup server process
  if (serverProcess) {
    serverProcess.kill();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

