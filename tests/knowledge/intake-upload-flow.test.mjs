import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const m={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync('components/knowledge/import/advance-intake.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);
const {advanceIntake}=m.exports;
test('fresh upload advances classification and discovery automatically to final JSON',async()=>{
 const calls=[];let stage=0;
 const request=async(url,method)=>{
  calls.push({url,method});
  if(url.endsWith('/structures')) {
   if(method==='POST'){stage=3;return {estado:'running'};}
   return stage===2?{estado:'pending'}:{estado:'completed',resultado:{tables:[{key:'invoice_line'}]}};
  }
  if(method==='POST'){stage=1;return {estado:'intake_running'};}
  if(stage===0)return {estado:'intake_pending',fase:'lectura'};
  if(stage===1){stage=2;return {estado:'intake_completed',resultado:{version:2,unidades:[{destino:'engine'}]}};}
  return {estado:'intake_completed',resultado:{version:2,unidades:[{destino:'engine'}]}};
 };
 assert.equal((await advanceIntake('fresh-batch',request)).status,'processing');
 const discovering=await advanceIntake('fresh-batch',request);assert.equal(discovering.phase,'estructuras');
 const result=await advanceIntake('fresh-batch',request);assert.equal(result.status,'completed');assert.equal(result.result.tables[0].key,'invoice_line');
 assert.equal(calls.filter(c=>c.method==='POST'&&c.url.endsWith('/structures')).length,1);
});
test('Knowledge-only upload stops after classification, never sends procedures into discovery',async()=>{
 const result=await advanceIntake('knowledge',async url=>{assert.ok(!url.endsWith('/structures'));return {estado:'intake_completed',resultado:{version:2,unidades:[{destino:'knowledge'}]}};});
 assert.equal(result.status,'completed');assert.equal(result.phase,'clasificacion');
});
test('errors are visible and do not launch automatic retries',async()=>{
 let calls=0;const result=await advanceIntake('fresh',async()=>{calls++;return {estado:'intake_error',error:'No se pudo leer el archivo'};});assert.equal(result.status,'error');assert.equal(calls,1);
 const structure=await advanceIntake('fresh',async url=> url.endsWith('/structures')?{estado:'error',error:'Evidencia inválida'}:{estado:'intake_completed',resultado:{unidades:[{destino:'engine'}]}});
 assert.equal(structure.error,'Evidencia inválida');
});
test('modal has one processing action and no rediscovery or test controls',()=>{
 const modal=readFileSync('components/knowledge/import/modal/knowledge-import-modal.tsx','utf8');
 assert.equal((modal.match(/<Button /g)||[]).length,1);assert.doesNotMatch(modal,/Reintentar|Recalcular|excludedTables|structurePoll|Recuperar lote|Descubrir tablas/);
});
