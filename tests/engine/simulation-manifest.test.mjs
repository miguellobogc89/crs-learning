import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
import ts from "typescript";

function load(file, stubs = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Response, Date, Map, Set,
    require(name) {
      if (name in stubs) return stubs[name];
      if (name.startsWith(".")) return load(resolve(dirname(file), name + ".ts"), stubs);
      throw new Error("Unexpected dependency: " + name);
    },
  });
  return module.exports;
}
const { buildSimulationManifest: build } = load(resolve("lib/engine/ingestion/simulation-manifest.ts"));
function fixture(first = "recipe", second = "ingredient") {
  const text = "Tarta | Harina | 25";
  const evidence = [{ documentId: "doc", quote: text }];
  const proposal = { entities: [first, second].map(key => ({ key, name: key, description: "",
    evidence, fields: [{ key: "name", name: "Name", type: "text", required: false, evidence }] })),
    relations: [{ key: "contains", fromEntity: first, toEntity: second,
      cardinality: "one_to_many", description: "", evidence }], warnings: [] };
  return { text, proposal, existing: { entities: [], relations: [] }, rows: [
    { entity: first, values: { name: "Tarta" }, evidence: text, sourceIndex: 0 },
    { entity: second, values: { name: "Harina" }, evidence: text, sourceIndex: 2 },
  ], links: [{ fromRow: 0, toRow: 2, relationKey: "contains", evidence: text }] };
}
for (const [a,b] of [["recipe","ingredient"],["order","customer"]]) {
  test(`${a}: empty Engine retains proposed schema, records and concrete links`, () => {
    const result = build(fixture(a,b));
    assert.equal(result.rows.length, 2);
    assert.equal(result.links[0].toLocalId, "row_2");
    assert.equal(result.entities[0].disposition, "proposed");
    assert.equal(result.relations[0].disposition, "proposed");
    assert.equal(result.writesPerformed, false);
  });
}
test("existing fields reused; missing fields retained; incompatible types remain pending", () => {
  const input = fixture();
  input.existing.entities = [{ key: "recipe", fields: [{ key: "name", type: "integer" }] }];
  const result = build(input);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].disposition, "pending");
  assert.equal(result.entities[0].fields[0].disposition, "conflict");
  input.existing.entities[0].fields[0].type = "text";
  assert.equal(build(input).entities[0].fields[0].disposition, "existing");
  input.existing.entities[0].fields = [];
  assert.equal(build(input).entities[0].fields[0].disposition, "proposed");
  assert.equal(build(input).rows.length, 2);
});
test("rejected row cannot redirect references to another accepted row", () => {
  const input = fixture();
  input.rows[1].values.name = "Invented";
  const result = build(input);
  assert.equal(result.rows.length, 1);
  assert.equal(result.links.length, 0);
  assert.ok(result.unresolvedLinks.length);
});
test("wrong relation endpoints and missing evidence remain unresolved", () => {
  const input = fixture();
  input.links[0].fromRow = 2;
  assert.equal(build(input).links.length, 0);
  input.links[0].fromRow = 0;
  input.links[0].evidence = "Invented";
  assert.equal(build(input).links.length, 0);
});

test("commercial order retains quantity-bearing line items and both proposed references", () => {
  const text = "Order PO-2026 | Customer Acme\nPO-2026 | Widget | 12 | 3,50";
  const evidence = [{ documentId: "doc", quote: text }];
  const entity = (key, fields) => ({ key, name: key, description: "", evidence,
    fields: fields.map(([key, type]) => ({ key, name: key, type, required: false, evidence })) });
  const relation = (key, fromEntity, toEntity) => ({ key, fromEntity, toEntity,
    cardinality: "one_to_many", description: "", evidence });
  const result = build({ text, existing: { entities: [], relations: [] }, proposal: {
    entities: [entity("order", [["code", "text"]]), entity("product", [["name", "text"]]),
      entity("order_line", [["quantity", "integer"], ["price", "decimal"]])],
    relations: [relation("order_lines", "order", "order_line"), relation("line_product", "order_line", "product")], warnings: [],
  }, rows: [
    { entity: "order", values: { code: "PO-2026" }, sourceIndex: 0, evidence: text },
    { entity: "product", values: { name: "Widget" }, sourceIndex: 1, evidence: text },
    { entity: "order_line", values: { quantity: 12, price: 3.5 }, sourceIndex: 2, evidence: text },
  ], links: [
    { fromRow: 0, toRow: 2, relationKey: "order_lines", evidence: text },
    { fromRow: 2, toRow: 1, relationKey: "line_product", evidence: text },
  ] });
  assert.equal(result.rows.length, 3);
  assert.equal(result.links.length, 2);
  assert.equal(result.rows[2].values.quantity, 12);
  assert.equal(result.unresolvedLinks.length, 0);
});

