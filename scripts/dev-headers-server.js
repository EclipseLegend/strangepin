// Minimal static server that applies a Netlify-style _headers file (path globs "/*" and exact paths only).
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=process.argv[2],PORT=+process.argv[3]||8093;
function parse(txt){const rules=[];let cur=null;for(const raw of txt.split('\n')){const l=raw.replace(/\s+$/,'');if(!l||l.trim().startsWith('#'))continue;if(!/^\s/.test(l)){cur={pat:l.trim(),h:{}};rules.push(cur);}else{const i=l.indexOf(':');cur.h[l.slice(0,i).trim()]=l.slice(i+1).trim();}}return rules;}
const rules=parse(fs.readFileSync(path.join(ROOT,'_headers'),'utf8'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.xml':'application/xml','.txt':'text/plain','.css':'text/css'};
http.createServer((q,r)=>{let p=decodeURIComponent(new URL(q.url,'http://x').pathname);let f=path.join(ROOT,p);if(!f.startsWith(ROOT)){r.writeHead(403);return r.end();}
if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
const h={};for(const ru of rules){if(ru.pat==='/*'||ru.pat===p)Object.assign(h,ru.h);}
if(!fs.existsSync(f)){r.writeHead(404,h);return r.end('not found');}
h['Content-Type']=types[path.extname(f)]||'application/octet-stream';r.writeHead(200,h);fs.createReadStream(f).pipe(r);}).listen(PORT,'127.0.0.1',()=>console.log('listening',PORT));
