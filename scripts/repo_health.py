#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
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
    "scripts/generate_example_workspace.py",
    "scripts/release_check.py",
    "scripts/validate_lifecycle_fixtures.py",
    ".env.example",
    "crates/sovereign_core/Cargo.toml",
    "apps/api/package.json",
    "apps/api/src/auditExportRoutes.ts",
    "apps/api/src/lifecycleRoutes.ts",
    "apps/api/src/lifecycleServices.ts",
    "apps/api/tests/audit-export-routes.test.mjs",
    "apps/api/tests/lifecycle-routes.test.mjs",
    "apps/api/tests/lifecycle-services.test.mjs",
    "apps/desktop/package.json",
    "apps/web/src/lifecycleReview.ts",
    "apps/web/src/lifecycleDashboard.ts",
    "apps/web/tests/lifecycle-review.test.mjs",
    "apps/web/tests/lifecycle-dashboard.test.mjs",
    "packages/schemas/package.json",
    "packages/cli/package.json",
    "packages/cli/src/auditExport.ts",
    "packages/cli/src/lifecycle.ts",
    "packages/cli/tests/audit-export-commands.test.mjs",
    "packages/cli/tests/lifecycle-commands.test.mjs",
    "services/ingest/src/sovereignops_ingest/__init__.py",
    "services/automation/package.json",
    "services/ingest/.env.example",
    "services/mcp-gateway/.env.example",
    "services/sync/.env.example",
    "docs/release-checklist.md",
    "docs/core-model.md",
    "docs/openapi.yaml",
    "docs/mcp-contract.md",
    "docs/schema-alignment.md",
    "docs/local-workflows.md",
    "docs/service-contracts.md",
    "docs/plugin-development.md",
    "docs/desktop-architecture.md",
    "docs/user-guide.md",
    "docs/admin-guide.md",
    "docs/agent-guide.md",
    "docs/architecture-diagrams.md",
    "docs/onboarding-tutorial.md",
    "docs/faq.md",
    "docs/example-workspace.md",
    "docs/local-data-lifecycle.md",
    "docs/maintainership.md",
    "docs/security-checklist.md",
    "docs/dependency-review.md",
    "docs/fuzzing.md",
    "docs/adr/000-template.md",
    "docs/adr/001-local-first-event-model.md",
    "scripts/validate_openapi.py",
    "scripts/loc_integrity.py",
    "scripts/release_notes.py",
    "benchmarks/harness.py",
    "benchmarks/cases.py",
    "packages/event-compaction/package.json",
    "packages/event-compaction/src/index.ts",
    "packages/workspace-store/package.json",
    "packages/workspace-store/src/index.ts",
    "packages/workspace-backup/package.json",
    "packages/workspace-backup/src/index.ts",
    "packages/observability/package.json",
    "packages/observability/src/index.ts",
    "packages/path-security/package.json",
    "packages/path-security/src/index.ts",
    "packages/audit-export/package.json",
    "packages/audit-export/src/index.ts",
    "packages/sdk-js/tests/client-audit-export.test.mjs",
    "packages/sdk-js/tests/client-lifecycle.test.mjs",
    "packages/sdk-js/src/localLifecycle.ts",
    "packages/sdk-js/tests/local-lifecycle.test.mjs",
    "packages/sdk-js/tests/storage-path-security.test.mjs",
    "packages/workspace-backup/tests/backup-path-security.test.mjs",
    "docs/lifecycle-integration.md",
    "docs/api-audit-export.md",
    "examples/lifecycle-fixtures/manifest.json",
    "examples/lifecycle-fixtures/events.json",
    "examples/lifecycle-fixtures/reviews.json",
    "services/sync/src/replay.ts",
    "services/sync/tests/sync-replay.test.mjs",
    "services/mcp-gateway/tests/audit-completeness.test.mjs",
    "tests/node_lifecycle_bridge.test.mjs",
    "tests/test_api_audit_export_docs.py",
    "tests/test_lifecycle_fixtures.py",
    "tests/test_node_lifecycle_bridge.py",
    "tests/test_validate_openapi_audit_export.py",
    "tests/test_validate_openapi_lifecycle.py",
    "tests/test_lifecycle_integration_docs.py",
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
    ("\u653f", "\u5e9c"),
    ("\u653f", "\u6cbb"),
    ("\u516c", "\u5171", "\u90e8", "\u95e8"),
    ("\u653f", "\u52a1"),
    ("\u9009", "\u4e3e"),
    ("\u519b", "\u8b66"),
    ("\u76d1", "\u7ba1"),
    ("\u516c", "\u5171", "\u653f", "\u7b56"),
)

PUBLIC_SCAN_EXTENSIONS = {
    ".json",
    ".js",
    ".md",
    ".mjs",
    ".py",
    ".rs",
    ".toml",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
}

PUBLIC_SCAN_EXCLUDED_PARTS = {
    ".codex-private",
    ".codex-run",
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


@dataclass(frozen=True)
class HealthReport:
    root: Path
    missing_paths: list[str]
    commands: dict[str, bool]
    public_content_warnings: list[str]

    @property
    def ok(self) -> bool:
        return not self.missing_paths and not self.public_content_warnings


def discover_public_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        if (
            any(part in PUBLIC_SCAN_EXCLUDED_PARTS for part in rel.parts)
            or not path.is_file()
            or path.suffix not in PUBLIC_SCAN_EXTENSIONS
        ):
            continue
        files.append(path)
    return sorted(files)


def scan_public_terms(root: Path) -> list[str]:
    warnings: list[str] = []
    restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
    ascii_patterns = []
    for term in restricted_terms:
        if term.isascii():
            escaped = re.escape(term).replace(r"\ ", r"\s+")
            ascii_patterns.append(re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])"))
    localized_terms = [term for term in restricted_terms if not term.isascii()]
    for path in discover_public_files(root):
        rel = path.relative_to(root)
        text = path.read_text(encoding="utf-8", errors="ignore").lower()
        for line_number, line in enumerate(text.splitlines(), start=1):
            if any(pattern.search(line) for pattern in ascii_patterns) or any(
                term in line for term in localized_terms
            ):
                warnings.append(f"{rel.as_posix()}:{line_number} contains restricted public-content term")
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
