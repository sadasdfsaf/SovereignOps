from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs" / "mcp-approval-evidence-api.md"

REQUIRED_SECTIONS = (
    "# MCP Approval Evidence API",
    "## Scope",
    "## Public Files",
    "## API Route",
    "## Gateway Builder",
    "## SDK Client",
    "## CLI Fixture",
    "## Schema Fixtures",
    "## Web Helper",
    "## Release Wiring",
    "## Guardrails",
    "## Validation",
)

REQUIRED_REFERENCES = (
    "docs/mcp-approval-evidence-api.md",
    "tests/test_mcp_approval_evidence_api_docs.py",
    "tests/test_mcp_approval_evidence_api_alignment.py",
    "services/mcp-gateway/src/approvalEvidence.ts",
    "services/mcp-gateway/tests/approval-evidence.test.mjs",
    "apps/api/src/mcpApprovalEvidenceRoutes.ts",
    "apps/api/tests/mcp-approval-evidence-routes.test.mjs",
    "packages/sdk-js/src/mcpApprovalEvidenceClient.ts",
    "packages/sdk-js/tests/client-mcp-approval-evidence.test.mjs",
    "packages/cli/src/mcpApprovalEvidenceReplay.ts",
    "packages/cli/tests/mcp-approval-evidence-replay.test.mjs",
    "examples/mcp/approval-evidence-preview-requests.json",
    "packages/schemas/src/mcpApprovalEvidence.ts",
    "packages/schemas/tests/mcp-approval-evidence.test.mjs",
    "packages/schemas/fixtures/mcp-approval-evidence.valid.json",
    "packages/schemas/fixtures/mcp-approval-evidence.invalid.json",
    "packages/schemas/fixtures/mcp-approval-evidence.schema.json",
    "apps/web/src/mcpApprovalEvidenceApiState.ts",
    "apps/web/tests/mcp-approval-evidence-api-state.test.mjs",
    "docs/openapi.yaml",
    "scripts/release_check.py",
    "scripts/repo_health.py",
)

REQUIRED_PHRASES = (
    "local-first API, SDK, CLI fixture, schema, gateway, and Web review surface",
    "POST /v1/mcp/approval-evidence/preview",
    "previewMcpApprovalEvidence",
    "mcp/approval-evidence/preview",
    "createMcpApprovalEvidenceRoutes",
    "mountMcpApprovalEvidenceRoutes",
    "buildMcpApprovalEvidence",
    "redactMcpApprovalEvidenceMetadata",
    "McpApprovalEvidenceClient",
    "createMcpApprovalEvidenceClient",
    "runMcpApprovalEvidenceReplayCli",
    "MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION",
    "mcpApprovalEvidenceSchema",
    "mcpApprovalEvidenceSchemaDefinition",
    "validateMcpApprovalEvidence",
    "assertMcpApprovalEvidence",
    "buildMcpApprovalEvidenceApiState",
    "mcp-approval-evidence-api-alignment",
    "[REDACTED]",
)

REQUIRED_COMMANDS = (
    "python -m unittest tests.test_mcp_approval_evidence_api_docs",
    "python -m unittest tests.test_mcp_approval_evidence_api_alignment",
    r"python -m json.tool examples\mcp\approval-evidence-preview-requests.json",
    r"python -m json.tool packages\schemas\fixtures\mcp-approval-evidence.valid.json",
    r"python -m json.tool packages\schemas\fixtures\mcp-approval-evidence.invalid.json",
    r"python -m json.tool packages\schemas\fixtures\mcp-approval-evidence.schema.json",
)

FORBIDDEN_DOC_SNIPPETS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "".join((".codex", "-private")),
    "".join((".codex", "-run")),
    "C:" + "\\",
    "E:" + "\\",
    "/Users/",
    "/home/",
    "\\" + "Users" + "\\",
    "AppData",
    "http" + "://",
    "https" + "://",
    "localhost",
    "127.0.0.1",
    "curl ",
    "invoke-restmethod",
    "start-process",
    "npm install -g",
    "npx ",
)

SECRET_PATTERNS = (
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
    r"`((?:apps|docs|examples|packages|scripts|services|tests)[/\\]"
    r"[A-Za-z0-9_./\\-]+?\.(?:json|md|mjs|py|ts|yaml))`"
)


def normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


class McpApprovalEvidenceApiDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC.read_text(encoding="utf-8")
        cls.lower_doc = cls.doc_text.lower()
        cls.normalized_doc = normalize_whitespace(cls.doc_text)

    def test_document_has_required_sections(self) -> None:
        self.assertTrue(DOC.is_file())
        for section in REQUIRED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

    def test_document_declares_expected_public_surface(self) -> None:
        for reference in REQUIRED_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(f"`{reference}`", self.doc_text)

        for phrase in REQUIRED_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(normalize_whitespace(phrase), self.normalized_doc)

    def test_validation_commands_are_local_and_documented(self) -> None:
        for command in REQUIRED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)
                self.assertNotIn("http" + "://", command)
                self.assertNotIn("https" + "://", command)

    def test_backticked_paths_are_repo_relative(self) -> None:
        for reference in PATH_REF_RE.findall(self.doc_text):
            with self.subTest(reference=reference):
                normalized = reference.replace("\\", "/")
                self.assertFalse(normalized.startswith(("/", "./", "../")))
                self.assertNotIn("..", Path(normalized).parts)
                self.assertFalse(re.match(r"(?i)^[a-z]:/", normalized))
                resolved = (ROOT / normalized).resolve()
                self.assertTrue(
                    resolved == ROOT.resolve() or ROOT.resolve() in resolved.parents,
                    normalized,
                )

    def test_document_has_no_private_remote_or_secret_shaped_values(self) -> None:
        for snippet in FORBIDDEN_DOC_SNIPPETS:
            with self.subTest(snippet=snippet):
                self.assertNotIn(snippet.lower(), self.lower_doc)

        self.assertIsNone(re.search(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]", self.doc_text))
        for pattern in SECRET_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.doc_text))

    def test_document_has_no_guarded_domain_wording(self) -> None:
        guarded_terms = {"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS}
        guarded_terms.update({
            "public" + "-" + "sector",
            "public" + " " + "sector",
        })
        for term in sorted(guarded_terms):
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_doc))
                else:
                    self.assertNotIn(term, self.lower_doc)


if __name__ == "__main__":
    unittest.main()
