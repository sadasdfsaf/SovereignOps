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
    "## MCP Resource Preview",
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
    "apps/api/src/ingestFixtureServices.ts",
    "apps/api/src/ingestOpenApiRoutes.ts",
    "apps/api/tests/ingest-connector-fixture-replay.test.mjs",
    "apps/api/tests/ingest-connector-schema-alignment.test.mjs",
    "apps/api/tests/ingest-fixture-services.test.mjs",
    "apps/api/tests/ingest-openapi-routes.test.mjs",
    "packages/cli/src/ingestConnectorApiReplay.ts",
    "packages/cli/src/ingestApiReplay.ts",
    "packages/cli/src/ingestApiVerify.ts",
    "packages/cli/tests/ingest-connector-api-replay.test.mjs",
    "packages/cli/tests/ingest-api-replay.test.mjs",
    "packages/cli/tests/ingest-api-verify.test.mjs",
    "packages/sdk-js/src/ingestConnectorClient.ts",
    "packages/sdk-js/src/ingestConnectorFixtureFetch.ts",
    "packages/sdk-js/src/ingestClient.ts",
    "packages/sdk-js/src/ingestFixtureFetch.ts",
    "packages/sdk-js/src/localIngest.ts",
    "packages/sdk-js/src/localIngestConnectorManifest.ts",
    "packages/sdk-js/tests/ingest-connector-client.test.mjs",
    "packages/sdk-js/tests/ingest-connector-fixture-fetch.test.mjs",
    "packages/sdk-js/tests/client-ingest-search.test.mjs",
    "packages/sdk-js/tests/ingest-fixture-fetch.test.mjs",
    "packages/sdk-js/tests/local-ingest.test.mjs",
    "packages/sdk-js/tests/local-ingest-connector-manifest.test.mjs",
    "apps/web/src/ingestConnectorApiState.ts",
    "apps/web/src/ingestApiState.ts",
    "apps/web/src/ingestSearch.ts",
    "apps/web/src/ingestConnectorState.ts",
    "apps/web/src/ingestSessionReview.ts",
    "apps/web/src/ingestDashboardState.ts",
    "apps/web/tests/ingest-connector-api-state.test.mjs",
    "apps/web/tests/ingest-api-state.test.mjs",
    "apps/web/tests/ingest-search.test.mjs",
    "apps/web/tests/ingest-connector-state.test.mjs",
    "apps/web/tests/ingest-session-review.test.mjs",
    "packages/schemas/src/ingestConnectorApiManifest.ts",
    "packages/schemas/src/ingestConnectorManifest.ts",
    "packages/schemas/src/ingestSearch.ts",
    "packages/schemas/fixtures/ingest-connector-api-manifest.valid.json",
    "packages/schemas/fixtures/ingest-connector-api-manifest.invalid.json",
    "packages/schemas/fixtures/ingest-connector-api-manifest.schema.json",
    "packages/schemas/fixtures/ingest-connector-manifest.valid.json",
    "packages/schemas/fixtures/ingest-connector-manifest.invalid.json",
    "packages/schemas/fixtures/ingest-connector-manifest.schema.json",
    "packages/schemas/fixtures/ingest-connector-profile.schema.json",
    "packages/schemas/fixtures/ingest-search.valid.json",
    "packages/schemas/fixtures/ingest-search.invalid.json",
    "packages/schemas/tests/ingest-connector-api-manifest.test.mjs",
    "packages/schemas/tests/ingest-connector-manifest.test.mjs",
    "packages/schemas/tests/ingest-search.test.mjs",
    "docs/schema-alignment.md",
    "tests/test_ingest_contract_alignment.py",
    "tests/test_ingest_connector_api_e2e.py",
    "tests/test_schema_alignment_docs.py",
    "tests/test_validate_openapi_ingest_connector_api_schema.py",
    "tests/test_validate_openapi_schema_components.py",
    "examples/ingest-search/notes.md",
    "examples/ingest-search/records.json",
    "examples/ingest-search/records.csv",
    "examples/ingest-search/repository.json",
    "examples/ingest-search/search-index.json",
    "examples/ingest-search/quarantine.json",
    "examples/ingest-search/api-requests.json",
    "examples/ingest-search/connector-api-requests.json",
    "examples/ingest-search/client-session.json",
)

