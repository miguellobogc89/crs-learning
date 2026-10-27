import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const t=load('lib/knowledge/intake/transient.ts');

test('network hiccups are transient; document problems are not',()=>{
 for(const m of ['fetch failed','Request timed out.','Connection error.','read ECONNRESET','429 Rate limit reached','503 Service Unavailable'])assert.equal(t.isTransient(new Error(m)),true,m);
 assert.equal(t.isTransient({status:500,message:'x'}),true);assert.equal(t.isTransient(Object.assign(new TypeError('fetch failed'),{cause:{code:'UND_ERR_SOCKET'}})),true);
 for(const m of ['compra.pdf: la extracción no terminó (el documento es demasiado largo para una sola respuesta); no se acepta una salida parcial','Estado del extractor inválido','400 Invalid schema'])assert.equal(t.isTransient(new Error(m)),false,m);
});

test('retried twice with waits, then the error stands; non-transient errors are not retried',async()=>{
 const waits=[];let n=0;
 assert.equal(await t.withTransientRetry(async()=>{if(++n<3)throw new Error('fetch failed');return 'ok';},{sleep:async ms=>waits.push(ms)}),'ok');
 assert.deepEqual(waits,[10000,30000]);
 n=0;await assert.rejects(t.withTransientRetry(async()=>{n++;throw new Error('Request timed out.');},{sleep:async()=>{}}),/timed out/);assert.equal(n,3);
 n=0;await assert.rejects(t.withTransientRetry(async()=>{n++;throw new Error('Estado del extractor inválido');},{sleep:async()=>{}}));assert.equal(n,1);
 assert.equal(t.STALE_RUN_MS,360000);
});
