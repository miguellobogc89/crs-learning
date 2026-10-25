import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
function loader(mocks={}){
  const cache=new Map();
  function load(filename){
    filename=path.resolve(root,filename);
    if(cache.has(filename))return cache.get(filename).exports;
    const module={exports:{}};cache.set(filename,module);
    const js=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    new Function("require","module","exports",js)(id=>{
      if(id in mocks)return mocks[id];
      if(id==="@prisma/client")return {Prisma:{sql:(strings,...values)=>({strings,values})}};
      if(id==="@/lib/prisma")return {prisma:{}};
      if(id==="@/lib/ai/openai")return {};
      if(id.endsWith("schema-discovery/discover.service"))return {SCHEMA_DISCOVERY_INSTRUCTIONS:"Discover evidence-backed JSON schema"};
      if(id.startsWith("."))return load(path.resolve(path.dirname(filename),id+".ts"));
      if(id.startsWith("@/"))return load(id.slice(2)+".ts");
      return require(id);
    },module,module.exports);
    return module.exports;
  }
  return load;
}
const pure=loader()("lib/engine/knowledge-engine-plan.ts");
const review=loader()("lib/knowledge/import/review-import-batch.ts");
function fixture(count=4){
  const files=[],rows=[],links=[];
  for(let i=0;i<count;i++){
    const text=`FACTURA F-${i}\nEMISOR: Proveedor ${i} SL CIF B1111111${i}\nCLIENTE: PLOCIA SL CIF B72378581\nTOTAL 100,00\n12/02/2026\n`;
    const file={id:"f"+i,file_name:`factura-${i}.pdf`,status:"text_ready",content_hash:null,extracted_text:text};files.push(file);
    rows.push({id:"issuer"+i,entity:"company",documentId:file.id,values:{legal_name:`Proveedor ${i} SL`,tax_id:`B1111111${i}`},evidence:{legal_name:`EMISOR: Proveedor ${i} SL CIF B1111111${i}`,tax_id:`CIF B1111111${i}`},identityFields:["tax_id"]});
    rows.push({id:"buyer"+i,entity:"company",documentId:file.id,values:{legal_name:"PLOCIA SL",tax_id:"B72378581"},evidence:{legal_name:"CLIENTE: PLOCIA SL CIF B72378581",tax_id:"CIF B72378581"},identityFields:["tax_id"]});
    rows.push({id:"invoice"+i,entity:"invoice",documentId:file.id,values:{invoice_number:`F-${i}`,total_amount:100,issue_date:"2026-02-12"},evidence:{invoice_number:`FACTURA F-${i}`,total_amount:"TOTAL 100,00",issue_date:"12/02/2026"},identityFields:["invoice_number"]});
    for(const [relationKey,to] of [["invoice_issuer","issuer"+i],["invoice_customer","buyer"+i]])links.push({relationKey,from:to,to:"invoice"+i,documentId:file.id,evidence:text});
  }
  const evidence=[{documentId:files[0].id,quote:files[0].extracted_text}];
  const field=(key,type)=>({key,name:key,type,required:false,evidence});
  const schema={entities:[{key:"company",name:"Empresas",description:"",fields:[field("legal_name","text"),field("tax_id","text")],evidence},
    {key:"invoice",name:"Facturas",description:"",fields:[field("invoice_number","text"),field("total_amount","decimal"),field("issue_date","date")],evidence}],
    relations:["invoice_issuer","invoice_customer"].map(key=>({key,fromEntity:"company",toEntity:"invoice",cardinality:"one_to_many",description:key,evidence})),warnings:[]};
  const inventory={version:"crs-import-map-v3",files:files.map(f=>({fileId:f.id,status:"completed"})),documents:files.map(f=>({id:f.id+"doc",fileId:f.id,title:"Factura",type:"factura",category:"compras",startLine:1,endLine:5}))};
  inventory.batchReview={status:"reviewed",sourceFingerprint:review.importBatchFingerprint(inventory,files),groups:[]};
  const proposal={folders:[],articles:[],warnings:[],globalImportMap:inventory,documentRoutes:Object.fromEntries(files.map(f=>[f.id,{knowledge:true,articleCandidate:false,structuredCandidate:true}]))};
  const plan={kind:"knowledge_relational_import_v1",schema,rows,links,sourceFingerprint:pure.sourceFingerprint(files,proposal)};
  return {files,proposal,plan};
}

