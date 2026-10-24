import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
function load(path, dependencies = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", js)(name => {
    if (name in dependencies) return dependencies[name];
    if (name === "node:crypto") return { createHash };
    throw new Error("Unexpected dependency " + name);
  }, module, module.exports);
  return module.exports;
}
const { applyImportBatchReview, assertCompleteImportInventory, assertReviewedImportBatch,
  importBatchFingerprint, reviewedDocumentRoutes, assertReviewedDocumentRoutes } = load("../../lib/knowledge/import/review-import-batch.ts");
const { emptyImportInventory, appendInventoryFile } = load("../../lib/knowledge/import/build-import-map.ts");
function fixture() {
  const files = [
    { id: "f1", status: "text_ready", extracted_text: "Factura 1\nTotal 100" },
    { id: "f2", status: "text_ready", extracted_text: "Factura 2\nTotal 200" },
    { id: "f3", status: "text_ready", extracted_text: "Manual\nProcedimiento y catálogo" },
  ];
  let inventory = emptyImportInventory("import");
  for (const [index, file] of files.entries()) {
    const doc = { id: "d" + (index + 1), fileId: file.id, fileName: file.id + ".pdf",
      type: index === 2 ? "manual" : "factura", category: index === 1 ? "luz" : "electricidad",
      title: "Fuente " + (index + 1), startLine: 1, endLine: 2, confidence: "high" };
    inventory = appendInventoryFile(inventory, { fileId: file.id, fileName: doc.fileName,
      sourceChars: file.extracted_text.length, status: "completed", documentIds: [doc.id] }, [doc]);
  }
  const response = {
    documents: inventory.documents.map((doc, index) => ({ documentId: doc.id, type: doc.type, category: "electricidad",
      routing: { knowledge: true, articleCandidate: index === 2, structuredCandidate: true,
        reason: index === 2 ? "Reglas y catálogo" : "Factura con atributos comparables, sin artículo",
        structuredFields: ["total"], existingArticleId: index === 2 ? "article" : null,
        existingStructureKeys: index === 2 ? [] : ["invoice"] } })),
    groups: [{ title: "Facturas", documentIds: ["d1", "d2"], reason: "Mismo propósito y estructura" },
      { title: "Manual", documentIds: ["d3"], reason: "Reglas reutilizables" }],
  };
  return { files, inventory, response, articleIds: new Set(["article"]), structureKeys: new Set(["invoice"]) };
}
test("whole batch review consolidates equivalent categories, retains provenance and allows both destinations", () => {
  const f = fixture();
  const result = applyImportBatchReview(f);
  assert.deepEqual(result.summary.byCategory, [{ category: "electricidad", count: 3 }]);
  for (const [index, doc] of result.documents.entries()) {
    assert.equal(doc.fileId, f.inventory.documents[index].fileId);
    assert.equal(doc.startLine, 1);
    assert.equal(doc.endLine, 2);
  }
  assert.equal(result.documents[2].routing.articleCandidate, true);
  assert.equal(result.documents[2].routing.structuredCandidate, true);
  assert.deepEqual(result.writesPerformed, { engine: false, knowledge: false });
  assert.doesNotThrow(() => assertReviewedImportBatch(result, f.files));
  const routes = reviewedDocumentRoutes(result, f.files);
  assert.equal(routes.f1.articleCandidate, false);
  assert.equal(routes.f1.structuredCandidate, true);
  assert.equal(routes.f3.existingArticleId, "article");
  assert.doesNotThrow(() => assertReviewedDocumentRoutes(result, f.files, routes));
  routes.f1.articleCandidate = true;
  assert.throws(() => assertReviewedDocumentRoutes(result, f.files, routes), /destinos/);
});
test("one file follows exactly the same review boundary", () => {
  const f = fixture(); f.files = f.files.slice(0, 1);
  f.inventory.files = f.inventory.files.slice(0, 1); f.inventory.documents = f.inventory.documents.slice(0, 1);
  f.response.documents = f.response.documents.slice(0, 1); f.response.groups = [{ title: "Factura", documentIds: ["d1"], reason: "Una factura" }];
  assert.equal(applyImportBatchReview(f).batchReview.groups.length, 1);
});
for (const [name, mutate] of [
  ["omitted document", f => f.response.documents.pop()],
  ["duplicate document", f => f.response.documents.push(f.response.documents[0])],
  ["invented document", f => f.response.documents[0].documentId = "invented"],
  ["unknown article", f => f.response.documents[2].routing.existingArticleId = "unknown"],
  ["unknown structure", f => f.response.documents[0].routing.existingStructureKeys = ["invented"]],
  ["excluded source", f => f.response.documents[0].routing.knowledge = false],
  ["missing group", f => f.response.groups.pop()],
  ["duplicated group membership", f => f.response.groups[1].documentIds.push("d1")],
]) test(name + " cannot pass the batch review", () => {
  const f = fixture(); mutate(f); assert.throws(() => applyImportBatchReview(f));
});
test("all sources must finish extraction and recognition before reviewing", () => {
  const f = fixture(); f.files[1].status = "extracted";
  assert.throws(() => assertCompleteImportInventory(f.inventory, f.files), /extracción/);
  f.files[1].status = "text_ready"; f.inventory.files.pop();
  assert.throws(() => assertCompleteImportInventory(f.inventory, f.files), /reconocer/);
});
test("failed extraction is explicit and excluded without losing the valid batch", () => {
  const f = fixture(); f.files.push({ id: "bad", status: "text_error", extracted_text: "" });
  f.inventory.files.push({ fileId: "bad", fileName: "bad.pdf", sourceChars: 0, status: "error", documentIds: [] });
  const result = applyImportBatchReview(f);
  assert.equal(result.status, "completed_with_issues");
  assert.equal(result.files.at(-1).status, "error");
  assert.equal(Object.keys(reviewedDocumentRoutes(result, f.files)).length, 3);
});
test("source edits, reclassification and individual-only inventory invalidate review", () => {
  const f = fixture(); const result = applyImportBatchReview(f);
  const changedFiles = f.files.map(file => ({ ...file })); changedFiles[0].extracted_text += "\nCorrection";
  assert.throws(() => assertReviewedImportBatch(result, changedFiles), /revisarse/);
  const modified = structuredClone(result); modified.documents[0].routing.structuredCandidate = false;
  assert.throws(() => assertReviewedImportBatch(modified, f.files), /revisarse/);
  assert.throws(() => assertReviewedImportBatch(f.inventory, f.files), /revisarse/);
  const reset = appendInventoryFile(result, result.files[0], result.documents.filter(doc => doc.fileId === "f1"));
  assert.equal(reset.batchReview, undefined);
  assert.throws(() => assertReviewedImportBatch(reset, f.files), /revisarse/);
});
test("fingerprint is independent of database ordering", () => {
  const f = fixture(); const result = applyImportBatchReview(f);
  assert.equal(importBatchFingerprint(result, f.files), importBatchFingerprint({ ...result, documents: [...result.documents].reverse() }, [...f.files].reverse()));
});

