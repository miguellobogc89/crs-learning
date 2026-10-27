import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {createRequire} from 'node:module';
const req=createRequire(import.meta.url);
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];if(n.startsWith('node:'))return req(n);throw Error(n);},m,m.exports);return m.exports;}
const drive=load('lib/connectors/google-drive/drive.ts');
const plan=load('lib/connectors/google-drive/sync-plan.ts');
const sha=b=>createHash('sha256').update(b).digest('hex');
const f=(id,o={})=>({id,name:id+'.pdf',mimeType:'application/pdf',size:1000,md5:'m-'+id,modifiedAt:'2026-10-01T00:00:00Z',...o});

test('plan: import names get an extension; limit clamped',()=>{
 assert.equal(plan.importName({name:'Factura O2',mimeType:'application/pdf'}),'Factura O2.pdf');
 assert.equal(plan.importName({name:'ticket.JPEG',mimeType:'image/jpeg'}),'ticket.JPEG');
 assert.equal(plan.importName({name:'foto',mimeType:'image/jpeg'}),'foto.jpg');
 assert.equal(plan.syncLimit(undefined),20);assert.equal(plan.syncLimit(500),50);assert.equal(plan.syncLimit('3'),3);assert.equal(plan.syncLimit(0),20);
});

test('plan: pending = never seen, or seen with different content; oversize skipped before download',()=>{
 const seen=new Map([['a',{md5:'m-a'}],['b',{md5:'old'}],['c',{md5:null}]]);
 assert.deepEqual(plan.pendingFiles([f('a'),f('b'),f('c'),f('d')],seen).map(x=>x.id),['b','d']);
 assert.equal(plan.skipBeforeDownload(f('x',{size:21*1024*1024})),'Ocupa más de 20 MB');
 assert.equal(plan.skipBeforeDownload(f('x',{size:0})),'Archivo vacío');
 assert.equal(plan.skipBeforeDownload(f('x',{size:null})),null);
});

test('drive: listing pages, only readable types, newest first; download returns bytes',async()=>{
 let calls=[];const fetcher=async url=>{calls.push(url);const q=new URL(url).searchParams;
  if(url.includes('alt=media'))return{ok:true,status:200,arrayBuffer:async()=>new TextEncoder().encode('PDF').buffer};
  return{ok:true,status:200,json:async()=>q.get('pageToken')?{files:[{id:'F2xxxxx',name:'b.pdf',mimeType:'application/pdf',size:'5'}]}:{files:[{id:'F1xxxxx',name:'a.pdf',mimeType:'application/pdf',size:'10',md5Checksum:'m',modifiedTime:'t'}],nextPageToken:'p'}};};
 const r=await drive.listImportableFiles('tok','FOLDER1',fetcher);
 assert.deepEqual(r.files.map(x=>[x.id,x.size,x.md5]),[['F1xxxxx',10,'m'],['F2xxxxx',5,null]]);assert.equal(r.capped,false);
 const q=new URL(calls[0]).searchParams;assert.equal(q.get('orderBy'),'modifiedTime desc');assert.match(q.get('q'),/mimeType = 'application\/pdf' or mimeType = 'image\/jpeg'/);
 assert.equal(new TextDecoder().decode(await drive.downloadFile('tok','F1xxxxx',fetcher)),'PDF');
 await assert.rejects(drive.downloadFile('tok','F1xxxxx',async()=>({ok:false,status:403})),/no permite descargar/);
});

// syncDrive with Drive, storage and the database simulated.
function harness({driveFiles,content,knownHashes=[],seen=[],lease=true,legacy=[]}){
 const state={leases:0,released:0,batches:[],recorded:[],settings:null,hashed:[]};
 const prisma={
  knowledge_libraries:{findFirst:async()=>({id:'LIB'})},
  knowledge_import_files:{
   findMany:async({where,select})=>where.content_hash===null?legacy:[...knownHashes,...state.hashed.map(x=>x[1])].map(h=>({content_hash:h})),
   updateMany:async({where,data})=>{state.hashed.push([where.id,data.content_hash]);}},
  connector_synced_files:{
   findMany:async({where,select})=>select.external_id?seen:[],
   upsert:async({create,update})=>{state.recorded.push(create);}},
 };
 class ConnectionError extends Error{}
 const connection={PROVIDER:'google_drive',ConnectionError,
  findConnection:async()=>({settings_json:{folder:{id:'FOLDER1',name:'Facturas'}}}),
  accessToken:async()=>'tok',acquireSyncLease:async()=>{state.leases++;return lease;},releaseSyncLease:async()=>{state.released++;},
  saveSettings:async(_w,s)=>{state.settings=s;}};
 const createBatch={contentHash:sha,createIntakeBatch:async input=>{state.batches.push(input);return{id:'BATCH',files:input.documents.map((d,i)=>({id:'IF'+i,hash:sha(d.content),fileName:d.fileName}))};}};
 const fetcher=async url=>{
  if(url.includes('alt=media')){const id=decodeURIComponent(url.split('/files/')[1].split('?')[0]);const c=content[id];
   return c===undefined?{ok:false,status:404,json:async()=>({})}:{ok:true,status:200,arrayBuffer:async()=>new TextEncoder().encode(c).buffer};}
  return{ok:true,status:200,json:async()=>({files:driveFiles.map(x=>({id:x.id,name:x.name,mimeType:x.mimeType,size:x.size==null?undefined:String(x.size),md5Checksum:x.md5,modifiedTime:x.modifiedAt}))})};};
 const sync=load('lib/connectors/google-drive/sync.ts',{'@/lib/prisma':{prisma},'@/lib/storage/knowledge-storage':{readKnowledgeFile:async p=>Buffer.from('legacy:'+p)},
  '@/lib/knowledge/intake/extractor/contract':{EXTRACTOR_UPLOAD_TYPE:'intake-extractor-v2'},'@/lib/knowledge/intake/create-batch':createBatch,
  './connection':connection,'./drive':drive,'./sync-plan':plan});
 return{state,run:(limit=10)=>sync.syncDrive({workspaceId:'W',userId:'U',origin:'http://l',limit,fetcher}),sync,fetcher,ConnectionError};
}

