import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(path.join(root, "app/api/knowledge/import/[importId]/analyze/route.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup() {
  const calls = { prepare: 0, restore: null };
  const imported = {
    id: "import-1",
    owner_user_id: "user-1",
    status: "error",
    processing_status: "error",
    upload_type: "zip",
    knowledge_import_files: [
      { id: "original-1", status: "uploaded" },
      { id: "derived-1", status: "text_ready", processing_status: "completed", processing_order: 1,
        file_name: "factura.pdf", relative_path: "factura.pdf", file_size: 120, mime_type: "application/pdf",
        processing_step: "completed", error_message: null },
      { id: "derived-2", status: "text_error", processing_status: "error", processing_order: 2,
        file_name: "manual.pdf", relative_path: "manual.pdf", file_size: 80, mime_type: "application/pdf",
        processing_step: "extracting", error_message: "OCR temporal" },
    ],
  };
  const module = { exports: {} };
  const dependencies = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/auth": { auth: async () => ({ user: { id: "user-1" } }) },
    "@/lib/services/workspace.service": { getActiveWorkspaceContext: async () => ({ activeWorkspace: { id: "workspace-1" } }) },
    "@/lib/prisma": { prisma: { knowledge_imports: {
      findFirst: async () => imported,
      updateMany: async ({ data }) => {
        calls.restore = data;
        return { count: 1 };
      },
    } } },
    "@/lib/knowledge/import/pipeline/detect-duplicates": { calculateKnowledgeFileHash: () => "hash" },
    "@/lib/knowledge/import/pipeline/duplicate-selection": { resolveDuplicateSelection: () => ({}) },
    "@/lib/knowledge/import/pipeline/build-processing-queue": { buildKnowledgeProcessingQueue: () => { throw Error("must not rebuild queue"); } },
    "@/lib/knowledge/import/pipeline/prepare-analysis": { prepareKnowledgeImportAnalysis: async () => { calls.prepare++; throw Error("must not re-expand ZIP"); } },
    "@/lib/storage/knowledge-storage": { deleteKnowledgeFile: async () => {}, uploadKnowledgeFile: async () => "path" },
  };
  new Function("require", "module", "exports", compiled)(
    name => {
      if (!(name in dependencies)) throw Error("Unexpected dependency: " + name);
      return dependencies[name];
    },
    module,
    module.exports,
  );
  return { post: module.exports.POST, calls };
}

test("reanalyzing an import reuses extracted ZIP entries and already verified text", async () => {
  const { post, calls } = setup();
  const response = await post(new Request("https://example.test"), {
    params: Promise.resolve({ importId: "import-1" }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.fileCount, 2);
  assert.equal(body.completedFiles, 1);
  assert.equal(body.failedFiles, 1);
  assert.deepEqual(body.files.map(file => file.id), ["derived-1", "derived-2"]);
  assert.equal(calls.prepare, 0);
  assert.equal(calls.restore.status, "extracted");
  assert.equal(calls.restore.processing_status, "pending");
});
