import test from "node:test";
import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

test("Neon prevents cross-workspace field and record references", async () => {
  const client = await pool.connect();
  let begun = false;
  try {
    await client.query("BEGIN");
    begun = true;
    // Temporary personal workspaces stay inside the rolled-back transaction.
    const users = await client.query("SELECT id FROM users LIMIT 1");
    if (!users.rowCount) {
      return;
    }
    const ownerId = users.rows[0].id;
    const workspaces = [];
    for (let i = 0; i < 2; i++) {
      const created = await client.query(
        "INSERT INTO workspaces (owner_user_id, name, slug) VALUES ($1, $2, $3) RETURNING id",
        [ownerId, "Engine isolation workspace", "engine-isolation-" + crypto.randomUUID()],
      );
      workspaces.push(created.rows[0].id);
    }
    const [orgA, orgB] = workspaces;
    const object = await client.query(
      "INSERT INTO engine_object_types (workspace_id, key, name) VALUES ($1, $2, $3) RETURNING id",
      [orgA, "isolation_" + Date.now().toString(36), "Isolation smoke object"],
    );
    const objectId = object.rows[0].id;

    await client.query("SAVEPOINT cross_field");
    await assert.rejects(
      client.query(
        "INSERT INTO engine_field_definitions (workspace_id, object_type_id, key, name, field_type) VALUES ($1, $2, 'cross', 'Cross', 'text')",
        [orgB, objectId],
      ),
      (err) => err.code === "23503",
    );
    await client.query("ROLLBACK TO SAVEPOINT cross_field");

    await client.query("SAVEPOINT cross_record");
    await assert.rejects(
      client.query(
        "INSERT INTO engine_records (workspace_id, object_type_id) VALUES ($1, $2)",
        [orgB, objectId],
      ),
      (err) => err.code === "23503",
    );
    await client.query("ROLLBACK TO SAVEPOINT cross_record");

    const record = await client.query(
      "INSERT INTO engine_records (workspace_id, object_type_id) VALUES ($1, $2) RETURNING id",
      [orgA, objectId],
    );
    const recordId = record.rows[0].id;

    await client.query("SAVEPOINT cross_evidence");
    await assert.rejects(
      client.query(
        "INSERT INTO engine_record_provenance (workspace_id, record_id, revision, origin_type) VALUES ($1, $2, 1, 'manual')",
        [orgB, recordId],
      ),
      (err) => err.code === "23503",
    );
    await client.query("ROLLBACK TO SAVEPOINT cross_evidence");

    const visibleToB = await client.query(
      "SELECT count(*)::int AS count FROM engine_records WHERE workspace_id = $1 AND id = $2",
      [orgB, recordId],
    );
    assert.equal(visibleToB.rows[0].count, 0);
  } finally {
    if (begun) await client.query("ROLLBACK");
    client.release();
  }
});

test.after(async () => { await pool.end(); });
