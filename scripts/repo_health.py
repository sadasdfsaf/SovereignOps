#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from dataclasses import dataclass
from pathlib import Path

REQUIRED_PATHS = [
    "README.md",
    "LICENSE",
    "CONTRIBUTING.md",
    "AGENTS.md",
    "Cargo.toml",
    "package.json",
    "pyproject.toml",
    "scripts/smoke.py",
    "scripts/loc_budget.py",
    "scripts/task_queue.py",
    "scripts/env_guard.py",
    ".env.example",
    "crates/sovereign_core/Cargo.toml",
    "packages/schemas/package.json",
    "services/ingest/src/sovereignops_ingest/__init__.py",
    "services/ingest/.env.example",
    "services/mcp-gateway/.env.example",
    "services/sync/.env.example",
    "docs/release-checklist.md",
    "docs/adr/000-template.md",
    "docs/adr/001-local-first-event-model.md",
]

OPTIONAL_COMMANDS = {
    "cargo": ["cargo"],
    "node": ["node"],
    "pnpm": ["pnpm"],
    "python": ["python", "python3", "python.exe"],
}

RESTRICTED_PUBLIC_TERM_PARTS = (
    ("gov", "ernment"),
    ("polit", "ics"),
    ("elec", "tion"),
    ("mil", "itary"),
    ("pol", "ice"),
    ("regul", "atory"),
    ("public", " ", "policy"),
)


@dataclass(frozen=True)
class HealthReport:
    root: Path
    missing_paths: list[str]
    commands: dict[str, bool]
    public_content_warnings: list[str]

    @property
    def ok(self) -> bool:
        return not self.missing_paths and not self.public_content_warnings


def scan_public_terms(root: Path) -> list[str]:
    warnings: list[str] = []
    restricted_terms = {"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS}
    scanned_exts = {".md", ".py", ".rs", ".ts", ".tsx", ".js", ".mjs", ".json", ".toml", ".yaml", ".yml"}
    excluded = {
        ".git",
        ".mypy_cache",
        ".pytest_cache",
        ".ruff_cache",
        ".venv",
        "__pycache__",
        "build",
        "coverage",
        "dist",
        "node_modules",
        "target",
        "venv",
    }
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        if any(part in excluded for part in rel.parts) or not path.is_file() or path.suffix not in scanned_exts:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore").lower()
        for term in restricted_terms:
            if term in text:
                warnings.append(f"{rel.as_posix()} contains restricted term: {term}")
    return warnings


def collect_report(root: Path) -> HealthReport:
    missing = [path for path in REQUIRED_PATHS if not (root / path).exists()]
    commands = {
        name: any(shutil.which(candidate) is not None for candidate in candidates)
        for name, candidates in OPTIONAL_COMMANDS.items()
    }
    return HealthReport(
        root=root,
        missing_paths=missing,
        commands=commands,
        public_content_warnings=scan_public_terms(root),
    )


def render_markdown(report: HealthReport) -> str:
    lines = [
        "# Repository Status",
        "",
        "This page is generated from `scripts/repo_health.py` and summarizes the public repository baseline.",
        "",
        "## Required Paths",
        "",
    ]
    if report.missing_paths:
        lines.extend(f"- Missing: `{path}`" for path in report.missing_paths)
    else:
        lines.append("- All required bootstrap paths are present.")

    lines.extend(["", "## Local Tool Availability", ""])
    for command, available in sorted(report.commands.items()):
        status = "available" if available else "not installed"
        lines.append(f"- `{command}`: {status}")

    lines.extend(["", "## Public Content Guardrails", ""])
    if report.public_content_warnings:
        lines.extend(f"- {warning}" for warning in report.public_content_warnings)
    else:
        lines.append("- No restricted public-content terms were found by the bootstrap scanner.")

    lines.extend(["", "## Current Gaps", ""])
    lines.extend(
        [
            "- Cargo and pnpm checks are optional locally until those toolchains are installed.",
            "- Rust, TypeScript, and Python packages are intentionally small but wired for incremental growth.",
            "- Security-sensitive flows must add policy checks, audit records, and boundary tests as they land.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Report SovereignOps repository bootstrap health.")
    parser.add_argument("--root", default=".", help="Repository root.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable report.")
    parser.add_argument("--markdown", help="Write markdown status report to this path.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    report = collect_report(root)

    if args.markdown:
        output = root / args.markdown
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render_markdown(report), encoding="utf-8")

    if args.json:
        print(
            json.dumps(
                {
                    "ok": report.ok,
                    "missing_paths": report.missing_paths,
                    "commands": report.commands,
                    "public_content_warnings": report.public_content_warnings,
                },
                indent=2,
                sort_keys=True,
            )
        )
    elif not args.markdown:
        print(render_markdown(report), end="")

    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
