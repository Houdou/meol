#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function printHelp() {
  console.log("Usage: node scripts/drop-transcribe.js --config=PATH <file-or-folder> [...more]");
  console.log("");
  console.log("Loads transcription options from a flat YAML file and forwards each dropped path");
  console.log("to scripts/batch.js.");
  console.log("");
  console.log("Command-line overrides (applied on top of the YAML config):");
  console.log("  --model=NAME      e.g. funasr-nano, funasr-mlt-nano, turbo");
  console.log("  --lang=CODE       e.g. zh, ja, ko, en, auto");
  console.log("  --segment=N       VAD region / chunk length in seconds");
  console.log("  --override        Re-transcribe even when a .srt already exists");
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const targets = [];
  const overrides = {};
  let configPath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      return { help: true, configPath: null, targets: [], overrides };
    }

    if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
      continue;
    }

    if (arg === "--config") {
      configPath = args[i + 1] || null;
      i++;
      continue;
    }

    if (arg.startsWith("--model=")) {
      overrides.model = arg.slice("--model=".length);
      continue;
    }

    if (arg.startsWith("--lang=")) {
      overrides.lang = arg.slice("--lang=".length);
      continue;
    }

    if (arg.startsWith("--segment=")) {
      overrides.segment = parseFloat(arg.slice("--segment=".length));
      continue;
    }

    if (arg === "--override" || arg === "--force" || arg === "-f") {
      overrides.override = true;
      continue;
    }

    targets.push(arg);
  }

  return { help: false, configPath, targets, overrides };
}

function parseScalar(rawValue) {
  let value = rawValue.trim();

  if (!value) {
    return "";
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const innerValue = value.slice(1, -1);
    return value.startsWith('"')
      ? innerValue.replace(/\\n/g, "\n").replace(/\\"/g, '"')
      : innerValue;
  }

  value = value.replace(/\s+#.*$/, "").trim();

  if (/^(true|yes|on)$/i.test(value)) {
    return true;
  }

  if (/^(false|no|off)$/i.test(value)) {
    return false;
  }

  if (/^(null|~)$/i.test(value)) {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
}

function parseSimpleYaml(fileContent) {
  const config = {};
  const lines = fileContent.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue = ""] = match;
    const value = rawValue.trim();

    if (value === "|") {
      const blockLines = [];
      let nextIndex = i + 1;

      while (nextIndex < lines.length) {
        const nextLine = lines[nextIndex];

        if (/^\s/.test(nextLine)) {
          blockLines.push(nextLine.replace(/^\s{1,2}/, ""));
          nextIndex++;
          continue;
        }

        break;
      }

      config[key] = blockLines.join("\n").replace(/\s+$/, "");
      i = nextIndex - 1;
      continue;
    }

    config[key] = parseScalar(value);
  }

  return config;
}

function loadConfig(configPath) {
  const defaults = {
    segment: 24,
    temp: 0.1,
    lang: "auto",
    model: "funasr-nano",
    prompt: null,
    override: false,
  };

  if (!configPath) {
    return defaults;
  }

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const loaded = parseSimpleYaml(fs.readFileSync(configPath, "utf8"));
  return { ...defaults, ...loaded };
}

function buildBatchArgs(targetPath, config) {
  const args = [
    `--input=${targetPath}`,
    `--segment=${config.segment}`,
    `--temp=${config.temp}`,
    `--lang=${config.lang == null || config.lang === "" ? "auto" : config.lang}`,
    `--model=${config.model || "turbo"}`,
  ];

  if (config.prompt) {
    args.push(`--prompt=${config.prompt}`);
  }

  if (config.override) {
    args.push("--override");
  }

  return args;
}

function main() {
  const { help, configPath, targets, overrides } = parseCliArgs(process.argv);

  if (help) {
    printHelp();
    return;
  }

  if (targets.length === 0) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const batchScriptPath = path.join(__dirname, "batch.js");
  const resolvedConfigPath = configPath ? path.resolve(configPath) : null;
  const config = { ...loadConfig(resolvedConfigPath), ...overrides };
  let exitCode = 0;

  if (resolvedConfigPath) {
    console.log(`Using config: ${resolvedConfigPath}`);
  }

  for (const target of targets) {
    const resolvedTarget = path.resolve(target);

    if (!fs.existsSync(resolvedTarget)) {
      console.error(`\nMissing target: ${resolvedTarget}`);
      exitCode = 1;
      continue;
    }

    const result = spawnSync(
      process.execPath,
      [batchScriptPath, ...buildBatchArgs(resolvedTarget, config)],
      {
        stdio: "inherit",
      }
    );

    if (result.status !== 0) {
      exitCode = result.status || 1;
    }
  }

  process.exitCode = exitCode;
}

main();
