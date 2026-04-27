from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "workspace-session-persistence.md"
STORE_PATH = ROOT / "examples" / "workspace-session" / "session-store.json"
OPENAPI_PATH = ROOT / "docs" / "openapi.yaml"

EXPECTED_SECTIONS = (
    "# Workspace Session Persistence",
    "## Scope",
    "## Snapshot Store",
    "## Route Alignment",
    "## SDK, CLI, And Web Usage",
    "## Local Boundaries",
    "## Validation Commands",
)

EXPECTED_REFERENCES = (
    "examples/workspace-session/session-store.json",
    "apps/api/src/workspaceSessionRoutes.ts",
    "packages/sdk-js/src/localWorkspaceSessionApiClient.ts",
    "packages/cli/src/workspaceSessionApiReplay.ts",
    "apps/web/src/workspaceSessionApiState.ts",
    "docs/openapi.yaml",
    "POST /v1/workspace-session/summary",
    "POST /v1/workspace-session/audit-preview",
    "workspace-session-persistence/v1",
    "workspace-session-api/v1",
)

EXPECTED_VALIDATION_COMMANDS = (
    r"python -m json.tool examples\workspace-session\session-store.json",
    r"python scripts\validate_openapi.py",
    "python -m unittest tests.test_workspace_session_persistence_docs",
)

TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$")
REDACTED_PATH_PATTERN = re.compile(r"^\[redacted:path:[a-z0-9]+\]$")
REDACTED_LOCK_PATTERN = re.compile(r"^\[redacted:lockToken:[a-z0-9]+\]$")
WINDOWS_ABSOLUTE_PATH_PATTERN = re.compile(r"(?i)(?<![A-Za-z0-9])[a-z]:[\\/]")
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


class WorkspaceSessionPersistenceDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.store_text = STORE_PATH.read_text(encoding="utf-8")
        cls.store = _load_json(STORE_PATH)
        cls.openapi_text = OPENAPI_PATH.read_text(encoding="utf-8")
        cls.openapi_lines = cls.openapi_text.splitlines()

    def test_document_has_required_sections_references_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())
        self.assertTrue(STORE_PATH.is_file())

        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for reference in EXPECTED_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(f"`{reference}`", self.doc_text)

        for command in EXPECTED_VALIDATION_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

    def test_session_store_top_level_shape_and_local_boundaries(self) -> None:
        store = self.store

        self.assertEqual(store["schemaVersion"], "workspace-session-persistence/v1")
        self.assertEqual(store["kind"], "workspace-session.session-store")
        self.assertRegex(store["generatedAt"], TIMESTAMP_PATTERN)
        self.assertIs(store["localOnly"], True)
        self.assertIs(store["durable"], True)
        self.assertEqual(store["network"]["mode"], "disabled")
        self.assertEqual(store["network"]["allowedUriPrefixes"], ["local://", "workspace://"])
        self.assertEqual(store["validationCommands"], list(EXPECTED_VALIDATION_COMMANDS))

        storage = store["storage"]
        self.assertEqual(storage["path"], "workspaces/wsp_session_alpha/session-store.json")
        self.assertEqual(storage["format"], "atomic-json")
        self.assertIs(storage["pathRedactedInResponses"], True)
        self.assertIs(storage["rawPathsStored"], False)
        self.assertIs(storage["rawLockMaterialStored"], False)

        descriptor = store["descriptor"]
        self.assertEqual(descriptor["workspaceId"], "wsp_session_alpha")
        self.assertEqual(descriptor["deviceId"], "dev_laptop_alpha")
        self.assertEqual(descriptor["rootKeyRef"], "key_session_alpha")
        self.assertRegex(descriptor["createdAt"], TIMESTAMP_PATTERN)
        self.assertRegex(descriptor["updatedAt"], TIMESTAMP_PATTERN)
        self.assertEqual(descriptor["storagePath"], storage["path"])
        self.assertEqual(descriptor["gateway"], {"transport": "stdio"})

    def test_summary_route_sample_matches_descriptor_contract(self) -> None:
        summary = self.store["routes"]["summary"]
        request_body = summary["requestBody"]
        response_body = summary["responseBody"]

        self.assertEqual(summary["method"], "POST")
        self.assertEqual(summary["path"], "/v1/workspace-session/summary")
        self.assertEqual(summary["responseStatus"], 200)
        self.assertEqual(set(request_body), {"descriptor", "sessionId", "operations"})
        self.assertEqual(request_body["descriptor"], self.store["descriptor"])
        self.assertEqual(request_body["sessionId"], self.store["session"]["sessionId"])
        self.assertEqual(request_body["operations"], self.store["session"]["operations"])

        self.assertEqual(response_body["kind"], "workspace-session.summary")
        self.assertEqual(response_body["schemaVersion"], "workspace-session-api/v1")
        self.assertIs(response_body["localOnly"], True)
        self.assertIs(response_body["durableWrites"], False)
        self.assertEqual(response_body["workspaceId"], self.store["descriptor"]["workspaceId"])
        self.assertEqual(response_body["deviceId"], self.store["descriptor"]["deviceId"])
        self.assertRegex(response_body["storage"]["storagePath"], REDACTED_PATH_PATTERN)
        self.assertIs(response_body["storage"]["storagePathRedacted"], True)
        self.assertEqual(response_body["gateway"], {"transport": "stdio"})
        self.assertEqual(response_body["session"]["operations"], ["open", "lock"])

    def test_audit_preview_route_sample_is_redacted_and_ordered(self) -> None:
        preview = self.store["routes"]["auditPreview"]
        request_body = preview["requestBody"]
        response_body = preview["responseBody"]

        self.assertEqual(preview["method"], "POST")
        self.assertEqual(preview["path"], "/v1/workspace-session/audit-preview")
        self.assertEqual(preview["responseStatus"], 200)
        self.assertEqual(set(request_body), {"descriptor", "sessionId", "actor", "createdAt", "events"})
        self.assertEqual(request_body["descriptor"], self.store["descriptor"])
        self.assertEqual([event["operation"] for event in request_body["events"]], ["open", "lock"])
        self.assertEqual([event["sequence"] for event in request_body["events"]], [1, 2])
        self.assertEqual([event["cursor"] for event in request_body["events"]], ["1", "2"])
        self.assertNotIn("lockToken", request_body["events"][1])

        self.assertEqual(response_body["kind"], "workspace-session.audit-preview")
        self.assertEqual(response_body["schemaVersion"], "workspace-session-api/v1")
        self.assertIs(response_body["localOnly"], True)
        self.assertIs(response_body["durableWrites"], False)
        self.assertEqual(response_body["summary"], self.store["routes"]["summary"]["responseBody"])
        self.assertEqual([event["payload"]["operation"] for event in response_body["events"]], ["open", "lock"])
        self.assertEqual([event["sequence"] for event in response_body["events"]], [1, 2])

        audit = response_body["audit"]
        self.assertEqual(audit["kind"], "workspace-session.audit-preview.records")
        self.assertIs(audit["localOnly"], True)
        self.assertIs(audit["redacted"], True)
        self.assertEqual(audit["recordCount"], len(audit["records"]))
        self.assertEqual(audit["recordCount"], 2)
        for record in audit["records"]:
            with self.subTest(record=record["auditId"]):
                self.assertEqual(record["actor"], request_body["actor"])
                self.assertRegex(record["details"]["storagePath"], REDACTED_PATH_PATTERN)
                self.assertIs(record["details"]["redaction"]["redacted"], True)
                self.assertIn("storagePath", record["details"]["redaction"]["fields"])

        lock_ref = response_body["events"][1]["payload"]["lock"]["lockTokenRef"]
        self.assertRegex(lock_ref, REDACTED_LOCK_PATTERN)
        self.assertEqual(lock_ref, self.store["session"]["lockTokenRef"])
        self.assertIn("lockToken", audit["records"][1]["details"]["redaction"]["fields"])

    def test_openapi_workspace_session_components_match_route_shapes(self) -> None:
        summary_path = _require_block(self, self.openapi_lines, "/v1/workspace-session/summary", 2)
        summary_post = _require_block(self, summary_path, "post", 4)
        summary_request_body = _require_block(self, summary_post, "requestBody", 6)
        summary_status = _require_block(self, _require_block(self, summary_post, "responses", 6), '"200"', 8)

        self.assertIn("required: true", _stripped_lines(summary_request_body))
        self.assertTrue(_has_schema_ref(summary_request_body, "WorkspaceSessionSummaryRequest"))
        self.assertTrue(_has_schema_ref(summary_status, "WorkspaceSessionSummaryResponse"))

        audit_path = _require_block(self, self.openapi_lines, "/v1/workspace-session/audit-preview", 2)
        audit_post = _require_block(self, audit_path, "post", 4)
        audit_request_body = _require_block(self, audit_post, "requestBody", 6)
        audit_status = _require_block(self, _require_block(self, audit_post, "responses", 6), '"200"', 8)

        self.assertTrue(_has_schema_ref(audit_request_body, "WorkspaceSessionAuditPreviewRequest"))
        self.assertTrue(_has_schema_ref(audit_status, "WorkspaceSessionAuditPreviewResponse"))

        summary_request = _require_block(self, self.openapi_lines, "WorkspaceSessionSummaryRequest", 4)
        self.assertIn("- descriptor", _stripped_lines(summary_request))
        self.assertTrue(_has_schema_ref(summary_request, "WorkspaceSessionDescriptor"))
        self.assertTrue(_has_schema_ref(summary_request, "WorkspaceSessionOperation"))
        self.assertNotIn("localOnly:", "\n".join(summary_request))
        self.assertNotIn("workspace:", "\n".join(summary_request))

        summary_response = _require_block(self, self.openapi_lines, "WorkspaceSessionSummaryResponse", 4)
        for field in ("kind", "schemaVersion", "localOnly", "durableWrites", "workspaceId", "deviceId", "storage", "gateway"):
            with self.subTest(summary_response_field=field):
                self.assertIn(f"- {field}", _stripped_lines(summary_response))
        self.assertTrue(_has_schema_ref(summary_response, "WorkspaceSessionSummaryStorage"))
        self.assertTrue(_has_schema_ref(summary_response, "WorkspaceSessionSummarySession"))

        audit_request = _require_block(self, self.openapi_lines, "WorkspaceSessionAuditPreviewRequest", 4)
        for field in ("descriptor", "sessionId", "events"):
            with self.subTest(audit_request_field=field):
                self.assertIn(f"- {field}", _stripped_lines(audit_request))
        self.assertTrue(_has_schema_ref(audit_request, "WorkspaceSessionEventPlan"))

        audit_response = _require_block(self, self.openapi_lines, "WorkspaceSessionAuditPreviewResponse", 4)
        for ref in ("WorkspaceSessionSummaryResponse", "WorkspaceSessionPreviewEvent", "WorkspaceSessionAuditPreviewRecords"):
            with self.subTest(ref=ref):
                self.assertTrue(_has_schema_ref(audit_response, ref))
        self.assertIn("const: false", _stripped_lines(audit_response))

    def test_docs_and_fixture_avoid_unsafe_public_text(self) -> None:
        combined_text = f"{self.doc_text}\n{self.store_text}"
        lower_text = combined_text.lower()

        forbidden_fragments = (
            "".join((".codex", "-private")),
            "".join(("sovereignops", "-codex", "-pack")),
            "".join(("plan", "-", "pack")),
            "https://",
            "http://",
            "localhost",
            "127.0.0.1",
            "~/",
            "curl ",
            "npx ",
            "npm install -g",
        )
        for fragment in forbidden_fragments:
            with self.subTest(fragment=fragment):
                self.assertNotIn(fragment, lower_text)

        for pattern in (
            WINDOWS_ABSOLUTE_PATH_PATTERN,
            POSIX_ABSOLUTE_PATH_PATTERN,
            UNC_PATH_PATTERN,
            re.compile(r"(?<!\.)\.\.[/\\]"),
        ):
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(combined_text))

        for pattern in SECRET_VALUE_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(combined_text))

        guarded_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for term in guarded_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(lower_text))
                else:
                    self.assertNotIn(term, lower_text)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _require_block(
    test_case: unittest.TestCase,
    lines: list[str],
    key: str,
    indent: int,
) -> list[str]:
    block = _find_block(lines, key, indent)
    test_case.assertIsNotNone(block, f"missing block {key!r} at indent {indent}")
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


def _has_schema_ref(lines: list[str], schema_name: str) -> bool:
    ref = f'$ref: "#/components/schemas/{schema_name}"'
    stripped = _stripped_lines(lines)
    return ref in stripped or f"- {ref}" in stripped


def _stripped_lines(lines: list[str]) -> set[str]:
    return {line.strip() for line in lines}


if __name__ == "__main__":
    unittest.main()
