import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n);},m,m.exports);return m.exports;}
const taxonomy=load('lib/knowledge/intake/classifier/taxonomy.ts');
const sets=load('lib/knowledge/intake/targets/field-sets.ts',{'../classifier/taxonomy':taxonomy});
const conv=load('lib/knowledge/intake/writer/convert.ts');
const c=load('lib/knowledge/intake/templates/contract.ts',{'../writer/convert':conv});
const pend=load('lib/knowledge/intake/templates/pending.ts',{'../targets/field-sets':sets,'./contract':c});

const nomina={nombre:'Nóminas',descripcion:'Una fila por nómina',appliesTo:{familia:'transaccion',tipo:'nomina',subtipo:null},varios:true,
 campos:[{key:'trabajador',label:'Trabajador',type:'text',description:'Nombre',identity:false,required:true},
  {key:'dni',label:'DNI',type:'text',description:'DNI del trabajador',identity:true,required:true},
  {key:'periodo',label:'Periodo',type:'text',description:'Mes',identity:true,required:true},
  {key:'fecha_pago',label:'Fecha de pago',type:'date',description:'',identity:false,required:false},
  {key:'bruto',label:'Total devengado',type:'decimal',description:'',identity:false,required:true},
  {key:'coste_empresa',label:'Coste empresa',type:'decimal',description:'',identity:false,required:false}],
 analitica:{sumar:true,categoria:'personal',importe:'coste_empresa',fecha:'fecha_pago',tercero:'trabajador'}};

test('template: validated and normalized (keys from labels, unique; sums need amount and date)',()=>{
 const ok=c.validateTemplate(nomina);assert.equal(ok.ok,true);assert.equal(ok.template.campos.length,6);
 const keys=c.validateTemplate({...nomina,campos:[{label:'Salario Bruto',type:'decimal'},{label:'Salario bruto',type:'decimal'},{label:'Año',type:'oops'}],analitica:{sumar:false}});
 assert.deepEqual(keys.template.campos.map(x=>[x.key,x.type]),[['salario_bruto','decimal'],['salario_bruto_2','decimal'],['ano','text']]);
 assert.match(c.validateTemplate({...nomina,analitica:{...nomina.analitica,importe:'trabajador'}}).error,/importe/,'the amount must be a decimal column');
 assert.equal(c.validateTemplate({...nomina,campos:[]}).ok,false);assert.equal(c.validateTemplate({...nomina,nombre:' '}).ok,false);
 assert.equal(c.objectTypeKey('Recibos de alquiler'),'doc_recibos_de_alquiler');
});

test('template plans: only the parts of its type, with its columns as a list',()=>{
 const part=(id,tipo,pages)=>({id,tipo,familia:'transaccion',subtipo:null,bloques:pages.map(p=>({pagina:p,desde:1,hasta:2})),destino:'engine',confianza:'alta'});
 const plans=c.templatePlans(c.validateTemplate(nomina).template,'T1',[part('p1','nomina',[1]),part('p2','factura',[2]),part('p3','nomina',[3,4])]);
 assert.deepEqual(plans.map(p=>[p.parte.id,p.paginas,p.modo]),[['p1',[1],'dirigida'],['p3',[3,4],'dirigida']]);
 assert.equal(plans[0].entidades[0].cardinality,'many');assert.equal(plans[0].entidades[0].fields.find(f=>f.key==='dni').identifier,true);
});

test('records: typed values with evidence; identity key when complete, otherwise document+part+row',()=>{
 const t=c.validateTemplate(nomina).template;
 const v=(valor,pagina=1)=>({valor,pagina});
 const rows=[{trabajador:v('María A.'),dni:v('31.246.253-V'),periodo:v('MAYO 2026'),fecha_pago:v('31/05/2026'),bruto:v('1.234,56'),coste_empresa:v('1.640,10')},
  {trabajador:v('Jesús'),dni:v(null,null),periodo:v('MAYO 2026'),fecha_pago:v('fin de mes'),bruto:v('980,00'),coste_empresa:v(null,null)},
  {trabajador:v(null,null),dni:v(null,null),periodo:v(null,null),fecha_pago:v(null,null),bruto:v(null,null),coste_empresa:v(null,null)}];
 const recs=c.templateRecords(t,rows,{fileHash:'abc',parteId:'p1'});
 assert.equal(recs.length,2,'empty rows are not records');
 assert.deepEqual(recs[0].values,{trabajador:'María A.',dni:'31.246.253-V',periodo:'MAYO 2026',fecha_pago:'2026-05-31',bruto:'1234.56',coste_empresa:'1640.10'});
 assert.equal(recs[0].externalKey,'id:31.246.253-V|MAYO2026');
 assert.equal(recs[1].externalKey,'doc:abc:p1:2');
 assert.deepEqual(recs[1].noConvertidos.map(n=>n.campo),['fecha_pago']);
 assert.equal(recs[0].evidencias.find(e=>e.campo==='bruto').impreso,'1.234,56');
});

