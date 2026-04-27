from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts.validate_mcp_gateway_fixtures import (
    DEFAULT_FIXTURE_ROOT,
    main,
    validate_mcp_gateway_fixtures,
)


SAFETY_SAMPLES_PATH = DEFAULT_FIXTURE_ROOT / "safety-samples.json"
RUNTIME_ROUTER_PATH = DEFAULT_FIXTURE_ROOT / "runtime-router.json"


class McpGatewayFixtureTests(unittest.TestCase):
    def test_checked_in_fixtures_are_valid(self) -> None:
        report = validate_mcp_gateway_fixtures(DEFAULT_FIXTURE_ROOT)

        self.assertTrue(report.ok, "\n".join(report.issues))

    def test_cli_accepts_default_fixture_root(self) -> None:
        self.assertEqual(main([str(DEFAULT_FIXTURE_ROOT)]), 0)

    def test_safety_samples_define_marker_vocabulary_and_replay(self) -> None:
        safety_samples = json.loads(SAFETY_SAMPLES_PATH.read_text(encoding="utf-8"))
        markers = safety_samples["markers"]

        self.assertEqual(markers["trust"], "untrusted")
        self.assertEqual(markers["begin"], "<UNTRUSTED_CONTENT>")
        self.assertEqual(markers["end"], "</UNTRUSTED_CONTENT>")
        self.assertEqual(markers["metadataKey"], "trust")
        self.assertEqual(markers["rawContentArgument"], "rawUntrustedContent")
        self.assertGreaterEqual(len(safety_samples["samples"]), 2)

        commands = "\n".join(safety_samples["replay"]["commands"])
        self.assertIn("scripts\\validate_mcp_gateway_fixtures.py", commands)
        self.assertIn("mcp api replay", commands)
        self.assertIn("examples\\mcp-gateway\\api-requests.json", commands)
        self.assertIn("mcp demo tool", commands)
        self.assertIn("createMcpGatewayRuntime", commands)

        for sample in safety_samples["samples"]:
            with self.subTest(sample=sample["id"]):
                content = sample["content"].strip()
                self.assertTrue(content.startswith(markers["begin"]))
                self.assertTrue(content.endswith(markers["end"]))
                self.assertEqual(sample["source"]["trust"], markers["trust"])
                self.assertEqual(sample["toolRequest"]["metadata"]["trust"], markers["trust"])
                self.assertEqual(
                    sample["toolRequest"]["arguments"][markers["rawContentArgument"]],
                    sample["content"],
                )

    def test_runtime_router_fixture_defines_replayable_route_steps(self) -> None:
        fixture = json.loads(RUNTIME_ROUTER_PATH.read_text(encoding="utf-8"))
        requests = {example["id"]: example for example in fixture["requests"]}

        self.assertEqual(fixture["schemaVersion"], "mcp-runtime-router-fixture.v1")
        self.assertEqual(fixture["mount"], {"basePath": "/v1/mcp", "pathStyle": "openapi"})
        self.assertEqual(
            [example["id"] for example in fixture["requests"]],
            [
                "runtime_resource_list",
                "runtime_resource_read",
                "runtime_tool_call_safety",
                "runtime_approval_create",
                "runtime_approval_list_pending",
                "runtime_approval_decision",
            ],
        )
        self.assertIn(
            "POST /v1/mcp/approval-sessions/:sessionId/decision",
            {f"{route['method']} {route['path']}" for route in fixture["routes"]},
        )

        safety_body = requests["runtime_tool_call_safety"]["response"]["body"]
        self.assertEqual(safety_body["safety"]["trustLevel"], "untrusted")
        self.assertEqual(
            safety_body["structuredContent"]["_safety"]["trustLevel"],
            "untrusted",
        )
        self.assertGreaterEqual(len(safety_body["safety"]["findings"]), 1)

        approval_id = requests["runtime_approval_create"]["response"]["body"]["error"][
            "details"
        ]["approvalId"]
        self.assertEqual(
            requests["runtime_approval_list_pending"]["response"]["body"]["sessions"][0][
                "id"
            ],
            approval_id,
        )
        self.assertEqual(
            requests["runtime_approval_decision"]["request"]["path"],
            f"/v1/mcp/approval-sessions/{approval_id}/decision",
        )

    def test_rejects_duplicate_resource_uri(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            resources_path = root / "resources.json"
            resources = json.loads(resources_path.read_text(encoding="utf-8"))
            resources["resources"][1]["uri"] = resources["resources"][0]["uri"]
            resources_path.write_text(json.dumps(resources, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("duplicates resource uri", "\n".join(report.issues))

    def test_rejects_remote_resource_uri(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            resources_path = root / "resources.json"
            resources = json.loads(resources_path.read_text(encoding="utf-8"))
            resources["resources"][0]["uri"] = "https://example.invalid/resource"
            resources_path.write_text(json.dumps(resources, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("local URI scheme", "\n".join(report.issues))

    def test_rejects_terminal_session_without_resolution_time(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            sessions_path = root / "approval-sessions.json"
            sessions = json.loads(sessions_path.read_text(encoding="utf-8"))
            del sessions["sessions"][1]["resolvedAt"]
            sessions_path.write_text(json.dumps(sessions, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("terminal sessions must include resolvedAt", "\n".join(report.issues))

    def test_rejects_secret_shaped_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            sessions_path = root / "approval-sessions.json"
            sessions = json.loads(sessions_path.read_text(encoding="utf-8"))
            sessions["sessions"][0]["request"]["parameters"]["sample"] = (
                "sk-" + "a" * 24
            )
            sessions_path.write_text(json.dumps(sessions, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("secret-shaped value", "\n".join(report.issues))

    def test_rejects_unknown_api_route_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            api_path = root / "api-requests.json"
            api_requests = json.loads(api_path.read_text(encoding="utf-8"))
            api_requests["requests"][0]["route"]["path"] = "/v1/mcp/remote/resources"
            api_path.write_text(json.dumps(api_requests, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("route must be one of", "\n".join(report.issues))

    def test_rejects_api_id_that_does_not_match_route(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            api_path = root / "api-requests.json"
            api_requests = json.loads(api_path.read_text(encoding="utf-8"))
            api_requests["requests"][0]["id"] = "api_tool_list"
            api_path.write_text(json.dumps(api_requests, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("must be api_resource_list", "\n".join(report.issues))

    def test_rejects_tool_call_arguments_that_do_not_match_schema(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            api_path = root / "api-requests.json"
            api_requests = json.loads(api_path.read_text(encoding="utf-8"))
            del api_requests["requests"][3]["request"]["body"]["arguments"]["workspaceId"]
            api_path.write_text(json.dumps(api_requests, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("required by tool schema", "\n".join(report.issues))

    def test_rejects_approval_decision_for_terminal_session(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            api_path = root / "api-requests.json"
            api_requests = json.loads(api_path.read_text(encoding="utf-8"))
            decision = api_requests["requests"][5]
            decision["request"]["body"]["sessionId"] = "aps_sync_preview_approved"
            decision["response"]["body"]["session"]["id"] = "aps_sync_preview_approved"
            decision["response"]["body"]["session"]["toolName"] = "preview_sync_batch"
            decision["response"]["body"]["session"]["resourceUri"] = "fixture://sync/demo-alpha/preview"
            api_path.write_text(json.dumps(api_requests, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("must reference a pending session", "\n".join(report.issues))

    def test_rejects_non_json_compatible_api_payloads(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            api_path = root / "api-requests.json"
            api_requests = json.loads(api_path.read_text(encoding="utf-8"))
            api_requests["requests"][3]["response"]["body"]["result"]["itemCount"] = float("nan")
            api_path.write_text(json.dumps(api_requests, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("must be JSON-compatible", "\n".join(report.issues))

    def test_rejects_secret_shaped_api_request_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            api_path = root / "api-requests.json"
            api_requests = json.loads(api_path.read_text(encoding="utf-8"))
            api_requests["requests"][3]["request"]["body"]["authorization"] = (
                "Bearer abcdefghijklmnop"
            )
            api_path.write_text(json.dumps(api_requests, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("secret-shaped", "\n".join(report.issues))

    def test_rejects_safety_sample_without_markers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            safety_path = root / "safety-samples.json"
            safety_samples = json.loads(safety_path.read_text(encoding="utf-8"))
            safety_samples["samples"][0]["content"] = "Partner note without markers."
            safety_path.write_text(json.dumps(safety_samples, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("must start with <UNTRUSTED_CONTENT>", "\n".join(report.issues))

    def test_rejects_safety_sample_trust_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            safety_path = root / "safety-samples.json"
            safety_samples = json.loads(safety_path.read_text(encoding="utf-8"))
            safety_samples["samples"][0]["toolRequest"]["metadata"]["trust"] = "trusted"
            safety_path.write_text(json.dumps(safety_samples, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("must be untrusted", "\n".join(report.issues))

    def test_rejects_safety_replay_without_runtime_sdk_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            safety_path = root / "safety-samples.json"
            safety_samples = json.loads(safety_path.read_text(encoding="utf-8"))
            safety_samples["replay"]["commands"] = [
                command
                for command in safety_samples["replay"]["commands"]
                if "createMcpGatewayRuntime" not in command
            ]
            safety_path.write_text(json.dumps(safety_samples, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("must include local runtime SDK use", "\n".join(report.issues))

    def test_rejects_safety_replay_without_api_fixture_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            safety_path = root / "safety-samples.json"
            safety_samples = json.loads(safety_path.read_text(encoding="utf-8"))
            safety_samples["replay"]["commands"] = [
                command
                for command in safety_samples["replay"]["commands"]
                if "mcp api replay" not in command
            ]
            safety_path.write_text(json.dumps(safety_samples, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("must include API fixture replay", "\n".join(report.issues))

    def test_rejects_runtime_router_fixture_without_safety_annotation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            runtime_path = root / "runtime-router.json"
            fixture = json.loads(runtime_path.read_text(encoding="utf-8"))
            del fixture["requests"][2]["response"]["body"]["safety"]
            runtime_path.write_text(json.dumps(fixture, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn(
            "runtime-router.json.requests[2].response.body.safety: must be an object",
            "\n".join(report.issues),
        )

    def test_rejects_runtime_router_fixture_without_approval_creation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mcp-gateway"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            runtime_path = root / "runtime-router.json"
            fixture = json.loads(runtime_path.read_text(encoding="utf-8"))
            fixture["requests"] = [
                example
                for example in fixture["requests"]
                if example["id"] != "runtime_approval_create"
            ]
            runtime_path.write_text(json.dumps(fixture, indent=2), encoding="utf-8")

            report = validate_mcp_gateway_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("missing runtime_approval_create example", "\n".join(report.issues))


if __name__ == "__main__":
    unittest.main()
