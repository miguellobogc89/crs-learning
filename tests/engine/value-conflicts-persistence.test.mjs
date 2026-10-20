import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import crypto from "node:crypto";

const source = readFileSync(new URL("../../lib/engine/conflicts/persistence.service.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const candidate = () => ({
  subject: "Vainilla", attribute: "precio", context: "Tarifa octubre",
  alternatives: [
    { value: "2,50", evidence: [{ documentId: "a", quote: "Vainilla: 2,50 EUR" }] },
    { value: "2,80", evidence: [{ documentId: "b", quote: "Vainilla: 2,80 EUR" }] },
  ],
  status: "PENDING_REVIEW", scope: "AFFECTED_VALUE_ONLY",
});
const input = () => ({ workspaceId: "ws", userId: "owner", candidates: [candidate()] });
function setup({ owner = "owner", role = null, files = [
  { id: "a", extracted_text: "Vainilla: 2,50 EUR" },
  { id: "b", extracted_text: "Vainilla: 2,80 EUR" },
], valid = true, storedStatus = "pending_review" } = {}) {
  const calls = { upsert: [], find: [], validation: 0 };
  const tx = {
    workspaces: { findFirst: async () => owner === null ? null : ({
      owner_user_id: owner, workspace_members: role ? [{ role }] : [],
    }) },
    knowledge_files: { findMany: async () => files },
    engine_value_conflicts: {
      upsert: async (args) => {
        calls.upsert.push(args);
        return { id: "conflict-id", status: storedStatus };
      },
      findMany: async (args) => {
        calls.find.push(args);
        return [{ id: "conflict-id", status: "pending_review" }];
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require(name) {
      if (name === "node:crypto") return crypto;
      if (name === "@prisma/client") return { Prisma: {} };
      if (name === "@/lib/prisma") return { prisma: { $transaction: async (fn) => fn(tx) } };
      if (name === "@/lib/knowledge/access-control") return { knowledgeSourceReadWhere: () => ({}) };
      if (name === "./validation") return {
        validateValueConflicts: ({ candidates }) => {
          calls.validation++;
          return { valid, conflicts: valid ? candidates : [], issues: valid ? [] : [{ code: "INVALID_SHAPE" }] };
        },
      };
      throw new Error("Unexpected dependency: " + name);
    },
  });
  return { ...module.exports, calls };
}

test("stable fingerprint ignores alternative order", () => {
  const { valueConflictFingerprint } = setup();
  const a = candidate();
  const b = candidate();
  b.alternatives.reverse();
  assert.equal(valueConflictFingerprint(a), valueConflictFingerprint(b));
  assert.match(valueConflictFingerprint(a), /^[0-9a-f]{64}$/);
});

test("fingerprint distinguishes values and context", () => {
  const { valueConflictFingerprint: fingerprint } = setup();
  const a = candidate();
  const b = candidate(); b.alternatives[0].value = "3,00";
  const c = candidate(); c.context = "Tarifa noviembre";
  assert.notEqual(fingerprint(a), fingerprint(b));
  assert.notEqual(fingerprint(a), fingerprint(c));
});

test("persists validated evidence as pending, without modifying Engine records", async () => {
  const { persistReviewedValueConflictCandidates: persist, calls } = setup();
  const result = await persist(input());
  assert.equal(result.count, 1);
  assert.equal(result.stored[0].status, "pending_review");
  assert.equal(calls.upsert.length, 1);
  assert.equal(calls.upsert[0].create.scope, "affected_value_only");
  assert.equal(calls.upsert[0].create.alternatives_json.length, 2);
  assert.equal(Object.keys(calls.upsert[0].update).length, 0);
});

test("never reopens an already resolved conflict on duplicate detection", async () => {
  const { persistReviewedValueConflictCandidates: persist, calls } = setup({ storedStatus: "resolved" });
  const result = await persist(input());
  assert.equal(result.stored[0].status, "resolved");
  assert.equal(Object.keys(calls.upsert[0].update).length, 0);
});

test("rejects unauthorized writes before reading evidence", async () => {
  const { persistReviewedValueConflictCandidates: persist, calls } = setup({ owner: "someone-else" });
  await assert.rejects(persist(input()), /owner or admin/);
  assert.equal(calls.validation, 0);
  assert.equal(calls.upsert.length, 0);
});

test("workspace admins may persist", async () => {
  const { persistReviewedValueConflictCandidates: persist } = setup({ owner: "someone-else", role: "admin" });
  assert.equal((await persist(input())).count, 1);
});

test("missing evidence prevents persistence", async () => {
  const { persistReviewedValueConflictCandidates: persist, calls } = setup({ files: [{ id: "a", extracted_text: "Vainilla: 2,50 EUR" }] });
  await assert.rejects(persist(input()), /inaccessible/);
  assert.equal(calls.upsert.length, 0);
});

test("invalid evidence prevents persistence", async () => {
  const { persistReviewedValueConflictCandidates: persist, calls } = setup({ valid: false });
  await assert.rejects(persist(input()), /Invalid conflict evidence/);
  assert.equal(calls.upsert.length, 0);
});

test("pending conflict reads are workspace scoped and status filtered", async () => {
  const { listPendingValueConflicts: list, calls } = setup();
  const rows = await list({ workspaceId: "ws", userId: "owner" });
  assert.equal(rows.length, 1);
  assert.equal(calls.find[0].where.workspace_id, "ws");
  assert.equal(calls.find[0].where.status, "pending_review");
});

test("read access requires workspace membership", async () => {
  const { listPendingValueConflicts: list, calls } = setup({ owner: "someone-else" });
  await assert.rejects(list({ workspaceId: "ws", userId: "stranger" }), /membership/);
  assert.equal(calls.find.length, 0);
});
