import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/schema-discovery/semantic-ai.service.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const entities = ["ingredient", "raw_material", "retail_product"].map((key) => ({
  key, name: key, description: key, fields: [],
  evidence: [{ documentId: "file-1", quote: key }],
}));
const proposal = { entities, relations: [], warnings: [] };
const input = { workspaceId: "ws", userId: "user", knowledgeFileIds: ["file-1"] };
function setup({ valid = true, entityCount = 3, output, modelError } = {}) {
  const calls = { discover: 0, model: 0, review: 0 };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require(name) {
      if (name === "./discover.service") return {
        discoverEngineSchemaFromKnowledge: async () => {
          calls.discover++;
          return { valid, proposal: valid ? { ...proposal, entities: entities.slice(0, entityCount) } : null,
            issues: valid ? [] : [{ code: "MISSING_EVIDENCE" }] };
        },
      };
      if (name === "@/lib/ai/openai") return {
        getKnowledgeImportModel: () => "test-model",
        getOpenAIClient: () => ({ responses: { create: async () => {
          calls.model++;
          if (modelError) throw modelError;
          return { output_text: output ?? JSON.stringify({
            candidates: [{ leftEntity: "ingredient", rightEntity: "raw_material",
              decision: "POSSIBLE_EQUIVALENCE", reason: "Possible synonym" }],
          }) };
        } } }),
      };
      if (name === "./semantic-review") return {
        reviewSemanticEntityMatches: (p, raw) => {
          calls.review++;
          const good = Array.isArray(raw) && raw.every((x) =>
            p.entities.some((e) => e.key === x.leftEntity) &&
            p.entities.some((e) => e.key === x.rightEntity));
          return { valid: good, candidates: good ? raw.map((x) => ({
            ...x, requiresReview: x.decision !== "DISTINCT",
          })) : [], issues: good ? [] : [{ code: "UNKNOWN_ENTITY" }] };
        },
      };
      throw new Error("Unexpected dependency " + name);
    },
  });
  return { run: module.exports.discoverAndReviewSemanticEntities, calls };
}

test("does not invoke semantic AI on invalid discovery", async () => {
  const { run, calls } = setup({ valid: false });
  assert.equal((await run(input)).status, "INVALID_PROPOSAL");
  assert.equal(calls.model, 0);
});

test("skips AI when there is only one entity", async () => {
  const { run, calls } = setup({ entityCount: 1 });
  assert.equal((await run(input)).status, "READY_FOR_REVIEW");
  assert.equal(calls.model, 0);
});

test("returns semantic suggestions for review", async () => {
  const { run, calls } = setup();
  const result = await run(input);
  assert.equal(result.status, "NEEDS_CLARIFICATION");
  assert.equal(result.semantic.candidates[0].decision, "POSSIBLE_EQUIVALENCE");
  assert.equal(calls.model, 1);
  assert.equal(calls.review, 1);
});

test("distinct concepts do not force clarification", async () => {
  const { run } = setup({ output: JSON.stringify({ candidates: [{
    leftEntity: "ingredient", rightEntity: "retail_product",
    decision: "DISTINCT", reason: "Different roles",
  }] }) });
  assert.equal((await run(input)).status, "READY_FOR_REVIEW");
});

test("invalid references cannot be accepted", async () => {
  const { run } = setup({ output: JSON.stringify({ candidates: [{
    leftEntity: "unknown", rightEntity: "ingredient",
    decision: "POSSIBLE_EQUIVALENCE", reason: "guess",
  }] }) });
  assert.equal((await run(input)).status, "INVALID_SEMANTIC_REVIEW");
});

test("rejects malformed model JSON", async () => {
  const { run } = setup({ output: "invalid" });
  await assert.rejects(run(input), /not valid JSON/);
});

test("propagates model failures without accepting guesses", async () => {
  const { run } = setup({ modelError: new Error("model unavailable") });
  await assert.rejects(run(input), /model unavailable/);
});