test('sync: brings only new content, skips what is already imported (any name) and duplicates inside the folder',async()=>{
 const files=[f('NEW0001'),f('DUP0001',{name:'otro nombre.pdf'}),f('SAME001'),f('SAME002'),f('BIG0001',{size:30e6}),f('GONE001'),f('FOTO001',{name:'foto',mimeType:'image/jpeg'})];
 const h=harness({driveFiles:files,content:{NEW0001:'n1',DUP0001:'ya',SAME001:'s',SAME002:'s',FOTO001:'img'},knownHashes:[sha('ya')]});
 const r=await h.run();
 assert.equal(r.loteId,'BATCH');assert.equal(r.importados,3);assert.equal(r.duplicados,2);
 assert.deepEqual(r.omitidos.map(o=>o.nombre),['BIG0001.pdf','GONE001.pdf']);
 assert.deepEqual(h.state.batches[0].documents.map(d=>d.fileName),['NEW0001.pdf','SAME001.pdf','foto.jpg']);
 assert.equal(h.state.batches[0].libraryId,'LIB');
 const by=Object.fromEntries(h.state.recorded.map(x=>[x.external_id,x]));
 assert.equal(by.NEW0001.outcome,'importado');assert.equal(by.NEW0001.import_id,'BATCH');assert.equal(by.NEW0001.import_file_id,'IF0');
 assert.equal(by.DUP0001.outcome,'duplicado');assert.equal(by.SAME002.outcome,'duplicado');assert.equal(by.BIG0001.outcome,'omitido');assert.equal(by.DUP0001.import_id,null);
 assert.equal(h.state.recorded.length,7,'every file looked at is recorded');
 assert.equal(h.state.leases,1);assert.equal(h.state.released,1);
 assert.deepEqual({...h.state.settings.lastSync,at:0},{at:0,loteId:'BATCH',importados:3,duplicados:2,omitidos:2});
});

test('sync: stops at the limit; the rest stays pending; seen files are not downloaded again',async()=>{
 const files=['A','B','C','D'].map(x=>f(x+'000001'));
 const h=harness({driveFiles:files,content:{A000001:'a',B000001:'b',C000001:'c',D000001:'d'},seen:[{external_id:'A000001',external_md5:'m-A000001'}]});
 const r=await h.run(2);
 assert.deepEqual(h.state.batches[0].documents.map(d=>d.fileName),['B000001.pdf','C000001.pdf']);
 assert.equal(r.pendientes,1);
});

test('sync: nothing new → no batch; one at a time; the lease is released on errors',async()=>{
 const h=harness({driveFiles:[f('A000001')],content:{A000001:'a'},knownHashes:[sha('a')]});
 const r=await h.run();assert.equal(r.loteId,null);assert.equal(h.state.batches.length,0);assert.equal(r.duplicados,1);
 const busy=harness({driveFiles:[],content:{},lease:false});
 await assert.rejects(busy.run(),/sincronización en marcha/);assert.equal(busy.state.released,0);
 const down=harness({driveFiles:[f('A000001')],content:{}});
 assert.equal((await down.run()).omitidos.length,1);
});

test('sync: files of earlier batches without a fingerprint are hashed once and count as imported',async()=>{
 const h=harness({driveFiles:[f('A000001')],content:{A000001:'legacy:blob/x'},legacy:[{id:'OLD',storage_path:'blob/x'}]});
 const r=await h.run();
 assert.deepEqual(h.state.hashed,[['OLD',sha('legacy:blob/x')]]);
 assert.equal(r.duplicados,1,'the same document uploaded by hand earlier is not brought again');assert.equal(r.loteId,null);
});
