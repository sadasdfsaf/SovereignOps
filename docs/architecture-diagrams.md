# Architecture Diagrams

These diagrams summarize the local-first architecture for private workspaces.
They are intentionally implementation-facing and mirror the package boundaries
described in the other docs.

## Component View

```mermaid
flowchart LR
  User["Local user"] --> UI["Web or desktop shell"]
  UI --> Commands["Command and route contracts"]
  Commands --> Rules["Rule checks"]
  Rules --> Store["Workspace store"]
  Store --> Events["Event log"]
  Store --> Objects["Object store"]
  Store --> Index["Derived index"]
  Events --> Audit["Audit timeline"]
  UI --> Approvals["Approval inbox"]
  Approvals --> Rules
  UI --> Gateway["MCP gateway"]
  Gateway --> Agent["Local agent"]
  Gateway --> Plugins["Sandboxed plugins"]
  Plugins --> Audit
  Agent --> Approvals
  Events --> Sync["Encrypted sync bundles"]
  Store --> Backup["Encrypted backups"]
```

The UI and desktop shell do not own durable business logic. They adapt user
intent into typed route or command contracts. Rule checks, reducers, audit
emitters, backup planning, and sync bundling stay behind narrow interfaces.

## Local-First Write Path

```mermaid
sequenceDiagram
  actor User
  participant UI as Local UI
  participant Agent as Agent or Tool
  participant Approvals as Approval Inbox
  participant Store as Workspace Store
  participant Audit as Audit Timeline

  User->>UI: Request a workspace change
  UI->>Agent: Ask for proposal
  Agent->>Approvals: Create approval request when needed
  Approvals-->>User: Show target, risk, and summary
  User->>Approvals: Approve or reject
  Approvals->>Store: Apply approved change through reducer
  Store->>Audit: Append redacted decision record
  Store-->>UI: Return fresh snapshot
```

Agents and tools should stop after creating an approval request. The durable
write happens only after approval and validation by the host.

## Workspace Data Flow

```mermaid
flowchart TD
  Input["Document, task, issue, or import"] --> Validate["Validate shape"]
  Validate --> Reduce["Run reducer"]
  Reduce --> Event["Append event"]
  Event --> Snapshot["Build snapshot"]
  Event --> Audit["Record audit"]
  Snapshot --> Search["Update derived index"]
  Event --> Bundle["Build encrypted sync bundle"]
  Snapshot --> Backup["Create encrypted backup"]
  Search --> UI["Refresh local views"]
  Audit --> UI
```

The event log is the durable source of truth. Search indexes, dashboards, and
summary views are derived and can be rebuilt from events and checkpoints.

## Backup And Restore

```mermaid
flowchart LR
  Store["Workspace store"] --> PlanBackup["Plan backup"]
  PlanBackup --> Encrypt["Encrypt payload segments"]
  Encrypt --> Manifest["Backup manifest"]
  Encrypt --> Payloads["Encrypted payloads"]
  Manifest --> RestorePlan["Restore planner"]
  Payloads --> RestorePlan
  RestorePlan --> Checks["Schema and fingerprint checks"]
  Checks --> Decision{"Restore mode"}
  Decision --> Import["New workspace import"]
  Decision --> Replace["Point-in-time replacement"]
  Decision --> Merge["Merge with conflict checks"]
  Import --> Audit["Audit result"]
  Replace --> Audit
  Merge --> Audit
```

The restore planner runs before import. Replacement and merge modes require
explicit approval because they can overwrite or combine durable state.

## Sync Relay

```mermaid
flowchart LR
  DeviceA["Device A event log"] --> BuildA["Build bundle"]
  BuildA --> EncryptA["Encrypt and checksum"]
  EncryptA --> Relay["Sync relay stores opaque bundle"]
  Relay --> FetchB["Device B fetch"]
  FetchB --> VerifyB["Verify checksum and cursor"]
  VerifyB --> ApplyB["Apply accepted events"]
  ApplyB --> CursorB["Advance cursor"]
  VerifyB --> ConflictB["Conflict review"]
  ConflictB --> ApprovalB["Approval inbox"]
```

The relay stores encrypted bundles and routing metadata. Devices validate
workspace ids, cursors, checksums, and conflicts before accepting events.

## Plugin Boundary

```mermaid
flowchart TB
  Host["Host runtime"] --> Manifest["Manifest validation"]
  Manifest --> Sandbox["Sandbox context"]
  Sandbox --> Capability{"Capability granted?"}
  Capability -->|yes| Plugin["Plugin function"]
  Capability -->|no| Denied["Stable denied result"]
  Plugin --> Tick["Work budget ticks"]
  Plugin --> PluginAudit["Plugin audit detail"]
  Plugin --> Result["Structured result or proposal"]
  PluginAudit --> Audit["Audit timeline"]
  Result --> Approval["Approval or reducer path"]
  Denied --> Audit
```

Plugins receive a narrow context and return structured results. The host owns
durable writes, approval routing, and audit persistence.
