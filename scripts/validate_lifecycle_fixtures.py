#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


FIXTURE_FILE_NAMES = ("manifest.json", "events.json", "reviews.json")
DEFAULT_FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "examples" / "lifecycle-fixtures"

TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
FINGERPRINT_PATTERN = re.compile(r"^fp_[0-9a-f]{16}$")
BACKUP_ID_PATTERN = re.compile(r"^bkp_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
PAYLOAD_ID_PATTERN = re.compile(r"^pay_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
WORKSPACE_ID_PATTERN = re.compile(r"^wsp_[A-Za-z0-9_-]{1,88}$")
ACTOR_ID_PATTERN = re.compile(r"^act_[A-Za-z0-9_-]{1,88}$")
DEVICE_ID_PATTERN = re.compile(r"^dev_[A-Za-z0-9_-]{1,88}$")
EVENT_ID_PATTERN = re.compile(r"^evt_[A-Za-z0-9_-]{1,88}$")
REVIEW_ID_PATTERN = re.compile(r"^lcr_[A-Za-z0-9_-]{1,88}$")
DECISION_ID_PATTERN = re.compile(r"^dec_[A-Za-z0-9_-]{1,88}$")
REDACTION_ID_PATTERN = re.compile(r"^red_[A-Za-z0-9_-]{1,88}$")
CURSOR_PATTERN = re.compile(r"^cur_v1:([0-9]{16}):(origin|evt_[A-Za-z0-9_-]{1,88})$")

URL_SCHEME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*://")
DRIVE_PATH_PATTERN = re.compile(r"^[A-Za-z]:")
UNC_PATH_PATTERN = re.compile(r"^(?:\\\\|//)[^/\\]+[/\\][^/\\]+")
CONTROL_CHARACTER_PATTERN = re.compile(r"[\x00-\x1f\x7f]")
WINDOWS_UNSAFE_CHARACTER_PATTERN = re.compile(r'[<>:"|?*]')
WINDOWS_RESERVED_BASENAME_PATTERN = re.compile(
    r"^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$",
    re.IGNORECASE,
)

RESTRICTED_TERM_PARTS = (
    ("gov", "ernment"),
    ("polit", "ics"),
    ("elec", "tion"),
    ("mil", "itary"),
    ("pol", "ice"),
    ("regul", "atory"),
    ("public", " ", "sector"),
    ("public", "-", "sector"),
    ("public", " ", "policy"),
    ("public", "-", "policy"),
    ("\u653f", "\u5e9c"),
    ("\u653f", "\u6cbb"),
    ("\u516c", "\u5171", "\u90e8", "\u95e8"),
    ("\u653f", "\u52a1"),
    ("\u9009", "\u4e3e"),
    ("\u519b", "\u8b66"),
    ("\u76d1", "\u7ba1"),
    ("\u516c", "\u5171", "\u653f", "\u7b56"),
)

PAYLOAD_KINDS = {"workspace_state", "record", "asset", "settings"}
REVIEW_STATUSES = {"pending", "needs_redaction", "approved", "rejected", "blocked"}
REVIEW_KINDS = {"backup_restore", "migration_plan", "sync_replay", "compaction_plan"}
APPROVAL_DECISIONS = {"approved", "rejected"}
REDACTION_SEVERITIES = {"info", "warning", "blocking"}
REDACTION_STATUSES = {"open", "resolved"}

BASE_REVIEW_FIELDS = {
    "id",
    "workspaceId",
    "kind",
    "title",
    "requestedBy",
    "createdAt",
    "updatedAt",
    "status",
    "blockerCount",
    "warningCount",
    "reviewerRoles",
    "redactionMarkerIds",
    "decisionId",
}


@dataclass(frozen=True)
class ValidationReport:
    root: Path
    issues: list[str]

    @property
    def ok(self) -> bool:
        return not self.issues


def validate_lifecycle_fixtures(root: Optional[Path] = None) -> ValidationReport:
    fixture_root = Path(root) if root is not None else DEFAULT_FIXTURE_ROOT
    issues: list[str] = []
    data: dict[str, Any] = {}

    if not fixture_root.exists():
        return ValidationReport(fixture_root, [f"missing fixture directory: {fixture_root}"])
    if not fixture_root.is_dir():
        return ValidationReport(fixture_root, [f"fixture root is not a directory: {fixture_root}"])

    paths = [fixture_root / name for name in FIXTURE_FILE_NAMES]
    for path in paths:
        loaded = _load_json(path, issues)
        if loaded is not None:
            data[path.name] = loaded

    _scan_restricted_terms(paths, issues)

    if "manifest.json" in data:
        _validate_manifest(data["manifest.json"], "manifest.json", issues)
    if "events.json" in data:
        _validate_events(data["events.json"], "events.json", issues)
    if "reviews.json" in data:
        _validate_reviews(data["reviews.json"], "reviews.json", issues)

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


def _scan_restricted_terms(paths: list[Path], issues: list[str]) -> None:
    patterns = _restricted_patterns()
    terms = tuple("".join(parts).lower() for parts in RESTRICTED_TERM_PARTS)
    localized_terms = tuple(term for term in terms if not term.isascii())

    for path in paths:
        if not path.exists() or not path.is_file():
            continue
        for line_number, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1):
            lowered = line.lower()
            if any(pattern.search(lowered) for pattern in patterns) or any(
                term in lowered for term in localized_terms
            ):
                issues.append(f"{path.name}:{line_number} contains restricted wording")


def _restricted_patterns() -> list[re.Pattern[str]]:
    patterns: list[re.Pattern[str]] = []
    for term in ("".join(parts).lower() for parts in RESTRICTED_TERM_PARTS):
        if not term.isascii():
            continue
        escaped = re.escape(term)
        escaped = escaped.replace(r"\ ", r"[\s-]+").replace(r"\-", r"[\s-]+")
        patterns.append(re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])"))
    return patterns


