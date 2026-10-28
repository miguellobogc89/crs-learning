import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const filename = new URL("../lib/engine/invoice-evidence.ts", import.meta.url);
const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
// These tests run only the production pure functions; no Prisma, OpenAI, or network calls.
const exports = {};
new Function("exports", "require", js)(exports, id => {
  if (id === "node:crypto") return require(id);
  return {};
});
const { checkedInvoice, stableJson, invoiceMissingFields, ensureInvoiceRevisionSnapshot, previewInvoiceFieldDelta } = exports;

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
  // A persisted JSON plan must pass the same validation at final confirmation.
  const rechecked = checkedInvoice({
    values: data.values, evidence: data.evidence, calculations: data.calculations,
  }, text, new Map([["invoice_number", "text"], ["net_amount", "decimal"],
    ["tax_amount", "decimal"], ["total_amount", "decimal"]]));
  assert.deepEqual(rechecked.values, data.values);
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


function revisionInput() {
  return {
    workspaceId: "ws",
    recordId: "record",
    objectTypeId: "invoice",
    revision: 2,
    schemaVersion: 1,
    status: "draft",
    values: { invoice_number: "A-1", total_amount: 121, net_amount: 100 },
    userId: "user",
  };
}

test("invoice enrichment reuses DB-created revision instead of inserting it twice", async () => {
  const input = revisionInput();
  let inserts = 0;
  let reads = 0;
  const tx = {
    engine_record_revisions: {
      findFirst: async () => {
        reads++;
        return { values_json: { total_amount: 121, net_amount: 100, invoice_number: "A-1" },
          schema_version: 1, status: "draft" };
      },
      createMany: async () => { inserts++; return { count: 0 }; },
    },
  };
  await ensureInvoiceRevisionSnapshot(tx, input);
  assert.equal(reads, 1);
  assert.equal(inserts, 0, "automatic database snapshot must not be duplicated");
});

test("invoice revision missing a DB trigger is safely inserted just once", async () => {
  const input = revisionInput();
  let stored;
  let inserts = 0;
  const tx = {
    engine_record_revisions: {
      findFirst: async () => stored ?? null,
      createMany: async ({ data, skipDuplicates }) => {
        assert.equal(skipDuplicates, true);
        inserts++;
        stored = { values_json: data[0].values_json,
          schema_version: data[0].schema_version, status: data[0].status };
        return { count: 1 };
      },
    },
  };
  await ensureInvoiceRevisionSnapshot(tx, input);
  assert.equal(inserts, 1);
  await ensureInvoiceRevisionSnapshot(tx, input);
  assert.equal(inserts, 1, "second call must be idempotent");
});

test("invoice revision mismatch aborts rather than silently treating it as valid", async () => {
  const input = revisionInput();
  const tx = {
    engine_record_revisions: {
      findFirst: async () => ({
        values_json: { invoice_number: "A-1", total_amount: 999 }, schema_version: 1, status: "draft",
      }),
      createMany: async () => { throw new Error("Must not overwrite existing revision"); },
    },
  };
  await assert.rejects(ensureInvoiceRevisionSnapshot(tx, input), /no coincide/);
});

test("invoice field validation accepts catalog-defined methods without a closed list", () => {
  const text = "Factura A-1\\nMétodo de pago: criptomonedas\\nTotal: 10,00";
  const verified = checkedInvoice({
    values: { invoice_number: "A-1", total_amount: 10, payment_method: "criptomonedas" },
    evidence: { invoice_number: "Factura A-1",
      total_amount: "Total: 10,00", payment_method: "criptomonedas" },
  }, text, new Map([
    ["invoice_number", "text"], ["total_amount", "decimal"], ["payment_method", "text"],
  ]));
  assert.equal(verified.values.payment_method, "criptomonedas");
});

test("first extraction pass can be partial without relaxing the final identity check", () => {
  const text = "Factura A-1\\nTotal 10,00";
  const proposed = {
    values: { invoice_number: "A-1" },
    evidence: { invoice_number: "Factura A-1" },
  };
  const fields = new Map([["invoice_number", "text"], ["total_amount", "decimal"]]);
  const partial = checkedInvoice(proposed, text, fields, { allowPartial: true });
  assert.deepEqual(partial.values, { invoice_number: "A-1" });
  assert.throws(() => checkedInvoice(proposed, text, fields), /número y el importe total/);
});

