import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const module = { exports: {} };
new Function('module','exports',ts.transpileModule(readFileSync('lib/knowledge/intake/contract.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports);
const { identify, classify, deliver } = module.exports;
const sources = [{id:'a',archivo:'factura.pdf',texto:'Factura\nProducto A | 2\nProducto B | 1'}, {id:'b',archivo:'condiciones.txt',texto:'Tarifa\nAplicable desde enero'}];
const identification = {unidades:[{fuenteId:'a',tipo:'factura',inicio:1,fin:3},{fuenteId:'b',tipo:'tarifa',inicio:1,fin:2}]};
test('batch preserves source text and hybrid identity without transcribing tables',()=> {
 const units=identify(identification,sources);
 const classified=classify({unidades:[{id:'unidad-1',destino:'engine',contenidosDetectados:['desglose de compra']},{id:'unidad-2',destino:'hibrido',contenidosDetectados:['condiciones']}]},units);
 const result=deliver('batch',sources,units,classified);
 assert.equal(result.unidades[0].contenido.texto,sources[0].texto);
 assert.deepEqual(result.unidades[0].contenidosDetectados,['desglose de compra']);
 assert.equal('tablas' in result.unidades[0].contenido,false);
 assert.equal(result.unidades[1].destino,'hibrido');
 assert.equal(result.unidades.length,2);
});
test('rejects omitted files, gaps, overlap and fabricated source references',()=> {
 for (const unidades of [identification.unidades.slice(0,1),[{...identification.unidades[0],inicio:2},identification.unidades[1]], [...identification.unidades,identification.unidades[0]], [{...identification.unidades[0],fuenteId:'inventado'}]]) assert.throws(()=>identify({unidades},sources));
});
test('rejects missing/duplicate classifications and malformed rows',()=> {
 const units=identify(identification,sources);
 const u={id:'unidad-1',destino:'engine',contenidosDetectados:['condiciones']};
 assert.throws(()=>classify({unidades:[u]},units));
 assert.throws(()=>classify({unidades:[u,u]},units));
 assert.throws(()=>classify({unidades:[{...u,tablas:[{tipo:'detalle',columnas:['a'],filas:[[1,2]]}]},{id:'unidad-2',destino:'knowledge',contenidosDetectados:['condiciones']}]},units));
});
test('single document uses exactly the same contract',()=> {
 const units=identify({unidades:identification.unidades.slice(0,1)},sources.slice(0,1));
 assert.equal(units.length,1);
});