test("recipe composition permits recursive references through an association record", () => {
  const input = fixture("product", "component");
  input.proposal.relations.push({ ...input.proposal.relations[0], key: "component_product",
    fromEntity: "component", toEntity: "product" });
  input.rows.push({ entity: "product", values: { name: "Harina" }, evidence: input.text, sourceIndex: 3 });
  input.links.push({ fromRow: 2, toRow: 3, relationKey: "component_product", evidence: input.text });
  assert.equal(build(input).links.length, 2);
  assert.equal(build(input).rows.length, 3);
});

function routeSetup({ authorized = true, text, payload }) {
  let calls = 0;
  const file = { id: "doc", extracted_text: text };
  const readOnly = new Proxy({}, { get(_, key) {
    if (key === "findFirst") return async () => ({ knowledge_import_files: [file] });
    if (key === "findMany") return async () => [];
    throw new Error("Write or unexpected database access: " + String(key));
  }});
  const stubs = {
    "@/auth": { auth: async () => authorized ? { user: { id: "user" } } : null },
    "@/lib/prisma": { prisma: new Proxy({}, { get: () => readOnly }) },
    "@/lib/services/workspace.service": { getActiveWorkspaceContext: async () => ({ activeWorkspace: { id: "ws" } }) },
    "@/lib/ai/openai": { getKnowledgeImportModel: () => "mock", getOpenAIClient: () => ({ responses: {
      create: async (request) => { calls++; assert.equal(JSON.parse(request.input).text, text);
        return { status: "completed", output_text: JSON.stringify(payload) }; },
    }}) },
    "@/lib/knowledge/access-control": {},
    "../import-knowledge-preview.service": {},
  };
  const analysis = load(resolve("lib/engine/ingestion/analyze-structured-document.service.ts"), stubs);
  stubs["@/lib/engine/ingestion/analyze-structured-document.service"] = analysis;
  stubs["@/lib/engine/ingestion/simulation-manifest"] = { buildSimulationManifest: build };
  const route = load(resolve("app/api/knowledge/import/[importId]/preview-records/route.ts"), stubs);
  return { calls: () => calls, run: () => route.POST(new Request("https://local/preview", {
    method: "POST", body: JSON.stringify({ fileIds: ["doc"], existingKeys: [] }),
  }), { params: Promise.resolve({ importId: "import" }) }) };
}
test("preview route covers later sections and exports proposed schema without any writes", async () => {
  const input = fixture("order", "product");
  const text = "Document heading\n" + "Context\n".repeat(2450) + input.text;
  const payload = { ...input.proposal, rows: input.rows,
    links: input.links };
  // Raw model rows are indexed 0 and 1; sourceIndex is assigned by the validator.
  payload.links = [{ ...input.links[0], toRow: 1 }];
  const route = routeSetup({ text, payload });
  const response = await route.run();
  const result = await response.json();
  assert.equal(result.files[0].status, "completed", result.files[0].error);
  assert.equal(result.files[0].analyzedChars, text.length);
  assert.equal(result.files[0].rows.length, 2);
  assert.equal(result.files[0].links.length, 1);
  assert.equal(result.files[0].entities.length, 2);
  assert.equal(result.writesPerformed, false);
  assert.equal(route.calls(), 1);
});
test("unauthorized route never calls model", async () => {
  const route = routeSetup({ authorized: false, text: "source", payload: {} });
  assert.equal((await route.run()).status, 401);
  assert.equal(route.calls(), 0);
});
test("oversized document fails explicitly before model call", async () => {
  const route = routeSetup({ text: "x".repeat(60001), payload: {} });
  const result = await (await route.run()).json();
  assert.equal(result.files[0].status, "error");
  assert.equal(result.files[0].partial, true);
  assert.equal(route.calls(), 0);
});
