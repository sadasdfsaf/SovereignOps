from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from .citation import Citation
from .structured import (
    LocalDataSafetyFinding,
    StructuredDocument,
    StructuredImportResult,
    StructuredValidationError,
)

CASE_STATE_OPEN = "open"
CASE_STATE_RELEASED = "released"
CASE_STATE_REJECTED = "rejected"
HIGH_SEVERITIES = frozenset(("high", "critical"))

_DEFAULT_PREVIEW_LIMIT = 240
_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_SECRET_FIELD_RE = re.compile(
    r"\b(password|passcode|secret|api[_-]?key|access[_-]?key|token)\b"
    r"(\s*[:=]\s*)"
    r"([\"']?)[^\s,;\"']+(\3)",
    re.I,
)
_LONG_NUMBER_RE = re.compile(r"\b\d[ -]*\d[ -]*\d[ -]*\d(?:[ -]*\d){8,}\b")
_WHITESPACE_RE = re.compile(r"\s+")


class QuarantineError(ValueError):
    pass


class QuarantineTransitionError(QuarantineError):
    pass


@dataclass(frozen=True)
class QuarantineDecision:
    action: str
    actor_id: str
    timestamp: str
    reason: str
    from_state: str
    to_state: str
    override: bool = False
    audit_event_summary: Mapping[str, object] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, object]:
        return {
            "action": self.action,
            "actor_id": self.actor_id,
            "timestamp": self.timestamp,
            "reason": self.reason,
            "from_state": self.from_state,
            "to_state": self.to_state,
            "override": self.override,
            "audit_event_summary": dict(self.audit_event_summary),
        }


@dataclass(frozen=True)
class QuarantineCase:
    id: str
    source_uri: str
    reason_codes: Tuple[str, ...]
    severity: str
    citation_snapshots: Tuple[Mapping[str, object], ...]
    suggested_next_action: str
    preview_text: str
    state: str = CASE_STATE_OPEN
    decisions: Tuple[QuarantineDecision, ...] = ()

    @property
    def audit_event_summaries(self) -> Tuple[Mapping[str, object], ...]:
        return tuple(decision.audit_event_summary for decision in self.decisions)

    def as_dict(self) -> Dict[str, object]:
        return {
            "id": self.id,
            "source_uri": self.source_uri,
            "reason_codes": self.reason_codes,
            "severity": self.severity,
            "citation_snapshots": tuple(dict(item) for item in self.citation_snapshots),
            "suggested_next_action": self.suggested_next_action,
            "preview_text": self.preview_text,
            "state": self.state,
            "decisions": tuple(decision.as_dict() for decision in self.decisions),
        }


def build_quarantine_cases(records: object) -> Tuple[QuarantineCase, ...]:
    return tuple(build_quarantine_case(record) for record in _expand_records(records))


def build_quarantine_case(record: object) -> QuarantineCase:
    source_uri = _source_uri(record)
    reason_codes = _reason_codes(record)
    severity = _severity(record)
    citation_snapshots = _citation_snapshots(record, source_uri)
    preview_text = redacted_preview_text(_preview_source_text(record))
    suggested_next_action = _suggested_next_action(record, severity)

    case_id = _case_id(
        source_uri=source_uri,
        reason_codes=reason_codes,
        severity=severity,
        citation_snapshots=citation_snapshots,
        preview_text=preview_text,
    )
    return QuarantineCase(
        id=case_id,
        source_uri=source_uri,
        reason_codes=reason_codes,
        severity=severity,
        citation_snapshots=citation_snapshots,
        suggested_next_action=suggested_next_action,
        preview_text=preview_text,
    )


def release_case(
    case: QuarantineCase,
    actor_id: str,
    reason: str,
    timestamp: Optional[object] = None,
    override_high_severity: bool = False,
) -> QuarantineCase:
    return _transition_case(
        case,
        action="release",
        to_state=CASE_STATE_RELEASED,
        actor_id=actor_id,
        reason=reason,
        timestamp=timestamp,
        override_high_severity=override_high_severity,
    )