def _validate_manifest(value: Any, path: str, issues: list[str]) -> None:
    local: list[str] = []
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return

    _reject_unknown_fields(
        value,
        {
            "manifestVersion",
            "backupId",
            "workspaceId",
            "createdAt",
            "createdByActorId",
            "encryption",
            "payloads",
            "manifestFingerprint",
        },
        path,
        local,
    )
    _require_exact_string(value, "manifestVersion", "1.0.0", path, local)
    _require_string(value, "backupId", path, local, BACKUP_ID_PATTERN)
    _require_string(value, "workspaceId", path, local, WORKSPACE_ID_PATTERN)
    _require_timestamp(value, "createdAt", path, local)
    _require_string(value, "createdByActorId", path, local, ACTOR_ID_PATTERN)
    _validate_encryption(value.get("encryption"), f"{path}.encryption", local)
    payloads = _require_array(value, "payloads", path, local, min_length=1)
    _require_string(value, "manifestFingerprint", path, local, FINGERPRINT_PATTERN)

    seen_payload_ids: set[str] = set()
    seen_payload_paths: set[str] = set()
    for index, payload in enumerate(payloads):
        payload_path = f"{path}.payloads[{index}]"
        normalized_payload_path = _validate_payload(payload, payload_path, local)
        payload_id = payload.get("id") if _is_record(payload) else None
        if isinstance(payload_id, str):
            if payload_id in seen_payload_ids:
                local.append(f"{payload_path}.id: duplicates payload id")
            seen_payload_ids.add(payload_id)
        if normalized_payload_path is not None:
            if normalized_payload_path in seen_payload_paths:
                local.append(f"{payload_path}.path: duplicates payload path")
            seen_payload_paths.add(normalized_payload_path)

    issues.extend(local)
    if not local:
        _validate_manifest_fingerprints(value, path, issues)


def _validate_encryption(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"algorithm", "keyId", "keyFingerprint"}, path, issues)
    _require_string(value, "algorithm", path, issues)
    _require_string(value, "keyId", path, issues)
    _require_string(value, "keyFingerprint", path, issues, FINGERPRINT_PATTERN)


def _validate_payload(value: Any, path: str, issues: list[str]) -> Optional[str]:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return None

    _reject_unknown_fields(
        value,
        {
            "id",
            "kind",
            "path",
            "plaintextByteSize",
            "encryptedByteSize",
            "contentType",
            "createdAt",
            "encryption",
            "integrity",
        },
        path,
        issues,
    )
    _require_string(value, "id", path, issues, PAYLOAD_ID_PATTERN)
    _require_enum(value, "kind", PAYLOAD_KINDS, path, issues)
    payload_path = _require_string(value, "path", path, issues)
    normalized_path = _validate_safe_relative_path(payload_path, f"{path}.path", issues)
    _require_non_negative_integer(value, "plaintextByteSize", path, issues)
    _require_non_negative_integer(value, "encryptedByteSize", path, issues)
    if isinstance(value.get("plaintextByteSize"), int) and isinstance(value.get("encryptedByteSize"), int):
        if value["encryptedByteSize"] < value["plaintextByteSize"]:
            issues.append(f"{path}.encryptedByteSize: must be greater than or equal to plaintextByteSize")
    if "contentType" in value:
        _require_string(value, "contentType", path, issues)
    _require_timestamp(value, "createdAt", path, issues)
    _validate_payload_encryption(value.get("encryption"), f"{path}.encryption", issues)
    _validate_payload_integrity(value.get("integrity"), f"{path}.integrity", issues)
    return normalized_path


def _validate_payload_encryption(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"algorithm", "keyId", "nonceFingerprint", "encryptedPayloadFingerprint"}, path, issues)
    _require_string(value, "algorithm", path, issues)
    _require_string(value, "keyId", path, issues)
    _require_string(value, "nonceFingerprint", path, issues, FINGERPRINT_PATTERN)
    _require_string(value, "encryptedPayloadFingerprint", path, issues, FINGERPRINT_PATTERN)


