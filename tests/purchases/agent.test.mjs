import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const rules=load('lib/purchases/rules.ts');
const analytics=load('lib/purchases/analytics.ts',{'@/lib/assistant/data/query':load('lib/assistant/data/query.ts'),'./rules':rules});
const catalog=load('lib/purchases/catalog.ts',{'./analytics':analytics});
const agent=load('lib/purchases/agent.ts',{'./analytics':analytics,'./catalog':catalog});

// Synthetic workspace (no customer data).
const row=(id,values)=>({id,values});
function workspace(lines, catalogRows, pairs, extra={}){
  return {companies:[row('s',{legal_name:'Proveedor S.L.'})],invoices:lines.map((l,i)=>row(`f${i}`,{issue_date:l.date})),
    lines:lines.map(l=>row(l.id,l.values)),supplies:[],consumption:[],telecom:[],
    relations:{invoice_lines:lines.map((l,i)=>[`f${i}`,l.id]),invoice_issuer:lines.map((l,i)=>['s',`f${i}`])},
    custom:[{typeId:'t',typeKey:'catalogo',nombre:'Catálogo',descripcion:'',titulo:'producto',
      campos:['producto','proveedor','envase','unidad','referencia','alias'].map(key=>({key,label:key,type:'text',money:false,completar:false})),rows:catalogRows}],
    links:[{from:'compras',columna:'cat',nombre:'Producto',to:'tabla:catalogo',relationId:'rel',relationKey:'rel',completar:false,pairs}],
    types:[{tableKey:'tabla:catalogo',typeId:'t',typeKey:'catalogo',editable:true,settings:extra.settings??{}}],...extra.data};
}
const P='Proveedor S.L.';

test('agente: duplicados solo cuando el nombre añade unidades, números o códigos cortos', () => {
  const rows=[row('a',{producto:'Térmico 57x35mm',proveedor:P}),row('b',{producto:'Termico 57x35',proveedor:P}),
    row('c',{producto:'LECHE ENTERA 1L',proveedor:P}),row('d',{producto:'LECHE ENTERA SIN 1L',proveedor:P}),
    row('e',{producto:'AGUA 50CL',proveedor:'Otro'}),row('f',{producto:'AGUA 50CL (AL)',proveedor:P})];
  const lines=[{id:'l1',date:'2026-05-01',values:{description:'Térmico 57x35mm',quantity:'20',unit_price:'0.5',line_total:'10'}},
    {id:'l2',date:'2026-05-02',values:{description:'Térmico 57x35mm',quantity:'20',unit_price:'0.5',line_total:'10'}},
    {id:'l3',date:'2026-05-03',values:{description:'Termico 57x35',quantity:'20',unit_price:'0.5',line_total:'10'}}];
  const dups=agent.reviewPurchases(workspace(lines,rows,[['l1','a'],['l2','a'],['l3','b']])).filter(p=>p.kind==='duplicado');
  assert.equal(dups.length,1);
  assert.deepEqual(dups[0].accion,{k:'unir',destino:'a',origen:'b'});
});

test('agente: no productos, cantidad sospechosa, tarifa > 10 % y lo que no cuadra', () => {
  const rows=[row('p',{producto:'PARKING (19:01 - 19:11)',proveedor:P}),row('h',{producto:'PAPEL HIGIENICO',proveedor:P}),row('x',{producto:'FRIEGASUELOS',proveedor:P})];
  const lines=[{id:'k',date:'2026-07-28',values:{description:'PARKING',quantity:'1',unit_price:'0',line_total:'0'}},
    {id:'h1',date:'2026-03-01',values:{description:'PAPEL HIGIENICO',quantity:'1',unit_price:'1.90',line_total:'1.90'}},
    {id:'h2',date:'2026-04-01',values:{description:'PAPEL HIGIENICO',quantity:'1',unit_price:'3.72',line_total:'3.72'}},
    {id:'h3',date:'2026-05-01',values:{description:'PAPEL HIGIENICO',quantity:'1',unit_price:'1.94',line_total:'1.94'}},
    {id:'x1',date:'2026-05-09',values:{description:'FRIEGASUELOS',quantity:'2',unit_price:'0.75',line_total:'1.50'}},
    {id:'x2',date:'2026-10-09',values:{description:'FRIEGASUELOS',quantity:'2',unit_price:'0.95',line_total:'1.90'}},
    {id:'x3',date:'2026-10-10',values:{description:'FRIEGASUELOS',quantity:'2',unit_price:'0.95',line_total:'9.99'}}];
  const d=workspace(lines,rows,[['k','p'],['h1','h'],['h2','h'],['h3','h'],['x1','x'],['x2','x'],['x3','x']]);
  const ps=agent.reviewPurchases(d), by=k=>ps.filter(p=>p.kind===k);
  assert.deepEqual(by('no_producto').map(p=>p.accion),[{k:'archivar',productId:'p'}]);
  assert.deepEqual(by('cantidad').map(p=>p.accion),[{k:'cantidad',lineId:'h2',quantity:2}]);
  assert.equal(by('tarifa').length,1); assert.match(by('tarifa')[0].titulo,/FRIEGASUELOS.*subido un 27 %/); assert.equal(by('tarifa')[0].accion,null);
  assert.deepEqual(by('no_cuadra').map(p=>p.id),['nocuadra:x3']);
  // Answered: it does not come back, and the catalog no longer shows it as «Revisar».
  const tarifa=by('tarifa')[0].id;
  const answered=workspace(lines,rows,[['k','p'],['h1','h'],['h2','h'],['h3','h'],['x1','x'],['x2','x'],['x3','x']],{settings:{agente:{descartadas:[tarifa,'nocuadra:x3']}}});
  const again=agent.reviewPurchases(answered);
  assert.equal(again.some(p=>p.id===tarifa||p.id==='nocuadra:x3'),false);
  assert.equal(catalog.liveCatalog(answered).jumps.has('x'),false);
});

