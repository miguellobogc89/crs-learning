import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const taxonomy=load('lib/knowledge/intake/classifier/taxonomy.ts');
const sets=load('lib/knowledge/intake/targets/field-sets.ts',{'../classifier/taxonomy':taxonomy});
const roles=r=>r.entities.map(e=>e.role);
const field=(r,role,key)=>r.entities.find(e=>e.role===role)?.fields.find(x=>x.key===key);

test('every field set targets a type and subtypes that exist in the classifier taxonomy',()=>{
 for(const s of sets.FIELD_SETS){
  for(const sub of s.appliesTo.subtipos) assert.equal(taxonomy.checkTaxonomy(s.appliesTo.familia,s.appliesTo.tipo,sub,''),null,`${s.id}: ${sub}`);
  for(const parent of s.extends??[]) assert.ok(sets.FIELD_SETS.some(x=>x.id===parent),`${s.id} extends unknown ${parent}`);
 }
});
test('keys are snake_case, unique per entity, and a refinement never retypes an inherited field',()=>{
 for(const s of sets.FIELD_SETS) for(const e of s.entities){
  const keys=e.fields.map(f=>f.key);assert.equal(new Set(keys).size,keys.length,`${s.id}.${e.role}`);
  for(const k of keys) assert.match(k,/^[a-z][a-z0-9_]*$/);
 }
 for(const s of sets.FIELD_SETS) for(const sub of s.appliesTo.subtipos){
  const r=sets.resolveFieldSet(s.appliesTo.familia,s.appliesTo.tipo,sub);
  for(const e of r.entities){const keys=e.fields.map(f=>f.key);assert.equal(new Set(keys).size,keys.length);}
 }
});
test('each subtype resolves to its most specific set, composed with what it extends',()=>{
 assert.deepEqual(sets.resolveFieldSet('transaccion','factura','suministro_electricidad').ids,['factura_nucleo','factura_suministro','factura_electricidad']);
 assert.deepEqual(sets.resolveFieldSet('transaccion','factura','telecomunicaciones').ids,['factura_nucleo','factura_suministro','factura_telecomunicaciones']);
 assert.deepEqual(sets.resolveFieldSet('transaccion','factura','suministro_gas').ids,['factura_nucleo','factura_suministro']);
 assert.deepEqual(sets.resolveFieldSet('transaccion','factura','compra_articulos').ids,['factura_nucleo','factura_compra_articulos']);
 assert.deepEqual(sets.resolveFieldSet('transaccion','factura','factura_simplificada').ids,['ticket'],'tickets do not inherit the full invoice core');
 assert.deepEqual(sets.resolveFieldSet('transaccion','factura','servicios_profesionales').ids,['factura_nucleo']);
 assert.deepEqual(sets.resolveFieldSet('transaccion','factura',null).ids,['factura_nucleo'],'undetermined subtype: core only');
 assert.equal(sets.resolveFieldSet('operacion','receta_escandallo',null),null,'no set yet: full reading');
 assert.equal(sets.resolveFieldSet('otro','otro',null),null);
});
test('entities carry roles for future relations, and matching identifiers are marked',()=>{
 const elec=sets.resolveFieldSet('transaccion','factura','suministro_electricidad');
 assert.deepEqual(roles(elec),['invoice','issuer','recipient','tax_breakdown','supply','charges','power','consumption','meter_readings']);
 assert.equal(elec.entities.find(e=>e.role==='issuer').catalogType,'organization');
 assert.ok(field(elec,'issuer','tax_id').identifier&&field(elec,'issuer','tax_id').required,'issuer tax id is the key to reuse the company');
 assert.ok(field(elec,'supply','supply_point_id').identifier&&field(elec,'supply','supply_point_id').required);
 assert.ok(field(elec,'invoice','invoice_number').identifier);
 assert.equal(elec.entities.find(e=>e.role==='recipient').matchesWorkspaceCompany,true);
 const buy=sets.resolveFieldSet('transaccion','factura','compra_articulos');
 assert.ok(field(buy,'lines','product_reference').identifier);
 assert.ok(field(buy,'invoice','order_or_ticket_number'),'refinements add fields to the inherited invoice entity');
 assert.equal(buy.entities.filter(e=>e.role==='invoice').length,1);
 const ticket=sets.resolveFieldSet('transaccion','factura','factura_simplificada');
 assert.equal(ticket.entities.find(e=>e.role==='recipient').required,false);
 assert.equal(field(ticket,'issuer','tax_id').required,false);
 assert.ok(ticket.entities.find(e=>e.role==='lines').required);
});
test('no field asks for computed values, and boilerplate stays excluded',()=>{
 for(const s of sets.FIELD_SETS) for(const e of s.entities) for(const x of e.fields) assert.doesNotMatch(x.description,/\b(calcular|calcula (el|la|los|las)|deducir|inferir|estimar)\b/i,`${s.id}.${e.role}.${x.key}`);
 for(const word of ['fax','redes sociales','Registro Mercantil','protección de datos']) assert.ok(sets.EXCLUDED_CONTENT.some(c=>c.includes(word)),word);
 const all=JSON.stringify(sets.FIELD_SETS);assert.doesNotMatch(all,/Mercadona|Toldos|O2|IGNIS|Leroy/,'sector and supplier neutral');
});
