import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/import-ai-extraction.service.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const input = { workspaceId: "ws-1", userId: "user-1", knowledgeFileIds: ["file-1"] };
const candidate = {
  objectTypeId: "type-1", documentId: "file-1", fieldKey: "price",
  evidenceText: "Vainilla 2,80", values: { price: "2.80" },
};

function setup({ unauthorized = false, files = [{ id: "file-1", extracted_text: "Vainilla 2,80" }],
  definitions = [{ id: "type-1", key: "product", engine_field_definitions: [
    { key: "price", field_type: "decimal", is_required: true, status: "active", is_unique: false },
  ] }], output = JSON.stringify({ candidates: [candidate] }) } = {}) {
  const calls = { model: 0, validation: 0, dbFiles: 0, dbDefinitions: 0 };
  const preview = async ({ candidates }) => {
    calls.validation++;
    if (unauthorized) throw new Error("FORBIDDEN");
    return { accepted: candidates, issues: [] };
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require(name) {
      if (name === "@/lib/prisma") return { prisma: {
        knowledge_files: { findMany: async () => { calls.dbFiles++; return files; } },
        engine_object_types: { findMany: async () => { calls.dbDefinitions++; return definitions; } },
      } };
      if (name === "@/lib/ai/openai") return {
        getKnowledgeImportModel: () => "test-model",
        getOpenAIClient: () => ({ responses: { create: async () => {
          calls.model++;
          return { output_text: output };
        } } }),
      };
      if (name === "@/lib/knowledge/access-control") return {
        knowledgeSourceReadWhere: () => ({ authorized: true }),
      };
      if (name === "./import-knowledge-preview.service") return {
        previewEngineImportFromKnowledge: preview,
      };
      if (name === "./import-extraction-prompt") return {
        ENGINE_EXTRACTION_INSTRUCTIONS: "Extract only evidenced values.",
        buildEngineExtractionInput: (data) => JSON.stringify(data),
      };
      throw new Error("Unexpected dependency " + name);
    },
  });
  return { extract: module.exports.extractEngineCandidatesFromKnowledge, calls };
}

test("rejects unauthorized extraction before database or model calls", async () => {
  const { extract, calls } = setup({ unauthorized: true });
  await assert.rejects(extract(input), /FORBIDDEN/);
  assert.equal(calls.model, 0);
  assert.equal(calls.dbFiles, 0);
  assert.equal(calls.dbDefinitions, 0);
});

test("rejects duplicate or empty file selections", async () => {
  const { extract, calls } = setup();
  await assert.rejects(extract({ ...input, knowledgeFileIds: [] }), /between 1 and 10/);
  await assert.rejects(extract({ ...input, knowledgeFileIds: ["file-1", "file-1"] }), /distinct/);
  assert.equal(calls.model, 0);
});

test("valid candidates are sent through authorized validation", async () => {
  const { extract, calls } = setup();
  const result = await extract(input);
  assert.equal(result.proposedCount, 1);
  assert.equal(result.accepted.length, 1);
  assert.equal(calls.validation, 2);
  assert.equal(calls.model, 1);
});

test("rejects malformed model response", async () => {
  const { extract } = setup({ output: JSON.stringify({ candidates: [{ objectTypeId: 3 }] }) });
  await assert.rejects(extract(input), /Invalid extraction candidate shape/);
});

test("does not invoke model when no supported object types exist", async () => {
  const { extract, calls } = setup({ definitions: [] });
  const result = await extract(input);
  assert.equal(result.reason, "NO_SUPPORTED_OBJECT_TYPES");
  assert.equal(calls.model, 0);
});

test("rejects missing authorized source files before model call", async () => {
  const { extract, calls } = setup({ files: [] });
  await assert.rejects(extract(input), /no longer accessible/);
  assert.equal(calls.model, 0);
});
