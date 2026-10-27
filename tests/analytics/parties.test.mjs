import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const rc=load('lib/knowledge/intake/reconciliation/contract.ts');
const p=load('lib/analytics/parties.ts',{'@prisma/client':{Prisma:{sql:(s,...v)=>({s,v})}},'@/lib/knowledge/intake/reconciliation/contract':rc});

test('a new company: name required; NIF optional, stored in comparable form',()=>{
 assert.deepEqual(p.newCompanyValues({nombre:'  Aguas de  Cádiz '}),{ok:true,values:{legal_name:'Aguas de Cádiz'},key:null});
 assert.deepEqual(p.newCompanyValues({nombre:'Leroy',nif:'CIF B-84818442'}),{ok:true,values:{legal_name:'Leroy',tax_identifier:'B84818442'},key:'B84818442'});
 assert.equal(p.newCompanyValues({nombre:' '}).ok,false);
 assert.match(p.newCompanyValues({nombre:'X',nif:'hola'}).error,/no es un NIF/);
});

function fakeTx({existingByKey=null}={}){
 const log=[];
 const tx={$queryRaw:async q=>{log.push('lock');},
  engine_object_types:{findUnique:async({where})=>({id:'T-'+where.workspace_id_key.key,schema_version:3,status:'active'})},
  engine_relation_definitions:{findUnique:async({where})=>({id:'D-'+where.workspace_id_key.key,status:'active'})},
  engine_records:{findFirst:async({where})=>{if(where.external_key)return existingByKey;return{id:where.id};},
   create:async({data})=>{log.push(`create ${data.values_json.legal_name} key=${data.external_key}`);return{id:'NEW',status:data.status};}},
  engine_record_revisions:{createMany:async({skipDuplicates})=>{log.push('revision skip='+skipDuplicates);}},
  engine_record_relations:{deleteMany:async({where})=>{log.push(`unlink ${where.relation_definition_id} ${where.to_record_id}`);},create:async({data})=>{log.push(`link ${data.from_record_id}→${data.to_record_id}`);}}};
 return{tx,log};
}

test('change the issuer: the previous one is replaced, under the import lock',async()=>{
 const {tx,log}=fakeTx();
 assert.deepEqual(await p.setInvoiceParty(tx,{workspaceId:'W',userId:'U',invoiceId:'INV',role:'issuer',companyId:'AGUAS'}),{companyId:'AGUAS',created:false});
 assert.deepEqual(log,['lock','unlink D-invoice_issuer INV','link AGUAS→INV']);
 const none=fakeTx();await p.setInvoiceParty(none.tx,{workspaceId:'W',userId:'U',invoiceId:'INV',role:'customer',companyId:null});
 assert.deepEqual(none.log,['lock','unlink D-invoice_customer INV'],'"none" just removes it');
});

test('a new company is created once; with a known NIF the saved one is reused',async()=>{
 const {tx,log}=fakeTx();
 const r=await p.setInvoiceParty(tx,{workspaceId:'W',userId:'U',invoiceId:'INV',role:'issuer',companyId:null,nueva:{nombre:'Aguas de Cádiz'}});
 assert.deepEqual(r,{companyId:'NEW',created:true});assert.deepEqual(log,['lock','create Aguas de Cádiz key=null','revision skip=true','unlink D-invoice_issuer INV','link NEW→INV']);
 const known=fakeTx({existingByKey:{id:'LEROY'}});
 assert.deepEqual(await p.setInvoiceParty(known.tx,{workspaceId:'W',userId:'U',invoiceId:'INV',role:'issuer',companyId:null,nueva:{nombre:'Leroy',nif:'B84818442'}}),{companyId:'LEROY',created:false});
 await assert.rejects(p.setInvoiceParty(tx,{workspaceId:'W',userId:'U',invoiceId:'INV',role:'issuer',companyId:null,nueva:{nombre:''}}),/nombre/);
});

test('lines are archived, never deleted',async()=>{
 let data;const tx={$queryRaw:async()=>{},engine_object_types:{findUnique:async()=>({id:'T',schema_version:1,status:'active'})},engine_records:{updateMany:async a=>{data=a;return{count:2};}}};
 assert.equal(await p.archiveLines(tx,{workspaceId:'W',userId:'U',lineIds:['a','b']}),2);
 assert.equal(data.data.status,'archived');assert.deepEqual(data.data.revision,{increment:1});assert.equal(data.where.object_type_id,'T');
 assert.equal(await p.archiveLines(tx,{workspaceId:'W',userId:'U',lineIds:[]}),0);
});