EXPECTED_MCP_RESOURCE_FILES = (
    "services/mcp-gateway/src/ingestConnectorResources.ts",
    "apps/api/src/ingestConnectorMcpRoutes.ts",
    "packages/cli/src/ingestConnectorMcpPreview.ts",
    "packages/sdk-js/src/ingestConnectorMcpClient.ts",
    "apps/web/src/ingestConnectorMcpState.ts",
)

EXPECTED_MCP_RESOURCE_URIS_AND_ROUTES = (
    "sovereignops://ingest/connectors/manifest",
    "sovereignops://ingest/connectors/{profileId}",
    "GET /v1/ingest/connectors/mcp/resources",
    "GET /v1/ingest/connectors/mcp/resources/{connectorId}",
    "POST /v1/ingest/connectors/mcp/preview",
    "ingest_connector.preview_manifest",
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
    "createIngestOpenApiRouteStateFromFixtures",
    "createMemoryIngestOpenApiRouteState",
    "createIngestOpenApiRoutes",
    "mountIngestOpenApiRoutes",
    "DEFAULT_INGEST_SEARCH_FIXTURE_DIRECTORY",
    "resolveIngestSearchFixturePaths",
    "loadIngestSearchFixtureBundle",
    "createIngestRouteStateSeedFromFixtures",
    "createIngestRouteStateFromFixtures",
    "createIngestRouteStateFromIngestSearchFixtures",
    "validateIngestSearchFixtureBundle",
    "IngestFixtureValidationError",
    "runIngestConnectorApiReplayCli",
    "isIngestConnectorApiReplayCommand",
    "createIngestConnectorApiDispatcher",
)

