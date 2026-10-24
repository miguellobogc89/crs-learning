import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, dependencies) {
  const module = { exports: {} };
  const js = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", js)(name => {
    if (name in dependencies) return dependencies[name];
    throw new Error("Unexpected dependency " + name);
  }, module, module.exports);
  return module.exports;
}
const formats = load("../../lib/knowledge/import/supported-formats.ts", {});
const XLSX = require("xlsx");
let visionCalls = 0;
const extractor = load("../../lib/knowledge/documents/extract-document-text.ts", {
  "node:path": require("node:path"), xlsx: XLSX,
  officeparser: { parseOffice() { throw new Error("Unexpected Office extraction"); } },
  "@/lib/knowledge/import/supported-formats": formats,
  "@/lib/knowledge/documents/document-ingestion.service": {
    async ingestDocument() { visionCalls++; return { text: "PDF source with page markers" }; },
  },
});
test("shared extractor preserves worksheets, row order and empty cells", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Producto", "Cantidad", "Precio"], ["Leche", 2, 3], ["Nata", null, 5],
  ]), "Productos");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Total", 11]]), "Resumen");
  const result = await extractor.extractDocumentText(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), "datos.xlsx");
  assert.equal(result, "# Hoja: Productos\nProducto | Cantidad | Precio\nLeche | 2 | 3\nNata |  | 5\n\n# Hoja: Resumen\nTotal | 11");
});
test("PDF uses the shared ingestion once and preserves its evidence text", async () => {
  assert.equal(await extractor.extractDocumentText(Buffer.from("pdf"), "Factura.PDF"), "PDF source with page markers");
  assert.equal(visionCalls, 1);
});
test("plain text is retained without summarization and unsupported files fail", async () => {
  assert.equal(await extractor.extractDocumentText(Buffer.from("a;b\n1;2"), "datos.csv"), "a;b\n1;2");
  await assert.rejects(extractor.extractDocumentText(Buffer.from("x"), "bad.exe"), /Formato/);
});
function harness({ files, claim = 1 }) {
  let extractions = 0;
  let claimedWhere;
  const imports = {
    async findUnique() { return { id: "import", status: "text_ready", processing_status: "completed", updated_at: new Date(0), knowledge_import_files: files }; },
    async updateMany(args) { if (args.data.status === "text_processing") { claimedWhere = args.where; return { count: claim }; } return { count: 1 }; },
    async update() { return {}; },
  };
  const prisma = { knowledge_imports: imports,
    knowledge_import_files: { async update() { return {}; } },
    async $transaction(promises) { return Promise.all(promises); },
  };
  const api = load("../../lib/knowledge/import/process-import-text.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/storage/knowledge-storage": { async readKnowledgeFile() { return Buffer.from("source"); } },
    "@/lib/knowledge/documents/extract-document-text": { async extractDocumentText() { extractions++; return "Source text"; } },
  });
  return { ...api, extractions: () => extractions, where: () => claimedWhere };
}
const file = (id, status) => ({ id, file_name: id + ".txt", relative_path: id + ".txt", status,
  processing_status: status === "text_ready" ? "completed" : "error", extracted_text: status === "text_ready" ? "Done" : "", storage_path: "source" });
test("replaying completed files does not extract again", async () => {
  const h = harness({ files: [file("done", "text_ready")] });
  const result = await h.processImportText("import");
  assert.equal(result.successfulFiles, 1);
  assert.equal(h.extractions(), 0);
});
test("losing the atomic claim cannot invoke extraction", async () => {
  const h = harness({ files: [file("retry", "text_error")], claim: 0 });
  await assert.rejects(h.processImportText("import"), h.ImportTextConflictError);
  assert.equal(h.extractions(), 0);
  assert.deepEqual(h.where().processing_status.notIn, ["cancelled", "processing"]);
});
test("batch retry counts recovered failures once", async () => {
  const h = harness({ files: [file("done", "text_ready"), file("retry", "text_error")] });
  const result = await h.processImportText("import");
  assert.equal(result.successfulFiles, 2);
  assert.equal(result.failedFiles, 0);
  assert.equal(h.extractions(), 1);
});
test("single-file retry retains other files' failures", async () => {
  const h = harness({ files: [file("retry", "text_error"), file("other", "text_error")] });
  const result = await h.processImportText("import", "retry");
  assert.equal(result.successfulFiles, 1);
  assert.equal(result.failedFiles, 1);
  assert.equal(h.extractions(), 1);
});
