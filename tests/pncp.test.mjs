import {test} from 'node:test';
import assert from 'node:assert/strict';
import {remoteURL} from '../server/pncp.mjs';
test('busca fixa tamanho e status, mantendo termo e página',()=>{
 const u=remoteURL('/api/pncp-proxy/api/search/?q=HOSPEDAGEM&pagina=2&tam_pagina=100&status=todos');
 assert.equal(u.origin,'https://pncp.gov.br');assert.equal(u.searchParams.get('q'),'HOSPEDAGEM');assert.equal(u.searchParams.get('pagina'),'2');assert.equal(u.searchParams.get('tam_pagina'),'20');assert.equal(u.searchParams.get('status'),'recebendo_proposta');
});
test('não permite URL externa nem rotas arbitrárias',()=>{for(const s of ['/api/pncp-proxy/http://evil.example','/api/pncp-proxy/api/search/?q=x&pagina=0','/api/pncp-proxy/api/search/?q=&pagina=1','/api/pncp-proxy/../../etc/passwd']) assert.throws(()=>remoteURL(s));});
test('permite detalhe oficial com identificadores válidos',()=>assert.equal(remoteURL('/api/pncp-proxy/api/consulta/v1/orgaos/75483230000158/compras/2026/67').href,'https://pncp.gov.br/api/consulta/v1/orgaos/75483230000158/compras/2026/67'));
test('itens usam rota oficial, paginação validada e limite fixo',()=>{
 const u=remoteURL('/api/pncp-proxy/api/pncp/v1/orgaos/87564381000110/compras/2024/93/itens?pagina=2&tamanhoPagina=999');
 assert.equal(u.origin,'https://pncp.gov.br');assert.equal(u.searchParams.get('pagina'),'2');assert.equal(u.searchParams.get('tamanhoPagina'),'20');
 for(const page of ['0','-1','NaN','1.2','10001'])assert.throws(()=>remoteURL('/api/pncp-proxy/api/pncp/v1/orgaos/87564381000110/compras/2024/93/itens?pagina='+page));
});
