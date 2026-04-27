from __future__ import annotations

import hashlib
import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]

EXAMPLE_ARTIFACT = "examples/plugins/release-notes/review-artifact.json"
DOC_PATH = "docs/plugin-review-artifacts.md"

EXPECTED_ROUND26_FILES = (
    "packages/plugin-sdk/src/reviewArtifact.ts",
    "packages/plugin-sdk/tests/review-artifact.test.mjs",
    "services/automation/src/pluginReview.ts",
    "services/automation/tests/plugin-review.test.mjs",
    "apps/web/src/pluginReviewArtifactState.ts",
    "apps/web/tests/plugin-review-artifact-state.test.mjs",
    "packages/cli/src/pluginReviewArtifact.ts",
    "packages/cli/tests/plugin-review-artifact.test.mjs",
    DOC_PATH,
    EXAMPLE_ARTIFACT,
    "tests/test_plugin_review_artifacts_docs.py",
    "tests/test_plugin_review_artifact_alignment.py",
)

EXPECTED_EXPORTS = {
    "packages/plugin-sdk/src/reviewArtifact.ts": (
        "createPluginReviewArtifact",
        "PluginReviewArtifact",
        "PluginReviewArtifactInput",
        "PluginReviewArtifactSchemaVersion",
    ),
    "services/automation/src/pluginReview.ts": (
        "AUTOMATION_PLUGIN_REVIEW_OUTCOMES",
        "buildAutomationPluginReviewArtifact",
        "cloneAutomationPluginReviewArtifact",
        "fingerprintAutomationPluginReviewArtifact",
        "serializeAutomationPluginReviewArtifact",
        "summarizeAutomationPluginReviewAudit",
    ),
    "apps/web/src/pluginReviewArtifactState.ts": (
        "PLUGIN_REVIEW_GATE_STATUSES",
        "buildPluginReviewActionButtons",
        "buildPluginReviewArtifactEmptyState",
        "buildPluginReviewArtifactErrorState",
        "buildPluginReviewArtifactState",
        "buildPluginReviewAuditCounters",
        "buildPluginReviewGateRows",
        "buildPluginReviewLocalEvidenceRows",
        "buildPluginReviewSandboxFindingRows",
        "buildPluginReviewSummaryCards",
    ),
    "packages/cli/src/pluginReviewArtifact.ts": (
        "createPluginReviewArtifactPreview",
        "isPluginReviewArtifactCommand",
        "runPluginReviewArtifactCli",
    ),
}

EXPECTED_REEXPORTS = {
    "packages/plugin-sdk/src/index.ts": ("./reviewArtifact.ts",),
    "services/automation/src/index.ts": ("./pluginReview.ts",),
    "apps/web/src/main.ts": ("./pluginReviewArtifactState.ts",),
    "packages/cli/src/index.ts": ("./pluginReviewArtifact.ts",),
}

EXPECTED_CLI_INDEX_SYMBOLS = (
    "runPluginReviewArtifactCli",
    "./pluginReviewArtifact.ts",
)

EXPECTED_PACKAGE_SCRIPT_TESTS = {
    "packages/plugin-sdk/package.json": ("tests/review-artifact.test.mjs",),
    "services/automation/package.json": ("tests/plugin-review.test.mjs",),
    "apps/web/package.json": ("tests/plugin-review-artifact-state.test.mjs",),
    "packages/cli/package.json": ("tests/plugin-review-artifact.test.mjs",),
}

EXPECTED_DOC_REFERENCES = (
    "packages/plugin-sdk/src/reviewArtifact.ts",
    "packages/plugin-sdk/tests/review-artifact.test.mjs",
    "services/automation/src/pluginReview.ts",
    "services/automation/tests/plugin-review.test.mjs",
    "apps/web/src/pluginReviewArtifactState.ts",
    "apps/web/tests/plugin-review-artifact-state.test.mjs",
    "packages/cli/src/pluginReviewArtifact.ts",
    "packages/cli/tests/plugin-review-artifact.test.mjs",
    "examples/plugins/release-notes/manifest.json",
    "examples/plugins/release-notes/plugin.json",
    "examples/plugins/release-notes/index.mjs",
    "examples/plugins/release-notes/sample-input.json",
    EXAMPLE_ARTIFACT,
    "tests/test_plugin_review_artifacts_docs.py",
    "python -m unittest tests.test_plugin_review_artifacts_docs",
)

EXPECTED_ARTIFACT_SOURCE_FILES = {
    "examples/plugins/release-notes/manifest.json",
    "examples/plugins/release-notes/plugin.json",
    "examples/plugins/release-notes/index.mjs",
    "examples/plugins/release-notes/sample-input.json",
    DOC_PATH,
}

SCAN_PATHS = tuple(
    path for path in EXPECTED_ROUND26_FILES
    if path != "tests/test_plugin_review_artifact_alignment.py"
) + (
    "packages/plugin-sdk/src/index.ts",
    "services/automation/src/index.ts",
    "apps/web/src/main.ts",
    "packages/cli/src/index.ts",
)

