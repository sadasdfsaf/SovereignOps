from __future__ import annotations

import hashlib
import json
import re
import unittest
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "local-event-catalog.md"
CATALOG_PATH = ROOT / "examples" / "local-events" / "catalog.json"
REPLAY_PATH = ROOT / "examples" / "local-events" / "replay-session.json"

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

SCHEMA_KIND_PREFIXES = {
    "docs": "doc_",
    "projects": "prj_",
    "incidents": "inc_",
    "comments": "cmt_",
    "attachments": "att_",
    "approvals": "apv_",
}

API_STATUS_BY_CODE = {
    "bad_request": 400,
    "unauthenticated": 401,
    "forbidden": 403,
    "not_found": 404,
    "conflict": 409,
    "validation_failed": 422,
    "rate_limited": 429,
    "internal_error": 500,
    "service_unavailable": 503,
}

HEX_DIGEST_PATTERN = re.compile(r"^[a-f0-9]{64}$")
TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
EVENT_ID_PATTERN = re.compile(r"^evt_[A-Za-z0-9_-]{1,88}$")
WORKSPACE_ID_PATTERN = re.compile(r"^wsp_[A-Za-z0-9_-]{1,88}$")
ACTOR_ID_PATTERN = re.compile(r"^act_[A-Za-z0-9_-]{1,88}$")
DEVICE_ID_PATTERN = re.compile(r"^dev_[A-Za-z0-9_-]{1,88}$")
REQUEST_ID_PATTERN = re.compile(r"^req_[A-Za-z0-9_-]{8,96}$")
CURSOR_PATTERN = re.compile(r"^cur_v1:([0-9]{16}):(origin|evt_[A-Za-z0-9_-]{1,88})$")
PATH_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_.\[\]-]{0,191}$")


class LocalEventCatalogDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        cls.replay = json.loads(REPLAY_PATH.read_text(encoding="utf-8"))

    def test_document_covers_catalog_errors_redaction_and_replay(self) -> None:
        for section in (
            "# Local Event Catalog",
            "## Contract",
            "## Layer Handoff",
            "## API Errors",
            "## Redaction Metadata",
            "## Replay Fixtures",
            "## Change Checklist",
            "## Validation",
        ):
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for phrase in (
            "`packages/schemas/src/eventCatalog.ts`",
            "`packages/schemas/src/apiError.ts`",
            "`examples/local-events/catalog.json`",
            "`examples/local-events/replay-session.json`",
            "`packages/sdk-js`",
            "`packages/cli/src/commands.ts`",
            "`apps/web/src/documents.ts`",
            "`apps/web/src/auditTimeline.ts`",
            "`services/sync/src/replay.ts`",
            "`payloadDigest`",
            "`previousDigest`",
            "`redactionMetadata`",
            "`api-error/v1`",
            "`cur_v1`",
            "python -m unittest tests.test_local_event_catalog_docs",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.doc_text)

    def test_catalog_fixture_is_canonical_and_chained(self) -> None:
        catalog = self.catalog
        self.assertEqual(catalog["schemaVersion"], "canonical-local-event-catalog/v1")
        self.assertEqual(catalog["workspaceId"], "wsp_local_catalog")
        self.assertIs(catalog["localOnly"], True)
        self.assertRegex(catalog["generatedAt"], TIMESTAMP_PATTERN)
        self.assertGreaterEqual(len(catalog["events"]), 5)

        previous_digest: str | None = None
        previous_recorded_at: datetime | None = None
        seen_ids: set[str] = set()
        operations: list[str] = []

        for index, event in enumerate(catalog["events"], start=1):
            with self.subTest(event=event["id"]):
                self.assertEqual(event["schemaVersion"], "canonical-local-event/v1")
                self.assertRegex(event["id"], EVENT_ID_PATTERN)
                self.assertNotIn(event["id"], seen_ids)
                seen_ids.add(event["id"])
                self.assertEqual(event["workspaceId"], catalog["workspaceId"])
                self.assertRegex(event["actorId"], ACTOR_ID_PATTERN)
                self.assertEqual(event["sequence"], index)
                self.assertIs(event["localOnly"], True)
                self.assertEqual(event["payloadDigest"], digest(event["payload"]))
                self.assertEqual(event["previousDigest"], previous_digest)
                self.assertRegex(event["payloadDigest"], HEX_DIGEST_PATTERN)

                occurred_at = parse_timestamp(event["occurredAt"])
                recorded_at = parse_timestamp(event["recordedAt"])
                self.assertGreaterEqual(recorded_at, occurred_at)
                if previous_recorded_at is not None:
                    self.assertGreaterEqual(recorded_at, previous_recorded_at)
                previous_recorded_at = recorded_at

                self.assert_payload_matches_operation(event)
                self.assert_redaction_metadata(event["redactionMetadata"])
                operations.append(event["operation"])
                previous_digest = event_digest(event)

        self.assertEqual(
            operations,
            ["append", "update", "append", "approval_requested", "approval_rejected"],
        )
        self.assertGreaterEqual(parse_timestamp(catalog["generatedAt"]), previous_recorded_at)

    def test_replay_fixture_links_catalog_to_sdk_cli_web_and_sync(self) -> None:
        replay = self.replay
        catalog = self.catalog
        catalog_events = {event["id"]: event for event in catalog["events"]}
        event_ids = [event["id"] for event in catalog["events"]]

        self.assertEqual(replay["schemaVersion"], "local-event-replay-session/v1")
        self.assertEqual(replay["workspaceId"], catalog["workspaceId"])
        self.assertRegex(replay["deviceId"], DEVICE_ID_PATTERN)
        self.assertEqual(replay["catalog"]["path"], "examples/local-events/catalog.json")
        self.assertEqual(replay["catalog"]["schemaVersion"], catalog["schemaVersion"])
        self.assertEqual(replay["catalog"]["eventCount"], len(event_ids))
        self.assertEqual(replay["catalog"]["eventIds"], event_ids)

        self.assertEqual(replay["sdk"]["package"], "packages/sdk-js")
        self.assertGreaterEqual(
            set(replay["sdk"]["entrypoints"]),
            {"createInMemoryWorkspaceClient", "appendEvent", "listEvents"},
        )
        self.assertEqual(replay["cli"]["entrypoint"], "packages/cli/src/commands.ts")
        self.assertEqual(replay["cli"]["argv"][0:2], ["ingest", "event"])
        self.assertEqual(replay["cli"]["stdinRef"], "catalog.events[0]")
        self.assertIn("apps/web/src/documents.ts", replay["web"]["packages"])
        self.assertIn("apps/web/src/auditTimeline.ts", replay["web"]["packages"])
        self.assertIn("redactionMetadata", replay["web"]["timelineFields"])

        sync = replay["sync"]
        self.assertEqual(sync["service"], "services/sync/src/replay.ts")
        self.assertEqual(sync["afterCursor"], "cur_v1:0000000000000000:origin")
        self.assertEqual(sync["nextCursor"], f"cur_v1:{len(event_ids):016d}:{event_ids[-1]}")
        self.assertIs(sync["hasMore"], False)
        self.assertEqual([event["id"] for event in sync["acceptedEvents"]], event_ids)

        for index, accepted in enumerate(sync["acceptedEvents"], start=1):
            with self.subTest(sync_event=accepted["id"]):
                catalog_event = catalog_events[accepted["id"]]
                self.assertEqual(accepted["workspaceId"], replay["workspaceId"])
                self.assertEqual(accepted["deviceId"], replay["deviceId"])
                self.assertEqual(accepted["sequence"], index)
                self.assertEqual(accepted["createdAt"], catalog_event["recordedAt"])
                self.assertEqual(
                    accepted["type"],
                    f"canonicalLocalEvent.{catalog_event['operation']}",
                )
                self.assertEqual(accepted["cursor"], f"cur_v1:{index:016d}:{accepted['id']}")
                self.assertRegex(accepted["cursor"], CURSOR_PATTERN)
                self.assertEqual(accepted["payload"]["catalogEventId"], accepted["id"])
                self.assertEqual(accepted["payload"]["catalogSequence"], index)
                self.assertEqual(accepted["payload"]["operation"], catalog_event["operation"])
                self.assertEqual(accepted["payload"]["payloadDigest"], catalog_event["payloadDigest"])
                self.assertEqual(
                    accepted["payload"]["redactionMetadata"],
                    catalog_event["redactionMetadata"],
                )

        self.assertEqual(
            replay["web"]["visibleEventIds"],
            [event["id"] for event in catalog["events"] if not event["redactionMetadata"]["redacted"]],
        )

    def test_api_error_fixture_matches_shared_error_contract(self) -> None:
        errors = self.replay["apiErrors"]
        self.assertEqual(len(errors), 1)
        response = errors[0]["response"]
        error = response["error"]

        self.assertEqual(response["schemaVersion"], "api-error/v1")
        self.assertEqual(error["code"], "validation_failed")
        self.assertEqual(error["status"], API_STATUS_BY_CODE[error["code"]])
        self.assertRegex(error["requestId"], REQUEST_ID_PATTERN)
        self.assertGreaterEqual(len(error["issues"]), 1)

        issue_keys = []
        for issue in error["issues"]:
            with self.subTest(issue=issue["path"]):
                self.assertIn(issue["code"], {
                    "required",
                    "invalid_type",
                    "invalid_format",
                    "invalid_value",
                    "too_small",
                    "too_large",
                    "not_allowed",
                    "duplicate",
                    "not_sorted",
                })
                self.assertRegex(issue["path"], re.compile(r"^[A-Za-z][A-Za-z0-9_.\[\]-]*$"))
                self.assertIsInstance(issue["message"], str)
                self.assertTrue(issue["message"].strip())
                issue_keys.append(f"{issue['path']}\0{issue['code']}")

        self.assertEqual(issue_keys, sorted(issue_keys))

    def test_public_files_avoid_restricted_terms(self) -> None:
        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for path in (DOC_PATH, CATALOG_PATH, REPLAY_PATH):
            text = path.read_text(encoding="utf-8").lower()
            for term in restricted_terms:
                with self.subTest(path=path.name, term=term):
                    if term.isascii():
                        escaped = re.escape(term).replace(r"\ ", r"\s+")
                        pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                        self.assertIsNone(pattern.search(text))
                    else:
                        self.assertNotIn(term, text)

    def assert_payload_matches_operation(self, event: dict[str, Any]) -> None:
        payload = event["payload"]
        schema_kind = payload["schemaKind"]
        self.assertIn(schema_kind, SCHEMA_KIND_PREFIXES)
        self.assertTrue(payload["recordId"].startswith(SCHEMA_KIND_PREFIXES[schema_kind]))
        self.assertIsInstance(payload["summary"], str)
        self.assertTrue(payload["summary"].strip())
        if "targetId" in payload:
            self.assertRegex(payload["targetId"], re.compile(r"^(?:doc|prj|inc|cmt|att|apv)_"))
        if "fields" in payload:
            self.assertEqual(payload["fields"], sorted(set(payload["fields"])))
            for field in payload["fields"]:
                self.assertRegex(field, PATH_PATTERN)

        operation = event["operation"]
        if operation == "append":
            self.assertIn("afterDigest", payload)
            self.assertNotIn("beforeDigest", payload)
            self.assertNotIn("decision", payload)
        elif operation == "update":
            self.assertIn("beforeDigest", payload)
            self.assertIn("afterDigest", payload)
            self.assertIn("fields", payload)
            self.assertNotEqual(payload["beforeDigest"], payload["afterDigest"])
        elif operation == "delete":
            self.assertIn("beforeDigest", payload)
            self.assertNotIn("afterDigest", payload)
            self.assertNotIn("decision", payload)
        elif operation == "approval_requested":
            self.assertEqual(payload["approvalStatus"], "requested")
            self.assertIn("approvalId", payload)
            self.assertIn("afterDigest", payload)
            self.assertNotIn("decision", payload)
        elif operation == "approval_approved":
            self.assert_approval_decision_payload(payload, "approved")
        elif operation == "approval_rejected":
            self.assert_approval_decision_payload(payload, "rejected")
        else:
            self.fail(f"unexpected operation: {operation}")

        for key in ("beforeDigest", "afterDigest"):
            if key in payload:
                self.assertRegex(payload[key], HEX_DIGEST_PATTERN)

    def assert_approval_decision_payload(self, payload: dict[str, Any], decision: str) -> None:
        self.assertEqual(payload["approvalStatus"], decision)
        self.assertEqual(payload["decision"], decision)
        self.assertIn("approvalId", payload)
        self.assertIn("beforeDigest", payload)
        self.assertIn("afterDigest", payload)
        self.assertIn("fields", payload)
        self.assertNotEqual(payload["beforeDigest"], payload["afterDigest"])

    def assert_redaction_metadata(self, value: dict[str, Any]) -> None:
        self.assertEqual(
            set(value),
            {"redacted", "redactedFieldCount", "redactedPaths", "retainedMetadataKeys"},
        )
        self.assertEqual(value["redactedFieldCount"], len(value["redactedPaths"]))
        self.assertEqual(value["redacted"], value["redactedFieldCount"] > 0)
        self.assertEqual(value["redactedPaths"], sorted(set(value["redactedPaths"])))
        self.assertEqual(value["retainedMetadataKeys"], sorted(set(value["retainedMetadataKeys"])))
        for field_path in value["redactedPaths"]:
            self.assertRegex(field_path, PATH_PATTERN)
        for key in value["retainedMetadataKeys"]:
            self.assertRegex(key, re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$"))


def digest(value: Any) -> str:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def event_digest(event: dict[str, Any]) -> str:
    return digest({key: event[key] for key in EVENT_DIGEST_KEYS})


def parse_timestamp(value: str) -> datetime:
    if not TIMESTAMP_PATTERN.match(value):
        raise AssertionError(f"timestamp has invalid shape: {value}")
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)


if __name__ == "__main__":
    unittest.main()
