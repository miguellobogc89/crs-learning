import test from "node:test";
import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

test("Neon prevents cross-organization field and record references", async () => {
  const client = await pool.connect();
  let begun = false;
  try {
    await client.query("BEGIN");
    begun = true;
    const orgs = await client.query("SELECT id FROM organizations WHERE status = 'active' ORDER BY id LIMIT 2");
    if (orgs.rows.length < 2) {
      // Temporary organizations are created within this transaction only.
      for (let i = orgs.rows.length; i < 2; i++) {
        const created = await client.query(
          "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id",
          ["Engine smoke org", "engine-smoke-" + crypto.randomUUID()],
        );
        orgs.rows.push(created.rows[0]);
      }
    }
    const [orgA, orgB] = orgs.rows.map((r) => r.id);
    const object = await client.query(
      "INSERT INTO engine_object_types (organization_id, key, name) VALUES ($1, $2, $3) RETURNING id",
      [orgA, "isolation_" + Date.now().toString(36), "Isolation smoke object"],
    );
    const objectId = object.rows[0].id;

    await client.query("SAVEPOINT cross_field");
    await assert.rejects(
      client.query(
        "INSERT INTO engine_field_definitions (organization_id, object_type_id, key, name, field_type) VALUES ($1, $2, 'cross', 'Cross', 'text')",
        [orgB, objectId],
      ),
      (err) => err.code === "23503",
    );
    await client.query("ROLLBACK TO SAVEPOINT cross_field");

    await client.query("SAVEPOINT cross_record");
    await assert.rejects(
      client.query(
        "INSERT INTO engine_records (organization_id, object_type_id) VALUES ($1, $2)",
        [orgB, objectId],
      ),
      (err) => err.code === "23503",
    );
    await client.query("ROLLBACK TO SAVEPOINT cross_record");

    const record = await client.query(
      "INSERT INTO engine_records (organization_id, object_type_id) VALUES ($1, $2) RETURNING id",
      [orgA, objectId],
    );
    const recordId = record.rows[0].id;

    await client.query("SAVEPOINT cross_evidence");
    await assert.rejects(
      client.query(
        "INSERT INTO engine_record_provenance (organization_id, record_id, revision, origin_type) VALUES ($1, $2, 1, 'manual')",
        [orgB, recordId],
      ),
      (err) => err.code === "23503",
    );
    await client.query("ROLLBACK TO SAVEPOINT cross_evidence");

    const visibleToB = await client.query(
      "SELECT count(*)::int AS count FROM engine_records WHERE organization_id = $1 AND id = $2",
      [orgB, recordId],
    );
    assert.equal(visibleToB.rows[0].count, 0);
  } finally {
    if (begun) await client.query("ROLLBACK");
    client.release();
  }
});

test.after(async () => { await pool.end(); });
