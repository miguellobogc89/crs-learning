import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const module = { exports: {} };
const js = ts.transpileModule(readFileSync(new URL("../../components/knowledge/import/read-import-stream.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("module", "exports", js)(module, module.exports);
const { readImportStream } = module.exports;
const encoder = new TextEncoder();
test("fragmented NDJSON preserves progress messages and UTF-8", async () => {
  const progress = { step: "preparing", progressPercentage: 35, message: "Decidiendo destinos · 5 s" };
  const bytes = encoder.encode(JSON.stringify({ type: "progress", progress }) + "\n" + JSON.stringify({ type: "completed", result: { map: "reviewed" } }) + "\n");
  const stream = new ReadableStream({ start(controller) {
    for (let index = 0; index < bytes.length; index += 3) controller.enqueue(bytes.slice(index, index + 3));
    controller.close();
  } });
  const seen = [];
  assert.deepEqual(await readImportStream(new Response(stream), value => seen.push(value)), { map: "reviewed" });
  assert.deepEqual(seen, [progress]);
});
test("completed result returns without waiting for the server socket to close", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode(JSON.stringify({ type: "completed", result: "done" }) + "\n"));
  }, cancel() { cancelled = true; } });
  assert.equal(await readImportStream(new Response(stream)), "done");
  assert.equal(cancelled, true);
});
test("server timeout event surfaces its recoverable message instead of leaving progress stuck", async () => {
  const response = new Response(JSON.stringify({ type: "error", error: "El texto extraído se conserva" }) + "\n");
  await assert.rejects(readImportStream(response), /texto extraído/);
});
test("terminal event without final newline is accepted", async () => {
  assert.equal(await readImportStream(new Response(JSON.stringify({ type: "completed", result: 42 }))), 42);
});
test("disconnect without a terminal result is an error, never a silent success", async () => {
  const response = new Response(JSON.stringify({ type: "progress", progress: { step: "preparing", progressPercentage: 5, message: "Revisando" } }) + "\n");
  await assert.rejects(readImportStream(response), /sin devolver un resultado/);
});
test("HTTP errors are reported before attempting to read progress", async () => {
  await assert.rejects(readImportStream(Response.json({ error: "No autorizado" }, { status: 401 })), /No autorizado/);
});
