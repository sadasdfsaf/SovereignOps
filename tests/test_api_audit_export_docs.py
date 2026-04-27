from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "api-audit-export.md"
LIFECYCLE_DOC_PATH = ROOT / "docs" / "lifecycle-integration.md"

EXPECTED_ROUTES = (
    "GET /v1/workspaces/:workspaceId/audit",
    "POST /v1/audit/export/jsonl",
    "POST /v1/audit/export/csv",
    "POST /v1/audit/export/package",
)

EXPECTED_FILES = (
    "docs/api-audit-export.md",
    "packages/audit-export/src/index.ts",
    "packages/sdk-js/src/localLifecycle.ts",
    "packages/cli/src/auditExport.ts",
    "packages/cli/src/index.ts",
)

EXPECTED_REQUEST_FIELDS = (
    '"workspaceId"',
    '"events"',
    '"filters"',
    '"createdAt"',
    '"exportId"',
    '"decisions"',
    '"types"',
    '"fromTimestamp"',
    '"toTimestamp"',
)

EXPECTED_RESPONSE_FIELDS = (
    '"format"',
    '"mediaType"',
    '"content"',
    '"manifest"',
    '"fingerprint"',
    '"jsonl"',
    '"csv"',
)

EXPECTED_SDK_CLI_REFERENCES = (
    "`buildLocalAuditExportPackage`",
    "`createAuditExportPackage`",
    "`renderAuditJsonl`",
    "`renderAuditCsv`",
    "`sovereignops audit export jsonl --input-json <json>`",
    "`sovereignops audit export csv --input-json <json>`",
    "`sovereignops audit export package --input-json <json>`",
    "`runAuditExportCli`",
    "node packages\\cli\\src\\index.ts audit export jsonl --stdin",
    "node packages\\cli\\src\\index.ts audit export csv --stdin",
    "node packages\\cli\\src\\index.ts audit export package --stdin",
)

EXPECTED_REDACTION_LINES = (
    "Sensitive-shaped keys and values are replaced with `[REDACTED]` before JSONL, CSV, manifest, or package fingerprints are rendered.",
    "Redaction applies recursively to `actor`, `target`, `attributes`, and `context`.",
    "Event identifiers that match sensitive-shaped strings are replaced by deterministic generated identifiers.",
    "Raw request objects are not echoed; responses contain normalized export content and metadata only.",
)

EXPECTED_LIFECYCLE_REFERENCES = (
    "`docs/api-audit-export.md`",
    "`POST /v1/audit/export/jsonl`",
    "`POST /v1/audit/export/csv`",
    "`POST /v1/audit/export/package`",
    "`buildLocalAuditExportPackage`",
    "`audit export`",
    "python -m unittest tests.test_api_audit_export_docs",
    "Bridge Test Expectations",
)


class ApiAuditExportDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.lifecycle_text = LIFECYCLE_DOC_PATH.read_text(encoding="utf-8")
        cls.combined_text = f"{cls.text}\n{cls.lifecycle_text}"
        cls.lower_text = cls.combined_text.lower()

    def test_documents_expected_routes_and_files(self) -> None:
        self.assertTrue(DOC_PATH.exists())

        for route in EXPECTED_ROUTES:
            with self.subTest(route=route):
                self.assertIn(f"`{route}`", self.text)

        for relative_path in EXPECTED_FILES:
            with self.subTest(path=relative_path):
                self.assertTrue((ROOT / relative_path).exists(), relative_path)
                self.assertIn(f"`{relative_path}`", self.combined_text)

    def test_documents_request_and_response_wrappers(self) -> None:
        for field in EXPECTED_REQUEST_FIELDS:
            with self.subTest(field=field):
                self.assertIn(field, self.text)

        for field in EXPECTED_RESPONSE_FIELDS:
            with self.subTest(field=field):
                self.assertIn(field, self.text)

        self.assertIn('"format": "jsonl"', self.text)
        self.assertIn('"format": "csv"', self.text)
        self.assertIn('"mediaType": "application/jsonl"', self.text)
        self.assertIn('"mediaType": "text/csv"', self.text)
        self.assertIn('"kind": "audit-export.package"', self.text)

    def test_documents_sdk_cli_and_bridge_expectations(self) -> None:
        for reference in EXPECTED_SDK_CLI_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, self.text)

        for reference in EXPECTED_LIFECYCLE_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, self.lifecycle_text)

    def test_documents_redaction_guarantees_and_local_only_examples(self) -> None:
        for line in EXPECTED_REDACTION_LINES:
            with self.subTest(line=line):
                self.assertIn(line, self.text)

        self.assertIn("http://127.0.0.1:7317", self.text)
        self.assertNotIn("curl ", self.lower_text)
        self.assertNotIn("https://", self.lower_text)
        self.assertNotIn("npm install -g", self.lower_text)
        self.assertNotIn("npx ", self.lower_text)

    def test_avoids_restricted_content_terms(self) -> None:
        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for term in restricted_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_text))
                else:
                    self.assertNotIn(term, self.lower_text)


if __name__ == "__main__":
    unittest.main()
