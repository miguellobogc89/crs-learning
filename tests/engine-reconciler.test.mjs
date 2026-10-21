import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Run the pure reconciler in isolation: no AI, database, server or writes.
const source = readFileSync(new URL("../lib/engine/upsert-manifest.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", "module", compiled)(exports, { exports });
const { planEngineUpsert } = exports;
const entity = (identityFields = ["name"]) => ({
  key: "product", name: "Product",
  fields: [{ key: "name", name: "Name", type: "text" }, { key: "description", name: "Description", type: "text" }],
  identityFields,
});
const observation = (localId, values) => ({
  localId, entityKey: "product", values,
  source: { kind: "knowledge", sourceId: "fixture", evidence: "source" },
});
const manifest = (entities, observations, links = []) => ({
  version: 1, workspaceId: "test", entities, observations, links,
});
const existing = (records) => [{ id: "type-1", key: "product",
  fields: [{ key: "name", type: "text" }, { key: "description", type: "text" }],
  records }];

test("creates a missing type and a uniquely identified record", () => {
  const plan = planEngineUpsert(manifest([entity()], [observation("a", { name: "Mango" })]), []);
  assert.equal(plan.summary.create, 1);
  assert.equal(plan.operations.some(op => op.action === "create_type"), true);
  assert.equal(plan.writesPerformed, false);
});
test("reuses a record with matching verified identity", () => {
  const plan = planEngineUpsert(manifest([entity()], [observation("a", { name: "MANGO" })]),
    existing([{ id: "record-1", values: { name: "Mango" } }]));
  assert.equal(plan.summary.reuse, 1);
  assert.equal(plan.summary.create, 0);
});
test("holds an observation without identity for review", () => {
  const plan = planEngineUpsert(manifest([entity()], [observation("a", { description: "Mango" })]), existing([]));
  assert.equal(plan.summary.review, 1);
  assert.equal(plan.summary.create, 0);
});
test("holds conflicting values rather than overwriting records", () => {
  const plan = planEngineUpsert(manifest([entity()], [observation("a", { name: "Mango", description: "New" })]),
    existing([{ id: "record-1", values: { name: "Mango", description: "Old" } }]));
  assert.equal(plan.summary.review, 1);
});
test("proposes links only when both endpoints are actionable", () => {
  const e = entity();
  const link = { fromLocalId: "a", toLocalId: "b", relationKey: "product_related",
    source: { kind: "knowledge", sourceId: "fixture", evidence: "source" } };
  const valid = planEngineUpsert(manifest([e], [observation("a", { name: "Mango" }),
    observation("b", { name: "Lemon" })], [link]), existing([]));
  assert.equal(valid.summary.link, 1);
  const pending = planEngineUpsert(manifest([e], [observation("a", { name: "Mango" }),
    observation("b", { description: "Lemon" })], [link]), existing([]));
  assert.equal(pending.summary.link, 0);
});

test("composite identity reuses only when every key matches", () => {
  const e = { key: "price_line", name: "Price line", identityFields: ["catalog", "product"],
    fields: [{ key: "catalog", name: "Catalog", type: "text" },
      { key: "product", name: "Product", type: "text" },
      { key: "price", name: "Price", type: "decimal" }] };
  const current = [{ id: "type-line", key: "price_line", fields: e.fields,
    records: [{ id: "line-1", values: { catalog: "October", product: "Mango", price: 3 } }] }];
  const row = (localId, values) => ({ ...observation(localId, values), entityKey: "price_line" });
  const reused = planEngineUpsert(manifest([e], [row("a", { catalog: "OCTOBER", product: "Mango", price: 3 })]), current);
  assert.equal(reused.summary.reuse, 1);
  const created = planEngineUpsert(manifest([e], [row("a", { catalog: "November", product: "Mango", price: 3 })]), current);
  assert.equal(created.summary.create, 1);
});
test("incomplete compound identity cannot create records", () => {
  const e = { ...entity(["name", "description"]) };
  const plan = planEngineUpsert(manifest([e], [observation("a", { name: "Mango" })]), existing([]));
  assert.equal(plan.summary.review, 1);
});
test("duplicate compound identity in one batch is held for review", () => {
  const e = entity(["name", "description"]);
  const plan = planEngineUpsert(manifest([e], [
    observation("a", { name: "Mango", description: "Sorbet" }),
    observation("b", { name: "MANGO", description: "Sorbet" }),
  ]), existing([]));
  assert.equal(plan.summary.review, 2);
  assert.equal(plan.summary.create, 0);
});
test("ambiguous existing matches never pick a record arbitrarily", () => {
  const plan = planEngineUpsert(manifest([entity()], [observation("a", { name: "Mango" })]),
    existing([{ id: "one", values: { name: "Mango" } }, { id: "two", values: { name: "MANGO" } }]));
  assert.equal(plan.summary.review, 1);
  assert.equal(plan.summary.reuse, 0);
});
test("existing schema can add a field without creating a type", () => {
  const e = entity();
  const plan = planEngineUpsert(manifest([e], []), [{
    id: "type-1", key: "product", fields: [{ key: "name", type: "text" }], records: [],
  }]);
  assert.equal(plan.operations.filter(op => op.action === "add_field").length, 1);
  assert.equal(plan.operations.filter(op => op.action === "create_type").length, 0);
});
test("incompatible schema types fail before planning writes", () => {
  assert.throws(() => planEngineUpsert(manifest([entity()], []), [{
    id: "type-1", key: "product", fields: [{ key: "name", type: "decimal" }], records: [],
  }]), /Incompatible field/);
});
