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
PREVIEW_FIXTURE = (
    "examples/plugins/release-notes/review-artifact-api-requests.json"
)
MCP_PREVIEW_FIXTURE = "examples/mcp/approval-evidence-preview-requests.json"


class FixtureDriftCliTests(unittest.TestCase):
    maxDiff = None

    def test_default_json_summary_verifies_public_fixture_bundles(self) -> None:
        result = run_cli("--json")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        payload = json.loads(result.stdout)
        self.assertEqual(payload["kind"], "fixture-drift.summary")
        self.assertEqual(payload["schemaVersion"], "fixture-drift.v1")
        self.assertEqual(payload["totalFixtures"], 4)
        self.assertGreaterEqual(payload["totalRequests"], 10)
        self.assertEqual(
            {fixture["path"] for fixture in payload["fixtures"]},
            {
                PREVIEW_FIXTURE,
                "examples/plugins/release-notes/review-artifact-records-requests.json",
                MCP_PREVIEW_FIXTURE,
                "examples/mcp/approval-evidence-records-requests.json",
            },
        )
        self.assertIn("GET", payload["methods"])
        self.assertIn("POST", payload["methods"])
        self.assertIn("200", payload["statuses"])
        self.assertIn("201", payload["statuses"])
        self.assertTrue(payload["routes"])

    def test_subset_fixture_verification(self) -> None:
        result = run_cli("--json", "--fixture", PREVIEW_FIXTURE)

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["totalFixtures"], 1)
        self.assertEqual(payload["fixtures"][0]["path"], PREVIEW_FIXTURE)
        self.assertGreaterEqual(payload["fixtures"][0]["totalRequests"], 1)
        self.assertEqual(payload["routes"][0]["path"], "/v1/plugins/review-artifacts/preview")
        self.assertEqual(payload["methods"], {"POST": payload["totalRequests"]})

    def test_missing_openapi_route_fails_with_json_error(self) -> None:
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            temp_openapi = Path(tmp) / "openapi.yaml"
            temp_openapi.write_text(
                remove_openapi_path(
                    OPENAPI.read_text(encoding="utf-8"),
                    "/v1/mcp/approval-evidence/preview",
                ),
                encoding="utf-8",
            )

            result = run_cli(
                "--json",
                "--openapi",
                str(temp_openapi),
                "--fixture",
                MCP_PREVIEW_FIXTURE,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        error = json.loads(result.stderr)
        self.assertEqual(error["kind"], "fixture-drift.error")
        self.assertEqual(error["schemaVersion"], "fixture-drift.v1")
        self.assertEqual(error["error"]["code"], "fixture_drift_failed")
        self.assertIn("missing OpenAPI block", error["error"]["message"])

    def test_unsafe_fixture_path_is_rejected_before_reading(self) -> None:
        unsafe = (
            ".."
            + "/"
            + "".join(("sovereign", "ops", "-codex", "-pack"))
            + "/fixture.json"
        )

        result = run_cli("--json", "--fixture", unsafe)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        error = json.loads(result.stderr)
        self.assertEqual(error["kind"], "fixture-drift.error")
        self.assertEqual(error["error"]["code"], "unsafe_fixture_path")
        self.assertIn("restricted path marker", error["error"]["message"])

    def test_argument_errors_are_json_only(self) -> None:
        result = run_cli("--fixture")

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        error = json.loads(result.stderr)
        self.assertEqual(error["kind"], "fixture-drift.error")
        self.assertEqual(error["schemaVersion"], "fixture-drift.v1")
        self.assertEqual(error["error"]["code"], "invalid_arguments")
        self.assertNotIn("usage:", result.stderr.lower())


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def remove_openapi_path(text: str, route: str) -> str:
    lines = text.splitlines()
    target = f"  {route}:"
    start = lines.index(target)
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if lines[index].startswith("  /"):
            end = index
            break
    del lines[start:end]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    unittest.main()
