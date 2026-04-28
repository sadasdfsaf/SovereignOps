from __future__ import annotations

import re
import unittest

from scripts.openapi_fixture_contract import (
    REPO_ROOT,
    assert_fixture_routes_documented,
    load_json,
    load_openapi_lines,
)


FIXTURE_RELATIVE_PATH = "examples/mcp/approval-evidence-preview-requests.json"

EXPECTED_SCHEMA_VERSION = "mcp-approval-evidence-preview-requests.v1"
EXPECTED_API_BASE = "local://mcp-approval-evidence-api"
EXPECTED_ROUTES = {("POST", "/v1/mcp/approval-evidence/preview")}
REQUEST_BODY_REFS = {
    ("POST", "/v1/mcp/approval-evidence/preview"): "McpApprovalEvidencePreviewRequest",
}

PRIVATE_PLAN_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "plan" + "-pack",
    "private " + "plan " + "pack",
    "." + "codex" + "-private",
    "." + "codex" + "-run",
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/" + "backlog.jsonl",
    "tasks" + "\\" + "backlog.jsonl",
)
RAW_LOCAL_PATH_PATTERNS = (
    re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]"),
    re.compile(r"\\\\[^\\\s]+\\[^\\\s]+"),
    re.compile(
        r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:/|\b)"
    ),
    re.compile(r"(?<![A-Za-z0-9_])workspaces[\\/]"),
)
RAW_SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{12,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\]|\[redacted[:-])[A-Za-z0-9._~+/=-]+"),
    re.compile(
        r"(?i)(?:password|passwd|secret|api[_-]?key)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted[:-])\S{4,}"
    ),
    re.compile(
        r"(?i)(?<![A-Za-z0-9_])(?<!\[redacted[:-])(?:lock[_-]?token|token)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted[:-])\S{4,}"
    ),
)


class ValidateOpenApiMcpApprovalEvidenceApiFixtureTests(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture_path = REPO_ROOT / FIXTURE_RELATIVE_PATH
        cls.fixture_text = cls.fixture_path.read_text(encoding="utf-8")
        cls.fixture = load_json(FIXTURE_RELATIVE_PATH)
        cls.openapi_lines = load_openapi_lines()

    def test_fixture_bundle_identity_matches_mcp_approval_evidence_api(self) -> None:
        self.assertEqual(self.fixture["schemaVersion"], EXPECTED_SCHEMA_VERSION)
        self.assertEqual(self.fixture["apiBase"], EXPECTED_API_BASE)
        self.assertIsInstance(self.fixture["requests"], list)
        self.assertGreaterEqual(len(self.fixture["requests"]), 1)

    def test_fixture_routes_are_documented_in_openapi(self) -> None:
        assert_fixture_routes_documented(
            self,
            bundle=self.fixture,
            openapi_lines=self.openapi_lines,
            expected_routes=EXPECTED_ROUTES,
            expected_tag="mcp",
            request_body_refs=REQUEST_BODY_REFS,
        )

    def test_fixture_text_has_no_private_plan_markers_raw_paths_or_raw_secrets(self) -> None:
        lower_text = self.fixture_text.lower()

        for marker in PRIVATE_PLAN_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker.lower(), lower_text)

        for pattern in RAW_LOCAL_PATH_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.fixture_text))

        for pattern in RAW_SECRET_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.fixture_text))


if __name__ == "__main__":
    unittest.main()
