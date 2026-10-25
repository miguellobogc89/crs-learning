#!/usr/bin/env node
/**
 * Exports a REAL Knowledge → Engine preview run as a private replay fixture:
 * extracted texts, the reviewed inventory and the stored preview state,
 * including every raw model answer.
 *
 *   DATABASE_URL=... node scripts/engine/export-knowledge-preview-fixture.mjs <importId>
 *
 * Output: tests/fixtures/private/knowledge-preview-<importId>.json
 * The folder is git-ignored: fixtures contain private business documents.
 * Replay with: node --test tests/engine/knowledge-preview-replay.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const importId = process.argv[2];
if (!importId || !/^[0-9a-f-]{36}$/i.test(importId)) {
  console.error("Uso: node scripts/engine/export-knowledge-preview-fixture.mjs <importId>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const imported = await client.query(
    "SELECT id, proposal_json FROM knowledge_imports WHERE id = $1", [importId]);
  if (!imported.rowCount) throw new Error("Importación no encontrada: " + importId);
  const files = await client.query(
    "SELECT id, file_name, status, extracted_text FROM knowledge_import_files WHERE import_id = $1 ORDER BY processing_order, id",
    [importId]);
  const plan = await client.query(
    "SELECT status, review_json, updated_at FROM engine_import_plans WHERE idempotency_key = $1",
    ["knowledge-relational:" + importId]);
  const preview = plan.rows[0]?.review_json;
  if (!preview || preview.version !== 2) throw new Error("Esta importación no tiene una vista previa de Engine de fase 1.");

  const fixture = {
    kind: "knowledge-preview-fixture-v1",
    exportedAt: new Date().toISOString(),
    importId,
    planStatus: plan.rows[0].status,
    inventory: imported.rows[0].proposal_json?.globalImportMap ?? null,
    files: files.rows,
    preview,
  };
  const directory = path.resolve("tests/fixtures/private");
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, `knowledge-preview-${importId}.json`);
  fs.writeFileSync(target, JSON.stringify(fixture, null, 2));
  const documents = Object.values(preview.documents ?? {});
  console.log(`Fixture guardado en ${path.relative(process.cwd(), target)}`);
  console.log(`  ${files.rowCount} archivos · ${documents.length} documentos analizados · ${preview.calls?.length ?? 0} llamadas al modelo`);
  for (const document of documents)
    console.log(`  - ${document.fileName} · ${document.title}: ${document.status} (${document.records.length} registros, ${document.issues.length} incidencias)`);
} finally {
  await client.end();
}
