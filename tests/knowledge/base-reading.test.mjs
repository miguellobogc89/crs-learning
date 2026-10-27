import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const contract=load('lib/knowledge/intake/base-reading/contract.ts');
const extractorContract=load('lib/knowledge/intake/extractor/contract.ts');

// Synthetic page: two tickets one after another, a total line, and a rotated margin note.
const w=(t,x,y,extra={})=>({t,x0:x,x1:x+t.length*0.012,y0:y,y1:y+0.012,...extra});
const page={numero:1,fuente:'capa_texto',palabras:[
 w('Ticket',0.05,0.10),w('A1',0.15,0.10),w('PAN',0.05,0.13),w('1,00',0.80,0.13),
 w('Ticket',0.05,0.16),w('B2',0.15,0.16),w('LECHE',0.05,0.19),w('2,00',0.80,0.19),
 w('Registro',0.01,0.40,{r:true}),w('Mercantil',0.01,0.30,{r:true})]};

test('one block per visual line, left to right; rotated text kept apart as a final block',()=>{
 const p=contract.blocksFromWords(page);
 assert.deepEqual(p.bloques.map(b=>b.texto),['Ticket A1','PAN 1,00','Ticket B2','LECHE 2,00','Registro Mercantil']);
 assert.ok(p.bloques.every(b=>b.tipo==='texto'));assert.deepEqual(p.incidencias,[]);
});
test('OCR pages are labelled; pages without a reading are explicit, never empty silently',()=>{
 assert.match(contract.blocksFromWords({...page,fuente:'ocr'}).incidencias[0],/reconocimiento de imagen/);
 const none=contract.blocksFromWords({numero:2,fuente:'sin_referencia',palabras:[],aviso:'falta la clave'});
 assert.deepEqual(none.bloques,[]);assert.deepEqual(none.incidencias,['falta la clave']);
 const tall=contract.blocksFromWords({numero:1,fuente:'ocr',palabras:[w('Total',0.05,0.10),{t:'Inscrita',x0:0.01,x1:0.02,y0:0.3,y1:0.36}]});
 assert.deepEqual(tall.bloques.map(b=>b.texto),['Total','Inscrita'],'tall narrow OCR words are rotated text');
});

const read=load('lib/knowledge/intake/base-reading/read.ts',{'node:path':await import('node:path'),'../verifier/reference':{},'./contract':contract});
test('PDF: positioned words (text layer or OCR) without the vision model; other formats: native reading',async()=>{
 let native=0;
 const deps={readReference:async()=>[page],readNative:async()=>{native++;return {metodo:'hoja_nativa',paginas:[{numero:1,bloques:[{tipo:'tabla',columnas:['A'],filas:[['1']]}],incidencias:[]}]};}};
 const pdf=await read.readBaseFile(Buffer.from('%PDF'),'f1','factura.PDF',deps);
 assert.equal(pdf.metodo,'pdf');assert.equal(pdf.referencias.length,1);assert.equal(pdf.paginas[0].bloques.length,5);assert.equal(native,0);
 const sheet=await read.readBaseFile(Buffer.from('x'),'f2','precios.xlsx',deps);
 assert.equal(sheet.metodo,'hoja_nativa');assert.deepEqual(sheet.referencias,[]);assert.equal(sheet.paginas[0].bloques[0].tipo,'tabla');
 await assert.rejects(()=>read.readBaseFile(Buffer.from('x'),'f3','raro.docx',{...deps,readNative:async()=>({metodo:'pdf_visual',paginas:[]})}),/no usa la IA de visión/);
});

