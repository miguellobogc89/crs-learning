import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const r=load('lib/purchases/review.ts');

// Synthetic lines (no customer data): a 25 kg sack priced per kg, a 10 L box priced per box, a free unit.
const L=(id,o)=>({id,grupo:o.grupo??'g',factura:o.factura??id,producto:'x',cantidad:null,precio:null,descuento:null,importe:null,iva:10,unidad:null,envase:null,unidadEnvase:null,...o});
const saco={grupo:'saco',envase:25,unidadEnvase:'Kg'}, caja={grupo:'caja',envase:10,unidadEnvase:'L'};

test('saco por kilo: una línea en envases y otra en kilos dan el mismo precio final', () => {
  const rv=r.reviewLines([L('a',{...saco,cantidad:1,precio:6.13,descuento:25,importe:114.94}),L('b',{...saco,cantidad:25,precio:6.13,descuento:25,importe:114.94})]);
  const a=rv.get('a'), b=rv.get('b');
  assert.equal(a.caso,'envases'); assert.equal(a.estado,'corregible'); assert.equal(a.cantidad_real,25); assert.equal(a.unidad_real,'Kg'); assert.equal(a.descuento_pct,25);
  assert.equal(b.caso,'descuento_pct'); assert.equal(b.cantidad_real,25);
  assert.ok(Math.abs(a.precio_final-4.5976)<0.001 && Math.abs(b.precio_final-4.5976)<0.001);
  assert.equal(a.precio_tarifa,6.13);
});

test('caja por caja: cuadra, y la cantidad mal leída se corrige con el importe', () => {
  const rv=r.reviewLines([L('a',{...caja,cantidad:20,precio:10.2,importe:204}),L('b',{...caja,cantidad:10,precio:10.2,importe:61.2})]);
  assert.equal(rv.get('a').estado,'ok'); assert.equal(rv.get('a').cantidad_real,200); assert.equal(rv.get('a').precio_final,1.02); assert.equal(rv.get('a').precio_tarifa,1.02);
  const b=rv.get('b'); assert.equal(b.caso,'cantidad_mal_leida'); assert.equal(b.unidades,6); assert.equal(b.cantidad_real,60); assert.equal(b.precio_final,1.02);
});

test('regalo valorado con la compra pagada de la misma factura; IVA; faltan datos; duda', () => {
  const rv=r.reviewLines([
    L('p',{grupo:'fr',factura:'f1',cantidad:5,precio:18.65,importe:93.25}), L('g',{grupo:'fr',factura:'f1',cantidad:1,precio:0,importe:null}),
    L('i',{grupo:'n',cantidad:6,precio:4,importe:26.4}), L('f',{grupo:'m',cantidad:2,precio:3,importe:null}), L('d',{grupo:'z',cantidad:3,precio:7,importe:50})]);
  assert.equal(rv.get('g').estado,'regalo'); assert.equal(rv.get('g').ahorro,18.65);
  assert.equal(rv.get('i').caso,'con_iva'); assert.equal(rv.get('f').estado,'faltan'); assert.equal(rv.get('d').estado,'duda');
  const s=r.summarize(rv); assert.equal(s.porEstado.regalo,1); assert.equal(s.porEstado.duda,1);
});

test('una revisión guardada manda sobre la calculada', () => {
  const rv=r.reviewLines([L('d',{cantidad:3,precio:7,importe:50})],{d:{estado:'revisada',caso:'duda',nota:'Precio fijado',precio_final:2}});
  assert.equal(rv.get('d').estado,'revisada'); assert.equal(rv.get('d').precio_final,2);
});
