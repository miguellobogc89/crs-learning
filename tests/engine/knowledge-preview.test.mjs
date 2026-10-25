// Phase 1 of the Knowledge → Engine line: evidence contract, schema without
// quotes, per-document verification, batch identities and the resumable run.
// The invoices below are SYNTHETIC texts shaped like real extractions (multiple
// spaces, line breaks, typographic apostrophes). They do not replace a run with
// the real PDFs; see scripts/engine/export-knowledge-preview-fixture.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function loader(mocks = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(root, filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("require", "module", "exports", js)(id => {
      if (id in mocks) return mocks[id];
      if (id === "@prisma/client") return { Prisma: { sql: (strings, ...values) => ({ strings, values }) } };
      if (id.startsWith(".")) return load(path.resolve(path.dirname(filename), id + ".ts"));
      if (id.startsWith("@/")) return load(id.slice(2) + ".ts");
      return require(id);
    }, module, module.exports);
    return module.exports;
  }
  return load;
}
const load = loader();
const evidence = load("lib/engine/knowledge-preview/evidence.ts");
const schemaModule = load("lib/engine/knowledge-preview/schema.ts");
const extraction = load("lib/engine/knowledge-preview/extraction.ts");
const reconcile = load("lib/engine/knowledge-preview/reconcile.ts");
const review = load("lib/knowledge/import/review-import-batch.ts");

/* ----------------------------- synthetic batch ----------------------------- */

const CUSTOMER = ["D’PLOCIA   HELADOS, S.L.", "B72378581"];
const INVOICES = [
  { file: "toldos.pdf", issuer: ["TOLDOS CHICLANA S.L.", "B11223344"], number: "A-2026/015", date: "12/02/2026", total: "1.370,57", lines: [["Lona acrílica a medida", "980,00"], ["Instalación", "152,73"]] },
  { file: "o2.pdf", issuer: ["TELEFÓNICA DE ESPAÑA, S.A.U.", "A82018474"], number: "TA6C10234567", date: "01/03/2026", total: "36,30", lines: [["Fibra y móvil", "30,00"]] },
  { file: "mercadona.pdf", issuer: ["MERCADONA, S.A.", "A46103834"], number: "4012-017-123456", date: "05/03/2026", total: "84,12", lines: [["Leche entera", "12,40"], ["Azúcar blanco", "9,10"]] },
  { file: "ignis.pdf", issuer: ["IGNIS ENERGÍA, S.L.", "B87654321"], number: "IG-2026-0042", date: "28/02/2026", total: "412,08", lines: [["Energía consumida", "301,20"]] },
];
const textOf = invoice => [
  invoice.issuer[0],
  `CIF:  ${invoice.issuer[1]}`,
  "Tel. 956 000 000",
  `FACTURA Nº ${invoice.number}`,
  `Fecha:   ${invoice.date}`,
  "Cliente:",
  CUSTOMER[0],
  `NIF ${CUSTOMER[1]}`,
  ...invoice.lines.map(([description, amount]) => `${description}    ${amount} €`),
  `TOTAL FACTURA   ${invoice.total} €`,
].join("\n");
const lineNo = (text, needle) => text.split("\n").findIndex(line => line.includes(needle)) + 1;
const at = (text, needle) => { const n = lineNo(text, needle); assert.ok(n > 0, needle); return { line: n, endLine: n, text: needle }; };
const decimal = value => value.replace(/\./g, "").replace(",", ".");
const iso = date => date.split("/").reverse().join("-");

const SCHEMA_RAW = {
  entities: [
    { key: "company", name: "Empresas", description: "Personas jurídicas", identityFields: ["tax_id"], identityScope: null, ownedBy: null, fields: [
      { key: "legal_name", name: "Razón social", type: "text", required: true, description: "" },
      { key: "tax_id", name: "Identificación fiscal", type: "text", required: true, description: "" }] },
    { key: "invoice", name: "Facturas", description: "Documento de cobro", identityFields: ["invoice_number"], identityScope: "invoice_issuer", ownedBy: null, fields: [
      { key: "invoice_number", name: "Número", type: "text", required: true, description: "" },
      { key: "issue_date", name: "Fecha de emisión", type: "date", required: false, description: "" },
      { key: "total_amount", name: "Total", type: "decimal", required: true, description: "" }] },
    { key: "invoice_line", name: "Líneas de factura", description: "Concepto facturado", identityFields: ["description"], identityScope: null, ownedBy: "invoice_has_line", fields: [
      { key: "description", name: "Concepto", type: "text", required: true, description: "" },
      { key: "amount", name: "Importe", type: "decimal", required: false, description: "" }] },
  ],
  relations: [
    { key: "invoice_issuer", name: "Emisor", fromEntity: "company", toEntity: "invoice", cardinality: "one_to_many", description: "Empresa que emite", requiredForTarget: true },
    { key: "invoice_customer", name: "Cliente", fromEntity: "company", toEntity: "invoice", cardinality: "one_to_many", description: "Empresa facturada", requiredForTarget: true },
    { key: "invoice_has_line", name: "Líneas", fromEntity: "invoice", toEntity: "invoice_line", cardinality: "one_to_many", description: "", requiredForTarget: false },
  ],
  warnings: [],
};
const EMPTY_CATALOG = { types: [], relations: [] };
const SCHEMA = schemaModule.validateDiscoveredSchema(SCHEMA_RAW, EMPTY_CATALOG).schema;

