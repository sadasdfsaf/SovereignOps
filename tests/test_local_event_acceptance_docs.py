from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "local-event-acceptance.md"
ACCEPTANCE_PATH = ROOT / "examples" / "local-events" / "acceptance-session.json"
CATALOG_PATH = ROOT / "examples" / "local-events" / "catalog.json"
API_REQUESTS_PATH = ROOT / "examples" / "local-events" / "api-requests.json"
SDK_SESSION_PATH = ROOT / "examples" / "local-events" / "sdk-session.json"
EXPORT_SESSION_PATH = ROOT / "examples" / "local-events" / "export-session.json"
IMPORT_PLAN_PATH = ROOT / "examples" / "local-events" / "import-plan.json"

EXPECTED_SECTIONS = (
    "# Local Event Acceptance",
    "## Scope",
    "## Acceptance Session",
    "## API Fixture Replay",
    "## SDK Fake-Fetch Replay",
    "## CLI Export And Import Planning",
    "## Web Acceptance State",
    "## Sync Catalog Readiness",
    "## Local-First Checks",
    "## Validation Commands",
)

EXPECTED_GATE_IDS = (
    "api_fixture_replay",
    "sdk_fake_fetch_replay",
    "cli_export_import_planning",
    "web_acceptance_state",
    "sync_catalog_readiness",
)

EXPECTED_ROUTES = (
    "GET /v1/local-events/catalog",
    "GET /v1/local-events/summary",
    "GET /v1/local-events/replay-batches",
)

EXPECTED_REFERENCES = (
    "docs/local-event-acceptance.md",
    "docs/local-event-api.md",
    "examples/local-events/acceptance-session.json",
    "examples/local-events/api-requests.json",
    "examples/local-events/sdk-session.json",
    "examples/local-events/export-session.json",
    "examples/local-events/import-plan.json",
    "examples/local-events/catalog.json",
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
    "ciphertext-only",
    "cur_v1:0000000000000000:origin",
    "cur_v1:0000000000000005:evt_catalog_005",
)

EXPECTED_COMMANDS = (
    r"python -m json.tool examples\local-events\acceptance-session.json",
    "python -m unittest tests.test_local_event_acceptance_docs",
)

EXPECTED_VALIDATION_COMMANDS = (
    "python -m json.tool examples\\local-events\\acceptance-session.json",
    "python -m unittest tests.test_local_event_acceptance_docs",
)

LOCAL_HTTP_PREFIXES = ("http://127.0.0.1", "http://localhost", "http://[::1]")
LOCAL_URI_PREFIXES = ("fixture://local-events/", "local://", "workspace://")
TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$")
CURSOR_PATTERN = re.compile(r"^cur_v1:([0-9]{16}):(origin|evt_[A-Za-z0-9_-]{1,88})$")
HEX_DIGEST_PATTERN = re.compile(r"^[a-f0-9]{64}$")

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


class LocalEventAcceptanceDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_doc_text = cls.doc_text.lower()
        cls.acceptance = _load_json(ACCEPTANCE_PATH)
        cls.catalog = _load_json(CATALOG_PATH)
        cls.api_requests = _load_json(API_REQUESTS_PATH)
        cls.sdk_session = _load_json(SDK_SESSION_PATH)
        cls.export_session = _load_json(EXPORT_SESSION_PATH)
        cls.import_plan = _load_json(IMPORT_PLAN_PATH)

    def test_document_has_required_sections_references_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())

        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for route in EXPECTED_ROUTES:
            with self.subTest(route=route):
                self.assertIn(route, self.doc_text)

        for reference in EXPECTED_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, self.doc_text)

        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

        for phrase in (
            "local-first",
            "repository-relative",
            "loopback",
            "network access stays disabled",
            "does not store record bodies",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.lower_doc_text)

        self.assertNotIn("curl ", self.lower_doc_text)
        self.assertNotIn("https://", self.lower_doc_text)
        self.assertNotIn("npx ", self.lower_doc_text)
        self.assertNotIn("npm install -g", self.lower_doc_text)

    def test_acceptance_session_shape_and_catalog_link(self) -> None:
        acceptance = self.acceptance
        catalog_event_ids = [event["id"] for event in self.catalog["events"]]

        self.assertEqual(acceptance["schemaVersion"], "local-event-acceptance-session/v1")
        self.assertRegex(acceptance["generatedAt"], TIMESTAMP_PATTERN)
        self.assertTrue(acceptance["acceptanceId"].startswith("acc_"))
        self.assertEqual(acceptance["workspaceId"], self.catalog["workspaceId"])
        self.assertIs(acceptance["localOnly"], True)
        self.assertEqual(acceptance["network"]["mode"], "disabled")
        self.assertEqual(acceptance["network"]["allowedHttpPrefixes"], ["http://127.0.0.1"])
        self.assertEqual(acceptance["network"]["allowedUriPrefixes"], list(LOCAL_URI_PREFIXES))

        catalog = acceptance["catalog"]
        self.assertEqual(catalog["path"], "examples/local-events/catalog.json")
        self.assertEqual(catalog["schemaVersion"], self.catalog["schemaVersion"])
        self.assertEqual(catalog["eventCount"], len(catalog_event_ids))
        self.assertEqual(catalog["eventIds"], catalog_event_ids)
        self.assertRegex(catalog["lastEventDigest"], HEX_DIGEST_PATTERN)
        self.assertEqual(catalog["lastEventDigest"], self.api_requests["catalog"]["lastEventDigest"])
        self.assertEqual(catalog["lastEventDigest"], self.sdk_session["catalog"]["lastEventDigest"])

        self.assertEqual(tuple(gate["id"] for gate in acceptance["gates"]), EXPECTED_GATE_IDS)
        self.assertTrue(all(gate["status"] == "pass" for gate in acceptance["gates"]))
        self.assertEqual(acceptance["validationCommands"], list(EXPECTED_VALIDATION_COMMANDS))

    def test_acceptance_gates_match_api_sdk_cli_web_and_sync_fixtures(self) -> None:
        acceptance = self.acceptance
        catalog_event_ids = acceptance["catalog"]["eventIds"]
        gates = {gate["id"]: gate for gate in acceptance["gates"]}

        api_gate = gates["api_fixture_replay"]
        api_route_order = tuple(
            f"{item['route']['method']} {item['route']['path']}"
            for item in self.api_requests["requests"]
        )
        self.assertEqual(api_gate["sourcePath"], "examples/local-events/api-requests.json")
        self.assertTrue(api_gate["apiBase"].startswith(LOCAL_HTTP_PREFIXES))
        self.assertEqual(tuple(api_gate["routeOrder"]), EXPECTED_ROUTES)
        self.assertEqual(tuple(api_gate["routeOrder"]), api_route_order)
        self.assertEqual(api_gate["statusCodes"], [item["response"]["status"] for item in self.api_requests["requests"]])
        self.assertEqual(api_gate["batchCount"], _api_replay_body(self.api_requests)["batchCount"])
        self.assertEqual(api_gate["replayedEventIds"], catalog_event_ids)
        self.assertGreaterEqual(
            set(api_gate["retainedFields"]),
            {"eventId", "payloadDigest", "previousDigest", "redactionMetadata"},
        )

        sdk_gate = gates["sdk_fake_fetch_replay"]
        self.assertEqual(sdk_gate["sourcePath"], "examples/local-events/sdk-session.json")
        self.assertEqual(sdk_gate["module"], self.sdk_session["sdk"]["module"])
        self.assertEqual(sdk_gate["fakeFetchFactory"], "createLocalEventCatalogFixtureFetch")
        self.assertGreaterEqual(set(sdk_gate["entrypoints"]), set(self.sdk_session["sdk"]["entrypoints"]))
        self.assertEqual(
            sdk_gate["callOrder"],
            [call["path"] for call in self.sdk_session["sdk"]["fixtureFetchCalls"]],
        )
        self.assertEqual(
            sdk_gate["statusCodes"],
            [call["status"] for call in self.sdk_session["sdk"]["fixtureFetchCalls"]],
        )

        cli_gate = gates["cli_export_import_planning"]
        self.assertEqual(cli_gate["exportModule"], self.sdk_session["cli"]["exportModule"])
        self.assertEqual(cli_gate["replayModule"], self.sdk_session["cli"]["replayModule"])
        self.assertEqual(cli_gate["exportSessionPath"], "examples/local-events/export-session.json")
        self.assertEqual(cli_gate["importPlanPath"], "examples/local-events/import-plan.json")
        self.assertEqual(cli_gate["formats"], self.sdk_session["cli"]["exportPlan"]["formats"])
        self.assertEqual(cli_gate["payloadStorage"], self.export_session["encryption"]["payloadStorage"])
        self.assertEqual(cli_gate["dryRun"], self.import_plan["replayPlan"]["dryRun"])
        self.assertEqual(cli_gate["strategy"], self.import_plan["replayPlan"]["strategy"])
        self.assertEqual(cli_gate["preflightCheckIds"], [check["id"] for check in self.import_plan["preflightChecks"]])
        self.assertEqual(cli_gate["integrityFailureMode"], self.import_plan["replayPlan"]["integrityFailureMode"])

        web_gate = gates["web_acceptance_state"]
        self.assertEqual(web_gate["module"], self.sdk_session["web"]["module"])
        self.assertEqual(web_gate["stateBuilder"], self.sdk_session["web"]["stateBuilder"])
        self.assertEqual(web_gate["filterHelpers"], self.sdk_session["web"]["filterHelpers"])
        self.assertEqual(web_gate["state"], self.sdk_session["web"]["state"])

        sync_gate = gates["sync_catalog_readiness"]
        sdk_sync = self.sdk_session["sync"]["reconciliation"]
        self.assertEqual(sync_gate["service"], self.sdk_session["sync"]["service"])
        self.assertGreaterEqual(
            set(sync_gate["entrypoints"]),
            {"replayAcceptedEvents", "detectReplayIntegrityIssues", "createReplayAuditSummary"},
        )
        self.assertEqual(sync_gate["cursorWindow"]["afterCursor"], sdk_sync["afterCursor"])
        self.assertEqual(sync_gate["cursorWindow"]["nextCursor"], sdk_sync["nextCursor"])
        self.assertEqual(sync_gate["cursorWindow"]["hasMore"], sdk_sync["hasMore"])
        self.assertRegex(sync_gate["cursorWindow"]["afterCursor"], CURSOR_PATTERN)
        self.assertRegex(sync_gate["cursorWindow"]["nextCursor"], CURSOR_PATTERN)
        self.assertEqual(sync_gate["acceptedEventIds"], catalog_event_ids)
        self.assertEqual(sync_gate["acceptedEventIds"], sdk_sync["acceptedEventIds"])
        self.assertEqual(sync_gate["integrity"], sdk_sync["integrity"])
        self.assertEqual(sync_gate["audit"], sdk_sync["audit"])

    def test_examples_are_local_only_and_reference_existing_paths(self) -> None:
        for path in (DOC_PATH, ACCEPTANCE_PATH, Path(__file__)):
            with self.subTest(path=path.name):
                _assert_no_guarded_terms(self, path)
                _assert_no_secret_shapes(self, path)

        for key_path, value in _walk_key_values(self.acceptance):
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
                    if value.startswith(("fixture://", "local://", "workspace://")):
                        self.assertTrue(value.startswith(LOCAL_URI_PREFIXES), value)

                key = key_path[-1]
                if key.endswith("Path") or key in {
                    "guide",
                    "apiGuide",
                    "apiRequests",
                    "sdkSession",
                    "exportSession",
                    "importPlan",
                    "module",
                    "exportModule",
                    "replayModule",
                    "service",
                    "sourcePath",
                }:
                    if isinstance(value, str) and value.startswith(("docs/", "examples/", "apps/", "packages/", "services/")):
                        _assert_safe_existing_relative_path(self, value)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _api_replay_body(api_requests: dict[str, Any]) -> dict[str, Any]:
    for request in api_requests["requests"]:
        if request["id"] == "local_event_replay_batches_get":
            return request["response"]["body"]
    raise AssertionError("missing replay batches request")


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


def _assert_no_guarded_terms(testcase: unittest.TestCase, path: Path) -> None:
    text = path.read_text(encoding="utf-8").lower()
    guarded_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
    for term in guarded_terms:
        if term.isascii():
            escaped = re.escape(term).replace(r"\ ", r"\s+")
            pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
            testcase.assertIsNone(pattern.search(text), f"{path} contains guarded wording")
        else:
            testcase.assertNotIn(term, text, f"{path} contains guarded wording")


def _assert_no_secret_shapes(testcase: unittest.TestCase, path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    for pattern in SECRET_PATTERNS:
        testcase.assertIsNone(pattern.search(text), f"{path} contains secret-shaped text")


if __name__ == "__main__":
    unittest.main()
