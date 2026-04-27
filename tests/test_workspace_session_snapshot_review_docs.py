from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "workspace-session-snapshot-review.md"
FIXTURE_PATH = ROOT / "examples" / "workspace-session" / "snapshot-review.json"

EXPECTED_SECTIONS = (
    "# Workspace Session Snapshot Review",
    "## Scope",
    "## Local Compare Workflow",
    "## Retention Preview Workflow",
    "## API, SDK, And CLI Names",
    "## Fixture",
    "## Validation Commands",
)

EXPECTED_REFERENCES = (
    "examples/workspace-session/snapshot-review.json",
    "apps/api/src/workspaceSessionSnapshotReviewRoutes.ts",
    "createWorkspaceSessionSnapshotReviewRoutes",
    "mountWorkspaceSessionSnapshotReviewRoutes",
    "DEFAULT_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ROUTE_BASE_PATH",
    "packages/sdk-js/src/localWorkspaceSessionSnapshotReview.ts",
    "compareLocalWorkspaceSessionSnapshots",
    "previewLocalWorkspaceSessionSnapshotRetention",
    "compareSnapshots",
    "previewSnapshotRetention",
    "packages/cli/src/workspaceSessionSnapshotReview.ts",
    "runWorkspaceSessionSnapshotReviewCli",
    "loadWorkspaceSessionSnapshotReviewFixture",
    "isWorkspaceSessionSnapshotReviewCommand",
    "workspace-session-snapshot-review/v1",
    "workspace-session.snapshot-review",
)

EXPECTED_ROUTES = (
    ("POST", "/v1/workspace-session/snapshot-review/compare"),
    ("POST", "/v1/workspace-session/snapshot-review/retention-preview"),
)

EXPECTED_COMMANDS = (
    r"python -m json.tool examples\workspace-session\snapshot-review.json",
    "python -m unittest tests.test_workspace_session_snapshot_review_docs",
    "python -m unittest tests.test_workspace_session_snapshot_review_alignment",
    "workspace-session snapshot-review compare",
    "workspace-session snapshot-review retention-preview",
)

TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$")
SHA256_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")
REDACTED_PATTERN = re.compile(r"^\[redacted:[A-Za-z0-9]+:[A-Za-z0-9_-]+\]$")
WINDOWS_ABSOLUTE_PATH_PATTERN = re.compile(r"(?i)(?<![A-Za-z0-9])[a-z]:[\\/]")
POSIX_ABSOLUTE_PATH_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:/|\b)"
)
UNC_PATH_PATTERN = re.compile(r"\\\\[^\\\s]+\\[^\\\s]+")
REMOTE_DOMAIN_PATTERN = re.compile(
    r"(?i)\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|edu|io|dev)\b"
)
SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{12,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+"),
    re.compile(
        r"(?i)(?<!\[redacted:lock)(?:password|passwd|secret|token|api[_-]?key)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted:)\S{4,}"
    ),
    re.compile(r"\bsess_[a-z0-9_]{6,}\b"),
    re.compile(r"\bkey_[a-z0-9_]{6,}\b"),
)
PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "." + "codex-private",
    "." + "codex-run",
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog.jsonl",
    "tasks" + "\\backlog.jsonl",
)
ADDITIONAL_RESTRICTED_TERM_PARTS = (
    ("public", "-", "sector"),
    ("public", " ", "sector"),
)


class WorkspaceSessionSnapshotReviewDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.fixture_text = FIXTURE_PATH.read_text(encoding="utf-8")
        cls.fixture = _load_json(FIXTURE_PATH)
        cls.combined_text = f"{cls.doc_text}\n{cls.fixture_text}"
        cls.lower_combined_text = cls.combined_text.lower()

    def test_document_has_required_sections_routes_names_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())
        self.assertTrue(FIXTURE_PATH.is_file())

        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for reference in EXPECTED_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, self.doc_text)

        for method, route_path in EXPECTED_ROUTES:
            with self.subTest(route=route_path):
                self.assertIn(f"`{method} {route_path}`", self.doc_text)

        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

        for phrase in (
            "local-only",
            "raw request bodies are not retained",
            "dry-run flow",
            "Paths, tokens, session ids, and root keys are redacted",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.doc_text)

    def test_fixture_top_level_schema_and_named_surfaces(self) -> None:
        fixture = self.fixture

        self.assertEqual(fixture["schemaVersion"], "workspace-session-snapshot-review/v1")
        self.assertEqual(fixture["kind"], "workspace-session.snapshot-review")
        self.assertRegex(fixture["generatedAt"], TIMESTAMP_PATTERN)
        self.assertIs(fixture["localOnly"], True)
        self.assertIs(fixture["rawRequestBodyRetained"], False)
        self.assertEqual(fixture["network"]["mode"], "disabled")
        self.assertEqual(fixture["network"]["allowedUriPrefixes"], ["local://", "workspace://"])
        self.assertEqual(fixture["validationCommands"], list(EXPECTED_COMMANDS[:3]))

        api = fixture["api"]
        self.assertEqual(api["basePath"], "/v1/workspace-session/snapshot-review")
        self.assertEqual(api["factory"], "createWorkspaceSessionSnapshotReviewRoutes")
        self.assertEqual(api["mount"], "mountWorkspaceSessionSnapshotReviewRoutes")
        self.assertEqual(
            tuple((route["method"], route["path"]) for route in api["routes"]),
            EXPECTED_ROUTES,
        )
        for route in api["routes"]:
            with self.subTest(route=route["id"]):
                self.assertIs(route["durableWrites"], False)
                self.assertIs(route["requestBodyRetained"], False)

        sdk = fixture["sdk"]
        self.assertEqual(sdk["module"], "packages/sdk-js/src/localWorkspaceSessionSnapshotReview.ts")
        self.assertEqual(
            sdk["helpers"],
            ["compareLocalWorkspaceSessionSnapshots", "previewLocalWorkspaceSessionSnapshotRetention"],
        )
        self.assertEqual(sdk["methods"], ["compareSnapshots", "previewSnapshotRetention"])

        cli = fixture["cli"]
        self.assertEqual(cli["commands"], list(EXPECTED_COMMANDS[3:]))
        self.assertEqual(cli["runner"], "runWorkspaceSessionSnapshotReviewCli")
        self.assertEqual(cli["loader"], "loadWorkspaceSessionSnapshotReviewFixture")
        self.assertEqual(cli["detector"], "isWorkspaceSessionSnapshotReviewCommand")
        self.assertIs(cli["redactedOutput"], True)

    def test_baseline_and_candidate_snapshots_are_redacted_and_deterministic(self) -> None:
        snapshots = self.fixture["snapshots"]
        self.assertEqual(set(snapshots), {"baseline", "candidate"})

        for role, snapshot in snapshots.items():
            with self.subTest(role=role):
                self.assertEqual(snapshot["role"], role)
                self.assertRegex(snapshot["createdAt"], TIMESTAMP_PATTERN)
                self.assertRegex(snapshot["fingerprint"], SHA256_PATTERN)
                self.assertRegex(snapshot["sessionIdRef"], REDACTED_PATTERN)
                self.assertRegex(snapshot["rootKeyRef"], REDACTED_PATTERN)
                self.assertRegex(snapshot["storagePathRef"], REDACTED_PATTERN)
                self.assertRegex(snapshot["lockTokenRef"], REDACTED_PATTERN)
                self.assertEqual(snapshot["gateway"], {"transport": "stdio"})
                self.assertIs(snapshot["redaction"]["redacted"], True)
                self.assertIs(snapshot["redaction"]["rawPathsStored"], False)
                self.assertIs(snapshot["redaction"]["rawTokensStored"], False)
                self.assertIs(snapshot["redaction"]["rawSessionIdsStored"], False)
                self.assertIs(snapshot["redaction"]["rawRootKeysStored"], False)
                self.assertIs(snapshot["redaction"]["rawRequestBodyRetained"], False)

    def test_compare_and_retention_preview_responses_are_summary_only(self) -> None:
        compare = self.fixture["compare"]
        self.assertEqual(compare["mode"], "local-only")
        self.assertIs(compare["requestShape"]["rawRequestBodyRetained"], False)

        compare_response = compare["response"]
        self.assertEqual(compare_response["kind"], "workspace-session.snapshot-review.compare")
        self.assertRegex(compare_response["comparedAt"], TIMESTAMP_PATTERN)
        self.assertIs(compare_response["localOnly"], True)
        self.assertIs(compare_response["durableWrites"], False)
        self.assertIs(compare_response["rawRequestBodyRetained"], False)
        self.assertEqual(compare_response["result"]["status"], "changed")
        self.assertIn("snapshotVersion", compare_response["result"]["changedFields"])

        preview = self.fixture["retentionPreview"]
        self.assertEqual(preview["mode"], "dry-run")
        self.assertIs(preview["requestShape"]["rawRequestBodyRetained"], False)

        response = preview["response"]
        self.assertEqual(response["kind"], "workspace-session.snapshot-review.retention-preview")
        self.assertRegex(response["previewedAt"], TIMESTAMP_PATTERN)
        self.assertRegex(response["retentionCutoff"], TIMESTAMP_PATTERN)
        self.assertIs(response["localOnly"], True)
        self.assertIs(response["durableWrites"], False)
        self.assertIs(response["dryRun"], True)
        self.assertIs(response["rawRequestBodyRetained"], False)
        self.assertEqual(response["summary"], {"recordCount": 2, "wouldRetain": 1, "wouldPrune": 1, "applied": 0})

        records = response["records"]
        self.assertEqual([record["plannedAction"] for record in records], ["retain", "prune"])
        for record in records:
            with self.subTest(record=record["recordId"]):
                self.assertRegex(record["createdAt"], TIMESTAMP_PATTERN)
                self.assertRegex(record["observedAt"], TIMESTAMP_PATTERN)
                self.assertIs(record["dryRun"], True)
                self.assertIs(record["applied"], False)
                self.assertRegex(record["storagePathRef"], REDACTED_PATTERN)
                self.assertRegex(record["sessionIdRef"], REDACTED_PATTERN)
                self.assertRegex(record["rootKeyRef"], REDACTED_PATTERN)
                self.assertIs(record["redaction"]["redacted"], True)

    def test_docs_and_fixture_avoid_private_domains_restricted_content_and_raw_material(self) -> None:
        for marker in PRIVATE_PATH_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker.lower(), self.lower_combined_text)

        forbidden_fragments = (
            "file://",
            "http://",
            "https://",
            "localhost",
            "127.0.0.1",
            "~/",
            "curl ",
            "npx ",
            "npm install -g",
            "workspaces/",
        )
        for fragment in forbidden_fragments:
            with self.subTest(fragment=fragment):
                self.assertNotIn(fragment, self.lower_combined_text)

        for pattern in (
            WINDOWS_ABSOLUTE_PATH_PATTERN,
            POSIX_ABSOLUTE_PATH_PATTERN,
            UNC_PATH_PATTERN,
            REMOTE_DOMAIN_PATTERN,
            re.compile(r"(?<!\.)\.\.[/\\]"),
        ):
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.combined_text))

        for pattern in SECRET_VALUE_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.combined_text))

        restricted_terms = sorted(
            {"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS + ADDITIONAL_RESTRICTED_TERM_PARTS}
        )
        for term in restricted_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_combined_text))
                else:
                    self.assertNotIn(term, self.lower_combined_text)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
