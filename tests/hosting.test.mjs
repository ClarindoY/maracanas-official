import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostingConfig,sessionCookie,serveStatic,clientIP,securityHeaders} from '../server/hosting.mjs';
test('produção exige origem HTTPS e banco no caminho persistente',()=>{
 assert.throws(()=>hostingConfig({NODE_ENV:'production'}),/Configure/);
 assert.throws(()=>hostingConfig({NODE_ENV:'production',APP_ORIGIN:'http://example.test',ER_AUTH_DB:'/var/data/auth.sqlite'}),/HTTPS/);
 assert.throws(()=>hostingConfig({NODE_ENV:'production',APP_ORIGIN:'https://example.test',ER_AUTH_DB:'/tmp/auth.sqlite'}),/persistente/);
 const cfg=hostingConfig({NODE_ENV:'production',RENDER_EXTERNAL_URL:'https://app.onrender.com',APP_ORIGIN:'https://client.example',ER_AUTH_DB:'/var/data/auth.sqlite'});
 assert.deepEqual([...cfg.hosts],['app.onrender.com','client.example']);
 assert.match(sessionCookie(cfg,'abc',true),/^__Host-er_session=abc;/);assert.match(sessionCookie(cfg,'abc',true),/Secure/);assert.match(sessionCookie(cfg,'abc',true),/HttpOnly/);assert.match(sessionCookie(cfg,'abc',true),/SameSite=Strict/);assert.match(sessionCookie(cfg,''),/Max-Age=0/);
 assert.match(securityHeaders(true)['Content-Security-Policy'],/frame-ancestors 'none'/);
});
test('não confia em IP de proxy fora do Render',()=>{
 const req={headers:{'x-forwarded-for':'1.1.1.1, 2.2.2.2'},socket:{remoteAddress:'3.3.3.3'}};
 assert.equal(clientIP(req,{trustRender:false}),'3.3.3.3');assert.equal(clientIP(req,{trustRender:true}),'2.2.2.2');
});
test('arquivos do servidor e caminhos fora do build nunca são servidos',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'static-maracanas-'));await writeFile(join(dir,'index.html'),'<html>login</html>');
 const res={writeHead(){},end(){}};
 try{
 assert.equal(await serveStatic({method:'GET'},res,new URL('https://app.test/server/auth.mjs'),dir),false);
 assert.equal(await serveStatic({method:'GET'},res,new URL('https://app.test/data/auth.sqlite'),dir),false);
 assert.equal(await serveStatic({method:'GET'},res,new URL('https://app.test/%2eenv'),dir),false);
 assert.equal(await serveStatic({method:'GET'},res,new URL('https://app.test/'),dir),true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
