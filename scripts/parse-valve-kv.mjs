import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export function parseKV(text){
 let pos=0,line=1;const tokens=[];
 const advance=()=>{const c=text[pos++];if(c==='\n')line++;return c;};
 while(pos<text.length){const c=text[pos];if(/\s/.test(c)){advance();continue;}
  if(c==='/'&&text[pos+1]==='/'){while(pos<text.length&&advance()!=='\n'){}continue;}
  if(c==='/'&&text[pos+1]==='*'){advance();advance();while(pos<text.length&&!(text[pos]==='*'&&text[pos+1]==='/'))advance();if(pos>=text.length)throw Error('Unclosed comment');advance();advance();continue;}
  const startLine=line;if(c==='{'||c==='}'){tokens.push({text:advance(),line:startLine,brace:true});continue;}
  if(c==='"'){advance();let value='',closed=false;while(pos<text.length){let ch=advance();if(ch==='"'){closed=true;break;}if(ch==='\\'){const next=advance();value+=next==='n'?'\n':next==='t'?'\t':next==='r'?'\r':next==='"'?'"':next==='\\'?'\\':'\\'+next;}else value+=ch;}if(!closed)throw Error(`Unclosed string at ${startLine}`);tokens.push({text:value,line:startLine});continue;}
  let value='';while(pos<text.length&&!/\s|[{}]/.test(text[pos]))value+=advance();tokens.push({text:value,line:startLine});
 }
 let at=0;const duplicates=[],locations={},conditions=[];
 const pointer=s=>s.replace(/~/g,'~0').replace(/\//g,'~1');
 function object(prefix,nested){const out=Object.create(null);while(at<tokens.length){const key=tokens[at++];if(key.brace&&key.text==='}'){if(!nested)throw Error(`Unexpected close brace at ${key.line}`);return out;}if(key.brace)throw Error(`Unexpected open brace at ${key.line}`);if(/^\[.*\]$/.test(key.text)){conditions.push({path:prefix,value:key.text,line:key.line});continue;}
   const token=tokens[at++];if(!token||token.text==='}')throw Error(`Missing value for ${key.text} at ${key.line}`);const p=`${prefix}/${pointer(key.text)}`;
   const value=token.brace&&token.text==='{'?object(p,true):token.text;
   if(Object.hasOwn(out,key.text)){let duplicate=duplicates.find(x=>x.path===p);if(!duplicate){duplicate={path:p,values:[out[key.text]],lines:[locations[p]]};duplicates.push(duplicate);}duplicate.values.push(value);duplicate.lines.push(key.line);}
   out[key.text]=value;locations[p]=key.line;
   if(at<tokens.length&&/^\[.*\]$/.test(tokens[at].text)){const c=tokens[at++];conditions.push({path:p,value:c.text,line:c.line});}
  }if(nested)throw Error(`Unclosed object ${prefix}`);return out;}
 return{data:object('',false),duplicates,conditions,locations};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dir=path.resolve('references/dota-20230216');fs.mkdirSync(path.join(dir,'parsed'),{recursive:true});const entries=[];
 const blobs={'items.txt':'9e257199f59aa8290f336fe3e61543e10cf0d50b','npc_abilities.txt':'ae43f94db278763c22e84c464df74e3ace890d44','npc_units.txt':'bd39899403639cf1f441f08e5a4a4367845b3f0d','npc_heroes.txt':'2d5227eadf09b29b62494cdffcc9c8b2ed33a9e6','abilities_english.txt':'4c7939d76ea6bc733b3926dc0e8e186ad66a9dcb','items_english.txt':'86b1a69c6bd4bf47c2536f0a6d9b1c035a9ac276'};
 for(const [name,expectedBlob] of Object.entries(blobs)){const file=path.join(dir,name),bytes=fs.readFileSync(file),text=bytes.toString('utf8');const parsed=parseKV(text);const sub=name.endsWith('_english.txt')?'resource/localization':'scripts/npc';const meta={file:name,commit:'6abdd9d13de2f4330ca748082467b9ff6e6cd928',commitDate:'2023-02-10T01:16:45Z',sourceUrl:`https://github.com/SteamTracking/GameTracking-Dota2/blob/6abdd9d13de2f4330ca748082467b9ff6e6cd928/game/dota/pak01_dir/${sub}/${name}`,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),gitBlobSha:crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),warning:'Historical shipped Dota KV mirror; not proven to match the AA snapshot. String values preserved; duplicate keys and platform conditions are recorded, not silently interpreted.'};if(meta.gitBlobSha!==expectedBlob)throw Error(`Git blob integrity mismatch: ${name}`);fs.writeFileSync(path.join(dir,'parsed',name.replace('.txt','.json')),JSON.stringify({source:meta,...parsed},null,2));entries.push({...meta,topKeys:Object.keys(parsed.data),fieldCount:Object.keys(parsed.locations).length,duplicateCount:parsed.duplicates.length,conditionCount:parsed.conditions.length});}
 fs.writeFileSync(path.join(dir,'sources.json'),JSON.stringify(entries,null,2));console.log(JSON.stringify(entries.map(({file,fieldCount,duplicateCount,conditionCount,gitBlobSha})=>({file,fieldCount,duplicateCount,conditionCount,gitBlobSha})),null,2));
}