def reject_case(
    case: QuarantineCase,
    actor_id: str,
    reason: str,
    timestamp: Optional[object] = None,
) -> QuarantineCase:
    return _transition_case(
        case,
        action="reject",
        to_state=CASE_STATE_REJECTED,
        actor_id=actor_id,
        reason=reason,
        timestamp=timestamp,
        override_high_severity=False,
    )


def redacted_preview_text(text: object, limit: int = _DEFAULT_PREVIEW_LIMIT) -> str:
    preview = _WHITESPACE_RE.sub(" ", str(text or "")).strip()
    preview = _EMAIL_RE.sub("[redacted-email]", preview)
    preview = _SECRET_FIELD_RE.sub(lambda match: f"{match.group(1)}{match.group(2)}[redacted]", preview)
    preview = _LONG_NUMBER_RE.sub("[redacted-number]", preview)
    if len(preview) <= limit:
        return preview
    return f"{preview[: max(0, limit - 3)].rstrip()}..."


def _transition_case(
    case: QuarantineCase,
    action: str,
    to_state: str,
    actor_id: str,
    reason: str,
    timestamp: Optional[object],
    override_high_severity: bool,
) -> QuarantineCase:
    if case.state != CASE_STATE_OPEN:
        raise QuarantineTransitionError("quarantine case already has a terminal decision")
    if not actor_id:
        raise QuarantineTransitionError("actor_id is required")
    if not reason:
        raise QuarantineTransitionError("decision reason is required")
    if (
        action == "release"
        and case.severity in HIGH_SEVERITIES
        and not override_high_severity
    ):
        raise QuarantineTransitionError(
            "high-severity quarantine cases require an explicit release override"
        )

    resolved_timestamp = _timestamp(timestamp)
    audit_summary = {
        "event_type": "quarantine_decision",
        "case_id": case.id,
        "source_uri": case.source_uri,
        "action": action,
        "actor_id": actor_id,
        "timestamp": resolved_timestamp,
        "from_state": case.state,
        "to_state": to_state,
        "reason": reason,
        "severity": case.severity,
        "override": bool(override_high_severity),
    }
    decision = QuarantineDecision(
        action=action,
        actor_id=actor_id,
        timestamp=resolved_timestamp,
        reason=reason,
        from_state=case.state,
        to_state=to_state,
        override=bool(override_high_severity),
        audit_event_summary=audit_summary,
    )
    return replace(case, state=to_state, decisions=case.decisions + (decision,))


def _expand_records(records: object) -> Tuple[object, ...]:
    if records is None:
        return ()
    if isinstance(records, StructuredImportResult):
        return tuple(records.validation_errors) + tuple(records.findings)
    if isinstance(records, StructuredDocument):
        return tuple(records.findings) or (records,)
    if isinstance(records, Mapping):
        return (records,)
    if isinstance(records, (str, bytes)):
        return (records,)
    if isinstance(records, Iterable):
        expanded: List[object] = []
        for item in records:
            expanded.extend(_expand_records(item))
        return tuple(expanded)
    return (records,)


def _source_uri(record: object) -> str:
    citation = _field(record, "citation")
    if isinstance(citation, Citation):
        return citation.source_uri
    if isinstance(citation, Mapping):
        citation_source = citation.get("source_uri")
        if citation_source:
            return str(citation_source)

    source_uri = _field(record, "source_uri")
    if source_uri:
        return str(source_uri)

    raise QuarantineError("source_uri is required for quarantine cases")


def _reason_codes(record: object) -> Tuple[str, ...]:
    if isinstance(record, StructuredDocument):
        return ("document_review",)

    value = _field(record, "reason_codes")
    if value is None:
        value = _field(record, "reason_code")
    if value is None:
        value = _field(record, "code")
    if value is None:
        value = "record_review"

    if isinstance(value, str):
        candidates = (value,)
    elif isinstance(value, Iterable):
        candidates = tuple(str(item) for item in value)
    else:
        candidates = (str(value),)

    ordered: List[str] = []
    seen = set()
    for code in candidates:
        normalized = code.strip() or "record_review"
        if normalized in seen:
            continue
        ordered.append(normalized)
        seen.add(normalized)
    return tuple(ordered)


