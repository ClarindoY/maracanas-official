import {hashPassword,token,permissions} from './auth.mjs';
export async function initializeDemo(auth,env=process.env){
 if(env.DEMO_MODE!=='true')return;
 const login=String(env.DEMO_LOGIN||'demonstracao').trim().toLowerCase();
 if(!/^[a-z0-9._-]{3,64}$/.test(login))throw Error('DEMO_LOGIN inválido.');
 const password=await hashPassword(env.DEMO_PASSWORD);
 const existing=auth.db.prepare('SELECT * FROM users WHERE login=?').get(login);
 if(existing){
  if(!existing.admin)throw Error('Conta de demonstração conflita com funcionário.');
  // Preserve sessions when the configured secret has not changed.
  const {verifyPassword}=await import('./auth.mjs');
  if(!await verifyPassword(env.DEMO_PASSWORD,existing.password)){
   auth.db.prepare('UPDATE users SET password=?,active=1 WHERE id=?').run(password,existing.id);
   auth.db.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);
  }
  return;
 }
 auth.db.prepare('INSERT INTO users(id,name,login,email,password,admin,permissions) VALUES(?,?,?,?,?,1,?)').run(token(),'Demonstração Maracanãs',login,'demo@maracanas.invalid',password,JSON.stringify(permissions));
 auth.audit('sistema','Conta de demonstração inicializada');
}
