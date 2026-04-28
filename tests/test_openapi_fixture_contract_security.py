from __future__ import annotations

from contextlib import nullcontext
import unittest

from scripts.openapi_fixture_contract import normalize_fixture_requests, route_template_for
from tests.test_validate_openapi_plugin_review_artifact_records_api_fixture import (
    assert_no_private_markers_raw_paths_or_raw_secrets,
    assert_safe_relative_json_path,
)


PLUGIN_RECORDS = "/v1/plugins/review-artifacts/records"
MCP_RECORDS = "/v1/mcp/approval-evidence/records"

PRIVATE_PACK_MARKER = "".join(("sovereignops", "-codex", "-pack"))
CODEX_PRIVATE_MARKER = "." + "codex" + "-private"
CODEX_RUN_MARKER = "." + "codex" + "-run"
CODEX_START_MARKER = "CODEX" + "_START" + "_HERE"
PRIVATE_MARKER_CASES = (
    ("fixture-text-pack-marker", '{"source":"' + PRIVATE_PACK_MARKER + '"}'),
    (
        "fixture-text-plan-marker",
        '{"note":"' + "private" + " " + "plan" + " " + "pack" + '"}',
    ),
    ("fixture-text-plan-pack-marker", '{"note":"' + "plan" + "-pack" + '"}'),
    (
        "path-like-codex-private",
        "examples/" + CODEX_PRIVATE_MARKER + "/record.json",
    ),
    ("path-like-codex-run", "examples/" + CODEX_RUN_MARKER + "/record.json"),
    ("path-like-start-marker", "examples/" + CODEX_START_MARKER + "/record.json"),
    (
        "path-like-backlog-marker",
        "examples/" + "tasks" + "/" + "backlog" + ".jsonl" + "/record.json",
    ),
    (
        "path-like-backlog-backslash-marker",
        "examples\\" + "tasks" + "\\" + "backlog" + ".jsonl",
    ),
)


class OpenApiFixtureContractSecurityTests(unittest.TestCase):
    maxDiff = None

    def test_private_markers_are_rejected_in_fixture_text_and_path_like_values(
        self,
    ) -> None:
        for label, value in PRIVATE_MARKER_CASES:
            with self.subTest(label=label):
                assert_sensitive_value_rejected(self, value)

    def test_private_path_marker_is_rejected_even_when_path_shape_is_safe(self) -> None:
        value = "fixtures/" + CODEX_PRIVATE_MARKER + "/record.json"

        assert_safe_relative_json_path(strict_testcase(), value)
        assert_sensitive_value_rejected(self, value)

    def test_raw_local_path_examples_are_rejected(self) -> None:
        slash = "/"
        backslash = "\\"
        raw_local_paths = {
            "windows-drive-backslash": "fixture=" + "C:" + backslash + "data" + backslash,
            "windows-drive-slash": "fixture=" + "D:" + slash + "data" + slash,
            "unc-share": "fixture=" + backslash * 2 + "server" + backslash + "share",
            "unix-home": "fixture=" + slash + "home" + slash + "local" + slash,
            "workspace-root": "fixture=" + "work" + "spaces" + slash + "case.json",
        }

        for label, value in raw_local_paths.items():
            with self.subTest(label=label):
                assert_sensitive_value_rejected(self, value)

    def test_raw_secret_shaped_values_are_rejected(self) -> None:
        raw_secret_values = {
            "openai-key": "token=" + "sk-" + "a" * 16,
            "github-token": "token=" + "ghp_" + "A" * 16,
            "aws-access-key": "token=" + "AKIA" + "1" * 16,
            "bearer-token": "Authorization: " + "Bearer " + "abc.def_12345",
            "password": "pass" + "word" + "=" + "correct-horse",
            "api-key": "api" + "_key: " + "example-value",
            "token-field": "to" + "ken: " + "example-value",
            "private-key-header": "-----BEGIN " + "PRIVATE KEY-----",
        }

        for label, value in raw_secret_values.items():
            with self.subTest(label=label):
                assert_sensitive_value_rejected(self, value)

    def test_route_template_rejects_record_path_traversal(self) -> None:
        unsafe_paths = (
            f"{PLUGIN_RECORDS}/..",
            f"{PLUGIN_RECORDS}/../record-123",
            f"{PLUGIN_RECORDS}/record-123/..",
            f"{PLUGIN_RECORDS}/record-123/../compare",
            f"{MCP_RECORDS}/..",
            f"{MCP_RECORDS}/../record-123",
            f"{MCP_RECORDS}/record-123/..",
            f"{MCP_RECORDS}/record-123/../compare",
        )

        for path in unsafe_paths:
            with self.subTest(path=path):
                with self.assertRaisesRegex(AssertionError, "unsafe path parameter"):
                    route_template_for(path)

    def test_normalize_fixture_requests_maps_record_compare_aliases(self) -> None:
        bundle = {
            "requests": [
                {
                    "id": "plugin-compare-alias",
                    "route": {"method": "post", "path": f"{PLUGIN_RECORDS}/compare"},
                    "expect": {"status": 200},
                },
                {
                    "id": "plugin-compare-record",
                    "method": "post",
                    "path": f"{PLUGIN_RECORDS}/record-123/compare",
                    "expectedStatus": 200,
                },
                {
                    "id": "mcp-compare-alias",
                    "route": {"method": "post", "path": f"{MCP_RECORDS}/compare"},
                    "expect": {"status": 200},
                },
                {
                    "id": "mcp-compare-record",
                    "method": "post",
                    "path": f"{MCP_RECORDS}/record-123/compare",
                    "expectedStatus": 200,
                },
            ]
        }

        normalized = normalize_fixture_requests(bundle)

        self.assertEqual(
            {
                request.request_id: (request.method, request.route_template)
                for request in normalized
            },
            {
                "plugin-compare-alias": (
                    "POST",
                    f"{PLUGIN_RECORDS}/{{recordId}}/compare",
                ),
                "plugin-compare-record": (
                    "POST",
                    f"{PLUGIN_RECORDS}/{{recordId}}/compare",
                ),
                "mcp-compare-alias": ("POST", f"{MCP_RECORDS}/{{recordId}}/compare"),
                "mcp-compare-record": ("POST", f"{MCP_RECORDS}/{{recordId}}/compare"),
            },
        )


def assert_sensitive_value_rejected(
    testcase: unittest.TestCase,
    value: str,
) -> None:
    with testcase.assertRaises(AssertionError):
        assert_no_private_markers_raw_paths_or_raw_secrets(strict_testcase(), value)


def strict_testcase() -> unittest.TestCase:
    testcase = unittest.TestCase(methodName="run")
    testcase.subTest = lambda *args, **kwargs: nullcontext()
    return testcase


if __name__ == "__main__":
    unittest.main()
