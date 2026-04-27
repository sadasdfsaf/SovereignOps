from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
OPENAPI_PATH = ROOT / "docs" / "openapi.yaml"
INTEGRATION_DOC_PATH = ROOT / "docs" / "ingest-integration.md"
FIXTURE_ROOT = ROOT / "examples" / "ingest-search"
API_REQUESTS_PATH = FIXTURE_ROOT / "api-requests.json"
CLIENT_SESSION_PATH = FIXTURE_ROOT / "client-session.json"

INGEST_FIXTURE_NAMES = (
    "repository.json",
    "ingest-log.json",
    "search-index.json",
    "quarantine.json",
    "records.json",
)

CHECKSUM_PATTERN = re.compile(r"^[0-9a-f]{64}$")
OPENAPI_PATH_PATTERN = re.compile(r"^  (/[^:]+):$")
OPENAPI_METHOD_PATTERN = re.compile(r"^    (get|post|put|patch|delete):$")
DOC_ROUTE_PATTERN = re.compile(r"`((?:GET|POST|PUT|PATCH|DELETE) /[^`]+)`")
LOCAL_HTTP_PREFIXES = ("http://127.0.0.1", "http://localhost", "http://[::1]")
LOCAL_SOURCE_PREFIXES = ("fixture://", "file://", "stdin://", "workspace://", "local://")

REQUIRED_RESPONSE_FIELDS = {
    "api_ingest_normalize": (
        "ok",
        "sourceUri",
        "mediaType",
        "checksum",
        "normalizedText",
        "untrusted",
    ),
    "api_ingest_structured_csv": (
        "ok",
        "sourceUri",
        "mediaType",
        "summary",
        "documents",
        "quarantine",
    ),
    "api_ingest_repository_scan": ("ok", "workspaceId", "sources"),
    "api_search_query": ("ok", "workspaceId", "query", "results"),
    "api_quarantine_cases": ("ok", "cases"),
    "api_quarantine_decision": ("ok", "case"),
}

REQUIRED_COLLECTION_FIELDS = {
    "documents": (
        "id",
        "sourceUri",
        "mediaType",
        "checksum",
        "title",
        "citations",
        "untrusted",
        "quarantineState",
    ),
    "results": (
        "id",
        "score",
        "sourceUri",
        "mediaType",
        "checksum",
        "title",
        "snippet",
        "citations",
        "untrusted",
        "quarantineState",
    ),
    "sources": (
        "sourceUri",
        "path",
        "mediaType",
        "checksum",
        "state",
        "untrusted",
    ),
    "cases": (
        "id",
        "sourceUri",
        "state",
        "reasonCodes",
        "severity",
        "citationSnapshots",
        "previewText",
        "allowedActions",
    ),
    "items": (
        "id",
        "sourceUri",
        "checksum",
        "reasonCode",
        "citation",
        "untrusted",
        "quarantineState",
    ),
}

REQUIRED_DECISION_CASE_FIELDS = (
    "id",
    "sourceUri",
    "fromState",
    "state",
    "decision",
)

REQUIRED_DOC_FILES = (
    "apps/api/src/ingestRoutes.ts",
    "apps/web/src/ingestSearch.ts",
    "packages/sdk-js/src/localIngest.ts",
    "packages/cli/src/ingestSearch.ts",
    "packages/schemas/src/ingestSearch.ts",
    "examples/ingest-search/repository.json",
    "examples/ingest-search/ingest-log.json",
    "examples/ingest-search/search-index.json",
    "examples/ingest-search/quarantine.json",
    "examples/ingest-search/api-requests.json",
    "examples/ingest-search/client-session.json",
)

REQUIRED_DOC_COMMANDS = (
    r"python -m json.tool examples\ingest-search\client-session.json",
    "python -m unittest tests.test_ingest_integration_docs",
    "npm.cmd --workspace @sovereignops/api run check",
    "npm.cmd --workspace @sovereignops/sdk-js run check",
    "npm.cmd --workspace @sovereignops/cli run check",
    "npm.cmd --workspace @sovereignops/web run check",
    "npm.cmd --workspace @sovereignops/schemas run check",
    r"node packages\cli\src\index.ts ingest search source summary --input-path "
    r"examples\ingest-search\repository.json",
    r"node packages\cli\src\index.ts ingest search index search --index-path "
    r"examples\ingest-search\search-index.json",
    r"node packages\cli\src\index.ts ingest search quarantine list --quarantine-path "
    r"examples\ingest-search\quarantine.json",
    r"node packages\cli\src\index.ts ingest search quarantine decide --quarantine-path "
    r"examples\ingest-search\quarantine.json",
)


class IngestContractAlignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.openapi_text = OPENAPI_PATH.read_text(encoding="utf-8")
        cls.integration_doc = INTEGRATION_DOC_PATH.read_text(encoding="utf-8")
        cls.api_requests = _load_json(API_REQUESTS_PATH)
        cls.client_session = _load_json(CLIENT_SESSION_PATH)
        cls.ingest_fixtures = {
            name: _load_json(FIXTURE_ROOT / name) for name in INGEST_FIXTURE_NAMES
        }
        cls.repository_sources = {
            source["sourceUri"]: source
            for source in cls.ingest_fixtures["repository.json"]["sources"]
        }

    def test_api_request_routes_exist_in_openapi(self) -> None:
        openapi_routes = _openapi_routes(self.openapi_text)
        request_ids: set[str] = set()

        for item in self.api_requests["requests"]:
            with self.subTest(request_id=item["id"]):
                self.assertNotIn(item["id"], request_ids)
                request_ids.add(item["id"])

                method = item["route"]["method"].lower()
                path = _normalize_openapi_path(item["route"]["path"])
                self.assertIn((method, path), openapi_routes)

        self.assertEqual(set(REQUIRED_RESPONSE_FIELDS), request_ids)

    def test_client_session_references_existing_routes_files_and_fixture_ids(self) -> None:
        doc_routes = set(DOC_ROUTE_PATTERN.findall(self.integration_doc))
        fixture_paths = {entry["fixturePath"] for entry in self.client_session["fixtures"]}
        source_uris = set(self.repository_sources)
        search_ids = {
            document["id"]
            for document in self.ingest_fixtures["search-index.json"]["documents"]
        }
        quarantine_ids = {
            item["id"] for item in self.ingest_fixtures["quarantine.json"]["items"]
        }

        for route in self.client_session["api"]["routes"]:
            with self.subTest(route=route["routePath"]):
                route_key = f"{route['method']} {_normalize_session_doc_path(route['routePath'])}"
                self.assertIn(route_key, doc_routes)

        for fixture_path in fixture_paths:
            with self.subTest(fixture_path=fixture_path):
                _assert_existing_repo_file(self, fixture_path)

        self.assertEqual(
            fixture_paths,
            {
                "examples/ingest-search/repository.json",
                "examples/ingest-search/search-index.json",
                "examples/ingest-search/quarantine.json",
            },
        )

        for source_uri in self.client_session["sdk"]["sourceUris"]:
            with self.subTest(source_uri=source_uri):
                self.assertIn(source_uri, source_uris)

        for row in self.client_session["web"]["searchRows"]:
            with self.subTest(result_id=row["resultId"]):
                self.assertIn(row["resultId"], search_ids)
                self.assertIn(row["sourceUri"], source_uris)

        for item in self.client_session["web"]["quarantineQueue"]["items"]:
            with self.subTest(item_id=item["itemId"]):
                self.assertIn(item["itemId"], quarantine_ids)
                self.assertIn(item["sourceUri"], source_uris)

        request_ids = {item["id"] for item in self.api_requests["requests"]}
        for key_path, value in _walk_key_values(self.client_session):
            key = key_path[-1]
            if isinstance(value, str) and key in {"requestId", "apiRequestId"}:
                with self.subTest(key_path=".".join(key_path)):
                    self.assertIn(value, request_ids)

    def test_response_bodies_keep_stable_local_first_fields(self) -> None:
        for item in self.api_requests["requests"]:
            response = item["response"]
            body = response["body"]
            with self.subTest(request_id=item["id"]):
                self.assertEqual(response["status"], 200)
                self.assertTrue(body["ok"])
                for field in REQUIRED_RESPONSE_FIELDS[item["id"]]:
                    self.assertIn(field, body)
                _assert_local_first_values(self, body)
                _assert_collection_fields(self, body)

    def test_fixture_checksums_and_source_references_align(self) -> None:
        artifacts: list[tuple[str, Any]] = [
            ("api-requests.json", self.api_requests),
            ("client-session.json", self.client_session),
            *self.ingest_fixtures.items(),
        ]

        for artifact_name, artifact in artifacts:
            for key_path, value in _walk_key_values(artifact):
                if key_path[-1] == "checksum":
                    with self.subTest(artifact=artifact_name, key_path=".".join(key_path)):
                        self.assertIsInstance(value, str)
                        self.assertRegex(value, CHECKSUM_PATTERN)

        for source_uri, source in self.repository_sources.items():
            with self.subTest(source_uri=source_uri):
                self.assertRegex(source["checksum"], CHECKSUM_PATTERN)
                _assert_existing_repo_file(self, source["path"])

        for artifact_name, artifact in artifacts:
            for record in _walk_records(artifact):
                source_uri = record.get("sourceUri")
                checksum = record.get("checksum")
                if source_uri in self.repository_sources and checksum is not None:
                    with self.subTest(artifact=artifact_name, source_uri=source_uri):
                        self.assertEqual(checksum, self.repository_sources[source_uri]["checksum"])

        for artifact_name, artifact in artifacts:
            for key_path, value in _walk_key_values(artifact):
                if key_path[-1] == "sourceUri":
                    with self.subTest(artifact=artifact_name, key_path=".".join(key_path)):
                        self.assertIsInstance(value, str)
                        self.assertTrue(value.startswith(LOCAL_SOURCE_PREFIXES), value)
                        if value.startswith("fixture://ingest-search/"):
                            self.assertIn(value, self.repository_sources)

    def test_integration_doc_mentions_local_commands_files_and_no_private_terms(self) -> None:
        for file_path in REQUIRED_DOC_FILES:
            with self.subTest(file_path=file_path):
                self.assertTrue((ROOT / file_path).is_file(), file_path)
                self.assertIn(f"`{file_path}`", self.integration_doc)

        for command in REQUIRED_DOC_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.integration_doc)

        lower_doc = self.integration_doc.lower()
        self.assertNotIn("curl ", lower_doc)
        self.assertNotIn("https://", lower_doc)
        self.assertNotIn("npx ", lower_doc)
        self.assertNotIn("npm install -g", lower_doc)
        self.assertNotIn("sovereignops-codex-pack", lower_doc)
        self.assertNotIn(".codex-private", lower_doc)
        _assert_no_restricted_terms(self, INTEGRATION_DOC_PATH)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _openapi_routes(openapi_text: str) -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    current_path: str | None = None
    for line in openapi_text.splitlines():
        path_match = OPENAPI_PATH_PATTERN.match(line)
        if path_match is not None:
            current_path = path_match.group(1)
            continue

        method_match = OPENAPI_METHOD_PATTERN.match(line)
        if method_match is not None and current_path is not None:
            routes.add((method_match.group(1), current_path))
    return routes


