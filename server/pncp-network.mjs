import {setTimeout as pause} from 'node:timers/promises';
const transient=new Set(['ECONNRESET','ETIMEDOUT','EAI_AGAIN','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET']);
let tail=Promise.resolve(),lastStart=0;
export async function pncpRequest(url,read,{fetcher=fetch,sleep=pause,attempts=3,timeout=25000}={}){
 let release;const previous=tail;tail=new Promise(r=>release=r);await previous;
 try{for(let n=1;n<=attempts;n++){let response;try{const wait=Math.max(0,300-(Date.now()-lastStart));if(wait)await sleep(wait);lastStart=Date.now();response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(timeout),headers:{Accept:'*/*'}});if(!response.ok){const retry=response.status===429||response.status>=500;throw Object.assign(new Error('PNCP respondeu HTTP '+response.status),{retry});}return await read(response);}catch(e){await response?.body?.cancel?.().catch(()=>{});const code=e.cause?.code||e.code||e.name;const retry=e.retry||transient.has(code)||['TimeoutError','AbortError'].includes(code);console.error(JSON.stringify({service:'PNCP',path:new URL(url).pathname,attempt:n,code,http:response?.status||null,retry:!!retry}));if(!retry||n===attempts)throw Object.assign(new Error('Falha ao consultar PNCP: '+(e.cause?.code||e.code||e.message)+' após '+n+' tentativa(s). Os dados salvos foram preservados.'),{cause:e});await sleep(600*n);}}}finally{release();}
}
