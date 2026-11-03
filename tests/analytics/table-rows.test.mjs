import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const query=load('lib/assistant/data/query.ts');
const plan=load('lib/assistant/changes/plan.ts',{'@/lib/assistant/data/query':query});
const rows=load('lib/analytics/table-rows.ts',{'@/lib/assistant/changes/plan':plan});
const q=load('lib/analytics/table-query.ts');

test('rows can be added in every table with rows of its own; deleted only in own tables and Compras',()=>{
 assert.deepEqual(rows.rowCapabilities('tabla:catalogo'),{add:true,remove:true});
 assert.deepEqual(rows.rowCapabilities('plantilla:abc'),{add:true,remove:true});
 assert.deepEqual(rows.rowCapabilities('compras'),{add:true,remove:true});
 assert.deepEqual(rows.rowCapabilities('facturas'),{add:true,remove:false});
 assert.deepEqual(rows.rowCapabilities('empresas'),{add:true,remove:false});
 assert.deepEqual(rows.rowCapabilities('consumos'),{add:false,remove:false},'calculated from invoices');
 assert.deepEqual(rows.addExtras('facturas').map(f=>f.field),['issuer','customer']);
 assert.deepEqual(rows.addExtras('compras').map(f=>f.field),['invoice']);
 assert.equal(rows.addExtras('suministros').find(f=>f.field==='supply_point_id').required,true);
 assert.deepEqual(rows.addDefaults('facturas'),{direction:'recibida'});
});

test('a new record converts typed values (Spanish numbers and dates) and reports every problem at once',()=>{
 const fields=[{key:'nombre',name:'Producto',field_type:'text',is_required:true},{key:'precio',name:'Precio',field_type:'decimal'},
  {key:'alta',name:'Alta',field_type:'date'},{key:'activo',name:'Activo',field_type:'boolean'},{key:'uds',name:'Unidades',field_type:'integer'}];
 const ok=rows.newRecordValues(fields,{nombre:'  Helado vainilla ',precio:'1.234,5',alta:'31/12/2026',activo:true,uds:''});
 assert.deepEqual(ok,{ok:true,values:{nombre:'Helado vainilla',precio:1234.5,alta:'2026-12-31',activo:true}});
 const bad=rows.newRecordValues(fields,{precio:'mucho',alta:'31/02/2026',otra:'x'});
 assert.equal(bad.ok,false);
 assert.match(bad.error,/Precio: número no válido/);
 assert.match(bad.error,/Alta: fecha no válida/);
 assert.match(bad.error,/otra: no existe/);
 assert.match(bad.error,/Producto: es obligatorio/);
 assert.deepEqual(rows.newRecordValues([{key:'a',field_type:'text'}],{a:'  '}),{ok:false,error:'Rellena al menos un campo'});
});

test('revision changes list what was added, changed and cleared',()=>{
 assert.deepEqual(rows.revisionChanges({a:1,b:'x',c:true},{a:2,b:'x',d:'nuevo'}),
  [{field:'a',before:1,after:2},{field:'c',before:true,after:null},{field:'d',before:null,after:'nuevo'}]);
 assert.deepEqual(rows.revisionChanges(null,{a:1}),[{field:'a',before:null,after:1}]);
});

test('pending edits are grouped per record, keeping the revision seen and the last value of each field',()=>{
 const id1='11111111-1111-4111-8111-111111111111', id2='22222222-2222-4222-8222-222222222222';
 const g=rows.groupEdits([
  {recordId:id1,revision:3,columnKey:'precio',field:'precio',value:'2'},
  {recordId:id2,revision:1,columnKey:'nombre',field:'nombre',value:'B'},
  {recordId:id1,revision:3,columnKey:'nombre',field:'nombre',value:'A'},
  {recordId:id1,revision:3,columnKey:'precio',field:'precio',value:'2,5'}]);
 assert.equal(g.length,2);
 assert.deepEqual(g[0],{recordId:id1,expectedRevision:3,edits:[{field:'nombre',value:'A',columnKey:'nombre'},{field:'precio',value:'2,5',columnKey:'precio'}]});
 assert.equal(g[1].edits.length,1);
});

