// Modern transcription display component
class TranscriptionDisplay {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);

    // If container not found, try to find it later
    if (!this.container) {
      console.warn(
        `[TranscriptionDisplay] Container "${containerId}" not found during initialization. Will retry when needed.`
      );
    }

    this.segments = {}; // Use object to support ID-based lookup
    this.currentProcessingTime = 0;
    this.totalDuration = 0;
    this.isTranscribing = false;
    this.lastProgress = 0;

    // Method to ensure container is available
    this.ensureContainer = function () {
      if (!this.container) {
        this.container = document.getElementById(this.containerId);
        if (this.container) {
          console.log(
            `[TranscriptionDisplay] Container "${this.containerId}" found`
          );
        }
      }
      return !!this.container;
    };
  }

  startTranscription(totalDuration = 0) {
    // Ensure container is available
    if (!this.ensureContainer()) {
      console.error(
        "[TranscriptionDisplay] Container not available in startTranscription"
      );
      return;
    }

    this.totalDuration = totalDuration;
    this.currentProcessingTime = 0;
    this.isTranscribing = true;
    this.segments = {}; // Use object to support ID-based lookup
    this.lastProgress = 0;

    // Clear container
    this.container.innerHTML = "";

    // Show initial message
    const initialMsg = document.createElement("div");
    initialMsg.className = "empty-state";
    initialMsg.innerHTML =
      "<p>Starting transcription... Processing audio...</p>";
    this.container.appendChild(initialMsg);

    // Update status
    if (typeof this.updateStatus === "function") {
      this.updateStatus("transcribing", "Transcribing...");
    } else {
      console.warn("[TranscriptionDisplay] updateStatus method not available");
    }

    // Show progress
    const progressContainer = document.getElementById("progressContainer");
    if (progressContainer) {
      progressContainer.classList.remove("hidden");
    }

    // Show processing info
    const processingInfo = document.getElementById("processingInfo");
    if (processingInfo) {
      processingInfo.classList.remove("hidden");
    }

    // Update total time
    const totalTimeEl = document.getElementById("totalTime");
    if (totalTimeEl && this.totalDuration > 0) {
      totalTimeEl.textContent = this.formatTime(this.totalDuration);
    } else if (totalTimeEl) {
      totalTimeEl.textContent = "--:--";
    }
  }

  addSegment(
    text,
    start,
    end,
    words = [],
    screenshot = null,
    segmentId = null
  ) {
    // Ensure container is available
    if (!this.ensureContainer()) {
      console.error(
        "[TranscriptionDisplay] Container not available in addSegment"
      );
      return;
    }

    // Use provided segmentId or generate one
    const segmentCount = Object.values(this.segments).filter((s) => s).length;
    const id = segmentId !== null ? segmentId : segmentCount;

    console.log(`[TranscriptionDisplay] addSegment called:`, {
      id,
      text: text?.substring(0, 50) + "...",
      start,
      end,
      hasWords: words?.length > 0,
      hasScreenshot: !!screenshot,
    });

    if (!text || !text.trim()) {
      console.warn(`[TranscriptionDisplay] Empty text segment, skipping`);
      return;
    }

    // Remove empty state message if present
    const emptyState = this.container.querySelector(".empty-state");
    if (emptyState) {
      emptyState.remove();
    }

    const segment = {
      id: id,
      text: text.trim(),
      start,
      end,
      words,
      screenshot,
    };

    // Store segment by ID (may overwrite if ID already exists)
    this.segments[id] = segment;

    // Create segment element
    const segmentEl = document.createElement("div");
    segmentEl.className = "transcription-segment";
    segmentEl.dataset.segmentId = id;

    // Preview image (if available)
    if (screenshot) {
      const previewDiv = document.createElement("div");
      previewDiv.className = "segment-preview";

      const img = document.createElement("img");
      img.src = screenshot;
      img.alt = `Frame at ${this.formatTime(start)}`;
      img.onerror = () => {
        previewDiv.style.display = "none";
      };

      const subtitleOverlay = document.createElement("div");
      subtitleOverlay.className = "subtitle-overlay";
      subtitleOverlay.textContent = text.trim().substring(0, 60);

      previewDiv.appendChild(img);
      previewDiv.appendChild(subtitleOverlay);
      segmentEl.appendChild(previewDiv);
    }

    // Time badge
    const timeBadge = document.createElement("div");
    timeBadge.className = "segment-time";
    timeBadge.textContent = `${this.formatTime(start)}`;
    segmentEl.appendChild(timeBadge);

    // Text content
    const textEl = document.createElement("div");
    textEl.className = "segment-text";
    textEl.textContent = text.trim();
    segmentEl.appendChild(textEl);

    // Add to container with animation
    this.container.appendChild(segmentEl);

    // Scroll to bottom
    this.scrollToBottom();

    // Store current processing time (don't update UI here to avoid flickering)
    this.currentProcessingTime = end;

    // Highlight new segment
    setTimeout(() => {
      segmentEl.classList.add("segment-visible");
    }, 10);
  }

  updateSegmentScreenshot(segmentId, screenshotPath) {
    console.log(
      `[TranscriptionDisplay] updateSegmentScreenshot called: segmentId=${segmentId}, path=${screenshotPath}`
    );
    const segmentEl = this.container.querySelector(
      `[data-segment-id="${segmentId}"]`
    );
    console.log(
      `[TranscriptionDisplay] Found segment element:`,
      segmentEl ? "yes" : "no"
    );

    if (!segmentEl) {
      console.warn(
        `[TranscriptionDisplay] Segment ${segmentId} not found in DOM. Available segments:`,
        Array.from(this.container.querySelectorAll("[data-segment-id]")).map(
          (el) => el.dataset.segmentId
        )
      );
      return;
    }

    if (!screenshotPath) {
      console.warn(
        `[TranscriptionDisplay] No screenshot path provided for segment ${segmentId}`
      );
      return;
    }

    // Check if preview already exists
    let previewDiv = segmentEl.querySelector(".segment-preview");
    if (!previewDiv) {
      previewDiv = document.createElement("div");
      previewDiv.className = "segment-preview";
      segmentEl.insertBefore(previewDiv, segmentEl.firstChild);
      console.log(
        `[TranscriptionDisplay] Created preview div for segment ${segmentId}`
      );
    }

    const img =
      previewDiv.querySelector("img") || document.createElement("img");
    img.src = screenshotPath;
    img.alt = `Frame at ${this.formatTime(
      this.segments[segmentId]?.start || 0
    )}`;
    img.onload = () => {
      console.log(
        `[TranscriptionDisplay] ✅ Screenshot loaded successfully for segment ${segmentId}`
      );
    };
    img.onerror = (e) => {
      console.error(
        `[TranscriptionDisplay] ❌ Failed to load screenshot for segment ${segmentId}:`,
        e
      );
      previewDiv.style.display = "none";
    };

    if (!previewDiv.querySelector("img")) {
      previewDiv.appendChild(img);
    }

    // Update subtitle overlay
    const overlay =
      previewDiv.querySelector(".subtitle-overlay") ||
      document.createElement("div");
    overlay.className = "subtitle-overlay";
    overlay.textContent =
      this.segments[segmentId]?.text?.substring(0, 60) || "";
    if (!previewDiv.querySelector(".subtitle-overlay")) {
      previewDiv.appendChild(overlay);
    }

    console.log(
      `[TranscriptionDisplay] ✅ Screenshot updated for segment ${segmentId}`
    );
  }

  updateProgress(progress, currentTime = null, totalDuration = null) {
    if (!this.container) {
      // Silently fail if container not available
      return;
    }

    // Update total duration if provided
    if (totalDuration && totalDuration > 0) {
      this.totalDuration = totalDuration;
    }

    // Only update progress if it's a significant change (5% increments) to prevent jumping
    const lastProgress = this.lastProgress || 0;
    const progressDiff = Math.abs(progress - lastProgress);

    if (progressDiff >= 5 || progress >= 100 || progress === 0) {
      this.lastProgress = progress;

      // Update progress bar
      const progressFill = document.getElementById("progressFill");
      if (progressFill) {
        progressFill.style.width = `${Math.min(progress, 100)}%`;
      }

      // Single unified progress display
      const progressText = document.getElementById("progressText");
      const progressPercent = document.getElementById("progressPercent");
      const currentTimeEl = document.getElementById("currentTime");
      const totalTimeEl = document.getElementById("totalTime");

      // Update percentage (always show)
      if (progressPercent) {
        progressPercent.textContent = `${Math.min(progress, 100)}%`;
      }

      // Single unified progress display - only show time range, no percentage in text
      if (currentTime !== null && this.totalDuration > 0) {
        // Update time displays in header
        if (currentTimeEl) {
          currentTimeEl.textContent = this.formatTime(currentTime);
        }
        if (totalTimeEl) {
          totalTimeEl.textContent = this.formatTime(this.totalDuration);
        }
        // Progress text shows time range only
        if (progressText) {
          progressText.textContent = `${this.formatTime(
            currentTime
          )} / ${this.formatTime(this.totalDuration)}`;
        }
      } else {
        // Fallback: just show "Processing..."
        if (progressText) {
          progressText.textContent = `Processing...`;
        }
      }
    }
  }

  updateCurrentTime(time) {
    // Only store the time, don't update UI here to avoid flickering
    // UI updates are handled by updateProgress() which has throttling
    this.currentProcessingTime = time;
  }

  updateStatus(status, text) {
    const statusIndicator = document.getElementById("statusIndicator");
    const statusDot = statusIndicator?.querySelector(".status-dot");
    const statusText = statusIndicator?.querySelector(".status-text");

    if (statusIndicator) {
      statusIndicator.className = `status-indicator status-${status}`;
    }

    if (statusText) {
      statusText.textContent = text;
    }

    if (statusDot) {
      statusDot.className = `status-dot status-${status}`;
    }
  }

  complete(fullText, subtitlePath = null) {
    this.isTranscribing = false;
    this.subtitlePath = subtitlePath; // Store subtitle path

    // Count actual segments
    const segmentCount = Object.values(this.segments).filter((s) => s).length;
    console.log(
      `[TranscriptionDisplay] Complete called. Segments: ${segmentCount}, Full text length: ${
        fullText?.length || 0
      }, Subtitle path: ${subtitlePath}`
    );

    // If no segments were received but we have full text, display it
    if (segmentCount === 0 && fullText && fullText.trim()) {
      console.log(
        "[TranscriptionDisplay] No segments received, displaying full text as single segment"
      );

      // Remove empty state
      const emptyState = this.container.querySelector(".empty-state");
      if (emptyState) {
        emptyState.remove();
      }

      // Split full text into chunks (by sentences or paragraphs)
      const sentences = fullText.split(/(?<=[.!?])\s+/).filter((s) => s.trim());

      if (sentences.length > 0) {
        // Display as segments
        let currentStart = 0;
        sentences.forEach((sentence, index) => {
          // Estimate duration (roughly 150 words per minute = 2.5 words per second)
          const wordCount = sentence.split(/\s+/).length;
          const estimatedDuration = wordCount / 2.5; // seconds
          const segmentStart = currentStart;
          const segmentEnd = currentStart + estimatedDuration;

          if (typeof this.addSegment === "function") {
            this.addSegment(sentence.trim(), segmentStart, segmentEnd);
          }
          currentStart = segmentEnd;
        });
      } else {
        // Fallback: single segment
        if (typeof this.addSegment === "function") {
          this.addSegment(fullText.trim(), 0, this.totalDuration || 0);
        }
      }
    }

    // Update status
    if (typeof this.updateStatus === "function") {
      this.updateStatus("complete", "Complete");
    }

    // Hide progress
    const progressContainer = document.getElementById("progressContainer");
    if (progressContainer) {
      progressContainer.classList.add("hidden");
    }

    // Add completion message
    const completeEl = document.createElement("div");
    completeEl.className = "transcription-complete";

    completeEl.innerHTML = `
      <div class="complete-icon">✓</div>
      <div class="complete-text">Transcription completed</div>
      <div class="complete-stats">
        ${
          Object.values(this.segments).filter((s) => s).length
        } segments • ${this.formatTime(
      this.currentProcessingTime || this.totalDuration
    )} total
      </div>
    `;
    this.container.appendChild(completeEl);

    this.scrollToBottom();

    // Recalculate segment count AFTER all segments have been added (including fallback segments)
    const finalSegmentCount = Object.values(this.segments).filter((s) => s).length;
    console.log(
      `[TranscriptionDisplay] Final segment count: ${finalSegmentCount} (was ${segmentCount} before fallback)`
    );

    // Store summary data for step 4
    this.summaryData = {
      fullText,
      subtitlePath,
      segmentCount: finalSegmentCount,
      totalDuration: this.currentProcessingTime || this.totalDuration,
    };

    console.log(
      `[TranscriptionDisplay] Summary data set:`,
      this.summaryData
    );

    // Dispatch event to notify that summary data is ready
    window.dispatchEvent(
      new CustomEvent("summary-data-ready", {
        detail: this.summaryData,
      })
    );
  }

  error(message) {
    if (!this.container) {
      console.error("[TranscriptionDisplay] Container not available in error");
      return;
    }

    this.isTranscribing = false;
    if (typeof this.updateStatus === "function") {
      this.updateStatus("error", "Error");
    }

    const errorEl = document.createElement("div");
    errorEl.className = "transcription-error";
    errorEl.innerHTML = `
      <div class="error-icon">✗</div>
      <div class="error-text">${message}</div>
    `;
    this.container.appendChild(errorEl);

    this.scrollToBottom();
  }

  clear() {
    if (!this.container) return; // Safety check

    this.container.innerHTML = `
      <div class="empty-state">
        <p>Transcription will appear here as it's generated...</p>
      </div>
    `;
    this.segments = {}; // Use object, not array
    this.currentProcessingTime = 0;
    this.totalDuration = 0;
    this.isTranscribing = false;
    this.lastProgress = 0;
    this.subtitlePath = null;
    this.summaryData = null;

    if (typeof this.updateStatus === "function") {
      this.updateStatus("ready", "Ready");
    }

    const progressContainer = document.getElementById("progressContainer");
    if (progressContainer) {
      progressContainer.classList.add("hidden");
    }

    const processingInfo = document.getElementById("processingInfo");
    if (processingInfo) {
      processingInfo.classList.add("hidden");
    }
  }

  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  scrollToBottom() {
    this.container.scrollTop = this.container.scrollHeight;
  }
}

