#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.openapi_fixture_contract import (  # noqa: E402
    FixtureRequest,
    normalize_fixture_requests,
    require_block,
)


OPENAPI_PATH = REPO_ROOT / "docs" / "openapi.yaml"
SUMMARY_KIND = "fixture-drift.summary"
ERROR_KIND = "fixture-drift.error"
SCHEMA_VERSION = "fixture-drift.v1"

PRIVATE_PATH_MARKERS = (
    "".join(("sovereign", "ops", "-codex", "-pack")),
    "plan" + "-pack",
    "private" + " " + "plan" + " " + "pack",
    "".join((".", "codex", "-private")),
    "".join((".", "codex", "-run")),
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/" + "backlog" + ".jsonl",
    "tasks" + "\\" + "backlog" + ".jsonl",
)


@dataclass(frozen=True)
class FixtureSpec:
    relative_path: str
    schema_version: str | None = None
    api_base: str | None = None
    expected_routes: frozenset[tuple[str, str]] | None = None
    expected_tag: str | None = None
    request_body_refs: dict[tuple[str, str], str] | None = None


DEFAULT_FIXTURES: tuple[FixtureSpec, ...] = (
    FixtureSpec(
        relative_path="examples/plugins/release-notes/review-artifact-api-requests.json",
        schema_version="plugin-review-artifact-api-requests.v1",
        api_base="local://plugin-review-artifact-api",
        expected_routes=frozenset(
            {
                ("POST", "/v1/plugins/review-artifacts/preview"),
            }
        ),
        expected_tag="plugins",
        request_body_refs={
            (
                "POST",
                "/v1/plugins/review-artifacts/preview",
            ): "PluginReviewArtifactPreviewRequest",
        },
    ),
    FixtureSpec(
        relative_path=(
            "examples/plugins/release-notes/review-artifact-records-requests.json"
        ),
        schema_version="plugin-review-artifact-records-requests.v1",
        api_base="local://plugin-review-artifact-records-api",
        expected_routes=frozenset(
            {
                ("POST", "/v1/plugins/review-artifacts/records"),
                ("GET", "/v1/plugins/review-artifacts/records"),
                ("GET", "/v1/plugins/review-artifacts/records/{recordId}"),
                ("POST", "/v1/plugins/review-artifacts/records/{recordId}/compare"),
            }
        ),
        expected_tag="plugins",
        request_body_refs={
            (
                "POST",
                "/v1/plugins/review-artifacts/records",
            ): "PluginReviewArtifactRecordCreateRequest",
            (
                "GET",
                "/v1/plugins/review-artifacts/records",
            ): "PluginReviewArtifactRecordListRequest",
            (
                "POST",
                "/v1/plugins/review-artifacts/records/{recordId}/compare",
            ): "PluginReviewArtifactRecordCompareRequest",
        },
    ),
    FixtureSpec(
        relative_path="examples/mcp/approval-evidence-preview-requests.json",
        schema_version="mcp-approval-evidence-preview-requests.v1",
        api_base="local://mcp-approval-evidence-api",
        expected_routes=frozenset(
            {
                ("POST", "/v1/mcp/approval-evidence/preview"),
            }
        ),
        expected_tag="mcp",
        request_body_refs={
            (
                "POST",
                "/v1/mcp/approval-evidence/preview",
            ): "McpApprovalEvidencePreviewRequest",
        },
    ),
    FixtureSpec(
        relative_path="examples/mcp/approval-evidence-records-requests.json",
        schema_version="mcp-approval-evidence-records-requests.v1",
        api_base="local://mcp-approval-evidence-records-api",
        expected_routes=frozenset(
            {
                ("POST", "/v1/mcp/approval-evidence/records"),
                ("GET", "/v1/mcp/approval-evidence/records"),
                ("GET", "/v1/mcp/approval-evidence/records/{recordId}"),
                ("POST", "/v1/mcp/approval-evidence/records/{recordId}/compare"),
            }
        ),
        expected_tag="mcp",
        request_body_refs={
            (
                "POST",
                "/v1/mcp/approval-evidence/records",
            ): "McpApprovalEvidenceRecordCreateRequest",
            (
                "POST",
                "/v1/mcp/approval-evidence/records/{recordId}/compare",
            ): "McpApprovalEvidenceRecordCompareRequest",
        },
    ),
)
DEFAULT_SPEC_BY_PATH = {spec.relative_path: spec for spec in DEFAULT_FIXTURES}


