import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"../..");
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

function harness(f=fixture()){
  const state={types:[],fields:[],catalog:[],versions:[],bindings:[],extensions:[],records:[],revisions:[],provenance:[],relations:[],globalRelations:[],links:[],plans:[],aiCalls:0,auditValid:true,authorized:true,imported:{...f.proposal}};
  const imported={id:"import",proposal_json:f.proposal,knowledge_import_files:f.files};
  let serial=0;const id=()=>"id-"+(++serial);
  const simple=(array,defaults={})=>({
    async create({data}){const row={id:id(),...defaults,...data};array.push(row);return row;},
    async createMany({data}){for(const row of data)array.push({id:id(),...defaults,...row});return {count:data.length};},
    async findMany(){return array;},
    async findFirst({where={}}={}){return array.find(r=>Object.entries(where).every(([k,v])=>typeof v==="object"||r[k]===v))??null;},
  });
  const tx={
    async $queryRaw(q){if(q.strings.join("").includes("regexp_replace")){const [,typeId,key,value]=q.values;return state.records.filter(r=>r.object_type_id===typeId&&pure.normalizedIdentity(r.values_json[key])===value).map(r=>({id:r.id}));}return [{acquired:1}];},
    workspaces:{async findFirst(){return state.authorized?{owner_user_id:"user",workspace_members:[]}:null;}},
    knowledge_imports:{async findFirst(){return imported;}},
    knowledge_files:{async findFirst({where}){return {id:where.id,knowledge_source_id:"source"};}},
    engine_object_types:{
      async findMany(){return state.types.map(t=>({...t,engine_field_definitions:state.fields.filter(f=>f.object_type_id===t.id)}));},
      async findUnique({where}){const t=where.workspace_id_key?state.types.find(t=>t.workspace_id===where.workspace_id_key.workspace_id&&t.key===where.workspace_id_key.key):state.types.find(t=>t.id===where.id);return t?{...t,engine_field_definitions:state.fields.filter(f=>f.object_type_id===t.id)}:null;},
      async findUniqueOrThrow(args){const t=await this.findUnique(args);if(!t)throw Error("missing type");return t;},
      async create({data}){const row={id:id(),status:"active",schema_version:1,...data};state.types.push(row);return row;},
      async update({where,data}){const row=state.types.find(t=>t.id===where.id);if(data.schema_version)row.schema_version++;return row;},
    },
    engine_field_definitions:simple(state.fields,{status:"active",is_required:false}),
    engine_catalog_types:{...simple(state.catalog,{status:"active"}),async findUnique({where}){return state.catalog.find(c=>c.key===where.key)??null;},async findUniqueOrThrow(args){return this.findUnique(args);},async findMany(){return state.catalog.map(c=>({...c,engine_catalog_type_versions:state.versions.filter(v=>v.type_id===c.id)}));}},
    engine_catalog_type_versions:{async findFirst({where}){return state.versions.find(v=>v.type_id===where.type_id)??null;},async create({data}){const version={...data,engine_catalog_fields:data.engine_catalog_fields.create.map(f=>({status:"active",...f}))};state.versions.push(version);return version;}},
    engine_workspace_catalog_bindings:{...simple(state.bindings,{status:"active"}),async findUnique({where}){const w=where.workspace_id_catalog_type_id;return state.bindings.find(b=>b.workspace_id===w.workspace_id&&b.catalog_type_id===w.catalog_type_id)??null;}},
    engine_workspace_field_extensions:{...simple(state.extensions),async findUnique(){return null;}},
    engine_records:{
      async findMany({where}){assert.equal(where.workspace_id,"ws");return state.records.filter(r=>r.workspace_id===where.workspace_id&&r.object_type_id===where.object_type_id&&r.status!=="archived"&&where.OR.some(o=>o.external_key?.in?.includes(r.external_key)||o.id?.in?.includes(r.id)||o.AND?.every(a=>a.values_json&&r.values_json[a.values_json.path[0]]===a.values_json.equals)));},
      async findFirst({where}){return state.records.find(r=>r.id===where.id&&r.workspace_id===where.workspace_id)??null;},
      async create({data}){const row={id:id(),...data};state.records.push(row);return row;},
      async update({where,data}){const row=state.records.find(r=>r.id===where.id);Object.assign(row,{...data,revision:row.revision+1});return row;},
    },
    engine_record_revisions:{async findFirst({where}){return state.revisions.find(r=>r.record_id===where.record_id&&r.revision===where.revision)??null;},async createMany({data}){state.revisions.push(...data);}},
    engine_record_provenance:simple(state.provenance),
    engine_catalog_relations:simple(state.globalRelations,{status:"active"}),
    engine_relation_definitions:{...simple(state.relations,{status:"active"}),async findUnique({where}){return state.relations.find(r=>r.key===where.workspace_id_key.key)??null;}},
    engine_record_relations:{...simple(state.links),async findFirst(){return null;},async createMany({data}){for(const row of data)if(!state.links.some(l=>l.relation_definition_id===row.relation_definition_id&&l.from_record_id===row.from_record_id&&l.to_record_id===row.to_record_id))state.links.push(row);}},
    engine_import_plans:{
      async findUnique(){return state.plans[0]??null;},
      async upsert({create,update}){if(state.plans[0])Object.assign(state.plans[0],update);else state.plans.push({id:id(),...create});return state.plans[0];},
      async updateMany({where,data}){const row=state.plans.find(p=>p.id===where.id&&p.status===where.status&&p.plan_hash===where.plan_hash);if(row)Object.assign(row,data);return {count:row?1:0};},
      async update({where,data}){Object.assign(state.plans.find(p=>p.id===where.id),data);},
    },
  };
  const prisma={...tx,async $transaction(fn){const backup=structuredClone(state);try{return await fn(tx);}catch(e){for(const k of Object.keys(state)){if(Array.isArray(state[k]))state[k].splice(0,Infinity,...backup[k]);else state[k]=backup[k];}throw e;}}};
  const api=loader({"@/lib/prisma":{prisma},"@/lib/ai/openai":{getKnowledgeImportModel:()=>"test",getOpenAIClient:()=>({responses:{async create(args,options){state.aiCalls++;assert.match(args.input,/json/i);assert.equal(options.maxRetries,0);return {status:"completed",output_text:JSON.stringify(state.aiCalls%2===1?f.plan:{valid:state.auditValid,issues:state.auditValid?[]:["swapped parties"]})};}}})}})("lib/engine/knowledge-engine-import.service.ts");
  const scope={importId:"import",workspaceId:"ws",userId:"user"};
  const documents=f.files.map(file=>({importFileId:file.id,knowledgeFileId:"knowledge-"+file.id,articleId:"source"}));
  return {api,state,prisma,tx,scope,documents,f,imported};
}

