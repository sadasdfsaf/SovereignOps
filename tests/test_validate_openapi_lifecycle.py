from __future__ import annotations

import unittest
from pathlib import Path


OPENAPI_PATH = Path(__file__).resolve().parents[1] / "docs" / "openapi.yaml"

LIFECYCLE_OPERATIONS = (
    {
        "path": "/v1/workspaces/{workspaceId}/migrations/plan",
        "method": "post",
        "operation_id": "planMigration",
        "request_ref": "MigrationPlanRequest",
        "status": '"200"',
        "response_ref": "MigrationPlanResponse",
    },
    {
        "path": "/v1/workspaces/{workspaceId}/migrations/run",
        "method": "post",
        "operation_id": "runMigration",
        "request_ref": "MigrationRunRequest",
        "status": '"200"',
        "response_ref": "MigrationRunResponse",
    },
    {
        "path": "/v1/workspaces/{workspaceId}/backups/manifests",
        "method": "post",
        "operation_id": "submitBackupManifest",
        "request_ref": "BackupManifestSubmitRequest",
        "status": '"201"',
        "response_ref": "BackupManifest",
    },
    {
        "path": "/v1/workspaces/{workspaceId}/restores/plan",
        "method": "post",
        "operation_id": "planRestore",
        "request_ref": "RestorePlanRequest",
        "status": '"200"',
        "response_ref": "RestorePlanResponse",
    },
    {
        "path": "/v1/observability/events",
        "method": "post",
        "operation_id": "submitObservabilityEvent",
        "request_ref": "ObservabilityEventSubmitRequest",
        "status": '"202"',
        "response_ref": "ObservabilityEvent",
    },
    {
        "path": "/v1/observability/metrics",
        "method": "post",
        "operation_id": "submitObservabilityMetric",
        "request_ref": "ObservabilityMetric",
        "status": '"202"',
        "response_ref": "ObservabilityMetric",
    },
    {
        "path": "/v1/workspaces/{workspaceId}/compactions/plan",
        "method": "post",
        "operation_id": "planCompaction",
        "request_ref": "CompactionPlanRequest",
        "status": '"200"',
        "response_ref": "CompactionPlanResponse",
    },
)

EXPECTED_SCHEMAS = {
    "MigrationPlanRequest",
    "MigrationRunRequest",
    "MigrationStepDescriptor",
    "MigrationPlanStep",
    "MigrationPlanSummary",
    "MigrationPlanResponse",
    "MigrationAppliedStepStatus",
    "MigrationAppliedStep",
    "MigrationRunSummary",
    "MigrationRunResponse",
    "BackupPayloadKind",
    "BackupEncryptionMetadata",
    "BackupPayloadEncryptionMetadata",
    "BackupPayloadIntegrity",
    "BackupPayloadDescriptor",
    "BackupManifest",
    "BackupManifestSubmitRequest",
    "RestoreMode",
    "RestoreActionType",
    "RestorePlanRequest",
    "RestoreSafetyResult",
    "RestorePlanAction",
    "RestorePlanSummary",
    "RestorePlanResponse",
    "ObservationLevel",
    "ObservabilityMetricKind",
    "ObservabilityResourceDescriptor",
    "ObservabilityEventSubmitRequest",
    "ObservabilityEvent",
    "ObservabilityMetricBase",
    "CounterMetric",
    "GaugeMetric",
    "HistogramBucket",
    "HistogramMetric",
    "ObservabilityMetric",
    "CompactionPlanRequest",
    "CompactionPlanResponse",
}

SENSITIVE_FIELDS = (
    "checkpointFingerprint",
    "descriptorFingerprint",
    "encryptedPayloadFingerprint",
    "existingPayloadFingerprints",
    "fingerprint",
    "fingerprintAfter",
    "fingerprintBefore",
    "keyFingerprint",
    "keyId",
    "manifestFingerprint",
    "nonceFingerprint",
    "plaintextFingerprint",
    "sourceFingerprint",
    "spanId",
    "targetFingerprint",
    "traceId",
    "trustedManifestFingerprints",
)

