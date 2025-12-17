// Check DEBUG environment variable and show/hide debug section
(async () => {
  try {
    const response = await fetch("/api/env");
    const data = await response.json();
    const debugSection = document.getElementById("debugSection");
    if (debugSection) {
      if (data.DEBUG) {
        debugSection.style.display = "block";
      } else {
        debugSection.style.display = "none";
      }
    }
  } catch (error) {
    // If API call fails, hide debug section by default
    const debugSection = document.getElementById("debugSection");
    if (debugSection) {
      debugSection.style.display = "none";
    }
  }
})();

// Initialize WebSocket connection
window.wsManager.connect();

// Initialize Wizard
if (window.wizard) {
  window.wizard.init();
}

// transcriptionDisplay is initialized in transcription-display.js
// Just verify it exists
if (!window.transcriptionDisplay) {
  console.warn("[App] transcriptionDisplay not initialized yet");
}

// Initialize Electron file handling
if (window.electronFileHandler) {
  window.electronFileHandler.setupDragAndDrop();

  // Show Electron-specific UI elements
  if (window.electronFileHandler.isElectron) {
    document.body.classList.add("electron");
    // Show Electron-specific help text
    const helpText = document.querySelector(".path-help.electron-only");
    if (helpText) {
      helpText.style.display = "block";
    }
  }
}

// Update wizard step indicators
function updateWizardSteps(currentStep) {
  const steps = document.querySelectorAll(".wizard-step");
  const connectors = document.querySelectorAll(".wizard-connector");

  steps.forEach((step, index) => {
    const stepNum = index + 1;
    step.classList.remove("active", "completed");

    if (stepNum < currentStep) {
      step.classList.add("completed");
      if (connectors[index]) {
        connectors[index].classList.add("completed");
      }
    } else if (stepNum === currentStep) {
      step.classList.add("active");
    }
  });
}

// Wizard navigation handlers
const backToFileBtn = document.getElementById("backToFileBtn");
const backToConfigBtn = document.getElementById("backToConfigBtn");
const backToTranscribeBtn = document.getElementById("backToTranscribeBtn");

if (backToFileBtn) {
  backToFileBtn.addEventListener("click", () => {
    if (window.wizard) {
      window.wizard.goToStep(1);
      updateWizardSteps(1);
    }
  });
}

// Helper function to reset transcription button state (make it globally available)
window.resetTranscriptionButton = function resetTranscriptionButton() {
  const startTranscribeBtn = document.getElementById("startTranscribeBtn");
  if (startTranscribeBtn) {
    startTranscribeBtn.disabled = false;
    startTranscribeBtn.textContent = "Start Transcription";
    console.log("[App] Transcription button state reset");
  }
};

// Helper function to reset progress bar and transcription previews
window.resetTranscriptionProgress = function resetTranscriptionProgress() {
  // Reset progress bar
  const progressFill = document.getElementById("progressFill");
  if (progressFill) {
    progressFill.style.width = "0%";
  }

  const progressPercent = document.getElementById("progressPercent");
  if (progressPercent) {
    progressPercent.textContent = "0%";
  }

  const progressText = document.getElementById("progressText");
  if (progressText) {
    progressText.textContent = "Processing...";
  }

  // Reset time displays
  const currentTimeEl = document.getElementById("currentTime");
  if (currentTimeEl) {
    currentTimeEl.textContent = "00:00";
  }

  const totalTimeEl = document.getElementById("totalTime");
  if (totalTimeEl) {
    totalTimeEl.textContent = "00:00";
  }

  // Show progress container
  const progressContainer = document.getElementById("progressContainer");
  if (progressContainer) {
    progressContainer.classList.remove("hidden");
  }

  // Show processing info
  const processingInfo = document.getElementById("processingInfo");
  if (processingInfo) {
    processingInfo.classList.remove("hidden");
  }

  // Reset status indicator
  const statusIndicator = document.getElementById("statusIndicator");
  if (statusIndicator) {
    statusIndicator.className = "status-indicator status-ready";
    const statusText = statusIndicator.querySelector(".status-text");
    if (statusText) {
      statusText.textContent = "Ready";
    }
    const statusDot = statusIndicator.querySelector(".status-dot");
    if (statusDot) {
      statusDot.className = "status-dot status-ready";
    }
  }

  console.log("[App] Transcription progress and previews reset");
};

