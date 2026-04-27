#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from shutil import which
from typing import Optional

PYTHON = "{python}"

SCHEMA_CONTRACT_REQUIRED_PATHS: tuple[str, ...] = (
    "docs/schema-alignment.md",
    "docs/openapi.yaml",
    "scripts/validate_openapi.py",
    "tests/test_schema_alignment_docs.py",
    "tests/test_validate_openapi_schema_components.py",
    "packages/schemas/src/apiError.ts",
    "packages/schemas/src/eventCatalog.ts",
    "packages/schemas/tests/api-error.test.mjs",
    "packages/schemas/tests/event-catalog.test.mjs",
    "packages/schemas/tests/schema-compatibility.test.mjs",
    "packages/schemas/fixtures/api-error-response.schema.json",
    "packages/schemas/fixtures/api-validation-issue.schema.json",
    "packages/schemas/fixtures/api-error.valid.json",
    "packages/schemas/fixtures/api-error.invalid.json",
    "packages/schemas/fixtures/canonical-local-event.schema.json",
    "packages/schemas/fixtures/canonical-local-event-catalog.schema.json",
    "packages/schemas/fixtures/canonical-events.catalog.json",
    "packages/schemas/fixtures/canonical-events.valid.json",
    "packages/schemas/fixtures/canonical-events.invalid.json",
    "packages/schemas/fixtures/schema-compatibility.v1.json",
)


@dataclass(frozen=True)
class CheckSpec:
    name: str
    description: str
    command: tuple[str, ...]
    required_paths: tuple[str, ...] = ()
    tool_candidates: tuple[str, ...] = ()


@dataclass(frozen=True)
class DiscoveredCheck:
    spec: CheckSpec
    command: tuple[str, ...]
    missing_paths: tuple[str, ...]
    missing_tool: str | None

    @property
    def available(self) -> bool:
        return not self.missing_paths and self.missing_tool is None

    @property
    def skip_reason(self) -> str:
        if self.missing_paths:
            return "missing path(s): " + ", ".join(self.missing_paths)
        if self.missing_tool is not None:
            return f"missing tool: {self.missing_tool}"
        return ""


