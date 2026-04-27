from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.validate_openapi import validate_openapi


VALID_OPENAPI = """\
openapi: 3.1.0
info:
  title: Test
  version: 0.1.0
paths:
  /health:
    get:
      operationId: getHealth
  /v1/workspaces/{workspaceId}/records:
    get:
      operationId: listRecords
    post:
      operationId: createRecord
  /v1/workspaces/{workspaceId}/records/{recordId}:
    get:
      operationId: getRecord
    patch:
      operationId: updateRecord
  /v1/workspaces/{workspaceId}/agent-actions/preview:
    post:
      operationId: previewAgentAction
  /v1/workspaces/{workspaceId}/audit:
    get:
      operationId: listAuditEntries
  /v1/audit/export/jsonl:
    post:
      operationId: exportAuditJsonl
  /v1/audit/export/csv:
    post:
      operationId: exportAuditCsv
  /v1/audit/export/package:
    post:
      operationId: exportAuditPackage
  /v1/ingest/evidence/export:
    post:
      operationId: exportIngestEvidence
  /v1/ingest/evidence/package:
    post:
      operationId: packageIngestEvidence
components:
  responses:
    Error:
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
  schemas:
    ErrorResponse:
      type: object
      required:
        - code
        - message
        - requestId
      properties:
        code:
          type: string
        message:
          type: string
        requestId:
          type: string
"""


class ValidateOpenApiTests(unittest.TestCase):
    def test_accepts_required_contract_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "openapi.yaml"
            path.write_text(VALID_OPENAPI, encoding="utf-8")

            report = validate_openapi(path)

        self.assertTrue(report.ok, report.issues)

    def test_reports_missing_file(self) -> None:
        report = validate_openapi(Path("does-not-exist.yaml"))

        self.assertFalse(report.ok)
        self.assertIn("missing file", report.issues[0])

    def test_reports_missing_operation_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "openapi.yaml"
            path.write_text(
                VALID_OPENAPI.replace("operationId: updateRecord\n", ""),
                encoding="utf-8",
            )

            report = validate_openapi(path)

        self.assertFalse(report.ok)
        self.assertIn("missing operationId updateRecord", "\n".join(report.issues))

    def test_reports_missing_error_model_field(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "openapi.yaml"
            path.write_text(VALID_OPENAPI.replace("        - requestId\n", ""), encoding="utf-8")

            report = validate_openapi(path)

        self.assertFalse(report.ok)
        self.assertIn("ErrorResponse missing field: requestId", report.issues)


if __name__ == "__main__":
    unittest.main()