test('agente: una cantidad corregida a mano no se vuelve a proponer', () => {
  const rows=[row('h',{producto:'PAPEL HIGIENICO',proveedor:P})];
  const lines=[1.90,3.72,1.94].map((v,i)=>({id:`h${i}`,date:`2026-0${i+3}-01`,values:{description:'PAPEL HIGIENICO',quantity:'1',unit_price:String(v),line_total:String(v)}}));
  const d=workspace(lines,rows,lines.map(l=>[l.id,'h']),{data:{manual:{h1:['quantity']}}});
  assert.equal(agent.reviewPurchases(d).filter(p=>p.kind==='cantidad').length,0);
});

test('agente (servicio): «unir» pasa las compras, guarda el alias y archiva el duplicado; lo que ya no está pendiente se rechaza', async () => {
  const rows=[row('a',{producto:'Térmico 57x35mm',proveedor:P}),row('b',{producto:'Termico 57x35',proveedor:P})];
  const lines=[{id:'l1',date:'2026-05-01',values:{description:'Térmico 57x35mm',quantity:'20',unit_price:'0.5',line_total:'10'}},
    {id:'l2',date:'2026-05-02',values:{description:'Térmico 57x35mm',quantity:'20',unit_price:'0.5',line_total:'10'}},
    {id:'l3',date:'2026-05-03',values:{description:'Termico 57x35',quantity:'20',unit_price:'0.5',line_total:'10'}}];
  const d=workspace(lines,rows,[['l1','a'],['l2','a'],['l3','b']]);
  const calls={rel:[],upd:[],prov:[],settings:null};
  const fields=['producto','proveedor','envase','unidad','referencia','alias'].map(key=>({key,field_type:key==='alias'?'long_text':'text',is_required:false,status:'active'}));
  const tx={
    engine_record_relations:{updateMany:async q=>{calls.rel.push(q);return{count:1};}},
    engine_records:{findFirst:async({where})=>({id:where.id,values_json:{producto:'Térmico 57x35mm',proveedor:P},revision:2,schema_version:4}),
      updateMany:async q=>{calls.upd.push(q);return{count:1};}},
    engine_object_types:{findUniqueOrThrow:async()=>({schema_version:4,settings:{titulo:'producto'},engine_field_definitions:fields}),update:async q=>{calls.settings=q.data.settings;}},
    engine_record_provenance:{createMany:async q=>{calls.prov.push(...q.data);}},
  };
  const svc=load('lib/purchases/agent.service.ts',{'@prisma/client':{Prisma:{}},'@/lib/prisma':{prisma:{$transaction:async fn=>fn(tx)}},
    '@/lib/engine/validation':load('lib/engine/validation.ts'),'@/lib/analytics/data':{loadAnalyticsData:async()=>d},'./analytics':analytics,'./agent':agent});
  const id=agent.reviewPurchases(d).find(p=>p.kind==='duplicado').id;
  await svc.answerProposal({workspaceId:'w',userId:'u',id,decision:'aplicar'});
  assert.deepEqual(calls.rel[0].where,{workspace_id:'w',relation_definition_id:'rel',from_record_id:'b'}); assert.deepEqual(calls.rel[0].data,{from_record_id:'a'});
  assert.equal(calls.upd[0].data.values_json.alias,'Termico 57x35');
  assert.equal(calls.upd[1].where.id,'b'); assert.equal(calls.upd[1].data.status,'archived');
  assert.deepEqual(calls.prov.map(p=>[p.field_key,p.origin_type]),[['alias','integration']]);
  assert.deepEqual(calls.settings.agente.descartadas,[id]);
  await assert.rejects(()=>svc.answerProposal({workspaceId:'w',userId:'u',id:'dup:x:y',decision:'aplicar'}),/ya no está pendiente/);
});
