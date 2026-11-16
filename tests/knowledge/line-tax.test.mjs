import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>{throw Error('no deps');},m,m.exports);return m.exports;}
const {lineTaxRates}=load('lib/knowledge/intake/writer/line-tax.ts');
const L=(total,rate=null,code=null,totalWithTax=null)=>({rate,code,total,totalWithTax});
const rates=r=>r.map(x=>x&&x.rate);

test('a real rate printed on the line stays; a code is not taken for a rate',()=>{
 assert.deepEqual(rates(lineTaxRates([L(10,21),L(5,10)],[{rate:21,base:10,cuota:2.1},{rate:10,base:5,cuota:0.5}])),[21,10]);
});

test('Makro: codes 1 and 2 get the rate whose base their lines add up to',()=>{
 const r=lineTaxRates([L(4.36,1),L(12.10,2),L(3.00,2),L(2.64,1)],[{rate:10,base:7.00,cuota:0.70},{rate:21,base:15.10,cuota:3.17}]);
 assert.deepEqual(rates(r),[10,21,21,10]); assert.equal(r[0].how,'codigo');
});

test('Mercadona: no rate on the lines (amounts with VAT) → the only split that matches the summary',()=>{
 // Milk 4 %: 1,04 + 2,08 = 3,12 (base 3,00 + 0,12). Cleaning 21 %: 2,42 + 1,21 = 3,63 (base 3,00 + 0,63).
 const r=lineTaxRates([L(1.04),L(2.42),L(2.08),L(1.21)],[{rate:4,base:3.00,cuota:0.12},{rate:21,base:3.00,cuota:0.63}]);
 assert.deepEqual(rates(r),[4,21,4,21]); assert.equal(r[0].how,'reparto');
});

test('two ways to split → nothing is guessed',()=>{
 const r=lineTaxRates([L(1),L(2),L(3),L(4)],[{rate:4,base:5,cuota:null},{rate:21,base:5,cuota:null}]);
 assert.deepEqual(rates(r),[null,null,null,null]);
});

test('one rate in the summary → every line; both amounts printed → their ratio',()=>{
 assert.deepEqual(rates(lineTaxRates([L(10),L(5,2)],[{rate:21,base:15,cuota:3.15}])),[21,21]);
 assert.deepEqual(rates(lineTaxRates([L(10,null,null,11)],[])),[10]);
 assert.deepEqual(rates(lineTaxRates([L(10,2)],[])),[null],'a «2» with no summary is not a rate');
});

test('tickets that print base and cuota but not the rate; rates printed with 0,00 are ignored',()=>{
 // El Jamón: «8,34 · 0,36» is 4 %, «0,12 · 0,03» is 21 %; lines with VAT.
 assert.deepEqual(rates(lineTaxRates([L(0.15),L(8.70)],[{rate:null,base:8.34,cuota:0.36},{rate:null,base:0.12,cuota:0.03}])),[21,4]);
 // Supplier printing every rate: only 10 % has a base.
 assert.deepEqual(rates(lineTaxRates([L(123.2)],[{rate:0,base:0,cuota:0},{rate:21,base:0,cuota:0},{rate:10,base:112,cuota:11.2}])),[10]);
 // Only the cuota: from the lines' total.
 assert.deepEqual(rates(lineTaxRates([L(789.26)],[{rate:null,base:null,cuota:165.74}])),[21]);
});
