/** Read-only preview of a supply_item draft extracted from the existing fixture. */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");
const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const workspaceId = "9cb8b07f-7da2-4178-87bb-4e8e2f6d41d7";
const userId = "ee893ecb-c740-4b93-a9d9-211e5c6f3f1c";
const documentId = "c741c1be-03a0-47e3-bb63-c9848886b0ae";
const objectTypeId = "d8c726d2-4394-40fb-b290-afbfae478532";
const candidate = {
  objectTypeId, documentId, fieldKey: "unit_price",
  evidenceText: "Precio por litro: 1,20 EUR\nPedido minimo: 40 litros\nEntrega: martes y viernes.",
  values: {
    unit: "litro", unit_price: "1.20", currency: "EUR",
    min_order_quantity: 40, min_order_unit: "litros",
    delivery_days_text: "martes y viernes",
  },
};
if (process.argv.length !== 2) {
  console.error("This is a read-only preview. No arguments accepted.");
  process.exit(1);
}
const oldResolve = Module._resolveFilename;
const oldLoader = Module._extensions[".ts"];
Module._resolveFilename = function(request, parent, ...rest) {
  if (request.startsWith("@/")) {
    const local = path.join(root, request.slice(2));
    if (fs.existsSync(local + ".ts")) return local + ".ts";
  }
  return oldResolve.call(this, request, parent, ...rest);
};
Module._extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText, filename);
};
(async () => {
  let prisma;
  try {
    ({ prisma } = require("../../lib/prisma.ts"));
    const { knowledgeSourceReadWhere } = require("../../lib/knowledge/access-control.ts");
    const { validateTypedEngineImport } = require("../../lib/engine/import-typed-validation.ts");
    const { extractionObservationKey } = require("../../lib/engine/import-observation-identity.ts");
    const [workspace, document, definition] = await Promise.all([
      prisma.workspaces.findFirst({
        where: { id: workspaceId, status: "active" },
        select: { owner_user_id: true, workspace_members: {
          where: { user_id: userId, status: "active" }, select: { role: true },
        } },
      }),
      prisma.knowledge_files.findFirst({
        where: { id: documentId, status: "ready",
          knowledge_sources: knowledgeSourceReadWhere(userId, workspaceId) },
        select: { id: true, extracted_text: true },
      }),
      prisma.engine_object_types.findFirst({
        where: { id: objectTypeId, workspace_id: workspaceId, status: "active" },
        include: { engine_field_definitions: { where: { status: "active" } } },
      }),
    ]);
    const role = workspace?.workspace_members[0]?.role;
    if (!workspace || (workspace.owner_user_id !== userId &&
        !["owner", "admin"].includes(role ?? ""))) {
      throw new Error("Workspace owner or admin required.");
    }
    if (!document || !definition) throw new Error("Evidence or type unavailable.");
    const validation = validateTypedEngineImport({
      workspaceId, candidates: [candidate],
      documents: [{ id: document.id, workspaceId, extractedText: document.extracted_text }],
      definitions: [{
        id: definition.id, workspaceId, status: definition.status,
        fields: definition.engine_field_definitions,
      }],
    });
    const observationKey = extractionObservationKey({ workspaceId, candidate });
    const existing = await prisma.engine_records.findFirst({
      where: { workspace_id: workspaceId, object_type_id: objectTypeId,
        external_key: observationKey },
      select: { id: true, status: true, revision: true },
    });
    console.log(JSON.stringify({
      ok: validation.issues.length === 0, mode: "READ_ONLY",
      status: validation.issues.length ? "HELD" : "READY_FOR_EXPLICIT_REVIEW",
      candidate, observationKey, existing, issues: validation.issues,
      note: "No record or relation written. Supplier/product links require separate human review.",
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect();
    Module._resolveFilename = oldResolve;
    if (oldLoader) Module._extensions[".ts"] = oldLoader;
    else delete Module._extensions[".ts"];
  }
})();
