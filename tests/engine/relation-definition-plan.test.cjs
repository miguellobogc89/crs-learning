const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../../lib/engine/schema-discovery/relation-definition-plan.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  fileName: filename,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { planRelationDefinitions } = mod.exports;
const base = {
  relations: [{ key: "supplier_to_item", fromEntity: "supplier", toEntity: "supply_item",
    cardinality: "one_to_many", description: "Supplier offers items" }],
  existingTypeKeys: ["supplier", "supply_item"], existingRelationKeys: [],
};
test("valid relation accepted", () => {
  const result = planRelationDefinitions(base);
  assert.equal(result.valid, true);
  assert.equal(result.ready.length, 1);
});
test("unknown target rejected", () => {
  const result = planRelationDefinitions({ ...base, existingTypeKeys: ["supplier"] });
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].code, "UNKNOWN_TO");
});
test("existing key rejected", () => {
  const result = planRelationDefinitions({ ...base, existingRelationKeys: ["supplier_to_item"] });
  assert.equal(result.issues[0].code, "EXISTING_KEY");
});
test("duplicate proposal rejected", () => {
  const result = planRelationDefinitions({ ...base, relations: [...base.relations, ...base.relations] });
  assert.equal(result.issues[0].code, "DUPLICATE_KEY");
});
test("invalid cardinality rejected", () => {
  const result = planRelationDefinitions({ ...base, relations: [
    { ...base.relations[0], cardinality: "unknown" },
  ] });
  assert.equal(result.issues[0].code, "INVALID_CARDINALITY");
});
test("invalid key rejected", () => {
  const result = planRelationDefinitions({ ...base, relations: [
    { ...base.relations[0], key: "supplier-item" },
  ] });
  assert.equal(result.issues[0].code, "INVALID_SHAPE");
});
