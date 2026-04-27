from __future__ import annotations

import json
import re
import unittest
from hashlib import sha256
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "examples" / "ingest-search" / "evidence-api-requests.json"
OPENAPI_PATH = ROOT / "docs" / "openapi.yaml"

EXPECTED_OPERATIONS = {
    "/v1/ingest/evidence/export": {
        "method": "POST",
        "operation_id": "exportIngestEvidence",
        "response_kind": "ingest-evidence.export",
        "response_schema": "IngestEvidenceExportResponse",
    },
    "/v1/ingest/evidence/package": {
        "method": "POST",
        "operation_id": "packageIngestEvidence",
        "response_kind": "ingest-evidence.package",
        "response_schema": "IngestEvidencePackageResponse",
    },
}

EXPECTED_ROUTE_PATHS = set(EXPECTED_OPERATIONS)
EXPECTED_MANIFEST_KIND = "ingest-evidence.manifest"
EXPECTED_LOCAL_SOURCE_PREFIX = "fixture://ingest-search/"

REQUIRED_REFERENCE_GROUPS = {
    "api": {"apps/api/src/ingestEvidenceRoutes.ts"},
    "package": {"packages/ingest-evidence/src/index.ts"},
    "sdk": {
        "packages/sdk-js/src/ingestEvidenceClient.ts",
        "packages/sdk-js/src/localIngestEvidence.ts",
    },
    "cli": {
        "packages/cli/src/ingestEvidence.ts",
        "packages/cli/src/index.ts",
    },
    "web": {
        "apps/web/src/ingestEvidenceReview.ts",
        "apps/web/src/ingestSessionReview.ts",
    },
}

REQUIRED_REFERENCE_SYMBOLS = {
    "apps/api/src/ingestEvidenceRoutes.ts": "createIngestEvidenceRoutes",
    "apps/web/src/ingestEvidenceReview.ts": "buildIngestEvidenceReview",
    "packages/cli/src/ingestEvidence.ts": "runIngestEvidenceCli",
    "packages/ingest-evidence/src/index.ts": "createIngestEvidencePackage",
    "packages/sdk-js/src/ingestEvidenceClient.ts": "createIngestEvidenceClient",
}

REFERENCE_PATH_RE = re.compile(
    r"(?:(?:apps|docs|examples|packages|tests)[/\\][A-Za-z0-9_. /\\-]+?"
    r"\.(?:csv|json|md|mjs|ts|yaml))"
)


class IngestEvidenceApiFixtureAlignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not FIXTURE_PATH.is_file():
            raise unittest.SkipTest(
                "examples/ingest-search/evidence-api-requests.json is missing; "
                "ingest evidence API fixture alignment checks run when it exists."
            )

        cls.fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        cls.requests = _request_records(cls.fixture)
        cls.evidence_refs = _evidence_refs(cls.fixture)
        cls.openapi_lines = OPENAPI_PATH.read_text(encoding="utf-8").splitlines()

    def test_fixture_routes_match_openapi_operation_ids(self) -> None:
        openapi_operations = _openapi_operations(self, self.openapi_lines)
        route_rows = [_route_row(self, request, index) for index, request in enumerate(self.requests)]
        seen_paths = {row["path"] for row in route_rows}

        self.assertEqual(seen_paths, EXPECTED_ROUTE_PATHS)
        for path, expected in EXPECTED_OPERATIONS.items():
            with self.subTest(path=path):
                self.assertEqual(openapi_operations[path]["operation_id"], expected["operation_id"])
                self.assertEqual(openapi_operations[path]["response_schema"], expected["response_schema"])

                matching_rows = [row for row in route_rows if row["path"] == path]
                self.assertGreater(len(matching_rows), 0, f"missing fixture request for {path}")
                for row in matching_rows:
                    self.assertEqual(row["method"], expected["method"])
                    if row["operation_id"] is not None:
                        self.assertEqual(row["operation_id"], expected["operation_id"])

    def test_request_ids_are_unique_and_stable(self) -> None:
        request_ids = []
        for index, request in enumerate(self.requests):
            request_id = _string_field(request, "id", "requestId", "request_id")
            self.assertIsNotNone(request_id, f"requests[{index}] is missing an id")
            request_ids.append(request_id or "")
            self.assertRegex(request_id or "", r"^[A-Za-z0-9_.:-]+$")

        self.assertEqual(len(request_ids), len(set(request_ids)))

    def test_requests_use_inline_local_only_evidence_inputs(self) -> None:
        fixture_local_only = _optional_boolean(self.fixture, "localOnly", "local_only")
        if fixture_local_only is not None:
            self.assertTrue(fixture_local_only)

        network = self.fixture.get("network")
        if isinstance(network, dict) and "mode" in network:
            self.assertEqual(network["mode"], "disabled")

        for index, request in enumerate(self.requests):
            with self.subTest(request=_request_label(request, index)):
                body = _request_body(request)
                self.assertIsInstance(body, dict)
                evidence = body.get("evidence") if isinstance(body, dict) else None
                self.assertIsInstance(evidence, dict)
                resolved_evidence = _resolve_evidence_input(self, evidence, self.evidence_refs)
                self.assertTrue(resolved_evidence.get("localOnly"))

                for path, value in _walk_strings(body):
                    self.assertNotRegex(value, r"^https?://", f"{path} must not use URL evidence")
                    if value.startswith("fixture://"):
                        self.assertTrue(
                            value.startswith(EXPECTED_LOCAL_SOURCE_PREFIX),
                            f"{path} must stay under {EXPECTED_LOCAL_SOURCE_PREFIX}",
                        )
                    if _looks_like_repo_path(value):
                        _safe_repo_path(value)

    def test_response_kinds_match_expected_route_contracts(self) -> None:
        for index, request in enumerate(self.requests):
            row = _route_row(self, request, index)
            expected = EXPECTED_OPERATIONS[row["path"]]
            expectation = _response_expectation(request)
            status = expectation.get("status")

            with self.subTest(request=_request_label(request, index)):
                self.assertIsInstance(expectation, dict)
                self.assertIn(status, {200, 400})

                if status == 200:
                    self.assertEqual(expectation.get("kind"), expected["response_kind"])
                    self.assertEqual(expectation.get("contentType"), "application/json")
                    _assert_sha256_fingerprint(self, expectation, "fingerprint")
                    _assert_sha256_fingerprint(self, expectation, "manifestFingerprint")
                    _assert_sha256_fingerprint(self, expectation, "contentFingerprint")

                    response_body = _response_body(request)
                    if isinstance(response_body, dict):
                        manifest = response_body.get("manifest")
                        self.assertIsInstance(manifest, dict)
                        self.assertEqual(manifest.get("kind"), EXPECTED_MANIFEST_KIND)
                        self.assertTrue(manifest.get("localOnly"))

                if row["path"] == "/v1/ingest/evidence/export" and status == 200:
                    self.assertIn(expectation.get("format"), {"json", "summary", "manifest"})
                elif status == 200:
                    files = expectation.get("files")
                    self.assertIsInstance(files, list)
                    self.assertEqual(
                        {file.get("path") for file in files if isinstance(file, dict)},
                        {"manifest.json", "evidence.json"},
                    )
                else:
                    error = expectation.get("error")
                    self.assertIsInstance(error, dict)
                    self.assertEqual(error.get("code"), "validation_failed")

    def test_file_references_exist_for_api_package_sdk_cli_and_web_surfaces(self) -> None:
        referenced_paths = _repo_path_references(self.fixture)

        for relative_path in sorted(referenced_paths):
            with self.subTest(path=relative_path):
                path = _safe_repo_path(relative_path)
                self.assertTrue(path.is_file(), relative_path)

        for group, paths in REQUIRED_REFERENCE_GROUPS.items():
            with self.subTest(surface=group):
                available = [
                    relative_path
                    for relative_path in sorted(paths)
                    if _safe_repo_path(relative_path).is_file()
                ]
                self.assertGreater(len(available), 0, f"missing available {group} file reference")

        for relative_path, symbol in REQUIRED_REFERENCE_SYMBOLS.items():
            with self.subTest(symbol=symbol):
                path = _safe_repo_path(relative_path)
                self.assertTrue(path.is_file(), relative_path)
                self.assertIn(symbol, path.read_text(encoding="utf-8"))

    def test_fixture_avoids_remote_urls_and_private_pack_references(self) -> None:
        for path, value in _walk_strings(self.fixture):
            with self.subTest(path=path):
                lower_value = value.lower()
                self.assertNotIn("sovereignops-codex-pack", lower_value)
                self.assertNotIn(".codex-private", lower_value)
                if value.startswith(("http://", "https://")):
                    self.assertTrue(_is_local_http_url(value), f"{path} must be a local URL")


