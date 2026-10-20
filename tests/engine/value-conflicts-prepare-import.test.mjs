import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/conflicts/prepare-import.service.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const input = { workspaceId: "workspace", userId: "user", knowledgeFileIds: ["doc1", "doc2"] };
const alternatives = [
  { value: "2,50", evidence: [{ documentId: "doc1", quote: "Vainilla: 2,50 EUR" }] },
  { value: "2,80", evidence: [{ documentId: "doc2", quote: "Vainilla: 2,80 EUR" }] },
];
const candidate = (text) => ({
  documentId: "doc1", evidenceText: text, objectTypeId: "product",
  fieldKey: "price", values: { price: 2.5 },
});
function setup(options = {}) {
  const calls = { persisted: 0, extracted: 0, listed: 0 };
  const detected = options.detected ?? { valid: true, conflicts: [], issues: [] };
  const rows = options.rows ?? [{
    subject: "Product", attribute: "price", context: "2026",
    alternatives_json: alternatives,
  }];
  const accepted = options.accepted ?? [candidate("Vainilla: 2,50 EUR"), candidate("Chocolate: 3 EUR")];
  const dependencies = {
    "./detect-ai.service": { detectKnowledgeValueConflicts: async () => detected },
    "./persistence.service": {
      persistReviewedValueConflictCandidates: async () => {
        calls.persisted++; return { count: detected.conflicts.length };
      },
      listPendingValueConflicts: async () => { calls.listed++; return rows; },
    },
    "./import-plan": {
      planConflictAwareImport: ({ accepted, conflicts }) => {
        const pending = [], ready = [];
        for (const item of accepted) {
          const conflictIndexes = conflicts.flatMap((conflict, index) =>
            conflict.alternatives.some((alternative) =>
              alternative.evidence.some((e) => e.documentId === item.documentId &&
                (e.quote.includes(item.evidenceText) || item.evidenceText.includes(e.quote))))
              ? [index] : []);
          if (conflictIndexes.length) pending.push({ candidate: item, conflictIndexes });
          else ready.push(item);
        }
        return { ready, pending, conflicts, status: pending.length
          ? ready.length ? "PARTIAL_REVIEW_REQUIRED" : "CONFLICT_REVIEW_REQUIRED"
          : "READY_FOR_REVIEW" };
      },
    },
    "../import-ai-extraction.service": {
      extractEngineCandidatesFromKnowledge: async () => {
        calls.extracted++; return { accepted, issues: [], proposedCount: accepted.length };
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name) => {
      if (!(name in dependencies)) throw Error("Unexpected import: " + name);
      return dependencies[name];
    },
  });
  return { run: module.exports.prepareConflictAwareKnowledgeImport, calls };
}

test("existing pending Neon conflict protects candidate even when AI returns none", async () => {
  const { run, calls } = setup();
  const result = await run(input);
  assert.equal(result.pending.length, 1);
  assert.equal(result.ready.length, 1);
  assert.equal(result.status, "PARTIAL_REVIEW_REQUIRED");
  assert.equal(result.persistedConflictCount, 0);
  assert.equal(calls.listed, 1);
});

test("invalid detection fails closed before writing or extracting", async () => {
  const { run, calls } = setup({ detected: { valid: false, conflicts: [], issues: [{ code: "INVALID_SHAPE" }] } });
  const result = await run(input);
  assert.equal(result.status, "INVALID_CONFLICT_REVIEW");
  assert.equal(result.ready.length, 0);
  assert.equal(calls.persisted, 0);
  assert.equal(calls.extracted, 0);
});

test("without pending conflicts all extracted candidates remain reviewable", async () => {
  const { run } = setup({ rows: [] });
  const result = await run(input);
  assert.equal(result.ready.length, 2);
  assert.equal(result.pending.length, 0);
});

test("100 pending conflicts fail closed instead of silently truncating", async () => {
  const { run, calls } = setup({ rows: Array.from({ length: 100 }, () => ({
    subject: "Product", attribute: "price", context: "2026", alternatives_json: alternatives,
  })) });
  await assert.rejects(run(input), /safe read limit/);
  assert.equal(calls.extracted, 0);
});

test("malformed stored evidence fails closed", async () => {
  const { run, calls } = setup({ rows: [{
    subject: "Product", attribute: "price", context: "2026",
    alternatives_json: [{ value: "2,50", evidence: [] }, alternatives[1]],
  }] });
  await assert.rejects(run(input), /Invalid stored conflict evidence/);
  assert.equal(calls.extracted, 0);
});
