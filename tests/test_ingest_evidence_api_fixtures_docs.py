from __future__ import annotations

import hashlib
import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "ingest-evidence-api-fixtures.md"
ARTIFACT_PATH = ROOT / "examples" / "ingest-search" / "evidence-release-artifact.json"
API_REQUESTS_PATH = ROOT / "examples" / "ingest-search" / "evidence-api-requests.json"
AUDIT_EVIDENCE_PATH = ROOT / "examples" / "ingest-search" / "audit-evidence.json"
EXPORT_SESSION_PATH = ROOT / "examples" / "ingest-search" / "evidence-export-session.json"
PARITY_SESSION_PATH = ROOT / "examples" / "ingest-search" / "evidence-parity-session.json"

SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
FNV_PATTERN = re.compile(r"^fnv1a64:[0-9a-f]{16}$")
LOCAL_URI_PATTERN = re.compile(r"^fixture://ingest-search/[A-Za-z0-9_.-]+$")
SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~-]{12,}"),
    re.compile(r"(?i)(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{4,}"),
)

REQUIRED_DOC_SECTIONS = (
    "# Ingest Evidence API Fixtures",
    "## Scope",
    "## Fixture Inputs",
    "## API Replay",
    "## SDK Replay",
    "## CLI Replay",
    "## Web Review",
    "## Release Artifact",
    "## Guardrails",
    "## Validation Commands",
)

REQUIRED_DOC_PHRASES = (
    "local-only replay path",
    "in-memory route dispatch",
    "createIngestEvidenceRoutes",
    "createIngestEvidenceFixtureClientHarness",
    "runIngestEvidenceApiReplayCli",
    "buildIngestEvidenceApiState",
    "buildIngestEvidenceReview",
    "evidence-release-artifact.json",
    "[REDACTED]",
)

REQUIRED_SURFACE_FILES = (
    "docs/ingest-evidence-api-fixtures.md",
    "examples/ingest-search/evidence-api-requests.json",
    "examples/ingest-search/audit-evidence.json",
    "examples/ingest-search/evidence-export-session.json",
    "examples/ingest-search/evidence-parity-session.json",
    "examples/ingest-search/evidence-release-artifact.json",
    "docs/openapi.yaml",
    "apps/api/src/ingestEvidenceRoutes.ts",
    "apps/api/tests/ingest-evidence-fixture-replay.test.mjs",
    "packages/sdk-js/src/ingestEvidenceFixtureFetch.ts",
    "packages/sdk-js/src/ingestEvidenceClient.ts",
    "packages/sdk-js/tests/ingest-evidence-fixture-fetch.test.mjs",
    "packages/cli/src/ingestEvidenceApiReplay.ts",
    "packages/cli/src/index.ts",
    "packages/cli/tests/ingest-evidence-api-replay.test.mjs",
    "apps/web/src/ingestEvidenceApiState.ts",
    "apps/web/src/ingestEvidenceReview.ts",
    "apps/web/tests/ingest-evidence-api-state.test.mjs",
    "apps/web/tests/ingest-evidence-review.test.mjs",
)

REQUIRED_DOC_COMMANDS = (
    r"node packages\cli\src\index.ts ingest evidence api replay --fixture examples\ingest-search\evidence-api-requests.json",
    r"node packages\cli\src\index.ts ingest evidence api replay --fixture examples\ingest-search\evidence-api-requests.json --method POST --route /v1/ingest/evidence/export",
    r"python -m json.tool examples\ingest-search\evidence-api-requests.json",
    r"python -m json.tool examples\ingest-search\evidence-release-artifact.json",
    "python -m unittest tests.test_ingest_evidence_api_fixtures_docs",
)

REQUIRED_ARTIFACT_COMMANDS = (
    r"node packages\cli\src\index.ts ingest evidence api replay --fixture examples\ingest-search\evidence-api-requests.json",
    r"node packages\cli\src\index.ts ingest evidence api replay --fixture examples\ingest-search\evidence-api-requests.json --method POST --route /v1/ingest/evidence/export",
    r"python -m json.tool examples\ingest-search\evidence-api-requests.json",
    r"python -m json.tool examples\ingest-search\evidence-release-artifact.json",
    "python -m unittest tests.test_ingest_evidence_api_fixtures_docs",
)

FORBIDDEN_ENDPOINT_WORDING = (
    "net" + "work",
    "live " + "server",
    "live-" + "server",
    "localhost",
    "127.0.0.1",
    "http://",
    "https://",
    "curl ",
    "invoke-restmethod",
    "start-process",
)

FORBIDDEN_PRIVATE_WORDING = (
    "sovereignops-codex-pack",
    ".codex-private",
    "e:\\",
    "c:\\",
    "file://",
)

