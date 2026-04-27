from __future__ import annotations

import contextlib
import io
import json
import unittest

from benchmarks import cases as benchmark_cases
from benchmarks.harness import (
    BenchmarkError,
    BenchmarkRegistry,
    DEFAULT_REGISTRY,
    main,
    render_json,
    run_benchmarks,
)


class BenchmarkHarnessTests(unittest.TestCase):
    def test_registers_and_runs_case_with_repeat_count(self) -> None:
        registry = BenchmarkRegistry()
        calls = {"count": 0}

        @registry.register("sample_case", description="sample")
        def sample_case():
            calls["count"] += 1
            return {
                "checksum": "same-each-repeat",
                "metadata": {"items": 2},
                "operations": 2,
            }

        ticks = iter([10.0, 10.125])
        summary = run_benchmarks(
            registry,
            repeats=3,
            clock=lambda: next(ticks),
        )

        self.assertEqual(calls["count"], 3)
        self.assertFalse(summary.dry_run)
        self.assertEqual(summary.results[0].elapsed_seconds, 0.125)
        self.assertEqual(summary.results[0].operations, 6)
        self.assertEqual(summary.results[0].metadata, {"items": 2})

    def test_dry_run_json_is_deterministic_and_has_no_timing_fields(self) -> None:
        first = render_json(run_benchmarks(DEFAULT_REGISTRY, repeats=2, dry_run=True))
        second = render_json(run_benchmarks(DEFAULT_REGISTRY, repeats=2, dry_run=True))

        self.assertEqual(first, second)
        payload = json.loads(first)
        self.assertTrue(payload["dryRun"])
        self.assertEqual(payload["repeats"], 2)
        self.assertEqual(
            [case["name"] for case in payload["cases"]],
            ["event_serialization", "policy_preview_decisions"],
        )
        for case in payload["cases"]:
            self.assertNotIn("elapsedSeconds", case)

    def test_cli_outputs_selected_dry_run_json(self) -> None:
        stream = io.StringIO()

        with contextlib.redirect_stdout(stream):
            exit_code = main(["--dry-run", "--repeat", "1", "--case", "event_serialization"])

        payload = json.loads(stream.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["caseCount"], 1)
        self.assertEqual(payload["cases"][0]["name"], "event_serialization")
        self.assertEqual(payload["cases"][0]["metadata"]["events"], len(benchmark_cases.EVENT_STREAM))

    def test_duplicate_case_names_are_rejected(self) -> None:
        registry = BenchmarkRegistry()

        @registry.register("duplicate")
        def first_case():
            return {"checksum": "first"}

        with self.assertRaises(BenchmarkError):
            registry.register("duplicate", lambda: {"checksum": "second"})

        self.assertEqual(first_case()["checksum"], "first")

    def test_non_deterministic_samples_are_rejected(self) -> None:
        registry = BenchmarkRegistry()
        calls = {"count": 0}

        @registry.register("impure_case")
        def impure_case():
            calls["count"] += 1
            return {
                "checksum": str(calls["count"]),
                "metadata": {"items": 1},
                "operations": 1,
            }

        with self.assertRaises(BenchmarkError):
            run_benchmarks(registry, repeats=2, dry_run=True)

    def test_default_cases_report_expected_metadata(self) -> None:
        summary = run_benchmarks(DEFAULT_REGISTRY, repeats=1, dry_run=True)
        by_name = {result.name: result for result in summary.results}

        self.assertEqual(by_name["event_serialization"].metadata["workspaceId"], "wsp_studio_labs")
        self.assertEqual(by_name["event_serialization"].metadata["events"], 3)
        self.assertEqual(by_name["policy_preview_decisions"].metadata["requests"], 4)
        self.assertEqual(by_name["policy_preview_decisions"].metadata["allowed"], 2)
        self.assertEqual(by_name["policy_preview_decisions"].metadata["review"], 1)
        self.assertEqual(by_name["policy_preview_decisions"].metadata["blocked"], 1)


if __name__ == "__main__":
    unittest.main()
