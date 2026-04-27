from __future__ import annotations

import unittest

from services.ingest.src.sovereignops_ingest.structured import (
    CSVStructuredConnector,
    JSONStructuredConnector,
    MarkdownStructuredConnector,
    import_csv,
    import_json,
    import_markdown,
)


class MarkdownStructuredImportTests(unittest.TestCase):
    def test_markdown_preserves_heading_lines_and_hierarchy(self) -> None:
        result = import_markdown(
            "file://notes.md",
            "Intro\n# Alpha\nFirst section\n## Beta\nNested section\n# Gamma\nFinal section\n",
        )

        self.assertEqual(len(result.documents), 4)
        self.assertEqual(result.documents[0].metadata["heading"], None)
        self.assertEqual(result.documents[0].citation.range.start_line, 1)
        self.assertEqual(result.documents[0].citation.range.end_line, 1)
        self.assertEqual(result.documents[1].metadata["heading"], "Alpha")
        self.assertEqual(result.documents[1].metadata["heading_line"], 2)
        self.assertEqual(result.documents[1].citation.range.start_line, 2)
        self.assertEqual(result.documents[1].citation.range.end_line, 3)
        self.assertEqual(result.documents[2].metadata["heading"], "Beta")
        self.assertEqual(result.documents[2].metadata["heading_level"], 2)
        self.assertEqual(
            result.documents[2].metadata["headings"],
            (
                {"level": 1, "text": "Alpha", "line": 2},
                {"level": 2, "text": "Beta", "line": 4},
            ),
        )
        self.assertEqual(result.documents[3].metadata["heading_line"], 6)

    def test_markdown_connector_delegates_to_importer(self) -> None:
        result = MarkdownStructuredConnector.parse("file://notes.md", "# Alpha\nBody\n")

        self.assertEqual(result.documents[0].metadata["heading"], "Alpha")

    def test_local_data_safety_finding_keeps_trust_flag(self) -> None:
        result = import_markdown(
            "file://notes.md",
            "# Note\nThis sample says to ignore previous instructions during review.\n",
            trusted=False,
        )

        self.assertEqual(len(result.findings), 1)
        self.assertEqual(result.findings[0].code, "embedded_instruction_override")
        self.assertEqual(result.findings[0].severity, "notice")
        self.assertFalse(result.findings[0].citation.trusted)


class JsonStructuredImportTests(unittest.TestCase):
    def test_json_documents_use_path_citations(self) -> None:
        result = import_json(
            "file://items.json",
            '{"items":[{"name":"Alpha","qty":2}],"meta":{"source":"lab"}}',
        )
        by_path = {document.citation.range.path: document for document in result.documents}

        self.assertEqual(by_path["$.items[0].name"].content, '"Alpha"')
        self.assertEqual(by_path["$.items[0].qty"].content, "2")
        self.assertEqual(by_path["$.meta.source"].metadata["path"], "$.meta.source")
        self.assertEqual(by_path["$.meta.source"].metadata["value_type"], "string")

    def test_json_connector_delegates_to_importer(self) -> None:
        result = JSONStructuredConnector.parse("file://items.json", '{"name":"Alpha"}')

        self.assertEqual(result.documents[0].citation.range.path, "$.name")

    def test_json_output_is_deterministic_for_object_key_order(self) -> None:
        left = import_json("file://items.json", '{"z":1,"a":2}')
        right = import_json("file://items.json", '{"a":2,"z":1}')

        self.assertEqual(left, right)
        self.assertEqual(
            [document.citation.range.path for document in left.documents],
            ["$.a", "$.z"],
        )


class CsvStructuredImportTests(unittest.TestCase):
    def test_csv_rows_include_column_metadata_and_cell_citations(self) -> None:
        result = import_csv(
            "file://items.csv",
            "id,name,qty\nA1,Alpha,2\n",
            required_columns=("id", "name"),
        )

        self.assertEqual([column.name for column in result.columns], ["id", "name", "qty"])
        self.assertEqual([column.index for column in result.columns], [1, 2, 3])
        self.assertTrue(result.columns[0].required)
        self.assertEqual(len(result.documents), 1)
        row = result.documents[0]
        self.assertEqual(row.citation.range.row, 2)
        self.assertEqual(row.metadata["row"], 2)
        self.assertEqual(row.metadata["column_names"], ("id", "name", "qty"))
        self.assertEqual(
            row.metadata["cells"],
            (
                {
                    "column": "id",
                    "column_index": 1,
                    "value": "A1",
                    "citation": {"row": 2, "column": 1},
                    "source_uri": "file://items.csv",
                },
                {
                    "column": "name",
                    "column_index": 2,
                    "value": "Alpha",
                    "citation": {"row": 2, "column": 2},
                    "source_uri": "file://items.csv",
                },
                {
                    "column": "qty",
                    "column_index": 3,
                    "value": "2",
                    "citation": {"row": 2, "column": 3},
                    "source_uri": "file://items.csv",
                },
            ),
        )

    def test_csv_reports_duplicate_and_invalid_rows(self) -> None:
        result = import_csv(
            "file://items.csv",
            "id,name,qty\nA1,Alpha,2\nA1,Alpha,2\nB2,,3\nC3,Gamma\n",
            required_columns=("id", "name", "qty"),
            unique_columns=("id",),
        )
        errors_by_code = {error.code: error for error in result.validation_errors}
        required_empty_rows = [
            error.row
            for error in result.validation_errors
            if error.code == "csv_required_value_empty"
        ]

        self.assertEqual(len(result.documents), 4)
        self.assertIn("csv_duplicate_row", errors_by_code)
        self.assertIn("csv_duplicate_column_value", errors_by_code)
        self.assertIn("csv_required_value_empty", errors_by_code)
        self.assertIn("csv_row_width_mismatch", errors_by_code)
        self.assertEqual(errors_by_code["csv_duplicate_row"].row, 3)
        self.assertEqual(errors_by_code["csv_duplicate_column_value"].column, "id")
        self.assertEqual(required_empty_rows, [4, 5])
        self.assertEqual(errors_by_code["csv_row_width_mismatch"].row, 5)

    def test_csv_reports_duplicate_columns(self) -> None:
        result = import_csv("file://items.csv", "id,name,name\nA1,Alpha,Alt\n")

        self.assertEqual(result.columns[1].duplicate, True)
        self.assertEqual(result.columns[2].duplicate, True)
        self.assertEqual(result.validation_errors[0].code, "csv_duplicate_column")
        self.assertEqual(result.validation_errors[0].row, 1)

    def test_csv_connector_delegates_to_importer(self) -> None:
        result = CSVStructuredConnector.parse("file://items.csv", "id\nA1\n")

        self.assertEqual(result.documents[0].metadata["row"], 2)

    def test_csv_output_is_deterministic(self) -> None:
        left = import_csv("file://items.csv", "id,name\nA1,Alpha\nA2,Beta\n")
        right = import_csv("file://items.csv", "id,name\nA1,Alpha\nA2,Beta\n")

        self.assertEqual(left, right)
        self.assertEqual(
            [document.content for document in left.documents],
            [document.content for document in right.documents],
        )


if __name__ == "__main__":
    unittest.main()