test('pending: types without a reviewed field set, grouped, with the progress of their template',()=>{
 const part=(id,tipo,extra={})=>({id,tipo,familia:'transaccion',subtipo:null,bloques:[{pagina:1,desde:1,hasta:2}],destino:'engine',confianza:'alta',...extra});
 const docs=[{importId:'I1',importFileId:'F1',archivo:'Nominas mayo.pdf',partes:[part('p1','nomina'),part('p2','nomina')]},
  {importId:'I1',importFileId:'F2',archivo:'alquiler.pdf',partes:[part('p1','recibo_pago')]},
  {importId:'I2',importFileId:'F3',archivo:'factura.pdf',partes:[part('p1','factura',{subtipo:'compra_articulos'}),part('p2','condiciones_legales',{familia:'texto',destino:'knowledge'})]},
  {importId:'I2',importFileId:'F4',archivo:'Nomina Jesus.pdf',partes:[part('p1','nomina')]},
  {importId:'I2',importFileId:'F5',archivo:'dudosa.pdf',partes:[part('p1','factura',{subtipo:'compra_articulos',confianza:'baja'})]}];
 const tpl={id:'T1',nombre:'Nóminas',version:2,definition:c.validateTemplate(nomina).template};
 const states=new Map([['T1|F1',{status:'completed',version:2,records:2,error:null}],['T1|F4',{status:'completed',version:1,records:1,error:null}]]);
 const g=pend.pendingGroups(docs,[tpl],states);
 assert.deepEqual(g.map(x=>[x.label,x.documentos.length,x.plantilla?.nombre??null]),[['Nómina',2,'Nóminas'],['Recibo de pago',1,null]],'invoices, text and low-confidence invoices are not new types');
 assert.deepEqual(g[0].documentos.map(d=>[d.archivo,d.partes,d.estado,d.registros]),[['Nominas mayo.pdf',2,'procesado',2],['Nomina Jesus.pdf',1,'pendiente',0]],'an older template version is pending again');
});

test('proposal: from the documents\' text, strict schema, validated; a proposal that cannot add up is kept without the sum',async()=>{
 const p=load('lib/knowledge/intake/templates/propose.ts',{'@/lib/ai/openai':{getOpenAIClient:()=>({}),getKnowledgeImportModel:()=>'gpt-5-mini'},'../targets/field-sets':sets,'./contract':c});
 let req;const answer={nombre:'Recibos de alquiler',descripcion:'x',varios:false,campos:[{key:'importe',label:'Importe',type:'decimal',description:'',identity:false,required:true},{key:'fecha',label:'Fecha',type:'date',description:'',identity:false,required:true},{key:'numero',label:'Número',type:'text',description:'',identity:true,required:false}],
  analitica:{sumar:true,categoria:'alquiler',importe:'importe',fecha:'fecha',tercero:null}};
 const client=()=>({responses:{create:async r=>{req=r;return{status:'completed',output_text:JSON.stringify(answer)};}}});
 const t=await p.proposeTemplate({familia:'transaccion',tipo:'recibo_pago',subtipo:null,samples:[{archivo:'a.pdf',texto:'RECIBO ALQUILER LOCAL 1.200,00'}]},{client,model:()=>'gpt-5-mini'});
 assert.equal(t.nombre,'Recibos de alquiler');assert.deepEqual(t.appliesTo,{familia:'transaccion',tipo:'recibo_pago',subtipo:null});assert.equal(t.analitica.categoria,'alquiler');
 assert.equal(req.text.format.strict,true);assert.match(req.input[0].content[0].text,/RECIBO ALQUILER/);assert.doesNotMatch(req.instructions,/Plocia|Gesfinova/);
 const bad=()=>({responses:{create:async()=>({status:'completed',output_text:JSON.stringify({...answer,analitica:{...answer.analitica,importe:'numero'}})})}});
 assert.equal((await p.proposeTemplate({familia:'transaccion',tipo:'recibo_pago',subtipo:null,samples:[{archivo:'a',texto:'x'}]},{client:bad,model:()=>'m'})).analitica.sumar,false);
 await assert.rejects(p.proposeTemplate({familia:'t',tipo:'x',subtipo:null,samples:[]},{client,model:()=>'m'}),/ejemplo/);
 assert.equal(p.partText([{numero:1,bloques:[{tipo:'texto',texto:'hola'}]},{numero:2,bloques:[{tipo:'texto',texto:'no'}]}],[1]),'[página 1]\nhola');
});
