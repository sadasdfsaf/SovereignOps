from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]

DOC_PATH = "docs/workspace-session-api.md"
ALIGNMENT_TEST_PATH = "tests/test_workspace_session_api_alignment.py"
SECURITY_TEST_PATH = "tests/security/workspace_session_api_threats.test.mjs"
ROUTE_BASE = "/v1/workspace-session"
ROUTE_SUMMARY = "/v1/workspace-session/summary"
ROUTE_AUDIT_PREVIEW = "/v1/workspace-session/audit-preview"
SDK_SUMMARY_ENDPOINT = "workspace-session/summary"
SDK_AUDIT_PREVIEW_ENDPOINT = "workspace-session/audit-preview"
CHECK_NAME = "workspace-session-api-alignment"

EXPECTED_OPERATION_IDS = (
    "summarizeWorkspaceSession",
    "previewWorkspaceSessionAudit",
)

EXPECTED_PARENT_FILES = (
    "apps/api/src/workspaceSessionRoutes.ts",
    "apps/api/tests/workspace-session-routes.test.mjs",
    "packages/sdk-js/src/localWorkspaceSessionApiClient.ts",
    "packages/sdk-js/tests/local-workspace-session-api-client.test.mjs",
    "packages/cli/src/workspaceSessionApiReplay.ts",
    "packages/cli/tests/workspace-session-api-replay.test.mjs",
    "apps/web/src/workspaceSessionApiState.ts",
    "apps/web/tests/workspace-session-api-state.test.mjs",
    DOC_PATH,
    "examples/workspace-session/api-requests.json",
)

EXPECTED_ALL_FILES = (
    ALIGNMENT_TEST_PATH,
    SECURITY_TEST_PATH,
    "docs/openapi.yaml",
    "scripts/release_check.py",
    "scripts/repo_health.py",
    "apps/api/package.json",
    "packages/sdk-js/package.json",
    "packages/cli/package.json",
    "apps/web/package.json",
    *EXPECTED_PARENT_FILES,
)

EXPECTED_EXPORTS = {
    "apps/api/src/workspaceSessionRoutes.ts": (
        "createWorkspaceSessionRoutes",
        "mountWorkspaceSessionRoutes",
    ),
    "packages/sdk-js/src/localWorkspaceSessionApiClient.ts": (
        "LocalWorkspaceSessionApiClient",
        "createLocalWorkspaceSessionApiClient",
    ),
    "packages/cli/src/workspaceSessionApiReplay.ts": (
        "runWorkspaceSessionApiReplayCli",
        "loadWorkspaceSessionApiRequests",
        "isWorkspaceSessionApiReplayCommand",
    ),
    "apps/web/src/workspaceSessionApiState.ts": (
        "buildWorkspaceSessionApiState",
    ),
}

EXPECTED_REEXPORTS = {
    "apps/api/src/index.ts": ("./workspaceSessionRoutes.ts",),
    "packages/sdk-js/src/index.ts": ("./localWorkspaceSessionApiClient.ts",),
    "packages/cli/src/index.ts": ("./workspaceSessionApiReplay.ts",),
    "apps/web/src/main.ts": ("./workspaceSessionApiState.ts",),
}

EXPECTED_PACKAGE_SCRIPT_TESTS = {
    "apps/api/package.json": ("tests/workspace-session-routes.test.mjs",),
    "packages/sdk-js/package.json": ("tests/local-workspace-session-api-client.test.mjs",),
    "packages/cli/package.json": ("tests/workspace-session-api-replay.test.mjs",),
    "apps/web/package.json": ("tests/workspace-session-api-state.test.mjs",),
}

EXPECTED_DOC_REFERENCES = (
    DOC_PATH,
    ALIGNMENT_TEST_PATH,
    SECURITY_TEST_PATH,
    ROUTE_BASE,
    ROUTE_SUMMARY,
    ROUTE_AUDIT_PREVIEW,
    SDK_SUMMARY_ENDPOINT,
    SDK_AUDIT_PREVIEW_ENDPOINT,
    CHECK_NAME,
    *EXPECTED_OPERATION_IDS,
    *EXPECTED_PARENT_FILES,
)

PUBLIC_SAFE_TEXT_FILES = (
    DOC_PATH,
    "examples/workspace-session/api-requests.json",
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
    "https" + "://",
    "curl ",
    "invoke-restmethod",
    "start-process",
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
        r"(?i)(?<!\[redacted:lock)(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*"
        r"(?!\[REDACTED\])\S{4,}"
    ),
)

PATH_REF_RE = re.compile(
    r"(?<![A-Za-z0-9_.-])"
    r"((?:apps|docs|examples|packages|scripts|tests)[/\\]"
    r"[A-Za-z0-9_./\\-]+?\.(?:json|md|mjs|py|ts|yaml))"
    r"(?![A-Za-z0-9_.-])"
)


