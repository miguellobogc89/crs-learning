import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const filename = fileURLToPath(new URL("../lib/engine/ingestion/discover-identity-rules.ts", import.meta.url));
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", "require", compiled)(exports, require);
const { discoverIdentityRules } = exports;
const plan = () => ({
  entities: [
    { key: "cliente", fields: [{ key: "codigo_cliente" }, { key: "nombre" }] },
    { key: "linea_pedido", fields: [{ key: "numero_pedido" }, { key: "referencia" }] },
  ],
  rows: [
    { entityKey: "cliente", values: { codigo_cliente: "C-01", nombre: "Sol" } },
    { entityKey: "cliente", values: { codigo_cliente: "C-04", nombre: "Delta" } },
    { entityKey: "linea_pedido", values: { numero_pedido: "P-6", referencia: "A-1" } },
    { entityKey: "linea_pedido", values: { numero_pedido: "P-6", referencia: "A-2" } },
  ],
});
const snapshot = () => ({
  records: [
    { entityKey: "cliente", values: { codigo_cliente: "C-01", nombre: "Sol" } },
    { entityKey: "cliente", values: { codigo_cliente: "C-02", nombre: "Norte" } },
    { entityKey: "linea_pedido", values: { numero_pedido: "P-1", referencia: "A-1" } },
    { entityKey: "linea_pedido", values: { numero_pedido: "P-1", referencia: "A-2" } },
  ],
});
test("infers customer code after validating both datasets", () => {
  const d = discoverIdentityRules(plan(), snapshot(), {});
  assert.deepEqual(d.rules.cliente, ["codigo_cliente"]);
  assert.equal(d.proposals.find(p => p.entityKey === "cliente").status, "validated");
});
test("does not silently promote composite order-line identity", () => {
  const d = discoverIdentityRules(plan(), snapshot(), {});
  assert.equal(d.rules.linea_pedido, undefined);
  assert.equal(d.proposals.find(p => p.entityKey === "linea_pedido").status, "review");
});
test("duplicate existing customer identifiers block inference", () => {
  const s = snapshot(); s.records.push({ entityKey: "cliente", values: { codigo_cliente: "C-01" } });
  assert.equal(discoverIdentityRules(plan(), s, {}).rules.cliente, undefined);
});
test("duplicate incoming identifiers block inference", () => {
  const p = plan(); p.rows[1].values.codigo_cliente = "C-01";
  assert.equal(discoverIdentityRules(p, snapshot(), {}).rules.cliente, undefined);
});
test("missing identity values block inference", () => {
  const p = plan(); delete p.rows[1].values.codigo_cliente;
  assert.equal(discoverIdentityRules(p, snapshot(), {}).rules.cliente, undefined);
});
test("without historical records a suggested key is not validated", () => {
  assert.equal(discoverIdentityRules(plan(), { records: [] }, {}).rules.cliente, undefined);
});
test("explicit unique Engine rule remains authoritative", () => {
  const d = discoverIdentityRules(plan(), snapshot(), { cliente: ["codigo_cliente"] });
  assert.deepEqual(d.rules.cliente, ["codigo_cliente"]);
});
