import {createRequire} from 'node:module';
import {createCanvas,DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
import {createWorker,OEM} from 'tesseract.js';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fail} from './workspace.mjs';
const require=createRequire(import.meta.url);
const language=require('@tesseract.js-data/por');
for(const [k,v] of Object.entries({DOMMatrix,ImageData,Path2D}))globalThis[k]??=v;
const {getDocument,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdfRoot=resolve(require.resolve('pdfjs-dist/package.json'),'..');
class CanvasFactory {
 create(width,height){const canvas=createCanvas(Math.ceil(width),Math.ceil(height));return {canvas,context:canvas.getContext('2d')};}
 reset(target,width,height){target.canvas.width=Math.ceil(width);target.canvas.height=Math.ceil(height);}
 destroy(target){target.canvas.width=1;target.canvas.height=1;target.canvas=null;target.context=null;}
}
// Only an entirely white rendered page is treated as blank. Faint marks remain pending/OCR.
export function isBlank(image){for(let i=0;i<image.data.length;i+=4)if(image.data[i]!==255||image.data[i+1]!==255||image.data[i+2]!==255)return false;return true;}
export function createPortugueseOCR(){
 let workerPromise,worker,closed=false;
 return {
  async recognize(bytes){workerPromise??=createWorker('por',OEM.LSTM_ONLY,{langPath:language.langPath,gzip:true,cacheMethod:'none',errorHandler:()=>{}}).then(async w=>{if(closed){await w.terminate();throw Error('OCR encerrado.');}worker=w;return w;});return (await workerPromise).recognize(bytes);},
  async close(){closed=true;if(worker){await worker.terminate();worker=null;}}
 };
}
async function deadline(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Tempo máximo do OCR atingido.')),ms);})]);}finally{clearTimeout(timer);}}
export async function readPDFs(dir,documents,{ocrFactory=createPortugueseOCR,maxOCRPages=20,ocrTimeout=90000}={}){
 const pages=[],coverage=[];let total=0,ocrCount=0,ocr,ocrUnavailable=false;
 try{for(const d of documents){const loading=getDocument({data:new Uint8Array(readFileSync(resolve(dir,d.id+'.pdf'))),isEvalSupported:false,useSystemFonts:true,CanvasFactory,standardFontDataUrl:pdfRoot+'/standard_fonts/',cMapUrl:pdfRoot+'/cmaps/',cMapPacked:true});
 try{const pdf=await loading.promise;if(pdf.numPages>150)fail(413,'Limite: 150 páginas por PDF.');
 for(let n=1;n<=pdf.numPages;n++){let page;const record={documentId:d.id,name:d.name,page:n,status:'pending',reason:''};coverage.push(record);
 try{page=await pdf.getPage(n);const content=await page.getTextContent();let text=content.items.map(i=>i.str||'').join(' ').trim();let method='native';
 const operators=text.length<250?await page.getOperatorList():null;
 const hasImage=operators?.fnArray.some(op=>[OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject].includes(op));
 if(text.length<25||hasImage){const base=page.getViewport({scale:1});const scale=Math.min(2,Math.sqrt(2000000/(base.width*base.height)));const viewport=page.getViewport({scale});const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));const context=canvas.getContext('2d');
 try{await page.render({canvasContext:context,viewport,background:'rgb(255,255,255)'}).promise;
 if(isBlank(context.getImageData(0,0,canvas.width,canvas.height))){record.status='blank';record.reason='Página inteiramente branca na renderização.';continue;}
 if(ocrCount>=maxOCRPages||ocrUnavailable){record.reason=ocrUnavailable?'OCR indisponível nesta análise; tente novamente.':'Limite de 20 páginas com OCR por análise; selecione menos PDFs.';continue;}
 ocrCount++;ocr??=ocrFactory();let result;
 try{result=await deadline(ocr.recognize(canvas.toBuffer('image/png')),ocrTimeout);}catch{ocrUnavailable=true;await ocr.close();record.reason='OCR não concluiu dentro do limite ou falhou. Confira o PDF original.';continue;}
 const candidate=result.data?.text?.trim()||'';record.confidence=Number.isFinite(result.data?.confidence)?Math.round(result.data.confidence):0;
 if(record.confidence<60||candidate.length<12||!/[A-Za-zÀ-ÿ]{3}/.test(candidate)){record.reason='OCR sem texto confiável. Confira esta página no original.';continue;}
 text=text?text+'\n'+candidate:candidate;method='ocr';
 }finally{canvas.width=1;canvas.height=1;}}
 total+=text.length;if(total>240000)fail(413,'Conjunto muito extenso para uma análise. Separe os documentos.');record.status=method;record.reason=method==='ocr'?'Texto reconhecido por OCR: conferir números, tabelas e interpretação no original.':'';pages.push({documentId:d.id,name:d.name,page:n,text,method});
 }catch(e){if(e.status)throw e;record.reason='Não foi possível ler ou renderizar esta página. Confira o original.';}finally{page?.cleanup();}}
 }finally{await loading.destroy();}}
 }finally{if(ocr)await ocr.close();}
 return {pages,report:{generatedAt:new Date().toISOString(),complete:coverage.every(p=>p.status!=='pending'),totalPages:coverage.length,nativePages:coverage.filter(p=>p.status==='native').length,ocrPages:coverage.filter(p=>p.status==='ocr').length,blankPages:coverage.filter(p=>p.status==='blank').length,pendingPages:coverage.filter(p=>p.status==='pending').length,pages:coverage}};
}