EXPECTED_SDK_AND_WEB_SYMBOLS = (
    "createIngestSearchClient",
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
    "DEFAULT_INGEST_CONNECTOR_FIXTURE_PATH",
    "loadIngestConnectorFixtureBundle",
    "createIngestConnectorFixtureFetch",
    "createIngestConnectorFixtureClient",
    "createIngestConnectorFixtureClientHarness",
    "baseUrlFromIngestConnectorFixtureBundle",
    "IngestConnectorFixtureError",
    "IngestConnectorFixtureFetch",
    "IngestConnectorFixtureClientHarness",
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
    "buildIngestApiState",
    "collectIngestApiSourceSummaries",
    "buildIngestApiSourceCards",
    "collectIngestApiSearchResults",
    "buildIngestApiSearchRows",
    "collectIngestApiQuarantineItems",
    "buildIngestApiQuarantineQueueState",
    "buildIngestApiErrorStates",
    "buildIngestConnectorApiState",
    "buildIngestConnectorApiCards",
    "buildIngestConnectorApiRows",
    "buildIngestConnectorApiRequestCards",
    "buildIngestConnectorApiErrorStates",
    "buildIngestConnectorApiEmptyStates",
    "buildIngestConnectorApiEmptyState",
    "buildIngestConnectorApiErrorState",
    "redactIngestConnectorApiText",
    "buildIngestSessionReview",
    "collectIngestSessionRouteTimeline",
    "collectIngestSessionSdkCalls",
    "buildIngestSessionQuarantineDecisionSummary",
    "collectIngestSessionChecksumEvidence",
    "buildIngestSessionReviewEmptyState",
    "buildIngestSessionReviewErrorState",
    "buildIngestDashboardState",
    "buildIngestDashboardCards",
    "buildIngestDashboardSections",
    "INGEST_DASHBOARD_SECTION_IDS",
    "getIngestConnectorReadinessStatusLabel",
    "getIngestConnectorSafetyStateLabel",
    "INGEST_CONNECTOR_API_MANIFEST_SCHEMA_VERSION",
    "createIngestConnectorMcpClient",
    "listResources",
    "listConnectorResources",
    "listMcpConnectorResources",
    "readResource",
    "readConnectorResource",
    "readMcpConnectorResource",
    "preview",
    "previewOutput",
    "previewManifestResources",
    "buildIngestConnectorMcpState",
    "buildIngestConnectorMcpCards",
    "buildIngestConnectorMcpRows",
    "buildIngestConnectorMcpSections",
    "buildIngestConnectorMcpEmptyState",
    "getIngestConnectorMcpStatusLabel",
    "ingestConnectorApiManifestSchema",
    "ingestConnectorApiProfileSchema",
    "ingestConnectorApiManifestSchemas",
    "getIngestConnectorApiManifestSchema",
    "validateIngestConnectorApiManifest",
    "validateIngestConnectorApiProfile",
    "assertIngestConnectorApiManifest",
    "assertIngestConnectorApiProfile",
    "isIngestConnectorApiCapability",
    "isIngestConnectorApiMediaType",
    "isIngestConnectorApiProfileId",
    "INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION",
    "ingestConnectorManifestSchema",
    "ingestConnectorProfileSchema",
    "ingestConnectorManifestSchemas",
    "getIngestConnectorManifestSchema",
    "validateIngestConnectorManifest",
    "validateIngestConnectorProfile",
    "assertIngestConnectorManifest",
    "isIngestConnectorId",
    "INGEST_SEARCH_SCHEMA_VERSION",
    "ingestSearchKinds",
    "ingestSearchSchemas",
    "ingestSearchSchemaDefinitions",
    "ingestSearchValidators",
    "getIngestSearchSchema",
    "validateIngestSearchObject",
    "assertIngestSearchObject",
    "isIngestSearchKind",
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
    r"node packages\cli\src\index.ts ingest connectors api replay --fixture examples\ingest-search\connector-api-requests.json",
    r"node packages\cli\src\index.ts ingest-connector-api replay --fixture examples\ingest-search\connector-api-requests.json --id api_ingest_connectors_manifest",
    r"node packages\cli\src\index.ts ingest connectors mcp preview --connector markdown-structured --format json",
    r"node packages\cli\src\index.ts ingest-connector-mcp preview --connector json-structured --fixture packages\schemas\fixtures\ingest-connector-api-manifest.valid.json --format json",
    r"node apps\api\tests\ingest-connector-fixture-replay.test.mjs",
    r"node apps\api\tests\ingest-connector-schema-alignment.test.mjs",
    r"node apps\api\tests\ingest-fixture-services.test.mjs",
    r"node apps\api\tests\ingest-openapi-routes.test.mjs",
    r"node packages\cli\tests\ingest-connector-api-replay.test.mjs",
    r"node packages\cli\tests\ingest-api-replay.test.mjs",
    r"node packages\cli\tests\ingest-api-verify.test.mjs",
    r"node packages\sdk-js\tests\ingest-connector-client.test.mjs",
    r"node packages\sdk-js\tests\ingest-connector-fixture-fetch.test.mjs",
    r"node packages\sdk-js\tests\client-ingest-search.test.mjs",
    r"node packages\sdk-js\tests\ingest-fixture-fetch.test.mjs",
    r"node packages\sdk-js\tests\local-ingest.test.mjs",
    r"node packages\sdk-js\tests\local-ingest-connector-manifest.test.mjs",
    r"node apps\web\tests\ingest-search.test.mjs",
    r"node apps\web\tests\ingest-connector-api-state.test.mjs",
    r"node apps\web\tests\ingest-connector-state.test.mjs",
    r"node apps\web\tests\ingest-api-state.test.mjs",
    r"node apps\web\tests\ingest-session-review.test.mjs",
    r"node apps\api\tests\ingest-connector-routes.test.mjs",
    r"node packages\schemas\tests\ingest-connector-api-manifest.test.mjs",
    r"node packages\schemas\tests\ingest-connector-manifest.test.mjs",
    r"node packages\schemas\tests\ingest-search.test.mjs",
    "python -m unittest tests.test_ingest_connectors_docs",
    "python -m unittest tests.test_ingest_integration_docs tests.test_sdk_js_docs",
    r"python -m unittest discover -s services\ingest\tests",
    r"python -m unittest discover -s services\ingest\tests -p test_connector_manifest.py",
    r"python -m unittest discover -s services\ingest\tests -p test_ingest_cli_connector_manifest.py",
    "python -m unittest tests.test_ingest_connector_api_e2e",
    "python -m unittest tests.test_ingest_contract_alignment",
    "python -m unittest tests.test_validate_openapi_ingest_connector_api_schema",
    "python -m unittest tests.test_validate_openapi_schema_components",
    "python -m unittest tests.test_schema_alignment_docs",
    "python -m unittest tests.test_validate_openapi_ingest_search",
    "python -m unittest tests.test_mcp_contract_docs tests.test_ingest_connectors_docs tests.test_agent_guide_docs",
    "python -m unittest tests.test_validate_openapi_ingest_connector_mcp",
    r"node services\mcp-gateway\tests\ingest-connector-resources.test.mjs",
    r"node apps\api\tests\ingest-connector-mcp-routes.test.mjs",
    r"node packages\cli\tests\ingest-connector-mcp-preview.test.mjs",
    r"node packages\sdk-js\tests\ingest-connector-mcp-client.test.mjs",
    r"node apps\web\tests\ingest-connector-mcp-state.test.mjs",
    r"python scripts\release_check.py --dry-run",
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
        cls.normalized_lower_text = re.sub(r"\s+", " ", cls.lower_text)

    def test_document_has_required_sections_files_symbols_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())

        for heading in EXPECTED_HEADINGS:
            with self.subTest(heading=heading):
                self.assertIn(heading, self.text)

        for file_path in EXPECTED_FILES:
            with self.subTest(file_path=file_path):
                self.assertTrue((ROOT / file_path).is_file(), file_path)
                self.assertIn(f"`{file_path}`", self.text)

        for file_path in EXPECTED_MCP_RESOURCE_FILES:
            with self.subTest(file_path=file_path):
                self.assertIn(f"`{file_path}`", self.text)

        for value in EXPECTED_MCP_RESOURCE_URIS_AND_ROUTES:
            with self.subTest(value=value):
                self.assertIn(f"`{value}`", self.text)

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
            "cross-surface parity input",
            "unsupported methods and paths",
            "web ingest dashboard state",
            "request-body drift",
            "cross-surface connector api e2e parity",
            "no-network indicators",
            "mcp ingest connector preview workflow",
            "read-only mcp resources",
            "dry-run preview envelopes",
            "dryrun: true",
            "must not fall back to global fetch",
            "never opens a socket by default",
            "runs through the mcp policy gate",
            "stop before handlers run",
            "approval request for a later durable import",
            "redacted source uri",
            "audit records should include",
        )
        for phrase in phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.normalized_lower_text)

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
        self.assertNotIn("targets only", self.lower_text)

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
            "`packages/sdk-js/src/ingestFixtureFetch.ts`",
            "`packages/sdk-js/src/ingestConnectorClient.ts`",
            "`packages/sdk-js/src/ingestConnectorFixtureFetch.ts`",
            "`examples/ingest-search/api-requests.json`",
            "`examples/ingest-search/connector-api-requests.json`",
            "`packages/sdk-js/tests/local-ingest-connector-manifest.test.mjs`",
            "`packages/sdk-js/tests/ingest-fixture-fetch.test.mjs`",
            "`packages/sdk-js/tests/ingest-connector-client.test.mjs`",
            "`packages/sdk-js/tests/ingest-connector-fixture-fetch.test.mjs`",
            "listLocalIngestConnectorProfiles",
            "getLocalIngestConnectorProfile",
            "normalizeLocalIngestConnectorManifest",
            "buildLocalIngestConnectorReadinessSummary",
            "LocalIngestConnectorManifestError",
            "createIngestConnectorClient",
            "IngestConnectorClient.getManifest",
            "IngestConnectorClient.getReadiness",
            "createIngestFixtureFetch",
            "createIngestFixtureClientHarness",
            "baseUrlFromIngestFixtureBundle",
            "createIngestConnectorFixtureFetch",
            "createIngestConnectorFixtureClientHarness",
            "baseUrlFromIngestConnectorFixtureBundle",
            r"node packages\sdk-js\tests\local-ingest-connector-manifest.test.mjs",
            r"node packages\sdk-js\tests\ingest-fixture-fetch.test.mjs",
            r"node packages\sdk-js\tests\ingest-connector-client.test.mjs",
            r"node packages\sdk-js\tests\ingest-connector-fixture-fetch.test.mjs",
            "examples require no network access.",
            "never opens a socket",
            "must not fall back to global fetch",
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
