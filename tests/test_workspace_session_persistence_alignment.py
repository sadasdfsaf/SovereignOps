from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]

DOC_PATH = "docs/workspace-session-persistence.md"
FIXTURE_PATH = "examples/workspace-session/session-store.json"
ALIGNMENT_TEST_PATH = "tests/test_workspace_session_persistence_alignment.py"
DOCS_TEST_PATH = "tests/test_workspace_session_persistence_docs.py"
SECURITY_TEST_PATH = "tests/security/workspace_session_persistence_threats.test.mjs"
ALIGNMENT_CHECK_NAME = "workspace-session-persistence-alignment"
SECURITY_CHECK_NAME = "workspace-session-persistence-security"

EXPECTED_ROUTES = {
    "summary": ("POST", "/v1/workspace-session/summary"),
    "auditPreview": ("POST", "/v1/workspace-session/audit-preview"),
}

EXPECTED_IMPLEMENTATION_FILES = (
    "apps/api/src/workspaceSessionRoutes.ts",
    "packages/sdk-js/src/localWorkspaceSession.ts",
    "packages/sdk-js/src/localWorkspaceSessionApiClient.ts",
    "packages/sdk-js/src/localWorkspaceSessionStore.ts",
    "packages/cli/src/workspaceSessionApiReplay.ts",
    "apps/web/src/workspaceSessionApiState.ts",
)

EXPECTED_REQUIRED_PATHS = (
    DOC_PATH,
    FIXTURE_PATH,
    DOCS_TEST_PATH,
    ALIGNMENT_TEST_PATH,
    SECURITY_TEST_PATH,
    "scripts/release_check.py",
    *EXPECTED_IMPLEMENTATION_FILES,
)

PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "".join((".codex", "-private")),
    "".join((".codex", "-run")),
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog.jsonl",
    "tasks" + "\\backlog.jsonl",
)

SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{12,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+"),
    re.compile(
        r"(?i)(?<!\[redacted:lock)(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*"
        r"(?!\[REDACTED\]|\[redacted:)\S{4,}"
    ),
)

BODY_RETENTION_KEYS = {"rawBody", "requestBody", "bodySnapshot"}


class WorkspaceSessionPersistenceAlignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        require_parent_slice(cls)
        cls.doc_text = read_text(DOC_PATH)
        cls.fixture = read_json(FIXTURE_PATH)

    def test_session_store_fixture_routes_match_docs_and_implementation_names(self) -> None:
        routes = self.fixture.get("routes")
        self.assertIsInstance(routes, dict)
        api_text = read_text("apps/api/src/workspaceSessionRoutes.ts")
        sdk_text = read_text("packages/sdk-js/src/localWorkspaceSessionApiClient.ts")
        cli_text = read_text("packages/cli/src/workspaceSessionApiReplay.ts")
        web_text = read_text("apps/web/src/workspaceSessionApiState.ts")
        store_text = read_text("packages/sdk-js/src/localWorkspaceSessionStore.ts")

        self.assertEqual(set(routes), set(EXPECTED_ROUTES))
        for route_id, (method, expected_route_path) in EXPECTED_ROUTES.items():
            route = routes[route_id]
            with self.subTest(route_id=route_id):
                self.assertIn(f"routes.{route_id}", self.doc_text)
                self.assertEqual(route.get("method"), method)
                self.assertEqual(route.get("path"), expected_route_path)
                self.assertIn(expected_route_path, self.doc_text)
                self.assertIn(expected_route_path, cli_text)

        self.assertIn('joinPath(basePath, "/summary")', api_text)
        self.assertIn('joinPath(basePath, "/audit-preview")', api_text)
        self.assertIn("workspace-session/summary", sdk_text)
        self.assertIn("workspace-session/audit-preview", sdk_text)
        self.assertIn('"/v1/workspace-session/summary"', web_text)
        self.assertIn('"/v1/workspace-session/audit-preview"', web_text)
        self.assertIn("LOCAL_WORKSPACE_SESSION_STORE_SCHEMA_VERSION", store_text)
        self.assertIn("createLocalWorkspaceSessionSnapshot", store_text)
        self.assertIn("serializeLocalWorkspaceSessionStoreBundle", store_text)

    def test_session_store_fixture_shape_and_persistence_flags(self) -> None:
        self.assertEqual(self.fixture["schemaVersion"], "workspace-session-persistence/v1")
        self.assertEqual(self.fixture["kind"], "workspace-session.session-store")
        self.assertIs(self.fixture["localOnly"], True)
        self.assertIs(self.fixture["durable"], True)
        self.assertEqual(self.fixture["network"]["mode"], "disabled")
        self.assertEqual(self.fixture["network"]["allowedUriPrefixes"], ["local://", "workspace://"])
        self.assertEqual(self.fixture["storage"]["path"], self.fixture["descriptor"]["storagePath"])
        self.assertIs(self.fixture["storage"]["pathRedactedInResponses"], True)
        self.assertIs(self.fixture["storage"]["rawPathsStored"], False)
        self.assertIs(self.fixture["storage"]["rawLockMaterialStored"], False)
        self.assertRegex(self.fixture["session"]["lockTokenRef"], r"^\[redacted:lockToken:[a-z0-9]+\]$")

    def test_persistence_surfaces_declare_no_durable_or_raw_material_retention(self) -> None:
        route_text = read_text("apps/api/src/workspaceSessionRoutes.ts")
        sdk_text = read_text("packages/sdk-js/src/localWorkspaceSessionApiClient.ts")
        store_text = read_text("packages/sdk-js/src/localWorkspaceSessionStore.ts")
        cli_text = read_text("packages/cli/src/workspaceSessionApiReplay.ts")
        web_text = read_text("apps/web/src/workspaceSessionApiState.ts")
        local_session_text = read_text("packages/sdk-js/src/localWorkspaceSession.ts")

        for source_text in (route_text, sdk_text):
            with self.subTest(source="durableWrites"):
                self.assertIn("durableWrites: false", source_text)
                self.assertIn("storagePathRedacted: true", source_text)

        self.assertIn("redactValue(\"path\"", local_session_text)
        self.assertIn("redactValue(\"lockToken\"", local_session_text)
        self.assertIn("rawSecretsStored: false", store_text)
        self.assertIn("sanitizeOptionalMetadata", store_text)
        self.assertIn("event lock token reference must be redacted", store_text)
        self.assertIn("rawPathsStored: false", cli_text)
        self.assertIn("rawLockMaterialStored: false", cli_text)
        self.assertIn("createRedactor", cli_text)
        self.assertIn("redactWorkspaceSessionApiError", web_text)
        self.assertIn("redactWorkspaceSessionText", web_text)

    def test_fixture_responses_do_not_echo_request_bodies_or_raw_persistence_values(self) -> None:
        routes = self.fixture["routes"]
        for route_id, route in routes.items():
            response_body = route.get("responseBody")
            response_text = json.dumps(response_body, sort_keys=True)
            sensitive_values = collect_sensitive_request_values(route.get("requestBody"))

            with self.subTest(route_id=route_id):
                self.assertIsInstance(response_body, dict)
                assert_no_body_retention_keys(self, response_body)
                for sensitive_value in sensitive_values:
                    self.assertNotIn(sensitive_value, response_text)

                self.assertIs(response_body.get("localOnly"), True)
                self.assertIs(response_body.get("durableWrites"), False)
                if route_id == "summary":
                    self.assertRegex(
                        response_body["storage"]["storagePath"],
                        r"^\[redacted:path:[a-z0-9]+\]$",
                    )
                if route_id == "auditPreview":
                    self.assertIs(response_body["audit"]["redacted"], True)
                    for event in response_body["events"]:
                        self.assertRegex(
                            event["payload"]["storagePath"],
                            r"^\[redacted:path:[a-z0-9]+\]$",
                        )

    def test_checked_in_docs_and_fixture_avoid_private_paths_and_secret_shapes(self) -> None:
        combined_text = self.doc_text + "\n" + json.dumps(self.fixture, sort_keys=True)
        lower_text = combined_text.lower()

        for marker in PRIVATE_PATH_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker.lower(), lower_text)

        for pattern in SECRET_VALUE_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(combined_text))

        self.assertIsNone(re.search(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]", combined_text))

    def test_validation_commands_are_repo_relative_and_named_in_docs(self) -> None:
        commands = self.fixture.get("validationCommands")
        self.assertIsInstance(commands, list)
        self.assertGreaterEqual(len(commands), 2)

        for command in commands:
            with self.subTest(command=command):
                self.assertIsInstance(command, str)
                self.assertIn(command, self.doc_text)
                self.assertNotIn("://", command)
                self.assertNotRegex(command, r"(?i)(?:^|\s)[a-z]:[\\/]")
                self.assertNotIn("..", Path(command.replace("\\", "/")).parts)

    def test_release_check_wires_focused_persistence_checks(self) -> None:
        release_text = read_text("scripts/release_check.py")

        for expected in (
            "WORKSPACE_SESSION_PERSISTENCE_REQUIRED_PATHS",
            ALIGNMENT_CHECK_NAME,
            SECURITY_CHECK_NAME,
            ALIGNMENT_TEST_PATH,
            DOCS_TEST_PATH,
            SECURITY_TEST_PATH,
            "tests.test_workspace_session_persistence_docs",
            "tests.test_workspace_session_persistence_alignment",
            "tests/security/workspace_session_persistence_threats.test.mjs",
            DOC_PATH,
            FIXTURE_PATH,
            *EXPECTED_IMPLEMENTATION_FILES,
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, release_text)


def require_parent_slice(testcase: unittest.TestCase | type[unittest.TestCase]) -> None:
    missing = [rel_path for rel_path in EXPECTED_REQUIRED_PATHS if not (ROOT / rel_path).is_file()]
    if missing:
        raise unittest.SkipTest(
            "workspace session persistence files are not present yet: " + ", ".join(missing)
        )


def read_text(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def read_json(rel_path: str) -> Any:
    return json.loads(read_text(rel_path))


def collect_sensitive_request_values(value: Any, key: str = "") -> set[str]:
    values: set[str] = set()
    if isinstance(value, dict):
        for nested_key, nested_value in value.items():
            values.update(collect_sensitive_request_values(nested_value, nested_key))
        return values
    if isinstance(value, list):
        for item in value:
            values.update(collect_sensitive_request_values(item, key))
        return values
    if not isinstance(value, str) or value.startswith("[redacted:"):
        return values

    normalized_key = re.sub(r"[^a-z0-9]+", "_", key.lower()).strip("_")
    if normalized_key in {"storage_path", "lock_token", "session_token", "authorization"}:
        values.add(value)
    return values


def assert_no_body_retention_keys(testcase: unittest.TestCase, value: Any) -> None:
    stack = [value]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            for key, nested in current.items():
                testcase.assertNotIn(key, BODY_RETENTION_KEYS)
                stack.append(nested)
        elif isinstance(current, list):
            stack.extend(current)


if __name__ == "__main__":
    unittest.main()
