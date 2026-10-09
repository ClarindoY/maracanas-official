import {mkdirSync,readdirSync,rmSync,cpSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
export function makeBackup(auth,documents,base=resolve(dirname(process.env.ER_AUTH_DB||'data/auth.sqlite'),'backups'),force=false){
 mkdirSync(base,{recursive:true});const day=new Date().toISOString().slice(0,10);const good=()=>readdirSync(base).filter(n=>/^\d{4}-\d{2}-\d{2}T/.test(n)).sort();if(!force&&good().some(n=>n.startsWith(day)))return;
 const name=new Date().toISOString().replace(/[:.]/g,'-'),tmp=resolve(base,'.partial-'+name),out=resolve(base,name);mkdirSync(tmp);try{
 auth.db.exec("VACUUM INTO '"+resolve(tmp,'auth.sqlite').replaceAll("'","''")+"'");cpSync(documents,resolve(tmp,'documents'),{recursive:true});writeFileSync(resolve(tmp,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),includes:['accounts','tenders','documents','activity','comments'],complete:true}));renameSync(tmp,out);for(const n of good().slice(0,-10))rmSync(resolve(base,n),{recursive:true});return name;
 }catch(e){rmSync(tmp,{recursive:true,force:true});throw e;}
}
