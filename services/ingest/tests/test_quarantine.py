from __future__ import annotations

import unittest

from services.ingest.src.sovereignops_ingest.citation import Citation, CitationRange
from services.ingest.src.sovereignops_ingest.quarantine import (
    CASE_STATE_OPEN,
    CASE_STATE_REJECTED,
    CASE_STATE_RELEASED,
    QuarantineTransitionError,
    build_quarantine_case,
    build_quarantine_cases,
    reject_case,
    release_case,
)
from services.ingest.src.sovereignops_ingest.structured import (
    LocalDataSafetyFinding,
    StructuredImportResult,
    StructuredValidationError,
)


class QuarantineCaseBuildTests(unittest.TestCase):
    def test_structured_inputs_build_deterministic_cases(self) -> None:
        error = StructuredValidationError(
            code="csv_required_value_empty",
            message="required field is empty",
            row=2,
            column="name",
            citation=Citation(
                source_uri="file://items.csv",
                range=CitationRange(row=2, column="name"),
                trusted=False,
            ),
        )
        finding = LocalDataSafetyFinding(
            code="embedded_instruction_override",
            message="source text contains an instruction-control phrase",
            severity="notice",
            citation=Citation(
                source_uri="file://items.csv",
                range=CitationRange.lines(4, 5),
                trusted=False,
            ),
        )
        result = StructuredImportResult(
            documents=(),
            validation_errors=(error,),
            findings=(finding,),
        )

        left = build_quarantine_cases(result)
        right = build_quarantine_cases(result)

        self.assertEqual([case.id for case in left], [case.id for case in right])
        self.assertEqual([case.reason_codes for case in left], [("csv_required_value_empty",), ("embedded_instruction_override",)])
        self.assertEqual([case.source_uri for case in left], ["file://items.csv", "file://items.csv"])
        self.assertEqual(left[0].severity, "medium")
        self.assertEqual(left[1].severity, "notice")
        self.assertEqual(left[0].citation_snapshots[0]["range"], {"row": 2, "column": "name"})

    def test_plain_records_redact_preview_text(self) -> None:
        case = build_quarantine_case(
            {
                "source_uri": "file://records.json",
                "reason_code": "field_review",
                "severity": "warning",
                "citation": {
                    "trusted": False,
                    "range": {"path": "$.items[0].contact"},
                    "source_uri": "file://records.json",
                },
                "content": (
                    "Owner alex@example.com uses password=ClearText "
                    "and token: abcdef12345 for a sample record."
                ),
            }
        )

        self.assertEqual(case.severity, "low")
        self.assertIn("[redacted-email]", case.preview_text)
        self.assertIn("password=[redacted]", case.preview_text)
        self.assertIn("token: [redacted]", case.preview_text)
        self.assertNotIn("alex@example.com", case.preview_text)
        self.assertNotIn("ClearText", case.preview_text)
        self.assertNotIn("abcdef12345", case.preview_text)


class QuarantineDecisionTests(unittest.TestCase):
    def test_release_blocks_unresolved_high_severity_without_override(self) -> None:
        case = build_quarantine_case(
            {
                "source_uri": "file://records.csv",
                "reason_code": "quality_gate_failed",
                "severity": "high",
                "content": "record requires direct review",
            }
        )

        with self.assertRaises(QuarantineTransitionError):
            release_case(
                case,
                actor_id="worker-4",
                reason="ready for import",
                timestamp="2026-04-27T09:00:00Z",
            )

        released = release_case(
            case,
            actor_id="worker-4",
            reason="review completed",
            timestamp="2026-04-27T09:05:00Z",
            override_high_severity=True,
        )

        self.assertEqual(released.state, CASE_STATE_RELEASED)
        self.assertTrue(released.decisions[0].override)

    def test_decision_transitions_are_immutable_and_terminal(self) -> None:
        case = build_quarantine_case(
            {
                "source_uri": "file://records.csv",
                "reason_code": "duplicate_record",
                "severity": "low",
                "content": "duplicate sample row",
            }
        )

        released = release_case(
            case,
            actor_id="worker-4",
            reason="duplicate accepted",
            timestamp="2026-04-27T09:10:00Z",
        )
        rejected = reject_case(
            case,
            actor_id="worker-4",
            reason="duplicate rejected",
            timestamp="2026-04-27T09:15:00Z",
        )

        self.assertEqual(case.state, CASE_STATE_OPEN)
        self.assertEqual(released.state, CASE_STATE_RELEASED)
        self.assertEqual(rejected.state, CASE_STATE_REJECTED)
        self.assertEqual(len(case.decisions), 0)
        self.assertEqual(released.decisions[0].from_state, CASE_STATE_OPEN)
        self.assertEqual(released.decisions[0].to_state, CASE_STATE_RELEASED)
        with self.assertRaises(QuarantineTransitionError):
            reject_case(
                released,
                actor_id="worker-4",
                reason="second decision",
                timestamp="2026-04-27T09:20:00Z",
            )

    def test_audit_summary_shape(self) -> None:
        case = build_quarantine_case(
            {
                "source_uri": "file://records.json",
                "reason_code": "field_review",
                "severity": "medium",
                "content": "sample value requires review",
            }
        )

        rejected = reject_case(
            case,
            actor_id="worker-4",
            reason="sample value not accepted",
            timestamp="2026-04-27T09:25:00Z",
        )
        summary = rejected.audit_event_summaries[0]

        self.assertEqual(
            set(summary),
            {
                "event_type",
                "case_id",
                "source_uri",
                "action",
                "actor_id",
                "timestamp",
                "from_state",
                "to_state",
                "reason",
                "severity",
                "override",
            },
        )
        self.assertEqual(summary["event_type"], "quarantine_decision")
        self.assertEqual(summary["case_id"], case.id)
        self.assertEqual(summary["action"], "reject")
        self.assertEqual(summary["from_state"], CASE_STATE_OPEN)
        self.assertEqual(summary["to_state"], CASE_STATE_REJECTED)
        self.assertFalse(summary["override"])


if __name__ == "__main__":
    unittest.main()
