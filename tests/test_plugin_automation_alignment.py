from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]

EXPECTED_ROUND25_FILES = (
    "packages/plugin-sdk/src/sandbox.ts",
    "packages/plugin-sdk/src/sandboxReview.ts",
    "packages/plugin-sdk/tests/sandbox.test.mjs",
    "packages/plugin-sdk/tests/sandbox-review.test.mjs",
    "packages/plugin-sdk/tests/plugin-examples.test.mjs",
    "packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs",
    "services/automation/src/audit.ts",
    "services/automation/src/rules.ts",
    "services/automation/tests/automation-audit.test.mjs",
    "services/automation/tests/automation.test.mjs",
    "apps/web/src/automationPluginReview.ts",
    "apps/web/src/automationSettings.ts",
    "apps/web/tests/automation-plugin-review.test.mjs",
    "apps/web/tests/automation-settings.test.mjs",
    "examples/plugins/release-notes/manifest.json",
    "examples/plugins/release-notes/plugin.json",
    "examples/plugins/release-notes/index.mjs",
    "examples/plugins/release-notes/sample-input.json",
    "examples/plugins/release-notes/README.md",
    "docs/plugin-development.md",
    "docs/plugin-sandbox.md",
    "docs/plugin-release-notes-example.md",
    "tests/test_plugin_sandbox_docs.py",
)

EXPECTED_EXPORTS = {
    "packages/plugin-sdk/src/sandbox.ts": (
        "DEFAULT_PLUGIN_SANDBOX_LIMITS",
        "DENIED_PLUGIN_HOST_APIS",
        "PluginSandboxError",
        "createPluginSandboxBoundary",
        "createPluginSandboxHarness",
        "runPluginInSandbox",
    ),
    "packages/plugin-sdk/src/sandboxReview.ts": (
        "summarizePluginSandboxRun",
    ),
    "services/automation/src/audit.ts": (
        "AUTOMATION_AUDIT_EVENT_TYPES",
        "AUTOMATION_AUDIT_REDACTED",
        "createExecutionProposalAuditEvent",
        "createPermissionGrantAuditEvent",
        "createPermissionRevokeAuditEvent",
        "createPreviewRunAuditEvent",
        "createRuleChangeAuditEvent",
        "redactAutomationAuditValue",
        "serializeAutomationAuditEvent",
        "sortAutomationAuditEvents",
        "summarizeAutomationAuditEvents",
    ),
    "services/automation/src/rules.ts": (
        "AutomationAuditEmitter",
        "createAutomationAuditEmitter",
        "evaluateAutomationRule",
        "evaluateAutomationRules",
        "proposeAutomationAction",
        "validateAutomationRule",
    ),
    "apps/web/src/automationSettings.ts": (
        "AUTOMATION_SETTINGS_TABS",
        "addAutomationRule",
        "automationSettingsReducer",
        "buildAutomationPreviewSummary",
        "createAutomationSettingsState",
        "grantPluginPermission",
        "revokePluginPermission",
        "updateAutomationAuditOptions",
    ),
    "apps/web/src/automationPluginReview.ts": (
        "AUTOMATION_PLUGIN_REVIEW_STATES",
        "buildAutomationAuditCounters",
        "buildAutomationApprovalGatePanels",
        "buildAutomationPermissionCards",
        "buildAutomationPluginReviewViewModel",
        "buildAutomationReviewActions",
        "buildAutomationSandboxFindings",
    ),
    "examples/plugins/release-notes/index.mjs": (
        "draftReleaseNotes",
    ),
}

EXPECTED_REEXPORTS = {
    "packages/plugin-sdk/src/index.ts": ("./sandbox.ts", "./sandboxReview.ts"),
    "services/automation/src/index.ts": ("./rules.ts", "./audit.ts"),
    "apps/web/src/main.ts": ("./automationSettings.ts", "./automationPluginReview.ts"),
}