function serviceFixture({ cached = false, saveCount = 1 } = {}) {
  const f = fixture();
  const inventory = cached ? applyImportBatchReview(f) : f.inventory;
  const payload = { globalImportMap: inventory };
  let aiCalls = 0, saves = 0, modelContext, authorizedWhere;
  const prisma = {
    knowledge_imports: {
      async findFirst({ where }) {
        authorizedWhere = where;
        return { status: "text_ready", processing_status: "completed", updated_at: new Date(0),
          proposal_json: payload, knowledge_import_files: f.files.map(file => ({ ...file, file_name: file.id + ".pdf" })) };
      },
      async updateMany({ where, data }) {
        saves++;
        assert.equal(where.status, "text_ready");
        assert.equal(where.processing_status, "completed");
        assert.equal(where.proposal_json.equals, payload);
        assert.equal(data.proposal_json.globalImportMap.batchReview.status, "reviewed");
        return { count: saveCount };
      },
    },
    knowledge_sources: { async findMany() { return [{ id: "article", title: "Manual" }]; } },
    engine_object_types: { async findMany() { return []; } },
    engine_catalog_types: { async findMany() { return [{ key: "invoice", name: "Factura" }]; } },
  };
  const helpers = load("../../lib/knowledge/import/review-import-batch.ts");
  const api = load("../../lib/knowledge/import/review-import-batch.service.ts", {
    "@prisma/client": { Prisma: {} },
    "@/lib/prisma": { prisma },
    "./review-import-batch": helpers,
    "@/lib/ai/openai": {
      getKnowledgeImportModel: () => "test-model",
      getOpenAIClient: () => ({ responses: { async create(args) {
        aiCalls++; modelContext = JSON.parse(args.input);
        return { status: "completed", output_text: JSON.stringify(f.response) };
      } } }),
    },
  });
  return { ...api, calls: () => ({ aiCalls, saves, modelContext, authorizedWhere }) };
}
const scope = { importId: "import", userId: "user", workspaceId: "workspace" };
test("service reviews all original sources together against local and standard structures without writing records", async () => {
  const service = serviceFixture();
  const result = await service.reviewKnowledgeImportBatch(scope);
  const calls = service.calls();
  assert.equal(calls.aiCalls, 1); assert.equal(calls.saves, 1);
  assert.equal(calls.modelContext.sources.length, 3);
  assert.equal(calls.modelContext.sources[0].lines, "1: Factura 1\n2: Total 100");
  assert.equal(calls.modelContext.reusableStandards[0].key, "invoice");
  assert.equal(calls.authorizedWhere.owner_user_id, "user");
  assert.equal(calls.authorizedWhere.knowledge_libraries.workspace_id, "workspace");
  assert.deepEqual(result.writesPerformed, { engine: false, knowledge: false });
});
test("resuming a reviewed unchanged batch does not call the model or save it twice", async () => {
  const service = serviceFixture({ cached: true });
  assert.equal((await service.reviewKnowledgeImportBatch(scope)).batchReview.status, "reviewed");
  assert.equal(service.calls().aiCalls, 0); assert.equal(service.calls().saves, 0);
});
test("cancellation or a concurrent snapshot change rejects the review result", async () => {
  const service = serviceFixture({ saveCount: 0 });
  await assert.rejects(service.reviewKnowledgeImportBatch(scope), /cambió/);
});

test("JSONB object key reordering does not invalidate an unchanged batch", () => {
  const f = fixture(); const result = applyImportBatchReview(f);
  const reorder = value => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value;
  const roundtrip = JSON.parse(JSON.stringify(reorder(result)));
  assert.doesNotThrow(() => assertReviewedImportBatch(roundtrip, f.files));
});
