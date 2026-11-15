const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const { extractFrameWithSubtitle } = require("./videoScreenshot");
const { getVideoMetadata } = require("./videoService");
const { cleanupFiles } = require("../utils/cacheManager");
const { shouldSkipThankYou } = require("../utils/transcriptionFilter");

/**
 * Get the Python executable path from venv based on the platform
 * @returns {string} Path to Python executable in venv
 */
function getPythonPath() {
  const isWindows = os.platform() === "win32";
  if (isWindows) {
    return path.join(__dirname, "../../venv/Scripts/python.exe");
  } else {
    // macOS and Linux use bin/python
    return path.join(__dirname, "../../venv/bin/python");
  }
}

/**
 * Transcribe audio/video file using Whisper
 * @param {string} filePath - Path to the audio/video file
 * @param {Object} options - Transcription options
 * @param {string} options.model - Whisper model (tiny, base, small, medium, large, turbo)
 * @param {string} options.language - Language code (optional, auto-detect if not provided)
 * @param {string} options.task - Task type: 'transcribe' or 'translate'
 * @param {number} options.temperature - Temperature for sampling (0.0-1.0)
 * @param {Function} options.onProgress - Callback for progress updates
 * @param {Function} options.onChunk - Callback for transcription chunks
 * @returns {Promise<Object>} Transcription result
 */
