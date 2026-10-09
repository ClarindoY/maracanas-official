import {SUMMARY_FIELDS,EXTERNAL_FIELDS} from '../shared/summary-catalog.mjs';
import {fail} from './workspace.mjs';
const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
// Keep original document/page identifiers. Overlap prevents clauses split at a boundary
// from disappearing; duplicates are removed after validating against original pages.
export function splitPages(pages,limit=48000,overlap=900){
 if(!Number.isInteger(limit)||limit<2000||overlap<0||overlap>=limit)throw Error('Limite de divisão inválido.');
 const parts=[];let current=[],size=0;
 const flush=()=>{if(current.length){parts.push(current);current=[];size=0;}};
 for(const p of pages){if(p.text.length<=limit){if(size+p.text.length>limit)flush();current.push({...p});size+=p.text.length;continue;}
 flush();for(let start=0;start<p.text.length;){let end=Math.min(start+limit,p.text.length);
 if(end<p.text.length){const space=p.text.lastIndexOf(' ',end);if(space>start+limit-overlap)end=space;}
 parts.push([{...p,text:p.text.slice(start,end)}]);if(end===p.text.length)break;start=Math.max(start+1,end-overlap);}
 }flush();return parts;
}
export function consolidateParts(parts){
 return {fields:SUMMARY_FIELDS.map(({id:label})=>{
 const matches=parts.map(p=>p.fields.find(f=>f.label===label)).filter(f=>f?.value);
 if(!matches.length)return {label,value:null,evidence:[],note:EXTERNAL_FIELDS.has(label)?'Depende de dados da empresa, cotação ou confirmação externa.':'Não localizado nas partes analisadas.'};
 const values=[...new Map(matches.map(f=>[norm(f.value),f.value])).values()];
 const evidence=[...new Map(matches.flatMap(f=>f.evidence).map(e=>[e.documentId+':'+e.page+':'+norm(e.quote),e])).values()];
 const value=values.length===1?values[0]:values.map(v=>'• '+v).join('\n\n');
 // Never silently trim a long checklist/table at consolidation.
 if(value.length>120000||evidence.length>500)fail(413,'Campo documental muito extenso para salvar com segurança. Resumo anterior preservado.');
 return {label,value,evidence,note:values.length>1?'Consolidado de várias partes. As informações são mantidas juntas; confira repetições, exceções, retificações e possíveis divergências nas referências.':'Extração por IA: conferir interpretação no original.'};
 })};
}
