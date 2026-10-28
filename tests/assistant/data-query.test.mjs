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

test('formulas row by row and the latest value of a column (e.g. last price paid per product and supplier)',()=>{
 const compras={key:'compras',label:'Compras',description:'',columns:[{key:'fecha',label:'Fecha',kind:'date'},{key:'producto',label:'Producto'},{key:'proveedor',label:'Proveedor'},{key:'cantidad',label:'Cantidad',kind:'number'},{key:'precio',label:'Precio',kind:'money'}],
  rows:[{_id:'l1',fecha:'2026-01-05',producto:'Leche entera',proveedor:'Mercadona',cantidad:6,precio:0.95},{_id:'l2',fecha:'2026-03-01',producto:'Leche entera',proveedor:'Mercadona',cantidad:12,precio:0.99},
   {_id:'l3',fecha:'2026-02-01',producto:'Jamón',proveedor:'Mercadona',cantidad:1,precio:12.5},{_id:'l4',fecha:'2026-02-10',producto:'Leche entera',proveedor:'Makro',cantidad:24,precio:0.89}]};
 const last=q.runQuery([compras],{tabla:'compras',agrupar_por:['producto','proveedor'],calcular:[{funcion:'ultimo',columna:'precio',segun:'fecha',nombre:'precio'},{funcion:'max',columna:'fecha',nombre:'ultima_compra'}],ordenar:[{columna:'producto',direccion:'asc'},{columna:'proveedor',direccion:'asc'}]});
 assert.deepEqual(last.filas,[{producto:'Jamón',proveedor:'Mercadona',precio:12.5,ultima_compra:'2026-02-01'},{producto:'Leche entera',proveedor:'Makro',precio:0.89,ultima_compra:'2026-02-10'},{producto:'Leche entera',proveedor:'Mercadona',precio:0.99,ultima_compra:'2026-03-01'}]);
 assert.equal(last.columnas[2].kind,'money');
 const f=q.runQuery([compras],{tabla:'compras',formulas:[{nombre:'coste',a:'cantidad',op:'*',b:'precio'}],calcular:[{funcion:'suma',columna:'coste'}]});
 assert.deepEqual(f.filas,[{suma_coste:12*0.99+6*0.95+12.5+24*0.89}].map(r=>({suma_coste:Math.round(r.suma_coste*100)/100})));
 assert.throws(()=>q.runQuery([compras],{tabla:'compras',formulas:[{nombre:'x',a:'producto',op:'*',valor:2}]}),/solo opera/);
 assert.throws(()=>q.runQuery([compras],{tabla:'compras',calcular:[{funcion:'ultimo',columna:'precio'}]}),/segun/);
 assert.deepEqual(q.runQuery([compras],{tabla:'compras',columnas:['producto'],limite:1},{keepIds:true}).filas,[{_id:'l1',producto:'Leche entera'}]);
});

test('cross a chain of tables following links by id: recipe → equivalence → catalog product → price → cost per recipe',()=>{
 const recetas={key:'plantilla:R',label:'Recetas',description:'',columns:[{key:'receta',label:'Receta'},{key:'ingrediente',label:'Ingrediente'},{key:'cantidad',label:'Cantidad',kind:'number'}],
  rows:[{_id:'r1',receta:'Bechamel',ingrediente:'Leche',cantidad:2},{_id:'r2',receta:'Bechamel',ingrediente:'Mantequilla',cantidad:0.1},{_id:'r3',receta:'Batido',ingrediente:'Leche',cantidad:1}]};
 const eq={key:'tabla:equivalencias',label:'Equivalencias',description:'',title:'ingrediente',columns:[{key:'ingrediente',label:'Ingrediente'},{key:'producto',label:'Producto',link:'tabla:catalogo',completar:true}],
  rows:[{_id:'e1',ingrediente:'Leche',producto:'LECHE P6',_link_producto:'c1'},{_id:'e2',ingrediente:'Mantequilla',producto:null,_link_producto:null}]};
 const cat={key:'tabla:catalogo',label:'Catálogo',description:'',title:'producto',columns:[{key:'producto',label:'Producto'},{key:'proveedor',label:'Proveedor'},{key:'precio',label:'Precio',kind:'money'}],
  rows:[{_id:'c1',producto:'LECHE P6',proveedor:'Mercadona',precio:0.99},{_id:'c2',producto:'LECHE P6',proveedor:'Makro',precio:0.89}]};
 const T=[recetas,eq,cat];
 const cost=q.runQuery(T,{tabla:'plantilla:R',cruzar:[{tabla:'tabla:equivalencias',columna_local:'ingrediente',columna_otra:'ingrediente'},{tabla:'tabla:catalogo',columna_local:'tabla:equivalencias.producto'}],
  formulas:[{nombre:'coste',a:'cantidad',op:'*',b:'tabla:catalogo.precio'}],agrupar_por:['receta'],calcular:[{funcion:'suma',columna:'coste'}]});
 assert.deepEqual(cost.filas,[{receta:'Bechamel',suma_coste:1.98},{receta:'Batido',suma_coste:0.99}],'by the link id: the Makro row with the same name is not mixed in');
 assert.deepEqual(cost.tablas,['plantilla:R','tabla:equivalencias','tabla:catalogo']);
 const missing=q.runQuery(T,{tabla:'plantilla:R',cruzar:[{tabla:'tabla:equivalencias',columna_local:'ingrediente',columna_otra:'ingrediente'},{tabla:'tabla:catalogo',columna_local:'tabla:equivalencias.producto',tipo:'izquierda'}],
  filtros:[{columna:'tabla:catalogo.producto',op:'vacio'}],columnas:['receta','ingrediente']});
 assert.deepEqual(missing.filas,[{receta:'Bechamel',ingrediente:'Mantequilla'}],'what still has no product');
 assert.throws(()=>q.runQuery(T,{tabla:'plantilla:R',cruzar:[{tabla:'tabla:catalogo',columna_local:'ingrediente'}]}),/no tiene la columna/);
});