class DriftError(Exception):
    def __init__(self, code: str, message: str, exit_code: int = 1) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.exit_code = exit_code


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise DriftError("invalid_arguments", message, exit_code=2)

    def exit(self, status: int = 0, message: str | None = None) -> None:
        if status:
            raise DriftError("invalid_arguments", message or "invalid arguments", status)
        raise DriftError("help_unavailable", "--help is not supported", exit_code=2)


def verify_fixture_drift(
    *,
    fixture_paths: Iterable[str | Path] | None = None,
    openapi_path: str | Path | None = None,
) -> dict[str, Any]:
    openapi = _safe_repo_file(openapi_path or str(OPENAPI_PATH), label="openapi")
    openapi_lines = openapi.read_text(encoding="utf-8").splitlines()

    selected_paths = list(fixture_paths or ())
    if selected_paths:
        fixture_files = [
            _safe_repo_file(path, label="fixture") for path in selected_paths
        ]
    else:
        fixture_files = [
            _safe_repo_file(spec.relative_path, label="fixture")
            for spec in DEFAULT_FIXTURES
        ]

    fixture_summaries: list[dict[str, Any]] = []
    all_requests: list[tuple[str, FixtureRequest]] = []

    for fixture_file in fixture_files:
        relative_path = _repo_relative(fixture_file)
        spec = DEFAULT_SPEC_BY_PATH.get(relative_path, FixtureSpec(relative_path))
        bundle = _load_fixture_bundle(fixture_file)
        requests = normalize_fixture_requests(bundle)

        _assert_fixture_identity(bundle, spec)
        _assert_requests_documented(bundle, requests, openapi_lines, spec)

        fixture_summaries.append(_fixture_summary(relative_path, bundle, requests))
        all_requests.extend((relative_path, request) for request in requests)

    return {
        "kind": SUMMARY_KIND,
        "schemaVersion": SCHEMA_VERSION,
        "totalFixtures": len(fixture_summaries),
        "totalRequests": len(all_requests),
        "fixtures": fixture_summaries,
        "routes": _route_summary(all_requests),
        "methods": _counter_summary(request.method for _, request in all_requests),
        "statuses": _counter_summary(
            str(request.expected_status) for _, request in all_requests
        ),
    }


