import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const taxonomy=load('lib/knowledge/intake/classifier/taxonomy.ts');
const sets=load('lib/knowledge/intake/targets/field-sets.ts',{'../classifier/taxonomy':taxonomy});
const contract=load('lib/knowledge/intake/targeted/contract.ts',{'../targets/field-sets':sets});
const compare=load('lib/knowledge/intake/verifier/compare.ts');
const verifierContract=load('lib/knowledge/intake/verifier/contract.ts');
const values=load('lib/knowledge/intake/verifier/values.ts',{'./compare':compare,'./contract':verifierContract,'../targets/field-sets':sets});

const part=(id,over={})=>({id,bloques:[{pagina:1,desde:1,hasta:5}],familia:'transaccion',tipo:'factura',subtipo:'compra_articulos',descripcion:'',destino:'engine',contieneTablas:true,confianza:'alta',evidencia:[],motivo:'m',...over});
const classified={archivoId:'f1',archivo:'compra.pdf',incidencias:[],partes:[
 part('p1'),
 part('p2',{bloques:[{pagina:2,desde:1,hasta:3}],familia:'texto',tipo:'comunicacion',subtipo:null,destino:'knowledge'}),
 part('p3',{bloques:[{pagina:3,desde:1,hasta:2}],familia:'operacion',tipo:'receta_escandallo',subtipo:null}),
]};

test('plan per part: field set → targeted; knowledge → no vision; no set or low confidence → full reading',()=>{
 const plans=contract.planParts(classified);
 assert.deepEqual(plans.map(p=>[p.parte.id,p.modo]),[['p1','dirigida'],['p2','knowledge'],['p3','lectura_completa']]);
 assert.deepEqual(plans[0].conjunto,['factura_nucleo','factura_compra_articulos']);assert.deepEqual(plans[0].paginas,[1]);
 const low=contract.planParts({...classified,partes:[part('p1',{confianza:'baja'})]});
 assert.equal(low[0].modo,'lectura_completa');assert.match(low[0].motivo,/confianza baja/);
});
test('the strict schema is generated from the field set, only for targeted parts',()=>{
 const schema=contract.fileSchema(contract.planParts(classified));
 assert.deepEqual(schema.properties.partes.required,['p1']);
 const p1=schema.properties.partes.properties.p1;
 assert.ok(p1.required.includes('issuer')&&p1.required.includes('lines'));
 assert.equal(p1.properties.lines.type,'array');assert.equal(p1.properties.issuer.properties.tax_id.properties.valor.type[1],'null');
 assert.equal(p1.properties.issuer.additionalProperties,false);
 assert.ok(p1.properties.lines.items.required.includes('source_ticket_date'),'ticket of origin per line');
});

