from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "examples" / "ingest-search" / "connector-mcp-api-requests.json"
OPENAPI_PATH = ROOT / "docs" / "openapi.yaml"

EXPECTED_SCHEMA_VERSION = "ingest-connector-mcp-api-requests.v1"
EXPECTED_API_BASE = "local://ingest-connector-mcp-api"
EXPECTED_ROUTE_TEMPLATES = {
    ("GET", "/v1/ingest/connectors/mcp/resources"),
    ("GET", "/v1/ingest/connectors/mcp/resources/{connectorId}"),
    ("POST", "/v1/ingest/connectors/mcp/preview"),
}
EXPECTED_SUCCESS_SCHEMA_VERSIONS = {
    "/v1/ingest/connectors/mcp/resources": "ingest-connector-mcp-resources/v1",
    "/v1/ingest/connectors/mcp/resources/local.files": "ingest-connector-mcp-resource/v1",
    "/v1/ingest/connectors/mcp/preview": "ingest-connector-mcp-preview/v1",
}
SAFE_CONNECTOR_ID = re.compile(r"^local\.[A-Za-z0-9_.-]{1,96}$")

PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "plan-pack",
    "private plan pack",
    "." + "codex-private",
    "." + "codex-run",
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog.jsonl",
    "tasks" + "\\backlog.jsonl",
)
RAW_SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{12,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\]|\[redacted[:-])[A-Za-z0-9._~+/=-]+"),
    re.compile(
        r"(?i)(?:password|passwd|secret|api[_-]?key)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted[:-])\S{4,}"
    ),
    re.compile(
        r"(?i)(?<![A-Za-z0-9_])(?<!\[redacted[:-])(?:lock[_-]?token|token)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted[:-])\S{4,}"
    ),
)
RAW_PATH_PATTERNS = (
    re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]"),
    re.compile(r"\\\\[^\\\s]+\\[^\\\s]+"),
    re.compile(
        r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:/|\b)"
    ),
    re.compile(r"(?<![A-Za-z0-9_])workspaces[\\/]"),
)


