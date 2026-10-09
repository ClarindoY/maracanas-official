import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readPDFs,isBlank} from '../server/pdf-reading.mjs';
const dir=fileURLToPath(new URL('./fixtures/',import.meta.url));
const scan={id:'native-blank-scan',name:'Digitalização de teste.pdf'};
test('leitura real: página nativa, página branca e OCR português offline',async()=>{
 const {pages,report}=await readPDFs(dir,[scan]);
 assert.equal(report.totalPages,3);assert.equal(report.nativePages,1);assert.equal(report.blankPages,1);assert.equal(report.ocrPages,1);assert.equal(report.pendingPages,0);assert.equal(report.complete,true);
 const text=pages.find(p=>p.page===3).text;assert.match(text,/120 participantes/);assert.match(text,/240 diárias/);assert.match(text,/20\/11\/2026/);assert.equal(pages.some(p=>p.page===2),false);
});
test('falha/limite OCR preserva páginas lidas e marca pendências, sem texto inventado',async()=>{
 let calls=0;const options={ocrFactory:()=>({recognize:async()=>{calls++;throw Error('Erro de OCR');},close:async()=>{}})};
 const {pages,report}=await readPDFs(dir,[scan],options);assert.equal(pages.length,1);assert.equal(report.complete,false);assert.equal(report.pendingPages,1);assert.equal(calls,1);
 const limited=await readPDFs(dir,[scan],{...options,maxOCRPages:0});assert.equal(limited.report.pendingPages,1);assert.equal(calls,1);
});
test('imagem sem palavras não vira página branca; OCR incerto permanece pendente',async()=>{
 const {pages,report}=await readPDFs(dir,[{id:'unreadable',name:'Figura.pdf'}],{ocrFactory:()=>({recognize:async()=>({data:{confidence:42,text:'Texto incerto 999'}}),close:async()=>{}})});
 assert.equal(pages.length,0);assert.equal(report.pendingPages,1);assert.equal(report.blankPages,0);
 assert.equal(isBlank({data:new Uint8ClampedArray([255,255,255,255])}),true);assert.equal(isBlank({data:new Uint8ClampedArray([254,255,255,255])}),false);
});
test('OCR que trava é encerrado e gera pendência',async()=>{
 let closed=false;const {report}=await readPDFs(dir,[scan],{ocrTimeout:10,ocrFactory:()=>({recognize:()=>new Promise(()=>{}),close:async()=>{closed=true;}})});assert.equal(closed,true);assert.equal(report.pendingPages,1);
});
