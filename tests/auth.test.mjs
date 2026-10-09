import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {openAuth,hashPassword,permissions} from '../server/auth.mjs';
test('login, CSRF, autorização, cookie, logout e revogação',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'er-auth-'));const path=join(dir,'test.sqlite');const store=openAuth(path);const password='senha-de-teste-nao-usar';const hash=await hashPassword(password);
 store.db.prepare('INSERT INTO users(id,name,login,email,password,admin,permissions) VALUES(?,?,?,?,?,1,?)').run('admin','Admin','admin','admin@example.test',hash,JSON.stringify(permissions));
 store.db.prepare('INSERT INTO users(id,name,login,email,password,permissions) VALUES(?,?,?,?,?,?)').run('worker','Worker','worker','worker@example.test',hash,'[]');store.db.close();
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:resolve('.'),env:{...process.env,ER_AUTH_DB:path,PORT:'3199'},stdio:['ignore','pipe','pipe']});
 try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Servidor não iniciou')),10000);child.stdout.once('data',()=>{clearTimeout(timeout);resolve();});child.once('exit',c=>{clearTimeout(timeout);reject(new Error('Servidor saiu '+c));});});
 const call=(url,method='GET',b,headers={})=>fetch('http://localhost:3199'+url,{method,headers:{...(method==='GET'?{}:{Origin:'http://localhost:5173','Content-Type':'application/json'}),...headers},body:b?JSON.stringify(b):undefined});
 assert.equal((await call('/api/admin/users')).status,401);
 assert.equal((await call('/api/sources')).status,401);
 assert.equal((await call('/api/sources/am/search?q=HOSPEDAGEM')).status,401);
 assert.equal((await call('/api/auth/login','POST',{login:'admin',password:'errada'})).status,401);
 assert.equal((await call('/api/auth/login','POST',{login:'admin',password},{Origin:'https://evil.example'})).status,403);
 const r=await call('/api/auth/login','POST',{login:'admin',password,remember:true});assert.equal(r.status,200);const ck=r.headers.get('set-cookie');assert.match(ck,/HttpOnly/);assert.match(ck,/SameSite=Strict/);assert.match(ck,/Max-Age=604800/);const cookie=ck.split(';')[0];const session=await r.json();
 assert.equal((await call('/api/admin/users','GET',null,{Cookie:cookie})).status,200); const list=await call('/api/sources','GET',null,{Cookie:cookie});assert.equal(list.status,200);assert.equal((await list.json()).length,5);
 assert.equal((await call('/api/admin/users','PATCH',{id:'worker',active:true,permissions:[]},{Cookie:cookie})).status,403);
 const wr=await call('/api/auth/login','POST',{login:'worker',password});const wc=wr.headers.get('set-cookie').split(';')[0];assert.equal((await call('/api/admin/users','GET',null,{Cookie:wc})).status,403);assert.equal((await call('/api/sources/am/search?q=x','GET',null,{Cookie:wc})).status,403);assert.equal((await call('/api/pncp-proxy/api/search/?q=x&pagina=1','GET',null,{Cookie:wc})).status,403);
 const hdr={Cookie:cookie,'X-CSRF-Token':session.csrf};
 const created=await call('/api/work/tenders','POST',{titulo:'Teste compartilhado',fonte:'Importação'},hdr);assert.equal(created.status,201);const tender=await created.json();assert.equal(tender.creatorName,'Admin');
 assert.equal((await call('/api/work/tenders','POST',{titulo:'Sem CSRF'},{Cookie:cookie})).status,403);
 assert.equal((await call('/api/work/tenders/'+encodeURIComponent(tender.id),'PATCH',{version:1,changes:{etapa:1}},hdr)).status,200);
 assert.equal((await call('/api/work/tenders/'+encodeURIComponent(tender.id),'PATCH',{version:1,changes:{etapa:2}},hdr)).status,409);
 assert.equal((await call('/api/work/audit','GET',null,{Cookie:wc})).status,403);
 assert.equal((await call('/api/work/tenders/'+encodeURIComponent(tender.id),'PATCH',{version:2,changes:{etapa:2}},{Cookie:wc,'X-CSRF-Token':(await wr.json()).csrf})).status,403);
 const pdf=await fetch('http://localhost:3199/api/work/tenders/'+encodeURIComponent(tender.id)+'/documents',{method:'POST',headers:{Origin:'http://localhost:5173','Content-Type':'application/pdf','X-File-Name':'edital.pdf',...hdr},body:Buffer.from('%PDF-1.7\nteste')});assert.equal(pdf.status,201);const doc=await pdf.json();assert.equal((await call('/api/work/tenders/'+encodeURIComponent(tender.id)+'/documents/'+doc.id,'GET',null,{Cookie:wc})).status,403);
 assert.equal((await call('/api/admin/users','PATCH',{id:'worker',active:false,permissions:[]},{Cookie:cookie,'X-CSRF-Token':session.csrf})).status,200);assert.equal((await call('/api/auth/me','GET',null,{Cookie:wc})).status,401);
 assert.equal((await call('/api/auth/password','POST',{current:password,next:'nova-senha-de-teste-longa'},{Cookie:cookie,'X-CSRF-Token':session.csrf})).status,200);assert.equal((await call('/api/auth/me','GET',null,{Cookie:cookie})).status,401);
 const r2=await call('/api/auth/login','POST',{login:'admin',password:'nova-senha-de-teste-longa'});const c2=r2.headers.get('set-cookie').split(';')[0];const s2=await r2.json();assert.equal((await call('/api/auth/logout','POST',{}, {Cookie:c2,'X-CSRF-Token':s2.csrf})).status,200);assert.equal((await call('/api/auth/me','GET',null,{Cookie:c2})).status,401);
 }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));await rm(dir,{recursive:true,force:true});}
});
