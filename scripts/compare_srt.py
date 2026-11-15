#!/usr/bin/env python
"""Compare two SRT files produced from the same media.

Writes a Markdown report with:
  - basic stats (segments, characters, coverage)
  - time-bucketed character similarity between the two transcripts
  - the worst-matching buckets, side by side
  - an optional English reference (e.g. a Whisper translation) for context

Usage:
  python scripts/compare_srt.py a.srt b.srt --out report.md \
      --ref-en english.srt --bucket 15
"""

import argparse
import difflib
import re
import sys
import unicodedata
from collections import Counter
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
        text_lines = lines[lines.index(timing) + 1 :]
        entries.append(
            {
                "start": to_seconds(start),
                "end": to_seconds(end),
                "text": " ".join(text_lines).strip(),
            }
        )
    return entries


def normalize(text):
    text = text.lower()
    text = re.sub(r"\s+", "", text)
    text = "".join(
        char for char in text if not unicodedata.category(char).startswith("P")
    )
    return text


def stats(entries):
    chars = sum(len(entry["text"]) for entry in entries)
    short = sum(1 for entry in entries if entry["end"] - entry["start"] < 1.0)
    gaps = sum(
        1
        for previous, current in zip(entries, entries[1:])
        if current["start"] - previous["end"] > 3
    )
    return {
        "segments": len(entries),
        "chars": chars,
        "avg_chars": round(chars / max(1, len(entries)), 1),
        "short_segments": short,
        "gaps_gt_3s": gaps,
        "first": round(entries[0]["start"], 2) if entries else 0,
        "last": round(entries[-1]["end"], 2) if entries else 0,
    }


def repeated_phrases(entries, top=8):
    counter = Counter()
    for entry in entries:
        text = normalize(entry["text"])
        for n in (8, 12):
            for index in range(max(0, len(text) - n + 1)):
                counter[text[index : index + n]] += 1
    return [(phrase, count) for phrase, count in counter.most_common(top) if count > 1]


def bucketize(entries, size):
    buckets = {}
    for entry in entries:
        key = int(entry["start"] // size)
        buckets[key] = (buckets.get(key) or "") + entry["text"]
    return buckets


def overlapping_text(entries, start, end):
    parts = [
        entry["text"]
        for entry in entries
        if entry["end"] >= start and entry["start"] <= end
    ]
    return " ".join(parts)


FILLERS = set("嗯啊呃哦哎唉对就是这那个然后吧呢嘛哈呀么的了着过呗咯")


def content_only(text):
    return "".join(char for char in normalize(text) if char not in FILLERS)


def ratio(a, b):
    a, b = normalize(a), normalize(b)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("a")
    parser.add_argument("b")
    parser.add_argument("--out", default="srt_compare_report.md")
    parser.add_argument("--bucket", type=int, default=15)
    parser.add_argument("--ref-en", default=None)
    parser.add_argument("--worst", type=int, default=20)
    args = parser.parse_args()

    a_entries = parse_srt(args.a)
    b_entries = parse_srt(args.b)
    ref_entries = parse_srt(args.ref_en) if args.ref_en else []

    a_buckets = bucketize(a_entries, args.bucket)
    b_buckets = bucketize(b_entries, args.bucket)

    keys = sorted(set(a_buckets) | set(b_buckets))
    weighted_sum = 0.0
    weight_sum = 0.0
    content_sum = 0.0
    content_weight = 0.0
    rows = []

    for key in keys:
        a_text = a_buckets.get(key, "")
        b_text = b_buckets.get(key, "")
        if not normalize(a_text) and not normalize(b_text):
            continue
        r = ratio(a_text, b_text)
        weight = max(len(normalize(a_text)), len(normalize(b_text)), 1)
        weighted_sum += r * weight
        weight_sum += weight

        a_content = content_only(a_text)
        b_content = content_only(b_text)
        if a_content or b_content:
            content_ratio = ratio(a_content, b_content)
            content_bucket_weight = max(len(a_content), len(b_content), 1)
            content_sum += content_ratio * content_bucket_weight
            content_weight += content_bucket_weight
        else:
            content_ratio = 1.0
        rows.append((r, content_ratio, key * args.bucket, a_text, b_text))

    overall = weighted_sum / weight_sum if weight_sum else 0.0
    overall_content = content_sum / content_weight if content_weight else 0.0
    rows.sort(key=lambda row: row[0])

    high = sum(1 for row in rows if row[0] >= 0.9)
    mid = sum(1 for row in rows if 0.7 <= row[0] < 0.9)
    low = sum(1 for row in rows if 0.5 <= row[0] < 0.7)
    very_low = sum(1 for row in rows if row[0] < 0.5)

    lines = []
    lines.append("# SRT comparison\n")
    lines.append(f"- A: `{args.a}`")
    lines.append(f"- B: `{args.b}`")
    if args.ref_en:
        lines.append(f"- Reference (EN): `{args.ref_en}`")
    lines.append("")

    for label, entries in (("A", a_entries), ("B", b_entries)):
        info = stats(entries)
        lines.append(f"## {label} stats")
        for key, value in info.items():
            lines.append(f"- {key}: {value}")
        lines.append("")

    lines.append("## Similarity")
    lines.append(f"- Time buckets: {args.bucket}s, compared buckets: {len(rows)}")
    lines.append(f"- Weighted character similarity: **{overall * 100:.1f}%**")
    lines.append(
        f"- Weighted content similarity (fillers removed): **{overall_content * 100:.1f}%**"
    )
    lines.append(
        f"- Bucket distribution: >=90% {high}, 70-90% {mid}, 50-70% {low}, <50% {very_low}"
    )
    lines.append("")

    lines.append("## Repeated n-grams (possible hallucination/loops)")
    for label, entries in (("A", a_entries), ("B", b_entries)):
        repeats = repeated_phrases(entries)
        lines.append(f"### {label}")
        if not repeats:
            lines.append("- none")
        for phrase, count in repeats:
            lines.append(f"- x{count}: `{phrase}`")
        lines.append("")

    lines.append(f"## Worst {args.worst} buckets")
    for r, content_ratio, start, a_text, b_text in rows[: args.worst]:
        end = start + args.bucket
        lines.append(
            f"### {int(start // 60)}:{int(start % 60):02d}–{int(end // 60)}:{int(end % 60):02d} — similarity {r * 100:.0f}% / content {content_ratio * 100:.0f}%"
        )
        lines.append(f"- A: {a_text.strip() or '(empty)'}")
        lines.append(f"- B: {b_text.strip() or '(empty)'}")
        if ref_entries:
            ref = overlapping_text(ref_entries, start, end)
            if ref:
                lines.append(f"- EN ref: {ref.strip()}")
        lines.append("")

    lines.append("## Spot checks")
    for start in (0, 300, 900, 1800, 3600, 5400, 7200):
        end = start + 30
        a_text = overlapping_text(a_entries, start, end)
        b_text = overlapping_text(b_entries, start, end)
        if not a_text and not b_text:
            continue
        lines.append(f"### {int(start // 60)}:{int(start % 60):02d}")
        lines.append(f"- A: {a_text.strip() or '(empty)'}")
        lines.append(f"- B: {b_text.strip() or '(empty)'}")
        if ref_entries:
            ref = overlapping_text(ref_entries, start, end)
            if ref:
                lines.append(f"- EN ref: {ref.strip()}")
        lines.append("")

    Path(args.out).write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {args.out} (similarity {overall * 100:.1f}%)")


if __name__ == "__main__":
    main()
