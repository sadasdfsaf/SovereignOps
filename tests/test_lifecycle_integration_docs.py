from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "lifecycle-integration.md"

EXPECTED_PUBLIC_FILES = (
    "docs/openapi.yaml",
    "apps/api/src/lifecycleRoutes.ts",
    "packages/cli/src/lifecycle.ts",
    "packages/cli/src/index.ts",
    "packages/cli/src/commands.ts",
    "packages/sdk-js/src/client.ts",
    "packages/sdk-js/src/workspace.ts",
    "packages/sdk-js/src/storage.ts",
    "packages/workspace-store/src/index.ts",
    "packages/workspace-backup/src/index.ts",
    "packages/event-compaction/src/index.ts",
    "packages/audit-export/src/index.ts",
    "packages/path-security/src/index.ts",
    "apps/web/src/lifecycleReview.ts",
)

EXPECTED_LOCAL_COMMANDS = (
    r"python scripts\smoke.py",
    r"python scripts\validate_openapi.py",
    r"python scripts\loc_budget.py --summary",
    "python -m unittest tests.test_lifecycle_integration_docs",
    "npm.cmd --workspace @sovereignops/api run check",
    "npm.cmd --workspace @sovereignops/cli run check",
    "npm.cmd --workspace @sovereignops/sdk-js run check",
    "npm.cmd --workspace @sovereignops/audit-export run check",
    "npm.cmd --workspace @sovereignops/path-security run check",
    "npm.cmd --workspace @sovereignops/web run check",
)

EXPECTED_ROUTE_REFERENCES = (
    "POST /v1/workspaces/:workspaceId/migrations/plan",
    "POST /v1/workspaces/:workspaceId/migrations/run",
    "POST /v1/workspaces/:workspaceId/backups/manifests",
    "POST /v1/workspaces/:targetWorkspaceId/restores/plan",
    "POST /v1/observability/events",
    "POST /v1/observability/metrics",
    "POST /v1/workspaces/:workspaceId/compactions/plan",
)

EXPECTED_SAFETY_GUARANTEES = (
    "Dry-run planning precedes durable changes for migrations, restores, and compaction.",
    "Route path parameters must match body identifiers before handlers run.",
    "Restore replace and source overwrite require explicit approval flags.",
    "Backup payload paths stay relative; traversal and absolute paths are rejected.",
    "Audit export redacts sensitive-shaped values before JSONL or CSV output.",
    "Path display uses deterministic redacted references instead of exposing local roots.",
    "Web review state blocks approval while blockers or open blocking redactions remain.",
    "SDK storage and workspace helpers return cloned or frozen snapshots.",
    "Lifecycle checks remain local and do not require credentials, network access, or external services.",
)

EXPECTED_COMMAND_FAMILIES = (
    "migration plan",
    "backup manifest validate",
    "restore plan",
    "compaction plan",
    "loc integrity",
    "release notes",
)


class LifecycleIntegrationDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_text = cls.text.lower()

    def test_references_expected_public_files_and_routes(self) -> None:
        for relative_path in EXPECTED_PUBLIC_FILES:
            with self.subTest(path=relative_path):
                self.assertTrue((ROOT / relative_path).exists(), relative_path)
                self.assertIn(f"`{relative_path}`", self.text)

        for route in EXPECTED_ROUTE_REFERENCES:
            with self.subTest(route=route):
                self.assertIn(f"`{route}`", self.text)

    def test_references_current_local_commands_and_cli_families(self) -> None:
        for command in EXPECTED_LOCAL_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.text)

        for family in EXPECTED_COMMAND_FAMILIES:
            with self.subTest(family=family):
                self.assertIn(f"`{family}`", self.text)

        self.assertNotIn("curl ", self.lower_text)
        self.assertNotIn("https://", self.lower_text)

    def test_avoids_restricted_public_content_terms(self) -> None:
        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for term in restricted_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_text))
                else:
                    self.assertNotIn(term, self.lower_text)

    def test_includes_lifecycle_safety_guarantees(self) -> None:
        for guarantee in EXPECTED_SAFETY_GUARANTEES:
            with self.subTest(guarantee=guarantee):
                self.assertIn(guarantee, self.text)


if __name__ == "__main__":
    unittest.main()
