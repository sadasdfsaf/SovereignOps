from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts import status_dashboard


class FakeHealthReport:
    ok = True
    missing_paths: list[str] = []
    commands = {"node": True, "python": True, "pnpm": False}
    public_content_warnings: list[str] = []


class FakeRepoHealth:
    @staticmethod
    def collect_report(_: Path) -> FakeHealthReport:
        return FakeHealthReport()


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def make_dashboard_root(root: Path) -> None:
    write_json(
        root / "package.json",
        {
            "name": "@example/root",
            "private": True,
            "scripts": {"test": "python -m unittest", "status": "python scripts/status_dashboard.py"},
            "version": "1.0.0",
            "workspaces": ["packages/*", "services/api", "missing/*"],
        },
    )
    write_json(
        root / "packages" / "alpha" / "package.json",
        {
            "name": "@example/alpha",
            "private": False,
            "scripts": {"build": "node build.mjs", "test": "node test.mjs"},
            "version": "1.1.0",
        },
    )
    write_json(
        root / "services" / "api" / "package.json",
        {
            "name": "@example/api",
            "private": True,
            "scripts": {"check": "node check.mjs"},
            "version": "2.0.0",
        },
    )
    (root / "docs").mkdir()
    (root / "docs" / "openapi.yaml").write_text(
        "\n".join(
            [
                "openapi: 3.1.0",
                "info:",
                "  title: Local API",
                "  version: 2.0.0",
                "paths:",
                "  /health:",
                "    get:",
                "      operationId: getHealth",
                "  /records:",
                "    get:",
                "      operationId: listRecords",
                "    post:",
                "      operationId: createRecord",
                "",
            ]
        ),
        encoding="utf-8",
    )
    (root / ".github" / "workflows").mkdir(parents=True)
    (root / ".github" / "workflows" / "ci.yml").write_text(
        "\n".join(
            [
                "name: ci",
                "on: [push, pull_request]",
                "jobs:",
                "  test:",
                "    runs-on: ubuntu-latest",
                "  lint:",
                "    runs-on: ubuntu-latest",
                "",
            ]
        ),
        encoding="utf-8",
    )


class StatusDashboardTests(unittest.TestCase):
    def test_collect_dashboard_summarizes_repo_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_dashboard_root(root)

            dashboard = status_dashboard.collect_dashboard(root, repo_health_module=FakeRepoHealth)

        self.assertEqual(dashboard.root_package.name, "@example/root")
        self.assertEqual(dashboard.workspace_patterns, ["packages/*", "services/api", "missing/*"])
        self.assertEqual(dashboard.unmatched_workspace_patterns, ["missing/*"])
        self.assertEqual(
            [package.path for package in dashboard.workspace_packages],
            ["packages/alpha", "services/api"],
        )
        self.assertEqual(dashboard.openapi.path, "docs/openapi.yaml")
        self.assertEqual(dashboard.openapi.title, "Local API")
        self.assertEqual(dashboard.openapi.path_count, 2)
        self.assertEqual(dashboard.openapi.operation_count, 3)
        self.assertEqual(dashboard.workflows[0].triggers, ["push", "pull_request"])
        self.assertEqual(dashboard.workflows[0].jobs, ["test", "lint"])
        self.assertTrue(dashboard.repo_health.ok)

    def test_markdown_render_is_deterministic_and_lists_sections(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_dashboard_root(root)
            dashboard = status_dashboard.collect_dashboard(root, repo_health_module=FakeRepoHealth)

        first = status_dashboard.render_markdown(dashboard)
        second = status_dashboard.render_markdown(dashboard)

        self.assertEqual(first, second)
        self.assertIn("# Repository Status Dashboard", first)
        self.assertIn("| packages/alpha | @example/alpha | 1.1.0 | no | build, test |", first)
        self.assertIn("- Paths: 2", first)
        self.assertIn("| .github/workflows/ci.yml | ci | push, pull_request | test, lint |", first)

    def test_json_render_is_machine_readable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_dashboard_root(root)
            dashboard = status_dashboard.collect_dashboard(root, repo_health_module=FakeRepoHealth)

        parsed = json.loads(status_dashboard.render_json(dashboard))

        self.assertEqual(parsed["root_package"]["name"], "@example/root")
        self.assertEqual(parsed["workspace_packages"][0]["scripts"], ["build", "test"])
        self.assertEqual(parsed["repo_health"]["commands"]["pnpm"], False)

    def test_missing_optional_inputs_are_reported_without_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_json(root / "package.json", {"name": "@example/root", "version": "1.0.0"})

            dashboard = status_dashboard.collect_dashboard(root, repo_health_module=None)
            markdown = status_dashboard.render_markdown(dashboard)

        self.assertEqual(dashboard.workspace_packages, [])
        self.assertFalse(dashboard.openapi.present)
        self.assertEqual(dashboard.workflows, [])
        self.assertIn("- No workspace packages found.", markdown)
        self.assertIn("- No docs/openapi file found.", markdown)
        self.assertIn("- Status: unavailable", markdown)

    def test_cli_writes_json_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_dashboard_root(root)
            output = root / "status.json"

            exit_code = status_dashboard.main(
                ["--root", str(root), "--json", "--output", "status.json"],
                repo_health_module=FakeRepoHealth,
            )

            parsed = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual(exit_code, 0)
        self.assertEqual(parsed["openapi"]["operation_count"], 3)


if __name__ == "__main__":
    unittest.main()
