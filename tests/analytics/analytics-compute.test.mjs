import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const a=load('lib/analytics/compute.ts',{'@/lib/knowledge/intake/writer/duplicates':load('lib/knowledge/intake/writer/duplicates.ts'),'@/lib/purchases/analytics':load('lib/purchases/analytics.ts',{'@/lib/assistant/data/query':load('lib/assistant/data/query.ts'),'./rules':load('lib/purchases/rules.ts')})});

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

test('useful tables: readable columns, joined names, no relation tables, document links and editable cells',()=>{
 assert.deepEqual([...a.TABLE_KEYS],['facturas','compras','empresas','suministros','consumos']);
 const docs={...data,documents:{i1:{fileId:'FILE-1',fileName:'f1.pdf'}}};
 const f=a.buildTable(docs,'facturas');
 assert.equal(f.rows[0].numero,'F7','newest first');
 const f1=f.rows.find(r=>r.numero==='F1');
 assert.equal(f1.emisor,'Lácteos Norte SL');assert.equal(f1.receptor,'Mi Negocio');assert.equal(f1.categoria,'Compras');assert.equal(f1.tipo,'Gasto');
 assert.equal(f1.documento,'FILE-1');assert.equal(f1._id,'i1');assert.equal(f1._type,'invoice');
 assert.equal(f.rows.find(r=>r.numero==='V1').tipo,'Ingreso');
 assert.equal(f.columns.find(c=>c.key==='tipo').edit.field,'direction');
 const c=a.buildTable(docs,'compras');
 assert.ok(!c.rows.some(r=>r.producto==='Término de energía'));
 assert.equal(c.rows.find(r=>r.producto==='LECHE  ENTERA').fecha,'2026-03-01');assert.equal(c.rows.find(r=>r.producto==='Leche entera').documento,'FILE-1');
 const e=a.buildTable(data,'empresas');
 assert.deepEqual(e.rows.map(r=>[r.empresa,r.facturas,r.gasto]),[['Lácteos Norte SL',2,171],['Eléctrica Sur SA',1,60.5],['Mi Negocio',1,0]]);
 assert.equal(a.buildTable(data,'proveedores').key,'empresas','old links keep working');
 assert.equal(e.columns.find(c=>c.key==='empresa').edit.field,'legal_name');
 const s=a.buildTable(data,'suministros');
 assert.deepEqual(s.rows[0],{_id:'s1',tipo:'electricidad',identificador:'ES0000',tarifa:'2.0TD',titular:'Mi Negocio',facturas:1,gasto:60.5});
 assert.deepEqual(a.buildTable(data,'consumos').rows,[{mes:'ene 26',kwh:160}]);
 assert.equal(a.buildTable(data,'otra').key,'facturas');
});

test('income: invoices issued by «Mi empresa» (or marked emitida) are income, not spend; a mark wins',()=>{
 const own={...data,companies:data.companies.map(c=>c.id==='c1'?{...c,values:{...c.values,is_own_company:true}}:c)};
 const d=a.computeDashboard(own);
 assert.equal(d.kpis.totalSpend,55.5,'F1 and F3 (issued by my company) and the sale are not spend');
 assert.ok(!d.topSuppliers.some(s=>s.name==='Lácteos Norte SL'));
 const o=a.computeOverview(own);
 assert.deepEqual(o.totals,{ingresos:671,gastos:55.5,resultado:615.5,margen:91.73});assert.equal(o.hasOwnCompany,true);
 const inc=a.computeIncome(own);
 assert.equal(inc.total,671);assert.equal(inc.invoices,3);
 assert.deepEqual(inc.customers[0],{name:'Cliente sin identificar',total:550,invoices:2});
 const marked={...own,invoices:own.invoices.map(i=>i.id==='i1'?{...i,values:{...i.values,direction:'recibida'}}:i)};
 assert.equal(a.computeIncome(marked).total,550,'«recibida» set by the person wins over the issuer');
 assert.equal(a.computeOverview(data).hasOwnCompany,false);
 assert.equal(a.buildTable(own,'empresas').rows[0].empresa,'Lácteos Norte SL','my company first');
 assert.deepEqual(a.computeDashboard(own).subcategories.map(s=>s.key),['sin_subtipo']);
 // "From my company to my company" is a misread issuer (a water bill), not a sale.
 const self={...own,companies:own.companies.map(c=>c.id==='own'?{...c,values:{...c.values,is_own_company:true}}:c)};
 assert.equal(a.computeIncome(self).invoices,2,'F1 (to «Mi Negocio», also mine) stays an expense');
});