PATH_REF_PREFIXES = ("apps/", "docs/", "examples/", "packages/", "tests/")


class IngestEvidenceApiFixturesDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_doc_text = cls.doc_text.lower()
        cls.artifact_text = ARTIFACT_PATH.read_text(encoding="utf-8")
        cls.lower_artifact_text = cls.artifact_text.lower()
        cls.artifact = _load_json(ARTIFACT_PATH)
        cls.api_requests = _load_json(API_REQUESTS_PATH)
        cls.audit_evidence = _load_json(AUDIT_EVIDENCE_PATH)
        cls.export_session = _load_json(EXPORT_SESSION_PATH)
        cls.parity_session = _load_json(PARITY_SESSION_PATH)

    def test_document_covers_required_sections_surfaces_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())

        for section in REQUIRED_DOC_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for phrase in REQUIRED_DOC_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase.lower(), self.lower_doc_text)

        for command in REQUIRED_DOC_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

    def test_referenced_files_exist_and_stay_inside_repo(self) -> None:
        for relative_path in REQUIRED_SURFACE_FILES:
            with self.subTest(required=relative_path):
                self.assertTrue((ROOT / relative_path).is_file(), relative_path)
                self.assertIn(f"`{relative_path}`", self.doc_text)

        for relative_path in _backticked_file_refs(self.doc_text):
            with self.subTest(backticked=relative_path):
                path = _safe_repo_path(relative_path)
                self.assertTrue(path.exists(), relative_path)

        for relative_path in self.artifact["referencedFiles"]:
            with self.subTest(artifact_ref=relative_path):
                path = _safe_repo_path(relative_path)
                self.assertTrue(path.is_file(), relative_path)
                self.assertFalse(_has_private_or_parent_segment(relative_path), relative_path)
                self.assertTrue(
                    relative_path.startswith("examples/ingest-search/"),
                    relative_path,
                )

    def test_document_and_artifact_avoid_guarded_endpoint_and_private_wording(self) -> None:
        for path in (DOC_PATH, ARTIFACT_PATH):
            with self.subTest(path=path.name):
                _assert_no_guarded_terms(self, path)

        combined = f"{self.lower_doc_text}\n{self.lower_artifact_text}"
        for forbidden in FORBIDDEN_ENDPOINT_WORDING + FORBIDDEN_PRIVATE_WORDING:
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, combined)

    def test_release_artifact_shape_and_local_metadata(self) -> None:
        artifact = self.artifact

        self.assertEqual(artifact["schemaVersion"], "ingest-evidence-release-artifact.v1")
        self.assertEqual(artifact["artifactId"], "ingest_evidence_fixture_replay_release_001")
        self.assertEqual(artifact["workspaceId"], "wsp_ingest_demo")
        self.assertTrue(artifact["localOnly"])
        self.assertEqual(
            artifact["referencedFiles"],
            [item["path"] for item in artifact["sourceMetadata"]],
        )

        metadata_by_id = {item["id"]: item for item in artifact["sourceMetadata"]}
        self.assertEqual(
            set(metadata_by_id),
            {
                "api_requests",
                "audit_evidence",
                "evidence_package",
                "evidence_parity",
            },
        )

        for item in artifact["sourceMetadata"]:
            with self.subTest(metadata=item["id"]):
                path = _safe_repo_path(item["path"])
                self.assertRegex(item["sha256"], SHA256_PATTERN)
                self.assertEqual(_sha256(path), item["sha256"])

        self.assertEqual(
            metadata_by_id["api_requests"]["counts"]["requests"],
            len(self.api_requests["requests"]),
        )
        self.assertEqual(
            metadata_by_id["audit_evidence"]["counts"],
            {
                "sources": self.audit_evidence["evidenceSummary"]["sourceCount"],
                "evidenceFiles": self.audit_evidence["evidenceSummary"]["evidenceFileCount"],
                "citations": self.audit_evidence["evidenceSummary"]["citationCount"],
                "quarantineDecisions": self.audit_evidence["evidenceSummary"][
                    "quarantineDecisionCount"
                ],
                "apiRequestTraces": self.audit_evidence["evidenceSummary"][
                    "apiRequestTraceCount"
                ],
                "clientSessionTraces": self.audit_evidence["evidenceSummary"][
                    "clientSessionTraceCount"
                ],
            },
        )
        self.assertEqual(
            metadata_by_id["evidence_package"]["counts"]["normalizedRecords"],
            self.export_session["packageMetadata"]["manifest"]["recordCount"],
        )
        self.assertEqual(
            metadata_by_id["evidence_parity"]["counts"]["normalizedRecords"],
            self.parity_session["evidenceFixture"]["expectedNormalizedRecordCount"],
        )

    def test_surface_replay_release_package_and_audit_metadata_are_consistent(self) -> None:
        artifact = self.artifact
        surfaces = {item["surface"]: item for item in artifact["surfaceReplay"]}

        self.assertEqual(set(surfaces), {"api", "sdk", "cli", "web"})
        self.assertEqual(surfaces["api"]["entryPoint"], "createIngestEvidenceRoutes")
        self.assertEqual(surfaces["sdk"]["entryPoint"], "createIngestEvidenceFixtureClientHarness")
        self.assertEqual(surfaces["cli"]["entryPoint"], "runIngestEvidenceApiReplayCli")
        self.assertEqual(surfaces["web"]["entryPoint"], "buildIngestEvidenceApiState")

        package = artifact["packageMetadata"]
        export_package = self.export_session["packageMetadata"]
        export_manifest = export_package["manifest"]

        self.assertEqual(package["kind"], export_package["kind"])
        self.assertEqual(package["manifestKind"], export_manifest["kind"])
        self.assertEqual(package["packageId"], export_manifest["packageId"])
        self.assertEqual(package["recordCount"], export_manifest["recordCount"])
        self.assertEqual(package["fingerprint"], export_package["fingerprint"])
        self.assertEqual(package["manifestFingerprint"], export_manifest["fingerprint"])
        for key in (
            "fingerprint",
            "manifestFingerprint",
            "evidenceFingerprint",
            "jsonlFingerprint",
            "csvFingerprint",
        ):
            with self.subTest(fingerprint=key):
                self.assertRegex(package[key], FNV_PATTERN)

        audit = artifact["auditMetadata"]
        self.assertEqual(audit["schemaVersion"], self.audit_evidence["schemaVersion"])
        self.assertEqual(audit["workspaceId"], self.audit_evidence["workspaceId"])
        self.assertEqual(audit["sessionId"], "[REDACTED]")
        self.assertTrue(audit["localOnly"])
        self.assertEqual(audit["summary"], self.audit_evidence["evidenceSummary"])
        self.assertEqual(
            audit["sourceUris"],
            sorted(source["sourceUri"] for source in self.audit_evidence["sourceSnapshots"]),
        )
        for source_uri in audit["sourceUris"]:
            self.assertRegex(source_uri, LOCAL_URI_PATTERN)

    def test_commands_are_exact_local_and_reference_existing_inputs(self) -> None:
        command_values = [item["command"] for item in self.artifact["commands"]]
        validation_values = self.artifact["validationCommands"]
        self.assertEqual(command_values + validation_values, list(REQUIRED_ARTIFACT_COMMANDS))

        for command in command_values + validation_values:
            with self.subTest(command=command):
                lowered = command.lower()
                for forbidden in FORBIDDEN_ENDPOINT_WORDING + FORBIDDEN_PRIVATE_WORDING:
                    self.assertNotIn(forbidden, lowered)
                for relative_path in _command_paths(command):
                    self.assertTrue(_safe_repo_path(relative_path).exists(), relative_path)

    def test_artifact_and_doc_avoid_secret_shaped_values(self) -> None:
        values = _walk_strings(self.artifact) + [self.doc_text]
        for value in values:
            with self.subTest(value=value[:80]):
                for pattern in SECRET_VALUE_PATTERNS:
                    self.assertIsNone(pattern.search(value))


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _backticked_file_refs(text: str) -> set[str]:
    refs: set[str] = set()
    for value in re.findall(r"`([^`]+)`", text):
        normalized = value.replace("\\", "/")
        if normalized.startswith(PATH_REF_PREFIXES):
            refs.add(normalized)
    return refs


def _command_paths(command: str) -> list[str]:
    paths: list[str] = []
    for token in command.split():
        normalized = token.strip("\"'").replace("\\", "/")
        if normalized.startswith(PATH_REF_PREFIXES) and Path(normalized).suffix:
            paths.append(normalized)
    return paths


def _safe_repo_path(relative_path: str) -> Path:
    path = (ROOT / relative_path).resolve()
    root = ROOT.resolve()
    if path != root and root not in path.parents:
        raise AssertionError(f"path escapes repository root: {relative_path}")
    return path


def _has_private_or_parent_segment(relative_path: str) -> bool:
    parts = Path(relative_path.replace("\\", "/")).parts
    return ".." in parts or ".codex-private" in parts


def _walk_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        strings: list[str] = []
        for key, item in value.items():
            strings.append(str(key))
            strings.extend(_walk_strings(item))
        return strings
    if isinstance(value, list):
        strings = []
        for item in value:
            strings.extend(_walk_strings(item))
        return strings
    return []


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
