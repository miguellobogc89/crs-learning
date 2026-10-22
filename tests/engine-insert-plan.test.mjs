import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const filename = fileURLToPath(new URL("../lib/engine/ingestion/validate-insert-plan.ts", import.meta.url));
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", "require", compiled)(exports, require);
const { validateInsertPlan } = exports;
const fixture = () => ({
  entities: [{ key: "order", disposition: "proposed", fields: [
    { key: "order_number", type: "text", disposition: "proposed" },
    { key: "total", type: "decimal", disposition: "proposed" },
    { key: "units", type: "integer", disposition: "proposed" },
  ] }],
  relations: [], rows: [{ localId: "row_0", entityKey: "order",
    values: { order_number: "P-1001", total: 14, units: 2 },
    evidence: "Pedido P-1001 14 2", disposition: "candidate" }],
  links: [], unresolvedLinks: [], issues: [],
});
test("valid signed-plan shape is accepted", () => {
  assert.equal(validateInsertPlan(fixture()).ready, true);
});
test("invalid scalar types are blocked before any database write", () => {
  const plan = fixture(); plan.rows[0].values.total = "14";
  assert.equal(validateInsertPlan(plan).ready, false);
});
test("invalid field definitions and relation cardinalities are blocked", () => {
  const plan = fixture();
  plan.entities[0].fields[0].type = "unsupported";
  plan.relations.push({ key: "order_to_order", fromEntity: "order", toEntity: "order",
    cardinality: "unknown", disposition: "proposed" });
  const result = validateInsertPlan(plan);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some(item => item.includes("Tipo de campo")));
  assert.ok(result.blockers.some(item => item.includes("Cardinalidad")));
});
test("unresolved links and blocking issues prohibit INSERT", () => {
  const plan = fixture(); plan.unresolvedLinks.push("missing");
  plan.issues.push("missing evidence");
  assert.equal(validateInsertPlan(plan).ready, false);
});