CHECK_SPECS: tuple[CheckSpec, ...] = (
    CheckSpec(
        name="loc-budget",
        description="Summarize effective handwritten source size.",
        command=(PYTHON, "scripts/loc_budget.py", "--summary"),
        required_paths=("scripts/loc_budget.py",),
    ),
    CheckSpec(
        name="repo-health",
        description="Validate bootstrap files and content guardrails.",
        command=(PYTHON, "scripts/repo_health.py", "--json"),
        required_paths=(
            "scripts/repo_health.py",
            "docs/local-data-lifecycle.md",
            "docs/maintainership.md",
            "docs/security-checklist.md",
            "docs/dependency-review.md",
            "docs/fuzzing.md",
            "docs/ingest-search.md",
            "docs/ingest-api.md",
            "docs/ingest-integration.md",
            "docs/ingest-audit-evidence.md",
            "docs/ingest-evidence-export.md",
            "docs/ingest-evidence-parity.md",
            "docs/ingest-evidence-api-fixtures.md",
            "docs/plugin-sandbox.md",
            "docs/plugin-release-notes-example.md",
            "docs/mcp-approval-evidence-api.md",
            "docs/mcp-approval-evidence-records-api.md",
            "docs/plugin-review-artifact-api.md",
            "docs/plugin-review-artifacts.md",
            *SCHEMA_CONTRACT_REQUIRED_PATHS,
            "docs/status.md",
            "docs/ci.md",
            "docs/development-quickstart.md",
            "docs/release-checklist.md",
            "docs/adr/000-template.md",
            "docs/adr/001-local-first-event-model.md",
            ".github/workflows/smoke.yml",
            ".github/workflows/python.yml",
            ".github/workflows/node.yml",
            ".github/workflows/typescript.yml",
            ".github/workflows/rust.yml",
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
            "examples/plugins/release-notes/manifest.json",
            "examples/plugins/release-notes/plugin.json",
            "examples/plugins/release-notes/index.mjs",
            "examples/plugins/release-notes/review-artifact-api-requests.json",
            "examples/plugins/release-notes/review-artifact.json",
            "examples/plugins/release-notes/sample-input.json",
            "examples/plugins/release-notes/README.md",
            "examples/mcp/approval-evidence-preview-requests.json",
            "examples/mcp/approval-evidence-records-requests.json",
            "tests/test_ingest_search_docs.py",
            "tests/test_ingest_api_docs.py",
            "tests/test_ingest_integration_docs.py",
            "tests/test_ingest_audit_evidence_docs.py",
            "tests/test_ingest_evidence_export_docs.py",
            "tests/test_ingest_evidence_parity_docs.py",
            "tests/test_ingest_evidence_api_fixtures_docs.py",
            "tests/test_ingest_evidence_api_fixture_alignment.py",
            "tests/test_plugin_sandbox_docs.py",
            "tests/test_plugin_automation_alignment.py",
            "tests/test_mcp_approval_evidence_api_alignment.py",
            "tests/test_mcp_approval_evidence_api_docs.py",
            "tests/test_mcp_approval_evidence_records_api_alignment.py",
            "tests/test_mcp_approval_evidence_records_api_docs.py",
            "tests/test_plugin_review_artifact_api_alignment.py",
            "tests/test_plugin_review_artifact_api_docs.py",
            "tests/test_plugin_review_artifacts_docs.py",
            "tests/test_plugin_review_artifact_alignment.py",
            "tests/test_adr_docs.py",
            "tests/test_ci_workflows.py",
            "tests/test_contributing_quickstart.py",
            "tests/test_release_checklist_docs.py",
            "tests/test_status_dashboard.py",
            "tests/test_status_docs.py",
            "tests/test_ingest_contract_alignment.py",
            "tests/test_validate_openapi_ingest_search.py",
            "tests/test_validate_openapi_ingest_evidence.py",
        ),
    ),
    CheckSpec(
        name="public-boundary-guard",
        description="Ensure private planning and runtime files stay out of the public project.",
        command=(PYTHON, "scripts/public_boundary_guard.py", "--json"),
        required_paths=("scripts/public_boundary_guard.py", ".gitignore"),
    ),
    CheckSpec(
        name="status-dashboard",
        description="Render the public repository status dashboard.",
        command=(PYTHON, "scripts/status_dashboard.py", "--json"),
        required_paths=(
            "scripts/status_dashboard.py",
            "docs/status.md",
            "docs/ci.md",
            "docs/development-quickstart.md",
            ".github/workflows/smoke.yml",
            ".github/workflows/python.yml",
            ".github/workflows/node.yml",
            ".github/workflows/typescript.yml",
            ".github/workflows/rust.yml",
        ),
    ),
    CheckSpec(
        name="bootstrap-docs",
        description="Validate public bootstrap, CI, ADR, release, and status documentation.",
        command=(
            PYTHON,
            "-m",
            "unittest",
            "tests.test_adr_docs",
            "tests.test_ci_workflows",
            "tests.test_contributing_quickstart",
            "tests.test_release_checklist_docs",
            "tests.test_status_dashboard",
            "tests.test_status_docs",
        ),
        required_paths=(
            "docs/adr/000-template.md",
            "docs/adr/001-local-first-event-model.md",
            "docs/ci.md",
            "docs/development-quickstart.md",
            "docs/release-checklist.md",
            "docs/status.md",
            "scripts/status_dashboard.py",
            "tests/test_adr_docs.py",
            "tests/test_ci_workflows.py",
            "tests/test_contributing_quickstart.py",
            "tests/test_release_checklist_docs.py",
            "tests/test_status_dashboard.py",
            "tests/test_status_docs.py",
        ),
    ),
    CheckSpec(
        name="loc-integrity",
        description="Validate LOC floors and generated-file limits.",
        command=(PYTHON, "scripts/loc_integrity.py"),
        required_paths=("scripts/loc_integrity.py", "scripts/loc_budget.py"),
    ),
    CheckSpec(
        name="env-guard",
        description="Check example environment files for secret-shaped values.",
        command=(PYTHON, "scripts/env_guard.py"),
        required_paths=("scripts/env_guard.py",),
    ),
    CheckSpec(
        name="rust-source-guard",
        description="Run lightweight Rust source checks without requiring Cargo.",
        command=(PYTHON, "scripts/rust_guard.py"),
        required_paths=("scripts/rust_guard.py",),
    ),
    CheckSpec(
        name="openapi-contract",
        description="Validate the checked-in OpenAPI contract.",
        command=(PYTHON, "scripts/validate_openapi.py"),
        required_paths=("scripts/validate_openapi.py", "docs/openapi.yaml"),
    ),
    CheckSpec(
        name="schema-contract-alignment",
        description="Validate schema alignment docs and OpenAPI schema component wiring.",
        command=(
            PYTHON,
            "-m",
            "unittest",
            "tests.test_schema_alignment_docs",
            "tests.test_validate_openapi_schema_components",
        ),
        required_paths=SCHEMA_CONTRACT_REQUIRED_PATHS,
    ),
    CheckSpec(
        name="mcp-gateway-fixtures",
        description="Validate MCP gateway example fixtures.",
        command=(PYTHON, "scripts/validate_mcp_gateway_fixtures.py"),
        required_paths=(
            "scripts/validate_mcp_gateway_fixtures.py",
            "examples/mcp-gateway/resources.json",
            "examples/mcp-gateway/tools.json",
            "examples/mcp-gateway/approval-sessions.json",
            "examples/mcp-gateway/api-requests.json",
            "examples/mcp-gateway/safety-samples.json",
            "examples/mcp-gateway/runtime-router.json",
        ),
    ),
    CheckSpec(
        name="python-tests",
        description="Run repository Python unit tests.",
        command=(PYTHON, "-m", "unittest", "discover", "-s", "tests"),
        required_paths=("tests",),
    ),
    CheckSpec(
        name="ingest-python-tests",
        description="Run ingest service Python unit tests.",
        command=(PYTHON, "-m", "unittest", "discover", "-s", "services/ingest/tests"),
        required_paths=(
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
        ),
    ),
    CheckSpec(
        name="release-notes-smoke",
        description="Generate deterministic release notes from an empty git range.",
        command=(PYTHON, "scripts/release_notes.py", "--version", "smoke", "--range", "HEAD..HEAD"),
        required_paths=("scripts/release_notes.py", ".git"),
        tool_candidates=("git",),
    ),
    CheckSpec(
        name="node-package-baseline",
        description="Validate root Node package metadata and scripts.",
        command=("node", "scripts/node-check.mjs"),
        required_paths=("package.json", "scripts/node-check.mjs"),
        tool_candidates=("node",),
    ),
    CheckSpec(
        name="ingest-evidence-parity",
        description="Verify ingest evidence export parity across package, API, and CLI helpers.",
        command=("node", "tests/ingest_evidence_parity.test.mjs"),
        required_paths=(
            "tests/ingest_evidence_parity.test.mjs",
            "examples/ingest-search/evidence-parity-session.json",
            "examples/ingest-search/audit-evidence.json",
            "apps/api/src/ingestEvidenceRoutes.ts",
            "packages/cli/src/ingestEvidence.ts",
            "packages/ingest-evidence/src/index.ts",
        ),
        tool_candidates=("node",),
    ),
    CheckSpec(
        name="ingest-evidence-api-replay",
        description="Replay ingest evidence API fixture requests through local route dispatch.",
        command=(
            "node",
            "packages/cli/src/index.ts",
            "ingest",
            "evidence",
            "api",
            "replay",
            "--fixture",
            "examples/ingest-search/evidence-api-requests.json",
        ),
        required_paths=(
            "packages/cli/src/index.ts",
            "packages/cli/src/ingestEvidenceApiReplay.ts",
            "examples/ingest-search/evidence-api-requests.json",
            "examples/ingest-search/audit-evidence.json",
            "apps/api/src/ingestEvidenceRoutes.ts",
        ),
        tool_candidates=("node",),
    ),
    CheckSpec(
        name="plugin-automation-alignment",
        description="Validate plugin sandbox, release-notes example, automation audit, and Web review wiring.",
        command=(PYTHON, "-m", "unittest", "tests.test_plugin_automation_alignment"),
        required_paths=(
            "tests/test_plugin_automation_alignment.py",
            "tests/test_plugin_sandbox_docs.py",
            "docs/plugin-sandbox.md",
            "docs/plugin-release-notes-example.md",
            "packages/plugin-sdk/src/sandboxReview.ts",
            "packages/plugin-sdk/tests/sandbox-review.test.mjs",
            "packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs",
            "services/automation/src/audit.ts",
            "services/automation/tests/automation-audit.test.mjs",
            "apps/web/src/automationPluginReview.ts",
            "apps/web/tests/automation-plugin-review.test.mjs",
            "examples/plugins/release-notes/plugin.json",
            "examples/plugins/release-notes/sample-input.json",
        ),
    ),
    CheckSpec(
        name="plugin-review-artifact-alignment",
        description="Validate plugin review artifact SDK, automation, CLI, Web, docs, and example wiring.",
        command=(PYTHON, "-m", "unittest", "tests.test_plugin_review_artifact_alignment"),
        required_paths=(
            "tests/test_plugin_review_artifact_alignment.py",
            "tests/test_plugin_review_artifacts_docs.py",
            "docs/plugin-review-artifacts.md",
            "examples/plugins/release-notes/review-artifact.json",
            "packages/plugin-sdk/src/reviewArtifact.ts",
            "packages/plugin-sdk/tests/review-artifact.test.mjs",
            "services/automation/src/pluginReview.ts",
            "services/automation/tests/plugin-review.test.mjs",
            "apps/web/src/pluginReviewArtifactState.ts",
            "apps/web/tests/plugin-review-artifact-state.test.mjs",
            "packages/cli/src/pluginReviewArtifact.ts",
            "packages/cli/tests/plugin-review-artifact.test.mjs",
        ),
    ),
    CheckSpec(
        name="plugin-review-artifact-api-alignment",
        description="Validate plugin review artifact API, SDK, CLI replay, schema, Web, and docs wiring.",
        command=(PYTHON, "-m", "unittest", "tests.test_plugin_review_artifact_api_alignment"),
        required_paths=(
            "docs/plugin-review-artifact-api.md",
            "tests/test_plugin_review_artifact_api_docs.py",
            "tests/test_plugin_review_artifact_api_alignment.py",
            "apps/api/src/pluginReviewArtifactRoutes.ts",
            "apps/api/tests/plugin-review-artifact-routes.test.mjs",
            "packages/sdk-js/src/pluginReviewArtifactClient.ts",
            "packages/sdk-js/tests/client-plugin-review-artifact.test.mjs",
            "packages/cli/src/pluginReviewArtifactApiReplay.ts",
            "packages/cli/tests/plugin-review-artifact-api-replay.test.mjs",
            "examples/plugins/release-notes/review-artifact-api-requests.json",
            "packages/schemas/src/pluginReviewArtifact.ts",
            "packages/schemas/tests/plugin-review-artifact.test.mjs",
            "packages/schemas/fixtures/plugin-review-artifact-preview.valid.json",
            "packages/schemas/fixtures/plugin-review-artifact-preview.invalid.json",
            "packages/schemas/fixtures/plugin-review-artifact-preview.schema.json",
            "apps/web/src/pluginReviewArtifactApiState.ts",
            "apps/web/tests/plugin-review-artifact-api-state.test.mjs",
            "docs/openapi.yaml",
            "scripts/release_check.py",
            "scripts/repo_health.py",
        ),
    ),
    CheckSpec(
        name="plugin-review-artifact-records-api-alignment",
        description="Validate persisted plugin review artifact record API, SDK, CLI replay, schema, Web, and docs wiring.",
        command=(PYTHON, "-m", "unittest", "tests.test_plugin_review_artifact_records_api_alignment"),
        required_paths=(
            "docs/plugin-review-artifact-records-api.md",
            "tests/test_plugin_review_artifact_records_api_docs.py",
            "tests/test_plugin_review_artifact_records_api_alignment.py",
            "packages/plugin-sdk/src/reviewArtifactRecords.ts",
            "packages/plugin-sdk/tests/review-artifact-records.test.mjs",
            "apps/api/src/pluginReviewArtifactRecordRoutes.ts",
            "apps/api/tests/plugin-review-artifact-record-routes.test.mjs",
            "packages/sdk-js/src/pluginReviewArtifactRecordClient.ts",
            "packages/sdk-js/tests/client-plugin-review-artifact-record.test.mjs",
            "packages/cli/src/pluginReviewArtifactRecordsReplay.ts",
            "packages/cli/tests/plugin-review-artifact-records-replay.test.mjs",
            "examples/plugins/release-notes/review-artifact-records-requests.json",
            "packages/schemas/src/pluginReviewArtifactRecord.ts",
            "packages/schemas/tests/plugin-review-artifact-record.test.mjs",
            "packages/schemas/fixtures/plugin-review-artifact-record.valid.json",
            "packages/schemas/fixtures/plugin-review-artifact-record.invalid.json",
            "packages/schemas/fixtures/plugin-review-artifact-record.schema.json",
            "packages/schemas/fixtures/plugin-review-artifact-record-list.valid.json",
            "packages/schemas/fixtures/plugin-review-artifact-record-list.schema.json",
            "packages/schemas/fixtures/plugin-review-artifact-record-comparison.valid.json",
            "packages/schemas/fixtures/plugin-review-artifact-record-comparison.schema.json",
            "packages/schemas/fixtures/plugin-review-artifact-record-create-request.valid.json",
            "packages/schemas/fixtures/plugin-review-artifact-record-create-request.schema.json",
            "apps/web/src/pluginReviewArtifactRecordState.ts",
            "apps/web/tests/plugin-review-artifact-record-state.test.mjs",
            "docs/openapi.yaml",
            "scripts/release_check.py",
            "scripts/repo_health.py",
        ),
    ),
    CheckSpec(
        name="mcp-approval-evidence-api-alignment",
        description="Validate MCP approval evidence gateway, API, SDK, CLI replay, schema, Web, and docs wiring.",
        command=(PYTHON, "-m", "unittest", "tests.test_mcp_approval_evidence_api_alignment"),
        required_paths=(
            "docs/mcp-approval-evidence-api.md",
            "tests/test_mcp_approval_evidence_api_docs.py",
            "tests/test_mcp_approval_evidence_api_alignment.py",
            "services/mcp-gateway/src/approvalEvidence.ts",
            "services/mcp-gateway/tests/approval-evidence.test.mjs",
            "apps/api/src/mcpApprovalEvidenceRoutes.ts",
            "apps/api/tests/mcp-approval-evidence-routes.test.mjs",
            "packages/sdk-js/src/mcpApprovalEvidenceClient.ts",
            "packages/sdk-js/tests/client-mcp-approval-evidence.test.mjs",
            "packages/cli/src/mcpApprovalEvidenceReplay.ts",
            "packages/cli/tests/mcp-approval-evidence-replay.test.mjs",
            "examples/mcp/approval-evidence-preview-requests.json",
            "packages/schemas/src/mcpApprovalEvidence.ts",
            "packages/schemas/tests/mcp-approval-evidence.test.mjs",
            "packages/schemas/fixtures/mcp-approval-evidence.valid.json",
            "packages/schemas/fixtures/mcp-approval-evidence.invalid.json",
            "packages/schemas/fixtures/mcp-approval-evidence.schema.json",
            "apps/web/src/mcpApprovalEvidenceApiState.ts",
            "apps/web/tests/mcp-approval-evidence-api-state.test.mjs",
            "docs/openapi.yaml",
            "scripts/release_check.py",
            "scripts/repo_health.py",
        ),
    ),
    CheckSpec(
        name="mcp-approval-evidence-records-api-alignment",
        description="Validate persisted MCP approval evidence record API, SDK, CLI replay, schema, Web, and docs wiring.",
        command=(PYTHON, "-m", "unittest", "tests.test_mcp_approval_evidence_records_api_alignment"),
        required_paths=(
            "docs/mcp-approval-evidence-records-api.md",
            "tests/test_mcp_approval_evidence_records_api_docs.py",
            "tests/test_mcp_approval_evidence_records_api_alignment.py",
            "services/mcp-gateway/src/approvalEvidenceRecords.ts",
            "services/mcp-gateway/tests/approval-evidence-records.test.mjs",
            "apps/api/src/mcpApprovalEvidenceRecordRoutes.ts",
            "apps/api/tests/mcp-approval-evidence-record-routes.test.mjs",
            "packages/sdk-js/src/mcpApprovalEvidenceRecordClient.ts",
            "packages/sdk-js/tests/client-mcp-approval-evidence-record.test.mjs",
            "packages/cli/src/mcpApprovalEvidenceRecordsReplay.ts",
            "packages/cli/tests/mcp-approval-evidence-records-replay.test.mjs",
            "examples/mcp/approval-evidence-records-requests.json",
            "packages/schemas/src/mcpApprovalEvidenceRecord.ts",
            "packages/schemas/tests/mcp-approval-evidence-record.test.mjs",
            "packages/schemas/fixtures/mcp-approval-evidence-record.valid.json",
            "packages/schemas/fixtures/mcp-approval-evidence-record.invalid.json",
            "packages/schemas/fixtures/mcp-approval-evidence-record.schema.json",
            "packages/schemas/fixtures/mcp-approval-evidence-record-list.valid.json",
            "packages/schemas/fixtures/mcp-approval-evidence-record-list.schema.json",
            "packages/schemas/fixtures/mcp-approval-evidence-record-comparison.valid.json",
            "packages/schemas/fixtures/mcp-approval-evidence-record-comparison.schema.json",
            "packages/schemas/fixtures/mcp-approval-evidence-record-create-request.valid.json",
            "packages/schemas/fixtures/mcp-approval-evidence-record-create-request.schema.json",
            "apps/web/src/mcpApprovalEvidenceRecordState.ts",
            "apps/web/tests/mcp-approval-evidence-record-state.test.mjs",
            "docs/openapi.yaml",
            "scripts/release_check.py",
            "scripts/repo_health.py",
        ),
    ),
    CheckSpec(
        name="npm-workspace-check",
        description="Run workspace package checks with npm when it is installed.",
        command=("npm", "run", "check", "--workspaces", "--if-present"),
        required_paths=("package.json",),
        tool_candidates=("npm", "npm.cmd"),
    ),
    CheckSpec(
        name="cargo-check",
        description="Run Rust workspace type and lint checks when Cargo is installed.",
        command=("cargo", "check", "--workspace"),
        required_paths=("Cargo.toml",),
        tool_candidates=("cargo",),
    ),
    CheckSpec(
        name="pnpm-workspace-check",
        description="Run workspace package checks when pnpm is installed.",
        command=("pnpm", "-r", "--if-present", "check"),
        required_paths=("package.json", "pnpm-workspace.yaml"),
        tool_candidates=("pnpm",),
    ),
)


