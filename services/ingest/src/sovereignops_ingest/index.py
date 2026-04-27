from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from types import MappingProxyType
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple, Union

from .citation import Citation

_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


@dataclass(frozen=True)
class IndexDocument:
    source_uri: str
    content: str
    media_type: str
    citation: Citation
    checksum: str
    tags: Sequence[str] = ()
    metadata: Mapping[str, Any] = field(default_factory=dict)
    updated_at: Optional[datetime] = None

    def __post_init__(self) -> None:
        if not self.source_uri:
            raise ValueError("source_uri is required")
        if not self.media_type:
            raise ValueError("media_type is required")
        if not self.checksum:
            raise ValueError("checksum is required")
        if not isinstance(self.content, str):
            raise ValueError("content must be text")
        object.__setattr__(self, "tags", _normalized_values(self.tags, "tags"))
        object.__setattr__(self, "metadata", MappingProxyType(dict(self.metadata)))


@dataclass(frozen=True)
class SearchQuery:
    text: str
    tags: Sequence[str] = ()
    media_types: Sequence[str] = ()
    source_uris: Sequence[str] = ()
    limit: int = 10

    def __post_init__(self) -> None:
        if not isinstance(self.text, str):
            raise ValueError("text must be a string")
        if self.limit < 1:
            raise ValueError("limit must be positive")
        object.__setattr__(self, "tags", _normalized_values(self.tags, "tags"))
        object.__setattr__(
            self,
            "media_types",
            _normalized_values(self.media_types, "media_types", lowercase=False),
        )
        object.__setattr__(
            self,
            "source_uris",
            _normalized_values(self.source_uris, "source_uris", lowercase=False),
        )


@dataclass(frozen=True)
class SearchResult:
    document: IndexDocument
    score: int
    matched_terms: Tuple[str, ...]
    snippet: str
    citation: Citation

    @property
    def source_uri(self) -> str:
        return self.document.source_uri


@dataclass(frozen=True)
class IndexAddResult:
    checksum: str
    source_uri: str
    is_duplicate: bool
    duplicate_of: Optional[str] = None


class SearchIndex:
    def __init__(self) -> None:
        self._documents_by_source: Dict[str, IndexDocument] = {}
        self._source_by_checksum: Dict[str, str] = {}
        self._term_frequencies_by_source: Dict[str, Mapping[str, int]] = {}
        self._order_by_source: Dict[str, int] = {}
        self._next_order = 0

    @property
    def document_count(self) -> int:
        return len(self._documents_by_source)

    @property
    def documents(self) -> Tuple[IndexDocument, ...]:
        return tuple(
            self._documents_by_source[source_uri]
            for source_uri in sorted(self._documents_by_source)
        )

    def add_document(self, document: IndexDocument) -> IndexAddResult:
        duplicate_of = self._source_by_checksum.get(document.checksum)
        if duplicate_of is not None:
            return IndexAddResult(
                checksum=document.checksum,
                source_uri=document.source_uri,
                is_duplicate=True,
                duplicate_of=duplicate_of,
            )

        if document.source_uri in self._documents_by_source:
            self._remove_source(document.source_uri)

        self._documents_by_source[document.source_uri] = document
        self._source_by_checksum[document.checksum] = document.source_uri
        self._term_frequencies_by_source[document.source_uri] = MappingProxyType(
            _term_frequencies(document.content)
        )
        self._order_by_source[document.source_uri] = self._next_order
        self._next_order += 1
        return IndexAddResult(
            checksum=document.checksum,
            source_uri=document.source_uri,
            is_duplicate=False,
        )

    def add_documents(self, documents: Iterable[IndexDocument]) -> Tuple[IndexAddResult, ...]:
        return tuple(self.add_document(document) for document in documents)

    def term_frequencies(self, source_uri: str) -> Mapping[str, int]:
        return self._term_frequencies_by_source.get(source_uri, MappingProxyType({}))

    def search(
        self,
        query: Union[str, SearchQuery],
        *,
        tags: Sequence[str] = (),
        media_types: Sequence[str] = (),
        source_uris: Sequence[str] = (),
        limit: Optional[int] = None,
    ) -> Tuple[SearchResult, ...]:
        search_query = _coerce_query(
            query,
            tags=tags,
            media_types=media_types,
            source_uris=source_uris,
            limit=limit,
        )
        query_terms = _tokenize(search_query.text)
        if not query_terms:
            return ()

        query_frequencies = _frequencies(query_terms)
        unique_query_terms = tuple(sorted(query_frequencies))
        results: List[SearchResult] = []
        tag_filter = set(search_query.tags)
        media_filter = set(search_query.media_types)
        source_filter = set(search_query.source_uris)

        for document in self._documents_by_source.values():
            if tag_filter and not tag_filter.issubset(document.tags):
                continue
            if media_filter and document.media_type not in media_filter:
                continue
            if source_filter and document.source_uri not in source_filter:
                continue

            term_frequencies = self._term_frequencies_by_source[document.source_uri]
            matched_terms = tuple(
                term for term in unique_query_terms if term_frequencies.get(term, 0) > 0
            )
            if not matched_terms:
                continue

            score = sum(
                term_frequencies.get(term, 0) * query_count
                for term, query_count in query_frequencies.items()
            )
            results.append(
                SearchResult(
                    document=document,
                    score=score,
                    matched_terms=matched_terms,
                    snippet=_make_snippet(document.content, matched_terms),
                    citation=document.citation,
                )
            )

        results.sort(
            key=lambda result: (
                -result.score,
                -len(result.matched_terms),
                result.document.source_uri,
                result.document.checksum,
                self._order_by_source[result.document.source_uri],
            )
        )
        return tuple(results[: search_query.limit])

    def _remove_source(self, source_uri: str) -> None:
        old = self._documents_by_source.pop(source_uri)
        self._source_by_checksum.pop(old.checksum, None)
        self._term_frequencies_by_source.pop(source_uri, None)
        self._order_by_source.pop(source_uri, None)


