import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const taxonomy=load('lib/knowledge/intake/classifier/taxonomy.ts');
const contract=load('lib/knowledge/intake/classifier/contract.ts',{'./taxonomy':taxonomy});
const extractorContract=load('lib/knowledge/intake/extractor/contract.ts');

// Synthetic reading: one PDF with two tickets and a legal footer (no real customer data).
const ticket=n=>[{tipo:'texto',texto:`Factura Simplificada: T-${n}`},{tipo:'tabla',columnas:['Descripción','Importe'],filas:[['PAN','1,00'],['TOTAL (€)','1,00']]}];
const file={archivoId:'f1',archivo:'tickets.pdf',metodo:'pdf_visual',paginas:[{numero:1,incidencias:[],bloques:[...ticket(1),...ticket(2),{tipo:'texto',texto:'Para cualquier devolución presente el ticket.'}]}]};
const part=(over={})=>({bloques:[{pagina:1,desde:1,hasta:2}],familia:'transaccion',tipo:'factura',subtipo:'factura_simplificada',descripcion:'',destino:'engine',contieneTablas:true,confianza:'alta',
 evidencia:[{pagina:1,bloque:1,texto:'Factura Simplificada: T-1'}],motivo:'Ticket con líneas e importe total',...over});
const valid=()=>({incidencias:[],partes:[part(),part({bloques:[{pagina:1,desde:3,hasta:5}],evidencia:[{pagina:1,bloque:3,texto:'Factura Simplificada: T-2'}]})]});

