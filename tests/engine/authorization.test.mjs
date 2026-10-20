import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadService(path, prisma) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require(name) {
      if (name === "@/lib/prisma") return { prisma };
      if (name === "@/lib/engine/validation") return { validateEngineRecordValues: () => ({ ok: true, values: {} }) };
      if (name === "@/lib/knowledge/access-control") return { knowledgeSourceReadWhere: () => ({}) };
      if (name === "@prisma/client") return {};
      throw new Error("Unexpected dependency: " + name);
    },
  }, { filename: path });
  return module.exports;
}

const WORKSPACE = "workspace-a";
const USER = "user-a";

function mockedPrisma(membership, owner = false) {
  const counters = { writes: 0, reads: 0 };
  const tx = {
    workspaces: {
      findFirst: async ({ where }) => {
        assert.equal(where.id, WORKSPACE);
        if (!membership && !owner) return null;
        return {
          owner_user_id: owner ? USER : "other-user",
          workspace_members: membership ? [membership] : [],
        };
      },
    },
    engine_object_types: {
      findFirst: async () => { counters.reads++; return { id: "object-a", schema_version: 1, engine_field_definitions: [] }; },
      create: async () => { counters.writes++; return {}; },
    },
    engine_records: {
      create: async () => { counters.writes++; return {}; },
      findMany: async () => { counters.reads++; return []; },
      findFirst: async () => { counters.reads++; return { id: "record-a" }; },
    },
    engine_record_revisions: {
      findFirst: async () => { counters.reads++; return { record_id: "record-a", values_json: {} }; },
    },
    engine_record_provenance: {
      create: async () => { counters.writes++; return {}; },
    },
  };
  return { prisma: { $transaction: async (callback) => callback(tx) }, counters };
}

const active = (role) => ({ role });

test("nonmembers cannot read records", async () => {
  const { prisma, counters } = mockedPrisma(null);
  const { listEngineRecords } = loadService("../../lib/engine/records.service.ts", prisma);
  await assert.rejects(listEngineRecords({ workspaceId: WORKSPACE, userId: USER, objectTypeId: "object-a" }), (e) => e.code === "FORBIDDEN");
  assert.equal(counters.reads, 0);
});

test("member can read but cannot create records, definitions or evidence", async () => {
  const { prisma, counters } = mockedPrisma(active("member"));
  const records = loadService("../../lib/engine/records.service.ts", prisma);
  const definitions = loadService("../../lib/engine/definitions.service.ts", prisma);
  const provenance = loadService("../../lib/engine/provenance.service.ts", prisma);
  await records.listEngineRecords({ workspaceId: WORKSPACE, userId: USER, objectTypeId: "object-a" });
  await assert.rejects(records.createEngineDraftRecord({ workspaceId: WORKSPACE, userId: USER, objectTypeId: "object-a", values: {} }), (e) => e.code === "FORBIDDEN");
  await assert.rejects(definitions.createEngineObjectType({ workspaceId: WORKSPACE, userId: USER, key: "test", name: "Test" }), (e) => e.code === "FORBIDDEN");
  await assert.rejects(provenance.addEngineManualProvenance({ workspaceId: WORKSPACE, userId: USER, recordId: "record-a", revision: 1 }), (e) => e.code === "FORBIDDEN");
  assert.equal(counters.writes, 0);
});

test("workspace admin can create a draft record", async () => {
  const { prisma, counters } = mockedPrisma(active("admin"));
  const records = loadService("../../lib/engine/records.service.ts", prisma);
  await records.createEngineDraftRecord({ workspaceId: WORKSPACE, userId: USER, objectTypeId: "object-a", values: {} });
  assert.equal(counters.writes, 1);
});

test("personal workspace owner can create without organization", async () => {
  const { prisma, counters } = mockedPrisma(null, true);
  const records = loadService("../../lib/engine/records.service.ts", prisma);
  await records.createEngineDraftRecord({ workspaceId: WORKSPACE, userId: USER, objectTypeId: "object-a", values: {} });
  assert.equal(counters.writes, 1);
});
