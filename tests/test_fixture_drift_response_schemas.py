from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "fixture_drift.py"
OPENAPI = ROOT / "docs" / "openapi.yaml"
PLUGIN_PREVIEW_FIXTURE = (
    "examples/plugins/release-notes/review-artifact-api-requests.json"
)


EXPECTED_ROUTE_REFS = {
    ("POST", "/v1/plugins/review-artifacts/preview"): {
        "200": ["#/components/schemas/PluginReviewArtifactPreviewResponse"],
    },
    ("POST", "/v1/plugins/review-artifacts/records"): {
        "201": ["#/components/schemas/PluginReviewArtifactRecordCreateResponse"],
    },
    ("GET", "/v1/plugins/review-artifacts/records"): {
        "200": ["#/components/schemas/PluginReviewArtifactRecordListResponse"],
    },
    ("GET", "/v1/plugins/review-artifacts/records/{recordId}"): {
        "200": ["#/components/schemas/PluginReviewArtifactRecordGetResponse"],
    },
    ("POST", "/v1/plugins/review-artifacts/records/{recordId}/compare"): {
        "200": ["#/components/schemas/PluginReviewArtifactRecordCompareResponse"],
    },
    ("POST", "/v1/mcp/approval-evidence/preview"): {
        "200": ["#/components/schemas/McpApprovalEvidencePreviewResponse"],
    },
    ("POST", "/v1/mcp/approval-evidence/records"): {
        "201": ["#/components/schemas/McpApprovalEvidenceRecordCreateResponse"],
    },
    ("GET", "/v1/mcp/approval-evidence/records"): {
        "200": ["#/components/schemas/McpApprovalEvidenceRecordListResponse"],
    },
    ("GET", "/v1/mcp/approval-evidence/records/{recordId}"): {
        "200": ["#/components/schemas/McpApprovalEvidenceRecordGetResponse"],
    },
    ("POST", "/v1/mcp/approval-evidence/records/{recordId}/compare"): {
        "200": ["#/components/schemas/McpApprovalEvidenceRecordCompareResponse"],
    },
}


class FixtureDriftResponseSchemaTests(unittest.TestCase):
    maxDiff = None

    def test_success_response_schema_refs_appear_in_default_summary(self) -> None:
        result = run_cli("--json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        routes = {
            (route["method"], route["path"]): route["successResponseSchemaRefs"]
            for route in payload["routes"]
        }

        self.assertEqual(routes, EXPECTED_ROUTE_REFS)
        for fixture in payload["fixtures"]:
            self.assertTrue(fixture["routes"])
            for route in fixture["routes"]:
                route_key = (route["method"], route["path"])
                self.assertEqual(
                    route["successResponseSchemaRefs"],
                    EXPECTED_ROUTE_REFS[route_key],
                )

    def test_missing_expected_success_response_schema_ref_fails_json(self) -> None:
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            temp_openapi = Path(tmp) / "openapi.yaml"
            temp_openapi.write_text(
                replace_in_openapi_path(
                    OPENAPI.read_text(encoding="utf-8"),
                    "/v1/plugins/review-artifacts/preview",
                    '$ref: "#/components/schemas/PluginReviewArtifactPreviewResponse"',
                    '$ref: "#/components/schemas/PluginReviewArtifactPreviewEnvelope"',
                ),
                encoding="utf-8",
            )

            result = run_cli(
                "--json",
                "--openapi",
                str(temp_openapi),
                "--fixture",
                PLUGIN_PREVIEW_FIXTURE,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        error = json.loads(result.stderr)
        self.assertEqual(error["kind"], "fixture-drift.error")
        self.assertEqual(error["schemaVersion"], "fixture-drift.v1")
        self.assertEqual(error["error"]["code"], "fixture_drift_failed")
        self.assertIn(
            "missing response schema PluginReviewArtifactPreviewResponse",
            error["error"]["message"],
        )

    def test_error_responses_allow_explicit_status_or_default_only(self) -> None:
        for responses in (
            '        "400":\n          $ref: "#/components/responses/Error"',
            '        default:\n          $ref: "#/components/responses/Error"',
        ):
            with self.subTest(responses=responses.splitlines()[0].strip()):
                with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
                    temp_dir = Path(tmp)
                    temp_openapi = temp_dir / "openapi.yaml"
                    temp_fixture = temp_dir / "error-fixture.json"
                    temp_openapi.write_text(
                        error_only_openapi(responses),
                        encoding="utf-8",
                    )
                    temp_fixture.write_text(
                        json.dumps(error_only_fixture(), indent=2, sort_keys=True),
                        encoding="utf-8",
                    )

                    result = run_cli(
                        "--json",
                        "--openapi",
                        str(temp_openapi),
                        "--fixture",
                        str(temp_fixture),
                    )

                self.assertEqual(result.returncode, 0, result.stderr)
                payload = json.loads(result.stdout)
                self.assertEqual(payload["statuses"], {"400": 1})
                self.assertNotIn(
                    "successResponseSchemaRefs",
                    payload["routes"][0],
                )


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def replace_in_openapi_path(text: str, route: str, old: str, new: str) -> str:
    lines = text.splitlines()
    start, end = openapi_path_range(lines, route)
    block = "\n".join(lines[start:end])
    if old not in block:
        raise AssertionError(f"{route} block does not contain {old}")
    lines[start:end] = block.replace(old, new, 1).splitlines()
    return "\n".join(lines) + "\n"


def openapi_path_range(lines: list[str], route: str) -> tuple[int, int]:
    target = f"  {route}:"
    start = lines.index(target)
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if lines[index].startswith("  /") or lines[index] == "components:":
            end = index
            break
    return start, end


def error_only_openapi(responses: str) -> str:
    return (
        "openapi: 3.1.0\n"
        "paths:\n"
        "  /v1/plugins/review-artifacts/preview:\n"
        "    post:\n"
        "      responses:\n"
        f"{responses}\n"
    )


def error_only_fixture() -> dict[str, object]:
    return {
        "requests": [
            {
                "id": "preview-error",
                "route": {
                    "method": "POST",
                    "path": "/v1/plugins/review-artifacts/preview",
                },
                "expect": {
                    "status": 400,
                },
            },
        ],
    }


if __name__ == "__main__":
    unittest.main()
