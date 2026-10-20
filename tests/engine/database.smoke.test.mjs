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

test("Neon engine schema and revision trigger are installed", async () => {
  const client = await pool.connect();
  try {
    const { rows: tables } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])
    `, [[
      "engine_object_types", "engine_field_definitions", "engine_records",
      "engine_record_revisions", "engine_record_provenance",
    ]]);
    assert.deepEqual(
      tables.map((row) => row.table_name).sort(),
      ["engine_object_types", "engine_field_definitions", "engine_records",
       "engine_record_revisions", "engine_record_provenance"].sort(),
    );

    const { rows: triggers } = await client.query(`
      SELECT tgname
      FROM pg_trigger
      WHERE tgrelid = 'engine_records'::regclass
        AND NOT tgisinternal
    `);
    assert.ok(triggers.some((row) => row.tgname === "engine_record_revision_capture"),
      "Record revision capture trigger is missing");

    const { rows: guards } = await client.query(`
      SELECT tgname
      FROM pg_trigger
      WHERE tgrelid = 'engine_record_revisions'::regclass
        AND NOT tgisinternal
    `);
    assert.ok(guards.some((row) => row.tgname === "engine_revision_immutable"),
      "Revision immutability trigger is missing");

    const { rows: missing } = await client.query(`
      SELECT count(*)::int AS count
      FROM engine_records r
      WHERE NOT EXISTS (
        SELECT 1 FROM engine_record_revisions h
        WHERE h.record_id = r.id AND h.revision = r.revision
      )
    `);
    assert.equal(missing[0].count, 0, "Some records lack a snapshot of their current revision");
  } finally {
    client.release();
  }
});

test.after(async () => { await pool.end(); });