EXPECTED_PACKAGE_SCRIPT_TESTS = {
    "packages/plugin-sdk/package.json": (
        "tests/sandbox.test.mjs",
        "tests/sandbox-review.test.mjs",
        "tests/plugin-examples.test.mjs",
        "tests/release-notes-plugin-example.test.mjs",
    ),
    "services/automation/package.json": (
        "tests/automation.test.mjs",
        "tests/automation-audit.test.mjs",
    ),
    "apps/web/package.json": (
        "tests/automation-settings.test.mjs",
        "tests/automation-plugin-review.test.mjs",
    ),
}

OPTIONAL_PARENT_WIRED_TESTS: dict[str, tuple[str, ...]] = {}

EXPECTED_DOC_REFERENCES = {
    "docs/plugin-development.md": (
        "packages/plugin-sdk/src/sandbox.ts",
        "npm.cmd --workspace @sovereignops/plugin-sdk run check",
        "createPluginSandboxHarness()",
        "runPluginInSandbox",
    ),
    "docs/onboarding-tutorial.md": (
        "docs/plugin-development.md",
        "packages/plugin-sdk/src/manifest.ts",
        "packages/plugin-sdk/src/sandbox.ts",
        "apps/web/src/auditTimeline.ts",
        "services/mcp-gateway/src/auditEmitter.ts",
        "python -m unittest discover -s tests",
    ),
    "docs/plugin-sandbox.md": (
        "packages/plugin-sdk/src/sandbox.ts",
        "packages/plugin-sdk/src/manifest.ts",
        "packages/plugin-sdk/tests/sandbox.test.mjs",
        "packages/plugin-sdk/tests/plugin-examples.test.mjs",
        "packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs",
        "examples/plugins/release-notes/manifest.json",
        "examples/plugins/release-notes/plugin.json",
        "examples/plugins/release-notes/index.mjs",
        "examples/plugins/release-notes/sample-input.json",
        "docs/plugin-release-notes-example.md",
        "python -m unittest tests.test_plugin_sandbox_docs",
        "npm.cmd --workspace @sovereignops/plugin-sdk run check",
    ),
    "docs/plugin-release-notes-example.md": (
        "examples/plugins/release-notes/manifest.json",
        "examples/plugins/release-notes/plugin.json",
        "examples/plugins/release-notes/index.mjs",
        "examples/plugins/release-notes/sample-input.json",
        "packages/plugin-sdk/tests/plugin-examples.test.mjs",
        "packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs",
        "packages/plugin-sdk/src/sandbox.ts",
        "packages/plugin-sdk/src/manifest.ts",
        "docs/plugin-sandbox.md",
        "python -m unittest tests.test_plugin_sandbox_docs",
        "npm.cmd --workspace @sovereignops/plugin-sdk run check",
    ),
}

SCAN_DOC_AND_EXAMPLE_PATHS = (
    "docs/plugin-development.md",
    "docs/onboarding-tutorial.md",
    "docs/plugin-sandbox.md",
    "docs/plugin-release-notes-example.md",
    "examples/plugins/release-notes/manifest.json",
    "examples/plugins/release-notes/plugin.json",
    "examples/plugins/release-notes/index.mjs",
    "examples/plugins/release-notes/sample-input.json",
    "examples/plugins/release-notes/README.md",
)

LOCAL_URI_PREFIXES = (
    "sovereignops://",
    "workspace://",
    "local://",
    "fixture://",
    "file://",
    "stdin://",
)

NETWORK_MARKERS = (
    "http://",
    "https://",
    "curl ",
    "npx ",
    "npm install -g",
)

PRIVATE_PATH_MARKERS = (
    "." + "codex-private",
    "sovereignops-" + "codex-pack",
    "CODEX" + "_START" + "_HERE",
    "tasks/backlog.jsonl",
    "tasks\\backlog.jsonl",
)

DISALLOWED_EXAMPLE_PERMISSIONS = (
    "write_object",
    "sync_bundle",
    "manage_plugin",
)