LOCAL_URI_PREFIXES = (
    "sovereignops://",
    "workspace://",
    "local://",
    "fixture://",
    "stdin://",
)

REMOTE_MARKERS = (
    "http://",
    "https://",
    "curl ",
    "invoke-restmethod",
    "start-process",
    "localhost",
    "127.0.0.1",
    "npm install -g",
    "npx ",
)

PRIVATE_PATH_MARKERS = (
    "sovereignops-" + "codex-pack",
    "CODEX" + "_START" + "_HERE",
    "tasks/backlog.jsonl",
    "tasks\\backlog.jsonl",
)

EXTRA_GUARDED_WORDS = (
    "public" + "-" + "sector",
    "public" + " " + "sector",
)

SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+"),
    re.compile(
        r"(?i)(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*"
        r"(?!\[REDACTED\])\S{4,}"
    ),
)

PATH_REF_RE = re.compile(
    r"(?<![A-Za-z0-9_.-])"
    r"((?:apps|docs|examples|packages|services|tests)[/\\]"
    r"[A-Za-z0-9_./\\-]+?\.(?:json|md|mjs|py|ts|yaml))"
    r"(?![A-Za-z0-9_.-])"
)


class PluginReviewArtifactAlignmentTests(unittest.TestCase):
    def test_round26_public_files_exist(self) -> None:
        for rel_path in EXPECTED_ROUND26_FILES:
            with self.subTest(path=rel_path):
                self.assertTrue((ROOT / rel_path).is_file(), rel_path)

    def test_expected_symbols_are_exported(self) -> None:
        for rel_path, symbols in EXPECTED_EXPORTS.items():
            if not (ROOT / rel_path).is_file():
                continue

            text = read_text(rel_path)
            for symbol in symbols:
                with self.subTest(path=rel_path, symbol=symbol):
                    assert_ts_exported(self, text, symbol)

        for rel_path, reexports in EXPECTED_REEXPORTS.items():
            if not (ROOT / rel_path).is_file():
                continue

            text = read_text(rel_path)
            for reexport in reexports:
                with self.subTest(path=rel_path, reexport=reexport):
                    self.assertIn(f'export * from "{reexport}";', text)

        cli_index = ROOT / "packages/cli/src/index.ts"
        if cli_index.is_file():
            cli_text = cli_index.read_text(encoding="utf-8")
            for symbol in EXPECTED_CLI_INDEX_SYMBOLS:
                with self.subTest(path="packages/cli/src/index.ts", symbol=symbol):
                    self.assertIn(symbol, cli_text)

    def test_package_scripts_include_focused_tests_once(self) -> None:
        root_package = read_json("package.json")
        self.assertEqual(root_package["scripts"]["test"], "python -m unittest discover -s tests")

        for rel_path, expected_tests in EXPECTED_PACKAGE_SCRIPT_TESTS.items():
            package = read_json(rel_path)
            for script_name in ("check", "test"):
                script = package["scripts"][script_name]
                for expected_test in expected_tests:
                    with self.subTest(path=rel_path, script=script_name, test=expected_test):
                        self.assertEqual(script.count(expected_test), 1, script)

    def test_docs_reference_public_repo_paths_only(self) -> None:
        if not (ROOT / DOC_PATH).is_file():
            self.skipTest(f"{DOC_PATH} is not present yet")

        text = read_text(DOC_PATH)
        for expected_ref in EXPECTED_DOC_REFERENCES:
            with self.subTest(ref=expected_ref):
                self.assertIn(expected_ref, text)

        for public_path in sorted(extract_repo_paths(text)):
            with self.subTest(public_path=public_path):
                assert_safe_public_path(self, public_path)

    def test_example_artifact_is_local_redacted_and_self_contained(self) -> None:
        if not (ROOT / EXAMPLE_ARTIFACT).is_file():
            self.skipTest(f"{EXAMPLE_ARTIFACT} is not present yet")

        artifact = read_json(EXAMPLE_ARTIFACT)
        values = walk_strings(artifact)
        repo_paths = extract_repo_paths(json.dumps(artifact, sort_keys=True))

        self.assertEqual(artifact.get("kind"), "plugin_review_artifact")
        self.assertEqual(artifact.get("artifactVersion"), "1.0.0")
        self.assertEqual(nested_get(artifact, ("scope", "localOnly")), True)
        self.assertEqual(nested_get(artifact, ("scope", "externalCalls")), 0)
        self.assertEqual(nested_get(artifact, ("proposal", "proposalOnly")), True)
        self.assertEqual(nested_get(artifact, ("proposal", "localOnly")), True)
        self.assertEqual(nested_get(artifact, ("proposal", "externalCalls")), 0)
        self.assertIn("[REDACTED]", values)
        self.assertGreater(len(redaction_paths(artifact)), 0)
        self.assertTrue(EXPECTED_ARTIFACT_SOURCE_FILES.issubset(repo_paths), repo_paths)

        for public_path in sorted(repo_paths):
            with self.subTest(public_path=public_path):
                assert_safe_public_path(self, public_path)

        if "sourceMetadata" in artifact:
            self.assertIsInstance(artifact["sourceMetadata"], list)
            for item in artifact["sourceMetadata"]:
                with self.subTest(metadata=item.get("path") if isinstance(item, dict) else item):
                    self.assertIsInstance(item, dict)
                    path = item.get("path")
                    digest = item.get("sha256")
                    self.assertIsInstance(path, str)
                    self.assertIsInstance(digest, str)
                    assert_safe_public_path(self, path)
                    self.assertEqual(sha256(ROOT / path), digest)

        for value in values:
            with self.subTest(value=value[:80]):
                assert_local_only_string(self, value)
                assert_no_secret_shaped_value(self, value)

    def test_public_slice_avoids_private_paths_and_guarded_wording(self) -> None:
        for rel_path in SCAN_PATHS:
            path = ROOT / rel_path
            if not path.is_file():
                continue

            text = path.read_text(encoding="utf-8")
            lower_text = text.lower()

            with self.subTest(path=rel_path, kind="private-path"):
                for marker in PRIVATE_PATH_MARKERS:
                    self.assertNotIn(marker.lower(), lower_text)

            with self.subTest(path=rel_path, kind="remote-marker"):
                for marker in REMOTE_MARKERS:
                    self.assertNotIn(marker, lower_text)

            with self.subTest(path=rel_path, kind="guarded-wording"):
                assert_no_guarded_words(self, rel_path, text)


