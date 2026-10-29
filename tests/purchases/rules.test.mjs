import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const r=load('lib/purchases/rules.ts');

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
  assert.equal(n.get('d').estado,'no_cuadra');
});

test('regalos y cifras que faltan pero se deducen: no se pregunta', () => {
  const n=r.normalizeLines([L('p',{grupo:'f',factura:'F1',cantidad:5,precio:18.65,importe:93.25}),L('g',{grupo:'f',factura:'F1',cantidad:1,precio:0,importe:null}),
    L('t',{grupo:'t',cantidad:3,precio:2,importe:null}),L('x',{grupo:'x',cantidad:null,precio:null,importe:12})]);
  assert.equal(n.get('g').estado,'regalo'); assert.equal(n.get('g').ahorro,18.65);
  assert.equal(n.get('t').estado,'auto'); assert.match(n.get('t').nota,/importe/);
  assert.equal(n.get('x').estado,'no_cuadra');
  const s=r.summarize(n); assert.equal(s.no_cuadra,1); assert.equal(s.regalo,1);
});

test('lo que el lector ya separa (descuento % y contenido por envase) cuenta como leído, no como corrección', () => {
  const n=r.normalizeLines([L('a',{...saco,cantidad:2,precio:1.93,descuento:null,descuentoPct:20,importe:77.2,envaseLeido:true})]);
  const a=n.get('a'); assert.equal(a.estado,'ok'); assert.equal(a.cantidad_real,50); assert.equal(a.descuento_pct,20); assert.ok(Math.abs(a.precio_final-1.544)<0.001);
  assert.doesNotMatch(a.nota,/Corregido/);
});

test('casos reales de facturas: descuento que coincide, contenido leído como cantidad, precio redondeado', () => {
  const bote={producto:'FRUTA B/1,25 KGS.',envase:1.25,unidadEnvase:'Kg'};
  const n=r.normalizeLines([
    // 10 botes × 1,25 kg × 17,95 €/kg − 20 % = 179,50 (que coincide con 10 × 17,95: el descuento no se ignora).
    L('a',{...bote,grupo:'b',cantidad:10,precio:17.95,descuento:20,importe:179.5}),
    // Se leyó 1,25 (lo que trae el bote) como cantidad: 93,25 € son 5 botes.
    L('b',{...bote,grupo:'f',cantidad:1.25,precio:18.65,descuento:20,importe:93.25}),
    // 2.000 tarrinas a 0,09 € (precio redondeado) con 15 %: 158,67 €.
    L('c',{grupo:'t',producto:'TARRINA CJ/2000 U.',envase:2000,unidadEnvase:'ud',cantidad:2000,precio:0.09,descuento:15,importe:158.67})]);
  assert.equal(n.get('a').caso,'envases'); assert.equal(n.get('a').descuento_pct,20); assert.equal(n.get('a').cantidad_real,12.5);
  assert.equal(n.get('b').caso,'contenido'); assert.equal(n.get('b').unidades,5); assert.equal(n.get('b').cantidad_real,6.25);
  assert.equal(n.get('c').caso,'pct'); assert.equal(n.get('c').cantidad_real,2000); assert.equal(n.get('c').estado,'auto');
});
