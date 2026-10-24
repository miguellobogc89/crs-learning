import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
function load(path, dependencies = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", js)(name => {
    if (name in dependencies) return dependencies[name];
    throw new Error("Unexpected dependency " + name);
  }, module, module.exports);
  return module.exports;
}
const access = load("../../lib/knowledge/access-control.ts");
const id = "00000000-0000-4000-8000-000000000001";
const id2 = "00000000-0000-4000-8000-000000000002";
const folderId = "00000000-0000-4000-8000-000000000003";
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every(item => matches(row, item));
    if (key === "OR") return value.some(item => matches(row, item));
    if (key === "NOT") return !matches(row, value);
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
      return row[key] && matches(row[key], value);
    }
    return row[key] === value;
  });
}
function harness({ foreign = false, fail = false, folders = false } = {}) {
  let sources = [id, id2].map((id, index) => ({ id, owner_user_id: foreign && index === 1 ? "other" : "user",
    status: "published", library_id: folderId, knowledge_libraries: { workspace_id: "ws" },
    knowledge_files: [{ id: "file" + index, status: "ready" }] }));
  let files = sources.flatMap(source => source.knowledge_files.map(file => ({ ...file, knowledge_source_id: source.id })));
  let libraries = folders ? [{ id: folderId, parent_id: null, workspace_id: "ws", owner_user_id: "user" }] : [];
  const mutations = [];
  const tx = {
    knowledge_sources: {
      async findMany({ where }) { return sources.filter(row => matches(row, where)); },
      async count({ where }) { return sources.filter(row => matches(row, where)).length; },
      async updateMany({ where, data }) {
        mutations.push("sources"); const found = sources.filter(row => matches(row, where));
        if (fail) return { count: 0 };
        found.forEach(row => Object.assign(row, data)); return { count: found.length };
      },
    },
    knowledge_files: {
      async findFirst({ where }) { return files.find(row => matches({ ...row, knowledge_sources: sources.find(source => source.id === row.knowledge_source_id) }, where)); },
      async update({ where, data }) { Object.assign(files.find(row => row.id === where.id), data); mutations.push("file"); },
      async updateMany({ where, data }) { const found = files.filter(row => matches(row, where)); found.forEach(row => Object.assign(row, data)); mutations.push("files"); return { count: found.length }; },
    },
    knowledge_analysis: { async updateMany() { mutations.push("analysis"); } },
    knowledge_libraries: {
      async findMany({ where }) { return libraries.filter(row => matches(row, where)); },
      async count({ where }) { return libraries.filter(row => matches(row, where)).length; },
      async deleteMany({ where }) { libraries = libraries.filter(row => !matches(row, where)); },
    },
    // No Engine mutation or filesystem operation is provided: deleting a
    // document must retain those references rather than break their history.
  };
  const prisma = { async $transaction(fn) {
    const before = structuredClone({ sources, files, libraries });
    try { return await fn(tx); } catch (error) { ({ sources, files, libraries } = before); throw error; }
  } };
  const api = load("../../lib/knowledge/delete-knowledge.service.ts", { "@/lib/prisma": { prisma }, "./access-control": access });
  return { ...api, snapshot: () => structuredClone({ sources, files, libraries }), mutations };
}
const scope = { userId: "user", workspaceId: "ws" };
test("single source deletion hides source and files without deleting Engine citations", async () => {
  const h = harness(); await h.deleteKnowledgeSelection({ ...scope, sourceIds: [id] });
  assert.equal(h.snapshot().sources[0].status, "deleted");
  assert.equal(h.snapshot().files[0].status, "deleted");
  assert.equal(h.snapshot().sources[1].status, "published");
  assert.equal(h.snapshot().sources[0].knowledge_files[0].id, "file0");
});
test("bulk deletion persists every selected source and its files atomically", async () => {
  const h = harness(); await h.deleteKnowledgeSelection({ ...scope, sourceIds: [id, id2] });
  assert.ok(h.snapshot().sources.every(source => source.status === "deleted"));
  assert.ok(h.snapshot().files.every(file => file.status === "deleted"));
});
test("foreign ownership rejects the full selection before any mutation", async () => {
  const h = harness({ foreign: true });
  await assert.rejects(h.deleteKnowledgeSelection({ ...scope, sourceIds: [id, id2] }), /permiso/);
  assert.equal(h.mutations.length, 0);
  assert.ok(h.snapshot().sources.every(source => source.status === "published"));
});
test("another workspace cannot delete a source", async () => {
  const h = harness();
  await assert.rejects(h.deleteKnowledgeSelection({ ...scope, workspaceId: "other", sourceIds: [id] }), /permiso/);
  assert.equal(h.mutations.length, 0);
});
test("a concurrent source change rolls back the already updated file statuses", async () => {
  const h = harness({ fail: true });
  await assert.rejects(h.deleteKnowledgeSelection({ ...scope, sourceIds: [id] }), /cambió/);
  assert.equal(h.snapshot().files[0].status, "ready");
});
test("file deletion retains the file row and marks its article stale", async () => {
  const h = harness(); await h.deleteKnowledgeDocumentFile({ ...scope, fileId: "file0" });
  assert.equal(h.snapshot().files[0].status, "deleted");
  assert.equal(h.snapshot().sources[0].status, "stale");
  assert.ok(h.mutations.includes("analysis"));
});
test("deleting a folder retains tombstones with no live library reference", async () => {
  const h = harness({ folders: true });
  await h.deleteKnowledgeSelection({ ...scope, sourceIds: [], folderIds: [folderId] });
  assert.equal(h.snapshot().libraries.length, 0);
  assert.ok(h.snapshot().sources.every(source => source.status === "deleted" && source.library_id === null));
});
test("a folder containing another owner's active document cannot be removed", async () => {
  const h = harness({ folders: true, foreign: true });
  await assert.rejects(h.deleteKnowledgeSelection({ ...scope, sourceIds: [], folderIds: [folderId] }), /otro propietario/);
  assert.equal(h.mutations.length, 0);
});
test("duplicate lookup excludes deleted sources and deleted file rows before hashing", async () => {
  let queried = false;
  const api = load("../../lib/knowledge/import/pipeline/load-existing-documents.ts", {
    "@/lib/prisma": { prisma: { knowledge_files: { async findMany({ where }) {
      queried = true; assert.equal(where.status.not, "deleted"); assert.equal(where.knowledge_sources.status.not, "deleted"); return [];
    } } } },
    "@/lib/storage/knowledge-storage": { async readKnowledgeFile() { throw new Error("Must not read deleted originals"); } },
    "./detect-duplicates": { calculateKnowledgeFileHash() { throw new Error("Unexpected hash"); } },
  });
  const result = await api.loadExistingKnowledgeDocuments({ ownerUserId: "user", workspaceId: "ws", candidates: [{ fileSize: 10 }] });
  assert.equal(queried, true); assert.equal(result.documents.length, 0);
});
