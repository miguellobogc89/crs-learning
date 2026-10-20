import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/schema-discovery/approval-plan.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports });
const { planDiscoveredDefinitionApproval } = module.exports;

const entity = (key, type = "text") => ({
  key, name: key, description: "",
  evidence: [{ documentId: "doc", quote: key }],
  fields: [{ key: "name", name: "Name", type, required: false,
    evidence: [{ documentId: "doc", quote: key }] }],
});
const proposal = () => ({
  entities: [entity("product"), entity("supplier")],
  relations: [{ key: "supplies", fromEntity: "supplier", toEntity: "product",
    cardinality: "one_to_many", description: "",
    evidence: [{ documentId: "doc", quote: "supplies" }] }],
  warnings: [],
});
const semantic = (candidates = []) => ({ valid: true, candidates, issues: [] });
const run = (overrides = {}) => planDiscoveredDefinitionApproval({
  proposal: proposal(), semantic: semantic(),
  selectedEntityKeys: ["product", "supplier"], existingEntityKeys: [], ...overrides,
});

test("selected independent entities can be prepared without publishing relations", () => {
  const result = run();
  assert.equal(result.status, "READY_FOR_APPROVAL");
  assert.equal(result.entities.length, 2);
  assert.equal(result.relationsForLaterReview.length, 1);
});

test("unselected entities are excluded without blocking selected ones", () => {
  const result = run({ selectedEntityKeys: ["product"] });
  assert.equal(result.entities.length, 1);
  assert.equal(result.entities[0].key, "product");
  assert.equal(result.status, "READY_FOR_APPROVAL");
});

test("ambiguous semantic comparisons defer both affected entities", () => {
  const result = run({ semantic: semantic([{
    leftEntity: "product", rightEntity: "supplier", decision: "UNCERTAIN", requiresReview: true,
  }]) });
  assert.equal(result.entities.length, 0);
  assert.equal(result.deferred.length, 2);
  assert.equal(result.status, "NEEDS_CLARIFICATION");
});

test("existing entity keys cannot be recreated", () => {
  const result = run({ existingEntityKeys: ["product"] });
  assert.equal(result.entities.length, 1);
  assert.equal(result.entities[0].key, "supplier");
  assert.equal(result.deferred[0].code, "EXISTING_KEY");
});

test("enum fields are deferred until options are explicitly defined", () => {
  const p = proposal();
  p.entities[0] = entity("product", "enum");
  const result = run({ proposal: p });
  assert.equal(result.entities.length, 1);
  assert.equal(result.deferred[0].code, "UNSUPPORTED_ENUM");
});

test("invalid semantic review fails closed", () => {
  const result = run({ semantic: { valid: false, candidates: [], issues: [] } });
  assert.equal(result.entities.length, 0);
  assert.equal(result.status, "NEEDS_CLARIFICATION");
});

test("nothing selected does not approve any entity", () => {
  const result = run({ selectedEntityKeys: [] });
  assert.equal(result.entities.length, 0);
  assert.equal(result.status, "NOTHING_SELECTED");
});
