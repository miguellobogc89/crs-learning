const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const filename = path.resolve(__dirname, "../../lib/engine/schema-discovery/project-approved-observations.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  fileName: filename,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { projectApprovedObservations: project } = mod.exports;
const base = {
  plan: {
    status: "READY", issues: [],
    entities: [{ sourceEntity: "supply_offer", targetEntity: "supply_item" }],
    fields: [
      { sourceEntity: "supply_offer", sourceField: "price_per_unit", targetEntity: "supply_item", targetField: "unit_price" },
      { sourceEntity: "supply_offer", sourceField: "price_unit", targetEntity: "supply_item", targetField: "unit" },
    ],
  },
  observations: [{
    sourceEntity: "supply_offer", documentId: "doc-1",
    evidenceText: "Precio por litro: 1,20 EUR",
    values: { price_per_unit: 1.2, price_unit: "litro" },
  }],
};
test("maps price and unit while preserving evidence", () => {
  const result = project(base);
  assert.equal(result.status, "READY");
  assert.deepEqual(result.mapped[0].values, { unit_price: 1.2, unit: "litro" });
  assert.equal(result.mapped[0].documentId, "doc-1");
  assert.equal(result.mapped[0].evidenceText, "Precio por litro: 1,20 EUR");
  assert.deepEqual(result.mapped[0].fieldSources, {
    unit_price: "price_per_unit", unit: "price_unit",
  });
});
test("unapproved mapping cannot be projected", () => {
  const result = project({ ...base, plan: { ...base.plan, status: "BLOCKED" } });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.mapped.length, 0);
});
test("unknown source field blocks the entire batch", () => {
  const result = project({ ...base, observations: [{
    ...base.observations[0], values: { ...base.observations[0].values, unexpected: 10 },
  }] });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.mapped.length, 0);
});
test("unknown source entity blocks the batch", () => {
  const result = project({ ...base, observations: [{
    ...base.observations[0], sourceEntity: "unknown",
  }] });
  assert.equal(result.status, "BLOCKED");
});
test("missing document evidence blocks projection", () => {
  const result = project({ ...base, observations: [{
    ...base.observations[0], evidenceText: "",
  }] });
  assert.equal(result.status, "BLOCKED");
});
test("no values cannot produce an observation", () => {
  const result = project({ ...base, observations: [{
    ...base.observations[0], values: {},
  }] });
  assert.equal(result.status, "BLOCKED");
});