class ValidateOpenApiIngestConnectorMcpFixtureTests(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture_text = FIXTURE_PATH.read_text(encoding="utf-8")
        cls.fixture = json.loads(cls.fixture_text)
        cls.openapi_lines = OPENAPI_PATH.read_text(encoding="utf-8").splitlines()

    def test_fixture_is_local_only_mcp_api_contract(self) -> None:
        fixture = self.fixture

        self.assertEqual(fixture["schemaVersion"], EXPECTED_SCHEMA_VERSION)
        self.assertEqual(fixture["apiBase"], EXPECTED_API_BASE)
        self.assertIs(fixture["localOnly"], True)
        self.assertEqual(fixture["network"]["mode"], "disabled")
        self.assertIs(fixture["durableWrites"], False)
        self.assertEqual(fixture["auth"], {"mode": "none", "required": False})
        self.assertGreaterEqual(len(fixture["requests"]), 1)

        seen_ids: set[str] = set()
        for index, entry in enumerate(fixture["requests"]):
            with self.subTest(request=index):
                self.assertIsInstance(entry["id"], str)
                self.assertNotIn(entry["id"], seen_ids)
                seen_ids.add(entry["id"])
                self.assertIn(entry["method"], {"GET", "POST"})
                self.assertTrue(entry["path"].startswith("/v1/ingest/connectors/mcp/"))
                self.assertFalse(entry["path"].startswith(("http://", "https://")))
                self.assertEqual(entry["headers"]["accept"], "application/json")
                if entry["method"] == "POST":
                    self.assertEqual(entry["headers"]["content-type"], "application/json")
                    self.assertIsInstance(entry.get("body"), dict)
                self.assertIsInstance(entry["expectedStatus"], int)
                self.assertIsInstance(entry["expectedBody"], dict)
                self.assertIn("expectedChecks", entry)

    def test_success_expected_bodies_preserve_local_no_network_invariants(self) -> None:
        for entry in self.fixture["requests"]:
            if entry["expectedStatus"] >= 400:
                continue

            body = entry["expectedBody"]
            with self.subTest(request=entry["id"]):
                self.assertEqual(
                    body["schemaVersion"],
                    EXPECTED_SUCCESS_SCHEMA_VERSIONS[entry["path"]],
                )
                self.assertIs(body["localOnly"], True)
                self.assertIs(body["noNetwork"], True)
                self.assertIs(body["durableWrites"], False)
                self.assertEqual(
                    body["metadata"],
                    {"localOnly": True, "noNetwork": True, "durableWrites": False},
                )

                for path, value in _walk_records(body):
                    if {"localOnly", "noNetwork", "durableWrites"} <= set(value):
                        self.assertIs(value["localOnly"], True, path)
                        self.assertIs(value["noNetwork"], True, path)
                        self.assertIs(value["durableWrites"], False, path)
                    safety = value.get("safety")
                    if isinstance(safety, dict):
                        self.assertIs(safety["localOnly"], True, path)
                        self.assertIs(safety["networkAccess"], False, path)
                        self.assertIs(safety["durableWrites"], False, path)
                    auth = value.get("auth")
                    if isinstance(auth, dict):
                        self.assertEqual(auth, {"mode": "none", "required": False}, path)

    def test_fixture_has_no_private_paths_or_raw_secrets(self) -> None:
        assert_no_private_plan_or_raw_sensitive_output(self, self.fixture_text)

    def test_every_fixture_route_is_represented_in_openapi(self) -> None:
        represented_routes: set[tuple[str, str]] = set()

        for entry in self.fixture["requests"]:
            method = entry["method"].upper()
            route_template, connector_id = _openapi_route_template(entry["path"])
            represented_routes.add((method, route_template))

            with self.subTest(request=entry["id"]):
                if connector_id is not None:
                    self.assertRegex(connector_id, SAFE_CONNECTOR_ID)

                path_block = _require_block(self.openapi_lines, route_template, 2)
                method_block = _require_block(path_block, method.lower(), 4)
                block_text = "\n".join(method_block)
                self.assertIn("- ingest", block_text)
                self.assertIn("responses:", block_text)

                status = str(entry["expectedStatus"])
                if status == "200":
                    self.assertIn('"200":', block_text)
                else:
                    self.assertTrue(
                        f'"{status}":' in block_text or "default:" in block_text,
                        f"{method} {route_template} does not document status {status}",
                    )

                if route_template.endswith("{connectorId}"):
                    self.assertIn("name: connectorId", block_text)
                    self.assertIn(r"^local\.[A-Za-z0-9_.-]{1,96}$", block_text)
                if method == "POST":
                    self.assertIn("requestBody:", block_text)
                    self.assertIn(
                        '$ref: "#/components/schemas/IngestConnectorMcpPreviewRequest"',
                        block_text,
                    )

        self.assertEqual(represented_routes, EXPECTED_ROUTE_TEMPLATES)


def _openapi_route_template(path: str) -> tuple[str, str | None]:
    prefix = "/v1/ingest/connectors/mcp/resources/"
    if path.startswith(prefix):
        connector_id = path.removeprefix(prefix)
        return "/v1/ingest/connectors/mcp/resources/{connectorId}", connector_id
    return path, None


def _walk_records(value: Any, path: str = "$") -> list[tuple[str, dict[str, Any]]]:
    records: list[tuple[str, dict[str, Any]]] = []
    if isinstance(value, dict):
        records.append((path, value))
        for key, nested in value.items():
            records.extend(_walk_records(nested, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            records.extend(_walk_records(nested, f"{path}[{index}]"))
    return records


def _require_block(lines: list[str], key: str, indent: int) -> list[str]:
    block = _find_block(lines, key, indent)
    if block is None:
        raise AssertionError(f"missing block {key!r} at indent {indent}")
    return block


def _find_block(lines: list[str], key: str, indent: int) -> list[str] | None:
    prefix = " " * indent + key + ":"
    for index, line in enumerate(lines):
        if line.startswith(prefix):
            return _collect_block(lines, index, indent)
    return None


def _collect_block(lines: list[str], index: int, indent: int) -> list[str]:
    block: list[str] = []
    for child in lines[index + 1 :]:
        if not child.strip() or child.lstrip().startswith("#"):
            block.append(child)
            continue
        child_indent = len(child) - len(child.lstrip(" "))
        if child_indent <= indent:
            break
        block.append(child)
    return block


def assert_no_private_plan_or_raw_sensitive_output(
    testcase: unittest.TestCase,
    text: str,
) -> None:
    lower_text = text.lower()

    for marker in PRIVATE_PATH_MARKERS:
        with testcase.subTest(marker=marker):
            testcase.assertNotIn(marker.lower(), lower_text)

    for pattern in RAW_PATH_PATTERNS:
        with testcase.subTest(pattern=pattern.pattern):
            testcase.assertIsNone(pattern.search(text))

    for pattern in RAW_SECRET_PATTERNS:
        with testcase.subTest(pattern=pattern.pattern):
            testcase.assertIsNone(pattern.search(text))


if __name__ == "__main__":
    unittest.main()
