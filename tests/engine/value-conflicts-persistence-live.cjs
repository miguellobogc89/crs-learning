/**
 * Opt-in Neon integration smoke test: creates one real, evidence-backed pending
 * conflict, repeats persistence, reads it and checks idempotency.
 * No AI calls; does not modify engine_records or resolve existing conflicts.
 *
 * Usage: node tests/engine/value-conflicts-persistence-live.cjs <workspaceId> <userId> <fileIdA> <fileIdB>
 * Both files must contain different literal "Vainilla: <price> EUR" lines.
 */
const path = require("node:path");
const Module = require("node:module");
const fs = require("node:fs");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const [workspaceId, userId, fileIdA, fileIdB] = process.argv.slice(2);
if (!workspaceId || !userId || !fileIdA || !fileIdB || fileIdA === fileIdB ||
    process.argv.length !== 6) {
  console.error("Usage: node tests/engine/value-conflicts-persistence-live.cjs <workspaceId> <userId> <fileIdA> <fileIdB>");
  process.exitCode = 2;
} else {
  const originalResolve = Module._resolveFilename;
  const originalTsLoader = Module._extensions[".ts"];
  Module._resolveFilename = function (request, parent, ...rest) {
    if (request.startsWith("@/")) {
      const localPath = path.join(root, request.slice(2));
      if (fs.existsSync(localPath + ".ts")) return localPath + ".ts";
      if (fs.existsSync(localPath + ".js")) return localPath + ".js";
    }
    return originalResolve.call(this, request, parent, ...rest);
  };
  Module._extensions[".ts"] = (mod, filename) => {
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    mod._compile(code, filename);
  };

  (async () => {
    try {
      const { prisma } = require("../../lib/prisma.ts");
      const { persistReviewedValueConflictCandidates, listPendingValueConflicts } =
        require("../../lib/engine/conflicts/persistence.service.ts");
      // Read source snippets only to construct a valid candidate. Persistence
      // service independently rechecks authorization and source text.
      const docs = await prisma.knowledge_files.findMany({
        where: { id: { in: [fileIdA, fileIdB] }, status: "ready" },
        select: { id: true, extracted_text: true },
      });
      assert.equal(docs.length, 2, "Both source documents must exist and be ready");
      const alternatives = [fileIdA, fileIdB].map((id) => {
        const doc = docs.find((d) => d.id === id);
        const match = doc.extracted_text.match(/Vainilla:\s*([0-9]+[,.][0-9]+)\s*EUR/i);
        assert.ok(match, "Missing vanilla price in source " + id);
        return { value: match[1], evidence: [{ documentId: id, quote: match[0] }] };
      });
      assert.notEqual(alternatives[0].value, alternatives[1].value, "Source values must differ");
      const candidate = {
        subject: "HELADERIA NIEVE AZUL",
        attribute: "Vainilla price",
        context: "Tarifa octubre 2026",
        alternatives,
        status: "PENDING_REVIEW",
        scope: "AFFECTED_VALUE_ONLY",
      };
      const request = { workspaceId, userId, candidates: [candidate] };
      const first = await persistReviewedValueConflictCandidates(request);
      const second = await persistReviewedValueConflictCandidates(request);
      assert.equal(first.count, 1);
      assert.equal(second.count, 1);
      assert.equal(first.stored[0].id, second.stored[0].id, "Duplicate persistence created a new row");
      const row = await prisma.engine_value_conflicts.findFirst({
        where: { workspace_id: workspaceId, id: first.stored[0].id },
      });
      assert.ok(row);
      assert.equal(row.scope, "affected_value_only");
      assert.equal(row.alternatives_json.length, 2);
      const pending = await listPendingValueConflicts({ workspaceId, userId });
      if (row.status === "pending_review") {
        assert.ok(pending.some((item) => item.id === row.id), "Pending conflict not visible");
      } else {
        assert.ok(!pending.some((item) => item.id === row.id), "Resolved conflict reappeared as pending");
      }
      console.log(JSON.stringify({
        ok: true,
        id: row.id,
        status: row.status,
        alternatives: row.alternatives_json,
        idempotent: first.stored[0].id === second.stored[0].id,
        pendingCountInPage: pending.length,
        note: "No Engine records were modified; this test writes one conflict row if absent.",
      }, null, 2));
    } catch (error) {
      console.error("Live persistence test failed:", error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      try { await require("../../lib/prisma.ts").prisma.$disconnect(); } catch {}
      Module._resolveFilename = originalResolve;
      if (originalTsLoader) Module._extensions[".ts"] = originalTsLoader;
      else delete Module._extensions[".ts"];
    }
  })();
}
