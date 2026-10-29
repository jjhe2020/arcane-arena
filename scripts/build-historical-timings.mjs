import fs from 'node:fs';
const source=JSON.parse(fs.readFileSync('references/dota-20230216/parsed/npc_abilities.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('public/data/skills.json','utf8'));
const raw=source.data.DOTAAbilities,abilities={},missing=[];
for(const d of catalog){const keys=[d.catalog?.icon,d.id.replace(/^custom_/,''),d.id].filter(k=>typeof k==='string');const id=keys.find(k=>raw[k]);const entry=id?raw[id]:null;
 const value=entry?.AbilityCastPoint;const seconds=typeof value==='string'?value.split(/\s+/).filter(Boolean).map(Number):[];
 if(seconds.length&&seconds.every(n=>Number.isFinite(n)&&n>=0)){abilities[d.id]={sourceAbilityId:id,seconds,line:source.locations[`/DOTAAbilities/${id}/AbilityCastPoint`],note:'Historical Dota fallback only; explicit AA/program cast timings take priority.'};}else missing.push(d.id);
}
const out={source:{commit:source.source.commit,date:source.source.commitDate,sha256:source.source.sha256,sourceUrl:source.source.sourceUrl,notVerifiedAsAAMatchingPatch:true},abilities,missing,normalLevelMapping:'For a four-level Dota timing array, project AA point levels 1/2/3 use reference indices 0/1/3 (Standard uses reference max level); a one-value timing stays constant.'};
fs.mkdirSync('src/data',{recursive:true});fs.writeFileSync('src/data/historical-cast-points.json',JSON.stringify(out,null,2));console.log({matched:Object.keys(abilities).length,missing:missing.length});
