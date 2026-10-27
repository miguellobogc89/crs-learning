import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const contract=load('lib/knowledge/intake/reconciliation/contract.ts');
const process_=load('lib/knowledge/intake/reconciliation/process.ts',{'@/lib/prisma':{prisma:null},'./contract':contract});

// Synthetic identifiers only (no customer data): B00000000 and 12345678Z are valid; B00000001 is not.
const v=valor=>({valor,pagina:1});
const invoicePart=(id,{issuerTax,issuerName,number,recipientTax='12345678Z',supply,lines=[]})=>({parteId:id,modo:'dirigida',tipo:'factura',subtipo:null,paginas:[1],conjunto:[],motivo:'',
 entidades:{issuer:{legal_name:v(issuerName),tax_id:v(issuerTax),address:v(null)},recipient:{legal_name:v('CLIENTE DEMO SL'),tax_id:v(recipientTax)},
  invoice:{invoice_number:v(number),total_amount:v('10,00')},...(supply?{supply:{supply_point_id:v(supply),plan:v('Tarifa demo')}}:{}),
  lines:lines.map(d=>({description:v(d),line_total:v('1,00')})),tax_breakdown:[{tax_rate:v('21%'),tax_amount:v('2,10')}]}});
const result={module:'targeted_extraction',version:1,loteId:'b',archivos:[
 {archivoId:'f1',archivo:'enero.pdf',incidencias:[],partes:[invoicePart('p1',{issuerTax:'B-00000000',issuerName:'PROVEEDOR DEMO, S.L.',number:'F 001',supply:'ES0000000000000000AA',lines:['A','B']}),
  {parteId:'p2',modo:'knowledge',tipo:'condiciones_legales',subtipo:null,paginas:[2],conjunto:[],motivo:''}]},
 {archivoId:'f2',archivo:'febrero.pdf',incidencias:[],partes:[invoicePart('p1',{issuerTax:'ES B00000000',issuerName:'Proveedor Demo SL',number:'F 002',supply:'es0000000000000000aa'})]},
 {archivoId:'f3',archivo:'ticket.pdf',incidencias:[],partes:[invoicePart('p1',{issuerTax:'B00000001',issuerName:'OTRA TIENDA',number:null,recipientTax:'12345678Z'})]}]};

test('Spanish tax ids: DNI, NIE and CIF check characters; foreign ids are not judged',()=>{
 assert.equal(contract.spanishTaxIdValid('12345678Z'),true);assert.equal(contract.spanishTaxIdValid('12345678A'),false);
 assert.equal(contract.spanishTaxIdValid('X1234567L'),true);
 assert.equal(contract.spanishTaxIdValid('B00000000'),true);assert.equal(contract.spanishTaxIdValid('B00000001'),false);
 assert.equal(contract.spanishTaxIdValid('DE123456789'),null);
 assert.equal(contract.normalizeIdentifier('company','ES B-00000000'),'B00000000');
 assert.equal(contract.normalizeIdentifier('company','esb00000000'),'B00000000');
 assert.equal(contract.normalizeIdentifier('telecom_line','956 28-95 65'),'956289565');
});

test('mentions group by identifier across documents; invoices are issuer + number; names never merge different ids',()=>{
 const g=contract.groupEntities(result);
 const refs=g.entidades.map(e=>e.ref).filter(r=>!r.startsWith('invoice:sin-identificador')).sort();
 assert.deepEqual(refs,['company:12345678Z','company:B00000000','company:B00000001','invoice:B00000000/F001','invoice:B00000000/F002','supply_point:ES0000000000000000AA']);
 const supplier=g.entidades.find(e=>e.ref==='company:B00000000');
 assert.equal(supplier.menciones.length,2,'same supplier in two invoices is one entity');
 assert.deepEqual(supplier.nombres,['PROVEEDOR DEMO, S.L.','Proveedor Demo SL']);
 assert.equal(g.entidades.find(e=>e.ref==='company:12345678Z').menciones.length,3,'the recipient of every invoice');
 assert.equal(g.entidades.find(e=>e.ref==='supply_point:ES0000000000000000AA').menciones.length,2);
 assert.match(g.entidades.find(e=>e.ref==='company:B00000001').avisos[0],/dígito de control/);
 assert.equal(g.entidades.find(e=>e.ref.startsWith('invoice:sin-identificador')).estado,'sin_identificador');
 assert.ok(g.relaciones.some(r=>r.desde==='invoice:B00000000/F001'&&r.relacion==='issuer'&&r.hacia==='company:B00000000'));
 assert.ok(g.relaciones.some(r=>r.desde==='invoice:B00000000/F002'&&r.relacion==='supply'&&r.hacia==='supply_point:ES0000000000000000AA'));
 assert.deepEqual(g.detalles.filter(d=>d.factura==='invoice:B00000000/F001').map(d=>[d.rol,d.filas]),[['lines',2],['tax_breakdown',1]],'details stay with their invoice');
 assert.ok(!g.entidades.some(e=>e.menciones.some(m=>m.parteId==='p2'&&m.archivo==='enero.pdf')),'knowledge parts are not reconciled');
});

