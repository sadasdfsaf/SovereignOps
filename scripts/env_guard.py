#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

EXAMPLE_NAMES = {".env.example", "env.example"}
SAFE_PLACEHOLDERS = {"", "changeme", "example", "localhost", "127.0.0.1"}
SENSITIVE_NAME_PARTS = ("SECRET", "TOKEN", "KEY", "PASSWORD", "PRIVATE")


@dataclass(frozen=True)
class EnvFinding:
    path: Path
    line_number: int
    name: str
    message: str

    def render(self, root: Path) -> str:
        rel = self.path.relative_to(root)
        return f"{rel.as_posix()}:{self.line_number}: {self.name}: {self.message}"


def discover_examples(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*") if path.is_file() and path.name in EXAMPLE_NAMES)


def check_env_file(path: Path) -> list[EnvFinding]:
    findings: list[EnvFinding] = []
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            findings.append(EnvFinding(path, line_number, stripped, "expected NAME=value format"))
            continue
        name, value = stripped.split("=", 1)
        value = value.strip().strip('"').strip("'")
        if any(part in name.upper() for part in SENSITIVE_NAME_PARTS):
            normalized = value.lower()
            if normalized not in SAFE_PLACEHOLDERS and not normalized.startswith("example_"):
                findings.append(
                    EnvFinding(path, line_number, name, "sensitive examples must be blank or example-only")
                )
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate that .env.example files do not contain secrets.")
    parser.add_argument("--root", default=".", type=Path)
    args = parser.parse_args()

    root = args.root.resolve()
    files = discover_examples(root)
    if not files:
        raise SystemExit("no .env.example files found")

    findings = [finding for file in files for finding in check_env_file(file)]
    if findings:
        for finding in findings:
            print(finding.render(root))
        return 1
    print(f"Validated {len(files)} environment example file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

