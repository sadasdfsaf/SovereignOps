from __future__ import annotations

import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from scripts import release_check


def make_release_root(root: Path) -> None:
    (root / ".git").mkdir()
    (root / "scripts").mkdir()
    (root / "docs").mkdir()
    (root / "examples" / "mcp-gateway").mkdir(parents=True)
    (root / "tests").mkdir()
    for path in (
        "scripts/loc_budget.py",
        "scripts/repo_health.py",
        "scripts/env_guard.py",
        "scripts/rust_guard.py",
        "scripts/validate_openapi.py",
        "scripts/validate_mcp_gateway_fixtures.py",
        "scripts/node-check.mjs",
        "docs/openapi.yaml",
        "docs/local-data-lifecycle.md",
        "docs/maintainership.md",
        "docs/security-checklist.md",
        "docs/dependency-review.md",
        "docs/fuzzing.md",
        "scripts/loc_integrity.py",
        "scripts/release_notes.py",
        "examples/mcp-gateway/resources.json",
        "examples/mcp-gateway/tools.json",
        "examples/mcp-gateway/approval-sessions.json",
        "examples/mcp-gateway/api-requests.json",
        "package.json",
        "pnpm-workspace.yaml",
        "Cargo.toml",
    ):
        (root / path).write_text("placeholder\n", encoding="utf-8")


class ReleaseCheckTests(unittest.TestCase):
    def test_command_discovery_marks_available_tools(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_release_root(root)
            available = {"node": "node-bin", "npm": "npm-bin", "cargo": "cargo-bin"}

            checks = release_check.discover_checks(root, available.get)

        by_name = {check.spec.name: check for check in checks}
        self.assertTrue(by_name["python-tests"].available)
        self.assertTrue(by_name["node-package-baseline"].available)
        self.assertTrue(by_name["npm-workspace-check"].available)
        self.assertTrue(by_name["cargo-check"].available)
        self.assertFalse(by_name["pnpm-workspace-check"].available)
        self.assertEqual(by_name["pnpm-workspace-check"].missing_tool, "pnpm")

    def test_list_reports_commands_without_running_subprocesses(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_release_root(root)
            calls: list[tuple[str, ...]] = []

            def runner(command: tuple[str, ...], **_: object) -> subprocess.CompletedProcess[object]:
                calls.append(command)
                return subprocess.CompletedProcess(command, 0)

            output = StringIO()
            with redirect_stdout(output):
                exit_code = release_check.main(
                    ["--root", str(root), "--list"],
                    tool_resolver=lambda _: None,
                    runner=runner,
                )

        self.assertEqual(exit_code, 0)
        self.assertEqual(calls, [])
        self.assertIn("Release checks:", output.getvalue())
        self.assertIn("pnpm-workspace-check: unavailable (missing tool: pnpm)", output.getvalue())

    def test_dry_run_outputs_commands_without_running_subprocesses(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_release_root(root)
            calls: list[tuple[str, ...]] = []

            def runner(command: tuple[str, ...], **_: object) -> subprocess.CompletedProcess[object]:
                calls.append(command)
                return subprocess.CompletedProcess(command, 0)

            output = StringIO()
            with redirect_stdout(output):
                exit_code = release_check.main(
                    ["--root", str(root), "--dry-run"],
                    tool_resolver=lambda _: None,
                    runner=runner,
                )

        self.assertEqual(exit_code, 0)
        self.assertEqual(calls, [])
        self.assertIn("RUN python-tests: python -m unittest discover -s tests", output.getvalue())
        self.assertIn("RUN loc-integrity: python scripts/loc_integrity.py", output.getvalue())
        self.assertIn("SKIP release-notes-smoke:", output.getvalue())
        self.assertIn("SKIP cargo-check: missing tool: cargo", output.getvalue())

    def test_missing_tools_are_skipped_when_running_available_checks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_release_root(root)
            calls: list[tuple[str, ...]] = []

            def runner(command: tuple[str, ...], **_: object) -> subprocess.CompletedProcess[object]:
                calls.append(command)
                return subprocess.CompletedProcess(command, 0)

            output = StringIO()
            with redirect_stdout(output):
                exit_code = release_check.main(
                    ["--root", str(root)],
                    tool_resolver=lambda _: None,
                    runner=runner,
                )

        called_names = {command[0] for command in calls}
        self.assertEqual(exit_code, 0)
        self.assertNotIn("node", called_names)
        self.assertNotIn("npm", called_names)
        self.assertNotIn("cargo", called_names)
        self.assertNotIn("pnpm", called_names)
        self.assertIn("[skip] node-package-baseline: missing tool: node", output.getvalue())

    def test_security_docs_are_present(self) -> None:
        root = Path(__file__).resolve().parents[1]
        expected = {
            "docs/security-checklist.md": "Release Gate",
            "docs/dependency-review.md": "Dependency Admission",
            "docs/fuzzing.md": "Rust toolchain",
            "docs/maintainership.md": "Release Stewardship",
        }

        for relative_path, required_text in expected.items():
            with self.subTest(path=relative_path):
                text = (root / relative_path).read_text(encoding="utf-8")
                self.assertIn(required_text, text)


if __name__ == "__main__":
    unittest.main()
