from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from .citation import Citation, CitationRange
from .structured import StructuredDocument, StructuredValidationError

_JSONL_MEDIA_TYPE = "application/jsonl"
_TEXT_LOG_MEDIA_TYPE = "text/plain"
_TIMESTAMP_KEYS = ("timestamp", "time", "ts", "datetime")
_LEVEL_KEYS = ("level", "severity", "log_level")
_MESSAGE_KEYS = ("message", "msg", "content")
_CORE_RECORD_KEYS = set(_TIMESTAMP_KEYS + _LEVEL_KEYS + _MESSAGE_KEYS + ("metadata", "meta"))
_ISO_TIMESTAMP_RE = re.compile(
    r"^(?P<timestamp>"
    r"\d{4}-\d{2}-\d{2}"
    r"(?:[ T]\d{2}:\d{2}:\d{2}"
    r"(?:[.,]\d{1,6})?"
    r"(?:Z|[+-]\d{2}:?\d{2})?"
    r")?"
    r")(?:\s+|$)"
)
_BRACKETED_ISO_TIMESTAMP_RE = re.compile(
    r"^\[(?P<timestamp>"
    r"\d{4}-\d{2}-\d{2}"
    r"(?:[ T]\d{2}:\d{2}:\d{2}"
    r"(?:[.,]\d{1,6})?"
    r"(?:Z|[+-]\d{2}:?\d{2})?"
    r")?"
    r")\]\s*"
)
_LEVEL_RE = re.compile(
    r"^(?:\[(?P<bracket>TRACE|DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|FATAL)\]\s*"
    r"|(?P<bare>TRACE|DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|FATAL)(?:\b|:)\s*)",
    re.I,
)


@dataclass(frozen=True)
class LogEvent:
    source_uri: str
    content: str
    citation: Citation
    media_type: str
    timestamp: Optional[str] = None
    level: Optional[str] = None
    message: str = ""
    metadata: Mapping[str, Any] = field(default_factory=dict)

    @property
    def untrusted(self) -> bool:
        return self.citation.untrusted

    def as_dict(self) -> Dict[str, object]:
        data: Dict[str, object] = {
            "source_uri": self.source_uri,
            "content": self.content,
            "media_type": self.media_type,
            "message": self.message,
            "citation": self.citation.as_dict(),
            "metadata": dict(self.metadata),
        }
        if self.timestamp is not None:
            data["timestamp"] = self.timestamp
        if self.level is not None:
            data["level"] = self.level
        return data


@dataclass(frozen=True)
class LogImportResult:
    documents: Tuple[StructuredDocument, ...]
    events: Tuple[LogEvent, ...]
    validation_errors: Tuple[StructuredValidationError, ...] = ()


def parse_jsonl_logs(source_uri: str, content: str, trusted: bool = False) -> LogImportResult:
    documents: List[StructuredDocument] = []
    events: List[LogEvent] = []
    errors: List[StructuredValidationError] = []

    for line_number, line in enumerate(_split_lines(content), start=1):
        if not line.strip():
            errors.append(
                _line_validation_error(
                    source_uri,
                    "jsonl_empty_line",
                    "empty JSONL line",
                    line_number,
                    trusted,
                )
            )
            continue

        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(
                _line_validation_error(
                    source_uri,
                    "jsonl_parse_error",
                    f"invalid JSONL at line {line_number}, column {exc.colno}: {exc.msg}",
                    line_number,
                    trusted,
                    column=exc.colno,
                )
            )
            continue

        event = _jsonl_event(source_uri, record, line_number, trusted)
        events.append(event)
        documents.append(_document_from_event(event))

    return LogImportResult(
        documents=tuple(documents),
        events=tuple(events),
        validation_errors=tuple(errors),
    )


def parse_plain_text_logs(
    source_uri: str,
    content: str,
    trusted: bool = False,
) -> LogImportResult:
    documents: List[StructuredDocument] = []
    events: List[LogEvent] = []

    for line_number, line in enumerate(_split_lines(content), start=1):
        timestamp, rest = _extract_timestamp(line)
        level, message = _extract_level(rest)
        if timestamp is None and level is None:
            message = line

        citation = Citation(
            source_uri=source_uri,
            range=CitationRange.lines(line_number),
            trusted=trusted,
        )
        metadata = {
            "format": "text-log",
            "line": line_number,
            "line_count": 1,
            "timestamp": timestamp,
            "level": level,
            "message": message,
            "raw_line": line,
        }
        event = LogEvent(
            source_uri=source_uri,
            content=line,
            media_type=_TEXT_LOG_MEDIA_TYPE,
            citation=citation,
            timestamp=timestamp,
            level=level,
            message=message,
            metadata=metadata,
        )
        events.append(event)
        documents.append(_document_from_event(event))

    return LogImportResult(documents=tuple(documents), events=tuple(events))


