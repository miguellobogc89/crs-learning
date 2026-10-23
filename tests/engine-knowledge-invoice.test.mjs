import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const filename = new URL("../lib/engine/knowledge-invoice-import.service.ts", import.meta.url);
const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
// These tests run only the production pure functions; no Prisma, OpenAI, or network calls.
const exports = {};
new Function("exports", "require", js)(exports, id => {
  if (id === "node:crypto") return require(id);
  return {};
});
const { invoiceFileIds, checkedInvoice, stableJson, invoiceMissingFields } = exports;

function route(articleCandidate, structuredCandidate) {
  return { articleCandidate, structuredCandidate, knowledge: true };
}
function file(id, text) {
  return { id, file_name: id + ".pdf", extracted_text: text,
    status: "text_ready", content_hash: null };
}
function proposal(routes, docs) {
  return { documentRoutes: routes, globalImportMap: { documents: docs } };
}

test("1 procedure and 2 commercial invoices route to exactly 2 Engine invoice records", () => {
  const files = [
    file("procedure", "PROCEDIMIENTO OPERATIVO APERTURA"),
    file("invoice-a", "FACTURA 018-2026 TOTAL 955,00"),
    file("invoice-b", "FACTURA 2026-22 TOTAL 125,00"),
  ];
  const p = proposal({
    procedure: route(true, false),
    "invoice-a": route(false, true),
    "invoice-b": route(false, true),
  }, [
    { fileId: "procedure", type: "procedimiento", title: "Apertura", category: "operaciones" },
    { fileId: "invoice-a", type: "factura comercial", title: "Factura 018", category: "compras" },
    { fileId: "invoice-b", type: "factura", title: "Factura 2026", category: "gastos" },
  ]);
  assert.deepEqual(invoiceFileIds(p, files), ["invoice-a", "invoice-b"]);
});

test("payroll settlements are not mistakenly inserted as invoices", () => {
  const p = proposal({ rlc: route(false, true) }, [
    { fileId: "rlc", type: "liquidacion de cotizaciones", title: "RLC mayo", category: "laboral" },
  ]);
  assert.deepEqual(invoiceFileIds(p, [file("rlc", "LIQUIDACION COTIZACIONES importe 1158,66")]), []);
});

test("a misleading filename alone cannot classify a non-invoice", () => {
  const p = proposal({ a: route(false, true) }, [
    { fileId: "a", type: "factura", title: "Factura", category: "compras" },
  ]);
  assert.deepEqual(invoiceFileIds(p, [
    { ...file("a", "Asiento de diario contable"), file_name: "FACTURA.pdf" },
  ]), []);
});

test("a PDF containing multiple classified documents must not be partially imported", () => {
  const p = proposal({ a: route(false, true) }, [
    { fileId: "a", type: "factura", title: "Factura 1", category: "compras" },
    { fileId: "a", type: "factura", title: "Factura 2", category: "compras" },
  ]);
  assert.deepEqual(invoiceFileIds(p, [file("a", "FACTURA 1\nFACTURA 2")]), []);
});

test("invoice values are normalized only when exact source evidence proves them", () => {
  const source = "FACTURA 018-2026\n12-02-2026\nSubtotal € 789,26\nIVA 165,74\nTOTAL EUROS € 955,00";
  const fields = new Map([
    ["invoice_number", "text"], ["issue_date", "date"],
    ["net_amount", "decimal"], ["tax_amount", "decimal"], ["total_amount", "decimal"],
  ]);
  const verified = checkedInvoice({
    values: {
      invoice_number: "018-2026", issue_date: "2026-02-12",
      net_amount: "789.26", tax_amount: "165.74", total_amount: "955.00",
      invented_field: "untrusted",
    },
    evidence: {
      invoice_number: "FACTURA 018-2026", issue_date: "12-02-2026",
      net_amount: "Subtotal € 789,26", tax_amount: "IVA 165,74",
      total_amount: "TOTAL EUROS € 955,00",
      invented_field: "untrusted",
    },
  }, source, fields);
  assert.deepEqual(verified.values, {
    invoice_number: "018-2026", issue_date: "2026-02-12",
    net_amount: 789.26, tax_amount: 165.74, total_amount: 955,
  });
  assert.equal("invented_field" in verified.values, false);
});

test("fabricated totals or absent invoice numbers block the final proposal", () => {
  const fields = new Map([["invoice_number", "text"], ["total_amount", "decimal"]]);
  assert.throws(() => checkedInvoice({
    values: { invoice_number: "A-10", total_amount: 1500 },
    evidence: { invoice_number: "FACTURA A-10", total_amount: "TOTAL € 955,00" },
  }, "FACTURA A-10\nTOTAL € 955,00", fields), /verificar/);
});

