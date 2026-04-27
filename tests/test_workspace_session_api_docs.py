from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "workspace-session-api.md"
API_REQUESTS_PATH = ROOT / "examples" / "workspace-session" / "api-requests.json"

EXPECTED_SECTIONS = (
    "# Workspace Session API",
    "## Local-Only Scope",
    "## Routes",
    "## Validation Behavior",
    "## SDK Usage",
    "## CLI Usage",
    "## Web Usage",
    "## Redaction Expectations",
    "## Fixture",
    "## Validation Commands",
)

EXPECTED_ROUTES = (
    (
        "workspace_session_summary",
        "POST",
        "/v1/workspace-session/summary",
    ),
    (
        "workspace_session_audit_preview",
        "POST",
        "/v1/workspace-session/audit-preview",
    ),
)

EXPECTED_DOC_REFERENCES = (
    "examples/workspace-session/api-requests.json",
    "packages/sdk-js/src/localWorkspaceSession.ts",
    "packages/sdk-js/src/localWorkspaceSessionApiClient.ts",
    "packages/sdk-js/src/index.ts",
    "apps/web/src/workspaceSessionState.ts",
    "apps/web/src/workspaceSessionApiState.ts",
    "normalizeLocalWorkspaceDescriptor",
    "planLocalWorkspaceSessionOpenEvent",
    "planLocalWorkspaceSessionLockEvent",
    "planLocalWorkspaceSessionUnlockEvent",
    "createLocalWorkspaceSessionAuditPreviewRecords",
    "LocalWorkspaceSessionApiClient",
    "buildWorkspaceSessionState",
    "buildWorkspaceSessionApiState",
    "buildWorkspaceSessionApiSummaryCards",
    "buildWorkspaceSessionApiErrorStates",
    "redactWorkspaceSessionApiError",
    "redactWorkspaceSessionText",
)

EXPECTED_VALIDATION_COMMANDS = (
    r"python -m json.tool examples\workspace-session\api-requests.json",
    "python -m unittest tests.test_workspace_session_api_docs",
)

TIMESTAMP_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$"
)
WINDOWS_ABSOLUTE_PATH_PATTERN = re.compile(r"(?i)\b[a-z]:[\\/]")
POSIX_ABSOLUTE_PATH_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt)(?:/|\b)"
)
UNC_PATH_PATTERN = re.compile(r"\\\\[^\\\s]+\\[^\\\s]+")
SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{12,}"),
    re.compile(
        r"(?i)(?<![A-Za-z])(?:password|passwd|secret|token|api[_-]?key)"
        r"\s*[:=]\s*(?!\[REDACTED\])\S{4,}"
    ),
)


class WorkspaceSessionApiDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.fixture_text = API_REQUESTS_PATH.read_text(encoding="utf-8")
        cls.fixture = _load_json(API_REQUESTS_PATH)
        cls.combined_text = f"{cls.doc_text}\n{cls.fixture_text}"
        cls.lower_combined_text = cls.combined_text.lower()

    def test_document_has_required_sections_routes_references_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())

        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for route_id, method, path in EXPECTED_ROUTES:
            with self.subTest(route=route_id):
                self.assertIn(f"`{route_id}`", self.doc_text)
                self.assertIn(f"`{method}`", self.doc_text)
                self.assertIn(f"`{method} {path}`", self.doc_text)
                self.assertIn(f"`{path}`", self.doc_text)

        for reference in EXPECTED_DOC_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, self.doc_text)

        for command in EXPECTED_VALIDATION_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

        self.assertIn("local dispatcher contracts", self.doc_text)
        self.assertIn("Validation Behavior", self.doc_text)
        self.assertIn("Redaction Expectations", self.doc_text)

    def test_fixture_top_level_shape_and_validation_commands(self) -> None:
        fixture = self.fixture

        self.assertEqual(fixture["schemaVersion"], "workspace-session-api-requests/v1")
        self.assertRegex(fixture["generatedAt"], TIMESTAMP_PATTERN)
        self.assertEqual(fixture["apiBase"], "local://workspace-session-api")
        self.assertIs(fixture["localOnly"], True)
        self.assertEqual(fixture["validationCommands"], list(EXPECTED_VALIDATION_COMMANDS))
        self.assertIn(
            "python -m unittest tests.test_workspace_session_api_docs",
            fixture["validationCommands"],
        )

        requests = fixture["requests"]
        self.assertEqual(len(requests), 2)
        self.assertEqual(len({request["id"] for request in requests}), len(requests))
        self.assertEqual(
            tuple(
                (
                    request["id"],
                    request["route"]["method"],
                    request["route"]["path"],
                )
                for request in requests
            ),
            EXPECTED_ROUTES,
        )

        for item in requests:
            with self.subTest(request=item["id"]):
                self.assertEqual(item["route"]["method"], "POST")
                self.assertTrue(item["route"]["path"].startswith("/v1/workspace-session/"))
                self.assertIs(item["request"]["body"]["localOnly"], True)
                self.assertEqual(item["response"]["status"], 200)
                self.assertIs(item["response"]["body"]["localOnly"], True)

    def test_summary_request_and_response_are_compact_and_deterministic(self) -> None:
        summary = _request_by_id(self.fixture, "workspace_session_summary")
        body = summary["request"]["body"]
        response_body = summary["response"]["body"]

        self.assertRegex(body["generatedAt"], TIMESTAMP_PATTERN)
        self.assertEqual(body["workspace"]["id"], "wsp_session_alpha")
        self.assertEqual(body["workspace"]["rootRef"], "workspace://wsp_session_alpha")
        self.assertEqual(body["session"]["id"], "sess_alpha_laptop_001")
        self.assertEqual(body["session"]["workspaceId"], "wsp_session_alpha")
        self.assertIs(body["session"]["isolated"], True)
        self.assertEqual(body["gateway"]["transport"], "stdio")
        self.assertTrue(body["backup"]["targetRef"].startswith("workspace://"))

        self.assertEqual(response_body["kind"], "workspace-session.summary")
        self.assertEqual(response_body["workspaceId"], "wsp_session_alpha")
        self.assertEqual(response_body["sessionId"], "sess_alpha_laptop_001")
        self.assertEqual(response_body["status"], "ready")
        self.assertEqual(
            [card["id"] for card in response_body["summaryCards"]],
            [
                "workspace_session.summary.workspace_open",
                "workspace_session.summary.lock_state",
                "workspace_session.summary.approval_gateway",
                "workspace_session.summary.migration_readiness",
                "workspace_session.summary.backup_readiness",
            ],
        )
        for card in response_body["summaryCards"]:
            with self.subTest(card=card["id"]):
                self.assertEqual(card["status"], "ready")
                self.assertEqual(card["severity"], "success")
        self.assertIs(response_body["redaction"]["rawPathsStored"], False)
        self.assertIs(response_body["redaction"]["rawLockMaterialStored"], False)

    def test_audit_preview_request_and_response_are_redacted(self) -> None:
        audit = _request_by_id(self.fixture, "workspace_session_audit_preview")
        body = audit["request"]["body"]
        response_body = audit["response"]["body"]

        self.assertEqual(body["actor"], "sdk-worker-e")
        self.assertRegex(body["createdAt"], TIMESTAMP_PATTERN)
        self.assertEqual(len(body["events"]), 2)
        self.assertEqual(
            [event["type"] for event in body["events"]],
            ["workspace.session.opened", "workspace.session.locked"],
        )
        self.assertEqual(
            [event["payload"]["operation"] for event in body["events"]],
            ["open", "lock"],
        )
        self.assertEqual([event["sequence"] for event in body["events"]], [1, 2])
        self.assertEqual([event["cursor"] for event in body["events"]], ["1", "2"])
        self.assertTrue(
            body["events"][1]["payload"]["lock"]["lockTokenRef"].startswith(
                "[redacted:lockToken:"
            )
        )

        self.assertEqual(response_body["kind"], "workspace-session.audit-preview")
        self.assertEqual(response_body["recordCount"], len(response_body["records"]))
        self.assertEqual(response_body["recordCount"], 2)
        self.assertEqual(
            [record["auditId"] for record in response_body["records"]],
            [
                "aud_wsp_session_alpha_open_00000001",
                "aud_wsp_session_alpha_lock_00000002",
            ],
        )
        self.assertEqual(
            [record["details"]["operation"] for record in response_body["records"]],
            ["open", "lock"],
        )
        for record in response_body["records"]:
            with self.subTest(record=record["auditId"]):
                self.assertEqual(record["actor"], body["actor"])
                self.assertEqual(record["createdAt"], body["createdAt"])
                self.assertTrue(record["details"]["storagePath"].startswith("[redacted:path:"))
                self.assertIs(record["details"]["redaction"]["redacted"], True)
                self.assertIn("storagePath", record["details"]["redaction"]["fields"])
        self.assertIn("lockToken", response_body["records"][1]["details"]["redaction"]["fields"])
        self.assertIs(response_body["redaction"]["rawStoragePathsStored"], False)
        self.assertIs(response_body["redaction"]["rawLockMaterialStored"], False)

    def test_docs_and_fixture_avoid_private_filenames_raw_paths_and_secret_values(self) -> None:
        forbidden_private_names = (
            "." + "codex-private",
            "sovereignops-" + "codex-pack",
            "private-" + "plan",
            "plan-" + "pack",
        )
        forbidden_uri_or_host_fragments = (
            "file://",
            "http://",
            "https://",
            "localhost",
            "127.0.0.1",
            "../",
            "~/",
        )

        for value in forbidden_private_names + forbidden_uri_or_host_fragments:
            with self.subTest(forbidden=value):
                self.assertNotIn(value, self.lower_combined_text)

        for pattern in (
            WINDOWS_ABSOLUTE_PATH_PATTERN,
            POSIX_ABSOLUTE_PATH_PATTERN,
            UNC_PATH_PATTERN,
        ):
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.combined_text))

        for pattern in SECRET_VALUE_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.combined_text))

        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for term in restricted_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_combined_text))
                else:
                    self.assertNotIn(term, self.lower_combined_text)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _request_by_id(fixture: dict[str, Any], request_id: str) -> dict[str, Any]:
    for request in fixture["requests"]:
        if request["id"] == request_id:
            return request
    raise AssertionError(f"missing request id: {request_id}")


if __name__ == "__main__":
    unittest.main()