def _coerce_query(
    query: Union[str, SearchQuery],
    *,
    tags: Sequence[str],
    media_types: Sequence[str],
    source_uris: Sequence[str],
    limit: Optional[int],
) -> SearchQuery:
    if isinstance(query, SearchQuery):
        if tags != () or media_types != () or source_uris != () or limit is not None:
            return SearchQuery(
                text=query.text,
                tags=tuple(query.tags) + _normalized_values(tags, "tags"),
                media_types=tuple(query.media_types)
                + _normalized_values(media_types, "media_types", lowercase=False),
                source_uris=tuple(query.source_uris)
                + _normalized_values(source_uris, "source_uris", lowercase=False),
                limit=limit if limit is not None else query.limit,
            )
        return query
    if isinstance(query, str):
        return SearchQuery(
            text=query,
            tags=tags,
            media_types=media_types,
            source_uris=source_uris,
            limit=limit if limit is not None else 10,
        )
    raise TypeError("query must be a string or SearchQuery")


def _term_frequencies(text: str) -> Dict[str, int]:
    return _frequencies(_tokenize(text))


def _frequencies(tokens: Iterable[str]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for token in tokens:
        counts[token] = counts.get(token, 0) + 1
    return counts


def _tokenize(text: str) -> Tuple[str, ...]:
    return tuple(token for token, _start, _end in _token_spans(text))


def _make_snippet(content: str, matched_terms: Sequence[str], max_length: int = 160) -> str:
    if not content:
        return ""

    matched = set(matched_terms)
    first_match = min(
        (start for token, start, _end in _token_spans(content) if token in matched),
        default=0,
    )
    start = max(0, first_match - max_length // 3)
    end = min(len(content), start + max_length)
    start = _advance_to_word_boundary(content, start)
    end = _retreat_to_word_boundary(content, end)

    if start >= end:
        start = max(0, first_match)
        end = min(len(content), start + max_length)

    snippet = " ".join(content[start:end].split())
    if start > 0:
        snippet = "... " + snippet
    if end < len(content):
        snippet = snippet + " ..."
    return snippet


def _token_spans(text: str) -> Tuple[Tuple[str, int, int], ...]:
    return tuple(
        (match.group(0).lower(), match.start(), match.end())
        for match in _TOKEN_RE.finditer(text)
    )


def _advance_to_word_boundary(text: str, position: int) -> int:
    if position <= 0:
        return 0
    while position < len(text) and text[position - 1].isalnum():
        position += 1
    while position < len(text) and text[position].isspace():
        position += 1
    return position


def _retreat_to_word_boundary(text: str, position: int) -> int:
    if position >= len(text):
        return len(text)
    while position > 0 and text[position - 1].isalnum():
        position -= 1
    while position > 0 and text[position - 1].isspace():
        position -= 1
    return position


def _normalized_values(
    values: Sequence[str],
    field_name: str,
    *,
    lowercase: bool = True,
) -> Tuple[str, ...]:
    if values is None:
        return ()
    if isinstance(values, str):
        raw_values = (values,)
    else:
        raw_values = tuple(values)

    normalized: List[str] = []
    for value in raw_values:
        if not isinstance(value, str):
            raise ValueError(f"{field_name} values must be strings")
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError(f"{field_name} values must not be empty")
        if lowercase:
            normalized_value = normalized_value.lower()
        normalized.append(normalized_value)
    return tuple(sorted(set(normalized)))
