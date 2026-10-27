import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const m={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync('components/knowledge/import/advance-intake.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);
const {advanceIntake}=m.exports;
function pipeline(){
 const st={base:0,classified:0,read:0,verified:0};const calls=[];
 const result={module:'document_extractor',version:1,archivos:[{paginas:[]}]};
 const base={module:'base_reading',version:1,archivos:[]};const classes={module:'document_classifier',version:1,archivos:[]};const report={module:'reading_verifier',version:4,resumen:{}};
 const request=async(url,method)=>{calls.push(`${method??'GET'} ${url.replace('/api/knowledge/intake/fresh','')||'/'}`);
  if(url.endsWith('/base-reading')){if(method==='POST'){st.base=1;return {estado:'running'};}return st.base?{estado:'completed',resultado:base}:{estado:'pending'};}
  if(url.endsWith('/classification')){assert.equal(st.base,1,'classification after the base reading');if(method==='POST'){st.classified=1;return {estado:'running'};}return st.classified?{estado:'completed',resultado:classes}:{estado:'pending'};}
  if(url.endsWith('/verification')){assert.equal(st.read,1,'verification after the vision reading');if(method==='POST'){st.verified=1;return {estado:'running'};}return st.verified?{estado:'completed',resultado:report}:{estado:'pending'};}
  assert.equal(url,'/api/knowledge/intake/fresh');
  if(method==='POST'){assert.equal(st.classified,1,'vision reading only after the classification');st.read=1;return {estado:'intake_running'};}
  return st.read?{estado:'intake_completed',resultado:result}:{estado:'intake_pending',fase:'lectura'};};
 return {request,calls,result,classes,report};
}
test('fresh upload: base reading → classification → vision reading → verification; no structure discovery',async()=>{
 const p=pipeline();const phases=[];let view;
 for(let i=0;i<8;i++){view=await advanceIntake('fresh',p.request);phases.push(view.phase);if(view.status==='completed')break;}
 assert.deepEqual(phases,['lectura_base','clasificacion','lectura','verificacion','completado']);
 assert.equal(view.result,p.result);assert.equal(view.classification.result,p.classes);assert.equal(view.verification.result,p.report);
 assert.ok(p.calls.every(c=>!/structures/.test(c)));
});
test('errors are shown and never retried; a failed classification does not block the vision reading',async()=>{
 const urls=[];const result={module:'document_extractor',version:1,archivos:[]};
 const view=await advanceIntake('x',async(url,method)=>{urls.push(`${method??'GET'} ${url}`);
  if(url.endsWith('/base-reading'))return {estado:'completed',resultado:{module:'base_reading'}};
  if(url.endsWith('/classification'))return {estado:'error',error:'la clasificación no terminó'};
  if(url.endsWith('/verification'))return {estado:'error',error:'Google Vision respondió 403'};
  return {estado:'intake_completed',resultado:result};});
 assert.equal(view.status,'completed');assert.equal(view.result,result);
 assert.equal(view.classification.status,'error');assert.equal(view.verification.status,'error');assert.match(view.verification.error,/403/);
 assert.ok(urls.every(u=>u.startsWith('GET')),'errors are shown, never retried automatically');
 const failed=await advanceIntake('y',async url=>url.endsWith('/base-reading')?{estado:'error',error:'falta el original'}:{estado:'intake_pending'});
 assert.equal(failed.status,'error');assert.match(failed.error,/Lectura base: falta el original/);
});
test('classification results cannot silently pass for extraction output',async()=>{
 await assert.rejects(()=>advanceIntake('old',async url=>url.endsWith('/base-reading')||url.endsWith('/classification')?{estado:'completed',resultado:{module:url.endsWith('/classification')?'document_classifier':'base_reading'}}:{estado:'intake_completed',resultado:{version:2,unidades:[]}}),/extractor/);
});
test('errors are visible and do not launch automatic retries',async()=>{
 let calls=0;const result=await advanceIntake('fresh',async()=>{calls++;return {estado:'intake_error',error:'No se pudo leer el archivo'};});assert.equal(result.status,'error');assert.equal(calls,1);
});
test('modal has one processing action and no rediscovery or test controls',()=>{
 const modal=readFileSync('components/knowledge/import/modal/knowledge-import-modal.tsx','utf8');assert.equal((modal.match(/<Button /g)||[]).length,1);assert.doesNotMatch(modal,/Reintentar|Recalcular|excludedTables|structurePoll|Recuperar lote|Descubrir tablas/);
});

test('a busy or not-ready stage (409 on start) keeps the modal polling instead of stopping with an error',()=>{
 const modal=readFileSync('components/knowledge/import/modal/knowledge-import-modal.tsx','utf8');
 assert.match(modal,/method === "POST" && response\.status === 409\) return \{ estado: "ocupado" \}/);
});
