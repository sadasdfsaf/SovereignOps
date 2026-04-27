from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from io import StringIO
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from .citation import Citation, CitationRange, ColumnRef

_HEADING_RE = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$")
_JSON_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class ConnectorError(ValueError):
    pass


@dataclass(frozen=True)
class IngestChunk:
    source_uri: str
    content: str
    media_type: str
    citation: Citation
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CsvValidationError:
    message: str
    citation: Citation
    row: Optional[int] = None
    column: Optional[ColumnRef] = None


@dataclass(frozen=True)
class CsvParseResult:
    chunks: Tuple[IngestChunk, ...]
    validation_errors: Tuple[CsvValidationError, ...]
    columns: Tuple[str, ...]


def parse_markdown(source_uri: str, content: str, trusted: bool = False) -> Tuple[IngestChunk, ...]:
    lines = content.replace("\r\n", "\n").replace("\r", "\n").splitlines()
    if not lines:
        return ()

    chunks: List[IngestChunk] = []
    current_lines: List[str] = []
    current_start = 1
    current_heading: Optional[str] = None
    current_level: Optional[int] = None

    def flush(end_line: int) -> None:
        if not current_lines:
            return
        chunks.append(
            IngestChunk(
                source_uri=source_uri,
                content="\n".join(current_lines),
                media_type="text/markdown",
                citation=Citation(
                    source_uri=source_uri,
                    range=CitationRange.lines(current_start, end_line),
                    trusted=trusted,
                ),
                metadata={
                    "format": "markdown",
                    "heading": current_heading,
                    "heading_level": current_level,
                },
            )
        )

    for line_number, line in enumerate(lines, start=1):
        heading = _parse_heading(line)
        if heading is not None and current_lines:
            flush(line_number - 1)
            current_lines = []
            current_start = line_number

        if heading is not None:
            current_level, current_heading = heading
        current_lines.append(line)

    flush(len(lines))
    return tuple(chunks)


def parse_json(source_uri: str, content: str, trusted: bool = False) -> Tuple[IngestChunk, ...]:
    try:
        value = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ConnectorError(f"invalid JSON at line {exc.lineno}, column {exc.colno}") from exc

    chunks: List[IngestChunk] = []

    def emit(path: str, node: Any) -> None:
        chunks.append(
            IngestChunk(
                source_uri=source_uri,
                content=_json_content(node),
                media_type="application/json",
                citation=Citation(
                    source_uri=source_uri,
                    range=CitationRange.json_path(path),
                    trusted=trusted,
                ),
                metadata={
                    "format": "json",
                    "path": path,
                    "value_type": type(node).__name__,
                },
            )
        )

    def walk(path: str, node: Any) -> None:
        if isinstance(node, dict):
            if not node:
                emit(path, node)
                return
            for key, value in node.items():
                walk(_join_json_path(path, str(key)), value)
            return

        if isinstance(node, list):
            if not node:
                emit(path, node)
                return
            for index, value in enumerate(node):
                walk(f"{path}[{index}]", value)
            return

        emit(path, node)

    walk("$", value)
    return tuple(chunks)


def parse_csv(
    source_uri: str,
    content: str,
    trusted: bool = False,
    required_columns: Optional[Iterable[str]] = None,
) -> CsvParseResult:
    errors: List[CsvValidationError] = []
    required = tuple(required_columns or ())
    try:
        rows = list(csv.reader(StringIO(content), strict=True))
    except csv.Error as exc:
        error = _csv_error(source_uri, str(exc), trusted=trusted)
        return CsvParseResult(chunks=(), validation_errors=(error,), columns=())

    if not rows:
        error = _csv_error(source_uri, "CSV input is empty", trusted=trusted)
        return CsvParseResult(chunks=(), validation_errors=(error,), columns=())

    columns = tuple(rows[0])
    errors.extend(_validate_columns(source_uri, columns, trusted, required))

    chunks: List[IngestChunk] = []
    for row_number, row in enumerate(rows[1:], start=2):
        if len(row) != len(columns):
            errors.append(
                _csv_error(
                    source_uri,
                    f"row has {len(row)} cells; expected {len(columns)}",
                    trusted=trusted,
                    row=row_number,
                )
            )

        values = _row_values(columns, row)
        for column_index, column in enumerate(columns):
            if column not in required or column_index >= len(row):
                continue
            if not values[column].strip():
                errors.append(
                    _csv_error(
                        source_uri,
                        f"required column {column!r} is empty",
                        trusted=trusted,
                        row=row_number,
                        column=column,
                    )
                )

        chunks.append(
            IngestChunk(
                source_uri=source_uri,
                content=json.dumps(values, ensure_ascii=False, sort_keys=True),
                media_type="text/csv",
                citation=Citation(
                    source_uri=source_uri,
                    range=CitationRange(row=row_number),
                    trusted=trusted,
                ),
                metadata={
                    "format": "csv",
                    "row": row_number,
                    "columns": columns,
                    "cells": tuple(
                        {"column": column, "value": values.get(column, "")}
                        for column in columns
                    ),
                    "extra_values": tuple(row[len(columns) :]),
                },
            )
        )

    return CsvParseResult(
        chunks=tuple(chunks),
        validation_errors=tuple(errors),
        columns=columns,
    )


