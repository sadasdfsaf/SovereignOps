from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Dict, Iterable, Mapping, Tuple

from .logs import JSONLLogConnector, PlainTextLogConnector
from .repository import _MEDIA_TYPES_BY_SUFFIX
from .structured import (
    CSVStructuredConnector,
    JSONStructuredConnector,
    MarkdownStructuredConnector,
    _LOCAL_SAFETY_PATTERNS,
)

_CONNECTOR_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
_PUBLIC_TOKEN_RE = re.compile(r"^[a-z0-9][a-z0-9._+-]*$")
_MEDIA_TYPE_RE = re.compile(
    r"^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$"
)


@dataclass(frozen=True)
class ConnectorManifest:
    connector_id: str
    media_types: Tuple[str, ...]
    citation_ranges: Tuple[str, ...]
    validation_modes: Tuple[str, ...]
    safety_finding_kinds: Tuple[str, ...] = ()
    content_untrusted_by_default: bool = True

    def __post_init__(self) -> None:
        _validate_connector_id(self.connector_id)
        object.__setattr__(self, "media_types", _normalized_tuple(self.media_types))
        object.__setattr__(self, "citation_ranges", _normalized_tuple(self.citation_ranges))
        object.__setattr__(self, "validation_modes", _normalized_tuple(self.validation_modes))
        object.__setattr__(
            self,
            "safety_finding_kinds",
            _normalized_tuple(self.safety_finding_kinds),
        )
        for media_type in self.media_types:
            _validate_media_type(media_type)
        for value in (
            self.citation_ranges + self.validation_modes + self.safety_finding_kinds
        ):
            _validate_public_token(value)

    def as_public_dict(self) -> Dict[str, object]:
        return {
            "connector_id": self.connector_id,
            "media_types": list(self.media_types),
            "citation_ranges": list(self.citation_ranges),
            "validation_modes": list(self.validation_modes),
            "safety_finding_kinds": list(self.safety_finding_kinds),
            "content_untrusted_by_default": self.content_untrusted_by_default,
        }


def _normalized_tuple(values: Iterable[str]) -> Tuple[str, ...]:
    return tuple(str(value) for value in values)


def _validate_connector_id(value: str) -> None:
    if _CONNECTOR_ID_RE.match(value) is None:
        raise ValueError(f"unsafe connector id: {value!r}")


def _validate_media_type(value: str) -> None:
    if _MEDIA_TYPE_RE.match(value) is None:
        raise ValueError(f"unsafe media type: {value!r}")


def _validate_public_token(value: str) -> None:
    if _PUBLIC_TOKEN_RE.match(value) is None:
        raise ValueError(f"unsafe public token: {value!r}")


_LOCAL_DATA_SAFETY_FINDING_KINDS = tuple(
    code for code, _pattern in _LOCAL_SAFETY_PATTERNS
)
_REPOSITORY_MEDIA_TYPES = tuple(
    sorted(set(_MEDIA_TYPES_BY_SUFFIX.values()) | {"application/octet-stream"})
)

_MANIFESTS: Tuple[ConnectorManifest, ...] = (
    ConnectorManifest(
        connector_id="markdown",
        media_types=(MarkdownStructuredConnector.media_type,),
        citation_ranges=("line_range",),
        validation_modes=("markdown_heading_sections",),
        safety_finding_kinds=_LOCAL_DATA_SAFETY_FINDING_KINDS,
    ),
    ConnectorManifest(
        connector_id="json",
        media_types=(JSONStructuredConnector.media_type,),
        citation_ranges=("json_path",),
        validation_modes=("json_parse_exception", "json_sorted_object_paths"),
        safety_finding_kinds=_LOCAL_DATA_SAFETY_FINDING_KINDS,
    ),
    ConnectorManifest(
        connector_id="csv",
        media_types=(CSVStructuredConnector.media_type,),
        citation_ranges=("table_row", "table_cell"),
        validation_modes=(
            "csv_parse_error",
            "csv_empty",
            "csv_header_empty",
            "csv_column_name_empty",
            "csv_duplicate_column",
            "csv_required_column_missing",
            "csv_unique_column_missing",
            "csv_row_width_mismatch",
            "csv_duplicate_row",
            "csv_required_value_empty",
            "csv_duplicate_column_value",
        ),
        safety_finding_kinds=_LOCAL_DATA_SAFETY_FINDING_KINDS,
    ),
    ConnectorManifest(
        connector_id="logs",
        media_types=(JSONLLogConnector.media_type, PlainTextLogConnector.media_type),
        citation_ranges=("line_range",),
        validation_modes=(
            "jsonl_empty_line",
            "jsonl_parse_error",
            "log_timestamp_detection",
            "log_level_detection",
        ),
    ),
    ConnectorManifest(
        connector_id="repository-scan",
        media_types=_REPOSITORY_MEDIA_TYPES,
        citation_ranges=("relative_path",),
        validation_modes=(
            "root_directory_required",
            "relative_include_paths",
            "parent_traversal_rejected",
            "root_boundary_enforced",
            "generated_directory_ignored",
            "text_size_limit",
            "utf8_replace_decode_errors",
        ),
    ),
)
_MANIFESTS_BY_ID: Mapping[str, ConnectorManifest] = {
    manifest.connector_id: manifest for manifest in _MANIFESTS
}


