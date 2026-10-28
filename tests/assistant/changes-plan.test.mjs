import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const q=load('lib/assistant/data/query.ts');
const p=load('lib/assistant/changes/plan.ts',{'@/lib/assistant/data/query':q});

const compras={key:'compras',label:'Productos comprados',description:'',title:'producto',columns:[{key:'fecha',label:'Fecha',kind:'date'},{key:'producto',label:'Producto'},{key:'proveedor',label:'Proveedor',filter:true},{key:'precio',label:'Precio unitario',kind:'money'},{key:'documento',label:'Documento',kind:'document'}],
 rows:[{_id:'l1',fecha:'2026-01-05',producto:'Leche entera',proveedor:'Mercadona',precio:0.95},{_id:'l2',fecha:'2026-03-01',producto:'Leche entera',proveedor:'Mercadona',precio:0.99},
  {_id:'l3',fecha:'2026-02-01',producto:'Jamón serrano',proveedor:'Mercadona',precio:12.5},{_id:'l4',fecha:'2026-02-10',producto:'Harina',proveedor:'Makro',precio:0.6}]};
const recetas={key:'plantilla:R',label:'Recetas',description:'',title:'ingrediente',columns:[{key:'receta',label:'Receta'},{key:'ingrediente',label:'Ingrediente'},{key:'cantidad',label:'Cantidad',kind:'number'}],
 rows:[{_id:'r1',receta:'Bocadillo',ingrediente:'jamon serrano',cantidad:0.1},{_id:'r2',receta:'Bechamel',ingrediente:'Leche entera',cantidad:0.5},{_id:'r3',receta:'Bechamel',ingrediente:'Mantequilla',cantidad:0.05}]};
const consumos={key:'consumos',label:'Consumo eléctrico',description:'',columns:[{key:'mes',label:'Mes'}],rows:[]};
const ctx={tables:[compras,recetas,consumos],types:[{tableKey:'compras',typeKey:'invoice_line',editable:false},{tableKey:'plantilla:R',typeKey:'doc_recetas',editable:false}],links:[],typeKeys:['invoice','invoice_line','company','doc_recetas']};

const catalogo=[
 {op:'crear_tabla',tabla:'catalogo',nombre:'Catálogo de productos',titulo:'producto',columnas:[{columna:'producto',nombre:'Producto',tipo:'texto'},{columna:'proveedor',nombre:'Proveedor',tipo:'texto'},{columna:'precio',nombre:'Último precio',tipo:'importe'},{columna:'ultima_compra',nombre:'Última compra',tipo:'fecha'}]},
 {op:'volcar_consulta',tabla:'catalogo',consulta:{tabla:'compras',agrupar_por:['producto','proveedor'],calcular:[{funcion:'ultimo',columna:'precio',segun:'fecha',nombre:'precio'},{funcion:'max',columna:'fecha',nombre:'ultima'}]},columnas:{producto:'producto',proveedor:'proveedor',precio:'precio',ultima_compra:'ultima'},clave:['producto','proveedor']},
 {op:'añadir_columnas',tabla:'plantilla:R',columnas:[{columna:'producto',nombre:'Producto del catálogo',tipo:'enlace',tabla_enlazada:'catalogo'}]},
 {op:'enlazar',tabla:'plantilla:R',columna:'producto',por:{columna_origen:'ingrediente',columna_destino:'producto'}},
];

test('catalog from purchases (last price per product and supplier) and recipe lines linked to it',()=>{
 const plan=p.planChanges(ctx,catalogo);
 assert.equal(plan.ok,true,plan.errores.join(' | '));
 assert.deepEqual(plan.cifras,{tablas:1,columnas:5,filas_nuevas:3,filas_cambiadas:0,enlaces:2,filas_borradas:0});
 const inserts=plan.acciones.filter(a=>a.k==='insertar');
 assert.deepEqual(inserts.map(a=>a.valores),[{producto:'Jamón serrano',proveedor:'Mercadona',precio:12.5,ultima_compra:'2026-02-01'},{producto:'Leche entera',proveedor:'Mercadona',precio:0.99,ultima_compra:'2026-03-01'},{producto:'Harina',proveedor:'Makro',precio:0.6,ultima_compra:'2026-02-10'}]);
 const links=plan.acciones.filter(a=>a.k==='enlazar');
 assert.deepEqual(links.map(a=>[a.ref,a.destino]),[['r1',inserts[0].ref],['r2',inserts[1].ref]],'accents and case ignored; new rows referenced before they exist');
 assert.deepEqual(plan.acciones.filter(a=>a.k==='enlace'),[{k:'enlace',tabla:'plantilla:R',columna:'producto',nombre:'Producto del catálogo',destino:'tabla:catalogo',completar:false}]);
 assert.match(plan.pasos[3].avisos[0],/1 fila sin pareja/,'Mantequilla is not in the catalog');
 assert.equal(plan.pasos[3].muestra.filas[0].producto,'Jamón serrano','the sample shows the linked name');
});

