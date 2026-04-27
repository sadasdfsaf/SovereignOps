"""SovereignOps ingest helpers."""

from .checksum import (
    ChecksumIndex,
    DeduplicationResult,
    checksum_bytes,
    checksum_text,
    deduplicate_texts,
    duplicate_checksums,
)
from .citation import Citation, CitationRange
from .connectors import (
    CSVConnector,
    ConnectorError,
    CsvParseResult,
    CsvValidationError,
    IngestChunk,
    JSONConnector,
    MarkdownConnector,
    parse_csv,
    parse_json,
    parse_markdown,
)
from .pipeline import IngestItem, IngestResult, normalize_item

__all__ = [
    "CSVConnector",
    "ChecksumIndex",
    "Citation",
    "CitationRange",
    "ConnectorError",
    "CsvParseResult",
    "CsvValidationError",
    "DeduplicationResult",
    "IngestChunk",
    "IngestItem",
    "IngestResult",
    "JSONConnector",
    "MarkdownConnector",
    "checksum_bytes",
    "checksum_text",
    "deduplicate_texts",
    "duplicate_checksums",
    "normalize_item",
    "parse_csv",
    "parse_json",
    "parse_markdown",
]