test("preview restores relational tables without writing schemas, records or links",async()=>{
  const h=harness();const preview=await h.api.previewKnowledgeEngine(h.scope);
  assert.equal(preview.status,"ready");assert.equal(preview.recordsToInsert,9);assert.equal(preview.recordsToReuse,3);
  assert.deepEqual(preview.tables.map(t=>t.key),["company","invoice"]);
  assert.equal(preview.relations.length,2);assert.equal(h.state.records.length,0);assert.equal(h.state.types.length,0);assert.equal(h.state.catalog.length,0);assert.equal(h.state.links.length,0);
  assert.equal(h.state.aiCalls,2);await h.api.previewKnowledgeEngine(h.scope);assert.equal(h.state.aiCalls,2,"cached reviewed plan is reused without another model call");
});

test("confirmation persists global structures, private companies and invoices, eight relations and provenance",async()=>{
  const h=harness();await h.api.previewKnowledgeEngine(h.scope);
  const prepared=await h.api.validatePreparedEnginePlan({...h.scope,proposal:h.f.proposal,files:h.f.files});
  const result=await h.prisma.$transaction(tx=>h.api.commitPreparedEngine(tx,{...h.scope,prepared,documents:h.documents,skippedDocuments:[]}));
  assert.equal(h.state.catalog.length,2);assert.equal(h.state.bindings.length,2);assert.equal(h.state.globalRelations.length,2);
  assert.equal(h.state.records.length,9);assert.equal(h.state.links.length,8);
  assert.equal(result.reduce((n,r)=>n+r.recordsCreated,0),9);
  assert.ok(h.state.records.every(r=>r.workspace_id==="ws"));
  assert.equal(h.state.records.filter(r=>r.values_json.tax_id==="B72378581").length,1);
  assert.ok(h.state.provenance.some(p=>p.field_key==="relation:invoice_customer"));
  assert.equal(h.state.plans[0].status,"completed");
  await assert.rejects(()=>h.prisma.$transaction(tx=>h.api.commitPreparedEngine(tx,{...h.scope,prepared,documents:h.documents,skippedDocuments:[]})),/ya se confirmó|cambió/);
  assert.equal(h.state.records.length,9);
});

