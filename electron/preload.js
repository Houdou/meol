const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  selectFile: () => ipcRenderer.invoke("select-file"),
  getFilePath: (filePath) => ipcRenderer.invoke("get-file-path", filePath),
  isElectron: true,

  // Validate and normalize file path - uses IPC to main process
  validateFile: async (filePath) => {
    return ipcRenderer.invoke("validate-file", filePath);
  },

  // Get file path from File object using webUtils (recommended Electron API)
  getPathForFile: (file) => {
    try {
      console.log("[Preload] getPathForFile called with:", {
        name: file?.name,
        type: file?.constructor?.name,
        isFile: file instanceof File,
        hasPath: "path" in file,
      });

      // First try webUtils.getPathForFile (recommended method)
      let filePath = webUtils.getPathForFile(file);
      console.log(
        "[Preload] webUtils.getPathForFile returned:",
        filePath,
        "type:",
        typeof filePath
      );

      // If webUtils returns empty string, try direct path access
      // This might work in some Electron versions even with context isolation
      if (!filePath || filePath === "") {
        try {
          // Try to access path property directly
          if (file.path) {
            filePath = file.path;
            console.log("[Preload] Got path from file.path:", filePath);
          } else {
            // Try using Object.getOwnPropertyDescriptor
            const desc = Object.getOwnPropertyDescriptor(file, "path");
            if (desc && desc.value) {
              filePath = desc.value;
              console.log("[Preload] Got path from descriptor:", filePath);
            } else {
              // Try getOwnPropertyNames
              const props = Object.getOwnPropertyNames(file);
              if (props.includes("path")) {
                filePath = file[props[props.indexOf("path")]];
                console.log(
                  "[Preload] Got path from property names:",
                  filePath
                );
              }
            }
          }
        } catch (err) {
          console.log("[Preload] Direct path access failed:", err);
        }
      }

      return filePath || "";
    } catch (error) {
      console.error("[Preload] Error getting path for file:", error);
      console.error("[Preload] Error details:", error.message, error.stack);
      return "";
    }
  },

  // Open folder in file explorer and select the file
  openFolder: async (filePath) => {
    return ipcRenderer.invoke("open-folder", filePath);
  },
});