if (backToConfigBtn) {
  backToConfigBtn.addEventListener("click", () => {
    if (window.wizard) {
      window.wizard.goToStep(2);
      updateWizardSteps(2);
      // Reset button state when going back to config
      resetTranscriptionButton();
    }
  });
}

if (backToTranscribeBtn) {
  backToTranscribeBtn.addEventListener("click", () => {
    if (window.wizard) {
      window.wizard.goToStep(3);
      updateWizardSteps(3);
    }
  });
}

// Initialize wizard steps
updateWizardSteps(1);

// DOM Elements
const filePathInput = document.getElementById("filePath");
const browseBtn = document.getElementById("browseBtn");
const loadFileBtn = document.getElementById("loadFileBtn");
const fileBrowser = document.getElementById("fileBrowser");
const fileInfo = document.getElementById("fileInfo");
const fileInfoContent = document.getElementById("fileInfoContent");
const configSection = document.getElementById("configSection");
const modelSelect = document.getElementById("model");
const languageSelect = document.getElementById("language");
const taskSelect = document.getElementById("task");
const temperatureSlider = document.getElementById("temperature");
const temperatureValue = document.getElementById("temperatureValue");
const startTranscribeBtn = document.getElementById("startTranscribeBtn");
const clearTerminalBtn = document.getElementById("clearTerminalBtn");

let currentFilePath = null;
let isSelectingFile = false; // Prevent double-click

// Browse button - use Electron file picker if available
browseBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  // Prevent double-click
  if (isSelectingFile) {
    console.log("File selection already in progress, ignoring click");
    return;
  }

  isSelectingFile = true;
  browseBtn.disabled = true;

  try {
    // Check Electron availability
    const isElectron =
      window.electronFileHandler && window.electronFileHandler.isElectron;
    const hasElectronAPI =
      window.electronAPI && typeof window.electronAPI.selectFile === "function";

    console.log("Electron check:", {
      isElectron,
      hasElectronAPI,
      electronAPI: window.electronAPI,
    });

    if (isElectron && hasElectronAPI) {
      console.log("Using Electron file picker");
      const filePath = await window.electronFileHandler.selectFile();

      if (filePath) {
        console.log("File selected:", filePath);
        filePathInput.value = filePath;
        updateLoadFileButtonState();

        if (window.terminal) {
          window.terminal.info(`✓ File selected: ${filePath}`);
        }

        // Auto-load the file
        setTimeout(async () => {
          const loadBtn = document.getElementById("loadFileBtn");
          if (loadBtn && filePathInput.value) {
            console.log("Auto-loading file:", filePathInput.value);
            // Trigger load directly instead of clicking button
            await loadFile(filePathInput.value);
          } else {
            console.error("Load button not found or no file path");
            if (window.terminal) {
              window.terminal.error(
                "Failed to auto-load file. Please click Load File manually."
              );
            }
          }
        }, 300);
      } else {
        if (window.terminal) {
          window.terminal.info("File selection cancelled");
        }
      }
    } else {
      console.log("Using browser file picker (Electron not available)");
      fileBrowser.click();
    }
  } catch (error) {
    console.error("Error selecting file:", error);
    if (window.terminal) {
      window.terminal.error(`Error selecting file: ${error.message}`);
    }
  } finally {
    isSelectingFile = false;
    browseBtn.disabled = false;
  }
});

// File browser handler - only for non-Electron mode
fileBrowser.addEventListener("change", async (e) => {
  // Skip if in Electron mode (use Electron file picker instead)
  if (window.electronFileHandler && window.electronFileHandler.isElectron) {
    return;
  }

  if (e.target.files.length > 0) {
    const file = e.target.files[0];

    // Try to use File System Access API if available (Chrome/Edge)
    if ("showOpenFilePicker" in window) {
      try {
        const [fileHandle] = await window.showOpenFilePicker({
          types: [
            {
              description: "Video/Audio files",
              accept: {
                "video/*": [".mp4", ".avi", ".mov", ".mkv", ".webm", ".mpeg"],
                "audio/*": [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"],
              },
            },
          ],
        });

        // Get the file from the handle
        const selectedFile = await fileHandle.getFile();

        // Unfortunately, we still can't get the full path from File System Access API
        // But we can at least get the file name
        filePathInput.value = selectedFile.name;
        updateLoadFileButtonState();
        window.terminal.info(
          `Selected: ${selectedFile.name} (${(
            selectedFile.size /
            1024 /
            1024
          ).toFixed(2)} MB)`
        );
        window.terminal.warning(
          "Browsers don't allow access to full file paths for security. Please paste the full file path manually, or drag & drop the file into the path input."
        );
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("File picker error:", err);
        }
      }
    } else {
      // Fallback: just show the filename
      filePathInput.value = file.name;
      updateLoadFileButtonState();
      window.terminal.info(`Selected: ${file.name}`);
      window.terminal.warning(
        "Browsers don't allow access to full file paths. Please paste the full file path manually (e.g., C:\\Users\\YourName\\Videos\\file.mp4)"
      );
    }
  }
});

