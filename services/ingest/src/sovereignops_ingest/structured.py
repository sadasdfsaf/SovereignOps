from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from io import StringIO
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from .citation import Citation, CitationRange, ColumnRef

_MARKDOWN_HEADING_RE = re.compile(r"^[ \t]{0,3}(#{1,6})(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*)?$")
_JSON_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_LOCAL_SAFETY_PATTERNS: Tuple[Tuple[str, re.Pattern[str]], ...] = (
    (
        "embedded_instruction_override",
        re.compile(
            r"\b(?:ignore|disregard)\s+(?:all\s+)?"
            r"(?:previous|prior|earlier)\s+instructions\b",
            re.I,
        ),
    ),
    (
        "embedded_prompt_reference",
        re.compile(r"\b(?:system|developer)\s+prompt\b", re.I),
    ),
)


class StructuredImportError(ValueError):
    pass


@dataclass(frozen=True)
class LocalDataSafetyFinding:
    code: str
    message: str
    citation: Citation
    severity: str = "notice"

    def as_dict(self) -> Dict[str, object]:
        return {
            "code": self.code,
            "message": self.message,
            "severity": self.severity,
            "citation": self.citation.as_dict(),
        }


@dataclass(frozen=True)
class StructuredDocument:
    source_uri: str
    content: str
    media_type: str
    citation: Citation
    metadata: Mapping[str, Any] = field(default_factory=dict)
    findings: Tuple[LocalDataSafetyFinding, ...] = ()

    @property
    def untrusted(self) -> bool:
        return self.citation.untrusted


@dataclass(frozen=True)
class CsvColumn:
    name: str
    index: int
    citation: Citation
    required: bool = False
    duplicate: bool = False

    def as_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "index": self.index,
            "required": self.required,
            "duplicate": self.duplicate,
            "citation": self.citation.as_dict(),
        }


@dataclass(frozen=True)
class StructuredValidationError:
    code: str
    message: str
    citation: Citation
    row: Optional[int] = None
    column: Optional[ColumnRef] = None
    path: Optional[str] = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, object]:
        data: Dict[str, object] = {
            "code": self.code,
            "message": self.message,
            "citation": self.citation.as_dict(),
        }
        if self.row is not None:
            data["row"] = self.row
        if self.column is not None:
            data["column"] = self.column
        if self.path is not None:
            data["path"] = self.path
        if self.metadata:
            data["metadata"] = dict(self.metadata)
        return data


@dataclass(frozen=True)
class StructuredImportResult:
    documents: Tuple[StructuredDocument, ...]
    validation_errors: Tuple[StructuredValidationError, ...] = ()
    columns: Tuple[CsvColumn, ...] = ()
    findings: Tuple[LocalDataSafetyFinding, ...] = ()


def import_markdown(source_uri: str, content: str, trusted: bool = False) -> StructuredImportResult:
    lines = _split_lines(content)
    if not lines:
        return StructuredImportResult(documents=())

    documents: List[StructuredDocument] = []
    current_lines: List[str] = []
    current_start = 1
    current_heading: Optional[Tuple[int, str, int]] = None
    current_stack: Tuple[Mapping[str, object], ...] = ()
    heading_stack: List[Tuple[int, str, int]] = []

    def flush(end_line: int) -> None:
        if not current_lines:
            return
        citation = Citation(
            source_uri=source_uri,
            range=CitationRange.lines(current_start, end_line),
            trusted=trusted,
        )
        document_content = "\n".join(current_lines)
        findings = _local_data_safety_findings(source_uri, document_content, citation, trusted)
        documents.append(
            StructuredDocument(
                source_uri=source_uri,
                content=document_content,
                media_type="text/markdown",
                citation=citation,
                metadata={
                    "format": "markdown",
                    "heading": current_heading[1] if current_heading else None,
                    "heading_level": current_heading[0] if current_heading else None,
                    "heading_line": current_heading[2] if current_heading else None,
                    "headings": current_stack,
                    "line_count": end_line - current_start + 1,
                },
                findings=findings,
            )
        )

    for line_number, line in enumerate(lines, start=1):
        heading = _parse_markdown_heading(line)
        if heading is not None:
            if current_lines:
                flush(line_number - 1)
                current_lines = []
                current_start = line_number

            level, text = heading
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            heading_stack.append((level, text, line_number))
            current_heading = (level, text, line_number)
            current_stack = tuple(
                {"level": item_level, "text": item_text, "line": item_line}
                for item_level, item_text, item_line in heading_stack
            )

        current_lines.append(line)

    flush(len(lines))
    return _structured_result(documents)


