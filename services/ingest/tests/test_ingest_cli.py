from __future__ import annotations

import contextlib
import hashlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from unittest.mock import patch

from services.ingest.src.sovereignops_ingest import cli


class IngestCliTests(unittest.TestCase):
    def run_cli(self, argv: List[str], stdin: Optional[str] = None) -> Tuple[int, Dict[str, Any]]:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            if stdin is None:
                status = cli.main(argv)
            else:
                with patch.object(sys, "stdin", io.StringIO(stdin)):
                    status = cli.main(argv)

        self.assertEqual(stderr.getvalue(), "")
        return status, json.loads(stdout.getvalue())

    def test_parse_markdown_file_outputs_summaries_and_citations(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "notes.md"
            path.write_text("# Alpha\nFirst\n## Beta\nSecond\n", encoding="utf-8")

            status, payload = self.run_cli(
                ["parse-markdown", "--source-uri", "file://notes.md", str(path)]
            )

        self.assertEqual(status, 0)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["summary"]["document_count"], 2)
        self.assertEqual(payload["summary"]["chunk_count"], 2)
        self.assertEqual(payload["document_summaries"][0]["heading"], "Alpha")
        self.assertEqual(payload["chunk_summaries"][1]["heading"], "Beta")
        self.assertEqual(payload["documents"][0]["citation"]["range"]["start_line"], 1)
        self.assertEqual(payload["citations"][1]["range"]["start_line"], 3)

    def test_parse_json_reads_stdin_and_orders_paths(self) -> None:
        status, payload = self.run_cli(
            ["parse-json", "--source-uri", "stdin://items"],
            stdin='{"z": 1, "a": {"name": "Alpha"}}',
        )

        self.assertEqual(status, 0)
        self.assertTrue(payload["ok"])
        paths = [summary["path"] for summary in payload["document_summaries"]]
        self.assertEqual(paths, ["$.a.name", "$.z"])
        self.assertEqual(payload["documents"][0]["content"], '"Alpha"')
        self.assertEqual(payload["documents"][0]["citation"]["range"]["path"], "$.a.name")

    def test_parse_csv_reports_columns_and_validation_errors(self) -> None:
        status, payload = self.run_cli(
            [
                "parse-csv",
                "--source-uri",
                "stdin://items",
                "--require-column",
                "id",
                "--require-column",
                "name",
            ],
            stdin="id,name\nA1,Alpha\nB2\nC3,\n",
        )

        self.assertEqual(status, 1)
        self.assertFalse(payload["ok"])
        self.assertEqual([column["name"] for column in payload["columns"]], ["id", "name"])
        self.assertEqual(payload["summary"]["document_count"], 3)
        error_codes = [error["code"] for error in payload["validation_errors"]]
        self.assertEqual(
            error_codes,
            [
                "csv_row_width_mismatch",
                "csv_required_value_empty",
                "csv_required_value_empty",
            ],
        )
        self.assertEqual(payload["validation_errors"][0]["row"], 3)
        self.assertEqual(payload["validation_errors"][1]["column"], "name")

    def test_checksum_file_outputs_sha256_and_byte_length(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "input.bin"
            path.write_bytes(b"abc")

            status, payload = self.run_cli(["checksum", str(path)])

        self.assertEqual(status, 0)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["algorithm"], "sha256")
        self.assertEqual(payload["checksum"], hashlib.sha256(b"abc").hexdigest())
        self.assertEqual(payload["byte_length"], 3)

    def test_normalize_reads_stdin(self) -> None:
        status, payload = self.run_cli(
            ["normalize", "--source-uri", "stdin://text"],
            stdin="  A  \r\nB  \n\n",
        )

        self.assertEqual(status, 0)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["normalized_text"], "A\nB")
        self.assertEqual(
            payload["checksum"],
            hashlib.sha256("  A  \r\nB  \n\n".encode()).hexdigest(),
        )
        self.assertTrue(payload["untrusted"])

    def test_invalid_args_return_json_error(self) -> None:
        status, payload = self.run_cli(["missing-command"])

        self.assertEqual(status, 2)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "invalid_args")

    def test_invalid_json_returns_json_error(self) -> None:
        status, payload = self.run_cli(
            ["parse-json", "--source-uri", "stdin://bad"],
            stdin='{"name": ',
        )

        self.assertEqual(status, 1)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"]["code"], "invalid_input")
        self.assertIn("invalid JSON", payload["error"]["message"])


if __name__ == "__main__":
    unittest.main()
