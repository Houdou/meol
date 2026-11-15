"""Throwaway probe for Fun-ASR-Nano output fields (ASCII-safe output)."""
import json
import os
import subprocess
import sys

# Keep model downloads inside the project, same as funasr_stream.py.
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault(
    "MODELSCOPE_CACHE", os.path.join(PROJECT_ROOT, "models", ".modelscope")
)
os.environ.setdefault("HF_HOME", os.path.join(PROJECT_ROOT, "models", "huggingface"))

import numpy as np
import torch
from funasr import AutoModel

path = sys.argv[1]
proc = subprocess.run(
    ["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
    stdout=subprocess.PIPE,
)
audio = np.frombuffer(proc.stdout, dtype=np.float32)
chunk = torch.from_numpy(audio)

model = AutoModel(
    model="FunAudioLLM/Fun-ASR-Nano-2512",
    device="cuda",
    disable_update=True,
    disable_pbar=True,
)
result = model.generate(input=chunk, fs=16000, language="中文", itn=True, batch_size=1)[0]

text = result.get("text") or ""
timestamps = result.get("timestamps") or []
tokenizer = model.model.ctc_tokenizer
ids = tokenizer.encode(text)

payload = {
    "keys": sorted(result.keys()),
    "text": text,
    "text_len": len(text),
    "n_timestamps": len(timestamps),
    "n_ctc_ids": len(ids),
    "first_tokens": [item.get("token") for item in timestamps[:8]],
    "first_times": [
        [round(item.get("start_time", 0), 3), round(item.get("end_time", 0), 3)]
        for item in timestamps[:8]
    ],
    "has_timestamp_field": "timestamp" in result,
    "sentence_info": result.get("sentence_info"),
}
print(json.dumps(payload, ensure_ascii=True))