test('a valid classification keeps every block in exactly one part, with literal evidence',()=>{
 const r=contract.validateClassification(valid(),file);
 assert.deepEqual(r.partes.map(p=>[p.id,p.tipo,p.subtipo]),[['p1','factura','factura_simplificada'],['p2','factura','factura_simplificada']]);
 assert.equal(r.archivoId,'f1');
});
test('rejects blocks left out, blocks in two parts and ranges that do not exist',()=>{
 const gap=valid();gap.partes[1].bloques=[{pagina:1,desde:3,hasta:4}];
 assert.throws(()=>contract.validateClassification(gap,file),/sin clasificar \(p1 b5\)/);
 const overlap=valid();overlap.partes[1].bloques=[{pagina:1,desde:2,hasta:5}];overlap.partes[1].evidencia=[{pagina:1,bloque:3,texto:'Factura Simplificada: T-2'}];
 assert.throws(()=>contract.validateClassification(overlap,file),/en dos partes/);
 const ghost=valid();ghost.partes[1].bloques=[{pagina:1,desde:3,hasta:9}];
 assert.throws(()=>contract.validateClassification(ghost,file),/no existe en la lectura/);
 const page2=valid();page2.partes[1].bloques=[{pagina:2,desde:1,hasta:1}];
 assert.throws(()=>contract.validateClassification(page2,file),/no existe en la lectura/);
});
test('evidence must be literal text of a block of the same part',()=>{
 const invented=valid();invented.partes[0].evidencia=[{pagina:1,bloque:1,texto:'Factura de Mercadona'}];
 assert.throws(()=>contract.validateClassification(invented,file),/no aparece literalmente/);
 const foreign=valid();foreign.partes[0].evidencia=[{pagina:1,bloque:3,texto:'Factura Simplificada: T-2'}];
 assert.throws(()=>contract.validateClassification(foreign,file),/no pertenece a la parte/);
 const table=valid();table.partes[0].evidencia=[{pagina:1,bloque:2,texto:'TOTAL (€) |  1,00'}];
 assert.equal(contract.validateClassification(table,file).partes[0].evidencia[0].bloque,2,'table cells are quotable, whitespace-insensitive');
});
test('types must fit the taxonomy; "otro" is always available with a description',()=>{
 const bad=valid();bad.partes[0].tipo='receta_escandallo';
 assert.throws(()=>contract.validateClassification(bad,file),/no existe en la familia «transaccion»/);
 const sub=valid();sub.partes[0].subtipo='hosteleria';
 assert.throws(()=>contract.validateClassification(sub,file),/subtipo «hosteleria» no existe/);
 const other=valid();Object.assign(other.partes[0],{tipo:'otro',subtipo:null,descripcion:''});
 assert.throws(()=>contract.validateClassification(other,file),/requiere descripción/);
 other.partes[0].descripcion='Vale de descuento';
 assert.equal(contract.validateClassification(other,file).partes[0].descripcion,'Vale de descuento');
 const none=valid();none.partes[0].subtipo=null;
 assert.equal(contract.validateClassification(none,file).partes[0].subtipo,null,'subtype may stay undetermined');
 assert.match(taxonomy.describeTaxonomy(),/transaccion: factura \(suministro_electricidad/);
});
test('the model sees numbered blocks; long blocks are shortened, never silently dropped',()=>{
 const long={...file,paginas:[{numero:1,incidencias:[],bloques:[{tipo:'texto',texto:'x'.repeat(2000)}]}]};
 const input=contract.classifierInput(long);
 assert.equal(input.paginas[0].bloques[0].bloque,1);assert.ok(input.paginas[0].bloques[0].texto.endsWith('[…]'));
 assert.equal(contract.blockText(file.paginas[0].bloques[1]),'Descripción | Importe\nPAN | 1,00\nTOTAL (€) | 1,00');
});

function classifier(respond){
 const calls=[];
 const mod=load('lib/knowledge/intake/classifier/classify.ts',{'@/lib/ai/openai':{getKnowledgeImportModel:()=>'gpt-5-mini',getOpenAIClient:()=>({})},'./contract':contract,'./taxonomy':taxonomy});
 const client=()=>({responses:{create:async(req,opts)=>{calls.push({req,opts});return respond(req);}}});
 return {calls,classify:f=>mod.classifyFile(f,{client,model:()=>'gpt-5-mini'})};
}
test('one strict-schema call per file, no hidden retries, incomplete output rejected',async()=>{
 const ok=classifier(()=>({status:'completed',output_text:JSON.stringify(valid())}));
 const r=await ok.classify(file);
 assert.equal(r.partes.length,2);assert.equal(ok.calls.length,1);
 const {req,opts}=ok.calls[0];
 assert.equal(req.text.format.strict,true);assert.equal(opts.maxRetries,0);assert.match(req.instructions,/Taxonomía/);
 assert.match(req.input[0].content[0].text,/"bloque":3/);assert.doesNotMatch(req.instructions,/Mercadona|Toldos/);
 const partial=classifier(()=>({status:'incomplete',output_text:'{"partes":['}));
 await assert.rejects(()=>partial.classify(file),/no terminó/);
});

function fakeDb(){
 const db={saves:[],stored:null,knowledge_imports:{updateMany:async args=>{
  if(db.stored&&JSON.stringify(args.where.proposal_json.equals)!==JSON.stringify(db.stored))return {count:0};db.stored=args.data.proposal_json;db.saves.push(args.data.proposal_json);return {count:1};}}};
 return db;
}
function processModule(db){return load('lib/knowledge/intake/classifier/process.ts',{'@prisma/client':{},'@/lib/prisma':{prisma:db},'../extractor/contract':extractorContract,'./classify':{},'./contract':contract});}
const reading={module:'document_extractor',version:1,loteId:'b',archivos:[file,{...file,archivoId:'f2',archivo:'otro.pdf'}]};
const classified=f=>({archivoId:f.archivoId,archivo:f.archivo,partes:[],incidencias:[]});
test('classifies file by file, saving each before the next, and never touches the reading or the verification',async()=>{
 const db=fakeDb();const seen=[];
 const claimed={version:1,archivos:reading.archivos,resultado:reading,verificacion:{status:'completed'},clasificacion:{status:'running',revision:1,lease:'L',archivos:[]}};
 db.stored=JSON.parse(JSON.stringify(claimed));
 await processModule(db).runClassification('b',claimed,'L',{classifyFile:async f=>{seen.push(f.archivoId);return classified(f);}});
 assert.deepEqual(seen,['f1','f2']);assert.deepEqual(db.saves.map(s=>s.clasificacion.status),['running','running','completed']);
 const last=db.saves.at(-1);assert.equal(last.clasificacion.resultado.module,'document_classifier');
 assert.deepEqual(last.resultado,reading);assert.deepEqual(last.verificacion,{status:'completed'});
});
test('a retry continues after the files already classified; errors keep them',async()=>{
 const db=fakeDb();let calls=0;
 const claimed={version:1,archivos:reading.archivos,resultado:reading,clasificacion:{status:'running',revision:1,lease:'L',archivos:[classified(file)]}};
 db.stored=JSON.parse(JSON.stringify(claimed));
 await processModule(db).runClassification('b',claimed,'L',{classifyFile:async()=>{calls++;throw Error('timeout');}});
 assert.equal(calls,1,'only the pending file is sent');
 const last=db.saves.at(-1);assert.equal(last.clasificacion.status,'error');assert.match(last.clasificacion.error,/timeout/);assert.equal(last.clasificacion.archivos.length,1);
});
test('a concurrent change of the batch is not overwritten',async()=>{
 const db=fakeDb();db.stored={changed:true};
 const claimed={version:1,archivos:reading.archivos,resultado:reading,clasificacion:{status:'running',revision:1,lease:'L',archivos:[]}};
 await processModule(db).runClassification('b',claimed,'L',{classifyFile:async f=>classified(f)});
 assert.deepEqual(db.stored,{changed:true});
});
test('classification endpoint waits for the verification so modules never write the batch at once',()=>{
 const route=readFileSync('app/api/knowledge/intake/[importId]/classification/route.ts','utf8');
 assert.match(route,/verificacion\?\.status !== "completed" && payload\.verificacion\?\.status !== "error"/);
 assert.match(route,/proposal_json: \{ equals: batch\.proposal_json/);
});
