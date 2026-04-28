#!/usr/bin/env python3
from __future__ import annotations

import argparse
import compileall
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_MARKERS = ["README.md", "LICENSE", "CONTRIBUTING.md", "AGENTS.md"]


def run(command: list[str], *, cwd: Path, required: bool = True) -> bool:
    print(f"$ {' '.join(command)}")
    completed = subprocess.run(command, cwd=str(cwd), check=False)
    if completed.returncode != 0 and required:
        raise SystemExit(completed.returncode)
    return completed.returncode == 0


def require_paths(root: Path) -> None:
    missing = [path for path in ROOT_MARKERS if not (root / path).exists()]
    if missing:
        raise SystemExit(f"Missing required bootstrap files: {', '.join(missing)}")


def optional_tool(name: str) -> str | None:
    path = shutil.which(name)
    if not path:
        print(f"{name} not installed; skipping related check")
    return path


def run_optional_tool_check(tool: str, args: list[str], *, cwd: Path) -> bool:
    executable = optional_tool(tool)
    if executable is None:
        return False
    run([executable, *args], cwd=cwd)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Run cross-platform SovereignOps smoke checks.")
    parser.add_argument("--root", default=".", help="Repository root.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    print("== SovereignOps smoke check ==")
    require_paths(root)

    run([sys.executable, "scripts/loc_budget.py", "--summary"], cwd=root)
    run([sys.executable, "scripts/repo_health.py", "--json"], cwd=root)
    run([sys.executable, "scripts/public_boundary_guard.py", "--json"], cwd=root)
    run([sys.executable, "scripts/env_guard.py"], cwd=root)
    run([sys.executable, "scripts/rust_guard.py"], cwd=root)
    run([sys.executable, "scripts/validate_openapi.py"], cwd=root)
    run([sys.executable, "scripts/validate_mcp_gateway_fixtures.py"], cwd=root)
    run([sys.executable, "-m", "unittest", "discover", "-s", "services/ingest/tests"], cwd=root)

    source_dirs = [root / "scripts", root / "services" / "ingest" / "src"]
    for source_dir in source_dirs:
        if source_dir.exists():
            ok = compileall.compile_dir(str(source_dir), quiet=1)
            if not ok:
                raise SystemExit(f"Python compile check failed for {source_dir}")

    run_optional_tool_check("cargo", ["check", "--workspace"], cwd=root)
    run_optional_tool_check("node", ["scripts/node-check.mjs"], cwd=root)
    run_optional_tool_check("pnpm", ["-r", "--if-present", "check"], cwd=root)

    print("Smoke check completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