def read_text(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def read_json(rel_path: str) -> Any:
    return json.loads(read_text(rel_path))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_ts_exported(testcase: unittest.TestCase, text: str, symbol: str) -> None:
    direct_export = re.compile(
        rf"\bexport\s+(?:async\s+)?(?:const|function|class|interface|type)\s+"
        rf"{re.escape(symbol)}\b"
    )
    named_export = re.compile(rf"\bexport\s*\{{[^}}]*\b{re.escape(symbol)}\b[^}}]*\}}")
    testcase.assertTrue(
        direct_export.search(text) or named_export.search(text),
        f"{symbol} is not exported",
    )


def extract_repo_paths(text: str) -> set[str]:
    paths = {match.replace("\\", "/") for match in PATH_REF_RE.findall(text)}
    return {path for path in paths if not has_private_or_parent_segment(path)}


def assert_safe_public_path(testcase: unittest.TestCase, public_path: str) -> None:
    normalized = public_path.replace("\\", "/")
    testcase.assertFalse(normalized.startswith(("/", "./", "../")), public_path)
    testcase.assertIsNone(re.match(r"(?i)^[a-z]:/", normalized), public_path)
    testcase.assertFalse(has_private_or_parent_segment(normalized), public_path)

    path = (ROOT / normalized).resolve()
    root = ROOT.resolve()
    testcase.assertTrue(path == root or root in path.parents, public_path)
    testcase.assertTrue(path.is_file(), public_path)


def has_private_or_parent_segment(relative_path: str) -> bool:
    parts = Path(relative_path.replace("\\", "/")).parts
    return ".." in parts or ".codex-private" in parts


def walk_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        strings: list[str] = []
        for key, item in value.items():
            strings.append(str(key))
            strings.extend(walk_strings(item))
        return strings
    if isinstance(value, list):
        strings = []
        for item in value:
            strings.extend(walk_strings(item))
        return strings
    return []


def nested_get(value: Any, keys: tuple[str, ...]) -> Any:
    current = value
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def redaction_paths(value: Any, path: str = "$") -> list[str]:
    matches: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            next_path = f"{path}.{key}"
            if "redact" in key.lower():
                matches.append(next_path)
            if item == "[REDACTED]":
                matches.append(next_path)
            matches.extend(redaction_paths(item, next_path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            matches.extend(redaction_paths(item, f"{path}[{index}]"))
    return matches


def assert_local_only_string(testcase: unittest.TestCase, value: str) -> None:
    lower_value = value.lower()
    for marker in REMOTE_MARKERS + PRIVATE_PATH_MARKERS:
        testcase.assertNotIn(marker.lower(), lower_value)

    if "://" in value and not value.startswith(LOCAL_URI_PREFIXES):
        testcase.fail(f"non-local URI in artifact value: {value}")


def assert_no_secret_shaped_value(testcase: unittest.TestCase, value: str) -> None:
    for pattern in SECRET_VALUE_PATTERNS:
        testcase.assertIsNone(pattern.search(value))


def assert_no_guarded_words(testcase: unittest.TestCase, rel_path: str, text: str) -> None:
    lower_text = text.lower()
    guarded_words = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
    guarded_words.extend(EXTRA_GUARDED_WORDS)

    for word in guarded_words:
        if word.isascii():
            escaped = re.escape(word).replace(r"\ ", r"\s+")
            pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
            testcase.assertIsNone(
                pattern.search(lower_text),
                f"{rel_path} contains guarded wording",
            )
        else:
            testcase.assertNotIn(word, lower_text, f"{rel_path} contains guarded wording")


if __name__ == "__main__":
    unittest.main()
