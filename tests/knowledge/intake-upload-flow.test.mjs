import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const m={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync('components/knowledge/import/advance-intake.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);
const {advanceIntake}=m.exports;
test('fresh upload: reading first, then its verification; no classification or structure calls',async()=>{
 let stage=0,checked=0;const result={module:'document_extractor',version:1,archivos:[{paginas:[]}]};const report={module:'reading_verifier',version:1,resumen:{}};
 const request=async(url,method)=>{
  if(url==='/api/knowledge/intake/fresh/verification'){if(method==='POST'){checked=1;return {estado:'running'};}return checked?{estado:'completed',resultado:report}:{estado:'pending'};}
  assert.equal(url,'/api/knowledge/intake/fresh');if(method==='POST'){stage=1;return {estado:'intake_running'};}return stage?{estado:'intake_completed',resultado:result}:{estado:'intake_pending',fase:'lectura'};};
 assert.equal((await advanceIntake('fresh',request)).status,'processing');
 const verifying=await advanceIntake('fresh',request);assert.equal(verifying.status,'processing');assert.equal(verifying.phase,'verificacion');
 const completed=await advanceIntake('fresh',request);assert.equal(completed.status,'completed');assert.equal(completed.result,result);assert.equal(completed.verification.result,report);
});
test('a verification error keeps the reading visible and is not retried automatically',async()=>{
 const urls=[];const result={module:'document_extractor',version:1,archivos:[]};
 const view=await advanceIntake('x',async(url,method)=>{urls.push(`${method??'GET'} ${url}`);return url.endsWith('/verification')?{estado:'error',error:'Google Vision respondió 403'}:{estado:'intake_completed',resultado:result};});
 assert.equal(view.status,'completed');assert.equal(view.result,result);assert.equal(view.verification.status,'error');assert.match(view.verification.error,/403/);
 assert.ok(urls.every(u=>u.startsWith('GET')));
});
test('classification results cannot silently pass for extraction output',async()=>{
 await assert.rejects(()=>advanceIntake('old',async()=>({estado:'intake_completed',resultado:{version:2,unidades:[]}})),/extractor/);
});
test('errors are visible and do not launch automatic retries',async()=>{
 let calls=0;const result=await advanceIntake('fresh',async()=>{calls++;return {estado:'intake_error',error:'No se pudo leer el archivo'};});assert.equal(result.status,'error');assert.equal(calls,1);
});
test('modal has one processing action and no rediscovery or test controls',()=>{
 const modal=readFileSync('components/knowledge/import/modal/knowledge-import-modal.tsx','utf8');assert.equal((modal.match(/<Button /g)||[]).length,1);assert.doesNotMatch(modal,/Reintentar|Recalcular|excludedTables|structurePoll|Recuperar lote|Descubrir tablas/);
});
