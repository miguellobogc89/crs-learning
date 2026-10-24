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
const validation = load("../../lib/engine/validation.ts");
const editor = load("../../lib/engine/record-editor.ts");
const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const fields = [
  { key: "name", name: "Nombre", field_type: "text", is_required: true, is_unique: false, status: "active" },
  { key: "amount", name: "Importe", field_type: "decimal", is_required: false, is_unique: false, status: "active" },
  { key: "identity", name: "Identidad", field_type: "text", is_required: false, is_unique: true, status: "active" },
];
function harness({ member = "owner", status = "draft", revision = 1 } = {}) {
  let rows = [{ id, workspace_id: "ws", object_type_id: "type", status, revision, schema_version: 1,
    external_key: "source-identity", values_json: { name: "Antes", amount: "2.50", identity: "stable" } },
    { id: otherId, workspace_id: "another-ws", object_type_id: "type", status: "draft", revision: 1, values_json: {} }];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(condition => matches(row, condition));
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
  const tx = {
    workspaces: { async findFirst() { return { owner_user_id: "owner", workspace_members: member === "none" ? [] : [{ role: member }] }; } },
    engine_object_types: { async findFirst() { return { id: "type", schema_version: 1, engine_field_definitions: fields }; } },
    engine_records: {
      async findFirst({ where }) { return structuredClone(rows.find(row => matches(row, where)) ?? null); },
      async findFirstOrThrow({ where }) { const row = rows.find(row => matches(row, where)); if (!row) throw new Error("Missing"); return row; },
      async findMany({ where }) { return rows.filter(row => matches(row, where)); },
      async updateMany({ where, data }) {
        const found = rows.filter(row => matches(row, where));
        found.forEach(row => Object.assign(row, data, { revision: row.revision + data.revision.increment }));
        return { count: found.length };
      },
    },
  };
  const prisma = { async $transaction(fn) {
    const before = structuredClone(rows);
    try { return await fn(tx); } catch (error) { rows = before; throw error; }
  } };
  const api = load("../../lib/engine/records.service.ts", {
    "@prisma/client": { Prisma: {} }, "@/lib/prisma": { prisma },
    "@/lib/engine/validation": validation,
  });
  return { ...api, rows: () => structuredClone(rows) };
}
const scope = { workspaceId: "ws", userId: "owner" };
test("manual correction persists typed values and increases revision", async () => {
  const h = harness();
  await h.updateEngineRecord({ ...scope, recordId: id, expectedRevision: 1,
    values: { name: "Después", amount: "3.75", identity: "stable" } });
  const row = h.rows()[0];
  assert.equal(row.values_json.name, "Después"); assert.equal(row.values_json.amount, "3.75");
  assert.equal(row.revision, 2); assert.equal(row.updated_by_user_id, "owner");
  assert.equal(row.status, "draft");
});
test("active correction preserves publication status; draft-only callers remain restricted", async () => {
  const h = harness({ status: "active" });
  await assert.rejects(h.updateEngineDraftRecord({ ...scope, recordId: id, expectedRevision: 1, values: h.rows()[0].values_json }), /estado/);
  await h.updateEngineRecord({ ...scope, recordId: id, expectedRevision: 1, values: { ...h.rows()[0].values_json, name: "Nuevo" } });
  assert.equal(h.rows()[0].status, "active");
});
test("stale updates never overwrite a newer record", async () => {
  const h = harness({ revision: 2 });
  await assert.rejects(h.updateEngineRecord({ ...scope, recordId: id, expectedRevision: 1, values: { name: "stale" } }), error => error.code === "CONFLICT");
  assert.equal(h.rows()[0].values_json.name, "Antes");
});
test("server rejects identity changes, malformed values and archived edits", async () => {
  const h = harness();
  await assert.rejects(h.updateEngineRecord({ ...scope, recordId: id, expectedRevision: 1, values: { name: "Nuevo", identity: "changed" } }), error => error.code === "UNSUPPORTED");
  await assert.rejects(h.updateEngineRecord({ ...scope, recordId: id, expectedRevision: 1, values: { name: "", identity: "stable" } }), error => error.code === "INVALID");
  const archived = harness({ status: "archived" });
  await assert.rejects(archived.updateEngineRecord({ ...scope, recordId: id, expectedRevision: 1, values: {} }), error => error.code === "INVALID");
});
test("delete archives in DB, frees identity and hides the row from the table", async () => {
  const h = harness();
  await h.deleteEngineRecords({ ...scope, records: [{ id, revision: 1 }] });
  const row = h.rows()[0];
  assert.equal(row.status, "archived"); assert.equal(row.external_key, null); assert.equal(row.revision, 2);
  assert.equal(row.values_json.name, "Antes");
  const visible = await h.listEngineRecords({ ...scope, objectTypeId: "type" });
  assert.equal(visible.length, 0);
});
test("bulk deletion rolls back if any row belongs to another workspace", async () => {
  const h = harness();
  await assert.rejects(h.deleteEngineRecords({ ...scope, records: [{ id, revision: 1 }, { id: otherId, revision: 1 }] }), error => error.code === "CONFLICT");
  assert.equal(h.rows()[0].status, "draft"); assert.equal(h.rows()[0].external_key, "source-identity");
});
test("members cannot edit or delete by calling the server directly", async () => {
  const h = harness({ member: "member" }); const scope = { workspaceId: "ws", userId: "member" };
  await assert.rejects(h.deleteEngineRecords({ ...scope, records: [{ id, revision: 1 }] }), error => error.code === "FORBIDDEN");
  await assert.rejects(h.updateEngineRecord({ ...scope, recordId: id, expectedRevision: 1, values: {} }), error => error.code === "FORBIDDEN");
  assert.equal(h.rows()[0].revision, 1);
});
test("stale or duplicate deletions cannot partially delete a selection", async () => {
  const h = harness({ revision: 2 });
  await assert.rejects(h.deleteEngineRecords({ ...scope, records: [{ id, revision: 1 }] }), error => error.code === "CONFLICT");
  await assert.rejects(h.deleteEngineRecords({ ...scope, records: [{ id, revision: 2 }, { id, revision: 2 }] }), error => error.code === "INVALID");
  assert.equal(h.rows()[0].status, "draft");
});
test("editor preserves untouched types and parses decimal comma without rounding", () => {
  const original = { name: "Antes", amount: 3.25, enabled: false, extra: { a: 1 } };
  const value = editor.parseEngineEditorChanges(original, { name: "Ahora", amount: "1234,567890" }, fields);
  assert.equal(value.amount, "1234.567890"); assert.equal(value.enabled, false); assert.deepEqual(value.extra, { a: 1 });
  assert.throws(() => editor.parseEngineEditorChanges(original, { amount: "bad" }, fields), /decimal/);
  assert.throws(() => editor.parseEngineEditorChanges(original, { identity: "new" }, fields), /edición/);
});
