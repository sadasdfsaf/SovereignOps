#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse


FIXTURE_FILE_NAMES = ("resources.json", "tools.json", "approval-sessions.json")
DEFAULT_FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "examples" / "mcp-gateway"
SCHEMA_VERSION = "mcp-gateway-fixtures.v1"

TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
RESOURCE_ID_PATTERN = re.compile(r"^res_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
TOOL_ID_PATTERN = re.compile(r"^tool_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
TOOL_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
SESSION_ID_PATTERN = re.compile(r"^aps_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
DECISION_ID_PATTERN = re.compile(r"^apd_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
EVENT_ID_PATTERN = re.compile(r"^ape_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
USER_ID_PATTERN = re.compile(r"^user_[A-Za-z0-9_-]{1,64}$")

ALLOWED_LOCAL_SCHEMES = {"fixture", "local", "memory", "workspace"}
RESOURCE_MIME_TYPES = {"application/json", "text/plain", "text/markdown"}
SESSION_STATUSES = {"pending", "approved", "rejected", "expired", "canceled"}
TERMINAL_STATUSES = {"approved", "rejected", "expired", "canceled"}
DECISION_STATUSES = {"approved", "rejected", "canceled"}
EVENT_TYPES = {"requested", "approved", "rejected", "expired", "canceled", "noted"}

SENSITIVE_FIELD_PATTERN = re.compile(
    r"(?i)(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret)"
)
SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{4,}"),
)


@dataclass(frozen=True)
class ValidationReport:
    root: Path
    issues: list[str]

    @property
    def ok(self) -> bool:
        return not self.issues


def validate_mcp_gateway_fixtures(root: Optional[Path] = None) -> ValidationReport:
    fixture_root = Path(root) if root is not None else DEFAULT_FIXTURE_ROOT
    issues: list[str] = []
    data: dict[str, Any] = {}

    if not fixture_root.exists():
        return ValidationReport(fixture_root, [f"missing fixture directory: {fixture_root}"])
    if not fixture_root.is_dir():
        return ValidationReport(fixture_root, [f"fixture root is not a directory: {fixture_root}"])

    for name in FIXTURE_FILE_NAMES:
        loaded = _load_json(fixture_root / name, issues)
        if loaded is not None:
            data[name] = loaded
            _scan_secret_shapes(loaded, name, issues)

    resources_by_uri: dict[str, dict[str, Any]] = {}
    tools_by_name: dict[str, dict[str, Any]] = {}

    if "resources.json" in data:
        resources_by_uri = _validate_resources(data["resources.json"], "resources.json", issues)
    if "tools.json" in data:
        tools_by_name = _validate_tools(data["tools.json"], "tools.json", issues)
    if "approval-sessions.json" in data:
        _validate_sessions(
            data["approval-sessions.json"],
            "approval-sessions.json",
            resources_by_uri,
            tools_by_name,
            issues,
        )

    return ValidationReport(fixture_root, sorted(issues))


def _load_json(path: Path, issues: list[str]) -> Optional[Any]:
    if not path.exists():
        issues.append(f"missing fixture file: {path.name}")
        return None
    if not path.is_file():
        issues.append(f"fixture path is not a file: {path.name}")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        issues.append(f"{path.name}:{error.lineno}:{error.colno} invalid JSON: {error.msg}")
        return None


def _validate_resources(value: Any, path: str, issues: list[str]) -> dict[str, dict[str, Any]]:
    resources_by_uri: dict[str, dict[str, Any]] = {}
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return resources_by_uri

    _reject_unknown_fields(value, {"schemaVersion", "generatedAt", "resources"}, path, issues)
    _require_exact_string(value, "schemaVersion", SCHEMA_VERSION, path, issues)
    _require_timestamp(value, "generatedAt", path, issues)
    resources = _require_array(value, "resources", path, issues, min_length=1)

    seen_ids: set[str] = set()
    seen_uris: set[str] = set()
    seen_names: set[str] = set()
    for index, resource in enumerate(resources):
        item_path = f"{path}.resources[{index}]"
        if not _is_record(resource):
            issues.append(f"{item_path}: must be an object")
            continue
        _reject_unknown_fields(
            resource,
            {"id", "uri", "name", "description", "mimeType", "sizeBytes", "updatedAt", "tags"},
            item_path,
            issues,
        )
        resource_id = _require_string(resource, "id", item_path, issues, RESOURCE_ID_PATTERN)
        uri = _require_string(resource, "uri", item_path, issues)
        name = _require_string(resource, "name", item_path, issues, min_length=1, max_length=80)
        _require_string(resource, "description", item_path, issues, min_length=1, max_length=240)
        _require_string(resource, "mimeType", item_path, issues, allowed=RESOURCE_MIME_TYPES)
        _require_integer(resource, "sizeBytes", item_path, issues, minimum=0)
        _require_timestamp(resource, "updatedAt", item_path, issues)
        _validate_string_array(resource.get("tags"), f"{item_path}.tags", issues, min_length=1)

        if isinstance(uri, str):
            _require_local_uri(uri, f"{item_path}.uri", issues)
            resources_by_uri[uri] = resource
        _track_unique(resource_id, seen_ids, f"{item_path}.id", "resource id", issues)
        _track_unique(uri, seen_uris, f"{item_path}.uri", "resource uri", issues)
        _track_unique(name, seen_names, f"{item_path}.name", "resource name", issues)

    return resources_by_uri


def _validate_tools(value: Any, path: str, issues: list[str]) -> dict[str, dict[str, Any]]:
    tools_by_name: dict[str, dict[str, Any]] = {}
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return tools_by_name

    _reject_unknown_fields(value, {"schemaVersion", "generatedAt", "tools"}, path, issues)
    _require_exact_string(value, "schemaVersion", SCHEMA_VERSION, path, issues)
    _require_timestamp(value, "generatedAt", path, issues)
    tools = _require_array(value, "tools", path, issues, min_length=1)

    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    for index, tool in enumerate(tools):
        item_path = f"{path}.tools[{index}]"
        if not _is_record(tool):
            issues.append(f"{item_path}: must be an object")
            continue
        _reject_unknown_fields(
            tool,
            {
                "id",
                "name",
                "title",
                "description",
                "readOnly",
                "destructive",
                "requiresApproval",
                "localOnly",
                "inputSchema",
                "outputSchema",
                "safeDefaults",
            },
            item_path,
            issues,
        )
        tool_id = _require_string(tool, "id", item_path, issues, TOOL_ID_PATTERN)
        name = _require_string(tool, "name", item_path, issues, TOOL_NAME_PATTERN)
        _require_string(tool, "title", item_path, issues, min_length=1, max_length=80)
        _require_string(tool, "description", item_path, issues, min_length=1, max_length=240)
        _require_bool(tool, "readOnly", item_path, issues)
        _require_exact_bool(tool, "destructive", False, item_path, issues)
        _require_bool(tool, "requiresApproval", item_path, issues)
        _require_exact_bool(tool, "localOnly", True, item_path, issues)
        _require_schema_object(tool.get("inputSchema"), f"{item_path}.inputSchema", issues)
        _require_schema_object(tool.get("outputSchema"), f"{item_path}.outputSchema", issues)
        if "safeDefaults" in tool and not _is_record(tool["safeDefaults"]):
            issues.append(f"{item_path}.safeDefaults: must be an object")

        if isinstance(name, str):
            tools_by_name[name] = tool
        _track_unique(tool_id, seen_ids, f"{item_path}.id", "tool id", issues)
        _track_unique(name, seen_names, f"{item_path}.name", "tool name", issues)

    return tools_by_name


def _validate_sessions(
    value: Any,
    path: str,
    resources_by_uri: dict[str, dict[str, Any]],
    tools_by_name: dict[str, dict[str, Any]],
    issues: list[str],
) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return

    _reject_unknown_fields(value, {"schemaVersion", "generatedAt", "sessions"}, path, issues)
    _require_exact_string(value, "schemaVersion", SCHEMA_VERSION, path, issues)
    _require_timestamp(value, "generatedAt", path, issues)
    sessions = _require_array(value, "sessions", path, issues, min_length=1)

    seen_ids: set[str] = set()
    for index, session in enumerate(sessions):
        item_path = f"{path}.sessions[{index}]"
        if not _is_record(session):
            issues.append(f"{item_path}: must be an object")
            continue
        _validate_session(session, item_path, resources_by_uri, tools_by_name, issues)
        session_id = session.get("id")
        _track_unique(session_id, seen_ids, f"{item_path}.id", "session id", issues)


def _validate_session(
    session: dict[str, Any],
    path: str,
    resources_by_uri: dict[str, dict[str, Any]],
    tools_by_name: dict[str, dict[str, Any]],
    issues: list[str],
) -> None:
    _reject_unknown_fields(
        session,
        {
            "id",
            "toolName",
            "resourceUri",
            "requestedBy",
            "requestedAt",
            "updatedAt",
            "expiresAt",
            "resolvedAt",
            "resolvedBy",
            "status",
            "terminalReason",
            "request",
            "decision",
            "events",
        },
        path,
        issues,
    )
    _require_string(session, "id", path, issues, SESSION_ID_PATTERN)
    tool_name = _require_string(session, "toolName", path, issues, TOOL_NAME_PATTERN)
    resource_uri = _require_string(session, "resourceUri", path, issues)
    _require_string(session, "requestedBy", path, issues, USER_ID_PATTERN)
    requested_at = _require_timestamp(session, "requestedAt", path, issues)
    updated_at = _require_timestamp(session, "updatedAt", path, issues)
    expires_at = _optional_timestamp(session, "expiresAt", path, issues)
    resolved_at = _optional_timestamp(session, "resolvedAt", path, issues)
    status = _require_string(session, "status", path, issues, allowed=SESSION_STATUSES)
    if "resolvedBy" in session:
        _require_string(session, "resolvedBy", path, issues, USER_ID_PATTERN)
    if "terminalReason" in session:
        _require_string(session, "terminalReason", path, issues, min_length=1, max_length=180)

    if isinstance(resource_uri, str):
        _require_local_uri(resource_uri, f"{path}.resourceUri", issues)
        if resources_by_uri and resource_uri not in resources_by_uri:
            issues.append(f"{path}.resourceUri: does not match a resource uri")
    if isinstance(tool_name, str) and tools_by_name and tool_name not in tools_by_name:
        issues.append(f"{path}.toolName: does not match a tool name")

    _validate_request(session.get("request"), f"{path}.request", issues)
    _validate_events(session.get("events"), f"{path}.events", status, requested_at, updated_at, issues)
    _validate_terminal_status(session, path, status, requested_at, updated_at, expires_at, resolved_at, issues)


def _validate_request(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"reason", "parameters"}, path, issues)
    _require_string(value, "reason", path, issues, min_length=1, max_length=180)
    if not _is_record(value.get("parameters")):
        issues.append(f"{path}.parameters: must be an object")


def _validate_events(
    value: Any,
    path: str,
    status: Optional[str],
    requested_at: Optional[datetime],
    updated_at: Optional[datetime],
    issues: list[str],
) -> None:
    events = _require_array({"events": value}, "events", path.rsplit(".", 1)[0], issues, min_length=1)
    seen_ids: set[str] = set()
    previous_at: Optional[datetime] = None
    event_types: set[str] = set()
    for index, event in enumerate(events):
        item_path = f"{path}[{index}]"
        if not _is_record(event):
            issues.append(f"{item_path}: must be an object")
            continue
        _reject_unknown_fields(event, {"id", "type", "at", "message"}, item_path, issues)
        event_id = _require_string(event, "id", item_path, issues, EVENT_ID_PATTERN)
        event_type = _require_string(event, "type", item_path, issues, allowed=EVENT_TYPES)
        event_at = _require_timestamp(event, "at", item_path, issues)
        _require_string(event, "message", item_path, issues, min_length=1, max_length=180)
        _track_unique(event_id, seen_ids, f"{item_path}.id", "event id", issues)
        if isinstance(event_type, str):
            event_types.add(event_type)
        if event_at and requested_at and event_at < requested_at:
            issues.append(f"{item_path}.at: must be on or after requestedAt")
        if event_at and updated_at and event_at > updated_at:
            issues.append(f"{item_path}.at: must be on or before updatedAt")
        if event_at and previous_at and event_at < previous_at:
            issues.append(f"{item_path}.at: events must be chronological")
        if event_at:
            previous_at = event_at

    if "requested" not in event_types:
        issues.append(f"{path}: must include a requested event")
    if status in TERMINAL_STATUSES and status not in event_types:
        issues.append(f"{path}: terminal sessions must include a {status} event")
    if status == "pending" and event_types.intersection(TERMINAL_STATUSES):
        issues.append(f"{path}: pending sessions must not include terminal events")


def _validate_terminal_status(
    session: dict[str, Any],
    path: str,
    status: Optional[str],
    requested_at: Optional[datetime],
    updated_at: Optional[datetime],
    expires_at: Optional[datetime],
    resolved_at: Optional[datetime],
    issues: list[str],
) -> None:
    if requested_at and updated_at and updated_at < requested_at:
        issues.append(f"{path}.updatedAt: must be on or after requestedAt")
    if expires_at and requested_at and expires_at <= requested_at:
        issues.append(f"{path}.expiresAt: must be after requestedAt")
    if status == "pending":
        for field in ("resolvedAt", "resolvedBy", "decision", "terminalReason"):
            if field in session:
                issues.append(f"{path}.{field}: pending sessions must not include terminal fields")
        if expires_at and updated_at and expires_at <= updated_at:
            issues.append(f"{path}.expiresAt: pending sessions must expire after updatedAt")
        return

    if status not in TERMINAL_STATUSES:
        return

    if not resolved_at:
        issues.append(f"{path}.resolvedAt: terminal sessions must include resolvedAt")
    if resolved_at and requested_at and resolved_at < requested_at:
        issues.append(f"{path}.resolvedAt: must be on or after requestedAt")
    if resolved_at and updated_at and updated_at < resolved_at:
        issues.append(f"{path}.updatedAt: must be on or after resolvedAt")

    if status in DECISION_STATUSES:
        if "resolvedBy" not in session:
            issues.append(f"{path}.resolvedBy: {status} sessions must include resolvedBy")
        _validate_decision(session.get("decision"), f"{path}.decision", status, resolved_at, issues)
    elif "decision" in session:
        issues.append(f"{path}.decision: expired sessions must not include a decision")

    if status == "expired":
        if not expires_at:
            issues.append(f"{path}.expiresAt: expired sessions must include expiresAt")
        if expires_at and resolved_at and expires_at > resolved_at:
            issues.append(f"{path}.expiresAt: expired sessions must expire on or before resolvedAt")
        if "terminalReason" not in session:
            issues.append(f"{path}.terminalReason: expired sessions must include terminalReason")
    elif "terminalReason" in session:
        issues.append(f"{path}.terminalReason: only expired sessions may include terminalReason")


def _validate_decision(
    value: Any,
    path: str,
    expected_outcome: str,
    resolved_at: Optional[datetime],
    issues: list[str],
) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"id", "outcome", "at", "by", "summary"}, path, issues)
    _require_string(value, "id", path, issues, DECISION_ID_PATTERN)
    outcome = _require_string(value, "outcome", path, issues, allowed=DECISION_STATUSES)
    decision_at = _require_timestamp(value, "at", path, issues)
    _require_string(value, "by", path, issues, USER_ID_PATTERN)
    _require_string(value, "summary", path, issues, min_length=1, max_length=180)
    if isinstance(outcome, str) and outcome != expected_outcome:
        issues.append(f"{path}.outcome: must match session status")
    if decision_at and resolved_at and decision_at != resolved_at:
        issues.append(f"{path}.at: must match resolvedAt")


def _require_schema_object(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    if value.get("type") != "object":
        issues.append(f"{path}.type: must be object")
    if not _is_record(value.get("properties")):
        issues.append(f"{path}.properties: must be an object")
    if "required" in value:
        _validate_string_array(value["required"], f"{path}.required", issues)
    if "additionalProperties" in value and not isinstance(value["additionalProperties"], bool):
        issues.append(f"{path}.additionalProperties: must be a boolean")


def _require_local_uri(value: str, path: str, issues: list[str]) -> None:
    parsed = urlparse(value)
    if parsed.scheme not in ALLOWED_LOCAL_SCHEMES:
        issues.append(f"{path}: must use a local URI scheme")
        return
    if not parsed.netloc:
        issues.append(f"{path}: must include a local URI authority")
    if not parsed.path or parsed.path == "/":
        issues.append(f"{path}: must include a path")
    if parsed.params or parsed.query or parsed.fragment:
        issues.append(f"{path}: must not include params, query, or fragment")


def _scan_secret_shapes(value: Any, path: str, issues: list[str]) -> None:
    if _is_record(value):
        for key, item in value.items():
            child_path = f"{path}.{key}"
            if SENSITIVE_FIELD_PATTERN.search(str(key)):
                issues.append(f"{child_path}: secret-shaped field name is not allowed")
            _scan_secret_shapes(item, child_path, issues)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _scan_secret_shapes(item, f"{path}[{index}]", issues)
    elif isinstance(value, str):
        for pattern in SECRET_VALUE_PATTERNS:
            if pattern.search(value):
                issues.append(f"{path}: secret-shaped value is not allowed")
                break


def _reject_unknown_fields(
    value: dict[str, Any], allowed: set[str], path: str, issues: list[str]
) -> None:
    for key in sorted(set(value) - allowed):
        issues.append(f"{path}.{key}: unknown field")


def _require_exact_string(
    value: dict[str, Any], field: str, expected: str, path: str, issues: list[str]
) -> Optional[str]:
    actual = _require_string(value, field, path, issues)
    if isinstance(actual, str) and actual != expected:
        issues.append(f"{path}.{field}: must be {expected}")
    return actual


def _require_string(
    value: dict[str, Any],
    field: str,
    path: str,
    issues: list[str],
    pattern: Optional[re.Pattern[str]] = None,
    *,
    allowed: Optional[set[str]] = None,
    min_length: int = 0,
    max_length: Optional[int] = None,
) -> Optional[str]:
    actual = value.get(field)
    if not isinstance(actual, str):
        issues.append(f"{path}.{field}: must be a string")
        return None
    if len(actual) < min_length:
        issues.append(f"{path}.{field}: must not be empty")
    if max_length is not None and len(actual) > max_length:
        issues.append(f"{path}.{field}: must be at most {max_length} characters")
    if pattern and not pattern.match(actual):
        issues.append(f"{path}.{field}: has invalid format")
    if allowed and actual not in allowed:
        issues.append(f"{path}.{field}: must be one of {', '.join(sorted(allowed))}")
    return actual


def _require_timestamp(
    value: dict[str, Any], field: str, path: str, issues: list[str]
) -> Optional[datetime]:
    actual = _require_string(value, field, path, issues)
    if not isinstance(actual, str):
        return None
    parsed = _parse_timestamp(actual)
    if parsed is None:
        issues.append(f"{path}.{field}: must be an ISO-8601 millisecond UTC timestamp")
    return parsed


def _optional_timestamp(
    value: dict[str, Any], field: str, path: str, issues: list[str]
) -> Optional[datetime]:
    if field not in value:
        return None
    return _require_timestamp(value, field, path, issues)


def _parse_timestamp(value: str) -> Optional[datetime]:
    if not TIMESTAMP_PATTERN.match(value):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _require_bool(value: dict[str, Any], field: str, path: str, issues: list[str]) -> Optional[bool]:
    actual = value.get(field)
    if not isinstance(actual, bool):
        issues.append(f"{path}.{field}: must be a boolean")
        return None
    return actual


def _require_exact_bool(
    value: dict[str, Any], field: str, expected: bool, path: str, issues: list[str]
) -> Optional[bool]:
    actual = _require_bool(value, field, path, issues)
    if isinstance(actual, bool) and actual is not expected:
        issues.append(f"{path}.{field}: must be {str(expected).lower()}")
    return actual


def _require_integer(
    value: dict[str, Any],
    field: str,
    path: str,
    issues: list[str],
    *,
    minimum: Optional[int] = None,
) -> Optional[int]:
    actual = value.get(field)
    if not isinstance(actual, int) or isinstance(actual, bool):
        issues.append(f"{path}.{field}: must be an integer")
        return None
    if minimum is not None and actual < minimum:
        issues.append(f"{path}.{field}: must be at least {minimum}")
    return actual


def _require_array(
    value: dict[str, Any],
    field: str,
    path: str,
    issues: list[str],
    *,
    min_length: int = 0,
) -> list[Any]:
    actual = value.get(field)
    if not isinstance(actual, list):
        issues.append(f"{path}.{field}: must be an array")
        return []
    if len(actual) < min_length:
        issues.append(f"{path}.{field}: must contain at least {min_length} item(s)")
    return actual


def _validate_string_array(
    value: Any, path: str, issues: list[str], *, min_length: int = 0
) -> None:
    if not isinstance(value, list):
        issues.append(f"{path}: must be an array")
        return
    if len(value) < min_length:
        issues.append(f"{path}: must contain at least {min_length} item(s)")
    seen: set[str] = set()
    for index, item in enumerate(value):
        item_path = f"{path}[{index}]"
        if not isinstance(item, str) or not item:
            issues.append(f"{item_path}: must be a non-empty string")
            continue
        _track_unique(item, seen, item_path, "string array value", issues)


def _track_unique(
    value: Any, seen: set[str], path: str, label: str, issues: list[str]
) -> None:
    if not isinstance(value, str):
        return
    if value in seen:
        issues.append(f"{path}: duplicates {label}")
    seen.add(value)


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Validate MCP gateway example fixtures.")
    parser.add_argument(
        "root",
        nargs="?",
        default=str(DEFAULT_FIXTURE_ROOT),
        help="Directory containing MCP gateway fixture JSON files.",
    )
    args = parser.parse_args(argv)

    report = validate_mcp_gateway_fixtures(Path(args.root))
    if report.ok:
        print(f"MCP gateway fixtures OK: {report.root}")
        return 0

    print(f"MCP gateway fixtures invalid: {report.root}")
    for issue in report.issues:
        print(f"- {issue}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