test('header filters: chosen values (empty included), ranges for amounts and dates, combined with search',()=>{
 const cols=[{key:'producto',label:'Producto'},{key:'precio',label:'Precio',kind:'money'},{key:'fecha',label:'Fecha',kind:'date'}];
 const data=[{producto:'Vainilla',precio:2.5,fecha:'2026-01-10'},{producto:'Chocolate',precio:4,fecha:'2026-02-01'},
  {producto:null,precio:null,fecha:null},{producto:'Fresa',precio:6.2,fecha:'2026-03-15'}];
 const run=cf=>q.queryRows(data,cols,{search:'',filters:{},columnFilters:cf,sort:null,page:1,pageSize:25}).rows.map(r=>r.producto);
 assert.deepEqual(run({producto:{values:['Vainilla','__empty']}}),['Vainilla',null]);
 assert.deepEqual(run({producto:{values:[]}}),[]);
 assert.deepEqual(run({precio:{min:'2,5',max:'4'}}),['Vainilla','Chocolate']);
 assert.deepEqual(run({precio:{min:'5'}}),['Fresa'],'a range never keeps empty cells');
 assert.deepEqual(run({fecha:{min:'01/02/2026',max:'2026-03-31'}}),['Chocolate','Fresa']);
 assert.deepEqual(run({precio:{max:'5'},producto:{values:['Chocolate','Fresa']}}),['Chocolate']);
 assert.deepEqual(run({precio:{min:'',max:' '}}),['Vainilla','Chocolate',null,'Fresa'],'blank bounds do not filter');
 assert.equal(q.activeColumnFilter({values:[]}),true);
 assert.equal(q.activeColumnFilter({min:''}),false);
});

const WS='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', TYPE='tttttttt-tttt-4ttt-8ttt-tttttttttttt'.replace(/t/g,'7');
const R1='11111111-1111-4111-8111-111111111111', R2='22222222-2222-4222-8222-222222222222';
function service(db){
 const calls={updates:[],raw:[]};
 const compute={PLAIN_EDITABLE:{invoice_line:['description','unit_price'],invoice:['invoice_number','issue_date','total_amount']},
  EDITABLE:{company:{legal_name:'text',is_own_company:'boolean'},invoice:{direction:'direction',expense_category:'category'}}};
 const edit=load('lib/analytics/edit.ts',{'./compute':{CATEGORIES:[{key:'suministros'}],EDITABLE:compute.EDITABLE},'@/lib/assistant/changes/plan':plan});
 const parties={newCompanyValues:({nombre,nif})=>!nombre.trim()?{ok:false,error:'Escribe el nombre de la empresa'}:nif==='MAL'?{ok:false,error:'«MAL» no es un NIF/CIF válido'}:{ok:true,values:{legal_name:nombre.trim(),...(nif?{tax_identifier:nif}:{})},key:nif||null},
  setInvoiceParty:async(tx,q)=>{calls.parties=[...(calls.parties??[]),q];}};
 class EngineRecordError extends Error{}
 const prisma={
  intake_templates:{findFirst:async()=>null},
  // Like the database: each field definition comes back with only the columns the query selects.
  engine_object_types:{findFirst:async({where,select})=>where.workspace_id===WS&&db.types[where.key]?{id:TYPE,key:where.key,schema_version:1,settings:db.types[where.key],
   engine_field_definitions:(db.fieldsOf?.[where.key]??db.fields).map(f=>Object.fromEntries(Object.keys(select.engine_field_definitions.select).filter(k=>k in {...f,status:1}).map(k=>[k,k==='status'?'active':f[k]])))}:null},
  engine_records:{
   findFirst:async({where})=>{ if(where.external_key) return db.taken?.includes(where.external_key)?{id:'other'}:null;
     if(where.engine_object_types) return db.invoices?.includes(where.id)?{id:where.id}:null;
     if(where.values_json) return db.supplies?.includes(where.values_json.equals)?{id:'s'}:null;
     const r=db.records[where.id]; return r&&where.workspace_id===WS?{values_json:r.values,engine_object_types:{key:r.type,settings:db.types[r.type]??{},engine_field_definitions:db.fields}}:null; },
   updateMany:async q=>{calls.updates.push(q);return{count:q.where.OR?q.where.OR.filter(o=>db.records[o.id]?.revision===o.revision).length:0};},
   findMany:async({where})=>where.id.in.map(id=>({id,external_key:db.records[id]?.key??null})),
   update:async q=>{calls.updates.push(q);return{};},
   create:async q=>{calls.created=q.data;return{id:R2};},
  },
  $executeRaw:async(...a)=>{calls.raw.push(a);return 1;},
  $queryRaw:async()=>[],
  engine_relation_definitions:{findUnique:async()=>({id:'def-lines',status:'active'})},
  engine_record_relations:{create:async q=>{calls.relations=[...(calls.relations??[]),q.data];}},
  engine_record_provenance:{createMany:async q=>{calls.manual=[...(calls.manual??[]),...q.data];return{count:q.data.length};}},
  $transaction:async fn=>fn(prisma),
 };
 const svc=load('lib/analytics/table-rows.service.ts',{'@prisma/client':{Prisma:{sql:(...a)=>a}},'@/lib/prisma':{prisma},
  '@/lib/engine/records.service':{EngineRecordError,updateEngineRecord:async q=>{ if(db.conflict===q.recordId) throw new EngineRecordError('El registro ha cambiado. Actualiza la tabla antes de guardar.'); calls.saved=[...(calls.saved??[]),q];}},
  '@/lib/engine/validation':load('lib/engine/validation.ts'),
  './edit':edit,'./compute':compute,'./parties':parties,'./data':{BASE_TABLE_TYPES:{compras:'invoice_line',facturas:'invoice',empresas:'company',suministros:'supply_point'}},'./table-rows':rows});
 return {svc,calls};
}

