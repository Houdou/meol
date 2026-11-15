#!/usr/bin/env python
"""Compute subtitle-quality metrics for one or more SRT files.

Usage:
  python scripts/analyze_srt.py a.srt b.srt --out report.md
"""

import argparse
import re
from collections import Counter
from pathlib import Path

FILLERS = set("嗯啊呃哦哎唉对就是这那个然后吧呢嘛哈呀么的了着过呗咯嘛嗷")
TRADITIONAL = set("這個們說時後為與學生畫圖麼樣點現在還沒有會來到")
KEY_TERMS = [
    "EVA",
    "Photoshop",
    "Procreate",
    "Windows",
    "CS",
    "HR",
    "卡普空",
    "怪物猎人",
    "米哈游",
    "腾讯",
    "网易",
    "鲁美",
    "远大",
    "元大",
    "千惠",
    "辐射",
    "插画",
    "二次元",
]


def to_seconds(stamp):
    stamp = stamp.strip().replace(".", ",")
    time_part, _, ms_part = stamp.partition(",")
    hours, minutes, seconds = time_part.split(":")
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(ms_part or 0) / 1000


def parse_srt(path):
    text = Path(path).read_text(encoding="utf-8-sig", errors="replace")
    entries = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [line for line in block.splitlines() if line.strip()]
        if len(lines) < 2:
            continue
        timing = next((line for line in lines if "-->" in line), None)
        if not timing:
            continue
        start, _, end = timing.partition("-->")
        entries.append(
            {
                "start": to_seconds(start),
                "end": to_seconds(end),
                "text": " ".join(lines[lines.index(timing) + 1 :]).strip(),
            }
        )
    return entries


def normalize(text):
    return re.sub(r"\s+", "", text)


def analyze(path):
    entries = parse_srt(path)
    durations = [entry["end"] - entry["start"] for entry in entries]
    text = "".join(entry["text"] for entry in entries)
    chars = len(normalize(text))
    filler_chars = sum(text.count(char) for char in FILLERS)
    traditional = sum(text.count(char) for char in TRADITIONAL)

    longest_run = 0
    longest_char = ""
    current_char = ""
    current_len = 0
    for char in text:
        if char == current_char:
            current_len += 1
        else:
            current_char = char
            current_len = 1
        if current_len > longest_run:
            longest_run = current_len
            longest_char = char

    duplicates = sum(
        1
        for previous, current in zip(entries, entries[1:])
        if normalize(previous["text"]) == normalize(current["text"])
        and len(normalize(current["text"])) > 1
    )

    filler_only = sum(
        1
        for entry in entries
        if entry["text"] and all(char in FILLERS or not char.isalnum() for char in entry["text"])
    )

    terms = {term: text.count(term) for term in KEY_TERMS}
    terms = {term: count for term, count in terms.items() if count}

    return {
        "file": str(path),
        "segments": len(entries),
        "chars": chars,
        "chars_per_min": round(chars / max(1, entries[-1]["end"] / 60), 1) if entries else 0,
        "avg_chars": round(chars / max(1, len(entries)), 1),
        "duration_lt_0.05": sum(1 for d in durations if d < 0.05),
        "duration_lt_0.3": sum(1 for d in durations if d < 0.3),
        "duration_lt_1": sum(1 for d in durations if d < 1),
        "duration_gt_10": sum(1 for d in durations if d > 10),
        "max_duration": round(max(durations), 2) if durations else 0,
        "filler_char_pct": round(filler_chars / max(1, chars) * 100, 1),
        "filler_only_segments": filler_only,
        "traditional_chars": traditional,
        "longest_char_run": f"{longest_char} x{longest_run}",
        "duplicate_segments": duplicates,
        "terms": terms,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+")
    parser.add_argument("--out", default="srt_analysis.md")
    args = parser.parse_args()

    results = [analyze(path) for path in args.files]
    lines = ["# SRT analysis", ""]
    keys = [
        "segments",
        "chars",
        "chars_per_min",
        "avg_chars",
        "duration_lt_0.05",
        "duration_lt_0.3",
        "duration_lt_1",
        "duration_gt_10",
        "max_duration",
        "filler_char_pct",
        "filler_only_segments",
        "traditional_chars",
        "longest_char_run",
        "duplicate_segments",
    ]

    for result in results:
        lines.append(f"## {Path(result['file']).name}")
        for key in keys:
            lines.append(f"- {key}: {result[key]}")
        lines.append(f"- key terms: {result['terms']}")
        lines.append("")

    Path(args.out).write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