/** What a well-behaved model answers for one invoice: values in canonical form, quotes as read. */
function modelAnswer(invoice, overrides = {}) {
  const text = textOf(invoice);
  const customerQuote = "D'PLOCIA HELADOS, S.L."; // straight apostrophe, collapsed spaces
  const records = [
    { ref: "r1", entity: "company", fields: [
      { key: "legal_name", value: invoice.issuer[0], ...at(text, invoice.issuer[0]) },
      { key: "tax_id", value: invoice.issuer[1], ...at(text, invoice.issuer[1]) }] },
    { ref: "r2", entity: "company", fields: [
      { key: "legal_name", value: customerQuote, line: lineNo(text, "PLOCIA"), endLine: lineNo(text, "PLOCIA"), text: customerQuote },
      { key: "tax_id", value: CUSTOMER[1], ...at(text, CUSTOMER[1]) }] },
    { ref: "r3", entity: "invoice", fields: [
      { key: "invoice_number", value: invoice.number, ...at(text, invoice.number) },
      { key: "issue_date", value: iso(invoice.date), ...at(text, invoice.date) },
      { key: "total_amount", value: decimal(invoice.total), ...at(text, `TOTAL FACTURA   ${invoice.total}`) }] },
    ...invoice.lines.map(([description, amount], index) => ({ ref: `l${index + 1}`, entity: "invoice_line", fields: [
      { key: "description", value: description, ...at(text, description) },
      { key: "amount", value: decimal(amount), ...at(text, amount) }] })),
  ];
  const links = [
    { relation: "invoice_issuer", from: "r1", to: "r3", roleEvidence: at(text, invoice.issuer[0]) },
    { relation: "invoice_customer", from: "r2", to: "r3", roleEvidence: at(text, "Cliente:") },
    ...invoice.lines.map((_, index) => ({ relation: "invoice_has_line", from: "r3", to: `l${index + 1}`, roleEvidence: null })),
  ];
  return { records, links, warnings: [], ...overrides };
}
const bounds = text => ({ startLine: 1, endLine: text.split("\n").length });

/* --------------------------------- evidence -------------------------------- */

test("evidence tolerates only declared whitespace and typography, and returns the original characters", () => {
  const lines = ["Cliente:", "D’PLOCIA   HELADOS, S.L.", "NIF B72378581"];
  const one = evidence.resolveSpan(lines, { startLine: 1, endLine: 3 }, { line: 2, endLine: 2, text: "D'PLOCIA HELADOS, S.L." });
  assert.equal(one.ok, true);
  assert.equal(one.span.text, "D’PLOCIA   HELADOS, S.L.");
  const two = evidence.resolveSpan(lines, { startLine: 1, endLine: 3 }, { line: 1, endLine: 2, text: "Cliente: D'PLOCIA" });
  assert.deepEqual([two.ok, two.span.lineStart, two.span.lineEnd], [true, 1, 2]);
  assert.equal(two.span.text, "Cliente:\nD’PLOCIA");
});

test("evidence rejects paraphrase, other lines, case changes and lines outside the document", () => {
  const lines = ["Cliente:", "D’PLOCIA HELADOS, S.L.", "NIF B72378581"];
  const b = { startLine: 2, endLine: 3 };
  assert.equal(evidence.resolveSpan(lines, b, { line: 2, endLine: 2, text: "DPLOCIA HELADOS SL" }).code, "TEXT_NOT_IN_LINES");
  assert.equal(evidence.resolveSpan(lines, b, { line: 3, endLine: 3, text: "D'PLOCIA" }).code, "TEXT_NOT_IN_LINES");
  assert.equal(evidence.resolveSpan(lines, b, { line: 2, endLine: 2, text: "d'plocia" }).code, "TEXT_NOT_IN_LINES");
  assert.equal(evidence.resolveSpan(lines, b, { line: 1, endLine: 1, text: "Cliente:" }).code, "LINES_OUTSIDE_DOCUMENT");
  assert.equal(evidence.resolveSpan(lines, b, { line: 2, endLine: 2, text: "   " }).code, "EMPTY_EVIDENCE");
});