ToolResolver = Callable[[str], Optional[str]]
Runner = Callable[..., subprocess.CompletedProcess]


def _resolve_command(command: Sequence[str]) -> tuple[str, ...]:
    return tuple(sys.executable if part == PYTHON else part for part in command)


def _display_command(command: Sequence[str]) -> str:
    display = ("python" if part == sys.executable else part for part in command)
    return " ".join(display)


def discover_checks(root: Path, tool_resolver: ToolResolver = which) -> list[DiscoveredCheck]:
    checks: list[DiscoveredCheck] = []
    for spec in CHECK_SPECS:
        missing_paths = tuple(path for path in spec.required_paths if not (root / path).exists())
        missing_tool = None
        resolved_tool = None
        if spec.tool_candidates:
            resolved_tool = next(
                (resolved for candidate in spec.tool_candidates if (resolved := tool_resolver(candidate))),
                None,
            )
            if resolved_tool is None:
                missing_tool = spec.tool_candidates[0]
        command = _resolve_command(spec.command)
        if resolved_tool is not None and command[0] in spec.tool_candidates:
            command = (resolved_tool, *command[1:])
        checks.append(
            DiscoveredCheck(
                spec=spec,
                command=command,
                missing_paths=missing_paths,
                missing_tool=missing_tool,
            )
        )
    return checks


