import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/schema-discovery/persist-approved.service.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const evidence = [{ documentId: "doc1", quote: "Product" }];
const entity = { key: "product", name: "Product", description: "", evidence,
  fields: [{ key: "name", name: "Name", type: "text", required: false, evidence }] };
const proposal = { entities: [entity], relations: [], warnings: [] };
const input = { workspaceId: "workspace", userId: "owner", proposal,
  semanticCandidates: [], selectedEntityKeys: ["product"] };
function setup({ owner = true, files = true, valid = true, existing = [],
  planStatus = "READY_FOR_APPROVAL", selected = input.selectedEntityKeys } = {}) {
  const calls = { objects: [], fields: [], tx: 0 };
  const tx = {
    workspaces: { findFirst: async () => owner
      ? { owner_user_id: "owner", workspace_members: [] }
      : { owner_user_id: "someone-else", workspace_members: [] } },
    knowledge_files: { findMany: async () => files
      ? [{ id: "doc1", extracted_text: "Product" }] : [] },
    engine_object_types: {
      findMany: async () => existing.map((key) => ({ key })),
      create: async ({ data }) => { calls.objects.push(data); return { id: "created-id" }; },
    },
    engine_field_definitions: {
      create: async ({ data }) => { calls.fields.push(data); return { id: "field-id" }; },
    },
  };
  const dependencies = {
    "@prisma/client": { Prisma: {} },
    "@/lib/prisma": { prisma: { $transaction: async (callback) => {
      calls.tx++; return callback(tx);
    } } },
    "@/lib/knowledge/access-control": { knowledgeSourceReadWhere: () => ({ authorized: true }) },
    "./validation": { validateSchemaDiscovery: () => ({
      valid, proposal: valid ? proposal : null, issues: valid ? [] : [{ code: "INVALID_SHAPE" }],
    }) },
    "./semantic-review": { reviewSemanticEntityMatches: () => ({
      valid: true, candidates: [], issues: [],
    }) },
    "./approval-plan": { planDiscoveredDefinitionApproval: () => ({
      status: existing.length ? "NEEDS_CLARIFICATION" : planStatus,
      entities: existing.length ? [] : selected.includes("product") ? [entity] : [],
      deferred: existing.length ? [{ entityKey: "product", code: "EXISTING_KEY" }] : [],
      relationsForLaterReview: [],
    }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name) => {
      if (!(name in dependencies)) throw Error("Unexpected import: " + name);
      return dependencies[name];
    },
  });
  return { run: module.exports.persistApprovedDiscoveredDefinitions, calls };
}
test("explicit approval creates object and its field in one transaction", async () => {
  const { run, calls } = setup();
  const result = await run(input);
  assert.equal(result.count, 1);
  assert.equal(calls.objects.length, 1);
  assert.equal(calls.fields.length, 1);
  assert.equal(calls.fields[0].object_type_id, "created-id");
  assert.equal(calls.tx, 1);
});
test("unauthorized user cannot read evidence or create definitions", async () => {
  const { run, calls } = setup({ owner: false });
  await assert.rejects(run(input), /owner or admin/);
  assert.equal(calls.objects.length, 0);
});
test("missing source evidence prevents creation", async () => {
  const { run, calls } = setup({ files: false });
  await assert.rejects(run(input), /no longer accessible/);
  assert.equal(calls.objects.length, 0);
});
test("invalid schema evidence prevents creation", async () => {
  const { run, calls } = setup({ valid: false });
  await assert.rejects(run(input), /Invalid schema evidence/);
  assert.equal(calls.objects.length, 0);
});
test("existing entity key prevents recreation", async () => {
  const { run, calls } = setup({ existing: ["product"] });
  await assert.rejects(run(input), /require clarification/);
  assert.equal(calls.objects.length, 0);
});
test("ambiguous plan prevents creation", async () => {
  const { run, calls } = setup({ planStatus: "NEEDS_CLARIFICATION" });
  await assert.rejects(run(input), /require clarification/);
  assert.equal(calls.objects.length, 0);
});
test("duplicate selected keys rejected before transaction", async () => {
  const { run, calls } = setup();
  await assert.rejects(run({ ...input, selectedEntityKeys: ["product", "product"] }), /distinct approved/);
  assert.equal(calls.tx, 0);
});
test("unknown selected entity cannot be silently ignored", async () => {
  const { run, calls } = setup({ selected: ["product", "unknown"] });
  await assert.rejects(run({ ...input, selectedEntityKeys: ["product", "unknown"] }), /require clarification/);
  assert.equal(calls.objects.length, 0);
});