test('which row holds the minimum: the cheapest supplier of each product, and the real price paid after offers',()=>{
 const compras={key:'compras',label:'Compras',description:'',columns:[{key:'producto',label:'Producto'},{key:'proveedor',label:'Proveedor'},{key:'precio_pagado',label:'Precio pagado',kind:'money'}],
  rows:[{producto:'Leche',proveedor:'Mercadona',precio_pagado:0.99},{producto:'Leche',proveedor:'Makro',precio_pagado:0.85},{producto:'Leche',proveedor:'López',precio_pagado:0.92}]};
 const r=q.runQuery([compras],{tabla:'compras',agrupar_por:['producto'],calcular:[{funcion:'min',columna:'precio_pagado',nombre:'mejor'},{funcion:'del_minimo',columna:'proveedor',segun:'precio_pagado',nombre:'donde'},{funcion:'max',columna:'precio_pagado',nombre:'peor'},{funcion:'del_maximo',columna:'proveedor',segun:'precio_pagado',nombre:'peor_en'}]});
 assert.deepEqual(r.filas,[{producto:'Leche',mejor:0.85,donde:'Makro',peor:0.99,peor_en:'Mercadona'}]);
});

test('pack size from product names, so prices can be compared per litre or kilo, and the median to spot odd prices',()=>{
 const m=q.parseMeasure;
 assert.deepEqual(m('KEN LECHE ENTERA B·I·BOX 10 LTS.'),{cantidad:10,unidad:'L'});
 assert.deepEqual(m('AZUCAR BLANCA S/25 KGS.'),{cantidad:25,unidad:'Kg'});
 assert.deepEqual(m('QUELLA G (SIN AZUCAR) LT/6 KGS. 14780'),{cantidad:6,unidad:'Kg'},'the reference number is not a size');
 assert.deepEqual(m('FRUTA DEL BOSQUE 500 FAST C/T B/1,25 KGS. 08072A'),{cantidad:1.25,unidad:'Kg'});
 assert.deepEqual(m('SOLAN DE CABRAS 50CL'),{cantidad:0.5,unidad:'L'});
 assert.deepEqual(m('AGUA 6X1,5L'),{cantidad:9,unidad:'L'});
 assert.deepEqual(m('TARRINA D´PLOCIA T12 (120 CC) CJ/2000 U.'),{cantidad:2000,unidad:'ud'});
 assert.deepEqual(m('NUECES U.S.A CP/1500 G.'),{cantidad:1.5,unidad:'Kg'});
 assert.deepEqual(m('LECHE ENTERA P6'),{cantidad:6,unidad:'ud'});
 assert.equal(m('LEJIA NORMAL'),null);
 const compras={key:'compras',label:'Compras',description:'',columns:[{key:'producto',label:'Producto'},{key:'cantidad',label:'Cantidad',kind:'number'},{key:'importe',label:'Importe',kind:'money'}],
  rows:[{producto:'KEN LECHE ENTERA B·I·BOX 10 LTS.',cantidad:10,importe:102},{producto:'KEN LECHE ENTERA B·I·BOX 10 LTS.',cantidad:6,importe:61.2},{producto:'KEN LECHE ENTERA B·I·BOX 10 LTS.',cantidad:10,importe:61.2}]};
 const r=q.runQuery([compras],{tabla:'compras',formulas:[{nombre:'contenido',medida:'producto'},{nombre:'unidad_base',medida:'producto',dato:'unidad'},{nombre:'litros',a:'cantidad',op:'*',b:'contenido'},{nombre:'precio_litro',a:'importe',op:'/',b:'litros',importe:true}],
  columnas:['cantidad','unidad_base','litros','precio_litro']});
 assert.deepEqual(r.filas,[{cantidad:10,unidad_base:'L',litros:100,precio_litro:1.02},{cantidad:6,unidad_base:'L',litros:60,precio_litro:1.02},{cantidad:10,unidad_base:'L',litros:100,precio_litro:0.612}]);
 const med=q.runQuery([compras],{tabla:'compras',calcular:[{funcion:'mediana',columna:'importe'}]});
 assert.deepEqual(med.filas,[{mediana_importe:61.2}]);
});

test('a fixed reference price decides the litres bought (amount ÷ price); without it, invoice quantity × pack size',()=>{
 const compras={key:'compras',label:'Compras',description:'',columns:[{key:'producto',label:'Producto'},{key:'cantidad',label:'Cantidad',kind:'number'},{key:'importe',label:'Importe',kind:'money'},{key:'precio_fijo',label:'Precio fijado €/L',kind:'money'}],
  rows:[{producto:'KEN LECHE ENTERA 10 LTS',cantidad:10,importe:61.2,precio_fijo:1.02},{producto:'LECHE ENTERA P6 1L 6X1L',cantidad:2,importe:6,precio_fijo:null}]};
 const r=q.runQuery([compras],{tabla:'compras',formulas:[
  {nombre:'por_precio',a:'importe',op:'/',b:'precio_fijo'},{nombre:'contenido',medida:'producto'},{nombre:'por_factura',a:'cantidad',op:'*',b:'contenido'},
  {nombre:'litros',a:'por_precio',op:'o',b:'por_factura'}],columnas:['producto','litros']});
 assert.deepEqual(r.filas.map(x=>x.litros),[60,12]);
});
