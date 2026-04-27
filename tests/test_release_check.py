from __future__ import annotations

import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from scripts import release_check
from scripts.public_boundary_guard import REQUIRED_GITIGNORE_ENTRIES


def make_release_root(root: Path) -> None:
    (root / ".git").mkdir()
    (root / ".gitignore").write_text(
        "\n".join(REQUIRED_GITIGNORE_ENTRIES) + "\n",
        encoding="utf-8",
    )
    (root / "scripts").mkdir()
    (root / "docs").mkdir()
    (root / "docs" / "adr").mkdir()
    (root / ".github" / "workflows").mkdir(parents=True)
    (root / "examples" / "mcp-gateway").mkdir(parents=True)
    (root / "examples" / "mcp").mkdir(parents=True)
    (root / "examples" / "ingest-search").mkdir(parents=True)
    (root / "examples" / "plugins" / "release-notes").mkdir(parents=True)
    (root / "apps" / "api" / "src").mkdir(parents=True)
    (root / "apps" / "api" / "tests").mkdir(parents=True)
    (root / "apps" / "desktop" / "src").mkdir(parents=True)
    (root / "apps" / "desktop" / "tests").mkdir(parents=True)
    (root / "apps" / "web" / "src").mkdir(parents=True)
    (root / "apps" / "web" / "tests").mkdir(parents=True)
    (root / "packages" / "cli" / "src").mkdir(parents=True)
    (root / "packages" / "cli" / "tests").mkdir(parents=True)
    (root / "packages" / "ingest-evidence" / "src").mkdir(parents=True)
    (root / "packages" / "plugin-sdk" / "src").mkdir(parents=True)
    (root / "packages" / "plugin-sdk" / "tests").mkdir(parents=True)
    (root / "packages" / "schemas" / "src").mkdir(parents=True)
    (root / "packages" / "schemas" / "tests").mkdir(parents=True)
    (root / "packages" / "schemas" / "fixtures").mkdir(parents=True)
    (root / "packages" / "sdk-js" / "src").mkdir(parents=True)
    (root / "packages" / "sdk-js" / "tests").mkdir(parents=True)
    (root / "services" / "automation" / "src").mkdir(parents=True)
    (root / "services" / "automation" / "tests").mkdir(parents=True)
    (root / "services" / "ingest" / "src" / "sovereignops_ingest").mkdir(parents=True)
    (root / "services" / "ingest" / "tests").mkdir(parents=True)
    (root / "services" / "mcp-gateway" / "src").mkdir(parents=True)
    (root / "services" / "mcp-gateway" / "tests").mkdir(parents=True)
    (root / "services" / "sync" / "src").mkdir(parents=True)
    (root / "services" / "sync" / "tests").mkdir(parents=True)
    (root / "tests").mkdir()
    for path in (
        "scripts/loc_budget.py",
        "scripts/release_check.py",
        "scripts/repo_health.py",
        "scripts/public_boundary_guard.py",
        "scripts/status_dashboard.py",
        "scripts/env_guard.py",
        "scripts/rust_guard.py",
        "scripts/validate_openapi.py",
        "scripts/validate_mcp_gateway_fixtures.py",
        "scripts/node-check.mjs",
        *release_check.LOCAL_EVENT_CATALOG_REQUIRED_PATHS,
        *release_check.WORKSPACE_SESSION_REQUIRED_PATHS,
        *release_check.WORKSPACE_SESSION_API_REQUIRED_PATHS,
        "docs/openapi.yaml",
        "docs/schema-alignment.md",
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
        "docs/plugin-review-artifact-records-api.md",
        "docs/plugin-review-artifacts.md",
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
        "scripts/loc_integrity.py",
        "scripts/release_notes.py",
        "examples/mcp-gateway/resources.json",
        "examples/mcp-gateway/tools.json",
        "examples/mcp-gateway/approval-sessions.json",
        "examples/mcp-gateway/api-requests.json",
        "examples/mcp-gateway/safety-samples.json",
        "examples/mcp-gateway/runtime-router.json",
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
        "examples/plugins/release-notes/review-artifact-records-requests.json",
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
        "tests/test_plugin_review_artifact_records_api_alignment.py",
        "tests/test_plugin_review_artifact_records_api_docs.py",
        "tests/test_plugin_review_artifacts_docs.py",
        "tests/test_plugin_review_artifact_alignment.py",
        "tests/test_adr_docs.py",
        "tests/test_ci_workflows.py",
        "tests/test_contributing_quickstart.py",
        "tests/test_release_checklist_docs.py",
        "tests/test_status_dashboard.py",
        "tests/test_status_docs.py",
        "tests/test_ingest_contract_alignment.py",
        "tests/test_schema_alignment_docs.py",
        "tests/test_validate_openapi_schema_components.py",
        "tests/test_validate_openapi_ingest_search.py",
        "tests/test_validate_openapi_ingest_evidence.py",
        "tests/ingest_evidence_parity.test.mjs",
        "apps/api/src/ingestEvidenceRoutes.ts",
        "apps/api/src/mcpApprovalEvidenceRoutes.ts",
        "apps/api/tests/mcp-approval-evidence-routes.test.mjs",
        "apps/api/src/mcpApprovalEvidenceRecordRoutes.ts",
        "apps/api/tests/mcp-approval-evidence-record-routes.test.mjs",
        "apps/api/src/pluginReviewArtifactRoutes.ts",
        "apps/api/tests/plugin-review-artifact-routes.test.mjs",
        "apps/api/src/pluginReviewArtifactRecordRoutes.ts",
        "apps/api/tests/plugin-review-artifact-record-routes.test.mjs",
        "packages/cli/src/index.ts",
        "packages/cli/src/ingestEvidence.ts",
        "packages/cli/src/ingestEvidenceApiReplay.ts",
        "packages/cli/src/mcpApprovalEvidenceReplay.ts",
        "packages/cli/src/mcpApprovalEvidenceRecordsReplay.ts",
        "packages/cli/src/pluginReviewArtifactApiReplay.ts",
        "packages/cli/src/pluginReviewArtifactRecordsReplay.ts",
        "packages/cli/src/pluginReviewArtifact.ts",
        "packages/cli/tests/plugin-review-artifact-api-replay.test.mjs",
        "packages/cli/tests/plugin-review-artifact-records-replay.test.mjs",
        "packages/cli/tests/mcp-approval-evidence-replay.test.mjs",
        "packages/cli/tests/mcp-approval-evidence-records-replay.test.mjs",
        "packages/cli/tests/plugin-review-artifact.test.mjs",
        "packages/ingest-evidence/src/index.ts",
        "packages/schemas/src/apiError.ts",
        "packages/schemas/src/eventCatalog.ts",
        "packages/schemas/src/mcpApprovalEvidence.ts",
        "packages/schemas/src/mcpApprovalEvidenceRecord.ts",
        "packages/schemas/src/pluginReviewArtifact.ts",
        "packages/schemas/src/pluginReviewArtifactRecord.ts",
        "packages/schemas/tests/api-error.test.mjs",
        "packages/schemas/tests/event-catalog.test.mjs",
        "packages/schemas/tests/mcp-approval-evidence.test.mjs",
        "packages/schemas/tests/mcp-approval-evidence-record.test.mjs",
        "packages/schemas/tests/plugin-review-artifact.test.mjs",
        "packages/schemas/tests/plugin-review-artifact-record.test.mjs",
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
        "packages/schemas/fixtures/mcp-approval-evidence.valid.json",
        "packages/schemas/fixtures/mcp-approval-evidence.invalid.json",
        "packages/schemas/fixtures/mcp-approval-evidence.schema.json",
        "packages/schemas/fixtures/mcp-approval-evidence-record.valid.json",
        "packages/schemas/fixtures/mcp-approval-evidence-record.invalid.json",
        "packages/schemas/fixtures/mcp-approval-evidence-record.schema.json",
        "packages/schemas/fixtures/mcp-approval-evidence-record-list.valid.json",
        "packages/schemas/fixtures/mcp-approval-evidence-record-list.schema.json",
        "packages/schemas/fixtures/mcp-approval-evidence-record-comparison.valid.json",
        "packages/schemas/fixtures/mcp-approval-evidence-record-comparison.schema.json",
        "packages/schemas/fixtures/mcp-approval-evidence-record-create-request.valid.json",
        "packages/schemas/fixtures/mcp-approval-evidence-record-create-request.schema.json",
        "packages/schemas/fixtures/plugin-review-artifact-preview.valid.json",
        "packages/schemas/fixtures/plugin-review-artifact-preview.invalid.json",
        "packages/schemas/fixtures/plugin-review-artifact-preview.schema.json",
        "packages/schemas/fixtures/plugin-review-artifact-record.valid.json",
        "packages/schemas/fixtures/plugin-review-artifact-record.invalid.json",
        "packages/schemas/fixtures/plugin-review-artifact-record.schema.json",
        "packages/schemas/fixtures/plugin-review-artifact-record-list.valid.json",
        "packages/schemas/fixtures/plugin-review-artifact-record-list.schema.json",
        "packages/schemas/fixtures/plugin-review-artifact-record-comparison.valid.json",
        "packages/schemas/fixtures/plugin-review-artifact-record-comparison.schema.json",
        "packages/schemas/fixtures/plugin-review-artifact-record-create-request.valid.json",
        "packages/schemas/fixtures/plugin-review-artifact-record-create-request.schema.json",
        "packages/sdk-js/src/pluginReviewArtifactClient.ts",
        "packages/sdk-js/src/mcpApprovalEvidenceClient.ts",
        "packages/sdk-js/src/mcpApprovalEvidenceRecordClient.ts",
        "packages/sdk-js/src/pluginReviewArtifactRecordClient.ts",
        "packages/sdk-js/tests/client-mcp-approval-evidence.test.mjs",
        "packages/sdk-js/tests/client-mcp-approval-evidence-record.test.mjs",
        "packages/sdk-js/tests/client-plugin-review-artifact.test.mjs",
        "packages/sdk-js/tests/client-plugin-review-artifact-record.test.mjs",
        "packages/plugin-sdk/src/reviewArtifact.ts",
        "packages/plugin-sdk/src/reviewArtifactRecords.ts",
        "packages/plugin-sdk/src/sandboxReview.ts",
        "packages/plugin-sdk/tests/sandbox-review.test.mjs",
        "packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs",
        "packages/plugin-sdk/tests/review-artifact.test.mjs",
        "packages/plugin-sdk/tests/review-artifact-records.test.mjs",
        "services/automation/src/audit.ts",
        "services/automation/src/pluginReview.ts",
        "services/automation/tests/automation-audit.test.mjs",
        "services/automation/tests/plugin-review.test.mjs",
        "apps/web/src/automationPluginReview.ts",
        "apps/web/src/mcpApprovalEvidenceApiState.ts",
        "apps/web/src/mcpApprovalEvidenceRecordState.ts",
        "apps/web/src/pluginReviewArtifactApiState.ts",
        "apps/web/src/pluginReviewArtifactRecordState.ts",
        "apps/web/src/pluginReviewArtifactState.ts",
        "apps/web/tests/automation-plugin-review.test.mjs",
        "apps/web/tests/mcp-approval-evidence-api-state.test.mjs",
        "apps/web/tests/mcp-approval-evidence-record-state.test.mjs",
        "apps/web/tests/plugin-review-artifact-api-state.test.mjs",
        "apps/web/tests/plugin-review-artifact-record-state.test.mjs",
        "apps/web/tests/plugin-review-artifact-state.test.mjs",
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
        "services/mcp-gateway/src/approvalEvidence.ts",
        "services/mcp-gateway/src/approvalEvidenceRecords.ts",
        "services/mcp-gateway/tests/approval-evidence.test.mjs",
        "services/mcp-gateway/tests/approval-evidence-records.test.mjs",
        "package.json",
        "pnpm-workspace.yaml",
        "Cargo.toml",
    ):
        (root / path).parent.mkdir(parents=True, exist_ok=True)
        (root / path).write_text("placeholder\n", encoding="utf-8")


