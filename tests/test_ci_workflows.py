from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_DIR = ROOT / ".github" / "workflows"
WORKFLOWS = {
    "smoke.yml": {
        "name": "smoke",
        "commands": [
            "python scripts/smoke.py",
            "python -m unittest tests.test_ci_workflows",
        ],
    },
    "node.yml": {
        "name": "node",
        "commands": [
            "node scripts/node-check.mjs",
            "pnpm -r --if-present check",
        ],
    },
    "python.yml": {
        "name": "python",
        "commands": [
            "python -m unittest discover -s tests",
            "python scripts/env_guard.py",
            "python scripts/repo_health.py --json",
            "python scripts/validate_openapi.py",
        ],
    },
    "typescript.yml": {
        "name": "typescript",
        "commands": [
            "corepack enable",
            "pnpm install --frozen-lockfile",
            "pnpm run typescript:check",
            "pnpm -r --if-present check",
        ],
    },
    "rust.yml": {
        "name": "rust",
        "commands": [
            "python scripts/rust_guard.py",
            "cargo fmt --all -- --check",
            "cargo check --workspace",
            "cargo clippy --workspace --all-targets -- -D warnings",
            "cargo test --workspace",
        ],
    },
}


def workflow_text(filename: str) -> str:
    return (WORKFLOW_DIR / filename).read_text(encoding="utf-8")


def top_level_block(text: str, key: str) -> str:
    pattern = re.compile(rf"^{re.escape(key)}:\n(?P<body>(?:^[ \t]+.*\n?)+)", re.MULTILINE)
    match = pattern.search(text)
    if not match:
        return ""
    return match.group("body")


def run_commands(text: str) -> list[str]:
    commands: list[str] = []
    lines = text.splitlines()
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("- run: "):
            commands.append(stripped.removeprefix("- run: ").strip())
            continue
        if stripped == "run: |":
            block_lines: list[str] = []
            base_indent = len(line) - len(line.lstrip())
            for block_line in lines[index + 1 :]:
                if not block_line.strip():
                    block_lines.append("")
                    continue
                indent = len(block_line) - len(block_line.lstrip())
                if indent <= base_indent:
                    break
                block_lines.append(block_line.strip())
            commands.append("\n".join(block_lines))
    return commands


def expected_ref(parts: tuple[str, ...]) -> str:
    return "".join(parts)


class CIWorkflowTests(unittest.TestCase):
    def test_workflows_have_expected_names_and_triggers(self) -> None:
        for filename, expected in WORKFLOWS.items():
            with self.subTest(filename=filename):
                text = workflow_text(filename)
                self.assertRegex(
                    text,
                    rf"(?m)^name:\s+{re.escape(expected['name'])}$",
                    msg=f"{filename} should declare the expected workflow name",
                )
                on_block = top_level_block(text, "on")
                self.assertIn("pull_request:", on_block)
                self.assertIn("push:", on_block)
                self.assertIn("branches: [main]", on_block)

    def test_workflows_call_expected_local_commands(self) -> None:
        for filename, expected in WORKFLOWS.items():
            with self.subTest(filename=filename):
                rendered_commands = "\n".join(run_commands(workflow_text(filename)))
                for command in expected["commands"]:
                    self.assertIn(command, rendered_commands)

    def test_optional_tool_workflows_skip_cleanly(self) -> None:
        node_text = workflow_text("node.yml")
        typescript_text = workflow_text("typescript.yml")
        rust_text = workflow_text("rust.yml")

        self.assertIn("command -v pnpm", node_text)
        self.assertIn("pnpm not installed; skipping workspace checks", node_text)
        self.assertIn("pnpm install --frozen-lockfile", typescript_text)
        self.assertIn("pnpm run typescript:check", typescript_text)
        self.assertIn("command -v cargo", rust_text)
        self.assertIn("cargo not installed; skipping Cargo checks", rust_text)
        self.assertIn("rustfmt not installed; skipping format check", rust_text)
        self.assertIn("cargo-clippy not installed; skipping lint check", rust_text)

    def test_workflows_do_not_reference_non_repo_plan_material(self) -> None:
        blocked_refs = [
            expected_ref(("sovereignops", "-codex", "-pack")),
            expected_ref(("codex", "-pack")),
            expected_ref((".codex", "-private")),
            expected_ref(("CODEX", "_START", "_HERE")).lower(),
            expected_ref(("PLAN", "S.md")).lower(),
            expected_ref(("tasks", "/", "backlog")).lower(),
        ]
        for path in sorted(WORKFLOW_DIR.glob("*.yml")):
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8").lower()
                for ref in blocked_refs:
                    self.assertNotIn(ref.lower(), text)


if __name__ == "__main__":
    unittest.main()
