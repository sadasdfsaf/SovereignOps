from __future__ import annotations

import unittest
from dataclasses import FrozenInstanceError
from datetime import datetime, timezone

from services.ingest.src.sovereignops_ingest.checksum import checksum_text
from services.ingest.src.sovereignops_ingest.citation import Citation, CitationRange
from services.ingest.src.sovereignops_ingest.index import (
    IndexDocument,
    SearchIndex,
    SearchQuery,
)


def _document(
    source_uri: str,
    content: str,
    *,
    media_type: str = "text/plain",
    tags: tuple[str, ...] = (),
    line: int = 1,
) -> IndexDocument:
    return IndexDocument(
        source_uri=source_uri,
        content=content,
        media_type=media_type,
        citation=Citation(source_uri=source_uri, range=CitationRange.lines(line)),
        checksum=checksum_text(content),
        tags=tags,
        metadata={"length": len(content)},
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


class SearchIndexRankingTests(unittest.TestCase):
    def test_keyword_search_ranks_by_score_then_source_uri(self) -> None:
        index = SearchIndex()
        index.add_documents(
            (
                _document("file://b.txt", "alpha beta basil"),
                _document("file://c.txt", "alpha beta beta"),
                _document("file://a.txt", "alpha beta carrot"),
            )
        )

        results = index.search("alpha beta")

        self.assertEqual(
            [result.source_uri for result in results],
            ["file://c.txt", "file://a.txt", "file://b.txt"],
        )
        self.assertEqual([result.score for result in results], [3, 2, 2])
        self.assertEqual(results[0].matched_terms, ("alpha", "beta"))

    def test_index_types_are_frozen(self) -> None:
        result = SearchQuery("alpha")

        with self.assertRaises(FrozenInstanceError):
            result.text = "beta"  # type: ignore[misc]


class SearchIndexFilterTests(unittest.TestCase):
    def test_search_supports_tag_media_and_source_filters(self) -> None:
        index = SearchIndex()
        index.add_documents(
            (
                _document(
                    "file://fruit.md",
                    "apple tart with cinnamon",
                    media_type="text/markdown",
                    tags=("dessert", "fruit"),
                ),
                _document(
                    "file://tea.txt",
                    "apple tea pairing",
                    media_type="text/plain",
                    tags=("drink",),
                ),
                _document(
                    "file://notes.md",
                    "apple harvest notes",
                    media_type="text/markdown",
                    tags=("fruit", "notes"),
                ),
            )
        )

        tag_results = index.search("apple", tags=("fruit",))
        media_results = index.search("apple", media_types=("text/plain",))
        source_results = index.search(
            SearchQuery("apple", source_uris=("file://notes.md",))
        )

        self.assertEqual(
            [result.source_uri for result in tag_results],
            ["file://fruit.md", "file://notes.md"],
        )
        self.assertEqual([result.source_uri for result in media_results], ["file://tea.txt"])
        self.assertEqual(
            [result.source_uri for result in source_results],
            ["file://notes.md"],
        )


class SearchIndexSnippetTests(unittest.TestCase):
    def test_snippet_keeps_document_citation(self) -> None:
        citation = Citation(
            source_uri="file://orchard.md",
            range=CitationRange.lines(7, 9),
            trusted=True,
        )
        document = IndexDocument(
            source_uri="file://orchard.md",
            content=(
                "Opening notes. Orchard pears are crisp and bright near the end "
                "of the morning list."
            ),
            media_type="text/markdown",
            citation=citation,
            checksum=checksum_text("orchard-snippet"),
            tags=("fruit",),
        )
        index = SearchIndex()
        index.add_document(document)

        result = index.search("pears crisp")[0]

        self.assertIn("Orchard pears are crisp", result.snippet)
        self.assertIs(result.citation, citation)
        self.assertEqual(result.citation.range.start_line, 7)
        self.assertTrue(result.citation.trusted)


class SearchIndexDuplicateTests(unittest.TestCase):
    def test_duplicate_checksum_keeps_first_document(self) -> None:
        index = SearchIndex()
        first = _document("file://first.txt", "shared alpha content")
        duplicate = IndexDocument(
            source_uri="file://duplicate.txt",
            content="shared alpha content",
            media_type="text/plain",
            citation=Citation(
                source_uri="file://duplicate.txt",
                range=CitationRange.lines(3),
            ),
            checksum=first.checksum,
            tags=("copy",),
        )

        first_add = index.add_document(first)
        duplicate_add = index.add_document(duplicate)

        self.assertFalse(first_add.is_duplicate)
        self.assertTrue(duplicate_add.is_duplicate)
        self.assertEqual(duplicate_add.duplicate_of, "file://first.txt")
        self.assertEqual(index.document_count, 1)
        self.assertEqual(
            [result.source_uri for result in index.search("alpha")],
            ["file://first.txt"],
        )


class SearchIndexQueryValidationTests(unittest.TestCase):
    def test_empty_or_tokenless_queries_return_no_results(self) -> None:
        index = SearchIndex()
        index.add_document(_document("file://alpha.txt", "alpha beta"))

        self.assertEqual(index.search(""), ())
        self.assertEqual(index.search("!!!"), ())

    def test_invalid_query_values_raise(self) -> None:
        with self.assertRaises(ValueError):
            SearchQuery("alpha", limit=0)

        with self.assertRaises(ValueError):
            SearchQuery("alpha", tags=("",))

        with self.assertRaises(ValueError):
            SearchIndex().search(SearchQuery("alpha"), tags="")

        with self.assertRaises(TypeError):
            SearchIndex().search(None)  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
