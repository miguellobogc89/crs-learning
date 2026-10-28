import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}

// A tiny in-memory stand-in for the Prisma calls apply/undo make (filters: equality, {in}, {not}, {startsWith}).
function fakeDb(){
 const t={engine_object_types:[],engine_field_definitions:[],engine_relation_definitions:[],engine_records:[],engine_record_relations:[]};
 const ok=(row,where={})=>Object.entries(where).every(([k,v])=>{
  if(k==='workspace_id_key')return row.workspace_id===v.workspace_id&&row.key===v.key;
  if(v&&typeof v==='object'&&!Array.isArray(v)){if('in' in v)return v.in.includes(row[k]);if('not' in v)return row[k]!==v.not;}
  return row[k]===v;});
 const pick=(row,select)=>select?Object.fromEntries(Object.keys(select).map(k=>[k,row[k]])):row;
 const apply=(row,data)=>{for(const [k,v] of Object.entries(data)){if(v&&typeof v==='object'&&'increment' in v)row[k]+=v.increment;else row[k]=v;}};
 const model=name=>({
  findUnique:async({where,select})=>{const r=t[name].find(r=>ok(r,where));return r?pick(r,select):null;},
  findUniqueOrThrow:async({where,select})=>{const r=t[name].find(r=>ok(r,where));if(!r)throw Error('nf');return pick(r,select);},
  findFirst:async({where,select})=>{const r=t[name].find(r=>ok(r,where));return r?pick(r,select):null;},
  findMany:async({where,select}={})=>t[name].filter(r=>ok(r,where)).map(r=>pick(r,select)),
  create:async({data})=>{if('key' in data&&name!=='engine_records'&&!/^[a-z][a-z0-9_]*$/.test(data.key))throw Error(`check constraint: key «${data.key}»`);const r={id:randomUUID(),status:'active',schema_version:1,revision:1,settings:{},...data};t[name].push(r);return r;},
  createMany:async({data})=>{for(const d of data)t[name].push({id:randomUUID(),status:'active',...d});return{count:data.length};},
  update:async({where,data})=>{const r=t[name].find(r=>ok(r,where));apply(r,data);return r;},
  updateMany:async({where,data})=>{const rs=t[name].filter(r=>ok(r,where));rs.forEach(r=>apply(r,data));return{count:rs.length};},
  deleteMany:async({where})=>{const before=t[name].length;t[name]=t[name].filter(r=>!ok(r,where));return{count:before-t[name].length};},
 });
 const db=Object.fromEntries(Object.keys(t).map(k=>[k,model(k)]));
 db.$queryRaw=async()=>[];db.$transaction=async fn=>fn(db);
 return {db,t};
}

const q=load('lib/assistant/data/query.ts');
const plan=load('lib/assistant/changes/plan.ts',{'@/lib/assistant/data/query':q});
const validation=load('lib/engine/validation.ts');

