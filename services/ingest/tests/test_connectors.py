from __future__ import annotations

import unittest

from services.ingest.src.sovereignops_ingest.checksum import (
    ChecksumIndex,
    checksum_text,
    deduplicate_texts,
)
from services.ingest.src.sovereignops_ingest.citation import Citation, CitationRange
from services.ingest.src.sovereignops_ingest.connectors import (
    CSVConnector,
    JSONConnector,
    MarkdownConnector,
    parse_csv,
    parse_json,
    parse_markdown,
)


class CitationTests(unittest.TestCase):
    def test_citation_tracks_source_range_and_trust(self) -> None:
        citation = Citation(
            source_uri="file://notes.md",
            range=CitationRange.lines(2, 4),
            trusted=True,
        )

        self.assertEqual(citation.source_uri, "file://notes.md")
        self.assertEqual(citation.range.as_dict(), {"start_line": 2, "end_line": 4})
        self.assertTrue(citation.trusted)
        self.assertFalse(citation.untrusted)


class MarkdownConnectorTests(unittest.TestCase):
    def test_markdown_chunks_keep_heading_and_line_citation(self) -> None:
        chunks = parse_markdown("file://guide.md", "# Alpha\nIntro\n## Beta\nMore\n")

        self.assertEqual(len(chunks), 2)
        self.assertEqual(chunks[0].content, "# Alpha\nIntro")
        self.assertEqual(chunks[0].metadata["heading"], "Alpha")
        self.assertEqual(chunks[0].citation.range.start_line, 1)
        self.assertEqual(chunks[0].citation.range.end_line, 2)
        self.assertEqual(chunks[1].content, "## Beta\nMore")
        self.assertEqual(chunks[1].metadata["heading_level"], 2)
        self.assertEqual(chunks[1].citation.range.start_line, 3)

    def test_markdown_connector_class_delegates_to_parser(self) -> None:
        chunks = MarkdownConnector.parse("file://guide.md", "# Alpha\n")

        self.assertEqual(chunks[0].metadata["heading"], "Alpha")


class JSONConnectorTests(unittest.TestCase):
    def test_json_chunks_use_path_citations(self) -> None:
        chunks = parse_json(
            "file://items.json",
            '{"team":{"name":"Search"},"items":[{"sku":"A1","count":2}]}',
        )
        by_path = {chunk.citation.range.path: chunk for chunk in chunks}

        self.assertEqual(by_path["$.team.name"].content, "Search")
        self.assertEqual(by_path["$.items[0].sku"].metadata["path"], "$.items[0].sku")
        self.assertEqual(by_path["$.items[0].count"].content, "2")

    def test_json_connector_class_delegates_to_parser(self) -> None:
        chunks = JSONConnector.parse("file://items.json", '{"name":"Alpha"}')

        self.assertEqual(chunks[0].citation.range.path, "$.name")


class CSVConnectorTests(unittest.TestCase):
    def test_csv_returns_row_column_metadata_and_validation_errors(self) -> None:
        result = parse_csv(
            "file://items.csv",
            "name,count\nAlpha,2\nBeta\n,4\n",
            required_columns=("name", "count"),
        )

        self.assertEqual(result.columns, ("name", "count"))
        self.assertEqual(result.chunks[0].metadata["row"], 2)
        self.assertEqual(result.chunks[0].metadata["columns"], ("name", "count"))
        self.assertEqual(
            result.chunks[0].metadata["cells"],
            (
                {"column": "name", "value": "Alpha"},
                {"column": "count", "value": "2"},
            ),
        )
        self.assertEqual(result.chunks[0].citation.range.row, 2)
        self.assertEqual(len(result.validation_errors), 2)
        self.assertEqual(result.validation_errors[0].row, 3)
        self.assertEqual(result.validation_errors[1].column, "name")

    def test_csv_connector_class_delegates_to_parser(self) -> None:
        result = CSVConnector.parse("file://items.csv", "name\nAlpha\n")

        self.assertEqual(result.chunks[0].metadata["row"], 2)


class ChecksumTests(unittest.TestCase):
    def test_checksum_index_detects_duplicates(self) -> None:
        index = ChecksumIndex()
        first = index.add_text("same", source_uri="file://a.txt")
        second = index.add_text("same", source_uri="file://b.txt")

        self.assertFalse(first.is_duplicate)
        self.assertTrue(second.is_duplicate)
        self.assertEqual(second.duplicate_of, "file://a.txt")
        self.assertEqual(checksum_text("same"), first.checksum)

    def test_deduplicate_texts_keeps_first_seen(self) -> None:
        self.assertEqual(deduplicate_texts(["a", "b", "a", "c"]), ["a", "b", "c"])


if __name__ == "__main__":
    unittest.main()
