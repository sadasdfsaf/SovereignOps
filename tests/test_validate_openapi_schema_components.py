from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.validate_openapi import (
    RECORD_SCHEMA_REQUIREMENTS,
    REQUIRED_RECORD_BASE_FIELDS,
    REQUIRED_RECORD_KIND_VALUES,
    REQUIRED_SCHEMA_COMPONENTS,
    REQUIRED_VALIDATION_ISSUE_FIELDS,
    validate_openapi,
)


ROOT = Path(__file__).resolve().parents[1]
OPENAPI_PATH = ROOT / "docs" / "openapi.yaml"


class ValidateOpenApiSchemaComponentsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = OPENAPI_PATH.read_text(encoding="utf-8")

    def test_checked_in_schema_components_pass_validator(self) -> None:
        report = validate_openapi(OPENAPI_PATH)

        self.assertTrue(report.ok, report.issues)

    def test_shared_record_components_are_declared(self) -> None:
        for schema_name in REQUIRED_SCHEMA_COMPONENTS:
            with self.subTest(schema=schema_name):
                self.assertIn(f"    {schema_name}:", self.text)

        for kind in REQUIRED_RECORD_KIND_VALUES:
            with self.subTest(kind=kind):
                self.assertIn(f"        - {kind}", self.text)

        for field in REQUIRED_RECORD_BASE_FIELDS:
            with self.subTest(base_field=field):
                self.assertIn(f"        - {field}", self.text)

        for schema_name, requirements in RECORD_SCHEMA_REQUIREMENTS.items():
            with self.subTest(schema=schema_name):
                self.assertIn(f'$ref: "#/components/schemas/{schema_name}"', self.text)
            for field in requirements["required"]:
                with self.subTest(schema=schema_name, field=field):
                    self.assertIn(f"            - {field}", self.text)

    def test_standard_error_components_are_strict(self) -> None:
        for field in REQUIRED_VALIDATION_ISSUE_FIELDS:
            with self.subTest(validation_issue_field=field):
                self.assertIn(f"        - {field}", self.text)

        self.assertIn("ValidationIssue:", self.text)
        self.assertIn("ErrorResponse:", self.text)
        self.assertIn("additionalProperties: false", self.text)
        self.assertIn('$ref: "#/components/schemas/ValidationIssue"', self.text)

    def test_validator_reports_missing_record_kind_enum_value(self) -> None:
        report = _validate_text(self.text.replace("        - approvals\n", "", 1))

        self.assertFalse(report.ok)
        self.assertIn("RecordKind missing enum value: approvals", report.issues)

    def test_validator_reports_missing_record_schema_field(self) -> None:
        report = _validate_text(self.text.replace("            - ownerActorId\n", "", 1))

        self.assertFalse(report.ok)
        self.assertIn("DocRecord missing field: ownerActorId", report.issues)

    def test_validator_reports_loose_validation_issue_field(self) -> None:
        report = _validate_text(
            self.text.replace(
                (
                    "    ValidationIssue:\n"
                    "      type: object\n"
                    "      required:\n"
                    "        - path\n"
                    "        - message\n"
                    "      properties:\n"
                    "        path:\n"
                    "          type: string\n"
                    "          minLength: 1\n"
                ),
                (
                    "    ValidationIssue:\n"
                    "      type: object\n"
                    "      required:\n"
                    "        - path\n"
                    "        - message\n"
                    "      properties:\n"
                    "        path:\n"
                    "          type: string\n"
                ),
                1,
            )
        )

        self.assertFalse(report.ok)
        self.assertIn("ValidationIssue.path must set minLength: 1", report.issues)

    def test_validator_reports_wrong_error_issue_item_ref(self) -> None:
        report = _validate_text(
            self.text.replace(
                '$ref: "#/components/schemas/ValidationIssue"',
                '$ref: "#/components/schemas/RecordKind"',
                1,
            )
        )

        self.assertFalse(report.ok)
        self.assertIn("ErrorResponse issues missing schema ref: ValidationIssue", report.issues)


def _validate_text(text: str):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "openapi.yaml"
        path.write_text(text, encoding="utf-8")
        return validate_openapi(path)


if __name__ == "__main__":
    unittest.main()
