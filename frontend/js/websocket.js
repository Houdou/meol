class WebSocketManager {
  constructor() {
    this.socket = null;
    this.socketId = null;
    this.isConnected = false;
  }

  connect() {
    this.socket = io();

    this.socket.on("connect", () => {
      console.log("WebSocket connected");
      this.isConnected = true;
    });

    this.socket.on("socket-connected", (data) => {
      this.socketId = data.socketId;
      console.log("Socket ID received:", this.socketId);
    });

    this.socket.on("disconnect", () => {
      console.log("WebSocket disconnected");
      this.isConnected = false;
      this.socketId = null;
    });

        // Transcription events
        this.socket.on("transcription-chunk", (data) => {
            const logData = {
                id: data.id,
                start: data.start,
                end: data.end,
                text: data.segment?.substring(0, 50) + "...",
                wordsCount: data.words?.length || 0
            };
            
            console.log("[WebSocket] Received transcription chunk:", logData);
            
            if (window.debugLogger) {
                window.debugLogger.log(
                    'WebSocket',
                    `Chunk ${data.id}: "${data.segment?.substring(0, 30)}..." (${data.start}s-${data.end}s)`,
                    'success'
                );
            }
            
            // Add segment to modern transcription display
            if (window.transcriptionDisplay && typeof window.transcriptionDisplay.addSegment === 'function') {
                window.transcriptionDisplay.addSegment(
                    data.segment, 
                    data.start, 
                    data.end, 
                    data.words,
                    data.screenshot || null,
                    data.id  // Pass backend-provided segment ID
                );
            } else {
                const msg = "transcriptionDisplay.addSegment is not available";
                console.warn(`[WebSocket] ${msg}`);
                if (window.debugLogger) {
                    window.debugLogger.log('WebSocket', msg, 'error');
                }
            }
            
            // Also update terminal for status messages
            if (window.terminal) {
                window.terminal.addChunk(data.segment, data.start, data.end);
            }
        });

        // Handle screenshot updates
        this.socket.on("transcription-screenshot", (data) => {
            console.log(`[WebSocket] 📸 Received screenshot for segment ${data.segmentId}: ${data.screenshot}`);
            if (window.transcriptionDisplay && typeof window.transcriptionDisplay.updateSegmentScreenshot === 'function') {
                window.transcriptionDisplay.updateSegmentScreenshot(data.segmentId, data.screenshot);
            } else {
                console.warn(`[WebSocket] transcriptionDisplay.updateSegmentScreenshot is not available`);
            }
        });

        this.socket.on("transcription-progress", (data) => {
            if (window.debugLogger) {
                const timeInfo = data.currentTime && data.totalDuration 
                    ? `${data.currentTime}/${data.totalDuration}s`
                    : `${data.progress}%`;
                window.debugLogger.log('WebSocket', `Progress: ${timeInfo} (${data.progress}%)`, 'info');
            }
            
            // Update modern progress display
            if (window.transcriptionDisplay && typeof window.transcriptionDisplay.updateProgress === 'function') {
                window.transcriptionDisplay.updateProgress(
                    data.progress, 
                    data.currentTime || null,
                    data.totalDuration || null
                );
            } else {
                console.warn('[WebSocket] transcriptionDisplay.updateProgress is not available');
            }
            // Also update terminal
            if (window.terminal) {
                window.terminal.updateProgress(data.progress);
            }
        });

        this.socket.on("transcription-complete", (data) => {
            const textLength = data.fullText?.length || 0;
            console.log(`[WebSocket] Transcription complete. Text length: ${textLength}, Subtitle path: ${data.subtitlePath}`);
            
            if (window.debugLogger) {
                window.debugLogger.log(
                    'WebSocket',
                    `Complete! Total text length: ${textLength} chars`,
                    'success'
                );
            }
            
            // Update modern display
            if (window.transcriptionDisplay && typeof window.transcriptionDisplay.complete === 'function') {
                window.transcriptionDisplay.complete(data.fullText, data.subtitlePath);
            } else {
                console.warn('[WebSocket] transcriptionDisplay.complete is not available');
            }
            // Also update terminal
            if (window.terminal) {
                window.terminal.complete(data.fullText);
            }
            
            // Navigate to summary step
            if (window.wizard) {
                setTimeout(() => {
                    window.wizard.goToStep(4);
                    updateWizardSteps(4);
                }, 1000); // Small delay to show completion message
            }
        });

        this.socket.on("transcription-error", (data) => {
            console.error(`[WebSocket] Transcription error: ${data.message}`);
            
            if (window.debugLogger) {
                window.debugLogger.log('WebSocket', `Error: ${data.message}`, 'error');
            }
            
            // Update modern display
            if (window.transcriptionDisplay && typeof window.transcriptionDisplay.error === 'function') {
                window.transcriptionDisplay.error(data.message);
            } else {
                console.warn('[WebSocket] transcriptionDisplay.error is not available');
            }
            // Also update terminal
            if (window.terminal) {
                window.terminal.error(data.message);
            }
        });

        this.socket.on("transcription-device", (data) => {
            const deviceText = data.device === "cuda" 
                ? `GPU${data.gpu_name ? ` (${data.gpu_name})` : ''}`
                : "CPU";
            
            console.log(`[WebSocket] Device: ${deviceText}`);
            
            if (window.debugLogger) {
                window.debugLogger.log('WebSocket', `Using ${deviceText}`, 'info');
            }
            
            // Show device info in status
            if (window.transcriptionDisplay && typeof window.transcriptionDisplay.updateStatus === 'function') {
                window.transcriptionDisplay.updateStatus('ready', `Using ${deviceText}`);
            }
            // Also update terminal
            if (window.terminal) {
                if (data.device === "cuda") {
                    const gpuInfo = data.gpu_name ? ` (${data.gpu_name})` : "";
                    const cudaInfo = data.cuda_version ? ` - CUDA ${data.cuda_version}` : "";
                    window.terminal.info(`Using GPU${gpuInfo}${cudaInfo}`);
                } else {
                    window.terminal.info("Using CPU");
                }
            }
        });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.socketId = null;
    }
  }

  getSocketId() {
    return this.socketId;
  }

  isSocketConnected() {
    return this.isConnected && this.socketId !== null;
  }
}

// Create global instance
window.wsManager = new WebSocketManager();
