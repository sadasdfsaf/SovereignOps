#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path

FORBIDDEN_PATTERNS = {
    "unwrap": re.compile(r"\.unwrap(?:_err)?\s*\("),
    "expect": re.compile(r"\.expect\s*\("),
    "panic": re.compile(r"\bpanic!\s*\("),
}


@dataclass(frozen=True)
class RustFinding:
    path: Path
    line_number: int
    rule: str
    line: str

    def render(self, root: Path) -> str:
        rel = self.path.relative_to(root)
        return f"{rel.as_posix()}:{self.line_number}: forbidden {self.rule}: {self.line.strip()}"


def iter_rust_files(root: Path) -> list[Path]:
    excluded = {".git", "target", "generated"}
    return sorted(
        path
        for path in root.rglob("*.rs")
        if path.is_file() and not any(part in excluded for part in path.relative_to(root).parts)
    )


def check_file(path: Path) -> list[RustFinding]:
    findings: list[RustFinding] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        for rule, pattern in FORBIDDEN_PATTERNS.items():
            if pattern.search(line):
                findings.append(RustFinding(path, line_number, rule, line))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Run lightweight Rust source guards when Cargo is absent.")
    parser.add_argument("--root", default=".", type=Path)
    args = parser.parse_args()

    root = args.root.resolve()
    files = iter_rust_files(root)
    findings = [finding for file in files for finding in check_file(file)]
    if findings:
        for finding in findings:
            print(finding.render(root))
        return 1
    print(f"Checked {len(files)} Rust source file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