// Load file function (extracted for reuse)
async function loadFile(filePath) {
  const pathToLoad = filePath || filePathInput.value.trim();

  if (!pathToLoad) {
    window.terminal.error("Please enter a file path");
    return;
  }

  window.terminal.info(`Loading file: ${pathToLoad}`);

  try {
    // Send file path to backend
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filePath: pathToLoad }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load file");
    }

    currentFilePath = data.file.path;

    // Update terminal
    if (window.terminal) {
      window.terminal.success(`File loaded: ${data.file.name}`);
    }

    // Display file info
    displayFileInfo(data.file);

    // Load metadata
    const metadataResult = await loadMetadata(pathToLoad);

    // Store total duration for transcription display
    if (
      metadataResult &&
      metadataResult.metadata &&
      metadataResult.metadata.format
    ) {
      const totalDuration = metadataResult.metadata.format.duration || 0;
      if (window.transcriptionDisplay && totalDuration > 0) {
        window.transcriptionDisplay.totalDuration = totalDuration;
      }
    }

    // Move to configuration step
    if (window.wizard) {
      window.wizard.nextStep();
      updateWizardSteps(2);
    } else {
      // Fallback: show config section
      configSection.classList.remove("hidden");
    }
  } catch (error) {
    window.terminal.error(`Error: ${error.message}`);
    fileInfo.classList.add("hidden");
    configSection.classList.add("hidden");
  }
}

// Load file button
loadFileBtn.addEventListener("click", async () => {
  await loadFile();
});

// Load metadata
async function loadMetadata(filePath) {
  try {
    if (window.terminal) {
      window.terminal.info("Extracting metadata...");
    }

    const response = await fetch("/api/metadata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filePath }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to extract metadata");
    }

    displayMetadata(data.metadata);

    if (window.terminal) {
      window.terminal.success("Metadata extracted successfully");
    }

    return data; // Return metadata for use in transcription
  } catch (error) {
    if (window.terminal) {
      window.terminal.warning(`Could not extract metadata: ${error.message}`);
    }
    return null;
  }
}

// Display file info
function displayFileInfo(file) {
  fileInfoContent.innerHTML = `
        <div class="info-item">
            <span class="info-label">Name</span>
            <span class="info-value">${file.name}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Size</span>
            <span class="info-value">${formatFileSize(file.size)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Type</span>
            <span class="info-value">${file.extension.toUpperCase()}</span>
        </div>
    `;
  fileInfo.classList.remove("hidden");
}

// Display metadata
function displayMetadata(metadata) {
  const metadataHTML = `
        <div class="info-item">
            <span class="info-label">Duration:</span>
            <span class="info-value">${
              metadata.format.duration_formatted
            }</span>
        </div>
        <div class="info-item">
            <span class="info-label">Format:</span>
            <span class="info-value">${metadata.format.format_name}</span>
        </div>
        ${
          metadata.video
            ? `
        <div class="info-item">
            <span class="info-label">Resolution:</span>
            <span class="info-value">${metadata.video.width}x${metadata.video.height}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Video:</span>
            <span class="info-value">${metadata.video.codec}</span>
        </div>
        `
            : ""
        }
        ${
          metadata.audio
            ? `
        <div class="info-item">
            <span class="info-label">Audio:</span>
            <span class="info-value">${metadata.audio.codec} @ ${metadata.audio.sample_rate}Hz</span>
        </div>
        `
            : ""
        }
    `;

  fileInfoContent.innerHTML += metadataHTML;
}

