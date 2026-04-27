#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

try:
    from scripts.loc_budget import COUNTED_EXTENSIONS, EXCLUDED_DIRS, LineCount, classify, count_file
except ModuleNotFoundError:
    from loc_budget import COUNTED_EXTENSIONS, EXCLUDED_DIRS, LineCount, classify, count_file

DEFAULT_MINIMUMS = {
    "docs": 1500,
    "other": 1500,
    "python": 800,
    "rust": 3000,
    "tests": 5000,
    "tooling": 1200,
    "total": 30000,
    "typescript": 10000,
}

DEFAULT_GENERATED_DIRS = ("generated",)
PRIVATE_DIRS = {".codex-private"}


@dataclass(frozen=True)
class GeneratedFile:
    path: str
    lines: int


@dataclass(frozen=True)
class Violation:
    code: str
    message: str


@dataclass(frozen=True)
class IntegrityReport:
    counts: LineCount
    minimums: dict[str, int]
    generated_files: list[GeneratedFile]
    generated_max_files: int
    generated_max_lines: int
    violations: list[Violation]

    @property
    def ok(self) -> bool:
        return not self.violations

    @property
    def generated_lines(self) -> int:
        return sum(item.lines for item in self.generated_files)


def _skip_counted_path(relative_path: Path) -> bool:
    return any(part in EXCLUDED_DIRS or part in PRIVATE_DIRS for part in relative_path.parts)


def collect_public_counts(root: Path) -> LineCount:
    totals: dict[str, int] = {}
    files = 0
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        if _skip_counted_path(rel) or not path.is_file() or path.suffix not in COUNTED_EXTENSIONS:
            continue
        files += 1
        bucket = classify(rel)
        totals[bucket] = totals.get(bucket, 0) + count_file(path)
    return LineCount(files=files, totals=totals)


def collect_generated_files(root: Path, generated_dirs: Sequence[str]) -> list[GeneratedFile]:
    generated_dir_set = set(generated_dirs)
    skip_dirs = (set(EXCLUDED_DIRS) | PRIVATE_DIRS) - generated_dir_set
    files: list[GeneratedFile] = []
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        if any(part in skip_dirs for part in rel.parts) or not path.is_file():
            continue
        if not any(part in generated_dir_set for part in rel.parts):
            continue
        files.append(GeneratedFile(path=rel.as_posix(), lines=count_file(path)))
    return sorted(files, key=lambda item: item.path)


def parse_minimums(values: Sequence[str], *, include_defaults: bool = True) -> dict[str, int]:
    minimums = dict(DEFAULT_MINIMUMS) if include_defaults else {}
    for value in values:
        if "=" not in value:
            raise ValueError(f"minimum must use name=value format: {value}")
        name, raw_minimum = value.split("=", 1)
        name = name.strip()
        if not name:
            raise ValueError("minimum name cannot be empty")
        try:
            minimum = int(raw_minimum)
        except ValueError as exc:
            raise ValueError(f"minimum for {name} must be an integer") from exc
        if minimum < 0:
            raise ValueError(f"minimum for {name} cannot be negative")
        minimums[name] = minimum
    return minimums


def evaluate(
    root: Path,
    *,
    minimums: Mapping[str, int] | None = None,
    generated_dirs: Sequence[str] = DEFAULT_GENERATED_DIRS,
    generated_max_files: int = 0,
    generated_max_lines: int = 0,
) -> IntegrityReport:
    counts = collect_public_counts(root)
    expected = dict(DEFAULT_MINIMUMS if minimums is None else minimums)
    generated_files = collect_generated_files(root, generated_dirs)
    generated_lines = sum(item.lines for item in generated_files)
    violations: list[Violation] = []

    for bucket, minimum in sorted(expected.items()):
        actual = counts.total if bucket == "total" else counts.totals.get(bucket, 0)
        if actual < minimum:
            violations.append(
                Violation(
                    code=f"minimum:{bucket}",
                    message=f"{bucket} LOC {actual} is below required minimum {minimum}",
                )
            )

    if len(generated_files) > generated_max_files:
        violations.append(
            Violation(
                code="generated:files",
                message=(
                    f"generated file count {len(generated_files)} exceeds maximum "
                    f"{generated_max_files}"
                ),
            )
        )
    if generated_lines > generated_max_lines:
        violations.append(
            Violation(
                code="generated:lines",
                message=f"generated LOC {generated_lines} exceeds maximum {generated_max_lines}",
            )
        )

    return IntegrityReport(
        counts=counts,
        minimums=expected,
        generated_files=generated_files,
        generated_max_files=generated_max_files,
        generated_max_lines=generated_max_lines,
        violations=violations,
    )


