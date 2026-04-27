from __future__ import annotations

import unittest

from services.ingest.src.sovereignops_ingest.logs import (
    JSONLLogConnector,
    PlainTextLogConnector,
    parse_jsonl_logs,
    parse_plain_text_logs,
)


class JsonlLogConnectorTests(unittest.TestCase):
    def test_mixed_valid_and_invalid_jsonl_keeps_valid_records(self) -> None:
        result = parse_jsonl_logs(
            "file://app.jsonl",
            "\n".join(
                (
                    '{"timestamp":"2026-04-27T10:00:00Z","level":"info",'
                    '"message":"started","metadata":{"component":"api"},"request_id":"r1"}',
                    "{not json}",
                    '{"level":"ERROR","content":"failed","code":500}',
                )
            ),
        )

        self.assertEqual(len(result.events), 2)
        self.assertEqual(len(result.documents), 2)
        self.assertEqual(len(result.validation_errors), 1)
        self.assertEqual(result.events[0].source_uri, "file://app.jsonl")
        self.assertEqual(result.events[0].timestamp, "2026-04-27T10:00:00Z")
        self.assertEqual(result.events[0].level, "INFO")
        self.assertEqual(result.events[0].message, "started")
        self.assertEqual(result.events[0].metadata["record_metadata"], (("component", "api"),))
        self.assertEqual(result.events[0].metadata["extra"], (("request_id", "r1"),))
        self.assertEqual(result.events[1].level, "ERROR")
        self.assertEqual(result.events[1].message, "failed")
        self.assertEqual(result.events[1].metadata["extra"], (("code", 500),))
        self.assertEqual(result.validation_errors[0].code, "jsonl_parse_error")
        self.assertEqual(result.validation_errors[0].citation.range.start_line, 2)
        self.assertEqual(result.validation_errors[0].citation.range.end_line, 2)

    def test_jsonl_uses_line_citations_and_untrusted_defaults(self) -> None:
        result = parse_jsonl_logs(
            "file://app.jsonl",
            '{"message":"alpha"}\n{"message":"beta"}',
        )

        self.assertEqual(result.documents[0].citation.range.start_line, 1)
        self.assertEqual(result.documents[0].citation.range.end_line, 1)
        self.assertEqual(result.documents[1].citation.range.start_line, 2)
        self.assertFalse(result.events[0].citation.trusted)
        self.assertTrue(result.events[0].untrusted)
        self.assertFalse(result.documents[0].citation.trusted)

    def test_jsonl_output_is_deterministic(self) -> None:
        left = parse_jsonl_logs(
            "file://app.jsonl",
            '{"z":1,"message":"same","a":2}',
        )
        right = parse_jsonl_logs(
            "file://app.jsonl",
            '{"message":"same","a":2,"z":1}',
        )

        self.assertEqual(left, right)
        self.assertEqual(left.events[0].metadata["fields"], ("a", "message", "z"))
        self.assertEqual(left.events[0].metadata["record"], (("a", 2), ("message", "same"), ("z", 1)))

    def test_jsonl_connector_delegates_to_parser(self) -> None:
        result = JSONLLogConnector.parse("file://app.jsonl", '{"msg":"ready"}')

        self.assertEqual(result.events[0].message, "ready")


class PlainTextLogConnectorTests(unittest.TestCase):
    def test_plain_text_logs_parse_known_shapes_and_keep_unknown_lines(self) -> None:
        result = parse_plain_text_logs(
            "file://app.log",
            "\n".join(
                (
                    "2026-04-27T10:00:00Z INFO service started",
                    "[2026-04-27 10:01:02] [warn] slow request",
                    "continuation without markers",
                )
            ),
        )

        self.assertEqual(len(result.events), 3)
        self.assertEqual(result.events[0].timestamp, "2026-04-27T10:00:00Z")
        self.assertEqual(result.events[0].level, "INFO")
        self.assertEqual(result.events[0].message, "service started")
        self.assertEqual(result.events[1].timestamp, "2026-04-27 10:01:02")
        self.assertEqual(result.events[1].level, "WARN")
        self.assertEqual(result.events[1].message, "slow request")
        self.assertEqual(result.events[2].timestamp, None)
        self.assertEqual(result.events[2].level, None)
        self.assertEqual(result.events[2].message, "continuation without markers")
        self.assertEqual(result.events[2].content, "continuation without markers")

    def test_plain_text_logs_use_stable_line_chunks(self) -> None:
        result = parse_plain_text_logs("file://app.log", "DEBUG first\nERROR second\n")

        self.assertEqual([event.content for event in result.events], ["DEBUG first", "ERROR second"])
        self.assertEqual([event.citation.range.start_line for event in result.events], [1, 2])
        self.assertEqual([event.citation.range.end_line for event in result.events], [1, 2])
        self.assertEqual(result.events[0].level, "DEBUG")
        self.assertEqual(result.events[1].level, "ERROR")

    def test_plain_text_logs_default_to_untrusted(self) -> None:
        result = parse_plain_text_logs("file://app.log", "INFO ready")

        self.assertFalse(result.events[0].citation.trusted)
        self.assertTrue(result.documents[0].untrusted)

    def test_plain_text_connector_delegates_to_parser(self) -> None:
        result = PlainTextLogConnector.parse("file://app.log", "INFO ready")

        self.assertEqual(result.events[0].message, "ready")


if __name__ == "__main__":
    unittest.main()