test("semantic audit catches party swaps even though both names and IDs occur literally",async()=>{
  const h=harness();h.state.auditValid=false;
  await assert.rejects(()=>h.api.previewKnowledgeEngine(h.scope),/swapped parties/);
  assert.equal(h.state.plans.length,0);assert.equal(h.state.records.length,0);
});

test("changed source, lost permissions and missing original each prevent writes",async()=>{
  const h=harness();await h.api.previewKnowledgeEngine(h.scope);
  const prepared=await h.api.validatePreparedEnginePlan({...h.scope,proposal:h.f.proposal,files:h.f.files});
  h.f.files[0].extracted_text+="modified";
  await assert.rejects(()=>h.api.validatePreparedEnginePlan({...h.scope,proposal:h.f.proposal,files:h.f.files}),/cambiaron/);
  h.f.files[0].extracted_text=h.f.files[0].extracted_text.replace("modified","");
  h.state.authorized=false;
  await assert.rejects(()=>h.prisma.$transaction(tx=>h.api.commitPreparedEngine(tx,{...h.scope,prepared,documents:h.documents,skippedDocuments:[]})),/permisos/);
  h.state.authorized=true;
  await assert.rejects(()=>h.prisma.$transaction(tx=>h.api.commitPreparedEngine(tx,{...h.scope,prepared,documents:[],skippedDocuments:[]})),/original/);
  assert.equal(h.state.types.length,0);assert.equal(h.state.records.length,0);assert.equal(h.state.plans[0].status,"ready");
});

test("reimport reuses companies, invoices, global schemas and concrete links",async()=>{
  const h=harness();await h.api.previewKnowledgeEngine(h.scope);
  const prepared=await h.api.validatePreparedEnginePlan({...h.scope,proposal:h.f.proposal,files:h.f.files});
  await h.prisma.$transaction(tx=>h.api.commitPreparedEngine(tx,{...h.scope,prepared,documents:h.documents,skippedDocuments:[]}));
  h.state.plans=[];h.state.aiCalls=0;
  const preview=await h.api.previewKnowledgeEngine({...h.scope,importId:"second"});
  assert.equal(preview.recordsToInsert,0);assert.equal(preview.recordsToReuse,12);
  const again=await h.api.validatePreparedEnginePlan({...h.scope,importId:"second",proposal:h.f.proposal,files:h.f.files});
  await h.prisma.$transaction(tx=>h.api.commitPreparedEngine(tx,{...h.scope,importId:"second",prepared:again,documents:h.documents,skippedDocuments:[]}));
  assert.equal(h.state.records.length,9);assert.equal(h.state.links.length,8);assert.equal(h.state.catalog.length,2);assert.equal(h.state.globalRelations.length,2);
});

