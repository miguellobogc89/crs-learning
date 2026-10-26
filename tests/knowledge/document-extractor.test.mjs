import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const contract=load('lib/knowledge/intake/extractor/contract.ts');
const layout=load('lib/knowledge/intake/extractor/layout.ts');
const fixture=()=>({paginas:[{numero:1,bloques:[
 {tipo:'texto',texto:'Empresa emisora\nCliente identificado'},
 {tipo:'tabla',columnas:['Cantidad','Descripción','PRECIO UNITARIO','TOTAL €'],filas:[['2','Confección, mano de obra y montaje','','789,26 €']]},
 {tipo:'texto',texto:'Subtotal 789,26 €\nIVA 21 % 165,74 €\nTOTAL 955,00 €'}],incidencias:[]}]});
function visual(response,requests=[]){return load('lib/knowledge/intake/extractor/extract.ts',{
 'node:path':require('node:path'),unpdf:{getDocumentProxy:async()=>({numPages:1,destroy:async()=>{}})},xlsx:require('xlsx'),'./contract':contract,'./layout':layout,
 '@/lib/knowledge/documents/extract-document-text':{extractDocumentText:()=>{throw Error('PDF must not be flattened');}},
 '@/lib/ai/openai':{getKnowledgeImportModel:()=> 'vision-model',getOpenAIClient:()=>({responses:{create:async(...args)=>{requests.push(args);return Array.isArray(response)?response[Math.min(requests.length-1,response.length-1)]:response;}}})}
});}
test('PDF passes original bytes as native visual input, never falls back to flattened text',async()=>{
 const requests=[];const service=visual({status:'completed',output_text:JSON.stringify(fixture())},requests);
 const bytes=Buffer.from('%PDF-original');const result=await service.extractDocument(bytes,'source.pdf');
 const [request,options]=requests[0];const content=request.input[0].content;
 assert.equal(content[0].type,'input_file');assert.equal(content[0].file_data,`data:application/pdf;base64,${bytes.toString('base64')}`);assert.match(content[1].text,/JSON/);
 assert.equal(request.text.format.type,'json_schema');assert.equal(request.text.format.strict,true);assert.equal(options.maxRetries,0);assert.equal(options.timeout,120000);assert.equal(result.metodo,'pdf_visual');
 const row=result.paginas[0].bloques[1].filas[0];assert.equal(row.length,4);assert.equal(row[0],'2');assert.equal(row[2],'');assert.equal(row[3],'789,26 €');
});
test('rejects incomplete model output and missing pages instead of accepting partial extraction',async()=>{
 await assert.rejects(()=>visual({status:'incomplete',output_text:JSON.stringify(fixture())}).extractDocument(Buffer.from('pdf'),'s.pdf'),/parcial/);
 assert.throws(()=>contract.validateExtraction(fixture(),2),/todas las páginas/);
 const p=fixture();p.paginas[0].numero=2;assert.throws(()=>contract.validateExtraction(p,1),/desordenadas/);
});
test('preserves blank cells and rejects numeric coercion, dropped cells and schema proposals',()=>{
 assert.equal(contract.validateExtraction(fixture(),1)[0].bloques[1].filas[0][2],'');
 const p=fixture();p.paginas[0].bloques[1].filas[0].splice(2,1);assert.throws(()=>contract.validateExtraction(p,1),/celdas/);
 const q=fixture();q.paginas[0].bloques[1].filas[0][3]=789.26;assert.throws(()=>contract.validateExtraction(q,1),/celdas/);
 assert.throws(()=>contract.validateExtraction({...fixture(),entities:[]},1),/ajenas/);
});
test('unreadable content is distinct from blank and requires an explicit incident',()=>{
 const p=fixture();p.paginas[0].bloques[1].filas[0][2]=null;assert.throws(()=>contract.validateExtraction(p,1),/ilegibles/);
 p.paginas[0].incidencias.push('La celda no puede leerse');assert.equal(contract.validateExtraction(p,1)[0].bloques[1].filas[0][2],null);
});
test('native spreadsheet extraction preserves row positions including empty cells without model calls',async()=>{
 const XLSX=require('xlsx');const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Cantidad','Concepto','Unitario','Total'],[2,'Servicio','',789.26]]),'Detalle');
 const service=visual({});const result=await service.extractDocument(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),'document.xlsx');
 assert.equal(result.metodo,'hoja_nativa');assert.equal(result.paginas[0].bloques[1].filas[1][2],'');assert.equal(result.paginas[0].bloques[1].filas[1].length,4);
});
test('persisted extractor writes only staging, completes a fresh single-file batch and retains full JSON',async()=>{
 const updates=[];let fileWrites=0;
 const batch={proposal_json:{version:1,archivos:[]},knowledge_import_files:[{id:'f',file_name:'source.pdf',storage_path:'private'}]};
 const db={knowledge_imports:{findFirstOrThrow:async args=>{assert.equal(args.where.upload_type,contract.EXTRACTOR_UPLOAD_TYPE);return batch;},updateMany:async args=>{updates.push(args);return {count:1};}},$transaction:async fn=>fn({knowledge_imports:{updateMany:async args=>{updates.push(args);return {count:1};}},knowledge_import_files:{update:async()=>fileWrites++}})};
 const service=load('lib/knowledge/intake/extractor/process.ts',{'@prisma/client':{},'@/lib/prisma':{prisma:db},'@/lib/storage/knowledge-storage':{readKnowledgeFile:async()=>Buffer.from('original')},'./extract':{extractDocument:async()=>({metodo:'pdf_visual',paginas:fixture().paginas})},'./contract':contract});
 const lease=new Date();await service.processExtractor('fresh',lease);
 assert.equal(updates[0].data.status,'intake_completed');const result=updates[0].data.proposal_json.resultado;assert.equal(result.module,'document_extractor');assert.equal(result.archivos[0].paginas[0].bloques[1].filas[0][2],'');assert.equal(fileWrites,1);assert.equal(updates[0].where.processing_started_at,lease);
});
test('later file failure preserves earlier extracted documents and never reruns them',async()=>{
 const savedFile={archivoId:'done',archivo:'done.pdf',metodo:'pdf_visual',paginas:fixture().paginas};let reads=0,saved;
 const batch={proposal_json:{version:1,archivos:[savedFile]},knowledge_import_files:[{id:'done',storage_path:'done'},{id:'bad',file_name:'bad.pdf',storage_path:'bad'}]};
 const service=load('lib/knowledge/intake/extractor/process.ts',{'@prisma/client':{},'@/lib/prisma':{prisma:{knowledge_imports:{findFirstOrThrow:async()=>batch,updateMany:async args=>{saved=args.data;return {count:1};}}}},'@/lib/storage/knowledge-storage':{readKnowledgeFile:async path=>{reads++;assert.equal(path,'bad');return Buffer.from('pdf');}},'./extract':{extractDocument:async()=>{throw Error('incomplete');}},'./contract':contract});
 await service.processExtractor('b',new Date());assert.equal(reads,1);assert.equal(saved.status,'intake_error');assert.equal(saved.proposal_json,undefined);assert.deepEqual(batch.proposal_json.archivos,[savedFile]);
});
test('lost lease cannot save a file or publish extraction',async()=>{
 let writes=0,error;
 const service=load('lib/knowledge/intake/extractor/process.ts',{'@prisma/client':{},'@/lib/prisma':{prisma:{knowledge_imports:{findFirstOrThrow:async()=>({proposal_json:{version:1,archivos:[]},knowledge_import_files:[{id:'f',file_name:'f.pdf',storage_path:'s'}]}),updateMany:async args=>{error=args.data.error_message;return {count:0};}},$transaction:async fn=>fn({knowledge_imports:{updateMany:async()=>({count:0})},knowledge_import_files:{update:async()=>writes++}})}},'@/lib/storage/knowledge-storage':{readKnowledgeFile:async()=>Buffer.from('pdf')},'./extract':{extractDocument:async()=>({metodo:'pdf_visual',paginas:fixture().paginas})},'./contract':contract});
 await service.processExtractor('b',new Date());assert.equal(writes,0);assert.match(error,/ejecución/);
});

