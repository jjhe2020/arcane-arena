import {createHash} from 'node:crypto';
import {readFile, readdir, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Plugin} from 'vite';

/** Inventory the actual build, including every lazily loaded texture. */
export function offlineBuild():Plugin{
 let outDir='';
 return {
  name:'arena-offline-build',apply:'build',
  configResolved(config){outDir=path.resolve(config.root,config.build.outDir);},
  async closeBundle(){
   const files:{url:string;bytes:number;sha256:string}[]=[],hash=createHash('sha256');
   async function walk(dir:string){
    for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
     const file=path.join(dir,entry.name);
     if(entry.isDirectory()){await walk(file);continue;}
     const url='/'+path.relative(outDir,file).split(path.sep).join('/');
     if(!/\.(?:html|js|css|json|webmanifest|webp|png|svg)$/i.test(url)||url.endsWith('.source.json')||url.startsWith('/art/')&&url.endsWith('.json')||['/sw.js','/offline-assets.json'].includes(url))continue;
     const data=await readFile(file);hash.update(url).update(data);files.push({url,bytes:(await stat(file)).size,sha256:createHash('sha256').update(data).digest('hex')});
    }
   }
   await walk(outDir);
   const shell=files.filter(f=>f.url==='/index.html'||f.url.startsWith('/assets/')||f.url.startsWith('/pwa/')||f.url==='/manifest.webmanifest'||['/data/assets.json','/data/skills.json'].includes(f.url)).map(f=>f.url);
   const manifest={version:hash.digest('hex').slice(0,20),totalBytes:files.reduce((n,f)=>n+f.bytes,0),files,shell};
   const worker=await readFile(new URL('./pwa-worker.js',import.meta.url),'utf8');
   await writeFile(path.join(outDir,'offline-assets.json'),JSON.stringify(manifest));
   await writeFile(path.join(outDir,'sw.js'),worker.replace('/* OFFLINE_MANIFEST */',JSON.stringify(manifest)));
   console.log(`PWA: ${files.length} runtime files, ${(manifest.totalBytes/1024/1024).toFixed(1)} MiB; version ${manifest.version}`);
  }
 };
}
