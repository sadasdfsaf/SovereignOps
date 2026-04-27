from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]

DOC_PATH = "docs/mcp-approval-evidence-api.md"
DOCS_TEST_PATH = "tests/test_mcp_approval_evidence_api_docs.py"
ALIGNMENT_TEST_PATH = "tests/test_mcp_approval_evidence_api_alignment.py"
ROUTE_PATH = "/v1/mcp/approval-evidence/preview"
SDK_ENDPOINT = "mcp/approval-evidence/preview"
OPERATION_ID = "previewMcpApprovalEvidence"
CHECK_NAME = "mcp-approval-evidence-api-alignment"

EXPECTED_PARENT_FILES = (
    "services/mcp-gateway/src/approvalEvidence.ts",
    "services/mcp-gateway/tests/approval-evidence.test.mjs",
    "apps/api/src/mcpApprovalEvidenceRoutes.ts",
    "apps/api/tests/mcp-approval-evidence-routes.test.mjs",
    "packages/sdk-js/src/mcpApprovalEvidenceClient.ts",
    "packages/sdk-js/tests/client-mcp-approval-evidence.test.mjs",
    "packages/cli/src/mcpApprovalEvidenceReplay.ts",
    "packages/cli/tests/mcp-approval-evidence-replay.test.mjs",
    "examples/mcp/approval-evidence-preview-requests.json",
    "packages/schemas/src/mcpApprovalEvidence.ts",
    "packages/schemas/tests/mcp-approval-evidence.test.mjs",
    "packages/schemas/fixtures/mcp-approval-evidence.valid.json",
    "packages/schemas/fixtures/mcp-approval-evidence.invalid.json",
    "packages/schemas/fixtures/mcp-approval-evidence.schema.json",
    "apps/web/src/mcpApprovalEvidenceApiState.ts",
    "apps/web/tests/mcp-approval-evidence-api-state.test.mjs",
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
    "services/mcp-gateway/src/approvalEvidence.ts": (
        "buildMcpApprovalEvidence",
        "redactMcpApprovalEvidenceMetadata",
    ),
    "apps/api/src/mcpApprovalEvidenceRoutes.ts": (
        "createMcpApprovalEvidenceRoutes",
        "mountMcpApprovalEvidenceRoutes",
    ),
    "packages/sdk-js/src/mcpApprovalEvidenceClient.ts": (
        "McpApprovalEvidenceClient",
        "createMcpApprovalEvidenceClient",
    ),
    "packages/cli/src/mcpApprovalEvidenceReplay.ts": (
        "runMcpApprovalEvidenceReplayCli",
        "loadMcpApprovalEvidenceRequests",
        "isMcpApprovalEvidenceReplayCommand",
    ),
    "packages/schemas/src/mcpApprovalEvidence.ts": (
        "MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION",
        "mcpApprovalEvidenceSchema",
        "mcpApprovalEvidenceSchemaDefinition",
        "validateMcpApprovalEvidence",
        "assertMcpApprovalEvidence",
    ),
    "apps/web/src/mcpApprovalEvidenceApiState.ts": (
        "buildMcpApprovalEvidenceApiState",
    ),
}

EXPECTED_REEXPORTS = {
    "services/mcp-gateway/src/index.ts": ("./approvalEvidence.ts",),
    "apps/api/src/index.ts": ("./mcpApprovalEvidenceRoutes.ts",),
    "packages/sdk-js/src/index.ts": ("./mcpApprovalEvidenceClient.ts",),
    "packages/cli/src/index.ts": ("./mcpApprovalEvidenceReplay.ts",),
    "packages/schemas/src/index.ts": ("./mcpApprovalEvidence.ts",),
    "apps/web/src/main.ts": ("./mcpApprovalEvidenceApiState.ts",),
}

