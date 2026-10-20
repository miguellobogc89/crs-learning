import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/conflicts/detect-ai.service.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const input = { workspaceId: "ws", userId: "user", knowledgeFileIds: ["doc1", "doc2"] };
const files = [
  { id: "doc1", extracted_text: "Vainilla: 2,50 EUR" },
  { id: "doc2", extracted_text: "Vainilla: 2,80 EUR" },
];
const candidate = {
  subject: "Vainilla", attribute: "precio", context: "tarifa",
  alternatives: [
    { value: "2,50", evidence: [{ documentId: "doc1", quote: "Vainilla: 2,50 EUR" }] },
    { value: "2,80", evidence: [{ documentId: "doc2", quote: "Vainilla: 2,80 EUR" }] },
  ],
};
function setup({ output, authorized = true, accessible = true, modelError, valid = true } = {}) {
  const calls = { auth: 0, model: 0, validate: 0 };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require(name) {
      if (name === "@/lib/prisma") return { prisma: { knowledge_files: { findMany: async () =>
        accessible ? files : files.slice(0, 1) } } };
      if (name === "@/lib/ai/openai") return {
        getKnowledgeImportModel: () => "test-model",
        getOpenAIClient: () => ({ responses: { create: async () => {
          calls.model++;
          if (modelError) throw modelError;
          return { output_text: output ?? JSON.stringify({ conflicts: [candidate] }) };
        } } }),
      };
      if (name === "@/lib/knowledge/access-control") return {
        knowledgeSourceReadWhere: () => ({ authorized: true }),
      };
      if (name === "../import-knowledge-preview.service") return {
        previewEngineImportFromKnowledge: async () => {
          calls.auth++;
          if (!authorized) throw new Error("Access denied");
        },
      };
      if (name === "./validation") return {
        validateValueConflicts: ({ candidates, documents }) => {
          calls.validate++;
          const good = valid && Array.isArray(candidates) && documents.length === 2;
          return { valid: good, conflicts: good ? candidates.map((c) => ({
            ...c, status: "PENDING_REVIEW", scope: "AFFECTED_VALUE_ONLY",
          })) : [], issues: good ? [] : [{ code: "INVALID_SHAPE" }] };
        },
      };
      throw new Error("Unexpected dependency " + name);
    },
  });
  return { run: module.exports.detectKnowledgeValueConflicts, calls };
}

test("returns structured pending conflicts without resolving them", async () => {
  const { run, calls } = setup();
  const result = await run(input);
  assert.equal(result.status, "HAS_PENDING_CONFLICTS");
  assert.equal(result.conflicts[0].alternatives.length, 2);
  assert.equal(result.conflicts[0].status, "PENDING_REVIEW");
  assert.equal(calls.auth, 1);
  assert.equal(calls.validate, 1);
});

test("empty conflict results do not block independent facts", async () => {
  const { run } = setup({ output: '{"conflicts":[]}' });
  const result = await run(input);
  assert.equal(result.status, "NO_CONFLICTS_DETECTED");
  assert.equal(result.conflicts.length, 0);
});

test("authorization failure prevents AI calls", async () => {
  const { run, calls } = setup({ authorized: false });
  await assert.rejects(run(input), /Access denied/);
  assert.equal(calls.model, 0);
});

test("inaccessible documents prevent AI calls", async () => {
  const { run, calls } = setup({ accessible: false });
  await assert.rejects(run(input), /no longer accessible/);
  assert.equal(calls.model, 0);
});

test("rejects duplicate and invalid file selections before access", async () => {
  const { run, calls } = setup();
  await assert.rejects(run({ ...input, knowledgeFileIds: ["doc1", "doc1"] }), /distinct/);
  assert.equal(calls.auth, 0);
});

test("invalid candidates cannot be accepted", async () => {
  const { run } = setup({ valid: false });
  const result = await run(input);
  assert.equal(result.status, "INVALID_PROPOSAL");
  assert.equal(result.conflicts.length, 0);
});

test("rejects malformed model JSON", async () => {
  const { run } = setup({ output: "not-json" });
  await assert.rejects(run(input), /not valid JSON/);
});

test("propagates model errors", async () => {
  const { run } = setup({ modelError: new Error("model unavailable") });
  await assert.rejects(run(input), /model unavailable/);
});

test("rejects missing conflicts array", async () => {
  const { run } = setup({ output: '{"warnings":[]}' });
  assert.equal((await run(input)).status, "INVALID_PROPOSAL");
});
