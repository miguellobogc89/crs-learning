import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/schema-discovery/discover.service.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const input = { workspaceId: "ws-1", userId: "user-1", knowledgeFileIds: ["file-1"] };
const evidence = [{ documentId: "file-1", quote: "Helado vainilla" }];
const proposal = { entities: [{ key: "producto", name: "Producto", description: "",
  fields: [], evidence }], relations: [], warnings: [] };

function setup({ unauthorized = false, files = [{ id: "file-1", extracted_text: "Helado vainilla" }],
  output = JSON.stringify(proposal), valid = true } = {}) {
  const calls = { model: 0, files: 0, validate: 0, authorization: 0 };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require(name) {
      if (name === "@/lib/prisma") return { prisma: { knowledge_files: {
        findMany: async () => { calls.files++; return files; },
      } } };
      if (name === "@/lib/ai/openai") return {
        getKnowledgeImportModel: () => "test-model",
        getOpenAIClient: () => ({ responses: { create: async () => {
          calls.model++; return { output_text: output };
        } } }),
      };
      if (name === "@/lib/knowledge/access-control") return {
        knowledgeSourceReadWhere: () => ({ authorized: true }),
      };
      if (name === "../import-knowledge-preview.service") return {
        previewEngineImportFromKnowledge: async () => {
          calls.authorization++;
          if (unauthorized) throw new Error("FORBIDDEN");
          return { accepted: [], issues: [] };
        },
      };
      if (name === "./validation") return {
        validateSchemaDiscovery: ({ proposal: p }) => {
          calls.validate++;
          return { valid, proposal: valid ? p : null, issues: valid ? [] : [{ code: "MISSING_EVIDENCE" }] };
        },
      };
      throw new Error("Unexpected dependency " + name);
    },
  });
  return { discover: module.exports.discoverEngineSchemaFromKnowledge, calls };
}

test("authorization precedes file access and AI", async () => {
  const { discover, calls } = setup({ unauthorized: true });
  await assert.rejects(discover(input), /FORBIDDEN/);
  assert.equal(calls.files, 0);
  assert.equal(calls.model, 0);
});

test("rejects empty and duplicate file selections before AI", async () => {
  const { discover, calls } = setup();
  await assert.rejects(discover({ ...input, knowledgeFileIds: [] }), /between 1 and 10/);
  await assert.rejects(discover({ ...input, knowledgeFileIds: ["file-1", "file-1"] }), /distinct/);
  assert.equal(calls.model, 0);
});

test("returns proposal for review without persistence", async () => {
  const { discover, calls } = setup();
  const result = await discover(input);
  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.documentCount, 1);
  assert.equal(result.proposal.entities[0].key, "producto");
  assert.equal(calls.validate, 1);
  assert.equal(calls.model, 1);
});

test("rejects inaccessible files before AI", async () => {
  const { discover, calls } = setup({ files: [] });
  await assert.rejects(discover(input), /no longer accessible/);
  assert.equal(calls.model, 0);
});

test("reports invalid architecture without accepting it", async () => {
  const { discover } = setup({ valid: false });
  const result = await discover(input);
  assert.equal(result.status, "INVALID_PROPOSAL");
  assert.equal(result.proposal, null);
  assert.equal(result.issues[0].code, "MISSING_EVIDENCE");
});

test("rejects non-JSON model output", async () => {
  const { discover } = setup({ output: "not json" });
  await assert.rejects(discover(input), /not valid JSON/);
});