test("values must be literally supported by their own quote", () => {
  assert.deepEqual(evidence.checkValue("decimal", "1370.57", "TOTAL FACTURA   1.370,57 €"), { ok: true, value: 1370.57 });
  assert.equal(evidence.checkValue("decimal", "1370.75", "TOTAL FACTURA 1.370,57 €").code, "VALUE_NOT_IN_EVIDENCE");
  assert.equal(evidence.checkValue("decimal", "1.370,57", "1.370,57").code, "INVALID_CANONICAL_VALUE");
  assert.equal(evidence.checkValue("decimal", "1132.73", "Lona 980,00 Instalación 152,73").code, "VALUE_NOT_IN_EVIDENCE", "sums are never accepted");
  assert.equal(evidence.checkValue("date", "2026-02-12", "Fecha: 12/02/2026").ok, true);
  assert.equal(evidence.checkValue("date", "2026-02-12", "12 de febrero de 2026").ok, true);
  assert.equal(evidence.checkValue("date", "2026-02-12", "12-feb-26").ok, true);
  assert.equal(evidence.checkValue("date", "2026-12-02", "Fecha: 12/02/2026").code, "VALUE_NOT_IN_EVIDENCE", "day-first, never swapped");
  assert.equal(evidence.checkValue("text", "mercadona, s.a.", "MERCADONA, S.A.").ok, true);
  assert.equal(evidence.checkValue("text", "Mercadona SA", "MERCADONA, S.A.").code, "VALUE_NOT_IN_EVIDENCE");
  assert.ok(evidence.numbersInText("Línea 1 100,00").includes(100), "adjacent numbers are not merged");
});

/* ---------------------------------- schema --------------------------------- */

test("discovery carries no quotes; identity is per entity and roles over the same pair require role evidence", () => {
  const { schema, issues } = schemaModule.validateDiscoveredSchema(SCHEMA_RAW, EMPTY_CATALOG);
  assert.deepEqual(issues, []);
  const roles = schema.relations.filter(relation => relation.roleEvidenceRequired).map(relation => relation.key).sort();
  assert.deepEqual(roles, ["invoice_customer", "invoice_issuer"]);
  assert.equal(schema.relations.find(r => r.key === "invoice_has_line").roleEvidenceRequired, false);
  assert.ok(!JSON.stringify(schemaModule.DISCOVERY_OUTPUT_FORMAT).includes("quote"));
});

test("schema rejects bad ownership, missing identity and catalog type contradictions with readable issues", () => {
  const broken = structuredClone(SCHEMA_RAW);
  broken.entities[2].ownedBy = "invoice_issuer";
  broken.entities[0].identityFields = [];
  const catalog = { types: [{ key: "invoice", name: "Facturas", origin: "catalog", fields: [{ key: "total_amount", name: "Total", type: "integer" }] }], relations: [] };
  const { schema, issues } = schemaModule.validateDiscoveredSchema(broken, catalog);
  assert.equal(schema, null);
  assert.deepEqual(issues.map(issue => issue.code).sort(), ["INCOMPATIBLE_WITH_CATALOG", "INVALID_OWNER", "MISSING_IDENTITY"]);
  assert.ok(issues.every(issue => /[a-záéíóú]/i.test(issue.message)));
});

test("recipes: a preparation can be a component of another preparation (recursive association)", () => {
  const raw = {
    entities: [
      { key: "recipe", name: "Recetas", description: "", identityFields: ["code"], ownedBy: null, fields: [
        { key: "code", name: "Código", type: "text", required: true, description: "" }, { key: "name", name: "Nombre", type: "text", required: true, description: "" }] },
      { key: "product", name: "Productos", description: "", identityFields: ["code"], ownedBy: null, fields: [{ key: "code", name: "Código", type: "text", required: true, description: "" }] },
      { key: "recipe_component", name: "Componentes", description: "", identityFields: ["position"], ownedBy: "recipe_has_component", fields: [
        { key: "position", name: "Orden", type: "integer", required: true, description: "" }, { key: "quantity", name: "Cantidad", type: "decimal", required: false, description: "" }] },
    ],
    relations: [
      { key: "recipe_has_component", name: "Componentes", fromEntity: "recipe", toEntity: "recipe_component", cardinality: "one_to_many", description: "", requiredForTarget: true },
      { key: "component_recipe", name: "Preparación usada", fromEntity: "recipe", toEntity: "recipe_component", cardinality: "one_to_many", description: "", requiredForTarget: false },
      { key: "component_product", name: "Producto usado", fromEntity: "product", toEntity: "recipe_component", cardinality: "one_to_many", description: "", requiredForTarget: false },
    ],
    warnings: [],
  };
  const { schema, issues } = schemaModule.validateDiscoveredSchema(raw, EMPTY_CATALOG);
  assert.deepEqual(issues, []);
  assert.equal(schema.entities.find(e => e.key === "recipe_component").ownedBy, "recipe_has_component");
});