function fakeDb(files){
 const db={saves:[],stored:null,knowledge_import_files:{findMany:async args=>{assert.equal(args.where.import_id,'b');return files;}},
  knowledge_imports:{updateMany:async args=>{assert.equal(args.where.upload_type,'intake-extractor-v2');
   if(db.stored&&JSON.stringify(args.where.proposal_json.equals)!==JSON.stringify(db.stored))return {count:0};db.stored=args.data.proposal_json;db.saves.push(args.data.proposal_json);return {count:1};}}};
 return db;
}
const processModule=db=>load('lib/knowledge/intake/base-reading/process.ts',{'@prisma/client':{},'@/lib/prisma':{prisma:db},'@/lib/storage/knowledge-storage':{},'../extractor/contract':extractorContract,'./contract':contract,'./read':{}});
const files=[{id:'f1',file_name:'a.pdf',storage_path:'k/a'},{id:'f2',file_name:'b.pdf',storage_path:'k/b'}];
const readOne=(log)=>async(_buf,id,name)=>{log.push(id);return {archivoId:id,archivo:name,metodo:'pdf',referencias:[page],paginas:[contract.blocksFromWords(page)]};};
test('reads file by file, saving each before the next, keeping other checkpoints untouched',async()=>{
 const db=fakeDb(files);const log=[];
 const claimed={version:1,archivos:[],otro:{x:1},lecturaBase:{status:'running',revision:1,lease:'L',archivos:[]}};
 db.stored=JSON.parse(JSON.stringify(claimed));
 await processModule(db).runBaseReading('b',claimed,'L',{readBaseFile:readOne(log),readFile:async p=>Buffer.from(p)});
 assert.deepEqual(log,['f1','f2']);assert.deepEqual(db.saves.map(s=>s.lecturaBase.status),['running','running','completed']);
 const last=db.saves.at(-1);assert.equal(last.lecturaBase.resultado.module,'base_reading');assert.deepEqual(last.otro,{x:1});assert.deepEqual(last.archivos,[]);
});
test('a retry continues after files already read (no second OCR); errors keep them; concurrent changes win',async()=>{
 const db=fakeDb(files);const log=[];
 const done={archivoId:'f1',archivo:'a.pdf',metodo:'pdf',referencias:[],paginas:[]};
 const claimed={lecturaBase:{status:'running',revision:1,lease:'L',archivos:[done]}};db.stored=JSON.parse(JSON.stringify(claimed));
 await processModule(db).runBaseReading('b',claimed,'L',{readBaseFile:async(...a)=>{log.push(a[1]);throw Error('Google Vision respondió 403');},readFile:async()=>Buffer.from('x')});
 assert.deepEqual(log,['f2']);const last=db.saves.at(-1);assert.equal(last.lecturaBase.status,'error');assert.match(last.lecturaBase.error,/403/);assert.equal(last.lecturaBase.archivos.length,1);
 const busy=fakeDb(files);busy.stored={changed:true};
 await processModule(busy).runBaseReading('b',{lecturaBase:{status:'running',revision:1,lease:'L',archivos:[]}},'L',{readBaseFile:readOne([]),readFile:async()=>Buffer.from('x')});
 assert.deepEqual(busy.stored,{changed:true});
});
test('stage gates: base reading never during the vision reading; vision reading only after base reading and classification',()=>{
 const base=readFileSync('app/api/knowledge/intake/[importId]/base-reading/route.ts','utf8');
 assert.match(base,/batch\.status === "intake_running"/);assert.match(base,/status: \{ not: "intake_running" \}, proposal_json: \{ equals: batch\.proposal_json/);
 assert.doesNotMatch(base,/referencias: state|resultado: estado === "completed" \? state\?\.resultado/,'positioned words are not sent to the browser');
 const vision=readFileSync('app/api/knowledge/intake/[importId]/route.ts','utf8');
 assert.match(vision,/lecturaBase\?\.status !== "completed"/);assert.match(vision,/clasificacion\?\.status !== "completed" && stages\.clasificacion\?\.status !== "error"/);
 const extractor=readFileSync('lib/knowledge/intake/extractor/process.ts','utf8');
 assert.match(extractor,/\{ \.\.\.state, version: 1, archivos/,'the vision reading keeps the earlier checkpoints');
 const queue=readFileSync('components/knowledge/import/intake-queue.tsx','utf8');
 assert.match(queue,/advanceIntake\(/,'the app queue advances every stage, not only the vision reading');
});
