/**
 * Manual end-to-end check for the FunASR backend without Electron/WebSocket.
 * Usage: node scripts/test_funasr_pipeline.js <video-or-audio-file> [language]
 */
const fs = require("fs");
const path = require("path");
const {
  streamTranscribeWithFunASR,
} = require("../backend/services/funasrService");

const file = process.argv[2];
const language = process.argv[3] || "zh";

if (!file) {
  console.error("Usage: node scripts/test_funasr_pipeline.js <file> [language]");
  process.exit(1);
}

const events = [];
const io = {
  to: () => ({
    emit: (name, payload) => {
      events.push({ name, payload });
      const preview = JSON.stringify(payload);
      console.log(`${name}: ${preview.slice(0, 180)}`);
    },
  }),
};

console.log(`[test] transcribing ${file} (language=${language})`);
const started = Date.now();
const child = streamTranscribeWithFunASR(
  file,
  {
    model: "funasr-nano",
    language,
    chunkSize: 24,
    videoFilePath: file,
  },
  io,
  "test-socket"
);

child.on("close", (code) => {
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const out = path.join(process.env.TEMP, "funasr_events.json");
  fs.writeFileSync(out, JSON.stringify(events, null, 2), "utf8");
  console.log(`[test] exit=${code} elapsed=${seconds}s events=${events.length}`);
  console.log(`[test] events written to ${out}`);
});