test("invoice preview lists only new fields with their source evidence", () => {
  const delta = previewInvoiceFieldDelta({
    invoice_number: "018-2026", total_amount: 955, payment_method: "TRANSFERENCIA",
  }, { values: { invoice_number: "018-2026", total_amount: 955,
      payment_method: "TRANSFERENCIA", payment_terms: "30 días" },
    evidence: { payment_terms: "30 días" } });
  assert.deepEqual(delta.addedFields, [{
    field: "payment_terms", value: "30 días", evidence: "30 días",
  }]);
  assert.deepEqual(delta.conflictingFields, []);
  assert.deepEqual(previewInvoiceFieldDelta({
    invoice_number: "018-2026", total_amount: 955, payment_method: "TRANSFERENCIA",
    payment_terms: "30 días",
  }, { values: { invoice_number: "018-2026", total_amount: 955,
    payment_method: "TRANSFERENCIA", payment_terms: "30 días" }, evidence: {} }).addedFields, []);
});

test("Neon catalog upgrade and Toldos correction are separately reviewable scripts", () => {
  const catalog = fs.readFileSync(
    new URL("../scripts/neon/20261023_invoice_payment_method_catalog_v2.sql", import.meta.url),
    "utf8",
  );
  const correction = fs.readFileSync(
    new URL("../scripts/neon/20261023_correct_toldos_payment_method.sql", import.meta.url),
    "utf8",
  );
  assert.match(catalog, /engine_catalog_type_versions/);
  assert.match(catalog, /payment_method/);
  assert.match(catalog, /version = 1 AND status = 'published'/);
  assert.doesNotMatch(catalog, /UPDATE public\.engine_records/);
  assert.match(correction, /ce78ea49-f507-4d22-80fb-1f8ad9309100/);
  assert.match(correction, /revision = revision \+ 1/);
  assert.match(correction, /ON CONFLICT \(record_id, revision\) DO NOTHING/);
  assert.match(correction, /payment_method/);
});


test("catalog field keys tolerate mechanical camelCase without semantic guessing", () => {
  const text = "Factura A-1\nTotal factura: 1.370,57 €";
  const values = checkedInvoice({
    values: { invoiceNumber: "A-1", totalAmount: "1.370,57" },
    evidence: { invoiceNumber: "Factura A-1", totalAmount: "Total factura: 1.370,57 €" },
  }, text, new Map([["invoice_number", "text"], ["total_amount", "decimal"]]));
  assert.deepEqual(values.values, { invoice_number: "A-1", total_amount: 1370.57 });
});

const invoiceDisplayFile = new URL("../lib/engine/invoice-display.ts", import.meta.url);
const invoiceDisplayJs = ts.transpileModule(
  fs.readFileSync(invoiceDisplayFile, "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const displayFunctions = {};
new Function("exports", "require", invoiceDisplayJs)(displayFunctions, () => ({}));
const {
  persistedInvoiceParties,
  formatEngineNumericValue, invoiceDisplayCurrency, isMonetaryField,
} = displayFunctions;

test("invoice parties come from persisted company relationships, never phone/service text", () => {
  const parties = persistedInvoiceParties([
    {to_record_id:"invoice",definition:{key:"invoice_issuer"},from_record:{values_json:{legal_name:"TOLDOS SL",tax_id:"B11111111"}}},
    {to_record_id:"invoice",definition:{key:"invoice_customer"},from_record:{values_json:{legal_name:"PLOCIA SL",tax_id:"B72378581"}}},
  ]);
  assert.deepEqual(parties.get("invoice"),{issuer:"TOLDOS SL",customer:"PLOCIA SL"});
  assert.equal(persistedInvoiceParties([]).size,0);
});

test("invoice monetary columns format thousands and decimal comma using verified currency", () => {
  const amount = { key: "total_amount", field_type: "decimal" };
  const tax = { key: "tax_amount", field_type: "decimal" };
  const rate = { key: "tax_rate", field_type: "decimal" };
  assert.equal(isMonetaryField(amount), true);
  assert.equal(isMonetaryField(rate), false);
  assert.equal(formatEngineNumericValue(7205, amount, "EUR"), "7.205,00 €");
  assert.equal(formatEngineNumericValue(237.87, tax, "EUR"), "237,87 €");
  assert.equal(formatEngineNumericValue(1371.91, amount, null), "1.371,91");
  assert.equal(formatEngineNumericValue(1371.91, amount, "USD"), "1.371,91");
  assert.equal(formatEngineNumericValue(10, rate, "EUR"), "10");
  assert.equal(invoiceDisplayCurrency({}, "Total Factura: 1.370,57 €"), "EUR");
  assert.equal(invoiceDisplayCurrency({}, "importe neto 3050,00"), null);
});

test("invoice money conversion preserves JSON decimals and parses Spanish printed numbers", () => {
  const field = { key: "net_amount", field_type: "decimal" };
  assert.equal(formatEngineNumericValue("1133.81", field, "EUR"), "1.133,81 €");
  assert.equal(formatEngineNumericValue("1.133,81", field, "EUR"), "1.133,81 €");
  assert.equal(formatEngineNumericValue("3.050,00", field, "EUR"), "3.050,00 €");
});