def import_json(source_uri: str, content: str, trusted: bool = False) -> StructuredImportResult:
    try:
        value = json.loads(content)
    except json.JSONDecodeError as exc:
        message = f"invalid JSON at line {exc.lineno}, column {exc.colno}"
        raise StructuredImportError(message) from exc

    documents: List[StructuredDocument] = []

    def emit(path: str, node: Any) -> None:
        citation = Citation(
            source_uri=source_uri,
            range=CitationRange.json_path(path),
            trusted=trusted,
        )
        document_content = _canonical_json(node)
        findings = _local_data_safety_findings(source_uri, document_content, citation, trusted)
        documents.append(
            StructuredDocument(
                source_uri=source_uri,
                content=document_content,
                media_type="application/json",
                citation=citation,
                metadata={
                    "format": "json",
                    "path": path,
                    "value_type": _json_value_type(node),
                },
                findings=findings,
            )
        )

    def walk(path: str, node: Any) -> None:
        if isinstance(node, dict):
            if not node:
                emit(path, node)
                return
            for key in sorted(node):
                walk(_join_json_path(path, str(key)), node[key])
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
    return _structured_result(documents)


def import_csv(
    source_uri: str,
    content: str,
    trusted: bool = False,
    required_columns: Optional[Iterable[str]] = None,
    unique_columns: Optional[Iterable[str]] = None,
) -> StructuredImportResult:
    required = _ordered_unique(required_columns or ())
    unique = _ordered_unique(unique_columns or ())
    try:
        rows = list(csv.reader(StringIO(content), strict=True))
    except csv.Error as exc:
        return StructuredImportResult(
            documents=(),
            validation_errors=(
                _validation_error(source_uri, "csv_parse_error", str(exc), trusted),
            ),
        )

    if not rows:
        return StructuredImportResult(
            documents=(),
            validation_errors=(
                _validation_error(source_uri, "csv_empty", "CSV input is empty", trusted),
            ),
        )

    header = tuple(rows[0])
    columns = _csv_columns(source_uri, header, trusted, required)
    errors = _validate_csv_header(source_uri, header, columns, trusted, required, unique)
    documents: List[StructuredDocument] = []
    row_signatures: Dict[Tuple[str, ...], int] = {}
    unique_values: Dict[Tuple[str, str], int] = {}

    for row_number, row in enumerate(rows[1:], start=2):
        row_tuple = tuple(row)
        row_errors = _validate_csv_row_shape(source_uri, row_tuple, header, row_number, trusted)
        errors.extend(row_errors)

        cells = _csv_cells(source_uri, header, row_tuple, row_number)
        values = tuple((cell["column"], cell["value"]) for cell in cells)
        normalized = _csv_document_content(row_number, cells, row_tuple[len(header) :])
        citation = Citation(
            source_uri=source_uri,
            range=CitationRange(row=row_number),
            trusted=trusted,
        )

        signature = tuple(cell["value"] for cell in cells) + tuple(row_tuple[len(header) :])
        first_seen = row_signatures.get(signature)
        if first_seen is not None:
            errors.append(
                _validation_error(
                    source_uri,
                    "csv_duplicate_row",
                    f"row duplicates row {first_seen}",
                    trusted,
                    row=row_number,
                    metadata={"duplicate_of": first_seen},
                )
            )
        else:
            row_signatures[signature] = row_number

        for column in required:
            value = _cell_value(header, row_tuple, column)
            if value is None or not value.strip():
                errors.append(
                    _validation_error(
                        source_uri,
                        "csv_required_value_empty",
                        f"required column {column!r} is empty",
                        trusted,
                        row=row_number,
                        column=column,
                    )
                )

        for column in unique:
            value = _cell_value(header, row_tuple, column)
            if value is None or value == "":
                continue
            key = (column, value)
            first_unique = unique_values.get(key)
            if first_unique is not None:
                errors.append(
                    _validation_error(
                        source_uri,
                        "csv_duplicate_column_value",
                        f"column {column!r} duplicates row {first_unique}",
                        trusted,
                        row=row_number,
                        column=column,
                        metadata={"duplicate_of": first_unique, "value": value},
                    )
                )
            else:
                unique_values[key] = row_number

        findings = _local_data_safety_findings(source_uri, normalized, citation, trusted)
        documents.append(
            StructuredDocument(
                source_uri=source_uri,
                content=normalized,
                media_type="text/csv",
                citation=citation,
                metadata={
                    "format": "csv",
                    "row": row_number,
                    "columns": tuple(column.as_dict() for column in columns),
                    "column_names": header,
                    "cells": cells,
                    "values": values,
                    "extra_values": tuple(row_tuple[len(header) :]),
                },
                findings=findings,
            )
        )

    result = _structured_result(documents)
    return StructuredImportResult(
        documents=result.documents,
        validation_errors=tuple(errors),
        columns=columns,
        findings=result.findings,
    )


