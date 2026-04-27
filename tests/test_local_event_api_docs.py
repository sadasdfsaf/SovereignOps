from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "local-event-api.md"
API_REQUESTS_PATH = ROOT / "examples" / "local-events" / "api-requests.json"
SDK_SESSION_PATH = ROOT / "examples" / "local-events" / "sdk-session.json"
CATALOG_PATH = ROOT / "examples" / "local-events" / "catalog.json"
EXPORT_SESSION_PATH = ROOT / "examples" / "local-events" / "export-session.json"
IMPORT_PLAN_PATH = ROOT / "examples" / "local-events" / "import-plan.json"

EXPECTED_SECTIONS = (
    "# Local Event API",
    "## Scope",
    "## Routes",
    "## Local-Only API Usage",
    "## SDK Flow",
    "## CLI Export And Import Plan",
    "## Web State",
    "## Sync Reconciliation",
    "## Audit Export",
    "## Validation Commands",
)

EXPECTED_ROUTES = (
    "GET /v1/local-events/catalog",
    "GET /v1/local-events/summary",
    "GET /v1/local-events/replay-batches",
)

EXPECTED_REFERENCES = (
    "examples/local-events/api-requests.json",
    "examples/local-events/sdk-session.json",
    "examples/local-events/catalog.json",
    "examples/local-events/export-session.json",
    "examples/local-events/import-plan.json",
    "apps/api/src/localEventCatalogRoutes.ts",
    "packages/sdk-js/src/localEvents.ts",
    "packages/cli/src/localEventExports.ts",
    "packages/cli/src/localEvents.ts",
    "apps/web/src/localEventCatalog.ts",
    "services/sync/src/replay.ts",
    "createLocalEventCatalogFixtureFetch",
    "createLocalEventReplayBatches",
    "buildLocalEventCatalogState",
    "replayAcceptedEvents",
    "detectReplayIntegrityIssues",
    "createReplayAuditSummary",
    "local-events.catalog-replay-export.manifest",
)

EXPECTED_COMMANDS = (
    r"python -m json.tool examples\local-events\api-requests.json",
    r"python -m json.tool examples\local-events\sdk-session.json",
    "python -m unittest tests.test_local_event_api_docs",
)

EXPECTED_VALIDATION_COMMANDS = (
    "python -m json.tool examples\\local-events\\api-requests.json",
    "python -m json.tool examples\\local-events\\sdk-session.json",
    "python -m unittest tests.test_local_event_api_docs",
)

LOCAL_HTTP_PREFIXES = ("http://127.0.0.1", "http://localhost", "http://[::1]")
TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$")
EVENT_REF_PATTERN = re.compile(r"^catalog\.events\[(\d+)\]$")
HEX_DIGEST_PATTERN = re.compile(r"^[a-f0-9]{64}$")
CURSOR_PATTERN = re.compile(r"^cur_v1:([0-9]{16}):(origin|evt_[A-Za-z0-9_-]{1,88})$")

