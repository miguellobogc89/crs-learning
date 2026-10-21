/**
 * Real PostgreSQL constraint/integration smoke tests for Engine relation storage.
 * Usage: set ENGINE_TEST_DATABASE_URL to a dedicated database ending _test or _testing,
 * apply migrations THERE, then run: node scripts/test-engine-relations-db.cjs
 * Never reads DATABASE_URL for connections. Never migrates. Never commits.
 * All fixtures and test writes run inside one transaction that is always rolled back.
 *
 * These tests validate persistence constraints and database isolation, not the
 * Next.js service's authorization or review endpoints (test those separately).
 */
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { Client } = require("pg");

function requireTestUrl() {
  const value = process.env.ENGINE_TEST_DATABASE_URL;
  if (!value) throw new Error("ENGINE_TEST_DATABASE_URL is required; refusing to use DATABASE_URL.");
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !/_test(ing)?$/i.test(database) ||
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && !database) {
    throw new Error("Use a dedicated PostgreSQL database whose name ends in _test or _testing.");
  }
  if (process.env.DATABASE_URL && value === process.env.DATABASE_URL)
    throw new Error("Test URL must differ from DATABASE_URL.");
  return value;
}

async function main() {
  const client = new Client({ connectionString: requireTestUrl(), connectionTimeoutMillis: 10000 });
  await client.connect();
  let inTransaction = false;
  let passed = 0;
  let failed = 0;
  const tests = [];
  const uuid = () => randomUUID();
  const q = (sql, values = []) => client.query(sql, values);
  const insert = async (table, columns, values) => {
    const names = columns.map(name => '"' + name + '"').join(", ");
    const placeholders = values.map((_, i) => "$" + (i + 1)).join(", ");
    return q('INSERT INTO "' + table + '" (' + names + ') VALUES (' + placeholders + ')', values);
  };
  const test = (name, fn) => tests.push([name, fn]);
  const count = async (table, where, values) =>
    Number((await q('SELECT count(*)::int AS n FROM "' + table + '" WHERE ' + where, values)).rows[0].n);
  const expectedConstraint = async (fn) => {
    await q("SAVEPOINT expected_failure");
    let failedAsExpected = false;
    try { await fn(); }
    catch (e) {
      if (!["23505", "23503", "23514", "23502"].includes(e.code)) throw e;
      failedAsExpected = true;
    } finally {
      await q("ROLLBACK TO SAVEPOINT expected_failure");
      await q("RELEASE SAVEPOINT expected_failure");
    }
    assert(failedAsExpected, "Expected a PostgreSQL constraint violation");
  };
  try {
    const exists = await q("SELECT to_regclass('public.engine_record_relations') AS table_name");
    if (!exists.rows[0].table_name) throw new Error("Migration not applied to test DB: engine_record_relations missing.");
    await q("BEGIN");
    inTransaction = true;
    const user = uuid(), workspace = uuid(), workspace2 = uuid();
    const typeA = uuid(), typeB = uuid(), typeC = uuid();
    const from = uuid(), to = uuid(), to2 = uuid(), otherFrom = uuid(), foreign = uuid();
    const def = uuid(), def11 = uuid(), defMM = uuid();
    const source = uuid(), document = uuid(), proposal = uuid(), proposal2 = uuid();
    await insert("users", ["id", "email"], [user, "engine-db-test-" + user + "@example.invalid"]);
    await insert("workspaces", ["id", "name", "slug", "owner_user_id"],
      [workspace, "Engine test", "engine-test-" + workspace, user]);
    await insert("workspaces", ["id", "name", "slug", "owner_user_id"],
      [workspace2, "Engine test 2", "engine-test-" + workspace2, user]);
    for (const [id, ws, key] of [
      [typeA, workspace, "a"], [typeB, workspace, "b"],
      [typeC, workspace2, "foreign"]]) {
      await insert("engine_object_types", ["id", "workspace_id", "key", "name"],
        [id, ws, key, key]);
    }
    for (const [id, ws, type] of [
      [from, workspace, typeA], [otherFrom, workspace, typeA],
      [to, workspace, typeB], [to2, workspace, typeB],
      [foreign, workspace2, typeC]]) {
      await insert("engine_records", ["id", "workspace_id", "object_type_id", "values_json"],
        [id, ws, type, JSON.stringify({ name: id })]);
    }
    for (const [id, key, cardinality] of [
      [def, "one-many", "one_to_many"],
      [def11, "one-one", "one_to_one"],
      [defMM, "many-many", "many_to_many"]]) {
      await insert("engine_relation_definitions",
        ["id", "workspace_id", "key", "name", "from_object_type_id", "to_object_type_id", "cardinality"],
        [id, workspace, key, key, typeA, typeB, cardinality]);
    }
    await insert("knowledge_sources", ["id", "owner_user_id", "title", "status"],
      [source, user, "Engine relation evidence", "ready"]);
    await insert("knowledge_files", ["id", "knowledge_source_id", "file_name", "status", "extracted_text"],
      [document, source, "engine-test.txt", "ready", "A belongs to B."]);
    for (const id of [proposal, proposal2]) {
      await insert("engine_relation_proposals",
        ["id", "workspace_id", "relation_definition_id", "from_record_id",
          "to_record_id", "document_id", "evidence_text"],
        [id, workspace, def, from, id === proposal ? to : to2,
          document, "A belongs to B."]);
    }
    const addLink = (id, definitionId, fromId, toId, sourceProposalId = null, ws = workspace) =>
      insert("engine_record_relations",
        ["id", "workspace_id", "relation_definition_id", "from_record_id",
          "to_record_id", "source_proposal_id", "reviewed_by_user_id"],
        [id, ws, definitionId, fromId, toId, sourceProposalId, user]);

    test("Persist approved link with proposal reference", async () => {
      await addLink(uuid(), def, from, to, proposal);
      assert.equal(await count("engine_record_relations", "source_proposal_id = $1", [proposal]), 1);
    });
    test("Reject duplicate approved pair", async () =>
      expectedConstraint(() => addLink(uuid(), def, from, to)));
    test("Allow another pair of same definition", async () => {
      await addLink(uuid(), def, from, to2, proposal2);
      assert.equal(await count("engine_record_relations", "relation_definition_id = $1", [def]), 2);
    });
    test("Reject duplicate source proposal", async () =>
      expectedConstraint(() => addLink(uuid(), def11, from, to, proposal)));
    test("Reject foreign-workspace endpoint", async () =>
      expectedConstraint(() => addLink(uuid(), def, from, foreign)));
    test("Reject foreign-workspace definition", async () =>
      expectedConstraint(() => addLink(uuid(), def, foreign, to, null, workspace2)));
    test("Reject self relation", async () =>
      expectedConstraint(() => addLink(uuid(), defMM, from, from)));
    test("Reject missing definition", async () =>
      expectedConstraint(() => addLink(uuid(), uuid(), from, to)));
    test("Reject missing endpoint", async () =>
      expectedConstraint(() => addLink(uuid(), def, from, uuid())));
    test("Reject missing proposal", async () =>
      expectedConstraint(() => addLink(uuid(), defMM, from, to, uuid())));
    test("Allow separate definition for same pair", async () => {
      await addLink(uuid(), defMM, from, to);
      assert.equal(await count("engine_record_relations",
        "from_record_id = $1 AND to_record_id = $2", [from, to]), 2);
    });
    test("Rollback of failed statement preserves earlier rows", async () => {
      const before = await count("engine_record_relations", "workspace_id = $1", [workspace]);
      await expectedConstraint(() => addLink(uuid(), def, from, to));
      assert.equal(await count("engine_record_relations", "workspace_id = $1", [workspace]), before);
    });
    test("Rejected proposal remains unapproved without an explicit link", async () => {
      const id = uuid();
      await insert("engine_relation_proposals",
        ["id", "workspace_id", "relation_definition_id", "from_record_id",
          "to_record_id", "document_id", "evidence_text", "status"],
        [id, workspace, def11, otherFrom, to2, document, "A belongs to B.", "rejected"]);
      assert.equal(await count("engine_record_relations", "source_proposal_id = $1", [id]), 0);
    });
    test("Multiple cardinality definitions are stored distinctly", async () => {
      const rows = (await q("SELECT cardinality FROM engine_relation_definitions WHERE id = ANY($1::uuid[])",
        [[def, def11, defMM]])).rows.map(r => r.cardinality).sort();
      assert.deepEqual(rows, ["many_to_many", "one_to_many", "one_to_one"]);
    });
    test("Second workspace has no test relations", async () => {
      assert.equal(await count("engine_record_relations", "workspace_id = $1", [workspace2]), 0);
    });
    for (const [name, fn] of tests) {
      await q("SAVEPOINT test_case");
      try {
        await fn();
        await q("RELEASE SAVEPOINT test_case");
        passed++;
        console.log("PASS " + name);
      } catch (error) {
        failed++;
        await q("ROLLBACK TO SAVEPOINT test_case");
        await q("RELEASE SAVEPOINT test_case");
        console.error("FAIL " + name + ": " + error.message);
      }
    }
    console.log("\n" + passed + "/" + tests.length + " database checks passed");
    if (failed) process.exitCode = 1;
  } finally {
    if (inTransaction) {
      await q("ROLLBACK");
      console.log("Fixture transaction rolled back; no test data committed.");
    }
    await client.end();
  }
}
main().catch(error => { console.error("Database tests not completed:", error.message); process.exitCode = 1; });