class MarkdownStructuredConnector:
    media_type = "text/markdown"

    @staticmethod
    def parse(source_uri: str, content: str, trusted: bool = False) -> StructuredImportResult:
        return import_markdown(source_uri, content, trusted=trusted)


class JSONStructuredConnector:
    media_type = "application/json"

    @staticmethod
    def parse(source_uri: str, content: str, trusted: bool = False) -> StructuredImportResult:
        return import_json(source_uri, content, trusted=trusted)


class CSVStructuredConnector:
    media_type = "text/csv"

    @staticmethod
    def parse(
        source_uri: str,
        content: str,
        trusted: bool = False,
        required_columns: Optional[Iterable[str]] = None,
        unique_columns: Optional[Iterable[str]] = None,
    ) -> StructuredImportResult:
        return import_csv(
            source_uri,
            content,
            trusted=trusted,
            required_columns=required_columns,
            unique_columns=unique_columns,
        )


JsonStructuredConnector = JSONStructuredConnector
CsvStructuredConnector = CSVStructuredConnector


def _split_lines(content: str) -> List[str]:
    return content.replace("\r\n", "\n").replace("\r", "\n").splitlines()


def _parse_markdown_heading(line: str) -> Optional[Tuple[int, str]]:
    match = _MARKDOWN_HEADING_RE.match(line)
    if match is None:
        return None
    return len(match.group(1)), match.group(2).strip()


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _json_value_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, list):
        return "array"
    if isinstance(value, (int, float)):
        return "number"
    return "string"


def _join_json_path(parent: str, key: str) -> str:
    if _JSON_NAME_RE.match(key):
        return f"{parent}.{key}"
    return f"{parent}[{json.dumps(key, ensure_ascii=False)}]"


def _csv_columns(
    source_uri: str,
    header: Sequence[str],
    trusted: bool,
    required_columns: Sequence[str],
) -> Tuple[CsvColumn, ...]:
    counts: Dict[str, int] = {}
    for column in header:
        counts[column] = counts.get(column, 0) + 1

    return tuple(
        CsvColumn(
            name=column,
            index=index,
            required=column in required_columns,
            duplicate=counts[column] > 1,
            citation=Citation(
                source_uri=source_uri,
                range=CitationRange.table_cell(1, index),
                trusted=trusted,
            ),
        )
        for index, column in enumerate(header, start=1)
    )


def _validate_csv_header(
    source_uri: str,
    header: Sequence[str],
    columns: Sequence[CsvColumn],
    trusted: bool,
    required_columns: Sequence[str],
    unique_columns: Sequence[str],
) -> List[StructuredValidationError]:
    errors: List[StructuredValidationError] = []
    if not header:
        errors.append(
            _validation_error(source_uri, "csv_header_empty", "CSV header is empty", trusted, row=1)
        )

    seen: Dict[str, int] = {}
    for column in columns:
        if not column.name:
            errors.append(
                _validation_error(
                    source_uri,
                    "csv_column_name_empty",
                    "column name is empty",
                    trusted,
                    row=1,
                    column=column.index,
                )
            )
        if column.name in seen:
            errors.append(
                _validation_error(
                    source_uri,
                    "csv_duplicate_column",
                    f"column {column.name!r} duplicates column {seen[column.name]}",
                    trusted,
                    row=1,
                    column=column.index,
                    metadata={"duplicate_of": seen[column.name]},
                )
            )
        else:
            seen[column.name] = column.index

    for column in required_columns:
        if column not in seen:
            errors.append(
                _validation_error(
                    source_uri,
                    "csv_required_column_missing",
                    f"required column {column!r} is missing",
                    trusted,
                    row=1,
                    column=column,
                )
            )

    for column in unique_columns:
        if column not in seen:
            errors.append(
                _validation_error(
                    source_uri,
                    "csv_unique_column_missing",
                    f"unique column {column!r} is missing",
                    trusted,
                    row=1,
                    column=column,
                )
            )

    return errors


