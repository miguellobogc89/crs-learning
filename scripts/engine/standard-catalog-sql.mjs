// Writes scripts/neon/20261027_standard_catalog.sql from lib/engine/catalog/standard-catalog.ts.
// Usage: npm run engine:standard-catalog-sql   (then run the .sql file in the Neon SQL Editor)
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
const load = (file, deps = {}) => {
  const m = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(n => deps[n], m, m.exports);
  return m.exports;
};
const catalog = load("lib/engine/catalog/standard-catalog.ts");
const { standardCatalogSql } = load("lib/engine/catalog/standard-catalog-sql.ts", { "./standard-catalog": catalog });
export const OUTPUT = "scripts/neon/20261027_standard_catalog.sql";
writeFileSync(OUTPUT, standardCatalogSql());
console.log(`Escrito ${OUTPUT}`);
