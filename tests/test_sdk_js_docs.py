from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "sdk-js.md"

EXPECTED_SECTIONS = (
    "# JavaScript SDK",
    "## Local-First Usage",
    "## Public Entry Points",
    "## Workspace Session Snapshot Retention Cleanup API Preview",
    "## Fake-Fetch Testing",
    "## Typed Errors",
    "## Pure Helper Usage",
    "## Safe Example Values",
    "## Validation Commands",
    "## Ingest Connector Preview Helpers",
    "## Ingest Connector API Client",
    "## Ingest API Fixture Client",
)

EXPECTED_REFERENCES = (
    "packages/sdk-js/src/index.ts",
    "packages/sdk-js/src/client.ts",
    "packages/sdk-js/src/ingestClient.ts",
    "packages/sdk-js/src/ingestFixtureFetch.ts",
    "packages/sdk-js/src/ingestConnectorClient.ts",
    "packages/sdk-js/src/ingestConnectorFixtureFetch.ts",
    "packages/sdk-js/src/localIngest.ts",
    "packages/sdk-js/src/localIngestConnectorManifest.ts",
    "examples/ingest-search/api-requests.json",
    "examples/ingest-search/connector-api-requests.json",
    "packages/sdk-js/tests/client-ingest-search.test.mjs",
    "packages/sdk-js/tests/ingest-fixture-fetch.test.mjs",
    "packages/sdk-js/tests/ingest-connector-client.test.mjs",
    "packages/sdk-js/tests/ingest-connector-fixture-fetch.test.mjs",
    "packages/sdk-js/tests/local-ingest.test.mjs",
    "packages/sdk-js/tests/local-ingest-connector-manifest.test.mjs",
    "packages/sdk-js/src/localWorkspaceSessionSnapshotRetentionCleanupApiClient.ts",
    "packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts",
    "examples/workspace-session/snapshot-retention-cleanup-api-requests.json",
    "docs/workspace-session-snapshot-retention-cleanup.md",
    "packages/sdk-js/tests/local-workspace-session-snapshot-retention-cleanup-api-client.test.mjs",
    "packages/sdk-js/tests/local-workspace-session-snapshot-retention.test.mjs",
    "tests/security/workspace_session_snapshot_retention_cleanup_api_client_threats.test.mjs",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.valid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.invalid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.schema.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.valid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.invalid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.schema.json",
)

EXPECTED_SYMBOLS = (
    "WorkspaceClient",
    "FetchLike",
    "createIngestSearchClient",
    "IngestSearchClient",
    "IngestSearchClient.normalize",
    "IngestSearchClient.ingestStructured",
    "IngestSearchClient.structuredIngest",
    "IngestSearchClient.scanRepository",
    "IngestSearchClient.repositoryScan",
    "IngestSearchClient.search",
    "IngestSearchClient.searchQuery",
    "IngestSearchClient.createQuarantineCases",
    "IngestSearchClient.decideQuarantineCase",
    "createIngestConnectorClient",
    "IngestConnectorClient.getManifest",
    "IngestConnectorClient.manifest",
    "IngestConnectorClient.getReadiness",
    "IngestConnectorClient.readiness",
    "DEFAULT_INGEST_FIXTURE_PATH",
    "loadIngestFixtureBundle",
    "createIngestFixtureFetch",
    "createIngestFixtureClient",
    "createIngestFixtureClientHarness",
    "baseUrlFromIngestFixtureBundle",
    "IngestFixtureFetch",
    "IngestFixtureClientHarness",
    "DEFAULT_INGEST_CONNECTOR_FIXTURE_PATH",
    "loadIngestConnectorFixtureBundle",
    "createIngestConnectorFixtureFetch",
    "createIngestConnectorFixtureClient",
    "createIngestConnectorFixtureClientHarness",
    "baseUrlFromIngestConnectorFixtureBundle",
    "IngestConnectorFixtureError",
    "IngestConnectorFixtureFetch",
    "IngestConnectorFixtureClientHarness",
    "listLocalIngestConnectorProfiles",
    "normalizeLocalIngestConnectorManifest",
    "buildLocalIngestConnectorReadinessSummary",
    "createLocalWorkspaceSessionSnapshotRetentionCleanupApiClient",
    "previewLocalWorkspaceSessionSnapshotRetentionCleanupViaApi",
    "normalizeLocalWorkspaceSessionSnapshotRetentionCleanupPreviewRequest",
    "LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION",
    "LocalWorkspaceSessionSnapshotRetentionError",
    "LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES",
    "planLocalWorkspaceSessionSnapshotRetentionCleanup",
    "planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup",
    "planSnapshotRetentionCleanupDryRun",
    "ApiRequestValidationError",
    "ApiNetworkError",
    "ApiHttpError",
    "ApiResponseParseError",
    "ApiResponseValidationError",
    "toApiResult",
    "POST /v1/workspace-session/snapshot-retention-cleanup/preview",
)

