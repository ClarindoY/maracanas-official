import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openAuth,verifyPassword} from '../server/auth.mjs';
import {initializeDemo} from '../server/demo.mjs';
import {hostingConfig} from '../server/hosting.mjs';
test('demo exige senha privada, recria conta e revoga sessões após troca do segredo',async()=>{
 const cfg={NODE_ENV:'production',APP_ORIGIN:'https://demo.test',DEMO_MODE:'true',ER_AUTH_DB:'/tmp/maracanas-demo/auth.sqlite'};
 assert.equal(hostingConfig(cfg).production,true);
 assert.throws(()=>hostingConfig({...cfg,ER_AUTH_DB:'/tmp/outro.sqlite'}),/isolado/);
 const auth=openAuth(':memory:');
 try{
 await assert.rejects(initializeDemo(auth,{DEMO_MODE:'true'}),/Senha/);
 const env={DEMO_MODE:'true',DEMO_PASSWORD:'teste-exclusivo-12345'};
 await initializeDemo(auth,env);
 const user=auth.db.prepare('SELECT * FROM users').get();assert.equal(user.login,'demonstracao');assert.equal(user.admin,1);
 assert.equal(await verifyPassword(env.DEMO_PASSWORD,user.password),true);
 const session=auth.createSession(user.id,false);
 await initializeDemo(auth,env);assert.ok(auth.session(session.raw));
 await initializeDemo(auth,{...env,DEMO_PASSWORD:'outro-segredo-12345'});assert.equal(auth.session(session.raw),null);
 assert.equal(auth.users().length,1);
 }finally{auth.db.close();}
});
