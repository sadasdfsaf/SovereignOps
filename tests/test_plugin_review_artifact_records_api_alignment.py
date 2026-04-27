from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]

DOC_PATH = "docs/plugin-review-artifact-records-api.md"
DOCS_TEST_PATH = "tests/test_plugin_review_artifact_records_api_docs.py"
ALIGNMENT_TEST_PATH = "tests/test_plugin_review_artifact_records_api_alignment.py"
ROUTE_BASE = "/v1/plugins/review-artifacts/records"
ROUTE_DETAIL = "/v1/plugins/review-artifacts/records/{recordId}"
ROUTE_COMPARE = "/v1/plugins/review-artifacts/records/{recordId}/compare"
SDK_ENDPOINT = "plugins/review-artifacts/records"
CHECK_NAME = "plugin-review-artifact-records-api-alignment"

EXPECTED_OPERATION_IDS = (
    "createPluginReviewArtifactRecord",
    "listPluginReviewArtifactRecords",
    "getPluginReviewArtifactRecord",
    "comparePluginReviewArtifactRecord",
)

EXPECTED_PARENT_FILES = (
    "packages/plugin-sdk/src/reviewArtifactRecords.ts",
    "packages/plugin-sdk/tests/review-artifact-records.test.mjs",
    "apps/api/src/pluginReviewArtifactRecordRoutes.ts",
    "apps/api/tests/plugin-review-artifact-record-routes.test.mjs",
    "packages/sdk-js/src/pluginReviewArtifactRecordClient.ts",
    "packages/sdk-js/tests/client-plugin-review-artifact-record.test.mjs",
    "packages/cli/src/pluginReviewArtifactRecordsReplay.ts",
    "packages/cli/tests/plugin-review-artifact-records-replay.test.mjs",
    "examples/plugins/release-notes/review-artifact-records-requests.json",
    "packages/schemas/src/pluginReviewArtifactRecord.ts",
    "packages/schemas/tests/plugin-review-artifact-record.test.mjs",
    "packages/schemas/fixtures/plugin-review-artifact-record.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record.invalid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record.schema.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-list.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-list.schema.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-comparison.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-comparison.schema.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-create-request.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-create-request.schema.json",
    "apps/web/src/pluginReviewArtifactRecordState.ts",
    "apps/web/tests/plugin-review-artifact-record-state.test.mjs",
)

EXPECTED_ALL_FILES = (
    DOC_PATH,
    DOCS_TEST_PATH,
    ALIGNMENT_TEST_PATH,
    "docs/openapi.yaml",
    "scripts/release_check.py",
    "scripts/repo_health.py",
    *EXPECTED_PARENT_FILES,
)

EXPECTED_EXPORTS = {
    "packages/plugin-sdk/src/reviewArtifactRecords.ts": (
        "createPluginReviewArtifactRecord",
        "createPluginReviewArtifactRecordStore",
        "comparePluginReviewArtifactToRecord",
        "PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION",
    ),
    "apps/api/src/pluginReviewArtifactRecordRoutes.ts": (
        "createInMemoryPluginReviewArtifactRecordStore",
        "createPluginReviewArtifactRecordRoutes",
        "mountPluginReviewArtifactRecordRoutes",
    ),
    "packages/sdk-js/src/pluginReviewArtifactRecordClient.ts": (
        "PluginReviewArtifactRecordClient",
        "createPluginReviewArtifactRecordClient",
    ),
    "packages/cli/src/pluginReviewArtifactRecordsReplay.ts": (
        "runPluginReviewArtifactRecordsReplayCli",
        "loadPluginReviewArtifactRecordsRequests",
        "isPluginReviewArtifactRecordsReplayCommand",
    ),
    "packages/schemas/src/pluginReviewArtifactRecord.ts": (
        "PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION",
        "pluginReviewArtifactRecordSchema",
        "pluginReviewArtifactRecordSchemaDefinitions",
        "validatePluginReviewArtifactRecord",
        "assertPluginReviewArtifactRecord",
    ),
    "apps/web/src/pluginReviewArtifactRecordState.ts": (
        "buildPluginReviewArtifactRecordState",
    ),
}

EXPECTED_REEXPORTS = {
    "packages/plugin-sdk/src/index.ts": ("./reviewArtifactRecords.ts",),
    "apps/api/src/index.ts": ("./pluginReviewArtifactRecordRoutes.ts",),
    "packages/sdk-js/src/index.ts": ("./pluginReviewArtifactRecordClient.ts",),
    "packages/cli/src/index.ts": ("./pluginReviewArtifactRecordsReplay.ts",),
    "packages/schemas/src/index.ts": ("./pluginReviewArtifactRecord.ts",),
    "apps/web/src/main.ts": ("./pluginReviewArtifactRecordState.ts",),
}