EXPECTED_SAFE_VALUES = (
    "local://api/v1",
    "local://workspace/wsp_notes_lab",
    "wsp_notes_lab",
    "dev_laptop_alpha",
    "sess_notes_lab",
    "snap_notes_current",
    "snapshots/snap-current.json",
    "[REDACTED]",
    "Bearer [REDACTED]",
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
)

EXPECTED_COMMANDS = (
    "python -m unittest tests.test_sdk_js_docs",
    r"node packages\sdk-js\tests\client-ingest-search.test.mjs",
    r"node packages\sdk-js\tests\ingest-fixture-fetch.test.mjs",
    r"node packages\sdk-js\tests\ingest-connector-client.test.mjs",
    r"node packages\sdk-js\tests\ingest-connector-fixture-fetch.test.mjs",
    r"node packages\sdk-js\tests\local-ingest.test.mjs",
    r"node packages\sdk-js\tests\local-ingest-connector-manifest.test.mjs",
    r"node packages\sdk-js\tests\local-workspace-session-snapshot-retention-cleanup-api-client.test.mjs",
    r"node packages\sdk-js\tests\local-workspace-session-snapshot-retention.test.mjs",
    "npm.cmd --workspace @sovereignops/sdk-js run check",
    r"python scripts\public_boundary_guard.py --json",
)

PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "plan" + "-pack",
    "private " + "plan " + "pack",
    "." + "codex" + "-private",
    "." + "codex-run",
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog.jsonl",
    "tasks" + "\\backlog.jsonl",
)

REMOTE_URL_PATTERN = re.compile(
    r"https?://(?!(?:localhost|127\.0\.0\.1|\[::1\])(?::|/|$))",
    re.IGNORECASE,
)
REMOTE_DOMAIN_PATTERN = re.compile(
    r"(?i)\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|edu|io|dev)\b"
)
WINDOWS_ABSOLUTE_PATH_PATTERN = re.compile(r"(?i)(?<![A-Za-z0-9])[a-z]:[\\/]")
POSIX_ABSOLUTE_PATH_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:/|\b)"
)
UNC_PATH_PATTERN = re.compile(r"\\\\[^\\\s]+\\[^\\\s]+")
SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{12,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{8,}"),
    re.compile(
        r"(?i)(?:password|passwd|secret|token|api[_-]?key)"
        r"\s*[:=]\s*(?![\"']?(?:\[REDACTED\]|\[redacted:))\S{4,}"
    ),
    re.compile(r"\block_[A-Za-z0-9_-]{4,}\b"),
    re.compile(r"\bsess_[a-z0-9_]{16,}\b"),
)


class SdkJsDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_text = cls.text.lower()

    def test_document_has_required_sections_references_symbols_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())

        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.text)

        for reference in EXPECTED_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, self.text)
                self.assertTrue((ROOT / reference).exists(), reference)

        for symbol in EXPECTED_SYMBOLS:
            with self.subTest(symbol=symbol):
                self.assertIn(symbol, self.text)

        for phrase in (
            "SDK fixture fetch and client harness",
            "connector API preview parity",
            "checked-in JSON",
            "negative replay cases",
            "no global fetch fallback",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.text)

        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.text)

    def test_document_locks_retention_cleanup_client_guidance(self) -> None:
        for phrase in (
            "The JavaScript SDK is the local-first client surface",
            "API clients accept a `FetchLike`",
            "Use `createLocalWorkspaceSessionSnapshotRetentionCleanupApiClient`",
            "The client normalizer",
            "accepts exactly one of `entries`, `files`, or `records`",
            "The returned preview object and nested arrays are frozen.",
            "Every retention cleanup plan must keep `localOnly: true`, `dryRun: true`, and",
            "does not remove or mutate snapshots.",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.text)

    def test_document_uses_only_safe_local_values(self) -> None:
        for value in EXPECTED_SAFE_VALUES:
            with self.subTest(value=value):
                self.assertIn(value, self.text)

        self.assertIn("baseUrl: \"local://api/v1\"", self.text)
        self.assertIn("apiKey: \"[REDACTED]\"", self.text)
        self.assertIn("fetch.calls[0].init.headers.authorization", self.text)
        self.assertIn("JSON.parse(fetch.calls[0].init.body)", self.text)
        self.assertNotIn("curl ", self.lower_text)
        self.assertNotIn("npx ", self.lower_text)
        self.assertNotIn("npm install -g", self.lower_text)

    def test_document_avoids_private_paths_remote_urls_sensitive_values_and_restricted_terms(self) -> None:
        for marker in PRIVATE_PATH_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker.lower(), self.lower_text)

        for pattern in (
            REMOTE_URL_PATTERN,
            REMOTE_DOMAIN_PATTERN,
            WINDOWS_ABSOLUTE_PATH_PATTERN,
            POSIX_ABSOLUTE_PATH_PATTERN,
            UNC_PATH_PATTERN,
            re.compile(r"(?<!\.)\.\.[/\\]"),
        ):
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.text))

        for pattern in SECRET_VALUE_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.text))

        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for term in restricted_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_text))
                else:
                    self.assertNotIn(term, self.lower_text)


if __name__ == "__main__":
    unittest.main()
