import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openAuth,permissions} from '../server/auth.mjs';
import {openWorkspace} from '../server/workspace.mjs';
import {pncpIdentity,collectOfficial,boundedFetch,createOfficialQueue} from '../server/official-analysis.mjs';
import {compareSources} from '../shared/summary-catalog.mjs';
test('coleta oficial fixa destino, cruza campos, informa formato pendente e evita duplicar PDFs',async()=>{
 assert.throws(()=>pncpIdentity({urlPNCP:'https://localhost/app/editais/12345678901234/2026/1'}),e=>e.status===400);
 const dir=mkdtempSync(join(tmpdir(),'official-')),auth=openAuth(join(dir,'auth.sqlite'));auth.db.prepare('INSERT INTO users(id,name,login,email,password,permissions) VALUES(?,?,?,?,?,?)').run('a','Alice','alice','a@test.test','unused',JSON.stringify(permissions));const u={id:'a',nome:'Alice',permissoes:permissions},w=openWorkspace(auth,join(dir,'docs'));
 try{const t=w.create(u,{titulo:'Hospedagem',urlPNCP:'https://pncp.gov.br/app/editais/12345678901234/2026/1'});const fetched=[];
 const mock=async(url,options)=>{fetched.push(url);assert.equal(options.redirect,'error');assert.equal(new URL(url).hostname,'pncp.gov.br');let value;
 if(url.includes('/consulta/'))value={orgaoEntidade:{cnpj:'12345678901234',razaoSocial:'Órgão real'},anoCompra:2026,sequencialCompra:1,objetoCompra:'Hospedagem',orcamentoSigilosoCodigo:1,valorTotalEstimado:1000};
 else if(url.includes('/itens?'))value=[{numeroItem:1,descricao:'Diária',quantidade:10,valorTotal:1000}];
 else if(url.endsWith('/arquivos'))value=[{sequencialDocumento:1,titulo:'Edital',url:'http://127.0.0.1/secret'},{sequencialDocumento:2,titulo:'Planilha'}];
 else value=url.endsWith('/1')?Buffer.from('%PDF-1.4\nFixture'):Buffer.from('not a PDF');
 return {ok:true,status:200,body:[Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value))]};};
 const c=await collectOfficial(w,u,t.id,mock);assert.equal(c.documentIds.length,1);assert.ok(c.warnings.some(s=>s.includes('não PDF')));assert.equal(c.fields.find(f=>f.id==='b1_5').value,'R$ 1.000,00');assert.ok(c.fields.find(f=>f.id==='b4_1').value.includes('Diária'));await collectOfficial(w,u,t.id,mock);assert.equal(w.docs(t.id).length,1);
 const queue=createOfficialQueue(w,async()=>{});assert.throws(()=>queue.start({id:'a',permissoes:[]},t.id),e=>e.status===403);
 }finally{auth.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('diferenças de valores sinalizam revisão, nunca substituem a fonte',()=>{
 assert.equal(compareSources('b1_5','R$ 1.000,00','R$ 2.000,00').status,'Possível divergência');assert.equal(compareSources('b1_2','Hospedagem','Hospedagem').status,'Texto coincidente');assert.equal(compareSources('b1_2','Hospedagem',null).status,'Sem comparação');
});
test('download recusa erro externo e tamanho excessivo',async()=>{
 await assert.rejects(()=>boundedFetch('https://pncp.gov.br/test',false,async()=>({ok:false,status:403})),/403/);
 await assert.rejects(()=>boundedFetch('https://pncp.gov.br/test',false,async()=>({ok:true,body:[Buffer.alloc(21*1024*1024)]})),/limite/);
});
