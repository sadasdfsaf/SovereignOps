from __future__ import annotations

import argparse
import json
import sys
from importlib import import_module
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

from .checksum import checksum_bytes, checksum_text
from .pipeline import IngestItem, normalize_item
from .structured import StructuredImportError, import_csv, import_json, import_markdown

_STDIN_SOURCE_URI = "stdin://input"
_CONNECTOR_MANIFEST_COMMAND = "connectors manifest"


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

    connector_manifest = subparsers.add_parser("connector-manifest", add_help=False)
    connector_manifest.set_defaults(command=_CONNECTOR_MANIFEST_COMMAND)

    connectors = subparsers.add_parser("connectors", add_help=False)
    connector_subparsers = connectors.add_subparsers(dest="connector_command", required=True)
    manifest = connector_subparsers.add_parser("manifest", add_help=False)
    manifest.set_defaults(command=_CONNECTOR_MANIFEST_COMMAND)

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
    if command == _CONNECTOR_MANIFEST_COMMAND:
        return _connector_manifest_payload(), 0

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


def _connector_manifest_payload() -> Mapping[str, Any]:
    manifest = _load_connector_manifest()
    if isinstance(manifest, Mapping) and "manifest" in manifest:
        payload = dict(manifest)
        payload.setdefault("ok", True)
        payload.setdefault("command", _CONNECTOR_MANIFEST_COMMAND)
        return _json_safe(_sort_manifest_value(payload))

    return _json_safe(
        _sort_manifest_value(
            {
                "ok": True,
                "command": _CONNECTOR_MANIFEST_COMMAND,
                "manifest": manifest,
            }
        )
    )


def _load_connector_manifest() -> Mapping[str, Any]:
    package_name = __package__ or "sovereignops_ingest"
    module_name = f"{package_name}.connector_manifest"
    try:
        module = import_module(module_name)
    except ModuleNotFoundError as exc:
        if exc.name != module_name:
            raise CliError(
                "connector_manifest_unavailable",
                "connector manifest provider is unavailable",
            ) from exc
        return _fallback_connector_manifest()
    except Exception as exc:
        raise CliError(
            "connector_manifest_unavailable",
            "connector manifest provider is unavailable",
        ) from exc

    for function_name in (
        "build_public_connector_manifest",
        "connector_manifest",
        "build_connector_manifest",
        "manifest",
        "list_connector_manifests",
    ):
        provider = getattr(module, function_name, None)
        if callable(provider):
            try:
                manifest = _coerce_connector_manifest(provider())
            except Exception as exc:
                raise CliError(
                    "connector_manifest_unavailable",
                    "connector manifest provider is unavailable",
                ) from exc
            return _normalize_connector_manifest(manifest)

    for attribute_name in ("CONNECTOR_MANIFEST", "MANIFEST"):
        manifest = _coerce_connector_manifest(getattr(module, attribute_name, None))
        if manifest is not None:
            return _normalize_connector_manifest(manifest)

    raise CliError(
        "connector_manifest_unavailable",
        "connector manifest provider returned an invalid manifest",
    )


def _coerce_connector_manifest(value: Any) -> Optional[Mapping[str, Any]]:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise CliError(
                "connector_manifest_unavailable",
                "connector manifest provider returned invalid JSON",
            ) from exc
        if isinstance(parsed, Mapping):
            return parsed
        return None

    if isinstance(value, Mapping):
        return value

    if isinstance(value, (list, tuple)):
        connectors = []
        for item in value:
            connector = _connector_manifest_item(item)
            if connector is None:
                return None
            connectors.append(connector)
        return {"schema_version": 1, "connectors": connectors}

    return None


def _connector_manifest_item(value: Any) -> Optional[Mapping[str, Any]]:
    if isinstance(value, Mapping):
        return value

    as_public_dict = getattr(value, "as_public_dict", None)
    if callable(as_public_dict):
        public = as_public_dict()
        return public if isinstance(public, Mapping) else None

    connector_id = getattr(value, "connector_id", None)
    if not isinstance(connector_id, str):
        return None

    return {
        "connector_id": connector_id,
        "media_types": list(getattr(value, "media_types", ())),
        "citation_ranges": list(getattr(value, "citation_ranges", ())),
        "validation_modes": list(getattr(value, "validation_modes", ())),
        "safety_finding_kinds": list(getattr(value, "safety_finding_kinds", ())),
        "content_untrusted_by_default": bool(
            getattr(value, "content_untrusted_by_default", True)
        ),
    }


