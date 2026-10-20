import test from "node:test";
import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

test("Neon creates immutable record snapshots and provenance (transaction rolled back)", async (t) => {
  const client = await pool.connect();
  let begun = false;
  try {
    await client.query("BEGIN");
    begun = true;
    const org = await client.query("SELECT id FROM workspaces WHERE status = 'active' LIMIT 1");
    if (!org.rowCount) {
      t.skip("No active development workspace exists.");
      return;
    }
    const orgId = org.rows[0].id;
    const object = await client.query(
      "INSERT INTO engine_object_types (workspace_id, key, name) VALUES ($1, $2, $3) RETURNING id",
      [orgId, "smoke_" + Date.now().toString(36), "Temporary smoke object"],
    );
    const objectId = object.rows[0].id;
    await client.query(
      "INSERT INTO engine_field_definitions (workspace_id, object_type_id, key, name, field_type) VALUES ($1, $2, 'amount', 'Amount', 'integer')",
      [orgId, objectId],
    );
    const record = await client.query(
      "INSERT INTO engine_records (workspace_id, object_type_id, values_json) VALUES ($1, $2, $3::jsonb) RETURNING id",
      [orgId, objectId, JSON.stringify({ amount: 10 })],
    );
    const recordId = record.rows[0].id;
    await client.query(
      "UPDATE engine_records SET values_json = $2::jsonb, revision = 2 WHERE id = $1",
      [recordId, JSON.stringify({ amount: 20 })],
    );
    const revisions = await client.query(
      "SELECT revision, values_json FROM engine_record_revisions WHERE record_id = $1 ORDER BY revision",
      [recordId],
    );
    assert.deepEqual(revisions.rows.map((r) => [r.revision, r.values_json.amount]), [[1, 10], [2, 20]]);

    await client.query(
      "INSERT INTO engine_record_provenance (workspace_id, record_id, revision, field_key, origin_type, evidence_text) VALUES ($1, $2, 2, 'amount', 'manual', 'Smoke evidence')",
      [orgId, recordId],
    );
    const evidence = await client.query(
      "SELECT count(*)::int AS count FROM engine_record_provenance WHERE record_id = $1 AND revision = 2",
      [recordId],
    );
    assert.equal(evidence.rows[0].count, 1);

    await client.query("SAVEPOINT mutation_guard");
    await assert.rejects(
      client.query("UPDATE engine_record_revisions SET values_json = '{}'::jsonb WHERE record_id = $1 AND revision = 1", [recordId]),
      /immutable/i,
    );
    await client.query("ROLLBACK TO SAVEPOINT mutation_guard");

    await client.query("SAVEPOINT revision_guard");
    await assert.rejects(
      client.query("UPDATE engine_records SET revision = 5 WHERE id = $1", [recordId]),
      /revision must increase/i,
    );
    await client.query("ROLLBACK TO SAVEPOINT revision_guard");
  } finally {
    if (begun) await client.query("ROLLBACK");
    client.release();
  }
});

test.after(async () => { await pool.end(); });
