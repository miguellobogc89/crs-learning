import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const a=load('lib/analytics/compute.ts');

// Synthetic workspace (no customer data).
const row=(id,values)=>({id,values});
const data={
 companies:[row('c1',{legal_name:'Lácteos Norte SL',tax_identifier:'B00000000'}),row('c2',{legal_name:'Eléctrica Sur SA',tax_identifier:'A00000000'}),row('own',{legal_name:'Mi Negocio'})],
 invoices:[
  row('i1',{invoice_number:'F1',issue_date:'2026-01-10',total_amount:'121.00',net_amount:'100.00',tax_amount:'21.00',expense_category:'compras'}),
  row('i2',{invoice_number:'F2',issue_date:'2026-01-20',total_amount:'60.50',expense_category:'suministros',period_end:'2026-01-15'}),
  row('i3',{invoice_number:'F3',issue_date:'2026-03-05',net_amount:'50.00',expense_category:'compras'}),
  row('i4',{invoice_number:'R1',issue_date:'2026-03-06',total_amount:'-10.00',expense_category:'rectificativas'}),
  row('i5',{invoice_number:'X',total_amount:'99.00'}),
  row('i6',{invoice_number:'V1',issue_date:'2026-03-07',total_amount:'500.00',direction:'emitida'}),
  row('i7',{invoice_number:'F7',issue_date:'2026-03-08',total_amount:'5.00'}),
 ],
 lines:[
  row('l1',{description:'Leche entera',quantity:'12',line_total:'10.00',line_total_with_tax:'11.00'}),
  row('l2',{description:'LECHE  ENTERA',quantity:'6',line_total:'5.00',source_ticket_date:'2026-03-01'}),
  row('l3',{description:'Término de energía',line_total:'40.00'}),
  row('l4',{description:'Nata',line_total:'3.00',source_ticket_date:'2025-01-01'}),
 ],
 supplies:[row('s1',{supply_type:'electricidad',supply_point_id:'ES0000',tariff:'2.0TD'})],
 consumption:[row('e1',{period:'P1',energy_kwh:'100'}),row('e2',{period:'P2',energy_kwh:'50'}),row('e3',{period:'Total',energy_kwh:'160'})],
 telecom:[],
 relations:{invoice_issuer:[['c1','i1'],['c2','i2'],['c1','i3']],invoice_customer:[['own','i1']],invoice_lines:[['i1','l1'],['i3','l2'],['i2','l3'],['i1','l4']],
  invoice_supply_point:[['s1','i2']],invoice_energy_consumption:[['i2','e1'],['i2','e2'],['i2','e3']],supply_point_holder:[['own','s1']]},
};

test('spend per month and category: continuous months, total (or net) amounts, received invoices only',()=>{
 const d=a.computeDashboard(data);
 assert.deepEqual(d.months,['2026-01','2026-02','2026-03'],'empty months between are kept so the axis is honest');
 assert.equal(d.spend[0].values.compras,121);assert.equal(d.spend[0].values.suministros,60.5);
 assert.equal(d.spend[1].total,0);
 assert.equal(d.spend[2].values.compras,50,'net amount when there is no total');
 assert.equal(d.spend[2].values.rectificativas,-10);
 assert.equal(d.spend[2].values.otros,5,'no category → Otros');
 assert.deepEqual(d.categories,['suministros','compras','rectificativas','otros'],'fixed order, only categories with data');
 assert.equal(d.kpis.totalSpend,226.5,'the issued invoice (a sale) is not spend');
 assert.equal(d.kpis.invoices,5);assert.equal(d.kpis.suppliers,2);
 assert.equal(d.kpis.lastMonth,'2026-03');assert.equal(d.kpis.lastMonthSpend,45);assert.equal(d.kpis.previousMonthSpend,0);
 assert.deepEqual(d.excluded,{withoutDate:1,withoutAmount:0,withoutCategory:2});
});

test('monthsBack keeps only the most recent months',()=>{
 const d=a.computeDashboard(data,2);
 assert.deepEqual(d.months,['2026-02','2026-03']);assert.equal(d.kpis.totalSpend,45);
});

test('top suppliers and products: products merge by name, use the ticket date, skip supply concepts and out-of-range lines',()=>{
 const d=a.computeDashboard(data);
 assert.deepEqual(d.topSuppliers[0],{name:'Lácteos Norte SL',spend:171,invoices:2});
 assert.ok(d.topSuppliers.some(s=>s.name==='Sin emisor identificado'));
 assert.equal(d.topProducts.length,1);
 assert.deepEqual(d.topProducts[0],{name:'Leche entera',quantity:18,spend:16,lines:2},'with-tax amount preferred');
});

test('electricity: a printed total wins over its periods, by the month the period ends',()=>{
 assert.deepEqual(a.computeDashboard(data).electricity,[{month:'2026-01',kwh:160}]);
 const noTotal={...data,consumption:data.consumption.slice(0,2)};
 assert.deepEqual(a.computeDashboard(noTotal).electricity,[{month:'2026-01',kwh:150}]);
});

test('useful tables: readable columns, joined names, no relation tables',()=>{
 assert.deepEqual([...a.TABLE_KEYS],['facturas','compras','proveedores','suministros','consumos']);
 const f=a.buildTable(data,'facturas');
 assert.equal(f.rows[0].numero,'F7','newest first');
 assert.equal(f.rows.find(r=>r.numero==='F1').proveedor,'Lácteos Norte SL');
 assert.equal(f.rows.find(r=>r.numero==='F1').categoria,'Compras');
 const c=a.buildTable(data,'compras');
 assert.ok(!c.rows.some(r=>r.producto==='Término de energía'));
 assert.equal(c.rows.find(r=>r.producto==='LECHE  ENTERA').fecha,'2026-03-01');
 const p=a.buildTable(data,'proveedores');
 assert.deepEqual(p.rows.map(r=>[r.empresa,r.facturas,r.gasto]),[['Lácteos Norte SL',2,171],['Eléctrica Sur SA',1,60.5]],'companies without invoices (own company) are not listed');
 const s=a.buildTable(data,'suministros');
 assert.deepEqual(s.rows[0],{tipo:'electricidad',identificador:'ES0000',tarifa:'2.0TD',titular:'Mi Negocio',facturas:1,gasto:60.5});
 assert.deepEqual(a.buildTable(data,'consumos').rows,[{mes:'ene 26',kwh:160}]);
 assert.equal(a.buildTable(data,'otra').key,'facturas');
});

test('numbers: only exact numeric strings count',()=>{
 assert.equal(a.num('12.50'),12.5);assert.equal(a.num('-3'),-3);assert.equal(a.num('12,50'),null);assert.equal(a.num(''),null);assert.equal(a.num(7),7);
});
