# Example Workspace Generator

`scripts/generate_example_workspace.py` builds deterministic sample workspace bundles for local
development and tests. The generated examples use fictional product content for docs, tasks,
incidents, approvals, and audit records.

## CLI

Preview a tiny bundle and show where a caller might store it:

```powershell
python scripts\generate_example_workspace.py `
  --workspace-id wsp_demo `
  --preset tiny `
  --output examples\demo-workspace.json
```

The CLI does not write the path passed with `--output`; it only prints the path in the preview.

Print the complete bundle as JSON:

```powershell
python scripts\generate_example_workspace.py --workspace-id wsp_demo --preset small --json
```

Available presets:

- `tiny`: 1 doc, 1 task, 1 incident, 1 approval, 2 audit records.
- `small`: 3 docs, 4 tasks, 2 incidents, 2 approvals, 6 audit records.
- `standard`: 5 docs, 7 tasks, 3 incidents, 4 approvals, 10 audit records.

## Bundle Shape

The top-level JSON object contains:

- `metadata`: schema version, workspace id, preset, counts, total records, and optional output path
  preview.
- `workspace`: display name, project id, and fictional actor records.
- `records`: grouped `docs`, `tasks`, `incidents`, `approvals`, and `audit` arrays.

All generated ids use stable prefixes such as `doc_`, `task_`, `inc_`, `apv_`, and `aud_`.
Timestamps are derived from a fixed base time, so the same workspace id and preset always produce
the same bundle.

Tests or local tooling that need a file can call `write_bundle(bundle, path)` explicitly.
