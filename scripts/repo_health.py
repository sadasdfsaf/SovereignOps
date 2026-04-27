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
    "scripts/public_boundary_guard.py",
    "scripts/generate_example_workspace.py",
    "scripts/release_check.py",
    "scripts/validate_lifecycle_fixtures.py",
    "scripts/validate_mcp_gateway_fixtures.py",
    ".env.example",
    "crates/sovereign_core/Cargo.toml",
    "apps/api/package.json",
    "apps/api/src/auditExportRoutes.ts",
    "apps/api/src/ingestEvidenceRoutes.ts",
    "apps/api/src/ingestFixtureServices.ts",
    "apps/api/src/ingestOpenApiRoutes.ts",
    "apps/api/src/ingestRoutes.ts",
    "apps/api/src/lifecycleRoutes.ts",
    "apps/api/src/lifecycleServices.ts",
    "apps/api/src/mcpRoutes.ts",
    "apps/api/src/mcpRuntime.ts",
    "apps/api/tests/audit-export-routes.test.mjs",
    "apps/api/tests/ingest-evidence-routes.test.mjs",
    "apps/api/tests/ingest-evidence-fixture-replay.test.mjs",
    "apps/api/tests/ingest-fixture-services.test.mjs",
    "apps/api/tests/ingest-openapi-routes.test.mjs",
    "apps/api/tests/ingest-routes.test.mjs",
    "apps/api/tests/lifecycle-routes.test.mjs",
    "apps/api/tests/lifecycle-services.test.mjs",
    "apps/api/tests/mcp-routes.test.mjs",
    "apps/api/tests/mcp-runtime.test.mjs",
    "apps/api/tests/mcp-runtime-fixture.test.mjs",
    "apps/desktop/package.json",
    "apps/web/src/lifecycleReview.ts",
    "apps/web/src/lifecycleDashboard.ts",
    "apps/web/src/ingestApiState.ts",
    "apps/web/src/ingestEvidenceApiState.ts",
    "apps/web/src/ingestEvidenceReview.ts",
    "apps/web/src/ingestSearch.ts",
    "apps/web/src/ingestSessionReview.ts",
    "apps/web/src/automationPluginReview.ts",
    "apps/web/src/pluginReviewArtifactState.ts",
    "apps/web/src/mcpReview.ts",
    "apps/web/src/mcpApprovalState.ts",
    "apps/web/tests/lifecycle-review.test.mjs",
    "apps/web/tests/lifecycle-dashboard.test.mjs",
    "apps/web/tests/ingest-api-state.test.mjs",
    "apps/web/tests/ingest-evidence-api-state.test.mjs",
    "apps/web/tests/ingest-evidence-review.test.mjs",
    "apps/web/tests/ingest-search.test.mjs",
    "apps/web/tests/ingest-session-review.test.mjs",
    "apps/web/tests/automation-plugin-review.test.mjs",
    "apps/web/tests/plugin-review-artifact-state.test.mjs",
    "apps/web/tests/mcp-review.test.mjs",
    "apps/web/tests/mcp-approval-state.test.mjs",
    "packages/schemas/package.json",
    "packages/schemas/src/ingestEvidence.ts",
    "packages/schemas/src/ingestSearch.ts",
    "packages/schemas/tests/ingest-evidence.test.mjs",
    "packages/schemas/tests/ingest-evidence-export-alignment.test.mjs",
    "packages/schemas/tests/ingest-search.test.mjs",
    "packages/schemas/fixtures/ingest-evidence-package.valid.json",
    "packages/schemas/fixtures/ingest-evidence-package.invalid.json",
    "packages/schemas/fixtures/ingest-evidence.valid.json",
    "packages/schemas/fixtures/ingest-evidence.invalid.json",
    "packages/schemas/fixtures/ingest-search.valid.json",
    "packages/schemas/fixtures/ingest-search.invalid.json",
    "packages/cli/package.json",
    "packages/cli/src/auditExport.ts",
    "packages/cli/src/ingestEvidence.ts",
    "packages/cli/src/ingestEvidenceApiReplay.ts",
    "packages/cli/src/ingestApiReplay.ts",
    "packages/cli/src/ingestApiVerify.ts",
    "packages/cli/src/ingestSearch.ts",
    "packages/cli/src/lifecycle.ts",
    "packages/cli/src/mcpClient.ts",
    "packages/cli/src/mcpDemo.ts",
    "packages/cli/src/mcpReplay.ts",
    "packages/cli/src/pluginReviewArtifact.ts",
    "packages/cli/tests/audit-export-commands.test.mjs",
    "packages/cli/tests/ingest-evidence.test.mjs",
    "packages/cli/tests/ingest-evidence-api-replay.test.mjs",
    "packages/cli/tests/ingest-api-replay.test.mjs",
    "packages/cli/tests/ingest-api-verify.test.mjs",
    "packages/cli/tests/ingest-search.test.mjs",
    "packages/cli/tests/lifecycle-commands.test.mjs",
    "packages/cli/tests/mcp-client.test.mjs",
    "packages/cli/tests/mcp-demo.test.mjs",
    "packages/cli/tests/mcp-replay.test.mjs",
    "packages/cli/tests/plugin-review-artifact.test.mjs",
    "services/ingest/src/sovereignops_ingest/__init__.py",
    "services/automation/package.json",
    "services/automation/src/audit.ts",
    "services/automation/src/index.ts",
    "services/automation/src/pluginReview.ts",
    "services/automation/src/registry.ts",
    "services/automation/src/rules.ts",
    "services/automation/tests/automation-audit.test.mjs",
    "services/automation/tests/automation.test.mjs",
    "services/automation/tests/plugin-review.test.mjs",
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
    "packages/plugin-sdk/package.json",
    "packages/plugin-sdk/src/index.ts",
    "packages/plugin-sdk/src/manifest.ts",
    "packages/plugin-sdk/src/reviewArtifact.ts",
    "packages/plugin-sdk/src/sandbox.ts",
    "packages/plugin-sdk/src/sandboxReview.ts",
    "packages/plugin-sdk/tests/manifest.test.mjs",
    "packages/plugin-sdk/tests/plugin-examples.test.mjs",
    "packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs",
    "packages/plugin-sdk/tests/review-artifact.test.mjs",
    "packages/plugin-sdk/tests/sandbox-review.test.mjs",
    "packages/plugin-sdk/tests/sandbox.test.mjs",
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
    "packages/ingest-evidence/package.json",
    "packages/ingest-evidence/src/index.ts",
    "packages/ingest-evidence/tests/ingest-evidence.test.mjs",
    "packages/sdk-js/tests/client-audit-export.test.mjs",
    "packages/sdk-js/src/ingestClient.ts",
    "packages/sdk-js/src/ingestEvidenceClient.ts",
    "packages/sdk-js/src/ingestEvidenceFixtureFetch.ts",
    "packages/sdk-js/src/ingestFixtureFetch.ts",
    "packages/sdk-js/tests/client-ingest-search.test.mjs",
    "packages/sdk-js/tests/client-ingest-evidence.test.mjs",
    "packages/sdk-js/tests/ingest-evidence-fixture-fetch.test.mjs",
    "packages/sdk-js/tests/ingest-fixture-fetch.test.mjs",
    "packages/sdk-js/tests/client-mcp.test.mjs",
    "packages/sdk-js/tests/client-lifecycle.test.mjs",
    "packages/sdk-js/src/localIngest.ts",
    "packages/sdk-js/tests/local-ingest.test.mjs",
    "packages/sdk-js/src/localIngestEvidence.ts",
    "packages/sdk-js/tests/local-ingest-evidence.test.mjs",
    "packages/sdk-js/src/localMcp.ts",
    "packages/sdk-js/tests/local-mcp.test.mjs",
    "packages/sdk-js/src/localMcpProtocol.ts",
    "packages/sdk-js/tests/local-mcp-protocol.test.mjs",
    "packages/sdk-js/src/localLifecycle.ts",
    "packages/sdk-js/tests/local-lifecycle.test.mjs",
    "packages/sdk-js/tests/storage-path-security.test.mjs",
    "packages/workspace-backup/tests/backup-path-security.test.mjs",
    "services/ingest/src/sovereignops_ingest/cli.py",
    "services/ingest/src/sovereignops_ingest/index.py",
    "services/ingest/src/sovereignops_ingest/logs.py",
    "services/ingest/src/sovereignops_ingest/quarantine.py",
    "services/ingest/src/sovereignops_ingest/repository.py",
    "services/ingest/tests/test_ingest_cli.py",
    "services/ingest/tests/test_log_connector.py",
    "services/ingest/tests/test_quarantine.py",
    "services/ingest/tests/test_repository_connector.py",
    "services/ingest/tests/test_search_index.py",
    "docs/lifecycle-integration.md",
    "docs/api-audit-export.md",
    "docs/mcp-gateway.md",
    "docs/ingest-search.md",
    "docs/ingest-api.md",
    "docs/ingest-integration.md",
    "docs/ingest-audit-evidence.md",
    "docs/ingest-evidence-export.md",
    "docs/ingest-evidence-parity.md",
    "docs/ingest-evidence-api-fixtures.md",
    "docs/plugin-sandbox.md",
    "docs/plugin-release-notes-example.md",
    "docs/plugin-review-artifacts.md",
    "examples/lifecycle-fixtures/manifest.json",
    "examples/lifecycle-fixtures/events.json",
    "examples/lifecycle-fixtures/reviews.json",
    "examples/mcp-gateway/resources.json",
    "examples/mcp-gateway/tools.json",
    "examples/mcp-gateway/approval-sessions.json",
    "examples/mcp-gateway/api-requests.json",
    "examples/mcp-gateway/safety-samples.json",
    "examples/mcp-gateway/runtime-router.json",
    "examples/plugins/release-notes/manifest.json",
    "examples/plugins/release-notes/plugin.json",
    "examples/plugins/release-notes/index.mjs",
    "examples/plugins/release-notes/review-artifact.json",
    "examples/plugins/release-notes/sample-input.json",
    "examples/plugins/release-notes/README.md",
    "examples/ingest-search/notes.md",
    "examples/ingest-search/records.csv",
    "examples/ingest-search/records.json",
    "examples/ingest-search/repository.json",
    "examples/ingest-search/ingest-log.json",
    "examples/ingest-search/search-index.json",
    "examples/ingest-search/quarantine.json",
    "examples/ingest-search/api-requests.json",
    "examples/ingest-search/client-session.json",
    "examples/ingest-search/audit-evidence.json",
    "examples/ingest-search/evidence-export-session.json",
    "examples/ingest-search/evidence-parity-session.json",
    "examples/ingest-search/evidence-api-requests.json",
    "examples/ingest-search/evidence-release-artifact.json",
    "services/sync/src/replay.ts",
    "services/sync/tests/sync-replay.test.mjs",
    "services/mcp-gateway/src/approvalSessions.ts",
    "services/mcp-gateway/src/auditReplay.ts",
    "services/mcp-gateway/src/protocol.ts",
    "services/mcp-gateway/src/runtime.ts",
    "services/mcp-gateway/src/safety.ts",
    "services/mcp-gateway/src/toolAdapter.ts",
    "services/mcp-gateway/tests/approval-sessions.test.mjs",
    "services/mcp-gateway/tests/audit-completeness.test.mjs",
    "services/mcp-gateway/tests/audit-replay.test.mjs",
    "services/mcp-gateway/tests/protocol.test.mjs",
    "services/mcp-gateway/tests/runtime.test.mjs",
    "services/mcp-gateway/tests/safety.test.mjs",
    "services/mcp-gateway/tests/tool-adapter.test.mjs",
    "tests/node_lifecycle_bridge.test.mjs",
    "tests/ingest_evidence_parity.test.mjs",
    "tests/test_api_audit_export_docs.py",
    "tests/test_ingest_audit_evidence_docs.py",
    "tests/test_ingest_evidence_export_docs.py",
    "tests/test_ingest_evidence_parity_docs.py",
    "tests/test_ingest_evidence_api_fixtures_docs.py",
    "tests/test_ingest_evidence_api_fixture_alignment.py",
    "tests/test_ingest_contract_alignment.py",
    "tests/test_ingest_integration_docs.py",
    "tests/test_lifecycle_fixtures.py",
    "tests/test_validate_openapi_ingest_search.py",
    "tests/test_mcp_contract_docs.py",
    "tests/test_mcp_gateway_docs.py",
    "tests/test_mcp_gateway_fixtures.py",
    "tests/test_node_lifecycle_bridge.py",
    "tests/test_plugin_automation_alignment.py",
    "tests/test_plugin_review_artifact_alignment.py",
    "tests/test_plugin_review_artifacts_docs.py",
    "tests/test_plugin_sandbox_docs.py",
    "tests/test_public_boundary_guard.py",
    "tests/test_validate_openapi_audit_export.py",
    "tests/test_validate_openapi_ingest_evidence.py",
    "tests/test_validate_openapi_lifecycle.py",
    "tests/test_lifecycle_integration_docs.py",
    "tests/test_ingest_search_docs.py",
    "tests/test_ingest_api_docs.py",
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
