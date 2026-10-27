import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const contract=load('lib/knowledge/intake/verifier/contract.ts');
const compare=load('lib/knowledge/intake/verifier/compare.ts');
const extractorContract=load('lib/knowledge/intake/extractor/contract.ts');

// Synthetic invoice (no real customer data). Coordinates are normalised to the page; 0.012 per character.
const w=(t,x,y)=>({t,x0:x,x1:x+t.length*0.012,y0:y,y1:y+0.012});
const words=[
 w('Calle',0.05,0.10),w('Alfonso,',0.13,0.10),w('s/n.',0.24,0.10),
 w('Cantidad',0.05,0.30),w('Descripción',0.30,0.30),w('PRECIO',0.60,0.30),w('UNITARIO',0.68,0.30),w('TOTAL',0.83,0.30),w('€',0.90,0.30),
 w('2',0.08,0.33),w('LONA',0.20,0.33),w('ACRÍLICA',0.26,0.33),w('€',0.80,0.33),w('789,26',0.87,0.33),
 w('MONTAJE',0.20,0.35),
 w('DETALLE',0.05,0.50),w('(€)',0.15,0.50),
];
const page=(over={})=>({numero:1,incidencias:[],bloques:[
 {tipo:'texto',texto:'Calle Alfonso, s/n.'},
 {tipo:'tabla',columnas:['Cantidad','Descripción','PRECIO UNITARIO','TOTAL €'],filas:[['2','LONA ACRÍLICA\nMONTAJE','','€ 789,26']]},
 {tipo:'texto',texto:'DETALLE (€)'},
],...over});
const ref=(fuente='capa_texto')=>({numero:1,fuente,palabras:words});
const findings=r=>r.literales.length+r.columnas.length+r.omisiones.length;

test('a faithful reading produces no findings',()=>{
 const r=compare.verifyPage(page(),ref());
 assert.equal(findings(r),0,JSON.stringify(r));assert.equal(r.referencia,'capa_texto');
});
test('detects altered literals with what the document actually says',()=>{
 const p=page();p.bloques[0].texto='Calle Alfons, s/n.';
 const r=compare.verifyPage(p,ref());
 assert.equal(r.literales.length,1);const [l]=r.literales;
 assert.equal(l.estado,'distinto');assert.match(l.documento,/Alfonso,/);assert.equal(l.severidad,'probable_error');
 assert.deepEqual(l.diferencias,[{modelo:'',documento:'o'}]);
});
test('a truncated number is not accepted inside a longer printed number',()=>{
 const p=page();p.bloques[1].filas[0][3]='€ 789,2';
 const r=compare.verifyPage(p,ref());
 assert.equal(r.literales.length,1);assert.equal(r.literales[0].documento,'€789,26');
});
test('detects an amount transcribed under a neighbouring column (the original Toldos failure)',()=>{
 const p=page();p.bloques[1].filas[0]=['2','LONA ACRÍLICA\nMONTAJE','€ 789,26',''];
 const r=compare.verifyPage(p,ref());
 assert.equal(r.columnas.length,1);
 assert.deepEqual({v:r.columnas[0].valor,lectura:r.columnas[0].columnaLectura,doc:r.columnas[0].columnaDocumento},{v:'€ 789,26',lectura:'PRECIO UNITARIO',doc:'TOTAL €'});
});
test('reports document text missing from the reading',()=>{
 const p=page();p.bloques.pop();
 const r=compare.verifyPage(p,ref());
 assert.deepEqual(r.omisiones.map(o=>o.textoDocumento),['DETALLE (€)']);
});
test('OCR-based findings are marked for review, not as model errors',()=>{
 const p=page();p.bloques[0].texto='Calle Alfons, s/n.';
 const r=compare.verifyPage(p,ref('ocr'));
 assert.equal(r.literales[0].severidad,'revisar');
});
test('header transcribed as a row is used for column checks and flagged',()=>{
 const p=page();p.bloques[1]={tipo:'tabla',columnas:['','','',''],filas:[['Cantidad','Descripción','PRECIO UNITARIO','TOTAL €'],['2','LONA ACRÍLICA\nMONTAJE','€ 789,26','']]};
 const r=compare.verifyPage(p,ref());
 assert.match(r.avisos[0],/cabecera está en la fila 1/);assert.equal(r.columnas.length,1);
});
test('a page without an independent reading is reported, never silently passed',()=>{
 const r=compare.verifyPage(page(),{numero:1,fuente:'sin_referencia',palabras:[],aviso:'falta la clave'});
 assert.equal(findings(r),0);assert.deepEqual(r.avisos,['falta la clave']);
 const summary=contract.summarize([{archivoId:'a',archivo:'a.pdf',metodo:'pdf_visual',paginas:[r]}]);
 assert.equal(summary.paginasSinReferencia,1);
});