def _validate_payload_integrity(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(
        value,
        {"plaintextFingerprint", "encryptedPayloadFingerprint", "descriptorFingerprint"},
        path,
        issues,
    )
    _require_string(value, "plaintextFingerprint", path, issues, FINGERPRINT_PATTERN)
    _require_string(value, "encryptedPayloadFingerprint", path, issues, FINGERPRINT_PATTERN)
    _require_string(value, "descriptorFingerprint", path, issues, FINGERPRINT_PATTERN)


def _validate_manifest_fingerprints(manifest: dict[str, Any], path: str, issues: list[str]) -> None:
    if manifest["encryption"]["keyFingerprint"] != _fingerprint(["key", manifest["encryption"]["keyId"]]):
        issues.append(f"{path}.encryption.keyFingerprint: does not match key metadata")

    normalized_payloads = sorted(manifest["payloads"], key=lambda item: item["id"])
    for index, payload in enumerate(normalized_payloads):
        payload_path = f"{path}.payloads[{index}]"
        if payload["integrity"]["encryptedPayloadFingerprint"] != payload["encryption"]["encryptedPayloadFingerprint"]:
            issues.append(f"{payload_path}.integrity.encryptedPayloadFingerprint: must match encryption metadata")
        descriptor = _payload_descriptor_without_integrity(payload)
        expected_descriptor = _fingerprint(descriptor)
        if payload["integrity"]["descriptorFingerprint"] != expected_descriptor:
            issues.append(f"{payload_path}.integrity.descriptorFingerprint: does not match payload descriptor")

    manifest_base = {
        "manifestVersion": manifest["manifestVersion"],
        "backupId": manifest["backupId"],
        "workspaceId": manifest["workspaceId"],
        "createdAt": manifest["createdAt"],
        "createdByActorId": manifest["createdByActorId"],
        "encryption": manifest["encryption"],
        "payloads": normalized_payloads,
    }
    if manifest["manifestFingerprint"] != _fingerprint(manifest_base):
        issues.append(f"{path}.manifestFingerprint: does not match manifest contents")


def _payload_descriptor_without_integrity(payload: dict[str, Any]) -> dict[str, Any]:
    descriptor = {
        "id": payload["id"],
        "kind": payload["kind"],
        "path": payload["path"],
        "plaintextByteSize": payload["plaintextByteSize"],
        "encryptedByteSize": payload["encryptedByteSize"],
        "createdAt": payload["createdAt"],
        "encryption": payload["encryption"],
    }
    if "contentType" in payload:
        descriptor["contentType"] = payload["contentType"]
    return descriptor


def _validate_events(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"compaction", "replay"}, path, issues)
    _validate_compaction_events(value.get("compaction"), f"{path}.compaction", issues)
    _validate_replay_events(value.get("replay"), f"{path}.replay", issues)


def _validate_compaction_events(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"streamId", "events"}, path, issues)
    stream_id = _require_string(value, "streamId", path, issues)
    events = _require_array(value, "events", path, issues, min_length=1)
    seen_ids: set[str] = set()
    seen_sequences: set[int] = set()
    previous_sequence = 0
    for index, event in enumerate(events):
        event_path = f"{path}.events[{index}]"
        if not _is_record(event):
            issues.append(f"{event_path}: must be an object")
            continue
        _reject_unknown_fields(event, {"eventId", "streamId", "sequence", "type", "timestamp", "payload", "metadata"}, event_path, issues)
        event_id = _require_string(event, "eventId", event_path, issues, EVENT_ID_PATTERN)
        if event_id in seen_ids:
            issues.append(f"{event_path}.eventId: duplicates event id")
        seen_ids.add(event_id)
        event_stream_id = _require_string(event, "streamId", event_path, issues)
        if stream_id is not None and event_stream_id != stream_id:
            issues.append(f"{event_path}.streamId: must match compaction streamId")
        sequence = _require_positive_integer(event, "sequence", event_path, issues)
        if sequence is not None:
            if sequence in seen_sequences:
                issues.append(f"{event_path}.sequence: duplicates sequence")
            if sequence <= previous_sequence:
                issues.append(f"{event_path}.sequence: events must be sorted by sequence")
            seen_sequences.add(sequence)
            previous_sequence = sequence
        _require_string(event, "type", event_path, issues)
        _require_timestamp(event, "timestamp", event_path, issues)
        if not _is_record(event.get("payload")):
            issues.append(f"{event_path}.payload: must be an object")
        if "metadata" in event and not _is_record(event.get("metadata")):
            issues.append(f"{event_path}.metadata: must be an object")


