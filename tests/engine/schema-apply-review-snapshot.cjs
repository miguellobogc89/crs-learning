/**
 * Persist a reviewed, hash-verified local snapshot. NO OpenAI call.
 *
 * Usage:
 * node tests/engine/schema-apply-review-snapshot.cjs <snapshotPath> <sha256> --approve-distinct=business,supplier --apply
 *
 * The --approve-distinct flag explicitly resolves only the business/supplier
 * semantic ambiguity in this test case. This script writes Engine definitions.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Module = require("node:module");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");
const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const [snapshotPath, expectedHash, decisionArg, applyArg] = process.argv.slice(2);
const allowedWorkspace = "9cb8b07f-7da2-4178-87bb-4e8e2f6d41d7";
const allowedUser = "ee893ecb-c740-4b93-a9d9-211e5c6f3f1c";
const allowedFiles = [
  "1f496a26-2997-4345-ba75-32dfd167d575",
  "6c011fc4-4202-46eb-87f0-79db19d4d30a",
  "c741c1be-03a0-47e3-bb63-c9848886b0ae",
].sort();
const allowedHash = "1111e707565aad14a7c558f22b7f1831757397c69c9412bc4c6dbbf3117a15ea";
const fail = (message) => { throw new Error(message); };
(async () => {
  let originalResolve;
  let originalTsLoader;
  try {
    if (expectedHash !== allowedHash || applyArg !== "--apply" ||
        decisionArg !== "--approve-distinct=business,supplier") {
      fail("Exact approved snapshot hash, semantic decision and --apply are required.");
    }
    const resolved = path.resolve(root, snapshotPath || "");
    const local = path.resolve(root, "tests", "engine", ".local");
    if (path.dirname(resolved) !== local ||
        path.basename(resolved) !== "schema-approval-" + allowedHash.slice(0, 16) + ".json") {
      fail("Snapshot must be the reviewed local file.");
    }
    const raw = fs.readFileSync(resolved);
    const actualHash = crypto.createHash("sha256").update(raw).digest("hex");
    if (actualHash !== allowedHash) fail("Snapshot contents changed after review.");
    const snapshot = JSON.parse(raw.toString("utf8"));
    if (snapshot.format !== "crs-schema-approval-snapshot-v1" ||
        snapshot.workspaceId !== allowedWorkspace ||
        snapshot.userId !== allowedUser ||
        JSON.stringify([...snapshot.knowledgeFileIds].sort()) !== JSON.stringify(allowedFiles)) {
      fail("Snapshot workspace, user or evidence files do not match the approved test case.");
    }
    const keys = snapshot.proposal.entities.map((entity) => entity.key);
    if (keys.length !== 6 || new Set(keys).size !== 6 ||
        !["business", "supplier", "product", "price_list", "price_list_item", "supply_item"]
          .every((key) => keys.includes(key)) ||
        JSON.stringify([...snapshot.selectedEntityKeys].sort()) !== JSON.stringify([...keys].sort())) {
      fail("Unexpected entity selection in snapshot.");
    }
    originalResolve = Module._resolveFilename;
    originalTsLoader = Module._extensions[".ts"];
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
        compilerOptions: {
          module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
        },
      }).outputText;
      mod._compile(code, filename);
    };
    const { applyHumanSemanticDecisions } =
      require("../../lib/engine/schema-discovery/human-semantic-decisions.ts");
    const { persistApprovedDiscoveredDefinitions } =
      require("../../lib/engine/schema-discovery/persist-approved.service.ts");
    const candidates = snapshot.semanticCandidates;
    if (!Array.isArray(candidates) || candidates.length !== 3 ||
        !candidates.some((item) => item.decision === "POSSIBLE_EQUIVALENCE" &&
          [item.leftEntity, item.rightEntity].sort().join("::") === "business::supplier")) {
      fail("Expected business/supplier ambiguity not found in original snapshot.");
    }
    const reviewed = applyHumanSemanticDecisions({
      aiCandidates: candidates,
      decisions: [{ leftEntity: "business", rightEntity: "supplier", decision: "DISTINCT" }],
    });
    if (reviewed.some((item) => item.decision !== "DISTINCT")) {
      fail("Other unresolved semantic ambiguities remain.");
    }
    const result = await persistApprovedDiscoveredDefinitions({
      workspaceId: snapshot.workspaceId,
      userId: snapshot.userId,
      proposal: snapshot.proposal,
      semanticCandidates: reviewed,
      selectedEntityKeys: snapshot.selectedEntityKeys,
    });
    if (result.count !== 6) fail("Unexpected number of created entities.");
    console.log(JSON.stringify({
      ok: true, snapshotSha256: actualHash,
      created: result.created, deferredRelations: result.deferredRelations,
      note: "Approved definitions persisted; no relations or business records created.",
    }, null, 2));
  } catch (error) {
    console.error("Snapshot approval failed:",
      error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  } finally {
    try { await require("../../lib/prisma.ts").prisma.$disconnect(); } catch {}
    if (originalResolve) Module._resolveFilename = originalResolve;
    if (originalTsLoader) Module._extensions[".ts"] = originalTsLoader;
    else if (originalResolve) delete Module._extensions[".ts"];
  }
})();
