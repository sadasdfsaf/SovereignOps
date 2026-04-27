from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]

DOC_PATH = "docs/plugin-review-artifact-api.md"
DOCS_TEST_PATH = "tests/test_plugin_review_artifact_api_docs.py"
ALIGNMENT_TEST_PATH = "tests/test_plugin_review_artifact_api_alignment.py"
ROUTE_PATH = "/v1/plugins/review-artifacts/preview"
SDK_ENDPOINT = "plugins/review-artifacts/preview"
OPERATION_ID = "previewPluginReviewArtifact"
CHECK_NAME = "plugin-review-artifact-api-alignment"

EXPECTED_PARENT_FILES = (
    "apps/api/src/pluginReviewArtifactRoutes.ts",
    "apps/api/tests/plugin-review-artifact-routes.test.mjs",
    "packages/sdk-js/src/pluginReviewArtifactClient.ts",
    "packages/sdk-js/tests/client-plugin-review-artifact.test.mjs",
    "packages/cli/src/pluginReviewArtifactApiReplay.ts",
    "packages/cli/tests/plugin-review-artifact-api-replay.test.mjs",
    "examples/plugins/release-notes/review-artifact-api-requests.json",
    "packages/schemas/src/pluginReviewArtifact.ts",
    "packages/schemas/tests/plugin-review-artifact.test.mjs",
    "packages/schemas/fixtures/plugin-review-artifact-preview.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-preview.invalid.json",
    "packages/schemas/fixtures/plugin-review-artifact-preview.schema.json",
    "apps/web/src/pluginReviewArtifactApiState.ts",
    "apps/web/tests/plugin-review-artifact-api-state.test.mjs",
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
    "apps/api/src/pluginReviewArtifactRoutes.ts": (
        "createPluginReviewArtifactRoutes",
        "mountPluginReviewArtifactRoutes",
    ),
    "packages/sdk-js/src/pluginReviewArtifactClient.ts": (
        "PluginReviewArtifactClient",
        "createPluginReviewArtifactClient",
    ),
    "packages/cli/src/pluginReviewArtifactApiReplay.ts": (
        "runPluginReviewArtifactApiReplayCli",
        "loadPluginReviewArtifactApiRequests",
        "isPluginReviewArtifactApiReplayCommand",
    ),
    "packages/schemas/src/pluginReviewArtifact.ts": (
        "PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION",
        "pluginReviewArtifactPreviewSchema",
        "pluginReviewArtifactPreviewSchemaDefinition",
        "validatePluginReviewArtifactPreview",
        "assertPluginReviewArtifactPreview",
    ),
    "apps/web/src/pluginReviewArtifactApiState.ts": (
        "buildPluginReviewArtifactApiState",
    ),
}

EXPECTED_REEXPORTS = {
    "apps/api/src/index.ts": ("./pluginReviewArtifactRoutes.ts",),
    "packages/sdk-js/src/index.ts": ("./pluginReviewArtifactClient.ts",),
    "packages/cli/src/index.ts": ("./pluginReviewArtifactApiReplay.ts",),
    "packages/schemas/src/index.ts": ("./pluginReviewArtifact.ts",),
    "apps/web/src/main.ts": ("./pluginReviewArtifactApiState.ts",),
}

EXPECTED_PACKAGE_SCRIPT_TESTS = {
    "apps/api/package.json": ("tests/plugin-review-artifact-routes.test.mjs",),
    "packages/sdk-js/package.json": ("tests/client-plugin-review-artifact.test.mjs",),
    "packages/cli/package.json": ("tests/plugin-review-artifact-api-replay.test.mjs",),
    "packages/schemas/package.json": ("tests/plugin-review-artifact.test.mjs",),
    "apps/web/package.json": ("tests/plugin-review-artifact-api-state.test.mjs",),
}

EXPECTED_DOC_REFERENCES = (
    DOC_PATH,
    DOCS_TEST_PATH,
    ALIGNMENT_TEST_PATH,
    ROUTE_PATH,
    SDK_ENDPOINT,
    OPERATION_ID,
    CHECK_NAME,
    *EXPECTED_PARENT_FILES,
)

EXPECTED_CLI_FIXTURE_PATHS = (
    "examples/plugins/release-notes/plugin.json",
    "examples/plugins/release-notes/review-artifact.json",
)