def _validate_replay_events(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(value, {"workspaceId", "deviceId", "afterCursor", "nextCursor", "events"}, path, issues)
    workspace_id = _require_string(value, "workspaceId", path, issues, WORKSPACE_ID_PATTERN)
    device_id = _require_string(value, "deviceId", path, issues, DEVICE_ID_PATTERN)
    after_cursor = _require_cursor(value, "afterCursor", path, issues)
    next_cursor = _require_cursor(value, "nextCursor", path, issues)
    events = _require_array(value, "events", path, issues, min_length=1)
    seen_ids: set[str] = set()
    previous_position = after_cursor[0] if after_cursor else -1
    last_cursor = None
    for index, event in enumerate(events):
        event_path = f"{path}.events[{index}]"
        if not _is_record(event):
            issues.append(f"{event_path}: must be an object")
            continue
        _reject_unknown_fields(
            event,
            {"id", "workspaceId", "deviceId", "sequence", "type", "payload", "createdAt", "cursor"},
            event_path,
            issues,
        )
        event_id = _require_string(event, "id", event_path, issues, EVENT_ID_PATTERN)
        if event_id in seen_ids:
            issues.append(f"{event_path}.id: duplicates event id")
        seen_ids.add(event_id)
        if _require_string(event, "workspaceId", event_path, issues, WORKSPACE_ID_PATTERN) != workspace_id:
            issues.append(f"{event_path}.workspaceId: must match replay workspaceId")
        if _require_string(event, "deviceId", event_path, issues, DEVICE_ID_PATTERN) != device_id:
            issues.append(f"{event_path}.deviceId: must match replay deviceId")
        _require_non_negative_integer(event, "sequence", event_path, issues)
        _require_string(event, "type", event_path, issues)
        if not _is_record(event.get("payload")):
            issues.append(f"{event_path}.payload: must be an object")
        _require_timestamp(event, "createdAt", event_path, issues)
        cursor = _require_cursor(event, "cursor", event_path, issues)
        if cursor is not None:
            position, cursor_event_id = cursor
            if event_id is not None and cursor_event_id != event_id:
                issues.append(f"{event_path}.cursor: event id must match cursor")
            if position <= previous_position:
                issues.append(f"{event_path}.cursor: cursor positions must increase")
            previous_position = position
            last_cursor = event["cursor"]
    if events and isinstance(next_cursor, tuple) and last_cursor != value.get("nextCursor"):
        issues.append(f"{path}.nextCursor: must match the last replay event cursor")


def _validate_reviews(value: Any, path: str, issues: list[str]) -> None:
    if not _is_record(value):
        issues.append(f"{path}: must be an object")
        return
    _reject_unknown_fields(
        value,
        {
            "backupRestoreReviews",
            "migrationPlanReviews",
            "syncReplayReviews",
            "compactionPlanReviews",
            "approvalDecisions",
            "redactionMarkers",
        },
        path,
        issues,
    )

    reviews_by_id: dict[str, dict[str, Any]] = {}
    for section, kind, validator in (
        ("backupRestoreReviews", "backup_restore", _validate_backup_review),
        ("migrationPlanReviews", "migration_plan", _validate_migration_review),
        ("syncReplayReviews", "sync_replay", _validate_sync_replay_review),
        ("compactionPlanReviews", "compaction_plan", _validate_compaction_review),
    ):
        reviews = _require_array(value, section, path, issues)
        for index, review in enumerate(reviews):
            review_path = f"{path}.{section}[{index}]"
            if not _is_record(review):
                issues.append(f"{review_path}: must be an object")
                continue
            validator(review, review_path, issues)
            review_id = review.get("id")
            if isinstance(review_id, str):
                if review_id in reviews_by_id:
                    issues.append(f"{review_path}.id: duplicates lifecycle review id")
                reviews_by_id[review_id] = review
            if review.get("kind") != kind:
                issues.append(f"{review_path}.kind: must be {kind}")

    decisions_by_id: dict[str, dict[str, Any]] = {}
    decisions_by_review: dict[str, dict[str, Any]] = {}
    decisions = _require_array(value, "approvalDecisions", path, issues)
    for index, decision in enumerate(decisions):
        decision_path = f"{path}.approvalDecisions[{index}]"
        if not _is_record(decision):
            issues.append(f"{decision_path}: must be an object")
            continue
        _validate_decision(decision, decision_path, issues)
        decision_id = decision.get("id")
        review_id = decision.get("reviewId")
        if isinstance(decision_id, str):
            if decision_id in decisions_by_id:
                issues.append(f"{decision_path}.id: duplicates approval decision id")
            decisions_by_id[decision_id] = decision
        if isinstance(review_id, str):
            if review_id not in reviews_by_id:
                issues.append(f"{decision_path}.reviewId: lifecycle review not found")
            elif review_id in decisions_by_review:
                issues.append(f"{decision_path}.reviewId: duplicates decision for review")
            decisions_by_review[review_id] = decision

    markers_by_id: dict[str, dict[str, Any]] = {}
    marker_ids_by_review: dict[str, list[str]] = {}
    redaction_markers = _require_array(value, "redactionMarkers", path, issues)
    for index, marker in enumerate(redaction_markers):
        marker_path = f"{path}.redactionMarkers[{index}]"
        if not _is_record(marker):
            issues.append(f"{marker_path}: must be an object")
            continue
        _validate_redaction_marker(marker, marker_path, issues)
        marker_id = marker.get("id")
        review_id = marker.get("reviewId")
        if isinstance(marker_id, str):
            if marker_id in markers_by_id:
                issues.append(f"{marker_path}.id: duplicates redaction marker id")
            markers_by_id[marker_id] = marker
        if isinstance(review_id, str):
            if review_id not in reviews_by_id:
                issues.append(f"{marker_path}.reviewId: lifecycle review not found")
            marker_ids_by_review.setdefault(review_id, []).append(marker_id if isinstance(marker_id, str) else "")

    for review_id, review in reviews_by_id.items():
        _validate_review_links(
            review_id,
            review,
            decisions_by_id,
            decisions_by_review,
            marker_ids_by_review,
            [marker for marker in redaction_markers if _is_record(marker) and marker.get("reviewId") == review_id],
            f"{path}.{review_id}",
            issues,
        )


def _validate_base_review(
    value: dict[str, Any],
    path: str,
    issues: list[str],
    allowed_fields: set[str],
) -> None:
    _reject_unknown_fields(value, allowed_fields, path, issues)
    _require_string(value, "id", path, issues, REVIEW_ID_PATTERN)
    _require_string(value, "workspaceId", path, issues, WORKSPACE_ID_PATTERN)
    _require_enum(value, "kind", REVIEW_KINDS, path, issues)
    _require_string(value, "title", path, issues)
    _require_string(value, "requestedBy", path, issues, ACTOR_ID_PATTERN)
    created_at = _require_timestamp(value, "createdAt", path, issues)
    updated_at = _require_timestamp(value, "updatedAt", path, issues)
    if created_at is not None and updated_at is not None and updated_at < created_at:
        issues.append(f"{path}.updatedAt: must not be earlier than createdAt")
    _require_enum(value, "status", REVIEW_STATUSES, path, issues)
    _require_non_negative_integer(value, "blockerCount", path, issues)
    _require_non_negative_integer(value, "warningCount", path, issues)
    _require_string_array(value, "reviewerRoles", path, issues)
    _require_string_array(value, "redactionMarkerIds", path, issues)
    if "decisionId" in value:
        _require_string(value, "decisionId", path, issues, DECISION_ID_PATTERN)


def _validate_backup_review(value: dict[str, Any], path: str, issues: list[str]) -> None:
    _validate_base_review(
        value,
        path,
        issues,
        BASE_REVIEW_FIELDS
        | {
            "operation",
            "backupId",
            "manifestFingerprint",
            "payloadCount",
            "totalBytes",
            "restoreMode",
            "targetWorkspaceId",
        },
    )
    _require_enum(value, "operation", {"backup", "restore"}, path, issues)
    _require_string(value, "backupId", path, issues, BACKUP_ID_PATTERN)
    _require_string(value, "manifestFingerprint", path, issues, FINGERPRINT_PATTERN)
    _require_non_negative_integer(value, "payloadCount", path, issues)
    _require_non_negative_integer(value, "totalBytes", path, issues)
    if "restoreMode" in value:
        _require_enum(value, "restoreMode", {"preview", "merge", "replace"}, path, issues)
    if "targetWorkspaceId" in value:
        _require_string(value, "targetWorkspaceId", path, issues, WORKSPACE_ID_PATTERN)


def _validate_migration_review(value: dict[str, Any], path: str, issues: list[str]) -> None:
    _validate_base_review(
        value,
        path,
        issues,
        BASE_REVIEW_FIELDS
        | {
            "sourceVersion",
            "targetVersion",
            "stepCount",
            "stepIds",
            "rollbackNotes",
            "planFingerprint",
        },
    )
    source = _require_non_negative_integer(value, "sourceVersion", path, issues)
    target = _require_non_negative_integer(value, "targetVersion", path, issues)
    if source is not None and target is not None and target < source:
        issues.append(f"{path}.targetVersion: must be greater than or equal to sourceVersion")
    step_count = _require_non_negative_integer(value, "stepCount", path, issues)
    step_ids = _require_string_array(value, "stepIds", path, issues, min_length=1)
    if step_count is not None and len(step_ids) != step_count:
        issues.append(f"{path}.stepCount: must equal stepIds length")
    _require_string_array(value, "rollbackNotes", path, issues)
    _require_string(value, "planFingerprint", path, issues, FINGERPRINT_PATTERN)


def _validate_sync_replay_review(value: dict[str, Any], path: str, issues: list[str]) -> None:
    _validate_base_review(
        value,
        path,
        issues,
        BASE_REVIEW_FIELDS
        | {
            "afterCursor",
            "nextCursor",
            "eventCount",
            "issueCount",
            "replayStatus",
            "issueCodes",
        },
    )
    _require_cursor(value, "afterCursor", path, issues)
    _require_cursor(value, "nextCursor", path, issues)
    _require_non_negative_integer(value, "eventCount", path, issues)
    issue_count = _require_non_negative_integer(value, "issueCount", path, issues)
    _require_enum(value, "replayStatus", {"ok", "degraded", "blocked"}, path, issues)
    issue_codes = _require_string_array(value, "issueCodes", path, issues)
    if issue_count is not None and len(issue_codes) > issue_count:
        issues.append(f"{path}.issueCodes: must not exceed issueCount")


def _validate_compaction_review(value: dict[str, Any], path: str, issues: list[str]) -> None:
    _validate_base_review(
        value,
        path,
        issues,
        BASE_REVIEW_FIELDS
        | {
            "streamId",
            "fromSequence",
            "toSequence",
            "sourceEventCount",
            "compactedEventCount",
            "retainedEventCount",
            "checkpointCount",
            "replayVerified",
            "planFingerprint",
        },
    )
    _require_string(value, "streamId", path, issues)
    from_sequence = _require_positive_integer(value, "fromSequence", path, issues)
    to_sequence = _require_positive_integer(value, "toSequence", path, issues)
    if from_sequence is not None and to_sequence is not None and to_sequence < from_sequence:
        issues.append(f"{path}.toSequence: must be greater than or equal to fromSequence")
    source_count = _require_non_negative_integer(value, "sourceEventCount", path, issues)
    compacted_count = _require_non_negative_integer(value, "compactedEventCount", path, issues)
    retained_count = _require_non_negative_integer(value, "retainedEventCount", path, issues)
    _require_non_negative_integer(value, "checkpointCount", path, issues)
    if isinstance(value.get("replayVerified"), bool) is False:
        issues.append(f"{path}.replayVerified: must be a boolean")
    if source_count is not None and compacted_count is not None and retained_count is not None:
        if compacted_count + retained_count != source_count:
            issues.append(f"{path}.sourceEventCount: must equal compactedEventCount plus retainedEventCount")
    _require_string(value, "planFingerprint", path, issues, FINGERPRINT_PATTERN)


def _validate_decision(value: dict[str, Any], path: str, issues: list[str]) -> None:
    _reject_unknown_fields(value, {"id", "reviewId", "decision", "decidedBy", "decidedAt", "reason"}, path, issues)
    _require_string(value, "id", path, issues, DECISION_ID_PATTERN)
    _require_string(value, "reviewId", path, issues, REVIEW_ID_PATTERN)
    _require_enum(value, "decision", APPROVAL_DECISIONS, path, issues)
    _require_string(value, "decidedBy", path, issues, ACTOR_ID_PATTERN)
    _require_timestamp(value, "decidedAt", path, issues)
    if "reason" in value:
        _require_string(value, "reason", path, issues)


def _validate_redaction_marker(value: dict[str, Any], path: str, issues: list[str]) -> None:
    _reject_unknown_fields(
        value,
        {
            "id",
            "reviewId",
            "path",
            "reason",
            "marker",
            "severity",
            "createdBy",
            "createdAt",
            "status",
            "resolvedBy",
            "resolvedAt",
        },
        path,
        issues,
    )
    _require_string(value, "id", path, issues, REDACTION_ID_PATTERN)
    _require_string(value, "reviewId", path, issues, REVIEW_ID_PATTERN)
    marker_path = _require_string(value, "path", path, issues)
    if marker_path is not None and not (marker_path.startswith("$.") or marker_path.startswith("$[")):
        issues.append(f"{path}.path: must identify a JSON field")
    _require_string(value, "reason", path, issues)
    _require_string(value, "marker", path, issues)
    _require_enum(value, "severity", REDACTION_SEVERITIES, path, issues)
    _require_string(value, "createdBy", path, issues, ACTOR_ID_PATTERN)
    _require_timestamp(value, "createdAt", path, issues)
    status = _require_enum(value, "status", REDACTION_STATUSES, path, issues)
    if status == "resolved":
        _require_string(value, "resolvedBy", path, issues, ACTOR_ID_PATTERN)
        _require_timestamp(value, "resolvedAt", path, issues)
    if status == "open" and ("resolvedBy" in value or "resolvedAt" in value):
        issues.append(f"{path}.status: open markers must not include resolution fields")


def _validate_review_links(
    review_id: str,
    review: dict[str, Any],
    decisions_by_id: dict[str, dict[str, Any]],
    decisions_by_review: dict[str, dict[str, Any]],
    marker_ids_by_review: dict[str, list[str]],
    markers: list[dict[str, Any]],
    path: str,
    issues: list[str],
) -> None:
    expected_marker_ids = marker_ids_by_review.get(review_id, [])
    if review.get("redactionMarkerIds") != expected_marker_ids:
        issues.append(f"{path}.redactionMarkerIds: must match markers for review")

    decision_id = review.get("decisionId")
    decision = decisions_by_id.get(decision_id) if isinstance(decision_id, str) else None
    if isinstance(decision_id, str):
        if decision is None:
            issues.append(f"{path}.decisionId: approval decision not found")
        elif decision.get("reviewId") != review_id:
            issues.append(f"{path}.decisionId: decision must point back to review")

    review_decision = decisions_by_review.get(review_id)
    if review_decision is not None and review.get("decisionId") != review_decision.get("id"):
        issues.append(f"{path}.decisionId: must reference the review decision")

    open_blocking = any(marker.get("status") == "open" and marker.get("severity") == "blocking" for marker in markers)
    if decision is not None:
        expected_status = decision.get("decision")
    elif open_blocking:
        expected_status = "needs_redaction"
    elif review.get("blockerCount", 0) > 0:
        expected_status = "blocked"
    else:
        expected_status = "pending"
    if review.get("status") != expected_status:
        issues.append(f"{path}.status: expected {expected_status}")
    if decision is not None and decision.get("decision") == "approved":
        if review.get("blockerCount", 0) > 0 or open_blocking:
            issues.append(f"{path}.decisionId: approved reviews must not have blockers")


def _require_exact_string(
    record: dict[str, Any],
    key: str,
    expected: str,
    path: str,
    issues: list[str],
) -> Optional[str]:
    value = _require_string(record, key, path, issues)
    if value is not None and value != expected:
        issues.append(f"{path}.{key}: must be {expected}")
    return value


def _require_string(
    record: dict[str, Any],
    key: str,
    path: str,
    issues: list[str],
    pattern: Optional[re.Pattern[str]] = None,
) -> Optional[str]:
    if key not in record:
        issues.append(f"{path}.{key}: is required")
        return None
    value = record[key]
    if not isinstance(value, str) or value.strip() == "":
        issues.append(f"{path}.{key}: must be a non-empty string")
        return None
    if value != value.strip():
        issues.append(f"{path}.{key}: must not contain surrounding whitespace")
        return None
    if pattern is not None and not pattern.fullmatch(value):
        issues.append(f"{path}.{key}: has invalid format")
        return None
    return value


def _require_enum(
    record: dict[str, Any],
    key: str,
    allowed: set[str],
    path: str,
    issues: list[str],
) -> Optional[str]:
    value = _require_string(record, key, path, issues)
    if value is not None and value not in allowed:
        issues.append(f"{path}.{key}: must be one of {', '.join(sorted(allowed))}")
        return None
    return value


def _require_array(
    record: dict[str, Any],
    key: str,
    path: str,
    issues: list[str],
    min_length: int = 0,
) -> list[Any]:
    if key not in record:
        issues.append(f"{path}.{key}: is required")
        return []
    value = record[key]
    if not isinstance(value, list):
        issues.append(f"{path}.{key}: must be an array")
        return []
    if len(value) < min_length:
        issues.append(f"{path}.{key}: must contain at least {min_length} item")
    return value


def _require_string_array(
    record: dict[str, Any],
    key: str,
    path: str,
    issues: list[str],
    min_length: int = 0,
) -> list[str]:
    values = _require_array(record, key, path, issues, min_length)
    strings: list[str] = []
    seen: set[str] = set()
    for index, value in enumerate(values):
        item_path = f"{path}.{key}[{index}]"
        if not isinstance(value, str) or value.strip() == "":
            issues.append(f"{item_path}: must be a non-empty string")
            continue
        if value != value.strip():
            issues.append(f"{item_path}: must not contain surrounding whitespace")
            continue
        if value in seen:
            issues.append(f"{item_path}: duplicates value")
            continue
        seen.add(value)
        strings.append(value)
    return strings


def _require_non_negative_integer(
    record: dict[str, Any],
    key: str,
    path: str,
    issues: list[str],
) -> Optional[int]:
    return _require_integer(record, key, path, issues, minimum=0)


def _require_positive_integer(
    record: dict[str, Any],
    key: str,
    path: str,
    issues: list[str],
) -> Optional[int]:
    return _require_integer(record, key, path, issues, minimum=1)


def _require_integer(
    record: dict[str, Any],
    key: str,
    path: str,
    issues: list[str],
    minimum: int,
) -> Optional[int]:
    if key not in record:
        issues.append(f"{path}.{key}: is required")
        return None
    value = record[key]
    if isinstance(value, bool) or not isinstance(value, int):
        issues.append(f"{path}.{key}: must be an integer")
        return None
    if value < minimum:
        issues.append(f"{path}.{key}: must be at least {minimum}")
        return None
    return value


def _require_timestamp(
    record: dict[str, Any],
    key: str,
    path: str,
    issues: list[str],
) -> Optional[datetime]:
    value = _require_string(record, key, path, issues)
    if value is None:
        return None
    if not TIMESTAMP_PATTERN.fullmatch(value):
        issues.append(f"{path}.{key}: must use YYYY-MM-DDTHH:MM:SS.mmmZ")
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        issues.append(f"{path}.{key}: must be a valid timestamp")
        return None


def _require_cursor(
    record: dict[str, Any],
    key: str,
    path: str,
    issues: list[str],
) -> Optional[tuple[int, str]]:
    value = _require_string(record, key, path, issues)
    if value is None:
        return None
    match = CURSOR_PATTERN.fullmatch(value)
    if not match:
        issues.append(f"{path}.{key}: must use cur_v1 cursor format")
        return None
    return (int(match.group(1)), match.group(2))


def _reject_unknown_fields(
    record: dict[str, Any],
    allowed: set[str],
    path: str,
    issues: list[str],
) -> None:
    for key in sorted(record):
        if key not in allowed:
            issues.append(f"{path}.{key}: is not allowed")


def _validate_safe_relative_path(value: Optional[str], path: str, issues: list[str]) -> Optional[str]:
    if value is None:
        return None
    raw = value
    trimmed = raw.strip()
    local: list[str] = []
    if raw != trimmed:
        local.append("must not contain surrounding whitespace")
    if CONTROL_CHARACTER_PATTERN.search(raw):
        local.append("must not contain control characters")
    if URL_SCHEME_PATTERN.search(trimmed):
        local.append("must not be a URL")
    if UNC_PATH_PATTERN.search(trimmed):
        local.append("must not be a UNC path")
    if DRIVE_PATH_PATTERN.search(trimmed):
        local.append("must not include a drive prefix")
    if trimmed.startswith("/") or trimmed.startswith("\\"):
        local.append("must be relative")
    if trimmed == "~" or trimmed.startswith("~/") or trimmed.startswith("~\\"):
        local.append("must not use a home-directory shortcut")

    segments: list[str] = []
    for index, segment in enumerate(trimmed.replace("\\", "/").split("/")):
        if segment in {"", "."}:
            continue
        if segment == "..":
            local.append(f"segment {index} must not contain parent traversal")
            continue
        segments.append(segment)
    if not segments:
        local.append("must contain at least one path segment")
    for segment in segments:
        lower = segment.lower()
        if WINDOWS_UNSAFE_CHARACTER_PATTERN.search(segment):
            local.append("must not contain characters unsafe on Windows filesystems")
        if WINDOWS_RESERVED_BASENAME_PATTERN.fullmatch(segment):
            local.append("must not use a reserved Windows device name")
        if segment.endswith(".") or segment.endswith(" "):
            local.append("must not end with a space or period")
        if lower in {".cache", "cache", "node_modules", ".npm", ".pnpm-store", ".yarn", "key", "keys", "secret", "secrets"}:
            local.append("must not point at restricted local storage")
        if re.fullmatch(r"\.env(?:\..*)?", segment, flags=re.IGNORECASE):
            local.append("must not point at environment files")
        if re.fullmatch(r"(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\.pub)?", segment, flags=re.IGNORECASE):
            local.append("must not point at credential material")
        if re.search(r"\.(?:pem|key|p12|pfx|asc|gpg)$", segment, flags=re.IGNORECASE):
            local.append("must not point at credential material")
    if local:
        issues.extend(f"{path}: {message}" for message in sorted(set(local)))
        return None
    normalized = "/".join(segments)
    if normalized != raw:
        issues.append(f"{path}: must be normalized with forward slashes")
        return None
    return normalized


def _stable_stringify(value: Any) -> str:
    if value is None or isinstance(value, (str, int, float, bool)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(_stable_stringify(item) for item in value) + "]"
    if isinstance(value, dict):
        entries = []
        for key in sorted(value):
            nested = value[key]
            if nested is None:
                continue
            entries.append(json.dumps(key, ensure_ascii=False, separators=(",", ":")) + ":" + _stable_stringify(nested))
        return "{" + ",".join(entries) + "}"
    return "null"


def _fingerprint(value: Any) -> str:
    serialized = _stable_stringify(value)
    digest = 0xCBF29CE484222325
    prime = 0x100000001B3
    for character in serialized:
        digest ^= ord(character)
        digest = (digest * prime) & ((1 << 64) - 1)
    return f"fp_{digest:016x}"


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Validate lifecycle example fixtures.")
    parser.add_argument(
        "root",
        nargs="?",
        default=str(DEFAULT_FIXTURE_ROOT),
        help="Path to the lifecycle fixture directory.",
    )
    args = parser.parse_args(argv)

    report = validate_lifecycle_fixtures(Path(args.root))
    if report.ok:
        print(f"Lifecycle fixtures OK: {report.root}")
        return 0

    print(f"Lifecycle fixtures invalid: {report.root}")
    for issue in report.issues:
        print(f"- {issue}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
