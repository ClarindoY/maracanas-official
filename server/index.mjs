import {setDefaultResultOrder} from 'node:dns';
setDefaultResultOrder('ipv4first');
import {openWorkspace,allowed,fail} from './workspace.mjs';
import {createOfficialQueue} from './official-analysis.mjs';
import {summarize} from './summary.mjs';
import {makeBackup} from './backups.mjs';
import {initializeDemo} from './demo.mjs';
import {hostingConfig,securityHeaders,sessionCookie,clientIP,serveStatic} from './hosting.mjs';
import {enabledSources,searchSource,sourceDetail} from './multisources.mjs';
import {createServer} from 'node:http';
import {remoteURL,fetchPNCP} from './pncp.mjs';
import {openAuth,verifyPassword,hashPassword,token,permissions} from './auth.mjs';
const hosting=hostingConfig();const auth=openAuth();await initializeDemo(auth);const dummy=await hashPassword(token());let active=0,authActive=0;
const work=openWorkspace(auth);let summaryActive=false;
const officialQueue=createOfficialQueue(work,async(user,id,docs)=>{if(summaryActive)throw Error('Outra análise está em andamento. Solicite novamente.');summaryActive=true;try{return await summarize(work,user,id,docs);}finally{summaryActive=false;}});
if(process.env.BACKUP_ENABLED==='true'){try{makeBackup(auth,work.dir);}catch(e){console.error('Backup falhou: '+e.message);}setInterval(()=>{try{makeBackup(auth,work.dir);}catch(e){console.error('Backup falhou: '+e.message);}},3600000).unref();}
const origins=hosting.origins;
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>(req.url?.startsWith('/api/work/')?262144:16384))throw new Error('Corpo excede limite.');}return JSON.parse(data||'{}');}
export const server=createServer(async(req,res)=>{
 for(const [key,value] of Object.entries(securityHeaders(hosting.production)))res.setHeader(key,value);
 function reply(status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(JSON.stringify(data));}
 try {
 if(hosting.production?!hosting.hosts.has(req.headers.host||''):!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||''))return reply(403,{error:'Host não permitido.'});
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/health'&&req.method==='GET'){auth.db.prepare('SELECT 1').get();return reply(200,{ok:true});}
 if(hosting.production&&req.headers['x-forwarded-proto']!=='https'){res.writeHead(308,{Location:hosting.primary+u.pathname+u.search});return res.end();}
 if(!u.pathname.startsWith('/api/')){if(hosting.production&&await serveStatic(req,res,u))return;return reply(404,{error:'Página não encontrada.'});}
 if(req.method!=='GET'&&(!origins.has(req.headers.origin)||!(req.headers['content-type']?.startsWith('application/json')||(req.method==='POST'&&/^\/api\/work\/tenders\/[^/]+\/documents$/.test(u.pathname)&&req.headers['content-type']==='application/pdf'))))return reply(403,{error:'Origem ou formato não permitido.'});
 const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(hosting.cookieName+'='))?.slice(hosting.cookieName.length+1);
 if(u.pathname==='/api/auth/login'&&req.method==='POST'){
 const b=await body(req);const login=String(b.login||'').trim().toLowerCase();const ip=clientIP(req,hosting);
 if(auth.blocked('ip:'+ip)||auth.blocked('user:'+login))return reply(429,{error:'Muitas tentativas. Aguarde 15 minutos.'});
 if(authActive>=3)return reply(429,{error:'Aguarde e tente novamente.'});
 const user=auth.db.prepare('SELECT * FROM users WHERE login=?').get(login);let ok;authActive++;try{ok=await verifyPassword(b.password,user?.password||dummy);}finally{authActive--;}
 if(!ok||!user?.active){auth.fail('ip:'+ip);auth.fail('user:'+login);auth.audit('anônimo','Falha de login');return reply(401,{error:'Login ou senha inválidos.'});}
 auth.clear('user:'+login);const s=auth.createSession(user.id,b.remember===true);res.setHeader('Set-Cookie',sessionCookie(hosting,s.raw,b.remember===true));auth.audit(user.id,'Login concluído');work.event(auth.pub(user),'Login concluído',null);return reply(200,{user:auth.pub(user),csrf:s.csrf});
 }
 const session=auth.session(raw);
 if(!session)return reply(401,{error:'Entre com login e senha.'});
 if(req.method!=='GET'&&req.headers['x-csrf-token']!==session.csrf)return reply(403,{error:'Sessão inválida. Refaça o login.'});
 if(u.pathname==='/api/auth/me'&&req.method==='GET')return reply(200,session);
 if(u.pathname==='/api/auth/logout'&&req.method==='POST'){auth.logout(raw);auth.audit(session.user.id,'Logout concluído');work.event(session.user,'Logout concluído',null);res.setHeader('Set-Cookie',sessionCookie(hosting,''));return reply(200,{ok:true});}
 if(u.pathname==='/api/auth/password'&&req.method==='POST'){const b=await body(req);const user=auth.db.prepare('SELECT * FROM users WHERE id=?').get(session.user.id);if(!await verifyPassword(b.current,user.password))return reply(401,{error:'Senha atual inválida.'});const h=await hashPassword(b.next);auth.db.prepare('UPDATE users SET password=? WHERE id=?').run(h,user.id);auth.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);auth.audit(user.id,'Senha alterada e sessões encerradas');work.event(session.user,'Senha alterada',null);return reply(200,{ok:true});}
 if(u.pathname.startsWith('/api/work/')){
 if(!session.user.admin&&!session.user.permissoes.some(p=>['Buscar editais','Analisar editais','Registrar decisões','Montar propostas','Acessar documentos'].includes(p)))return reply(403,{error:'Nenhuma permissão de trabalho foi atribuída à sua conta.'});
 if(u.pathname==='/api/work/team'&&req.method==='GET')return reply(200,auth.users().filter(x=>x.ativo).map(x=>({id:x.id,nome:x.nome})));
 if(u.pathname==='/api/work/tenders'&&req.method==='GET')return reply(200,work.list());
 if(u.pathname==='/api/work/tenders'&&req.method==='POST')return reply(201,work.create(session.user,await body(req)));
 if(u.pathname==='/api/work/audit'&&req.method==='GET'){if(!session.user.admin)return reply(403,{error:'Auditoria exclusiva da administração.'});const actor=u.searchParams.get('actor')||'';const page=Math.max(1,Math.min(10000,Number(u.searchParams.get('page'))||1));return reply(200,work.db.prepare('SELECT * FROM activity WHERE (?=\'\' OR actor=?) ORDER BY id DESC LIMIT 100 OFFSET ?').all(actor,actor,(page-1)*100));}
 const m=u.pathname.match(/^\/api\/work\/tenders\/([^/]+)(?:\/(documents|comments|summary|official-analysis)(?:\/([^/]+))?)?$/);if(!m)return reply(404,{error:'Rota não encontrada.'});const id=decodeURIComponent(m[1]);
 if(!m[2]&&req.method==='GET')return reply(200,work.detail(session.user,id));
 if(!m[2]&&req.method==='PATCH')return reply(200,work.patch(session.user,id,await body(req)));
 if(m[2]==='official-analysis'&&req.method==='GET')return reply(200,officialQueue.status(id));
 if(m[2]==='official-analysis'&&req.method==='POST')return reply(202,officialQueue.start(session.user,id));
 if(m[2]==='comments'&&req.method==='POST'){const b=await body(req);work.comment(session.user,id,b.text);return reply(200,work.detail(session.user,id));}
 if(m[2]==='documents'&&!m[3]&&req.method==='POST'){if(!allowed(session.user,'Acessar documentos'))return reply(403,{error:'Sem permissão para documentos.'});let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>20*1024*1024)fail(413,'Limite: 20 MB por PDF.');chunks.push(c);}let name;try{name=decodeURIComponent(req.headers['x-file-name']||'');}catch{fail(400,'Nome inválido.');}return reply(201,work.upload(session.user,id,name,Buffer.concat(chunks)));}
 if(m[2]==='documents'&&m[3]&&req.method==='GET'){const d=work.document(session.user,id,m[3]);res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(d.metadata.name),'Content-Length':d.bytes.length,'Cache-Control':'no-store'});return res.end(d.bytes);}
 if(m[2]==='summary'&&req.method==='POST'){if(summaryActive)return reply(429,{error:'Outra análise está em andamento.'});const b=await body(req);summaryActive=true;try{return reply(200,await summarize(work,session.user,id,b.documentIds));}finally{summaryActive=false;}}
 return reply(405,{error:'Método não permitido.'});
 }
 if(u.pathname.startsWith('/api/admin/')){
 if(!session.user.admin)return reply(403,{error:'Acesso exclusivo da administradora.'});
 if(u.pathname==='/api/admin/users'&&req.method==='GET')return reply(200,auth.users());
 if(u.pathname==='/api/admin/audit'&&req.method==='GET')return reply(200,auth.db.prepare('SELECT time,actor,action FROM audit ORDER BY id DESC LIMIT 100').all());
 if(u.pathname==='/api/admin/users'&&req.method==='POST'){const b=await body(req);const login=String(b.login||'').toLowerCase();if(!/^[a-z0-9._-]{3,64}$/.test(login)||!b.name?.trim()||!/^\S+@\S+\.\S+$/.test(b.email||''))return reply(400,{error:'Dados inválidos.'});const h=await hashPassword(b.password);auth.db.prepare('INSERT INTO users(id,name,login,email,password,permissions) VALUES(?,?,?,?,?,?)').run(token(),b.name.trim(),login,b.email.trim().toLowerCase(),h,JSON.stringify((b.permissions||[]).filter(p=>permissions.includes(p))));auth.audit(session.user.id,'Funcionário criado');work.event(session.user,'Funcionário criado',null,{login,name:b.name.trim(),permissions:(b.permissions||[]).filter(p=>permissions.includes(p))});return reply(201,{ok:true});}
 if(u.pathname==='/api/admin/users'&&req.method==='PATCH'){const b=await body(req);const target=auth.db.prepare('SELECT * FROM users WHERE id=?').get(b.id);if(!target||target.admin)return reply(400,{error:'Perfil inválido ou administrador protegido.'});auth.db.prepare('UPDATE users SET active=?,permissions=? WHERE id=?').run(b.active===true?1:0,JSON.stringify((b.permissions||[]).filter(p=>permissions.includes(p))),b.id);auth.db.prepare('DELETE FROM sessions WHERE user_id=?').run(b.id);auth.audit(session.user.id,'Permissões/status alterados; sessões revogadas');work.event(session.user,'Permissões e acesso alterados',null,{targetId:target.id,before:{active:!!target.active,permissions:JSON.parse(target.permissions)},after:{active:b.active===true,permissions:(b.permissions||[]).filter(p=>permissions.includes(p))}});return reply(200,{ok:true});}
 }
 if(u.pathname.startsWith('/api/sources')){
 if(req.method!=='GET')return reply(405,{error:'Método não permitido.'});
 if(!session.user.admin&&!session.user.permissoes.includes('Buscar editais'))return reply(403,{error:'Sem permissão para buscar editais.'});
 if(u.pathname==='/api/sources')return reply(200,enabledSources);
 const m=u.pathname.match(/^\/api\/sources\/(am|mg|rs|sesc|rj)\/(search|detail)$/);
 if(!m)return reply(404,{error:'Fonte não encontrada.'});
 if(active>=1)return reply(429,{error:'Aguarde as consultas em andamento.'});
 work.event(session.user,'Consulta em fonte complementar',null,{source:m[1],action:m[2],query:u.searchParams.get('q')||''});active++;try{return reply(200,m[2]==='search'?await searchSource(m[1],u.searchParams.get('q'),Number(u.searchParams.get('page')||1)):await sourceDetail(m[1],u.searchParams.get('id')||''));}catch(e){return reply(502,{error:e.message});}finally{active--;}
 }
 if(u.pathname.startsWith('/api/pncp-proxy/')){if(!session.user.admin&&!session.user.permissoes.includes('Buscar editais'))return reply(403,{error:'Sem permissão para buscar editais.'});let remote;try{remote=remoteURL(req.url);}catch(e){return reply(400,{error:e.message});}if(active>=4)return reply(429,{error:'Aguarde as consultas.'});work.event(session.user,'Consulta PNCP',null,{path:remote.pathname,query:remote.search});active++;try{return reply(200,await fetchPNCP(remote));}catch(e){console.error('PNCP falhou:',e.cause?.code||e.code||e.message);return reply(502,{error:'Falha ao consultar PNCP: '+(e.cause?.code||e.message)});}finally{active--;}}
 return reply(404,{error:'Rota não encontrada.'});
 }catch(e){reply(e.status||400,{error:e.status?e.message:e.code?.includes('CONSTRAINT')?'Login ou e-mail já cadastrado.':'Operação inválida. Confira os dados e tente novamente.'});}
});

server.listen(Number(process.env.PORT||3001),hosting.production?'0.0.0.0':'127.0.0.1',()=>console.log('Servidor Maracanãs pronto na porta '+Number(process.env.PORT||3001)));
process.on('SIGTERM',()=>server.close(()=>{auth.db.close();process.exit(0);}));