// Temperature slider
temperatureSlider.addEventListener("input", (e) => {
  temperatureValue.textContent = parseFloat(e.target.value).toFixed(1);
});

// Chunk size slider update
const chunkSizeInput = document.getElementById("chunkSize");
const chunkSizeValue = document.getElementById("chunkSizeValue");
if (chunkSizeInput && chunkSizeValue) {
  chunkSizeInput.addEventListener("input", (e) => {
    chunkSizeValue.textContent = `${e.target.value}s`;
  });
}

// Start transcription
startTranscribeBtn.addEventListener("click", async () => {
  if (!currentFilePath) {
    window.terminal.error("Please load a file first");
    return;
  }

  if (!window.wsManager.isSocketConnected()) {
    window.terminal.error("WebSocket not connected. Please wait...");
    return;
  }

  const chunkSizeInput = document.getElementById("chunkSize");
  const config = {
    filePath: currentFilePath,
    model: modelSelect.value,
    language: languageSelect.value || null,
    task: taskSelect.value,
    temperature: parseFloat(temperatureSlider.value),
    chunkSize: chunkSizeInput ? parseInt(chunkSizeInput.value) || 30 : 30,
  };

  // Move to transcription step IMMEDIATELY when button is clicked (before API call)
  // This ensures the config screen disappears right away
  if (window.wizard) {
    window.wizard.goToStep(3); // Step 3: Transcription (1-based indexing)
    updateWizardSteps(3);
  }

  // Reset progress bar and previews before starting new transcription
  if (typeof window.resetTranscriptionProgress === "function") {
    window.resetTranscriptionProgress();
  }

  // Start transcription display immediately
  // transcriptionDisplay is already initialized, just ensure container is available
  if (window.transcriptionDisplay) {
    // Ensure container is found (it might be hidden)
    // Check if ensureContainer exists, if not, manually find container
    if (typeof window.transcriptionDisplay.ensureContainer === "function") {
      window.transcriptionDisplay.ensureContainer();
    } else {
      console.warn(
        "[App] ensureContainer not available, manually finding container"
      );
      const container = document.getElementById("transcriptionDisplay");
      if (container && window.transcriptionDisplay) {
        window.transcriptionDisplay.container = container;
        window.transcriptionDisplay.containerId = "transcriptionDisplay";
      }
    }

    if (typeof window.transcriptionDisplay.startTranscription === "function") {
      const totalDuration = window.transcriptionDisplay.totalDuration || 0;
      window.transcriptionDisplay.startTranscription(totalDuration);
    } else {
      console.error(
        "[App] transcriptionDisplay.startTranscription is not a function"
      );
      console.error("[App] transcriptionDisplay:", window.transcriptionDisplay);
      console.error(
        "[App] Available methods:",
        Object.getOwnPropertyNames(window.transcriptionDisplay || {})
      );
    }
  } else {
    console.error("[App] transcriptionDisplay not initialized");
  }

  // Also update terminal for status
  if (window.terminal) {
    window.terminal.startTranscription();
    window.terminal.info(
      `Model: ${config.model}, Task: ${config.task}, Language: ${
        config.language || "Auto"
      }`
    );
    window.terminal.addLine("", "");
  }

  // Disable button immediately to prevent double-clicks
  startTranscribeBtn.disabled = true;
  startTranscribeBtn.textContent = "Transcribing...";

  try {
    const socketId = window.wsManager.getSocketId();
    if (!socketId) {
      window.terminal.error(
        "WebSocket not ready. Please wait a moment and try again."
      );
      return;
    }

    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...config,
        socketId: socketId,
        videoFilePath: currentFilePath, // Pass video file path for screenshots
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to start transcription");
    }

    window.terminal.success("Transcription started. Waiting for results...");
    // Button is already disabled above, no need to disable again
  } catch (error) {
    window.terminal.error(`Error: ${error.message}`);
    startTranscribeBtn.disabled = false;
    startTranscribeBtn.textContent = "Start Transcription";
  }
});

// Reset button after completion
window.addEventListener("transcription-complete", () => {
  startTranscribeBtn.disabled = false;
  startTranscribeBtn.textContent = "Start Transcription";
});

// Clear output button
const clearOutputBtn = document.getElementById("clearOutputBtn");
if (clearOutputBtn) {
  clearOutputBtn.addEventListener("click", () => {
    if (
      window.transcriptionDisplay &&
      typeof window.transcriptionDisplay.clear === "function"
    ) {
      window.transcriptionDisplay.clear();
    }
    if (window.terminal) {
      window.terminal.clear();
    }
  });
}

