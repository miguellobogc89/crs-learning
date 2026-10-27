import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const conv=load('lib/knowledge/intake/writer/convert.ts');
const cat=load('lib/engine/catalog/standard-catalog.ts');
const rc=load('lib/knowledge/intake/reconciliation/contract.ts');
const planner=load('lib/knowledge/intake/writer/plan.ts',{'@/lib/engine/catalog/standard-catalog':cat,'./convert':conv,'../reconciliation/contract':rc});
const commit=load('lib/knowledge/intake/writer/commit.ts',{'@prisma/client':{Prisma:{sql:(s,...v)=>({s,v})}}});

test('printed amounts become exact decimal strings; ambiguous ones are not guessed',()=>{
 const d=(t,o)=>{const r=conv.toDecimal(t,o);return r.ok?r.value:null;};
 assert.equal(d('31,4049 €'),'31.4049');assert.equal(d('1.234,56'),'1234.56');assert.equal(d('1,234.56'),'1234.56');
 assert.equal(d('21.00 %'),'21.00');assert.equal(d('4%'),'4');assert.equal(d('-5,00'),'-5.00');assert.equal(d('5,00-'),'-5.00');
 assert.equal(d('55.061'),'55061','a dot before three digits is thousands in a comma-decimal document');
 assert.equal(d('55.061',{commaDecimals:false}),null,'…and ambiguous otherwise');
 assert.equal(d('12,000 kW'),'12.000');assert.equal(d('EUR'),null);assert.equal(d('IVA (21,00 %) sobre 31,40 €'),null);
 assert.equal(conv.usesCommaDecimals(['38,00 €','21.00']),true);assert.equal(conv.usesCommaDecimals(['1.50','2.75','3,10']),false);
});

test('printed dates become ISO; a missing year comes from the invoice date and is flagged',()=>{
 const t=(x,ref)=>conv.toDate(x,ref);
 assert.equal(t('27/01/2026').value,'2026-01-27');assert.equal(t('04 de Enero de 2026').value,'2026-01-04');assert.equal(t('2 Febrero 2026').value,'2026-02-02');
 assert.equal(t('2026-01-27').value,'2026-01-27');assert.equal(t('27-01-26').value,'2026-01-27');assert.equal(t('31/02/2026').ok,false);
 const dec=t('17 Dic','2026-01-04');assert.equal(dec.value,'2025-12-17');assert.match(dec.inferred,/deducido/);
 assert.equal(t('18 Mar','2026-05-04').value,'2026-03-18');assert.equal(t('17 Dic').ok,false,'no year and no reference: not guessed');
});

// Synthetic batch (no customer data): one supplier invoice with lines, a misread recipient id, a repeated invoice.
const v=(valor,pagina=1)=>({valor,pagina});
const part=(id,ents,subtipo='compra_articulos')=>({parteId:id,modo:'dirigida',tipo:'factura',subtipo,paginas:[1],conjunto:[],motivo:'',entidades:ents});
const extraction={module:'targeted_extraction',version:1,loteId:'b',archivos:[
 {archivoId:'f1',archivo:'compra.pdf',incidencias:[],partes:[part('p1',{invoice:{invoice_number:v('F-1'),issue_date:v('27/01/2026'),subtotal:v('100,00'),total_amount:v('121,00 €')},
  issuer:{legal_name:v('PROVEEDOR DEMO SL'),tax_id:v('B-00000000'),address:v(null)},recipient:{legal_name:v('CLIENTE DEMO'),tax_id:v('12345678Z')},
  lines:[{description:v('LECHE'),quantity:v('2'),line_total:v('1.234,50'),source_ticket_date:v('10/01/2026')},{description:v(null),quantity:v(null)}],
  tax_breakdown:[{tax_rate:v('IVA 21% sobre 100'),tax_amount:v('21,00')}]})]},
 {archivoId:'f2',archivo:'otra.pdf',incidencias:[],partes:[part('p1',{invoice:{invoice_number:v('F-2'),issue_date:v('2 Febrero 2026')},
  issuer:{legal_name:v('PROVEEDOR DEMO, S.L.'),tax_id:v('B00000000')},recipient:{legal_name:v('CLIENTE DEMO SL'),tax_id:v('1234S678Z')},
  supply:{supply_point_id:v('ES00 0000'),period_start:v('18 Dic'),period_end:v('17 Ene')}},'suministro_electricidad')]}]};
