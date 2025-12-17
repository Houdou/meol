// Step-by-step wizard controller
class TranscriptionWizard {
  constructor() {
    this.currentStep = 1; // 1: File Selection, 2: Configuration, 3: Transcription, 4: Summary
    this.steps = {
      1: 'file',
      2: 'config',
      3: 'transcription',
      4: 'summary'
    };
  }

  init() {
    // Hide all steps initially
    this.showStep(1);
  }

  showStep(stepNumber) {
    console.log(`[Wizard] Showing step ${stepNumber}`);
    
    // Hide all step sections
    const fileSection = document.getElementById('fileSection');
    const configSection = document.getElementById('configSection');
    const transcriptionSection = document.querySelector('.transcription-output-section');
    const summarySection = document.getElementById('summarySection');
    
    console.log('[Wizard] Sections found:', {
      fileSection: !!fileSection,
      configSection: !!configSection,
      transcriptionSection: !!transcriptionSection,
      summarySection: !!summarySection
    });
    
    if (fileSection) fileSection.classList.add('hidden');
    if (configSection) configSection.classList.add('hidden');
    if (transcriptionSection) transcriptionSection.classList.add('hidden');
    if (summarySection) summarySection.classList.add('hidden');
    
    // Show current step
    this.currentStep = stepNumber;
    
    switch(stepNumber) {
      case 1:
        if (fileSection) {
          fileSection.classList.remove('hidden');
          console.log('[Wizard] Step 1 shown');
        }
        break;
      case 2:
        if (configSection) {
          configSection.classList.remove('hidden');
          console.log('[Wizard] Step 2 shown');
          // Reset transcription button state when returning to step 2
          if (typeof window.resetTranscriptionButton === 'function') {
            window.resetTranscriptionButton();
          } else {
            // Fallback if function not available yet
            const startTranscribeBtn = document.getElementById('startTranscribeBtn');
            if (startTranscribeBtn) {
              startTranscribeBtn.disabled = false;
              startTranscribeBtn.textContent = 'Start Transcription';
              console.log('[Wizard] Reset transcription button state (fallback)');
            }
          }
        }
        break;
      case 3:
        if (transcriptionSection) {
          transcriptionSection.classList.remove('hidden');
          // Reset progress bar and previews when step 3 is shown
          if (typeof window.resetTranscriptionProgress === 'function') {
            window.resetTranscriptionProgress();
            console.log('[Wizard] Reset transcription progress when showing step 3');
          }
          // Ensure transcriptionDisplay container is available (it's already initialized)
          if (window.transcriptionDisplay) {
            // Check if ensureContainer exists before calling
            if (typeof window.transcriptionDisplay.ensureContainer === 'function') {
              window.transcriptionDisplay.ensureContainer();
            } else {
              console.error('[Wizard] ensureContainer method missing!');
              console.error('[Wizard] transcriptionDisplay:', window.transcriptionDisplay);
              console.error('[Wizard] transcriptionDisplay keys:', Object.keys(window.transcriptionDisplay || {}));
              // Try to manually find container as fallback
              const container = document.getElementById('transcriptionDisplay');
              if (container && window.transcriptionDisplay) {
                window.transcriptionDisplay.container = container;
                console.log('[Wizard] Manually set container as fallback');
              }
            }
          } else {
            console.error('[Wizard] transcriptionDisplay not initialized!');
          }
        }
        break;
      case 4:
        if (summarySection) {
          summarySection.classList.remove('hidden');
          console.log('[Wizard] Step 4 shown');
          // Update summary display when step 4 is shown
          if (window.transcriptionDisplay && window.transcriptionDisplay.summaryData) {
            // Call updateSummaryDisplay if it exists (defined in app.js)
            if (typeof window.updateSummaryDisplay === 'function') {
              window.updateSummaryDisplay(window.transcriptionDisplay.summaryData);
              console.log('[Wizard] Summary display updated via window.updateSummaryDisplay');
            } else if (typeof updateSummaryDisplay === 'function') {
              updateSummaryDisplay(window.transcriptionDisplay.summaryData);
              console.log('[Wizard] Summary display updated via updateSummaryDisplay');
            } else {
              console.warn('[Wizard] updateSummaryDisplay function not available');
              // Try to update manually as fallback
              const summaryData = window.transcriptionDisplay.summaryData;
              const segmentCountEl = document.getElementById('summarySegmentCount');
              const durationEl = document.getElementById('summaryDuration');
              const textLengthEl = document.getElementById('summaryTextLength');
              if (segmentCountEl) segmentCountEl.textContent = summaryData.segmentCount || 0;
              if (durationEl && summaryData.totalDuration) {
                const hours = Math.floor(summaryData.totalDuration / 3600);
                const mins = Math.floor((summaryData.totalDuration % 3600) / 60);
                const secs = Math.floor(summaryData.totalDuration % 60);
                if (hours > 0) {
                  durationEl.textContent = `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                } else {
                  durationEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                }
              }
              if (textLengthEl && summaryData.fullText) {
                textLengthEl.textContent = summaryData.fullText.length.toLocaleString();
              }
            }
          } else {
            console.warn('[Wizard] No summary data available when showing step 4');
            console.log('[Wizard] transcriptionDisplay:', window.transcriptionDisplay);
            console.log('[Wizard] summaryData:', window.transcriptionDisplay?.summaryData);
          }
        }
        break;
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  nextStep() {
    if (this.currentStep < 4) {
      this.showStep(this.currentStep + 1);
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      this.showStep(this.currentStep - 1);
    }
  }

  goToStep(stepNumber) {
    if (stepNumber >= 1 && stepNumber <= 4) {
      this.showStep(stepNumber);
    }
  }
}

// Create global instance
window.wizard = new TranscriptionWizard();

