import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/schema-discovery/consolidation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { consolidateSchemaProposals: consolidate } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const ev = (id, quote) => [{ documentId: id, quote }];
const proposal = (id, options = {}) => ({
  entities: [{
    key: "product", name: options.entityName ?? "Product", description: "Product",
    evidence: ev(id, "Product"),
    fields: [{ key: "price", name: options.fieldName ?? "Price",
      type: options.type ?? "decimal", required: options.required ?? false,
      evidence: ev(id, "Price") }],
  }],
  relations: [{ key: "has_products", fromEntity: "business",
    toEntity: options.toEntity ?? "product", cardinality: options.cardinality ?? "one_to_many",
    description: "Products", evidence: ev(id, "Products") }],
  warnings: options.warnings ?? [],
});

test("merges identical keys without duplicates and preserves evidence", () => {
  const result = consolidate([proposal("a"), proposal("b")]);
  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.sourceCount, 2);
  assert.equal(result.proposal.entities.length, 1);
  assert.equal(result.proposal.relations.length, 1);
  assert.equal(result.proposal.entities[0].fields[0].evidence.length, 2);
  assert.equal(result.questions.length, 0);
});

test("records incompatible field types as blocking questions", () => {
  const result = consolidate([proposal("a"), proposal("b", { type: "text" })]);
  assert.equal(result.status, "NEEDS_CLARIFICATION");
  assert.equal(result.questions[0].kind, "FIELD_TYPE_CONFLICT");
  assert.deepEqual(result.questions[0].alternatives, ["decimal", "text"]);
  assert.equal(result.questions[0].evidence.length, 2);
});

test("detects required-field disagreement", () => {
  const result = consolidate([proposal("a"), proposal("b", { required: true })]);
  assert.equal(result.questions[0].kind, "FIELD_REQUIRED_CONFLICT");
});

test("detects relation structural disagreement", () => {
  const result = consolidate([proposal("a"), proposal("b", { cardinality: "many_to_many" })]);
  assert.equal(result.questions[0].kind, "RELATION_CONFLICT");
});

test("detects same-key naming disagreements without guessing synonymy", () => {
  const result = consolidate([proposal("a"), proposal("b", { entityName: "Item", fieldName: "Cost" })]);
  assert.equal(result.questions.length, 2);
  assert.equal(result.status, "NEEDS_CLARIFICATION");
});

test("deduplicates evidence and warnings", () => {
  const p = proposal("a", { warnings: ["Check prices"] });
  const result = consolidate([p, p]);
  assert.equal(result.proposal.entities[0].evidence.length, 1);
  assert.deepEqual(result.proposal.warnings, ["Check prices"]);
});

test("does not mutate input proposals", () => {
  const first = proposal("a");
  consolidate([first, proposal("b")]);
  assert.equal(first.entities[0].evidence.length, 1);
  assert.equal(first.entities[0].fields[0].evidence.length, 1);
});

test("rejects empty and oversized batches", () => {
  assert.throws(() => consolidate([]), /between 1 and 20/);
  assert.throws(() => consolidate(Array.from({ length: 21 }, () => proposal("a"))), /between 1 and 20/);
});