const reconcile=(existing={})=>{const g=rc.groupEntities(extraction);
 return rc.applyLookups('b',g,new Map(['company','invoice','supply_point','telecom_line'].map(t=>[t,{tipoDefinido:true,completo:true,candidatos:new Map(Object.entries(existing[t]??{}))}])));};

test('plan: typed values with printed evidence, details under their invoice, relations owner → owned, blocked until decided',()=>{
 const rec=reconcile();
 const plan=planner.buildWritePlan(extraction,rec);
 const by=ref=>plan.registros.find(r=>r.ref===ref);
 const inv=by('invoice:B00000000/F-1');
 assert.deepEqual(inv.valores,{invoice_number:'F-1',issue_date:'2026-01-27',net_amount:'100.00',total_amount:'121.00'});
 assert.equal(inv.evidencias.find(e=>e.campo==='net_amount').impreso,'100,00');
 const supplier=by('company:B00000000');assert.equal(supplier.valores.tax_identifier,'B00000000','identifier stored comparable');
 assert.equal(supplier.valores.legal_name,'PROVEEDOR DEMO SL','first printed value wins');assert.equal(supplier.evidencias.find(e=>e.campo==='tax_identifier').impreso,'B-00000000');
 const lines=plan.registros.filter(r=>r.tipo==='invoice_line');assert.equal(lines.length,1,'empty rows are not records');
 assert.deepEqual(lines[0].valores,{description:'LECHE',quantity:'2',line_total:'1234.50',source_ticket_date:'2026-01-10'});assert.equal(lines[0].padre,'invoice:B00000000/F-1');
 assert.deepEqual(plan.registros.find(r=>r.tipo==='invoice_tax_line').noConvertidos.map(n=>n.campo),['tax_rate'],'not convertible: kept out, reported');
 const inv2=by('invoice:B00000000/F-2');assert.equal(inv2.valores.period_start,'2025-12-18','billed period goes to the invoice, year from its date');
 assert.equal(by('supply_point:ES000000').valores.supply_type,'electricidad');
 const rel=(k,d,h)=>plan.relaciones.some(r=>r.relacion===k&&r.desde===d&&r.hacia===h);
 assert.ok(rel('invoice_issuer','company:B00000000','invoice:B00000000/F-1'));assert.ok(rel('invoice_lines','invoice:B00000000/F-1',lines[0].ref));
 assert.ok(rel('invoice_supply_point','supply_point:ES000000','invoice:B00000000/F-2'));
 // The misread recipient (S read for 5) needs a decision.
 const wrong=by('company:1234S678Z');assert.equal(wrong.accion,'bloqueado');assert.deepEqual(wrong.bloqueo.opciones,['unir','tal_cual','omitir']);
 assert.equal(plan.resumen.bloqueados,1);
 const joined=planner.buildWritePlan(extraction,rec,{'company:1234S678Z':'unir'});
 assert.equal(joined.resumen.bloqueados,0);assert.equal(joined.registros.find(r=>r.ref==='company:1234S678Z').accion,'unir');
 assert.ok(joined.relaciones.some(r=>r.relacion==='invoice_customer'&&r.desde==='company:12345678Z'&&r.hacia==='invoice:B00000000/F-2'),'relations move to the joined entity');
 assert.ok(joined.relaciones.some(r=>r.relacion==='supply_point_holder'&&r.desde==='company:12345678Z'));
 const left=planner.buildWritePlan(extraction,rec,{'company:1234S678Z':'omitir'});
 assert.ok(!left.relaciones.some(r=>r.desde==='company:1234S678Z'||r.hacia==='company:1234S678Z'),'no relation to a left-out entity');
});

test('plan: an invoice already saved is reused and its lines are not added again; existing companies are reused',()=>{
 const plan=planner.buildWritePlan(extraction,reconcile({invoice:{'F-1':[{id:'r-inv',externalKey:null}]},company:{B00000000:[{id:'r-sup',externalKey:null}]}}),{'company:1234S678Z':'unir'});
 const by=ref=>plan.registros.find(r=>r.ref===ref);
 assert.equal(by('invoice:B00000000/F-1').accion,'reutilizar');assert.equal(by('invoice:B00000000/F-1').registroId,'r-inv');
 assert.ok(plan.registros.filter(r=>r.padre==='invoice:B00000000/F-1').every(r=>r.accion==='omitir'));
 assert.equal(by('company:B00000000').accion,'reutilizar');
});

