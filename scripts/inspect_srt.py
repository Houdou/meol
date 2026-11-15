#!/usr/bin/env python
"""Print SRT entries in a time range and flag suspicious content.

Usage:
  python scripts/inspect_srt.py file.srt --start 3260 --end 3330 --out report.md
"""

import argparse
import re
import sys
import unicodedata
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


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


def stamp(seconds):
    return f"{int(seconds // 60)}:{int(seconds % 60):02d}"


def suspicious(text):
    reasons = []
    if len(text) > 80:
        reasons.append(f"long={len(text)}")
    if re.search(r"(.)\1{9,}", text):
        reasons.append("char-loop")
    categories = [unicodedata.category(char)[0] for char in text if not char.isspace()]
    if categories and categories.count("P") / len(categories) > 0.5:
        reasons.append("punctuation-heavy")
    if not any(char.isalnum() or "\u4e00" <= char <= "\u9fff" for char in text):
        reasons.append("no-words")
    return reasons


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--end", type=float, default=10**9)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    entries = parse_srt(args.file)
    selected = [
        entry
        for entry in entries
        if entry["end"] >= args.start and entry["start"] <= args.end
    ]

    lines = [f"# {Path(args.file).name}", ""]
    lines.append(f"Range: {stamp(args.start)} – {stamp(args.end)}")
    lines.append(f"Entries: {len(selected)}")
    lines.append("")

    for entry in selected:
        flags = suspicious(entry["text"])
        marker = f"  ⚠️ {', '.join(flags)}" if flags else ""
        lines.append(
            f"- [{stamp(entry['start'])}–{stamp(entry['end'])}] {entry['text']}{marker}"
        )

    report = "\n".join(lines)
    if args.out:
        Path(args.out).write_text(report, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(report)


if __name__ == "__main__":
    main()
