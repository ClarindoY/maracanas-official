export const FILTER_FIELDS=[['orgao','Órgãos'],['unidade','Unidades'],['municipio','Municípios'],['platform','Fontes/Plataformas'],['emenda','Emenda Parlamentar'],['supplier','Fornecedores/Arrematantes'],['secret','Item Sigiloso'],['invoice','Nota Fiscal Eletrônica'],['instrument','Tipos de Instrumento Convocatório'],['year','Ano da Contratação'],['modality','Modalidades da Contratação'],['uf','UFs'],['sphere','Esferas'],['power','Poderes'],['norm','Normativos Base'],['legal','Amparos Legais'],['dispute','Modos de Disputa'],['judgment','Critério de Julgamento']];
const stringify=v=>v===null||v===undefined||v===''?'':String(v);
export function filterValue(t,k){const d=t.oficial||{};return stringify(({orgao:t.orgao||d.orgaoEntidade?.razaoSocial,unidade:d.unidadeOrgao?.nomeUnidade,municipio:d.unidadeOrgao?.municipioNome,platform:d.usuarioNome||t.fonte,emenda:Array.isArray(d.emendasParlamentares)&&d.emendasParlamentares.length?'Possui emenda publicada':undefined,supplier:undefined,secret:t.officialCollection?.itemSecrecy,invoice:undefined,instrument:d.tipoInstrumentoConvocatorioNome,year:d.anoCompra,modality:t.modalidade||d.modalidadeNome,uf:t.uf||d.unidadeOrgao?.ufSigla,sphere:d.orgaoEntidade?.esferaId,power:d.orgaoEntidade?.poderId,norm:d.amparoLegal?.nome,legal:d.amparoLegal?.descricao,dispute:d.modoDisputaNome,judgment:undefined})[k]);}
export function tenderStatus(t,now=Date.now()){
 const d=t.oficial||{};if(t.fonte!=='PNCP')return 'unknown';if([2,3,4].includes(d.situacaoCompraId))return 'closed';if(d.situacaoCompraId!==1)return 'unknown';const date=d.dataEncerramentoProposta;const end=date?Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(date)?date:date+'-03:00'):NaN;
 return Number.isFinite(end)?end>now?'open':'judging':'unknown';
}
export function matchesTender(t,filters,now=Date.now()){
 if(filters.status&&filters.status!=='all'&&tenderStatus(t,now)!==filters.status)return false;
 for(const [k] of FILTER_FIELDS)if(filters[k]&&filterValue(t,k)!==filters[k])return false;
 if(filters.stage!==undefined&&filters.stage!==''&&String(t.etapa)!==filters.stage)return false;
 const q=(filters.localQuery||'').normalize('NFKC').toLowerCase();if(q&&![t.titulo,t.orgao,t.id].some(v=>String(v||'').normalize('NFKC').toLowerCase().includes(q)))return false;
 return true;
}
