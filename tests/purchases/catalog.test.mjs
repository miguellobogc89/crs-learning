import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const rules=load('lib/purchases/rules.ts');
const analytics=load('lib/purchases/analytics.ts',{'@/lib/assistant/data/query':load('lib/assistant/data/query.ts'),'./rules':rules});
const c=load('lib/purchases/catalog.ts',{'./analytics':analytics});

// Synthetic workspace (no customer data): a catalog linked from «Productos comprados».
const row=(id,values)=>({id,values});
const inv=(id,date)=>row(id,{issue_date:date});
function workspace(lines, catalogRows, pairs){
  return {companies:[row('s',{legal_name:'Proveedor S.L.'})],
    invoices:lines.map((l,i)=>inv(`f${i}`,l.date)),
    lines:lines.map(l=>row(l.id,l.values)),
    supplies:[],consumption:[],telecom:[],
    relations:{invoice_lines:lines.map((l,i)=>[`f${i}`,l.id]),invoice_issuer:lines.map((l,i)=>['s',`f${i}`])},
    custom:[{typeId:'t',typeKey:'catalogo',nombre:'Catálogo',descripcion:'',titulo:'producto',
      campos:['producto','envase','unidad','compras','precio_envase','precio_unidad','estado','notas','desde','no_cuadran'].map(key=>({key,label:key,type:'text',money:false,completar:false})),
      rows:catalogRows}],
    links:[{from:'compras',columna:'producto_catalogo',nombre:'Producto',to:'tabla:catalogo',relationId:'r',relationKey:'r',completar:false,pairs}]};
}

test('catálogo en vivo: último precio que cuadra, desde cuándo, y un descuento distinto no es cambio de tarifa', () => {
  const lines=[
    {id:'a',date:'2026-02-10',values:{description:'BASE B/1,6 KG.',quantity:'2',unit_price:'28.10',discount_percent:35,line_total:'58.45'}},
    {id:'b',date:'2026-06-10',values:{description:'BASE B/1,6 KG.',quantity:'5',unit_price:'28.10',discount_percent:25,line_total:'168.60'}},
    {id:'g',date:'2026-06-10',values:{description:'BASE B/1,6 KG.',quantity:'1',unit_price:'0'}}];
  const d=workspace(lines,[row('p',{producto:'BASE B/1,6 KG.',envase:1.6,unidad:'Kg',compras:1,precio_envase:99,estado:'Revisar'})],[['a','p'],['b','p'],['g','p']]);
  const v=c.liveCatalog(d).values.get('p');
  assert.equal(v.compras,3); assert.equal(v.no_cuadran,0); assert.equal(v.estado,'OK');
  assert.equal(v.precio_unidad,21.075); assert.equal(v.precio_envase,33.72); assert.equal(v.precio_tarifa,44.96); assert.equal(v.desde,'2026-06-10'); assert.equal(v.notas,null);
});

test('catálogo en vivo: subida de tarifa > 10 %, compras que no cuadran y producto sin precio', () => {
  const lines=[
    {id:'a',date:'2026-03-01',values:{description:'LECHE 1L',quantity:'6',unit_price:'1.00',line_total:'6.00'}},
    {id:'b',date:'2026-05-01',values:{description:'LECHE 1L',quantity:'6',unit_price:'1.20',line_total:'7.20'}},
    {id:'x',date:'2026-04-01',values:{description:'LECHE 1L',quantity:'6',unit_price:'1.00',line_total:'9.99'}},
    {id:'z',date:'2026-04-01',values:{description:'MUESTRA',line_total:'5.00'}}];
  const d=workspace(lines,[row('p',{producto:'LECHE 1L',envase:1,unidad:'L'}),row('m',{producto:'MUESTRA',precio_envase:3.5})],[['a','p'],['b','p'],['x','p'],['z','m']]);
  const live=c.liveCatalog(d).values;
  const p=live.get('p');
  assert.equal(p.estado,'Revisar'); assert.equal(p.precio_envase,1.2); assert.equal(p.no_cuadran,1);
  assert.match(p.notas,/subido un 20 % respecto a la compra del 01\/03\/2026/); assert.match(p.notas,/No cuadran: 01\/04\/2026 \(9,99 €\)/);
  const m=live.get('m');
  assert.equal(m.estado,'Revisar'); assert.equal('precio_envase' in m,false); assert.match(m.notas,/Ninguna compra/);
});

test('catálogo en vivo: lo que solo llegó como regalo no se marca para revisar', () => {
  const d=workspace([{id:'g',date:'2026-09-04',values:{description:'MUFFIN',quantity:'1',unit_price:'0'}}],[row('m',{producto:'MUFFIN'})],[['g','m']]);
  const m=c.liveCatalog(d).values.get('m');
  assert.equal(m.estado,'Regalo'); assert.match(m.notas,/regalo/);
});

test('limpieza: lo corregido a mano no se toca', () => {
  const cl=load('lib/purchases/cleanup.ts',{'./analytics':analytics});
  const d=workspace([{id:'b',date:'2026-05-20',values:{description:'CIERRE',quantity:'2',unit_price:'4.95',line_total:'4.95',line_total_with_tax:'11.98',tax_rate:'21'}}],[row('p',{producto:'CIERRE'})],[['b','p']]);
  assert.equal(cl.cleanupPlan(d).length,1);
  assert.equal(cl.cleanupPlan({...d,manual:{b:['line_total']}}).length,0);
});
