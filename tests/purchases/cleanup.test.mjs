import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const rules=load('lib/purchases/rules.ts');
const analytics=load('lib/purchases/analytics.ts',{'@/lib/assistant/data/query':load('lib/assistant/data/query.ts'),'./rules':rules});
const c=load('lib/purchases/cleanup.ts',{'./analytics':analytics});

// Synthetic workspace (no customer data): one supplier, a sack priced per kilo, a box priced per box.
const row=(id,values)=>({id,values});
const data={companies:[row('s',{legal_name:'Proveedor S.L.'})],
 invoices:[row('f1',{issue_date:'2026-09-01'}),row('f2',{issue_date:'2026-09-02'}),row('f3',{issue_date:'2026-09-03'}),row('f4',{issue_date:'2026-09-04'})],
 lines:[row('a',{description:'LECHE EN POLVO S/25 KGS.',quantity:'1',unit_price:'6.13',discount_amount:'25',line_total:'114.94'}),
  row('b',{description:'CAJA LECHE 10 LTS.',quantity:'20',unit_price:'10.20',line_total:'204'}),
  row('c',{description:'CAJA LECHE 10 LTS.',quantity:'10',unit_price:'10.20',line_total:'61.20'}),
  row('d',{description:'ALGO',quantity:'2',unit_price:'3',line_total:'6'})],
 supplies:[],consumption:[],telecom:[],
 relations:{invoice_lines:[['f1','a'],['f2','b'],['f3','c'],['f4','d']],invoice_issuer:[['s','f1'],['s','f2'],['s','f3'],['s','f4']]}};

test('limpieza: escribe en la línea solo lo que sus cifras demuestran', () => {
  const fixes=c.cleanupPlan(data);
  const by=Object.fromEntries(fixes.map(f=>[f.lineId,f]));
  assert.deepEqual(by.a.valores,{discount_percent:25,discount_amount:null,package_content:25,package_unit:'kg',package_count:1});
  assert.deepEqual(by.c.valores,{quantity:6});
  assert.equal(by.b,undefined); assert.equal(by.d,undefined);
  assert.deepEqual(c.cleanupSummary(fixes),{total:2,descuentos:1,envases:1,cantidades:1});
});
