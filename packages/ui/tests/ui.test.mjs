import assert from "node:assert/strict";
import test from "node:test";

import { riskBadge } from "../src/index.ts";

test("maps known risk levels to stable badge models", () => {
  assert.deepEqual(riskBadge("low"), { label: "Low risk", tone: "success" });
  assert.deepEqual(riskBadge("medium"), { label: "Needs review", tone: "warning" });
  assert.deepEqual(riskBadge("high"), { label: "Approval required", tone: "danger" });
});
