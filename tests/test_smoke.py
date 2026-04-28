from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import smoke


class SmokeToolCheckTests(unittest.TestCase):
    def test_optional_tool_check_skips_missing_tool(self) -> None:
        with patch.object(smoke, "optional_tool", return_value=None), patch.object(smoke, "run") as run:
            checked = smoke.run_optional_tool_check("pnpm", ["-r", "--if-present", "check"], cwd=Path("."))

        self.assertFalse(checked)
        run.assert_not_called()

    def test_optional_tool_check_runs_found_tool_as_required(self) -> None:
        cwd = Path(".")
        with patch.object(smoke, "optional_tool", return_value="pnpm.cmd"), patch.object(smoke, "run", return_value=True) as run:
            checked = smoke.run_optional_tool_check("pnpm", ["-r", "--if-present", "check"], cwd=cwd)

        self.assertTrue(checked)
        run.assert_called_once_with(["pnpm.cmd", "-r", "--if-present", "check"], cwd=cwd)


if __name__ == "__main__":
    unittest.main()
