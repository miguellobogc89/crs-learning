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

const schemaFilename = new URL("../lib/engine/ingestion/build-preview-schema.ts",import.meta.url);
const schemaJs = ts.transpileModule(fs.readFileSync(schemaFilename,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const schemaExports = {};
new Function("exports","require",schemaJs)(schemaExports,require);
const { buildPreviewSchema, normalizePreviewRows } = schemaExports;
test("schema infers dates, decimal amounts and integer quantities from text",()=>{
  const rows=[{entity:"transaction",evidence:"05/10/2026 12.50 40 REF-40",values:{
    date:"05/10/2026",total:"12.50",units:"40",code:"REF-40"}}];
  const proposed=buildPreviewSchema({documentId:"test",text:rows[0].evidence,
    existing:{entities:[],relations:[]},prior:null,rows});
  const fields=Object.fromEntries(proposed.entities[0].fields.map(f=>[f.key,f.type]));
  assert.deepEqual(fields,{date:"date",total:"decimal",units:"integer",code:"text"});
  const normalized=normalizePreviewRows(rows,proposed);
  assert.equal(normalized[0].values.total,12.5);
  assert.equal(normalized[0].values.units,40);
  assert.equal(normalized[0].values.date,"05/10/2026");
});
test("removes redundant many-to-many shortcut when a record-bearing intermediary exists",()=>{
  const rows=["order","order_line","product"].map(entity=>({entity,values:{name:entity},evidence:entity}));
  const relations=[
    ["order","order_line","one_to_many"],
    ["product","order_line","one_to_many"],
    ["order","product","many_to_many"],
  ].map(([fromConcept,toConcept,cardinality])=>({fromConcept,toConcept,cardinality,evidence:fromConcept}));
  const proposed=buildPreviewSchema({documentId:"test",text:"order order_line product",
    existing:{entities:[],relations:[]},prior:{structures:null,relationships:{relations}},rows});
  assert.equal(proposed.relations.length,2);
  assert.ok(!proposed.relations.some(r=>r.fromEntity==="order"&&r.toEntity==="product"));
});
test("keeps direct many-to-many when no documented intermediary exists",()=>{
  const rows=["author","book"].map(entity=>({entity,values:{name:entity},evidence:entity}));
  const proposed=buildPreviewSchema({documentId:"test",text:"author book",
    existing:{entities:[],relations:[]},prior:{structures:null,relationships:{relations:[
      {fromConcept:"author",toConcept:"book",cardinality:"many_to_many",evidence:"author"}]}},rows});
  assert.equal(proposed.relations.length,1);
});

test("links labelled recipient businesses to five orders, never the issuing company",()=>{
  const recipients=[
    ["Ferretería Sol","C-01"],["Taller Norte","C-02"],["Obras Vega","C-03"],
  ];
  const issuer={entity:"business",values:{name:"Comercial Albor"},
    evidence:"Comercial Albor - Copias de pedidos"};
  const companies=recipients.map(([name,code])=>({entity:"business",values:{name},
    evidence:`Destinatario: ${name} | Código cliente: ${code}`}));
  const orders=[["P-1001",0],["P-1002",1],["P-1003",0],["P-1004",2],["P-1005",1]]
    .map(([number,recipient])=>({entity:"order",values:{order_number:number},
      evidence:`Pedido ${number}\\n${companies[recipient].evidence}\\nTOTAL 10.00`}));
  const rows=[issuer,...companies,...orders];
  const document=rows.map(row=>row.evidence).join("\\n");
  const relation={key:"business_to_order",fromEntity:"business",toEntity:"order"};
  const links=reconcilePreviewLinks(document,{entities:[],relations:[relation],warnings:[]},rows,[]);
  assert.equal(links.length,5);
  assert.ok(links.every(link=>link.fromRow>0));
  assert.deepEqual(links.map(link=>[rows[link.fromRow].values.name,rows[link.toRow].values.order_number]),[
    ["Ferretería Sol","P-1001"],["Ferretería Sol","P-1003"],
    ["Taller Norte","P-1002"],["Taller Norte","P-1005"],["Obras Vega","P-1004"],
  ]);
});

test("empty Engine discovers both missing junction edges from extracted identifiers",()=>{
  const document = [
    "Destinatario: Ferretería Sol | Código cliente: C-01",
    "Pedido P-1001 | 05/10/2026",
    "A-10 Tornillo M6 0.25 40 10.00",
    "A-20 Arandela M6 0.10 40 4.00",
    "Pedido P-1002 | 06/10/2026",
    "A-10 Tornillo M6 0.25 80 20.00",
  ].join("\\n");
  const rows = [
    {entity:"customer",values:{customer_code:"C-01",customer_name:"Ferretería Sol"},evidence:"Destinatario: Ferretería Sol | Código cliente: C-01"},
    {entity:"product",values:{product_ref:"A-10",article:"Tornillo M6"},evidence:"A-10 Tornillo M6 0.25 40 10.00"},
    {entity:"product",values:{product_ref:"A-20",article:"Arandela M6"},evidence:"A-20 Arandela M6 0.10 40 4.00"},
    {entity:"order",values:{order_number:"P-1001",customer_code:"C-01"},evidence:"Pedido P-1001 | 05/10/2026\\nA-10 Tornillo M6 0.25 40 10.00\\nA-20 Arandela M6 0.10 40 4.00"},
    {entity:"order",values:{order_number:"P-1002",customer_code:"C-01"},evidence:"Pedido P-1002 | 06/10/2026\\nA-10 Tornillo M6 0.25 80 20.00"},
    {entity:"order_line",values:{order_number:"P-1001",product_ref:"A-10"},evidence:"A-10 Tornillo M6 0.25 40 10.00"},
    {entity:"order_line",values:{order_number:"P-1001",product_ref:"A-20"},evidence:"A-20 Arandela M6 0.10 40 4.00"},
    {entity:"order_line",values:{order_number:"P-1002",product_ref:"A-10"},evidence:"A-10 Tornillo M6 0.25 80 20.00"},
  ];
  const prior = {structures:null,relationships:{relations:[
    {fromConcept:"customer",toConcept:"order",cardinality:"one_to_many",evidence:rows[0].evidence},
    {fromConcept:"order",toConcept:"product",cardinality:"one_to_many",evidence:rows[3].evidence},
  ]}};
  const schema=buildPreviewSchema({documentId:"test",text:document,existing:{entities:[],relations:[]},prior,rows});
  assert.deepEqual(schema.relations.map(r=>r.key).sort(),[
    "customer_to_order","order_line_to_product","order_to_order_line"
  ].sort());
  const links=reconcilePreviewLinks(document,schema,normalizePreviewRows(rows,schema),[]);
  assert.equal(links.filter(l=>l.relationKey==="order_to_order_line").length,3);
  assert.equal(links.filter(l=>l.relationKey==="order_line_to_product").length,3);
});
