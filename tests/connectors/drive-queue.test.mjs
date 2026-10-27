import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const st=load('lib/connectors/google-drive/file-status.ts');
const q=load('components/connectors/intake-queue.ts');
const b=(o={})=>({id:'B',status:'intake_completed',error:null,lecturaBase:'completed',clasificacion:'completed',verificacion:'completed',conciliacion:'completed',escritura:null,escrituraError:null,...o});

test('batch state: saved, waiting to save, errors and the phase it is in',()=>{
 assert.equal(st.batchState(b({escritura:'completed'})).estado,'guardado');
 assert.deepEqual(st.batchState(b()),{estado:'por_guardar',fase:'escritura',error:null});
 assert.deepEqual(st.batchState(b({status:'intake_error',error:'cortada'})),{estado:'error',fase:'lectura',error:'cortada'});
 assert.equal(st.batchState(b({conciliacion:'error'})).estado,'error');
 assert.equal(st.batchState(b({escritura:'error',escrituraError:'x'})).error,'x');
 assert.deepEqual(st.batchState(b({status:'intake_pending',lecturaBase:null,clasificacion:null,verificacion:null,conciliacion:null})),{estado:'procesando',fase:'lectura_base',error:null});
 assert.equal(st.batchState(b({status:'intake_running',clasificacion:'error',verificacion:null,conciliacion:null})).fase,'lectura','a failed classification does not stop the reading');
 assert.equal(st.batchState(b({verificacion:'processing',conciliacion:null})).fase,'verificacion');
 assert.equal(st.batchState(b({conciliacion:'processing'})).fase,'conciliacion');
});

test('file rows: not brought, changed in Drive, repeated, unreadable, and the state of its batch',()=>{
 const f=(id,md5='m')=>({id,name:id+'.pdf',mimeType:'application/pdf',size:1,md5,modifiedAt:'2026-10-01T00:00:00Z'});
 const reg=new Map([
  ['b',{outcome:'importado',detail:null,md5:'m',importId:'L1',syncedAt:'t'}],['c',{outcome:'duplicado',detail:'Ya estaba',md5:'m',importId:null,syncedAt:'t'}],
  ['d',{outcome:'omitido',detail:'Ocupa más de 20 MB',md5:'m',importId:null,syncedAt:'t'}],['e',{outcome:'importado',detail:null,md5:'old',importId:'L1',syncedAt:'t'}],
  ['g',{outcome:'importado',detail:null,md5:'m',importId:'GONE',syncedAt:'t'}]]);
 const rows=st.fileRows([f('a'),f('b'),f('c'),f('d'),f('e'),f('g')],reg,new Map([['L1',{estado:'por_guardar',fase:'escritura',error:null}]]));
 assert.deepEqual(rows.map(r=>r.estado),['sin_traer','por_guardar','repetido','no_legible','sin_traer','error']);
 assert.equal(rows[1].loteId,'L1');assert.match(rows[4].detalle,/Cambió en Drive/);assert.match(rows[5].detalle,/ya no existe/);
 assert.deepEqual(st.countByStatus(rows),{sin_traer:2,procesando:0,por_guardar:1,guardado:0,error:1,repetido:1,no_legible:1});
 assert.deepEqual(st.chunks([1,2,3,4,5],2),[[1,2],[3,4],[5]]);
});

test('queue: two at a time, each up to "Guardar" (never saves), errors stop that batch only',async()=>{
 const script={A:['lectura','verificacion','escritura'],B:['error'],C:['lectura','escritura'],D:['done']};
 const step={};let active=0,maxActive=0;const updates=[];
 const advance=async id=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,1));active--;
  const i=step[id]=(step[id]??-1)+1;const p=script[id][Math.min(i,script[id].length-1)];
  if(p==='error')return{status:'error',phase:'lectura',error:'cortada'};
  if(p==='done')return{status:'completed',phase:'completado',error:null,writing:{status:'completed'}};
  return p==='escritura'?{status:'waiting',phase:'escritura',error:null}:{status:'processing',phase:p,error:null};};
 let idle;const done=new Promise(r=>idle=r);
 const queue=new q.IntakeQueue({advance,onUpdate:u=>updates.push(u),onIdle:()=>idle(),sleep:async()=>{},concurrency:2});
 queue.add(['A','B','C','D','A']);await done;
 const last=id=>updates.filter(u=>u.id===id).at(-1);
 assert.equal(last('A').status,'por_guardar');assert.equal(last('B').status,'error');assert.equal(last('B').error,'cortada');
 assert.equal(last('C').status,'por_guardar');assert.equal(last('D').status,'guardado');
 assert.ok(maxActive<=2);assert.equal(updates.filter(u=>u.id==='A'&&u.status==='en_cola').length,1,'each batch once');
 assert.ok(!updates.some(u=>/escritura/.test(u.phase)&&u.status==='guardado'&&u.id!=='D'));
});

test('save clean: only batches without decisions; the rest are left for the person',async()=>{
 const calls=[];
 const plans={L1:{estado:'pending',plan:{resumen:{bloqueados:0}}},L2:{estado:'pending',plan:{resumen:{bloqueados:2}}},L3:{estado:'completed'},L4:{estado:'blocked',error:'Falta la conciliación actual del lote'},L5:{estado:'pending',plan:{resumen:{bloqueados:0}}}};
 const call=async(url,init)=>{const id=url.split('/')[4];calls.push(`${init?.method??'GET'} ${id}`);
  if(init?.method==='POST'){assert.deepEqual(JSON.parse(init.body),{decisiones:{}});return id==='L5'?{ok:false,json:{error:'El lote cambió'}}:{ok:true,json:{estado:'completed'}};}
  return{ok:true,json:plans[id]};};
 const progress=[];const out=await q.saveClean(['L1','L2','L3','L4','L5'],call,n=>progress.push(n));
 assert.deepEqual(out.guardados,['L1','L3']);assert.deepEqual(out.conDudas,['L2']);assert.deepEqual(out.errores.map(e=>e.id),['L4','L5']);
 assert.ok(!calls.includes('POST L2'),'never saves a batch with pending decisions');assert.deepEqual(progress,[1,2,3,4,5]);
});

test('queue: a dropped request is retried; only repeated failures mark the batch',async()=>{
 let n=0;const updates=[];let idle;const done=new Promise(r=>idle=r);
 const queue=new q.IntakeQueue({advance:async()=>{n++;if(n<3)throw new Error('Failed to fetch');return{status:'waiting',phase:'escritura',error:null};},onUpdate:u=>updates.push(u),onIdle:()=>idle(),sleep:async()=>{}});
 queue.add(['A']);await done;assert.equal(updates.at(-1).status,'por_guardar');
 let idle2;const done2=new Promise(r=>idle2=r);const u2=[];
 const q2=new q.IntakeQueue({advance:async()=>{throw new Error('Failed to fetch');},onUpdate:u=>u2.push(u),onIdle:()=>idle2(),sleep:async()=>{}});
 q2.add(['B']);await done2;assert.equal(u2.at(-1).status,'error');
});