// ---------- independent reading ----------
// Minimal pdf.js operator codes (the module resolves the real ones from the bundled pdf.js).
const OPS={save:10,restore:11,transform:12,setTextRenderingMode:30,showText:44,showSpacedText:45,nextLineShowText:46,nextLineSetSpacingShowText:47,paintJpegXObject:82,paintImageXObject:85,paintInlineImageXObject:86};
function referenceModule(pages,operators=[]){
 return load('lib/knowledge/intake/verifier/reference.ts',{unpdf:{getResolvedPDFJS:async()=>({OPS}),getDocumentProxy:async()=>({numPages:pages.length,destroy:async()=>{},
  getPage:async n=>({getViewport:()=>({width:600,height:800,transform:[1,0,0,-1,0,800]}),getTextContent:async()=>({items:pages[n-1]}),
   getOperatorList:async()=>operators[n-1]??{fnArray:[],argsArray:[]}})})}});
}
const visionBody=pageNumber=>({responses:[{responses:[{context:{pageNumber},fullTextAnnotation:{pages:[{blocks:[{paragraphs:[{words:[
 {symbols:[{text:'7'},{text:','},{text:'52'}],boundingBox:{normalizedVertices:[{y:0.1},{x:0.2,y:0.1},{x:0.2,y:0.12},{y:0.12}]}}]}]}]}]}}]}]});
test('text-layer pages are read directly; only image pages go to Google Vision, with the key in a header',async()=>{
 const ref=referenceModule([[{str:'TOTAL EUROS 955,00 IVA 21 %',transform:[1,0,0,10,60,700],width:270,height:10}],[]]);
 const calls=[];
 const fetcher=async(url,init)=>{calls.push({url,init});const body=JSON.parse(init.body);assert.deepEqual(body.requests[0].pages,[2]);return {ok:true,json:async()=>visionBody(2)};};
 const pages=await ref.readReference(Buffer.from('%PDF'),{apiKey:'k',fetcher});
 assert.deepEqual(pages.map(p=>p.fuente),['capa_texto','ocr']);
 assert.deepEqual(pages[0].palabras.map(x=>x.t),['TOTAL','EUROS','955,00','IVA','21','%']);
 assert.ok(pages[0].palabras[0].x0>=0.099&&pages[0].palabras[0].y1<=0.126&&pages[0].palabras[0].y0<pages[0].palabras[0].y1);
 assert.equal(calls.length,1);assert.doesNotMatch(calls[0].url,/key=/);assert.equal(calls[0].init.headers['X-Goog-Api-Key'],'k');
 assert.deepEqual(pages[1].palabras,[{t:'7,52',x0:0,x1:0.2,y0:0.1,y1:0.12}]);
});
test('without OCR credentials image pages are explicitly unverified and Vision is not called',async()=>{
 const ref=referenceModule([[]]);
 const pages=await ref.readReference(Buffer.from('%PDF'),{apiKey:null,fetcher:async()=>{throw Error('must not call');}});
 assert.equal(pages[0].fuente,'sin_referencia');assert.match(pages[0].aviso,/GOOGLE_CLOUD_VISION_API_KEY/);
});
test('Vision errors are surfaced, not converted into empty readings',async()=>{
 const ref=referenceModule([[]]);
 await assert.rejects(()=>ref.readReference(Buffer.from('%PDF'),{apiKey:'k',fetcher:async()=>({ok:false,status:403,json:async()=>({error:{message:'API not enabled'}})})}),/403: API not enabled/);
 assert.throws(()=>ref.parseVisionResponse({responses:[{responses:[{context:{pageNumber:1},error:{message:'bad image'}}]}]}),/bad image/);
});

