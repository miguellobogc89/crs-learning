import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/conflicts/validation.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { validateValueConflicts: validate } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const documents = [
  { id: "doc1", workspaceId: "ws", extractedText: "Tarifa octubre 2026 Vainilla: 2,50 EUR" },
  { id: "doc2", workspaceId: "ws", extractedText: "Tarifa octubre 2026 Vainilla: 2,80 EUR" },
];
const candidate = () => ({
  subject: "Vainilla", attribute: "precio_venta", context: "Tarifa octubre 2026",
  alternatives: [
    { value: "2,50", evidence: [{ documentId: "doc1", quote: "Vainilla: 2,50 EUR" }] },
    { value: "2,80", evidence: [{ documentId: "doc2", quote: "Vainilla: 2,80 EUR" }] },
  ],
});
const run = (candidates, docs = documents) => validate({ workspaceId: "ws", documents: docs, candidates });

test("accepts conflicting values with exact evidence and limited scope", () => {
  const result = run([candidate()]);
  assert.equal(result.valid, true);
  assert.equal(result.conflicts[0].status, "PENDING_REVIEW");
  assert.equal(result.conflicts[0].scope, "AFFECTED_VALUE_ONLY");
  assert.equal(result.conflicts[0].alternatives.length, 2);
});

test("does not invent conflicts for empty candidate list", () => {
  assert.deepEqual(run([]).conflicts, []);
  assert.equal(run([]).valid, true);
});

test("rejects values not contained in their quoted evidence", () => {
  const c = candidate();
  c.alternatives[1].value = "9,99";
  assert.equal(run([c]).issues[0].code, "VALUE_NOT_IN_EVIDENCE");
});

test("rejects quotes not present in original documents", () => {
  const c = candidate();
  c.alternatives[0].evidence[0].quote = "Vainilla: 2,50 EUR invented";
  assert.equal(run([c]).issues[0].code, "EVIDENCE_NOT_IN_DOCUMENT");
});

test("rejects cross-workspace evidence", () => {
  const docs = [...documents];
  docs[1] = { ...docs[1], workspaceId: "other" };
  assert.equal(run([candidate()], docs).issues[0].code, "WORKSPACE_MISMATCH");
});

test("rejects unknown document", () => {
  const c = candidate();
  c.alternatives[0].evidence[0].documentId = "unknown";
  assert.equal(run([c]).issues[0].code, "UNKNOWN_DOCUMENT");
});

test("rejects duplicate values and single-alternative conflicts", () => {
  const c = candidate();
  c.alternatives[1].value = "2,50";
  assert.ok(run([c]).issues.some((x) => x.code === "DUPLICATE_VALUE"));
  assert.equal(run([{ ...candidate(), alternatives: [candidate().alternatives[0]] }]).issues[0].code,
    "INSUFFICIENT_ALTERNATIVES");
});

test("rejects duplicate conflict identities", () => {
  assert.ok(run([candidate(), candidate()]).issues.some((x) => x.code === "DUPLICATE_CONFLICT"));
});

test("rejects malformed input and excessive batches", () => {
  assert.equal(run(null).issues[0].code, "INVALID_SHAPE");
  assert.ok(run(Array.from({ length: 51 }, candidate)).issues.some((x) => x.code === "LIMIT_EXCEEDED"));
});

test("does not mutate input", () => {
  const c = candidate();
  run([c]);
  assert.equal(c.alternatives[0].evidence.length, 1);
  assert.equal(Object.hasOwn(c, "status"), false);
});
