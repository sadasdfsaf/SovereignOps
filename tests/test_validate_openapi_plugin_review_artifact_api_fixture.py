from __future__ import annotations

import re
import unittest

from scripts.openapi_fixture_contract import (
    REPO_ROOT,
    assert_fixture_routes_documented,
    load_json,
    load_openapi_lines,
)


FIXTURE_RELATIVE_PATH = "examples/plugins/release-notes/review-artifact-api-requests.json"
EXPECTED_SCHEMA_VERSION = "plugin-review-artifact-api-requests.v1"
EXPECTED_API_BASE = "local://plugin-review-artifact-api"
EXPECTED_ROUTES = {
    ("POST", "/v1/plugins/review-artifacts/preview"),
}
REQUEST_BODY_REFS = {
    ("POST", "/v1/plugins/review-artifacts/preview"): "PluginReviewArtifactPreviewRequest",
}

PRIVATE_PLAN_MARKERS = (
    "".join(("sovereign", "ops", "-codex", "-pack")),
    "plan" + "-pack",
    "private " + "plan " + "pack",
    "." + "codex" + "-private",
    "." + "codex" + "-run",
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog" + ".jsonl",
    "tasks" + "\\backlog" + ".jsonl",
)
LOCAL_ROOT_SEGMENTS = (
    "Users",
    "home",
    "root",
    "tmp",
    "var",
    "etc",
    "opt",
    "pri" + "vate",
    "mnt",
    "Volumes",
)
RAW_LOCAL_PATH_PATTERNS = (
    re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]"),
    re.compile(r"\\\\[^\\\s]+\\[^\\\s]+"),
    re.compile(
        rf"(?<![A-Za-z0-9_])/(?:{'|'.join(LOCAL_ROOT_SEGMENTS)})(?:/|\b)"
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
        r'(?i)"(?:password|passwd|secret|api[_-]?key|api[_-]?token|'
        r'session[_-]?token|lock[_-]?token|token|authorization)"\s*:\s*"'
        r'(?!\[REDACTED\]|\[redacted[:-])[^"]{4,}"'
    ),
    re.compile(
        r"(?i)(?:password|passwd|secret|api[_-]?key|api[_-]?token|"
        r"session[_-]?token|lock[_-]?token|token|authorization)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted[:-])\S{4,}"
    ),
)


class ValidateOpenApiPluginReviewArtifactApiFixtureTests(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls) -> None:
        fixture_path = REPO_ROOT / FIXTURE_RELATIVE_PATH
        cls.fixture_text = fixture_path.read_text(encoding="utf-8")
        cls.fixture = load_json(FIXTURE_RELATIVE_PATH)
        cls.openapi_lines = load_openapi_lines()

    def test_fixture_identity_matches_plugin_review_artifact_preview_api(self) -> None:
        self.assertEqual(self.fixture["schemaVersion"], EXPECTED_SCHEMA_VERSION)
        self.assertEqual(self.fixture["apiBase"], EXPECTED_API_BASE)
        self.assertIsInstance(self.fixture["requests"], list)
        self.assertGreaterEqual(len(self.fixture["requests"]), 1)

    def test_every_fixture_route_is_represented_in_openapi(self) -> None:
        assert_fixture_routes_documented(
            self,
            bundle=self.fixture,
            openapi_lines=self.openapi_lines,
            expected_routes=EXPECTED_ROUTES,
            expected_tag="plugins",
            request_body_refs=REQUEST_BODY_REFS,
        )

    def test_fixture_text_has_no_private_markers_raw_paths_or_raw_secrets(self) -> None:
        assert_no_private_markers_raw_paths_or_raw_secrets(self, self.fixture_text)


def assert_no_private_markers_raw_paths_or_raw_secrets(
    testcase: unittest.TestCase,
    text: str,
) -> None:
    lower_text = text.lower()

    for marker in PRIVATE_PLAN_MARKERS:
        with testcase.subTest(marker=marker):
            testcase.assertNotIn(marker.lower(), lower_text)

    for pattern in RAW_LOCAL_PATH_PATTERNS:
        with testcase.subTest(pattern=pattern.pattern):
            testcase.assertIsNone(pattern.search(text))

    for pattern in RAW_SECRET_PATTERNS:
        with testcase.subTest(pattern=pattern.pattern):
            testcase.assertIsNone(pattern.search(text))


if __name__ == "__main__":
    unittest.main()
