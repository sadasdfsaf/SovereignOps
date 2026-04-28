from __future__ import annotations

import json
import re
import unittest
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
OPENAPI_PATH = REPO_ROOT / "docs" / "openapi.yaml"
SAFE_PATH_PARAMETER = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")


@dataclass(frozen=True)
class FixtureRequest:
    request_id: str
    method: str
    path: str
    route_template: str
    expected_status: int


def load_json(relative_path: str) -> dict[str, Any]:
    path = REPO_ROOT / relative_path
    return json.loads(path.read_text(encoding="utf-8"))


def load_openapi_lines(path: Path = OPENAPI_PATH) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def normalize_fixture_requests(bundle: dict[str, Any]) -> list[FixtureRequest]:
    requests = bundle.get("requests")
    if not isinstance(requests, list):
        raise AssertionError("fixture bundle must contain a requests array")

    normalized: list[FixtureRequest] = []
    for index, entry in enumerate(requests):
        if not isinstance(entry, dict):
            raise AssertionError(f"requests[{index}] must be an object")
        route = entry.get("route", entry)
        expect = entry.get("expect", entry)
        if not isinstance(route, dict) or not isinstance(expect, dict):
            raise AssertionError(f"requests[{index}] must contain route and expect objects")

        request_id = _required_string(entry, "id", index)
        method = _required_string(route, "method", index).upper()
        path = _required_string(route, "path", index)
        expected_status = expect.get("status", expect.get("expectedStatus"))
        if not isinstance(expected_status, int):
            raise AssertionError(f"{request_id} must include an integer expected status")

        normalized.append(
            FixtureRequest(
                request_id=request_id,
                method=method,
                path=path,
                route_template=route_template_for(path),
                expected_status=expected_status,
            )
        )
    return normalized


def route_template_for(path: str) -> str:
    plugin_records = "/v1/plugins/review-artifacts/records"
    approval_records = "/v1/mcp/approval-evidence/records"
    for prefix in (plugin_records, approval_records):
        if path == f"{prefix}/compare":
            return f"{prefix}/{{recordId}}/compare"
        if path.startswith(f"{prefix}/") and path.endswith("/compare"):
            record_id = path.removeprefix(f"{prefix}/").removesuffix("/compare")
            _assert_safe_path_parameter(record_id, path)
            return f"{prefix}/{{recordId}}/compare"
        if path.startswith(f"{prefix}/"):
            record_id = path.removeprefix(f"{prefix}/")
            _assert_safe_path_parameter(record_id, path)
            return f"{prefix}/{{recordId}}"
    return path


def assert_fixture_routes_documented(
    testcase: unittest.TestCase,
    *,
    bundle: dict[str, Any],
    openapi_lines: list[str],
    expected_routes: set[tuple[str, str]],
    expected_tag: str,
    request_body_refs: dict[tuple[str, str], str],
) -> None:
    represented_routes: set[tuple[str, str]] = set()

    for request in normalize_fixture_requests(bundle):
        route_key = (request.method, request.route_template)
        represented_routes.add(route_key)

        with testcase.subTest(request=request.request_id):
            path_block = require_block(openapi_lines, request.route_template, 2)
            method_block = require_block(path_block, request.method.lower(), 4)
            block_text = "\n".join(method_block)

            testcase.assertIn(f"- {expected_tag}", block_text)
            testcase.assertIn("responses:", block_text)
            if request.expected_status < 400:
                testcase.assertIn(f'"{request.expected_status}":', block_text)
            else:
                testcase.assertTrue(
                    f'"{request.expected_status}":' in block_text or "default:" in block_text,
                    f"{request.method} {request.route_template} does not document status {request.expected_status}",
                )

            if "{recordId}" in request.route_template:
                testcase.assertIn("name: recordId", block_text)
                testcase.assertIn("minLength: 1", block_text)

            expected_ref = request_body_refs.get(route_key)
            if expected_ref is not None:
                testcase.assertIn("requestBody:", block_text)
                testcase.assertIn(f'$ref: "#/components/schemas/{expected_ref}"', block_text)

    testcase.assertEqual(represented_routes, expected_routes)


def require_block(lines: list[str], key: str, indent: int) -> list[str]:
    prefix = " " * indent + f"{key}:"
    start = next((index for index, line in enumerate(lines) if line == prefix), None)
    if start is None:
        raise AssertionError(f"missing OpenAPI block: {key}")

    block: list[str] = []
    for line in lines[start:]:
        if block and line and not line.startswith(" " * (indent + 1)):
            break
        block.append(line)
    return block


def _required_string(record: dict[str, Any], key: str, index: int) -> str:
    value = record.get(key)
    if not isinstance(value, str) or not value:
        raise AssertionError(f"requests[{index}].{key} must be a non-empty string")
    return value


def _assert_safe_path_parameter(value: str, source_path: str) -> None:
    if (
        not SAFE_PATH_PARAMETER.fullmatch(value)
        or value in {".", ".."}
        or "/" in value
        or "\\" in value
        or "/." in source_path
        or "\\." in source_path
    ):
        raise AssertionError(f"unsafe path parameter in fixture route: {source_path}")