def _normalize_connector_manifest(manifest: Optional[Mapping[str, Any]]) -> Mapping[str, Any]:
    if manifest is None:
        raise CliError(
            "connector_manifest_unavailable",
            "connector manifest provider returned an invalid manifest",
        )

    normalized = dict(manifest)
    normalized.setdefault("kind", "sovereignops.ingest.connector-manifest")
    normalized.setdefault("local_only", True)
    normalized.setdefault("network_access", False)
    normalized.setdefault("path_inputs", False)
    normalized.setdefault("read_only", True)
    normalized.setdefault("version", normalized.get("schema_version", 1))
    normalized.setdefault(
        "search_capabilities",
        {
            "id": "search-index",
            "citation_capabilities": ["source_document_citation"],
            "filters": ["media_type", "source_uri", "tag"],
            "read_only": True,
        },
    )

    connectors = normalized.get("connectors")
    if isinstance(connectors, list):
        normalized["connectors"] = [
            _normalize_manifest_connector(connector) for connector in connectors
        ]

    return normalized


def _normalize_manifest_connector(connector: Any) -> Mapping[str, Any]:
    if not isinstance(connector, Mapping):
        item = _connector_manifest_item(connector)
        if item is None:
            raise CliError(
                "connector_manifest_unavailable",
                "connector manifest provider returned an invalid connector",
            )
        connector = item

    normalized = dict(connector)
    connector_id = normalized.get("id", normalized.get("connector_id"))
    if isinstance(connector_id, str):
        normalized.setdefault("id", connector_id)
        normalized.setdefault("connector_id", connector_id)

    citation_ranges = normalized.get("citation_ranges")
    if "citation_capabilities" not in normalized and isinstance(citation_ranges, list):
        normalized["citation_capabilities"] = citation_ranges

    safety_kinds = normalized.get("safety_finding_kinds")
    if "safety_findings" not in normalized and isinstance(safety_kinds, list):
        normalized["safety_findings"] = [
            {"code": code, "severity": "notice"}
            for code in safety_kinds
            if isinstance(code, str)
        ]

    normalized.setdefault("citation_capabilities", [])
    normalized.setdefault("safety_findings", [])
    return normalized


def _fallback_connector_manifest() -> Mapping[str, Any]:
    safety_findings = [
        {
            "code": "embedded_instruction_override",
            "severity": "notice",
            "description": "Instruction-control phrases are retained as source data.",
        },
        {
            "code": "embedded_prompt_reference",
            "severity": "notice",
            "description": "Prompt references are retained as source data.",
        },
    ]
    return {
        "connectors": [
            {
                "id": "csv-structured",
                "kind": "ingest",
                "media_types": ["text/csv"],
                "citation_capabilities": ["row", "table_cell"],
                "safety_findings": safety_findings,
            },
            {
                "id": "json-structured",
                "kind": "ingest",
                "media_types": ["application/json"],
                "citation_capabilities": ["json_path"],
                "safety_findings": safety_findings,
            },
            {
                "id": "jsonl-log",
                "kind": "ingest",
                "media_types": ["application/jsonl"],
                "citation_capabilities": ["line_range"],
                "safety_findings": [],
            },
            {
                "id": "markdown-structured",
                "kind": "ingest",
                "media_types": ["text/markdown"],
                "citation_capabilities": ["line_range", "heading_hierarchy"],
                "safety_findings": safety_findings,
            },
            {
                "id": "plain-text-log",
                "kind": "ingest",
                "media_types": ["text/plain"],
                "citation_capabilities": ["line_range"],
                "safety_findings": [],
            },
            {
                "id": "repository",
                "kind": "ingest",
                "media_types": [
                    "application/json",
                    "application/octet-stream",
                    "application/toml",
                    "application/x-ndjson",
                    "application/xml",
                    "application/yaml",
                    "image/svg+xml",
                    "text/css",
                    "text/csv",
                    "text/html",
                    "text/javascript",
                    "text/markdown",
                    "text/plain",
                    "text/typescript",
                    "text/x-python",
                    "text/x-rst",
                ],
                "citation_capabilities": ["relative_path"],
                "safety_findings": [],
            },
            {
                "id": "search-index",
                "kind": "search",
                "media_types": [
                    "application/vnd.sovereignops.ingest.index-document+json",
                ],
                "citation_capabilities": ["source_document_citation"],
                "safety_findings": [],
            },
        ],
        "kind": "sovereignops.ingest.connector-manifest",
        "local_only": True,
        "network_access": False,
        "path_inputs": False,
        "read_only": True,
        "search_capabilities": {
            "id": "search-index",
            "citation_capabilities": ["source_document_citation"],
            "filters": ["media_type", "source_uri", "tag"],
            "read_only": True,
        },
        "version": 1,
    }


def _sort_manifest_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): _sort_manifest_value(value[key])
            for key in sorted(value, key=str)
        }
    if isinstance(value, tuple):
        return [_sort_manifest_value(item) for item in value]
    if isinstance(value, list):
        sorted_items = [_sort_manifest_value(item) for item in value]
        return sorted(sorted_items, key=_manifest_sort_key)
    return value


def _manifest_sort_key(value: Any) -> str:
    if isinstance(value, Mapping):
        for key in ("id", "code", "media_type", "name"):
            item = value.get(key)
            if isinstance(item, str):
                return item
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


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