def main(argv: list[str] | None = None) -> int:
    try:
        args = _parse_args(argv)
        summary = verify_fixture_drift(
            fixture_paths=args.fixture,
            openapi_path=args.openapi,
        )
    except DriftError as exc:
        _emit_json_error(exc.code, exc.message)
        return exc.exit_code
    except (AssertionError, OSError, json.JSONDecodeError) as exc:
        _emit_json_error("fixture_drift_failed", str(exc))
        return 1
    except Exception as exc:
        _emit_json_error("fixture_drift_failed", str(exc))
        return 1

    json.dump(summary, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = JsonArgumentParser(
        prog="fixture_drift.py",
        add_help=False,
        description="Verify fixture request bundles against docs/openapi.yaml.",
    )
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--fixture", action="append", default=[])
    parser.add_argument("--openapi")
    args = parser.parse_args(argv)
    if not args.json:
        raise DriftError("json_required", "pass --json for JSON output", exit_code=2)
    return args


def _emit_json_error(code: str, message: str) -> None:
    payload = {
        "kind": ERROR_KIND,
        "schemaVersion": SCHEMA_VERSION,
        "error": {
            "code": code,
            "message": message,
        },
    }
    json.dump(payload, sys.stderr, indent=2, sort_keys=True)
    sys.stderr.write("\n")


def _safe_repo_file(raw_path: str | Path, *, label: str) -> Path:
    raw_text = str(raw_path)
    _assert_no_private_marker(raw_text, label=label)
    path = Path(raw_text)
    if not path.is_absolute():
        path = REPO_ROOT / path
    resolved = path.resolve()
    _assert_repo_scoped(resolved, label=label)
    _assert_no_private_marker(_repo_relative(resolved), label=label)
    if not resolved.is_file():
        raise DriftError(f"missing_{label}", f"{label} file does not exist")
    return resolved


def _assert_repo_scoped(path: Path, *, label: str) -> None:
    try:
        path.relative_to(REPO_ROOT)
    except ValueError as exc:
        raise DriftError(
            f"unsafe_{label}_path",
            f"{label} path must stay inside the repository root",
            exit_code=2,
        ) from exc


def _assert_no_private_marker(value: str, *, label: str) -> None:
    normalized = value.replace("\\", "/").lower()
    for marker in PRIVATE_PATH_MARKERS:
        if marker.replace("\\", "/").lower() in normalized:
            raise DriftError(
                f"unsafe_{label}_path",
                f"{label} path points at a restricted path marker",
                exit_code=2,
            )


def _repo_relative(path: Path) -> str:
    return path.resolve().relative_to(REPO_ROOT).as_posix()


def _load_fixture_bundle(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise AssertionError("fixture bundle root must be an object")
    return payload


def _assert_fixture_identity(bundle: dict[str, Any], spec: FixtureSpec) -> None:
    if spec.schema_version is not None:
        actual = bundle.get("schemaVersion")
        if actual != spec.schema_version:
            raise AssertionError(
                f"{spec.relative_path} schemaVersion drift: "
                f"expected {spec.schema_version}, got {actual!r}"
            )
    if spec.api_base is not None:
        actual = bundle.get("apiBase")
        if actual != spec.api_base:
            raise AssertionError(
                f"{spec.relative_path} apiBase drift: "
                f"expected {spec.api_base}, got {actual!r}"
            )


def _assert_requests_documented(
    bundle: dict[str, Any],
    requests: list[FixtureRequest],
    openapi_lines: list[str],
    spec: FixtureSpec,
) -> None:
    represented_routes: set[tuple[str, str]] = set()

    for request in requests:
        route_key = (request.method, request.route_template)
        represented_routes.add(route_key)

        path_block = require_block(openapi_lines, request.route_template, 2)
        method_block = require_block(path_block, request.method.lower(), 4)
        block_text = "\n".join(method_block)

        if spec.expected_tag is not None and f"- {spec.expected_tag}" not in block_text:
            raise AssertionError(
                f"{request.method} {request.route_template} missing tag "
                f"{spec.expected_tag}"
            )

        if "responses:" not in block_text:
            raise AssertionError(f"{request.method} {request.route_template} missing responses")

        status_text = f'"{request.expected_status}":'
        if request.expected_status < 400:
            if status_text not in block_text:
                raise AssertionError(
                    f"{request.method} {request.route_template} does not document "
                    f"status {request.expected_status}"
                )
        elif status_text not in block_text and "default:" not in block_text:
            raise AssertionError(
                f"{request.method} {request.route_template} does not document "
                f"status {request.expected_status}"
            )

        if "{recordId}" in request.route_template:
            if "name: recordId" not in block_text or "minLength: 1" not in block_text:
                raise AssertionError(
                    f"{request.method} {request.route_template} missing recordId parameter"
                )

        request_body_refs = spec.request_body_refs or {}
        expected_ref = request_body_refs.get(route_key)
        if expected_ref is not None:
            if "requestBody:" not in block_text:
                raise AssertionError(
                    f"{request.method} {request.route_template} missing requestBody"
                )
            if f'$ref: "#/components/schemas/{expected_ref}"' not in block_text:
                raise AssertionError(
                    f"{request.method} {request.route_template} missing request body "
                    f"schema {expected_ref}"
                )

    if spec.expected_routes is not None and represented_routes != set(spec.expected_routes):
        missing = sorted(set(spec.expected_routes) - represented_routes)
        extra = sorted(represented_routes - set(spec.expected_routes))
        raise AssertionError(
            f"{spec.relative_path} route drift: missing={missing}, extra={extra}"
        )


def _fixture_summary(
    relative_path: str,
    bundle: dict[str, Any],
    requests: list[FixtureRequest],
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "path": relative_path,
        "schemaVersion": bundle.get("schemaVersion"),
        "apiBase": bundle.get("apiBase"),
        "totalRequests": len(requests),
        "routes": _route_summary((relative_path, request) for request in requests),
        "methods": _counter_summary(request.method for request in requests),
        "statuses": _counter_summary(str(request.expected_status) for request in requests),
    }
    if isinstance(bundle.get("kind"), str):
        summary["kind"] = bundle["kind"]
    return summary


def _route_summary(
    requests: Iterable[tuple[str, FixtureRequest]],
) -> list[dict[str, Any]]:
    by_route: dict[tuple[str, str], list[tuple[str, FixtureRequest]]] = defaultdict(list)
    for fixture_path, request in requests:
        by_route[(request.method, request.route_template)].append((fixture_path, request))

    rows: list[dict[str, Any]] = []
    for (method, route), route_requests in sorted(by_route.items()):
        rows.append(
            {
                "method": method,
                "path": route,
                "totalRequests": len(route_requests),
                "fixtures": sorted({fixture_path for fixture_path, _ in route_requests}),
                "statuses": _counter_summary(
                    str(request.expected_status) for _, request in route_requests
                ),
            }
        )
    return rows


def _counter_summary(values: Iterable[str]) -> dict[str, int]:
    return dict(sorted(Counter(values).items()))


if __name__ == "__main__":
    raise SystemExit(main())
