import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const q=load('lib/analytics/table-query.ts');
const cols=[{key:'fecha',label:'Fecha',kind:'date'},{key:'emisor',label:'Emisor',filter:true},{key:'total',label:'Total',kind:'money'},{key:'mia',label:'Mía',kind:'boolean',filter:true},{key:'doc',label:'Doc',kind:'document'}];
const rows=[
 {fecha:'2026-01-04',emisor:'Telefónica',total:38,mia:false,doc:'X'},
 {fecha:'2026-02-28',emisor:'Mercadona',total:152.62,mia:false,doc:null},
 {fecha:null,emisor:'Leroy Merlin',total:1234.5,mia:true,doc:null},
 {fecha:'2026-03-01',emisor:null,total:null,mia:false,doc:null},
 {fecha:'2026-01-20',emisor:'Telefónica',total:40,mia:false,doc:null}];
const base={search:'',filters:{},sort:null,page:1,pageSize:25};
const run=o=>q.queryRows(rows,cols,{...base,...o});

test('search: any visible text, as the person sees it (accents, dates, Spanish amounts), all words',()=>{
 assert.deepEqual(run({search:'telefonica'}).rows.map(r=>r.total),[38,40]);
 assert.equal(run({search:'01/2026'}).total,2);
 assert.equal(run({search:'1.234,50'}).total,1,'amount as printed in Spanish');
 assert.equal(run({search:'telefónica 20/01'}).total,1,'every word must match');
 assert.equal(run({search:'X'}).total,0,'document links are not searched');
});

test('filters: exact values, empty ones too; options by frequency',()=>{
 assert.equal(run({filters:{emisor:'Telefónica'}}).total,2);
 assert.equal(run({filters:{emisor:'__empty'}}).total,1);
 assert.equal(run({filters:{mia:'sí'}}).rows[0].emisor,'Leroy Merlin');
 assert.deepEqual(q.filterOptions(rows,cols[1]).map(o=>[o.label,o.count]),[['Telefónica',2],['(vacío)',1],['Leroy Merlin',1],['Mercadona',1]]);
 assert.deepEqual(q.filterOptions(rows,cols[3]).map(o=>o.label),['No','Sí']);
});

test('sort: numbers as numbers, dates as dates, empty values always last',()=>{
 assert.deepEqual(run({sort:{key:'total',dir:'asc'}}).rows.map(r=>r.total),[38,40,152.62,1234.5,null]);
 assert.deepEqual(run({sort:{key:'total',dir:'desc'}}).rows.map(r=>r.total),[1234.5,152.62,40,38,null]);
 assert.deepEqual(run({sort:{key:'fecha',dir:'desc'}}).rows.map(r=>r.fecha),['2026-03-01','2026-02-28','2026-01-20','2026-01-04',null]);
 assert.deepEqual(run({sort:{key:'emisor',dir:'asc'}}).rows.map(r=>r.emisor),['Leroy Merlin','Mercadona','Telefónica','Telefónica',null]);
});

test('pages: slices, and a page beyond the end shows the last one',()=>{
 const p=run({pageSize:2,page:2});assert.deepEqual([p.page,p.pages,p.total,p.rows.length],[2,3,5,2]);
 assert.equal(run({pageSize:2,page:9}).page,3);assert.equal(run({search:'nada'}).pages,1);
});

test("tablas del asistente: filtros automáticos en columnas que se repiten y en las «por completar»", async () => {
  const { withAutoFilters } = load('lib/analytics/compute.ts', { '@/lib/knowledge/intake/writer/duplicates': load('lib/knowledge/intake/writer/duplicates.ts'), '@/lib/purchases/analytics':load('lib/purchases/analytics.ts',{'@/lib/assistant/data/query':load('lib/assistant/data/query.ts'),'./rules':load('lib/purchases/rules.ts')}) });
  const rows = [
    { _id: "1", producto: "Leche", estado: "OK", envase: 10, precio: 10.2 },
    { _id: "2", producto: "Nata", estado: "Revisar", envase: null, precio: 4 },
    { _id: "3", producto: "Azúcar", estado: "OK", envase: 25, precio: null },
  ];
  const t = withAutoFilters({ key: "tabla:x", label: "X", description: "", columns: [
    { key: "producto", label: "Producto" }, { key: "estado", label: "Estado" },
    { key: "envase", label: "Envase", kind: "number", completar: true }, { key: "precio", label: "Precio", kind: "money" }], rows });
  const f = Object.fromEntries(t.columns.map(c => [c.key, !!c.filter]));
  assert.deepEqual(f, { producto: false, estado: true, envase: true, precio: false });
});
