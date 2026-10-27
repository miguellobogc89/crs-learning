import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const m=load('lib/analytics/merge.ts',{'@prisma/client':{Prisma:{sql:(s,...v)=>({s,v})}}});
const L=(id,def,from,to,card='one_to_many')=>({id,definitionId:def,cardinality:card,from,to});

test('plan: the duplicate\'s relations move to the record that stays; repeated or self relations are dropped',()=>{
 const links=[L('r1','issuer','DUP','INV1'),L('r2','issuer','DUP','INV2'),L('r3','issuer','KEEP','INV3'),L('r4','customer','DUP','INV3'),L('r5','customer','KEEP','INV3'),L('r6','related','DUP','KEEP','many_to_many')];
 assert.deepEqual(m.planMerge('DUP','KEEP',links),[
  {kind:'move',id:'r1',from:'KEEP',to:'INV1'},{kind:'move',id:'r2',from:'KEEP',to:'INV2'},{kind:'drop',id:'r4'},{kind:'drop',id:'r6'}]);
});

test('plan: never two owners for a record that admits one',()=>{
 assert.throws(()=>m.planMerge('DUP','KEEP',[L('a','holder','X','DUP'),L('b','holder','Y','KEEP')]),/ya tiene otra relación/);
 assert.throws(()=>m.planMerge('DUP','KEEP',[L('a','account','DUP','A1','one_to_one'),L('b','account','KEEP','A2','one_to_one')]),/única/);
 assert.deepEqual(m.planMerge('DUP','KEEP',[L('a','holder','X','DUP'),L('b','holder','X','KEEP')]),[{kind:'drop',id:'a'}],'same owner: just one relation left');
});

test('values: the one that stays keeps its values and gets only what it lacks',()=>{
 assert.deepEqual(m.mergedValues({legal_name:"D'PLOCIA HELADOS SL",tax_identifier:'B72378581',email:''},{legal_name:'D?PLOCIA',email:'a@b.es',phone:'600'}),
  {legal_name:"D'PLOCIA HELADOS SL",tax_identifier:'B72378581',email:'a@b.es',phone:'600'});
});

test('merge: moves, completes, archives the duplicate — in one transaction, under the import lock',async()=>{
 const log=[];
 const recs={DUP:{id:'DUP',revision:2,values_json:{legal_name:'D?PLOCIA',phone:'600'},object_type_id:'T',engine_object_types:{key:'company'}},
  KEEP:{id:'KEEP',revision:5,values_json:{legal_name:"D'PLOCIA",tax_identifier:'B7'},object_type_id:'T',engine_object_types:{key:'company'}}};
 const rel=(id,from,to)=>({id,relation_definition_id:'issuer',from_record_id:from,to_record_id:to,engine_relation_definitions:{cardinality:'one_to_many'}});
 const tx={$queryRaw:async q=>{log.push('lock:'+q.v[0]);},
  engine_records:{findMany:async({where})=>where.id.in.map(id=>recs[id]),updateMany:async({where,data})=>{log.push(`update ${where.id} rev${where.revision} ${data.status??JSON.stringify(data.values_json)}`);return{count:1};}},
  engine_record_relations:{findMany:async()=>[rel('r1','DUP','INV1'),rel('r2','KEEP','INV2')],update:async({where,data})=>{log.push(`move ${where.id} ${data.from_record_id}`);},delete:async({where})=>{log.push('drop '+where.id);}}};
 const out=await m.mergeRecords(tx,{workspaceId:'W',userId:'U',sourceId:'DUP',targetId:'KEEP',typeKey:'company'});
 assert.deepEqual(out,{movidas:1,descartadas:0});
 assert.deepEqual(log,['lock:engine-intake-write:W','move r1 KEEP',`update KEEP rev5 {"legal_name":"D'PLOCIA","tax_identifier":"B7","phone":"600"}`,'update DUP rev2 archived']);
 await assert.rejects(m.mergeRecords(tx,{workspaceId:'W',userId:'U',sourceId:'DUP',targetId:'DUP',typeKey:'company'}),/otra empresa/);
 const inv={...tx,engine_records:{...tx.engine_records,findMany:async()=>[recs.DUP,{...recs.KEEP,engine_object_types:{key:'invoice'}}]}};
 await assert.rejects(m.mergeRecords(inv,{workspaceId:'W',userId:'U',sourceId:'DUP',targetId:'KEEP',typeKey:'company'}),/dos empresas/);
});