function fakeDb({types,records,catalog=[]}){
 const calls=[];
 return {calls,engine_catalog_types:{findFirst:async a=>catalog.includes(a.where.key)?{id:'g-'+a.where.key}:null},engine_object_types:{findMany:async a=>{calls.push(['types',a]);return types.filter(t=>a.where.key.in.includes(t.key));}},
  engine_records:{findMany:async a=>{calls.push(['records',a]);return records.filter(r=>a.where.object_type_id.in.includes(r.type)).slice(0,a.take);}},
  knowledge_imports:{updateMany:async()=>{throw Error('reconciliation never writes records');}}};
}

test('existing records are found by any identifier field or external key; archived types ignored; read only',async()=>{
 const db=fakeDb({types:[{id:'t-org',key:'company'},{id:'t-inv',key:'invoice'}],records:[
  {id:'r1',type:'t-org',external_key:null,values_json:{name:'Proveedor',nif:'B-00000000'}},
  {id:'r2',type:'t-org',external_key:'12345678Z',values_json:{name:'Cliente'}},
  {id:'r3',type:'t-org',external_key:null,values_json:{tax_id:'12345678z'}},
  {id:'r4',type:'t-inv',external_key:null,values_json:{invoice_number:'F 001'}}]});
 const r=await process_.reconcile('b','w1',result,db);
 const by=ref=>r.entidades.find(e=>e.ref===ref);
 assert.equal(by('company:B00000000').estado,'existente');assert.deepEqual(by('company:B00000000').registros.map(x=>x.id),['r1']);
 assert.equal(by('company:12345678Z').estado,'ambigua','two records share the tax id: a person decides');
 assert.equal(by('company:B00000001').estado,'nueva');
 assert.equal(by('invoice:B00000000/F001').estado,'existente');assert.match(by('invoice:B00000000/F001').avisos.join(),/posible documento repetido/);
 assert.equal(by('invoice:B00000000/F002').estado,'nueva');
 assert.equal(by('supply_point:ES0000000000000000AA').estado,'tipo_no_definido','proposed catalog type not in the workspace yet');
 assert.equal(r.soloLectura,true);assert.equal(r.module,'reconciliation');
 assert.ok(db.calls.every(([kind,a])=>a.where.workspace_id==='w1'),'scoped to the batch workspace');
 assert.ok(db.calls.filter(([k])=>k==='records').every(([,a])=>a.where.status.not==='archived'));
 assert.deepEqual(r.resumen,{entidades:7,nuevas:2,existentes:2,ambiguas:1,sinIdentificador:1,noComprobadas:1,avisos:2});
});

test('a scan larger than the bound cannot prove absence: entities stay unchecked instead of "new"',async()=>{
 const many=Array.from({length:process_.SCAN_LIMIT+1},(_,i)=>({id:`r${i}`,type:'t-org',external_key:null,values_json:{tax_id:`X${i}`}}));
 const r=await process_.reconcile('b','w1',result,fakeDb({types:[{id:'t-org',key:'company'}],records:many}));
 assert.equal(r.entidades.find(e=>e.ref==='company:B00000000').estado,'no_comprobada');
});

