import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import {
  createAuditExportRoutes,
  mountAuditExportRoutes,
} from "../src/auditExportRoutes.ts";

const createdAt = "2026-04-27T01:00:00.000Z";
const exportId = "audit_notes_001";
const secret = "sk_local_route_secret_123456";

const auditEvents = Object.freeze([
  {
    eventId: "evt_note_001",
    timestamp: "2026-04-27T00:00:00.000Z",
    type: "workspace.note.created",
    decision: "allow",
    actor: { id: "act_writer" },
    target: { id: "note_alpha", type: "note" },
    reason: "Initial note created",
    attributes: {
      title: "Daily notes",
      apiKey: secret,
    },
    context: {
      source: "desktop",
    },
  },
  {
    eventId: "evt_note_002",
    timestamp: "2026-04-27T00:05:00.000Z",
    type: "workspace.note.updated",
    decision: "review",
    actor: { id: "act_writer" },
    target: { id: "note_alpha", type: "note" },
    reason: secret,
    attributes: {
      field: "title",
    },
    context: {
      source: "desktop",
    },
  },
]);

test("mounts audit export routes with stable paths", () => {
  const router = createApiRouter();
  mountAuditExportRoutes(router);

  assert.deepEqual(
    router.listRoutes().map((route) => `${route.method} ${route.path}`),
    [
      "POST /v1/audit/export/csv",
      "POST /v1/audit/export/jsonl",
      "POST /v1/audit/export/package",
    ],
  );
});

test("exports JSONL in a JSON response wrapper", async () => {
  const router = createApiRouter(createAuditExportRoutes());
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/audit/export/jsonl",
    body: {
      events: auditEvents,
      createdAt,
      exportId,
    },
  });

  assertJsonResponse(response, 200);
  assert.equal(response.body.kind, "audit-export.content");
  assert.equal(response.body.format, "jsonl");
  assert.equal(response.body.mediaType, "application/jsonl");
  assert.equal(response.body.exportId, exportId);
  assert.equal(response.body.createdAt, createdAt);
  assert.equal(response.body.fingerprint, response.body.manifest.jsonl.fingerprint);
  assert.equal(response.body.manifest.eventCount, 2);
  assert.equal(response.body.content.split("\n").length, 2);
  assert.match(response.body.content, /evt_note_001/);
  assert.equal(JSON.stringify(response.body).includes(secret), false);
  assert.match(response.body.content, /\[REDACTED\]/);
});

test("exports CSV in a JSON response wrapper", async () => {
  const router = createApiRouter(createAuditExportRoutes());
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/audit/export/csv",
    body: {
      events: auditEvents,
      createdAt,
      exportId,
    },
  });

  assertJsonResponse(response, 200);
  assert.equal(response.body.kind, "audit-export.content");
  assert.equal(response.body.format, "csv");
  assert.equal(response.body.mediaType, "text/csv");
  assert.equal(response.body.fingerprint, response.body.manifest.csv.fingerprint);
  assert.match(response.body.content, /^eventId,timestamp,type,decision,/);
  assert.match(response.body.content, /evt_note_002/);
  assert.equal(JSON.stringify(response.body).includes(secret), false);
  assert.match(response.body.content, /\[REDACTED\]/);
});

test("exports package responses with manifest and content", async () => {
  const router = createApiRouter(createAuditExportRoutes());
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/audit/export/package",
    body: {
      events: auditEvents,
      createdAt,
      exportId,
    },
  });

  assertJsonResponse(response, 200);
  assert.equal(response.body.kind, "audit-export.package");
  assert.equal(response.body.manifest.exportId, exportId);
  assert.equal(response.body.manifest.createdAt, createdAt);
  assert.equal(response.body.manifest.eventCount, 2);
  assert.match(response.body.manifest.jsonl.fingerprint, /^fnv1a64:/);
  assert.match(response.body.manifest.csv.fingerprint, /^fnv1a64:/);
  assert.match(response.body.jsonl, /evt_note_001/);
  assert.match(response.body.csv, /evt_note_002/);
  assert.equal(JSON.stringify(response.body).includes(secret), false);
});

test("applies audit export filters", async () => {
  const router = createApiRouter(createAuditExportRoutes());
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/audit/export/jsonl",
    body: {
      events: auditEvents,
      filters: {
        types: "workspace.note.created",
      },
      createdAt,
      exportId,
    },
  });

  assertJsonResponse(response, 200);
  assert.equal(response.body.manifest.eventCount, 1);
  assert.deepEqual(response.body.manifest.filters.types, ["workspace.note.created"]);
  assert.match(response.body.content, /evt_note_001/);
  assert.doesNotMatch(response.body.content, /evt_note_002/);
});

test("returns standard JSON validation errors for invalid request bodies", async () => {
  const router = createApiRouter(createAuditExportRoutes());

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/audit/export/jsonl",
    body: ["not-an-object"],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const missingEvents = await router.dispatch({
    method: "POST",
    path: "/v1/audit/export/csv",
    body: {
      filters: {},
    },
  });
  assertJsonError(missingEvents, 400, "validation_failed");
  assert.deepEqual(missingEvents.body.error.details, { path: "body.events" });
});

test("wraps audit export errors and redacts secret-shaped details", async () => {
  const router = createApiRouter(createAuditExportRoutes());
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/audit/export/package",
    body: {
      events: [
        {
          eventId: "evt_bad_timestamp",
          timestamp: `token=${secret}`,
          type: "workspace.note.created",
        },
      ],
    },
  });

  assertJsonError(response, 400, "AUDIT_EXPORT_INVALID_EVENT");
  assert.equal(JSON.stringify(response.body).includes(secret), false);
  assert.equal(response.body.error.details.value, "token=[REDACTED]");
});

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/json/);
}

function assertJsonError(response, status, code) {
  assertJsonResponse(response, status);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, "string");
  assert.ok(response.body.error.message.length > 0);
}
