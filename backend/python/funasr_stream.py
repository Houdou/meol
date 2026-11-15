#!/usr/bin/env python
"""Fun-ASR streaming worker for meol.

Emits the exact same line protocol the Whisper worker uses:

  stdout  {"id", "start", "end", "text", "words"}   one per subtitle segment
  stdout  {"type": "complete", "full_text": "..."}
  stderr  {"type": "device"|"progress"|"error", ...}

Long audio is split with FSMN-VAD first, so segments follow real pauses
instead of a fixed 30 second grid. Inside each VAD region Fun-ASR-Nano
returns CTC character/word timestamps, which are grouped into subtitle
lines at punctuation / max line length. Short filler lines ("嗯", "对",
"OK") are then merged into their neighbours and every cue is kept on
screen for at least 0.45s, so there are no flickering one-character
subtitles. The cleanup is always on and has no user-facing options.

Usage:
  python funasr_stream.py --file input.mp4 --model FunAudioLLM/Fun-ASR-Nano-2512 \
      --language zh --device cuda
"""

import argparse
import json
import os
import re
import subprocess
import sys
import traceback
import unicodedata

# Keep every model inside the project folder instead of the user profile cache.
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")
os.environ.setdefault("MODELSCOPE_CACHE", os.path.join(MODELS_DIR, ".modelscope"))
os.environ.setdefault("HF_HOME", os.path.join(MODELS_DIR, "huggingface"))
os.makedirs(os.path.join(MODELS_DIR, ".modelscope"), exist_ok=True)
os.makedirs(os.path.join(MODELS_DIR, "huggingface"), exist_ok=True)

# Windows pipes default to the ANSI code page. Force UTF-8 so the Node side
# can decode our JSON lines reliably.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Keep stdout clean for the JSON protocol: FunASR / ModelScope like to print
# progress and download logs, send everything else to stderr.
_PROTOCOL_OUT = sys.stdout
sys.stdout = sys.stderr


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), file=_PROTOCOL_OUT, flush=True)


def emit_stderr(payload):
    print(json.dumps(payload, ensure_ascii=False), file=sys.stderr, flush=True)


def log(message):
    print(f"[funasr] {message}", file=sys.stderr, flush=True)


SAMPLE_RATE = 16000

# Fun-ASR-Nano takes the language as a Chinese phrase inside the prompt
# ("语音转写成中文"), not as an ISO code.
LANGUAGE_PROMPTS = {
    "zh": "中文",
    "en": "英文",
    "ja": "日文",
    "ko": "韩文",
    "yue": "粤语",
}

SENTENCE_END = "。！？!?…；;"
CLAUSE_END = "，,、:："
# Subtitle line budget in "visual units": CJK counts 2, latin counts 1.
MAX_LINE_UNITS = 84
CLAUSE_BREAK_UNITS = 56
MAX_PAUSE = 0.7

# Post-processing defaults (always on): merge flickery fillers into neighbours
# and guarantee a minimum on-screen time.
MIN_SEGMENT_SECONDS = 0.45
MERGE_GAP_SECONDS = 0.55
MERGE_MAX_SECONDS = 8.0
WEAK_SEGMENT_SECONDS = 0.7
WEAK_SEGMENT_UNITS = 8
DROP_FILLER_SECONDS = 0.9
FILLER_CHARS = set("嗯啊呃哦哎唉呀哈嘛呢吧呗咯欸诶嗷对是好行")
FILLER_WORDS = {"ok", "okay", "yeah", "yes", "no", "umm", "uh", "hmm", "mm", "oh", "ah"}


def visual_len(text):
    total = 0
    for char in text:
        total += 2 if unicodedata.east_asian_width(char) in ("W", "F") else 1
    return total


def decode_audio(path, sample_rate=SAMPLE_RATE):
    """Decode any ffmpeg-readable file to mono float32 PCM."""
    command = [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-i",
        path,
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-",
    ]
    process = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if process.returncode != 0:
        message = process.stderr.decode("utf-8", "ignore").strip()
        raise RuntimeError(f"ffmpeg failed to decode audio: {message[:500]}")

    import numpy as np

    audio = np.frombuffer(process.stdout, dtype=np.float32)
    if audio.size == 0:
        raise RuntimeError("ffmpeg produced empty audio")
    return audio


