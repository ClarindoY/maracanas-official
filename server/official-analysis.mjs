import {createHash} from 'node:crypto';
import {allowed,fail} from './workspace.mjs';
export function pncpIdentity(t){
 const m=String(t.urlPNCP||'').match(/^https:\/\/pncp\.gov\.br\/app\/editais\/(\d{14})\/(\d{4})\/(\d+)\/?$/);
 if(!m)fail(400,'Esta fonte ainda não tem coleta automática de documentos.');return {cnpj:m[1],year:m[2],sequence:m[3]};
}
export function officialFields(d,items,at){
 const clean=v=>v===undefined||v===null||v===''?null:String(v);
 const money=v=>typeof v==='number'?v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):null;
 const fields=[['b1_1',[d.orgaoEntidade?.razaoSocial,d.orgaoEntidade?.cnpj,d.numeroCompra,d.processo,d.numeroControlePNCP].filter(Boolean).join(' · '),'orgaoEntidade / numeroCompra / processo / numeroControlePNCP'],['b1_2',[d.objetoCompra,d.modalidadeNome].filter(Boolean).join('\n'),'objetoCompra / modalidadeNome'],['b1_3',d.modoDisputaNome,'modoDisputaNome (critério de julgamento deve ser conferido no edital)'],['b1_4',[d.dataAberturaProposta&&'Início de propostas: '+d.dataAberturaProposta,d.dataEncerramentoProposta&&'Fim de propostas: '+d.dataEncerramentoProposta].filter(Boolean).join('\n'),'dataAberturaProposta / dataEncerramentoProposta'],['b1_5',d.orcamentoSigilosoCodigo===1?money(d.valorTotalEstimado):'Orçamento com sigilo ou classificação não confirmada; confira a fonte.','valorTotalEstimado / orcamentoSigilosoCodigo'],['b1_6',d.situacaoCompraNome,'situacaoCompraNome — consulta pontual; não confirma todas as retificações']];
 if(items.length)fields.push(['b4_1',items.map(i=>['Item '+i.numeroItem,i.descricao,'Quantidade: '+(i.quantidade??'não informada'),i.unidadeMedida,i.orcamentoSigiloso?'Valor sigiloso':'Unitário: '+(money(i.valorUnitarioEstimado)||'não informado')+'; total: '+(money(i.valorTotal)||'não informado')].filter(Boolean).join(' · ')).join('\n'),'itens oficiais PNCP']);
 return fields.map(([id,value,key])=>({id,value:clean(value),key,source:'PNCP',consultedAt:at}));
}
export async function boundedFetch(url,json,fetcher=fetch){
 // Destino fixo PNCP; redirecionamentos externos nunca são seguidos.
 const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(35000),headers:{Accept:json?'application/json':'application/pdf'}});
 if(!r.ok)throw Error('PNCP respondeu HTTP '+r.status);const chunks=[];let size=0;
 for await(const c of r.body){size+=c.length;if(size>(json?5:20)*1024*1024)throw Error('Arquivo ou resposta excede limite.');chunks.push(c);}
 const bytes=Buffer.concat(chunks);if(json){if(r.status===204)return [];return JSON.parse(bytes.toString());}return bytes;
}
export async function collectOfficial(work,user,id,fetcher=fetch){
 const t=work.get(id),key=pncpIdentity(t),base=`https://pncp.gov.br/api/pncp/v1/orgaos/${key.cnpj}/compras/${key.year}/${key.sequence}`;
 const d=await boundedFetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${key.cnpj}/compras/${key.year}/${key.sequence}`,true,fetcher);
 if(String(d.orgaoEntidade?.cnpj)!==key.cnpj||String(d.anoCompra)!==key.year||String(d.sequencialCompra)!==key.sequence)throw Error('Identificação oficial não corresponde à ficha.');
 const at=new Date().toISOString(),warnings=[],items=[];
 try{for(let p=1;p<=51;p++){const page=await boundedFetch(base+'/itens?pagina='+p+'&tamanhoPagina=20',true,fetcher);if(!Array.isArray(page))throw Error('Itens inválidos.');if(p===51&&page.length){warnings.push('Mais de 1.000 itens: tabela limitada; confira a fonte.');break;}items.push(...page);if(page.length<20)break;}}catch(e){warnings.push('Itens incompletos: '+e.message);}
 const raw=await boundedFetch(base+'/arquivos',true,fetcher),files=Array.isArray(raw)?raw:raw.documentos;if(!Array.isArray(files)||files.length>100)throw Error('Lista de documentos inválida ou maior que 100 arquivos.');
 const docs=[],manifest=[];
 for(const f of files){const sequence=f.sequencialDocumento;if(!Number.isSafeInteger(sequence)||sequence<1){warnings.push('Documento com identificador inválido.');continue;}
 const url=base+'/arquivos/'+sequence;const record={sequence,title:String(f.titulo||f.tipoDocumentoNome||'Documento').slice(0,180),type:f.tipoDocumentoNome||'',url,publication:f.dataPublicacaoPncp||null};
 try{const bytes=await boundedFetch(url,false,fetcher);if(bytes.subarray(0,5).toString()!=='%PDF-'){record.status='Formato não PDF';warnings.push(record.title+': formato não PDF; não analisado.');}else{const hash=createHash('sha256').update(bytes).digest('hex');let doc=work.docs(id).find(x=>x.hash===hash);if(!doc)doc=work.upload(user,id,record.title.replace(/[^\p{L}\p{N} ._-]/gu,'_')+'.pdf',bytes);record.documentId=doc.id;record.hash=hash;record.status='PDF salvo';if(!docs.includes(doc.id))docs.push(doc.id);}}
 catch(e){record.status='Falhou: '+e.message;warnings.push(record.title+': '+e.message);}manifest.push(record);
 }
 const collection={consultedAt:at,fields:officialFields(d,items,at),manifest,warnings,itemsComplete:!warnings.some(w=>w.includes('itens')||w.includes('Itens')),documentIds:docs};
 saveInternal(work,user,id,{oficial:d,officialCollection:collection},'Documentos oficiais coletados',{files:manifest,warnings});
 if(!docs.length)throw Error('Nenhum PDF oficial pôde ser obtido. Veja as pendências da coleta.');
 if(docs.length>12)throw Error('Mais de 12 PDFs oficiais: análise automática bloqueada para não omitir documentos.');return collection;
}
export function saveInternal(work,user,id,changes,action,details={}){
 work.transaction(()=>{const row=work.get(id);const {version,creatorId,creatorName,createdAt,updatedAt,...saved}=row;work.db.prepare('UPDATE tenders SET data=?,version=version+1,updated=? WHERE id=?').run(JSON.stringify({...saved,...changes}),new Date().toISOString(),id);work.event(user,action,id,details);});
}
export function createOfficialQueue(work,summarize){
 work.db.exec(`CREATE TABLE IF NOT EXISTS official_jobs(tender_id TEXT PRIMARY KEY,status TEXT NOT NULL,actor TEXT NOT NULL,updated TEXT NOT NULL,error TEXT NOT NULL); UPDATE official_jobs SET status='interrompida',error='Servidor reiniciado; solicite novamente.' WHERE status IN ('fila','processando');`);
 const queue=[];let running=false;
 const status=id=>work.db.prepare('SELECT * FROM official_jobs WHERE tender_id=?').get(id)||null;
 async function drain(){if(running)return;running=true;try{while(queue.length){const {id,user}=queue.shift();work.db.prepare("UPDATE official_jobs SET status='processando',updated=? WHERE tender_id=?").run(new Date().toISOString(),id);try{const account=work.db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(user.id);if(!account)throw Error('Colaborador inativo.');user.admin=!!account.admin;user.permissoes=JSON.parse(account.permissions);if(!allowed(user,'Analisar editais')||!allowed(user,'Acessar documentos'))throw Error('Permissões revogadas antes do processamento.');const c=await collectOfficial(work,user,id);if(!process.env.OPENAI_API_KEY)throw Error('Dados e PDFs salvos. Configure OPENAI_API_KEY para gerar a análise.');await summarize(user,id,c.documentIds);work.db.prepare("UPDATE official_jobs SET status='concluída',error='',updated=? WHERE tender_id=?").run(new Date().toISOString(),id);}catch(e){work.db.prepare("UPDATE official_jobs SET status='falhou',error=?,updated=? WHERE tender_id=?").run(e.message,new Date().toISOString(),id);work.event(user,'Análise oficial falhou',id,{error:e.message});}}}finally{running=false;}}
 return {status,start(user,id){if(!allowed(user,'Analisar editais')||!allowed(user,'Acessar documentos'))fail(403,'Coleta e análise exigem permissões de análise e documentos.');pncpIdentity(work.get(id));const existing=status(id);if(existing&&['fila','processando'].includes(existing.status))return existing;if(queue.length>=20)fail(429,'Fila cheia; tente mais tarde.');work.db.prepare('INSERT OR REPLACE INTO official_jobs VALUES(?,?,?,?,?)').run(id,'fila',user.id,new Date().toISOString(),'');work.event(user,'Análise oficial solicitada',id);queue.push({id,user});setImmediate(drain);return status(id);}};
}