test("extraction Structured Output is derived from the shared schema", () => {
  const format = schemaModule.extractionOutputFormat(SCHEMA);
  const items = format.schema.properties.records.items;
  assert.deepEqual(items.properties.entity.enum, ["company", "invoice", "invoice_line"]);
  assert.ok(items.properties.fields.items.properties.key.enum.includes("tax_id"));
  assert.deepEqual(format.schema.properties.links.items.properties.relation.enum, ["invoice_issuer", "invoice_customer", "invoice_has_line"]);
});

/* -------------------------- extraction & batch identity -------------------- */

test("four invoices: every value verified, one customer by tax ID, four distinct issuers, lines scoped to their invoice", () => {
  const documents = INVOICES.map(invoice => {
    const text = textOf(invoice), lines = text.split("\n");
    const result = extraction.validateSegmentExtraction(modelAnswer(invoice), SCHEMA, lines, bounds(text));
    assert.deepEqual(result.issues, [], invoice.file);
    return { segmentId: invoice.file + ":doc:1", fileName: invoice.file, records: result.records, links: result.links };
  });
  const clusters = reconcile.reconcileBatch(SCHEMA, documents);
  const companies = clusters.filter(cluster => cluster.entity === "company");
  assert.equal(companies.length, 5);
  const customer = companies.find(cluster => cluster.identity.tax_id === "B72378581");
  assert.equal(customer.occurrences.length, 4);
  assert.ok(customer.occurrences.every(occurrence => occurrence.roles.includes("Cliente")));
  assert.equal(companies.filter(cluster => cluster.occurrences.every(o => o.roles.includes("Emisor"))).length, 4);
  assert.equal(clusters.filter(cluster => cluster.entity === "invoice").length, 4);
  assert.equal(clusters.filter(cluster => cluster.entity === "invoice_line").length, 6);
  const stored = documents[0].records.find(record => record.ref === "r2").values.legal_name;
  assert.equal(stored.evidence.text, "D’PLOCIA   HELADOS, S.L.", "the original characters are kept as evidence");
  const support = reconcile.schemaSupport(SCHEMA, documents);
  assert.deepEqual(support.unsupported, { entities: [], fields: [], relations: [] });
  assert.deepEqual(reconcile.privateLabelIssues(SCHEMA, documents), [], "generic words such as ENERGÍA are not private labels");
});

test("same tax ID written differently is one company with a visible conflict, never a silent merge of names", () => {
  const documents = INVOICES.slice(0, 2).map((invoice, index) => {
    const text = textOf(invoice).replace("D’PLOCIA   HELADOS, S.L.", index ? "DPLOCIA HELADOS SL" : "D’PLOCIA   HELADOS, S.L.");
    const answer = modelAnswer(invoice);
    if (index) { const quote = "DPLOCIA HELADOS SL"; Object.assign(answer.records[1].fields[0], { value: quote, text: quote }); }
    const result = extraction.validateSegmentExtraction(answer, SCHEMA, text.split("\n"), bounds(text));
    assert.deepEqual(result.issues, []);
    return { segmentId: String(index), fileName: invoice.file, records: result.records, links: result.links };
  });
  const customer = reconcile.reconcileBatch(SCHEMA, documents).find(cluster => cluster.identity.tax_id === "B72378581");
  assert.equal(customer.occurrences.length, 2);
  assert.equal(customer.conflicts[0].field, "legal_name");
});

test("the same invoice number from two issuers stays two invoices (identity scoped by issuer)", () => {
  const documents = [INVOICES[0], { ...INVOICES[3], number: INVOICES[0].number }].map((invoice, index) => {
    const text = textOf(invoice);
    const result = extraction.validateSegmentExtraction(modelAnswer(invoice), SCHEMA, text.split("\n"), bounds(text));
    assert.deepEqual(result.issues, []);
    return { segmentId: String(index), fileName: invoice.file, records: result.records, links: result.links };
  });
  assert.equal(reconcile.reconcileBatch(SCHEMA, documents).filter(cluster => cluster.entity === "invoice").length, 2);
  const text = textOf(INVOICES[0]);
  const orphan = modelAnswer(INVOICES[0]);
  orphan.links = orphan.links.filter(link => link.relation !== "invoice_issuer");
  const result = extraction.validateSegmentExtraction(orphan, SCHEMA, text.split("\n"), bounds(text));
  assert.ok(result.issues.some(issue => issue.code === "MISSING_IDENTITY_SCOPE"));
});

