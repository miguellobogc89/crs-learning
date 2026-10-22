import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const filename = fileURLToPath(new URL("../lib/engine/ingestion/reconcile-engine-import.ts", import.meta.url));
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", "require", compiled)(exports, require);
const { reconcileEngineImport } = exports;
const plan = () => ({
  entities: [{ key: "cliente", disposition: "existing", fields: [
    { key: "codigo", type: "text", disposition: "existing" },
    { key: "nombre", type: "text", disposition: "existing" },
    { key: "ciudad", type: "text", disposition: "existing" },
  ] }],
  relations: [], rows: [{ localId: "row_1", entityKey: "cliente",
    values: { codigo: "C-1", nombre: "Sol" }, evidence: "C-1 Sol", disposition: "candidate" }],
  links: [], issues: [], unresolvedLinks: [],
});
const snapshot = () => ({
  entities: [{ id: "t1", key: "cliente", fields: [
    { key: "codigo", type: "text" }, { key: "nombre", type: "text" }, { key: "ciudad", type: "text" },
  ] }],
  relations: [], records: [{ id: "c1", entityKey: "cliente",
    values: { codigo: "C-1", nombre: "Sol" } }], links: [],
});
test("reuses an exact identity without writing", () => {
  const result = reconcileEngineImport(plan(), snapshot(), { cliente: ["codigo"] });
  assert.equal(result.writesPerformed, false);
  assert.equal(result.ready, true);
  assert.equal(result.rows[0].action, "reuse");
  assert.equal(result.rows[0].existingId, "c1");
});
test("creates only genuinely new identity", () => {
  const p = plan(); p.rows[0].values.codigo = "C-2";
  assert.equal(reconcileEngineImport(p, snapshot(), { cliente: ["codigo"] }).rows[0].action, "create");
});
test("never guesses identity without explicit key", () => {
  const result = reconcileEngineImport(plan(), snapshot(), {});
  assert.equal(result.rows[0].action, "review");
  assert.equal(result.ready, false);
});
test("blocks ambiguous identity in existing database", () => {
  const s = snapshot(); s.records.push({ id: "c2", entityKey: "cliente",
    values: { codigo: "C-1", nombre: "Sol" } });
  const result = reconcileEngineImport(plan(), s, { cliente: ["codigo"] });
  assert.equal(result.rows[0].action, "review");
  assert.equal(result.ready, false);
});
test("blocks contradictory non-null values", () => {
  const p = plan(); p.rows[0].values.nombre = "Otra empresa";
  const result = reconcileEngineImport(p, snapshot(), { cliente: ["codigo"] });
  assert.equal(result.rows[0].action, "review");
  assert.equal(result.ready, false);
});
test("marks compatible additions as extend but blocks write", () => {
  const p = plan(); p.rows[0].values.ciudad = "Sevilla";
  const result = reconcileEngineImport(p, snapshot(), { cliente: ["codigo"] });
  assert.equal(result.rows[0].action, "extend");
  assert.equal(result.ready, false);
});
test("blocks repeated identity inside the incoming document", () => {
  const p = plan(); p.rows.push({ ...p.rows[0], localId: "row_2" });
  const result = reconcileEngineImport(p, snapshot(), { cliente: ["codigo"] });
  assert.equal(result.ready, false);
  assert.equal(result.rows[1].action, "review");
});
test("detects incompatible existing field types", () => {
  const s = snapshot(); s.entities[0].fields[0].type = "integer";
  const result = reconcileEngineImport(plan(), s, { cliente: ["codigo"] });
  assert.equal(result.ready, false);
  assert.equal(result.entities[0].action, "review");
});
test("reuses an existing link rather than creating a duplicate", () => {
  const p = plan(); p.entities.push({ key: "pedido", disposition: "existing",
    fields: [{ key: "numero", type: "text", disposition: "existing" }] });
  p.rows.push({ localId: "row_2", entityKey: "pedido", values: { numero: "P-1" },
    evidence: "P-1", disposition: "candidate" });
  p.relations.push({ key: "cliente_to_pedido", fromEntity: "cliente", toEntity: "pedido",
    cardinality: "one_to_many", disposition: "existing" });
  p.links.push({ fromLocalId: "row_1", toLocalId: "row_2",
    relationKey: "cliente_to_pedido", evidence: "C-1 P-1" });
  const s = snapshot();
  s.entities.push({ id: "t2", key: "pedido", fields: [{ key: "numero", type: "text" }] });
  s.records.push({ id: "p1", entityKey: "pedido", values: { numero: "P-1" } });
  s.relations.push({ id: "r1", key: "cliente_to_pedido", fromEntity: "cliente",
    toEntity: "pedido", cardinality: "one_to_many" });
  s.links.push({ relationKey: "cliente_to_pedido", fromId: "c1", toId: "p1" });
  const result = reconcileEngineImport(p, s, { cliente: ["codigo"], pedido: ["numero"] });
  assert.equal(result.ready, true);
  assert.equal(result.links[0].action, "reuse");
});

test("original manifest blockers are never cleared by reconciliation", () => {
  const p = plan(); p.issues.push("Evidencia insuficiente");
  p.unresolvedLinks.push("vinculo pendiente");
  const result = reconcileEngineImport(p, snapshot(), { cliente: ["codigo"] });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some(item => item.includes("Evidencia insuficiente")));
  assert.ok(result.blockers.some(item => item.includes("Relaciones sin resolver")));
});
