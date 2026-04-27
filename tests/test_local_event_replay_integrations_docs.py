from __future__ import annotations

import hashlib
import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "local-event-replay-integrations.md"
CATALOG_PATH = ROOT / "examples" / "local-events" / "catalog.json"
EXPORT_PATH = ROOT / "examples" / "local-events" / "export-session.json"
IMPORT_PATH = ROOT / "examples" / "local-events" / "import-plan.json"

EXPECTED_SECTIONS = (
    "# Local Event Replay Integrations",
    "## Scope",
    "## Export Session",
    "## Import Plan",
    "## Layer Handoff",
    "## Encryption And Local Boundary",
    "## Audit And Replay Checks",
    "## Validation",
)

EXPECTED_REFERENCES = (
    "examples/local-events/catalog.json",
    "examples/local-events/export-session.json",
    "examples/local-events/import-plan.json",
    "packages/sdk-js/src/localEvents.ts",
    "packages/cli/src/localEvents.ts",
    "apps/web/src/localEventCatalog.ts",
    "services/sync/src/replay.ts",
    "loadLocalEventCatalogFixture",
    "summarizeLocalEventCatalog",
    "createLocalEventReplayBatches",
    "createLocalEventCatalogFixtureFetch",
    "buildLocalEventCatalogState",
    "filterCanonicalLocalEvents",
    "summarizeLocalEvents",
    "replayAcceptedEvents",
    "detectReplayIntegrityIssues",
    "createReplayAuditSummary",
    "end-to-end",
    "ciphertext-only",
    "redaction metadata",
    "cur_v1:0000000000000000:origin",
)

EXPECTED_COMMANDS = (
    r"node packages\cli\src\index.ts local-events catalog inspect --input-path examples\local-events\catalog.json",
    r"node packages\cli\src\index.ts local-events catalog replay --input-path examples\local-events\catalog.json --from-sequence 1 --limit 5",
    r"python -m json.tool examples\local-events\export-session.json",
    r"python -m json.tool examples\local-events\import-plan.json",
    "python -m unittest tests.test_local_event_replay_integrations_docs",
)

EVENT_DIGEST_KEYS = (
    "schemaVersion",
    "id",
    "workspaceId",
    "actorId",
    "sequence",
    "occurredAt",
    "recordedAt",
    "localOnly",
    "operation",
    "payload",
    "payloadDigest",
    "previousDigest",
    "redactionMetadata",
)

ZERO_OPERATION_COUNTS = {
    "append": 0,
    "update": 0,
    "delete": 0,
    "approval_requested": 0,
    "approval_approved": 0,
    "approval_rejected": 0,
}

ZERO_SCHEMA_KIND_COUNTS = {
    "docs": 0,
    "projects": 0,
    "incidents": 0,
    "comments": 0,
    "attachments": 0,
    "approvals": 0,
}

TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
EVENT_ID_PATTERN = re.compile(r"^evt_[A-Za-z0-9_-]{1,88}$")
WORKSPACE_ID_PATTERN = re.compile(r"^wsp_[A-Za-z0-9_-]{1,88}$")
DEVICE_ID_PATTERN = re.compile(r"^dev_[A-Za-z0-9_-]{1,88}$")
SESSION_ID_PATTERN = re.compile(r"^sess_[A-Za-z0-9_-]{1,88}$")
PLAN_ID_PATTERN = re.compile(r"^plan_[A-Za-z0-9_-]{1,88}$")
CURSOR_PATTERN = re.compile(r"^cur_v1:([0-9]{16}):(origin|evt_[A-Za-z0-9_-]{1,88})$")
SHA256_URN_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")
EVENT_REF_PATTERN = re.compile(r"^catalog\.events\[(\d+)\]$")
LOCAL_URI_PREFIXES = ("fixture://local-events/", "local://", "workspace://")


class LocalEventReplayIntegrationsDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_doc_text = cls.doc_text.lower()
        cls.catalog = _load_json(CATALOG_PATH)
        cls.export = _load_json(EXPORT_PATH)
        cls.import_plan = _load_json(IMPORT_PATH)

    def test_document_covers_public_integration_contract(self) -> None:
        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for reference in EXPECTED_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, self.doc_text)

        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

        for relative_path in (
            "examples/local-events/catalog.json",
            "examples/local-events/export-session.json",
            "examples/local-events/import-plan.json",
            "packages/sdk-js/src/localEvents.ts",
            "packages/cli/src/localEvents.ts",
            "apps/web/src/localEventCatalog.ts",
            "services/sync/src/replay.ts",
        ):
            with self.subTest(path=relative_path):
                self.assertTrue((ROOT / relative_path).is_file(), relative_path)

        self.assertNotIn("curl ", self.lower_doc_text)
        self.assertNotIn("https://", self.lower_doc_text)
        self.assertNotIn("npx ", self.lower_doc_text)
        self.assertNotIn("npm install -g", self.lower_doc_text)

    def test_export_session_links_catalog_batches_and_audit_summary(self) -> None:
        export = self.export
        catalog = self.catalog
        catalog_events = catalog["events"]
        catalog_event_ids = [event["id"] for event in catalog_events]

        self.assertEqual(export["schemaVersion"], "local-event-replay-export-session/v1")
        self.assertRegex(export["generatedAt"], TIMESTAMP_PATTERN)
        self.assertRegex(export["workspaceId"], WORKSPACE_ID_PATTERN)
        self.assertRegex(export["sessionId"], SESSION_ID_PATTERN)
        self.assertRegex(export["deviceId"], DEVICE_ID_PATTERN)
        self.assertIs(export["localOnly"], True)
        self.assertEqual(export["workspaceId"], catalog["workspaceId"])

        export_catalog = export["catalog"]
        self.assertEqual(export_catalog["path"], "examples/local-events/catalog.json")
        self.assertEqual(export_catalog["schemaVersion"], catalog["schemaVersion"])
        self.assertEqual(export_catalog["eventCount"], len(catalog_events))
        self.assertEqual(export_catalog["eventIds"], catalog_event_ids)
        self.assertEqual(export_catalog["lastEventDigest"], event_digest(catalog_events[-1]))

        encryption = export["encryption"]
        self.assertEqual(encryption["mode"], "end-to-end")
        self.assertEqual(encryption["envelopeKind"], "local-event-replay.sealed-export")
        self.assertEqual(encryption["keyScope"], "workspace-device")
        self.assertEqual(encryption["payloadStorage"], "ciphertext-only")
        self.assertRegex(encryption["contentDigest"], SHA256_URN_PATTERN)
        self.assertIn("redactionMetadata", encryption["cleartextFields"])
        self.assertNotIn("body", " ".join(encryption["cleartextFields"]).lower())
        self.assertNotIn("reason", " ".join(encryption["cleartextFields"]).lower())

        self.assertEqual(export["network"]["mode"], "disabled")
        for prefix in export["network"]["allowedUriPrefixes"]:
            with self.subTest(prefix=prefix):
                self.assertTrue(prefix.startswith(LOCAL_URI_PREFIXES), prefix)

        replayed_event_ids: list[str] = []
        for batch_index, batch in enumerate(export["replayBatches"], start=1):
            with self.subTest(batch=batch["batchId"]):
                events = _events_from_refs(catalog_events, batch["eventRefs"])
                replayed_event_ids.extend(event["id"] for event in events)
                self.assertEqual(batch["batchIndex"], batch_index)
                self.assertEqual(batch["eventCount"], len(events))
                self.assertEqual(batch["firstSequence"], events[0]["sequence"])
                self.assertEqual(batch["lastSequence"], events[-1]["sequence"])
                self.assertEqual(batch["firstEventId"], events[0]["id"])
                self.assertEqual(batch["lastEventId"], events[-1]["id"])
                self.assertEqual(batch["previousDigest"], events[0]["previousDigest"])
                self.assertEqual(batch["finalDigest"], event_digest(events[-1]))
                self.assertEqual(
                    batch["payloadDigests"],
                    [event["payloadDigest"] for event in events],
                )
                self.assertEqual(batch["operations"], _count_by(events, "operation", ZERO_OPERATION_COUNTS))
                self.assertEqual(
                    batch["schemaKinds"],
                    _count_by_payload_key(events, "schemaKind", ZERO_SCHEMA_KIND_COUNTS),
                )

        self.assertEqual(replayed_event_ids, catalog_event_ids)

        surfaces = export["surfaces"]
        self.assertEqual(surfaces["sdk"]["package"], "packages/sdk-js")
        self.assertIn("createLocalEventReplayBatches", surfaces["sdk"]["entryPoints"])
        self.assertEqual(surfaces["cli"]["package"], "packages/cli")
        self.assertEqual(surfaces["web"]["package"], "apps/web")
        self.assertEqual(surfaces["sync"]["service"], "services/sync/src/replay.ts")

        audit = export["auditSummary"]
        self.assertEqual(audit["kind"], "local-event-replay.export.audit")
        self.assertEqual(audit["eventCount"], len(catalog_events))
        self.assertEqual(audit["redactedEventCount"], _redacted_event_count(catalog_events))
        self.assertEqual(audit["redactedFieldCount"], _redacted_field_count(catalog_events))
        self.assertEqual(audit["includedEventIds"], catalog_event_ids)
        self.assertEqual(audit["cursorWindow"]["afterCursor"], "cur_v1:0000000000000000:origin")
        self.assertEqual(
            audit["cursorWindow"]["nextCursor"],
            f"cur_v1:{len(catalog_events):016d}:{catalog_event_ids[-1]}",
        )
        self.assertIs(audit["cursorWindow"]["hasMore"], False)

    def test_import_plan_matches_export_and_stages_replay_batches(self) -> None:
        plan = self.import_plan
        export = self.export
        catalog = self.catalog
        catalog_event_ids = [event["id"] for event in catalog["events"]]

        self.assertEqual(plan["schemaVersion"], "local-event-replay-import-plan/v1")
        self.assertRegex(plan["generatedAt"], TIMESTAMP_PATTERN)
        self.assertRegex(plan["workspaceId"], WORKSPACE_ID_PATTERN)
        self.assertRegex(plan["planId"], PLAN_ID_PATTERN)
        self.assertRegex(plan["targetDeviceId"], DEVICE_ID_PATTERN)
        self.assertIs(plan["localOnly"], True)
        self.assertEqual(plan["workspaceId"], export["workspaceId"])

        source = plan["source"]
        self.assertEqual(source["exportPath"], "examples/local-events/export-session.json")
        self.assertEqual(source["exportSessionId"], export["sessionId"])
        self.assertEqual(source["catalogPath"], export["catalog"]["path"])
        self.assertEqual(source["expectedEventCount"], export["catalog"]["eventCount"])
        self.assertEqual(source["expectedLastEventDigest"], export["catalog"]["lastEventDigest"])

        encryption = plan["encryption"]
        self.assertIs(encryption["requiresEndToEndEnvelope"], True)
        self.assertEqual(encryption["acceptedEnvelopeKind"], export["encryption"]["envelopeKind"])
        self.assertEqual(encryption["payloadStorage"], export["encryption"]["payloadStorage"])
        self.assertEqual(encryption["contentDigest"], export["encryption"]["contentDigest"])

        seen_checks: set[str] = set()
        for check in plan["preflightChecks"]:
            with self.subTest(check=check["id"]):
                self.assertNotIn(check["id"], seen_checks)
                seen_checks.add(check["id"])
                self.assertEqual(check["status"], "required")
                self.assertTrue(check["expects"].strip())
                _assert_safe_existing_relative_path(self, check["inputPath"])

        self.assertGreaterEqual(
            seen_checks,
            {
                "load_export_session",
                "load_catalog",
                "verify_digest_chain",
                "verify_cursor_window",
                "verify_ciphertext_payload",
            },
        )

        replay = plan["replayPlan"]
        self.assertEqual(replay["strategy"], "stage-then-apply")
        self.assertIs(replay["dryRun"], True)
        self.assertRegex(replay["baseCursor"], CURSOR_PATTERN)
        self.assertEqual(replay["baseCursor"], self.export["auditSummary"]["cursorWindow"]["afterCursor"])
        self.assertEqual(replay["nextCursor"], self.export["auditSummary"]["cursorWindow"]["nextCursor"])
        self.assertGreaterEqual(replay["maxBatchEvents"], max(batch["eventCount"] for batch in export["replayBatches"]))
        self.assertEqual(replay["integrityFailureMode"], "block_import")
        self.assertEqual(replay["duplicateEventHandling"], "skip_when_digest_matches")

        export_batches = export["replayBatches"]
        self.assertEqual(len(replay["batches"]), len(export_batches))
        planned_event_ids: list[str] = []
        for index, planned_batch in enumerate(replay["batches"]):
            with self.subTest(planned_batch=planned_batch["batchId"]):
                export_batch = export_batches[index]
                self.assertEqual(planned_batch["batchId"], export_batch["batchId"])
                self.assertEqual(planned_batch["sourceRef"], f"exportSession.replayBatches[{index}]")
                self.assertEqual(
                    planned_batch["eventIds"],
                    [event["id"] for event in _events_from_refs(catalog["events"], export_batch["eventRefs"])],
                )
                self.assertEqual(planned_batch["stage"], "ready")
                planned_event_ids.extend(planned_batch["eventIds"])

        self.assertEqual(planned_event_ids, catalog_event_ids)

        audit = plan["audit"]
        self.assertEqual(audit["kind"], "local-event-replay.import.audit-plan")
        self.assertEqual(
            audit["records"],
            ["manifest_checked", "catalog_validated", "batch_staged", "replay_window_verified"],
        )
        self.assertEqual(audit["redactedFields"], sorted(set(audit["redactedFields"])))
        self.assertGreaterEqual(
            set(audit["retainedFields"]),
            {"eventIds", "payloadDigest", "previousDigest", "redactionMetadata"},
        )

    def test_examples_stay_local_public_safe_and_reference_existing_paths(self) -> None:
        for path in (DOC_PATH, EXPORT_PATH, IMPORT_PATH):
            with self.subTest(path=path.name):
                _assert_no_guarded_terms(self, path)

        for path in (EXPORT_PATH, IMPORT_PATH):
            data = _load_json(path)
            for key_path, value in _walk_key_values(data):
                with self.subTest(path=path.name, key_path=".".join(key_path)):
                    if isinstance(value, str):
                        lower_value = value.lower()
                        self.assertNotIn("https://", lower_value)
                        self.assertNotIn("curl ", lower_value)
                        self.assertNotIn("npx ", lower_value)
                        self.assertNotIn("npm install -g", lower_value)
                        self.assertNotIn(".codex-private", lower_value)
                        self.assertNotIn("sovereignops-codex-pack", lower_value)
                        if value.startswith("http://"):
                            self.assertTrue(value.startswith("http://127.0.0.1"), value)
                        if value.startswith(("fixture://", "local://", "workspace://")):
                            self.assertTrue(value.startswith(LOCAL_URI_PREFIXES), value)

                    key = key_path[-1]
                    if key.endswith("Path") or key == "path":
                        self.assertIsInstance(value, str)
                        _assert_safe_existing_relative_path(self, value)

        export_commands = set(self.export["validationCommands"])
        import_commands = set(self.import_plan["validationCommands"])
        self.assertEqual(export_commands, import_commands)
        for command in EXPECTED_COMMANDS[-3:]:
            self.assertIn(command, export_commands)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def digest(value: Any) -> str:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def event_digest(event: dict[str, Any]) -> str:
    return digest({key: event[key] for key in EVENT_DIGEST_KEYS})


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


def _count_by(
    events: list[dict[str, Any]],
    key: str,
    zero_counts: dict[str, int],
) -> dict[str, int]:
    counts = dict(zero_counts)
    for event in events:
        counts[event[key]] += 1
    return counts


def _count_by_payload_key(
    events: list[dict[str, Any]],
    key: str,
    zero_counts: dict[str, int],
) -> dict[str, int]:
    counts = dict(zero_counts)
    for event in events:
        counts[event["payload"][key]] += 1
    return counts


def _redacted_event_count(events: list[dict[str, Any]]) -> int:
    return sum(1 for event in events if event["redactionMetadata"]["redacted"])


def _redacted_field_count(events: list[dict[str, Any]]) -> int:
    return sum(event["redactionMetadata"]["redactedFieldCount"] for event in events)


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


if __name__ == "__main__":
    unittest.main()
