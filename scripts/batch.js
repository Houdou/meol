#!/usr/bin/env node

/**
 * Batch transcription CLI script
 * Processes a media file or all media files in a folder and generates SRT subtitle files
 * By default, skips files that already have .srt files (use --override to force)
 *
 * Usage: yarn batch -i="PATH" --segment=15 --temp=0.3 --lang=auto --prompt="text" --override
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { generateSRT } = require("../backend/services/subtitleGenerator");
const { shouldSkipThankYou } = require("../backend/utils/transcriptionFilter");
const {
  isFunASRModel,
  resolveFunASRModel,
} = require("../backend/services/asrModels");

const PROJECT_ROOT = path.join(__dirname, "..");
const FUNASR_WORKER = path.join(
  PROJECT_ROOT,
  "backend",
  "python",
  "funasr_stream.py"
);

function resolvePythonPath() {
  let pythonPath = path.join(PROJECT_ROOT, "venv/Scripts/python.exe");
  if (!fs.existsSync(pythonPath)) {
    const altPath = path.join(PROJECT_ROOT, "venv/bin/python");
    if (fs.existsSync(altPath)) {
      pythonPath = altPath;
    } else {
      pythonPath = process.platform === "win32" ? "python" : "python3";
    }
  }
  return pythonPath;
}

const mediaExtensions = [
  ".mp4",
  ".avi",
  ".mov",
  ".mkv",
  ".webm",
  ".mpeg",
  ".mpg",
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".ogg",
  ".flac",
  ".wma",
];

function readArgValue(arg) {
  const equalsIndex = arg.indexOf("=");
  if (equalsIndex === -1) {
    return "";
  }

  return arg.slice(equalsIndex + 1);
}

function isSupportedMediaFile(filePath) {
  return mediaExtensions.includes(path.extname(filePath).toLowerCase());
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: null,
    segment: 15, // Default chunk size in seconds
    temp: 0.1, // Default temperature
    lang: "", // Default language (auto-detect)
    model: "turbo", // Default model
    prompt: null, // Default initial prompt
    override: false, // Default: skip files with existing .srt
  };

  args.forEach((arg) => {
    if (arg.startsWith("-i=") || arg.startsWith("--input=")) {
      options.input = readArgValue(arg).replace(/^["']|["']$/g, "");
    } else if (arg.startsWith("--segment=")) {
      options.segment = parseFloat(readArgValue(arg)) || 15;
    } else if (arg.startsWith("--temp=")) {
      const parsedTemp = parseFloat(readArgValue(arg));
      options.temp = Number.isFinite(parsedTemp) ? parsedTemp : 0.1;
    } else if (arg.startsWith("--lang=")) {
      const lang = readArgValue(arg);
      options.lang = lang === "auto" ? null : lang;
    } else if (arg.startsWith("--model=")) {
      options.model = readArgValue(arg) || "turbo";
    } else if (arg.startsWith("--prompt=")) {
      options.prompt = readArgValue(arg).replace(/^["']|["']$/g, "");
    } else if (arg === "--override" || arg === "--force" || arg === "-f") {
      options.override = true;
    }
  });

  return options;
}

// Get all supported media files in a directory
function getMediaFiles(dirPath) {
  const files = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively search subdirectories
        files.push(...getMediaFiles(fullPath));
      } else if (entry.isFile()) {
        if (isSupportedMediaFile(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
  }

  return files;
}

// Check if SRT file exists for a video file
function srtFileExists(filePath) {
  const srtPath = filePath.replace(/\.[^/.]+$/, "") + ".srt";
  return fs.existsSync(srtPath);
}

// Format time for display
function formatTime(seconds) {
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

// Transcribe a single file with FunASR (VAD + Fun-ASR-Nano / MLT-Nano)
function transcribeFileWithFunASR(filePath, options) {
  return new Promise((resolve, reject) => {
    const { model, language = null, chunkSize = 15 } = options;
    const resolved = resolveFunASRModel(model, language);

    if (!resolved) {
      reject(new Error(`Unknown FunASR model: ${model}`));
      return;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Processing: ${path.basename(filePath)}`);
    console.log(`Model: ${resolved.alias} (${resolved.id})`);
    console.log(`${"=".repeat(60)}`);

    const allSegments = [];
    let totalDuration = 0;
    let lastProgress = 0;

    const pythonPath = resolvePythonPath();
    const args = [
      FUNASR_WORKER,
      "--file",
      filePath,
      "--model",
      resolved.id,
      "--device",
      "auto",
      "--max-region",
      String(Math.max(8, Math.min(30, chunkSize || 15))),
    ];
    if (language) {
      args.push("--language", language);
    }

    const pythonProcess = spawn(pythonPath, args, {
      cwd: path.dirname(FUNASR_WORKER),
      shell: false,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        MODELSCOPE_CACHE: path.join(PROJECT_ROOT, "models", ".modelscope"),
        HF_HOME: path.join(PROJECT_ROOT, "models", "huggingface"),
      },
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    pythonProcess.stdout.on("data", (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;

        try {
          const parsed = JSON.parse(trimmed);

          if (parsed.text !== undefined && parsed.start !== undefined) {
            allSegments.push({
              start: parsed.start,
              end: parsed.end,
              text: parsed.text,
            });

            const timeStr = `${formatTime(parsed.start)} → ${formatTime(
              parsed.end
            )}`;
            console.log(
              `  [${timeStr}] ${parsed.text.substring(0, 60)}${
                parsed.text.length > 60 ? "..." : ""
              }`
            );
          } else if (parsed.type === "complete") {
            totalDuration = parsed.total_duration || totalDuration;
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });

    pythonProcess.stderr.on("data", (data) => {
      stderrBuffer += data.toString();
      const lines = stderrBuffer.split("\n");
      stderrBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("{")) {
          try {
            const parsed = JSON.parse(trimmed);

            if (parsed.type === "device") {
              console.log(
                `  Device: ${parsed.device}${
                  parsed.gpu_name ? ` (${parsed.gpu_name})` : ""
                }`
              );
            } else if (parsed.type === "progress") {
              totalDuration = parsed.totalDuration || totalDuration;
              const progress = Math.min(100, parsed.progress || 0);
              const currentTime = parsed.currentTime || 0;

              if (
                Math.abs(progress - lastProgress) >= 5 ||
                progress >= 100 ||
                progress === 0
              ) {
                const timeStr =
                  totalDuration > 0
                    ? `${formatTime(currentTime)} / ${formatTime(
                        totalDuration
                      )}`
                    : "Processing...";
                process.stdout.write(
                  `\r  Progress: ${timeStr} (${Math.floor(progress)}%)`
                );
                lastProgress = progress;
              }
            } else if (parsed.type === "error") {
              console.error(`\n  ❌ Error: ${parsed.message}`);
            }
            continue;
          } catch (e) {
            // fall through to log filtering
          }
        }

        if (trimmed.includes("Traceback") || trimmed.includes("ERROR")) {
          process.stdout.write("\n");
          process.stderr.write(`  ⚠️  ${trimmed}\n`);
        }
      }
    });

    pythonProcess.on("close", (code) => {
      process.stdout.write("\n");

      if (code !== 0) {
        reject(new Error(`Transcription failed with code ${code}`));
        return;
      }

      if (allSegments.length === 0) {
        reject(new Error("No segments generated"));
        return;
      }

      const srtPath = filePath.replace(/\.[^/.]+$/, "") + ".srt";
      try {
        generateSRT(allSegments, srtPath);
        console.log(`\n  ✅ SRT file generated: ${path.basename(srtPath)}`);
        console.log(
          `  📊 Segments: ${allSegments.length} | Duration: ${formatTime(
            totalDuration
          )}`
        );
        resolve({
          filePath,
          srtPath,
          segments: allSegments.length,
          duration: totalDuration,
        });
      } catch (error) {
        reject(new Error(`Failed to generate SRT: ${error.message}`));
      }
    });

    pythonProcess.on("error", (error) => reject(error));
  });
}

// Transcribe a single file
function transcribeFile(filePath, options) {
  if (isFunASRModel(options.model)) {
    return transcribeFileWithFunASR(filePath, options);
  }

  return new Promise((resolve, reject) => {
    const {
      model = "turbo",
      language = null,
      temperature = 0.3,
      chunkSize = 15,
      initialPrompt = null,
    } = options;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Processing: ${path.basename(filePath)}`);
    console.log(`${"=".repeat(60)}`);

    const allSegments = [];
    let totalDuration = 0;
    let lastProgress = 0;

    // Get Python executable from venv, fall back to system Python
    const pythonPath = resolvePythonPath();
    const scriptPath = path.join(os.tmpdir(), `whisper_batch_${Date.now()}.py`);

    // Escape file path for Python
    const escapedPath = filePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    // Escape prompt for Python (handle quotes and newlines)
    const escapedPrompt = initialPrompt
      ? initialPrompt
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
      : "None";

    // Create Python script for chunked transcription
    const scriptContent = `import whisper
import json
import sys
import torch
import os
import warnings
from io import StringIO

# Suppress warnings
warnings.filterwarnings('ignore', category=UserWarning)
os.environ['PYTHONWARNINGS'] = 'ignore'

# Suppress tqdm progress bars
import contextlib
from tqdm import tqdm

@contextlib.contextmanager
def suppress_tqdm():
    old_stderr = sys.stderr
    try:
        sys.stderr = StringIO()
        yield
    finally:
        sys.stderr = old_stderr

model_name = "${model}"
file_path = r"${escapedPath}"
language = ${language ? `"${language}"` : "None"}
temperature = ${temperature}
chunk_size = ${chunkSize}
initial_prompt = ${initialPrompt ? `"${escapedPrompt}"` : "None"}

try:
    # Check for CUDA
    device = "cuda" if torch.cuda.is_available() else "cpu"
    device_info = {'type': 'device', 'device': device}
    if device == "cuda":
        device_info['gpu_name'] = torch.cuda.get_device_name(0)
    print(json.dumps(device_info), file=sys.stderr)
    sys.stderr.flush()
    
    # Load model
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = whisper.load_model(model_name, device=device)
    
    # Load audio
    import whisper.audio as audio_module
    audio = audio_module.load_audio(file_path)
    sample_rate = audio_module.SAMPLE_RATE
    audio_duration = len(audio) / sample_rate
    
    # Send initial progress
    if audio_duration > 0:
        progress_data = {'type': 'progress', 'progress': 0, 'currentTime': 0, 'totalDuration': audio_duration}
        print(json.dumps(progress_data), file=sys.stderr)
        sys.stderr.flush()
    
    # Process in chunks
    chunk_samples = chunk_size * sample_rate
    total_segments = 0
    current_time = 0.0
    lastProgress = 0
    all_text_parts = []
    
    while current_time < audio_duration:
        chunk_start_time = current_time
        chunk_end_time = min(current_time + chunk_size, audio_duration)
        
        start_sample = int(chunk_start_time * sample_rate)
        end_sample = min(int(chunk_end_time * sample_rate), len(audio))
        audio_chunk = audio[start_sample:end_sample]
        
        if len(audio_chunk) == 0:
            break
        
        # Transcribe chunk
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            with suppress_tqdm():
                old_stderr = sys.stderr
                sys.stderr = StringIO()
                try:
                    transcribe_kwargs = {
                        "language": language if language else None,
                        "task": "transcribe",
                        "temperature": temperature,
                        "verbose": False,
                        "word_timestamps": True,
                        "fp16": (device == "cuda")
                    }
                    if initial_prompt:
                        transcribe_kwargs["initial_prompt"] = initial_prompt
                    result = model.transcribe(audio_chunk, **transcribe_kwargs)
                finally:
                    sys.stderr = old_stderr
        
        # Process segments
        segments = result.get('segments', [])
        
        for segment in segments:
            segment_text = segment.get('text', '').strip()
            if segment_text:
                segment_start = chunk_start_time + segment.get('start', 0)
                segment_end = chunk_start_time + segment.get('end', 0)
                
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
                    'type': 'segment',
                    'text': segment_text,
                    'start': segment_start,
                    'end': segment_end,
                    'words': adjusted_words
                }
                print(json.dumps(segment_data))
                sys.stdout.flush()
                all_text_parts.append(segment_text)
                total_segments += 1
        
        # Update progress
        current_time = chunk_end_time
        progress = min(100, (current_time / audio_duration) * 100)
        
        # Only send progress on 5% increments or at completion
        if progress - lastProgress >= 5 or progress >= 100 or current_time >= audio_duration - 0.1:
            progress_data = {
                'type': 'progress',
                'progress': progress,
                'currentTime': current_time,
                'totalDuration': audio_duration
            }
            print(json.dumps(progress_data), file=sys.stderr)
            sys.stderr.flush()
            lastProgress = progress
        
        # Break if we've reached the end
        if current_time >= audio_duration - 0.1:
            break
    
    # Send completion
    full_text = ' '.join(all_text_parts)
    complete_data = {
        'type': 'complete',
        'full_text': full_text,
        'total_duration': audio_duration
    }
    print(json.dumps(complete_data))
    sys.stdout.flush()
    
except Exception as e:
    error_data = {'type': 'error', 'message': str(e)}
    print(json.dumps(error_data), file=sys.stderr)
    sys.stderr.flush()
    sys.exit(1)
`;

    // Write script to temp file
    fs.writeFileSync(scriptPath, scriptContent, "utf8");

    // Spawn Python process
    const pythonProcess = spawn(pythonPath, [scriptPath], {
      cwd: __dirname,
      shell: false,
    });

    // Handle stdout (segments)
    pythonProcess.stdout.on("data", (data) => {
      const output = data.toString();
      const lines = output.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);

          if (parsed.type === "segment") {
            // Skip "Thank you." segments (common false positive from clapping sounds)
            if (shouldSkipThankYou(parsed.text)) {
              console.log(
                `  ⏭️  Skipping segment: "${parsed.text}" (filtered as false positive)`
              );
              continue;
            }

            allSegments.push({
              start: parsed.start,
              end: parsed.end,
              text: parsed.text,
            });

            // Print segment
            const timeStr = `${formatTime(parsed.start)} → ${formatTime(
              parsed.end
            )}`;
            console.log(
              `  [${timeStr}] ${parsed.text.substring(0, 60)}${parsed.text.length > 60 ? "..." : ""
              }`
            );
          } else if (parsed.type === "complete") {
            totalDuration = parsed.total_duration || 0;
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });

    // Handle stderr (progress and device info)
    pythonProcess.stderr.on("data", (data) => {
      const output = data.toString();
      const lines = output.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);

          if (parsed.type === "device") {
            console.log(
              `  Device: ${parsed.device}${parsed.gpu_name ? ` (${parsed.gpu_name})` : ""
              }`
            );
          } else if (parsed.type === "progress") {
            totalDuration = parsed.totalDuration || totalDuration;
            const progress = Math.min(100, parsed.progress || 0);
            const currentTime = parsed.currentTime || 0;

            // Only update on significant changes
            if (
              Math.abs(progress - lastProgress) >= 5 ||
              progress >= 100 ||
              progress === 0
            ) {
              const timeStr =
                totalDuration > 0
                  ? `${formatTime(currentTime)} / ${formatTime(totalDuration)}`
                  : "Processing...";
              process.stdout.write(
                `\r  Progress: ${timeStr} (${Math.floor(progress)}%)`
              );
              lastProgress = progress;
            }
          } else if (parsed.type === "error") {
            console.error(`\n  ❌ Error: ${parsed.message}`);
          }
        } catch (e) {
          // Not JSON, might be Python error output
          if (
            output.includes("ERROR") ||
            output.includes("Error") ||
            output.includes("Traceback")
          ) {
            process.stdout.write(`\n`);
            process.stderr.write(`  ⚠️  ${output}`);
          }
        }
      }
    });

    // Handle process completion
    pythonProcess.on("close", (code) => {
      // Clean up temp script
      try {
        fs.unlinkSync(scriptPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      if (code !== 0) {
        reject(new Error(`Transcription failed with code ${code}`));
        return;
      }

      // Generate SRT file
      if (allSegments.length > 0) {
        const srtPath = filePath.replace(/\.[^/.]+$/, "") + ".srt";
        try {
          generateSRT(allSegments, srtPath);
          console.log(`\n  ✅ SRT file generated: ${path.basename(srtPath)}`);
          console.log(
            `  📊 Segments: ${allSegments.length} | Duration: ${formatTime(
              totalDuration
            )}`
          );
          resolve({
            filePath,
            srtPath,
            segments: allSegments.length,
            duration: totalDuration,
          });
        } catch (error) {
          reject(new Error(`Failed to generate SRT: ${error.message}`));
        }
      } else {
        reject(new Error("No segments generated"));
      }
    });

    pythonProcess.on("error", (error) => {
      // Clean up temp script
      try {
        fs.unlinkSync(scriptPath);
      } catch (e) {
        // Ignore cleanup errors
      }
      reject(error);
    });
  });
}

// Main function
async function main() {
  const options = parseArgs();

  // Validate input
  if (!options.input) {
    console.error("Error: Input file or folder path is required");
    console.error(
      'Usage: yarn batch -i="PATH" [--segment=15] [--temp=0.3] [--lang=auto] [--prompt="text"] [--override]'
    );
    console.error("\nOptions:");
    console.error("  -i, --input=PATH     Input file or folder path (required)");
    console.error("  --segment=N          Chunk size in seconds (default: 15)");
    console.error("  --temp=N             Temperature (default: 0.1)");
    console.error(
      "  --lang=CODE          Language code or 'auto' (default: auto-detect)"
    );
    console.error("  --prompt=TEXT        Initial prompt text (Whisper only)");
    console.error(
      "  --model=NAME         Whisper (tiny/base/small/medium/large/turbo) or FunASR (funasr-nano/funasr-mlt-nano)"
    );
    console.error(
      "  --override, --force  Process files even if SRT already exists"
    );
    process.exit(1);
  }

  const inputPath = path.resolve(options.input);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input path does not exist: ${inputPath}`);
    process.exit(1);
  }

  const inputStat = fs.statSync(inputPath);
  let videoFiles = [];
  let inputLabel = "Input path";

  if (inputStat.isDirectory()) {
    videoFiles = getMediaFiles(inputPath);
    inputLabel = "Input folder";
  } else if (inputStat.isFile()) {
    if (!isSupportedMediaFile(inputPath)) {
      console.error(`Error: Unsupported media file: ${inputPath}`);
      process.exit(1);
    }
    videoFiles = [inputPath];
    inputLabel = "Input file";
  } else {
    console.error(`Error: Input path must be a file or directory: ${inputPath}`);
    process.exit(1);
  }

  // Display configuration
  console.log("\n" + "=".repeat(60));
  console.log("Batch Transcription Tool");
  console.log("=".repeat(60));
  console.log(`${inputLabel}: ${inputPath}`);
  console.log(`Chunk size: ${options.segment}s`);
  console.log(`Temperature: ${options.temp}`);
  console.log(
    `Language: ${options.lang === null || options.lang === ""
      ? "auto-detect"
      : options.lang
    }`
  );
  console.log(`Model: ${options.model}`);
  if (isFunASRModel(options.model)) {
    console.log("Backend: FunASR (FSMN-VAD silence removal + CTC timestamps)");
  }
  if (options.prompt) {
    const promptPreview =
      options.prompt.length > 60
        ? options.prompt.substring(0, 60) + "..."
        : options.prompt;
    console.log(`Initial prompt: ${promptPreview}`);
  }
  if (options.override) {
    console.log(
      `Override mode: Enabled (will process files with existing SRT)`
    );
  } else {
    console.log(`Skip existing: Enabled (will skip files with existing SRT)`);
  }
  console.log("=".repeat(60));

  if (inputStat.isDirectory()) {
    console.log("\nScanning for media files...");
  }

  if (videoFiles.length === 0) {
    console.log("No supported media files found in the specified path.");
    process.exit(0);
  }

  console.log(`Found ${videoFiles.length} media file(s)\n`);

  // Filter files based on override option
  let filesToProcess = [];
  let skippedCount = 0;

  if (!options.override) {
    // Check which files already have SRT files
    for (const file of videoFiles) {
      if (srtFileExists(file)) {
        skippedCount++;
        const srtPath = file.replace(/\.[^/.]+$/, "") + ".srt";
        console.log(
          `⏭️  Skipping ${path.basename(
            file
          )} (SRT already exists: ${path.basename(srtPath)})`
        );
      } else {
        filesToProcess.push(file);
      }
    }
  } else {
    filesToProcess = videoFiles;
    console.log(
      "⚠️  Override mode: Will process all files, including those with existing SRT files\n"
    );
  }

  if (filesToProcess.length === 0) {
    console.log("\n" + "=".repeat(60));
    console.log("No files to process");
    console.log("=".repeat(60));
    console.log(`Total files: ${videoFiles.length}`);
    console.log(`Skipped (SRT exists): ${skippedCount}`);
    console.log(`To process: 0`);
    console.log("=".repeat(60));
    console.log("\nUse --override to process files with existing SRT files.\n");
    process.exit(0);
  }

  if (skippedCount > 0) {
    console.log(
      `\n📋 Processing ${filesToProcess.length} file(s), skipped ${skippedCount} file(s) with existing SRT\n`
    );
  }

  // Process each file
  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < filesToProcess.length; i++) {
    const file = filesToProcess[i];
    console.log(
      `\n[${i + 1}/${filesToProcess.length}] Processing: ${path.basename(file)}`
    );

    try {
      const result = await transcribeFile(file, {
        model: options.model,
        language: options.lang || null,
        temperature: options.temp,
        chunkSize: options.segment,
        initialPrompt: options.prompt || null,
      });
      results.push(result);
      successCount++;
    } catch (error) {
      console.error(`\n  ❌ Failed: ${error.message}`);
      failCount++;
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Batch Processing Complete");
  console.log("=".repeat(60));
  console.log(`Total files: ${videoFiles.length}`);
  if (skippedCount > 0) {
    console.log(`Skipped (SRT exists): ${skippedCount}`);
  }
  console.log(`Processed: ${filesToProcess.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log("=".repeat(60));

  if (results.length > 0) {
    const totalSegments = results.reduce((sum, r) => sum + r.segments, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`\nTotal segments: ${totalSegments}`);
    console.log(`Total duration: ${formatTime(totalDuration)}`);
  }

  console.log("\n");
}

// Run main function
main().catch((error) => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
