#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from json import JSONDecodeError
from pathlib import Path
from typing import Any, Sequence

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

REPO_HEALTH_AUTO = object()
FIXTURE_DRIFT_AUTO = object()
OPENAPI_CANDIDATES = (
    "docs/openapi.yaml",
    "docs/openapi.yml",
    "docs/openapi.json",
)
WORKFLOW_EXTENSIONS = {".yml", ".yaml"}
HTTP_METHODS = {"delete", "get", "head", "options", "patch", "post", "put", "trace"}


@dataclass(frozen=True)
class PackageSummary:
    path: str
    name: str
    version: str
    private: bool
    scripts: list[str]
    issues: list[str]


@dataclass(frozen=True)
class RepoHealthSummary:
    importable: bool
    ok: bool | None
    missing_paths: list[str]
    commands: dict[str, bool]
    public_content_warnings: list[str]
    error: str = ""


@dataclass(frozen=True)
class OpenApiSummary:
    present: bool
    path: str
    openapi: str
    title: str
    version: str
    path_count: int
    operation_count: int
    issues: list[str]


@dataclass(frozen=True)
class FixtureDriftRouteSummary:
    method: str
    path: str
    total_requests: int


@dataclass(frozen=True)
class FixtureDriftSummary:
    available: bool
    ok: bool | None
    total_fixtures: int
    total_requests: int
    total_routes: int
    routes: list[FixtureDriftRouteSummary]
    error: str = ""


@dataclass(frozen=True)
class WorkflowSummary:
    path: str
    name: str
    triggers: list[str]
    jobs: list[str]


@dataclass(frozen=True)
class StatusDashboard:
    root: str
    root_package: PackageSummary | None
    workspace_patterns: list[str]
    unmatched_workspace_patterns: list[str]
    workspace_packages: list[PackageSummary]
    repo_health: RepoHealthSummary
    openapi: OpenApiSummary
    fixture_drift: FixtureDriftSummary
    workflows: list[WorkflowSummary]


def _relative_path(path: Path, root: Path) -> str:
    try:
        relative = path.relative_to(root)
    except ValueError:
        return path.as_posix()
    return relative.as_posix() or "."


def _read_json_object(path: Path) -> tuple[dict[str, Any], str | None]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}, f"missing file: {_relative_path(path, path.parent)}"
    except JSONDecodeError as exc:
        return {}, f"invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"

    if not isinstance(data, dict):
        return {}, "JSON root must be an object"
    return data, None


def package_summary(path: Path, root: Path, metadata: dict[str, Any] | None = None) -> PackageSummary:
    data = metadata
    issues: list[str] = []
    if data is None:
        data, issue = _read_json_object(path)
        if issue:
            issues.append(issue)

    scripts = data.get("scripts", {})
    script_names = sorted(str(name) for name in scripts) if isinstance(scripts, dict) else []
    if "scripts" in data and not isinstance(scripts, dict):
        issues.append("scripts must be an object")

    package_dir = "." if path.name == "package.json" and path.parent == root else _relative_path(path.parent, root)
    return PackageSummary(
        path=package_dir,
        name=str(data.get("name") or ""),
        version=str(data.get("version") or ""),
        private=bool(data.get("private", False)),
        scripts=script_names,
        issues=issues,
    )


def workspace_patterns(root_metadata: dict[str, Any]) -> list[str]:
    raw_workspaces = root_metadata.get("workspaces", [])
    if isinstance(raw_workspaces, list):
        return [str(pattern) for pattern in raw_workspaces]
    if isinstance(raw_workspaces, dict):
        packages = raw_workspaces.get("packages", [])
        if isinstance(packages, list):
            return [str(pattern) for pattern in packages]
    return []


