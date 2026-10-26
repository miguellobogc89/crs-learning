import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function load(file, deps={}) { const m={exports:{}}; new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=> { if(n in deps) return deps[n]; throw Error(n); },m,m.exports); return m.exports; }
const contract=load('lib/knowledge/intake/contract.ts');
test('classification retry reuses identified units and source text without extraction',async()=> {
 const units=[{id:'unidad-1',fuenteId:'f',tipo:'factura',inicio:1,fin:1}];
 const batch={proposal_json:{version:1,unidades:units},knowledge_import_files:[{id:'f',file_name:'a.txt',extracted_text:'Factura',status:'text_ready'}]};
 const updates=[]; let fail=true; let calls=0;
 const prisma={knowledge_imports:{findFirstOrThrow:async()=>batch,updateMany:async args=>{updates.push(args);return {count:1};}}};
 const service=load('lib/knowledge/intake/process.ts',{
  '@prisma/client':{}, '@/lib/prisma':{prisma}, './contract':contract,
  '@/lib/knowledge/documents/extract-document-text':{extractDocumentText:()=>{throw Error('Must not extract');}},
  '@/lib/storage/knowledge-storage':{readKnowledgeFile:()=>{throw Error('Must not reread');}},
  '@/lib/ai/openai':{getKnowledgeImportModel:()=> 'test',getOpenAIClient:()=>({responses:{create:async()=>{calls++;if(fail) throw Error('timeout'); return {status:'completed',output_text:JSON.stringify({unidades:[{id:'unidad-1',destino:'engine',tablas:[]}]})};}}})}
 });
 const lease=new Date(); await service.processIntake('b',lease);
 assert.equal(updates[0].data.status,'intake_error'); assert.equal(updates[0].data.proposal_json,undefined);
 fail=false; await service.processIntake('b',lease);
 assert.equal(updates[1].data.status,'intake_completed');
 assert.equal(updates[1].data.proposal_json.resultado.unidades[0].contenido.texto,'Factura');
 assert.equal(updates[1].where.processing_started_at,lease); assert.equal(calls,2);
});
test('old execution endpoints are disconnected and old provider is unmounted',()=> {
 const endpoints=['upload','[importId]/recognize','[importId]/analyze','[importId]/confirm','[importId]/insert-engine','[importId]/review-batch','[importId]/generate-proposal'];
 for(const endpoint of endpoints) { const code=readFileSync(`app/api/knowledge/import/${endpoint}/route.ts`,'utf8'); assert.match(code,/status: 410/); assert.doesNotMatch(code,/from "@\/lib\/engine/); }
 const layout=readFileSync('app/(app)/layout.tsx','utf8');assert.doesNotMatch(layout,/KnowledgeImportProvider|KnowledgeImportBackgroundWidget/);
});