test('orchestrator: reconciliation only after the verification has finished, and only for targeted extractions',async()=>{
 const m={exports:{}};new Function('module','exports',ts.transpileModule(readFileSync('components/knowledge/import/advance-intake.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);
 const {advanceIntake}=m.exports;
 const run=async(module,verification)=>{const urls=[];const view=await advanceIntake('x',async(url,method)=>{urls.push(`${method??'GET'} ${url}`);
  if(url.endsWith('/base-reading'))return {estado:'completed',resultado:{module:'base_reading'}};
  if(url.endsWith('/classification'))return {estado:'completed',resultado:{module:'document_classifier'}};
  if(url.endsWith('/verification'))return verification;
  if(url.endsWith('/reconciliation'))return method==='POST'?{estado:'completed'}:{estado:'completed',resultado:{module:'reconciliation'}};
  if(url.endsWith('/writing'))return {estado:'completed',resultado:{module:'record_writer'}};
  return {estado:'intake_completed',resultado:{module}};});return {view,urls};};
 const running=await run('targeted_extraction',{estado:'running'});
 assert.equal(running.view.phase,'verificacion');assert.ok(!running.urls.some(u=>u.endsWith('/reconciliation')));
 const done=await run('targeted_extraction',{estado:'completed',resultado:{module:'reading_verifier'}});
 assert.equal(done.view.status,'completed');assert.equal(done.view.reconciliation.result.module,'reconciliation');
 const failedCheck=await run('targeted_extraction',{estado:'error',error:'x'});assert.equal(failedCheck.view.reconciliation.status,'completed','a failed verification does not block it');
 const old=await run('document_extractor',{estado:'completed',resultado:{module:'reading_verifier'}});
 assert.ok(!old.urls.some(u=>u.endsWith('/reconciliation')));assert.equal(old.view.reconciliation,undefined);
});

test('a tax id misread by one look-alike character is flagged with the probable company, never merged',()=>{
 assert.deepEqual(contract.taxIdLookalikes('800000000'),['B00000000']);
 assert.deepEqual(contract.taxIdLookalikes('B00000000'),[],'valid ids have no look-alikes');
 const misread={...result,archivos:[...result.archivos,{archivoId:'f4',archivo:'compra.pdf',incidencias:[],partes:[invoicePart('p1',{issuerTax:'800000000',issuerName:'PROVEEDOR DEMO SL',number:'T-9'})]}]};
 const g=contract.groupEntities(misread);
 const wrong=g.entidades.find(e=>e.ref==='company:800000000');
 assert.ok(wrong,'kept apart: a person confirms');assert.match(wrong.avisos.join(),/probablemente es B00000000 \(PROVEEDOR DEMO, S\.L\.\)/);
 const lone=contract.groupEntities({...result,archivos:[{archivoId:'f5',archivo:'x.pdf',incidencias:[],partes:[invoicePart('p1',{issuerTax:'812345678',issuerName:'X',number:'1'})]}]});
 assert.match(lone.entidades.find(e=>e.ref==='company:812345678').avisos.join(),/9 cifras/);
});

test('a type of the global catalog not yet used by the workspace means no records: its entities are new',async()=>{
 const r=await process_.reconcile('b','w1',result,fakeDb({types:[],records:[],catalog:['company','invoice']}));
 const by=ref=>r.entidades.find(e=>e.ref===ref);
 assert.equal(by('company:B00000000').estado,'nueva');assert.equal(by('invoice:B00000000/F001').estado,'nueva');
 assert.equal(by('supply_point:ES0000000000000000AA').estado,'tipo_no_definido','not in the global catalog either');
});

test('a company printed without tax id gets a name suggestion (batch first, then existing records); never merged',()=>{
 assert.equal(contract.nameKey("D'PLOCIA HELADOS, S.L."),'dplociahelados');assert.equal(contract.nameKey('D PLOCIA HELADOS SL SL'),'dplociahelados');
 assert.equal(contract.nameKey('Proveedor Demo, S.L.U.'),'proveedordemo');
 const noId=(name)=>({archivoId:'f9',archivo:'sin-nif.pdf',incidencias:[],partes:[invoicePart('p1',{issuerTax:'B00000000',issuerName:'PROVEEDOR DEMO SL',number:'Z-1',recipientTax:null})].map(p=>({...p,entidades:{...p.entidades,recipient:{legal_name:{valor:name,pagina:1},tax_id:{valor:null,pagina:null}}}}))});
 const all=new Map(['company','invoice','supply_point','telecom_line'].map(t=>[t,{tipoDefinido:true,completo:true,candidatos:new Map()}]));
 const inBatch=contract.applyLookups('b',contract.groupEntities({...result,archivos:[...result.archivos,noId('Proveedor Demo, S.L.')]}),all);
 const anon=inBatch.entidades.find(e=>e.tipo==='company'&&!e.clave);
 assert.equal(anon.sugerencia,'company:B00000000');assert.equal(anon.estado,'sin_identificador');assert.match(anon.avisos.join(),/por el nombre parece/);
 const stored=new Map(all);stored.set('company',{...all.get('company'),porNombre:new Map([['clientedemo',[{id:'r-own',nombre:'CLIENTE DEMO SL',clave:'12345678Z'}]]])});
 const onlyFile={...result,archivos:[noId('Cliente Demo, S.L.')]};
 const existing=contract.applyLookups('b',contract.groupEntities(onlyFile),stored).entidades.find(e=>e.tipo==='company'&&!e.clave);
 assert.deepEqual(existing.sugerenciaRegistro,{id:'r-own',nombre:'CLIENTE DEMO SL',clave:'12345678Z'});
});
