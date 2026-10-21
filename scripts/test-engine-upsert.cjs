/**
 * Run: node scripts/test-engine-upsert.cjs
 * Offline deterministic fixtures. No DB, OpenAI, HTTP or file upload.
 * Simulates the pipeline AFTER structured rows have been extracted.
 */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");
const ts = require("typescript");

const sourceFile = path.resolve(__dirname, "../lib/engine/upsert-manifest.ts");
const source = fs.readFileSync(sourceFile, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const mod = new Module(sourceFile, module);
mod.filename = sourceFile;
mod.paths = Module._nodeModulePaths(path.dirname(sourceFile));
mod._compile(compiled.outputText, sourceFile);
const { planEngineUpsert } = mod.exports;

const workspaceId = "fixture-workspace";
const sourceRef = { sourceId: "fixture-document", kind: "knowledge", evidence: "Fixture row" };
const entities = [
  { key: "recipe", name: "Recipe", identityFields: ["code"], fields: [
    { key: "code", name: "Code", type: "text" },
    { key: "name", name: "Name", type: "text" },
  ] },
  { key: "ingredient", name: "Ingredient", identityFields: ["name"], fields: [
    { key: "name", name: "Name", type: "text" },
  ] },
  { key: "recipe_ingredient", name: "Recipe line", identityFields: [],
    fields: [{ key: "quantity", name: "Quantity", type: "decimal" }] },
];
const existing = [
  { id: "type-recipe", key: "recipe", fields: [
    { key: "code", type: "text" }, { key: "name", type: "text" },
  ], records: [{ id: "recipe-1", values: { code: "R-001", name: "Sopa" } }] },
  { id: "type-ingredient", key: "ingredient",
    fields: [{ key: "name", type: "text" }],
    records: [{ id: "ingredient-1", values: { name: "Sal" } }] },
  { id: "type-line", key: "recipe_ingredient",
    fields: [{ key: "quantity", type: "decimal" }], records: [] },
];
const row = (localId, entityKey, values) => ({
  localId, entityKey, values, source: sourceRef,
});
const manifest = observations => ({
  version: 1, workspaceId, entities, observations, links: [],
});
const tests = [
  ["Reuse existing recipe and ingredient", () => {
    const p = planEngineUpsert(manifest([
      row("a", "recipe", { code: " r-001 ", name: "Sopa" }),
      row("b", "ingredient", { name: "SAL" }),
    ]), existing);
    assert.equal(p.summary.reuse, 2);
    assert.equal(p.summary.create, 0);
  }],
  ["Create unseen ingredient", () => {
    const p = planEngineUpsert(manifest([
      row("a", "ingredient", { name: "Pimienta" }),
    ]), existing);
    assert.equal(p.summary.create, 1);
  }],
  ["Hold both duplicate identities in one batch", () => {
    const p = planEngineUpsert(manifest([
      row("a", "ingredient", { name: "Azúcar" }),
      row("b", "ingredient", { name: "AZÚCAR " }),
    ]), existing);
    assert.equal(p.summary.review, 2);
    assert.equal(p.summary.create, 0);
  }],
  ["Hold conflicting existing record", () => {
    const p = planEngineUpsert(manifest([
      row("a", "recipe", { code: "R-001", name: "Otra receta" }),
    ]), existing);
    assert.equal(p.summary.review, 1);
  }],
  ["Hold junction row without declared identity", () => {
    const p = planEngineUpsert(manifest([
      row("a", "recipe_ingredient", { quantity: 2 }),
    ]), existing);
    assert.equal(p.summary.review, 1);
    assert.equal(p.summary.create, 0);
  }],
  ["Hold missing identity for new type", () => {
    const p = planEngineUpsert(manifest([
      row("a", "ingredient", {}),
    ]), existing.filter(t => t.key !== "ingredient"));
    assert.equal(p.summary.review, 1);
  }],
  ["Reject foreign fields", () => {
    assert.throws(() => planEngineUpsert(manifest([
      row("a", "ingredient", { name: "Sal", password: "bad" }),
    ]), existing), /Invalid observation/);
  }],
  ["Plan links only when endpoints are actionable", () => {
    const m = manifest([
      row("a", "recipe", { code: "R-001", name: "Sopa" }),
      row("b", "ingredient", { name: "Pimienta" }),
    ]);
    m.links = [{ fromLocalId: "a", toLocalId: "b", relationKey: "uses", source: sourceRef }];
    const p = planEngineUpsert(m, existing);
    assert.equal(p.summary.link, 1);
    assert.equal(p.writesPerformed, false);
  }],
];
let failed = 0;
for (const [name, run] of tests) {
  try { run(); process.stdout.write("PASS " + name + "\n"); }
  catch (error) { failed++; process.stderr.write("FAIL " + name + "\n" + error.stack + "\n"); }
}
process.stdout.write("\n" + (tests.length - failed) + "/" + tests.length + " passed\n");
if (failed) process.exitCode = 1;