def to_json(report: IntegrityReport) -> str:
    payload = {
        "files": report.counts.files,
        "generated": {
            "files": [
                {"lines": item.lines, "path": item.path}
                for item in sorted(report.generated_files, key=lambda entry: entry.path)
            ],
            "max_files": report.generated_max_files,
            "max_lines": report.generated_max_lines,
            "total_files": len(report.generated_files),
            "total_lines": report.generated_lines,
        },
        "minimums": dict(sorted(report.minimums.items())),
        "ok": report.ok,
        "total": report.counts.total,
        "totals": dict(sorted(report.counts.totals.items())),
        "violations": [
            {"code": violation.code, "message": violation.message}
            for violation in report.violations
        ],
    }
    return json.dumps(payload, indent=2, sort_keys=True)


def render_text(report: IntegrityReport) -> str:
    status = "PASS" if report.ok else "FAIL"
    lines = [
        f"LOC integrity: {status}",
        f"files: {report.counts.files}",
    ]
    for bucket, actual in sorted(report.counts.totals.items()):
        minimum = report.minimums.get(bucket)
        suffix = f" minimum {minimum}" if minimum is not None else ""
        lines.append(f"{bucket:12s} {actual:8d}{suffix}")
    lines.append(f"{'total':12s} {report.counts.total:8d} minimum {report.minimums.get('total', 0)}")
    lines.append(
        "generated   "
        f"{len(report.generated_files):8d} files/{report.generated_max_files} max, "
        f"{report.generated_lines} LOC/{report.generated_max_lines} max"
    )
    if report.violations:
        lines.append("violations:")
        lines.extend(f"- {violation.message}" for violation in report.violations)
    return "\n".join(lines) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate LOC budget integrity.")
    parser.add_argument("--root", default=".", help="Repository root to scan.")
    parser.add_argument(
        "--minimum",
        action="append",
        default=[],
        help="Override or add a LOC floor as bucket=value. May be repeated.",
    )
    parser.add_argument(
        "--no-default-minimums",
        action="store_true",
        help="Use only minimums supplied with --minimum.",
    )
    parser.add_argument(
        "--generated-dir",
        action="append",
        default=[],
        help="Directory name treated as generated output. Defaults to generated.",
    )
    parser.add_argument(
        "--generated-max-files",
        type=int,
        default=0,
        help="Maximum expected generated files in generated directories.",
    )
    parser.add_argument(
        "--generated-max-lines",
        type=int,
        default=0,
        help="Maximum expected generated LOC in generated directories.",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable output.")
    args = parser.parse_args(argv)

    try:
        minimums = parse_minimums(args.minimum, include_defaults=not args.no_default_minimums)
    except ValueError as exc:
        parser.error(str(exc))

    if args.generated_max_files < 0 or args.generated_max_lines < 0:
        parser.error("generated maximums cannot be negative")

    generated_dirs = tuple(args.generated_dir) if args.generated_dir else DEFAULT_GENERATED_DIRS
    report = evaluate(
        Path(args.root).resolve(),
        minimums=minimums,
        generated_dirs=generated_dirs,
        generated_max_files=args.generated_max_files,
        generated_max_lines=args.generated_max_lines,
    )
    print(to_json(report) if args.json else render_text(report), end="")
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