// Summary step handlers
const downloadSubtitleBtn = document.getElementById("downloadSubtitleBtn");
const openSubtitleFolderBtn = document.getElementById("openSubtitleFolderBtn");

// Make updateSummaryDisplay available globally
window.updateSummaryDisplay = function updateSummaryDisplay(summaryData) {
  if (!summaryData) return;

  const segmentCountEl = document.getElementById("summarySegmentCount");
  const durationEl = document.getElementById("summaryDuration");
  const textLengthEl = document.getElementById("summaryTextLength");
  const subtitlePathEl = document.getElementById("subtitlePathValue");
  const previewTextEl = document.getElementById("previewText");

  if (segmentCountEl) {
    segmentCountEl.textContent = summaryData.segmentCount || 0;
  }

  if (durationEl && summaryData.totalDuration) {
    const hours = Math.floor(summaryData.totalDuration / 3600);
    const mins = Math.floor((summaryData.totalDuration % 3600) / 60);
    const secs = Math.floor(summaryData.totalDuration % 60);
    if (hours > 0) {
      durationEl.textContent = `${hours}:${mins
        .toString()
        .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
      durationEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
    }
  }

  if (textLengthEl && summaryData.fullText) {
    textLengthEl.textContent = summaryData.fullText.length.toLocaleString();
  }

  if (subtitlePathEl) {
    subtitlePathEl.textContent = summaryData.subtitlePath || "Not available";
  }

  if (previewTextEl && summaryData.fullText) {
    // Show first 500 characters as preview
    const preview =
      summaryData.fullText.length > 500
        ? summaryData.fullText.substring(0, 500) + "..."
        : summaryData.fullText;
    previewTextEl.textContent = preview;
  }
};

if (downloadSubtitleBtn) {
  downloadSubtitleBtn.addEventListener("click", () => {
    const subtitlePath = window.transcriptionDisplay?.summaryData?.subtitlePath;
    if (subtitlePath) {
      // In Electron, use file:// protocol
      const link = document.createElement("a");
      link.href = `file://${subtitlePath}`;
      link.download = subtitlePath.split(/[/\\]/).pop();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert("Subtitle file path not available.");
    }
  });
}

if (openSubtitleFolderBtn) {
  openSubtitleFolderBtn.addEventListener("click", () => {
    const subtitlePath = window.transcriptionDisplay?.summaryData?.subtitlePath;
    if (subtitlePath) {
      // Show path info (in Electron, we could add IPC to open folder)
      const pathParts = subtitlePath.split(/[/\\]/);
      const folderPath = pathParts
        .slice(0, -1)
        .join(pathParts[0].includes("\\") ? "\\" : "/");
      alert(
        `Subtitle file location:\n${subtitlePath}\n\nFolder:\n${folderPath}`
      );
    } else {
      alert("Subtitle file path not available.");
    }
  });
}

// Listen for transcription complete to update summary
window.addEventListener("transcription-complete", (event) => {
  // Wait a bit for summary data to be set
  setTimeout(() => {
    if (window.transcriptionDisplay?.summaryData) {
      console.log(
        "[App] Updating summary display with data:",
        window.transcriptionDisplay.summaryData
      );
      updateSummaryDisplay(window.transcriptionDisplay.summaryData);
    } else {
      console.warn(
        "[App] No summary data available when transcription-complete event fired"
      );
      console.log("[App] transcriptionDisplay:", window.transcriptionDisplay);
    }
  }, 500);
});

// Also listen for summary-data-ready event (fired after summaryData is set)
window.addEventListener("summary-data-ready", (event) => {
  if (event.detail) {
    console.log("[App] Summary data ready event received:", event.detail);
    updateSummaryDisplay(event.detail);
  }
});

// Also update summary when step 4 is shown (in case user navigates back/forward)
// This is handled in wizard.js, but we can also listen for custom events
document.addEventListener("wizard-step-changed", (event) => {
  if (event.detail && event.detail.step === 4) {
    // Step 4 was shown, update summary if data is available
    setTimeout(() => {
      if (window.transcriptionDisplay?.summaryData) {
        console.log("[App] Updating summary display when step 4 shown");
        updateSummaryDisplay(window.transcriptionDisplay.summaryData);
      }
    }, 100);
  }
});

