import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { source, extractedRows, proposal, expected } from "./fixtures/controlled-orders.fixture.mjs";

// Run the production TypeScript reconciler, not a duplicate implementation.
const filename = new URL("../lib/engine/ingestion/reconcile-preview-links.ts",import.meta.url);
const require = createRequire(import.meta.url);
const js = ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const exports = {};
new Function("exports","require",js)(exports,require);
const { reconcilePreviewLinks } = exports;
const replay = (rows=extractedRows,rels=proposal.relations) =>
  reconcilePreviewLinks(source,{...proposal,relations:rels},rows,[]);

test("fixture has 25 extracted records and every evidence appears in the source",()=>{
  assert.equal(extractedRows.length,25);
  for(const row of extractedRows) assert.ok(source.includes(row.evidence),row.entity);
});
test("offline replay yields exactly 27 source-backed relationships",()=>{
  const links = replay();
  assert.equal(links.length,27);
  for(const [key,count] of Object.entries(expected))
    assert.equal(links.filter(link=>link.relationKey===key).length,count,key);
  for(const link of links) {
    assert.ok(source.includes(link.evidence));
    assert.equal(extractedRows[link.fromRow].entity,
      proposal.relations.find(r=>r.key===link.relationKey).fromEntity);
    assert.equal(extractedRows[link.toRow].entity,
      proposal.relations.find(r=>r.key===link.relationKey).toEntity);
  }
});
test("every order line links to its exact parent order and product",()=>{
  const links = replay();
  for(const [index,row] of extractedRows.entries()){
    if(row.entity!=="order_line")continue;
    const parent=links.filter(l=>l.toRow===index&&l.relationKey==="order_to_order_line");
    assert.equal(parent.length,1,"order line "+index+" must have one parent");
    assert.equal(extractedRows[parent[0].fromRow].values.number,row.values.order_number);
    const product=links.filter(l=>l.fromRow===index&&l.relationKey==="order_line_to_product");
    assert.equal(product.length,1,"order line "+index+" must have one product");
    assert.equal(extractedRows[product[0].toRow].values.name,row.values.product_name);
  }
});
test("no business links inferred from a document header",()=>{
  assert.equal(replay().filter(l=>l.relationKey.startsWith("business_")).length,0);
});
test("no link is invented for a mismatched order identifier",()=>{
  const rows=structuredClone(extractedRows);
  const idx=rows.findIndex(r=>r.entity==="order_line");
  rows[idx].values.order_number="P-9999";
  const links=replay(rows);
  assert.equal(links.filter(l=>l.toRow===idx&&l.relationKey==="order_to_order_line").length,0);
});
test("missing evidence prevents linking",()=>{
  const rows=structuredClone(extractedRows);
  const idx=rows.findIndex(r=>r.entity==="order_line");
  rows[idx].evidence="LINE NOT PRESENT IN SOURCE";
  const links=replay(rows);
  assert.equal(links.filter(l=>l.toRow===idx||l.fromRow===idx).length,0);
});