test("a wrong amount is rejected and reported; the rest of the document stays verified", () => {
  const invoice = INVOICES[0], text = textOf(invoice);
  const answer = modelAnswer(invoice);
  answer.records[2].fields[2].value = "1370.75";
  const result = extraction.validateSegmentExtraction(answer, SCHEMA, text.split("\n"), bounds(text));
  assert.deepEqual(result.issues.map(issue => issue.code).sort(), ["MISSING_REQUIRED", "VALUE_NOT_IN_EVIDENCE"]);
  assert.equal(result.records.find(record => record.ref === "r3").values.total_amount, undefined);
  assert.equal(result.records.find(record => record.ref === "r1").values.tax_id.value, invoice.issuer[1]);
});

test("roles: the same company as issuer and customer, or a role without its source, is flagged", () => {
  const invoice = INVOICES[1], text = textOf(invoice), lines = text.split("\n");
  const swapped = modelAnswer(invoice);
  swapped.links[0].from = "r2";
  const one = extraction.validateSegmentExtraction(swapped, SCHEMA, lines, bounds(text));
  assert.ok(one.issues.some(issue => issue.code === "SAME_RECORD_TWO_ROLES"));
  const unsourced = modelAnswer(invoice);
  unsourced.links[1].roleEvidence = null;
  const two = extraction.validateSegmentExtraction(unsourced, SCHEMA, lines, bounds(text));
  assert.ok(two.issues.some(issue => issue.code === "MISSING_ROLE_EVIDENCE"));
  assert.ok(two.issues.some(issue => issue.code === "MISSING_REQUIRED_LINK"));
});

test("a line without its owner and a phone number as company name are rejected", () => {
  const invoice = INVOICES[2], text = textOf(invoice), lines = text.split("\n");
  const answer = modelAnswer(invoice);
  answer.links = answer.links.filter(link => link.to !== "l1");
  answer.records[0].fields[0] = { key: "legal_name", value: "Tel. 956 000 000", ...at(text, "Tel. 956 000 000") };
  const result = extraction.validateSegmentExtraction(answer, SCHEMA, lines, bounds(text));
  assert.ok(result.issues.some(issue => issue.code === "MISSING_OWNER"));
  // A phone IS literally in the source: the evidence contract cannot catch a wrong role
  // by itself. The UI shows each value with its line so the user can; this test documents the limit.
  assert.equal(result.records[0].values.legal_name.value, "Tel. 956 000 000");
});

test("private values are only flagged as whole phrases in reusable labels", () => {
  const raw = structuredClone(SCHEMA_RAW);
  raw.entities[1].description = "Facturas de Mercadona, S.A.";
  const schema = schemaModule.validateDiscoveredSchema(raw, EMPTY_CATALOG).schema;
  const invoice = INVOICES[2], text = textOf(invoice);
  const result = extraction.validateSegmentExtraction(modelAnswer(invoice), schema, text.split("\n"), bounds(text));
  const issues = reconcile.privateLabelIssues(schema, [{ segmentId: "m", fileName: invoice.file, records: result.records, links: result.links }]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].path, "entities.invoice");
});

/* ------------------------------ resumable service ------------------------- */