class MarkdownConnector:
    media_type = "text/markdown"

    @staticmethod
    def parse(source_uri: str, content: str, trusted: bool = False) -> Tuple[IngestChunk, ...]:
        return parse_markdown(source_uri, content, trusted=trusted)


class JSONConnector:
    media_type = "application/json"

    @staticmethod
    def parse(source_uri: str, content: str, trusted: bool = False) -> Tuple[IngestChunk, ...]:
        return parse_json(source_uri, content, trusted=trusted)


class CSVConnector:
    media_type = "text/csv"

    @staticmethod
    def parse(
        source_uri: str,
        content: str,
        trusted: bool = False,
        required_columns: Optional[Iterable[str]] = None,
    ) -> CsvParseResult:
        return parse_csv(
            source_uri,
            content,
            trusted=trusted,
            required_columns=required_columns,
        )


JsonConnector = JSONConnector
CsvConnector = CSVConnector


def _parse_heading(line: str) -> Optional[Tuple[int, str]]:
    match = _HEADING_RE.match(line)
    if match is None:
        return None
    return len(match.group(1)), match.group(2).strip()


def _join_json_path(parent: str, key: str) -> str:
    if _JSON_NAME_RE.match(key):
        return f"{parent}.{key}"
    return f"{parent}[{json.dumps(key, ensure_ascii=False)}]"


def _json_content(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _validate_columns(
    source_uri: str,
    columns: Sequence[str],
    trusted: bool,
    required_columns: Optional[Iterable[str]],
) -> List[CsvValidationError]:
    errors: List[CsvValidationError] = []
    if not columns:
        errors.append(
            _csv_error(
                source_uri,
                "CSV header is empty",
                trusted=trusted,
                row=1,
            )
        )
    seen: Dict[str, int] = {}
    for index, column in enumerate(columns, start=1):
        if not column:
            errors.append(
                _csv_error(
                    source_uri,
                    "column name is empty",
                    trusted=trusted,
                    row=1,
                    column=index,
                )
            )
        if column in seen:
            errors.append(
                _csv_error(
                    source_uri,
                    f"duplicate column {column!r}",
                    trusted=trusted,
                    row=1,
                    column=column,
                )
            )
        seen[column] = index

    for column in required_columns or ():
        if column not in seen:
            errors.append(
                _csv_error(
                    source_uri,
                    f"required column {column!r} is missing",
                    trusted=trusted,
                    row=1,
                    column=column,
                )
            )

    return errors


def _row_values(columns: Sequence[str], row: Sequence[str]) -> Dict[str, str]:
    values: Dict[str, str] = {}
    for index, column in enumerate(columns):
        values[column] = row[index] if index < len(row) else ""
    return values


def _csv_error(
    source_uri: str,
    message: str,
    trusted: bool,
    row: Optional[int] = None,
    column: Optional[ColumnRef] = None,
) -> CsvValidationError:
    return CsvValidationError(
        message=message,
        row=row,
        column=column,
        citation=Citation(
            source_uri=source_uri,
            range=CitationRange(row=row, column=column),
            trusted=trusted,
        ),
    )
