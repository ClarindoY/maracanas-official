import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openAuth,permissions} from '../server/auth.mjs';
import {openWorkspace} from '../server/workspace.mjs';
import {validateSummary,summarize} from '../server/summary.mjs';
import {SUMMARY_FIELDS,EXTERNAL_FIELDS,pricingScenario} from '../shared/summary-catalog.mjs';
import {makeBackup} from '../server/backups.mjs';
test('criador imutável, concorrência, permissões, arquivos isolados e trilha antes/depois',()=>{
 const dir=mkdtempSync(join(tmpdir(),'work-'));const auth=openAuth(join(dir,'auth.sqlite'));for(const id of ['a','b','c'])auth.db.prepare('INSERT INTO users(id,name,login,email,password,permissions) VALUES(?,?,?,?,?,?)').run(id,id,id,id+'@test.test','unused',JSON.stringify(id==='c'?[]:permissions));
 const a={id:'a',nome:'Alice',permissoes:permissions},b={id:'b',nome:'Bruno',permissoes:permissions},c={id:'c',nome:'Carol',permissoes:[]};const w=openWorkspace(auth,join(dir,'docs'));
 try{const t=w.create(a,{titulo:'Edital original',fonte:'Importação',creatorId:'b'});assert.equal(t.creatorId,'a');assert.throws(()=>w.create(c,{titulo:'negado'}),e=>e.status===403);
 const next=w.patch(b,t.id,{version:1,changes:{titulo:'Título revisado',responsibleId:'b',collaborators:['a','b']}});assert.equal(next.version,2);assert.equal(next.creatorId,'a');assert.throws(()=>w.patch(a,t.id,{version:1,changes:{titulo:'Sobrescrever'}}),e=>e.status===409);assert.throws(()=>w.patch(c,t.id,{version:2,changes:{etapa:4}}),e=>e.status===403);
 const d=w.upload(a,t.id,'edital.pdf',Buffer.from('%PDF-1.7\nteste'));const other=w.create(a,{titulo:'Outra licitação'});assert.throws(()=>w.document(a,other.id,d.id),e=>e.status===404);assert.throws(()=>w.patch(a,other.id,{version:1,changes:{proposalDocuments:[d.id]}}),e=>e.status===400);assert.throws(()=>w.document(c,t.id,d.id),e=>e.status===403);assert.throws(()=>w.upload(a,t.id,'ata.pdf',Buffer.from('malicioso')),e=>e.status===400);
 w.comment(b,t.id,'Trabalho conjunto');assert.equal(w.detail(a,t.id).comments[0].name,'Bruno');const ev=auth.db.prepare("SELECT * FROM activity WHERE action='Ficha alterada'").get();assert.equal(JSON.parse(ev.details).titulo.before,'Edital original');assert.equal(JSON.parse(ev.details).titulo.after,'Título revisado');
 const review={technical:'',documentary:'',operational:'',financial:'',conclusion:'Recomendada',reason:'Sem validação'};assert.throws(()=>w.patch(a,t.id,{version:2,changes:{analysis:{pricing:[],tasks:[],review}}}),e=>e.status===400);review.conclusion='Condicionada';const analysed=w.patch(a,t.id,{version:2,changes:{analysis:{pricing:[],tasks:[{text:'Confirmar hotel',owner:'b',due:'2026-12-01',status:'Aberta'}],review}}});assert.equal(analysed.analysis.tasks[0].owner,'b');
 const backup=makeBackup(auth,w.dir,join(dir,'backups'),true);assert.ok(readFileSync(join(dir,'backups',backup,'auth.sqlite')).length);assert.equal(readdirSync(join(dir,'backups',backup,'documents')).length,1);
 }finally{auth.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('resumo descarta informações sem trecho exato e página correta',()=>{
 const pages=[{documentId:'d',page:1,text:'Valor estimado R$ 100.000,00. Prazo: 29/29/2026.'}];
 const out=validateSummary({fields:[{label:'Valores',value:'R$ 100.000,00',evidence:[{documentId:'d',page:1,quote:'Valor estimado R$ 100.000,00.'}]},{label:'Datas e prazos',value:'29/09/2026',evidence:[{documentId:'d',page:1,quote:'Prazo: 29/09/2026.'}]}]},pages);
 assert.equal(out.fields.find(x=>x.label==='Valores').value,'R$ 100.000,00');assert.equal(out.fields.find(x=>x.label==='Datas e prazos').value,null);assert.equal(out.fields.find(x=>x.label==='Objeto').value,null);
});

test('oito blocos completos, dados externos vazios e simulação sem custos fictícios',()=>{
 const pages=[{documentId:'d',page:1,text:'Estimativa global de R$ 100.000,00 para hospedagem.'}];
 const fields=SUMMARY_FIELDS.map(f=>({label:f.id,value:null,evidence:[]}));
 fields.find(f=>f.label==='b1_5').value='R$ 100.000,00';fields.find(f=>f.label==='b1_5').evidence=[{documentId:'d',page:1,quote:pages[0].text}];
 fields.find(f=>f.label==='b4_3').value='R$ 100.000,00';fields.find(f=>f.label==='b4_3').evidence=[{documentId:'d',page:1,quote:pages[0].text}];
 const out=validateSummary({fields},pages);assert.equal(out.fields.length,SUMMARY_FIELDS.length);assert.equal(out.fields.find(f=>f.label==='b1_5').value,'R$ 100.000,00');assert.equal(out.fields.find(f=>f.label==='b4_3').value,null);
 assert.equal(pricingScenario([{quantity:1,unitPrice:100,unitCost:null,taxPercent:0,indirectCost:0}],0),null);
 const r=pricingScenario([{name:'diárias',quantity:10,unitPrice:100,unitCost:50,taxPercent:10,indirectCost:100,disputable:true},{name:'fixo',quantity:1,unitPrice:200,unitCost:100,taxPercent:0,indirectCost:0,disputable:false}],10);
 assert.equal(r.revenue,1100);assert.equal(r.tax,90);assert.equal(r.profit,310);assert.ok(Math.abs(r.breakEven-766.6666666667)<0.001);
});

function simplePdf(){const stream='BT /F1 12 Tf 20 100 Td (Objeto: hospedagem e servicos de hotelaria para participantes.) Tj ET';const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'];let out='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}const xref=Buffer.byteLength(out);out+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return Buffer.from(out);}
test('análise de PDF com API simulada salva todos os blocos e preserva resumo após falha',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'summary-'));const auth=openAuth(join(dir,'auth.sqlite'));auth.db.prepare('INSERT INTO users(id,name,login,email,password,permissions) VALUES(?,?,?,?,?,?)').run('a','Alice','alice','a@test.test','unused',JSON.stringify(permissions));const u={id:'a',nome:'Alice',permissoes:permissions},w=openWorkspace(auth,join(dir,'docs')),key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='mock-only';
 try{const t=w.create(u,{titulo:'Teste completo'}),d=w.upload(u,t.id,'edital.pdf',simplePdf());let calls=0;
 const mock=async(url,request)=>{calls++;const body=JSON.parse(request.body),input=JSON.parse(body.input);assert.equal(body.store,false);assert.equal(url,'https://api.openai.com/v1/responses');return {ok:true,json:async()=>({status:'completed',usage:{input_tokens:10,output_tokens:20},output:[{content:[{type:'output_text',text:JSON.stringify({fields:input.categories.map(f=>({label:f.id,value:null,evidence:[]}))})}]}]})};};
 const out=await summarize(w,u,t.id,[d.id],mock);assert.equal(out.summary.formatVersion,20);assert.equal(out.summary.fields.length,SUMMARY_FIELDS.length);assert.equal(calls,7);assert.equal(out.summary.usage.input_tokens,70);const original=out.summary.generatedAt;
 await assert.rejects(()=>summarize(w,u,t.id,[d.id],async()=>({ok:false,status:503})),e=>e.status===502);assert.equal(w.get(t.id).summary.generatedAt,original);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;auth.db.close();rmSync(dir,{recursive:true,force:true});}
});
