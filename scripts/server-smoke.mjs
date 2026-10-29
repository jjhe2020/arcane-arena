import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const port=4191,url=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',s=>output+=s);child.stderr.on('data',s=>output+=s);
try{
 let ready=false;
 for(let i=0;i<50;i++){try{ready=(await fetch(url)).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert(ready,output);
 const raw=await fetch(`${url}/data/skills.json`,{headers:{'Accept-Encoding':'identity'}});
 const length=Number(raw.headers.get('content-length'));
 assert.equal((await raw.json()).length,230);
 const compressed=await fetch(`${url}/data/skills.json`,{headers:{'Accept-Encoding':'gzip'}});
 assert.equal(compressed.headers.get('content-encoding'),'gzip');assert.equal((await compressed.json()).length,230);
 const etag=compressed.headers.get('etag');assert(etag);
 assert.equal((await fetch(`${url}/data/skills.json`,{headers:{'If-None-Match':etag}})).status,304);
 const head=await fetch(`${url}/data/skills.json`,{method:'HEAD',headers:{'Accept-Encoding':'identity'}});
 assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),length);assert.equal(await head.text(),'');
 assert.equal((await fetch(`${url}/`,{method:'POST'})).status,405);
 assert.equal((await fetch(`${url}/%00`)).status,400);assert.equal((await fetch(url)).status,200);
 await fs.mkdir('artifacts',{recursive:true});const report={status:'passed',checks:['230-item JSON gzip delivery','ETag conditional revalidation','HEAD metadata without body','405 unsupported method','invalid path cannot crash server'],bytes:length};
 await fs.writeFile('artifacts/server-smoke.json',JSON.stringify(report,null,2));console.log(report);
}finally{child.kill();}