test("legacy invoice external keys are reused and enriched, not duplicated",async()=>{
  const h=harness(fixture(1));
  const type={id:"invoice-type",workspace_id:"ws",key:"invoice",status:"active",schema_version:1};h.state.types.push(type);
  h.state.fields.push(...h.f.plan.schema.entities.find(e=>e.key==="invoice").fields.map(f=>({id:f.key,object_type_id:type.id,key:f.key,name:f.name,field_type:f.type,status:"active",is_required:false})));
  const key="invoice:"+require("node:crypto").createHash("sha256").update(h.f.files[0].extracted_text).digest("hex");
  h.state.records.push({id:"old",workspace_id:"ws",object_type_id:type.id,external_key:key,values_json:{invoice_number:"F-0",total_amount:100},revision:1,schema_version:1,status:"draft"});
  const preview=await h.api.previewKnowledgeEngine(h.scope);assert.equal(preview.recordsToUpdate,1);
  const prepared=await h.api.validatePreparedEnginePlan({...h.scope,proposal:h.f.proposal,files:h.f.files});
  await h.prisma.$transaction(tx=>h.api.commitPreparedEngine(tx,{...h.scope,prepared,documents:[],skippedDocuments:[{importFileId:"f0",existingKnowledgeFileId:"original-file"}]}));
  assert.equal(h.state.records.filter(r=>r.object_type_id===type.id).length,1);
  assert.equal(h.state.records.find(r=>r.id==="old").values_json.issue_date,"2026-02-12");
  assert.equal(h.state.links.length,2);
});

test("private company values cannot leak into reusable catalog labels",()=>{
  const f=fixture();f.plan.schema.entities[0].name="PLOCIA SL B72378581";
  assert.throws(()=>pure.validateEngineBatchPlan(f.plan,f.files,"ws"),/privados/);
});

test("the same invoice number from different issuers remains separate",async()=>{
  const f=fixture(2);
  f.files[1].extracted_text=f.files[1].extracted_text.replaceAll("F-1","F-0");
  f.plan.rows.find(r=>r.id==="invoice1").values.invoice_number="F-0";
  f.plan.rows.find(r=>r.id==="invoice1").evidence.invoice_number="FACTURA F-0";
  f.plan.links.filter(l=>l.documentId==="f1").forEach(l=>l.evidence=f.files[1].extracted_text);
  f.proposal.globalImportMap.batchReview.sourceFingerprint=review.importBatchFingerprint(f.proposal.globalImportMap,f.files);
  f.plan.sourceFingerprint=pure.sourceFingerprint(f.files,f.proposal);
  const h=harness(f);const preview=await h.api.previewKnowledgeEngine(h.scope);
  assert.equal(preview.records.filter(r=>r.entity==="invoice"&&r.action==="insert").length,2);
});

test("natural identities preserve punctuation and numeric meaning outside fiscal IDs",()=>{
  const row={entity:"product",identityFields:["code"],values:{code:"A-B"}};
  assert.notEqual(pure.batchRowIdentity(row),pure.batchRowIdentity({...row,values:{code:"AB"}}));
  assert.notEqual(pure.batchRowIdentity({...row,values:{code:1.2}}),pure.batchRowIdentity({...row,values:{code:12}}));
  assert.equal(pure.batchRowIdentity({entity:"product",identityFields:["a","b"],values:{a:"1",b:"2"}}),pure.batchRowIdentity({entity:"product",identityFields:["b","a"],values:{a:"1",b:"2"}}));
});

test("required published catalog fields cannot be omitted by the discovered schema",async()=>{
  const h=harness(fixture(1));h.state.catalog.push({id:"standard",key:"invoice",status:"active"});
  h.state.versions.push({type_id:"standard",version:1,status:"published",engine_catalog_fields:[{key:"due_date",field_type:"date",is_required:true,status:"active"}]});
  await assert.rejects(()=>h.api.previewKnowledgeEngine(h.scope),/no cumple el estándar/);
  assert.equal(h.state.plans.length,0);
});