function harness({ answers = {}, failSchemaOnce = false } = {}) {
  const userId = "user", workspaceId = "ws", importId = "imp";
  const files = INVOICES.map((invoice, index) => ({ id: "f" + index, file_name: invoice.file, status: "text_ready", extracted_text: textOf(invoice) }));
  files.push({ id: "f9", file_name: "apertura.pdf", status: "text_ready", extracted_text: "Procedimiento de apertura\n1. Encender cámaras\n2. Revisar temperaturas" });
  const documents = files.map(file => ({
    id: file.id + ":doc:1", fileId: file.id, fileName: file.file_name, type: file.id === "f9" ? "procedimiento" : "factura",
    category: "compras", title: file.file_name, startLine: 1, endLine: file.extracted_text.split("\n").length, confidence: "high",
    routing: { knowledge: true, articleCandidate: file.id === "f9", structuredCandidate: file.id !== "f9", reason: "", structuredFields: [], existingArticleId: null, existingStructureKeys: [] },
  }));
  const inventory = { format: "crs-import-map", version: 3, importId, files: files.map(f => ({ fileId: f.id, fileName: f.file_name, status: "completed", documentIds: [f.id + ":doc:1"] })), documents };
  inventory.batchReview = { status: "reviewed", sourceFingerprint: review.importBatchFingerprint(inventory, files), groups: [{ title: "Facturas", documentIds: documents.slice(0, 4).map(d => d.id), reason: "" }] };
  const plans = new Map();
  let lock = Promise.resolve();
  const state = { calls: [], writes: 0, schemaFailures: failSchemaOnce ? 1 : 0 };
  const prisma = {
    $queryRaw: async () => [],
    // pg_advisory_xact_lock serialises these transactions in Postgres; so does the mock.
    $transaction: fn => { const run = lock.then(() => fn(prisma)); lock = run.catch(() => undefined); return run; },
    workspaces: { findFirst: async () => ({ owner_user_id: userId, workspace_members: [] }) },
    knowledge_imports: { findFirst: async () => ({ proposal_json: { globalImportMap: inventory }, knowledge_import_files: files }) },
    engine_import_plans: {
      findUnique: async () => plans.get("p") ? structuredClone(plans.get("p")) : null,
      upsert: async ({ create, update }) => {
        state.writes++;
        const current = plans.get("p");
        plans.set("p", structuredClone(current ? { ...current, ...update } : create));
      },
    },
    engine_catalog_types: { findMany: async () => [] },
    engine_object_types: { findMany: async () => [] },
    engine_catalog_relations: { findMany: async () => [] },
  };
  const openai = {
    responses: {
      async create(args, options) {
        assert.equal(options.maxRetries, 0);
        if (options.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        state.calls.push(args.text.format.name);
        if (args.text.format.name === "engine_preview_schema") {
          assert.ok(!args.input.includes("Encender cámaras"), "article-only documents are not sent to Engine");
          if (state.schemaFailures-- > 0) return { status: "completed", output_text: JSON.stringify({ ...SCHEMA_RAW, entities: [] }), usage: { input_tokens: 10, output_tokens: 5 } };
          return { status: "completed", output_text: JSON.stringify(SCHEMA_RAW), usage: { input_tokens: 1000, output_tokens: 400 } };
        }
        const invoice = INVOICES.find(item => args.input.includes(" of " + item.file + ")"));
        assert.ok(args.input.includes("1: "), "documents are sent as numbered lines");
        const custom = answers[invoice.file];
        if (custom === "timeout") throw Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" });
        return { status: "completed", output_text: JSON.stringify(custom ?? modelAnswer(invoice)), usage: { input_tokens: 800, output_tokens: 600 } };
      },
    },
  };
  const service = loader({
    "@/lib/prisma": { prisma },
    "@/lib/ai/openai": { getOpenAIClient: () => openai, getKnowledgeImportModel: () => "gpt-5-mini" },
  })("lib/engine/knowledge-preview/preview.service.ts");
  return { service, state, plans, scope: { importId, userId, workspaceId } };
}

test("idle until asked; one schema call plus one extraction per structured document; article documents are excluded", async () => {
  const h = harness();
  const idle = await h.service.getKnowledgeEnginePreview(h.scope);
  assert.equal(idle.status, "idle");
  assert.equal(idle.documents.length, 4);
  assert.equal(h.state.calls.length, 0, "opening the proposal never calls the model");
  const events = [];
  const preview = await h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "continue", onEvent: event => events.push(event.type) });
  assert.equal(preview.status, "ready");
  assert.equal(preview.savedToEngine, false);
  assert.deepEqual(h.state.calls.filter(name => name === "engine_preview_schema").length, 1);
  assert.equal(h.state.calls.filter(name => name === "engine_preview_extraction").length, 4);
  assert.equal(preview.clusters.filter(cluster => cluster.entity === "company").length, 5);
  assert.equal(preview.totals.calls, 5);
  assert.ok(preview.calls.every(call => call.rawOutput === undefined), "raw answers stay server-side");
  assert.ok(h.plans.get("p").review_json.calls.every(call => typeof call.rawOutput === "string"), "raw answers are kept for replay");
  assert.equal(h.plans.get("p").status, "preview_ready");
  assert.deepEqual(h.plans.get("p").plan_json ?? {}, {}, "a preview is not a committable plan");
  assert.ok(events.includes("state") && events.includes("progress"));
});

test("a timeout fails only its document; continue resumes it without repeating verified work", async () => {
  const h = harness({ answers: { "o2.pdf": "timeout" } });
  const first = await h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "continue" });
  assert.equal(first.status, "needs_review");
  const o2 = first.documents.find(document => document.fileName === "o2.pdf");
  assert.equal(o2.status, "failed");
  assert.match(o2.error, /Sin respuesta/);
  assert.equal(first.documents.filter(document => document.status === "verified").length, 3);
  // Same stored checkpoint, model now answering normally.
  const retry = harness();
  retry.plans.set("p", h.plans.get("p"));
  const second = await retry.service.runKnowledgeEnginePreview({ ...retry.scope, mode: "continue" });
  assert.deepEqual(retry.state.calls, ["engine_preview_extraction"], "only the failed document is extracted again");
  assert.equal(second.status, "ready");
});

test("retrying one document re-extracts only that document", async () => {
  const h = harness();
  await h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "continue" });
  h.state.calls.length = 0;
  const preview = await h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "retry_document", segmentId: "f2:doc:1" });
  assert.deepEqual(h.state.calls, ["engine_preview_extraction"]);
  assert.equal(preview.status, "ready");
});

