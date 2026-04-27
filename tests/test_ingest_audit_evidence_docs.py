from __future__ import annotations

import hashlib
import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "ingest-audit-evidence.md"
FIXTURE_ROOT = ROOT / "examples" / "ingest-search"
EVIDENCE_PATH = FIXTURE_ROOT / "audit-evidence.json"

CHECKSUM_PATTERN = re.compile(r"^[0-9a-f]{64}$")
LOCAL_URI_PATTERN = re.compile(r"^fixture://ingest-search/[A-Za-z0-9_.-]+$")

REQUIRED_DOC_SECTIONS = (
    "# Ingest Audit Evidence",
    "## Evidence Fixture",
    "## Source Checksums",
    "## Citations",
    "## Quarantine Decisions",
    "## Client And Session Traces",
    "## Validation",
)

REQUIRED_DOC_PHRASES = (
    "local-first evidence bundle",
    "checksums",
    "citations",
    "quarantine decisions",
    "client/session traces",
    "examples/ingest-search/audit-evidence.json",
    "python -m unittest tests.test_ingest_audit_evidence_docs",
)


class IngestAuditEvidenceDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.fixture = _load_json(EVIDENCE_PATH)
        cls.repository = _load_fixture_json("repository.json")
        cls.ingest_log = _load_fixture_json("ingest-log.json")
        cls.search_index = _load_fixture_json("search-index.json")
        cls.quarantine = _load_fixture_json("quarantine.json")
        cls.api_requests = _load_fixture_json("api-requests.json")
        cls.client_session = _load_fixture_json("client-session.json")

        cls.sources_by_uri = {
            source["sourceUri"]: source for source in cls.repository["sources"]
        }
        cls.log_by_id = {entry["id"]: entry for entry in cls.ingest_log["entries"]}
        cls.documents_by_id = {
            document["id"]: document for document in cls.search_index["documents"]
        }
        cls.quarantine_by_id = {
            item["id"]: item for item in cls.quarantine["items"]
        }
        cls.api_by_id = {
            request["id"]: request for request in cls.api_requests["requests"]
        }
        cls.evidence_files_by_id = {
            item["id"]: item for item in cls.fixture["evidenceFiles"]
        }

    def test_document_covers_evidence_workflow_and_validation(self) -> None:
        self.assertTrue(DOC_PATH.exists())
        for section in REQUIRED_DOC_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        lower_text = self.doc_text.lower()
        for phrase in REQUIRED_DOC_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, lower_text)

        for path in (
            "repository.json",
            "ingest-log.json",
            "search-index.json",
            "quarantine.json",
            "api-requests.json",
            "client-session.json",
            "notes.md",
            "records.csv",
            "records.json",
        ):
            with self.subTest(path=path):
                self.assertIn(f"`examples/ingest-search/{path}`", self.doc_text)

    def test_docs_and_fixture_avoid_guarded_terms(self) -> None:
        for path in (DOC_PATH, EVIDENCE_PATH):
            with self.subTest(path=path.name):
                _assert_no_restricted_terms(self, path)

    def test_evidence_shape_and_summary_counts(self) -> None:
        fixture = self.fixture
        self.assertEqual(fixture["schemaVersion"], "ingest-search-audit-evidence.v1")
        self.assertEqual(fixture["workspaceId"], "wsp_ingest_demo")
        self.assertEqual(fixture["sessionId"], "sess_ingest_search_local_001")
        self.assertTrue(fixture["localOnly"])

        summary = fixture["evidenceSummary"]
        self.assertEqual(summary["sourceCount"], len(fixture["sourceSnapshots"]))
        self.assertEqual(summary["evidenceFileCount"], len(fixture["evidenceFiles"]))
        self.assertEqual(summary["citationCount"], len(fixture["citationEvidence"]))
        self.assertEqual(
            summary["quarantineDecisionCount"],
            len(fixture["quarantineDecisions"]),
        )
        self.assertEqual(summary["apiRequestTraceCount"], len(fixture["apiRequestTrace"]))
        self.assertEqual(
            summary["clientSessionTraceCount"],
            len(fixture["clientSessionTrace"]),
        )

    def test_evidence_file_hashes_reference_only_ingest_search_fixtures(self) -> None:
        seen_ids: set[str] = set()
        seen_paths: set[str] = set()
        for evidence_file in self.fixture["evidenceFiles"]:
            with self.subTest(evidence_file=evidence_file["id"]):
                self.assertNotIn(evidence_file["id"], seen_ids)
                self.assertNotIn(evidence_file["fixturePath"], seen_paths)
                seen_ids.add(evidence_file["id"])
                seen_paths.add(evidence_file["fixturePath"])

                path = _safe_ingest_fixture_path(evidence_file["fixturePath"])
                self.assertNotEqual(path, EVIDENCE_PATH.resolve())
                self.assertRegex(evidence_file["sha256"], CHECKSUM_PATTERN)
                self.assertEqual(
                    hashlib.sha256(path.read_bytes()).hexdigest(),
                    evidence_file["sha256"],
                )

                if "schemaVersion" in evidence_file:
                    fixture_json = _load_json(path)
                    self.assertEqual(fixture_json["schemaVersion"], evidence_file["schemaVersion"])

    def test_source_snapshots_match_repository_log_index_and_quarantine(self) -> None:
        for snapshot in self.fixture["sourceSnapshots"]:
            with self.subTest(source=snapshot["sourceUri"]):
                source_uri = snapshot["sourceUri"]
                self.assertRegex(source_uri, LOCAL_URI_PATTERN)

                source = self.sources_by_uri[source_uri]
                self.assertEqual(snapshot["path"], source["path"])
                self.assertEqual(snapshot["mediaType"], source["mediaType"])
                self.assertEqual(snapshot["checksum"], source["checksum"])
                self.assertEqual(snapshot["repositoryState"], source["state"])

                for log_id in snapshot["logEntryIds"]:
                    entry = self.log_by_id[log_id]
                    self.assertEqual(entry["sourceUri"], source_uri)
                    self.assertEqual(entry["checksum"], snapshot["checksum"])

                for document_id in snapshot["indexDocumentIds"]:
                    document = self.documents_by_id[document_id]
                    self.assertEqual(document["sourceUri"], source_uri)
                    self.assertEqual(document["checksum"], snapshot["checksum"])

                for item_id in snapshot["quarantineItemIds"]:
                    item = self.quarantine_by_id[item_id]
                    self.assertEqual(item["sourceUri"], source_uri)
                    self.assertEqual(item["checksum"], snapshot["checksum"])

    def test_citation_evidence_matches_index_and_quarantine_ranges(self) -> None:
        for citation in self.fixture["citationEvidence"]:
            with self.subTest(citation=citation["id"]):
                source = self.sources_by_uri[citation["sourceUri"]]
                self.assertEqual(citation["checksum"], source["checksum"])
                self.assertFalse(citation["trusted"])

                if citation["kind"] == "indexDocument":
                    document = self.documents_by_id[citation["documentId"]]
                    matching_ranges = [
                        item["range"]
                        for item in document["citations"]
                        if item["sourceUri"] == citation["sourceUri"]
                    ]
                    self.assertIn(citation["range"], matching_ranges)
                elif citation["kind"] == "quarantineItem":
                    item = self.quarantine_by_id[citation["quarantineItemId"]]
                    self.assertEqual(item["citation"]["range"], citation["range"])
                    self.assertEqual(item["sourceUri"], citation["sourceUri"])
                else:
                    self.fail(f"unexpected citation kind: {citation['kind']}")

    def test_quarantine_decision_matches_request_and_case(self) -> None:
        for decision in self.fixture["quarantineDecisions"]:
            with self.subTest(decision=decision["decisionId"]):
                item = self.quarantine_by_id[decision["itemId"]]
                request = self.api_by_id[decision["requestId"]]
                response_case = request["response"]["body"]["case"]
                response_decision = response_case["decision"]

                self.assertEqual(decision["sourceUri"], item["sourceUri"])
                self.assertEqual(decision["checksum"], item["checksum"])
                self.assertEqual(response_case["id"], decision["itemId"])
                self.assertEqual(response_case["fromState"], decision["fromState"])
                self.assertEqual(response_case["state"], decision["toState"])
                self.assertEqual(response_decision["action"], decision["action"])
                self.assertEqual(response_decision["actorId"], decision["actorId"])
                self.assertEqual(response_decision["timestamp"], decision["decidedAt"])
                self.assertEqual(response_decision["reason"], decision["reason"])
                self.assertEqual(response_decision["override"], decision["override"])

    def test_api_request_trace_resolves_ids_sources_and_checksums(self) -> None:
        for trace in self.fixture["apiRequestTrace"]:
            with self.subTest(request=trace["requestId"]):
                self.assertEqual(trace["fixtureFileId"], "apiRequests")
                self.assertIn(trace["fixtureFileId"], self.evidence_files_by_id)

                request = self.api_by_id[trace["requestId"]]
                self.assertEqual(request["route"]["method"], trace["method"])
                self.assertEqual(request["route"]["path"], trace["path"])
                self.assertEqual(request["response"]["status"], trace["responseStatus"])

                self.assertEqual(len(trace["sourceUris"]), len(trace["checksums"]))
                for source_uri, checksum in zip(trace["sourceUris"], trace["checksums"]):
                    source = self.sources_by_uri[source_uri]
                    self.assertEqual(source["checksum"], checksum)

                for document_id in trace.get("documentIds", []):
                    self.assertIn(document_id, self.documents_by_id)

                for item_id in trace.get("quarantineItemIds", []):
                    self.assertIn(item_id, self.quarantine_by_id)

    def test_client_session_trace_resolves_routes_commands_and_related_requests(self) -> None:
        session_routes = {
            (route["method"], route["routePath"])
            for route in self.client_session["api"]["routes"]
        }
        session_commands = set(self.client_session["cli"]["commands"])

        for trace in self.fixture["clientSessionTrace"]:
            with self.subTest(trace=trace["traceId"]):
                self.assertEqual(trace["fixtureFileId"], "clientSession")
                self.assertIn(trace["fixtureFileId"], self.evidence_files_by_id)

                if trace["kind"] == "apiRoute":
                    self.assertIn((trace["method"], trace["routePath"]), session_routes)
                elif trace["kind"] == "cliCommand":
                    self.assertIn(trace["command"], session_commands)
                else:
                    self.fail(f"unexpected trace kind: {trace['kind']}")

                for request_id in trace["relatedRequestIds"]:
                    self.assertIn(request_id, self.api_by_id)

                for source_uri in trace.get("sourceUris", []):
                    self.assertIn(source_uri, self.sources_by_uri)

                for document_id in trace.get("documentIds", []):
                    self.assertIn(document_id, self.documents_by_id)

                for item_id in trace.get("quarantineItemIds", []):
                    self.assertIn(item_id, self.quarantine_by_id)


def _load_fixture_json(name: str) -> Any:
    return _load_json(FIXTURE_ROOT / name)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _safe_ingest_fixture_path(relative_path: str) -> Path:
    path = (ROOT / relative_path).resolve()
    fixture_root = FIXTURE_ROOT.resolve()
    if fixture_root not in path.parents:
        raise AssertionError(f"path escapes ingest fixture root: {relative_path}")
    if not path.is_file():
        raise AssertionError(f"fixture path is missing: {relative_path}")
    return path


def _assert_no_restricted_terms(testcase: unittest.TestCase, path: Path) -> None:
    text = path.read_text(encoding="utf-8").lower()
    restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
    for term in restricted_terms:
        if term.isascii():
            escaped = re.escape(term).replace(r"\ ", r"\s+")
            pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
            testcase.assertIsNone(pattern.search(text), f"{path} contains guarded wording")
        else:
            testcase.assertNotIn(term, text, f"{path} contains guarded wording")


if __name__ == "__main__":
    unittest.main()
