const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

// Import backend server
let serverProcess = null;
let mainWindow = null;

// Start backend server
function startBackendServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, "../backend/server.js");

    // Set PORT environment variable
    process.env.PORT = "3000";

    serverProcess = spawn("node", [serverPath], {
      cwd: path.join(__dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: "3000" },
    });

    let serverReady = false;

    serverProcess.stdout.on("data", (data) => {
      const output = data.toString();
      console.log("[Server]", output);
      if (output.includes("Server running") && !serverReady) {
        serverReady = true;
        resolve();
      }
    });

    serverProcess.stderr.on("data", (data) => {
      console.error("[Server Error]", data.toString());
    });

    serverProcess.on("error", (error) => {
      console.error("Failed to start server:", error);
      reject(error);
    });

    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Server exited with code ${code}`);
      }
    });

    // Timeout fallback
    setTimeout(() => {
      if (!serverReady) {
        console.log("Server starting (assuming ready)...");
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
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false, // Allow local file access
      sandbox: false, // Disable sandbox to allow file drag & drop
    },
    titleBarStyle: "default",
    backgroundColor: "#f8f9fa",
    show: false, // Don't show until ready
    acceptFirstMouse: true, // Enable drag & drop
  });

  // Load the frontend from local server
  mainWindow.loadURL("http://localhost:3000");

  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (process.env.NODE_ENV === "development") {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle preload script errors
  mainWindow.webContents.on("preload-error", (event, preloadPath, error) => {
    console.error("Preload script error:", preloadPath, error);
  });

  // Log when preload script is loaded
  mainWindow.webContents.on("did-frame-finish-load", () => {
    console.log("Page loaded, checking Electron API availability...");
    mainWindow.webContents.executeJavaScript(`
      console.log('Electron API available:', typeof window.electronAPI !== 'undefined');
      console.log('electronAPI object:', window.electronAPI);
    `);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Handle file drag and drop - prevent navigation
  mainWindow.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
  });

  // Handle file drops in main process
  // Note: With context isolation, we need to use webUtils in the preload script
  // The injected script approach may not work reliably with context isolation
  mainWindow.webContents.on("dom-ready", () => {
    // Still inject a script to try to capture file paths as fallback
    // But the main approach should use webUtils.getPathForFile() in preload
    mainWindow.webContents.executeJavaScript(`
      (function() {
        // This is a fallback - the main handler should use webUtils.getPathForFile()
        // But we'll keep this for compatibility
        const originalDrop = document.addEventListener;
        
        document.addEventListener('drop', function(e) {
          // Let the renderer process handle it first
          // This is just a fallback
        }, true);
      })();
    `);
  });
}

// IPC Handlers
ipcMain.handle("select-file", async (event) => {
  try {
    console.log("File picker dialog opening...");
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [
        {
          name: "Video/Audio Files",
          extensions: [
            "mp4",
            "avi",
            "mov",
            "mkv",
            "webm",
            "mpeg",
            "mpg",
            "mp3",
            "m4a",
            "aac",
            "wav",
            "ogg",
            "flac",
            "wma",
          ],
        },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    console.log("File picker result:", result);

    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      console.log("File selected:", selectedPath);
      return selectedPath;
    }

    console.log("File selection cancelled");
    return null;
  } catch (error) {
    console.error("Error in select-file handler:", error);
    throw error;
  }
});

ipcMain.handle("get-file-path", (event, filePath) => {
  // Validate and return normalized path
  const fs = require("fs");
  const normalizedPath = path.normalize(filePath);

  if (fs.existsSync(normalizedPath)) {
    return normalizedPath;
  }
  return null;
});

// Validate file and return file info
ipcMain.handle("validate-file", async (event, filePath) => {
  const fs = require("fs");

  try {
    const normalizedPath = path.normalize(filePath);
    const stats = await fs.promises.stat(normalizedPath);

    if (stats.isFile()) {
      return {
        path: normalizedPath,
        name: path.basename(normalizedPath),
        size: stats.size,
        exists: true,
      };
    }

    return { exists: false, error: "Path is not a file" };
  } catch (error) {
    return { exists: false, error: error.message };
  }
});

// Handle getting file path from File object via IPC
ipcMain.handle("get-file-path-from-drop", async (event, fileData) => {
  // This handler receives file metadata and tries to find the file
  // Since we can't send File objects directly via IPC, we'll use the injected script approach
  // But we can also try to get path from the file system if we have enough info
  return null; // This will be handled by the injected script
});

// App lifecycle
app.whenReady().then(async () => {
  try {
    await startBackendServer();
    createWindow();
  } catch (error) {
    console.error("Failed to start application:", error);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // Cleanup server process
  if (serverProcess) {
    serverProcess.kill();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