// Create global instance immediately
// Initialize even if container is hidden - it's a small project, no need for complex lazy loading
(function initTranscriptionDisplay() {
  function createInstance() {
    try {
      // Always create instance, even if container is hidden
      window.transcriptionDisplay = new TranscriptionDisplay(
        "transcriptionDisplay"
      );
      console.log("[TranscriptionDisplay] ✅ Initialized successfully");
      console.log(
        "[TranscriptionDisplay] Instance:",
        window.transcriptionDisplay
      );

      // Verify all critical methods exist
      const methods = [
        "addSegment",
        "startTranscription",
        "ensureContainer",
        "updateProgress",
        "complete",
      ];
      methods.forEach((method) => {
        if (typeof window.transcriptionDisplay[method] !== "function") {
          console.error(
            `[TranscriptionDisplay] ❌ CRITICAL: ${method} is not a function!`
          );
          console.error(
            `[TranscriptionDisplay] Type:`,
            typeof window.transcriptionDisplay[method]
          );
          console.error(
            `[TranscriptionDisplay] Value:`,
            window.transcriptionDisplay[method]
          );
        } else {
          console.log(`[TranscriptionDisplay] ✓ ${method} is available`);
        }
      });

      return true;
    } catch (error) {
      console.error("[TranscriptionDisplay] ❌ Failed to initialize:", error);
      console.error("[TranscriptionDisplay] Error stack:", error.stack);
      return false;
    }
  }

  // Initialize immediately when script loads (scripts are at end of body, so DOM should be ready)
  // Create instance immediately - no need to wait
  createInstance();

  // Also ensure it's created after DOM is ready (in case script loaded before body)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // Only create if it doesn't exist or is missing methods
      if (
        !window.transcriptionDisplay ||
        typeof window.transcriptionDisplay.ensureContainer !== "function"
      ) {
        console.log(
          "[TranscriptionDisplay] Re-creating instance after DOM ready"
        );
        createInstance();
      }
    });
  }
})();
