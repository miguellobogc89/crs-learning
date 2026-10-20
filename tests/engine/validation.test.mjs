import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../lib/engine/validation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { validateEngineRecordValues: validate } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

const field = (key, field_type, is_required = false, configuration = {}) => ({
  key, field_type, is_required, configuration, status: "active",
});

test("accepts valid typed snapshot", () => {
  const fields = [
    field("name", "text", true),
    field("amount", "decimal", true),
    field("paid", "boolean"),
    field("issued", "date"),
  ];
  assert.deepEqual(validate({
    name: "Factura", amount: "120.35", paid: false, issued: "2026-10-20",
  }, fields), {
    ok: true,
    values: { name: "Factura", amount: "120.35", paid: false, issued: "2026-10-20" },
  });
});

test("rejects unknown fields", () => {
  const result = validate({ name: "ok", injected: "x" }, [field("name", "text")]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "unknown_field"));
});

test("rejects missing required fields", () => {
  const result = validate({}, [field("amount", "decimal", true)]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "required"));
});

test("rejects invalid integer, calendar date, and enum", () => {
  const result = validate({
    count: 2.5, issued: "2026-02-30", status: "unknown",
  }, [
    field("count", "integer"),
    field("issued", "date"),
    field("status", "enum", false, { options: ["paid", "pending"] }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.issues.filter((issue) => issue.code === "invalid_type").length, 2);
  assert.ok(result.issues.some((issue) => issue.code === "invalid_option"));
});

test("rejects unsupported database field types", () => {
  const result = validate({ unusual: "x" }, [field("unusual", "unrecognized")]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "unsupported_type"));
});

test("does not accept inactive fields", () => {
  const result = validate({ old: "value" }, [{ ...field("old", "text"), status: "archived" }]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "unknown_field"));
});