def _request_records(fixture: Any) -> list[dict[str, Any]]:
    if not isinstance(fixture, dict):
        raise AssertionError("fixture root must be an object")
    for key in ("requests", "apiRequests", "api_requests"):
        value = fixture.get(key)
        if isinstance(value, list):
            records = [item for item in value if isinstance(item, dict)]
            if len(records) != len(value):
                raise AssertionError(f"{key} must contain only objects")
            if not records:
                raise AssertionError(f"{key} must contain at least one request")
            return records
    raise AssertionError("fixture must define a requests array")


def _evidence_refs(fixture: dict[str, Any]) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}
    input_evidence = fixture.get("inputEvidence")
    if isinstance(input_evidence, dict):
        ref_id = _string_field(input_evidence, "id")
        if ref_id is not None:
            refs[ref_id] = input_evidence

    for key in ("evidenceFixtures", "evidence_inputs"):
        value = fixture.get(key)
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    ref_id = _string_field(item, "id")
                    if ref_id is not None:
                        refs[ref_id] = item
    return refs


def _resolve_evidence_input(
    testcase: unittest.TestCase,
    evidence: Any,
    evidence_refs: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    testcase.assertIsInstance(evidence, dict)
    if not isinstance(evidence, dict):
        return {}

    fixture_ref = _string_field(evidence, "$fixtureRef", "fixtureRef", "fixture_ref")
    if fixture_ref is None:
        return evidence

    ref = evidence_refs.get(fixture_ref)
    testcase.assertIsNotNone(ref, f"unknown evidence fixture ref: {fixture_ref}")
    if ref is None:
        return {}

    fixture_path = _string_field(ref, "fixturePath", "fixture_path")
    testcase.assertIsNotNone(fixture_path, f"{fixture_ref} is missing fixturePath")
    path = _safe_repo_path(fixture_path or "")
    testcase.assertTrue(path.is_file(), fixture_path)
    testcase.assertEqual(path.parent, (ROOT / "examples" / "ingest-search").resolve())

    expected_sha = _string_field(ref, "sha256")
    if expected_sha is not None:
        testcase.assertEqual(sha256(path.read_bytes()).hexdigest(), expected_sha)

    return json.loads(path.read_text(encoding="utf-8"))


def _openapi_operations(
    testcase: unittest.TestCase,
    lines: list[str],
) -> dict[str, dict[str, str]]:
    operations: dict[str, dict[str, str]] = {}
    for path, expected in EXPECTED_OPERATIONS.items():
        path_block = _require_block(testcase, lines, path, 2)
        method_block = _require_block(testcase, path_block, "post", 4)
        operation_id = _value_after_prefix(method_block, "operationId:")
        response_block = _require_block(testcase, method_block, '"200"', 8)
        schema_ref = f'$ref: "#/components/schemas/{expected["response_schema"]}"'

        testcase.assertEqual(operation_id, expected["operation_id"])
        testcase.assertIn(schema_ref, _stripped_lines(response_block))
        operations[path] = {
            "operation_id": operation_id,
            "response_schema": expected["response_schema"],
        }
    return operations


def _route_row(
    testcase: unittest.TestCase,
    request: dict[str, Any],
    index: int,
) -> dict[str, str | None]:
    route = request.get("route")
    route_record = route if isinstance(route, dict) else {}
    method = _string_field(route_record, "method") or _string_field(request, "method")
    path = (
        _string_field(route_record, "path", "routePath", "route_path")
        or _string_field(request, "path", "routePath", "route_path")
        or _path_from_url(_string_field(route_record, "url") or _string_field(request, "url"))
    )
    operation_id = (
        _string_field(route_record, "operationId", "operation_id")
        or _string_field(request, "operationId", "operation_id")
    )

    label = _request_label(request, index)
    testcase.assertIsNotNone(method, f"{label} is missing a route method")
    testcase.assertIsNotNone(path, f"{label} is missing a route path")
    testcase.assertIn(path, EXPECTED_ROUTE_PATHS)

    return {
        "method": (method or "").upper(),
        "path": path or "",
        "operation_id": operation_id,
    }


def _request_body(request: dict[str, Any]) -> Any:
    request_value = request.get("request")
    if isinstance(request_value, dict) and "body" in request_value:
        return request_value["body"]
    return request.get("body")


def _response_body(request: dict[str, Any]) -> Any:
    response = request.get("response")
    if isinstance(response, dict) and "body" in response:
        return response["body"]
    return request.get("responseBody")


def _response_expectation(request: dict[str, Any]) -> dict[str, Any]:
    expect = request.get("expect")
    if isinstance(expect, dict):
        return expect
    response_body = _response_body(request)
    if isinstance(response_body, dict):
        return response_body
    raise AssertionError(f"{_request_label(request, 0)} is missing response expectations")


def _assert_sha256_fingerprint(
    testcase: unittest.TestCase,
    record: dict[str, Any],
    key: str,
) -> None:
    value = record.get(key)
    testcase.assertIsInstance(value, str)
    testcase.assertRegex(value or "", r"^sha256:[0-9a-f]{64}$")


def _request_label(request: dict[str, Any], index: int) -> str:
    return _string_field(request, "id", "requestId", "request_id") or f"requests[{index}]"


def _string_field(record: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, str) and value.strip() != "":
            return value
    return None


def _optional_boolean(record: dict[str, Any], *keys: str) -> bool | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, bool):
            return value
    return None


