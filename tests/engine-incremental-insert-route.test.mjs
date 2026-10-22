import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const route = fs.readFileSync(fileURLToPath(new URL("../app/api/knowledge/import/[importId]/insert-engine/route.ts", import.meta.url)), "utf8");
const snapshot = fs.readFileSync(fileURLToPath(new URL("../lib/engine/ingestion/load-reconciliation-snapshot.ts", import.meta.url)), "utf8");

test("incremental insert rechecks reconciliation within the locked transaction", () => {
  const lock = route.indexOf("pg_try_advisory_xact_lock");
  const read = route.indexOf("loadEngineReconciliationSnapshot(ws, tx)");
  const discover = route.indexOf("discoverIdentityRules(plan, snapshot, identityRules)");
  const reconcile = route.indexOf("reconcileEngineImport(plan, snapshot, discovery.rules)");
  const write = route.indexOf("const provenanceSource = await tx.knowledge_sources.create", read);
  assert.ok(lock >= 0 && lock < read && read < discover && discover < reconcile && reconcile < write);
  assert.match(route, /if \(!reconciliation\.ready && !hasConflicts\)/);
  assert.match(route, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(snapshot, /db: Prisma\.TransactionClient = prisma/);
});
test("incremental insert only creates missing records and missing links", () => {
  assert.match(route, /reconciliation\.rows\.filter\(row => row\.action === "create" &&/);
  assert.match(route, /reconciliation\.links\.filter\(link => link\.action === "create" &&/);
  assert.match(route, /decision\.existingId && \(decision\.action === "reuse"/);
  assert.match(route, /if \(decision\.action !== "create"\) continue/);
  assert.match(route, /if \(!newRows\.length && !newLinks\.length && !resolution\?\.updates\.size\)/);
});
test("incremental insert refuses schema changes and preserves source provenance", () => {
  assert.match(route, /reconciliation\.entities\.some\(item => item\.action !== "reuse"\)/);
  assert.match(route, /reconciliation\.relations\.some\(item => item\.action !== "reuse"\)/);
  assert.match(route, /tx\.engine_record_provenance\.create/);
  assert.match(route, /verifyInsertPlan/);
  assert.match(route, /validateInsertPlan/);
});

test("UI enables insert for ready reconciliation and still blocks real issues", () => {
  const ui = fs.readFileSync(fileURLToPath(new URL("../components/knowledge/import/modal/knowledge-import-modal.tsx", import.meta.url)), "utf8");
  assert.match(ui, /Boolean\(reconciliation\) && !reconciliation\?\.ready/);
  assert.match(ui, /preview\.manifestIssues\?\.length/);
  assert.match(ui, /preview\.unresolvedLinks\.length/);
});
test("generic schema notice remains visible but is excluded from signed blockers", () => {
  const preview = fs.readFileSync(fileURLToPath(new URL("../app/api/knowledge/import/[importId]/preview-records/route.ts", import.meta.url)), "utf8");
  assert.match(preview, /const informationalIssues = analysis\.issues\.filter/);
  assert.match(preview, /const blockingIssues = \[/);
  assert.match(preview, /\.\.\.analysis\.issues\.filter\(issue => issue !== "Esquema construido/);
  assert.match(preview, /\.\.\.manifest\.issues/);
});

test("conflict resolutions are checked server-side and revisions preserve provenance", () => {
  const resolver = fs.readFileSync(fileURLToPath(new URL("../lib/engine/ingestion/resolve-import-conflicts.ts", import.meta.url)), "utf8");
  assert.match(route, /resolveImportConflicts\(plan, snapshot, reconciliation, body\.conflictAnswers/);
  assert.match(resolver, /keys\.length !== pending\.length/);
  assert.match(resolver, /answer\.kind === "omit"/);
  assert.match(resolver, /!omitted\.has\(link\.fromLocalId\)/);
  assert.match(route, /for \(const \[localId, change\] of resolution\?\.updates/);
  assert.match(route, /tx\.engine_record_revisions\.createMany/);
  assert.match(route, /tx\.engine_record_provenance\.create/);
});
