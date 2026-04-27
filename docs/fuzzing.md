# Fuzzing Plan

This plan covers event parsing and policy input fuzzing for release hardening. It is designed to
work incrementally because the Rust toolchain may be unavailable on a local workstation.

## Targets

- Event envelope parsing: malformed JSON, missing identifiers, duplicate fields, unknown event types,
  oversized payloads, nested objects, invalid timestamps, and unexpected Unicode.
- Event payload validation: schema boundary cases, empty arrays, extra fields, wrong scalar types,
  and maximum accepted field sizes.
- Policy input validation: empty actor, action, or resource fields; mixed casing; path traversal
  attempts; oversized strings; unknown permissions; and deny-by-default outcomes.
- Audit event creation: stable decision labels, redacted error details, and no secret-bearing fields.

## Local Harness Strategy

- Start with deterministic corpus tests in Python or Node for parser and policy boundary cases.
- Keep corpus files small, readable, and focused on one failure mode each.
- Add property-style generators only after the dependency review process approves the library.
- When Cargo is installed, add Rust-side fuzz or property tests for shared parsers and policy structs.
- When Cargo is unavailable, keep Rust coverage through `scripts/rust_guard.py`, Python fixtures, and CI runs.
- No fuzzing helper should be installed by `scripts/release_check.py`; the release check only discovers and runs available commands.

## Corpus Seeds

- Minimal valid event envelope.
- Empty object and empty array inputs.
- Valid envelope with unknown event type.
- Payload with deeply nested objects near the configured depth limit.
- Payload with maximum accepted string and list sizes.
- Inputs with nulls where strings, lists, or objects are required.
- Inputs with workspace-relative paths, absolute paths, and parent-directory traversal attempts.
- Policy input with allowed, denied, and unknown permission names.

## Failure Expectations

- Parsers return structured errors instead of exceptions that escape the boundary.
- Invalid policy input fails closed.
- Error messages avoid raw secrets and avoid echoing large payloads.
- Accepted events preserve required fields and reject ambiguous identifiers.
- Fuzz failures become minimized regression tests before the issue is closed.

## Release Use

- Run deterministic corpus tests before release once the harness lands.
- Record any unavailable fuzzing toolchain in the release notes or review record.
- Treat new parser crashes, hangs, or unbounded memory growth as release blockers.
