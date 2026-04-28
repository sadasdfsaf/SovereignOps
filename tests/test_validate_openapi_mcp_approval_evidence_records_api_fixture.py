from __future__ import annotations

import re
import unittest
from pathlib import Path
from typing import Any

from scripts.openapi_fixture_contract import (
    assert_fixture_routes_documented,
    load_json,
    load_openapi_lines,
    normalize_fixture_requests,
)


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_REL_PATH = "examples/mcp/approval-evidence-records-requests.json"
FIXTURE_PATH = ROOT / FIXTURE_REL_PATH

EXPECTED_SCHEMA_VERSION = "mcp-approval-evidence-records-requests.v1"
EXPECTED_API_BASE = "local://mcp-approval-evidence-records-api"
EXPECTED_ROUTES = {
    ("POST", "/v1/mcp/approval-evidence/records"),
    ("GET", "/v1/mcp/approval-evidence/records"),
    ("GET", "/v1/mcp/approval-evidence/records/{recordId}"),
    ("POST", "/v1/mcp/approval-evidence/records/{recordId}/compare"),
}
REQUEST_BODY_REFS = {
    ("POST", "/v1/mcp/approval-evidence/records"): "McpApprovalEvidenceRecordCreateRequest",
    (
        "POST",
        "/v1/mcp/approval-evidence/records/{recordId}/compare",
    ): "McpApprovalEvidenceRecordCompareRequest",
}

PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "plan" + "-pack",
    "private" + " " + "plan" + " " + "pack",
    "".join((".", "codex", "-private")),
    "".join((".", "codex", "-run")),
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog.jsonl",
    "tasks" + "\\backlog.jsonl",
)
RAW_PATH_PATTERNS = (
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


class ValidateOpenApiMcpApprovalEvidenceRecordsApiFixtureTests(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture_text = FIXTURE_PATH.read_text(encoding="utf-8")
        cls.fixture = load_json(FIXTURE_REL_PATH)
        cls.openapi_lines = load_openapi_lines()

    def test_fixture_declares_expected_local_api_contract(self) -> None:
        self.assertEqual(self.fixture["schemaVersion"], EXPECTED_SCHEMA_VERSION)
        self.assertEqual(self.fixture["apiBase"], EXPECTED_API_BASE)
        self.assertGreaterEqual(len(normalize_fixture_requests(self.fixture)), 1)

    def test_every_fixture_route_is_represented_in_openapi(self) -> None:
        assert_fixture_routes_documented(
            self,
            bundle=self.fixture,
            openapi_lines=self.openapi_lines,
            expected_routes=EXPECTED_ROUTES,
            expected_tag="mcp",
            request_body_refs=REQUEST_BODY_REFS,
        )

    def test_fixture_refs_and_body_strings_are_safe(self) -> None:
        assert_no_private_paths_or_raw_secrets(self, self.fixture_text)

        for index, entry in enumerate(self.fixture["requests"]):
            route = entry.get("route")
            request = entry.get("request")
            for path, value in _walk_strings({"route": route, "request": request}):
                with self.subTest(request=index, path=path):
                    self.assertFalse(value.startswith(("http://", "https://")))
                    assert_no_private_paths_or_raw_secrets(self, value)


def assert_no_private_paths_or_raw_secrets(
    testcase: unittest.TestCase,
    text: str,
) -> None:
    lower_text = text.lower()

    for marker in PRIVATE_PATH_MARKERS:
        with testcase.subTest(marker=marker):
            testcase.assertNotIn(marker.lower(), lower_text)

    for pattern in RAW_PATH_PATTERNS:
        with testcase.subTest(pattern=pattern.pattern):
            testcase.assertIsNone(pattern.search(text))

    for pattern in RAW_SECRET_PATTERNS:
        with testcase.subTest(pattern=pattern.pattern):
            testcase.assertIsNone(pattern.search(text))


def _walk_strings(value: Any, path: str = "$") -> list[tuple[str, str]]:
    strings: list[tuple[str, str]] = []
    if isinstance(value, str):
        strings.append((path, value))
    elif isinstance(value, dict):
        for key, nested in value.items():
            strings.extend(_walk_strings(nested, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            strings.extend(_walk_strings(nested, f"{path}[{index}]"))
    return strings


if __name__ == "__main__":
    unittest.main()
