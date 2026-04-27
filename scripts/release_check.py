#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from shutil import which
from typing import Optional

PYTHON = "{python}"


@dataclass(frozen=True)
class CheckSpec:
    name: str
    description: str
    command: tuple[str, ...]
    required_paths: tuple[str, ...] = ()
    tool_candidates: tuple[str, ...] = ()


@dataclass(frozen=True)
class DiscoveredCheck:
    spec: CheckSpec
    command: tuple[str, ...]
    missing_paths: tuple[str, ...]
    missing_tool: str | None

    @property
    def available(self) -> bool:
        return not self.missing_paths and self.missing_tool is None

    @property
    def skip_reason(self) -> str:
        if self.missing_paths:
            return "missing path(s): " + ", ".join(self.missing_paths)
        if self.missing_tool is not None:
            return f"missing tool: {self.missing_tool}"
        return ""


CHECK_SPECS: tuple[CheckSpec, ...] = (
    CheckSpec(
        name="loc-budget",
        description="Summarize effective handwritten source size.",
        command=(PYTHON, "scripts/loc_budget.py", "--summary"),
        required_paths=("scripts/loc_budget.py",),
    ),
    CheckSpec(
        name="repo-health",
        description="Validate bootstrap files and content guardrails.",
        command=(PYTHON, "scripts/repo_health.py", "--json"),
        required_paths=(
            "scripts/repo_health.py",
            "docs/local-data-lifecycle.md",
            "docs/security-checklist.md",
            "docs/dependency-review.md",
            "docs/fuzzing.md",
        ),
    ),
    CheckSpec(
        name="env-guard",
        description="Check example environment files for secret-shaped values.",
        command=(PYTHON, "scripts/env_guard.py"),
        required_paths=("scripts/env_guard.py",),
    ),
    CheckSpec(
        name="rust-source-guard",
        description="Run lightweight Rust source checks without requiring Cargo.",
        command=(PYTHON, "scripts/rust_guard.py"),
        required_paths=("scripts/rust_guard.py",),
    ),
    CheckSpec(
        name="openapi-contract",
        description="Validate the checked-in OpenAPI contract.",
        command=(PYTHON, "scripts/validate_openapi.py"),
        required_paths=("scripts/validate_openapi.py", "docs/openapi.yaml"),
    ),
    CheckSpec(
        name="python-tests",
        description="Run repository Python unit tests.",
        command=(PYTHON, "-m", "unittest", "discover", "-s", "tests"),
        required_paths=("tests",),
    ),
    CheckSpec(
        name="node-package-baseline",
        description="Validate root Node package metadata and scripts.",
        command=("node", "scripts/node-check.mjs"),
        required_paths=("package.json", "scripts/node-check.mjs"),
        tool_candidates=("node",),
    ),
    CheckSpec(
        name="npm-workspace-check",
        description="Run workspace package checks with npm when it is installed.",
        command=("npm", "run", "check", "--workspaces", "--if-present"),
        required_paths=("package.json",),
        tool_candidates=("npm", "npm.cmd"),
    ),
    CheckSpec(
        name="cargo-check",
        description="Run Rust workspace type and lint checks when Cargo is installed.",
        command=("cargo", "check", "--workspace"),
        required_paths=("Cargo.toml",),
        tool_candidates=("cargo",),
    ),
    CheckSpec(
        name="pnpm-workspace-check",
        description="Run workspace package checks when pnpm is installed.",
        command=("pnpm", "-r", "--if-present", "check"),
        required_paths=("package.json", "pnpm-workspace.yaml"),
        tool_candidates=("pnpm",),
    ),
)


ToolResolver = Callable[[str], Optional[str]]
Runner = Callable[..., subprocess.CompletedProcess]


def _resolve_command(command: Sequence[str]) -> tuple[str, ...]:
    return tuple(sys.executable if part == PYTHON else part for part in command)


def _display_command(command: Sequence[str]) -> str:
    display = ("python" if part == sys.executable else part for part in command)
    return " ".join(display)


def discover_checks(root: Path, tool_resolver: ToolResolver = which) -> list[DiscoveredCheck]:
    checks: list[DiscoveredCheck] = []
    for spec in CHECK_SPECS:
        missing_paths = tuple(path for path in spec.required_paths if not (root / path).exists())
        missing_tool = None
        resolved_tool = None
        if spec.tool_candidates:
            resolved_tool = next(
                (resolved for candidate in spec.tool_candidates if (resolved := tool_resolver(candidate))),
                None,
            )
            if resolved_tool is None:
                missing_tool = spec.tool_candidates[0]
        command = _resolve_command(spec.command)
        if resolved_tool is not None and command[0] in spec.tool_candidates:
            command = (resolved_tool, *command[1:])
        checks.append(
            DiscoveredCheck(
                spec=spec,
                command=command,
                missing_paths=missing_paths,
                missing_tool=missing_tool,
            )
        )
    return checks


def render_list(checks: Sequence[DiscoveredCheck]) -> str:
    lines = ["Release checks:"]
    for check in checks:
        status = "available" if check.available else f"unavailable ({check.skip_reason})"
        lines.append(f"- {check.spec.name}: {status}")
        lines.append(f"  command: {_display_command(check.command)}")
        lines.append(f"  purpose: {check.spec.description}")
    return "\n".join(lines) + "\n"


def render_dry_run(checks: Sequence[DiscoveredCheck]) -> str:
    lines = ["Release check dry run:"]
    for check in checks:
        if check.available:
            lines.append(f"RUN {check.spec.name}: {_display_command(check.command)}")
        else:
            lines.append(f"SKIP {check.spec.name}: {check.skip_reason}")
    return "\n".join(lines) + "\n"


def run_checks(
    checks: Sequence[DiscoveredCheck],
    *,
    root: Path,
    runner: Runner = subprocess.run,
) -> int:
    failed = False
    for check in checks:
        if not check.available:
            print(f"[skip] {check.spec.name}: {check.skip_reason}", flush=True)
            if check.missing_paths:
                failed = True
            continue

        print(f"[run] {check.spec.name}", flush=True)
        print(f"$ {_display_command(check.command)}", flush=True)
        completed = runner(check.command, cwd=str(root), check=False)
        if completed.returncode != 0:
            print(f"[fail] {check.spec.name}: exit {completed.returncode}", flush=True)
            failed = True
    return 1 if failed else 0


def main(
    argv: Sequence[str] | None = None,
    *,
    tool_resolver: ToolResolver = which,
    runner: Runner = subprocess.run,
) -> int:
    parser = argparse.ArgumentParser(description="Discover and run release readiness checks.")
    parser.add_argument("--root", default=".", help="Repository root.")
    parser.add_argument("--list", action="store_true", help="List discovered checks without running them.")
    parser.add_argument("--dry-run", action="store_true", help="Show runnable commands without running them.")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    checks = discover_checks(root, tool_resolver)

    if args.list:
        print(render_list(checks), end="")
        return 0
    if args.dry_run:
        print(render_dry_run(checks), end="")
        return 0

    print("== SovereignOps release checks ==", flush=True)
    return run_checks(checks, root=root, runner=runner)


if __name__ == "__main__":
    raise SystemExit(main())
