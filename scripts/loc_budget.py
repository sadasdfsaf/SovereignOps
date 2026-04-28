#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

EXCLUDED_DIRS = {
    ".git",
    ".codex-private",
    ".codex-run",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tools",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "generated",
    "node_modules",
    "target",
    "venv",
}

COUNTED_EXTENSIONS = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".py",
    ".rs",
    ".sh",
    ".toml",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
}

TARGET_LOC = 100_000


@dataclass(frozen=True)
class LineCount:
    files: int
    totals: dict[str, int]

    @property
    def total(self) -> int:
        return sum(self.totals.values())


def should_skip(path: Path) -> bool:
    return any(part in EXCLUDED_DIRS for part in path.parts)


def count_file(path: Path) -> int:
    with path.open("r", encoding="utf-8", errors="ignore") as handle:
        return sum(1 for _ in handle)


def classify(path: Path) -> str:
    parts = path.parts
    path_text = path.as_posix()
    if "tests" in parts or path.name.endswith((".test.ts", ".spec.ts", "_test.rs")):
        return "tests"
    if parts and parts[0] == "crates":
        return "rust"
    if parts and parts[0] in {"apps", "packages"}:
        return "typescript"
    if path_text.startswith("services/mcp-gateway") or path_text.startswith("services/sync"):
        return "typescript"
    if path_text.startswith("services/ingest"):
        return "python"
    if parts and parts[0] == "scripts":
        return "tooling"
    if path.suffix in {".md", ".yaml", ".yml"}:
        return "docs"
    return "other"


def collect_counts(root: Path) -> LineCount:
    totals: dict[str, int] = {}
    files = 0
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        if should_skip(rel) or not path.is_file() or path.suffix not in COUNTED_EXTENSIONS:
            continue
        files += 1
        bucket = classify(rel)
        totals[bucket] = totals.get(bucket, 0) + count_file(path)
    return LineCount(files=files, totals=totals)


def render_summary(counts: LineCount) -> str:
    rows = ["SovereignOps effective LOC summary", f"files: {counts.files}"]
    for key in sorted(counts.totals):
        rows.append(f"{key:12s} {counts.totals[key]:8d}")
    rows.append(f"{'total':12s} {counts.total:8d}")
    rows.append("target      100000+")
    rows.append(f"remaining   {max(0, TARGET_LOC - counts.total):8d}")
    return "\n".join(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Count effective handwritten SovereignOps LOC.")
    parser.add_argument("--root", default=".", help="Repository root to scan.")
    parser.add_argument("--summary", action="store_true", help="Print a categorized summary.")
    args = parser.parse_args()

    counts = collect_counts(Path(args.root))
    if args.summary:
        print(render_summary(counts))
    else:
        print(counts.total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