def _path_from_url(value: str | None) -> str | None:
    if value is None:
        return None
    parsed = urlparse(value)
    return parsed.path if parsed.scheme and parsed.path else None


def _is_local_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}


def _repo_path_references(value: Any) -> set[str]:
    paths: set[str] = set()
    for _path, text in _walk_strings(value):
        for match in REFERENCE_PATH_RE.findall(text):
            normalized = match.replace("\\", "/")
            if _looks_like_repo_path(normalized):
                paths.add(normalized)
    return paths


def _looks_like_repo_path(value: str) -> bool:
    normalized = value.replace("\\", "/")
    return normalized.startswith(("apps/", "docs/", "examples/", "packages/", "tests/"))


def _safe_repo_path(relative_path: str) -> Path:
    normalized = relative_path.replace("\\", "/")
    path = (ROOT / normalized).resolve()
    root = ROOT.resolve()
    if path != root and root not in path.parents:
        raise AssertionError(f"path escapes repository root: {relative_path}")
    return path


def _walk_strings(value: Any, path: str = "$") -> list[tuple[str, str]]:
    matches: list[tuple[str, str]] = []
    if isinstance(value, dict):
        for key, item in value.items():
            matches.extend(_walk_strings(item, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            matches.extend(_walk_strings(item, f"{path}[{index}]"))
    elif isinstance(value, str):
        matches.append((path, value))
    return matches


def _require_block(
    testcase: unittest.TestCase,
    lines: list[str],
    key: str,
    indent: int,
) -> list[str]:
    block = _find_block(lines, key, indent)
    testcase.assertIsNotNone(block, f"missing block {key!r} at indent {indent}")
    return block if block is not None else []


def _find_block(lines: list[str], key: str, indent: int) -> list[str] | None:
    prefix = " " * indent + key + ":"
    for index, line in enumerate(lines):
        if line.startswith(prefix):
            return _collect_block(lines, index, indent)
    return None


def _collect_block(lines: list[str], index: int, indent: int) -> list[str]:
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


def _value_after_prefix(lines: list[str], prefix: str) -> str:
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(prefix):
            return stripped[len(prefix) :].strip()
    raise AssertionError(f"missing {prefix}")


def _stripped_lines(lines: list[str]) -> set[str]:
    return {line.strip() for line in lines}


if __name__ == "__main__":
    unittest.main()
