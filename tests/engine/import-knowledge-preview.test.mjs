import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/import-knowledge-preview.service.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ role = "admin", owner = false, files = [{ id: "file-1", extracted_text: "Vainilla 2,80" }] } = {}) {
  const calls = { files: 0, definitions: 0, writes: 0 };
  const tx = {
    workspaces: {
      findFirst: async ({ where }) => {
        assert.equal(where.id, "workspace-1");
        assert.equal(where.status, "active");
        return { owner_user_id: owner ? "user-1" : "other",
          workspace_members: role ? [{ role }] : [] };
      },
    },
    knowledge_files: {
      findMany: async ({ where }) => {
        calls.files++;
        assert.deepEqual(Array.from(where.id.in), ["file-1"]);
        assert.equal(where.status, "ready");
        return files;
      },
    },
    engine_object_types: {
      findMany: async ({ where }) => {
        calls.definitions++;
        assert.equal(where.workspace_id, "workspace-1");
        return [{ id: "type-1", workspace_id: "workspace-1", status: "active",
          engine_field_definitions: [{ key: "price", field_type: "decimal",
            is_required: true, is_unique: false, status: "active", configuration: {} }] }];
      },
    },
  };
  const prisma = { $transaction: async (fn) => fn(tx) };
  const module = { exports: {} };
  let previewArgs;
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require(name) {
      if (name === "@/lib/prisma") return { prisma };
      if (name === "@/lib/knowledge/access-control") return {
        knowledgeSourceReadWhere: (userId, workspaceId) => {
          assert.equal(userId, "user-1");
          assert.equal(workspaceId, "workspace-1");
          return { scoped: true };
        },
      };
      if (name === "./import-typed-validation") return {
        validateTypedEngineImport: (args) => {
          previewArgs = args;
          return { accepted: args.candidates, issues: [] };
        },
      };
      throw new Error("Unexpected import " + name);
    },
  });
  return { preview: module.exports.previewEngineImportFromKnowledge,
    calls, getPreviewArgs: () => previewArgs };
}
const input = {
  workspaceId: "workspace-1", userId: "user-1", knowledgeFileIds: ["file-1"],
  candidates: [{ documentId: "file-1", objectTypeId: "type-1", fieldKey: "price",
    values: { price: "2.80" }, evidenceText: "Vainilla 2,80" }],
};

test("nonmembers cannot query documents or schemas", async () => {
  const { preview, calls } = setup({ role: null });
  await assert.rejects(preview(input), /owner or admin/);
  assert.equal(calls.files, 0);
  assert.equal(calls.definitions, 0);
});

test("regular members cannot preview import writes", async () => {
  const { preview, calls } = setup({ role: "member" });
  await assert.rejects(preview(input), /owner or admin/);
  assert.equal(calls.files, 0);
});

test("workspace owner can preview without a membership row", async () => {
  const { preview, getPreviewArgs } = setup({ role: null, owner: true });
  const result = await preview(input);
  assert.equal(result.accepted.length, 1);
  assert.equal(getPreviewArgs().documents[0].extractedText, "Vainilla 2,80");
  assert.equal(getPreviewArgs().definitions[0].fields[0].key, "price");
});

test("admin can preview using DB documents rather than caller text", async () => {
  const { preview, getPreviewArgs } = setup();
  await preview(input);
  assert.equal(getPreviewArgs().documents[0].workspaceId, "workspace-1");
  assert.equal(getPreviewArgs().documents[0].extractedText, "Vainilla 2,80");
});

test("missing or inaccessible file aborts preview", async () => {
  const { preview } = setup({ files: [] });
  await assert.rejects(preview(input), /inaccessible or not ready/);
});

test("batch limits reject oversized requests before database access", async () => {
  const { preview, calls } = setup();
  await assert.rejects(preview({ ...input, knowledgeFileIds: Array(101).fill("file-1") }), /batch limits/);
  assert.equal(calls.files, 0);
});