SECRET_PATTERNS = (
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


class LocalEventApiDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_doc_text = cls.doc_text.lower()
        cls.api_requests = _load_json(API_REQUESTS_PATH)
        cls.sdk_session = _load_json(SDK_SESSION_PATH)
        cls.catalog = _load_json(CATALOG_PATH)
        cls.export_session = _load_json(EXPORT_SESSION_PATH)
        cls.import_plan = _load_json(IMPORT_PLAN_PATH)

    def test_document_has_required_sections_references_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())

        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for route in EXPECTED_ROUTES:
            with self.subTest(route=route):
                self.assertIn(f"`{route}`", self.doc_text)

        for reference in EXPECTED_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(f"`{reference}`", self.doc_text)

        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

        for relative_path in (
            "examples/local-events/api-requests.json",
            "examples/local-events/sdk-session.json",
            "examples/local-events/catalog.json",
            "examples/local-events/export-session.json",
            "examples/local-events/import-plan.json",
            "apps/api/src/localEventCatalogRoutes.ts",
            "packages/sdk-js/src/localEvents.ts",
            "packages/cli/src/localEventExports.ts",
            "packages/cli/src/localEvents.ts",
            "apps/web/src/localEventCatalog.ts",
            "services/sync/src/replay.ts",
        ):
            with self.subTest(path=relative_path):
                self.assertTrue((ROOT / relative_path).is_file(), relative_path)

        self.assertNotIn("curl ", self.lower_doc_text)
        self.assertNotIn("npx ", self.lower_doc_text)
        self.assertNotIn("npm install -g", self.lower_doc_text)

    def test_api_request_examples_cover_local_routes_and_catalog_links(self) -> None:
        api = self.api_requests
        catalog = self.catalog
        catalog_event_ids = [event["id"] for event in catalog["events"]]

        self.assertEqual(api["schemaVersion"], "local-event-api-requests/v1")
        self.assertRegex(api["generatedAt"], TIMESTAMP_PATTERN)
        self.assertTrue(api["apiBase"].startswith(LOCAL_HTTP_PREFIXES))
        self.assertIs(api["localOnly"], True)
        self.assertEqual(api["catalog"]["path"], "examples/local-events/catalog.json")
        self.assertEqual(api["catalog"]["schemaVersion"], catalog["schemaVersion"])
        self.assertEqual(api["catalog"]["workspaceId"], catalog["workspaceId"])
        self.assertEqual(api["catalog"]["eventCount"], len(catalog_event_ids))
        self.assertEqual(api["catalog"]["eventIds"], catalog_event_ids)

        requests = api["requests"]
        self.assertEqual(len(requests), 3)
        self.assertEqual(len({request["id"] for request in requests}), len(requests))
        route_keys = tuple(f"{item['route']['method']} {item['route']['path']}" for item in requests)
        self.assertEqual(route_keys, EXPECTED_ROUTES)

        for item in requests:
            with self.subTest(request=item["id"]):
                self.assertEqual(item["route"]["method"], "GET")
                self.assertTrue(item["route"]["path"].startswith("/v1/local-events/"))
                self.assertEqual(item["request"]["body"]["catalogPath"], "examples/local-events/catalog.json")
                self.assertEqual(item["response"]["status"], 200)
                self.assertIn("body", item["response"])

        catalog_response = _request_by_id(api, "local_event_catalog_get")["response"]["body"]
        self.assertEqual(catalog_response["schemaVersion"], catalog["schemaVersion"])
        self.assertEqual(catalog_response["workspaceId"], catalog["workspaceId"])
        self.assertEqual(catalog_response["eventIds"], catalog_event_ids)
        self.assertEqual(catalog_response["eventsRef"], "examples/local-events/catalog.json#events")

        summary = _request_by_id(api, "local_event_summary_get")["response"]["body"]
        self.assertEqual(summary["eventCount"], len(catalog_event_ids))
        self.assertEqual(summary["firstSequence"], 1)
        self.assertEqual(summary["lastSequence"], len(catalog_event_ids))
        self.assertEqual(summary["redactedEventCount"], 3)
        self.assertEqual(summary["redactedFieldCount"], 3)
        self.assertEqual(summary["operations"]["append"], 2)
        self.assertEqual(summary["operations"]["approval_rejected"], 1)
        self.assertEqual(summary["schemaKinds"]["docs"], 2)
        self.assertEqual(summary["schemaKinds"]["approvals"], 2)

    def test_replay_batch_examples_match_catalog_order_and_export_session(self) -> None:
        replay_request = _request_by_id(self.api_requests, "local_event_replay_batches_get")
        replay = replay_request["request"]["body"]["replay"]
        response_body = replay_request["response"]["body"]
        catalog_events = self.catalog["events"]
        export_batches = self.export_session["replayBatches"]

        self.assertEqual(replay, {"batchSize": 3, "startSequence": 1, "endSequence": 5})
        self.assertEqual(response_body["batchCount"], len(response_body["batches"]))
        self.assertEqual(response_body["batchCount"], len(export_batches))

        replayed_event_ids: list[str] = []
        for index, batch in enumerate(response_body["batches"]):
            with self.subTest(batch=batch["batchIndex"]):
                export_batch = export_batches[index]
                events = _events_from_refs(catalog_events, batch["eventRefs"])
                replayed_event_ids.extend(event["id"] for event in events)

                self.assertEqual(batch["batchIndex"], index + 1)
                self.assertEqual(batch["eventCount"], len(events))
                self.assertEqual(batch["firstSequence"], events[0]["sequence"])
                self.assertEqual(batch["lastSequence"], events[-1]["sequence"])
                self.assertEqual(batch["firstEventId"], events[0]["id"])
                self.assertEqual(batch["lastEventId"], events[-1]["id"])
                self.assertEqual(batch["previousDigest"], events[0]["previousDigest"])
                self.assertEqual(batch["finalDigest"], export_batch["finalDigest"])
                self.assertEqual(batch["payloadDigests"], [event["payloadDigest"] for event in events])
                for digest in batch["payloadDigests"]:
                    self.assertRegex(digest, HEX_DIGEST_PATTERN)

        self.assertEqual(replayed_event_ids, self.api_requests["catalog"]["eventIds"])

    def test_sdk_session_records_client_cli_web_sync_and_audit_flow(self) -> None:
        session = self.sdk_session
        catalog_event_ids = [event["id"] for event in self.catalog["events"]]

        self.assertEqual(session["schemaVersion"], "local-event-sdk-session/v1")
        self.assertRegex(session["generatedAt"], TIMESTAMP_PATTERN)
        self.assertEqual(session["workspaceId"], self.catalog["workspaceId"])
        self.assertIs(session["localOnly"], True)
        self.assertEqual(session["catalog"]["path"], "examples/local-events/catalog.json")
        self.assertEqual(session["catalog"]["eventIds"], catalog_event_ids)
        self.assertEqual(session["catalog"]["lastEventDigest"], self.export_session["catalog"]["lastEventDigest"])

        self.assertTrue(session["apiClient"]["apiBase"].startswith(LOCAL_HTTP_PREFIXES))
        self.assertEqual(tuple(session["apiClient"]["routes"]), EXPECTED_ROUTES)
        self.assertEqual(session["apiClient"]["requestFixture"], "examples/local-events/api-requests.json")

        sdk = session["sdk"]
        self.assertEqual(sdk["module"], "packages/sdk-js/src/localEvents.ts")
        self.assertGreaterEqual(
            set(sdk["entrypoints"]),
            {
                "loadLocalEventCatalogFixture",
                "validateLocalEventCatalogFixture",
                "summarizeLocalEventCatalog",
                "createLocalEventReplayBatches",
                "createLocalEventCatalogFixtureFetch",
            },
        )
        self.assertEqual(
            [step["step"] for step in sdk["flow"]],
            [
                "load_catalog_fixture",
                "summarize_catalog",
                "create_replay_batches",
                "create_fixture_fetch",
            ],
        )
        self.assertEqual([call["status"] for call in sdk["fixtureFetchCalls"]], [200, 200, 200])

        cli = session["cli"]
        self.assertEqual(cli["exportModule"], "packages/cli/src/localEventExports.ts")
        self.assertEqual(cli["replayModule"], "packages/cli/src/localEvents.ts")
        self.assertEqual(cli["exportPlan"]["formats"], ["jsonl", "csv", "package"])
        self.assertEqual(len(cli["exportPlan"]["commands"]), 3)
        self.assertIs(cli["exportPlan"]["stdoutOnly"], True)
        self.assertEqual(cli["importPlan"]["sourcePath"], "examples/local-events/import-plan.json")
        self.assertEqual(cli["importPlan"]["strategy"], self.import_plan["replayPlan"]["strategy"])
        self.assertEqual(cli["importPlan"]["dryRun"], self.import_plan["replayPlan"]["dryRun"])
        self.assertEqual(
            cli["importPlan"]["preflightCheckIds"],
            [check["id"] for check in self.import_plan["preflightChecks"]],
        )

        web = session["web"]
        self.assertEqual(web["module"], "apps/web/src/localEventCatalog.ts")
        self.assertEqual(web["stateBuilder"], "buildLocalEventCatalogState")
        self.assertEqual(web["state"]["id"], "local_event_catalog")
        self.assertEqual(web["state"]["totalCount"], len(catalog_event_ids))
        self.assertEqual(web["state"]["visibleEventIds"], ["evt_catalog_002", "evt_catalog_004"])
        self.assertEqual(web["state"]["redactions"]["total"], 3)

        sync = session["sync"]["reconciliation"]
        self.assertEqual(session["sync"]["service"], "services/sync/src/replay.ts")
        self.assertRegex(sync["afterCursor"], CURSOR_PATTERN)
        self.assertRegex(sync["nextCursor"], CURSOR_PATTERN)
        self.assertEqual(sync["acceptedEventIds"], catalog_event_ids)
        self.assertEqual(sync["integrity"]["status"], "ok")
        self.assertEqual(sync["integrity"]["issueCount"], 0)
        self.assertEqual(sync["audit"]["eventCount"], len(catalog_event_ids))
        self.assertIs(sync["audit"]["redactsIdentifiers"], True)

        audit = session["auditExport"]
        self.assertEqual(audit["module"], "packages/cli/src/localEventExports.ts")
        self.assertEqual(audit["packageKind"], "local-events.catalog-replay-export.package")
        self.assertEqual(audit["manifestKind"], "local-events.catalog-replay-export.manifest")
        self.assertEqual(audit["formats"], ["jsonl", "csv", "package"])
        self.assertIn("eventDigest", audit["retainedFields"])
        self.assertIn("redacted", audit["retainedFields"])

    def test_examples_stay_local_public_safe_and_reference_existing_paths(self) -> None:
        for path in (DOC_PATH, API_REQUESTS_PATH, SDK_SESSION_PATH):
            with self.subTest(path=path.name):
                _assert_no_restricted_terms(self, path)
                _assert_no_secret_shapes(self, path)

        for data in (self.api_requests, self.sdk_session):
            for key_path, value in _walk_key_values(data):
                with self.subTest(key_path=".".join(key_path)):
                    if isinstance(value, str):
                        lower_value = value.lower()
                        self.assertNotIn("https://", lower_value)
                        self.assertNotIn("curl ", lower_value)
                        self.assertNotIn("npx ", lower_value)
                        self.assertNotIn("npm install -g", lower_value)
                        self.assertNotIn(".codex-private", lower_value)
                        self.assertNotIn("sovereignops-codex-pack", lower_value)
                        if value.startswith("http://"):
                            self.assertTrue(value.startswith(LOCAL_HTTP_PREFIXES), value)

                    key = key_path[-1]
                    if key.endswith("Path") or key in {"path", "module", "exportModule", "replayModule", "requestFixture"}:
                        if isinstance(value, str) and value.startswith(("examples/", "apps/", "packages/", "services/")):
                            _assert_safe_existing_relative_path(self, value)

        self.assertEqual(self.api_requests["validationCommands"], list(EXPECTED_VALIDATION_COMMANDS))
        self.assertEqual(self.sdk_session["validationCommands"], list(EXPECTED_VALIDATION_COMMANDS))


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _request_by_id(examples: dict[str, Any], request_id: str) -> dict[str, Any]:
    for request in examples["requests"]:
        if request["id"] == request_id:
            return request
    raise AssertionError(f"missing request id: {request_id}")


