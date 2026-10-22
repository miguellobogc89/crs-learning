import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const read = path => fs.readFileSync(fileURLToPath(new URL("../" + path, import.meta.url)), "utf8");
test("stage 8 returns the workspace reconciliation result", () => {
  const route = read("app/api/knowledge/import/[importId]/preview-records/route.ts");
  assert.match(route, /loadEngineReconciliationSnapshot\(activeWorkspace\.id\)/);
  assert.match(route, /reconcileEngineImport\(/);
  assert.match(route, /signature, reconciliation, identityDiscovery, manifestIssues/);
});
test("client preserves reconciliation result and exposes decisions", () => {
  const hook = read("components/knowledge/import/hooks/use-knowledge-import.ts");
  const modal = read("components/knowledge/import/modal/knowledge-import-modal.tsx");
  assert.match(hook, /reconciliation\?:/);
  assert.match(modal, /reconciliation\.rows\.map/);
  assert.match(modal, /ROW_DECISION/);
  assert.match(modal, /LINK_DECISION/);
  assert.match(modal, /Boolean\(reconciliation\) \|\| knowledgeImport\.engineInsertRunning/);
});
test("incremental route still refuses writing to populated Engine", () => {
  const route = read("app/api/knowledge/import/[importId]/insert-engine/route.ts");
  assert.match(route, /if \(types \|\| records \|\| relations\)/);
  assert.match(route, /La inserción incremental necesita reconciliación de identidades/);
});