test("four invoices discover five unique companies and eight source-backed party links",()=>{
  const f=fixture();const plan=pure.validateEngineBatchPlan(f.plan,f.files,"ws");
  assert.equal(plan.rows.filter(r=>r.entity==="invoice").length,4);
  assert.equal(new Set(plan.rows.filter(r=>r.entity==="company").map(pure.batchRowIdentity)).size,5);
  assert.equal(plan.links.length,8);
});
for(const [name,mutate] of [
  ["missing customer",f=>f.plan.links.pop()],
  ["company deduplication by name",f=>{f.plan.rows[0].identityFields=["legal_name"];}],
  ["fabricated field value",f=>{f.plan.rows[0].values.legal_name="Invented SL";}],
  ["phone number as fiscal ID",f=>{f.plan.rows[0].values.tax_id="900525534";}],
  ["cross-document link",f=>{f.plan.links[0].documentId="f1";}],
  ["quote not proving both endpoints",f=>{f.plan.links[0].evidence="TOTAL 100,00";}],
  ["unsupported invoice total",f=>{f.plan.rows[2].values.total_amount=999;}],
  ["same issuer and customer",f=>{f.plan.links[1].from="issuer0";}],
  ["unknown source",f=>{f.plan.rows[0].documentId="other-workspace";}],
  ["unknown schema field",f=>{f.plan.rows[0].values.extra="Unsupported";}],
])test("blocks "+name,()=>{const f=fixture();mutate(f);assert.throws(()=>pure.validateEngineBatchPlan(f.plan,f.files,"ws"),/Engine:/);});

test("a general entity and parent-scoped line are supported, not just invoice headers",()=>{
  const f=fixture(1),doc=f.files[0];doc.extracted_text+="Producto: Lona\nPrecio 20,00\n";
  const ev=[{documentId:doc.id,quote:"Producto: Lona"}];
  f.plan.schema.entities.push({key:"invoice_line",name:"Líneas",description:"",fields:[{key:"description",name:"Concepto",type:"text",required:false,evidence:ev}],evidence:ev});
  f.plan.schema.relations.push({key:"invoice_line_invoice",fromEntity:"invoice_line",toEntity:"invoice",cardinality:"many_to_many",description:"detalle",evidence:[{documentId:doc.id,quote:doc.extracted_text}]});
  f.plan.rows.push({id:"line",entity:"invoice_line",documentId:doc.id,values:{description:"Lona"},evidence:{description:"Producto: Lona"},identityFields:["description"],identityParent:"invoice0"});
  f.plan.links.push({from:"line",to:"invoice0",relationKey:"invoice_line_invoice",documentId:doc.id,evidence:doc.extracted_text});
  assert.equal(pure.validateEngineBatchPlan(f.plan,f.files,"ws").rows.length,4);
  delete f.plan.rows.at(-1).identityParent;
  assert.throws(()=>pure.validateEngineBatchPlan(f.plan,f.files,"ws"),/padre/);
});

test("fingerprints survive JSONB ordering but change with source, routes or schema decisions",()=>{
  const f=fixture();const fp=pure.sourceFingerprint(f.files,f.proposal);
  assert.equal(fp,pure.sourceFingerprint([...f.files].reverse(),JSON.parse(JSON.stringify(f.proposal))));
  f.files[0].extracted_text+="changed";assert.notEqual(fp,pure.sourceFingerprint(f.files,f.proposal));
});

// The previewKnowledgeEngine/commit integration tests that lived here exercised
// the v1 preview (quoted schema, single-quote links, LLM audit), removed in
// phase 1. The pure plan validator below is still used by the legacy commit
// (lib/engine/knowledge-engine-import.service.ts) until phase 4 replaces it.
// The new line is covered by tests/engine/knowledge-preview.test.mjs.

test("private company values cannot leak into reusable catalog labels",()=>{
  const f=fixture();f.plan.schema.entities[0].name="PLOCIA SL B72378581";
  assert.throws(()=>pure.validateEngineBatchPlan(f.plan,f.files,"ws"),/privados/);
});
test("private company values cannot leak into shared schema descriptions",()=>{
  const f=fixture();f.plan.schema.entities[0].description="Facturas emitidas a PLOCIA SL B72378581";
  assert.throws(()=>pure.validateEngineBatchPlan(f.plan,f.files,"ws"),/privados/);
});
test("short private company names cannot leak into shared schema descriptions",()=>{
  const f=fixture();f.plan.schema.entities[0].description="Cliente PLOCIA";
  assert.throws(()=>pure.validateEngineBatchPlan(f.plan,f.files,"ws"),/privados/);
});
test("natural identities preserve punctuation and numeric meaning outside fiscal IDs",()=>{
  const row={entity:"product",identityFields:["code"],values:{code:"A-B"}};
  assert.notEqual(pure.batchRowIdentity(row),pure.batchRowIdentity({...row,values:{code:"AB"}}));
  assert.notEqual(pure.batchRowIdentity({...row,values:{code:1.2}}),pure.batchRowIdentity({...row,values:{code:12}}));
  assert.equal(pure.batchRowIdentity({entity:"product",identityFields:["a","b"],values:{a:"1",b:"2"}}),pure.batchRowIdentity({entity:"product",identityFields:["b","a"],values:{a:"1",b:"2"}}));
});

