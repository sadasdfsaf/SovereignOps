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


class McpGatewayFixtureTests(unittest.TestCase):
    def test_checked_in_fixtures_are_valid(self) -> None:
        report = validate_mcp_gateway_fixtures(DEFAULT_FIXTURE_ROOT)

        self.assertTrue(report.ok, "\n".join(report.issues))

    def test_cli_accepts_default_fixture_root(self) -> None:
        self.assertEqual(main([str(DEFAULT_FIXTURE_ROOT)]), 0)

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


if __name__ == "__main__":
    unittest.main()
