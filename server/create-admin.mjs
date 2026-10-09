import {createInterface} from 'node:readline/promises';
import {openAuth,hashPassword,token,permissions} from './auth.mjs';
const store=openAuth();if(store.db.prepare('SELECT id FROM users WHERE admin=1').get()){console.error('Administradora já configurada.');process.exit(1);}
const rl=createInterface({input:process.stdin,output:process.stdout});
const name=(await rl.question('Nome: ')).trim();const login=(await rl.question('Login (letras, números, ponto ou traço): ')).trim().toLowerCase();const email=(await rl.question('E-mail de recuperação: ')).trim().toLowerCase();rl.close();
if(!name||!/^[a-z0-9._-]{3,64}$/.test(login)||!/^\S+@\S+\.\S+$/.test(email))throw new Error('Dados inválidos.');
process.stdout.write('Senha (mínimo 12 caracteres, entrada oculta): ');
if(!process.stdin.isTTY)throw new Error('Execute em terminal interativo.');
process.stdin.setRawMode(true);process.stdin.resume();
const password=await new Promise((resolve,reject)=>{let value='';function listener(chunk){for(const c of chunk.toString()){if(c==='\u0003'){process.stdin.setRawMode(false);reject(new Error('Cancelado'));return;}if(c==='\r'||c==='\n'){process.stdin.off('data',listener);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(value);return;}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c>=' ')value+=c;}}process.stdin.on('data',listener);});
const hash=await hashPassword(password);const id=token();store.db.prepare('INSERT INTO users(id,name,login,email,password,admin,permissions) VALUES(?,?,?,?,?,1,?)').run(id,name,login,email,hash,JSON.stringify(permissions));store.audit(id,'Administradora criada pelo terminal');store.db.close();console.log('Administradora criada. Nenhuma senha foi gravada em texto puro.');