FORBIDDEN_SAMPLE_TOKENS = (
    "fnv1a64:",
    "fp_",
    "key_backup_",
    "key_restore_",
)


class ValidateOpenApiLifecycleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = OPENAPI_PATH.read_text(encoding="utf-8")
        cls.lines = cls.text.splitlines()

    def test_lifecycle_paths_match_sdk_methods(self) -> None:
        for operation in LIFECYCLE_OPERATIONS:
            with self.subTest(path=operation["path"]):
                path_block = _require_block(self, self.lines, operation["path"], 2)
                method_block = _require_block(self, path_block, operation["method"], 4)
                request_block = _require_block(self, method_block, "requestBody", 6)
                responses_block = _require_block(self, method_block, "responses", 6)
                status_block = _require_block(self, responses_block, operation["status"], 8)
                default_block = _require_block(self, responses_block, "default", 8)

                self.assertIn(
                    f"operationId: {operation['operation_id']}",
                    _stripped_lines(method_block),
                )
                self.assertTrue(_has_schema_ref(request_block, operation["request_ref"]))
                self.assertTrue(_has_schema_ref(status_block, operation["response_ref"]))
                self.assertIn(
                    '$ref: "#/components/responses/Error"',
                    _stripped_lines(default_block),
                )

    def test_lifecycle_response_schemas_are_declared(self) -> None:
        for schema_name in sorted(EXPECTED_SCHEMAS):
            with self.subTest(schema=schema_name):
                _require_block(self, self.lines, schema_name, 4)

    def test_sensitive_fields_do_not_embed_example_values(self) -> None:
        for field in SENSITIVE_FIELDS:
            field_blocks = _field_blocks(self.lines, field)
            self.assertTrue(field_blocks, f"missing sensitive field schema: {field}")
            for block in field_blocks:
                with self.subTest(field=field):
                    forbidden_lines = [
                        line
                        for line in block
                        if line.strip().startswith(("example:", "examples:", "default:"))
                    ]
                    self.assertEqual([], forbidden_lines)

        for token in FORBIDDEN_SAMPLE_TOKENS:
            with self.subTest(token=token):
                self.assertNotIn(token, self.text)


def _require_block(
    test_case: unittest.TestCase,
    lines: list[str],
    key: str,
    indent: int,
) -> list[str]:
    block = _find_block(lines, key, indent)
    test_case.assertIsNotNone(block, f"missing block {key!r} at indent {indent}")
    return block if block is not None else []


def _find_block(lines: list[str], key: str, indent: int) -> list[str] | None:
    prefix = " " * indent + key + ":"
    for index, line in enumerate(lines):
        if not line.startswith(prefix):
            continue
        return _collect_block(lines, index, indent)
    return None


def _collect_block(lines: list[str], index: int, indent: int) -> list[str]:
    block: list[str] = []
    for child in lines[index + 1 :]:
        if not child.strip() or child.lstrip().startswith("#"):
            block.append(child)
            continue
        child_indent = len(child) - len(child.lstrip(" "))
        if child_indent <= indent:
            break
        block.append(child)
    return block


def _field_blocks(lines: list[str], field: str) -> list[list[str]]:
    blocks: list[list[str]] = []
    for index, line in enumerate(lines):
        if line.strip() != f"{field}:":
            continue
        indent = len(line) - len(line.lstrip(" "))
        blocks.append([line, *_collect_block(lines, index, indent)])
    return blocks


def _has_schema_ref(lines: list[str], schema_name: str) -> bool:
    return f'$ref: "#/components/schemas/{schema_name}"' in _stripped_lines(lines)


def _stripped_lines(lines: list[str]) -> set[str]:
    return {line.strip() for line in lines}


if __name__ == "__main__":
    unittest.main()