def render_list(checks: Sequence[DiscoveredCheck]) -> str:
    lines = ["Release checks:"]
    for check in checks:
        status = "available" if check.available else f"unavailable ({check.skip_reason})"
        lines.append(f"- {check.spec.name}: {status}")
        lines.append(f"  command: {_display_command(check.command)}")
        lines.append(f"  purpose: {check.spec.description}")
    return "\n".join(lines) + "\n"


def render_dry_run(checks: Sequence[DiscoveredCheck]) -> str:
    lines = ["Release check dry run:"]
    for check in checks:
        if check.available:
            lines.append(f"RUN {check.spec.name}: {_display_command(check.command)}")
        else:
            lines.append(f"SKIP {check.spec.name}: {check.skip_reason}")
    return "\n".join(lines) + "\n"


def run_checks(
    checks: Sequence[DiscoveredCheck],
    *,
    root: Path,
    runner: Runner = subprocess.run,
) -> int:
    failed = False
    for check in checks:
        if not check.available:
            print(f"[skip] {check.spec.name}: {check.skip_reason}", flush=True)
            if check.missing_paths:
                failed = True
            continue

        print(f"[run] {check.spec.name}", flush=True)
        print(f"$ {_display_command(check.command)}", flush=True)
        completed = runner(check.command, cwd=str(root), check=False)
        if completed.returncode != 0:
            print(f"[fail] {check.spec.name}: exit {completed.returncode}", flush=True)
            failed = True
    return 1 if failed else 0


def main(
    argv: Sequence[str] | None = None,
    *,
    tool_resolver: ToolResolver = which,
    runner: Runner = subprocess.run,
) -> int:
    parser = argparse.ArgumentParser(description="Discover and run release readiness checks.")
    parser.add_argument("--root", default=".", help="Repository root.")
    parser.add_argument("--list", action="store_true", help="List discovered checks without running them.")
    parser.add_argument("--dry-run", action="store_true", help="Show runnable commands without running them.")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    checks = discover_checks(root, tool_resolver)

    if args.list:
        print(render_list(checks), end="")
        return 0
    if args.dry_run:
        print(render_dry_run(checks), end="")
        return 0

    print("== SovereignOps release checks ==", flush=True)
    return run_checks(checks, root=root, runner=runner)


if __name__ == "__main__":
    raise SystemExit(main())