def _normalize_openapi_path(path: str) -> str:
    if re.fullmatch(r"/v1/quarantine/cases/[A-Za-z0-9_.-]+/decision", path):
        return "/v1/quarantine/cases/{caseId}/decision"
    return path


def _normalize_session_doc_path(path: str) -> str:
    if re.fullmatch(r"/v1/ingest/quarantine/[A-Za-z0-9_.-]+/decision", path):
        return "/v1/ingest/quarantine/:recordId/decision"
    return path


def _assert_existing_repo_file(testcase: unittest.TestCase, relative_path: str) -> None:
    path = Path(relative_path.replace("\\", "/"))
    testcase.assertFalse(path.is_absolute(), relative_path)
    testcase.assertNotIn("..", path.parts, relative_path)
    testcase.assertTrue((ROOT / path).is_file(), relative_path)


def _assert_local_first_values(testcase: unittest.TestCase, value: Any) -> None:
    if isinstance(value, dict):
        if "sourceUri" in value:
            source_uri = value["sourceUri"]
            testcase.assertIsInstance(source_uri, str)
            testcase.assertTrue(source_uri.startswith(LOCAL_SOURCE_PREFIXES), source_uri)
        if "checksum" in value:
            testcase.assertRegex(value["checksum"], CHECKSUM_PATTERN)
        if "untrusted" in value:
            testcase.assertTrue(value["untrusted"])
        if "quarantineState" in value:
            testcase.assertIn(value["quarantineState"], {"clear", "open"})
        if "citation" in value:
            _assert_citation(testcase, value["citation"])
        for citation in value.get("citations", []):
            _assert_citation(testcase, citation)
        for citation in value.get("citationSnapshots", []):
            _assert_citation(testcase, citation)
        for item in value.values():
            _assert_local_first_values(testcase, item)
        return

    if isinstance(value, list):
        for item in value:
            _assert_local_first_values(testcase, item)
        return

    if isinstance(value, str):
        testcase.assertNotIn("https://", value)
        if value.startswith("http://"):
            testcase.assertTrue(value.startswith(LOCAL_HTTP_PREFIXES), value)


def _assert_citation(testcase: unittest.TestCase, citation: dict[str, Any]) -> None:
    testcase.assertIn("sourceUri", citation)
    testcase.assertIn("range", citation)
    testcase.assertIn("trusted", citation)
    testcase.assertFalse(citation["trusted"])
    testcase.assertTrue(citation["sourceUri"].startswith(LOCAL_SOURCE_PREFIXES))


def _assert_collection_fields(testcase: unittest.TestCase, body: dict[str, Any]) -> None:
    for collection_name, fields in REQUIRED_COLLECTION_FIELDS.items():
        for record in _collection_records(body, collection_name):
            for field in fields:
                testcase.assertIn(field, record)

    if "case" in body:
        for field in REQUIRED_DECISION_CASE_FIELDS:
            testcase.assertIn(field, body["case"])
        decision = body["case"]["decision"]
        for field in ("action", "actorId", "timestamp", "reason", "override"):
            testcase.assertIn(field, decision)


def _collection_records(body: dict[str, Any], collection_name: str) -> list[dict[str, Any]]:
    if collection_name in body and isinstance(body[collection_name], list):
        return body[collection_name]
    if collection_name == "items" and isinstance(body.get("quarantine"), dict):
        items = body["quarantine"].get("items", [])
        return items if isinstance(items, list) else []
    return []


def _walk_records(value: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if isinstance(value, dict):
        records.append(value)
        for item in value.values():
            records.extend(_walk_records(item))
    elif isinstance(value, list):
        for item in value:
            records.extend(_walk_records(item))
    return records


def _walk_key_values(
    value: Any,
    key_path: tuple[str, ...] = (),
) -> list[tuple[tuple[str, ...], Any]]:
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


if __name__ == "__main__":
    unittest.main()