test('apply creates the table, its columns, rows and links in one go; undo leaves everything as it was',async()=>{
 const {db,t}=fakeDb();
 const ap=load('lib/assistant/changes/apply.ts',{'node:crypto':{randomUUID},'@prisma/client':{Prisma:{sql:()=>''}},'@/lib/prisma':{prisma:db},'@/lib/engine/validation':validation});
 // Existing: a recipes table (from documents) with two rows; a supplier company to link to.
 const recipesType={id:randomUUID(),workspace_id:'W',key:'doc_recetas',name:'Recetas',status:'active',schema_version:1,settings:{template_id:'R'}};
 t.engine_object_types.push(recipesType);
 t.engine_records.push({id:'r1',workspace_id:'W',object_type_id:recipesType.id,status:'active',schema_version:1,revision:1,values_json:{ingrediente:'Leche'}},
  {id:'r2',workspace_id:'W',object_type_id:recipesType.id,status:'active',schema_version:1,revision:1,values_json:{ingrediente:'Jamón'}});
 const recetas={key:'plantilla:R',label:'Recetas',description:'',title:'ingrediente',columns:[{key:'ingrediente',label:'Ingrediente'}],rows:[{_id:'r1',ingrediente:'Leche'},{_id:'r2',ingrediente:'Jamón'}]};
 const ctx={tables:[recetas],types:[{tableKey:'plantilla:R',typeKey:'doc_recetas',editable:false}],links:[],typeKeys:['doc_recetas']};
 const p=plan.planChanges(ctx,[
  {op:'crear_tabla',tabla:'catalogo',nombre:'Catálogo',titulo:'producto',columnas:[{columna:'producto',nombre:'Producto',tipo:'texto'},{columna:'precio',nombre:'Precio',tipo:'importe'}]},
  {op:'crear_filas',tabla:'catalogo',filas:[{producto:'Leche',precio:'0,99'},{producto:'Jamón',precio:12.5}]},
  {op:'añadir_columnas',tabla:'plantilla:R',columnas:[{columna:'producto',nombre:'Producto',tipo:'enlace',tabla_enlazada:'catalogo'}]},
  {op:'enlazar',tabla:'plantilla:R',columna:'producto',por:{columna_origen:'ingrediente',columna_destino:'producto'}},
  {op:'actualizar_filas',tabla:'catalogo',donde:[{columna:'producto',op:'=',valor:'Leche'}],valores:{precio:1.05}},
 ]);
 assert.equal(p.ok,true,p.errores.join(' | '));
 const before=JSON.parse(JSON.stringify(t.engine_records));
 const undo=await ap.applyActions({workspaceId:'W',userId:'U',actions:p.acciones,tables:[{tableKey:'plantilla:R',typeId:recipesType.id,typeKey:'doc_recetas'}],links:[]});
 const catalogType=t.engine_object_types.find(x=>x.key==='catalogo');
 assert.deepEqual(catalogType.settings,{origen:'asistente',titulo:'producto',enlaces:[],creado_por:'U'});
 assert.deepEqual(t.engine_field_definitions.map(f=>[f.key,f.field_type,f.configuration.money]),[['producto','text',false],['precio','decimal',true]]);
 const rows=t.engine_records.filter(r=>r.object_type_id===catalogType.id);
 assert.deepEqual(rows.map(r=>[r.values_json,r.status]),[[{producto:'Leche',precio:1.05},'active'],[{producto:'Jamón',precio:12.5},'active']]);
 assert.deepEqual(recipesType.settings.enlaces,[{columna:'producto',nombre:'Producto',relacion:'enlace_doc_recetas_producto',destino:'tabla:catalogo'}]);
 const KEY=/^[a-z][a-z0-9_]*$/;assert.ok([...t.engine_object_types,...t.engine_field_definitions,...t.engine_relation_definitions].every(x=>KEY.test(x.key)),'engine key format');
 const rel=t.engine_relation_definitions[0];
 assert.deepEqual([rel.from_object_type_id,rel.to_object_type_id,rel.cardinality],[catalogType.id,recipesType.id,'one_to_many']);
 assert.deepEqual(t.engine_record_relations.map(l=>[l.to_record_id,rows.find(r=>r.id===l.from_record_id).values_json.producto]),[['r1','Leche'],['r2','Jamón']]);
 assert.equal(undo.insertados.length,2);assert.equal(undo.actualizados.length,0,'rows created by the proposal are not "updated" for undo');

 await ap.undoActions({workspaceId:'W',userId:'U',undo});
 assert.equal(t.engine_record_relations.length,0);
 assert.ok(rows.every(r=>r.status==='archived'));
 assert.deepEqual(recipesType.settings,{template_id:'R'});
 assert.match(catalogType.key,/^catalogo_deshecho_[a-z0-9]+$/);
 assert.ok([...t.engine_object_types,...t.engine_field_definitions,...t.engine_relation_definitions].every(x=>/^[a-z][a-z0-9_]*$/.test(x.key)&&x.key.length<=80),'retired keys keep the format');assert.equal(catalogType.status,'archived');
 assert.ok(t.engine_field_definitions.every(f=>f.status==='archived'));
 assert.equal(rel.status,'archived');
 assert.deepEqual(t.engine_records.filter(r=>r.object_type_id===recipesType.id).map(r=>r.values_json),before.filter(r=>r.object_type_id===recipesType.id).map(r=>r.values_json));
});

