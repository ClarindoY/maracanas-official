import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rjRows,deadlineState,safeURL,searchSource,sourceDetail} from '../server/multisources.mjs';
test('RJ preserva prazo de propostas separado da sessão e valida esquema',()=>{
 const text='ID Licitação;Objeto;Data/Hora Limite de Proposta;Status;Data_extracao;Data/Hora Abertura de Sessão;Valor Total Estimado (R$)\n42;Hospedagem;16/10/2026 09:00:00;Publicado;06/10/2026;16/10/2026 10:00:00;1200,50';
 const [r]=rjRows(text);assert.equal(r.deadline,'2026-10-16T09:00:00-03:00');assert.equal(r.opening,'2026-10-16T10:00:00-03:00');assert.equal(r.value,1200.5);
 assert.throws(()=>rjRows('Objeto;Status\nHospedagem;Publicado'),/Esquema/);
});
test('sessão futura não confirma prazo; processo suspenso não é aberto',()=>{
 assert.equal(deadlineState({opening:'2099-01-01'}),'Prazo não confirmado');
 assert.equal(deadlineState({deadline:'2099-01-01',status:'Suspenso'}),'Situação impede confirmação');
 assert.equal(deadlineState({deadline:'2020-01-01'}),'Prazo encerrado');
});
test('não aceita fontes, destinos ou links executáveis arbitrários',async()=>{
 assert.equal(safeURL('javascript:alert(1)'),null);
 await assert.rejects(searchSource('http://localhost','x',1),/Fonte/);
 await assert.rejects(searchSource('am','',1),/inválida/);
 await assert.rejects(sourceDetail('am','../../internal'),/indisponível/);
});
