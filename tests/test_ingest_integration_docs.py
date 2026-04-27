from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "ingest-integration.md"
SESSION_PATH = ROOT / "examples" / "ingest-search" / "client-session.json"
FIXTURE_ROOT = ROOT / "examples" / "ingest-search"

EXPECTED_HEADINGS = (
    "# Ingest/Search Integration Path",
    "## Local Boundary",
    "## API Path",
    "## SDK Path",
    "## CLI Path",
    "## Web State Path",
    "## Schema Contracts",
    "## Fixtures",
    "## Client Session Fixture",
    "## Validation Commands",
)

EXPECTED_API_ROUTES = (
    "GET /v1/ingest/sources",
    "POST /v1/ingest/search",
    "GET /v1/ingest/quarantine",
    "POST /v1/ingest/quarantine/:recordId/decision",
)

EXPECTED_SDK_ENTRY_POINTS = (
    "normalizeLocalSourceSummaries",
    "buildLocalSearchView",
    "searchLocalText",
    "groupLocalQuarantineRecords",
    "prepareLocalQuarantineDecisionPayload",
)

EXPECTED_SCHEMA_KINDS = (
    "repositorySourceSnapshot",
    "logSourceSnapshot",
    "normalizedDocument",
    "searchQuery",
    "searchResult",
    "quarantineRecord",
    "quarantineDecision",
)

EXPECTED_FIXTURE_PATHS = (
    "examples/ingest-search/repository.json",
    "examples/ingest-search/ingest-log.json",
    "examples/ingest-search/search-index.json",
    "examples/ingest-search/quarantine.json",
    "examples/ingest-search/api-requests.json",
    "examples/ingest-search/client-session.json",
)

EXPECTED_COMMANDS = (
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
    r"examples\ingest-search\search-index.json --query checksum --media-type "
    "application/json --limit 5",
    r"node packages\cli\src\index.ts ingest search quarantine list --quarantine-path "
    r"examples\ingest-search\quarantine.json --source-uri "
    "fixture://ingest-search/records.csv",
    r"node packages\cli\src\index.ts ingest search quarantine decide --quarantine-path "
    r"examples\ingest-search\quarantine.json --item-id qtn_csv_beta_status "
    r"--decision release --actor-id local_reviewer --reason "
    "\"Status accepted for local indexing.\" --timestamp 2026-04-27T08:05:00.000Z",
)

LOCAL_SOURCE_SCHEMES = ("fixture://", "file://", "stdin://", "workspace://", "local://")
LOCAL_HTTP_PREFIXES = ("http://127.0.0.1", "http://localhost", "http://[::1]")
FILE_PATH_KEYS = {"fixturePath", "inputPath", "indexPath", "quarantinePath", "sourcePath"}
SENSITIVE_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~-]{12,}"),
    re.compile(r"(?i)(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{4,}"),
)


class IngestIntegrationDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_doc_text = cls.doc_text.lower()
        cls.session = json.loads(SESSION_PATH.read_text(encoding="utf-8"))

    def test_doc_has_required_headings_layer_refs_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())
        for heading in EXPECTED_HEADINGS:
            with self.subTest(heading=heading):
                self.assertIn(heading, self.doc_text)

        for route in EXPECTED_API_ROUTES:
            with self.subTest(route=route):
                self.assertIn(f"`{route}`", self.doc_text)

        for entry_point in EXPECTED_SDK_ENTRY_POINTS:
            with self.subTest(entry_point=entry_point):
                self.assertIn(f"`{entry_point}`", self.doc_text)

        for kind in EXPECTED_SCHEMA_KINDS:
            with self.subTest(kind=kind):
                self.assertIn(f"`{kind}`", self.doc_text)

        for fixture_path in EXPECTED_FIXTURE_PATHS:
            with self.subTest(fixture_path=fixture_path):
                self.assertTrue((ROOT / fixture_path).is_file(), fixture_path)
                self.assertIn(f"`{fixture_path}`", self.doc_text)

        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

        self.assertNotIn("curl ", self.lower_doc_text)
        self.assertNotIn("npx ", self.lower_doc_text)
        self.assertNotIn("npm install -g", self.lower_doc_text)
        self.assertNotIn("https://", self.lower_doc_text)

    def test_client_session_json_shape_and_layer_contracts(self) -> None:
        self.assertTrue(SESSION_PATH.is_file())
        self.assertEqual(self.session["schemaVersion"], "ingest-search-client-session.v1")
        self.assertRegex(self.session["generatedAt"], r"^2026-04-27T\d\d:\d\d:\d\d\.000Z$")
        self.assertEqual(self.session["workspaceId"], "wsp_ingest_demo")
        self.assertTrue(self.session["localOnly"])
        self.assertTrue(self.session["baseUrl"].startswith(LOCAL_HTTP_PREFIXES))

        route_keys = {
            f"{route['method']} {route['routePath']}"
            for route in self.session["api"]["routes"]
        }
        self.assertEqual(route_keys, set(EXPECTED_API_ROUTES[:-1]) | {
            "POST /v1/ingest/quarantine/qrn_alpha/decision",
        })

        self.assertEqual(
            tuple(self.session["sdk"]["entryPoints"]),
            EXPECTED_SDK_ENTRY_POINTS,
        )
        self.assertEqual(tuple(self.session["schemas"]["kinds"]), EXPECTED_SCHEMA_KINDS)
        self.assertEqual(self.session["schemas"]["version"], 1)

        commands = self.session["cli"]["commands"]
        self.assertEqual(len(commands), 4)
        self.assertTrue(all(command.startswith("node packages\\cli\\src\\index.ts ") for command in commands))
        self.assertTrue(any("source summary" in command for command in commands))
        self.assertTrue(any("index search" in command for command in commands))
        self.assertTrue(any("quarantine list" in command for command in commands))
        self.assertTrue(any("quarantine decide" in command for command in commands))

        web = self.session["web"]
        self.assertEqual(web["sourceCards"][0]["status"], "attention")
        self.assertEqual(web["searchRows"][0]["quarantineState"], "clear")
        self.assertEqual(web["quarantineQueue"]["pendingCount"], 1)
        self.assertEqual(web["quarantineQueue"]["items"][0]["decision"], "pending")

    def test_client_session_uses_local_only_uris_urls_and_paths(self) -> None:
        for key_path, value in _walk_key_values(self.session):
            with self.subTest(key_path=key_path):
                if isinstance(value, str):
                    self.assertNotIn("https://", value)
                    if value.startswith("http://"):
                        self.assertTrue(value.startswith(LOCAL_HTTP_PREFIXES), value)

                key = key_path[-1]
                if key.endswith("Uri"):
                    self.assertIsInstance(value, str)
                    self.assertTrue(value.startswith(LOCAL_SOURCE_SCHEMES), value)
                    if value.startswith("fixture://ingest-search/"):
                        name = value.removeprefix("fixture://ingest-search/")
                        self.assertTrue((FIXTURE_ROOT / name).is_file(), value)
                elif key.endswith("Uris"):
                    self.assertIsInstance(value, list)
                    for source_uri in value:
                        self.assertTrue(source_uri.startswith(LOCAL_SOURCE_SCHEMES), source_uri)
                elif key in FILE_PATH_KEYS:
                    self.assertIsInstance(value, str)
                    _assert_safe_existing_relative_path(self, value)

        for command in self.session["cli"]["commands"]:
            with self.subTest(command=command):
                self.assertNotIn("curl ", command.lower())
                self.assertNotIn("npx ", command.lower())
                self.assertNotIn("npm install -g", command.lower())
                for match in re.finditer(r"(?:--(?:input|index|quarantine)-path)\s+(\S+)", command):
                    _assert_safe_existing_relative_path(self, match.group(1))

    def test_docs_and_client_session_avoid_restricted_or_sensitive_content(self) -> None:
        for path in (DOC_PATH, SESSION_PATH):
            with self.subTest(path=path.name):
                _assert_no_restricted_terms(self, path)

        for value in [* _walk_strings(self.session), self.doc_text]:
            with self.subTest(value=value[:40]):
                for pattern in SENSITIVE_VALUE_PATTERNS:
                    self.assertIsNone(pattern.search(value))


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


def _walk_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        strings: list[str] = []
        for item in value.values():
            strings.extend(_walk_strings(item))
        return strings
    if isinstance(value, list):
        strings = []
        for item in value:
            strings.extend(_walk_strings(item))
        return strings
    return []


def _assert_safe_existing_relative_path(testcase: unittest.TestCase, value: str) -> None:
    normalized = value.replace("\\", "/")
    path = Path(normalized)
    testcase.assertFalse(path.is_absolute(), value)
    testcase.assertNotIn("..", path.parts, value)
    testcase.assertTrue((ROOT / path).is_file(), value)


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
