import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const project=fileURLToPath(new URL('../',import.meta.url));
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** A code-native vector frame embedded in a standalone icon asset. Original
 * bitmap pixels are carried losslessly as data; no runtime CSS overlay. */
function framedSVG(definition,source){
 const content=source?`<image x="0" y="0" width="128" height="128" href="data:image/webp;base64,${source.toString('base64')}"/>`:`<rect width="128" height="128" fill="#231b30"/><text x="64" y="78" text-anchor="middle" fill="#f8ebc4" font-size="40" font-family="sans-serif">${xml(definition.name.slice(0,2))}</text>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="128" height="128" viewBox="0 0 128 128"><title>${xml(definition.name)} · 终极技能</title>${content}<path d="M17 6H111L122 17V111L111 122H17L6 111V17Z" fill="none" stroke="#21112c" stroke-width="10"/><path d="M17 6H111L122 17V111L111 122H17L6 111V17Z" fill="none" stroke="#bc81ee" stroke-width="5"/><path d="M19 10H109L118 19V109L109 118H19L10 109V19Z" fill="none" stroke="#f9e8ab" stroke-width="2"/><path d="M64 3L71 10L64 17L57 10Z" fill="#ffdc81" stroke="#3a183f" stroke-width="2"/></svg>\n`;
}
export async function compileUltimateIcons({check=false,root=project}={}){
 const main=JSON.parse(await fs.readFile(path.join(root,'public/data/skills.json'),'utf8'));
 const server=await createServer({root,configFile:path.join(root,'vite.config.ts'),server:{middlewareMode:true},logLevel:'error'});
 let granted;try{granted=(await server.ssrLoadModule('/src/skill-effects.ts')).GRANTED_SKILL_DEFINITIONS;}finally{await server.close();}
 const definitions=[...new Map([...granted,...main].map(d=>[d.id,d])).values()].filter(d=>d.ultimate).sort((a,b)=>a.id.localeCompare(b.id));
 const icons={},outputs=new Map();
 for(const d of definitions){
  if(!/^[a-z0-9_]+$/.test(d.id))throw Error('Invalid ultimate icon ID '+d.id);
  let source;
  if(d.icon){const sourcePath=path.resolve(root,'public','.'+d.icon),publicRoot=path.resolve(root,'public')+path.sep;if(!sourcePath.startsWith(publicRoot)||!d.icon.endsWith('.webp'))throw Error('Unsupported ultimate icon source '+d.icon);source=await fs.readFile(sourcePath);}
  const framed=`/art/icons/ultimate/${d.id}.svg`,bytes=Buffer.from(framedSVG(d,source));
  icons[d.id]={source:d.icon??'',framed,sourceSha256:source?sha(source):null,sha256:sha(bytes)};outputs.set('public'+framed,bytes);
 }
 const manifest=Buffer.from(JSON.stringify({schemaVersion:1,frameRevision:1,icons},null,2)+'\n');outputs.set('src/data/ultimate-icons.json',manifest);outputs.set('public/data/ultimate-icons.json',manifest);
 for(const [relative,bytes]of outputs){const file=path.join(root,relative);if(check){let actual;try{actual=await fs.readFile(file);}catch{}if(!actual?.equals(bytes))throw Error(`大招图标未编译：${relative}；请运行 npm run config:compile`);}else{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}}
 return{count:definitions.length};
}