const plans=contract.planParts({...classified,partes:[classified.partes[0]]});
const v=(valor,pagina=1)=>({valor,pagina});
const nil={valor:null,pagina:null};
const recordOf=(entity,vals={})=>Object.fromEntries(entity.fields.map(f=>[f.key,vals[f.key]??nil]));
function output(over={}){
 const ents=Object.fromEntries(plans[0].entidades.map(e=>[e.role,e.cardinality==='many'?[]:recordOf(e)]));
 ents.invoice=recordOf(plans[0].entidades.find(e=>e.role==='invoice'),{invoice_number:v('F-1'),issue_date:v('27/01/2026'),subtotal:v('59,66'),total_amount:v('72,19')});
 ents.issuer=recordOf(plans[0].entidades.find(e=>e.role==='issuer'),{legal_name:v('TIENDA SL'),tax_id:v('B84818442')});
 ents.recipient=recordOf(plans[0].entidades.find(e=>e.role==='recipient'),{legal_name:v('CLIENTE SL'),tax_id:v('872378581')});
 ents.lines=[recordOf(plans[0].entidades.find(e=>e.role==='lines'),{description:v('TABLERO PINO'),quantity:v('1'),line_total:v('39,99')}),recordOf(plans[0].entidades.find(e=>e.role==='lines'))];
 ents.tax_breakdown=[recordOf(plans[0].entidades.find(e=>e.role==='tax_breakdown'),{tax_rate:v('21.00'),tax_amount:v('12,53')})];
 return {partes:{p1:ents},propuestas:[],incidencias:[],...over};
}
test('validation: values as printed, empty rows dropped, required gaps reported, never invented',()=>{
 const r=contract.validateTargeted(output(),plans,'compra.pdf').partes.get('p1');
 assert.equal(r.entidades.lines.length,1,'template/empty rows are not lines');
 assert.equal(r.entidades.recipient.tax_id.valor,'872378581');
 assert.deepEqual(r.faltan,[],'all required present');
 const o=output();o.partes.p1.issuer.tax_id=nil;o.partes.p1.lines=[];
 const g=contract.validateTargeted(o,plans,'compra.pdf').partes.get('p1');
 assert.deepEqual(g.faltan,['issuer.tax_id','lines']);
});
test('validation corrects slips (page outside the part, duplicate proposals) and rejects broken shapes',()=>{
 const o=output({propuestas:[{parte:'p1',entidad:'issuer',campo:'tax_id',nombre:'NIF',valor:'X',pagina:1,motivo:''},{parte:'p1',entidad:'invoice',campo:'store_code',nombre:'Tienda',valor:'042',pagina:1,motivo:'código de tienda'}]});
 o.partes.p1.invoice.invoice_number={valor:'F-1',pagina:7};
 const r=contract.validateTargeted(o,plans,'compra.pdf');
 assert.equal(r.partes.get('p1').entidades.invoice.invoice_number.pagina,null);
 assert.deepEqual(r.partes.get('p1').propuestas.map(p=>p.campo),['store_code']);
 assert.ok(r.incidencias.some(i=>/página 7/.test(i))&&r.incidencias.some(i=>/ya es un campo/.test(i)));
 const broken=output();delete broken.partes.p1;
 assert.throws(()=>contract.validateTargeted(broken,plans,'compra.pdf'),/falta la extracción de la parte p1/);
});

const formats=load('lib/knowledge/intake/formats.ts',{'node:path':path,'@/lib/knowledge/import/supported-formats':load('lib/knowledge/import/supported-formats.ts')});
function extractor(respond,fullReading){
 const calls=[];
 const mod=load('lib/knowledge/intake/targeted/extract.ts',{'node:path':path,'@/lib/ai/openai':{getKnowledgeImportModel:()=>'gpt-5-mini',getOpenAIClient:()=>({})},'../targets/field-sets':sets,'./contract':contract,'../formats':formats});
 const client=()=>({responses:{create:async(req,opts)=>{calls.push({req,opts});return respond(req);}}});
 return {calls,run:(buf,c,base)=>mod.targetedExtractFile(buf,c,base,{client,model:()=>'gpt-5-mini',fullReading}),mod};
}
const base={archivoId:'f1',archivo:'compra.pdf',metodo:'pdf',referencias:[],paginas:[]};
test('one vision call per file with the PDF once; knowledge parts skipped; full reading only for parts that need it',async()=>{
 let full=0;
 const ex=extractor(()=>({status:'completed',output_text:JSON.stringify(output())}),async()=>{full++;return {metodo:'pdf_visual',paginas:[1,2,3].map(n=>({numero:n,bloques:[{tipo:'texto',texto:`pág ${n}`}],incidencias:[]}))};});
 const r=await ex.run(Buffer.from('%PDF'),classified,base);
 assert.equal(ex.calls.length,1);const {req,opts}=ex.calls[0];
 assert.equal(req.input[0].content[0].type,'input_file');assert.equal(opts.maxRetries,0);assert.equal(req.text.format.strict,true);
 const asked=req.input[0].content[1].text;assert.match(asked,/PARTE p1/);assert.doesNotMatch(asked,/PARTE p2|PARTE p3/);assert.match(asked,/tax_id\*/);
 assert.match(req.instructions,/fax/);assert.doesNotMatch(req.instructions+asked,/Mercadona|Leroy|O2|IGNIS/);
 assert.deepEqual(r.partes.map(p=>p.modo),['dirigida','knowledge','lectura_completa']);
 assert.equal(full,1);assert.deepEqual(r.partes[2].lectura.map(p=>p.numero),[3],'only the pages of that part');
 assert.equal(r.partes[1].entidades,undefined);
});
test('no targeted part → no vision call; incomplete responses are rejected; non-PDF sends its native reading',async()=>{
 const none=extractor(()=>{throw Error('no call');});
 const k=await none.run(Buffer.from('%PDF'),{...classified,partes:[classified.partes[1]]},base);assert.equal(none.calls.length,0);assert.equal(k.partes[0].modo,'knowledge');
 const bad=extractor(()=>({status:'incomplete',output_text:'{'}));
 await assert.rejects(()=>bad.run(Buffer.from('%PDF'),classified,base),/no terminó/);
 let n=0;const long=extractor(req=>++n===1?{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output_text:'{"partes":'}:{status:'completed',output_text:JSON.stringify(output())},async()=>({paginas:[]}));
 const lr=await long.run(Buffer.from('%PDF'),classified,base);
 assert.deepEqual(long.calls.map(c=>c.req.max_output_tokens),[16000,64000],'a long document is retried once with more room');
 assert.ok(lr.incidencias.some(i=>/Documento largo/.test(i)));
 const tooLong=extractor(()=>({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output_text:'{'}));
 await assert.rejects(()=>tooLong.run(Buffer.from('%PDF'),classified,base),/demasiado largo/);assert.equal(tooLong.calls.length,2);
 const filtered=extractor(()=>({status:'incomplete',incomplete_details:{reason:'content_filter'},output_text:''}));
 await assert.rejects(()=>filtered.run(Buffer.from('%PDF'),classified,base),/content_filter/);assert.equal(filtered.calls.length,1,'other reasons are not retried');
 const sheet=extractor(()=>({status:'completed',output_text:JSON.stringify(output())}),async()=>({paginas:[]}));
 await sheet.run(Buffer.from('x'),{...classified,archivo:'precios.xlsx'},{...base,metodo:'hoja_nativa',paginas:[{numero:1,bloques:[{tipo:'tabla',columnas:['A'],filas:[['1']]}],incidencias:[]}]});
 assert.equal(sheet.calls[0].req.input[0].content[0].type,'input_text');
});

