# Audit Export API

Audit export routes turn local audit events into deterministic JSONL, CSV, or
package artifacts. The routes use the same normalization and redaction behavior
as `packages/audit-export/src/index.ts`, the SDK local helper
`buildLocalAuditExportPackage`, and the CLI command family
`sovereignops audit export`.

## Routes

- `GET /v1/workspaces/:workspaceId/audit`
- `POST /v1/audit/export/jsonl`
- `POST /v1/audit/export/csv`
- `POST /v1/audit/export/package`

The read route lists existing audit entries for one workspace. Export routes
accept an explicit event array, so callers can export a reviewed local event
slice without requiring the API route to read directly from workspace storage.

## Request Shape

All three export routes accept the same JSON body:

```json
{
  "events": [
    {
      "eventId": "evt_note_opened",
      "timestamp": "2026-04-27T04:00:00.000Z",
      "type": "workspace.opened",
      "decision": "allow",
      "actor": {
        "id": "act_local"
      },
      "target": {
        "id": "note_alpha",
        "type": "note"
      },
      "reason": "local review",
      "attributes": {
        "scope": "desktop"
      },
      "context": {
        "workspaceId": "wsp_notes"
      }
    }
  ],
  "filters": {
    "decisions": ["allow"],
    "types": ["workspace.opened"],
    "fromTimestamp": "2026-04-27T00:00:00.000Z",
    "toTimestamp": "2026-04-27T23:59:59.000Z"
  },
  "createdAt": "2026-04-27T04:05:00.000Z",
  "exportId": "audit_notes"
}
```

Fields:

- `events`: Required array of audit event objects.
- `filters`: Optional `decisions`, `types`, `fromTimestamp`, and `toTimestamp` filters.
- `createdAt`: Optional ISO timestamp used in the manifest.
- `exportId`: Optional stable export identifier.

## JSONL Response

`POST /v1/audit/export/jsonl` returns one normalized
event per line in `content`.

```json
{
  "format": "jsonl",
  "mediaType": "application/jsonl",
  "content": "{\"kind\":\"audit-export.event\",\"version\":1}",
  "manifest": {
    "kind": "audit-export.manifest",
    "version": 1,
    "exportId": "audit_notes",
    "createdAt": "2026-04-27T04:05:00.000Z",
    "eventCount": 1,
    "firstTimestamp": "2026-04-27T04:00:00.000Z",
    "lastTimestamp": "2026-04-27T04:00:00.000Z",
    "decisions": ["allow"],
    "types": ["workspace.opened"],
    "filters": {
      "decisions": ["allow"],
      "types": ["workspace.opened"],
      "fromTimestamp": "2026-04-27T00:00:00.000Z",
      "toTimestamp": "2026-04-27T23:59:59.000Z"
    },
    "eventFingerprints": ["fnv1a64:1111111111111111"],
    "jsonl": {
      "fingerprint": "fnv1a64:2222222222222222",
      "mediaType": "application/jsonl",
      "bytes": 55,
      "lines": 1
    },
    "csv": {
      "fingerprint": "fnv1a64:3333333333333333",
      "mediaType": "text/csv",
      "bytes": 120,
      "rows": 1,
      "columns": ["eventId", "timestamp", "type", "decision", "actor", "target", "reason", "attributes", "context", "fingerprint"]
    },
    "fingerprint": "fnv1a64:4444444444444444"
  },
  "fingerprint": "fnv1a64:2222222222222222"
}
```

## CSV Response

`POST /v1/audit/export/csv` returns a header row and
one row per normalized event in `content`.

```json
{
  "format": "csv",
  "mediaType": "text/csv",
  "content": "eventId,timestamp,type,decision,actor,target,reason,attributes,context,fingerprint\n",
  "manifest": {
    "kind": "audit-export.manifest",
    "version": 1,
    "exportId": "audit_notes",
    "eventCount": 1,
    "csv": {
      "fingerprint": "fnv1a64:3333333333333333",
      "mediaType": "text/csv",
      "bytes": 120,
      "rows": 1,
      "columns": ["eventId", "timestamp", "type", "decision", "actor", "target", "reason", "attributes", "context", "fingerprint"]
    },
    "fingerprint": "fnv1a64:4444444444444444"
  },
  "fingerprint": "fnv1a64:3333333333333333"
}
```

## Package Response

`POST /v1/audit/export/package` returns the full
deterministic package object.

```json
{
  "kind": "audit-export.package",
  "version": 1,
  "manifest": {
    "kind": "audit-export.manifest",
    "version": 1,
    "exportId": "audit_notes",
    "eventCount": 1,
    "fingerprint": "fnv1a64:4444444444444444"
  },
  "jsonl": "{\"kind\":\"audit-export.event\",\"version\":1}",
  "csv": "eventId,timestamp,type,decision,actor,target,reason,attributes,context,fingerprint\n",
  "fingerprint": "fnv1a64:5555555555555555"
}
```

## Redaction Guarantees

- Sensitive-shaped keys and values are replaced with `[REDACTED]` before JSONL, CSV, manifest, or package fingerprints are rendered.
- Redaction applies recursively to `actor`, `target`, `attributes`, and `context`.
- Event identifiers that match sensitive-shaped strings are replaced by deterministic generated identifiers.
- Output ordering is deterministic by timestamp, event identifier, and type.
- Raw request objects are not echoed; responses contain normalized export content and metadata only.

## SDK And CLI Flow

SDK local callers use `packages/sdk-js/src/localLifecycle.ts`:

- `buildLocalAuditExportPackage` wraps `createAuditExportPackage`.
- `createAuditExportPackage` returns `kind`, `version`, `manifest`, `jsonl`, `csv`, and `fingerprint`.
- `renderAuditJsonl` and `renderAuditCsv` provide the string content used by JSONL and CSV wrappers.

CLI callers use `packages/cli/src/auditExport.ts` through
`packages/cli/src/index.ts`:

- `sovereignops audit export jsonl --input-json <json>`
- `sovereignops audit export csv --input-json <json>`
- `sovereignops audit export package --input-json <json>`
- `runAuditExportCli` accepts stdin through the shared local entrypoint.

## Local Examples

These examples run against local files, local package entrypoints, or the local
gateway only.

```powershell
node packages\cli\src\index.ts audit export jsonl --stdin
node packages\cli\src\index.ts audit export csv --stdin
node packages\cli\src\index.ts audit export package --stdin
```

```powershell
$body = '{"events":[{"timestamp":"2026-04-27T04:00:00.000Z","type":"workspace.opened","decision":"allow"}]}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:7317/v1/audit/export/package -Body $body -ContentType 'application/json'
```
