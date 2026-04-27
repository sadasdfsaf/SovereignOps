from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NODE_TEST = Path("tests") / "node_lifecycle_bridge.test.mjs"


class NodeLifecycleBridgeTests(unittest.TestCase):
    def test_node_lifecycle_bridge(self) -> None:
        try:
            completed = subprocess.run(
                ["node", str(NODE_TEST)],
                cwd=ROOT,
                text=True,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                check=False,
            )
        except FileNotFoundError as exc:
            self.fail(f"node executable was not found: {exc}")

        if completed.returncode != 0:
            self.fail(
                "node lifecycle bridge test failed with exit code "
                f"{completed.returncode}\n{_format_output(completed)}"
            )


def _format_output(completed: subprocess.CompletedProcess[str]) -> str:
    parts = []
    if completed.stdout:
        parts.append(f"stdout:\n{completed.stdout.rstrip()}")
    if completed.stderr:
        parts.append(f"stderr:\n{completed.stderr.rstrip()}")
    return "\n\n".join(parts) if parts else "node produced no output"


if __name__ == "__main__":
    unittest.main()
