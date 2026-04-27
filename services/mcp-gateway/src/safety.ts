export const MCP_SAFETY_ANNOTATION_FIELD = "_safety";

export type SafetyTrustLevel = "trusted" | "review" | "untrusted";
export type SafetyFindingSeverity = "medium" | "high";

export interface SafetyFinding {
  id: string;
  severity: SafetyFindingSeverity;
  path: string;
  reason: string;
  excerpt: string;
}

export interface SafetyAnnotation {
  schemaVersion: 1;
  scope: "mcp_tool_output";
  trustLevel: SafetyTrustLevel;
  action: "mark_only";
  reasons: string[];
  findings: SafetyFinding[];
}

interface StringCandidate {
  path: string;
  text: string;
}

interface SafetyRule {
  id: string;
  severity: SafetyFindingSeverity;
  trustLevel: Exclude<SafetyTrustLevel, "trusted">;
  reason: string;
  pattern: RegExp;
}

const MAX_FINDINGS = 20;
const MAX_EXCERPT_LENGTH = 140;

const SAFETY_RULES: readonly SafetyRule[] = Object.freeze([
  {
    id: "explicit_untrusted_marker",
    severity: "high",
    trustLevel: "untrusted",
    reason: "Explicit untrusted content marker found.",
    pattern: /<\/?UNTRUSTED_CONTENT>/iu,
  },
  {
    id: "instruction_override",
    severity: "high",
    trustLevel: "untrusted",
    reason: "Text appears to ask the reader to override prior instructions.",
    pattern:
      /\b(?:ignore|disregard|override|forget|bypass)\b[\s\S]{0,80}\b(?:previous|prior|above|earlier|system|developer|tool)\b[\s\S]{0,80}\b(?:instruction|instructions|message|messages|rule|rules|constraint|constraints)\b/iu,
  },
  {
    id: "hidden_instruction_request",
    severity: "high",
    trustLevel: "untrusted",
    reason: "Text appears to request hidden instructions or sensitive runtime data.",
    pattern:
      /\b(?:reveal|print|show|display|send|extract|exfiltrate|leak)\b[\s\S]{0,80}\b(?:system prompt|developer message|hidden instruction|hidden instructions|secret|token|api key|password|credential|credentials)\b/iu,
  },
  {
    id: "approval_bypass_request",
    severity: "high",
    trustLevel: "untrusted",
    reason: "Text appears to request skipping review or approval.",
    pattern:
      /\b(?:without|bypass|skip|avoid)\b[\s\S]{0,80}\b(?:approval|review|permission|confirmation)\b/iu,
  },
  {
    id: "role_message_impersonation",
    severity: "medium",
    trustLevel: "review",
    reason: "Text resembles an embedded role-labeled instruction block.",
    pattern: /(?:^|\n)\s*(?:system|developer|tool)\s*:/iu,
  },
  {
    id: "urgent_override_language",
    severity: "medium",
    trustLevel: "review",
    reason: "Text uses forceful language near override-like instructions.",
    pattern:
      /\b(?:must|immediately|mandatory|required)\b[\s\S]{0,80}\b(?:ignore|bypass|skip|override|disable)\b/iu,
  },
]);

export function assessContentSafety(value: unknown): SafetyAnnotation {
  const candidates: StringCandidate[] = [];
  collectStringCandidates(value, "$", candidates, new WeakSet<object>());

  const findings = findSafetyIssues(candidates);
  const trustLevel = findings.reduce<SafetyTrustLevel>(
    (current, finding) =>
      elevateTrustLevel(
        current,
        SAFETY_RULES.find((rule) => rule.id === finding.id)?.trustLevel ?? "review",
      ),
    "trusted",
  );

  return {
    schemaVersion: 1,
    scope: "mcp_tool_output",
    trustLevel,
    action: "mark_only",
    reasons:
      findings.length > 0
        ? unique(findings.map((finding) => finding.reason))
        : ["No prompt-injection heuristic findings detected in scanned text."],
    findings,
  };
}

export function annotateStructuredContent(
  value: unknown,
  safety: SafetyAnnotation = assessContentSafety(value),
): unknown {
  const cloned = cloneJsonLike(value);
  const clonedSafety = cloneSafetyAnnotation(safety);

  if (isPlainRecord(cloned)) {
    return {
      ...cloned,
      [MCP_SAFETY_ANNOTATION_FIELD]: clonedSafety,
    };
  }

  return {
    value: cloned,
    [MCP_SAFETY_ANNOTATION_FIELD]: clonedSafety,
  };
}

export function annotateTextContent<T extends { text: string }>(
  content: T,
  safety: SafetyAnnotation = assessContentSafety(content.text),
): T & { safety: SafetyAnnotation } {
  return {
    ...content,
    safety: cloneSafetyAnnotation(safety),
  };
}

export function cloneSafetyAnnotation(annotation: SafetyAnnotation): SafetyAnnotation {
  return {
    schemaVersion: annotation.schemaVersion,
    scope: annotation.scope,
    trustLevel: annotation.trustLevel,
    action: annotation.action,
    reasons: [...annotation.reasons],
    findings: annotation.findings.map((finding) => ({ ...finding })),
  };
}

function findSafetyIssues(candidates: readonly StringCandidate[]): SafetyFinding[] {
  const findings: SafetyFinding[] = [];

  for (const candidate of candidates) {
    for (const rule of SAFETY_RULES) {
      const pattern = withGlobalFlag(rule.pattern);
      for (const match of candidate.text.matchAll(pattern)) {
        findings.push({
          id: rule.id,
          severity: rule.severity,
          path: candidate.path,
          reason: rule.reason,
          excerpt: excerptAround(candidate.text, match.index ?? 0, match[0].length),
        });

        if (findings.length >= MAX_FINDINGS) {
          return findings;
        }
      }
    }
  }

  return findings;
}

function collectStringCandidates(
  value: unknown,
  path: string,
  candidates: StringCandidate[],
  seen: WeakSet<object>,
): void {
  if (typeof value === "string") {
    candidates.push({ path, text: value });
    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectStringCandidates(entry, `${path}[${index}]`, candidates, seen);
    });
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    candidates.push({ path: `${formatPropertyPath(path, key)}#key`, text: key });
    collectStringCandidates(entry, formatPropertyPath(path, key), candidates, seen);
  }
}

function withGlobalFlag(pattern: RegExp): RegExp {
  return pattern.global
    ? new RegExp(pattern.source, pattern.flags)
    : new RegExp(pattern.source, `${pattern.flags}g`);
}

function excerptAround(value: string, index: number, length: number): string {
  if (value.length <= MAX_EXCERPT_LENGTH) {
    return value;
  }

  const remaining = Math.max(0, MAX_EXCERPT_LENGTH - length);
  const before = Math.floor(remaining / 2);
  const after = remaining - before;
  const start = Math.max(0, index - before);
  const end = Math.min(value.length, index + length + after);

  return `${start > 0 ? "..." : ""}${value.slice(start, end)}${
    end < value.length ? "..." : ""
  }`;
}

function elevateTrustLevel(
  current: SafetyTrustLevel,
  next: SafetyTrustLevel,
): SafetyTrustLevel {
  const order: Record<SafetyTrustLevel, number> = {
    trusted: 0,
    review: 1,
    untrusted: 2,
  };

  return order[next] > order[current] ? next : current;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function formatPropertyPath(base: string, key: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
    return `${base}.${key}`;
  }

  return `${base}[${JSON.stringify(key)}]`;
}

function cloneJsonLike<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonLike(entry)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      cloneJsonLike(entryValue),
    ]),
  ) as T;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
