#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse


FIXTURE_FILE_NAMES = (
    "resources.json",
    "tools.json",
    "approval-sessions.json",
    "api-requests.json",
    "safety-samples.json",
    "runtime-router.json",
)
DEFAULT_FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "examples" / "mcp-gateway"
SCHEMA_VERSION = "mcp-gateway-fixtures.v1"
RUNTIME_ROUTER_SCHEMA_VERSION = "mcp-runtime-router-fixture.v1"

TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
RESOURCE_ID_PATTERN = re.compile(r"^res_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
TOOL_ID_PATTERN = re.compile(r"^tool_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
TOOL_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
SESSION_ID_PATTERN = re.compile(r"^aps_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
DECISION_ID_PATTERN = re.compile(r"^apd_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
EVENT_ID_PATTERN = re.compile(r"^ape_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
USER_ID_PATTERN = re.compile(r"^user_[A-Za-z0-9_-]{1,64}$")
ACTOR_ID_PATTERN = re.compile(r"^act_[A-Za-z0-9_-]{1,64}$")
SAFETY_SAMPLE_ID_PATTERN = re.compile(r"^safety_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
API_REQUEST_ID_PATTERN = re.compile(
    r"^api_(?:resource_list|resource_read|tool_list|tool_call|approval_list|approval_decision)$"
)
RUNTIME_ROUTER_REQUEST_ID_PATTERN = re.compile(
    r"^runtime_(?:resource_list|resource_read|tool_call_safety|approval_create|approval_list_pending|approval_decision)$"
)

ALLOWED_LOCAL_SCHEMES = {"fixture", "local", "memory", "workspace"}
SAFE_LOCAL_TOOL_NAMES = {
    "create_task_proposal",
    "draft_document_patch",
    "link_evidence",
    "propose_automation_rule",
}
RESOURCE_MIME_TYPES = {"application/json", "text/plain", "text/markdown"}
SESSION_STATUSES = {"pending", "approved", "rejected", "expired", "canceled"}
TERMINAL_STATUSES = {"approved", "rejected", "expired", "canceled"}
DECISION_STATUSES = {"approved", "rejected", "canceled"}
EVENT_TYPES = {"requested", "approved", "rejected", "expired", "canceled", "noted"}
SAFETY_POLICY_DECISIONS = {"allow", "require_approval", "deny"}
SAFETY_TRUST_VALUE = "untrusted"
SAFETY_MARKER_BEGIN = "<UNTRUSTED_CONTENT>"
SAFETY_MARKER_END = "</UNTRUSTED_CONTENT>"
API_ROUTE_KINDS = {
    ("GET", "/v1/mcp/resources"): "resource_list",
    ("POST", "/v1/mcp/resources/read"): "resource_read",
    ("GET", "/v1/mcp/tools"): "tool_list",
    ("POST", "/v1/mcp/tools/call"): "tool_call",
    ("GET", "/v1/mcp/approval-sessions"): "approval_list",
    ("POST", "/v1/mcp/approval-sessions/{sessionId}/decision"): "approval_decision",
}
EXPECTED_API_ROUTE_KINDS = set(API_ROUTE_KINDS.values())
HTTP_METHODS = {"GET", "POST"}
RUNTIME_ROUTER_ROUTE_KEYS = (
    "GET /v1/mcp/approval-sessions",
    "GET /v1/mcp/resources",
    "GET /v1/mcp/tools",
    "POST /v1/mcp/approval-sessions/:sessionId/decision",
    "POST /v1/mcp/resources/read",
    "POST /v1/mcp/tools/call",
    "POST /v1/mcp/tools/execute",
)
RUNTIME_ROUTER_REQUEST_IDS = (
    "runtime_resource_list",
    "runtime_resource_read",
    "runtime_tool_call_safety",
    "runtime_approval_create",
    "runtime_approval_list_pending",
    "runtime_approval_decision",
)

SENSITIVE_FIELD_PATTERN = re.compile(
    r"(?i)(?:authorization|password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret)"
)
SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~-]{12,}"),
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
            _require_json_compatible(loaded, name, issues)

    resources_by_uri: dict[str, dict[str, Any]] = {}
    resources_by_id: dict[str, dict[str, Any]] = {}
    tools_by_name: dict[str, dict[str, Any]] = {}
    sessions_by_id: dict[str, dict[str, Any]] = {}

    if "resources.json" in data:
        resources_by_uri = _validate_resources(data["resources.json"], "resources.json", issues)
        resources_by_id = _records_by_string_field(resources_by_uri.values(), "id")
    if "tools.json" in data:
        tools_by_name = _validate_tools(data["tools.json"], "tools.json", issues)
    if "approval-sessions.json" in data:
        sessions_by_id = _validate_sessions(
            data["approval-sessions.json"],
            "approval-sessions.json",
            resources_by_uri,
            tools_by_name,
            issues,
        )
    if "api-requests.json" in data:
        _validate_api_requests(
            data["api-requests.json"],
            "api-requests.json",
            resources_by_id,
            resources_by_uri,
            tools_by_name,
            sessions_by_id,
            issues,
        )
    if "safety-samples.json" in data:
        _validate_safety_samples(
            data["safety-samples.json"],
            "safety-samples.json",
            issues,
        )
    if "runtime-router.json" in data:
        _validate_runtime_router(
            data["runtime-router.json"],
            "runtime-router.json",
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
) -> dict[str, dict[str, Any]]:
    sessions_by_id: dict[str, dict[str, Any]] = {}
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return sessions_by_id

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
        if isinstance(session_id, str):
            sessions_by_id[session_id] = session
        _track_unique(session_id, seen_ids, f"{item_path}.id", "session id", issues)

    return sessions_by_id


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


def _validate_api_requests(
    value: Any,
    path: str,
    resources_by_id: dict[str, dict[str, Any]],
    resources_by_uri: dict[str, dict[str, Any]],
    tools_by_name: dict[str, dict[str, Any]],
    sessions_by_id: dict[str, dict[str, Any]],
    issues: list[str],
) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return

    _reject_unknown_fields(value, {"schemaVersion", "generatedAt", "requests"}, path, issues)
    _require_exact_string(value, "schemaVersion", SCHEMA_VERSION, path, issues)
    _require_timestamp(value, "generatedAt", path, issues)
    requests = _require_array(value, "requests", path, issues, min_length=len(API_ROUTE_KINDS))

    seen_ids: set[str] = set()
    seen_route_kinds: set[str] = set()
    for index, example in enumerate(requests):
        item_path = f"{path}.requests[{index}]"
        if not _is_record(example):
            issues.append(f"{item_path}: must be an object")
            continue

        _reject_unknown_fields(example, {"id", "title", "route", "request", "response"}, item_path, issues)
        example_id = _require_string(example, "id", item_path, issues, API_REQUEST_ID_PATTERN)
        _require_string(example, "title", item_path, issues, min_length=1, max_length=100)
        route = _validate_api_route(example.get("route"), f"{item_path}.route", issues)
        request = _validate_api_request_envelope(example.get("request"), f"{item_path}.request", route, issues)
        response = _validate_api_response_envelope(example.get("response"), f"{item_path}.response", issues)
        _track_unique(example_id, seen_ids, f"{item_path}.id", "api request id", issues)

        if not route:
            continue
        route_kind = route["kind"]
        expected_id = f"api_{route_kind}"
        if isinstance(example_id, str) and example_id != expected_id:
            issues.append(f"{item_path}.id: must be {expected_id} for route {route['path']}")
        seen_route_kinds.add(route_kind)

        request_body = request.get("body") if request else None
        response_body = response.get("body") if response else None
        if route_kind == "resource_list":
            _validate_api_resource_list(response_body, f"{item_path}.response.body", resources_by_id, resources_by_uri, issues)
        elif route_kind == "resource_read":
            _validate_api_resource_read(
                request_body,
                response_body,
                f"{item_path}",
                resources_by_id,
                resources_by_uri,
                issues,
            )
        elif route_kind == "tool_list":
            _validate_api_tool_list(response_body, f"{item_path}.response.body", tools_by_name, issues)
        elif route_kind == "tool_call":
            _validate_api_tool_call(request_body, response_body, f"{item_path}", tools_by_name, issues)
        elif route_kind == "approval_list":
            _validate_api_approval_list(response_body, f"{item_path}.response.body", sessions_by_id, issues)
        elif route_kind == "approval_decision":
            _validate_api_approval_decision(request_body, response_body, f"{item_path}", sessions_by_id, issues)

    for route_kind in sorted(EXPECTED_API_ROUTE_KINDS - seen_route_kinds):
        issues.append(f"{path}.requests: missing {route_kind} example")


def _validate_safety_samples(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return

    _reject_unknown_fields(value, {"schemaVersion", "generatedAt", "markers", "samples", "replay"}, path, issues)
    _require_exact_string(value, "schemaVersion", SCHEMA_VERSION, path, issues)
    _require_timestamp(value, "generatedAt", path, issues)
    _validate_safety_markers(value.get("markers"), f"{path}.markers", issues)
    samples = _require_array(value, "samples", path, issues, min_length=2)
    _validate_safety_replay(value.get("replay"), f"{path}.replay", issues)

    seen_ids: set[str] = set()
    decisions: set[str] = set()
    for index, sample in enumerate(samples):
        item_path = f"{path}.samples[{index}]"
        decision = _validate_safety_sample(sample, item_path, issues)
        if isinstance(decision, str):
            decisions.add(decision)
        if _is_record(sample):
            _track_unique(sample.get("id"), seen_ids, f"{item_path}.id", "safety sample id", issues)

    if "allow" not in decisions:
        issues.append(f"{path}.samples: must include an allowed safety sample")
    if "require_approval" not in decisions:
        issues.append(f"{path}.samples: must include an approval-required safety sample")


def _validate_safety_markers(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return

    _reject_unknown_fields(value, {"trust", "begin", "end", "metadataKey", "rawContentArgument"}, path, issues)
    _require_exact_string(value, "trust", SAFETY_TRUST_VALUE, path, issues)
    _require_exact_string(value, "begin", SAFETY_MARKER_BEGIN, path, issues)
    _require_exact_string(value, "end", SAFETY_MARKER_END, path, issues)
    _require_exact_string(value, "metadataKey", "trust", path, issues)
    _require_exact_string(value, "rawContentArgument", "rawUntrustedContent", path, issues)


def _validate_safety_sample(value: Any, path: str, issues: list[str]) -> Optional[str]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None

    _reject_unknown_fields(value, {"id", "title", "source", "content", "toolRequest", "expected"}, path, issues)
    sample_id = _require_string(value, "id", path, issues, SAFETY_SAMPLE_ID_PATTERN)
    _require_string(value, "title", path, issues, min_length=1, max_length=100)
    _validate_safety_source(value.get("source"), f"{path}.source", issues)
    content = _require_string(value, "content", path, issues, min_length=1)
    if isinstance(content, str):
        _validate_safety_marked_content(content, f"{path}.content", issues)
    tool_name = _validate_safety_tool_request(
        value.get("toolRequest"),
        f"{path}.toolRequest",
        sample_id,
        content,
        issues,
    )
    return _validate_safety_expected(value.get("expected"), f"{path}.expected", tool_name, issues)


def _validate_safety_source(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return

    _reject_unknown_fields(value, {"kind", "label", "trust"}, path, issues)
    _require_string(value, "kind", path, issues, TOOL_NAME_PATTERN)
    _require_string(value, "label", path, issues, min_length=1, max_length=80)
    _require_exact_string(value, "trust", SAFETY_TRUST_VALUE, path, issues)


def _validate_safety_marked_content(value: str, path: str, issues: list[str]) -> None:
    trimmed = value.strip()
    if not trimmed.startswith(SAFETY_MARKER_BEGIN):
        issues.append(f"{path}: must start with {SAFETY_MARKER_BEGIN}")
    if not trimmed.endswith(SAFETY_MARKER_END):
        issues.append(f"{path}: must end with {SAFETY_MARKER_END}")
    if value.count(SAFETY_MARKER_BEGIN) != 1:
        issues.append(f"{path}: must include exactly one begin marker")
    if value.count(SAFETY_MARKER_END) != 1:
        issues.append(f"{path}: must include exactly one end marker")
    begin = value.find(SAFETY_MARKER_BEGIN)
    end = value.find(SAFETY_MARKER_END)
    if begin >= 0 and end > begin:
        inner = value[begin + len(SAFETY_MARKER_BEGIN):end].strip()
        if not inner:
            issues.append(f"{path}: must include marked untrusted text")


def _validate_safety_tool_request(
    value: Any,
    path: str,
    sample_id: Optional[str],
    content: Optional[str],
    issues: list[str],
) -> Optional[str]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None

    _reject_unknown_fields(value, {"toolName", "arguments", "metadata"}, path, issues)
    tool_name = _require_string(value, "toolName", path, issues, TOOL_NAME_PATTERN, allowed=SAFE_LOCAL_TOOL_NAMES)
    arguments = value.get("arguments")
    if not _is_record(arguments):
        issues.append(f"{path}.arguments: must be an object")
    else:
        raw_content = _require_string(arguments, "rawUntrustedContent", f"{path}.arguments", issues, min_length=1)
        if isinstance(content, str) and isinstance(raw_content, str) and raw_content != content:
            issues.append(f"{path}.arguments.rawUntrustedContent: must match sample content")

    metadata = value.get("metadata")
    if not _is_record(metadata):
        issues.append(f"{path}.metadata: must be an object")
    else:
        _reject_unknown_fields(
            metadata,
            {"sourceId", "trust", "allowedTools", "approvalId", "fixtureReplay"},
            f"{path}.metadata",
            issues,
        )
        source_id = _require_string(metadata, "sourceId", f"{path}.metadata", issues, SAFETY_SAMPLE_ID_PATTERN)
        if isinstance(source_id, str) and isinstance(sample_id, str) and source_id != sample_id:
            issues.append(f"{path}.metadata.sourceId: must match sample id")
        _require_exact_string(metadata, "trust", SAFETY_TRUST_VALUE, f"{path}.metadata", issues)
        _validate_string_array(metadata.get("allowedTools"), f"{path}.metadata.allowedTools", issues, min_length=1)
        allowed_tools = metadata.get("allowedTools")
        if isinstance(tool_name, str) and isinstance(allowed_tools, list) and tool_name not in allowed_tools:
            issues.append(f"{path}.metadata.allowedTools: must include toolName")
        if "approvalId" in metadata:
            _require_string(metadata, "approvalId", f"{path}.metadata", issues, min_length=1, max_length=100)
        if "fixtureReplay" in metadata:
            _require_exact_bool(metadata, "fixtureReplay", True, f"{path}.metadata", issues)

    return tool_name


def _validate_safety_expected(
    value: Any,
    path: str,
    tool_name: Optional[str],
    issues: list[str],
) -> Optional[str]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None

    _reject_unknown_fields(
        value,
        {"policyDecision", "durableSideEffects", "approvalRequired", "handlerRuns"},
        path,
        issues,
    )
    decision = _require_string(value, "policyDecision", path, issues, allowed=SAFETY_POLICY_DECISIONS)
    _require_exact_bool(value, "durableSideEffects", False, path, issues)
    approval_required = _require_bool(value, "approvalRequired", path, issues)
    handler_runs = _require_bool(value, "handlerRuns", path, issues)
    if decision == "require_approval" and approval_required is not True:
        issues.append(f"{path}.approvalRequired: must be true when policyDecision is require_approval")
    if decision == "allow" and approval_required is not False:
        issues.append(f"{path}.approvalRequired: must be false when policyDecision is allow")
    if decision in {"deny", "require_approval"} and handler_runs is not False:
        issues.append(f"{path}.handlerRuns: must be false when policy stops execution")
    if decision == "allow" and handler_runs is not True:
        issues.append(f"{path}.handlerRuns: must be true when policyDecision is allow")
    if tool_name == "draft_document_patch" and decision == "allow":
        issues.append(f"{path}.policyDecision: draft_document_patch examples must require review")
    return decision


def _validate_safety_replay(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return

    _reject_unknown_fields(value, {"commands"}, path, issues)
    commands = _require_array(value, "commands", path, issues, min_length=3)
    command_text = "\n".join(command for command in commands if isinstance(command, str))
    for index, command in enumerate(commands):
        if not isinstance(command, str) or not command:
            issues.append(f"{path}.commands[{index}]: must be a non-empty string")
            continue
        lower_command = command.lower()
        if "https://" in lower_command or "curl " in lower_command or "npx " in lower_command:
            issues.append(f"{path}.commands[{index}]: must stay local and deterministic")
        if "npm install -g" in lower_command:
            issues.append(f"{path}.commands[{index}]: must not require global installs")

    if "scripts\\validate_mcp_gateway_fixtures.py" not in command_text:
        issues.append(f"{path}.commands: must include fixture validation")
    if "mcp api replay" not in command_text or "examples\\mcp-gateway\\api-requests.json" not in command_text:
        issues.append(f"{path}.commands: must include API fixture replay")
    if "mcp demo tool" not in command_text:
        issues.append(f"{path}.commands: must include CLI tool replay")
    if "createMcpGatewayRuntime" not in command_text:
        issues.append(f"{path}.commands: must include local runtime SDK use")


def _validate_api_route(value: Any, path: str, issues: list[str]) -> Optional[dict[str, str]]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None
    _reject_unknown_fields(value, {"method", "path"}, path, issues)
    method = _require_string(value, "method", path, issues, allowed=HTTP_METHODS)
    route_path = _require_string(value, "path", path, issues, min_length=1, max_length=120)
    if not isinstance(method, str) or not isinstance(route_path, str):
        return None

    route_kind = API_ROUTE_KINDS.get((method, route_path))
    decision_match = re.fullmatch(
        r"/v1/mcp/approval-sessions/(aps_[a-z][a-z0-9]*(?:_[a-z0-9]+)*)/decision",
        route_path,
    )
    if not route_kind and method == "POST" and decision_match:
        return {
            "method": method,
            "path": route_path,
            "kind": "approval_decision",
            "sessionId": decision_match.group(1),
        }
    if not route_kind:
        allowed = ", ".join(f"{allowed_method} {allowed_path}" for allowed_method, allowed_path in sorted(API_ROUTE_KINDS))
        issues.append(f"{path}: route must be one of {allowed}")
        return None
    return {"method": method, "path": route_path, "kind": route_kind}


def _validate_api_request_envelope(
    value: Any,
    path: str,
    route: Optional[dict[str, str]],
    issues: list[str],
) -> Optional[dict[str, Any]]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None
    _reject_unknown_fields(value, {"headers", "query", "body"}, path, issues)
    if "headers" in value:
        _validate_string_map(value["headers"], f"{path}.headers", issues)
    if "query" in value:
        _validate_string_map(value["query"], f"{path}.query", issues)

    body = value.get("body")
    if route and route["method"] == "GET" and body is not None:
        issues.append(f"{path}.body: GET examples must use null body")
    if route and route["method"] == "POST" and not _is_record(body):
        issues.append(f"{path}.body: POST examples must use an object body")
    return value


def _validate_api_response_envelope(
    value: Any, path: str, issues: list[str]
) -> Optional[dict[str, Any]]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None
    _reject_unknown_fields(value, {"status", "body"}, path, issues)
    _require_integer(value, "status", path, issues, minimum=100, maximum=599)
    if not _is_record(value.get("body")):
        issues.append(f"{path}.body: must be an object")
    return value


def _validate_api_resource_list(
    body: Any,
    path: str,
    resources_by_id: dict[str, dict[str, Any]],
    resources_by_uri: dict[str, dict[str, Any]],
    issues: list[str],
) -> None:
    if not _is_record(body):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(body, {"resources"}, path, issues)
    resources = _require_array(body, "resources", path, issues, min_length=1)
    for index, resource in enumerate(resources):
        _validate_resource_reference(
            resource,
            f"{path}.resources[{index}]",
            resources_by_id,
            resources_by_uri,
            issues,
        )


def _validate_api_resource_read(
    request_body: Any,
    response_body: Any,
    path: str,
    resources_by_id: dict[str, dict[str, Any]],
    resources_by_uri: dict[str, dict[str, Any]],
    issues: list[str],
) -> None:
    if not _is_record(request_body):
        issues.append(f"{path}.request.body: must be an object")
        return
    _reject_unknown_fields(request_body, {"resourceUri"}, f"{path}.request.body", issues)
    requested_uri = _require_string(request_body, "resourceUri", f"{path}.request.body", issues)
    if isinstance(requested_uri, str):
        _require_local_uri(requested_uri, f"{path}.request.body.resourceUri", issues)
        if resources_by_uri and requested_uri not in resources_by_uri:
            issues.append(f"{path}.request.body.resourceUri: does not match a resource uri")

    if not _is_record(response_body):
        issues.append(f"{path}.response.body: must be an object")
        return
    _reject_unknown_fields(response_body, {"resource", "content"}, f"{path}.response.body", issues)
    resource = _validate_resource_reference(
        response_body.get("resource"),
        f"{path}.response.body.resource",
        resources_by_id,
        resources_by_uri,
        issues,
    )
    if resource and isinstance(requested_uri, str) and resource.get("uri") != requested_uri:
        issues.append(f"{path}.response.body.resource.uri: must match requested resourceUri")

    content = response_body.get("content")
    if not _is_record(content):
        issues.append(f"{path}.response.body.content: must be an object")
        return
    _reject_unknown_fields(content, {"uri", "mimeType", "json", "text", "blob"}, f"{path}.response.body.content", issues)
    content_uri = _require_string(content, "uri", f"{path}.response.body.content", issues)
    content_mime = _require_string(content, "mimeType", f"{path}.response.body.content", issues, allowed=RESOURCE_MIME_TYPES)
    if isinstance(content_uri, str) and isinstance(requested_uri, str) and content_uri != requested_uri:
        issues.append(f"{path}.response.body.content.uri: must match requested resourceUri")
    if resource and isinstance(content_mime, str) and content_mime != resource.get("mimeType"):
        issues.append(f"{path}.response.body.content.mimeType: must match resource mimeType")
    if "json" not in content and "text" not in content and "blob" not in content:
        issues.append(f"{path}.response.body.content: must include json, text, or blob")
    if "text" in content and not isinstance(content["text"], str):
        issues.append(f"{path}.response.body.content.text: must be a string")
    if "blob" in content and not isinstance(content["blob"], str):
        issues.append(f"{path}.response.body.content.blob: must be a string")


def _validate_api_tool_list(
    body: Any,
    path: str,
    tools_by_name: dict[str, dict[str, Any]],
    issues: list[str],
) -> None:
    if not _is_record(body):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(body, {"tools"}, path, issues)
    tools = _require_array(body, "tools", path, issues, min_length=1)
    for index, tool in enumerate(tools):
        _validate_tool_reference(tool, f"{path}.tools[{index}]", tools_by_name, issues)


def _validate_api_tool_call(
    request_body: Any,
    response_body: Any,
    path: str,
    tools_by_name: dict[str, dict[str, Any]],
    issues: list[str],
) -> None:
    if not _is_record(request_body):
        issues.append(f"{path}.request.body: must be an object")
        return
    _reject_unknown_fields(request_body, {"toolName", "arguments"}, f"{path}.request.body", issues)
    tool_name = _require_string(request_body, "toolName", f"{path}.request.body", issues, TOOL_NAME_PATTERN)
    arguments = request_body.get("arguments")
    if not _is_record(arguments):
        issues.append(f"{path}.request.body.arguments: must be an object")
    tool = tools_by_name.get(tool_name) if isinstance(tool_name, str) else None
    if isinstance(tool_name, str) and tools_by_name and not tool:
        issues.append(f"{path}.request.body.toolName: does not match a tool name")
    if tool and _is_record(arguments):
        _validate_payload_against_object_schema(arguments, tool.get("inputSchema"), f"{path}.request.body.arguments", issues)

    if not _is_record(response_body):
        issues.append(f"{path}.response.body: must be an object")
        return
    _reject_unknown_fields(response_body, {"toolName", "result"}, f"{path}.response.body", issues)
    response_tool_name = _require_string(response_body, "toolName", f"{path}.response.body", issues, TOOL_NAME_PATTERN)
    if isinstance(tool_name, str) and isinstance(response_tool_name, str) and response_tool_name != tool_name:
        issues.append(f"{path}.response.body.toolName: must match request toolName")
    result = response_body.get("result")
    if not _is_record(result):
        issues.append(f"{path}.response.body.result: must be an object")
    elif tool:
        _validate_payload_against_object_schema(result, tool.get("outputSchema"), f"{path}.response.body.result", issues)


def _validate_api_approval_list(
    body: Any,
    path: str,
    sessions_by_id: dict[str, dict[str, Any]],
    issues: list[str],
) -> None:
    if not _is_record(body):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(body, {"sessions"}, path, issues)
    sessions = _require_array(body, "sessions", path, issues, min_length=1)
    for index, session in enumerate(sessions):
        _validate_session_reference(
            session,
            f"{path}.sessions[{index}]",
            sessions_by_id,
            issues,
            compare_status=True,
        )


def _validate_api_approval_decision(
    request_body: Any,
    response_body: Any,
    path: str,
    sessions_by_id: dict[str, dict[str, Any]],
    issues: list[str],
) -> None:
    if not _is_record(request_body):
        issues.append(f"{path}.request.body: must be an object")
        return
    _reject_unknown_fields(request_body, {"sessionId", "decision", "actor", "reason", "metadata"}, f"{path}.request.body", issues)
    session_id = _require_string(request_body, "sessionId", f"{path}.request.body", issues, SESSION_ID_PATTERN)
    action = _require_string(request_body, "decision", f"{path}.request.body", issues, allowed={"approve", "reject"})
    outcome = {"approve": "approved", "reject": "rejected"}.get(action or "")
    actor = request_body.get("actor")
    if not _is_record(actor):
        issues.append(f"{path}.request.body.actor: must be an object")
        decided_by = None
    else:
        _reject_unknown_fields(actor, {"id", "roles", "metadata"}, f"{path}.request.body.actor", issues)
        decided_by = _require_string(actor, "id", f"{path}.request.body.actor", issues, USER_ID_PATTERN)
        if "roles" in actor:
            _validate_string_array(actor["roles"], f"{path}.request.body.actor.roles", issues)
        if "metadata" in actor:
            _require_json_compatible(actor["metadata"], f"{path}.request.body.actor.metadata", issues)
    if "reason" in request_body:
        _require_string(request_body, "reason", f"{path}.request.body", issues, min_length=1, max_length=180)
    if "metadata" in request_body:
        _require_json_compatible(request_body["metadata"], f"{path}.request.body.metadata", issues)
    session = sessions_by_id.get(session_id) if isinstance(session_id, str) else None
    if isinstance(session_id, str) and sessions_by_id and not session:
        issues.append(f"{path}.request.body.sessionId: does not match an approval session id")
    if session and session.get("status") != "pending":
        issues.append(f"{path}.request.body.sessionId: approval decision examples must reference a pending session")

    if not _is_record(response_body):
        issues.append(f"{path}.response.body: must be an object")
        return
    _reject_unknown_fields(response_body, {"session"}, f"{path}.response.body", issues)
    response_session = _validate_session_reference(
        response_body.get("session"),
        f"{path}.response.body.session",
        sessions_by_id,
        issues,
        compare_status=False,
    )
    if response_session and isinstance(session_id, str) and response_session.get("id") != session_id:
        issues.append(f"{path}.response.body.session.id: must match request sessionId")
    if _is_record(response_body.get("session")):
        status = _require_string(
            response_body["session"],
            "status",
            f"{path}.response.body.session",
            issues,
            allowed=SESSION_STATUSES,
        )
        if isinstance(status, str) and isinstance(outcome, str) and status != outcome:
            issues.append(f"{path}.response.body.session.status: must match request outcome")

    if _is_record(response_body.get("session")):
        decision = response_body["session"].get("decision")
        _validate_api_decision_snapshot(decision, f"{path}.response.body.session.decision", outcome or "", issues)
        if _is_record(decision):
            actor_value = decision.get("actor")
            if _is_record(actor_value) and isinstance(decided_by, str) and actor_value.get("id") != decided_by:
                issues.append(f"{path}.response.body.session.decision.actor.id: must match request actor.id")


def _validate_api_decision_snapshot(
    value: Any,
    path: str,
    expected_status: str,
    issues: list[str],
) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"status", "at", "actor", "reason", "metadata"}, path, issues)
    status = _require_string(value, "status", path, issues, allowed=DECISION_STATUSES)
    _require_timestamp(value, "at", path, issues)
    actor = value.get("actor")
    if not _is_record(actor):
        issues.append(f"{path}.actor: must be an object")
    else:
        _reject_unknown_fields(actor, {"id", "roles", "metadata"}, f"{path}.actor", issues)
        _require_string(actor, "id", f"{path}.actor", issues, USER_ID_PATTERN)
        if "roles" in actor:
            _validate_string_array(actor["roles"], f"{path}.actor.roles", issues)
        if "metadata" in actor:
            _require_json_compatible(actor["metadata"], f"{path}.actor.metadata", issues)
    if "reason" in value:
        _require_string(value, "reason", path, issues, min_length=1, max_length=180)
    if "metadata" in value:
        _require_json_compatible(value["metadata"], f"{path}.metadata", issues)
    if isinstance(status, str) and status != expected_status:
        issues.append(f"{path}.status: must match session status")


def _validate_runtime_router(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return

    _reject_unknown_fields(
        value,
        {"schemaVersion", "generatedAt", "mount", "runtime", "routes", "requests"},
        path,
        issues,
    )
    _require_exact_string(value, "schemaVersion", RUNTIME_ROUTER_SCHEMA_VERSION, path, issues)
    _require_timestamp(value, "generatedAt", path, issues)
    _validate_runtime_mount(value.get("mount"), f"{path}.mount", issues)
    _validate_runtime_config(value.get("runtime"), f"{path}.runtime", issues)
    _validate_runtime_routes(value.get("routes"), f"{path}.routes", issues)
    _validate_runtime_requests(value.get("requests"), f"{path}.requests", issues)


def _validate_runtime_mount(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return

    _reject_unknown_fields(value, {"basePath", "pathStyle"}, path, issues)
    _require_exact_string(value, "basePath", "/v1/mcp", path, issues)
    _require_exact_string(value, "pathStyle", "openapi", path, issues)


def _validate_runtime_config(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return

    _reject_unknown_fields(
        value,
        {"clock", "approvalIdPrefix", "toolDefaultDecision", "toolPolicyRules"},
        path,
        issues,
    )
    clock = value.get("clock")
    if not _is_record(clock):
        issues.append(f"{path}.clock: must be an object")
    else:
        _reject_unknown_fields(clock, {"startAt", "incrementMs"}, f"{path}.clock", issues)
        _require_timestamp(clock, "startAt", f"{path}.clock", issues)
        _require_integer(clock, "incrementMs", f"{path}.clock", issues, minimum=1, maximum=1000)

    _require_exact_string(value, "approvalIdPrefix", "runtime_fixture_approval_", path, issues)
    _require_exact_string(value, "toolDefaultDecision", "deny", path, issues)
    _validate_runtime_tool_policy_rules(
        value.get("toolPolicyRules"),
        f"{path}.toolPolicyRules",
        issues,
    )


def _validate_runtime_tool_policy_rules(value: Any, path: str, issues: list[str]) -> None:
    rules = _require_array({"toolPolicyRules": value}, "toolPolicyRules", path.rsplit(".", 1)[0], issues, min_length=2)
    rules_by_tool: dict[str, str] = {}
    seen_ids: set[str] = set()

    for index, rule in enumerate(rules):
        item_path = f"{path}[{index}]"
        if not _is_record(rule):
            issues.append(f"{item_path}: must be an object")
            continue
        _reject_unknown_fields(
            rule,
            {"id", "toolName", "decision", "reason", "match", "approvalId"},
            item_path,
            issues,
        )
        rule_id = _require_string(rule, "id", item_path, issues, min_length=1, max_length=100)
        tool_name = _require_string(
            rule,
            "toolName",
            item_path,
            issues,
            TOOL_NAME_PATTERN,
            allowed=SAFE_LOCAL_TOOL_NAMES,
        )
        decision = _require_string(rule, "decision", item_path, issues, allowed=SAFETY_POLICY_DECISIONS)
        if "reason" in rule:
            _require_string(rule, "reason", item_path, issues, min_length=1, max_length=180)
        if "match" in rule:
            _require_string(rule, "match", item_path, issues, allowed={"exact", "prefix"})
        if "approvalId" in rule:
            _require_string(rule, "approvalId", item_path, issues, min_length=1, max_length=100)
        _track_unique(rule_id, seen_ids, f"{item_path}.id", "runtime policy rule id", issues)
        if isinstance(tool_name, str) and isinstance(decision, str):
            rules_by_tool[tool_name] = decision

    if rules_by_tool.get("create_task_proposal") != "allow":
        issues.append(f"{path}: must allow create_task_proposal for the safety annotation call")
    if rules_by_tool.get("draft_document_patch") != "require_approval":
        issues.append(f"{path}: must require approval for draft_document_patch")


def _validate_runtime_routes(value: Any, path: str, issues: list[str]) -> None:
    routes = _require_array({"routes": value}, "routes", path.rsplit(".", 1)[0], issues, min_length=len(RUNTIME_ROUTER_ROUTE_KEYS))
    route_keys: list[str] = []
    seen_keys: set[str] = set()

    for index, route in enumerate(routes):
        item_path = f"{path}[{index}]"
        if not _is_record(route):
            issues.append(f"{item_path}: must be an object")
            continue
        _reject_unknown_fields(route, {"method", "path", "description"}, item_path, issues)
        method = _require_string(route, "method", item_path, issues, allowed=HTTP_METHODS)
        route_path = _require_string(route, "path", item_path, issues, min_length=1, max_length=120)
        _require_string(route, "description", item_path, issues, min_length=1, max_length=180)
        if isinstance(method, str) and isinstance(route_path, str):
            route_key = f"{method} {route_path}"
            route_keys.append(route_key)
            _track_unique(route_key, seen_keys, item_path, "runtime route", issues)

    if route_keys and route_keys != list(RUNTIME_ROUTER_ROUTE_KEYS):
        issues.append(f"{path}: must match the mounted OpenAPI MCP route list")


def _validate_runtime_requests(value: Any, path: str, issues: list[str]) -> None:
    requests = _require_array({"requests": value}, "requests", path.rsplit(".", 1)[0], issues, min_length=len(RUNTIME_ROUTER_REQUEST_IDS))
    examples_by_id: dict[str, dict[str, Any]] = {}
    ordered_ids: list[str] = []
    seen_ids: set[str] = set()

    for index, example in enumerate(requests):
        item_path = f"{path}[{index}]"
        if not _is_record(example):
            issues.append(f"{item_path}: must be an object")
            continue
        _reject_unknown_fields(example, {"id", "title", "request", "response"}, item_path, issues)
        example_id = _require_string(example, "id", item_path, issues, RUNTIME_ROUTER_REQUEST_ID_PATTERN)
        _require_string(example, "title", item_path, issues, min_length=1, max_length=120)
        request = _validate_runtime_dispatch_request(example.get("request"), f"{item_path}.request", issues)
        response = _validate_runtime_dispatch_response(example.get("response"), f"{item_path}.response", issues)
        _track_unique(example_id, seen_ids, f"{item_path}.id", "runtime router request id", issues)

        if isinstance(example_id, str):
            if example_id not in RUNTIME_ROUTER_REQUEST_IDS:
                issues.append(f"{item_path}.id: is not a supported runtime router request id")
            examples_by_id[example_id] = example
            ordered_ids.append(example_id)
            _validate_runtime_step(example_id, request, response, item_path, issues)

    if ordered_ids and ordered_ids != list(RUNTIME_ROUTER_REQUEST_IDS):
        issues.append(f"{path}: must order examples as {', '.join(RUNTIME_ROUTER_REQUEST_IDS)}")
    for expected_id in RUNTIME_ROUTER_REQUEST_IDS:
        if expected_id not in examples_by_id:
            issues.append(f"{path}: missing {expected_id} example")
    _validate_runtime_approval_links(examples_by_id, path, issues)


def _validate_runtime_dispatch_request(
    value: Any,
    path: str,
    issues: list[str],
) -> Optional[dict[str, Any]]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None
    _reject_unknown_fields(value, {"method", "path", "headers", "body", "actorId"}, path, issues)
    method = _require_string(value, "method", path, issues, allowed=HTTP_METHODS)
    route_path = _require_string(value, "path", path, issues, min_length=1, max_length=160)
    if "headers" in value:
        _validate_string_map(value["headers"], f"{path}.headers", issues)
    if "actorId" in value:
        _require_string(value, "actorId", path, issues, ACTOR_ID_PATTERN)
    if "body" in value and value["body"] is not None:
        if not _is_record(value["body"]):
            issues.append(f"{path}.body: must be an object when provided")
        else:
            _require_json_compatible(value["body"], f"{path}.body", issues)
    if isinstance(method, str) and isinstance(route_path, str) and not _runtime_route_kind(method, route_path):
        issues.append(f"{path}: route is not a mounted runtime MCP API route")
    return value


def _validate_runtime_dispatch_response(
    value: Any,
    path: str,
    issues: list[str],
) -> Optional[dict[str, Any]]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None
    _reject_unknown_fields(value, {"status", "headers", "body"}, path, issues)
    _require_integer(value, "status", path, issues, minimum=100, maximum=599)
    if "headers" in value:
        _validate_string_map(value["headers"], f"{path}.headers", issues)
        if _is_record(value["headers"]) and value["headers"].get("content-type") != "application/json; charset=utf-8":
            issues.append(f"{path}.headers.content-type: must be application/json; charset=utf-8")
    if not _is_record(value.get("body")):
        issues.append(f"{path}.body: must be an object")
    else:
        _require_json_compatible(value["body"], f"{path}.body", issues)
    return value


def _validate_runtime_step(
    example_id: str,
    request: Optional[dict[str, Any]],
    response: Optional[dict[str, Any]],
    path: str,
    issues: list[str],
) -> None:
    if example_id == "runtime_resource_list":
        _require_runtime_route(request, "GET", "/v1/mcp/resources", f"{path}.request", issues)
        _require_runtime_status(response, 200, f"{path}.response", issues)
        _validate_runtime_resource_list(_runtime_body(response), f"{path}.response.body", issues)
    elif example_id == "runtime_resource_read":
        _require_runtime_route(request, "POST", "/v1/mcp/resources/read", f"{path}.request", issues)
        _require_runtime_status(response, 200, f"{path}.response", issues)
        _validate_runtime_resource_read(_runtime_body(request), _runtime_body(response), path, issues)
    elif example_id == "runtime_tool_call_safety":
        _require_runtime_route(request, "POST", "/v1/mcp/tools/call", f"{path}.request", issues)
        _require_runtime_status(response, 200, f"{path}.response", issues)
        _validate_runtime_safety_tool_call(_runtime_body(request), _runtime_body(response), path, issues)
    elif example_id == "runtime_approval_create":
        _require_runtime_route(request, "POST", "/v1/mcp/tools/call", f"{path}.request", issues)
        _require_runtime_status(response, 409, f"{path}.response", issues)
        _validate_runtime_approval_required(_runtime_body(request), _runtime_body(response), path, issues)
    elif example_id == "runtime_approval_list_pending":
        _require_runtime_route(request, "GET", "/v1/mcp/approval-sessions", f"{path}.request", issues)
        _require_runtime_status(response, 200, f"{path}.response", issues)
        _validate_runtime_approval_list(_runtime_body(response), f"{path}.response.body", issues)
    elif example_id == "runtime_approval_decision":
        if request and isinstance(request.get("path"), str) and not re.fullmatch(
            r"/v1/mcp/approval-sessions/[^/]+/decision",
            request["path"],
        ):
            issues.append(f"{path}.request.path: must target an approval session decision route")
        _require_runtime_status(response, 200, f"{path}.response", issues)
        _validate_runtime_approval_decision(_runtime_body(request), _runtime_body(response), path, issues)


def _validate_runtime_resource_list(body: Any, path: str, issues: list[str]) -> None:
    if not _is_record(body):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(body, {"resources"}, path, issues)
    resources = _require_array(body, "resources", path, issues, min_length=1)
    for index, resource in enumerate(resources):
        _validate_runtime_resource_summary(resource, f"{path}.resources[{index}]", issues)


def _validate_runtime_resource_summary(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"uri", "name", "description", "mimeType"}, path, issues)
    uri = _require_string(value, "uri", path, issues, min_length=1)
    _require_string(value, "name", path, issues, min_length=1, max_length=80)
    if "description" in value:
        _require_string(value, "description", path, issues, min_length=1, max_length=240)
    if "mimeType" in value:
        _require_string(value, "mimeType", path, issues, allowed=RESOURCE_MIME_TYPES)
    if isinstance(uri, str) and not uri.startswith("sovereignops://"):
        issues.append(f"{path}.uri: must use the default runtime sovereignops scheme")


def _validate_runtime_resource_read(
    request_body: Any,
    response_body: Any,
    path: str,
    issues: list[str],
) -> None:
    if not _is_record(request_body):
        issues.append(f"{path}.request.body: must be an object")
        return
    _reject_unknown_fields(request_body, {"uri", "actor", "metadata"}, f"{path}.request.body", issues)
    requested_uri = _require_string(request_body, "uri", f"{path}.request.body", issues, min_length=1)
    if isinstance(requested_uri, str) and not requested_uri.startswith("sovereignops://"):
        issues.append(f"{path}.request.body.uri: must use the default runtime sovereignops scheme")

    if not _is_record(response_body):
        issues.append(f"{path}.response.body: must be an object")
        return
    _reject_unknown_fields(response_body, {"contents"}, f"{path}.response.body", issues)
    contents = _require_array(response_body, "contents", f"{path}.response.body", issues, min_length=1)
    for index, content in enumerate(contents):
        item_path = f"{path}.response.body.contents[{index}]"
        if not _is_record(content):
            issues.append(f"{item_path}: must be an object")
            continue
        _reject_unknown_fields(content, {"uri", "mimeType", "text", "blob", "trust", "safety"}, item_path, issues)
        content_uri = _require_string(content, "uri", item_path, issues, min_length=1)
        _require_string(content, "mimeType", item_path, issues, allowed=RESOURCE_MIME_TYPES)
        if isinstance(requested_uri, str) and isinstance(content_uri, str) and content_uri != requested_uri:
            issues.append(f"{item_path}.uri: must match request body uri")
        if "text" in content and not isinstance(content["text"], str):
            issues.append(f"{item_path}.text: must be a string")
        if "blob" in content and not isinstance(content["blob"], str):
            issues.append(f"{item_path}.blob: must be a string")
        if "trust" in content:
            _require_string(content, "trust", item_path, issues, allowed={"trusted", "review", "untrusted"})
        if "safety" in content:
            _validate_runtime_safety_annotation(
                content["safety"],
                f"{item_path}.safety",
                issues,
                require_findings=False,
                allowed_scopes={"mcp_resource_content"},
            )


def _validate_runtime_safety_tool_call(
    request_body: Any,
    response_body: Any,
    path: str,
    issues: list[str],
) -> None:
    if not _is_record(request_body):
        issues.append(f"{path}.request.body: must be an object")
        return
    _reject_unknown_fields(request_body, {"name", "toolName", "arguments", "actor", "metadata"}, f"{path}.request.body", issues)
    tool_name = request_body.get("toolName", request_body.get("name"))
    if not isinstance(tool_name, str) or tool_name != "create_task_proposal":
        issues.append(f"{path}.request.body.name: must call create_task_proposal")
    arguments = request_body.get("arguments")
    if not _is_record(arguments):
        issues.append(f"{path}.request.body.arguments: must be an object")
    elif not isinstance(arguments.get("title"), str) or SAFETY_MARKER_BEGIN not in arguments["title"]:
        issues.append(f"{path}.request.body.arguments.title: must include marked untrusted content")
    if "metadata" in request_body and not _is_record(request_body["metadata"]):
        issues.append(f"{path}.request.body.metadata: must be an object")

    if not _is_record(response_body):
        issues.append(f"{path}.response.body: must be an object")
        return
    _reject_unknown_fields(response_body, {"content", "structuredContent", "safety"}, f"{path}.response.body", issues)
    _validate_runtime_safety_annotation(
        response_body.get("safety"),
        f"{path}.response.body.safety",
        issues,
        require_findings=True,
    )
    structured = response_body.get("structuredContent")
    if not _is_record(structured):
        issues.append(f"{path}.response.body.structuredContent: must be an object")
    else:
        _validate_runtime_safety_annotation(
            structured.get("_safety"),
            f"{path}.response.body.structuredContent._safety",
            issues,
            require_findings=True,
        )
    content = _require_array(response_body, "content", f"{path}.response.body", issues, min_length=1)
    if content:
        first = content[0]
        if not _is_record(first):
            issues.append(f"{path}.response.body.content[0]: must be an object")
        else:
            _reject_unknown_fields(first, {"type", "text", "safety"}, f"{path}.response.body.content[0]", issues)
            _require_exact_string(first, "type", "text", f"{path}.response.body.content[0]", issues)
            _require_string(first, "text", f"{path}.response.body.content[0]", issues, min_length=1)
            _validate_runtime_safety_annotation(
                first.get("safety"),
                f"{path}.response.body.content[0].safety",
                issues,
                require_findings=True,
            )


def _validate_runtime_approval_required(
    request_body: Any,
    response_body: Any,
    path: str,
    issues: list[str],
) -> None:
    if not _is_record(request_body):
        issues.append(f"{path}.request.body: must be an object")
        return
    tool_name = request_body.get("toolName", request_body.get("name"))
    if tool_name != "draft_document_patch":
        issues.append(f"{path}.request.body.name: must call draft_document_patch")

    if not _is_record(response_body):
        issues.append(f"{path}.response.body: must be an object")
        return
    _reject_unknown_fields(response_body, {"error"}, f"{path}.response.body", issues)
    error = response_body.get("error")
    if not _is_record(error):
        issues.append(f"{path}.response.body.error: must be an object")
        return
    _reject_unknown_fields(error, {"code", "message", "details"}, f"{path}.response.body.error", issues)
    _require_exact_string(error, "code", "approval_required", f"{path}.response.body.error", issues)
    _require_string(error, "message", f"{path}.response.body.error", issues, min_length=1, max_length=180)
    details = error.get("details")
    if not _is_record(details):
        issues.append(f"{path}.response.body.error.details: must be an object")
        return
    _reject_unknown_fields(
        details,
        {"toolName", "decision", "reason", "ruleId", "approvalId", "policy"},
        f"{path}.response.body.error.details",
        issues,
    )
    _require_exact_string(details, "toolName", "draft_document_patch", f"{path}.response.body.error.details", issues)
    _require_exact_string(details, "decision", "require_approval", f"{path}.response.body.error.details", issues)
    _require_string(details, "reason", f"{path}.response.body.error.details", issues, min_length=1, max_length=180)
    _require_string(details, "ruleId", f"{path}.response.body.error.details", issues, min_length=1, max_length=100)
    _require_string(details, "approvalId", f"{path}.response.body.error.details", issues, min_length=1, max_length=100)
    policy = details.get("policy")
    if not _is_record(policy):
        issues.append(f"{path}.response.body.error.details.policy: must be an object")
    else:
        _reject_unknown_fields(policy, {"decision", "toolName", "reason", "ruleId", "approvalId"}, f"{path}.response.body.error.details.policy", issues)
        _require_exact_string(policy, "decision", "require_approval", f"{path}.response.body.error.details.policy", issues)
        _require_exact_string(policy, "toolName", "draft_document_patch", f"{path}.response.body.error.details.policy", issues)


def _validate_runtime_approval_list(body: Any, path: str, issues: list[str]) -> None:
    if not _is_record(body):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(body, {"sessions"}, path, issues)
    sessions = _require_array(body, "sessions", path, issues, min_length=1)
    for index, session in enumerate(sessions):
        _validate_runtime_session_snapshot(session, f"{path}.sessions[{index}]", issues)


def _validate_runtime_approval_decision(
    request_body: Any,
    response_body: Any,
    path: str,
    issues: list[str],
) -> None:
    if not _is_record(request_body):
        issues.append(f"{path}.request.body: must be an object")
    else:
        _reject_unknown_fields(request_body, {"sessionId", "decision", "actor", "reason", "metadata"}, f"{path}.request.body", issues)
        _require_string(request_body, "decision", f"{path}.request.body", issues, allowed={"approve", "reject"})
        if "reason" in request_body:
            _require_string(request_body, "reason", f"{path}.request.body", issues, min_length=1, max_length=180)

    if not _is_record(response_body):
        issues.append(f"{path}.response.body: must be an object")
        return
    _reject_unknown_fields(response_body, {"session"}, f"{path}.response.body", issues)
    _validate_runtime_session_snapshot(response_body.get("session"), f"{path}.response.body.session", issues)


def _validate_runtime_session_snapshot(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(
        value,
        {
            "id",
            "status",
            "createdAt",
            "updatedAt",
            "expiresAt",
            "request",
            "actor",
            "reason",
            "ruleId",
            "metadata",
            "decision",
            "approvedAt",
            "approvedBy",
            "rejectedAt",
            "rejectedBy",
            "expiredAt",
            "expiredBy",
        },
        path,
        issues,
    )
    _require_string(value, "id", path, issues, min_length=1, max_length=100)
    status = _require_string(value, "status", path, issues, allowed={"pending", "approved", "rejected", "expired"})
    _require_timestamp(value, "createdAt", path, issues)
    _require_timestamp(value, "updatedAt", path, issues)
    if "expiresAt" in value:
        _require_timestamp(value, "expiresAt", path, issues)
    if not _is_record(value.get("request")):
        issues.append(f"{path}.request: must be an object")
    else:
        _require_json_compatible(value["request"], f"{path}.request", issues)
    if "actor" in value:
        _validate_runtime_actor(value["actor"], f"{path}.actor", issues)
    if "approvedBy" in value:
        _validate_runtime_actor(value["approvedBy"], f"{path}.approvedBy", issues)
    if "rejectedBy" in value:
        _validate_runtime_actor(value["rejectedBy"], f"{path}.rejectedBy", issues)
    if "expiredBy" in value:
        _validate_runtime_actor(value["expiredBy"], f"{path}.expiredBy", issues)
    if "reason" in value:
        _require_string(value, "reason", path, issues, min_length=1, max_length=180)
    if "ruleId" in value:
        _require_string(value, "ruleId", path, issues, min_length=1, max_length=100)
    if "metadata" in value:
        _require_json_compatible(value["metadata"], f"{path}.metadata", issues)
    if status in {"approved", "rejected", "expired"}:
        _validate_runtime_decision_snapshot(value.get("decision"), f"{path}.decision", status or "", issues)


def _validate_runtime_decision_snapshot(
    value: Any,
    path: str,
    expected_status: str,
    issues: list[str],
) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"status", "at", "actor", "reason", "metadata"}, path, issues)
    status = _require_string(value, "status", path, issues, allowed={"approved", "rejected", "expired"})
    _require_timestamp(value, "at", path, issues)
    if "actor" in value:
        _validate_runtime_actor(value["actor"], f"{path}.actor", issues)
    if "reason" in value:
        _require_string(value, "reason", path, issues, min_length=1, max_length=180)
    if "metadata" in value:
        _require_json_compatible(value["metadata"], f"{path}.metadata", issues)
    if isinstance(status, str) and status != expected_status:
        issues.append(f"{path}.status: must match session status")


def _validate_runtime_safety_annotation(
    value: Any,
    path: str,
    issues: list[str],
    *,
    require_findings: bool,
    allowed_scopes: Optional[set[str]] = None,
) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"schemaVersion", "scope", "trustLevel", "action", "reasons", "findings"}, path, issues)
    _require_integer(value, "schemaVersion", path, issues, minimum=1, maximum=1)
    _require_string(value, "scope", path, issues, allowed=allowed_scopes or {"mcp_tool_output"})
    trust_level = _require_string(value, "trustLevel", path, issues, allowed={"trusted", "review", "untrusted"})
    _require_exact_string(value, "action", "mark_only", path, issues)
    _validate_string_array(value.get("reasons"), f"{path}.reasons", issues, min_length=1)
    findings = _require_array(value, "findings", path, issues, min_length=1 if require_findings else 0)
    if require_findings and trust_level == "trusted":
        issues.append(f"{path}.trustLevel: must mark reviewed or untrusted output when findings are present")
    for index, finding in enumerate(findings):
        item_path = f"{path}.findings[{index}]"
        if not _is_record(finding):
            issues.append(f"{item_path}: must be an object")
            continue
        _reject_unknown_fields(finding, {"id", "severity", "path", "reason", "excerpt"}, item_path, issues)
        _require_string(finding, "id", item_path, issues, min_length=1, max_length=100)
        _require_string(finding, "severity", item_path, issues, allowed={"medium", "high"})
        _require_string(finding, "path", item_path, issues, min_length=1, max_length=120)
        _require_string(finding, "reason", item_path, issues, min_length=1, max_length=180)
        _require_string(finding, "excerpt", item_path, issues, min_length=1, max_length=180)


def _validate_runtime_actor(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"id", "roles", "metadata"}, path, issues)
    _require_string(value, "id", path, issues, ACTOR_ID_PATTERN)
    if "roles" in value:
        _validate_string_array(value["roles"], f"{path}.roles", issues)
    if "metadata" in value:
        _require_json_compatible(value["metadata"], f"{path}.metadata", issues)


def _validate_runtime_approval_links(
    examples_by_id: dict[str, dict[str, Any]],
    path: str,
    issues: list[str],
) -> None:
    create = examples_by_id.get("runtime_approval_create")
    approval_id = _runtime_approval_id(create)
    if not approval_id:
        return

    pending = examples_by_id.get("runtime_approval_list_pending")
    pending_sessions = _runtime_body(pending.get("response") if pending else None)
    if _is_record(pending_sessions):
        sessions = pending_sessions.get("sessions")
        if isinstance(sessions, list):
            if not any(_is_record(session) and session.get("id") == approval_id and session.get("status") == "pending" for session in sessions):
                issues.append(f"{path}: pending approval list must include the created approval session")

    decision = examples_by_id.get("runtime_approval_decision")
    if decision:
        request = decision.get("request")
        response = decision.get("response")
        expected_path = f"/v1/mcp/approval-sessions/{approval_id}/decision"
        if _is_record(request) and request.get("path") != expected_path:
            issues.append(f"{path}: approval decision path must use the created approval id")
        body = _runtime_body(response)
        session = body.get("session") if _is_record(body) else None
        if _is_record(session) and session.get("id") != approval_id:
            issues.append(f"{path}: approval decision response must return the created approval id")


def _runtime_approval_id(example: Optional[dict[str, Any]]) -> Optional[str]:
    if not example:
        return None
    body = _runtime_body(example.get("response"))
    if not _is_record(body):
        return None
    error = body.get("error")
    if not _is_record(error):
        return None
    details = error.get("details")
    if not _is_record(details):
        return None
    approval_id = details.get("approvalId")
    return approval_id if isinstance(approval_id, str) else None


def _runtime_body(value: Optional[dict[str, Any]]) -> Any:
    return value.get("body") if _is_record(value) else None


def _require_runtime_route(
    request: Optional[dict[str, Any]],
    method: str,
    route_path: str,
    path: str,
    issues: list[str],
) -> None:
    if not _is_record(request):
        return
    if request.get("method") != method:
        issues.append(f"{path}.method: must be {method}")
    if request.get("path") != route_path:
        issues.append(f"{path}.path: must be {route_path}")


def _require_runtime_status(
    response: Optional[dict[str, Any]],
    status: int,
    path: str,
    issues: list[str],
) -> None:
    if _is_record(response) and response.get("status") != status:
        issues.append(f"{path}.status: must be {status}")


def _runtime_route_kind(method: str, route_path: str) -> Optional[str]:
    if method == "GET" and route_path == "/v1/mcp/resources":
        return "resource_list"
    if method == "POST" and route_path == "/v1/mcp/resources/read":
        return "resource_read"
    if method == "GET" and route_path == "/v1/mcp/tools":
        return "tool_list"
    if method == "POST" and route_path == "/v1/mcp/tools/call":
        return "tool_call"
    if method == "POST" and route_path == "/v1/mcp/tools/execute":
        return "tool_execute"
    if method == "GET" and route_path == "/v1/mcp/approval-sessions":
        return "approval_list"
    if method == "POST" and re.fullmatch(r"/v1/mcp/approval-sessions/[^/]+/decision", route_path):
        return "approval_decision"
    return None


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


def _validate_resource_reference(
    value: Any,
    path: str,
    resources_by_id: dict[str, dict[str, Any]],
    resources_by_uri: dict[str, dict[str, Any]],
    issues: list[str],
) -> Optional[dict[str, Any]]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None
    _reject_unknown_fields(
        value,
        {"id", "uri", "name", "description", "mimeType", "sizeBytes", "updatedAt", "tags"},
        path,
        issues,
    )
    resource_id = _require_string(value, "id", path, issues, RESOURCE_ID_PATTERN)
    uri = _require_string(value, "uri", path, issues)
    resource = resources_by_id.get(resource_id) if isinstance(resource_id, str) else None
    if isinstance(resource_id, str) and resources_by_id and not resource:
        issues.append(f"{path}.id: does not match a resource id")
    if isinstance(uri, str):
        _require_local_uri(uri, f"{path}.uri", issues)
        if resources_by_uri and uri not in resources_by_uri:
            issues.append(f"{path}.uri: does not match a resource uri")
    if resource and isinstance(uri, str) and resource.get("uri") != uri:
        issues.append(f"{path}.uri: must match resource id")

    for field in ("name", "description", "mimeType"):
        if field in value:
            actual = _require_string(value, field, path, issues, min_length=1)
            if resource and isinstance(actual, str) and actual != resource.get(field):
                issues.append(f"{path}.{field}: must match resource fixture")
    if "sizeBytes" in value:
        actual_size = _require_integer(value, "sizeBytes", path, issues, minimum=0)
        if resource and isinstance(actual_size, int) and actual_size != resource.get("sizeBytes"):
            issues.append(f"{path}.sizeBytes: must match resource fixture")
    if "updatedAt" in value:
        _require_timestamp(value, "updatedAt", path, issues)
        if resource and value.get("updatedAt") != resource.get("updatedAt"):
            issues.append(f"{path}.updatedAt: must match resource fixture")
    if "tags" in value:
        _validate_string_array(value["tags"], f"{path}.tags", issues, min_length=1)
        if resource and value.get("tags") != resource.get("tags"):
            issues.append(f"{path}.tags: must match resource fixture")
    return resource


def _validate_tool_reference(
    value: Any,
    path: str,
    tools_by_name: dict[str, dict[str, Any]],
    issues: list[str],
) -> Optional[dict[str, Any]]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None
    _reject_unknown_fields(
        value,
        {"id", "name", "title", "description", "readOnly", "requiresApproval", "localOnly"},
        path,
        issues,
    )
    tool_id = _require_string(value, "id", path, issues, TOOL_ID_PATTERN)
    name = _require_string(value, "name", path, issues, TOOL_NAME_PATTERN)
    tool = tools_by_name.get(name) if isinstance(name, str) else None
    if isinstance(name, str) and tools_by_name and not tool:
        issues.append(f"{path}.name: does not match a tool name")
    if tool and isinstance(tool_id, str) and tool.get("id") != tool_id:
        issues.append(f"{path}.id: must match tool name")

    for field in ("title", "description"):
        if field in value:
            actual = _require_string(value, field, path, issues, min_length=1)
            if tool and isinstance(actual, str) and actual != tool.get(field):
                issues.append(f"{path}.{field}: must match tool fixture")
    for field in ("readOnly", "requiresApproval", "localOnly"):
        if field in value:
            actual = _require_bool(value, field, path, issues)
            if tool and isinstance(actual, bool) and actual != tool.get(field):
                issues.append(f"{path}.{field}: must match tool fixture")
    return tool


def _validate_session_reference(
    value: Any,
    path: str,
    sessions_by_id: dict[str, dict[str, Any]],
    issues: list[str],
    *,
    compare_status: bool,
) -> Optional[dict[str, Any]]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None
    _reject_unknown_fields(value, {"id", "toolName", "resourceUri", "status", "decision"}, path, issues)
    session_id = _require_string(value, "id", path, issues, SESSION_ID_PATTERN)
    session = sessions_by_id.get(session_id) if isinstance(session_id, str) else None
    if isinstance(session_id, str) and sessions_by_id and not session:
        issues.append(f"{path}.id: does not match an approval session id")

    if "toolName" in value:
        tool_name = _require_string(value, "toolName", path, issues, TOOL_NAME_PATTERN)
        if session and isinstance(tool_name, str) and tool_name != session.get("toolName"):
            issues.append(f"{path}.toolName: must match approval session fixture")
    if "resourceUri" in value:
        resource_uri = _require_string(value, "resourceUri", path, issues)
        if isinstance(resource_uri, str):
            _require_local_uri(resource_uri, f"{path}.resourceUri", issues)
        if session and isinstance(resource_uri, str) and resource_uri != session.get("resourceUri"):
            issues.append(f"{path}.resourceUri: must match approval session fixture")
    if "status" in value:
        status = _require_string(value, "status", path, issues, allowed=SESSION_STATUSES)
        if compare_status and session and isinstance(status, str) and status != session.get("status"):
            issues.append(f"{path}.status: must match approval session fixture")
    return session


def _validate_payload_against_object_schema(
    value: dict[str, Any],
    schema: Any,
    path: str,
    issues: list[str],
) -> None:
    if not _is_record(schema):
        return
    if schema.get("type") != "object":
        issues.append(f"{path}: schema must describe an object")
        return
    properties = schema.get("properties")
    if not _is_record(properties):
        properties = {}
    required = schema.get("required") if isinstance(schema.get("required"), list) else []
    for field in required:
        if isinstance(field, str) and field not in value:
            issues.append(f"{path}.{field}: required by tool schema")
    if schema.get("additionalProperties") is False:
        for field in sorted(set(value) - set(properties)):
            issues.append(f"{path}.{field}: not allowed by tool schema")
    for field, item in value.items():
        property_schema = properties.get(field)
        if _is_record(property_schema):
            _validate_json_schema_value(item, property_schema, f"{path}.{field}", issues)


def _validate_json_schema_value(
    value: Any, schema: dict[str, Any], path: str, issues: list[str]
) -> None:
    schema_type = schema.get("type")
    if schema_type == "string":
        if not isinstance(value, str):
            issues.append(f"{path}: must be a string")
            return
        pattern = schema.get("pattern")
        if isinstance(pattern, str) and not re.match(pattern, value):
            issues.append(f"{path}: does not match tool schema pattern")
    elif schema_type == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            issues.append(f"{path}: must be an integer")
            return
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if isinstance(minimum, int) and value < minimum:
            issues.append(f"{path}: must be at least {minimum}")
        if isinstance(maximum, int) and value > maximum:
            issues.append(f"{path}: must be at most {maximum}")
    elif schema_type == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            issues.append(f"{path}: must be a finite number")
    elif schema_type == "boolean":
        if not isinstance(value, bool):
            issues.append(f"{path}: must be a boolean")
    elif schema_type == "array":
        if not isinstance(value, list):
            issues.append(f"{path}: must be an array")
            return
        item_schema = schema.get("items")
        if _is_record(item_schema):
            for index, item in enumerate(value):
                _validate_json_schema_value(item, item_schema, f"{path}[{index}]", issues)
    elif schema_type == "object" and not _is_record(value):
        issues.append(f"{path}: must be an object")


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
    maximum: Optional[int] = None,
) -> Optional[int]:
    actual = value.get(field)
    if not isinstance(actual, int) or isinstance(actual, bool):
        issues.append(f"{path}.{field}: must be an integer")
        return None
    if minimum is not None and actual < minimum:
        issues.append(f"{path}.{field}: must be at least {minimum}")
    if maximum is not None and actual > maximum:
        issues.append(f"{path}.{field}: must be at most {maximum}")
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


def _validate_string_map(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    for key, item in value.items():
        if not isinstance(key, str) or not key:
            issues.append(f"{path}: keys must be non-empty strings")
        if not isinstance(item, str):
            issues.append(f"{path}.{key}: must be a string")


def _require_json_compatible(value: Any, path: str, issues: list[str]) -> None:
    if value is None or isinstance(value, (str, bool, int)):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            issues.append(f"{path}: must be JSON-compatible")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _require_json_compatible(item, f"{path}[{index}]", issues)
        return
    if _is_record(value):
        for key, item in value.items():
            if not isinstance(key, str):
                issues.append(f"{path}: object keys must be strings")
                continue
            _require_json_compatible(item, f"{path}.{key}", issues)
        return
    issues.append(f"{path}: must be JSON-compatible")


def _records_by_string_field(
    records: Any, field: str
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for record in records:
        if _is_record(record) and isinstance(record.get(field), str):
            result[record[field]] = record
    return result


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