def _severity(record: object) -> str:
    if isinstance(record, StructuredValidationError):
        metadata_severity = record.metadata.get("severity")
        if metadata_severity:
            return _normalize_severity(metadata_severity)
        return "medium"
    severity = _field(record, "severity")
    return _normalize_severity(severity or "medium")


def _normalize_severity(value: object) -> str:
    normalized = str(value).strip().lower().replace("_", "-")
    aliases = {
        "critical": "critical",
        "high": "high",
        "error": "medium",
        "medium": "medium",
        "warn": "low",
        "warning": "low",
        "low": "low",
        "notice": "notice",
        "info": "notice",
        "informational": "notice",
    }
    return aliases.get(normalized, "medium")


def _citation_snapshots(record: object, source_uri: str) -> Tuple[Mapping[str, object], ...]:
    value = _field(record, "citation_snapshots")
    if value is None:
        value = _field(record, "citations")
    if value is None:
        value = _field(record, "citation")

    if value is None:
        return ({"source_uri": source_uri, "range": {}, "trusted": False},)

    if isinstance(value, (Citation, Mapping)):
        values = (value,)
    elif isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        values = tuple(value)
    else:
        values = (value,)

    snapshots: List[Mapping[str, object]] = []
    for item in values:
        snapshot = _citation_snapshot(item, source_uri)
        snapshots.append(snapshot)
    return tuple(sorted(snapshots, key=_canonical_json))


def _citation_snapshot(value: object, source_uri: str) -> Mapping[str, object]:
    if isinstance(value, Citation):
        return value.as_dict()
    if isinstance(value, Mapping):
        snapshot = dict(value)
        if "source_uri" not in snapshot:
            snapshot["source_uri"] = source_uri
        if "range" not in snapshot:
            snapshot["range"] = {}
        if "trusted" not in snapshot:
            snapshot["trusted"] = False
        return _json_safe_mapping(snapshot)
    return {"source_uri": source_uri, "range": {"value": str(value)}, "trusted": False}


def _suggested_next_action(record: object, severity: str) -> str:
    value = _field(record, "suggested_next_action")
    if value is None:
        value = _field(record, "next_action")
    if value:
        return str(value)
    if severity in HIGH_SEVERITIES:
        return "manual_review_required"
    if severity == "medium":
        return "review_and_correct_source"
    return "review_if_relevant"


def _preview_source_text(record: object) -> str:
    for field_name in ("preview_text", "content", "text", "message", "normalized_text"):
        value = _field(record, field_name)
        if value is not None:
            return str(value)
    return ""


def _case_id(
    source_uri: str,
    reason_codes: Sequence[str],
    severity: str,
    citation_snapshots: Sequence[Mapping[str, object]],
    preview_text: str,
) -> str:
    payload = {
        "source_uri": source_uri,
        "reason_codes": tuple(reason_codes),
        "severity": severity,
        "citation_snapshots": tuple(citation_snapshots),
        "preview_text": preview_text,
    }
    digest = sha256(_canonical_json(payload).encode("utf-8")).hexdigest()
    return f"q_{digest[:20]}"


def _timestamp(value: Optional[object]) -> str:
    if value is None:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    timestamp = str(value)
    if not timestamp:
        raise QuarantineTransitionError("timestamp is required")
    return timestamp


def _field(record: object, name: str) -> Any:
    if isinstance(record, Mapping):
        return record.get(name)
    return getattr(record, name, None)


def _canonical_json(value: object) -> str:
    return json.dumps(_json_safe(value), ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def _json_safe(value: object) -> object:
    if isinstance(value, Mapping):
        return _json_safe_mapping(value)
    if isinstance(value, (list, tuple)):
        return tuple(_json_safe(item) for item in value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _json_safe_mapping(value: Mapping[str, object]) -> Dict[str, object]:
    return {str(key): _json_safe(value[key]) for key in sorted(value)}