test('products: by spend and quantity, and unit price changes for products bought at least twice',()=>{
 const more={...data,lines:[...data.lines,
  {id:'l5',values:{description:'Leche entera',quantity:'10',unit_price:'1.00',line_total:'10.00',source_ticket_date:'2026-01-05'}},
  {id:'l6',values:{description:'Leche entera',quantity:'10',unit_price:'1.20',line_total:'12.00',source_ticket_date:'2026-03-02'}}],
  relations:{...data.relations,invoice_lines:[...data.relations.invoice_lines,['i1','l5'],['i3','l6']]}};
 const p=a.computeProducts(more);
 assert.equal(p.distinct,1);assert.equal(p.bySpend[0].name,'Leche entera');assert.equal(p.bySpend[0].quantity,38);
 assert.deepEqual(p.prices.map(x=>[x.name,x.first,x.last,x.change,x.purchases]),[['Leche entera',1,1.2,20,2]]);
 assert.equal(p.suppliers,1);
});

test('numbers: only exact numeric strings count',()=>{
 assert.equal(a.num('12.50'),12.5);assert.equal(a.num('-3'),-3);assert.equal(a.num('12,50'),null);assert.equal(a.num(''),null);assert.equal(a.num(7),7);
});

test('year selector: years with spend; a calendar year (the current one up to today); the rest of the panel follows the period',()=>{
 assert.deepEqual(a.availableYears(data),[2026]);
 const y=a.computeDashboard(data,{year:2026,today:new Date('2026-05-10T12:00:00Z')});
 assert.deepEqual(y.months,['2026-01','2026-02','2026-03','2026-04','2026-05'],'stops at the current month');
 assert.equal(y.kpis.totalSpend,226.5);assert.equal(y.kpis.lastMonth,'2026-05');
 const past=a.computeDashboard(data,{year:2025,today:new Date('2026-05-10T12:00:00Z')});
 assert.equal(past.months.length,12);assert.equal(past.kpis.totalSpend,0);assert.deepEqual(past.electricity,[],'consumption filtered by the period too');
 assert.deepEqual(past.topProducts.map(p=>p.name),['Nata'],'products go by the real ticket date, even inside a 2026 invoice');
 assert.deepEqual(a.buildTable(data,'consumos').rows,[{mes:'ene 26',kwh:160}],'the table keeps every month');
});

test('edits from Analítica: only a few fields, validated',()=>{
 const qy=load('lib/assistant/data/query.ts');const pl=load('lib/assistant/changes/plan.ts',{'@/lib/assistant/data/query':qy});
 const e=load('lib/analytics/edit.ts',{'./compute':a,'@/lib/assistant/changes/plan':pl});
 const f=[{key:'nombre',field_type:'text'},{key:'precio',field_type:'decimal'},{key:'fecha',field_type:'date'}];
 assert.deepEqual(e.editedCustomValues(f,{nombre:'a',precio:1},'precio','1.234,5'),{ok:true,values:{nombre:'a',precio:1234.5}});
 assert.deepEqual(e.editedCustomValues(f,{nombre:'a',precio:1},'precio',''),{ok:true,values:{nombre:'a'}},'empty clears');
 assert.deepEqual(e.editedCustomValues(f,{},'fecha','31/12/2026'),{ok:true,values:{fecha:'2026-12-31'}});
 assert.equal(e.editedCustomValues(f,{},'fecha','mañana').ok,false);assert.equal(e.editedCustomValues(f,{},'otra','x').ok,false);
 assert.deepEqual(e.editedValues('company',{legal_name:'D?PLOCIA',tax_identifier:'B1'},'legal_name','  D’PLOCIA   HELADOS SL '),{ok:true,values:{legal_name:'D’PLOCIA HELADOS SL',tax_identifier:'B1'}});
 assert.equal(e.editedValues('company',{},'legal_name','  ').ok,false);
 assert.deepEqual(e.editedValues('company',{},'is_own_company',true).values,{is_own_company:true});
 assert.equal(e.editedValues('company',{},'is_own_company','yes').ok,false);
 assert.equal(e.editedValues('invoice',{},'direction','emitida').values.direction,'emitida');
 assert.equal(e.editedValues('invoice',{},'direction','otra').ok,false);
 assert.equal(e.editedValues('invoice',{},'expense_category','servicios').ok,true);
 assert.equal(e.editedValues('invoice',{},'total_amount','1').ok,false,'amounts are not edited here');
 assert.equal(e.editedValues('company',{},'tax_identifier','B2').ok,false,'nor identifiers');
});