test('running it again with the same key only updates what changed (prices refreshed, nothing duplicated)',()=>{
 const first=p.planChanges(ctx,catalogo.slice(0,2));
 const ids=Object.fromEntries(first.acciones.filter(a=>a.k==='insertar').map((a,i)=>[a.ref,`c${i+1}`]));
 const saved={key:'tabla:catalogo',label:'Catálogo de productos',description:'',title:'producto',columns:[{key:'producto',label:'Producto'},{key:'proveedor',label:'Proveedor'},{key:'precio',label:'Último precio',kind:'money'},{key:'ultima_compra',label:'Última compra',kind:'date'}],
  rows:[{_id:'c1',producto:'Leche entera',proveedor:'Mercadona',precio:0.9,ultima_compra:'2026-01-05'},{_id:'c2',producto:'Jamón serrano',proveedor:'Mercadona',precio:12.5,ultima_compra:'2026-02-01'}]};
 const ctx2={...ctx,tables:[...ctx.tables,saved],types:[...ctx.types,{tableKey:'tabla:catalogo',typeKey:'catalogo',editable:true,fieldTypes:{producto:'text',proveedor:'text',precio:'decimal',ultima_compra:'date'}}],typeKeys:[...ctx.typeKeys,'catalogo']};
 const again=p.planChanges(ctx2,[catalogo[1]]);
 assert.equal(again.ok,true,again.errores.join(' | '));
 assert.deepEqual(again.cifras,{tablas:0,columnas:0,filas_nuevas:1,filas_cambiadas:1,enlaces:0,filas_borradas:0});
 assert.deepEqual(again.acciones.find(a=>a.k==='actualizar'),{k:'actualizar',tabla:'tabla:catalogo',ref:'c1',valores:{precio:0.99,ultima_compra:'2026-03-01'}});
 assert.match(again.pasos[0].texto,/1 fila nueva, 1 fila actualizada, 1 ya estaba igual/);
 assert.ok(ids);
});

test('rows given one by one: values coerced in Spanish, links by name, update and delete by filters',()=>{
 const plan=p.planChanges(ctx,[
  catalogo[0],
  {op:'crear_filas',tabla:'catalogo',filas:[{producto:'Aceite',proveedor:'Makro',precio:'1.234,50',ultima_compra:'31/12/2026'}]},
  {op:'crear_tabla',tabla:'Ingredientes',nombre:'Ingredientes de receta',titulo:'nombre',columnas:[{columna:'nombre',nombre:'Nombre',tipo:'texto'},{columna:'gramos',nombre:'Gramos',tipo:'entero'},{columna:'producto',nombre:'Producto',tipo:'enlace',tabla_enlazada:'tabla:catalogo'}]},
  {op:'crear_filas',tabla:'ingredientes',filas:[{nombre:'Aceite para freír',gramos:'50',producto:'aceite'},{nombre:'Sal',gramos:5,producto:'Sal fina'}]},
  {op:'actualizar_filas',tabla:'catalogo',donde:[{columna:'producto',op:'=',valor:'Aceite'}],valores:{precio:2}},
  {op:'borrar_filas',tabla:'ingredientes',donde:[{columna:'nombre',op:'=',valor:'Sal'}]},
 ]);
 assert.equal(plan.ok,true,plan.errores.join(' | '));
 const ins=plan.acciones.filter(a=>a.k==='insertar');
 assert.deepEqual(ins[0].valores,{producto:'Aceite',proveedor:'Makro',precio:1234.5,ultima_compra:'2026-12-31'});
 assert.deepEqual(ins[1].valores,{nombre:'Aceite para freír',gramos:50});
 assert.deepEqual(plan.acciones.filter(a=>a.k==='enlazar').map(a=>[a.ref,a.destino]),[[ins[1].ref,ins[0].ref]]);
 assert.match(plan.pasos[3].avisos[0],/«Sal fina» no está en la tabla enlazada/);
 assert.deepEqual(plan.acciones.find(a=>a.k==='actualizar'),{k:'actualizar',tabla:'tabla:catalogo',ref:ins[0].ref,valores:{precio:2}});
 assert.deepEqual(plan.acciones.filter(a=>a.k==='borrar').map(a=>a.ref),[ins[2].ref]);
});

