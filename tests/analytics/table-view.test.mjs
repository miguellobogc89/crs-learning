import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const q=load('lib/analytics/table-query.ts');
const v=load('lib/analytics/table-view.ts',{'./table-query':q});
const o=load('lib/analytics/tables-overview.ts');
const cols=[{key:'fecha',label:'Fecha',kind:'date'},{key:'receptor',label:'Receptor',filter:true},{key:'total',label:'Total',kind:'money'},{key:'doc',label:'Doc',kind:'document'}];

test('saved view: validated against the current columns; unknown or invalid parts forgotten',()=>{
 assert.deepEqual(v.normalizeView(null,cols),v.DEFAULT_VIEW);
 assert.deepEqual(v.normalizeView({hidden:['doc','borrada','doc'],groupBy:'receptor',sort:{key:'total',dir:'desc'},pageSize:50},cols),
  {hidden:['doc'],groupBy:'receptor',sort:{key:'total',dir:'desc'},pageSize:50});
 assert.equal(v.normalizeView({groupBy:'total'},cols).groupBy,null,'amounts are not grouped by');
 assert.equal(v.normalizeView({groupBy:'doc'},cols).groupBy,null);
 assert.equal(v.normalizeView({pageSize:7},cols).pageSize,25);
 assert.equal(v.normalizeView({sort:{key:'total',dir:'up'}},cols).sort,null);
 assert.deepEqual(v.normalizeView({hidden:cols.map(c=>c.key)},cols).hidden,[],'never every column hidden');
 // When saving, only the shape is checked.
 assert.deepEqual(v.normalizeView({hidden:['x',3],groupBy:'y',extra:1}),{hidden:['x'],groupBy:'y',sort:null,pageSize:25});
});

test('grouping: rows of each value in their order, totals per group, biggest first, empty last',()=>{
 const rows=[{receptor:'Ana',total:10},{receptor:null,total:5},{receptor:'Luis',total:1},{receptor:'Ana',total:2.5},{receptor:'Luis',total:null},{receptor:'Bea',total:3}];
 const g=v.groupRows(rows,cols,'receptor');
 assert.deepEqual(g.map(x=>[x.label,x.rows.length,x.totals.total]),[['Ana',2,12.5],['Luis',2,1],['Bea',1,3],['(vacío)',1,5]]);
 assert.deepEqual(g[0].rows.map(r=>r.total),[10,2.5],'keeps the incoming (sorted) order');
});

test('tables overview: what needs a look, each linking where it is solved',()=>{
 const doc=(estado)=>({importId:'i',importFileId:'f'+Math.random(),archivo:'a.pdf',partes:1,estado,registros:0,error:null});
 const groups=[
  {familia:'laboral',tipo:'nomina',subtipo:null,label:'Nómina',plantilla:null,documentos:[doc('pendiente'),doc('pendiente')]},
  {familia:'x',tipo:'y',subtipo:null,label:'Ignorados',plantilla:null,documentos:[doc('ignorado')]},
  {familia:'f',tipo:'recibo',subtipo:'alquiler',label:'Recibo',plantilla:{id:'T1',nombre:'Alquileres'},documentos:[doc('error'),doc('pendiente'),doc('procesado')]}];
 const invoices={key:'facturas',label:'Facturas',description:'',columns:[],rows:[{emisor:'A',receptor:'B',total:1},{emisor:null,receptor:'B',total:null},{emisor:'A',receptor:'B',total:2}]};
 const items=o.tablesReview({invoices,duplicatedLines:2,groups});
 assert.deepEqual(items.map(i=>i.key),['sin_tabla:laboral|nomina|','error:T1','nuevos:T1','sin_empresa','sin_total','lineas_dobles']);
 assert.equal(items[0].href,'/analytics?view=tablas&sintabla=laboral%7Cnomina%7C');
 assert.equal(items[1].href,'/analytics?view=tablas&table=plantilla%3AT1');
 assert.equal(items[0].title,'Nómina: 2 documentos sin tabla');
 assert.deepEqual(o.tablesReview({invoices:{...invoices,rows:[]},duplicatedLines:0,groups:[]}),[]);
 assert.deepEqual(o.tableCards([invoices],new Set()).map(c=>[c.key,c.rows,c.fromDocuments]),[['facturas',3,false]]);
});
