const { spawn } = require("child_process");
const path = require("path");
const { extractFrameWithSubtitle } = require("./videoScreenshot");
const { cleanupFiles } = require("../utils/cacheManager");
const { generateSRT } = require("./subtitleGenerator");
const {
  FUNASR_MODELS,
  isFunASRModel,
  resolveFunASRModel,
} = require("./asrModels");

const PROJECT_ROOT = path.join(__dirname, "../..");

function pythonPath() {
  return path.join(__dirname, "../../venv/Scripts/python.exe");
}

function workerPath() {
  return path.join(__dirname, "../python/funasr_stream.py");
}

/**
 * Stream a FunASR transcription over the existing WebSocket protocol.
 * Emits: transcription-device / transcription-progress / transcription-chunk /
 * transcription-screenshot / transcription-complete / transcription-error.
 */
function streamTranscribeWithFunASR(filePath, options = {}, io, socketId) {
  const {
    model = "funasr-nano",
    language = null,
    chunkSize = 24,
    videoFilePath = null,
    hotwords = null,
  } = options;

  const resolved = resolveFunASRModel(model, language);
  if (!resolved) {
    throw new Error(`Unknown FunASR model: ${model}`);
  }

  const SCREENSHOT_INTERVAL = 10;
  let lastScreenshotTime = -SCREENSHOT_INTERVAL;
  const screenshotFiles = [];
  const allSegments = [];

  const args = [
    workerPath(),
    "--file",
    filePath,
    "--model",
    resolved.id,
    "--device",
    "auto",
    "--max-region",
    String(Math.max(8, Math.min(30, chunkSize || 24))),
  ];
  if (language) {
    args.push("--language", language);
  }
  if (hotwords) {
    args.push("--hotwords", hotwords);
  }

  console.log(
    `[FunASR] Starting ${resolved.alias} (${resolved.id}) language=${
      language || "auto"
    }`
  );

  const pythonProcess = spawn(pythonPath(), args, {
    cwd: path.join(__dirname, "../python"),
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
  let hadError = false;

  const handleSegment = (segment) => {
    const text = (segment.text || "").trim();
    if (!text) return;

    allSegments.push({ start: segment.start, end: segment.end, text });

    if (videoFilePath) {
      const sinceLast = segment.start - lastScreenshotTime;
      if (sinceLast >= SCREENSHOT_INTERVAL) {
        lastScreenshotTime = segment.start;
        extractFrameWithSubtitle(videoFilePath, segment.start, text)
          .then((screenshotPath) => {
            screenshotFiles.push(screenshotPath);
            io.to(socketId).emit("transcription-screenshot", {
              segmentId: segment.id,
              screenshot: `file://${screenshotPath}`,
            });
          })
          .catch((error) => {
            console.error(
              `[FunASR] Screenshot failed for segment ${segment.id}: ${error.message}`
            );
          });
      }
    }

    io.to(socketId).emit("transcription-chunk", {
      segment: text,
      start: segment.start,
      end: segment.end,
      words: segment.words || [],
      id: segment.id,
    });
  };

  const handleMessage = (message) => {
    if (
      message.text !== undefined &&
      message.start !== undefined &&
      message.end !== undefined
    ) {
      handleSegment(message);
      return;
    }

    if (message.type === "complete") {
      const subtitlePath = filePath.replace(/\.[^/.]+$/, "") + ".srt";
      try {
        generateSRT(allSegments, subtitlePath);
        console.log(`[FunASR] Subtitle written: ${subtitlePath}`);
      } catch (error) {
        console.error(`[FunASR] Failed to write subtitle: ${error.message}`);
      }

      if (screenshotFiles.length > 0) {
        cleanupFiles(screenshotFiles).catch((error) =>
          console.error("[FunASR] Screenshot cleanup failed:", error.message)
        );
      }

      io.to(socketId).emit("transcription-complete", {
        fullText: message.full_text,
        subtitlePath,
      });
      return;
    }

    if (message.type === "error") {
      hadError = true;
      console.error(`[FunASR] Error: ${message.message}`);
      io.to(socketId).emit("transcription-error", { message: message.message });
      return;
    }

    if (message.type === "device") {
      console.log(
        `[FunASR] Device: ${message.device}${
          message.gpu_name ? ` (${message.gpu_name})` : ""
        }`
      );
      io.to(socketId).emit("transcription-device", {
        device: message.device,
        gpu_name: message.gpu_name,
        cuda_version: message.cuda_version,
      });
      return;
    }

    if (message.type === "progress") {
      io.to(socketId).emit("transcription-progress", {
        progress: message.progress,
        currentTime: message.currentTime || null,
        totalDuration: message.totalDuration || null,
      });
    }
  };

  pythonProcess.stdout.on("data", (data) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        handleMessage(JSON.parse(trimmed));
      } catch (error) {
        console.warn(`[FunASR] Skipping unparsable stdout line: ${trimmed.slice(0, 120)}`);
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
          handleMessage(JSON.parse(trimmed));
          continue;
        } catch (error) {
          // fall through to logging
        }
      }
      // FunASR / ModelScope logs. Keep them visible but quiet.
      if (
        trimmed.startsWith("[funasr]") ||
        trimmed.includes("Loading") ||
        trimmed.includes("Downloading")
      ) {
        console.log(`[FunASR] ${trimmed.replace(/^\[funasr\]\s*/, "")}`);
      }
    }
  });

  pythonProcess.on("close", (code) => {
    if (screenshotFiles.length > 0) {
      cleanupFiles(screenshotFiles).catch(() => {});
    }
    if (code !== 0) {
      console.error(`[FunASR] Python exited with code ${code}`);
      if (!hadError) {
        io.to(socketId).emit("transcription-error", {
          message: `FunASR process exited with code ${code}`,
        });
      }
    }
  });

  pythonProcess.on("error", (error) => {
    io.to(socketId).emit("transcription-error", {
      message: `Failed to start FunASR: ${error.message}`,
    });
  });

  return pythonProcess;
}

module.exports = {
  FUNASR_MODELS,
  isFunASRModel,
  resolveFunASRModel,
  streamTranscribeWithFunASR,
};