EXPECTED_PACKAGE_SCRIPT_TESTS = {
    "services/mcp-gateway/package.json": ("tests/approval-evidence.test.mjs",),
    "apps/api/package.json": ("tests/mcp-approval-evidence-routes.test.mjs",),
    "packages/sdk-js/package.json": ("tests/client-mcp-approval-evidence.test.mjs",),
    "packages/cli/package.json": ("tests/mcp-approval-evidence-replay.test.mjs",),
    "packages/schemas/package.json": ("tests/mcp-approval-evidence.test.mjs",),
    "apps/web/package.json": ("tests/mcp-approval-evidence-api-state.test.mjs",),
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

EXPECTED_SCHEMA_FIXTURES = (
    "packages/schemas/fixtures/mcp-approval-evidence.valid.json",
    "packages/schemas/fixtures/mcp-approval-evidence.invalid.json",
    "packages/schemas/fixtures/mcp-approval-evidence.schema.json",
)

PUBLIC_SAFE_TEXT_FILES = (
    DOC_PATH,
    "examples/mcp/approval-evidence-preview-requests.json",
    "packages/schemas/fixtures/mcp-approval-evidence.valid.json",
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
    r"((?:apps|docs|examples|packages|scripts|services|tests)[/\\]"
    r"[A-Za-z0-9_./\\-]+?\.(?:json|md|mjs|py|ts|yaml))"
    r"(?![A-Za-z0-9_.-])"
)


class McpApprovalEvidenceApiAlignmentTests(unittest.TestCase):
    def test_docs_declare_round28_api_surface(self) -> None:
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
        route_text = read_text("apps/api/src/mcpApprovalEvidenceRoutes.ts")
        route_test = read_text("apps/api/tests/mcp-approval-evidence-routes.test.mjs")
        openapi_text = read_text("docs/openapi.yaml")

        self.assertIn("/v1/mcp/approval-evidence", route_text)
        self.assertIn("/preview", route_text)
        self.assertIn(ROUTE_PATH, route_test)
        self.assertIn(ROUTE_PATH + ":", openapi_text)
        self.assertIn(f"operationId: {OPERATION_ID}", openapi_text)
        self.assertIn("McpApprovalEvidencePreviewRequest", openapi_text)
        self.assertIn("McpApprovalEvidencePreviewResponse", openapi_text)

    def test_sdk_endpoint_and_cli_fixture_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        sdk_text = read_text("packages/sdk-js/src/mcpApprovalEvidenceClient.ts")
        sdk_test = read_text("packages/sdk-js/tests/client-mcp-approval-evidence.test.mjs")
        cli_text = read_text("packages/cli/src/mcpApprovalEvidenceReplay.ts")
        cli_test = read_text("packages/cli/tests/mcp-approval-evidence-replay.test.mjs")
        fixture = read_json("examples/mcp/approval-evidence-preview-requests.json")

        self.assertIn(SDK_ENDPOINT, sdk_text)
        self.assertRegex(sdk_text, r"\bpreview\s*\(")
        self.assertIn(ROUTE_PATH, sdk_test)
        self.assertIn(ROUTE_PATH, cli_text)
        self.assertIn("approval-evidence-preview-requests.json", cli_test)

        requests = request_records(fixture)
        self.assertGreater(len(requests), 0)
        for request in requests:
            with self.subTest(request=request_label(request)):
                self.assertEqual(route_method(request), "POST")
                self.assertEqual(route_path(request), ROUTE_PATH)
                if expected_status(request) < 400:
                    self.assertEqual(response_kind(request), "mcp-approval-evidence.preview")

    def test_schema_fixtures_gateway_and_web_helper_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        gateway_text = read_text("services/mcp-gateway/src/approvalEvidence.ts")
        schema_text = read_text("packages/schemas/src/mcpApprovalEvidence.ts")
        web_text = read_text("apps/web/src/mcpApprovalEvidenceApiState.ts")
        web_test = read_text("apps/web/tests/mcp-approval-evidence-api-state.test.mjs")

        for rel_path in EXPECTED_SCHEMA_FIXTURES:
            with self.subTest(schema_fixture=rel_path):
                self.assertTrue((ROOT / rel_path).is_file(), rel_path)

        valid_fixture = read_json("packages/schemas/fixtures/mcp-approval-evidence.valid.json")
        schema_fixture = read_json("packages/schemas/fixtures/mcp-approval-evidence.schema.json")
        self.assertEqual(valid_fixture["schemaVersion"], "mcp-approval-evidence/v1")
        self.assertEqual(schema_fixture["title"], "MCP approval evidence")
        self.assertIn("redactionSummary", json.dumps(valid_fixture, sort_keys=True))
        self.assertIn("[REDACTED]", json.dumps(valid_fixture, sort_keys=True))
        self.assertIn("sort", gateway_text)
        self.assertIn("redact", gateway_text.lower())
        self.assertIn("validateMcpApprovalEvidence", schema_text)
        self.assertIn("buildMcpApprovalEvidenceApiState", web_text)
        self.assertIn("expired", web_test)

    def test_release_and_health_wiring_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        release_text = read_text("scripts/release_check.py")
        health_text = read_text("scripts/repo_health.py")
        for expected in (
            CHECK_NAME,
            "docs/mcp-approval-evidence-api.md",
            "tests/test_mcp_approval_evidence_api_docs.py",
            "tests/test_mcp_approval_evidence_api_alignment.py",
            "apps/api/src/mcpApprovalEvidenceRoutes.ts",
            "packages/sdk-js/src/mcpApprovalEvidenceClient.ts",
            "packages/cli/src/mcpApprovalEvidenceReplay.ts",
            "packages/schemas/src/mcpApprovalEvidence.ts",
            "apps/web/src/mcpApprovalEvidenceApiState.ts",
            "services/mcp-gateway/src/approvalEvidence.ts",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, release_text + "\n" + health_text)

    def test_examples_and_docs_are_public_safe_once_parent_slice_lands(self) -> None:
        require_parent_slice(self)
        combined_text = "\n".join(read_text(rel_path) for rel_path in PUBLIC_SAFE_TEXT_FILES)
        combined_text += "\n" + json.dumps(
            read_json("examples/mcp/approval-evidence-preview-requests.json"),
            sort_keys=True,
        )
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
