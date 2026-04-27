from __future__ import annotations

import hashlib
import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "ingest-evidence-export.md"
FIXTURE_ROOT = ROOT / "examples" / "ingest-search"
SESSION_PATH = FIXTURE_ROOT / "evidence-export-session.json"
AUDIT_EVIDENCE_PATH = FIXTURE_ROOT / "audit-evidence.json"

LOCAL_URI_PATTERN = re.compile(r"^fixture://ingest-search/[A-Za-z0-9_.-]+$")
LOCAL_URL_PATTERN = re.compile(r"^http://127\.0\.0\.1:\d+(/.*)?$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")

REQUIRED_DOC_SECTIONS = (
    "# Ingest Evidence Export",
    "## Evidence Input",
    "## Export Formats",
    "## CLI Flow",
    "## API Flow",
    "## SDK Flow",
    "## Local-Only And No-Network Behavior",
    "## Redaction",
    "## Validation",
)

REQUIRED_DOC_PHRASES = (
    "examples/ingest-search/evidence-export-session.json",
    "examples/ingest-search/audit-evidence.json",
    "JSONL",
    "CSV",
    "ingest-evidence.manifest",
    "ingest-evidence.package",
    "buildLocalIngestEvidenceExportPreview",
    "createIngestEvidencePackage",
    "[REDACTED]",
    "local-only",
    "No remote URLs",
)

REQUIRED_COMMANDS = (
    "node packages\\cli\\src\\index.ts ingest evidence summary --input examples\\ingest-search\\audit-evidence.json",
    "node packages\\cli\\src\\index.ts ingest evidence export --input examples\\ingest-search\\audit-evidence.json --format jsonl",
    "node packages\\cli\\src\\index.ts ingest evidence export --input examples\\ingest-search\\audit-evidence.json --format csv",
    "node packages\\cli\\src\\index.ts ingest evidence package --input examples\\ingest-search\\audit-evidence.json",
    "python -m json.tool examples\\ingest-search\\evidence-export-session.json",
    "python -m unittest tests.test_ingest_evidence_export_docs",
    "npm.cmd --workspace @sovereignops/ingest-evidence run check",
    "npm.cmd --workspace @sovereignops/cli run check",
    "npm.cmd --workspace @sovereignops/sdk-js run check",
)

EXPECTED_FORMATS = {
    "summary": ("application/json", "/v1/ingest/evidence/export", "evidenceSummary"),
    "jsonl": ("application/jsonl", "local-package-helper", "jsonl"),
    "csv": ("text/csv", "local-package-helper", "csv"),
    "package": ("application/json", "/v1/ingest/evidence/package", "manifest"),
}

CSV_COLUMNS = (
    "recordType",
    "recordId",
    "sourceUri",
    "fixturePath",
    "checksum",
    "payload",
    "fingerprint",
)


class IngestEvidenceExportDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_doc_text = cls.doc_text.lower()
        cls.session = _load_json(SESSION_PATH)
        cls.audit_evidence = _load_json(AUDIT_EVIDENCE_PATH)

    def test_document_covers_export_flow_and_validation(self) -> None:
        self.assertTrue(DOC_PATH.exists())
        for section in REQUIRED_DOC_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for phrase in REQUIRED_DOC_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase.lower(), self.lower_doc_text)

        for command in REQUIRED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

        self.assertNotIn("curl ", self.lower_doc_text)
        self.assertNotIn("https://", self.lower_doc_text)
        self.assertNotIn("npx ", self.lower_doc_text)
        self.assertNotIn("npm install -g", self.lower_doc_text)

    def test_docs_and_session_avoid_guarded_terms(self) -> None:
        for path in (DOC_PATH, SESSION_PATH):
            with self.subTest(path=path.name):
                _assert_no_guarded_terms(self, path)

    def test_session_shape_and_export_metadata(self) -> None:
        session = self.session
        self.assertEqual(session["schemaVersion"], "ingest-evidence-export-session.v1")
        self.assertEqual(session["workspaceId"], "wsp_ingest_demo")
        self.assertEqual(session["sessionId"], "sess_ingest_search_local_001")
        self.assertTrue(session["localOnly"])
        self.assertEqual(session["network"]["mode"], "disabled")
        self.assertEqual(session["redaction"]["marker"], "[REDACTED]")
        self.assertEqual(
            session["redaction"]["appliesBefore"],
            ["jsonl", "csv", "manifest", "packageFingerprint"],
        )

        package = session["packageMetadata"]
        manifest = package["manifest"]
        expected_record_types = [
            "evidenceSummary",
            "evidenceFile",
            "sourceSnapshot",
            "citationEvidence",
            "quarantineDecision",
            "apiRequestTrace",
            "clientSessionTrace",
        ]

        self.assertEqual(package["kind"], "ingest-evidence.package")
        self.assertEqual(package["version"], 1)
        self.assertEqual(manifest["kind"], "ingest-evidence.manifest")
        self.assertEqual(manifest["version"], 1)
        self.assertEqual(manifest["packageId"], "ingest_evidence_demo_001")
        self.assertEqual(manifest["createdAt"], session["generatedAt"])
        self.assertEqual(manifest["recordCount"], 28)
        self.assertEqual(manifest["recordTypes"], expected_record_types)
        self.assertEqual(manifest["evidence"]["schemaVersion"], session["evidence"]["schemaVersion"])
        self.assertEqual(manifest["evidence"]["generatedAt"], "2026-04-27T08:15:00.000Z")
        self.assertEqual(manifest["evidence"]["workspaceId"], session["workspaceId"])
        self.assertEqual(manifest["evidence"]["sessionId"], "[REDACTED]")
        self.assertTrue(manifest["evidence"]["localOnly"])
        self.assertEqual(manifest["jsonl"]["mediaType"], "application/jsonl")
        self.assertEqual(manifest["jsonl"]["lines"], 28)
        self.assertEqual(manifest["csv"]["mediaType"], "text/csv")
        self.assertEqual(manifest["csv"]["rows"], 28)
        self.assertEqual(tuple(manifest["csv"]["columns"]), CSV_COLUMNS)
        self.assertRegex(package["fingerprint"], r"^fnv1a64:[0-9a-f]{16}$")
        self.assertRegex(manifest["fingerprint"], r"^fnv1a64:[0-9a-f]{16}$")

    def test_expected_formats_and_commands_are_consistent(self) -> None:
        formats = {item["format"]: item for item in self.session["expectedFormats"]}
        self.assertEqual(set(formats), set(EXPECTED_FORMATS))

        command_ids = {item["id"] for item in self.session["commands"]}
        for name, (media_type, route, descriptor) in EXPECTED_FORMATS.items():
            with self.subTest(format=name):
                item = formats[name]
                self.assertEqual(item["mediaType"], media_type)
                self.assertEqual(item["route"], route)
                self.assertEqual(item["manifestDescriptor"], descriptor)
                self.assertIn(item["commandId"], command_ids)

        commands = {
            item["command"]
            for item in self.session["commands"]
            if item["surface"] == "cli"
        }
        validations = set(self.session["validationCommands"])
        for command in REQUIRED_COMMANDS:
            with self.subTest(command=command):
                self.assertTrue(command in commands or command in validations)
                self.assertIn(command, self.doc_text)

        sdk_commands = [item for item in self.session["commands"] if item["surface"] == "sdk"]
        self.assertEqual(len(sdk_commands), 1)
        self.assertEqual(sdk_commands[0]["entryPoint"], "buildLocalIngestEvidenceExportPreview")

        package_commands = {item["entryPoint"] for item in self.session["commands"] if item["surface"] == "package"}
        self.assertEqual(package_commands, {"renderIngestEvidenceJsonl", "renderIngestEvidenceCsv"})

        schema_commands = [item for item in self.session["commands"] if item["surface"] == "schema"]
        self.assertEqual(len(schema_commands), 1)
        self.assertEqual(schema_commands[0]["entryPoint"], "validateIngestEvidence")

    def test_referenced_files_exist_and_paths_stay_local(self) -> None:
        for relative_path in self.session["referencedFiles"]:
            with self.subTest(path=relative_path):
                path = _safe_repo_path(relative_path)
                self.assertTrue(path.is_file(), relative_path)
                self.assertIn(relative_path, self.doc_text + json.dumps(self.session))

        evidence_path = _safe_repo_path(self.session["evidence"]["fixturePath"])
        self.assertEqual(evidence_path, AUDIT_EVIDENCE_PATH.resolve())
        self.assertRegex(self.session["evidence"]["sha256"], SHA256_PATTERN)
        self.assertEqual(
            hashlib.sha256(AUDIT_EVIDENCE_PATH.read_bytes()).hexdigest(),
            self.session["evidence"]["sha256"],
        )

        for value_path in _walk_keyed_strings(self.session, "Path"):
            with self.subTest(value_path=value_path):
                path = _safe_repo_path(value_path)
                self.assertTrue(path.exists(), value_path)

    def test_urls_and_fixture_uris_are_local_only(self) -> None:
        text = json.dumps(self.session)
        self.assertNotIn("https://", text.lower())

        for url in _walk_keyed_strings(self.session, "url"):
            with self.subTest(url=url):
                self.assertRegex(url, LOCAL_URL_PATTERN)

        for prefix in self.session["network"]["allowedUrlPrefixes"]:
            with self.subTest(prefix=prefix):
                self.assertRegex(prefix, LOCAL_URL_PATTERN)

        source_uris = self.session["evidence"]["sourceUris"]
        self.assertEqual(len(source_uris), len(set(source_uris)))
        for uri in source_uris:
            with self.subTest(uri=uri):
                self.assertRegex(uri, LOCAL_URI_PATTERN)

        for prefix in self.session["network"]["allowedUriPrefixes"]:
            self.assertEqual(prefix, "fixture://ingest-search/")

    def test_session_matches_audit_evidence_fixture(self) -> None:
        session = self.session
        evidence = self.audit_evidence

        self.assertEqual(session["workspaceId"], evidence["workspaceId"])
        self.assertEqual(session["sessionId"], evidence["sessionId"])
        self.assertEqual(session["localOnly"], evidence["localOnly"])
        self.assertEqual(session["evidence"]["schemaVersion"], evidence["schemaVersion"])
        self.assertEqual(session["evidence"]["summary"], evidence["evidenceSummary"])

        expected_uris = sorted(source["sourceUri"] for source in evidence["sourceSnapshots"])
        self.assertEqual(sorted(session["evidence"]["sourceUris"]), expected_uris)

        self.assertEqual(
            session["packageMetadata"]["manifest"]["recordCount"],
            1
            + len(evidence["evidenceFiles"])
            + len(evidence["sourceSnapshots"])
            + len(evidence["citationEvidence"])
            + len(evidence["quarantineDecisions"])
            + len(evidence["apiRequestTrace"])
            + len(evidence["clientSessionTrace"]),
        )
        self.assertEqual(session["exportInput"]["evidenceFixture"], session["evidence"]["fixturePath"])
        self.assertEqual(
            session["exportInput"]["selectedSections"],
            [
                "evidenceFiles",
                "sourceSnapshots",
                "citationEvidence",
                "quarantineDecisions",
                "apiRequestTrace",
                "clientSessionTrace",
            ],
        )
        self.assertEqual(
            session["exportInput"]["filters"]["sourceUris"],
            ["fixture://ingest-search/records.csv"],
        )
        self.assertEqual(
            session["packageMetadata"]["manifest"]["jsonl"]["lines"],
            session["packageMetadata"]["manifest"]["recordCount"],
        )
        self.assertEqual(
            session["packageMetadata"]["manifest"]["csv"]["rows"],
            session["packageMetadata"]["manifest"]["recordCount"],
        )


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _safe_repo_path(relative_path: str) -> Path:
    path = (ROOT / relative_path).resolve()
    root = ROOT.resolve()
    if path != root and root not in path.parents:
        raise AssertionError(f"path escapes repository root: {relative_path}")
    return path


def _walk_keyed_strings(value: Any, key_fragment: str) -> list[str]:
    matches: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(item, str) and key_fragment.lower() in key.lower():
                matches.append(item)
            else:
                matches.extend(_walk_keyed_strings(item, key_fragment))
    elif isinstance(value, list):
        for item in value:
            matches.extend(_walk_keyed_strings(item, key_fragment))
    return matches


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
