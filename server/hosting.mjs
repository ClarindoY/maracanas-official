import {resolve,sep,extname} from 'node:path';
import {stat,readFile} from 'node:fs/promises';
import {isIP} from 'node:net';

export function hostingConfig(env=process.env){
 const production=env.NODE_ENV==='production';
 const urls=[env.RENDER_EXTERNAL_URL,env.APP_ORIGIN].filter(Boolean);
 const origins=new Set(production?[]:['http://localhost:5173','http://127.0.0.1:5173','http://localhost:3001','http://127.0.0.1:3001']);
 for(const value of urls){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Domínio de produção deve ser uma origem HTTPS válida.');origins.add(u.origin);}
 if(production&&!origins.size)throw Error('Configure APP_ORIGIN ou RENDER_EXTERNAL_URL antes de iniciar.');
 const demo=env.DEMO_MODE==='true';
 if(production&&demo&&env.ER_AUTH_DB!=='/tmp/maracanas-demo/auth.sqlite')throw Error('Demonstração exige banco temporário isolado.');
 if(production&&!demo&&!env.ER_AUTH_DB?.startsWith('/var/data/'))throw Error('Produção exige ER_AUTH_DB no disco persistente /var/data.');
 return {production,origins,hosts:new Set([...origins].map(x=>new URL(x).host)),primary:urls.length?new URL(urls[0]).origin:null,cookieName:production?'__Host-er_session':'er_session',trustRender:env.RENDER==='true'};
}
export function securityHeaders(production){return {
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 ...(production?{'Strict-Transport-Security':'max-age=31536000','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}:{}),
};}
export function sessionCookie(config,value,remember=false){return `${config.cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/${config.production?'; Secure':''}${value?(remember?'; Max-Age=604800':''):'; Max-Age=0'}`;}
export function clientIP(req,config){
 // Render terminates HTTPS and owns the final forwarding hop. Never trust proxy headers locally.
 if(config.trustRender){const value=String(req.headers['x-forwarded-for']||'').split(',').at(-1)?.trim();if(isIP(value))return value;}
 return req.socket.remoteAddress||'local';
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
export async function serveStatic(req,res,url,dist=resolve('dist')){
 if(!['GET','HEAD'].includes(req.method))return false;
 let path;try{path=decodeURIComponent(url.pathname);}catch{return false;}
 if(path.includes('\0')||path.includes('\\')||path.split('/').some(s=>s.startsWith('.')))return false;
 let file=resolve(dist,'.'+path);
 if(file!==dist&&!file.startsWith(dist+sep))return false;
 if(path==='/'||!extname(path))file=resolve(dist,'index.html');
 const ext=extname(file);if(!types[ext])return false;
 let s;try{s=await stat(file);}catch{return false;}if(!s.isFile())return false;
 res.writeHead(200,{'Content-Type':types[ext],'Content-Length':s.size,'Cache-Control':ext==='.html'?'no-store':'public, max-age=86400'});
 res.end(req.method==='HEAD'?undefined:await readFile(file));return true;
}