test('review: invoices whose lines add up to exactly twice the net, in pairs',()=>{
 const dup={...data,lines:[...data.lines,{id:'d1',values:{description:'Cono',line_total:'51.80'}},{id:'d2',values:{description:'Cono',line_total:'51.80'}}],
  invoices:[...data.invoices,{id:'i9',values:{invoice_number:'000831',issue_date:'2026-04-30',net_amount:'51.80',total_amount:'62.68'}}],
  relations:{...data.relations,invoice_lines:[...data.relations.invoice_lines,['i9','d1'],['i9','d2']]}};
 const issues=a.duplicatedLineIssues(dup);
 assert.deepEqual(issues.map(i=>[i.numero,i.sumaLineas,i.quitar]),[['000831',103.6,['d2']]]);
 assert.equal(a.buildTable(dup,'facturas').columns.find(c=>c.key==='emisor').edit.type,'party');
 assert.deepEqual(a.companyOptions(data).map(c=>c.nombre),['Eléctrica Sur SA','Lácteos Norte SL','Mi Negocio']);
});

test('template tables: their rows sum as costs of their category, and show as a table with the document',()=>{
 const nominas={id:'T1',nombre:'Nóminas',descripcion:'',campos:[{key:'trabajador',label:'Trabajador',type:'text'},{key:'fecha_pago',label:'Fecha de pago',type:'date'},{key:'coste_empresa',label:'Coste empresa',type:'decimal'}],
  analitica:{sumar:true,categoria:'personal',importe:'coste_empresa',fecha:'fecha_pago',tercero:'trabajador'},
  rows:[{id:'n1',values:{trabajador:'María',fecha_pago:'2026-01-31',coste_empresa:'1640.10'}},{id:'n2',values:{trabajador:'Jesús',fecha_pago:'2026-03-31',coste_empresa:'1000'}},{id:'n3',values:{trabajador:'X',coste_empresa:'5'}}]};
 const iva={...nominas,id:'T2',nombre:'IVA',analitica:{...nominas.analitica,sumar:false},rows:[{id:'v1',values:{fecha_pago:'2026-01-20',coste_empresa:'999'}}]};
 const withT={...data,templates:[nominas,iva],documents:{n1:{fileId:'F-N1',fileName:'nomina.pdf'}}};
 const d=a.computeDashboard(withT);
 assert.equal(d.spend[0].values.personal,1640.1);assert.equal(d.spend[2].values.personal,1000);
 assert.equal(d.kpis.totalSpend,226.5+2640.1,'a row without date does not count; a table not marked «sumar» neither');
 assert.ok(d.categories.includes('personal'));assert.deepEqual(d.subcategories.find(s=>s.key==='plantilla:T1'),{key:'plantilla:T1',label:'Nóminas',category:'personal',total:2640.1,invoices:2});
 assert.equal(a.computeOverview(withT).totals.gastos,226.5+500+2640.1-500,'overview adds them to expenses (the sale stays income)');
 const t=a.buildTable(withT,'plantilla:T1');
 assert.equal(t.label,'Nóminas');assert.deepEqual(t.columns.map(c=>[c.key,c.kind]),[['trabajador','text'],['fecha_pago','date'],['coste_empresa','money'],['documento','document']]);
 assert.deepEqual(t.rows[0],{_id:'n2',_rev:null,trabajador:'Jesús',fecha_pago:'2026-03-31',coste_empresa:1000,documento:null},'newest first');
 assert.equal(t.rows.find(r=>r.trabajador==='María').documento,'F-N1');
});
