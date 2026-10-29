import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const r=load('lib/purchases/rules.ts');
const q=load('lib/purchases/questions.ts');

// Synthetic lines (no customer data).
const L=(id,o)=>({id,grupo:'g',factura:id,fecha:'2026-09-22',proveedor:'Proveedor S.L.',producto:'PRODUCTO',documento:null,cantidad:null,precio:null,descuento:null,importe:null,iva:10,unidad:null,envase:null,unidadEnvase:null,...o});
const saco={grupo:'saco',producto:'LECHE EN POLVO S/25 KGS.',envase:25,unidadEnvase:'Kg'};
const caja={grupo:'caja',producto:'LECHE B·I·BOX 10 LTS.',envase:10,unidadEnvase:'L'};

test('se corrige solo lo que cuadra al céntimo: saco por kilo con descuento en %', () => {
  const n=r.normalizeLines([L('a',{...saco,cantidad:1,precio:6.13,descuento:25,importe:114.94}),L('b',{...saco,cantidad:25,precio:6.13,descuento:25,importe:114.94})]);
  for (const id of ['a','b']) { const x=n.get(id); assert.equal(x.estado,'auto'); assert.equal(x.cantidad_real,25); assert.equal(x.unidad_real,'Kg'); assert.equal(x.descuento_pct,25); assert.ok(Math.abs(x.precio_final-4.5976)<0.001); }
  assert.match(n.get('a').nota,/Corregido automáticamente/);
});

test('cajas: cuadra tal cual; la cantidad mal leída se corrige sola solo si el precio es el habitual', () => {
  const lines=[L('a',{...caja,cantidad:20,precio:10.2,importe:204}),L('b',{...caja,cantidad:16,precio:10.2,importe:163.2}),L('c',{...caja,cantidad:10,precio:10.2,importe:61.2}),L('d',{...caja,cantidad:10,precio:11.7,importe:61.2})];
  const n=r.normalizeLines(lines);
  assert.equal(n.get('a').estado,'ok'); assert.equal(n.get('a').cantidad_real,200); assert.equal(n.get('a').precio_final,1.02);
  assert.equal(n.get('c').estado,'auto'); assert.equal(n.get('c').unidades,6); assert.equal(n.get('c').cantidad_real,60);
  assert.equal(n.get('d').estado,'pregunta');
  const qs=q.buildQuestions(lines,n);
  assert.equal(qs.length,1); assert.equal(qs[0].lineId,'d'); assert.equal(qs[0].pide,'unidades'); assert.match(qs[0].titulo,/Cuántas/);
});

test('regalos y cifras que faltan pero se deducen: no se pregunta', () => {
  const n=r.normalizeLines([L('p',{grupo:'f',factura:'F1',cantidad:5,precio:18.65,importe:93.25}),L('g',{grupo:'f',factura:'F1',cantidad:1,precio:0,importe:null}),
    L('t',{grupo:'t',cantidad:3,precio:2,importe:null}),L('x',{grupo:'x',cantidad:null,precio:null,importe:12})]);
  assert.equal(n.get('g').estado,'regalo'); assert.equal(n.get('g').ahorro,18.65);
  assert.equal(n.get('t').estado,'auto'); assert.match(n.get('t').nota,/importe/);
  assert.equal(n.get('x').estado,'pregunta'); assert.equal(n.get('x').falta,'cantidad');
  const s=r.summarize(n); assert.equal(s.pregunta,1); assert.equal(s.regalo,1);
});

test('la respuesta de la persona manda, y «no lo sé» deja de preguntarse', () => {
  const d=L('d',{...caja,cantidad:10,precio:11.7,importe:61.2});
  const n=r.normalizeLines([d],{d:{unidades:6}});
  assert.equal(n.get('d').estado,'confirmada'); assert.equal(n.get('d').cantidad_real,60); assert.equal(n.get('d').precio_final,1.02);
  assert.equal(r.normalizeLines([d],{d:{ignorar:true}}).get('d').estado,'ignorada');
});
