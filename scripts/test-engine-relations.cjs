/**
 * Run: node scripts/test-engine-relations.cjs
 * Pure relation planner tests. No database, OpenAI or HTTP.
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../lib/engine/relation-review-plan.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(compiled.outputText, filename);
const { planEngineRelation } = mod.exports;

function fixture(overrides = {}) {
  const workspaceId = "workspace-a";
  const definition = { id: "definition-1", workspaceId,
    fromObjectTypeId: "type-a", toObjectTypeId: "type-b",
    cardinality: "one_to_many", status: "active" };
  const from = { id: "record-a", workspaceId, objectTypeId: "type-a", status: "draft" };
  const to = { id: "record-b", workspaceId, objectTypeId: "type-b", status: "draft" };
  const document = { id: "document-a", workspaceId, extractedText: "A belongs to B." };
  const proposal = { relationDefinitionId: definition.id, fromRecordId: from.id,
    toRecordId: to.id, documentId: document.id, evidenceText: "A belongs to B." };
  return { workspaceId, definition, from, to, document, proposal,
    existingRelations: [], ...overrides };
}
const tests = [
  ["Valid evidence requires human review", () => {
    assert.equal(planEngineRelation(fixture()).status, "REVIEW_REQUIRED");
  }],
  ["Reject wrong workspace", () => {
    const f = fixture();
    f.to.workspaceId = "other";
    assert(planEngineRelation(f).issues.includes("WORKSPACE_MISMATCH"));
  }],
  ["Reject archived definition", () => {
    const f = fixture();
    f.definition.status = "archived";
    assert.equal(planEngineRelation(f).status, "HELD");
  }],
  ["Reject archived endpoint", () => {
    const f = fixture();
    f.from.status = "archived";
    assert.equal(planEngineRelation(f).status, "HELD");
  }],
  ["Reject endpoint type mismatch", () => {
    const f = fixture();
    f.to.objectTypeId = "type-c";
    assert(planEngineRelation(f).issues.includes("OBJECT_TYPE_MISMATCH"));
  }],
  ["Reject invented evidence", () => {
    const f = fixture();
    f.proposal.evidenceText = "Not in document";
    assert(planEngineRelation(f).issues.includes("EVIDENCE_NOT_IN_DOCUMENT"));
  }],
  ["Reject duplicate approved pair", () => {
    const f = fixture();
    f.existingRelations = [{ relationDefinitionId: "definition-1",
      fromRecordId: "record-a", toRecordId: "record-b" }];
    assert(planEngineRelation(f).issues.includes("RELATION_ALREADY_EXISTS"));
  }],
  ["Reject 1:N target assigned to another parent", () => {
    const f = fixture();
    f.existingRelations = [{ relationDefinitionId: "definition-1",
      fromRecordId: "other-parent", toRecordId: "record-b" }];
    assert(planEngineRelation(f).issues.includes("CARDINALITY_CONFLICT"));
  }],
  ["Allow 1:N second child", () => {
    const f = fixture();
    f.existingRelations = [{ relationDefinitionId: "definition-1",
      fromRecordId: "record-a", toRecordId: "other-child" }];
    assert.equal(planEngineRelation(f).status, "REVIEW_REQUIRED");
  }],
  ["Reject 1:1 endpoint reuse", () => {
    const f = fixture();
    f.definition.cardinality = "one_to_one";
    f.existingRelations = [{ relationDefinitionId: "definition-1",
      fromRecordId: "record-a", toRecordId: "other-child" }];
    assert(planEngineRelation(f).issues.includes("CARDINALITY_CONFLICT"));
  }],
  ["Allow N:M multiple pairs", () => {
    const f = fixture();
    f.definition.cardinality = "many_to_many";
    f.existingRelations = [{ relationDefinitionId: "definition-1",
      fromRecordId: "record-a", toRecordId: "other-child" }];
    assert.equal(planEngineRelation(f).status, "REVIEW_REQUIRED");
  }],
  ["Reject self relation", () => {
    const f = fixture();
    f.to.id = f.from.id;
    f.proposal.toRecordId = f.from.id;
    assert(planEngineRelation(f).issues.includes("SELF_RELATION_UNSUPPORTED"));
  }],
  ["Reject tampered proposal", () => {
    const f = fixture();
    f.proposal.fromRecordId = "other";
    assert(planEngineRelation(f).issues.includes("PROPOSAL_REFERENCE_MISMATCH"));
  }],
  ["Reject unsupported cardinality", () => {
    const f = fixture();
    f.definition.cardinality = "unknown";
    assert(planEngineRelation(f).issues.includes("INVALID_CARDINALITY"));
  }],
  ["Ignore approved links of other relation definitions", () => {
    const f = fixture();
    f.existingRelations = [{ relationDefinitionId: "other",
      fromRecordId: "record-a", toRecordId: "record-b" }];
    assert.equal(planEngineRelation(f).status, "REVIEW_REQUIRED");
  }],
];
let failures = 0;
for (const [name, test] of tests) {
  try { test(); process.stdout.write("PASS " + name + "\n"); }
  catch (error) { failures++; process.stderr.write("FAIL " + name + "\n" + error.stack + "\n"); }
}
process.stdout.write("\n" + (tests.length - failures) + "/" + tests.length + " passed\n");
if (failures) process.exitCode = 1;
