from __future__ import annotations

from contextlib import nullcontext
import unittest

from scripts.openapi_fixture_contract import (
    assert_fixture_routes_documented,
    normalize_fixture_requests,
    route_template_for,
)


PLUGIN_RECORDS = "/v1/plugins/review-artifacts/records"
MCP_RECORDS = "/v1/mcp/approval-evidence/records"


class OpenApiFixtureContractTests(unittest.TestCase):
    def test_route_template_for_maps_record_detail_and_compare_paths(self) -> None:
        cases = {
            f"{PLUGIN_RECORDS}/record-123": f"{PLUGIN_RECORDS}/{{recordId}}",
            f"{PLUGIN_RECORDS}/record-123/compare": (
                f"{PLUGIN_RECORDS}/{{recordId}}/compare"
            ),
            f"{PLUGIN_RECORDS}/compare": f"{PLUGIN_RECORDS}/{{recordId}}/compare",
            f"{MCP_RECORDS}/record-123": f"{MCP_RECORDS}/{{recordId}}",
            f"{MCP_RECORDS}/record-123/compare": (
                f"{MCP_RECORDS}/{{recordId}}/compare"
            ),
            f"{MCP_RECORDS}/compare": f"{MCP_RECORDS}/{{recordId}}/compare",
        }

        for path, expected in cases.items():
            with self.subTest(path=path):
                self.assertEqual(route_template_for(path), expected)

    def test_route_template_for_rejects_unsafe_path_parameters(self) -> None:
        unsafe_paths = (
            f"{PLUGIN_RECORDS}/../record-123",
            f"{PLUGIN_RECORDS}/record-123/../compare",
            f"{PLUGIN_RECORDS}/%2e%2e",
            f"{PLUGIN_RECORDS}/C:\\temp\\record-123",
            f"{MCP_RECORDS}/record-123?raw=true",
            f"{MCP_RECORDS}//record-123",
        )

        for path in unsafe_paths:
            with self.subTest(path=path):
                with self.assertRaisesRegex(AssertionError, "unsafe path parameter"):
                    route_template_for(path)

    def test_normalize_fixture_requests_accepts_nested_and_flat_entries(self) -> None:
        bundle = {
            "requests": [
                {
                    "id": "nested-create",
                    "route": {"method": "post", "path": PLUGIN_RECORDS},
                    "expect": {"status": 201},
                },
                {
                    "id": "flat-read",
                    "method": "get",
                    "path": f"{MCP_RECORDS}/record-123",
                    "expectedStatus": 200,
                },
            ]
        }

        requests = normalize_fixture_requests(bundle)

        self.assertEqual(
            [
                (
                    request.request_id,
                    request.method,
                    request.route_template,
                    request.expected_status,
                )
                for request in requests
            ],
            [
                ("nested-create", "POST", PLUGIN_RECORDS, 201),
                ("flat-read", "GET", f"{MCP_RECORDS}/{{recordId}}", 200),
            ],
        )

    def test_assert_fixture_routes_documented_reports_missing_openapi_path(self) -> None:
        bundle = {
            "requests": [
                {
                    "id": "missing-path",
                    "method": "GET",
                    "path": f"{PLUGIN_RECORDS}/record-123",
                    "expectedStatus": 200,
                }
            ]
        }

        with self.assertRaisesRegex(
            AssertionError,
            rf"missing OpenAPI block: {PLUGIN_RECORDS}/\{{recordId\}}",
        ):
            assert_fixture_routes_documented(
                strict_testcase(),
                bundle=bundle,
                openapi_lines=["paths:"],
                expected_routes={("GET", f"{PLUGIN_RECORDS}/{{recordId}}")},
                expected_tag="Records",
                request_body_refs={},
            )

    def test_assert_fixture_routes_documented_reports_missing_expected_route(self) -> None:
        route_template = f"{PLUGIN_RECORDS}/{{recordId}}"
        bundle = {
            "requests": [
                {
                    "id": "unexpected-route",
                    "method": "GET",
                    "path": f"{PLUGIN_RECORDS}/record-123",
                    "expectedStatus": 200,
                }
            ]
        }

        with self.assertRaises(AssertionError) as captured:
            assert_fixture_routes_documented(
                strict_testcase(),
                bundle=bundle,
                openapi_lines=record_detail_openapi_lines(route_template),
                expected_routes=set(),
                expected_tag="Records",
                request_body_refs={},
            )

        self.assertIn(
            "Items in the first set but not the second",
            str(captured.exception),
        )
        self.assertIn(route_template, str(captured.exception))


def record_detail_openapi_lines(route_template: str) -> list[str]:
    return [
        "paths:",
        f"  {route_template}:",
        "    get:",
        "      tags:",
        "        - Records",
        "      parameters:",
        "        - name: recordId",
        "          in: path",
        "          schema:",
        "            type: string",
        "            minLength: 1",
        "      responses:",
        '        "200":',
        "          description: ok",
    ]


def strict_testcase() -> unittest.TestCase:
    testcase = unittest.TestCase(methodName="run")
    testcase.subTest = lambda *args, **kwargs: nullcontext()
    return testcase


if __name__ == "__main__":
    unittest.main()
