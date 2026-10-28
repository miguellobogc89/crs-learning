import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const a=load('lib/knowledge/intake/alerts/compute.ts');
const doc=(id,estado='pendiente',error=null)=>({importId:'I',importFileId:id,archivo:id+'.pdf',partes:1,estado,registros:0,error});

test('alerts are grouped: decisions, ready to save, types without a table, template progress, errors',()=>{
 const alerts=a.computeAlerts({hasDrive:true,
  batches:[{id:'B1',nombre:'Drive 1',estado:'por_guardar',bloqueados:3,error:null,archivos:20},{id:'B2',nombre:'Drive 2',estado:'por_guardar',bloqueados:0,error:null,archivos:18},
   {id:'B3',nombre:'Drive 3',estado:'por_guardar',bloqueados:1,error:null,archivos:5},{id:'B4',nombre:'Drive 4',estado:'error',bloqueados:0,error:'fetch failed',archivos:20},{id:'B5',nombre:'x',estado:'otro',bloqueados:0,error:null,archivos:1}],
  groups:[{familia:'transaccion',tipo:'recibo_pago',subtipo:null,label:'Recibo de pago',plantilla:null,documentos:[doc('ALQ1'),doc('ALQ2'),doc('MAKRO','ignorado')]},
   {familia:'transaccion',tipo:'nomina',subtipo:null,label:'Nómina',plantilla:{id:'T1',nombre:'Nóminas'},documentos:[doc('N1','procesado'),doc('N2'),doc('N3','error','timeout')]},
   {familia:'transaccion',tipo:'otro',subtipo:null,label:'Otro',plantilla:null,documentos:[doc('X','ignorado')]}]});
 assert.deepEqual(alerts.map(x=>[x.key,x.count]),[['decisiones',2],['por_guardar',1],['sin_tabla:transaccion|recibo_pago|',2],['plantilla_pendiente:T1',1],['plantilla_error:T1',1],['errores',1]]);
 const d=alerts[0];assert.match(d.title,/2 importaciones necesitan tu decisión/);assert.match(d.body,/4 dudas pendientes/);assert.equal(d.href,'/connectors/google-drive');
 assert.match(alerts[2].title,/2 documentos de tipo «Recibo de pago» sin guardar/);assert.match(alerts[2].body,/ALQ1\.pdf, ALQ2\.pdf/);assert.doesNotMatch(alerts[2].body,/MAKRO/,'documents left out are not reported');
 assert.match(alerts[4].body,/timeout/);
 assert.equal(a.computeAlerts({hasDrive:false,batches:[{id:'B',nombre:'n',estado:'por_guardar',bloqueados:1,error:null,archivos:1}],groups:[]})[0].href,'/knowledge');
 assert.deepEqual(a.computeAlerts({hasDrive:true,batches:[],groups:[]}),[],'nothing pending, nothing in the inbox');
});

test('an alert comes back as unread only when it covers something new',()=>{
 assert.equal(a.hasNew(['B1:3','B2:1'],['B1:3']),false,'fewer: stays as it was');
 assert.equal(a.hasNew(['B1:3'],['B1:3','B9:1']),true,'a new batch');
 assert.equal(a.hasNew(['B1:3'],['B1:4']),true,'a new decision in the same batch');
 assert.equal(a.hasNew(undefined,['x']),true);
});

test('inbox sync: created once, updated in place, unread again only with news, removed when solved',async()=>{
 let state={batches:[{id:'B1',status:'intake_completed',error:null,nombre:'Drive 1',archivos:20,conciliacion:'completed',revision:7,escritura:null}],bloqueados:2,groups:[]};
 const notes=[];let seq=0;
 const prisma={
  $queryRaw:async()=>state.batches,
  knowledge_imports:{findUnique:async()=>({proposal_json:{resultado:{},conciliacion:{resultado:{}}}})},
  workspaces:{findUnique:async()=>({owner_user_id:'U1',name:'Heladería'})},
  workspace_members:{findMany:async()=>[{user_id:'U2'},{user_id:'U1'}]},
  workspace_connections:{findFirst:async()=>({id:'c'})},
  notifications:{
   findMany:async({where})=>notes.filter(n=>n.user_id===where.user_id&&n.metadata.workspace_id==='W'),
   create:async({data})=>{notes.push({id:'n'+(++seq),read_at:null,created_at:new Date(0),...data});},
   update:async({where,data})=>{Object.assign(notes.find(n=>n.id===where.id),data);},
   deleteMany:async({where})=>{for(const id of where.id.in)notes.splice(notes.findIndex(n=>n.id===id),1);}}};
 const s=load('lib/knowledge/intake/alerts/service.ts',{'@prisma/client':{Prisma:{sql:(x,...v)=>({x,v})}},'next/server':{after:f=>f()},'@/lib/prisma':{prisma},
  '../extractor/contract':{EXTRACTOR_UPLOAD_TYPE:'intake-extractor-v2'},'../reconciliation/contract':{RECONCILIATION_REVISION:7},
  '../writer/plan':{buildWritePlan:()=>({resumen:{bloqueados:state.bloqueados}})},'../templates/service':{templateOverview:async()=>({grupos:state.groups})},'./compute':a});
 await s.syncIntakeAlerts('W');
 assert.deepEqual(notes.map(n=>[n.user_id,n.type]),[['U1','intake.decisiones'],['U2','intake.decisiones']],'owner and admins, once each');
 assert.match(notes[0].body,/Heladería$/);
 notes[0].read_at=new Date();
 await s.syncIntakeAlerts('W');
 assert.equal(notes.length,2);assert.notEqual(notes[0].read_at,null,'nothing new: stays read');
 state.bloqueados=3;await s.syncIntakeAlerts('W');
 assert.equal(notes[0].read_at,null,'a new decision: unread again');assert.match(notes[0].body,/3 dudas/);
 state.batches=[];await s.syncIntakeAlerts('W');
 assert.equal(notes.length,0,'solved: removed from the inbox');
});