// Value verification against the base reading.
const w=(t,x,y)=>({t,x0:x,x1:x+t.length*0.012,y0:y,y1:y+0.012});
const ref={archivoId:'f1',paginas:[{numero:1,fuente:'capa_texto',palabras:[w('Numero',0.05,0.10),w('NIF',0.13,0.10),w(':',0.18,0.10),w('B72378581',0.20,0.10),
 w('TABLERO',0.05,0.30),w('PINO',0.15,0.30),w('39,99',0.80,0.30),w('Total',0.05,0.50),w('72,19',0.80,0.50),w('F-1',0.05,0.05),w('27/01/2026',0.30,0.05),w('59,66',0.80,0.45),
 w('TIENDA',0.05,0.02),w('SL',0.15,0.02),w('B84818442',0.30,0.02),w('CLIENTE',0.05,0.08),w('SL',0.15,0.08),w('1',0.40,0.30),w('21.00',0.40,0.45),w('12,53',0.60,0.45),
 w('Facebook',0.05,0.95),w('Instagram',0.20,0.95)]}]};
test('extracted values are checked against the base reading: a B read as 8 in a tax id is a probable error; boilerplate is never noise',()=>{
 const p=contract.validateTargeted(output(),plans,'compra.pdf').partes.get('p1');
 const file={archivoId:'f1',archivo:'compra.pdf',incidencias:[],partes:[{parteId:'p1',modo:'dirigida',tipo:'factura',subtipo:'compra_articulos',paginas:[1],conjunto:[],motivo:'',...p}]};
 const r=values.verifyTargetedFile(file,ref);
 assert.equal(r.hallazgos.length,1,JSON.stringify(r.hallazgos));
 assert.deepEqual({campo:r.hallazgos[0].campo,valor:r.hallazgos[0].valor,doc:r.hallazgos[0].documento,sev:r.hallazgos[0].severidad},{campo:'recipient.tax_id',valor:'872378581',doc:'B72378581',sev:'probable_error'});
 assert.ok(r.comprobados>=10);
 const report=values.valuesReport('b',[r]);assert.equal(report.modo,'valores');assert.equal(report.resumen.distintos,1);assert.equal(report.module,'reading_verifier');
});
test('values without a page are searched on their part pages; non-PDF files are reported as not checked',()=>{
 const file={archivoId:'f1',archivo:'x.pdf',incidencias:[],partes:[{parteId:'p1',modo:'dirigida',tipo:'factura',subtipo:null,paginas:[1],conjunto:[],motivo:'',faltan:['invoice.due_date'],
  entidades:{invoice:{total_amount:{valor:'72,19',pagina:null},invoice_number:{valor:'F-9',pagina:null}}}}]};
 const r=values.verifyTargetedFile(file,ref);
 assert.deepEqual(r.hallazgos.map(h=>[h.campo,h.estado]),[['invoice.invoice_number','no_encontrado']],'short values are never paired by similarity');
 assert.deepEqual(r.faltan,[{parte:'p1',campo:'invoice.due_date'}]);
 assert.match(values.verifyTargetedFile(file,undefined).avisos[0],/no comprobados/);
});

