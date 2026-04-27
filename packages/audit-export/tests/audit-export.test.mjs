import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIT_EXPORT_ERROR_CODES,
  AUDIT_EXPORT_REDACTION,
  AuditEventFilterError,
  AuditEventValidationError,
  createAuditExportManifest,
  createAuditExportPackage,
  filterAuditEvents,
  fingerprintAuditEvent,
  normalizeAuditEvent,
  normalizeAuditEvents,
  redactAuditValue,
  renderAuditCsv,
  renderAuditJsonl,
  serializeDeterministicJson,
} from "../src/index.ts";

const secretValue = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJsb2NhbCJ9.signaturepart";

const baseEvents = Object.freeze([
  event("evt_002", "2026-04-27T04:00:02.000Z", "workspace.file.opened", "allow", {
    file: "alpha.md",
    labels: ["active"],
  }),
  event("evt_001", "2026-04-27T04:00:01.000Z", "workspace.file.created", "allow", {
    file: "alpha.md",
    labels: ["draft"],
  }),
  event("evt_003", "2026-04-27T04:00:03.000Z", "workspace.share.created", "deny", {
    file: "beta.md",
    reason: "manual review",
  }),
]);

test("normalizes audit events into immutable redacted records", () => {
  const normalized = normalizeAuditEvent({
    eventId: "evt_secret",
    timestamp: "2026-04-27T04:00:00.000Z",
    type: "workspace.sync.completed",
    decision: "allow",
    actor: {
      id: "user_local",
      sessionToken: secretValue,
    },
    target: "workspace_local",
    reason: `authorization=${"x".repeat(12)}`,
    attributes: {
      visible: "kept",
      accessToken: secretValue,
      nested: {
        password: "short-secret",
        safe: "also kept",
      },
    },
    context: {
      requestId: "req_001",
    },
  });

  assert.equal(normalized.kind, "audit-export.event");
  assert.equal(normalized.actor.sessionToken, AUDIT_EXPORT_REDACTION);
  assert.equal(normalized.reason, AUDIT_EXPORT_REDACTION);
  assert.equal(normalized.attributes.accessToken, AUDIT_EXPORT_REDACTION);
  assert.equal(normalized.attributes.nested.password, AUDIT_EXPORT_REDACTION);
  assert.equal(normalized.attributes.visible, "kept");
  assert.match(normalized.fingerprint, /^fnv1a64:[0-9a-f]{16}$/);
  assert.throws(() => {
    normalized.attributes.visible = "changed";
  }, TypeError);
});

test("redacts secret-shaped values before rendering exports", () => {
  const source = [
    {
      eventId: "evt_redact",
      timestamp: "2026-04-27T04:00:00.000Z",
      type: "workspace.file.opened",
      decision: "allow",
      actor: {
        id: "user_local",
      },
      attributes: {
        note: "visible text",
        token: secretValue,
        command: `token=${"a".repeat(16)}`,
      },
    },
  ];
  const jsonl = renderAuditJsonl(source);
  const csv = renderAuditCsv(source);
  const exported = createAuditExportPackage(source, {
    createdAt: "2026-04-27T04:10:00.000Z",
  });

  assert.equal(redactAuditValue({ apiKey: "small" }).apiKey, AUDIT_EXPORT_REDACTION);
  assert.equal(jsonl.includes(secretValue), false);
  assert.equal(csv.includes(secretValue), false);
  assert.equal(serializeDeterministicJson(exported.manifest).includes(secretValue), false);
  assert.equal(jsonl.includes(AUDIT_EXPORT_REDACTION), true);
  assert.equal(csv.includes(AUDIT_EXPORT_REDACTION), true);
});

test("renders JSONL and CSV in stable event order", () => {
  const jsonl = renderAuditJsonl([...baseEvents].reverse());
  const repeatedJsonl = renderAuditJsonl(baseEvents);
  const csv = renderAuditCsv([...baseEvents].reverse());
  const repeatedCsv = renderAuditCsv(baseEvents);
  const jsonEvents = jsonl.split("\n").map((line) => JSON.parse(line));

  assert.equal(jsonl, repeatedJsonl);
  assert.equal(csv, repeatedCsv);
  assert.deepEqual(
    jsonEvents.map((item) => item.eventId),
    ["evt_001", "evt_002", "evt_003"],
  );
  assert.equal(csv.split("\n")[0], "eventId,timestamp,type,decision,actor,target,reason,attributes,context,fingerprint");
  assert.equal(csv.split("\n")[1].startsWith("evt_001,2026-04-27T04:00:01.000Z"), true);
});