class PluginAutomationAlignmentTests(unittest.TestCase):
    def test_round25_files_exist(self) -> None:
        for rel_path in EXPECTED_ROUND25_FILES:
            with self.subTest(path=rel_path):
                path = ROOT / rel_path
                self.assertTrue(path.is_file(), rel_path)

    def test_exports_and_package_roots_keep_new_surfaces_public(self) -> None:
        for rel_path, symbols in EXPECTED_EXPORTS.items():
            text = read_text(rel_path)
            for symbol in symbols:
                with self.subTest(path=rel_path, symbol=symbol):
                    assert_ts_exported(self, text, symbol)

        for rel_path, reexports in EXPECTED_REEXPORTS.items():
            for reexport in reexports:
                with self.subTest(path=rel_path, reexport=reexport):
                    self.assertIn(f'export * from "{reexport}";', read_text(rel_path))

    def test_package_scripts_wire_focused_tests_once(self) -> None:
        root_package = read_json("package.json")
        self.assertEqual(root_package["scripts"]["test"], "python -m unittest discover -s tests")

        for rel_path, expected_tests in EXPECTED_PACKAGE_SCRIPT_TESTS.items():
            package = read_json(rel_path)
            scripts = package["scripts"]
            for script_name in ("check", "test"):
                script = scripts[script_name]
                for expected_test in expected_tests:
                    with self.subTest(path=rel_path, script=script_name, test=expected_test):
                        self.assertEqual(script.count(expected_test), 1, script)

        for rel_path, optional_tests in OPTIONAL_PARENT_WIRED_TESTS.items():
            package = read_json(rel_path)
            scripts = package["scripts"]
            for script_name in ("check", "test"):
                script = scripts[script_name]
                for optional_test in optional_tests:
                    with self.subTest(path=rel_path, script=script_name, test=optional_test):
                        self.assertLessEqual(script.count(optional_test), 1, script)

    def test_docs_reference_public_repo_paths(self) -> None:
        for rel_path, expected_refs in EXPECTED_DOC_REFERENCES.items():
            text = read_text(rel_path)
            for expected_ref in expected_refs:
                with self.subTest(path=rel_path, ref=expected_ref):
                    self.assertIn(expected_ref, text)

            for public_path in extract_public_repo_paths(text):
                with self.subTest(path=rel_path, public_path=public_path):
                    assert_safe_public_path(self, public_path)

    def test_release_notes_example_stays_local_and_proposal_only(self) -> None:
        manifest = read_json("examples/plugins/release-notes/manifest.json")
        local_manifest = read_json("examples/plugins/release-notes/plugin.json")
        sample_input = read_json("examples/plugins/release-notes/sample-input.json")
        readme = read_text("examples/plugins/release-notes/README.md")
        source = read_text("examples/plugins/release-notes/index.mjs")

        self.assertEqual(manifest["id"], "plugin.release-notes")
        self.assertEqual(manifest["entrypoint"], "index.mjs")
        self.assertEqual(local_manifest["id"], "plugin.release-notes.local-draft")
        self.assertEqual(local_manifest["entrypoint"], "index.mjs")
        for example_manifest in (manifest, local_manifest):
            with self.subTest(manifest=example_manifest["id"]):
                self.assertEqual(
                    sorted(example_manifest["permissions"]),
                    ["propose_agent_action", "read_object"],
                )
            for permission in DISALLOWED_EXAMPLE_PERMISSIONS:
                with self.subTest(manifest=example_manifest["id"], permission=permission):
                    self.assertNotIn(permission, example_manifest["permissions"])

        self.assertIn('context.requireCapability("read_completed_tasks")', source)
        self.assertIn('context.requireCapability("propose_release_notes")', source)
        self.assertIn("context.audit(", source)
        self.assertIn("context.tick(", source)
        self.assertIn("proposalOnly: true", source)
        self.assertNotRegex(source, r"\bfetch\s*\(")
        self.assertNotRegex(source, r"\bimport\s+")
        self.assertNotRegex(source, r"\brequire\s*\(")
        self.assertNotIn("process.", source)

        for example_manifest in (manifest, local_manifest):
            for uri in find_json_values_by_key(example_manifest, "uri"):
                with self.subTest(manifest=example_manifest["id"], uri=uri):
                    self.assertTrue(uri.startswith(LOCAL_URI_PREFIXES), uri)

        for value in (
            walk_strings(manifest)
            + walk_strings(local_manifest)
            + walk_strings(sample_input)
            + [source, readme]
        ):
            with self.subTest(value=value[:64]):
                assert_local_only_text(self, value)

    def test_docs_and_examples_avoid_private_paths_and_guarded_content(self) -> None:
        for rel_path in SCAN_DOC_AND_EXAMPLE_PATHS:
            path = ROOT / rel_path
            text = path.read_text(encoding="utf-8")
            lower_text = text.lower()
            with self.subTest(path=rel_path, kind="private-paths"):
                for marker in PRIVATE_PATH_MARKERS:
                    self.assertNotIn(marker.lower(), lower_text)

            with self.subTest(path=rel_path, kind="guarded-content"):
                assert_no_guarded_terms(self, path, text)


