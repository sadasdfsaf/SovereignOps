from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts import status_dashboard


class FakeFixtureDrift:
    called = False

    @staticmethod
    def verify_fixture_drift() -> dict[str, object]:
        FakeFixtureDrift.called = True
        return {
            "kind": "fixture-drift.summary",
            "schemaVersion": "fixture-drift.v1",
            "totalFixtures": 2,
            "totalRequests": 3,
            "routes": [
                {"method": "POST", "path": "/v1/widgets", "totalRequests": 2},
                {"method": "GET", "path": "/v1/widgets/{id}", "totalRequests": 1},
            ],
        }


class BrokenFixtureDrift:
    @staticmethod
    def verify_fixture_drift() -> dict[str, object]:
        raise RuntimeError("drift verifier failed")


class StatusDashboardFixtureDriftTests(unittest.TestCase):
    def test_collects_fixture_drift_summary_from_available_verifier(self) -> None:
        FakeFixtureDrift.called = False
        with tempfile.TemporaryDirectory() as tmp:
            dashboard = status_dashboard.collect_dashboard(
                Path(tmp),
                repo_health_module=None,
                fixture_drift_module=FakeFixtureDrift,
            )

        self.assertTrue(FakeFixtureDrift.called)
        self.assertTrue(dashboard.fixture_drift.available)
        self.assertTrue(dashboard.fixture_drift.ok)
        self.assertEqual(dashboard.fixture_drift.total_fixtures, 2)
        self.assertEqual(dashboard.fixture_drift.total_requests, 3)
        self.assertEqual(dashboard.fixture_drift.total_routes, 2)
        self.assertEqual(
            [(route.method, route.path, route.total_requests) for route in dashboard.fixture_drift.routes],
            [("GET", "/v1/widgets/{id}", 1), ("POST", "/v1/widgets", 2)],
        )

    def test_json_and_markdown_include_fixture_drift_totals_and_routes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dashboard = status_dashboard.collect_dashboard(
                Path(tmp),
                repo_health_module=None,
                fixture_drift_module=FakeFixtureDrift,
            )

        parsed = json.loads(status_dashboard.render_json(dashboard))
        markdown = status_dashboard.render_markdown(dashboard)

        self.assertEqual(parsed["fixture_drift"]["total_fixtures"], 2)
        self.assertEqual(parsed["fixture_drift"]["total_requests"], 3)
        self.assertEqual(parsed["fixture_drift"]["total_routes"], 2)
        self.assertEqual(parsed["fixture_drift"]["routes"][0]["method"], "GET")
        self.assertIn("## Fixture Drift", markdown)
        self.assertIn("- Total fixtures: 2", markdown)
        self.assertIn("- Total requests: 3", markdown)
        self.assertIn("- Total routes: 2", markdown)
        self.assertIn("| GET | /v1/widgets/{id} | 1 |", markdown)

    def test_missing_fixture_drift_verifier_is_reported_as_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dashboard = status_dashboard.collect_dashboard(
                Path(tmp),
                repo_health_module=None,
                fixture_drift_module=object(),
            )

        markdown = status_dashboard.render_markdown(dashboard)

        self.assertFalse(dashboard.fixture_drift.available)
        self.assertIsNone(dashboard.fixture_drift.ok)
        self.assertEqual(dashboard.fixture_drift.total_fixtures, 0)
        self.assertEqual(dashboard.fixture_drift.total_requests, 0)
        self.assertEqual(dashboard.fixture_drift.total_routes, 0)
        self.assertIn("- Status: unavailable", markdown)
        self.assertIn("- Total fixtures: 0", markdown)
        self.assertIn("- Total requests: 0", markdown)
        self.assertIn("- Total routes: 0", markdown)
        self.assertIn("verify_fixture_drift is unavailable", dashboard.fixture_drift.error)

    def test_fixture_drift_failure_is_reported_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dashboard = status_dashboard.collect_dashboard(
                Path(tmp),
                repo_health_module=None,
                fixture_drift_module=BrokenFixtureDrift,
            )

        markdown = status_dashboard.render_markdown(dashboard)

        self.assertTrue(dashboard.fixture_drift.available)
        self.assertFalse(dashboard.fixture_drift.ok)
        self.assertEqual(dashboard.fixture_drift.total_routes, 0)
        self.assertIn("- Status: issues", markdown)
        self.assertIn("- Error: drift verifier failed", markdown)


if __name__ == "__main__":
    unittest.main()
