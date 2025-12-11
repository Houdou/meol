class Terminal {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.lines = [];
    this.currentProgress = 0;
  }

  // Check if container exists before operations
  _checkContainer() {
    if (!this.container) {
      // Container doesn't exist or is hidden, skip silently
      return false;
    }
    return true;
  }

  addLine(text, className = "") {
    if (!this._checkContainer()) return null;
    
    const line = document.createElement("div");
    line.className = "terminal-line";

    const prompt = document.createElement("span");
    prompt.className = "prompt";
    prompt.textContent = "$";

    const textSpan = document.createElement("span");
    textSpan.className = `text ${className}`;
    textSpan.textContent = text;

    line.appendChild(prompt);
    line.appendChild(textSpan);
    this.container.appendChild(line);

    this.scrollToBottom();
    return line;
  }

  addChunk(text, start, end) {
    if (!text || !text.trim()) return;
    if (!this._checkContainer()) return;

    // Find or create transcription area
    let transcriptionArea = this.container.querySelector(".transcription-area");
    if (!transcriptionArea) {
      // Create transcription area with better styling
      transcriptionArea = document.createElement("div");
      transcriptionArea.className = "transcription-area";
      transcriptionArea.style.marginTop = "1rem";
      transcriptionArea.style.padding = "1.5rem";
      transcriptionArea.style.background = "rgba(255, 255, 255, 0.08)";
      transcriptionArea.style.borderRadius = "8px";
      transcriptionArea.style.borderLeft = "4px solid #58a6ff";
      transcriptionArea.style.maxHeight = "500px";
      transcriptionArea.style.overflowY = "auto";
      this.container.appendChild(transcriptionArea);

      // Add header with live indicator
      const header = document.createElement("div");
      header.className = "transcription-header";
      header.style.marginBottom = "1rem";
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.gap = "0.5rem";
      
      const headerText = document.createElement("span");
      headerText.className = "text info";
      headerText.style.fontSize = "1.1em";
      headerText.style.fontWeight = "600";
      headerText.textContent = "Live Transcription";
      
      const liveIndicator = document.createElement("span");
      liveIndicator.className = "live-indicator";
      liveIndicator.innerHTML = "●";
      liveIndicator.style.color = "#3fb950";
      liveIndicator.style.animation = "pulse 2s infinite";
      
      header.appendChild(headerText);
      header.appendChild(liveIndicator);
      transcriptionArea.appendChild(header);
    }

    // Create chunk container with better visibility
    const chunkContainer = document.createElement("div");
    chunkContainer.className = "chunk-container";
    chunkContainer.style.marginBottom = "1rem";
    chunkContainer.style.padding = "0.75rem";
    chunkContainer.style.background = "rgba(88, 166, 255, 0.1)";
    chunkContainer.style.borderRadius = "6px";
    chunkContainer.style.borderLeft = "3px solid #58a6ff";
    chunkContainer.style.transition = "all 0.3s ease";
    chunkContainer.style.animation = "slideIn 0.3s ease";

    // Add timestamp badge
    if (start !== undefined && end !== undefined) {
      const timeBadge = document.createElement("div");
      timeBadge.className = "time-badge";
      timeBadge.style.display = "inline-block";
      timeBadge.style.padding = "0.25rem 0.5rem";
      timeBadge.style.background = "rgba(88, 166, 255, 0.2)";
      timeBadge.style.borderRadius = "4px";
      timeBadge.style.fontSize = "0.75em";
      timeBadge.style.marginBottom = "0.5rem";
      timeBadge.style.color = "#58a6ff";
      timeBadge.style.fontWeight = "500";
      timeBadge.textContent = `${this.formatTime(start)} → ${this.formatTime(end)}`;
      chunkContainer.appendChild(timeBadge);
    }

    // Add segment text with better styling
    const textDiv = document.createElement("div");
    textDiv.className = "chunk-text";
    textDiv.style.color = "#d4d4d4";
    textDiv.style.fontSize = "1em";
    textDiv.style.lineHeight = "1.6";
    textDiv.style.wordWrap = "break-word";
    textDiv.textContent = text.trim();
    chunkContainer.appendChild(textDiv);

    transcriptionArea.appendChild(chunkContainer);
    this.scrollToBottom();

    // Highlight new chunk briefly
    setTimeout(() => {
      chunkContainer.style.background = "rgba(88, 166, 255, 0.05)";
    }, 1000);
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  typewriter(element, text, speed = 30) {
    let index = 0;
    const timer = setInterval(() => {
      if (index < text.length) {
        element.textContent += text[index];
        index++;
        this.scrollToBottom();
      } else {
        clearInterval(timer);
        element.textContent += " "; // Add space after chunk
      }
    }, speed);
  }

  info(message) {
    this.addLine(message, "info");
  }

  success(message) {
    this.addLine(message, "success");
  }

  error(message) {
    this.addLine(message, "error");
  }

  warning(message) {
    this.addLine(message, "warning");
  }

  updateProgress(progress) {
    this.currentProgress = progress;
    if (!this._checkContainer()) return;

    // Remove existing progress bar if any
    const existingProgress = this.container.querySelector(
      ".progress-container"
    );
    if (existingProgress) {
      existingProgress.remove();
    }

    // Create progress bar
    const progressContainer = document.createElement("div");
    progressContainer.className = "progress-container";

    const progressLine = document.createElement("div");
    progressLine.className = "terminal-line";

    const prompt = document.createElement("span");
    prompt.className = "prompt";
    prompt.textContent = "$";

    const textSpan = document.createElement("span");
    textSpan.className = "text info";
    textSpan.textContent = `Progress: ${progress}%`;

    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    const progressFill = document.createElement("div");
    progressFill.className = "progress-fill";
    progressFill.style.width = `${progress}%`;
    progressBar.appendChild(progressFill);

    progressLine.appendChild(prompt);
    progressLine.appendChild(textSpan);
    progressContainer.appendChild(progressLine);
    progressContainer.appendChild(progressBar);

    this.container.appendChild(progressContainer);
    this.scrollToBottom();
  }

  complete(fullText) {
    if (!this._checkContainer()) return;
    
    this.addLine("", "");
    this.addLine("✓ Transcription completed!", "success");
    this.addLine("", "");

    // Update transcription area with completion status
    const transcriptionArea = this.container.querySelector(
      ".transcription-area"
    );
    if (transcriptionArea) {
      const completeDiv = document.createElement("div");
      completeDiv.className = "terminal-line";
      completeDiv.style.marginTop = "0.5rem";
      completeDiv.style.paddingTop = "0.5rem";
      completeDiv.style.borderTop = "1px solid rgba(255, 255, 255, 0.1)";

      const completeText = document.createElement("span");
      completeText.className = "text success";
      completeText.textContent = "✓ Complete";
      completeDiv.appendChild(completeText);

      transcriptionArea.appendChild(completeDiv);
    }

    this.scrollToBottom();
  }

  clear() {
    if (!this._checkContainer()) return;
    
    this.container.innerHTML = "";
    this.lines = [];
    this.currentProgress = 0;
    this.addLine("Terminal cleared.", "info");
  }

  startTranscription() {
    if (!this._checkContainer()) return;
    
    // Clear any existing transcription area
    const existingArea = this.container.querySelector(".transcription-area");
    if (existingArea) {
      existingArea.remove();
    }
    this.addLine("Starting transcription...", "info");
  }

  scrollToBottom() {
    if (!this._checkContainer()) return;
    this.container.scrollTop = this.container.scrollHeight;
  }
}

// Create global instance
window.terminal = new Terminal("terminal");
