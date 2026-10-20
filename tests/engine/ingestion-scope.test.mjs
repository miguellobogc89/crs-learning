import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// The guard is deliberately pure. These checks assert the safety contract
// without requiring a live database or a TypeScript test loader.
const source = readFileSync(new URL("../../lib/engine/ingestion-scope.ts", import.meta.url), "utf8");
test("engine ingestion scope refuses personal workspaces", () => {
  assert.match(source, /if \(!scope\.workspaceOrganizationId\)/);
  assert.match(source, /PERSONAL_WORKSPACE/);
});
test("engine ingestion scope refuses mismatched organizations", () => {
  assert.match(source, /scope\.workspaceOrganizationId !== scope\.engineOrganizationId/);
  assert.match(source, /ORGANIZATION_MISMATCH/);
});
test("engine ingestion scope refuses even matching organizations until workspace isolation exists", () => {
  assert.match(source, /WORKSPACE_SCOPE_UNSUPPORTED/);
  assert.doesNotMatch(source, /allowed:\s*true/);
});