test('clear refusals: no rows or plain columns in tables not created with the assistant, no duplicates, bad values',()=>{
 const err=ops=>p.planChanges(ctx,ops).errores[0];
 assert.match(err([{op:'crear_filas',tabla:'compras',filas:[{producto:'x'}]}]),/no se creó con el asistente/);
 assert.match(err([{op:'añadir_columnas',tabla:'compras',columnas:[{columna:'nota',nombre:'Nota',tipo:'texto'}]}]),/solo admite columnas de enlace/);
 assert.match(err([{op:'crear_tabla',tabla:'company',nombre:'x',titulo:'a',columnas:[{columna:'a',nombre:'A',tipo:'texto'}]}]),/ya existe una tabla/);
 assert.match(err([{op:'crear_tabla',tabla:'t',nombre:'T',titulo:'n',columnas:[{columna:'n',nombre:'N',tipo:'numero'}]}]),/«titulo» debe ser/);
 assert.match(err([catalogo[0],{op:'crear_filas',tabla:'catalogo',filas:[{precio:'mucho'}]}]),/no es un valor válido/);
 assert.match(err([catalogo[0],{op:'crear_filas',tabla:'catalogo',filas:[{color:'rojo'}]}]),/no tiene la columna «color»/);
 assert.match(err([{op:'añadir_columnas',tabla:'plantilla:R',columnas:[{columna:'m',nombre:'M',tipo:'enlace',tabla_enlazada:'consumos'}]}]),/no tiene una columna que nombre|calculada/);
 assert.match(err([{op:'enlazar',tabla:'plantilla:R',columna:'producto',por:{columna_origen:'ingrediente',columna_destino:'producto'}}]),/no tiene la columna de enlace/);
 assert.equal(p.planChanges(ctx,[]).ok,false);
 assert.deepEqual([p.coerce('0,5','decimal'),p.coerce('3','integer'),p.coerce('2,5','integer'),p.coerce('sí','boolean'),p.coerce('2026-02-30','date')].map(x=>x.ok?x.value:'X'),[0.5,3,'X',true,'X']);
});

