from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.validate_openapi import validate_openapi


ROOT = Path(__file__).resolve().parents[1]
OPENAPI_PATH = ROOT / "docs" / "openapi.yaml"
VALID_OPENAPI = OPENAPI_PATH.read_text(encoding="utf-8")


class ValidateOpenApiTests(unittest.TestCase):
    def test_accepts_required_contract_shape(self) -> None:
        report = validate_openapi(OPENAPI_PATH)

        self.assertTrue(report.ok, report.issues)

    def test_reports_missing_file(self) -> None:
        report = validate_openapi(Path("does-not-exist.yaml"))

        self.assertFalse(report.ok)
        self.assertIn("missing file", report.issues[0])

    def test_reports_missing_operation_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "openapi.yaml"
            path.write_text(
                VALID_OPENAPI.replace("operationId: updateRecord\n", "", 1),
                encoding="utf-8",
            )

            report = validate_openapi(path)

        self.assertFalse(report.ok)
        self.assertIn("missing operationId updateRecord", "\n".join(report.issues))

    def test_reports_missing_error_model_field(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "openapi.yaml"
            path.write_text(VALID_OPENAPI.replace("        - requestId\n", "", 1), encoding="utf-8")

            report = validate_openapi(path)

        self.assertFalse(report.ok)
        self.assertIn("ErrorResponse missing field: requestId", report.issues)


if __name__ == "__main__":
    unittest.main()