class ReleaseCheckTests(unittest.TestCase):
    def test_command_discovery_marks_available_tools(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_release_root(root)
            available = {"node": "node-bin", "npm": "npm-bin", "cargo": "cargo-bin"}

            checks = release_check.discover_checks(root, available.get)

        by_name = {check.spec.name: check for check in checks}
        self.assertTrue(by_name["python-tests"].available)
        self.assertTrue(by_name["ingest-python-tests"].available)
        self.assertTrue(by_name["node-package-baseline"].available)
        self.assertTrue(by_name["ingest-evidence-parity"].available)
        self.assertTrue(by_name["ingest-evidence-api-replay"].available)
        self.assertTrue(by_name["status-dashboard"].available)
        self.assertTrue(by_name["bootstrap-docs"].available)
        self.assertTrue(by_name["schema-contract-alignment"].available)
        self.assertTrue(by_name["local-event-catalog-integration"].available)
        self.assertTrue(by_name["workspace-session-integration"].available)
        self.assertTrue(by_name["workspace-session-docs"].available)
        self.assertTrue(by_name["workspace-session-api-integration"].available)
        self.assertTrue(by_name["workspace-session-api-alignment"].available)
        self.assertTrue(by_name["plugin-automation-alignment"].available)
        self.assertTrue(by_name["mcp-approval-evidence-api-alignment"].available)
        self.assertTrue(by_name["mcp-approval-evidence-records-api-alignment"].available)
        self.assertTrue(by_name["plugin-review-artifact-alignment"].available)
        self.assertTrue(by_name["plugin-review-artifact-api-alignment"].available)
        self.assertTrue(by_name["plugin-review-artifact-records-api-alignment"].available)
        self.assertTrue(by_name["npm-workspace-check"].available)
        self.assertTrue(by_name["cargo-check"].available)
        self.assertFalse(by_name["pnpm-workspace-check"].available)
        self.assertEqual(by_name["pnpm-workspace-check"].missing_tool, "pnpm")

    def test_list_reports_commands_without_running_subprocesses(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_release_root(root)
            calls: list[tuple[str, ...]] = []

            def runner(command: tuple[str, ...], **_: object) -> subprocess.CompletedProcess[object]:
                calls.append(command)
                return subprocess.CompletedProcess(command, 0)

            output = StringIO()
            with redirect_stdout(output):
                exit_code = release_check.main(
                    ["--root", str(root), "--list"],
                    tool_resolver=lambda _: None,
                    runner=runner,
                )

        self.assertEqual(exit_code, 0)
        self.assertEqual(calls, [])
        self.assertIn("Release checks:", output.getvalue())
        self.assertIn("pnpm-workspace-check: unavailable (missing tool: pnpm)", output.getvalue())

    def test_dry_run_outputs_commands_without_running_subprocesses(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_release_root(root)
            calls: list[tuple[str, ...]] = []

            def runner(command: tuple[str, ...], **_: object) -> subprocess.CompletedProcess[object]:
                calls.append(command)
                return subprocess.CompletedProcess(command, 0)

            output = StringIO()
            with redirect_stdout(output):
                exit_code = release_check.main(
                    ["--root", str(root), "--dry-run"],
                    tool_resolver=lambda _: None,
                    runner=runner,
                )

        self.assertEqual(exit_code, 0)
        self.assertEqual(calls, [])
        self.assertIn("RUN python-tests: python -m unittest discover -s tests", output.getvalue())
        self.assertIn("RUN ingest-python-tests: python -m unittest discover -s services/ingest/tests", output.getvalue())
        self.assertIn("RUN status-dashboard: python scripts/status_dashboard.py --json", output.getvalue())
        self.assertIn("RUN bootstrap-docs: python -m unittest tests.test_adr_docs", output.getvalue())
        self.assertIn("RUN schema-contract-alignment: python -m unittest tests.test_schema_alignment_docs", output.getvalue())
        self.assertIn("RUN loc-integrity: python scripts/loc_integrity.py", output.getvalue())
        self.assertIn("SKIP local-event-catalog-integration: missing tool: node", output.getvalue())
        self.assertIn("SKIP workspace-session-integration: missing tool: node", output.getvalue())
        self.assertIn("RUN workspace-session-docs: python -m unittest tests.test_workspace_session_isolation_docs", output.getvalue())
        self.assertIn("SKIP workspace-session-api-integration: missing tool: node", output.getvalue())
        self.assertIn("RUN workspace-session-api-alignment: python -m unittest tests.test_workspace_session_api_docs", output.getvalue())
        self.assertIn("SKIP release-notes-smoke:", output.getvalue())
        self.assertIn("SKIP cargo-check: missing tool: cargo", output.getvalue())

    def test_missing_tools_are_skipped_when_running_available_checks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_release_root(root)
            calls: list[tuple[str, ...]] = []

            def runner(command: tuple[str, ...], **_: object) -> subprocess.CompletedProcess[object]:
                calls.append(command)
                return subprocess.CompletedProcess(command, 0)

            output = StringIO()
            with redirect_stdout(output):
                exit_code = release_check.main(
                    ["--root", str(root)],
                    tool_resolver=lambda _: None,
                    runner=runner,
                )

        called_names = {command[0] for command in calls}
        self.assertEqual(exit_code, 0)
        self.assertNotIn("node", called_names)
        self.assertNotIn("npm", called_names)
        self.assertNotIn("cargo", called_names)
        self.assertNotIn("pnpm", called_names)
        self.assertIn("[skip] node-package-baseline: missing tool: node", output.getvalue())

    def test_security_docs_are_present(self) -> None:
        root = Path(__file__).resolve().parents[1]
        expected = {
            "docs/security-checklist.md": "Release Gate",
            "docs/dependency-review.md": "Dependency Admission",
            "docs/fuzzing.md": "Rust toolchain",
            "docs/maintainership.md": "Release Stewardship",
        }

        for relative_path, required_text in expected.items():
            with self.subTest(path=relative_path):
                text = (root / relative_path).read_text(encoding="utf-8")
                self.assertIn(required_text, text)


if __name__ == "__main__":
    unittest.main()
