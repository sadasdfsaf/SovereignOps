import { readFileSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));

if (process.argv.includes("--package")) {
  const missing = ["name", "version", "type"].filter((field) => !packageJson[field]);
  if (!packageJson.scripts?.check) {
    missing.push("scripts.check");
  }
  if (missing.length > 0) {
    console.error(`Package baseline missing fields: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`${packageJson.name} package baseline is valid.`);
  process.exit(0);
}

const requiredScripts = ["check", "smoke", "health", "loc", "test"];
const missing = requiredScripts.filter((script) => !packageJson.scripts?.[script]);

if (missing.length > 0) {
  console.error(`Missing root package scripts: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Node package baseline is valid.");