function transcribeWithWhisper(filePath, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      model = "turbo",
      language = null,
      task = "transcribe",
      temperature = 0.0,
      onProgress = null,
      onChunk = null,
    } = options;

    // Get Python executable from venv
    const pythonPath = getPythonPath();

    // Build Whisper command arguments
    const args = [
      "-c",
      `
import whisper
import json
import sys

model_name = "${model}"
file_path = r"${filePath.replace(/\\/g, "\\\\")}"
language = ${language ? `"${language}"` : "None"}
task = "${task}"
temperature = ${temperature}

try:
    model = whisper.load_model(model_name)
    result = model.transcribe(
        file_path,
        language=language,
        task=task,
        temperature=temperature,
        verbose=False
    )
    print(json.dumps(result))
except Exception as e:
    print(f"ERROR: {str(e)}", file=sys.stderr)
    sys.exit(1)
      `.trim(),
    ];

    let stdout = "";
    let stderr = "";

    const pythonProcess = spawn(pythonPath, args, {
      cwd: __dirname,
      shell: false,
    });

    // Handle stdout (transcription results)
    pythonProcess.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;

      // Try to parse JSON chunks if available
      if (onChunk) {
        try {
          const lines = output.split("\n").filter((line) => line.trim());
          for (const line of lines) {
            if (line.startsWith("{") || line.startsWith("[")) {
              const parsed = JSON.parse(line);
              if (parsed.text) {
                onChunk(parsed);
              }
            }
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });

    // Handle stderr (progress, errors)
    pythonProcess.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;

      // Extract progress information
      if (onProgress && output.includes("%")) {
        const progressMatch = output.match(/(\d+)%/);
        if (progressMatch) {
          onProgress(parseInt(progressMatch[1]));
        }
      }
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`Whisper process failed: ${stderr || "Unknown error"}`)
        );
        return;
      }

      try {
        // Parse final result
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse Whisper output: ${error.message}`));
      }
    });

    pythonProcess.on("error", (error) => {
      reject(new Error(`Failed to start Whisper process: ${error.message}`));
    });
  });
}

/**
 * Stream transcription with real-time updates
 * Uses a Python script that outputs segments as they're generated
 */
function streamTranscribeWithWhisper(filePath, options = {}, io, socketId) {
  const {
    model = "turbo",
    language = null,
    task = "transcribe",
    temperature = 0.0,
    chunkSize = 30, // Default 30 seconds per chunk
    videoFilePath = null, // Original video file path for screenshots
  } = options;

  // Track segments for subtitle generation
  const allSegments = [];
  
  // Track screenshot files for cleanup
  const screenshotFiles = [];

  // Screenshot extraction throttling - only extract every N seconds
  const SCREENSHOT_INTERVAL = 10; // Extract screenshot every 10 seconds
  let lastScreenshotTime = -SCREENSHOT_INTERVAL; // Initialize to allow first screenshot

  // Check if file has video stream for screenshots
  let hasVideoStream = false;
  const checkVideoStream = async () => {
    if (videoFilePath) {
      try {
        const metadata = await getVideoMetadata(videoFilePath);
        hasVideoStream = metadata.video !== null;
        console.log(`[Backend] Video stream detected: ${hasVideoStream}`);
      } catch (error) {
        console.error(
          `[Backend] Failed to check video metadata: ${error.message}`
        );
      }
    }
  };

  // Start checking video stream (non-blocking)
  checkVideoStream();

  const pythonPath = getPythonPath();
  const fs = require("fs");
  const scriptPath = path.join(os.tmpdir(), `whisper_stream_${Date.now()}.py`);

  // Escape file path for Python
  const escapedPath = filePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // Create a temporary Python script for chunked streaming with GPU support
  const scriptContent = `import whisper
import json
import sys
import torch
import os
import warnings
import numpy as np
from io import StringIO

# Suppress Triton and other warnings
warnings.filterwarnings('ignore', category=UserWarning)
os.environ['PYTHONWARNINGS'] = 'ignore'

# Suppress Whisper's internal progress bars by redirecting tqdm output
import contextlib
from tqdm import tqdm

# Create a context manager to suppress tqdm output
@contextlib.contextmanager
def suppress_tqdm():
    """Suppress tqdm progress bars"""
    import sys
    from io import StringIO
    old_stderr = sys.stderr
    try:
        sys.stderr = StringIO()
        yield
    finally:
        sys.stderr = old_stderr

model_name = "${model}"
file_path = r"${escapedPath}"
language = ${language ? `"${language}"` : "None"}
task = "${task}"
temperature = ${temperature}
chunk_size = ${chunkSize}  # Seconds per chunk

try:
    # Check for CUDA availability
    device = "cuda" if torch.cuda.is_available() else "cpu"
    device_info = {
        'type': 'device',
        'device': device
    }
    if device == "cuda":
        device_info['gpu_name'] = torch.cuda.get_device_name(0)
        device_info['cuda_version'] = torch.version.cuda
        device_info['gpu_count'] = torch.cuda.device_count()
    print(json.dumps(device_info), file=sys.stderr)
    sys.stderr.flush()
    
    # Load model once (outside the loop)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = whisper.load_model(model_name, device=device)
    
    # Load audio file once
    import whisper.audio as audio_module
    audio = audio_module.load_audio(file_path)
    sample_rate = audio_module.SAMPLE_RATE
    audio_duration = len(audio) / sample_rate  # Duration in seconds
    
    # Initialize progress tracker for throttling
    class ProgressTracker:
        last_sent = 0
    
    updateProgress = ProgressTracker()
    
    # Initialize progress tracker for throttling
    class ProgressTracker:
        last_sent = 0
    
    updateProgress = ProgressTracker()
    
    # Send initial progress with total duration
    if audio_duration > 0:
        progress_data = {'type': 'progress', 'progress': 0, 'currentTime': 0, 'totalDuration': audio_duration}
        print(json.dumps(progress_data), file=sys.stderr)
        sys.stderr.flush()
        updateProgress.last_sent = 0
        updateProgress.last_sent = 0
    
    # Process audio in chunks
    chunk_samples = chunk_size * sample_rate
    total_segments = 0
    full_text_parts = []
    
    current_time = 0.0
    
    while current_time < audio_duration:
        # Calculate chunk boundaries
        chunk_start_time = current_time
        chunk_end_time = min(current_time + chunk_size, audio_duration)
        
        # Extract audio chunk (ensure we don't go beyond audio length)
        start_sample = int(chunk_start_time * sample_rate)
        end_sample = min(int(chunk_end_time * sample_rate), len(audio))
        audio_chunk = audio[start_sample:end_sample]
        
        # Skip empty chunks
        if len(audio_chunk) == 0:
            break
        
        # Don't send progress at chunk start - only send overall progress at segment end
        # This ensures we show total file progress, not individual chunk progress
        
        # Transcribe chunk - suppress Whisper's internal progress bars
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            with suppress_tqdm():
                # Temporarily redirect stderr to suppress progress bars
                import sys
                from io import StringIO
                old_stderr = sys.stderr
                sys.stderr = StringIO()
                try:
                    result = model.transcribe(
                        audio_chunk,
                        language=language if language else None,
                        task=task,
                        temperature=temperature,
                        verbose=False,
                        word_timestamps=True,
                        fp16=(device == "cuda")
                    )
                finally:
                    sys.stderr = old_stderr
        
        # Process segments from this chunk
        segments = result.get('segments', [])
        
        for segment in segments:
            segment_text = segment.get('text', '').strip()
            if segment_text:
                # Adjust timestamps to account for chunk offset
                segment_start = chunk_start_time + segment.get('start', 0)
                segment_end = chunk_start_time + segment.get('end', 0)
                
                # Adjust word timestamps if present
                words = segment.get('words', [])
                adjusted_words = []
                for word in words:
                    adjusted_words.append({
                        'word': word.get('word', ''),
                        'start': chunk_start_time + word.get('start', 0),
                        'end': chunk_start_time + word.get('end', 0),
                        'probability': word.get('probability', 0)
                    })
                
                segment_data = {
                    'id': total_segments,
                    'start': segment_start,
                    'end': segment_end,
                    'text': segment_text,
                    'words': adjusted_words
                }
                
                # Send segment immediately
                print(json.dumps(segment_data), flush=True)
                full_text_parts.append(segment_text)
                total_segments += 1
        
        # Send overall progress update ONLY ONCE per chunk (after processing all segments in chunk)
        # Calculate progress based on total file duration, not individual segments
        if audio_duration > 0:
            progress = int((chunk_end_time / audio_duration) * 100)
            progress = min(progress, 100)  # Ensure max 100%
            
            # Track last sent progress to avoid sending too frequently
            # Only send if progress increased by at least 5% or we're at the end
            if not hasattr(updateProgress, 'last_sent'):
                updateProgress.last_sent = 0
            
            progress_diff = progress - updateProgress.last_sent
            is_near_end = chunk_end_time >= audio_duration - 0.5
            
            if progress_diff >= 5 or is_near_end:
                updateProgress.last_sent = progress
                progress_data = {
                    'type': 'progress',
                    'progress': progress,
                    'currentTime': chunk_end_time,
                    'totalDuration': audio_duration
                }
                print(json.dumps(progress_data), file=sys.stderr)
                sys.stderr.flush()
        
        # Move to next chunk (with small overlap to avoid cutting words)
        # But ensure we don't loop infinitely at the end
        if chunk_end_time >= audio_duration:
            # We've reached the end, break out of the loop
            break
        
        current_time = chunk_end_time - 1.0  # 1 second overlap
        
        # Safety check: if we're not making progress, break to avoid infinite loop
        if current_time >= audio_duration - 0.1:
            break
    
    # Send final progress update (100%)
    if audio_duration > 0:
        final_progress_data = {
            'type': 'progress',
            'progress': 100,
            'currentTime': audio_duration,
            'totalDuration': audio_duration
        }
        print(json.dumps(final_progress_data), file=sys.stderr)
        sys.stderr.flush()
    
    # Send completion signal with full text
    full_text = ' '.join(full_text_parts) if full_text_parts else ''
    print(json.dumps({'type': 'complete', 'full_text': full_text}), flush=True)
    
    # Debug: Log completion
    print(f"DEBUG: Sent {total_segments} segments, total text length: {len(full_text)}", file=sys.stderr)
    sys.stderr.flush()
    
except Exception as e:
    import traceback
    error_data = {'type': 'error', 'message': str(e), 'traceback': traceback.format_exc()}
    print(json.dumps(error_data), file=sys.stderr)
    sys.stderr.flush()
    sys.exit(1)
`;

  // Write script temporarily
  fs.writeFileSync(scriptPath, scriptContent);

  const pythonProcess = spawn(pythonPath, [scriptPath], {
    cwd: __dirname,
    shell: false,
  });

  let buffer = "";

  pythonProcess.stdout.on("data", (data) => {
    const rawData = data.toString();
    console.log(
      `[Backend] 📥 Received stdout (${rawData.length} bytes):`,
      rawData.substring(0, 100)
    );

    buffer += rawData;
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      // Only try to parse lines that look like JSON
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith("{") && !trimmedLine.startsWith("[")) {
        // Skip non-JSON lines (like "Detected language: ...")
        console.log(
          `[Backend] ⏭️ Skipping non-JSON line: ${trimmedLine.substring(0, 50)}`
        );
        continue;
      }

      try {
        const parsed = JSON.parse(trimmedLine);
        console.log(`[Backend] ✅ Parsed JSON:`, Object.keys(parsed));

        // Handle segment data (no 'type' field, just segment info)
        if (
          parsed.text !== undefined &&
          parsed.start !== undefined &&
          parsed.end !== undefined
        ) {
          // Skip "Thank you." segments (common false positive from clapping sounds)
          if (shouldSkipThankYou(parsed.text)) {
            console.log(
              `[Backend] ⏭️ Skipping segment ${parsed.id}: "${parsed.text}" (filtered as false positive)`
            );
            continue;
          }

          const segmentPreview = parsed.text.substring(0, 50);
          console.log(
            `[Backend] ✅ Segment ${parsed.id}: "${segmentPreview}..." (${parsed.start}s-${parsed.end}s)`
          );
          console.log(
            `[Backend] 📤 Emitting transcription-chunk to socket ${socketId}`
          );

          // Store segment for subtitle generation
          allSegments.push({
            start: parsed.start,
            end: parsed.end,
            text: parsed.text,
          });

          // Extract video frame with subtitle if video file is available
          // Throttle screenshot extraction to reduce workload (only every N seconds)
          if (videoFilePath) {
            const timeSinceLastScreenshot = parsed.start - lastScreenshotTime;

            if (timeSinceLastScreenshot >= SCREENSHOT_INTERVAL) {
              lastScreenshotTime = parsed.start;
              console.log(`[Backend] 📸 Extracting screenshot for segment ${parsed.id} at ${parsed.start}s (interval: ${SCREENSHOT_INTERVAL}s)`);

              // Try to extract screenshot (will fail gracefully if not a video file)
              extractFrameWithSubtitle(videoFilePath, parsed.start, parsed.text)
                .then((screenshotPath) => {
                  console.log(`[Backend] 📸 Screenshot extracted successfully: ${screenshotPath} for segment ${parsed.id}`);
                  // Track screenshot file for cleanup
                  screenshotFiles.push(screenshotPath);
                  // Send screenshot update via WebSocket
                  io.to(socketId).emit("transcription-screenshot", {
                    segmentId: parsed.id,
                    screenshot: `file://${screenshotPath}`,
                  });
                  console.log(`[Backend] 📤 Screenshot event emitted for segment ${parsed.id}`);
                })
                .catch((error) => {
                  // Log all errors for debugging
                  console.error(
                    `[Backend] ❌ Failed to extract screenshot for segment ${parsed.id}: ${error.message}`
                  );
                  console.error(`[Backend] Error stack:`, error.stack);
                });
            } else {
              // Skip screenshot extraction - too soon since last one
              console.log(`[Backend] ⏭️ Skipping screenshot for segment ${parsed.id} at ${parsed.start}s (only ${timeSinceLastScreenshot.toFixed(1)}s since last screenshot, need ${SCREENSHOT_INTERVAL}s)`);
            }
          } else {
            console.log(`[Backend] ⚠️ No videoFilePath provided, skipping screenshot extraction`);
          }

          io.to(socketId).emit("transcription-chunk", {
            segment: parsed.text,
            start: parsed.start,
            end: parsed.end,
            words: parsed.words || [],
            id: parsed.id,
          });

          console.log(`[Backend] ✅ Emitted segment ${parsed.id} successfully`);
        } else if (parsed.type === "complete") {
          const textLength = parsed.full_text?.length || 0;
          console.log(
            `[Backend] ✅ Transcription complete. Full text length: ${textLength} chars`
          );
          console.log(
            `[Backend] 📤 Emitting transcription-complete to socket ${socketId}`
          );

          // Generate subtitle file
          const { generateSRT } = require("./subtitleGenerator");
          const subtitlePath = filePath.replace(/\.[^/.]+$/, "") + ".srt";
          try {
            generateSRT(allSegments, subtitlePath);
            console.log(
              `[Backend] 📝 Subtitle file generated: ${subtitlePath}`
            );
          } catch (error) {
            console.error(
              `[Backend] Failed to generate subtitle: ${error.message}`
            );
          }

          // Clean up screenshot files
          if (screenshotFiles.length > 0) {
            console.log(`[Backend] 🧹 Cleaning up ${screenshotFiles.length} screenshot file(s)...`);
            cleanupFiles(screenshotFiles).then(() => {
              console.log(`[Backend] ✅ Screenshot cleanup completed`);
            }).catch((error) => {
              console.error(`[Backend] ❌ Screenshot cleanup error:`, error.message);
            });
          }

          io.to(socketId).emit("transcription-complete", {
            fullText: parsed.full_text,
            subtitlePath: subtitlePath,
          });
        } else if (parsed.type === "error") {
          console.error(`[Backend] ❌ Error: ${parsed.message}`);
          io.to(socketId).emit("transcription-error", {
            message: parsed.message,
          });
        } else {
          // Log unknown JSON structure for debugging
          console.log(
            `[Backend] ⚠️ Unknown JSON structure:`,
            Object.keys(parsed)
          );
        }
      } catch (e) {
        // Not valid JSON, log for debugging but don't crash
        console.log(
          "Skipping non-JSON stdout line:",
          trimmedLine.substring(0, 100)
        );
      }
    }
  });

  pythonProcess.stderr.on("data", (data) => {
    const output = data.toString();
    console.log(
      `[Backend] 📥 Received stderr (${output.length} bytes):`,
      output.substring(0, 100)
    );

    const lines = output.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Try to parse JSON first
      if (trimmedLine.startsWith("{") || trimmedLine.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmedLine);

          if (parsed.type === "device") {
            console.log(
              `[Backend] 🖥️ Device: ${parsed.device}${parsed.gpu_name ? ` (${parsed.gpu_name})` : ""
              }`
            );
            io.to(socketId).emit("transcription-device", {
              device: parsed.device,
              gpu_name: parsed.gpu_name,
              cuda_version: parsed.cuda_version,
            });
          } else if (parsed.type === "progress") {
            console.log(
              `[Backend] 📊 Progress: ${parsed.progress}% (${parsed.currentTime || 0
              }s/${parsed.totalDuration || 0}s)`
            );
            io.to(socketId).emit("transcription-progress", {
              progress: parsed.progress,
              currentTime: parsed.currentTime || null,
              totalDuration: parsed.totalDuration || null,
            });
          } else if (parsed.type === "error") {
            console.error(`[Backend] ❌ Error from Python: ${parsed.message}`);
            io.to(socketId).emit("transcription-error", {
              message: parsed.message,
            });
          }
          continue;
        } catch (e) {
          // Not valid JSON, continue to other checks
        }
      }

      // Handle non-JSON stderr output
      if (trimmedLine.includes("%")) {
        const progressMatch = trimmedLine.match(/(\d+)%/);
        if (progressMatch) {
          io.to(socketId).emit("transcription-progress", {
            progress: parseInt(progressMatch[1]),
          });
        }
      } else if (
        trimmedLine &&
        !trimmedLine.includes("Using cached") &&
        !trimmedLine.includes("100%") &&
        !trimmedLine.toLowerCase().includes("detected") &&
        !trimmedLine.toLowerCase().includes("loading")
      ) {
        // Log other stderr output for debugging (but skip common whisper messages)
        console.log("Whisper stderr:", trimmedLine);
      }
    }
  });

  pythonProcess.on("close", (code) => {
    // Clean up screenshot files on process close (whether success or error)
    if (screenshotFiles.length > 0) {
      console.log(`[Backend] 🧹 Cleaning up ${screenshotFiles.length} screenshot file(s) on process close...`);
      cleanupFiles(screenshotFiles).then(() => {
        console.log(`[Backend] ✅ Screenshot cleanup completed`);
      }).catch((error) => {
        console.error(`[Backend] ❌ Screenshot cleanup error:`, error.message);
      });
    }
    
    // Process any remaining buffered data
    if (buffer.trim()) {
      console.log(
        `[Backend] Processing remaining buffer on close (${buffer.length} bytes)`
      );
      const lines = buffer.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("{") || trimmedLine.startsWith("[")) {
          try {
            const parsed = JSON.parse(trimmedLine);

            if (
              parsed.text !== undefined &&
              parsed.start !== undefined &&
              parsed.end !== undefined
            ) {
              // Skip "Thank you." segments (common false positive from clapping sounds)
              if (shouldSkipThankYou(parsed.text)) {
                console.log(
                  `[Backend] ⏭️ Skipping buffered segment ${parsed.id}: "${parsed.text}" (filtered as false positive)`
                );
                continue;
              }
              
              console.log(
                `[Backend] ✅ Processing buffered segment ${parsed.id}`
              );
              io.to(socketId).emit("transcription-chunk", {
                segment: parsed.text,
                start: parsed.start,
                end: parsed.end,
                words: parsed.words || [],
                id: parsed.id,
              });
            } else if (parsed.type === "complete") {
              console.log(`[Backend] ✅ Processing buffered completion`);
              
              // Clean up screenshot files if any were created
              if (screenshotFiles.length > 0) {
                console.log(`[Backend] 🧹 Cleaning up ${screenshotFiles.length} screenshot file(s)...`);
                cleanupFiles(screenshotFiles).then(() => {
                  console.log(`[Backend] ✅ Screenshot cleanup completed`);
                }).catch((error) => {
                  console.error(`[Backend] ❌ Screenshot cleanup error:`, error.message);
                });
              }
              
              io.to(socketId).emit("transcription-complete", {
                fullText: parsed.full_text,
              });
            }
          } catch (e) {
            console.log(
              `[Backend] Failed to parse buffered line: ${trimmedLine.substring(
                0,
                50
              )}`
            );
          }
        }
      }
    }

    // Clean up temporary script
    try {
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
      }
    } catch (e) {
      console.error("Failed to cleanup script:", e.message);
    }

    if (code !== 0) {
      console.error(`[Backend] Python process exited with code ${code}`);
      io.to(socketId).emit("transcription-error", {
        message: `Transcription process exited with error code ${code}`,
      });
    } else {
      console.log(`[Backend] ✅ Python process completed successfully`);
    }
  });

  pythonProcess.on("error", (error) => {
    // Clean up screenshot files on error
    if (screenshotFiles.length > 0) {
      console.log(`[Backend] 🧹 Cleaning up ${screenshotFiles.length} screenshot file(s) on error...`);
      cleanupFiles(screenshotFiles).catch((cleanupError) => {
        console.error(`[Backend] ❌ Screenshot cleanup error:`, cleanupError.message);
      });
    }
    
    io.to(socketId).emit("transcription-error", {
      message: `Failed to start transcription: ${error.message}`,
    });
  });

  return pythonProcess;
}

module.exports = {
  transcribeWithWhisper,
  streamTranscribeWithWhisper,
};
