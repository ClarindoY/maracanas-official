export function remoteURL(input) {
  const u = new URL(input, 'http://localhost');
  const path = u.pathname.replace(/^\/api\/pncp-proxy/, '');
  if (path === '/api/search/') {
    const q = (u.searchParams.get('q') || '').trim();
    const page = Number(u.searchParams.get('pagina'));
    if (!q || q.length > 160 || !Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error('Busca ou página inválida.');
    const result = new URL('https://pncp.gov.br/api/search/');
    result.search = new URLSearchParams({q, tipos_documento:'edital',ordenacao:'-data',status:'recebendo_proposta',pagina:String(page),tam_pagina:'20'}).toString();
    return result;
  }
  if (/^\/api\/consulta\/v1\/orgaos\/\d{14}\/compras\/\d{4}\/\d+$/.test(path)) return new URL(path, 'https://pncp.gov.br');
  if (/^\/api\/pncp\/v1\/orgaos\/\d{14}\/compras\/\d{4}\/\d+\/itens$/.test(path)) {
    const page = Number(u.searchParams.get('pagina') || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error('Página de itens inválida.');
    const result = new URL(path, 'https://pncp.gov.br');
    result.search = new URLSearchParams({pagina:String(page),tamanhoPagina:'20'}).toString();
    return result;
  }
  throw new Error('Rota não permitida.');
}
export async function fetchPNCP(url) {
  const r = await fetch(url, {signal:AbortSignal.timeout(25000),headers:{Accept:'application/json'}});
  if (!r.ok) throw new Error(`PNCP respondeu HTTP ${r.status}.`);
  if (r.status === 204 && url.pathname.endsWith('/itens')) return [];
  const chunks=[]; let bytes=0;
  for await(const chunk of r.body) {bytes += chunk.length; if(bytes > 5*1024*1024) throw new Error('Resposta excede 5 MB.'); chunks.push(chunk);}
  const text=Buffer.concat(chunks).toString();
  if(!text.trim()) throw new Error('PNCP retornou resposta vazia.');
  try { return JSON.parse(text); } catch { throw new Error('Resposta PNCP não é JSON válido.'); }
}