test('batch save: one revision per record with all its fields, members allowed, a conflicting record fails alone',async()=>{
 const db={types:{catalogo:{origen:'asistente'}},fields:[{key:'nombre',field_type:'text'},{key:'precio',field_type:'decimal'}],
  records:{[R1]:{type:'catalogo',values:{nombre:'A',precio:1},revision:3},[R2]:{type:'catalogo',values:{nombre:'B'},revision:1}},conflict:R2};
 const {svc,calls}=service(db);
 const res=await svc.saveTableChanges({workspaceId:WS,userId:'u',changes:[
  {recordId:R1,expectedRevision:3,edits:[{field:'nombre',value:'Vainilla'},{field:'precio',value:'2,5'}]},
  {recordId:R2,expectedRevision:1,edits:[{field:'nombre',value:'X'}]}]});
 assert.deepEqual(res.map(r=>r.ok),[true,false]);
 assert.match(res[1].error,/ha cambiado/);
 assert.equal(calls.saved.length,1);
 assert.deepEqual(calls.saved[0].values,{nombre:'Vainilla',precio:2.5});
 assert.equal(calls.saved[0].expectedRevision,3);
 assert.equal(calls.saved[0].membersCanWrite,true);
 // Corrected by hand: marked field by field on the new revision (automatic fixes never overwrite it).
 assert.deepEqual(calls.manual.map(m=>[m.field_key,m.revision,m.origin_type]),[['nombre',4,'manual'],['precio',4,'manual']]);
 const bad=await svc.saveTableChanges({workspaceId:WS,userId:'u',changes:[{recordId:R1,expectedRevision:3,edits:[{field:'precio',value:'abc'}]}]});
 assert.equal(bad[0].ok,false);
 await assert.rejects(()=>svc.saveTableChanges({workspaceId:WS,userId:'u',changes:[]}));
});

test('delete is scoped to the table type and revision, and sets the document identity aside; restore brings it back',async()=>{
 const db={types:{invoice_line:{}},fields:[],records:{[R1]:{revision:2,key:`doc-7#borrada:${R1}`},[R2]:{revision:5,key:`doc-8#borrada:${R2}`}},taken:['doc-8']};
 const {svc,calls}=service(db);
 await assert.rejects(()=>svc.deleteTableRows({workspaceId:WS,userId:'u',tableKey:'facturas',records:[{id:R1,revision:2}]}),/no se pueden eliminar/);
 const ok=await svc.deleteTableRows({workspaceId:WS,userId:'u',tableKey:'compras',records:[{id:R1,revision:2}]});
 assert.deepEqual(ok,{ids:[R1]});
 const del=calls.updates[0];
 assert.equal(del.where.object_type_id,TYPE);
 assert.equal(del.where.workspace_id,WS);
 assert.deepEqual(del.where.OR,[{id:R1,revision:2}]);
 assert.equal(del.data.status,'archived');
 assert.equal(calls.raw.length,1,'external key set aside');
 await assert.rejects(()=>svc.deleteTableRows({workspaceId:WS,userId:'u',tableKey:'compras',records:[{id:R1,revision:1}]}),/ha cambiado/);
 calls.updates.length=0;
 await svc.restoreTableRows({workspaceId:WS,userId:'u',tableKey:'compras',ids:[R1,R2]});
 assert.deepEqual(calls.updates.map(u=>u.data.external_key),['doc-7',null],'a key re-imported meanwhile is not duplicated');
 assert.ok(calls.updates.every(u=>u.data.status==='active'));
});

