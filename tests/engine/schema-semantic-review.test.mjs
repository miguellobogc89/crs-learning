import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/schema-discovery/semantic-review.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { reviewSemanticEntityMatches: review } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const proposal = {
  entities: ["ingredient", "raw_material", "retail_product"].map((key) => ({
    key, name: key, description: "", fields: [],
    evidence: [{ documentId: "doc-1", quote: key }],
  })),
  relations: [], warnings: [],
};
const candidate = (leftEntity = "ingredient", rightEntity = "raw_material", decision = "POSSIBLE_EQUIVALENCE") =>
  ({ leftEntity, rightEntity, decision, reason: "Potentially similar business concepts" });

test("flags possible synonyms for review without merging entities", () => {
  const result = review(proposal, [candidate()]);
  assert.equal(result.valid, true);
  assert.equal(result.candidates[0].requiresReview, true);
  assert.equal(result.candidates[0].leftEvidence[0].quote, "ingredient");
  assert.equal(proposal.entities.length, 3);
});

test("keeps distinct business concepts separate", () => {
  const result = review(proposal, [candidate("ingredient", "retail_product", "DISTINCT")]);
  assert.equal(result.candidates[0].requiresReview, false);
});

test("rejects unknown entity references", () => {
  const result = review(proposal, [candidate("unknown")]);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].code, "UNKNOWN_ENTITY");
});

test("rejects self-comparison", () => {
  assert.equal(review(proposal, [candidate("ingredient", "ingredient")]).issues[0].code, "SAME_ENTITY");
});

test("rejects duplicate comparisons regardless of direction", () => {
  const result = review(proposal, [candidate(), candidate("raw_material", "ingredient")]);
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].code, "DUPLICATE_PAIR");
});

test("rejects invalid model output", () => {
  assert.equal(review(proposal, null).valid, false);
  assert.equal(review(proposal, [{ ...candidate(), decision: "AUTO_MERGE" }]).valid, false);
});

test("rejects excessive comparisons", () => {
  assert.equal(review(proposal, Array.from({ length: 101 }, () => candidate())).valid, false);
});
