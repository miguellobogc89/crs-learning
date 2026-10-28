import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const q=load('lib/assistant/data/query.ts');

const facturas={key:'facturas',label:'Facturas',description:'',columns:[
 {key:'fecha',label:'Fecha',kind:'date'},{key:'numero',label:'Número'},{key:'emisor',label:'Emisor',filter:true},{key:'tipo',label:'Tipo',filter:true},
 {key:'total',label:'Total',kind:'money'},{key:'documento',label:'Documento',kind:'document'}],
 rows:[
  {_id:'1',fecha:'2026-01-10',numero:'A1',emisor:'Endesa',tipo:'Gasto',total:100.5,documento:'f1'},
  {_id:'2',fecha:'2026-01-25',numero:'A2',emisor:'Mercadona',tipo:'Gasto',total:40,documento:null},
  {_id:'3',fecha:'2026-02-03',numero:'A3',emisor:'Endesa',tipo:'Gasto',total:120,documento:null},
  {_id:'4',fecha:'2026-04-01',numero:'V1',emisor:"D'Plocia",tipo:'Ingreso',total:1000,documento:null},
  {_id:'5',fecha:null,numero:'A4',emisor:null,tipo:'Gasto',total:null,documento:null}]};
const empresas={key:'empresas',label:'Empresas',description:'',columns:[{key:'empresa',label:'Empresa'},{key:'nif',label:'NIF/CIF'},{key:'mia',label:'Mi empresa',kind:'boolean'}],
 rows:[{empresa:'ENDESA',nif:'A81948077',mia:false},{empresa:'Mercadona',nif:'A46103834',mia:false},{empresa:"D'Plocia",nif:'B1',mia:true}]};
const T=[facturas,empresas];

test('catalog: visible columns only (no internal ids or file links), kinds and real sample values',()=>{
 const c=q.catalog(T);
 assert.deepEqual(c[0].columnas.map(x=>x.columna),['fecha','numero','emisor','tipo','total']);
 assert.deepEqual(c[0].columnas.find(x=>x.columna==='emisor').ejemplos,['Endesa','Mercadona',"D'Plocia"]);
 assert.equal(c[0].filas,5);
});

test('filters: text ignores case and accents; numbers and dates compare as such; empty values',()=>{
 const r=o=>q.runQuery(T,{tabla:'facturas',...o});
 assert.deepEqual(r({filtros:[{columna:'emisor',op:'=',valor:'endesa'}]}).filas.map(x=>x.numero),['A1','A3']);
 assert.equal(r({filtros:[{columna:'total',op:'>',valor:'100'}]}).total,3);
 assert.deepEqual(r({filtros:[{columna:'fecha',op:'entre',valores:['2026-01-01','2026-01-31']}]}).filas.map(x=>x.numero),['A1','A2']);
 assert.deepEqual(r({filtros:[{columna:'fecha:mes',op:'=',valor:'2026-02'}]}).filas.map(x=>x.numero),['A3']);
 assert.deepEqual(r({filtros:[{columna:'emisor',op:'vacio'}]}).filas.map(x=>x.numero),['A4']);
 assert.equal(r({filtros:[{columna:'emisor',op:'en',valores:['ENDESA','mercadona']}]}).total,3);
 assert.ok(!('documento' in r({}).filas[0]),'file links are never returned');
});

test('group and add up: by issuer and by month, biggest first; empty totals ignored',()=>{
 const g=q.runQuery(T,{tabla:'facturas',filtros:[{columna:'tipo',op:'=',valor:'Gasto'}],agrupar_por:['emisor'],calcular:[{funcion:'suma',columna:'total'},{funcion:'cuenta'}]});
 assert.deepEqual(g.filas,[{emisor:'Endesa',suma_total:220.5,cuenta:2},{emisor:'Mercadona',suma_total:40,cuenta:1},{emisor:null,suma_total:null,cuenta:1}]);
 assert.equal(g.columnas[1].kind,'money');
 assert.equal(g.columnas[1].label,'Suma de total');
 const m=q.runQuery(T,{tabla:'facturas',agrupar_por:['fecha:mes'],calcular:[{funcion:'suma',columna:'total',nombre:'Gasto'}],ordenar:[{columna:'fecha:mes',direccion:'asc'}]});
 assert.deepEqual(m.filas.map(x=>[x['fecha:mes'],x.Gasto]),[[null,null],['2026-01',140.5],['2026-02',120],['2026-04',1000]]);
 const total=q.runQuery(T,{tabla:'facturas',calcular:[{funcion:'suma',columna:'total'},{funcion:'media',columna:'total'},{funcion:'max',columna:'fecha'}]});
 assert.deepEqual(total.filas,[{suma_total:1260.5,media_total:315.13,max_fecha:'2026-04-01'}]);
});

