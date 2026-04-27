#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { jsonSchemaCatalog, jsonSchemas, schemaKinds } from "../src/jsonSchema.ts";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturesDir = join(packageDir, "fixtures");
const checkOnly = process.argv.includes("--check");

const outputs = [
  ["schema-catalog.json", jsonSchemaCatalog],
  ...schemaKinds.map((kind) => [`${kind}.schema.json`, jsonSchemas[kind]]),
];

await mkdir(fixturesDir, { recursive: true });

let hasMismatch = false;

for (const [filename, value] of outputs) {
  const target = join(fixturesDir, filename);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  if (checkOnly) {
    let current;
    try {
      current = await readFile(target, "utf8");
    } catch {
      hasMismatch = true;
      console.error(`${filename} is missing.`);
      continue;
    }

    if (current !== serialized) {
      hasMismatch = true;
      console.error(`${filename} is out of date.`);
    }
    continue;
  }

  await writeFile(target, serialized, "utf8");
  console.log(`wrote fixtures/${filename}`);
}

if (hasMismatch) {
  console.error("Run `node scripts/export-json-schema.mjs` from packages/schemas to refresh exports.");
  process.exit(1);
}

if (checkOnly) {
  console.log("JSON schema exports are up to date.");
}
