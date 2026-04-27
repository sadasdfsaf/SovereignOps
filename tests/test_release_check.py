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
    (root / "examples" / "mcp-gateway").mkdir(parents=True)
    (root / "examples" / "ingest-search").mkdir(parents=True)
    (root / "examples" / "plugins" / "release-notes").mkdir(parents=True)
    (root / "apps" / "api" / "src").mkdir(parents=True)
    (root / "apps" / "web" / "src").mkdir(parents=True)
    (root / "apps" / "web" / "tests").mkdir(parents=True)
    (root / "packages" / "cli" / "src").mkdir(parents=True)
    (root / "packages" / "cli" / "tests").mkdir(parents=True)
    (root / "packages" / "ingest-evidence" / "src").mkdir(parents=True)
    (root / "packages" / "plugin-sdk" / "src").mkdir(parents=True)
    (root / "packages" / "plugin-sdk" / "tests").mkdir(parents=True)
    (root / "services" / "automation" / "src").mkdir(parents=True)
    (root / "services" / "automation" / "tests").mkdir(parents=True)
    (root / "services" / "ingest" / "src" / "sovereignops_ingest").mkdir(parents=True)
    (root / "services" / "ingest" / "tests").mkdir(parents=True)
    (root / "tests").mkdir()
    for path in (
        "scripts/loc_budget.py",
        "scripts/repo_health.py",
        "scripts/public_boundary_guard.py",
        "scripts/env_guard.py",
        "scripts/rust_guard.py",
        "scripts/validate_openapi.py",
        "scripts/validate_mcp_gateway_fixtures.py",
        "scripts/node-check.mjs",
        "docs/openapi.yaml",
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
        "docs/plugin-review-artifacts.md",
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
        "examples/plugins/release-notes/review-artifact.json",
        "examples/plugins/release-notes/sample-input.json",
        "examples/plugins/release-notes/README.md",
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
        "tests/test_plugin_review_artifacts_docs.py",
        "tests/test_plugin_review_artifact_alignment.py",
        "tests/test_ingest_contract_alignment.py",
        "tests/test_validate_openapi_ingest_search.py",
        "tests/test_validate_openapi_ingest_evidence.py",
        "tests/ingest_evidence_parity.test.mjs",
        "apps/api/src/ingestEvidenceRoutes.ts",
        "packages/cli/src/index.ts",
        "packages/cli/src/ingestEvidence.ts",
        "packages/cli/src/ingestEvidenceApiReplay.ts",
        "packages/cli/src/pluginReviewArtifact.ts",
        "packages/cli/tests/plugin-review-artifact.test.mjs",
        "packages/ingest-evidence/src/index.ts",
        "packages/plugin-sdk/src/reviewArtifact.ts",
        "packages/plugin-sdk/src/sandboxReview.ts",
        "packages/plugin-sdk/tests/sandbox-review.test.mjs",
        "packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs",
        "packages/plugin-sdk/tests/review-artifact.test.mjs",
        "services/automation/src/audit.ts",
        "services/automation/src/pluginReview.ts",
        "services/automation/tests/automation-audit.test.mjs",
        "services/automation/tests/plugin-review.test.mjs",
        "apps/web/src/automationPluginReview.ts",
        "apps/web/src/pluginReviewArtifactState.ts",
        "apps/web/tests/automation-plugin-review.test.mjs",
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
        "package.json",
        "pnpm-workspace.yaml",
        "Cargo.toml",
    ):
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
        self.assertTrue(by_name["plugin-automation-alignment"].available)
        self.assertTrue(by_name["plugin-review-artifact-alignment"].available)
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
        self.assertIn("RUN loc-integrity: python scripts/loc_integrity.py", output.getvalue())
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
