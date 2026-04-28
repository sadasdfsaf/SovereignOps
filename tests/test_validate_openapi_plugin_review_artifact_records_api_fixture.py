from __future__ import annotations

import re
import unittest
from typing import Any

from scripts.openapi_fixture_contract import (
    REPO_ROOT,
    assert_fixture_routes_documented,
    load_json,
    load_openapi_lines,
)


FIXTURE_RELATIVE_PATH = "examples/plugins/release-notes/review-artifact-records-requests.json"
EXPECTED_SCHEMA_VERSION = "plugin-review-artifact-records-requests.v1"
EXPECTED_API_BASE = "local://plugin-review-artifact-records-api"
EXPECTED_ROUTE_SET = {
    ("POST", "/v1/plugins/review-artifacts/records"),
    ("GET", "/v1/plugins/review-artifacts/records"),
    ("GET", "/v1/plugins/review-artifacts/records/{recordId}"),
    ("POST", "/v1/plugins/review-artifacts/records/{recordId}/compare"),
}
REQUEST_BODY_REFS = {
    ("POST", "/v1/plugins/review-artifacts/records"): (
        "PluginReviewArtifactRecordCreateRequest"
    ),
    ("GET", "/v1/plugins/review-artifacts/records"): (
        "PluginReviewArtifactRecordListRequest"
    ),
    ("POST", "/v1/plugins/review-artifacts/records/{recordId}/compare"): (
        "PluginReviewArtifactRecordCompareRequest"
    ),
}
SAFE_RELATIVE_JSON_PATH = re.compile(r"^[A-Za-z0-9._/-]+\.json$")

PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "plan" + "-pack",
    "private " + "plan " + "pack",
    "." + "codex" + "-private",
    "." + "codex" + "-run",
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/" + "backlog" + ".jsonl",
    "tasks" + "\\" + "backlog" + ".jsonl",
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
    re.compile(
        r"(?i)\bbearer\s+(?!\[REDACTED\]|\[redacted[:-])[A-Za-z0-9._~+/=-]+"
    ),
    re.compile(
        r"(?i)(?:password|passwd|secret|api[_-]?key)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted[:-])\S{4,}"
    ),
    re.compile(
        r"(?i)(?<![A-Za-z0-9_])(?<!\[redacted[:-])(?:lock[_-]?token|token)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted[:-])\S{4,}"
    ),
)


class ValidateOpenApiPluginReviewArtifactRecordsApiFixtureTests(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture_text = (REPO_ROOT / FIXTURE_RELATIVE_PATH).read_text(encoding="utf-8")
        cls.fixture = load_json(FIXTURE_RELATIVE_PATH)
        cls.openapi_lines = load_openapi_lines()

    def test_fixture_targets_review_artifact_records_api(self) -> None:
        self.assertEqual(self.fixture["schemaVersion"], EXPECTED_SCHEMA_VERSION)
        self.assertEqual(self.fixture["apiBase"], EXPECTED_API_BASE)
        self.assertGreaterEqual(len(self.fixture["requests"]), 1)

    def test_fixture_refs_are_safe_relative_json_paths(self) -> None:
        fixture_refs = self.fixture.get("fixtureRefs")
        self.assertIsInstance(fixture_refs, list)
        self.assertGreaterEqual(len(fixture_refs), 1)

        declared_refs: set[str] = set()
        for index, ref in enumerate(fixture_refs):
            with self.subTest(fixture_ref=index):
                self.assertIsInstance(ref, dict)
                ref_id = ref.get("id")
                fixture_path = ref.get("fixturePath")
                self.assertIsInstance(ref_id, str)
                self.assertNotIn(ref_id, declared_refs)
                declared_refs.add(ref_id)
                self.assertIsInstance(fixture_path, str)
                assert_safe_relative_json_path(self, fixture_path)

        used_refs = set(_walk_fixture_refs(self.fixture))
        self.assertGreaterEqual(len(used_refs), 1)
        self.assertLessEqual(used_refs, declared_refs)

    def test_fixture_has_no_private_paths_or_raw_secrets(self) -> None:
        assert_no_private_markers_raw_paths_or_raw_secrets(self, self.fixture_text)

    def test_every_fixture_route_is_represented_in_openapi(self) -> None:
        assert_fixture_routes_documented(
            self,
            bundle=self.fixture,
            openapi_lines=self.openapi_lines,
            expected_routes=EXPECTED_ROUTE_SET,
            expected_tag="plugins",
            request_body_refs=REQUEST_BODY_REFS,
        )


def assert_safe_relative_json_path(testcase: unittest.TestCase, value: str) -> None:
    testcase.assertRegex(value, SAFE_RELATIVE_JSON_PATH)
    testcase.assertNotIn("\\", value)
    testcase.assertFalse(value.startswith(("/", "http://", "https://", "file://")))
    testcase.assertIsNone(re.match(r"^[A-Za-z]:", value))
    parts = value.split("/")
    testcase.assertNotIn("", parts)
    testcase.assertNotIn(".", parts)
    testcase.assertNotIn("..", parts)


def assert_no_private_markers_raw_paths_or_raw_secrets(
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


def _walk_fixture_refs(value: Any) -> list[str]:
    refs: list[str] = []
    if isinstance(value, dict):
        fixture_ref = value.get("$fixtureRef")
        if isinstance(fixture_ref, str):
            refs.append(fixture_ref)
        for nested in value.values():
            refs.extend(_walk_fixture_refs(nested))
    elif isinstance(value, list):
        for nested in value:
            refs.extend(_walk_fixture_refs(nested))
    return refs


if __name__ == "__main__":
    unittest.main()