EXPECTED_PACKAGE_SCRIPT_TESTS = {
    "packages/plugin-sdk/package.json": ("tests/review-artifact-records.test.mjs",),
    "apps/api/package.json": ("tests/plugin-review-artifact-record-routes.test.mjs",),
    "packages/sdk-js/package.json": ("tests/client-plugin-review-artifact-record.test.mjs",),
    "packages/cli/package.json": ("tests/plugin-review-artifact-records-replay.test.mjs",),
    "packages/schemas/package.json": ("tests/plugin-review-artifact-record.test.mjs",),
    "apps/web/package.json": ("tests/plugin-review-artifact-record-state.test.mjs",),
}

EXPECTED_DOC_REFERENCES = (
    DOC_PATH,
    DOCS_TEST_PATH,
    ALIGNMENT_TEST_PATH,
    ROUTE_BASE,
    ROUTE_DETAIL,
    ROUTE_COMPARE,
    SDK_ENDPOINT,
    CHECK_NAME,
    *EXPECTED_OPERATION_IDS,
    *EXPECTED_PARENT_FILES,
)

EXPECTED_SCHEMA_FIXTURES = (
    "packages/schemas/fixtures/plugin-review-artifact-record.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record.invalid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record.schema.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-list.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-list.schema.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-comparison.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-comparison.schema.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-create-request.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-create-request.schema.json",
)

PUBLIC_SAFE_TEXT_FILES = (
    DOC_PATH,
    "examples/plugins/release-notes/review-artifact-records-requests.json",
    "packages/schemas/fixtures/plugin-review-artifact-record.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-list.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-comparison.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-record-create-request.valid.json",
)

PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "".join((".codex", "-private")),
    "".join((".codex", "-run")),
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog.jsonl",
    "tasks" + "\\backlog.jsonl",
)

REMOTE_MARKERS = (
    "http" + "://",
    "https" + "://",
    "curl ",
    "invoke-restmethod",
    "start-process",
    "localhost",
    "127.0.0.1",
    "npm install -g",
    "npx ",
)

SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+"),
    re.compile(
        r"(?i)(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*"
        r"(?!\[REDACTED\])\S{4,}"
    ),
)

PATH_REF_RE = re.compile(
    r"(?<![A-Za-z0-9_.-])"
    r"((?:apps|docs|examples|packages|scripts|tests)[/\\]"
    r"[A-Za-z0-9_./\\-]+?\.(?:json|md|mjs|py|ts|yaml))"
    r"(?![A-Za-z0-9_.-])"
)


