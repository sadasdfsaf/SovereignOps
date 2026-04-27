from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "ingest-connectors.md"
SDK_DOC_PATH = ROOT / "docs" / "sdk-js.md"

EXPECTED_HEADINGS = (
    "# Ingest Connector Manifest And Local Preview",
    "## Safety Boundary",
    "## Connector Manifest",
    "## Python CLI",
    "## API Route",
    "## SDK Helper",
    "## Web State",
    "## Schema Contracts",
    "## Fixtures",
    "## Release Checks",
)

EXPECTED_FILES = (
    "services/ingest/src/sovereignops_ingest/cli.py",
    "services/ingest/src/sovereignops_ingest/connectors.py",
    "services/ingest/src/sovereignops_ingest/connector_manifest.py",
    "services/ingest/src/sovereignops_ingest/structured.py",
    "services/ingest/src/sovereignops_ingest/repository.py",
    "services/ingest/src/sovereignops_ingest/logs.py",
    "apps/api/src/ingestConnectorRoutes.ts",
    "apps/api/src/ingestOpenApiRoutes.ts",
    "packages/sdk-js/src/ingestClient.ts",
    "packages/sdk-js/src/localIngest.ts",
    "packages/sdk-js/src/localIngestConnectorManifest.ts",
    "apps/web/src/ingestSearch.ts",
    "apps/web/src/ingestConnectorState.ts",
    "packages/schemas/src/ingestConnectorManifest.ts",
    "packages/schemas/fixtures/ingest-connector-manifest.valid.json",
    "packages/schemas/fixtures/ingest-connector-manifest.invalid.json",
    "packages/schemas/fixtures/ingest-connector-manifest.schema.json",
    "packages/schemas/fixtures/ingest-connector-profile.schema.json",
    "examples/ingest-search/notes.md",
    "examples/ingest-search/records.json",
    "examples/ingest-search/records.csv",
    "examples/ingest-search/repository.json",
    "examples/ingest-search/search-index.json",
    "examples/ingest-search/quarantine.json",
    "examples/ingest-search/api-requests.json",
    "examples/ingest-search/client-session.json",
)

EXPECTED_CONNECTOR_SYMBOLS = (
    "MarkdownStructuredConnector",
    "JSONStructuredConnector",
    "CSVStructuredConnector",
    "RepositoryConnector",
    "JSONLLogConnector",
    "PlainTextLogConnector",
    "StructuredImportResult",
    "connector_manifest",
    "build_public_connector_manifest",
    "build_connector_manifest",
    "list_connector_manifests",
    "get_connector_manifest",
    "sovereignops.ingest.connector-manifest",
    "content_untrusted_by_default",
)

EXPECTED_ROUTE_SYMBOLS = (
    "GET /v1/ingest/connectors",
    "createDefaultIngestConnectorManifest",
    "createIngestConnectorManifest",
    "createMemoryIngestConnectorRouteState",
    "createIngestConnectorRoutes",
    "mountIngestConnectorRoutes",
    "POST /v1/ingest/normalize",
    "POST /v1/ingest/structured",
    "POST /v1/ingest/repository/scan",
    "POST /v1/search/query",
    "POST /v1/quarantine/cases",
    "POST /v1/quarantine/cases/{caseId}/decision",
)

EXPECTED_SDK_AND_WEB_SYMBOLS = (
    "createIngestSearchClient",
    "IngestSearchClient.ingestStructured",
    "IngestSearchClient.scanRepository",
    "normalizeLocalSourceSummaries",
    "buildLocalSearchView",
    "searchLocalText",
    "groupLocalQuarantineRecords",
    "prepareLocalQuarantineDecisionPayload",
    "LOCAL_INGEST_CONNECTOR_MANIFEST_KIND",
    "LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION",
    "listLocalIngestConnectorProfiles",
    "getLocalIngestConnectorProfile",
    "normalizeLocalIngestConnectorManifest",
    "buildLocalIngestConnectorReadinessSummary",
    "LocalIngestConnectorManifestError",
    "buildIngestSourceSummaryCards",
    "buildSearchResultRows",
    "buildIngestQuarantineQueueState",
    "buildIngestConnectorState",
    "buildIngestConnectorCards",
    "buildIngestConnectorRows",
    "getIngestConnectorReadinessStatusLabel",
    "getIngestConnectorSafetyStateLabel",
    "INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION",
    "ingestConnectorManifestSchema",
    "ingestConnectorProfileSchema",
    "ingestConnectorManifestSchemas",
    "getIngestConnectorManifestSchema",
    "validateIngestConnectorManifest",
    "validateIngestConnectorProfile",
    "assertIngestConnectorManifest",
    "isIngestConnectorId",
)