// In-memory transaction double: records what is written.
function fakeTx(){
 const db={types:[],fields:[],bindings:[],records:[],revisions:[],provenance:[],definitions:[],relations:[],locks:[]};let n=0;const id=p=>`${p}-${++n}`;
 const catalog=k=>cat.STANDARD_TYPES.find(t=>t.key===k);
 const rels=cat.STANDARD_RELATIONS;
 const tx={$queryRaw:async q=>{db.locks.push(q.v[0]);return [];},
  engine_catalog_types:{findUnique:async a=>catalog(a.where.key)?{id:'g-'+a.where.key,key:a.where.key,name:catalog(a.where.key).name,description:'',status:'active'}:null},
  engine_catalog_type_versions:{findFirst:async a=>({version:1,engine_catalog_fields:catalog(a.where.type_id.slice(2)).fields.map((f,i)=>({key:f.key,name:f.name,field_type:f.type,sort_order:i,configuration:{}}))})},
  engine_object_types:{findUnique:async a=>{const t=a.where.id?db.types.find(x=>x.id===a.where.id):db.types.find(x=>x.key===a.where.workspace_id_key.key);return t?{...t,engine_field_definitions:db.fields.filter(f=>f.object_type_id===t.id)}:null;},
   create:async a=>{const t={id:id('ot'),status:'active',schema_version:1,...a.data};db.types.push(t);return t;},findUniqueOrThrow:async a=>{const t=db.types.find(x=>x.id===a.where.id);return {...t,engine_field_definitions:db.fields.filter(f=>f.object_type_id===t.id)};},update:async()=>({})},
  engine_field_definitions:{create:async a=>{const f={id:id('f'),status:'active',...a.data};db.fields.push(f);return f;}},
  engine_workspace_catalog_bindings:{findUnique:async()=>null,create:async a=>{db.bindings.push(a.data);return a.data;},update:async()=>({})},
  engine_records:{findFirst:async a=>db.records.find(r=>(a.where.id?r.id===a.where.id:r.object_type_id===a.where.object_type_id&&r.external_key===a.where.external_key))??null,
   create:async a=>{const r={id:id('rec'),status:a.data.status,...a.data};db.records.push(r);return r;}},
  engine_record_revisions:{createMany:async a=>{assert.equal(a.skipDuplicates,true,'a trigger may have written it already');db.revisions.push(...a.data);return {count:a.data.length};}},
  engine_record_provenance:{createMany:async a=>{db.provenance.push(...a.data);return {count:a.data.length};}},
  engine_catalog_relations:{findFirst:async a=>{const r=rels.find(x=>x.key===a.where.key);return r?{id:'gr-'+r.key,key:r.key,name:r.name,description:r.description,cardinality:r.cardinality,
   engine_catalog_types_engine_catalog_relations_from_type_idToengine_catalog_types:{key:r.from},engine_catalog_types_engine_catalog_relations_to_type_idToengine_catalog_types:{key:r.to}}:null;}},
  engine_relation_definitions:{findUnique:async a=>db.definitions.find(d=>d.key===a.where.workspace_id_key.key)??null,create:async a=>{const d={id:id('rd'),status:'active',...a.data};db.definitions.push(d);return d;}},
  engine_record_relations:{findFirst:async a=>db.relations.find(r=>r.relation_definition_id===a.where.relation_definition_id&&r.to_record_id===a.where.to_record_id&&(a.where.from_record_id?.not?r.from_record_id!==a.where.from_record_id.not:r.from_record_id===a.where.from_record_id))??null,
   create:async a=>{db.relations.push(a.data);return a.data;}}};
 return {tx,db};
}

