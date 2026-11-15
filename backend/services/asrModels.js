/**
 * Shared registry for the FunASR backends.
 * Used by the web backend (funasrService) and the CLI batch tool.
 */

const FUNASR_MODELS = {
  "funasr-nano": {
    id: "FunAudioLLM/Fun-ASR-Nano-2512",
    label: "Fun-ASR Nano (zh/en/ja + dialects)",
    languages: ["zh", "en", "ja", "yue"],
  },
  "funasr-mlt-nano": {
    id: "FunAudioLLM/Fun-ASR-MLT-Nano-2512",
    label: "Fun-ASR MLT Nano (31 languages)",
    languages: ["zh", "en", "ja", "ko"],
  },
};

function isFunASRModel(model) {
  return Boolean(model && FUNASR_MODELS[model]);
}

/**
 * Resolve the FunASR checkpoint for a requested alias + language.
 * Korean is not in the base Nano checkpoint, fall back to MLT-Nano.
 */
function resolveFunASRModel(model, language) {
  if (!FUNASR_MODELS[model]) {
    return null;
  }
  if (language === "ko" && model === "funasr-nano") {
    return { alias: "funasr-mlt-nano", ...FUNASR_MODELS["funasr-mlt-nano"] };
  }
  return { alias: model, ...FUNASR_MODELS[model] };
}

module.exports = {
  FUNASR_MODELS,
  isFunASRModel,
  resolveFunASRModel,
};