test("a rejected schema is reported and proposed again on continue", async () => {
  const h = harness({ failSchemaOnce: true });
  const first = await h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "continue" });
  assert.equal(first.status, "schema_failed");
  assert.equal(first.schemaIssues[0].code, "EMPTY_SCHEMA");
  const second = await h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "continue" });
  assert.equal(second.status, "ready");
});

test("a second run while one is active is refused instead of racing", async () => {
  const h = harness();
  assert.equal((await h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "continue" })).status, "ready");
  // Another request holds the run.
  const stored = h.plans.get("p");
  stored.review_json.lease = { runId: "other", until: new Date(Date.now() + 60_000).toISOString() };
  h.plans.set("p", stored);
  await assert.rejects(() => h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "continue" }), /en curso/);
  assert.equal((await h.service.getKnowledgeEnginePreview(h.scope)).status, "running");
});

test("aborting stops further model calls and leaves unfinished documents pending", async () => {
  const h = harness();
  const controller = new AbortController();
  controller.abort();
  const preview = await h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "continue", signal: controller.signal });
  assert.equal(preview.status, "incomplete", "nothing failed; the user can continue");
  assert.equal(preview.schemaError, null);
  assert.ok(preview.documents.every(document => document.status === "pending"));
  assert.equal(h.state.calls.length, 0);
  assert.equal(h.plans.get("p").review_json.lease, null, "the run is released");
});

test("discovery includes every segment, or refuses an oversized batch without sampling", () => {
  const h = harness();
  const segments = [
    { segmentId: "a", group: "Facturas", chars: 50 }, { segmentId: "b", group: "Facturas", chars: 80 }, { segmentId: "c", group: "Recetas", chars: 40 },
  ];
  assert.deepEqual(h.service.discoveryScope(segments, 1000), { segmentIds: ["a", "b", "c"], reason: null });
  assert.throws(() => h.service.discoveryScope(segments, 150), /No se han omitido documentos/);
  assert.throws(() => h.service.discoveryScope(segments, 100), /Divide el lote/);
});

test("automatic continuation advances pending checkpoints, never failed or reviewed work", async () => {
  const { automaticPreviewKey } = load("lib/engine/knowledge-preview/pipeline.ts");
  const h = harness();
  const idle = await h.service.getKnowledgeEnginePreview(h.scope);
  assert.equal(automaticPreviewKey(idle), "initial");
  const pending = { ...idle, status: "incomplete" };
  const key = automaticPreviewKey(pending);
  assert.ok(key.includes("f0:doc:1"));
  assert.notEqual(automaticPreviewKey({ ...pending, schema: {} }), key, "an accepted schema advances the checkpoint");
  assert.equal(automaticPreviewKey({ ...pending, documents: [{ ...idle.documents[0], status: "failed" }] }), null);
  assert.equal(automaticPreviewKey({ ...pending, documents: [{ ...idle.documents[0], status: "needs_review" }] }), null);
  for (const status of ["running", "schema_failed", "needs_review", "ready", "not_applicable"])
    assert.equal(automaticPreviewKey({ ...idle, status }), null);
});

test("batch conflicts and private labels prevent a ready preview even with individually verified documents", async () => {
  const h = harness();
  await h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "continue" });
  const stored = h.plans.get("p");
  stored.review_json.documents["f0:doc:1"].records.find(record => record.ref === "r2").values.legal_name.value = "Otra razón social";
  assert.equal((await h.service.getKnowledgeEnginePreview(h.scope)).status, "needs_review");
  stored.review_json.documents["f0:doc:1"].records.find(record => record.ref === "r2").values.legal_name.value = "D'PLOCIA HELADOS, S.L.";
  stored.review_json.schema.entities[0].description = "Datos de D'PLOCIA HELADOS, S.L.";
  assert.equal((await h.service.getKnowledgeEnginePreview(h.scope)).status, "needs_review");
});

test("phase reports include readable values, original evidence, identities, roles, errors and telemetry", async () => {
  const { engineReports } = load("lib/engine/knowledge-preview/reports.ts");
  const h = harness({ answers: { "o2.pdf": "timeout" } });
  const preview = await h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "continue" });
  const reports = engineReports(preview);
  assert.deepEqual(reports.map(report => report.status), ["Validado", "Revisar", "Revisar"]);
  assert.match(reports[0].text, /tax_id/);
  assert.match(reports[1].text, /B72378581/);
  assert.match(reports[1].text, /L\d+ «/);
  assert.match(reports[1].text, /Sin respuesta/);
  assert.match(reports[2].text, /Cliente/);
  assert.match(reports[2].text, /5 llamadas/);
  assert.match(reports[2].text, /Guardado en Engine bloqueado/);
});