// ---------- batch process ----------
function processModule(db,deps){
 return load('lib/knowledge/intake/verifier/process.ts',{'@prisma/client':{},'@/lib/prisma':{prisma:db},'@/lib/storage/knowledge-storage':{readKnowledgeFile:async()=>{throw Error('unused');}},
  '../extractor/contract':extractorContract,'./compare':compare,'./contract':contract,'./reference':{readReference:deps.readReference}});
}
const extraction={module:'document_extractor',version:1,loteId:'b',archivos:[{archivoId:'f1',archivo:'factura.pdf',metodo:'pdf_visual',paginas:[page()]},{archivoId:'f2',archivo:'tabla.xlsx',metodo:'hoja_nativa',paginas:[{numero:1,bloques:[],incidencias:['Hoja vacía']}]}]};
function fakeDb(){
 const db={saves:[],stored:null,knowledge_import_files:{findMany:async()=>[{id:'f1',storage_path:'knowledge/f1.pdf'}]},
  knowledge_imports:{updateMany:async args=>{assert.equal(args.where.upload_type,'intake-extractor-v1');assert.equal(args.where.status,'intake_completed');
   if(db.stored&&JSON.stringify(args.where.proposal_json.equals)!==JSON.stringify(db.stored))return {count:0};db.stored=args.data.proposal_json;db.saves.push(args.data.proposal_json);return {count:1};}}};
 return db;
}
test('verifies the batch, persists readings first and never rewrites the extraction',async()=>{
 const db=fakeDb();let reads=0;
 const claimed={version:1,archivos:extraction.archivos,resultado:extraction,verificacion:{status:'running',revision:1,lease:'L',referencias:[]}};
 db.stored=JSON.parse(JSON.stringify(claimed));
 const p=processModule(db,{readReference:async()=>{reads++;return [ref()];}});
 await p.runVerification('b',claimed,'L',{readReference:async()=>{reads++;return [ref()];},readFile:async path=>{assert.equal(path,'knowledge/f1.pdf');return Buffer.from('%PDF');}});
 assert.equal(reads,1);assert.equal(db.saves.length,2);assert.equal(db.saves[0].verificacion.status,'running');assert.equal(db.saves[0].verificacion.referencias.length,1);
 const final=db.saves[1];assert.equal(final.verificacion.status,'completed');assert.deepEqual(final.resultado,extraction);
 const report=final.verificacion.resultado;assert.equal(report.module,'reading_verifier');assert.equal(report.lecturaModificada,false);
 assert.equal(report.resumen.literales+report.resumen.columnas+report.resumen.omisiones,0);
 assert.match(report.archivos[1].paginas[0].avisos[0],/sin IA/);
});
test('a new comparison reuses stored readings without calling OCR again',async()=>{
 const db=fakeDb();
 const claimed={version:1,archivos:extraction.archivos,resultado:extraction,verificacion:{status:'running',revision:1,lease:'L',referencias:[{archivoId:'f1',paginas:[ref()]}]}};
 db.stored=JSON.parse(JSON.stringify(claimed));
 await processModule(db,{}).runVerification('b',claimed,'L',{readReference:async()=>{throw Error('OCR must not run');},readFile:async()=>{throw Error('no read');}});
 assert.equal(db.saves.at(-1).verificacion.status,'completed');
});
test('errors are stored with the readings already paid for, and the extraction is untouched',async()=>{
 const db=fakeDb();
 const bad={...extraction,archivos:[{...extraction.archivos[0],paginas:[page(),{...page(),numero:2}]}]};
 const claimed={version:1,archivos:bad.archivos,resultado:bad,verificacion:{status:'running',revision:1,lease:'L',referencias:[]}};
 db.stored=JSON.parse(JSON.stringify(claimed));
 await processModule(db,{}).runVerification('b',claimed,'L',{readReference:async()=>[ref()],readFile:async()=>Buffer.from('%PDF')});
 const last=db.saves.at(-1);assert.equal(last.verificacion.status,'error');assert.match(last.verificacion.error,/número de páginas/);
 assert.equal(last.verificacion.referencias.length,1);assert.deepEqual(last.resultado,bad);
});
test('a concurrent change of the batch is not overwritten',async()=>{
 const db=fakeDb();
 const claimed={version:1,archivos:extraction.archivos,resultado:extraction,verificacion:{status:'running',revision:1,lease:'L',referencias:[]}};
 db.stored={changed:true};
 await processModule(db,{}).runVerification('b',claimed,'L',{readReference:async()=>[ref()],readFile:async()=>Buffer.from('%PDF')});
 assert.deepEqual(db.stored,{changed:true});
});
test('repeated words of a multi-line cell each match their own occurrence (no false omissions)',()=>{
 const ws=[w('Cantidad',0.05,0.30),w('Descripción',0.30,0.30),w('TOTAL',0.83,0.30),
  w('DOS',0.20,0.33),w('CAMBIOS',0.25,0.33),w('DE',0.35,0.33),w('LONA',0.39,0.33),w('€',0.80,0.33),w('9,00',0.87,0.33),
  w('DE',0.20,0.35),w('DOS',0.24,0.35),w('CAPOTAS',0.29,0.35)];
 const p={numero:1,incidencias:[],bloques:[{tipo:'tabla',columnas:['Cantidad','Descripción','TOTAL'],filas:[['','DOS CAMBIOS DE LONA\nDE DOS CAPOTAS','€ 9,00']]}]};
 const r=compare.verifyPage(p,{numero:1,fuente:'capa_texto',palabras:ws});
 assert.equal(findings(r),0,JSON.stringify(r));
});
test('vertical margin text does not capture the cells of the rows it crosses',()=>{
 // A rotated registry note: tall, narrow words spanning the whole table height.
 const margin=[{t:'Tomo',x0:0.01,x1:0.02,y0:0.25,y1:0.32},{t:'3073',x0:0.01,x1:0.02,y0:0.32,y1:0.40}];
 const r=compare.verifyPage(page(),{numero:1,fuente:'ocr',palabras:[...margin,...words]});
 assert.equal(r.literales.length+r.columnas.length,0,JSON.stringify(r));
 assert.deepEqual(r.omisiones.map(o=>o.textoDocumento),['Tomo 3073']);
});
test('repeated header labels are located on their own header line',()=>{
 // "IVA" appears first inside an earlier line; the table header must not take that occurrence.
 const ws=[w('Cuota',0.05,0.10),w('IVA',0.12,0.10),
  w('IVA',0.05,0.30),w('Base',0.25,0.30),w('Imponible',0.31,0.30),w('Total',0.70,0.30),
  w('4%',0.07,0.33),w('138,00',0.33,0.33),w('143,52',0.70,0.33)];
 const p={numero:1,incidencias:[],bloques:[{tipo:'texto',texto:'Cuota IVA'},{tipo:'tabla',columnas:['IVA','Base Imponible','Total'],filas:[['4%','138,00','143,52']]}]};
 const r=compare.verifyPage(p,{numero:1,fuente:'ocr',palabras:ws});
 assert.equal(r.columnas.length,0,JSON.stringify(r.columnas));assert.equal(r.literales.length,0);
});
test('a long sentence reports the specific words that differ',()=>{
 const ws='Para saber más visite https://info.example.es o pida información'.split(' ').map((t,i)=>w(t,0.05+i*0.09,0.60));
 const p={numero:1,incidencias:[],bloques:[{tipo:'texto',texto:'Para saber más visite http://info.example.es o pida información'}]};
 const r=compare.verifyPage(p,{numero:1,fuente:'capa_texto',palabras:ws});
 assert.equal(r.literales.length,1);assert.deepEqual(r.literales[0].diferencias,[{modelo:'http://info.example.es',documento:'https://info.example.es'}]);
 assert.equal(r.omisiones.length,0);
});
test('drawn marks are a notice, while printed symbols are still checked as text',()=>{
 const ws=[...words,w('€',0.70,0.40),w('-',0.80,0.40),w('Envío',0.05,0.40)];
 const p=page();p.bloques.push({tipo:'tabla',columnas:['','',''],filas:[['Envío','€','-'],['○','','']]});
 const r=compare.verifyPage(p,{numero:1,fuente:'capa_texto',palabras:ws});
 assert.equal(findings(r),0,JSON.stringify(r));
 assert.equal(r.avisos.filter(a=>/símbolo dibujado/.test(a)).length,1);
});
test('identical rows of two similar tables are not swapped when OCR misreads the first one',()=>{
 // Two tickets with the same product; OCR reads the first as "Pб" (Cyrillic) and the second correctly.
 const ws=[w('Descripción',0.05,0.20),w('Importe',0.80,0.20),w('LECHE',0.05,0.22),w('Pб',0.15,0.22),w('93,60',0.80,0.22),
  w('Descripción',0.05,0.40),w('Importe',0.80,0.40),w('LECHE',0.05,0.42),w('P6',0.15,0.42),w('18,72',0.80,0.42)];
 const t=v=>({tipo:'tabla',columnas:['Descripción','Importe'],filas:[['LECHE P6',v]]});
 const r=compare.verifyPage({numero:1,incidencias:[],bloques:[t('93,60'),t('18,72')]},{numero:1,fuente:'ocr',palabras:ws});
 assert.equal(findings(r),0,JSON.stringify(r));
});
test('rows transcribed before the header are matched in printed order, not below the header',()=>{
 const ws=[w('Ticket',0.05,0.18),w('A1',0.15,0.18),w('Descripción',0.05,0.20),w('Importe',0.80,0.20),w('PAN',0.05,0.22),w('1,00',0.80,0.22),
  w('Ticket',0.05,0.25),w('B2',0.15,0.25),w('Descripción',0.05,0.27),w('Importe',0.80,0.27),w('PAN',0.05,0.29),w('2,00',0.80,0.29)];
 const t=(id,v)=>({tipo:'tabla',columnas:['',''],filas:[[`Ticket ${id}`,''],['Descripción','Importe'],['PAN',v]]});
 const r=compare.verifyPage({numero:1,incidencias:[],bloques:[t('A1','1,00'),t('B2','2,00')]},{numero:1,fuente:'ocr',palabras:ws});
 assert.equal(findings(r),0,JSON.stringify(r));
});
test('very short values are never paired by similarity with a longer number',()=>{
 const p={numero:1,incidencias:[],bloques:[{tipo:'tabla',columnas:['Descripción','Unid.','Importe'],filas:[['LONA','2','0,72']]}]};
 const ws=[w('Descripción',0.05,0.20),w('Unid.',0.40,0.20),w('Importe',0.80,0.20),w('LONA',0.05,0.22),w('0,72',0.80,0.22)];
 const r=compare.verifyPage(p,{numero:1,fuente:'ocr',palabras:ws});
 assert.deepEqual(r.literales.map(l=>[l.modelo,l.estado,l.documento]),[['2','no_encontrado',undefined]]);
});
test('rotated text-layer runs (vertical margin notes) get their real box and are flagged as rotated',async()=>{
 const ref=referenceModule([[{str:'Registro Mercantil de Valencia, Tomo 3073',transform:[0,6,-6,0,20,100],width:400,height:6},{str:'TOTAL EUROS 955,00 IVA',transform:[1,0,0,10,60,700],width:270,height:10}]]);
 const [page]=await ref.readReference(Buffer.from('%PDF'),{apiKey:null});
 const margin=page.palabras.filter(w=>w.r);assert.equal(margin.length,6);
 for(const w of margin){assert.ok(w.y1-w.y0>w.x1-w.x0,'vertical box');assert.ok(w.x1<0.04,'stays in the left margin');}
 assert.ok(page.palabras.filter(w=>!w.r).every(w=>w.y1-w.y0<w.x1-w.x0));
});
test('a scan with an invisible third-party OCR layer is read with Google Vision, not trusted as text',async()=>{
 const scan={fnArray:[OPS.save,OPS.transform,OPS.paintJpegXObject,OPS.restore,OPS.setTextRenderingMode,OPS.showText,OPS.showText],argsArray:[[],[600,0,0,800,0,0],[],[],[3],[],[]]};
 const background={fnArray:[OPS.save,OPS.transform,OPS.paintImageXObject,OPS.restore,OPS.showText,OPS.showText],argsArray:[[],[600,0,0,800,0,0],[],[],[],[]]};
 const item={str:'Deslgnaclon y Referencia articulo 1151O',transform:[1,0,0,10,60,700],width:300,height:10};
 const ref=referenceModule([[item],[item]],[scan,background]);
 const fetcher=async(_url,init)=>{assert.deepEqual(JSON.parse(init.body).requests[0].pages,[1]);return {ok:true,json:async()=>visionBody(1)};};
 const pages=await ref.readReference(Buffer.from('%PDF'),{apiKey:'k',fetcher});
 assert.deepEqual(pages.map(p=>p.fuente),['ocr','capa_texto'],'a full-page background image with visible text is still a text layer');
 const none=await ref.readReference(Buffer.from('%PDF'),{apiKey:null});assert.match(none[0].aviso,/escaneo/);
});
test('ligatures, dot leaders and list markers do not count as differences',()=>{
 const ws=[w('•',0.05,0.10),w('Línea',0.08,0.10),w('ﬁja',0.15,0.10),w('SUBTOTAL………………120€.',0.05,0.20),w('eRoaming',0.05,0.30),w('incluido.',0.17,0.30)];
 const p={numero:1,incidencias:[],bloques:[{tipo:'texto',texto:'- Línea fija\nSUBTOTAL.............120€.'}]};
 const r=compare.verifyPage(p,{numero:1,fuente:'capa_texto',palabras:ws});
 assert.equal(r.literales.length,0,JSON.stringify(r.literales));
});
test('values absent from a text layer (logos, icons) are for review, contradictions stay probable errors',()=>{
 const p=page();p.bloques.unshift({tipo:'texto',texto:'ABOGADOS Y ECONOMISTAS'});p.bloques[1].texto='Calle Alfons, s/n.';
 const r=compare.verifyPage(p,ref());
 assert.deepEqual(r.literales.map(l=>[l.estado,l.severidad]),[['no_encontrado','revisar'],['distinto','probable_error']]);
});
test('a reading that reorders pages is reported and each page is compared with the one it transcribes',()=>{
 const process=processModule(fakeDb(),{});
 const pg=(n,text)=>({numero:n,incidencias:[],bloques:[{tipo:'texto',texto:text}]});
 const refPage=(n,text)=>({numero:n,fuente:'capa_texto',palabras:text.split(' ').map((t,i)=>w(t,0.05+i*0.1,0.1))});
 const a='Resumen factura cuotas mensuales total pagar',b='Detalle llamadas consumo datos roaming';
 const file={archivoId:'f',archivo:'o2.pdf',metodo:'pdf_visual',paginas:[pg(1,a),pg(2,b)]};
 const r=process.verifyFile(file,{archivoId:'f',paginas:[refPage(1,b),refPage(2,a)]});
 assert.deepEqual(r.paginas.map(p=>p.paginaDocumento),[2,1]);
 assert.ok(r.paginas.every(p=>p.literales.length===0&&p.omisiones.length===0));
 assert.match(r.paginas[0].avisos[0],/página 1 de la lectura corresponde a la página 2 del PDF/);
 assert.equal(contract.summarize([r]).paginasDesordenadas,2);
});
test('a mislocated stacked header does not flag every value of its column',()=>{
 // Headers repeat words; suppose "Total" was located over the wrong column (left of "Precio").
 const ws=[w('Total',0.30,0.20),w('Precio',0.55,0.20),w('Cant',0.05,0.20),
  w('1',0.07,0.24),w('2,00',0.55,0.24),w('2,00',0.80,0.24),w('2',0.07,0.27),w('3,00',0.55,0.27),w('6,00',0.80,0.27)];
 const p={numero:1,incidencias:[],bloques:[{tipo:'tabla',columnas:['Cant','Precio','Total'],filas:[['1','2,00','2,00'],['2','3,00','6,00']]}]};
 const r=compare.verifyPage(p,{numero:1,fuente:'capa_texto',palabras:ws});
 assert.equal(r.columnas.length,0,JSON.stringify(r.columnas));
 assert.ok(r.avisos.some(a=>/cabeceras no concuerda/.test(a)));
});
test('a value present only inside a longer document word is reported as absent, not as different',()=>{
 const ws=[w('IGNIS_260022559',0.05,0.05),w('Factura',0.05,0.20)];
 const r=compare.verifyPage({numero:1,incidencias:[],bloques:[{tipo:'texto',texto:'IGNIS\nFactura'}]},{numero:1,fuente:'capa_texto',palabras:ws});
 assert.deepEqual(r.literales.map(l=>[l.modelo,l.estado,l.severidad]),[['IGNIS','no_encontrado','revisar']]);
});
test('equal values in one row are matched left to right, not swapped between columns',()=>{
 // Stream order lists the right-hand amount first (as some OCR block orders do).
 const ws=[w('Producto',0.05,0.20),w('Precio',0.50,0.20),w('Importe',0.80,0.20),w('39,99',0.80,0.24),w('LONA',0.05,0.24),w('39,99',0.50,0.24)];
 const p={numero:1,incidencias:[],bloques:[{tipo:'tabla',columnas:['Producto','Precio','Importe'],filas:[['LONA','39,99','39,99']]}]};
 assert.equal(compare.verifyPage(p,{numero:1,fuente:'capa_texto',palabras:ws}).columnas.length,0);
});