// Extraction stage: classified batches get the targeted extraction, others keep the full reading.
test('extraction stage uses the targeted extraction for classified batches and keeps earlier checkpoints',async()=>{
 const extractorContract=load('lib/knowledge/intake/extractor/contract.ts');
 const updates=[];let fileUpdate;
 const batch={proposal_json:{version:1,archivos:[],lecturaBase:{status:'completed',resultado:{archivos:[base]}},clasificacion:{status:'completed',resultado:{archivos:[classified]}}},
  knowledge_import_files:[{id:'f1',file_name:'compra.pdf',storage_path:'k/f1'}]};
 const tx={knowledge_imports:{updateMany:async a=>{updates.push(a);return {count:1};}},knowledge_import_files:{update:async a=>{fileUpdate=a;}}};
 const db={knowledge_imports:{findFirstOrThrow:async()=>batch,updateMany:async a=>{updates.push(a);return {count:1};}},$transaction:async fn=>fn(tx)};
 let targetedCalls=0,fullCalls=0;
 const service=load('lib/knowledge/intake/extractor/process.ts',{'@prisma/client':{},'@/lib/prisma':{prisma:db},'@/lib/storage/knowledge-storage':{readKnowledgeFile:async()=>Buffer.from('%PDF')},
  './extract':{extractDocument:async()=>{fullCalls++;return {metodo:'pdf_visual',paginas:[]};}},'./contract':extractorContract,'../targeted/contract':contract,
  '../targeted/extract':{targetedExtractFile:async(_b,c)=>{targetedCalls++;return {archivoId:c.archivoId,archivo:c.archivo,partes:[],incidencias:[]};}}});
 await service.processExtractor('b',new Date());
 assert.equal(targetedCalls,1);assert.equal(fullCalls,0);
 const saved=updates[0].data;assert.equal(saved.status,'intake_completed');assert.equal(saved.proposal_json.resultado.module,'targeted_extraction');
 assert.deepEqual(saved.proposal_json.clasificacion,batch.proposal_json.clasificacion);assert.deepEqual(saved.proposal_json.lecturaBase,batch.proposal_json.lecturaBase);
 assert.equal(typeof fileUpdate.data.extracted_text,'string');
});
test('punctuation around a value in the document is not a difference; a dropped minus sign or inner change still is',()=>{
 const pref={archivoId:'f1',paginas:[{numero:1,fuente:'capa_texto',palabras:[w('CIF.',0.05,0.10),w('A-82018474.',0.12,0.10),w('IVA',0.05,0.20),w('(21.00',0.12,0.20),w('%)',0.22,0.20),
  w('Gran',0.05,0.30),w('Vía',0.12,0.30),w('28,',0.18,0.30),w('Madrid,',0.24,0.30),w('956289565-',0.05,0.40),w('Fijo',0.05,0.50),w('e',0.11,0.50),w('internet:',0.13,0.50),
  w('-5,00',0.05,0.60),w('S.A,U.',0.05,0.70)]}]};
 const f=(campo,valor)=>({[campo]:{valor,pagina:1}});
 const file={archivoId:'f1',archivo:'x.pdf',incidencias:[],partes:[{parteId:'p1',modo:'dirigida',tipo:'factura',subtipo:null,paginas:[1],conjunto:[],motivo:'',
  entidades:{issuer:{...f('tax_id','A-82018474'),...f('address','Gran Vía 28, Madrid'),...f('legal_name','S.A.U.')},tax:{...f('rate','21.00 %')},
   line:{...f('number','956289565'),...f('service','Fijo e internet'),...f('amount','5,00')}}}]};
 const r=values.verifyTargetedFile(file,pref);
 assert.deepEqual(r.hallazgos.map(h=>h.campo).sort(),['issuer.legal_name','line.amount'],JSON.stringify(r.hallazgos));
});
test('classification fields are not searched as text; a word glued by punctuation is present; digits inside numbers are not',()=>{
 const pref={archivoId:'f1',paginas:[{numero:1,fuente:'capa_texto',palabras:[w('Lectura',0.05,0.10),w('30/11/2025(REAL)',0.15,0.10),w('IGNIS_260022559',0.05,0.20),w('1,5',0.05,0.30)]}]};
 const f=(valor)=>({valor,pagina:1});
 const file={archivoId:'f1',archivo:'x.pdf',incidencias:[],partes:[{parteId:'p1',modo:'dirigida',tipo:'factura',subtipo:null,paginas:[1],conjunto:[],motivo:'',
  entidades:{meter_readings:[{reading_type:f('REAL')}],lines:[{line_total_basis:f('sin_impuestos'),description:f('IGNIS'),quantity:f('1')}]}}]};
 const r=values.verifyTargetedFile(file,pref);
 assert.deepEqual(r.hallazgos.map(h=>h.campo).sort(),['lines[1].description','lines[1].quantity'],JSON.stringify(r.hallazgos));
 assert.equal(r.comprobados,3,'the enum field is not counted as checked');
});

