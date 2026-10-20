const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../../lib/engine/import-batch-approval.ts");
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText, filename);
const { selectApprovedBatchObservations } = mod.exports;
const key1 = "obs_" + "a".repeat(64);
const key2 = "obs_" + "b".repeat(64);
const candidate = { objectTypeId: "type", documentId: "doc",
  fieldKey: "name", evidenceText: "Name", values: { name: "Name" } };
const plan = {
  eligible: [{ observationKey: key1, candidate }],
  heldForConflict: [{ candidate, conflictIndexes: [0] }],
  heldForIdentity: [],
  repeatedObservations: [],
};
test("only explicitly approved eligible keys are returned", () => {
  assert.deepEqual(selectApprovedBatchObservations({
    plan, approvedObservationKeys: [key1],
  }), [plan.eligible[0]]);
});
test("unknown or withheld keys fail closed", () => {
  assert.throws(() => selectApprovedBatchObservations({
    plan, approvedObservationKeys: [key2],
  }));
});
test("repeated approvals fail closed", () => {
  assert.throws(() => selectApprovedBatchObservations({
    plan, approvedObservationKeys: [key1, key1],
  }));
});
test("empty approval fails closed", () => {
  assert.throws(() => selectApprovedBatchObservations({
    plan, approvedObservationKeys: [],
  }));
});
test("duplicate eligible keys fail closed", () => {
  assert.throws(() => selectApprovedBatchObservations({
    plan: { ...plan, eligible: [plan.eligible[0], plan.eligible[0]] },
    approvedObservationKeys: [key1],
  }));
});