test('CSV identifiers and decimal strings are not coerced into numbers',async()=>{
 const service=visual({});const result=await service.extractDocument(Buffer.from('Id;Importe;Vacío\n0012;789,26;\n'),'source.csv');
 const row=result.paginas[0].bloques[1].filas[1];assert.equal(row[0],'0012');assert.equal(row[1],'789,26');assert.equal(row[2],'');
});
function receiptPages() {
 const columnas=['Descripción','Unid.','P.Unitario','B.Imp.','IVA','Cuota IVA','Importe'];
 return [{numero:1,bloques:[
  {tipo:'tabla',columnas,filas:[['LECHE ENTERA S/LACT','2','6,0000','12,0000','4%','0,4800','12,4800'],['LECHE ENTERA P6','10','9,0000','90,0000','4%','3,6000','93,6000'],['FREGONA HILO MIR.','1','2,3141','2,3141','21%','0,4860','2,8000']]},
  {tipo:'texto',texto:'TOTAL (€)\n104,31          4,57          108,88'},
  {tipo:'texto',texto:'Segunda operación'},
  {tipo:'tabla',columnas,filas:[['LECHE ENTERA P6','2','9,0000','18,0000','4%','0,7200','18,7200'],['LECHE ENTERA S/LACT','3','6,0000','18,0000','4%','0,7200','18,7200'],['FRIEGASUELOS PINO','3','0,7851','2,3554','21%','0,4946','2,8500'],['LEJIA DETERG.LIMON','3','0,9504','2,8512','21%','0,5988','3,4500']]},
  {tipo:'texto',texto:'TOTAL (€)\n41,21          2,53          43,74'}
 ],incidencias:[]}];
}
function correctedReceipts() {
 const p=receiptPages();p[0].bloques[0].filas.push(['TOTAL (€)','','','104,31','','4,57','108,88']);p[0].bloques[3].filas.push(['TOTAL (€)','','','41,21','','2,53','43,74']);p[0].bloques=p[0].bloques.filter(b=>b.tipo==='tabla'||b.texto==='Segunda operación');return p;
}
test('detects detached summary rows generically without invoice-specific words',()=>{
 assert.equal(layout.detachedTableRows(receiptPages()).length,2);assert.equal(layout.detachedTableRows(correctedReceipts()).length,0);
 const p=receiptPages();p[0].bloques[1].texto='Balance\n104,31 4,57 108,88';assert.equal(layout.detachedTableRows(p).length,2);
 p[0].bloques[1].texto='El plazo de entrega es de 2 a 4 días';assert.equal(layout.detachedTableRows(p).length,1);
});
test('conditional visual review preserves seven items and restores each total to its original columns',async()=>{
 const requests=[];const output=p=>({status:'completed',output_text:JSON.stringify({paginas:p})});
 const service=visual([output(receiptPages()),output(correctedReceipts())],requests);
 const bytes=Buffer.from('%PDF-original');const result=await service.extractDocument(bytes,'scan.pdf');
 assert.equal(requests.length,2);assert.equal(requests[0][0].input[0].content[0].file_data,requests[1][0].input[0].content[0].file_data);
 const tables=result.paginas[0].bloques.filter(b=>b.tipo==='tabla');assert.equal(tables[0].filas.length,4);assert.equal(tables[1].filas.length,5);
 assert.equal(tables[0].filas[3][3],'104,31');assert.equal(tables[0].filas[3][5],'4,57');assert.equal(tables[0].filas[3][6],'108,88');assert.equal(tables[1].filas[4][6],'43,74');
});
test('correctly structured input uses one model call, not a mandatory second pass',async()=>{
 const requests=[];await visual({status:'completed',output_text:JSON.stringify({paginas:correctedReceipts()})},requests).extractDocument(Buffer.from('pdf'),'scan.pdf');assert.equal(requests.length,1);
});
test('failed correction is bounded and cannot silently discard totals or detail rows',async()=>{
 const raw={status:'completed',output_text:JSON.stringify({paginas:receiptPages()})};const requests=[];
 await assert.rejects(()=>visual([raw,raw],requests).extractDocument(Buffer.from('pdf'),'scan.pdf'),/conservado|sin columnas/);assert.equal(requests.length,2);
 const missing=correctedReceipts();missing[0].bloques[0].filas.pop();assert.throws(()=>layout.assertTableRepairPreserves(receiptPages(),missing),/resumen/);
 const changed=correctedReceipts();changed[0].bloques[0].filas[0][3]='99';assert.throws(()=>layout.assertTableRepairPreserves(receiptPages(),changed),/detalle/);
});
