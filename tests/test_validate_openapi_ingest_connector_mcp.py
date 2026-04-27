from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.validate_openapi import validate_openapi


ROOT = Path(__file__).resolve().parents[1]
OPENAPI_PATH = ROOT / "docs" / "openapi.yaml"

EXPECTED_OPERATIONS = (
    {
        "path": "/v1/ingest/connectors/mcp/resources",
        "method": "get",
        "operation_id": "listIngestConnectorMcpResources",
        "response_ref": "IngestConnectorMcpResourceListResponse",
    },
    {
        "path": "/v1/ingest/connectors/mcp/resources/{connectorId}",
        "method": "get",
        "operation_id": "getIngestConnectorMcpResource",
        "response_ref": "IngestConnectorMcpResourceResponse",
        "parameter": "connectorId",
    },
    {
        "path": "/v1/ingest/connectors/mcp/preview",
        "method": "post",
        "operation_id": "previewIngestConnectorMcpResource",
        "request_ref": "IngestConnectorMcpPreviewRequest",
        "response_ref": "IngestConnectorMcpPreviewResponse",
    },
)

EXPECTED_COMPONENTS = (
    "IngestConnectorMcpMetadata",
    "IngestConnectorMcpPreviewRequest",
    "IngestConnectorMcpPreviewResponse",
    "IngestConnectorMcpPreviewSummary",
    "IngestConnectorMcpResourceContent",
    "IngestConnectorMcpResourceDescriptor",
    "IngestConnectorMcpResourceListResponse",
    "IngestConnectorMcpResourceManifest",
    "IngestConnectorMcpResourceResponse",
)


class ValidateOpenApiIngestConnectorMcpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = OPENAPI_PATH.read_text(encoding="utf-8")
        cls.lines = cls.text.splitlines()

    def test_openapi_contract_stays_valid(self) -> None:
        report = validate_openapi(OPENAPI_PATH)

        self.assertTrue(report.ok, report.issues)

    def test_paths_document_local_mcp_resource_routes(self) -> None:
        for operation in EXPECTED_OPERATIONS:
            with self.subTest(path=operation["path"]):
                path_block = _require_block(self.lines, operation["path"], 2)
                method_block = _require_block(path_block, operation["method"], 4)
                block_text = "\n".join(method_block)

                self.assertIn(f"operationId: {operation['operation_id']}", block_text)
                self.assertIn("- ingest", block_text)
                self.assertIn(
                    f'$ref: "#/components/schemas/{operation["response_ref"]}"',
                    block_text,
                )
                self.assertIn(
                    '$ref: "#/components/responses/IngestSearchError"',
                    block_text,
                )

                if request_ref := operation.get("request_ref"):
                    self.assertIn(
                        f'$ref: "#/components/schemas/{request_ref}"',
                        block_text,
                    )
                if parameter := operation.get("parameter"):
                    self.assertIn(f"name: {parameter}", block_text)
                    self.assertIn(r"^local\.[A-Za-z0-9_.-]{1,96}$", block_text)

    def test_components_preserve_local_only_no_network_and_dry_run_contract(self) -> None:
        for component in EXPECTED_COMPONENTS:
            with self.subTest(component=component):
                self.assertIsNotNone(_find_block(self.lines, component, 4))

        for component in (
            "IngestConnectorMcpMetadata",
            "IngestConnectorMcpResourceManifest",
            "IngestConnectorMcpResourceListResponse",
            "IngestConnectorMcpResourceResponse",
            "IngestConnectorMcpPreviewResponse",
        ):
            block_text = "\n".join(_require_block(self.lines, component, 4))
            with self.subTest(envelope=component):
                self.assertIn("localOnly:", block_text)
                self.assertIn("const: true", _property_block_text(self.lines, component, "localOnly"))
                self.assertIn("noNetwork:", block_text)
                self.assertIn("const: true", _property_block_text(self.lines, component, "noNetwork"))
                self.assertIn("durableWrites:", block_text)
                self.assertIn(
                    "const: false",
                    _property_block_text(self.lines, component, "durableWrites"),
                )
                self.assertIn("additionalProperties: false", block_text)

        preview_text = "\n".join(_require_block(self.lines, "IngestConnectorMcpPreviewResponse", 4))
        summary_text = "\n".join(_require_block(self.lines, "IngestConnectorMcpPreviewSummary", 4))
        self.assertIn("dryRun:", preview_text)
        self.assertIn("const: true", _property_block_text(self.lines, "IngestConnectorMcpPreviewResponse", "dryRun"))
        self.assertIn("sideEffects:", summary_text)
        self.assertIn("const: false", _property_block_text(self.lines, "IngestConnectorMcpPreviewSummary", "sideEffects"))
        self.assertIn("contentBytes:", summary_text)
        self.assertIn("minimum: 0", _property_block_text(self.lines, "IngestConnectorMcpPreviewSummary", "contentBytes"))

    def test_resource_manifest_refs_existing_connector_profile_schema(self) -> None:
        manifest_text = "\n".join(_require_block(self.lines, "IngestConnectorMcpResourceManifest", 4))
        list_text = "\n".join(_require_block(self.lines, "IngestConnectorMcpResourceListResponse", 4))
        response_text = "\n".join(_require_block(self.lines, "IngestConnectorMcpResourceResponse", 4))

        self.assertIn('$ref: "#/components/schemas/IngestConnectorProfile"', manifest_text)
        self.assertIn('$ref: "#/components/schemas/IngestConnectorMcpResourceDescriptor"', manifest_text)
        self.assertIn('$ref: "#/components/schemas/IngestConnectorMcpResourceContent"', manifest_text)
        self.assertIn('$ref: "#/components/schemas/IngestConnectorMcpResourceManifest"', list_text)
        self.assertIn('$ref: "#/components/schemas/IngestConnectorMcpResourceManifest"', response_text)
        self.assertIn("const: ingest-connector-mcp-resource/v1", manifest_text)
        self.assertIn("const: ingest-connector-mcp-resources/v1", list_text)

    def test_docs_do_not_expose_raw_paths_or_sensitive_markers(self) -> None:
        blocks = []
        for operation in EXPECTED_OPERATIONS:
            blocks.extend(_require_block(self.lines, operation["path"], 2))
        for component in EXPECTED_COMPONENTS:
            blocks.extend(_require_block(self.lines, component, 4))
        text = "\n".join(blocks)

        self.assertIsNone(re.search(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]", text))
        self.assertIsNone(re.search(r"\\\\[^\\\s]+\\[^\\\s]+", text))
        self.assertIsNone(re.search(r"\bsk-[A-Za-z0-9_-]{12,}\b", text))
        self.assertNotIn(".codex-private", text.lower())
        self.assertNotIn("sovereignops-codex-pack", text.lower())


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


def _property_block_text(lines: list[str], component: str, property_name: str) -> str:
    block = _require_block(lines, component, 4)
    for index, line in enumerate(block):
        if line.strip() == f"{property_name}:":
            return "\n".join(_collect_block(block, index, len(line) - len(line.lstrip(" "))))
    raise AssertionError(f"missing property {property_name!r} in {component}")


if __name__ == "__main__":
    unittest.main()
