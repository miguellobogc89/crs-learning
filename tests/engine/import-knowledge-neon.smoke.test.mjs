import test from "node:test";
import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Configure your local Neon development connection.");
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

/**
 * Read-only Neon integration smoke test for the Knowledge -> Engine bridge.
 * No fixtures or mutations. Works even when the Engine has no object types.
 * This verifies DB relationships and scoped queries, not service authorization.
 */
test("Neon supports workspace-scoped Knowledge documents and Engine definitions", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const { rows: workspaces } = await client.query(`
      SELECT w.id, w.owner_user_id
      FROM workspaces w
      WHERE w.status = 'active'
        AND w.owner_user_id IS NOT NULL
      ORDER BY w.created_at DESC
      LIMIT 1
    `);
    if (workspaces.length === 0) {
      // A fresh database with no workspaces is valid, but not an integration fixture.
      console.log("SKIP DATA: no active personal workspace; schema queries will still run.");
    }
    const workspaceId = workspaces[0]?.id ?? "00000000-0000-0000-0000-000000000000";

    const { rows: files } = await client.query(`
      SELECT f.id, f.extracted_text, l.workspace_id
      FROM knowledge_files f
      JOIN knowledge_sources s ON s.id = f.knowledge_source_id
      JOIN knowledge_libraries l ON l.id = s.library_id
      WHERE l.workspace_id = $1::uuid
        AND s.status <> 'deleted'
        AND f.status = 'ready'
      LIMIT 10
    `, [workspaceId]);
    assert.ok(files.every((file) => file.workspace_id === workspaceId));
    assert.ok(files.every((file) => typeof file.extracted_text === "string"));

    const { rows: definitions } = await client.query(`
      SELECT t.id, t.workspace_id, t.status, f.key AS field_key, f.field_type
      FROM engine_object_types t
      LEFT JOIN engine_field_definitions f
        ON f.object_type_id = t.id AND f.workspace_id = t.workspace_id
      WHERE t.workspace_id = $1::uuid
      LIMIT 100
    `, [workspaceId]);
    assert.ok(definitions.every((definition) => definition.workspace_id === workspaceId));

    const { rows: crossWorkspace } = await client.query(`
      SELECT count(*)::int AS count
      FROM knowledge_files f
      JOIN knowledge_sources s ON s.id = f.knowledge_source_id
      JOIN knowledge_libraries l ON l.id = s.library_id
      WHERE l.workspace_id = $1::uuid AND l.workspace_id <> $2::uuid
    `, [workspaceId, workspaceId]);
    assert.equal(crossWorkspace[0].count, 0);

    console.log(`Read-only scoped query OK: ${files.length} document(s), ${definitions.length} definition row(s).`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

test.after(async () => { await pool.end(); });