test('add row by hand in base tables: invoice with its parties, line with its invoice, company and supply without duplicates',async()=>{
 const fields=[{key:'invoice_number',name:'Número de factura',field_type:'text',is_required:true},{key:'issue_date',name:'Fecha',field_type:'date'},
  {key:'total_amount',name:'Total',field_type:'decimal'},{key:'direction',field_type:'text'},{key:'expense_category',field_type:'text'},
  {key:'description',field_type:'text'},{key:'unit_price',field_type:'decimal'},{key:'legal_name',field_type:'text'},{key:'tax_identifier',field_type:'text'},
  {key:'supply_point_id',name:'Identificador',field_type:'text'},{key:'supply_type',field_type:'text'},{key:'is_own_company',field_type:'boolean'}];
 const optional=fields.map(f=>({...f,is_required:false}));
 const C='33333333-3333-4333-8333-333333333333', INV='44444444-4444-4444-8444-444444444444';
 const db={types:{invoice:{},invoice_line:{},company:{},supply_point:{}},fields,fieldsOf:{invoice_line:optional,company:optional,supply_point:optional},records:{},invoices:[INV],taken:['B11111111'],supplies:['ES001']};
 const {svc,calls}=service(db);
 await svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'facturas',values:{invoice_number:'AG-2026-07',issue_date:'15/07/2026',total_amount:'48,20',direction:'recibida',expense_category:'suministros',issuer:C,customer:''}});
 assert.deepEqual(calls.created.values_json,{invoice_number:'AG-2026-07',issue_date:'2026-07-15',total_amount:48.2,direction:'recibida',expense_category:'suministros'});
 assert.deepEqual(calls.parties.map(p=>[p.role,p.companyId,p.invoiceId]),[['issuer',C,R2]]);
 await assert.rejects(()=>svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'facturas',values:{invoice_number:'X',direction:'otra'}}),/gasto o ingreso/);
 await assert.rejects(()=>svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'facturas',values:{invoice_number:'X',notes:'hola'}}),/no se puede rellenar a mano/);
 await svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'compras',values:{description:'Leche',unit_price:'1,10',invoice:INV}});
 assert.deepEqual(calls.relations,[{workspace_id:WS,relation_definition_id:'def-lines',from_record_id:INV,to_record_id:R2,reviewed_by_user_id:'u'}]);
 await assert.rejects(()=>svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'compras',values:{description:'Leche',invoice:C}}),/ya no existe/);
 await svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'empresas',values:{legal_name:'Aguas de Cádiz',tax_identifier:'A22222222'}});
 assert.equal(calls.created.external_key,'A22222222');
 assert.deepEqual(calls.created.values_json,{legal_name:'Aguas de Cádiz',tax_identifier:'A22222222'});
 await assert.rejects(()=>svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'empresas',values:{legal_name:'Otra',tax_identifier:'B11111111'}}),/Ya existe una empresa/);
 await assert.rejects(()=>svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'empresas',values:{legal_name:'Otra',tax_identifier:'MAL'}}),/no es un NIF/);
 await assert.rejects(()=>svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'suministros',values:{supply_type:'Agua'}}),/Identificador: es obligatorio/);
 await assert.rejects(()=>svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'suministros',values:{supply_point_id:'ES001'}}),/Ya existe un suministro/);
 await assert.rejects(()=>svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'consumos',values:{}}),/no se pueden añadir/);
 await assert.rejects(()=>svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'facturas',values:{total_amount:'5'}}),/Número de factura: es obligatorio/);
 // An empty NIF is fine: the company is saved by name.
 await svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'empresas',values:{legal_name:'Aguas de Cádiz',tax_identifier:'',is_own_company:false}});
 assert.deepEqual(calls.created.values_json,{legal_name:'Aguas de Cádiz',is_own_company:false});
 assert.equal(calls.created.external_key,null);
});

test('add row only in own tables, values converted',async()=>{
 const db={types:{catalogo:{origen:'asistente'},otra:{}},fields:[{key:'nombre',name:'Nombre',field_type:'text',is_required:true},{key:'precio',name:'Precio',field_type:'decimal'}],records:{}};
 const {svc,calls}=service(db);
  await assert.rejects(()=>svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'tabla:otra',values:{nombre:'x'}}),/no encontrada/,'only assistant tables by key');
 await assert.rejects(()=>svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'tabla:catalogo',values:{precio:'3'}}),/obligatorio/);
 assert.deepEqual(await svc.addTableRow({workspaceId:WS,userId:'u',tableKey:'tabla:catalogo',values:{nombre:'Fresa',precio:'3,10'}}),{id:R2});
 assert.deepEqual(calls.created.values_json,{nombre:'Fresa',precio:3.1});
 assert.equal(calls.created.workspace_id,WS);
 assert.equal(calls.created.status,'active');
});