test('second pass: missing required fields are searched in the base reading (margins included) and accepted only if literal',async()=>{
 const o=output();o.partes.p1.issuer.tax_id=nil;o.partes.p1.issuer.legal_name=nil;
 const baseText={...base,paginas:[{numero:1,incidencias:[],bloques:[{tipo:'texto',texto:'FACTURA F-1'},{tipo:'texto',texto:'TIENDA DEMO, S.L. Calle Mayor 1 · CIF. B-00000000.'}]}]};
 const ex=extractor(req=>req.text.format.name==='missing_fields'
  ?{status:'completed',output_text:JSON.stringify({'p1.issuer.tax_id':{valor:'B-00000000',pagina:1},'p1.issuer.legal_name':{valor:'TIENDA INVENTADA SL',pagina:1}})}
  :{status:'completed',output_text:JSON.stringify(o)});
 const file=await ex.run(Buffer.from('%PDF'),{...classified,partes:[classified.partes[0]]},baseText);
 const p=file.partes.find(x=>x.parteId==='p1');
 assert.equal(ex.calls.length,2,'one visual call + one text-only call');
 const second=ex.calls[1].req;assert.equal(second.input[0].content[0].type,'input_text');assert.match(second.input[0].content[0].text,/CIF\. B-00000000\./);
 assert.deepEqual(Object.keys(second.text.format.schema.properties).sort(),['p1.issuer.legal_name','p1.issuer.tax_id'],'only the missing required fields');
 assert.deepEqual(p.entidades.issuer.tax_id,{valor:'B-00000000',pagina:1});
 assert.equal(p.entidades.issuer.legal_name.valor,null,'a value not printed in the document is discarded');
 assert.deepEqual(p.faltan,['issuer.legal_name']);
 assert.ok(file.incidencias.some(i=>/recuperado de la lectura base/.test(i))&&file.incidencias.some(i=>/no aparece literal/.test(i)));
 const complete=extractor(()=>({status:'completed',output_text:JSON.stringify(output())}));
 await complete.run(Buffer.from('%PDF'),{...classified,partes:[classified.partes[0]]},baseText);
 assert.equal(complete.calls.length,1,'nothing missing: no second call');
});

test('images are sent to the model as images (not as text), once',async()=>{
 const ex=extractor(()=>({status:'completed',output_text:JSON.stringify(output())}));
 await ex.run(Buffer.from('jpg-bytes'),{...classified,archivo:'ticket.jpg',partes:[classified.partes[0]]},{...base,archivo:'ticket.jpg',metodo:'imagen'});
 const content=ex.calls[0].req.input[0].content[0];
 assert.equal(content.type,'input_image');assert.match(content.image_url,/^data:image\/jpeg;base64,/);
});