EXPECTED_SCHEMA_FIXTURES = (
    "packages/schemas/fixtures/plugin-review-artifact-preview.valid.json",
    "packages/schemas/fixtures/plugin-review-artifact-preview.invalid.json",
    "packages/schemas/fixtures/plugin-review-artifact-preview.schema.json",
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


class PluginReviewArtifactApiAlignmentTests(unittest.TestCase):
    def test_docs_declare_round27_api_surface(self) -> None:
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
        route_text = read_text("apps/api/src/pluginReviewArtifactRoutes.ts")
        route_test = read_text("apps/api/tests/plugin-review-artifact-routes.test.mjs")
        openapi_text = read_text("docs/openapi.yaml")

        self.assertIn("/v1/plugins/review-artifacts", route_text)
        self.assertIn("/preview", route_text)
        self.assertIn(ROUTE_PATH, route_test)
        self.assertIn(ROUTE_PATH + ":", openapi_text)
        self.assertIn(f"operationId: {OPERATION_ID}", openapi_text)
        self.assertIn("PluginReviewArtifactPreviewRequest", openapi_text)
        self.assertIn("PluginReviewArtifactPreviewResponse", openapi_text)

    def test_sdk_endpoint_and_cli_fixture_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        sdk_text = read_text("packages/sdk-js/src/pluginReviewArtifactClient.ts")
        sdk_test = read_text("packages/sdk-js/tests/client-plugin-review-artifact.test.mjs")
        cli_text = read_text("packages/cli/src/pluginReviewArtifactApiReplay.ts")
        cli_test = read_text("packages/cli/tests/plugin-review-artifact-api-replay.test.mjs")
        fixture = read_json("examples/plugins/release-notes/review-artifact-api-requests.json")

        self.assertIn(SDK_ENDPOINT, sdk_text)
        self.assertRegex(sdk_text, r"\bpreview\s*\(")
        self.assertIn("previewArtifact", sdk_text)
        self.assertIn(ROUTE_PATH, sdk_test)
        self.assertIn(ROUTE_PATH, cli_text)
        self.assertIn("review-artifact-api-requests.json", cli_test)

        requests = request_records(fixture)
        self.assertGreater(len(requests), 0)
        for request in requests:
            with self.subTest(request=request_label(request)):
                self.assertEqual(route_method(request), "POST")
                self.assertEqual(route_path(request), ROUTE_PATH)
                if expected_status(request) < 400:
                    self.assertEqual(response_kind(request), "plugin-review-artifact.preview")
                for relative_path in EXPECTED_CLI_FIXTURE_PATHS:
                    self.assertIn(relative_path, json.dumps(request, sort_keys=True))

    def test_schema_fixtures_and_web_helper_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        schema_text = read_text("packages/schemas/src/pluginReviewArtifact.ts")
        web_text = read_text("apps/web/src/pluginReviewArtifactApiState.ts")
        web_test = read_text("apps/web/tests/plugin-review-artifact-api-state.test.mjs")

        for rel_path in EXPECTED_SCHEMA_FIXTURES:
            with self.subTest(schema_fixture=rel_path):
                self.assertTrue((ROOT / rel_path).is_file(), rel_path)

        valid_fixture = read_json("packages/schemas/fixtures/plugin-review-artifact-preview.valid.json")
        schema_fixture = read_json("packages/schemas/fixtures/plugin-review-artifact-preview.schema.json")
        self.assertEqual(value_at(valid_fixture, ("schemaVersion",)), "plugin-review-artifact-preview.v1")
        self.assertEqual(value_at(valid_fixture, ("preview", "artifactType")), "pluginReviewArtifact")
        self.assertIn("plugin-review-artifact-preview.v1", json.dumps(schema_fixture, sort_keys=True))
        self.assertIn("pluginReviewArtifactPreviewSchema", schema_text)
        self.assertIn("buildPluginReviewArtifactApiState", web_text)
        self.assertIn("buildPluginReviewArtifactApiState", web_test)

    def test_release_check_and_repo_health_wiring_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        release_check = read_text("scripts/release_check.py")
        repo_health = read_text("scripts/repo_health.py")

        self.assertIn(CHECK_NAME, release_check)
        self.assertIn("tests.test_plugin_review_artifact_api_alignment", release_check)
        for rel_path in EXPECTED_ALL_FILES:
            with self.subTest(path=rel_path):
                self.assertIn(rel_path, release_check)
                self.assertIn(rel_path, repo_health)

    def test_public_slice_avoids_private_remote_and_guarded_values(self) -> None:
        scan_paths = [
            DOC_PATH,
            DOCS_TEST_PATH,
            ALIGNMENT_TEST_PATH,
            *(path for path in EXPECTED_PARENT_FILES if (ROOT / path).is_file()),
        ]
        for rel_path in scan_paths:
            text = read_text(rel_path)
            lower_text = text.lower()
            with self.subTest(path=rel_path, check="private"):
                for marker in PRIVATE_PATH_MARKERS:
                    self.assertNotIn(marker.lower(), lower_text)

            with self.subTest(path=rel_path, check="guarded"):
                assert_no_guarded_words(self, rel_path, text)

            if rel_path == DOC_PATH or (rel_path.endswith(".json") and not rel_path.endswith(".schema.json")):
                with self.subTest(path=rel_path, check="remote"):
                    for marker in REMOTE_MARKERS:
                        self.assertNotIn(marker, lower_text)
                with self.subTest(path=rel_path, check="secret"):
                    for pattern in SECRET_VALUE_PATTERNS:
                        self.assertIsNone(pattern.search(text))

            for public_path in extract_repo_paths(text):
                with self.subTest(path=rel_path, public_path=public_path):
                    assert_safe_public_path(self, public_path)


def require_parent_slice(testcase: unittest.TestCase) -> None:
    if parent_slice_ready():
        missing = [path for path in EXPECTED_PARENT_FILES if not (ROOT / path).is_file()]
        if missing:
            testcase.fail("parent plugin review artifact API slice is incomplete: " + ", ".join(missing))
        return
    testcase.skipTest("parent plugin review artifact API slice is not fully integrated yet")


def parent_slice_ready() -> bool:
    if all((ROOT / path).is_file() for path in EXPECTED_PARENT_FILES):
        return True
    release_check = ROOT / "scripts" / "release_check.py"
    return release_check.is_file() and CHECK_NAME in release_check.read_text(encoding="utf-8")


def read_text(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def read_json(rel_path: str) -> Any:
    return json.loads(read_text(rel_path))


def assert_ts_exported(testcase: unittest.TestCase, text: str, symbol: str) -> None:
    direct_export = re.compile(
        rf"\bexport\s+(?:async\s+)?(?:const|function|class|interface|type)\s+"
        rf"{re.escape(symbol)}\b"
    )
    named_export = re.compile(rf"\bexport\s*\{{[^}}]*\b{re.escape(symbol)}\b[^}}]*\}}")
    testcase.assertTrue(
        direct_export.search(text) or named_export.search(text),
        f"{symbol} is not exported",
    )


def request_records(fixture: Any) -> list[dict[str, Any]]:
    if not isinstance(fixture, dict):
        raise AssertionError("fixture root must be an object")
    for key in ("requests", "apiRequests", "api_requests"):
        value = fixture.get(key)
        if isinstance(value, list):
            records = [item for item in value if isinstance(item, dict)]
            if len(records) != len(value):
                raise AssertionError(f"{key} must contain only objects")
            return records
    raise AssertionError("fixture must define a requests array")


def request_label(request: dict[str, Any]) -> str:
    for key in ("id", "requestId", "request_id"):
        value = request.get(key)
        if isinstance(value, str):
            return value
    return "request"


def route_method(request: dict[str, Any]) -> str:
    route = request.get("route")
    route_record = route if isinstance(route, dict) else {}
    value = route_record.get("method") or request.get("method")
    return value.upper() if isinstance(value, str) else ""


def route_path(request: dict[str, Any]) -> str:
    route = request.get("route")
    route_record = route if isinstance(route, dict) else {}
    for record in (route_record, request):
        for key in ("path", "routePath", "route_path"):
            value = record.get(key)
            if isinstance(value, str):
                return value
    return ""


def response_kind(request: dict[str, Any]) -> str:
    for record_key in ("expect", "response", "responseBody"):
        record = request.get(record_key)
        if isinstance(record, dict):
            if isinstance(record.get("kind"), str):
                return record["kind"]
            body = record.get("body")
            if isinstance(body, dict) and isinstance(body.get("kind"), str):
                return body["kind"]
    return ""


def expected_status(request: dict[str, Any]) -> int:
    for record_key in ("expect", "response", "responseBody"):
        record = request.get(record_key)
        if isinstance(record, dict) and isinstance(record.get("status"), int):
            return record["status"]
    return 0


def value_at(value: Any, keys: tuple[str, ...]) -> Any:
    current = value
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def extract_repo_paths(text: str) -> set[str]:
    paths = {match.replace("\\", "/") for match in PATH_REF_RE.findall(text)}
    return {path for path in paths if not has_private_or_parent_segment(path)}


def assert_safe_public_path(testcase: unittest.TestCase, public_path: str) -> None:
    normalized = public_path.replace("\\", "/")
    testcase.assertFalse(normalized.startswith(("/", "./", "../")), public_path)
    testcase.assertIsNone(re.match(r"(?i)^[a-z]:/", normalized), public_path)
    testcase.assertFalse(has_private_or_parent_segment(normalized), public_path)

    path = (ROOT / normalized).resolve()
    root = ROOT.resolve()
    testcase.assertTrue(path == root or root in path.parents, public_path)
    if (ROOT / normalized).exists():
        testcase.assertTrue(path.is_file(), public_path)


def has_private_or_parent_segment(relative_path: str) -> bool:
    parts = Path(relative_path.replace("\\", "/")).parts
    return ".." in parts or "".join((".codex", "-private")) in parts


def assert_no_guarded_words(testcase: unittest.TestCase, rel_path: str, text: str) -> None:
    lower_text = text.lower()
    guarded_words = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
    guarded_words.extend([
        "public" + "-" + "sector",
        "public" + " " + "sector",
    ])

    for word in guarded_words:
        if word.isascii():
            escaped = re.escape(word).replace(r"\ ", r"\s+")
            pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
            testcase.assertIsNone(
                pattern.search(lower_text),
                f"{rel_path} contains guarded wording",
            )
        else:
            testcase.assertNotIn(word, lower_text, f"{rel_path} contains guarded wording")


if __name__ == "__main__":
    unittest.main()
