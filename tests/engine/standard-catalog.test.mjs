import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const catalog=load('lib/engine/catalog/standard-catalog.ts');
const sql=load('lib/engine/catalog/standard-catalog-sql.ts',{'./standard-catalog':catalog});
const taxonomy=load('lib/knowledge/intake/classifier/taxonomy.ts');
const sets=load('lib/knowledge/intake/targets/field-sets.ts',{'../classifier/taxonomy':taxonomy});
const {STANDARD_TYPES:types,STANDARD_RELATIONS:relations,FIELD_SET_MAPPING:mapping}=catalog;
const byKey=new Map(types.map(t=>[t.key,t]));

test('types and relations are well formed: unique keys, known field types, existing endpoints',()=>{
 assert.equal(byKey.size,types.length,'unique type keys');
 for(const t of types){
  const keys=t.fields.map(f=>f.key);assert.equal(new Set(keys).size,keys.length,`unique fields in ${t.key}`);
  for(const f of t.fields){assert.match(f.key,/^[a-z][a-z0-9_]*$/);assert.ok(['text','long_text','integer','decimal','date','boolean'].includes(f.type),`${t.key}.${f.key}`);assert.ok(f.name);}
  assert.ok(t.name&&t.description);
 }
 assert.equal(new Set(relations.map(r=>r.key)).size,relations.length,'unique relation keys');
 for(const r of relations){assert.ok(byKey.has(r.from)&&byKey.has(r.to),r.key);assert.ok(['one_to_one','one_to_many','many_to_many'].includes(r.cardinality));}
 assert.ok(byKey.has('company')&&!byKey.has('organization'),'companies are "company"; "organization" is left untouched');
});

// Published global catalog seen in the user's database (2026-10-27): existing fields must keep their type,
// otherwise the SQL stops without changing anything.
const PUBLISHED={
 contact:'full_name:text, first_name:text, last_name:text, email:text, phone:text, role:text',
 invoice:'invoice_number:text, issue_date:date, due_date:date, currency:text, net_amount:decimal, tax_amount:decimal, total_amount:decimal, payment_terms:text, reference:text, notes:long_text, payment_method:text',
 invoice_line:'line_number:integer, description:long_text, quantity:decimal, unit:text, unit_price:decimal, discount_amount:decimal, tax_rate:decimal, line_total:decimal',
 payment:'payment_reference:text, payment_date:date, amount:decimal, currency:text, method:text, status:text, notes:long_text',
 product:'sku:text, name:text, description:long_text, kind:text, unit:text, base_price:decimal, tax_rate:decimal',
};
test('existing published types are only extended: every published field is kept with the same type',()=>{
 for(const [key,list] of Object.entries(PUBLISHED)){
  const t=byKey.get(key);assert.ok(t,key);
  for(const item of list.split(', ')){const [field,type]=item.split(':');const mine=t.fields.find(f=>f.key===field);
   assert.ok(mine,`${key}.${field} kept`);assert.equal(mine.type,type,`${key}.${field} keeps its type`);}
 }
});

test('every field the extraction produces has a home in the catalog',()=>{
 for(const set of sets.FIELD_SETS)for(const entity of set.entities){
  assert.ok(byKey.has(entity.catalogType),`${set.id}.${entity.role} → ${entity.catalogType}`);
  for(const field of entity.fields){
   const target=mapping[entity.role]?.[field.key];
   assert.ok(target,`mapping for ${entity.role}.${field.key}`);
   assert.ok(byKey.get(target.type)?.fields.some(f=>f.key===target.field),`${entity.role}.${field.key} → ${target.type}.${target.field}`);
  }
 }
});

test('the committed SQL is the one generated from the catalog file (run npm run engine:standard-catalog-sql)',()=>{
 assert.equal(readFileSync('scripts/neon/20261027_standard_catalog.sql','utf8'),sql.standardCatalogSql());
 const text=sql.standardCatalogSql();
 assert.doesNotMatch(text,/engine_records\s+(SET|WHERE)|DELETE|DROP|TRUNCATE|ALTER/i,'never touches records nor schema');
 assert.match(text,/ON CONFLICT \(object_type_id, key\) DO NOTHING/);assert.match(text,/NO se cambia/);
});
