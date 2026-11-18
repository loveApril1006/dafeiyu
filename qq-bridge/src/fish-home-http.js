import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const files=Object.freeze({
 '/fish-home-assets/fish-hq-furniture.js':['src/fish-hq-furniture.js','text/javascript; charset=utf-8'],
 '/fish-home-assets/fish-hq.css':['public/fish-hq.css','text/css; charset=utf-8'],
 '/fish-home-assets/fish-hq-ui.js':['public/fish-hq-ui.js','text/javascript; charset=utf-8'],
 '/fish-home-assets/fish-hq-scene.js':['public/fish-hq-scene.js','text/javascript; charset=utf-8'],
 '/fish-home-assets/fish-hq-layout.js':['src/fish-hq-layout.js','text/javascript; charset=utf-8'],
 '/fish-home-assets/fish-home.css':['public/fish-home.css','text/css; charset=utf-8'],
 '/fish-home-assets/fish-home-ui.js':['public/fish-home-ui.js','text/javascript; charset=utf-8'],
 '/fish-home-assets/fish-home-scene.js':['public/fish-home-scene.js','text/javascript; charset=utf-8'],
 '/fish-home-assets/fish-home-space.js':['src/fish-home-space.js','text/javascript; charset=utf-8'],
 '/fish-home-assets/vendor/three.module.js':['public/vendor/three/three.module.js','text/javascript; charset=utf-8'],
 '/fish-home-assets/vendor/three.core.js':['public/vendor/three/three.core.js','text/javascript; charset=utf-8'],
 '/fish-home-assets/vendor/OrbitControls.js':['public/vendor/three/OrbitControls.js','text/javascript; charset=utf-8']
});
const cache=new Map();
export function serveFishHomeAsset(req,res,url,{root,headers={}}){const entry=files[url.pathname];if(!entry)return false;if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{...headers,Allow:'GET, HEAD'});res.end();return true;}try{const file=path.join(root,entry[0]),stat=fs.statSync(file),version=stat.mtimeMs+':'+stat.size;let value=cache.get(file);if(value?.version!==version){const body=fs.readFileSync(file);value={version,body,etag:'"'+createHash('sha256').update(body).digest('hex')+'"'};cache.set(file,value);}const h={...headers,'content-type':entry[1],'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=0, must-revalidate',ETag:value.etag};if(req.headers['if-none-match']===value.etag){res.writeHead(304,h);res.end();}else{res.writeHead(200,{...h,'content-length':value.body.length});res.end(req.method==='HEAD'?undefined:value.body);}}catch{res.writeHead(503,{...headers,'content-type':'text/plain; charset=utf-8'});res.end('Fish home asset unavailable');}return true;}
