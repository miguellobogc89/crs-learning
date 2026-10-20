import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import ts from "typescript";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function load(path, dependencies) {
  const source = readFileSync(new URL("../../lib/" + path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require(name) {
      if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name);
      return dependencies[name];
    },
  }, { filename: path });
  return module.exports;
}
const validation = load("engine/validation.ts", {});
const preflight = load("engine/import-preflight.ts", {});
const typed = load("engine/import-typed-validation.ts", {
  "./validation": validation, "./import-preflight": preflight,
});
const access = load("knowledge/access-control.ts", {});
const { previewEngineImportFromKnowledge: preview } = load(
  "engine/import-knowledge-preview.service.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/knowledge/access-control": access,
    "./import-typed-validation": typed,
  },
);

test("real Prisma preview enforces workspace ownership and reads existing data", async (t) => {
  const workspace = await prisma.workspaces.findFirst({
    where: { status: "active", owner_user_id: { not: null } },
    select: { id: true, owner_user_id: true },
    orderBy: { created_at: "desc" },
  });
  if (!workspace?.owner_user_id) {
    t.skip("No active personal workspace in this database.");
    return;
  }

  const file = await prisma.knowledge_files.findFirst({
    where: {
      status: "ready",
      knowledge_sources: {
        owner_user_id: workspace.owner_user_id,
        knowledge_libraries: { workspace_id: workspace.id },
      },
    },
    select: { id: true },
  });
  const input = {
    workspaceId: workspace.id,
    userId: workspace.owner_user_id,
    knowledgeFileIds: file ? [file.id] : [],
    candidates: [],
  };

  const result = await preview(input);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.issues.length, 0);
  console.log(file ? "Authorized real Knowledge file read OK." :
    "No owned ready Knowledge file: checked real Prisma schema and workspace permissions.");

  await assert.rejects(
    preview({ ...input, userId: randomUUID() }),
    /Workspace owner or admin required/,
  );
});

test.after(async () => {
  await prisma.$disconnect();
  await pool.end();
});
