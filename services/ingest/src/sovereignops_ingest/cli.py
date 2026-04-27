from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

from .checksum import checksum_bytes, checksum_text
from .pipeline import IngestItem, normalize_item
from .structured import StructuredImportError, import_csv, import_json, import_markdown

_STDIN_SOURCE_URI = "stdin://input"


class CliError(Exception):
    def __init__(self, code: str, message: str, status: int = 1) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


class CliUsageError(CliError):
    def __init__(self, message: str) -> None:
        super().__init__("invalid_args", message, status=2)


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise CliUsageError(message)

    def exit(self, status: int = 0, message: Optional[str] = None) -> None:
        raise CliUsageError((message or "argument parsing failed").strip())


def main(argv: Optional[Sequence[str]] = None) -> int:
    try:
        args = _parser().parse_args(argv)
        payload, status = _run(args)
    except CliError as exc:
        payload = _error_payload(exc.code, exc.message)
        status = exc.status
    except StructuredImportError as exc:
        payload = _error_payload("invalid_input", str(exc))
        status = 1

    _emit(payload)
    return status


def _parser() -> argparse.ArgumentParser:
    parser = JsonArgumentParser(prog="sovereignops-ingest", add_help=False)
    subparsers = parser.add_subparsers(dest="command", required=True)

    markdown = subparsers.add_parser("parse-markdown", add_help=False)
    _add_text_input_args(markdown)

    json_parser = subparsers.add_parser("parse-json", add_help=False)
    _add_text_input_args(json_parser)

    csv_parser = subparsers.add_parser("parse-csv", add_help=False)
    _add_text_input_args(csv_parser)
    csv_parser.add_argument("--require-column", dest="required_columns", action="append", default=[])
    csv_parser.add_argument("--unique-column", dest="unique_columns", action="append", default=[])

    checksum_parser = subparsers.add_parser("checksum", add_help=False)
    _add_input_args(checksum_parser)

    normalize_parser = subparsers.add_parser("normalize", add_help=False)
    _add_text_input_args(normalize_parser)
    normalize_parser.add_argument("--media-type", default="text/plain")

    return parser


def _add_input_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("input", nargs="?", default="-")
    parser.add_argument("--source-uri", default=None)


def _add_text_input_args(parser: argparse.ArgumentParser) -> None:
    _add_input_args(parser)
    parser.add_argument("--trusted", action="store_true")


def _run(args: argparse.Namespace) -> tuple[Mapping[str, Any], int]:
    command = args.command
    if command == "checksum":
        data = _read_bytes(args.input)
        source_uri = _source_uri(args.input, args.source_uri)
        return (
            {
                "ok": True,
                "command": command,
                "source_uri": source_uri,
                "algorithm": "sha256",
                "checksum": checksum_bytes(data),
                "byte_length": len(data),
            },
            0,
        )

    content = _read_text(args.input)
    source_uri = _source_uri(args.input, args.source_uri)

    if command == "parse-markdown":
        result = import_markdown(source_uri, content, trusted=args.trusted)
        return _structured_payload(command, source_uri, result), 0

    if command == "parse-json":
        result = import_json(source_uri, content, trusted=args.trusted)
        return _structured_payload(command, source_uri, result), 0

    if command == "parse-csv":
        result = import_csv(
            source_uri,
            content,
            trusted=args.trusted,
            required_columns=args.required_columns,
            unique_columns=args.unique_columns,
        )
        status = 1 if result.validation_errors else 0
        return _structured_payload(command, source_uri, result), status

    if command == "normalize":
        item = IngestItem(source_uri=source_uri, content=content, media_type=args.media_type)
        normalized = normalize_item(item)
        return (
            {
                "ok": True,
                "command": command,
                "source_uri": normalized.source_uri,
                "media_type": item.media_type,
                "checksum": normalized.checksum,
                "normalized_text": normalized.normalized_text,
                "untrusted": normalized.untrusted,
            },
            0,
        )

    raise CliUsageError(f"unknown command: {command}")


def _structured_payload(command: str, source_uri: str, result: Any) -> Mapping[str, Any]:
    documents = [_document_payload(index, document) for index, document in enumerate(result.documents)]
    summaries = [
        _document_summary(index, document) for index, document in enumerate(result.documents)
    ]
    validation_errors = [error.as_dict() for error in result.validation_errors]
    findings = [finding.as_dict() for finding in result.findings]
    payload = {
        "ok": not validation_errors,
        "command": command,
        "source_uri": source_uri,
        "summary": {
            "document_count": len(documents),
            "chunk_count": len(documents),
            "validation_error_count": len(validation_errors),
            "finding_count": len(findings),
        },
        "documents": documents,
        "document_summaries": summaries,
        "chunks": documents,
        "chunk_summaries": summaries,
        "citations": [document["citation"] for document in documents],
        "validation_errors": validation_errors,
        "findings": findings,
    }
    if hasattr(result, "columns"):
        payload["columns"] = [column.as_dict() for column in result.columns]
    return _json_safe(payload)


def _document_payload(index: int, document: Any) -> Mapping[str, Any]:
    return {
        "index": index,
        "source_uri": document.source_uri,
        "media_type": document.media_type,
        "content": document.content,
        "citation": document.citation.as_dict(),
        "metadata": _json_safe(document.metadata),
        "findings": [finding.as_dict() for finding in document.findings],
    }


def _document_summary(index: int, document: Any) -> Mapping[str, Any]:
    metadata = document.metadata
    summary = {
        "index": index,
        "source_uri": document.source_uri,
        "media_type": document.media_type,
        "content_length": len(document.content),
        "content_checksum": checksum_text(document.content),
        "citation": document.citation.as_dict(),
    }
    for key in ("format", "heading", "heading_level", "heading_line", "path", "row"):
        if key in metadata:
            summary[key] = metadata[key]
    return _json_safe(summary)


def _read_text(input_path: str) -> str:
    data = _read_bytes(input_path)
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise CliError("invalid_input", "input is not valid UTF-8") from exc


def _read_bytes(input_path: str) -> bytes:
    if input_path == "-":
        stream = getattr(sys.stdin, "buffer", None)
        if stream is not None:
            data = stream.read()
            if isinstance(data, bytes):
                return data
            return str(data).encode("utf-8")
        return sys.stdin.read().encode("utf-8")

    if "://" in input_path:
        raise CliError("invalid_input", "input must be a local file path or '-' for stdin")

    path = Path(input_path)
    try:
        return path.read_bytes()
    except OSError as exc:
        raise CliError("read_error", str(exc)) from exc


def _source_uri(input_path: str, override: Optional[str]) -> str:
    if override is not None:
        if override.startswith(("http://", "https://")):
            raise CliError("invalid_args", "source URI must be local metadata", status=2)
        if not override:
            raise CliError("invalid_args", "source URI must not be empty", status=2)
        return override
    if input_path == "-":
        return _STDIN_SOURCE_URI
    return Path(input_path).resolve().as_uri()


def _json_safe(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


def _error_payload(code: str, message: str) -> Mapping[str, Any]:
    return {
        "ok": False,
        "error": {
            "code": code,
            "message": message,
        },
    }


def _emit(payload: Mapping[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    sys.stdout.write("\n")


if __name__ == "__main__":
    raise SystemExit(main())
