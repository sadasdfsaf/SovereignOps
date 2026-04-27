from __future__ import annotations

import contextlib
import io
import json
import re
import tempfile
import unittest
from pathlib import Path

from scripts.generate_example_workspace import (
    PRESET_COUNTS,
    generate_example_workspace,
    main,
    write_bundle,
)
from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ID_PATTERNS = {
    "docs": re.compile(r"^doc_[A-Za-z0-9_-]{1,88}$"),
    "tasks": re.compile(r"^task_[A-Za-z0-9_-]{1,88}$"),
    "incidents": re.compile(r"^inc_[A-Za-z0-9_-]{1,88}$"),
    "approvals": re.compile(r"^apv_[A-Za-z0-9_-]{1,88}$"),
    "audit": re.compile(r"^aud_[A-Za-z0-9_-]{1,88}$"),
}


class GenerateExampleWorkspaceTests(unittest.TestCase):
    def test_generation_is_deterministic(self) -> None:
        first = generate_example_workspace(workspace_id="wsp_demo", preset="small")
        second = generate_example_workspace(workspace_id="wsp_demo", preset="small")

        self.assertEqual(first, second)
        self.assertEqual(
            json.dumps(first, sort_keys=True),
            json.dumps(second, sort_keys=True),
        )

    def test_record_ids_are_schema_like_and_targets_exist(self) -> None:
        bundle = generate_example_workspace(workspace_id="wsp_demo", preset="standard")
        records = bundle["records"]
        target_ids = set()

        for kind, pattern in ID_PATTERNS.items():
            for record in records[kind]:
                self.assertRegex(record["id"], pattern)
                self.assertEqual(record["workspaceId"], "wsp_demo")
                target_ids.add(record["id"])

        for approval in records["approvals"]:
            self.assertIn(approval["targetId"], target_ids)
        for audit in records["audit"]:
            self.assertIn(audit["targetId"], target_ids)

    def test_bundle_avoids_blocked_terms(self) -> None:
        bundle = generate_example_workspace(workspace_id="wsp_demo", preset="standard")
        text = json.dumps(bundle, sort_keys=True).lower()
        blocked_terms = ["".join(parts).lower() for parts in RESTRICTED_PUBLIC_TERM_PARTS]

        for term in blocked_terms:
            self.assertNotIn(term, text)

    def test_output_shape_matches_preset(self) -> None:
        bundle = generate_example_workspace(workspace_id="wsp_demo", preset="tiny")
        metadata = bundle["metadata"]
        records = bundle["records"]
        expected_counts = PRESET_COUNTS["tiny"].as_dict()

        self.assertEqual(bundle["workspace"]["id"], "wsp_demo")
        self.assertEqual(metadata["schemaVersion"], "example-workspace.v1")
        self.assertEqual(metadata["counts"], expected_counts)
        self.assertEqual(metadata["recordTotal"], sum(expected_counts.values()))
        self.assertEqual(set(records), {"docs", "tasks", "incidents", "approvals", "audit"})
        self.assertEqual({kind: len(items) for kind, items in records.items()}, expected_counts)
        self.assertEqual(records["docs"][0]["ownerActorId"], "act_owner")
        self.assertEqual(records["tasks"][0]["kind"], "task")
        self.assertIn("redactedPaths", records["audit"][0])

    def test_cli_previews_output_path_without_writing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output_path = Path(tmp) / "workspace.json"
            stream = io.StringIO()

            with contextlib.redirect_stdout(stream):
                exit_code = main(
                    [
                        "--workspace-id",
                        "wsp_demo",
                        "--preset",
                        "tiny",
                        "--output",
                        str(output_path),
                    ]
                )

            preview = stream.getvalue()
            self.assertEqual(exit_code, 0)
            self.assertIn("Example workspace preview", preview)
            self.assertIn(str(output_path), preview)
            self.assertIn("No files were written.", preview)
            self.assertFalse(output_path.exists())

    def test_cli_json_outputs_bundle_to_stdout(self) -> None:
        stream = io.StringIO()

        with contextlib.redirect_stdout(stream):
            exit_code = main(["--workspace-id", "wsp_demo", "--preset", "tiny", "--json"])

        payload = json.loads(stream.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["metadata"]["workspaceId"], "wsp_demo")
        self.assertEqual(payload["metadata"]["counts"], PRESET_COUNTS["tiny"].as_dict())

    def test_write_bundle_writes_only_when_called(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output_path = Path(tmp) / "workspace.json"
            bundle = generate_example_workspace(workspace_id="wsp_demo", preset="tiny")

            written = write_bundle(bundle, output_path)

            self.assertEqual(written, output_path)
            self.assertEqual(json.loads(output_path.read_text(encoding="utf-8")), bundle)


if __name__ == "__main__":
    unittest.main()