test('updating saved rows keeps the old values for undo; links replaced and restored',async()=>{
 const {db,t}=fakeDb();
 const ap=load('lib/assistant/changes/apply.ts',{'node:crypto':{randomUUID},'@prisma/client':{Prisma:{sql:()=>''}},'@/lib/prisma':{prisma:db},'@/lib/engine/validation':validation});
 const cat={id:randomUUID(),workspace_id:'W',key:'catalogo',status:'active',schema_version:1,settings:{origen:'asistente',titulo:'producto',enlaces:[{columna:'sustituto',nombre:'Sustituto',relacion:'enlace:catalogo:sustituto',destino:'tabla:catalogo'}]}};
 t.engine_object_types.push(cat);
 t.engine_field_definitions.push({id:'f1',object_type_id:cat.id,key:'producto',field_type:'text',is_required:false,status:'active'},{id:'f2',object_type_id:cat.id,key:'precio',field_type:'decimal',is_required:false,status:'active'});
 t.engine_records.push({id:'c1',workspace_id:'W',object_type_id:cat.id,status:'active',schema_version:1,revision:1,values_json:{producto:'Leche',precio:0.9}},{id:'c2',workspace_id:'W',object_type_id:cat.id,status:'active',schema_version:1,revision:1,values_json:{producto:'Leche sin lactosa',precio:1.2}},{id:'c3',workspace_id:'W',object_type_id:cat.id,status:'active',schema_version:1,revision:1,values_json:{producto:'Bebida de avena',precio:1.5}});
 t.engine_relation_definitions.push({id:'D',workspace_id:'W',key:'enlace:catalogo:sustituto',status:'active'});
 t.engine_record_relations.push({id:'old',workspace_id:'W',relation_definition_id:'D',from_record_id:'c2',to_record_id:'c1'});
 const actions=[{k:'actualizar',tabla:'tabla:catalogo',ref:'c1',valores:{precio:0.99}},{k:'enlazar',tabla:'tabla:catalogo',columna:'sustituto',ref:'c1',destino:'c3'},{k:'borrar',tabla:'tabla:catalogo',ref:'c2'}];
 const undo=await ap.applyActions({workspaceId:'W',userId:'U',actions,tables:[{tableKey:'tabla:catalogo',typeId:cat.id,typeKey:'catalogo'}],links:[{from:'tabla:catalogo',columna:'sustituto',relationId:'D'}]});
 assert.deepEqual(t.engine_records.find(r=>r.id==='c1').values_json,{producto:'Leche',precio:0.99});
 assert.equal(t.engine_records.find(r=>r.id==='c1').revision,2);
 assert.deepEqual(t.engine_record_relations.map(l=>[l.from_record_id,l.to_record_id]),[['c3','c1']]);
 assert.equal(t.engine_records.find(r=>r.id==='c2').status,'archived');
 await ap.undoActions({workspaceId:'W',userId:'U',undo});
 assert.deepEqual(t.engine_records.find(r=>r.id==='c1').values_json,{producto:'Leche',precio:0.9});
 assert.equal(t.engine_records.find(r=>r.id==='c1').revision,3,'undo is one more revision: history keeps everything');
 assert.deepEqual(t.engine_record_relations.map(l=>[l.from_record_id,l.to_record_id]),[['c2','c1']]);
 assert.equal(t.engine_records.find(r=>r.id==='c2').status,'active');
 await assert.rejects(ap.applyActions({workspaceId:'W',userId:'U',actions:[{k:'actualizar',tabla:'tabla:catalogo',ref:'c1',valores:{precio:'mucho'}}],tables:[{tableKey:'tabla:catalogo',typeId:cat.id,typeKey:'catalogo'}],links:[]}),/Valores no válidos/);
});

test('after «Aplicar» the assistant says what was done, where to see it, what to complete and the next step',()=>{
 const stub=new Proxy({},{get:()=>()=>{}});
 const svc=load('lib/assistant/changes/service.ts',{'node:crypto':{randomUUID},'@prisma/client':{Prisma:{}},'@/lib/prisma':{prisma:stub},'@/lib/analytics/data':{},'@/lib/analytics/compute':{},'./plan':{},'./apply':{ApplyError:Error}});
 const text=svc.followUpText({titulo:'Catálogo de precios por proveedor',pendientes:[{tabla:'tabla:catalogo',nombreTabla:'Catálogo',columna:'formato',nombreColumna:'Contenido del envase',filas:12}],
  objetivo:{pasos:['Catálogo de precios por proveedor','Productos comparables entre proveedores','Coste y ahorro por receta'],actual:1}},[{key:'tabla:catalogo',label:'Catálogo'}]);
 assert.equal(text,'¡Listo! Ya puedes ver la tabla aquí: [Catálogo](/analytics?view=tablas&table=tabla%3Acatalogo). Te quedan 12 por completar: [complétalas aquí](/analytics?view=tablas&table=tabla%3Acatalogo&pendiente=formato). El siguiente paso es productos comparables entre proveedores. ¿Lo hago?');
 assert.match(svc.followUpText({titulo:'X',objetivo:{pasos:['a','b'],actual:2}},[]),/ya está todo/);
 assert.match(svc.followUpText({titulo:'X'},[],true),/lo he deshecho/);
});
