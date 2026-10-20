import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/import-preflight.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { preflightEngineImportCandidates: preflight } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

const document = { id: "file-1", workspaceId: "workspace-a", extractedText: "Vainilla: 2,80 EUR" };
const candidate = {
  objectTypeId: "product", documentId: "file-1", fieldKey: "price",
  values: { name: "Vainilla", price: "2.80" }, evidenceText: "Vainilla: 2,80 EUR",
};
const run = (documents, candidates, workspaceId = "workspace-a") =>
  preflight({ workspaceId, documents, candidates });

test("accepts candidate grounded in the correct workspace document", () => {
  const result = run([document], [candidate]);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.issues.length, 0);
});

test("rejects cross-workspace source", () => {
  const result = run([{ ...document, workspaceId: "workspace-b" }], [candidate]);
  assert.equal(result.issues[0].code, "WORKSPACE_MISMATCH");
  assert.equal(result.accepted.length, 0);
});

test("rejects missing source and invented evidence", () => {
  assert.equal(run([], [candidate]).issues[0].code, "DOCUMENT_NOT_FOUND");
  assert.equal(run([document], [{ ...candidate, evidenceText: "Pistacho: 3 EUR" }]).issues[0].code, "EVIDENCE_NOT_IN_DOCUMENT");
  assert.equal(run([document], [{ ...candidate, evidenceText: "" }]).issues[0].code, "MISSING_EVIDENCE");
});

test("rejects field without a corresponding value", () => {
  const result = run([document], [{ ...candidate, fieldKey: "unknown" }]);
  assert.equal(result.issues[0].code, "INVALID_FIELD");
});

test("deduplicates identical candidate evidence within a batch", () => {
  const result = run([document], [candidate, candidate]);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.issues[0].code, "DUPLICATE_CANDIDATE");
});
