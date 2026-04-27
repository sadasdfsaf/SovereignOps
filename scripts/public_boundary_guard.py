#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


REQUIRED_GITIGNORE_ENTRIES = (
    ".codex-private/",
    "CODEX_START_HERE.zh-CN.md",
    "PLANS.md",
    "tasks/backlog.jsonl",
    "docs/LINE_COUNT_TARGET.md",
    "sovereignops-codex-pack/",
)

FORBIDDEN_PUBLIC_PATHS = (
    "CODEX_START_HERE.zh-CN.md",
    "PLANS.md",
    "tasks/backlog.jsonl",
    "docs/LINE_COUNT_TARGET.md",
    "sovereignops-codex-pack",
)

FORBIDDEN_TRACKED_PREFIXES = (
    ".codex-private/",
    "sovereignops-codex-pack/",
)


@dataclass(frozen=True)
class BoundaryIssue:
    code: str
    path: str
    message: str


@dataclass(frozen=True)
class BoundaryReport:
    root: Path
    issues: tuple[BoundaryIssue, ...]

    @property
    def ok(self) -> bool:
        return len(self.issues) == 0

    def as_json(self) -> str:
        return json.dumps(
            {
                "ok": self.ok,
                "issues": [
                    {
                        "code": issue.code,
                        "path": issue.path,
                        "message": issue.message,
                    }
                    for issue in self.issues
                ],
            },
            indent=2,
            sort_keys=True,
        )


def collect_boundary_report(
    root: Path,
    *,
    tracked_paths: Sequence[str] | None = None,
) -> BoundaryReport:
    normalized_root = root.resolve()
    issues: list[BoundaryIssue] = []

    gitignore_entries = read_gitignore_entries(normalized_root)
    for entry in REQUIRED_GITIGNORE_ENTRIES:
        if entry not in gitignore_entries:
            issues.append(
                BoundaryIssue(
                    code="missing_gitignore_entry",
                    path=".gitignore",
                    message=f".gitignore must contain {entry}",
                ),
            )

    for relative_path in FORBIDDEN_PUBLIC_PATHS:
        if (normalized_root / relative_path).exists():
            issues.append(
                BoundaryIssue(
                    code="forbidden_public_path",
                    path=relative_path,
                    message="Private planning material must not be present in the public project.",
                ),
            )

    tracked = tuple(tracked_paths) if tracked_paths is not None else discover_tracked_paths(normalized_root)
    for tracked_path in tracked:
        normalized = normalize_tracked_path(tracked_path)
        if normalized == ".codex-private" or any(
            normalized.startswith(prefix) for prefix in FORBIDDEN_TRACKED_PREFIXES
        ):
            issues.append(
                BoundaryIssue(
                    code="forbidden_tracked_private_path",
                    path=normalized,
                    message="Private runtime or planning files must not be tracked.",
                ),
            )
        if normalized in FORBIDDEN_PUBLIC_PATHS:
            issues.append(
                BoundaryIssue(
                    code="forbidden_tracked_private_path",
                    path=normalized,
                    message="Private planning material must not be tracked.",
                ),
            )

    return BoundaryReport(normalized_root, tuple(issues))


def read_gitignore_entries(root: Path) -> set[str]:
    path = root / ".gitignore"
    if not path.exists():
        return set()

    entries: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#"):
            entries.add(line)
    return entries


def discover_tracked_paths(root: Path) -> tuple[str, ...]:
    if not (root / ".git").exists():
        return ()

    completed = subprocess.run(
        ["git", "ls-files"],
        cwd=str(root),
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return ()

    return tuple(
        normalize_tracked_path(line)
        for line in completed.stdout.splitlines()
        if line.strip()
    )


def normalize_tracked_path(path: str) -> str:
    normalized = path.replace("\\", "/").strip()
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check public/private workspace boundaries.")
    parser.add_argument("--root", default=".", help="Repository root.")
    parser.add_argument("--json", action="store_true", help="Emit a JSON report.")
    args = parser.parse_args(argv)

    report = collect_boundary_report(Path(args.root))
    if args.json:
        print(report.as_json())
    elif report.ok:
        print(f"Public boundary guard OK: {report.root}")
    else:
        for issue in report.issues:
            print(f"{issue.code}: {issue.path}: {issue.message}")

    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