class WorkspaceSessionApiAlignmentTests(unittest.TestCase):
    def test_docs_declare_workspace_session_api_surface_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
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
            scripts = package.get("scripts", {})
            for script_name in ("check", "test"):
                script = scripts.get(script_name, "")
                for expected_test in expected_tests:
                    with self.subTest(path=rel_path, script=script_name, test=expected_test):
                        self.assertEqual(script.count(expected_test), 1, script)

    def test_route_path_openapi_and_fixture_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        route_text = read_text("apps/api/src/workspaceSessionRoutes.ts")
        route_test = read_text("apps/api/tests/workspace-session-routes.test.mjs")
        openapi_text = read_text("docs/openapi.yaml")
        fixture = read_json("examples/workspace-session/api-requests.json")

        for route in (ROUTE_SUMMARY, ROUTE_AUDIT_PREVIEW):
            with self.subTest(route=route):
                self.assertIn(route, route_test)
                self.assertIn(route + ":", openapi_text)

        self.assertIn(ROUTE_BASE, route_text)
        for operation_id in EXPECTED_OPERATION_IDS:
            with self.subTest(operation_id=operation_id):
                self.assertIn(f"operationId: {operation_id}", openapi_text)

        requests = request_records(fixture)
        self.assertGreaterEqual(len(requests), 2)
        seen_routes = {(route_method(request), route_path(request)) for request in requests}
        self.assertIn(("POST", ROUTE_SUMMARY), seen_routes)
        self.assertIn(("POST", ROUTE_AUDIT_PREVIEW), seen_routes)

        for request in requests:
            with self.subTest(request=request_label(request)):
                self.assertTrue(route_path(request).startswith(ROUTE_BASE))
                self.assertEqual(route_method(request), "POST")
                self.assertIn(expected_status(request), {200, 201, 400, 403})

    def test_sdk_cli_and_web_state_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        sdk_text = read_text("packages/sdk-js/src/localWorkspaceSessionApiClient.ts")
        sdk_test = read_text("packages/sdk-js/tests/local-workspace-session-api-client.test.mjs")
        cli_text = read_text("packages/cli/src/workspaceSessionApiReplay.ts")
        cli_test = read_text("packages/cli/tests/workspace-session-api-replay.test.mjs")
        web_text = read_text("apps/web/src/workspaceSessionApiState.ts")
        web_test = read_text("apps/web/tests/workspace-session-api-state.test.mjs")

        self.assertIn(SDK_SUMMARY_ENDPOINT, sdk_text)
        self.assertIn(SDK_AUDIT_PREVIEW_ENDPOINT, sdk_text)
        for method_name in ("summary", "getSummary", "auditPreview", "previewAudit"):
            with self.subTest(method_name=method_name):
                self.assertRegex(sdk_text, rf"\b{method_name}\s*\(")

        self.assertIn(SDK_SUMMARY_ENDPOINT, sdk_test)
        self.assertIn(SDK_AUDIT_PREVIEW_ENDPOINT, sdk_test)
        self.assertIn("api-requests.json", cli_text)
        self.assertIn("workspace-session-api-replay", cli_test)
        self.assertIn("buildWorkspaceSessionApiState", web_text)
        self.assertIn("localOnly", web_test)
        self.assertIn("redact", web_text.lower() + web_test.lower())

    def test_release_and_health_wiring_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        release_text = read_text("scripts/release_check.py")
        health_text = read_text("scripts/repo_health.py")
        package_text = "\n".join(
            read_text(path)
            for path in (
                "apps/api/package.json",
                "packages/sdk-js/package.json",
                "packages/cli/package.json",
                "apps/web/package.json",
            )
        )
        combined = release_text + "\n" + health_text + "\n" + package_text

        for expected in (
            CHECK_NAME,
            DOC_PATH,
            ALIGNMENT_TEST_PATH,
            SECURITY_TEST_PATH,
            "apps/api/src/workspaceSessionRoutes.ts",
            "packages/sdk-js/src/localWorkspaceSessionApiClient.ts",
            "packages/cli/src/workspaceSessionApiReplay.ts",
            "apps/web/src/workspaceSessionApiState.ts",
            "examples/workspace-session/api-requests.json",
            "workspace-session-routes.test.mjs",
            "local-workspace-session-api-client.test.mjs",
            "workspace-session-api-replay.test.mjs",
            "workspace-session-api-state.test.mjs",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, combined)

    def test_docs_and_fixture_stay_safe_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        combined_text = "\n".join(read_text(rel_path) for rel_path in PUBLIC_SAFE_TEXT_FILES)
        combined_text += "\n" + json.dumps(
            read_json("examples/workspace-session/api-requests.json"),
            sort_keys=True,
        )
        lower_text = combined_text.lower()

        for marker in PRIVATE_PATH_MARKERS + REMOTE_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker.lower(), lower_text)

        guarded_terms = {"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS}
        guarded_terms.update({
            "".join(("public", "-", "sector")),
            "".join(("public", " ", "sector")),
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
        testcase.skipTest("workspace session API files are not present yet: " + ", ".join(missing))


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


if __name__ == "__main__":
    unittest.main()