def read_text(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def read_json(rel_path: str) -> Any:
    return json.loads(read_text(rel_path))


def assert_ts_exported(testcase: unittest.TestCase, text: str, symbol: str) -> None:
    pattern = re.compile(
        rf"\bexport\s+(?:const|function|class|interface|type)\s+{re.escape(symbol)}\b"
    )
    testcase.assertRegex(text, pattern)


def extract_public_repo_paths(text: str) -> list[str]:
    paths: list[str] = []
    for match in re.finditer(r"`([^`]+)`", text):
        value = match.group(1)
        if not looks_like_repo_file_path(value):
            continue
        paths.append(value.replace("\\", "/"))
    return paths


def looks_like_repo_file_path(value: str) -> bool:
    normalized = value.replace("\\", "/")
    if normalized.startswith(("/", "./", "../")):
        return False
    if re.match(r"^[A-Za-z]:/", normalized):
        return False
    parts = normalized.split("/")
    return (
        len(parts) > 1
        and "." in parts[-1]
        and not normalized.startswith(".")
        and " " not in normalized
    )


def assert_safe_public_path(testcase: unittest.TestCase, public_path: str) -> None:
    path = Path(public_path)
    testcase.assertFalse(path.is_absolute(), public_path)
    testcase.assertNotIn("..", path.parts, public_path)
    testcase.assertTrue((ROOT / path).is_file(), public_path)


def find_json_values_by_key(value: Any, key: str) -> list[str]:
    matches: list[str] = []
    if isinstance(value, dict):
        for item_key, item in value.items():
            if item_key == key and isinstance(item, str):
                matches.append(item)
            matches.extend(find_json_values_by_key(item, key))
    elif isinstance(value, list):
        for item in value:
            matches.extend(find_json_values_by_key(item, key))
    return matches


def walk_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        strings: list[str] = []
        for item in value.values():
            strings.extend(walk_strings(item))
        return strings
    if isinstance(value, list):
        strings = []
        for item in value:
            strings.extend(walk_strings(item))
        return strings
    return []


def assert_local_only_text(testcase: unittest.TestCase, value: str) -> None:
    lower = value.lower()
    for marker in NETWORK_MARKERS:
        testcase.assertNotIn(marker, lower)


def assert_no_guarded_terms(testcase: unittest.TestCase, path: Path, text: str) -> None:
    lower_text = text.lower()
    restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
    for term in restricted_terms:
        if term.isascii():
            escaped = re.escape(term).replace(r"\ ", r"\s+")
            pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
            testcase.assertIsNone(pattern.search(lower_text), f"{path} contains guarded wording")
        else:
            testcase.assertNotIn(term, lower_text, f"{path} contains guarded wording")


if __name__ == "__main__":
    unittest.main()
