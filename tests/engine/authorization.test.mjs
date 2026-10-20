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

const ORG = "org-a";
const USER = "user-a";

function mockedPrisma(membership) {
  const counters = { writes: 0, reads: 0 };
  const tx = {
    organization_members: {
      findUnique: async ({ where }) => {
        assert.equal(where.organization_id_user_id.organization_id, ORG);
        assert.equal(where.organization_id_user_id.user_id, USER);
        return membership;
      },
    },
    engine_object_types: {
      findFirst: async () => { counters.reads++; return { id: "object-a", schema_version: 1, engine_field_definitions: [] }; },
      create: async () => { counters.writes++; return {}; },
    },
    engine_records: {
      create: async () => { counters.writes++; return {}; },
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

const active = (role) => ({ role, status: "active", organizations: { status: "active" } });

test("nonmembers and inactive members cannot read records", async () => {
  for (const membership of [null, active("member"), { ...active("admin"), status: "inactive" }, { ...active("admin"), organizations: { status: "inactive" } }]) {
    const { prisma, counters } = mockedPrisma(membership);
    const { listEngineRecords } = loadService("../../lib/engine/records.service.ts", prisma);
    if (membership?.role === "member" && membership.status === "active") continue;
    await assert.rejects(listEngineRecords({ organizationId: ORG, userId: USER, objectTypeId: "object-a" }), (error) => error.code === "FORBIDDEN");
    assert.equal(counters.reads, 0);
  }
});

test("member cannot create records, definitions, or manual evidence", async () => {
  const { prisma, counters } = mockedPrisma(active("member"));
  const records = loadService("../../lib/engine/records.service.ts", prisma);
  const definitions = loadService("../../lib/engine/definitions.service.ts", prisma);
  const provenance = loadService("../../lib/engine/provenance.service.ts", prisma);
  await assert.rejects(records.createEngineDraftRecord({ organizationId: ORG, userId: USER, objectTypeId: "object-a", values: {} }), (e) => e.code === "FORBIDDEN");
  await assert.rejects(definitions.createEngineObjectType({ organizationId: ORG, userId: USER, key: "test", name: "Test" }), (e) => e.code === "FORBIDDEN");
  await assert.rejects(provenance.addEngineManualProvenance({ organizationId: ORG, userId: USER, recordId: "record-a", revision: 1 }), (e) => e.code === "FORBIDDEN");
  assert.equal(counters.writes, 0);
  assert.equal(counters.reads, 0);
});

test("admin passes authorization for a draft creation", async () => {
  const { prisma, counters } = mockedPrisma(active("admin"));
  const records = loadService("../../lib/engine/records.service.ts", prisma);
  await records.createEngineDraftRecord({ organizationId: ORG, userId: USER, objectTypeId: "object-a", values: {} });
  assert.equal(counters.writes, 1);
});
