import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHash } from "node:crypto";

const source = readFileSync(new URL("../../lib/knowledge/import/pipeline/detect-duplicates.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  require(name) {
    if (name === "node:crypto") return { createHash };
    throw new Error("Unexpected dependency: " + name);
  },
});
const { calculateKnowledgeFileHash, detectKnowledgeDuplicates } = module.exports;
const bytes = (text) => new TextEncoder().encode(text);
const candidate = (id, name, text) => ({
  candidateId: id, fileName: name, fileSize: bytes(text).byteLength,
  contentHash: calculateKnowledgeFileHash(bytes(text)),
});

test("SHA-256 is stable and based on bytes", () => {
  assert.equal(calculateKnowledgeFileHash(bytes("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(calculateKnowledgeFileHash(bytes("abc")), calculateKnowledgeFileHash(bytes("abd")));
});

test("identical content within the selection is flagged even with different names", () => {
  const results = detectKnowledgeDuplicates([
    candidate("one", "a.pdf", "same"), candidate("two", "b.pdf", "same"),
  ], []);
  assert.equal(results[0].status, "unique");
  assert.equal(results[1].status, "duplicate-in-selection");
  assert.equal(results[1].duplicateOfCandidateId, "one");
});

test("existing identical content is a confirmed duplicate regardless of filename", () => {
  const file = candidate("one", "renamed.pdf", "same");
  const results = detectKnowledgeDuplicates([file], [{
    id: "existing", fileName: "original.pdf", fileSize: file.fileSize,
    contentHash: file.contentHash,
  }]);
  assert.equal(results[0].status, "duplicate-in-knowledge");
  assert.equal(results[0].existingKnowledgeFileId, "existing");
});

test("matching filename and size without a stored hash is only a possible duplicate", () => {
  const file = candidate("one", "FACTURA.pdf", "same");
  const results = detectKnowledgeDuplicates([file], [{
    id: "legacy", fileName: "factura.pdf", fileSize: file.fileSize,
    contentHash: null,
  }]);
  assert.equal(results[0].status, "possible-duplicate");
  assert.equal(results[0].existingKnowledgeFileId, "legacy");
});

test("same filename and size but different verified content is not a duplicate", () => {
  const file = candidate("one", "invoice.pdf", "abcd");
  const old = candidate("old", "invoice.pdf", "wxyz");
  const results = detectKnowledgeDuplicates([file], [{
    id: "existing", fileName: "invoice.pdf", fileSize: old.fileSize,
    contentHash: old.contentHash,
  }]);
  assert.equal(results[0].status, "unique");
});

test("repeated possible duplicates are not silently imported twice", () => {
  const first = candidate("one", "legacy.pdf", "same");
  const second = candidate("two", "renamed.pdf", "same");
  const results = detectKnowledgeDuplicates([first, second], [{
    id: "legacy", fileName: "legacy.pdf", fileSize: first.fileSize,
    contentHash: null,
  }]);
  assert.equal(results[0].status, "possible-duplicate");
  assert.equal(results[1].status, "duplicate-in-selection");
});