def detect_speech_regions(vad, audio, max_single_ms=24000):
    """Return [(start_sec, end_sec), ...] from FSMN-VAD."""
    try:
        result = vad.generate(
            input=audio,
            fs=SAMPLE_RATE,
            max_single_segment_time=max_single_ms,
            batch_size=1,
        )
    except TypeError:
        # Older builds do not accept max_single_segment_time here.
        result = vad.generate(input=audio, fs=SAMPLE_RATE, batch_size=1)

    regions = []
    for item in result or []:
        for start_ms, end_ms in item.get("value") or []:
            regions.append([start_ms / 1000.0, end_ms / 1000.0])
    return regions


def merge_regions(regions, max_length=24.0, max_gap=0.6):
    """Merge neighbouring VAD regions to give the LLM more context."""
    merged = []
    for start, end in regions:
        if end <= start:
            continue
        if (
            merged
            and start - merged[-1][1] <= max_gap
            and end - merged[-1][0] <= max_length
        ):
            merged[-1][1] = end
        else:
            merged.append([start, end])
    return merged


def _clean_text(text):
    text = text.replace("\u2581", " ")
    text = text.replace("<|nospeech|>", "").replace("/sil", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _flush_line(lines, tokens, region_start, region_end):
    if not tokens:
        return
    text = _clean_text("".join(token["token"] for token in tokens))
    # Never emit a line that only carries punctuation.
    if not re.search(r"[\w\u4e00-\u9fff]", text):
        return
    start = region_start + tokens[0]["start_time"]
    end = region_start + tokens[-1]["end_time"]
    start = max(region_start, min(start, region_end))
    end = max(start, min(end, region_end))
    words = [
        {
            "word": _clean_text(token["token"]),
            "start": region_start + token["start_time"],
            "end": region_start + token["end_time"],
            "probability": 1.0,
        }
        for token in tokens
    ]
    lines.append({"start": start, "end": end, "text": text, "words": words})


def lines_from_timestamps(tokens, region_start, region_end):
    """Group CTC token timestamps into subtitle lines."""
    lines = []
    current = []
    current_units = 0
    last_end = None

    for raw in tokens:
        token = (raw.get("token") or "").replace("\u2581", " ")
        if not token:
            continue
        start = float(raw.get("start_time") or 0.0)
        end = float(raw.get("end_time") or start)
        is_punctuation_only = not re.search(r"[\w\u4e00-\u9fff]", token)

        if (
            current
            and not is_punctuation_only
            and last_end is not None
            and start - last_end > MAX_PAUSE
            and current_units >= 4
        ):
            _flush_line(lines, current, region_start, region_end)
            current = []
            current_units = 0

        current.append({"token": token, "start_time": start, "end_time": end})
        current_units += visual_len(token)
        last_end = end

        stripped = token.rstrip()
        tail = stripped[-1] if stripped else ""
        should_break = False
        if tail and tail in SENTENCE_END and current_units >= 4:
            should_break = True
        elif tail == "." and current_units >= 20:
            should_break = True
        elif tail and tail in CLAUSE_END and current_units >= CLAUSE_BREAK_UNITS:
            should_break = True
        elif current_units >= MAX_LINE_UNITS:
            should_break = True

        if should_break:
            _flush_line(lines, current, region_start, region_end)
            current = []
            current_units = 0

    _flush_line(lines, current, region_start, region_end)
    return lines


def _split_sentences(text):
    parts = re.findall(r"[^。！？!?…；;\n]+[。！？!?…；;]?", text)
    return [part.strip() for part in parts if part and part.strip()]


def lines_from_text(text, region_start, region_end):
    """Fallback when the checkpoint does not expose CTC timestamps."""
    sentences = []
    for sentence in _split_sentences(text):
        if visual_len(sentence) <= MAX_LINE_UNITS:
            sentences.append(sentence)
            continue
        buffer = ""
        for piece in re.findall(r"[^，,、:：]+[，,、:：]?", sentence):
            if buffer and visual_len(buffer + piece) > MAX_LINE_UNITS:
                sentences.append(buffer.strip())
                buffer = piece
            else:
                buffer += piece
        if buffer.strip():
            sentences.append(buffer.strip())

    total_units = sum(visual_len(sentence) for sentence in sentences) or 1
    duration = max(region_end - region_start, 0.01)
    lines = []
    cursor = region_start
    for sentence in sentences:
        span = duration * visual_len(sentence) / total_units
        end = min(region_end, cursor + span)
        lines.append(
            {"start": cursor, "end": max(end, cursor + 0.05), "text": sentence, "words": []}
        )
        cursor = end
    return lines


def _is_cjk(char):
    code = ord(char)
    return (
        0x3040 <= code <= 0x30FF
        or 0x3400 <= code <= 0x4DBF
        or 0x4E00 <= code <= 0x9FFF
        or 0xF900 <= code <= 0xFAFF
    )


def _is_filler_like(text):
    stripped = re.sub(r"[\s\W_]+", "", text, flags=re.UNICODE)
    if not stripped:
        return True
    if len(stripped) > 4:
        return False
    if all(char in FILLER_CHARS for char in stripped):
        return True
    return stripped.lower() in FILLER_WORDS


def _is_weak(segment):
    duration = segment["end"] - segment["start"]
    return (
        duration < WEAK_SEGMENT_SECONDS
        or visual_len(segment["text"]) <= WEAK_SEGMENT_UNITS
        or _is_filler_like(segment["text"])
    )


def join_text(left, right):
    left, right = left.strip(), right.strip()
    if not left:
        return right
    if not right:
        return left
    last_char, first_char = left[-1], right[0]
    if _is_cjk(last_char) or _is_cjk(first_char):
        return left + right
    if last_char in ".!?;:,)…" and first_char.isalnum():
        return f"{left} {right}"
    if (last_char.isalnum() or last_char in "'’") and (
        first_char.isalnum() or first_char in "'’"
    ):
        return f"{left} {right}"
    return left + right


class SubtitlePostProcessor:
    """Merge flickery short/filler lines and enforce a minimum display time."""

    def __init__(self):
        self.pending = None

    def feed(self, segment):
        ready = []
        segment = dict(segment)
        if self.pending is None:
            self.pending = segment
            return ready

        if self._should_merge(self.pending, segment):
            self._merge(self.pending, segment)
            return ready

        self._finalize(self.pending, segment["start"])
        if not self._should_drop(self.pending):
            ready.append(self.pending)
        self.pending = segment
        return ready

    def flush(self):
        if self.pending is None:
            return []
        self._finalize(self.pending, None)
        ready = [] if self._should_drop(self.pending) else [self.pending]
        self.pending = None
        return ready

    @staticmethod
    def _should_drop(segment):
        return (
            segment["end"] - segment["start"] < DROP_FILLER_SECONDS
            and _is_filler_like(segment["text"])
        )

    @staticmethod
    def _should_merge(left, right):
        gap = right["start"] - left["end"]
        if gap > MERGE_GAP_SECONDS:
            return False
        if (left["end"] - left["start"]) + (right["end"] - right["start"]) > MERGE_MAX_SECONDS:
            return False
        if visual_len(left["text"]) + visual_len(right["text"]) > MAX_LINE_UNITS:
            return False
        return _is_weak(left) or _is_weak(right)

    @staticmethod
    def _merge(left, right):
        left["text"] = join_text(left["text"], right["text"])
        left["end"] = max(left["end"], right["end"])
        left["words"] = list(left.get("words") or []) + list(right.get("words") or [])

    @staticmethod
    def _finalize(segment, next_start):
        if segment["end"] - segment["start"] < MIN_SEGMENT_SECONDS:
            target = segment["start"] + MIN_SEGMENT_SECONDS
            if next_start is not None:
                target = min(target, next_start - 0.05)
            if target > segment["end"]:
                segment["end"] = target
        segment["start"] = round(segment["start"], 3)
        segment["end"] = round(max(segment["end"], segment["start"] + 0.05), 3)


def transcribe_region(asr, audio, start, end, language_prompt, hotwords=None):
    import numpy as np
    import torch

    begin = max(0, int(start * SAMPLE_RATE))
    finish = min(len(audio), int(end * SAMPLE_RATE))
    if finish <= begin:
        return None

    # FunASR's FunASRNano template only accepts str or torch.Tensor, not ndarray.
    chunk = torch.from_numpy(np.ascontiguousarray(audio[begin:finish]))
    kwargs = {"input": chunk, "fs": SAMPLE_RATE, "itn": True, "batch_size": 1}
    if language_prompt:
        kwargs["language"] = language_prompt
    if hotwords:
        kwargs["hotwords"] = hotwords

    result = asr.generate(**kwargs)
    if not result:
        return None
    return result[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--model", default="FunAudioLLM/Fun-ASR-Nano-2512")
    parser.add_argument("--language", default=None)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--vad", default="fsmn-vad")
    parser.add_argument("--max-region", type=float, default=24.0)
    parser.add_argument("--hotwords", default=None)
    args = parser.parse_args()

    device = args.device
    if device == "auto":
        try:
            import torch

            device = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            device = "cpu"

    device_info = {"type": "device", "device": device}
    if device.startswith("cuda"):
        try:
            import torch

            device_info["gpu_name"] = torch.cuda.get_device_name(0)
            device_info["cuda_version"] = torch.version.cuda
            device_info["gpu_count"] = torch.cuda.device_count()
        except Exception:
            pass
    emit_stderr(device_info)
    log(f"model={args.model} device={device}")

    from funasr import AutoModel

    audio = decode_audio(args.file)
    duration = len(audio) / SAMPLE_RATE
    log(f"decoded {duration:.1f}s of audio")
    emit_stderr(
        {
            "type": "progress",
            "progress": 0,
            "currentTime": 0,
            "totalDuration": duration,
        }
    )

    vad = AutoModel(
        model=args.vad,
        device=device,
        disable_update=True,
        disable_pbar=True,
    )
    regions = merge_regions(
        detect_speech_regions(
            vad, audio, max_single_ms=int(args.max_region * 1000)
        ),
        max_length=args.max_region,
    )
    log(f"VAD found {len(regions)} speech region(s)")

    asr = AutoModel(
        model=args.model,
        device=device,
        disable_update=True,
        disable_pbar=True,
    )

    language_prompt = LANGUAGE_PROMPTS.get(args.language or "", None)
    hotwords = []
    if args.hotwords:
        hotwords = [word.strip() for word in args.hotwords.split(",") if word.strip()]

    post = SubtitlePostProcessor()
    segment_id = 0
    full_text_parts = []
    last_progress = -1
    total_regions = len(regions) or 1

    def emit_segment(line):
        nonlocal segment_id
        text = (line.get("text") or "").strip()
        if not text:
            return
        emit(
            {
                "id": segment_id,
                "start": round(line["start"], 3),
                "end": round(line["end"], 3),
                "text": text,
                "words": line.get("words") or [],
            }
        )
        full_text_parts.append(text)
        segment_id += 1

    for index, (region_start, region_end) in enumerate(regions):
        try:
            result = transcribe_region(
                asr, audio, region_start, region_end, language_prompt, hotwords
            )
        except Exception as error:
            log(f"region {index} failed: {error}")
            traceback.print_exc(file=sys.stderr)
            continue

        if not result:
            continue

        text = _clean_text(result.get("text") or "")
        timestamps = result.get("timestamps") or []
        if timestamps:
            lines = lines_from_timestamps(timestamps, region_start, region_end)
        else:
            lines = lines_from_text(text, region_start, region_end)

        for line in lines:
            for ready in post.feed(line):
                emit_segment(ready)

        progress = (
            int((region_end / duration) * 100)
            if duration > 0
            else int(((index + 1) / total_regions) * 100)
        )
        progress = max(0, min(100, progress))
        if progress - last_progress >= 3 or index == total_regions - 1:
            last_progress = progress
            emit_stderr(
                {
                    "type": "progress",
                    "progress": progress,
                    "currentTime": round(region_end, 3),
                    "totalDuration": duration,
                }
            )

    for ready in post.flush():
        emit_segment(ready)

    emit_stderr(
        {
            "type": "progress",
            "progress": 100,
            "currentTime": duration,
            "totalDuration": duration,
        }
    )
    separator = "" if language_prompt in ("中文", "日文", "韩文") else " "
    emit({"type": "complete", "full_text": separator.join(full_text_parts)})
    log(f"done: {segment_id} subtitle segment(s)")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit_stderr(
            {
                "type": "error",
                "message": str(error),
                "traceback": traceback.format_exc(),
            }
        )
        sys.exit(1)
