import {load} from 'cheerio';
import {parse} from 'csv-parse/sync';
import AdmZip from 'adm-zip';
import {collect} from './legacy-connectors.mjs';
import {sources} from './legacy-sources.mjs';

export const enabledSources = [
 {id:'am',name:'e-Compras AM',url:'https://www.e-compras.am.gov.br/publico/',note:'Lista e detalhes públicos. Prazo e documentos consultados sob demanda.'},
 {id:'mg',name:'Compras MG',url:'https://dados.mg.gov.br/dataset/portal_licitacoes_mg',note:'Dados anuais de 2026. Prazo de proposta pode não estar disponível; não confirma participação aberta.'},
 {id:'rs',name:'Compras RS / CELIC',url:'https://www.compras.rs.gov.br/editais/pesquisar',note:'Consulta estruturada e páginas de documentos. Data de sessão não substitui prazo de proposta.'},
 {id:'sesc',name:'Sesc Bahia',url:'https://www.sescbahia.com.br/lista-licitacoes/aberto',note:'O status Em aberto pode incluir processos antigos. Data de abertura não é prazo de proposta.'},
 {id:'rj',name:'Compras RJ',url:'https://www.compras.rj.gov.br/Principal/extracaoTotal.action',note:'Extração oficial com prazo, situação e valores. Documentos e link individual ainda pendentes.'},
];
const cache=new Map(), pending=new Map();
export const safeURL=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:null;}catch{return null;}};
async function remote(url,{limit=8*1024*1024,method='GET',body,encoding='utf-8'}={}){
 const r=await fetch(url,{method,body,headers:body?{'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest'}:{Accept:'*/*'},signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw Error(`Fonte respondeu HTTP ${r.status}.`);
 if(Number(r.headers.get('content-length'))>limit)throw Error('Arquivo excede o limite de coleta.');
 const parts=[];let n=0;for await(const part of r.body){n+=part.length;if(n>limit)throw Error('Arquivo excede o limite de coleta.');parts.push(part);}
 const b=Buffer.concat(parts);return encoding==='buffer'?b:new TextDecoder(encoding).decode(b);
}
function brDate(v,zone='-03:00'){
 const m=String(v||'').match(/^(\d{2})\/(\d{2})\/(\d{2,4})(?:\s+(?:às\s+)?(\d{2})[:h](\d{2}))?/i);
 return m?`${m[3].length===2?'20'+m[3]:m[3]}-${m[2]}-${m[1]}${m[4]?`T${m[4]}:${m[5]}:00${zone}`:''}`:null;
}
const match=(text,q)=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
export function deadlineState(r){
 const t=Date.parse(r.deadline||'');
 if(/cancel|anulad|revog|suspens|homolog|conclu|encerrad|desert/i.test(r.status||''))return 'Situação impede confirmação';
 if(!Number.isFinite(t))return 'Prazo não confirmado';
 if(t<=Date.now())return 'Prazo encerrado';
 return 'Prazo futuro — conferir edital';
}
function base(source,x){return {...x,id:`${source.id}:${x.externalId}`,sourceId:source.id,source:source.name,url:safeURL(x.url)||source.url,files:x.files||[],deadline:x.deadline||null,opening:x.opening||null,value:typeof x.value==='number'&&x.value>0?x.value:null};}
function fileLinks(html,url,selector='a[href]'){
 const $=load(html),out=[],seen=new Set();$(selector).each((_,e)=>{const href=$(e).attr('href');if(!/download|abrirArquivo|\/anexos\/|\.pdf(?:\?|$)/i.test(href||''))return;const u=safeURL(new URL(href,url).href);if(u&&!seen.has(u)){seen.add(u);out.push({name:$(e).text().trim()||'Documento oficial',url:u});}});return out.slice(0,50);
}
export function rjRows(text){
 const rows=parse(text,{delimiter:';',columns:true,bom:true,skip_empty_lines:true,relax_column_count:false});
 const required=['ID Licitação','Objeto','Data/Hora Limite de Proposta','Status','Data_extracao'];
 if(rows.length&&required.some(k=>!(k in rows[0])))throw Error('Esquema RJ mudou; coleta interrompida.');
 return rows.map(r=>({externalId:r['ID Licitação'],title:r.Objeto,agency:r.Unidade,modality:r.Modalidade,deadline:brDate(r['Data/Hora Limite de Proposta']),opening:brDate(r['Data/Hora Abertura de Sessão']),status:r.Status,value:parseFloat(String(r['Valor Total Estimado (R$)']||'').replace(',','.')),extraction:r.Data_extracao,url:'https://www.compras.rj.gov.br/EditaisLicitacoes/buscar.action',direct:false}));
}
async function dataFor(id,q,page){
 const s=enabledSources.find(x=>x.id===id);if(!s)throw Error('Fonte não permitida.');
 if(id==='rs'){
 const y=new Date().getFullYear(),to=new Date().toLocaleDateString('pt-BR',{timeZone:'America/Fortaleza'});
 const json=JSON.parse(await remote('https://www.compras.rs.gov.br/editais/pesquisa.json',{method:'POST',body:new URLSearchParams({draw:'1',start:String((page-1)*20),length:'20',description:q,publicationStartDate:`01/01/${y}`,publicationEndDate:to})}));
 if(!Array.isArray(json.data))throw Error('Resposta RS não reconhecida.');
 return {rows:json.data.map(r=>base(s,{externalId:String(r.id),title:r.description,agency:r.tradeOffice,modality:r.biddingTypeName,opening:new Date(r.startDate).toISOString(),status:'Consultar situação na publicação',url:`https://www.compras.rs.gov.br/editais/${r.simplifiedIssuanceNumber}/${r.id}`,direct:true})),total:Number(json.iTotalDisplayRecords),at:new Date().toISOString()};
 }
 const key=id+':'+new Date().getFullYear();let stored=cache.get(key);
 if(!stored||Date.now()-stored.time>1800000){
 if(!pending.has(key))pending.set(key,(async()=>{
 let rows;
 if(id==='am'||id==='mg'){
 const r=await collect(sources.find(x=>x.id===id),new Date().getFullYear());
 if(!r.rows)throw Error(r.note||'Sem dados atuais.');
 rows=r.rows.map(r=>base(s,{externalId:r.externalId,title:r.title,agency:r.agency,modality:r.modality,value:r.value,opening:r.opening,status:r.officialStatus,deadline:id==='am'?brDate(r.raw?.listing?.match(/Inscrições de .*? a (\d{2}\/\d{2}\/\d{2,4}\s+às\s+\d{2}h\d{2})/i)?.[1],'-04:00'):null,url:id==='mg'?r.raw?.find(x=>safeURL(x.edital_retificacao_arquivos))?.edital_retificacao_arquivos:r.url,direct:id==='am'||!!r.raw?.some(x=>safeURL(x.edital_retificacao_arquivos))}));
 }else if(id==='sesc'){
 const r=JSON.parse(await remote('https://sescbahia.azurewebsites.net/gerenciador/api/Licitacao/GetSearchedLics/?protocolo=&numero=&ano=&objeto=&status=4'));
 if(!Array.isArray(r))throw Error('Resposta Sesc não reconhecida.');
 rows=r.map(x=>base(s,{externalId:String(x.Id),title:x.Objeto||x.Titulo,agency:'Sesc Bahia',modality:x.Modalidades?.[0]?.Titulo,opening:brDate(x.DataAbertura),status:x.TipoStatus?.Titulo||'Não informado',url:s.url,direct:false,participation:safeURL(/^https?:/.test(x.LinkPregao||'')?x.LinkPregao:'https://'+(x.LinkPregao||'')),files:fileLinks(x.Arquivos||'',s.url)}));
 }else if(id==='rj'){
 const zip=new AdmZip(await remote('https://www.compras.rj.gov.br/siga/imagens/EDITAIS_E_LICITACOES.zip',{limit:65*1024*1024,encoding:'buffer'}));
 const entry=zip.getEntries().find(e=>e.entryName.toUpperCase()==='LICITACOES.CSV');
 if(!entry||entry.header.size>25*1024*1024)throw Error('CSV RJ ausente ou acima do limite.');
 rows=rjRows(new TextDecoder('windows-1252').decode(entry.getData())).map(x=>base(s,x));
 }
 rows.sort((a,b)=>(Date.parse(b.deadline||b.opening)||0)-(Date.parse(a.deadline||a.opening)||0));
 const data={rows,at:new Date().toISOString(),time:Date.now()};cache.set(key,data);return data;
 })().finally(()=>pending.delete(key)));
 stored=await pending.get(key);
 }
 const matches=stored.rows.filter(x=>match(x.title,q));return {rows:matches.slice((page-1)*20,page*20),total:matches.length,at:stored.at};
}
export async function searchSource(id,q,page=1){
 if(typeof q!=='string'||!q.trim()||q.length>160||!Number.isSafeInteger(page)||page<1||page>10000)throw Error('Busca ou página inválida.');
 const s=enabledSources.find(x=>x.id===id);if(!s)throw Error('Fonte não permitida.');
 const d=await dataFor(id,q.trim(),page);
 return {source:s,rows:d.rows.map(r=>({...r,deadlineState:deadlineState(r),collectedAt:d.at})),total:d.total,page,totalPages:Math.ceil(d.total/20),collectedAt:d.at};
}
export async function sourceDetail(id,externalId){
 let url;
 if(id==='am'&&/^\d{1,12}$/.test(externalId))url=`https://www.e-compras.am.gov.br/publico/licitacoes_detalhes.asp?ident=${externalId}`;
 if(id==='rs'&&/^\d{1,10}_[0-9]{4}\/[0-9]{1,12}$/.test(externalId))url=`https://www.compras.rs.gov.br/editais/${externalId}`;
 if(id==='mg'&&/^\d{1,12}$/.test(externalId))url=`https://www1.compras.mg.gov.br/processocompra/processo/consultaEditalRetificaoProcesso.html?metodo=visualizarEditalRetificao&id=${externalId}`;
 if(!url)throw Error('Detalhe indisponível para este identificador.');
 const html=await remote(url,{encoding:id==='mg'?'windows-1252':'utf-8'});
 return {url,files:fileLinks(html,url),checkedAt:new Date().toISOString()};
}