def list_connector_manifests() -> Tuple[ConnectorManifest, ...]:
    return tuple(_clone_manifest(manifest) for manifest in _MANIFESTS)


def get_connector_manifest(connector_id: str) -> ConnectorManifest:
    try:
        return _clone_manifest(_MANIFESTS_BY_ID[connector_id])
    except KeyError as exc:
        raise KeyError(f"unknown connector manifest: {connector_id}") from exc


def connector_manifest() -> Mapping[str, object]:
    safety_findings = _safety_finding_entries(_LOCAL_DATA_SAFETY_FINDING_KINDS)
    markdown = get_connector_manifest("markdown")
    json_structured = get_connector_manifest("json")
    csv = get_connector_manifest("csv")
    logs = get_connector_manifest("logs")
    repository = get_connector_manifest("repository-scan")

    return {
        "kind": "sovereignops.ingest.connector-manifest",
        "version": 1,
        "local_only": True,
        "read_only": True,
        "network_access": False,
        "path_inputs": False,
        "connectors": [
            _public_connector(
                connector_id="csv-structured",
                kind="ingest",
                media_types=csv.media_types,
                citation_capabilities=csv.citation_ranges,
                validation_modes=csv.validation_modes,
                safety_findings=safety_findings,
                content_untrusted_by_default=csv.content_untrusted_by_default,
            ),
            _public_connector(
                connector_id="json-structured",
                kind="ingest",
                media_types=json_structured.media_types,
                citation_capabilities=json_structured.citation_ranges,
                validation_modes=json_structured.validation_modes,
                safety_findings=safety_findings,
                content_untrusted_by_default=json_structured.content_untrusted_by_default,
            ),
            _public_connector(
                connector_id="jsonl-log",
                kind="ingest",
                media_types=(JSONLLogConnector.media_type,),
                citation_capabilities=logs.citation_ranges,
                validation_modes=("jsonl_empty_line", "jsonl_parse_error"),
                safety_findings=(),
                content_untrusted_by_default=logs.content_untrusted_by_default,
            ),
            _public_connector(
                connector_id="markdown-structured",
                kind="ingest",
                media_types=markdown.media_types,
                citation_capabilities=markdown.citation_ranges,
                validation_modes=markdown.validation_modes,
                safety_findings=safety_findings,
                content_untrusted_by_default=markdown.content_untrusted_by_default,
            ),
            _public_connector(
                connector_id="plain-text-log",
                kind="ingest",
                media_types=(PlainTextLogConnector.media_type,),
                citation_capabilities=logs.citation_ranges,
                validation_modes=("log_level_detection", "log_timestamp_detection"),
                safety_findings=(),
                content_untrusted_by_default=logs.content_untrusted_by_default,
            ),
            _public_connector(
                connector_id="repository",
                kind="ingest",
                media_types=repository.media_types,
                citation_capabilities=repository.citation_ranges,
                validation_modes=repository.validation_modes,
                safety_findings=(),
                content_untrusted_by_default=repository.content_untrusted_by_default,
            ),
            _public_connector(
                connector_id="search-index",
                kind="search",
                media_types=("application/vnd.sovereignops.ingest.index-document+json",),
                citation_capabilities=("source_document_citation",),
                validation_modes=("deterministic_local_lookup",),
                safety_findings=(),
                content_untrusted_by_default=True,
            ),
        ],
    }


def build_connector_manifest() -> Mapping[str, object]:
    return connector_manifest()


def build_public_connector_manifest() -> str:
    return json.dumps(connector_manifest(), sort_keys=True, separators=(",", ":"))


def _clone_manifest(manifest: ConnectorManifest) -> ConnectorManifest:
    return ConnectorManifest(
        connector_id=manifest.connector_id,
        media_types=tuple(value for value in manifest.media_types),
        citation_ranges=tuple(value for value in manifest.citation_ranges),
        validation_modes=tuple(value for value in manifest.validation_modes),
        safety_finding_kinds=tuple(value for value in manifest.safety_finding_kinds),
        content_untrusted_by_default=manifest.content_untrusted_by_default,
    )


def _public_connector(
    connector_id: str,
    kind: str,
    media_types: Iterable[str],
    citation_capabilities: Iterable[str],
    validation_modes: Iterable[str],
    safety_findings: Iterable[Mapping[str, object]],
    content_untrusted_by_default: bool,
) -> Dict[str, object]:
    return {
        "id": connector_id,
        "kind": kind,
        "media_types": sorted(media_types),
        "citation_capabilities": sorted(citation_capabilities),
        "validation_modes": sorted(validation_modes),
        "safety_findings": [dict(finding) for finding in safety_findings],
        "content_untrusted_by_default": content_untrusted_by_default,
    }


def _safety_finding_entries(codes: Iterable[str]) -> Tuple[Mapping[str, object], ...]:
    return tuple({"code": code, "severity": "notice"} for code in sorted(codes))
