import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/ingestion-scope.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(js, { module, exports: module.exports });
const { checkEngineIngestionScope } = module.exports;

test("same workspace is structurally compatible", () => {
  assert.equal(checkEngineIngestionScope({ sourceWorkspaceId: "a", targetWorkspaceId: "a" }).allowed, true);
});
test("cross-workspace ingestion is forbidden", () => {
  const result = checkEngineIngestionScope({ sourceWorkspaceId: "a", targetWorkspaceId: "b" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "WORKSPACE_MISMATCH");
});
test("missing workspace is forbidden", () => {
  const result = checkEngineIngestionScope({ sourceWorkspaceId: "", targetWorkspaceId: "b" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "MISSING_WORKSPACE");
});