test('commit: refuses pending decisions; writes records, revisions, evidence and relations once; re-saving reuses by external key',async()=>{
 const rec=reconcile();
 const {tx,db}=fakeTx();
 await assert.rejects(()=>commit.commitWritePlan(tx,{workspaceId:'w',userId:'u',batchId:'b',plan:planner.buildWritePlan(extraction,rec),revision:1}),/pendientes de decisión/);
 const plan=planner.buildWritePlan(extraction,rec,{'company:1234S678Z':'unir'});
 const result=await commit.commitWritePlan(tx,{workspaceId:'w',userId:'u',batchId:'b',plan,revision:1});
 assert.equal(result.resumen.creados,plan.resumen.crear);assert.equal(db.records.length,plan.resumen.crear);assert.equal(db.revisions.length,db.records.length);
 assert.ok(db.records.every(r=>r.workspace_id==='w'&&r.status==='draft'));
 assert.ok(db.provenance.every(p=>p.origin_type==='integration'),'"document" needs a Knowledge file (check constraint)');
 assert.ok(db.provenance.some(p=>p.field_key==='net_amount'&&/100,00/.test(p.evidence_text)&&/^intake:b\/f1\/p1\/invoice\.subtotal$/.test(p.source_locator)));
 assert.deepEqual([...new Set(db.types.map(t=>t.key))].sort(),[...new Set(plan.registros.filter(r=>r.accion==='crear').map(r=>r.tipo))].sort(),'only the types used are bound');
 assert.equal(db.bindings.length,db.types.length);
 assert.equal(db.relations.length,plan.resumen.relaciones);
 const supplier=db.records.find(r=>r.external_key==='B00000000');
 assert.equal(db.relations.filter(r=>r.from_record_id===supplier.id).length,2,'one supplier issues both invoices');
 assert.ok(db.locks.includes('engine-intake-write:w'));
 // Saving the same plan again (another batch with the same documents) reuses masters by external key.
 const again=await commit.commitWritePlan(tx,{workspaceId:'w',userId:'u',batchId:'b2',plan,revision:1});
 assert.ok(again.registros.filter(r=>r.tipo==='company').every(r=>r.accion==='reutilizado'));
});

test('orchestration and route guards: never saved automatically; claim before writing; one transaction',()=>{
 const route=readFileSync('app/api/knowledge/intake/[importId]/writing/route.ts','utf8');
 assert.match(route,/prisma\.\$transaction\(/);assert.match(route,/proposal_json: \{ equals: batch\.proposal_json/);assert.match(route,/plan\.resumen\.bloqueados/);
 const flow=readFileSync('components/knowledge/import/advance-intake.ts','utf8');assert.doesNotMatch(flow,/writing`, "POST"/);
});

test('a company without tax id can be joined to an existing record suggested by name; its relations go there',async()=>{
 const noNif={...extraction,archivos:[{archivoId:'f3',archivo:'sin-nif.pdf',incidencias:[],partes:[part('p1',{invoice:{invoice_number:v('M-1'),issue_date:v('12/02/2026')},
  issuer:{legal_name:v('PROVEEDOR DEMO SL'),tax_id:v('B00000000')},recipient:{legal_name:v("CLIENTE DEMO, S.L."),tax_id:v(null)}})]}]};
 const lookups=new Map(['company','invoice','supply_point','telecom_line'].map(t=>[t,{tipoDefinido:true,completo:true,candidatos:new Map(),
  ...(t==='company'?{porNombre:new Map([['clientedemo',[{id:'r-own',nombre:'CLIENTE DEMO SL',clave:'12345678Z'}]]])}:{})}]));
 const rec=rc.applyLookups('b',rc.groupEntities(noNif),lookups);
 const anon=rec.entidades.find(e=>e.tipo==='company'&&!e.clave);
 const pending=planner.buildWritePlan(noNif,rec);
 assert.deepEqual(pending.registros.find(r=>r.ref===anon.ref).bloqueo.opciones,['unir','tal_cual','omitir']);
 const plan=planner.buildWritePlan(noNif,rec,{[anon.ref]:'unir'});
 assert.ok(plan.relaciones.some(r=>r.relacion==='invoice_customer'&&r.desde==='company:registro:r-own'));
 const {tx,db}=fakeTx();db.records.push({id:'r-own',object_type_id:'x',workspace_id:'w',status:'draft'});
 const result=await commit.commitWritePlan(tx,{workspaceId:'w',userId:'u',batchId:'b',plan,revision:1});
 assert.ok(result.registros.some(r=>r.registroId==='r-own'&&r.accion==='reutilizado'));
 assert.ok(db.relations.some(r=>r.from_record_id==='r-own'),'the invoice is linked to the existing company');
});