test("a single non-ownership relation needs evidence even without competing roles", () => {
  const invoice = INVOICES[0], text = textOf(invoice);
  const raw = structuredClone(SCHEMA_RAW);
  raw.relations = raw.relations.filter(relation => relation.key !== "invoice_customer");
  const schema = schemaModule.validateDiscoveredSchema(raw, { types: [], relations: [] }).schema;
  assert.ok(schema);
  const answer = modelAnswer(invoice);
  answer.links = answer.links.filter(link => link.relation !== "invoice_customer");
  answer.links.find(link => link.relation === "invoice_issuer").roleEvidence = null;
  const result = extraction.validateSegmentExtraction(answer, schema, evidence.sourceLines(text), bounds(text));
  assert.ok(result.issues.some(issue => issue.code === "MISSING_RELATION_EVIDENCE"));
  assert.equal(result.links.filter(link => link.relation === "invoice_issuer").length, 0);
  assert.equal(result.links.filter(link => link.relation === "invoice_has_line").length, invoice.lines.length);
});

test("old checkpoints without non-ownership link evidence are marked for review without model calls", async () => {
  const h = harness();
  await h.service.runKnowledgeEnginePreview({ ...h.scope, mode: "continue" });
  const stored = h.plans.get("p");
  stored.review_json.documents["f0:doc:1"].links[0].roleEvidence = null;
  const calls = h.state.calls.length;
  const preview = await h.service.getKnowledgeEnginePreview(h.scope);
  assert.equal(preview.status, "needs_review");
  assert.equal(preview.documents[0].status, "needs_review");
  assert.ok(preview.documents[0].issues.some(issue => issue.code === "MISSING_RELATION_EVIDENCE"));
  assert.equal(h.state.calls.length, calls);
});

test("one import summary preserves every phase, evidence, errors, Knowledge proposal and completion", async()=>{
  const {importSummary}=load("lib/engine/knowledge-preview/reports.ts");
  const h=harness({answers:{"o2.pdf":"timeout"}});
  const preview=await h.service.runKnowledgeEnginePreview({...h.scope,mode:"continue"});
  const inventory={status:"completed",files:[{fileId:"procedure",fileName:"apertura.pdf",status:"completed",sourceChars:100,documentIds:["procedure:doc:1"]}],documents:[{id:"procedure:doc:1",fileId:"procedure",fileName:"apertura.pdf",title:"Apertura",type:"procedimiento",startLine:1,endLine:3,routing:{articleCandidate:true,structuredCandidate:false,reason:"Proceso operativo"}}],batchReview:{status:"reviewed",groups:[{title:"Operaciones",reason:"Conocimiento reutilizable",documentIds:["procedure:doc:1"]}]}};
  const proposal={globalImportMap:inventory,title:"Propuesta de apertura",description:"Organización del lote",summary:{totalDocuments:5},folders:[{name:"Operaciones",description:"Trabajo diario"}],articles:[{title:"Abrir el local",description:"Revisar cámaras",action:"create",documentIds:["procedure"]}],warnings:[{title:"Comprobar versión",description:"Pendiente de revisión"}]};
  const text=importSummary({inventory,proposal,preview,error:"Error de prueba",engineError:"Error recuperable",engineMessage:"Conciliando",engineSeconds:10,completion:{log:{proposalSnapshot:proposal,summary:{documentsCreated:5,documentsSkippedAsDuplicates:1,articlesCreated:1,articlesUpdated:0,foldersCreated:1},documents:[{fileName:"apertura.pdf"}],skippedDocuments:[{fileName:"toldos.pdf"}]}}});
  for(const expected of ["1 · Preparación","2 · Revisión conjunta","3 · Esquema común","4 · Extracción","5 · Conciliación","B72378581","L","Cliente","5 llamadas","PROPUESTA DE KNOWLEDGE","Abrir el local","apertura.pdf","Error de prueba","Error recuperable","Conciliando · 10 s","RESULTADO DEL GUARDADO","Documento reutilizado: toldos.pdf","Comprobar versión","GRUPOS DEL LOTE"]){assert.ok(text.includes(expected),expected);}
  assert.equal(text.split("3 · Esquema común").length-1,1);
});

test("unified summary handles pending files and no Engine candidates without fabricated extraction results",()=>{
  const {importSummary}=load("lib/engine/knowledge-preview/reports.ts");
  assert.match(importSummary({files:[{name:"factura.pdf",status:"error",error:"No legible"}]}),/factura.pdf: error · No legible/);
  const text=importSummary({preview:{status:"not_applicable",documents:[],schema:null,calls:[],schemaIssues:[],clusters:[],labelIssues:[],support:null,totals:{calls:0,durationMs:0,inputTokens:0,outputTokens:0}}});
  assert.match(text,/Engine sin candidatos/);
  assert.doesNotMatch(text,/4 · Extracción/);
});
