import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const validation=load('lib/engine/schema-discovery/validation.ts');
const contract=load('lib/knowledge/intake/structures/contract.ts',{'@/lib/engine/schema-discovery/validation':validation});
const origin={archivoId:'file',archivo:'negocio.txt',lineaInicio:10,lineaFin:12};
const units=[{id:'u1',tipo:'catalogo',destino:'engine',contenidosDetectados:['artículos'],origen:origin,contenido:{texto:'Artículo: Raqueta\nMaterial: carbono\nCódigo: R1'}},{id:'u2',tipo:'procedimiento',destino:'knowledge',contenidosDetectados:['pasos'],origen:origin,contenido:{texto:'Abrir el local'}},{id:'u3',tipo:'mixto',destino:'hibrido',contenidosDetectados:['datos','procedimiento'],origen:origin,contenido:{texto:'Abrir el local\nArtículo: pelota\nCerrar el local'}}];
const evidence=[{documentId:'u1',quote:'Artículo: Raqueta'}];
const catalog={tables:[{id:'shared-product',key:'product',name:'Producto',description:null,version:3,fields:[{key:'name',name:'Nombre',type:'text',required:false,description:null}]}],relations:[]};
const source={id:'u1',unitId:'u1',text:units[0].contenido.texto,origen:origin};
function proposal(extra={}){return {entities:[{key:'product',name:'Producto',description:'Artículo comercial',fields:[{key:'name',name:'Nombre',type:'text',required:false,evidence:structuredClone(evidence)}],evidence:structuredClone(evidence)}],relations:[],warnings:[],pending:[],coverage:[{sourceId:'u1',tables:['product'],pendingReason:''}],...extra};}
test('routes only engine/hybrid and isolates exact structured ranges from hybrid procedures',()=>{
 assert.deepEqual(contract.structuredUnits({version:2,unidades:units}).map(u=>u.id),['u1','u3']);
 const split=contract.hybridSources([units[2]],{unidades:[{id:'u3',rangos:[{inicio:2,fin:2}],motivo:''}]});
 assert.equal(split.sources[0].text,'Artículo: pelota');assert.equal(split.sources[0].origen.lineaInicio,11);
 assert.throws(()=>contract.hybridSources([units[2]],{unidades:[{id:'u3',rangos:[{inicio:1,fin:9}],motivo:''}]}));
 assert.throws(()=>contract.hybridSources([units[2]],{unidades:[{id:'u3',rangos:[],motivo:''}]}));
});
test('reuses globally published definitions independently of workspace',()=>{
 const a=contract.validateStructureOutput(proposal(),[source],catalog,'workspace-a','batch');
 const b=contract.validateStructureOutput(proposal(),[source],catalog,'workspace-b','batch');
 assert.deepEqual(a,b);assert.equal(a.tables[0].action,'reuse');assert.equal(a.tables[0].catalogId,'shared-product');assert.equal(a.tables[0].scope,'global');assert.equal(a.recordScope,'workspace');
});
test('adds evidenced fields as a global extension without duplicating the type',()=>{
 const p=proposal();p.entities[0].fields.push({key:'material',name:'Material',type:'text',required:false,evidence:[{documentId:'u1',quote:'Material: carbono'}]});
 const result=contract.validateStructureOutput(p,[source],catalog,'w','b');
 assert.equal(result.tables.length,1);assert.equal(result.tables[0].action,'propose_extend');assert.equal(result.tables[0].fields[1].action,'propose_add');
 assert.deepEqual(result.writesPerformed,{definitions:false,records:false});
});
test('rejects catalog type changes, unsupported evidence, hidden rows and missing coverage',()=>{
 const p=proposal();p.entities[0].fields[0].type='decimal';assert.throws(()=>contract.validateStructureOutput(p,[source],catalog,'w','b'),/incompatible/);
 const q=proposal();q.entities[0].evidence=[{documentId:'u2',quote:'Abrir el local'}];assert.throws(()=>contract.validateStructureOutput(q,[source],catalog,'w','b'),/inválida/);
 const r=proposal();r.entities[0].rows=[['Raqueta']];assert.throws(()=>contract.validateStructureOutput(r,[source],catalog,'w','b'),/registros/);
 assert.throws(()=>contract.validateStructureOutput(proposal({coverage:[]}),[source],catalog,'w','b'),/cobertura/);
});
test('supports a different business domain with source-backed composition and relations',()=>{
 const s={...source,text:'Mezcla A contiene 2 kg de Mezcla B'};
 const ev=[{documentId:'u1',quote:s.text}];
 const entity=key=>({key,name:key,description:'Composición de materiales',fields:[],evidence:ev});
 const p={entities:[entity('material'),entity('composition')],relations:[{key:'composition_material',fromEntity:'composition',toEntity:'material',cardinality:'many_to_many',description:'Composición entre materiales',evidence:ev}],warnings:[],pending:[],coverage:[{sourceId:'u1',tables:['material','composition'],pendingReason:''}]};
 const result=contract.validateStructureOutput(p,[s],{tables:[],relations:[]},'w','b');assert.equal(result.tables[0].action,'propose_create');assert.equal(result.relations.length,1);
});
test('whole-batch service excludes Knowledge, uses only global catalog and retries without repeating hybrid filtering',async()=>{
 let saved;let calls=0;let fail=true;let catalogReads=0;
 const checkpoint={resultado:{version:2,loteId:'b',unidades:units},structureDiscovery:{status:'running',lease:'lease'}};
 const db={knowledge_imports:{updateMany:async args=>{saved=args.data.proposal_json;return {count:1};}},
 engine_catalog_types:{findMany:async args=>{catalogReads++;assert.equal('workspace_id' in args.where,false);return [{id:'shared-product',key:'product',name:'Producto',description:null,engine_catalog_type_versions:[{version:3,engine_catalog_fields:[{key:'name',name:'Nombre',field_type:'text',is_required:false,description:null}]}]}];}},engine_catalog_relations:{findMany:async()=>[]}};
 const service=load('lib/knowledge/intake/structures/discover.ts',{'@prisma/client':{},'@/lib/prisma':{prisma:db},'./contract':contract,'@/lib/ai/openai':{getKnowledgeImportModel:()=> 'test',getOpenAIClient:()=>({responses:{create:async request=>{
  const data=JSON.parse(request.input);assert.match(request.input,/JSON/);calls++;
  if(calls===1){assert.equal(data.data.length,1);assert.equal(data.data[0].id,'u3');return {status:'completed',output_text:JSON.stringify({unidades:[{id:'u3',rangos:[{inicio:2,fin:2}],motivo:''}]})};}
  assert.equal(data.data.sources.length,2);assert.ok(data.data.sources.every(s=>s.lines.every(l=>!l.text.includes('Abrir el local'))));
  assert.equal(data.data.catalog.tables[0].key,'product');
  if(fail)throw Error('timeout');
  const p=proposal();p.entities[0].evidence.push({documentId:'u3:span:1',quote:'Artículo: pelota'});p.coverage.push({sourceId:'u3:span:1',tables:['product'],pendingReason:''});return {status:'completed',output_text:JSON.stringify(JSON.parse(JSON.stringify(p), (key,value)=> key === 'evidence' ? value.map(e=>({documentId:e.documentId,startLine:1,endLine:1})) : value))};
 }}})}});
 await service.discoverIntakeStructures('b','w',checkpoint,'lease');assert.equal(saved.structureDiscovery.status,'error');assert.equal(saved.structureDiscovery.sources.length,2);
 fail=false;await service.discoverIntakeStructures('b','w',{...saved,structureDiscovery:{...saved.structureDiscovery,status:'running'}},'lease');
 assert.equal(saved.structureDiscovery.status,'completed');assert.equal(catalogReads,1);assert.equal(calls,3);assert.deepEqual(saved.resultado,checkpoint.resultado);
});
test('structure endpoint enforces ownership/workspace and atomically claims one execution',async()=>{
 let authenticated=true,claimCount=1,modelRuns=0,afterCalls=0,reads=0;
 const payload={resultado:{version:2,loteId:'b',unidades:[]}};
 const route=load('app/api/knowledge/intake/[importId]/structures/route.ts',{
  '@prisma/client':{},'next/server':{NextResponse:{json:(body,opts={})=>({body,status:opts.status??200})},after:()=>{afterCalls++;}},
  '@/auth':{auth:async()=>authenticated?{user:{id:'owner'}}:null},
  '@/lib/services/workspace.service':{getActiveWorkspaceContext:async()=>({activeWorkspace:{id:'workspace-a'}})},
  '@/lib/knowledge/access-control':{knowledgeLibraryWriteWhere:(userId,workspaceId)=>({owner_user_id:userId,workspace_id:workspaceId})},
  '@/lib/prisma':{prisma:{knowledge_imports:{findFirst:async args=>{reads++;assert.equal(args.where.owner_user_id,'owner');assert.equal(args.where.knowledge_libraries.workspace_id,'workspace-a');return {id:'b',status:'intake_completed',proposal_json:payload};},updateMany:async args=>{assert.deepEqual(args.where.proposal_json.equals,payload);return {count:claimCount};}}}},
  '@/lib/knowledge/intake/structures/discover':{discoverIntakeStructures:async()=>{modelRuns++;}}
 });
 const ctx={params:Promise.resolve({importId:'b'})};
 assert.equal((await route.POST({text:async()=>''},ctx)).status,202);assert.equal(afterCalls,1);
 claimCount=0;assert.equal((await route.POST({text:async()=>''},ctx)).status,409);assert.equal(afterCalls,1);
 authenticated=false;const before=reads;assert.equal((await route.POST({text:async()=>''},ctx)).status,404);assert.equal(reads,before);assert.equal(modelRuns,0);
});
test('stale worker cannot overwrite another execution',async()=>{
 const service=load('lib/knowledge/intake/structures/discover.ts',{'@prisma/client':{},'@/lib/prisma':{prisma:{}},'./contract':contract,'@/lib/ai/openai':{}});
 await service.discoverIntakeStructures('b','w',{structureDiscovery:{status:'running',lease:'new'}},'stale');
});
test('test catalog hides invoice_line and incident relations without mutating shared definitions',()=>{
 const service=load('lib/knowledge/intake/structures/discover.ts',{'@prisma/client':{},'@/lib/prisma':{prisma:{}},'./contract':contract,'@/lib/ai/openai':{}});
 const shared={tables:[{id:'invoice',key:'invoice',fields:[]},{id:'invoice-line',key:'invoice_line',fields:[]}],relations:[{key:'invoice_lines',fromEntity:'invoice',toEntity:'invoice_line'}]};
 const before=JSON.stringify(shared);
 const view=service.catalogView(shared,['invoice_line']);
 assert.deepEqual(view.tables.map(t=>t.key),['invoice']);assert.equal(view.relations.length,0);assert.equal(JSON.stringify(shared),before);
 assert.throws(()=>service.catalogView(shared,['invented']),/no existe/);
 const p=proposal();p.entities[0].key='invoice_line';p.coverage[0].tables=['invoice_line'];
 const result=contract.validateStructureOutput(p,[source],view,'w','b');
 assert.equal(result.tables[0].action,'propose_create');assert.equal(result.tables[0].catalogId,null);
});
test('uncertain ownership is represented explicitly with literal evidence, not an arbitrary new field',()=>{
 const p=proposal({pending:[{concept:'cuenta de pago',candidateTables:['product','organization'],reason:'La fuente no determina el propietario',evidence}]});
 const result=contract.validateStructureOutput(p,[source],catalog,'w','b');
 assert.equal(result.pending.length,1);assert.equal(result.tables[0].action,'reuse');assert.equal(result.version,3);
 assert.throws(()=>contract.validateStructureOutput(proposal({pending:[{...p.pending[0],evidence:[{documentId:'u1',quote:'inventado'}]}]}),[source],catalog,'w','b'),/evidencia/);
});
test('rerun can replace a completed result with different test settings but preserves prepared inputs',async()=>{
 let next;let scheduled=0;
 const payload={resultado:{version:2,loteId:'b',unidades:[]},structureDiscovery:{status:'completed',revision:3,lease:'old',excludeCatalogKeys:[],sources:[],catalog:{tables:[],relations:[]},result:{version:2}}};
 const route=load('app/api/knowledge/intake/[importId]/structures/route.ts',{
  '@prisma/client':{},'next/server':{NextResponse:{json:(body,opts={})=>({body,status:opts.status??200})},after:()=>scheduled++},
  '@/auth':{auth:async()=>({user:{id:'owner'}})},'@/lib/services/workspace.service':{getActiveWorkspaceContext:async()=>({activeWorkspace:{id:'w'}})},
  '@/lib/knowledge/access-control':{knowledgeLibraryWriteWhere:()=>({workspace_id:'w'})},
  '@/lib/prisma':{prisma:{knowledge_imports:{findFirst:async()=>({id:'b',status:'intake_completed',proposal_json:payload}),updateMany:async args=>{next=args.data.proposal_json;return {count:1};}}}},
  '@/lib/knowledge/intake/structures/discover':{DISCOVERY_REVISION:3,discoverIntakeStructures:async()=>{}}
 });
 const context={params:Promise.resolve({importId:'b'})};
 const options=async value=>route.POST({text:async()=>JSON.stringify(value)},context);
 assert.equal((await options({})).body.estado,'completed');assert.equal(scheduled,0);
 assert.equal((await options({excludeCatalogKeys:['invoice_line'],rerun:true})).status,202);
 assert.deepEqual(next.structureDiscovery.excludeCatalogKeys,['invoice_line']);assert.equal(next.structureDiscovery.result,undefined);assert.deepEqual(next.structureDiscovery.sources,[]);assert.equal(scheduled,1);
 assert.equal((await options({excludeCatalogKeys:'invoice_line'})).status,400);
});
test('server slices evidence for entities, fields, relations and pending without paraphrasing source',()=>{
 const text='Cantidad PRECIO UNITARIO TOTAL €\n2 789,26€\nCOLOR MARRÓN CHO-\nCOLATE';
 const s={...source,text};
 const range={documentId:'u1',startLine:3,endLine:4};
 const p=proposal({pending:[{concept:'concepto incierto',candidateTables:['product'],reason:'Ubicación incierta',evidence:[range]}]});
 p.entities[0].evidence=[range];p.entities[0].fields[0].evidence=[{documentId:'u1',startLine:1,endLine:2}];
 p.relations=[{key:'related_products',fromEntity:'product',toEntity:'product',cardinality:'many_to_many',description:'Vínculo',evidence:[range]}];
 const before=JSON.stringify(p);const resolved=contract.resolveStructureEvidence(p,[s]);
 assert.equal(resolved.entities[0].evidence[0].quote,'COLOR MARRÓN CHO-\nCOLATE');
 assert.equal(resolved.entities[0].fields[0].evidence[0].quote,'Cantidad PRECIO UNITARIO TOTAL €\n2 789,26€');
 assert.equal(resolved.relations[0].evidence[0].quote,'COLOR MARRÓN CHO-\nCOLATE');
 assert.equal(JSON.stringify(p),before);
 assert.equal(contract.validateStructureOutput(resolved,[s],catalog,'w','b').pending[0].evidence[0].startLine,3);
});
test('evidence resolver preserves CRLF and rejects invented source IDs, ranges, blank lines and model quotes',()=>{
 const s={...source,text:'uno\r\ndos\r\n\r\ncuatro'};
 const resolve=ref=>contract.resolveStructureEvidence({entities:[{evidence:[ref]}]},[s]).entities[0].evidence[0];
 assert.equal(resolve({documentId:'u1',startLine:1,endLine:2}).quote,'uno\r\ndos');
 for(const ref of [
  {documentId:'unknown',startLine:1,endLine:1},{documentId:'u1',startLine:0,endLine:1},
  {documentId:'u1',startLine:1,endLine:5},{documentId:'u1',startLine:2,endLine:1},
  {documentId:'u1',startLine:1.1,endLine:2},{documentId:'u1',startLine:3,endLine:3},
  {documentId:'u1',startLine:1,endLine:1,quote:'reformulado'}
 ])assert.throws(()=>resolve(ref));
});
