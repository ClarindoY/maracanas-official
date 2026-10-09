import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitPages,consolidateParts} from '../server/summary-parts.mjs';
import {validateSummary} from '../server/summary.mjs';
test('divisão automática não perde caracteres, mantém páginas e sobrepõe trechos longos',()=>{
 const text='Clausula do edital sem modificacao. '.repeat(8000);const original={documentId:'d',name:'edital.pdf',page:51,text};const parts=splitPages([original]);assert.ok(parts.length>1);assert.ok(parts.every(p=>p.reduce((n,x)=>n+x.text.length,0)<=48000));assert.ok(parts.flat().every(p=>p.documentId==='d'&&p.page===51));let joined=parts[0][0].text;for(const part of parts.slice(1))joined+=part[0].text.slice(900);assert.equal(joined,text);
});
test('consolidação conserva valores diferentes e referências; duplicatas e invenções descartadas',()=>{
 const page1={documentId:'d',page:1,text:'Quantidade inicial: 120 participantes.'},page2={documentId:'d',page:99,text:'Retificacao: 180 participantes.'};
 const field=p=>({fields:[{label:'b3_2',value:p.text,evidence:[{documentId:p.documentId,page:p.page,quote:p.text}]}]});const a=validateSummary(field(page1),[page1]),b=validateSummary(field(page2),[page2]);const out=consolidateParts([a,a,b]);const f=out.fields.find(f=>f.label==='b3_2');assert.match(f.value,/120/);assert.match(f.value,/180/);assert.equal(f.evidence.length,2);assert.match(f.note,/divergências/);
 const forged=validateSummary({fields:[{label:'b3_2',value:'999 participantes',evidence:[{documentId:'d',page:1,quote:page1.text}]}]},[page1]);assert.equal(consolidateParts([forged]).fields.find(f=>f.label==='b3_2').value,null);
});
test('checklist longo não é cortado silenciosamente na validação',()=>{
 const text='Exigir documento fiscal e comprovacao de regularidade. '.repeat(300);const out=validateSummary({fields:[{label:'b2_1',value:text,evidence:[{documentId:'d',page:1,quote:text}]}]},[{documentId:'d',page:1,text}]);assert.equal(out.fields.find(f=>f.label==='b2_1').value,text);
});
