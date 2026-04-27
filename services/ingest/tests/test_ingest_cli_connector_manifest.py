from __future__ import annotations

import contextlib
import io
import json
import unittest
from typing import Any, Dict, List, Tuple

from services.ingest.src.sovereignops_ingest import cli


class IngestCliConnectorManifestTests(unittest.TestCase):
    def run_cli(self, argv: List[str]) -> Tuple[int, Dict[str, Any], str]:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            status = cli.main(argv)

        self.assertEqual(stderr.getvalue(), "")
        return status, json.loads(stdout.getvalue()), stdout.getvalue()

    def test_connectors_manifest_outputs_local_capabilities(self) -> None:
        status, payload, _raw = self.run_cli(["connectors", "manifest"])

        self.assertEqual(status, 0)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["command"], "connectors manifest")

        manifest = payload["manifest"]
        self.assertEqual(manifest["kind"], "sovereignops.ingest.connector-manifest")
        self.assertTrue(manifest["local_only"])
        self.assertTrue(manifest["read_only"])
        self.assertFalse(manifest["network_access"])
        self.assertFalse(manifest["path_inputs"])

        connectors = manifest["connectors"]
        ids = [connector["id"] for connector in connectors]
        self.assertEqual(ids, sorted(ids))

        for connector in connectors:
            self.assertEqual(connector["media_types"], sorted(connector["media_types"]))
            self.assertIn("citation_capabilities", connector)
            self.assertIn("safety_findings", connector)

        csv_connector = self.connector_for_media_type(connectors, "text/csv")
        json_connector = self.connector_for_media_type(connectors, "application/json")
        markdown_connector = self.connector_for_media_type(connectors, "text/markdown")

        self.assertIn("table_cell", csv_connector["citation_capabilities"])
        self.assertIn("json_path", json_connector["citation_capabilities"])
        self.assertIn("line_range", markdown_connector["citation_capabilities"])
        self.assertIn(
            "source_document_citation",
            manifest["search_capabilities"]["citation_capabilities"],
        )

        markdown_findings = {
            finding["code"] for finding in markdown_connector["safety_findings"]
        }
        self.assertEqual(
            markdown_findings,
            {"embedded_instruction_override", "embedded_prompt_reference"},
        )

    def test_connector_manifest_alias_matches_nested_command(self) -> None:
        nested_status, nested_payload, nested_raw = self.run_cli(["connectors", "manifest"])
        alias_status, alias_payload, alias_raw = self.run_cli(["connector-manifest"])

        self.assertEqual(nested_status, 0)
        self.assertEqual(alias_status, 0)
        self.assertEqual(alias_payload, nested_payload)
        self.assertEqual(alias_raw, nested_raw)

    def test_connector_manifest_rejects_unsupported_flags_and_positionals(self) -> None:
        bad_argvs = [
            ["connectors", "manifest", "extra"],
            ["connectors", "manifest", "--source-uri", "stdin://items"],
            ["connector-manifest", "--trusted"],
        ]

        for argv in bad_argvs:
            with self.subTest(argv=argv):
                status, payload, _raw = self.run_cli(argv)

                self.assertEqual(status, 2)
                self.assertFalse(payload["ok"])
                self.assertEqual(payload["error"]["code"], "invalid_args")

    def test_connector_manifest_does_not_leak_private_paths_or_secret_shapes(self) -> None:
        status, _payload, raw = self.run_cli(["connectors", "manifest"])

        self.assertEqual(status, 0)
        forbidden_fragments = [
            ".codex-private",
            "E:/",
            "E:\\",
            "apiKey",
            "api_key",
            "authorization",
            "bearer",
            "password",
            "secret",
            "token",
        ]
        lower_raw = raw.lower()
        for fragment in forbidden_fragments:
            with self.subTest(fragment=fragment):
                self.assertNotIn(fragment.lower(), lower_raw)

    @staticmethod
    def connector_for_media_type(
        connectors: List[Dict[str, Any]], media_type: str
    ) -> Dict[str, Any]:
        for connector in connectors:
            if media_type in connector["media_types"]:
                return connector
        raise AssertionError(f"missing connector media type: {media_type}")


if __name__ == "__main__":
    unittest.main()
