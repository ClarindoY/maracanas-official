import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pncpRequest} from '../server/pncp-network.mjs';
import {matchesTender,filterValue,tenderStatus} from '../shared/tender-filters.mjs';
import {officialFields} from '../shared/official-fields.mjs';
test('conexão reiniciada recupera com repetição limitada; erros permanentes não repetem',async()=>{
 let count=0;const fetcher=async()=>{if(++count<3)throw Object.assign(new Error('fetch failed'),{cause:{code:'ECONNRESET'}});return {ok:true,status:200};};assert.equal(await pncpRequest('https://pncp.gov.br/test',()=>42,{fetcher,sleep:async()=>{}}),42);assert.equal(count,3);
 count=0;await assert.rejects(()=>pncpRequest('https://pncp.gov.br/test',()=>42,{fetcher:async()=>{count++;return {ok:false,status:404};},sleep:async()=>{}}),/404/);assert.equal(count,1);
 count=0;await assert.rejects(()=>pncpRequest('https://pncp.gov.br/test',()=>42,{fetcher:async()=>{count++;return {ok:false,status:503};},sleep:async()=>{}}),/3 tentativa/);assert.equal(count,3);
});
test('filtros do acervo combinam campos e não tratam informação ausente como não',()=>{
 const t={fonte:'PNCP',orgao:'Órgão',uf:'CE',etapa:1,oficial:{situacaoCompraId:1,dataEncerramentoProposta:'2027-01-01T12:00:00',anoCompra:2027,unidadeOrgao:{municipioNome:'Fortaleza',nomeUnidade:'Turismo'}}};
 assert.equal(tenderStatus(t,Date.parse('2026-01-01')),'open');assert.equal(matchesTender(t,{status:'open',municipio:'Fortaleza',year:'2027'},Date.parse('2026-01-01')),true);assert.equal(matchesTender(t,{municipio:'Caucaia'}),false);assert.equal(filterValue(t,'invoice'),'');assert.equal(matchesTender(t,{invoice:'Não'}),false);
 assert.ok(officialFields({...t.oficial,objetoCompra:'Hospedagem'},[],'2026-01-01').find(f=>f.id==='b1_2').value.includes('Hospedagem'));
});