class JSONLLogConnector:
    media_type = _JSONL_MEDIA_TYPE

    @staticmethod
    def parse(source_uri: str, content: str, trusted: bool = False) -> LogImportResult:
        return parse_jsonl_logs(source_uri, content, trusted=trusted)


class PlainTextLogConnector:
    media_type = _TEXT_LOG_MEDIA_TYPE

    @staticmethod
    def parse(source_uri: str, content: str, trusted: bool = False) -> LogImportResult:
        return parse_plain_text_logs(source_uri, content, trusted=trusted)


JsonlLogConnector = JSONLLogConnector
TextLogConnector = PlainTextLogConnector
parse_jsonl = parse_jsonl_logs
parse_text_logs = parse_plain_text_logs


def _jsonl_event(
    source_uri: str,
    record: Any,
    line_number: int,
    trusted: bool,
) -> LogEvent:
    citation = Citation(
        source_uri=source_uri,
        range=CitationRange.lines(line_number),
        trusted=trusted,
    )
    if isinstance(record, dict):
        timestamp = _first_present(record, _TIMESTAMP_KEYS)
        level = _first_present(record, _LEVEL_KEYS)
        message_value = _first_present(record, _MESSAGE_KEYS)
        message = _text_value(message_value) if message_value is not None else _canonical_json(record)
        metadata = _jsonl_metadata(record, line_number, timestamp, level, message)
    else:
        timestamp = None
        level = None
        message = _canonical_json(record)
        metadata = {
            "format": "jsonl",
            "line": line_number,
            "line_count": 1,
            "value_type": _json_value_type(record),
            "record": _freeze_json_value(record),
        }

    return LogEvent(
        source_uri=source_uri,
        content=message,
        media_type=_JSONL_MEDIA_TYPE,
        citation=citation,
        timestamp=_text_value(timestamp) if timestamp is not None else None,
        level=_normalize_level(level),
        message=message,
        metadata=metadata,
    )


def _jsonl_metadata(
    record: Mapping[str, Any],
    line_number: int,
    timestamp: Any,
    level: Any,
    message: str,
) -> Dict[str, object]:
    metadata: Dict[str, object] = {
        "format": "jsonl",
        "line": line_number,
        "line_count": 1,
        "timestamp": _text_value(timestamp) if timestamp is not None else None,
        "level": _normalize_level(level),
        "message": message,
        "fields": tuple(sorted(record)),
        "record": _freeze_json_value(record),
    }

    record_metadata = record.get("metadata", record.get("meta"))
    if record_metadata is not None:
        metadata["record_metadata"] = _freeze_json_value(record_metadata)

    extra = tuple(
        (key, _freeze_json_value(record[key]))
        for key in sorted(record)
        if key not in _CORE_RECORD_KEYS
    )
    if extra:
        metadata["extra"] = extra
    return metadata


def _document_from_event(event: LogEvent) -> StructuredDocument:
    return StructuredDocument(
        source_uri=event.source_uri,
        content=event.content,
        media_type=event.media_type,
        citation=event.citation,
        metadata=event.metadata,
    )


def _line_validation_error(
    source_uri: str,
    code: str,
    message: str,
    line_number: int,
    trusted: bool,
    column: Optional[int] = None,
) -> StructuredValidationError:
    citation = Citation(
        source_uri=source_uri,
        range=CitationRange(
            start_line=line_number,
            end_line=line_number,
            column=column,
        ),
        trusted=trusted,
    )
    return StructuredValidationError(
        code=code,
        message=message,
        column=column,
        metadata={"line": line_number},
        citation=citation,
    )


def _extract_timestamp(line: str) -> Tuple[Optional[str], str]:
    bracketed = _BRACKETED_ISO_TIMESTAMP_RE.match(line)
    if bracketed is not None:
        return bracketed.group("timestamp"), line[bracketed.end() :].lstrip()

    plain = _ISO_TIMESTAMP_RE.match(line)
    if plain is None:
        return None, line
    return plain.group("timestamp"), line[plain.end() :].lstrip()


def _extract_level(text: str) -> Tuple[Optional[str], str]:
    match = _LEVEL_RE.match(text)
    if match is None:
        return None, text
    level = match.group("bracket") or match.group("bare")
    return _normalize_level(level), text[match.end() :].lstrip()


def _first_present(record: Mapping[str, Any], keys: Sequence[str]) -> Any:
    for key in keys:
        if key in record:
            return record[key]
    return None


def _normalize_level(value: Any) -> Optional[str]:
    if value is None:
        return None
    return _text_value(value).upper()


def _text_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    return _canonical_json(value)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _freeze_json_value(value: Any) -> Any:
    if isinstance(value, dict):
        return tuple((key, _freeze_json_value(value[key])) for key in sorted(value))
    if isinstance(value, list):
        return tuple(_freeze_json_value(item) for item in value)
    return value


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


def _split_lines(content: str) -> List[str]:
    return content.replace("\r\n", "\n").replace("\r", "\n").splitlines()