test("filters by decision, type, and inclusive timestamp bounds", () => {
  const filtered = filterAuditEvents(baseEvents, {
    decision: "allow",
    type: ["workspace.file.opened", "workspace.file.created"],
    from: "2026-04-27T04:00:02.000Z",
    to: "2026-04-27T04:00:02.000Z",
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].eventId, "evt_002");
  assert.throws(
    () => filterAuditEvents(baseEvents, {
      from: "2026-04-27T04:00:03.000Z",
      to: "2026-04-27T04:00:01.000Z",
    }),
    (error) => {
      assert.equal(error instanceof AuditEventFilterError, true);
      assert.equal(error.code, AUDIT_EXPORT_ERROR_CODES.INVALID_FILTER);
      return true;
    },
  );
});

test("creates deterministic manifests and package fingerprints", () => {
  const first = createAuditExportPackage([...baseEvents].reverse(), {
    createdAt: "2026-04-27T04:30:00.000Z",
    filters: {
      decisions: ["allow", "deny"],
    },
  });
  const second = createAuditExportPackage(baseEvents, {
    createdAt: "2026-04-27T04:30:00.000Z",
    filters: {
      decisions: ["deny", "allow"],
    },
  });
  const manifest = createAuditExportManifest(baseEvents, {
    createdAt: "2026-04-27T04:30:00.000Z",
  });

  assert.equal(first.manifest.exportId, second.manifest.exportId);
  assert.equal(first.manifest.fingerprint, second.manifest.fingerprint);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.manifest.eventCount, 3);
  assert.deepEqual(first.manifest.decisions, ["allow", "deny"]);
  assert.deepEqual(first.manifest.types, [
    "workspace.file.created",
    "workspace.file.opened",
    "workspace.share.created",
  ]);
  assert.equal(first.manifest.jsonl.fingerprint, manifest.jsonl.fingerprint);
  assert.equal(first.manifest.csv.columns.length, 10);
});

test("fingerprints ignore object key insertion order after normalization", () => {
  const left = {
    eventId: "evt_order",
    timestamp: "2026-04-27T04:00:00.000Z",
    type: "workspace.item.updated",
    attributes: {
      b: 2,
      a: {
        z: false,
        y: true,
      },
    },
  };
  const right = {
    attributes: {
      a: {
        y: true,
        z: false,
      },
      b: 2,
    },
    type: "workspace.item.updated",
    timestamp: "2026-04-27T04:00:00.000Z",
    eventId: "evt_order",
  };

  assert.equal(fingerprintAuditEvent(left), fingerprintAuditEvent(right));
  assert.equal(
    serializeDeterministicJson({ z: 1, a: { b: false, a: null } }),
    '{"a":{"a":null,"b":false},"z":1}',
  );
});

test("rejects invalid events and duplicate normalized ids", () => {
  assert.throws(
    () => normalizeAuditEvent({
      eventId: "evt_bad",
      timestamp: "not-a-date",
      type: "workspace.item.updated",
    }),
    (error) => {
      assert.equal(error instanceof AuditEventValidationError, true);
      assert.equal(error.code, AUDIT_EXPORT_ERROR_CODES.INVALID_EVENT);
      return true;
    },
  );
  assert.throws(
    () => normalizeAuditEvents([
      event("evt_duplicate", "2026-04-27T04:00:00.000Z", "workspace.item.created", "allow", {}),
      event("evt_duplicate", "2026-04-27T04:00:01.000Z", "workspace.item.updated", "allow", {}),
    ]),
    (error) => {
      assert.equal(error instanceof AuditEventValidationError, true);
      assert.equal(error.code, AUDIT_EXPORT_ERROR_CODES.INVALID_EVENT);
      assert.equal(error.details.eventId, "evt_duplicate");
      return true;
    },
  );
});

function event(eventId, timestamp, type, decision, attributes) {
  return {
    eventId,
    timestamp,
    type,
    decision,
    actor: {
      id: "user_local",
      type: "workspace-member",
    },
    target: {
      id: "workspace_local",
      type: "workspace",
    },
    attributes,
    context: {
      source: "unit-test",
    },
  };
}