def _is_inside_root(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def _workspace_package_files(root: Path, pattern: str) -> list[Path]:
    files: list[Path] = []
    for match in sorted(root.glob(pattern)):
        if not _is_inside_root(match, root):
            continue
        if match.is_file() and match.name == "package.json":
            files.append(match)
        elif match.is_dir() and (match / "package.json").is_file():
            files.append(match / "package.json")
    return files


def collect_workspace_packages(root: Path, patterns: Sequence[str]) -> tuple[list[PackageSummary], list[str]]:
    packages_by_path: dict[Path, PackageSummary] = {}
    unmatched: list[str] = []
    for pattern in patterns:
        package_files = _workspace_package_files(root, pattern)
        if not package_files:
            unmatched.append(pattern)
            continue
        for package_file in package_files:
            packages_by_path[package_file.resolve()] = package_summary(package_file, root)

    packages = sorted(packages_by_path.values(), key=lambda package: package.path)
    return packages, unmatched


def _import_repo_health() -> tuple[Any | None, str]:
    try:
        from scripts import repo_health

        return repo_health, ""
    except Exception as first_error:  # pragma: no cover - depends on invocation path
        try:
            import repo_health  # type: ignore[no-redef]

            return repo_health, ""
        except Exception as second_error:
            return None, f"{first_error}; {second_error}"


def collect_repo_health(
    root: Path,
    repo_health_module: object = REPO_HEALTH_AUTO,
) -> RepoHealthSummary:
    if repo_health_module is REPO_HEALTH_AUTO:
        module, import_error = _import_repo_health()
    else:
        module, import_error = repo_health_module, ""

    if module is None:
        return RepoHealthSummary(
            importable=False,
            ok=None,
            missing_paths=[],
            commands={},
            public_content_warnings=[],
            error=import_error or "repo_health module is unavailable",
        )

    try:
        report = module.collect_report(root)  # type: ignore[attr-defined]
    except Exception as exc:
        return RepoHealthSummary(
            importable=True,
            ok=None,
            missing_paths=[],
            commands={},
            public_content_warnings=[],
            error=str(exc),
        )

    return RepoHealthSummary(
        importable=True,
        ok=bool(getattr(report, "ok", False)),
        missing_paths=list(getattr(report, "missing_paths", [])),
        commands=dict(getattr(report, "commands", {})),
        public_content_warnings=list(getattr(report, "public_content_warnings", [])),
    )


def _import_fixture_drift() -> tuple[Any | None, str]:
    try:
        from scripts import fixture_drift

        return fixture_drift, ""
    except Exception as first_error:  # pragma: no cover - depends on invocation path
        try:
            import fixture_drift  # type: ignore[no-redef]

            return fixture_drift, ""
        except Exception as second_error:
            return None, f"{first_error}; {second_error}"


def _int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _fixture_drift_route_summary(route: Any) -> FixtureDriftRouteSummary:
    if not isinstance(route, dict):
        return FixtureDriftRouteSummary(method="", path="", total_requests=0)
    return FixtureDriftRouteSummary(
        method=str(route.get("method") or ""),
        path=str(route.get("path") or ""),
        total_requests=_int_value(route.get("totalRequests", route.get("total_requests"))),
    )


def _is_fixture_drift_scoped_to_root(module: object, root: Path) -> bool:
    module_root = getattr(module, "REPO_ROOT", None)
    if module_root is None:
        return True
    try:
        return Path(module_root).resolve() == root.resolve()
    except (TypeError, OSError):
        return False


def collect_fixture_drift(
    root: Path,
    fixture_drift_module: object = FIXTURE_DRIFT_AUTO,
) -> FixtureDriftSummary:
    if fixture_drift_module is FIXTURE_DRIFT_AUTO:
        module, import_error = _import_fixture_drift()
    else:
        module, import_error = fixture_drift_module, ""

    if module is None:
        return FixtureDriftSummary(
            available=False,
            ok=None,
            total_fixtures=0,
            total_requests=0,
            total_routes=0,
            routes=[],
            error=import_error or "fixture_drift module is unavailable",
        )

    verify_fixture_drift = getattr(module, "verify_fixture_drift", None)
    if not callable(verify_fixture_drift):
        return FixtureDriftSummary(
            available=False,
            ok=None,
            total_fixtures=0,
            total_requests=0,
            total_routes=0,
            routes=[],
            error="fixture_drift.verify_fixture_drift is unavailable",
        )

    if not _is_fixture_drift_scoped_to_root(module, root):
        module_root = getattr(module, "REPO_ROOT", "")
        return FixtureDriftSummary(
            available=False,
            ok=None,
            total_fixtures=0,
            total_requests=0,
            total_routes=0,
            routes=[],
            error=f"fixture_drift is scoped to {str(module_root)}",
        )

    try:
        report = verify_fixture_drift()
    except Exception as exc:
        return FixtureDriftSummary(
            available=True,
            ok=False,
            total_fixtures=0,
            total_requests=0,
            total_routes=0,
            routes=[],
            error=str(exc),
        )

    if not isinstance(report, dict):
        return FixtureDriftSummary(
            available=True,
            ok=False,
            total_fixtures=0,
            total_requests=0,
            total_routes=0,
            routes=[],
            error="fixture_drift.verify_fixture_drift returned a non-object summary",
        )

    routes = sorted(
        (_fixture_drift_route_summary(route) for route in report.get("routes", [])),
        key=lambda route: (route.method, route.path),
    )
    return FixtureDriftSummary(
        available=True,
        ok=True,
        total_fixtures=_int_value(report.get("totalFixtures", report.get("total_fixtures"))),
        total_requests=_int_value(report.get("totalRequests", report.get("total_requests"))),
        total_routes=len(routes),
        routes=routes,
    )


def _clean_yaml_scalar(value: str) -> str:
    cleaned = value.strip()
    if cleaned.startswith(("'", '"')) and cleaned.endswith(("'", '"')) and len(cleaned) >= 2:
        return cleaned[1:-1]
    return cleaned


def _top_level_scalar(lines: Sequence[str], key: str) -> str:
    pattern = re.compile(rf"^{re.escape(key)}:\s*(.*?)\s*$")
    for line in lines:
        match = pattern.match(line)
        if match:
            return _clean_yaml_scalar(match.group(1))
    return ""


def _section_block(lines: Sequence[str], key: str, indent: int = 0) -> list[str]:
    prefix = " " * indent + key + ":"
    for index, line in enumerate(lines):
        if not line.startswith(prefix):
            continue
        block: list[str] = []
        for child in lines[index + 1 :]:
            if not child.strip() or child.lstrip().startswith("#"):
                block.append(child)
                continue
            child_indent = len(child) - len(child.lstrip(" "))
            if child_indent <= indent:
                break
            block.append(child)
        return block
    return []


def _block_scalar(lines: Sequence[str], key: str, indent: int) -> str:
    prefix = " " * indent + key + ":"
    for line in lines:
        if line.startswith(prefix):
            return _clean_yaml_scalar(line[len(prefix) :])
    return ""


def _count_yaml_paths(paths_block: Sequence[str]) -> int:
    pattern = re.compile(r"^  ['\"]?(/.+?)['\"]?:\s*$")
    return sum(1 for line in paths_block if pattern.match(line))


def _json_operation_count(paths: Any) -> int:
    if not isinstance(paths, dict):
        return 0
    count = 0
    for path_item in paths.values():
        if not isinstance(path_item, dict):
            continue
        count += sum(1 for method in path_item if str(method).lower() in HTTP_METHODS)
    return count


def collect_openapi(root: Path) -> OpenApiSummary:
    for relative_path in OPENAPI_CANDIDATES:
        path = root / relative_path
        if not path.is_file():
            continue
        if path.suffix == ".json":
            data, issue = _read_json_object(path)
            info = data.get("info", {})
            paths = data.get("paths", {})
            return OpenApiSummary(
                present=True,
                path=relative_path,
                openapi=str(data.get("openapi") or ""),
                title=str(info.get("title") or "") if isinstance(info, dict) else "",
                version=str(info.get("version") or "") if isinstance(info, dict) else "",
                path_count=len(paths) if isinstance(paths, dict) else 0,
                operation_count=_json_operation_count(paths),
                issues=[issue] if issue else [],
            )

        text = path.read_text(encoding="utf-8")
        lines = text.splitlines()
        info_block = _section_block(lines, "info")
        paths_block = _section_block(lines, "paths")
        return OpenApiSummary(
            present=True,
            path=relative_path,
            openapi=_top_level_scalar(lines, "openapi"),
            title=_block_scalar(info_block, "title", 2),
            version=_block_scalar(info_block, "version", 2),
            path_count=_count_yaml_paths(paths_block),
            operation_count=sum(1 for line in paths_block if line.strip().startswith("operationId:")),
            issues=[],
        )

    return OpenApiSummary(
        present=False,
        path="",
        openapi="",
        title="",
        version="",
        path_count=0,
        operation_count=0,
        issues=["no docs/openapi file found"],
    )


def _inline_yaml_values(value: str) -> list[str]:
    value = value.strip()
    if not value:
        return []
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [_clean_yaml_scalar(part.strip()) for part in inner.split(",") if part.strip()]
    return [_clean_yaml_scalar(value)]


def _child_keys(lines: Sequence[str], start_index: int, parent_indent: int) -> list[str]:
    keys: list[str] = []
    child_indent = parent_indent + 2
    pattern = re.compile(rf"^ {{{child_indent}}}['\"]?([^'\":\s][^'\":]*)['\"]?:")
    for line in lines[start_index + 1 :]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent <= parent_indent:
            break
        match = pattern.match(line)
        if indent == child_indent and match:
            keys.append(match.group(1).strip())
    return keys


def _workflow_triggers(lines: Sequence[str]) -> list[str]:
    pattern = re.compile(r"^(?:on|'on'|\"on\"):\s*(.*?)\s*$")
    for index, line in enumerate(lines):
        match = pattern.match(line)
        if not match:
            continue
        inline = _inline_yaml_values(match.group(1))
        return inline or _child_keys(lines, index, 0)
    return []


def _workflow_jobs(lines: Sequence[str]) -> list[str]:
    for index, line in enumerate(lines):
        if line.startswith("jobs:"):
            return _child_keys(lines, index, 0)
    return []


def collect_workflows(root: Path) -> list[WorkflowSummary]:
    workflow_root = root / ".github" / "workflows"
    if not workflow_root.is_dir():
        return []

    workflows: list[WorkflowSummary] = []
    for path in sorted(item for item in workflow_root.iterdir() if item.suffix in WORKFLOW_EXTENSIONS):
        lines = path.read_text(encoding="utf-8").splitlines()
        workflows.append(
            WorkflowSummary(
                path=_relative_path(path, root),
                name=_top_level_scalar(lines, "name") or path.stem,
                triggers=_workflow_triggers(lines),
                jobs=_workflow_jobs(lines),
            )
        )
    return workflows


def collect_dashboard(
    root: Path,
    repo_health_module: object = REPO_HEALTH_AUTO,
    fixture_drift_module: object = FIXTURE_DRIFT_AUTO,
) -> StatusDashboard:
    root = root.resolve()
    root_metadata: dict[str, Any] = {}
    root_package: PackageSummary | None = None
    package_json = root / "package.json"
    if package_json.is_file():
        root_metadata, issue = _read_json_object(package_json)
        root_package = package_summary(package_json, root, root_metadata)
        if issue:
            root_package = PackageSummary(
                path=root_package.path,
                name=root_package.name,
                version=root_package.version,
                private=root_package.private,
                scripts=root_package.scripts,
                issues=[*root_package.issues, issue],
            )

    patterns = workspace_patterns(root_metadata)
    workspace_packages, unmatched_patterns = collect_workspace_packages(root, patterns)
    return StatusDashboard(
        root=root.as_posix(),
        root_package=root_package,
        workspace_patterns=patterns,
        unmatched_workspace_patterns=unmatched_patterns,
        workspace_packages=workspace_packages,
        repo_health=collect_repo_health(root, repo_health_module),
        openapi=collect_openapi(root),
        fixture_drift=collect_fixture_drift(root, fixture_drift_module),
        workflows=collect_workflows(root),
    )


def dashboard_to_dict(dashboard: StatusDashboard) -> dict[str, Any]:
    return asdict(dashboard)


def render_json(dashboard: StatusDashboard) -> str:
    return json.dumps(dashboard_to_dict(dashboard), indent=2, sort_keys=True) + "\n"


def _markdown_text(value: str) -> str:
    return value.replace("|", r"\|").replace("\n", " ")


def _inline_code_list(values: Sequence[str]) -> str:
    if not values:
        return "none"
    return ", ".join(f"`{value}`" for value in values)


def _yes_no(value: bool) -> str:
    return "yes" if value else "no"


def render_markdown(dashboard: StatusDashboard) -> str:
    lines = [
        "# Repository Status Dashboard",
        "",
        "Generated by `scripts/status_dashboard.py`.",
        "",
        "## Root Package",
        "",
    ]
    if dashboard.root_package is None:
        lines.append("- `package.json`: missing")
    else:
        package = dashboard.root_package
        lines.extend(
            [
                f"- Name: `{package.name or 'unnamed'}`",
                f"- Version: `{package.version or 'unset'}`",
                f"- Private: {_yes_no(package.private)}",
                f"- Scripts: {_inline_code_list(package.scripts)}",
            ]
        )
        lines.extend(f"- Issue: {issue}" for issue in package.issues)

    lines.extend(["", "## Workspaces", ""])
    lines.append(f"- Patterns: {_inline_code_list(dashboard.workspace_patterns)}")
    lines.append(f"- Package count: {len(dashboard.workspace_packages)}")
    if dashboard.unmatched_workspace_patterns:
        lines.append(f"- Unmatched patterns: {_inline_code_list(dashboard.unmatched_workspace_patterns)}")
    if dashboard.workspace_packages:
        lines.extend(["", "| Path | Name | Version | Private | Scripts |", "| --- | --- | --- | --- | --- |"])
        for package in dashboard.workspace_packages:
            scripts = ", ".join(package.scripts) if package.scripts else "none"
            lines.append(
                " | ".join(
                    [
                        f"| {_markdown_text(package.path)}",
                        _markdown_text(package.name or "unnamed"),
                        _markdown_text(package.version or "unset"),
                        _yes_no(package.private),
                        f"{_markdown_text(scripts)} |",
                    ]
                )
            )
    else:
        lines.append("- No workspace packages found.")

    lines.extend(["", "## Repo Health", ""])
    health = dashboard.repo_health
    if not health.importable:
        lines.append(f"- Status: unavailable ({health.error})")
    else:
        status = "ok" if health.ok else "issues" if health.ok is False else "unknown"
        lines.extend(
            [
                f"- Status: {status}",
                f"- Missing paths: {len(health.missing_paths)}",
                f"- Content warnings: {len(health.public_content_warnings)}",
                f"- Tools: {_inline_code_list([f'{name}={_yes_no(value)}' for name, value in sorted(health.commands.items())])}",
            ]
        )
        if health.error:
            lines.append(f"- Error: {health.error}")

    lines.extend(["", "## OpenAPI", ""])
    openapi = dashboard.openapi
    if openapi.present:
        lines.extend(
            [
                f"- File: `{openapi.path}`",
                f"- OpenAPI: `{openapi.openapi or 'unknown'}`",
                f"- Title: `{openapi.title or 'untitled'}`",
                f"- Version: `{openapi.version or 'unset'}`",
                f"- Paths: {openapi.path_count}",
                f"- Operations: {openapi.operation_count}",
            ]
        )
    else:
        lines.append("- No docs/openapi file found.")
    lines.extend(f"- Issue: {issue}" for issue in openapi.issues)

    lines.extend(["", "## Fixture Drift", ""])
    fixture_drift = dashboard.fixture_drift
    if not fixture_drift.available:
        lines.append(f"- Status: unavailable ({fixture_drift.error})")
        lines.extend(
            [
                f"- Total fixtures: {fixture_drift.total_fixtures}",
                f"- Total requests: {fixture_drift.total_requests}",
                f"- Total routes: {fixture_drift.total_routes}",
            ]
        )
    else:
        status = "ok" if fixture_drift.ok else "issues" if fixture_drift.ok is False else "unknown"
        lines.extend(
            [
                f"- Status: {status}",
                f"- Total fixtures: {fixture_drift.total_fixtures}",
                f"- Total requests: {fixture_drift.total_requests}",
                f"- Total routes: {fixture_drift.total_routes}",
            ]
        )
        if fixture_drift.error:
            lines.append(f"- Error: {fixture_drift.error}")
        if fixture_drift.routes:
            lines.extend(["", "| Method | Path | Requests |", "| --- | --- | --- |"])
            for route in fixture_drift.routes:
                lines.append(
                    " | ".join(
                        [
                            f"| {_markdown_text(route.method or 'unknown')}",
                            _markdown_text(route.path or "unknown"),
                            f"{route.total_requests} |",
                        ]
                    )
                )

    lines.extend(["", "## Workflows", ""])
    if dashboard.workflows:
        lines.extend(["| Path | Name | Triggers | Jobs |", "| --- | --- | --- | --- |"])
        for workflow in dashboard.workflows:
            triggers = ", ".join(workflow.triggers) if workflow.triggers else "none"
            jobs = ", ".join(workflow.jobs) if workflow.jobs else "none"
            lines.append(
                " | ".join(
                    [
                        f"| {_markdown_text(workflow.path)}",
                        _markdown_text(workflow.name),
                        _markdown_text(triggers),
                        f"{_markdown_text(jobs)} |",
                    ]
                )
            )
    else:
        lines.append("- No workflow files found.")

    return "\n".join(lines) + "\n"


def main(
    argv: Sequence[str] | None = None,
    repo_health_module: object = REPO_HEALTH_AUTO,
    fixture_drift_module: object = FIXTURE_DRIFT_AUTO,
) -> int:
    parser = argparse.ArgumentParser(description="Generate a deterministic repository status dashboard.")
    parser.add_argument("--root", default=".", help="Repository root.")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown", help="Output format.")
    parser.add_argument("--json", action="store_true", help="Shortcut for --format json.")
    parser.add_argument("--output", help="Write output to a file instead of stdout.")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    output_format = "json" if args.json else args.format
    dashboard = collect_dashboard(
        root,
        repo_health_module=repo_health_module,
        fixture_drift_module=fixture_drift_module,
    )
    rendered = render_json(dashboard) if output_format == "json" else render_markdown(dashboard)

    if args.output:
        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = root / output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
