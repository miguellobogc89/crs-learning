import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/upsert-manifest.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { planEngineUpsert } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

const fields = (...keys) => keys.map(key => ({ key, name: key, type: "text" }));
const entity = (key, keys, identityFields) => ({
  key, name: key, fields: fields(...keys), identityFields,
});
const entities = [
  entity("product", ["sku", "name"], ["sku"]),
  entity("recipe", ["code", "name"], ["code"]),
  entity("recipe_component", ["recipe_code", "position", "product_sku", "quantity", "unit"],
    ["recipe_code", "position"]),
  entity("supplier", ["tax_id", "name"], ["tax_id"]),
  entity("supplier_offer", ["supplier_tax_id", "product_sku", "offer_code", "unit_price"],
    ["supplier_tax_id", "product_sku", "offer_code"]),
  entity("volume_tier", ["offer_code", "minimum_quantity", "discount_percent"],
    ["offer_code", "minimum_quantity"]),
];
const observation = (localId, entityKey, values) => ({
  localId, entityKey, values, source: { sourceId: "stress-file", kind: "knowledge",
    evidence: "documented evidence" },
});
const link = (fromLocalId, toLocalId, relationKey) => ({
  fromLocalId, toLocalId, relationKey,
  source: { sourceId: "stress-file", kind: "knowledge", evidence: "documented evidence" },
});
const existing = [
  { id: "product-type", key: "product", fields: fields("sku", "name"),
    records: [{ id: "existing-milk", values: { sku: "MILK", name: "Leche" } }] },
  { id: "supplier-type", key: "supplier", fields: fields("tax_id", "name"),
    records: [{ id: "existing-supplier", values: { tax_id: "B123", name: "Lacteos Sur" } }] },
];
const observations = [
  observation("milk", "product", { sku: " milk ", name: "Leche" }),
  observation("base", "product", { sku: "BASE-W", name: "Base blanca" }),
  observation("vanilla", "recipe", { code: "R-VAN", name: "Helado vainilla" }),
  observation("component1", "recipe_component",
    { recipe_code: "R-VAN", position: "1", product_sku: "BASE-W", quantity: "250", unit: "g" }),
  observation("supplier1", "supplier", { tax_id: "b123", name: "Lacteos Sur" }),
  observation("offer1", "supplier_offer",
    { supplier_tax_id: "B123", product_sku: "MILK", offer_code: "OF-2026", unit_price: "1.50" }),
  observation("tier10", "volume_tier",
    { offer_code: "OF-2026", minimum_quantity: "10", discount_percent: "5" }),
  observation("tier100", "volume_tier",
    { offer_code: "OF-2026", minimum_quantity: "100", discount_percent: "12" }),
];
const links = [
  link("vanilla", "component1", "recipe_has_component"),
  link("component1", "base", "component_uses_product"),
  link("supplier1", "offer1", "supplier_has_offer"),
  link("offer1", "milk", "offer_for_product"),
  link("offer1", "tier10", "offer_has_tier"),
  link("offer1", "tier100", "offer_has_tier"),
];
const manifest = { version: 1, workspaceId: "ws", entities, observations, links };

test("stress: existing product and supplier are reused, not duplicated", () => {
  const plan = planEngineUpsert(manifest, existing);
  assert.equal(plan.operations.find(op => op.localId === "milk")?.action, "reuse");
  assert.equal(plan.operations.find(op => op.localId === "supplier1")?.action, "reuse");
  assert.equal(plan.summary.reuse, 2);
});
test("stress: two volume discount tiers are distinct by composite identity", () => {
  const plan = planEngineUpsert(manifest, existing);
  assert.equal(plan.operations.find(op => op.localId === "tier10")?.action, "create");
  assert.equal(plan.operations.find(op => op.localId === "tier100")?.action, "create");
});
test("stress: multi-hop relationships are planned when endpoints are resolved", () => {
  const plan = planEngineUpsert(manifest, existing);
  assert.equal(plan.summary.link, 6);
  assert.equal(plan.summary.review, 0);
});
test("stress: conflicting supplier remains pending but unrelated recipe imports", () => {
  const conflicting = structuredClone(manifest);
  conflicting.observations.find(row => row.localId === "supplier1").values.name = "Otra empresa";
  const plan = planEngineUpsert(conflicting, existing);
  assert.equal(plan.operations.find(op => op.localId === "supplier1")?.action, "review");
  assert.equal(plan.operations.find(op => op.localId === "vanilla")?.action, "create");
  assert.equal(plan.operations.find(op => op.localId === "offer1")?.action, "create");
  assert.equal(plan.summary.link, 5);
});
test("stress: duplicate offer composite identity is flagged rather than imported twice", () => {
  const duplicate = structuredClone(manifest);
  duplicate.observations.push(observation("offer2", "supplier_offer",
    { supplier_tax_id: "B123", product_sku: "MILK", offer_code: "OF-2026", unit_price: "1.50" }));
  const plan = planEngineUpsert(duplicate, existing);
  assert.equal(plan.operations.find(op => op.localId === "offer1")?.action, "review");
  assert.equal(plan.operations.find(op => op.localId === "offer2")?.action, "review");
});