EXPECTED_COMMANDS = (
    r"python -m services.ingest.src.sovereignops_ingest.cli parse-markdown examples\ingest-search\notes.md --source-uri fixture://ingest-search/notes.md",
    r"python -m services.ingest.src.sovereignops_ingest.cli parse-json examples\ingest-search\records.json --source-uri fixture://ingest-search/records.json",
    r"python -m services.ingest.src.sovereignops_ingest.cli parse-csv examples\ingest-search\records.csv --source-uri fixture://ingest-search/records.csv --require-column id --require-column title",
    r"python -m services.ingest.src.sovereignops_ingest.cli normalize examples\ingest-search\notes.md --source-uri fixture://ingest-search/notes.md --media-type text/markdown",
    "python -m services.ingest.src.sovereignops_ingest.cli connectors manifest",
    "python -m services.ingest.src.sovereignops_ingest.cli connector-manifest",
    r"node packages\cli\src\index.ts ingest api replay --fixture examples\ingest-search\api-requests.json --route /v1/ingest/structured",
    r"node packages\cli\src\index.ts ingest api verify --fixture examples\ingest-search\api-requests.json --openapi docs\openapi.yaml",
    r"node packages\sdk-js\tests\client-ingest-search.test.mjs",
    r"node packages\sdk-js\tests\local-ingest.test.mjs",
    r"node packages\sdk-js\tests\local-ingest-connector-manifest.test.mjs",
    r"node apps\web\tests\ingest-search.test.mjs",
    r"node apps\web\tests\ingest-connector-state.test.mjs",
    r"node apps\api\tests\ingest-connector-routes.test.mjs",
    r"node packages\schemas\tests\ingest-connector-manifest.test.mjs",
    "python -m unittest tests.test_ingest_connectors_docs",
    "python -m unittest tests.test_ingest_integration_docs tests.test_sdk_js_docs",
    r"python -m unittest discover -s services\ingest\tests",
    r"python -m unittest discover -s services\ingest\tests -p test_connector_manifest.py",
    r"python -m unittest discover -s services\ingest\tests -p test_ingest_cli_connector_manifest.py",
    "python -m unittest tests.test_validate_openapi_ingest_search",
    r"python scripts\release_check.py --dry-run",
)

PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "." + "codex-private",
    "." + "codex-run",
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog.jsonl",
    "tasks" + "\\backlog.jsonl",
)

WINDOWS_ABSOLUTE_PATH_PATTERN = re.compile(r"(?i)(?<![A-Za-z0-9])[a-z]:[\\/]")
REMOTE_URL_PATTERN = re.compile(r"https?://(?!(?:localhost|127\.0\.0\.1|\[::1\])(?::|/|$))", re.I)
SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{12,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{8,}"),
)


class IngestConnectorDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_text = cls.text.lower()

    def test_document_has_required_sections_files_symbols_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())

        for heading in EXPECTED_HEADINGS:
            with self.subTest(heading=heading):
                self.assertIn(heading, self.text)

        for file_path in EXPECTED_FILES:
            with self.subTest(file_path=file_path):
                self.assertTrue((ROOT / file_path).is_file(), file_path)
                self.assertIn(f"`{file_path}`", self.text)

        for symbol in (
            *EXPECTED_CONNECTOR_SYMBOLS,
            *EXPECTED_ROUTE_SYMBOLS,
            *EXPECTED_SDK_AND_WEB_SYMBOLS,
        ):
            with self.subTest(symbol=symbol):
                self.assertIn(symbol, self.text)

        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.text)

    def test_document_states_local_only_no_network_and_default_untrusted(self) -> None:
        phrases = (
            "local-only",
            "no network access",
            "no remote account",
            "no durable write",
            "default untrusted",
            "trusted: false",
            "`untrusted: true`",
            "networkaccess: false",
            "durablewrites: false",
            "trusted-by-default false",
            "repository-relative",
            "without opening a live network connection",
            "should not fetch remote connector data",
        )
        for phrase in phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.lower_text)

        for scheme in ("fixture://", "file://", "stdin://", "workspace://", "local://"):
            with self.subTest(scheme=scheme):
                self.assertIn(scheme, self.text)

    def test_document_avoids_private_paths_remote_urls_sensitive_values_and_restricted_terms(self) -> None:
        for marker in PRIVATE_PATH_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker.lower(), self.lower_text)

        self.assertIsNone(WINDOWS_ABSOLUTE_PATH_PATTERN.search(self.text))
        self.assertIsNone(REMOTE_URL_PATTERN.search(self.text))
        self.assertNotIn("curl ", self.lower_text)
        self.assertNotIn("npx ", self.lower_text)
        self.assertNotIn("npm install -g", self.lower_text)

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

    def test_sdk_doc_mentions_connector_manifest_preview_helpers(self) -> None:
        sdk_text = SDK_DOC_PATH.read_text(encoding="utf-8")
        sdk_lower_text = sdk_text.lower()
        expected_sdk_text = (
            "`packages/sdk-js/src/localIngestConnectorManifest.ts`",
            "`packages/sdk-js/tests/local-ingest-connector-manifest.test.mjs`",
            "listLocalIngestConnectorProfiles",
            "getLocalIngestConnectorProfile",
            "normalizeLocalIngestConnectorManifest",
            "buildLocalIngestConnectorReadinessSummary",
            "LocalIngestConnectorManifestError",
            r"node packages\sdk-js\tests\local-ingest-connector-manifest.test.mjs",
            "examples require no network access.",
            "results default untrusted",
            "trustedByDefault: false",
        )
        for expected in expected_sdk_text:
            with self.subTest(expected=expected):
                self.assertIn(expected, sdk_text)

        for phrase in ("local-only", "repository-relative", "raw secrets"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, sdk_lower_text)

        for marker in PRIVATE_PATH_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker.lower(), sdk_lower_text)


if __name__ == "__main__":
    unittest.main()
