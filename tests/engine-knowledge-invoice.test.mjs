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
const { invoiceFileIds, checkedInvoice, stableJson } = exports;

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