// Start another file button - reset all states
const startAnotherFileBtn = document.getElementById("startAnotherFileBtn");
if (startAnotherFileBtn) {
  startAnotherFileBtn.addEventListener("click", () => {
    // Reset transcription display
    if (
      window.transcriptionDisplay &&
      typeof window.transcriptionDisplay.clear === "function"
    ) {
      window.transcriptionDisplay.clear();
      window.transcriptionDisplay.summaryData = null;
    }

    // Reset file path
    currentFilePath = null;
    const filePathInput = document.getElementById("filePath");
    if (filePathInput) {
      filePathInput.value = "";
      updateLoadFileButtonState();
    }

    // Clear file info
    const fileInfo = document.getElementById("fileInfo");
    if (fileInfo) {
      fileInfo.classList.add("hidden");
      const fileInfoContent = document.getElementById("fileInfoContent");
      if (fileInfoContent) {
        fileInfoContent.innerHTML = "";
      }
    }

    // Reset button states
    const startTranscribeBtn = document.getElementById("startTranscribeBtn");
    if (startTranscribeBtn) {
      startTranscribeBtn.disabled = false;
      startTranscribeBtn.textContent = "Start Transcription";
    }

    // Go back to step 1
    if (window.wizard) {
      window.wizard.goToStep(1);
      updateWizardSteps(1);
    }

    // Clear terminal
    if (window.terminal) {
      window.terminal.clear();
    }
  });
}

// Debug panel controls
const toggleDebugBtn = document.getElementById("toggleDebugBtn");
const clearDebugBtn = document.getElementById("clearDebugBtn");

if (toggleDebugBtn) {
  toggleDebugBtn.addEventListener("click", () => {
    if (window.debugLogger) {
      window.debugLogger.toggle();
      toggleDebugBtn.textContent = window.debugLogger.isVisible
        ? "Hide"
        : "Show";
    }
  });
}

if (clearDebugBtn) {
  clearDebugBtn.addEventListener("click", () => {
    if (window.debugLogger) {
      window.debugLogger.clear();
    }
  });
}

// Format file size
function formatFileSize(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Update button state based on file path
function updateLoadFileButtonState() {
  const hasFilePath = filePathInput.value.trim().length > 0;
  if (hasFilePath) {
    loadFileBtn.disabled = false;
    loadFileBtn.classList.remove("disabled", "hidden");
  } else {
    loadFileBtn.disabled = true;
    loadFileBtn.classList.add("disabled", "hidden");
  }
}

// Make it globally accessible for electron-integration.js
window.updateLoadFileButtonState = updateLoadFileButtonState;

// Initialize button state
updateLoadFileButtonState();

// Update button state when file path changes
filePathInput.addEventListener("input", updateLoadFileButtonState);
filePathInput.addEventListener("paste", () => {
  setTimeout(updateLoadFileButtonState, 0);
});

// Allow Enter key to load file
filePathInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !loadFileBtn.disabled) {
    loadFileBtn.click();
  }
});

// Drag and drop support - only if NOT in Electron (Electron handler is in electron-integration.js)
if (!window.electronFileHandler || !window.electronFileHandler.isElectron) {
  const fileSection = document.querySelector(".file-section");
  let dragCounter = 0;

  // Handle drag events on the entire file section
  if (fileSection) {
    fileSection.addEventListener("dragenter", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      filePathInput.classList.add("drag-over");
      fileSection.classList.add("drag-over");
    });

    fileSection.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      filePathInput.classList.add("drag-over");
      fileSection.classList.add("drag-over");
    });

    fileSection.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      // Only remove drag-over if we've left the section entirely
      if (dragCounter === 0) {
        filePathInput.classList.remove("drag-over");
        fileSection.classList.remove("drag-over");
      }
    });

    fileSection.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      filePathInput.classList.remove("drag-over");
      fileSection.classList.remove("drag-over");

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        filePathInput.value = file.name;
        updateLoadFileButtonState();
        window.terminal.info(
          `Dropped: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
        );
        window.terminal.warning(
          "Browsers don't allow access to full file paths. Please paste the full file path manually (e.g., C:\\Users\\YourName\\Videos\\file.mp4)"
        );
      }
    });
  }
}
