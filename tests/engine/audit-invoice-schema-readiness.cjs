/**
 * Read-only schema readiness audit for invoice ingestion.
 * This does not infer document content, create schema, or call AI.
 * It reports whether current approved workspace types can represent
 * invoices and invoice lines without flattening their structure.
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");
const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
const workspaceId = process.env.ENGINE_FIXTURE_WORKSPACE_ID ||
  "9cb8b07f-7da2-4178-87bb-4e8e2f6d41d7";
if (process.argv.length !== 2) {
  console.error("Read-only audit accepts no arguments.");
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
    const [types, relations] = await Promise.all([
      prisma.engine_object_types.findMany({
        where: { workspace_id: workspaceId, status: "active" },
        select: { id: true, key: true, engine_field_definitions: {
          where: { status: "active" },
          select: { key: true, field_type: true, is_required: true },
        } },
        take: 101,
      }),
      prisma.engine_relation_definitions.findMany({
        where: { workspace_id: workspaceId, status: "active" },
        select: { key: true, from_object_type_id: true, to_object_type_id: true,
          cardinality: true },
        take: 101,
      }),
    ]);
    if (types.length > 100 || relations.length > 100) {
      throw new Error("Schema exceeds bounded audit limits.");
    }
    const keys = new Set(types.map((t) => t.key));
    const relationKeys = new Set(relations.map((r) => r.key));
    // Diagnostic concepts, not mandatory names or automatic schema decisions.
    const concepts = [
      { concept: "invoice", exampleKeys: ["invoice", "purchase_invoice", "sales_invoice"] },
      { concept: "invoice_line", exampleKeys: ["invoice_line", "invoice_item", "purchase_invoice_line"] },
      { concept: "supplier", exampleKeys: ["supplier"] },
      { concept: "product", exampleKeys: ["product"] },
    ].map(({ concept, exampleKeys }) => ({
      concept, matchingTypeKeys: exampleKeys.filter((k) => keys.has(k)),
      requiresHumanSchemaReview: !exampleKeys.some((k) => keys.has(k)),
    }));
    const invoiceTypeIds = new Set(types.filter((t) =>
      ["invoice", "purchase_invoice", "sales_invoice"].includes(t.key)).map((t) => t.id));
    const lineTypeIds = new Set(types.filter((t) =>
      ["invoice_line", "invoice_item", "purchase_invoice_line"].includes(t.key)).map((t) => t.id));
    const invoiceLineDefinitions = relations.filter((r) =>
      invoiceTypeIds.has(r.from_object_type_id) && lineTypeIds.has(r.to_object_type_id));
    console.log(JSON.stringify({
      ok: true, mode: "READ_ONLY", workspaceId,
      activeTypes: types.map((t) => ({
        key: t.key, fields: t.engine_field_definitions.map((f) => ({
          key: f.key, type: f.field_type, required: f.is_required,
        })),
      })),
      activeRelationKeys: [...relationKeys].sort(),
      invoiceReadiness: {
        concepts, invoiceToLineDefinitions: invoiceLineDefinitions,
        canRepresentInvoiceWithLines:
          invoiceTypeIds.size > 0 && lineTypeIds.size > 0 &&
          invoiceLineDefinitions.length > 0,
      },
      limitations: [
        "Key matching is a diagnostic heuristic, not semantic schema discovery.",
        "This does not inspect an invoice or test AI extraction.",
        "Missing schema must be proposed and explicitly approved, never silently invented.",
        "No data or schema changes were made.",
      ],
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