def _validate_csv_row_shape(
    source_uri: str,
    row: Sequence[str],
    header: Sequence[str],
    row_number: int,
    trusted: bool,
) -> List[StructuredValidationError]:
    if len(row) == len(header):
        return []
    return [
        _validation_error(
            source_uri,
            "csv_row_width_mismatch",
            f"row has {len(row)} cells; expected {len(header)}",
            trusted,
            row=row_number,
            metadata={"actual_cells": len(row), "expected_cells": len(header)},
        )
    ]


def _csv_cells(
    source_uri: str,
    header: Sequence[str],
    row: Sequence[str],
    row_number: int,
) -> Tuple[Mapping[str, object], ...]:
    return tuple(
        {
            "column": column,
            "column_index": index,
            "value": row[index - 1] if index - 1 < len(row) else "",
            "citation": CitationRange.table_cell(row_number, index).as_dict(),
            "source_uri": source_uri,
        }
        for index, column in enumerate(header, start=1)
    )


def _csv_document_content(
    row_number: int,
    cells: Sequence[Mapping[str, object]],
    extra_values: Sequence[str],
) -> str:
    payload = {
        "cells": tuple(
            {
                "column": cell["column"],
                "column_index": cell["column_index"],
                "value": cell["value"],
            }
            for cell in cells
        ),
        "extra_values": tuple(extra_values),
        "row": row_number,
    }
    return _canonical_json(payload)


def _cell_value(header: Sequence[str], row: Sequence[str], column: str) -> Optional[str]:
    try:
        index = header.index(column)
    except ValueError:
        return None
    if index >= len(row):
        return ""
    return row[index]


def _validation_error(
    source_uri: str,
    code: str,
    message: str,
    trusted: bool,
    row: Optional[int] = None,
    column: Optional[ColumnRef] = None,
    path: Optional[str] = None,
    metadata: Optional[Mapping[str, Any]] = None,
) -> StructuredValidationError:
    citation_range = CitationRange(path=path, row=row, column=column)
    return StructuredValidationError(
        code=code,
        message=message,
        row=row,
        column=column,
        path=path,
        metadata=metadata or {},
        citation=Citation(source_uri=source_uri, range=citation_range, trusted=trusted),
    )


def _ordered_unique(values: Iterable[str]) -> Tuple[str, ...]:
    ordered: List[str] = []
    seen = set()
    for value in values:
        if value in seen:
            continue
        ordered.append(value)
        seen.add(value)
    return tuple(ordered)


def _local_data_safety_findings(
    source_uri: str,
    content: str,
    citation: Citation,
    trusted: bool,
) -> Tuple[LocalDataSafetyFinding, ...]:
    findings: List[LocalDataSafetyFinding] = []
    for code, pattern in _LOCAL_SAFETY_PATTERNS:
        if pattern.search(content) is None:
            continue
        findings.append(
            LocalDataSafetyFinding(
                code=code,
                message=(
                    "Source text contains an instruction-control phrase; "
                    "keep it as data during ingest."
                ),
                citation=Citation(
                    source_uri=source_uri,
                    range=citation.range,
                    trusted=trusted,
                ),
            )
        )
    return tuple(findings)


def _structured_result(documents: Sequence[StructuredDocument]) -> StructuredImportResult:
    findings: List[LocalDataSafetyFinding] = []
    for document in documents:
        findings.extend(document.findings)
    return StructuredImportResult(documents=tuple(documents), findings=tuple(findings))
