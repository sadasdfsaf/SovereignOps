import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  createWorkspaceSessionStoreFileAdapter,
} from "../../src/workspaceSessionStoreFileAdapter.ts";

const [rootDir, recordPath, readyDir, startFile, label] = process.argv.slice(2);
if (!rootDir || !recordPath || !readyDir || !startFile || !label) {
  throw new Error("Usage: node workspace-session-store-create-once.mjs <root> <record> <ready-dir> <start-file> <label>");
}

mkdirSync(readyDir, { recursive: true });
writeFileSync(join(readyDir, `${basename(label)}.ready`), `${process.pid}\n`, {
  encoding: "utf8",
  flag: "wx",
});

const deadline = Date.now() + 5_000;
while (!existsSync(startFile)) {
  if (Date.now() >= deadline) {
    throw new Error("Timed out waiting for concurrent create start file.");
  }
  await delay(10);
}

const record = JSON.parse(readFileSync(recordPath, "utf8"));
record.label = label;
const store = createWorkspaceSessionStoreFileAdapter({ rootDir });
const result = store.create(record);
const output = result.ok
  ? { label, result: { ok: true, label: result.record.label } }
  : { label, result };

process.stdout.write(`${JSON.stringify(output)}\n`);
