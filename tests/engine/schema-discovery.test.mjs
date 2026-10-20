import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/schema-discovery/validation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { validateSchemaDiscovery } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const documents = [{ id: "file-1", workspaceId: "ws-a",
  extractedText: "Helado vainilla 3,50 EUR. Receta: leche 200 ml." }];
const evidence = [{ documentId: "file-1", quote: "Helado vainilla 3,50 EUR" }];
const proposal = {
  entities: [
    { key: "producto", name: "Producto", description: "Productos vendidos",
      evidence, fields: [{ key: "precio", name: "Precio", type: "decimal",
        required: false, evidence }] },
    { key: "ingrediente", name: "Ingrediente", description: "Insumos",
      evidence: [{ documentId: "file-1", quote: "leche 200 ml" }], fields: [] },
  ],
  relations: [{ key: "utiliza", fromEntity: "producto", toEntity: "ingrediente",
    cardinality: "many_to_many", description: "Ingredientes de producto",
    evidence: [{ documentId: "file-1", quote: "Receta: leche 200 ml" }] }],
  warnings: [],
};
const run = (p = proposal, docs = documents) =>
  validateSchemaDiscovery({ workspaceId: "ws-a", documents: docs, proposal: p });
test("accepts grounded entities, fields and relationships", () => {
  const result = run();
  assert.equal(result.valid, true);
  assert.equal(result.proposal.entities.length, 2);
});
test("rejects evidence invented by AI", () => {
  const p = structuredClone(proposal);
  p.entities[0].fields[0].evidence[0].quote = "Caducidad 2030";
  assert.equal(run(p).issues[0].code, "EVIDENCE_NOT_IN_DOCUMENT");
});
test("rejects evidence from another workspace", () => {
  assert.equal(run(proposal, [{ ...documents[0], workspaceId: "ws-b" }]).valid, false);
  assert.ok(run(proposal, [{ ...documents[0], workspaceId: "ws-b" }])
    .issues.some((issue) => issue.code === "WORKSPACE_MISMATCH"));
});
test("rejects relation to unknown entity", () => {
  const p = structuredClone(proposal);
  p.relations[0].toEntity = "proveedor";
  assert.ok(run(p).issues.some((issue) => issue.code === "UNKNOWN_ENTITY"));
});
test("rejects duplicate field keys", () => {
  const p = structuredClone(proposal);
  p.entities[0].fields.push(structuredClone(p.entities[0].fields[0]));
  assert.ok(run(p).issues.some((issue) => issue.code === "DUPLICATE_KEY"));
});
test("rejects unsupported types and invalid cardinalities", () => {
  const p = structuredClone(proposal);
  p.entities[0].fields[0].type = "money";
  p.relations[0].cardinality = "maybe";
  const codes = run(p).issues.map((issue) => issue.code);
  assert.ok(codes.includes("INVALID_FIELD_TYPE"));
  assert.ok(codes.includes("INVALID_CARDINALITY"));
});
test("rejects missing evidence", () => {
  const p = structuredClone(proposal);
  p.entities[0].evidence = [];
  assert.ok(run(p).issues.some((issue) => issue.code === "MISSING_EVIDENCE"));
});
test("rejects malformed proposals", () => {
  assert.equal(run({ entities: "wrong", relations: [], warnings: [] }).issues[0].code, "INVALID_SHAPE");
});