test('cross two tables: matching names regardless of case, inner or keeping unmatched rows',()=>{
 const x=q.runQuery(T,{tabla:'facturas',cruzar:{tabla:'empresas',columna_local:'emisor',columna_otra:'empresa'},columnas:['numero','emisor','empresas.nif','empresas.mia']});
 assert.deepEqual(x.filas.map(r=>[r.numero,r['empresas.nif']]),[['A1','A81948077'],['A2','A46103834'],['A3','A81948077'],['V1','B1']]);
 assert.equal(x.columnas[2].label,'NIF/CIF (Empresas)');
 assert.deepEqual(x.tablas,['facturas','empresas']);
 const left=q.runQuery(T,{tabla:'facturas',cruzar:{tabla:'empresas',columna_local:'emisor',columna_otra:'empresa',tipo:'izquierda'}});
 assert.equal(left.total,5);
 const mine=q.runQuery(T,{tabla:'facturas',cruzar:{tabla:'empresas',columna_local:'emisor',columna_otra:'empresa'},filtros:[{columna:'empresas.mia',op:'=',valor:true}],calcular:[{funcion:'suma',columna:'facturas.total'}]});
 assert.deepEqual(mine.filas,[{suma_total:1000}]);
});

test('limits and clear errors the model can correct',()=>{
 const l=q.runQuery(T,{tabla:'facturas',limite:2});
 assert.equal(l.filas.length,2); assert.equal(l.total,5); assert.equal(l.truncado,true);
 assert.equal(q.runQuery(T,{tabla:'facturas',limite:100000}).filas.length,5);
 assert.throws(()=>q.runQuery(T,{tabla:'nominas'}),/No existe la tabla «nominas»/);
 assert.throws(()=>q.runQuery(T,{tabla:'facturas',columnas:['importe']}),/No existe la columna «importe»/);
 assert.throws(()=>q.runQuery(T,{tabla:'facturas',calcular:[{funcion:'suma',columna:'emisor'}]}),/solo vale para importes/);
 assert.throws(()=>q.runQuery(T,{tabla:'facturas',agrupar_por:['emisor:mes']}),/solo las fechas/);
 assert.throws(()=>q.runQuery(T,{tabla:'facturas',ordenar:[{columna:'total'}],agrupar_por:['emisor']}),/tiene que estar en el resultado/);
});

test('tool: compact answer for the model, a block for the chat only when asked, errors as text the model can fix',()=>{
 const tools=load('lib/assistant/data/tools.ts',{'@/lib/analytics/data':{loadAnalyticsData:async()=>({})},'@/lib/analytics/compute':{buildTable:()=>null,TABLE_KEYS:[]},'./query':q});
 const shown=tools.executeDataTool(T,JSON.stringify({titulo:'Gasto por emisor',mostrar:true,consulta:{tabla:'facturas',agrupar_por:['emisor'],calcular:[{funcion:'suma',columna:'total'}]}}),'D1');
 const out=JSON.parse(shown.output);
 assert.equal(out.total,4); assert.equal(out.mostrado_al_usuario,true);
 assert.deepEqual(shown.block.tablas,['facturas']); assert.equal(shown.block.id,'D1'); assert.equal(shown.block.titulo,'Gasto por emisor');
 assert.equal(tools.executeDataTool(T,JSON.stringify({titulo:'x',consulta:{tabla:'facturas'}}),'D2').block,undefined);
 assert.match(JSON.parse(tools.executeDataTool(T,JSON.stringify({titulo:'x',consulta:{tabla:'nada'}}),'D3').output).error,/No existe la tabla/);
 assert.match(JSON.parse(tools.executeDataTool(T,'{mal json','D4').output).error,/JSON/);
 assert.deepEqual(tools.extractDataBlocks({dataBlocks:[shown.block,{id:3}]}),[shown.block]);
 const prompt=tools.dataPrompt(T);
 assert.match(prompt,/consultar_datos/); assert.match(prompt,/"tabla":"empresas"/);
});
