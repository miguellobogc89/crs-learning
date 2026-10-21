import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../lib/engine/schema-discovery/stabilize-schema.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const exports = {};
new Function("exports", "module", js)(exports, { exports });
const stabilize = exports.stabilizeDiscoveredSchema;
const proposal = (key) => ({
  entities: [{ key, name: key, description: "", fields: [], evidence: [] }],
  relations: [{ key: "belongs_to", fromEntity: key, toEntity: key,
    cardinality: "one_to_many", description: "", evidence: [] }],
  warnings: [],
});
test("reuses opening_hours when model calls it business_hours", () => {
  const result = stabilize(proposal("business_hours"), ["opening_hours"]);
  assert.equal(result.proposal.entities[0].key, "opening_hours");
  assert.equal(result.proposal.relations[0].fromEntity, "opening_hours");
});
test("preserves an already existing exact key", () => {
  const result = stabilize(proposal("business_hours"), ["business_hours", "opening_hours"]);
  assert.equal(result.proposal.entities[0].key, "business_hours");
});
test("does not rename when multiple alias targets exist", () => {
  const result = stabilize(proposal("opening_times"), ["business_hours", "opening_hours"]);
  assert.equal(result.proposal.entities[0].key, "opening_times");
});
test("does not guess aliases for unrelated entity names", () => {
  const result = stabilize(proposal("product"), ["inventory_item"]);
  assert.equal(result.proposal.entities[0].key, "product");
});
test("does not collide with a simultaneously proposed entity", () => {
  const p = proposal("business_hours");
  p.entities.push({ ...p.entities[0], key: "opening_hours" });
  const result = stabilize(p, ["opening_hours"]);
  assert.equal(result.proposal.entities[0].key, "business_hours");
});