test('link by similar names (invoice descriptions are never exactly the ingredient) and query results mapped by name',()=>{
 const m=(n,c,mode)=>p.bestMatch(n,c.map((t,i)=>({id:`c${i}`,text:t})),mode);
 const catalog=['KEN LECHE ENTERA B·I·BOX 10 LTS.','LECHE ENTERA P6','LECHE ENTERA S/LACT','AZUCAR BLANCA S/25 KGS.','NUECES U.S.A CP/1500 G.','KEN NATA 35% UHT BT/1 LT.'];
 assert.deepEqual(m('Leche entera',catalog,'contiene'),{id:'c1'},'fewest extra words wins');
 assert.deepEqual(m('azúcar',catalog,'contiene'),{id:'c3'});
 assert.deepEqual(m('nata',catalog,'contiene'),{id:'c5'});
 assert.equal('id' in m('mantequilla',catalog,'parecido'),false);
 assert.deepEqual(m('nuez',['NUECES U.S.A'],'parecido'),{missing:true,ambiguous:false},'different words are not forced');
 assert.deepEqual(m('leche',['LECHE A','LECHE B'],'contiene'),{missing:false,ambiguous:true});
 const cat={key:'tabla:catalogo',label:'Catálogo',description:'',title:'producto',columns:[{key:'producto',label:'Producto'},{key:'proveedor',label:'Proveedor'},{key:'precio',label:'Precio',kind:'money'},{key:'fecha',label:'Fecha',kind:'date'}],
  rows:catalog.map((t,i)=>({_id:`c${i}`,producto:t,proveedor:'X',precio:1,fecha:null}))};
 const ctx2={...ctx,tables:[...ctx.tables,cat],types:[...ctx.types,{tableKey:'tabla:catalogo',typeKey:'catalogo',editable:true,fieldTypes:{producto:'text',proveedor:'text',precio:'decimal',fecha:'date'}}],typeKeys:[...ctx.typeKeys,'catalogo']};
 const plan=p.planChanges(ctx2,[
  {op:'añadir_columnas',tabla:'plantilla:R',columnas:[{columna:'producto',nombre:'Producto',tipo:'enlace',tabla_enlazada:'tabla:catalogo'}]},
  {op:'enlazar',tabla:'plantilla:R',columna:'producto',por:{columna_origen:'ingrediente',columna_destino:'producto',modo:'contiene'}},
 ]);
 assert.equal(plan.ok,true,plan.errores.join(' | '));
 assert.deepEqual(plan.acciones.filter(a=>a.k==='enlazar').map(a=>[a.ref,a.destino]),[['r2','c1']],'Leche entera → LECHE ENTERA P6; jamón and mantequilla not in this catalog');
 // volcar_consulta without «columnas»: result columns named like the table's.
 const v=p.planChanges(ctx,[catalogo[0],{op:'volcar_consulta',tabla:'catalogo',consulta:{tabla:'compras',agrupar_por:['producto','proveedor'],calcular:[{funcion:'ultimo',columna:'precio',segun:'fecha',nombre:'precio'},{funcion:'max',columna:'fecha',nombre:'ultima_compra'}]},clave:['producto','proveedor']}]);
 assert.equal(v.ok,true,v.errores.join(' | '));
 assert.equal(v.cifras.filas_nuevas,3);
 const bad=p.planChanges(ctx,[catalogo[0],{op:'volcar_consulta',tabla:'catalogo',consulta:{tabla:'compras',calcular:[{funcion:'cuenta'}]}}]);
 assert.match(bad.errores[0],/ninguna columna del resultado/);
});

test('equivalences table: one row per distinct ingredient, the sure ones linked, the rest left «por completar»',()=>{
 const recetas2={...recetas,rows:[...recetas.rows,{_id:'r4',receta:'Tostada',ingrediente:'Leche entera',cantidad:0.1}]};
 const ctx3={...ctx,tables:[compras,recetas2,consumos]};
 const plan=p.planChanges(ctx3,[
  catalogo[0],catalogo[1],
  {op:'crear_tabla',tabla:'equivalencias_ingredientes',nombre:'Equivalencias de ingredientes',titulo:'ingrediente',columnas:[{columna:'ingrediente',nombre:'Ingrediente',tipo:'texto'},{columna:'producto',nombre:'Producto del catálogo',tipo:'enlace',tabla_enlazada:'tabla:catalogo',completar:true}]},
  {op:'volcar_consulta',tabla:'equivalencias_ingredientes',consulta:{tabla:'plantilla:R',agrupar_por:['ingrediente']},columnas:{ingrediente:'ingrediente'},clave:['ingrediente']},
  {op:'enlazar',tabla:'equivalencias_ingredientes',columna:'producto',por:{columna_origen:'ingrediente',columna_destino:'producto',modo:'contiene'}},
 ]);
 assert.equal(plan.ok,true,plan.errores.join(' | '));
 assert.equal(plan.cifras.filas_nuevas,3+3,'3 catalog products + 3 distinct ingredients (Leche entera twice)');
 assert.equal(plan.cifras.enlaces,2,'jamon serrano and leche entera');
 assert.deepEqual(plan.pendientes,[{tabla:'tabla:equivalencias_ingredientes',nombreTabla:'Equivalencias de ingredientes',columna:'producto',nombreColumna:'Producto del catálogo',filas:1}]);
 assert.ok(plan.acciones.some(a=>a.k==='enlace'&&a.completar===true));
});
