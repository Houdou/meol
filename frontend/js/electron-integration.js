// Electron-specific file handling
class ElectronFileHandler {
  constructor() {
    // Check for Electron in multiple ways
    this.isElectron =
      typeof window !== "undefined" &&
      (window.electronAPI !== undefined ||
        (window.process !== undefined &&
          window.process.versions &&
          window.process.versions.electron) ||
        navigator.userAgent.indexOf("Electron") !== -1);

    console.log("Electron detected:", this.isElectron);
    console.log("window.electronAPI:", typeof window.electronAPI);
  }

  async selectFile() {
    if (!this.isElectron) {
      return null;
    }

    try {
      console.log("Calling electronAPI.selectFile()");
      const filePath = await window.electronAPI.selectFile();
      console.log("selectFile returned:", filePath);
      return filePath;
    } catch (error) {
      console.error("Error selecting file:", error);
      throw error;
    }
  }

  async validateFilePath(filePath) {
    if (!this.isElectron) {
      return filePath;
    }

    try {
      const normalizedPath = await window.electronAPI.getFilePath(filePath);
      return normalizedPath || filePath;
    } catch (error) {
      console.error("Error validating path:", error);
      return filePath;
    }
  }

  setupDragAndDrop() {
    if (!this.isElectron) {
      console.log("Not Electron, skipping drag & drop setup");
      return;
    }

    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () =>
        this.setupDragAndDrop()
      );
      return;
    }

    // Try multiple selectors for drop zone
    const dropZone =
      document.querySelector(".file-section") ||
      document.querySelector("#fileSection") ||
      document.querySelector(".file-input-section") ||
      document.body;
    const filePathInput = document.getElementById("filePath");

    if (!filePathInput) {
      console.error("File path input not found");
      return;
    }

    console.log("Setting up Electron drag & drop handlers");
    console.log("Drop zone:", dropZone);
    console.log("File path input:", filePathInput);

    // Bind preventDefaults to this context
    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Prevent default drag behaviors on entire document
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      document.body.addEventListener(eventName, preventDefaults, false);
      if (dropZone !== document.body) {
        dropZone.addEventListener(eventName, preventDefaults, false);
      }
    });

    // Highlight drop zone when item is dragged over it
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(
        eventName,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (filePathInput) {
            filePathInput.classList.add("drag-over");
          }
          if (dropZone !== document.body && dropZone.classList) {
            dropZone.classList.add("drag-over");
          }
        },
        false
      );
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(
        eventName,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (filePathInput) {
            filePathInput.classList.remove("drag-over");
          }
          if (dropZone !== document.body && dropZone.classList) {
            dropZone.classList.remove("drag-over");
          }
        },
        false
      );
    });

    // Handle dropped files using Electron's file API
    const handleDrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) {
        console.warn("No files in drop event");
        return;
      }

      const file = files[0];
      console.log("File dropped:", file.name, "Size:", file.size);

      if (this.isElectron) {
        // CRITICAL: Get file path IMMEDIATELY from the original File object
        // webUtils.getPathForFile() must be called synchronously on the original File object
        let filePath = null;

        // Method 1: Use webUtils.getPathForFile (recommended by Electron)
        // Call this immediately, synchronously, on the original file object
        if (
          window.electronAPI &&
          typeof window.electronAPI.getPathForFile === "function"
        ) {
          try {
            // Call synchronously - don't await, don't delay
            filePath = window.electronAPI.getPathForFile(file);
            console.log("webUtils.getPathForFile() returned:", filePath);

            if (filePath && filePath.length > 0) {
              console.log("✓ Successfully got path:", filePath);
            } else {
              console.warn("webUtils.getPathForFile() returned empty string");
              filePath = null; // Reset to null so we try fallback
            }
          } catch (err) {
            console.error("webUtils.getPathForFile() threw error:", err);
            filePath = null;
          }
        } else {
          console.warn("window.electronAPI.getPathForFile is not available");
        }

        // Method 2: Try direct path access (fallback for older Electron versions)
        if (!filePath || filePath.length === 0) {
          try {
            // Try accessing path property directly
            if (
              file.path &&
              typeof file.path === "string" &&
              file.path.length > 0
            ) {
              filePath = file.path;
              console.log("✓ Got path from file.path (fallback):", filePath);
            } else {
              // Try using Object.getOwnPropertyDescriptor
              try {
                const pathDesc = Object.getOwnPropertyDescriptor(file, "path");
                if (
                  pathDesc &&
                  pathDesc.value &&
                  typeof pathDesc.value === "string"
                ) {
                  filePath = pathDesc.value;
                  console.log("✓ Got path from descriptor:", filePath);
                }
              } catch (descErr) {
                // Try getOwnPropertyNames as last resort
                try {
                  const props = Object.getOwnPropertyNames(file);
                  const pathIdx = props.indexOf("path");
                  if (pathIdx !== -1) {
                    const pathValue = file[props[pathIdx]];
                    if (
                      pathValue &&
                      typeof pathValue === "string" &&
                      pathValue.length > 0
                    ) {
                      filePath = pathValue;
                      console.log("✓ Got path from property names:", filePath);
                    }
                  }
                } catch (propErr) {
                  console.log("All path access methods failed");
                }
              }
            }
          } catch (err) {
            console.error("Fallback path access failed:", err);
          }
        }

        if (filePath) {
          // Validate the file
          if (window.electronAPI && window.electronAPI.validateFile) {
            try {
              const validation = await window.electronAPI.validateFile(
                filePath
              );
              if (validation.exists) {
                filePathInput.value = validation.path;

                if (window.terminal) {
                  window.terminal.info(`✓ File dropped: ${validation.name}`);
                  window.terminal.info(
                    `  Size: ${(validation.size / 1024 / 1024).toFixed(2)} MB`
                  );
                  window.terminal.info(`  Path: ${validation.path}`);
                }

                // Auto-load the file
                setTimeout(() => {
                  const loadBtn = document.getElementById("loadFileBtn");
                  if (loadBtn) {
                    loadBtn.click();
                  }
                }, 200);
                return;
              }
            } catch (error) {
              console.error("Validation error:", error);
            }
          }

          // Use path directly if validation fails or not available
          filePathInput.value = filePath;
          if (window.terminal) {
            window.terminal.info(`✓ File dropped: ${file.name}`);
            window.terminal.info(`  Path: ${filePath}`);
          }
          setTimeout(() => {
            document.getElementById("loadFileBtn")?.click();
          }, 200);
        } else {
          // Path not available
          console.error("Could not extract file path from dropped file");
          filePathInput.value = file.name;
          if (window.terminal) {
            window.terminal.warning(
              `Could not get full path for: ${file.name}`
            );
            window.terminal.info("Please use Browse button to select the file");
          }
        }
      } else {
        console.warn("Drag & drop not supported in non-Electron environment");
      }
    };

    // Add drop handler to multiple elements - use capture phase
    dropZone.addEventListener("drop", handleDrop, true);
    filePathInput.addEventListener("drop", handleDrop, true);
    document.body.addEventListener("drop", handleDrop, true);

    // Also add dragover handlers to allow drop
    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      if (filePathInput) {
        filePathInput.classList.add("drag-over");
      }
      return false;
    };

    dropZone.addEventListener("dragover", handleDragOver, true);
    filePathInput.addEventListener("dragover", handleDragOver, true);
    document.body.addEventListener("dragover", handleDragOver, true);

    // Also listen for Electron custom event (from injected script in main process)
    if (this.isElectron) {
      window.addEventListener(
        "electron-file-dropped",
        async (event) => {
          const { path: filePath, name, size } = event.detail;
          console.log("Electron file dropped event received:", {
            filePath,
            name,
            size,
          });

          if (filePath) {
            filePathInput.value = filePath;

            if (window.terminal) {
              window.terminal.info(`✓ File dropped: ${name}`);
              if (size > 0) {
                window.terminal.info(
                  `  Size: ${(size / 1024 / 1024).toFixed(2)} MB`
                );
              }
              window.terminal.info(`  Path: ${filePath}`);
            }

            // Validate and auto-load
            if (window.electronAPI && window.electronAPI.validateFile) {
              try {
                const validation = await window.electronAPI.validateFile(
                  filePath
                );
                if (validation.exists) {
                  setTimeout(() => {
                    const loadBtn = document.getElementById("loadFileBtn");
                    if (loadBtn) {
                      loadBtn.click();
                    }
                  }, 200);
                } else {
                  if (window.terminal) {
                    window.terminal.error(
                      `File validation failed: ${validation.error}`
                    );
                  }
                }
              } catch (error) {
                console.error("Validation error:", error);
                // Still try to load even if validation fails
                setTimeout(() => {
                  document.getElementById("loadFileBtn")?.click();
                }, 200);
              }
            } else {
              // Auto-load without validation
              setTimeout(() => {
                document.getElementById("loadFileBtn")?.click();
              }, 200);
            }
          }
        },
        false
      );
    }
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }
}

// Initialize Electron file handler
window.electronFileHandler = new ElectronFileHandler();