test("invoice JSONB roundtrip keeps plan identity despite reordered object keys", () => {
  const source = {
    kind: "catalog_invoice_import_v1",
    catalogTypeId: "catalog-invoice",
    catalogVersion: 1,
    documents: [{
      fileId: "invoice-a", fileName: "factura.pdf", externalKey: "invoice:key",
      action: "insert",
      values: { invoice_number: "A-42", issue_date: "2026-10-23", total_amount: 121 },
      evidence: { invoice_number: "Factura A-42", total_amount: "Total 121,00" },
    }],
  };
  // Prisma reads JSONB objects back with key ordering that may differ from insertion order.
  const fromDatabase = {
    documents: [{ evidence: { total_amount: "Total 121,00", invoice_number: "Factura A-42" },
      values: { total_amount: 121, issue_date: "2026-10-23", invoice_number: "A-42" },
      action: "insert", externalKey: "invoice:key", fileName: "factura.pdf", fileId: "invoice-a" }],
    catalogVersion: 1, kind: "catalog_invoice_import_v1", catalogTypeId: "catalog-invoice",
  };
  assert.notEqual(JSON.stringify(source), JSON.stringify(fromDatabase));
  assert.equal(stableJson(source), stableJson(fromDatabase));
  assert.notEqual(stableJson(source), stableJson({
    ...fromDatabase,
    documents: [{ ...fromDatabase.documents[0],
      values: { ...fromDatabase.documents[0].values, total_amount: 999 } }],
  }));
});

test("advisory lock returns a Prisma-compatible integer instead of PostgreSQL void", () => {
  const source = fs.readFileSync(filename, "utf8");
  assert.match(source, /SELECT 1::integer AS acquired\s+FROM pg_advisory_xact_lock\(hashtext\(/);
  assert.doesNotMatch(source, /SELECT pg_advisory_xact_lock\(/);
});


test("Spanish long-form date is accepted with literal evidence", () => {
  const text = "Factura núm: OM4VAHJ0014748\n04 de Agosto de 2026\nTotal factura 38,00 €";
  const data = checkedInvoice({
    values: { invoice_number: "OM4VAHJ0014748", issue_date: "2026-08-04", total_amount: 38 },
    evidence: {
      invoice_number: "Factura núm: OM4VAHJ0014748",
      issue_date: "04 de Agosto de 2026",
      total_amount: "Total factura 38,00 €",
    },
  }, text, new Map([["invoice_number", "text"], ["issue_date", "date"], ["total_amount", "decimal"]]));
  assert.equal(data.values.issue_date, "2026-08-04");
});

test("multiple validated tax rate rows can add up to global base and VAT", () => {
  const quote = "DETALLE (€)\nIVA Base Imponible Cuota Total\n4% 138,00 5,52 143,52\n21% 7,52 1,58 9,10";
  const text = "Nº Factura: A-V2026-00000974054\n" + quote + "\nTotal Factura 152,62";
  const data = checkedInvoice({
    values: { invoice_number: "A-V2026-00000974054",
      net_amount: 145.52, tax_amount: 7.1, total_amount: 152.62 },
    evidence: { invoice_number: "Nº Factura: A-V2026-00000974054",
      net_amount: quote, tax_amount: quote, total_amount: "Total Factura 152,62" },
    calculations: {
      net_amount: { operation: "sum", operands: [138, 7.52] },
      tax_amount: { operation: "sum", operands: [5.52, 1.58] },
    },
  }, text, new Map([["invoice_number", "text"], ["net_amount", "decimal"],
    ["tax_amount", "decimal"], ["total_amount", "decimal"]]));
  assert.equal(data.values.net_amount, 145.52);
  assert.equal(data.values.tax_amount, 7.1);
  assert.equal(data.calculations.tax_amount.operation, "sum");
});

test("unverifiable tax row calculations are rejected without rejecting verified invoice total", () => {
  const quote = "DETALLE IVA 4% 138,00 5,52 21% 7,52 1,58";
  const text = "Factura A-1\n" + quote + "\nTOTAL 152,62";
  const data = checkedInvoice({
    values: { invoice_number: "A-1", net_amount: 500,
      total_amount: 152.62 },
    evidence: { invoice_number: "Factura A-1", net_amount: quote,
      total_amount: "TOTAL 152,62" },
    calculations: { net_amount: { operation: "sum", operands: [138, 7.52] } },
  }, text, new Map([["invoice_number", "text"], ["net_amount", "decimal"],
    ["total_amount", "decimal"]]));
  assert.equal("net_amount" in data.values, false);
  assert.equal(data.values.total_amount, 152.62);
});

test("repeat import enriches only missing fields; established values are immutable", () => {
  const existing = { invoice_number: "018-2026", total_amount: 955, tax_amount: 165.74 };
  const incoming = { invoice_number: "018-2026", total_amount: 999,
    tax_amount: 165.74, net_amount: 789.26, issue_date: "2026-02-12" };
  assert.deepEqual(invoiceMissingFields(existing, incoming),
    { net_amount: 789.26, issue_date: "2026-02-12" });
  assert.deepEqual(invoiceMissingFields({ ...existing, net_amount: 789.26,
    issue_date: "2026-02-12" }, incoming), {});
});

test("preflight no longer queries or blocks on already uploaded PDF hashes", () => {
  const content = fs.readFileSync(
    new URL("../lib/knowledge/import/pipeline/preflight.ts", import.meta.url), "utf8",
  );
  assert.match(content, /status: formats\[index\]\.supported/);
  assert.doesNotMatch(content, /loadExistingKnowledgeDocuments\(/);
});