def _events_from_refs(
    catalog_events: list[dict[str, Any]],
    refs: list[str],
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for ref in refs:
        match = EVENT_REF_PATTERN.match(ref)
        if not match:
            raise AssertionError(f"invalid event ref: {ref}")
        index = int(match.group(1))
        if index < 0 or index >= len(catalog_events):
            raise AssertionError(f"event ref out of range: {ref}")
        events.append(catalog_events[index])
    return events


def _walk_key_values(value: Any, key_path: tuple[str, ...] = ()) -> list[tuple[tuple[str, ...], Any]]:
    pairs: list[tuple[tuple[str, ...], Any]] = []
    if isinstance(value, dict):
        for key, item in value.items():
            item_path = (*key_path, key)
            pairs.append((item_path, item))
            pairs.extend(_walk_key_values(item, item_path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            pairs.extend(_walk_key_values(item, (*key_path, str(index))))
    return pairs


def _assert_safe_existing_relative_path(testcase: unittest.TestCase, value: str) -> None:
    normalized = value.replace("\\", "/")
    path = Path(normalized)
    testcase.assertFalse(path.is_absolute(), value)
    testcase.assertNotIn("..", path.parts, value)
    testcase.assertTrue((ROOT / path).is_file(), value)


def _assert_no_restricted_terms(testcase: unittest.TestCase, path: Path) -> None:
    text = path.read_text(encoding="utf-8").lower()
    restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
    for term in restricted_terms:
        if term.isascii():
            escaped = re.escape(term).replace(r"\ ", r"\s+")
            pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
            testcase.assertIsNone(pattern.search(text), f"{path} contains restricted wording")
        else:
            testcase.assertNotIn(term, text, f"{path} contains restricted wording")


def _assert_no_secret_shapes(testcase: unittest.TestCase, path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    for pattern in SECRET_PATTERNS:
        testcase.assertIsNone(pattern.search(text), f"{path} contains secret-shaped text")


if __name__ == "__main__":
    unittest.main()