class PluginReviewArtifactRecordsApiAlignmentTests(unittest.TestCase):
    def test_docs_declare_records_api_surface(self) -> None:
        text = read_text(DOC_PATH)
        for reference in EXPECTED_DOC_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, text)

    def test_expected_files_exist_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        for rel_path in EXPECTED_ALL_FILES:
            with self.subTest(path=rel_path):
                self.assertTrue((ROOT / rel_path).is_file(), rel_path)

    def test_expected_symbols_are_exported_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        for rel_path, symbols in EXPECTED_EXPORTS.items():
            text = read_text(rel_path)
            for symbol in symbols:
                with self.subTest(path=rel_path, symbol=symbol):
                    assert_ts_exported(self, text, symbol)

        for rel_path, reexports in EXPECTED_REEXPORTS.items():
            text = read_text(rel_path)
            for reexport in reexports:
                with self.subTest(path=rel_path, reexport=reexport):
                    self.assertIn(f'export * from "{reexport}";', text)

    def test_package_scripts_include_focused_tests_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        for rel_path, expected_tests in EXPECTED_PACKAGE_SCRIPT_TESTS.items():
            package = read_json(rel_path)
            for script_name in ("check", "test"):
                script = package["scripts"][script_name]
                for expected_test in expected_tests:
                    with self.subTest(path=rel_path, script=script_name, test=expected_test):
                        self.assertEqual(script.count(expected_test), 1, script)

    def test_route_path_and_openapi_contract_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        route_text = read_text("apps/api/src/pluginReviewArtifactRecordRoutes.ts")
        route_test = read_text("apps/api/tests/plugin-review-artifact-record-routes.test.mjs")
        openapi_text = read_text("docs/openapi.yaml")

        self.assertIn(ROUTE_BASE, route_text)
        self.assertIn(":recordId/compare", route_text)
        for expected_route in (
            ROUTE_BASE,
            "/v1/plugins/review-artifacts/records/plugin-review-preview-1/compare",
        ):
            with self.subTest(expected_route=expected_route):
                self.assertIn(expected_route, route_test)

        self.assertIn(ROUTE_BASE + ":", openapi_text)
        self.assertIn(ROUTE_DETAIL + ":", openapi_text)
        self.assertIn(ROUTE_COMPARE + ":", openapi_text)
        for operation_id in EXPECTED_OPERATION_IDS:
            with self.subTest(operation_id=operation_id):
                self.assertIn(f"operationId: {operation_id}", openapi_text)

        for schema_name in (
            "PluginReviewArtifactRecordCreateRequest",
            "PluginReviewArtifactRecordCreateResponse",
            "PluginReviewArtifactRecordListResponse",
            "PluginReviewArtifactRecordGetResponse",
            "PluginReviewArtifactRecordCompareRequest",
            "PluginReviewArtifactRecordCompareResponse",
        ):
            with self.subTest(schema_name=schema_name):
                self.assertIn(schema_name, openapi_text)

    def test_sdk_endpoint_and_cli_fixture_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        sdk_text = read_text("packages/sdk-js/src/pluginReviewArtifactRecordClient.ts")
        sdk_test = read_text("packages/sdk-js/tests/client-plugin-review-artifact-record.test.mjs")
        cli_text = read_text("packages/cli/src/pluginReviewArtifactRecordsReplay.ts")
        cli_test = read_text("packages/cli/tests/plugin-review-artifact-records-replay.test.mjs")
        fixture = read_json("examples/plugins/release-notes/review-artifact-records-requests.json")

        self.assertIn(SDK_ENDPOINT, sdk_text)
        for method_name in ("create", "list", "get", "compare"):
            with self.subTest(method_name=method_name):
                self.assertRegex(sdk_text, rf"\b{method_name}\s*\(")
        self.assertIn(ROUTE_BASE, sdk_test)
        self.assertIn(ROUTE_BASE, cli_text)
        self.assertIn("review-artifact-records-requests.json", cli_test)

        requests = request_records(fixture)
        self.assertEqual(len(requests), 4)
        methods = {route_method(request) for request in requests}
        self.assertEqual(methods, {"GET", "POST"})
        endpoints = {route_path(request) for request in requests}
        self.assertIn(ROUTE_BASE, endpoints)
        self.assertTrue(any(path.startswith(ROUTE_BASE + "/") for path in endpoints))

        for request in requests:
            with self.subTest(request=request_label(request)):
                self.assertTrue(route_path(request).startswith(ROUTE_BASE))
                self.assertIn(expected_status(request), {200, 201})
                self.assertTrue(response_kind(request).startswith("plugin-review-artifact.record"))

    def test_schema_fixtures_sdk_and_web_helper_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        record_text = read_text("packages/plugin-sdk/src/reviewArtifactRecords.ts")
        schema_text = read_text("packages/schemas/src/pluginReviewArtifactRecord.ts")
        web_text = read_text("apps/web/src/pluginReviewArtifactRecordState.ts")
        web_test = read_text("apps/web/tests/plugin-review-artifact-record-state.test.mjs")

        for rel_path in EXPECTED_SCHEMA_FIXTURES:
            with self.subTest(schema_fixture=rel_path):
                self.assertTrue((ROOT / rel_path).is_file(), rel_path)

        valid_fixture = read_json("packages/schemas/fixtures/plugin-review-artifact-record.valid.json")
        list_fixture = read_json("packages/schemas/fixtures/plugin-review-artifact-record-list.valid.json")
        comparison_fixture = read_json(
            "packages/schemas/fixtures/plugin-review-artifact-record-comparison.valid.json"
        )
        create_fixture = read_json(
            "packages/schemas/fixtures/plugin-review-artifact-record-create-request.valid.json"
        )
        schema_fixture = read_json("packages/schemas/fixtures/plugin-review-artifact-record.schema.json")

        self.assertEqual(valid_fixture["schemaVersion"], "plugin-review-artifact-record/v1")
        self.assertEqual(list_fixture["schemaVersion"], "plugin-review-artifact-record-list/v1")
        self.assertEqual(
            comparison_fixture["schemaVersion"],
            "plugin-review-artifact-record-comparison/v1",
        )
        self.assertEqual(
            create_fixture["schemaVersion"],
            "plugin-review-artifact-record-create-request/v1",
        )
        self.assertEqual(schema_fixture["title"], "Persisted plugin review artifact record")
        self.assertTrue(valid_fixture["localOnly"])
        self.assertTrue(valid_fixture["redacted"])
        self.assertIn("artifactFingerprint", valid_fixture)
        self.assertIn("[REDACTED]", json.dumps(valid_fixture, sort_keys=True))
        self.assertIn("createPluginReviewArtifactRecordFingerprint", record_text)
        self.assertIn("comparePluginReviewArtifactToRecord", record_text)
        self.assertIn("validatePluginReviewArtifactRecord", schema_text)
        self.assertIn("buildPluginReviewArtifactRecordState", web_text)
        self.assertIn("drift", web_test.lower())

    def test_release_and_health_wiring_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        release_text = read_text("scripts/release_check.py")
        health_text = read_text("scripts/repo_health.py")
        for expected in (
            CHECK_NAME,
            "docs/plugin-review-artifact-records-api.md",
            "tests/test_plugin_review_artifact_records_api_docs.py",
            "tests/test_plugin_review_artifact_records_api_alignment.py",
            "apps/api/src/pluginReviewArtifactRecordRoutes.ts",
            "packages/sdk-js/src/pluginReviewArtifactRecordClient.ts",
            "packages/cli/src/pluginReviewArtifactRecordsReplay.ts",
            "packages/schemas/src/pluginReviewArtifactRecord.ts",
            "apps/web/src/pluginReviewArtifactRecordState.ts",
            "packages/plugin-sdk/src/reviewArtifactRecords.ts",
            "examples/plugins/release-notes/review-artifact-records-requests.json",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, release_text + "\n" + health_text)

    def test_examples_and_docs_are_public_safe_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        combined_text = "\n".join(read_text(rel_path) for rel_path in PUBLIC_SAFE_TEXT_FILES)
        lower_text = combined_text.lower()

        for marker in PRIVATE_PATH_MARKERS + REMOTE_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker.lower(), lower_text)

        guarded_terms = {"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS}
        guarded_terms.update({
            "public" + "-sector",
            "public" + " " + "sector",
        })
        for term in sorted(guarded_terms):
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(lower_text))
                else:
                    self.assertNotIn(term, lower_text)

        for pattern in SECRET_VALUE_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(combined_text))

        self.assertIsNone(re.search(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]", combined_text))
        for reference in PATH_REF_RE.findall(combined_text):
            with self.subTest(reference=reference):
                normalized = reference.replace("\\", "/")
                self.assertFalse(normalized.startswith(("/", "./", "../")))
                self.assertNotIn("..", Path(normalized).parts)
                self.assertFalse(re.match(r"(?i)^[a-z]:/", normalized))


def require_parent_slice(testcase: unittest.TestCase) -> None:
    missing = [rel_path for rel_path in EXPECTED_PARENT_FILES if not (ROOT / rel_path).is_file()]
    if missing:
        testcase.skipTest("parent implementation files are not present yet: " + ", ".join(missing))


def read_text(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def read_json(rel_path: str) -> Any:
    return json.loads(read_text(rel_path))


def assert_ts_exported(testcase: unittest.TestCase, text: str, symbol: str) -> None:
    patterns = (
        rf"export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+{re.escape(symbol)}\b",
        rf"export\s*\{{[^}}]*\b{re.escape(symbol)}\b[^}}]*\}}",
    )
    testcase.assertTrue(
        any(re.search(pattern, text, flags=re.DOTALL) for pattern in patterns),
        f"expected exported symbol {symbol}",
    )


def request_records(fixture: Any) -> list[dict[str, Any]]:
    if isinstance(fixture, dict) and isinstance(fixture.get("requests"), list):
        return [item for item in fixture["requests"] if isinstance(item, dict)]
    if isinstance(fixture, list):
        return [item for item in fixture if isinstance(item, dict)]
    return []


def request_label(request: dict[str, Any]) -> str:
    value = request.get("id") or request.get("title")
    return value if isinstance(value, str) else "<unnamed>"


def route_method(request: dict[str, Any]) -> str:
    route = request.get("route")
    method = route.get("method") if isinstance(route, dict) else request.get("method")
    return method.upper() if isinstance(method, str) else ""


def route_path(request: dict[str, Any]) -> str:
    route = request.get("route")
    path = route.get("path") if isinstance(route, dict) else request.get("path") or request.get("routePath")
    return path if isinstance(path, str) else ""


def expected_status(request: dict[str, Any]) -> int:
    expect = request.get("expect")
    status = expect.get("status") if isinstance(expect, dict) else request.get("expectedStatus")
    return status if isinstance(status, int) else 200


def response_kind(request: dict[str, Any]) -> str:
    expect = request.get("expect")
    if isinstance(expect, dict) and isinstance(expect.get("kind"), str):
        return expect["kind"]
    expected_body = request.get("expectedBody")
    if isinstance(expected_body, dict) and isinstance(expected_body.get("kind"), str):
        return expected_body["kind"]
    checks = request.get("expectedChecks")
    if isinstance(checks, dict) and isinstance(checks.get("kind"), str):
        return checks["kind"]
    return ""


if __name__ == "__main__":
    unittest.main()
