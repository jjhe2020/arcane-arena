import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {rangeAuditProvenance} from './range-audit-instrumentation.mjs';
import ts from 'typescript';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=async name=>JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const normalize=value=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
const distanceUnit=unit=>/Dota单位/.test(unit)&&!/(?:每秒|\/秒)/.test(unit);
const requirementText=requirement=>requirement.rule??requirement.mechanism??requirement.description??'';
const explicitOverrides={
 'dragon_knight_elder_dragon_form:SPLASH RADIUS':{reason:'AA Season 4 explicitly reduces base splash radius from 350 to 250; Super adds 100. Preserve final 250/350 values.',url:'https://news.abilityarena.com/ability-arena-season-4/'},
 'custom_tiny_toss:GRAB RADIUS':{reason:'Captured AA custom pickup uses 275; Gaben explicitly uses 300. The separate historical native KV grab_radius=300 is comparison only.',url:'references/dota-wiki/acceptance/motion-scope.json'}
};
const numbers=value=>String(typeof value==='object'?value?.value??'':value??'').match(/-?\d+(?:\.\d+)?/g)?.map(Number)??[];
const at=(values,rank)=>values[Math.min(Math.max(0,rank-1),values.length-1)];
const server=await createServer({root,plugins:[rangeAuditProvenance(root)],server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[],entries:[]}});
try{
 const [config,schema,baseline,assets,historical,sources,catalog,{getSkillProgram,GRANTED_SKILL_DEFINITIONS},{createBattle,stepBattle,getSkillRange},{worldVisuals,zoneVisuals},{SIMULATION_REVISION}]=await Promise.all([
  read('src/generated/game-config.json'),read('config/schema.json'),read('config/reference/migration-baseline.json'),read('public/data/assets.json'),read('references/dota-20230216/parsed/npc_abilities.json'),read('references/dota-20230216/sources.json'),read('public/data/skills.json'),server.ssrLoadModule('/src/skill-effects.ts'),server.ssrLoadModule('/src/combat.ts'),server.ssrLoadModule('/src/visual-bindings.ts'),server.ssrLoadModule('/src/simulation-version.ts')
 ]);
 const acceptance=new Map();
 for(const filename of (await fs.readdir(path.join(root,'references/dota-wiki/acceptance'))).filter(f=>f.endsWith('.json'))){const group=await read(`references/dota-wiki/acceptance/${filename}`);for(const skill of group.skills??[])acceptance.set(skill.id,{...skill,file:`references/dota-wiki/acceptance/${filename}`});}
 const sourceTexts=[];
 async function walk(directory){for(const entry of await fs.readdir(path.join(root,directory),{withFileTypes:true})){const name=`${directory}/${entry.name}`;if(entry.isDirectory())await walk(name);else if(name.endsWith('.ts')&&!name.endsWith('.test.ts'))sourceTexts.push({file:name,text:await fs.readFile(path.join(root,name),'utf8')});}}
 await walk('src');
 const currentSnapshot=await read('references/dota-wiki/r13-current-valve-range-snapshot.json'),currentById=new Map();
 for(const hero of currentSnapshot.records)for(const ability of hero.abilities){const existing=currentById.get(ability.name)??[];existing.push({hero:hero.hero,source:hero.source,ability});currentById.set(ability.name,existing);}
 const syntaxByFile=new Map(sourceTexts.map(({file,text})=>[file,ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true)]));
 function geometryOperations(location){
  const source=location&&syntaxByFile.get(location.file);if(!source)return[];
  let callback;const locate=node=>{if((ts.isArrowFunction(node)||ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node))&&source.getLineAndCharacterOfPosition(node.getStart(source)).line+1===location.line&&!callback)callback=node;ts.forEachChild(node,locate);};locate(source);
  const operations=[];const visit=node=>{
   if(ts.isCallExpression(node)&&/\b(zone|near|around|dist|distance|hypot|projectile|line|warp|moveContinuous|leap|blink|teleport|move|inside|segment|annulus|cone|radius)\b/i.test(node.expression.getText(source)))operations.push({line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,expression:node.getText(source)});
   if(ts.isBinaryExpression(node)&&/^(?:<|>|<=|>=)$/.test(node.operatorToken.getText(source))&&/\b(range|radius|width|length|distance|dist|along|across)\b/i.test(node.getText(source)))operations.push({line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,expression:node.getText(source)});
   ts.forEachChild(node,visit);
  };if(callback)visit(callback);return operations;
 }
 // Match createBattle: purchasable definitions override same-ID research
 // references, rather than letting reference-only native rows shadow AA.
 const definitionById=new Map([...GRANTED_SKILL_DEFINITIONS,...catalog].map(d=>[d.id,d]));
 const nativeById=new Map(baseline.granted.map(d=>[d.id,d]));
 const failures=[],skills=[],referenceOnly=[];
 const inputHashes={config:config.hash,assets:digest(assets),schema:digest(schema),radialCalibration:digest(await read('src/radial-art-calibration.json')),zoneCalibration:digest(await read('src/zone-art-calibration.json')),currentValveSnapshot:currentSnapshot.retainedRecordsCanonicalSha256,currentValveSnapshotFile:digest(currentSnapshot),auditScript:digest(await fs.readFile(fileURLToPath(import.meta.url),'utf8')),instrumentation:digest(await fs.readFile(path.join(root,'scripts/range-audit-instrumentation.mjs'),'utf8'))};
 const coreHash=digest([sourceTexts.map(({file,text})=>[file,text.replaceAll('\r\n','\n')]),inputHashes]);
 const player=(id,skill,rank)=>({id,name:`range-probe-${id}`,hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:[0,1,2].map(i=>({id:`h${id}-${i}`,name:`probe${id}-${i}`,role:i?'tank':'mage',skin:'female',x:i?i*3:0,y:-2-i*2,persistentStrengthBonus:1000,persistentIntelligenceBonus:1000,skills:id===0&&i===0?[{id:skill,points:rank}]:[]}))});
 for(const [signature,entry]of Object.entries(schema.skills)){
  const ref=entry.domain==='native'&&nativeById.get(entry.id)?.referenceOnly===true;
  const definition=ref?nativeById.get(entry.id):definitionById.get(entry.id)??nativeById.get(entry.id),program=ref?undefined:getSkillProgram(entry.id),rows=(entry.domain==='aa'?config.skills:config.nativeSkills)[entry.id];
  const audit=acceptance.get(entry.id),nativeId=entry.id.replace(/^custom_/,'');
  const sourceDefinition=entry.domain==='aa'?baseline.skills.find(d=>d.id===entry.id):nativeById.get(entry.id);
  const historicalId=[entry.id,nativeId,sourceDefinition?.historicalSource?.id,sourceDefinition?.catalog?.icon].filter(Boolean).find(id=>historical.data.DOTAAbilities[id]);
  const native=historicalId?historical.data.DOTAAbilities[historicalId]:undefined;
  const currentCandidates=[entry.id,nativeId,sourceDefinition?.historicalSource?.id,sourceDefinition?.catalog?.id,sourceDefinition?.catalog?.icon].filter(Boolean),currentId=currentCandidates.find(id=>currentById.has(id)),currentMatches=currentId?currentById.get(currentId):[],current=currentMatches[0]?.ability;
  const currentValues=new Map();for(const value of current?.special_values??[]){currentValues.set(normalize(value.name),value);if(value.heading_loc)currentValues.set(normalize(value.heading_loc),value);}
  const aaValues=new Map((sourceDefinition?.catalog?.values??[]).map(line=>{const colon=line.indexOf(':');return[normalize(line.slice(0,colon)),numbers(line.slice(colon+1))];}));
  const nativeValues=new Map(Object.entries(native?.AbilityValues??{}).map(([key,value])=>[normalize(key),numbers(value)]));
  if(native?.AbilitySpecial)for(const block of Object.values(native.AbilitySpecial))for(const [key,value]of Object.entries(block))if(key!=='var_type')nativeValues.set(normalize(key),numbers(value));
  const sourceLocations=sourceTexts.flatMap(({file,text})=>{const token=`'${entry.id}'`,double=`"${entry.id}"`,index=Math.max(text.indexOf(token),text.indexOf(double));return index<0?[]:[{file,line:text.slice(0,index).split('\n').length}];});
  const callbacks=Object.entries(program??{}).filter(([,v])=>typeof v==='function').map(([key,value])=>({hook:key,source:value.__rangeAuditLocation??null,geometryOperations:geometryOperations(value.__rangeAuditLocation),sha256:digest(value.toString()),geometryTokens:[...new Set(value.toString().match(/\b(?:radius|range|width|length|distance|dist|near|around|zone|projectile|cone|halfWidth|endWidth|startWidth)\b/gi)??[])]}));
  const parameters=entry.params.filter(p=>distanceUnit(p.unit));
  const record={id:entry.id,name:definition?.name??sourceDefinition?.name??entry.id,domain:entry.domain,referenceOnly:ref,registered:!!program,target:program?.target??'enemy',passive:!!program?.passive,configuredRanks:entry.tiers,program:{range:typeof program?.range==='function'?'dynamic callback':program?.range??null,dynamicRange:!!program?.dynamicRange,ignoreCastRangeBonuses:!!program?.ignoreCastRangeBonuses,callbacks,implemented:program?.implemented??[],remaining:program?.remaining??[],sourceLocations},source:{aa:entry.domain==='aa'?{url:'https://www.abilityarena.com/data/abilities.json',snapshot:'repository captured AA catalog; dated per-skill provenance follows evidence',explicitSuper:sourceDefinition?.superEn,explicitGaben:sourceDefinition?.gabenEn}:undefined,historical:historicalId?{id:historicalId,url:historical.source.sourceUrl,commit:historical.source.commit,date:historical.source.commitDate,castRange:numbers(native.AbilityCastRange)}:null,acceptanceFile:audit?.file??null,evidence:(audit?.sources??[]).map(s=>({id:s.id,url:s.url,versionContext:s.versionContext,observation:s.observation??s.paraphrase})),rangeRequirements:(audit?.requirements??[]).filter(r=>/range|radius|width|geometry|distance|范围|距离/i.test(requirementText(r))).map(r=>({id:r.id,status:r.status,rule:requirementText(r),sourceIds:r.sourceIds,testEvidence:r.testEvidence})),sourceUnresolved:(audit?.unresolved??[]).filter(r=>/range|radius|width|geometry|distance|范围|距离/i.test(typeof r==='string'?r:JSON.stringify(r)))},ranks:[]};
  if(!rows)failures.push(`${signature}: missing configuration`);
  if(!ref&&!program)failures.push(`${signature}: missing final registered program`);
  for(const rank of entry.tiers){
   const row=rows?.[rank];if(!row){failures.push(`${signature}/${rank}: missing rank`);continue;}
   const nativeRange=numbers(native?.AbilityCastRange),historicalRange=at(nativeRange,entry.domain==='native'?rank:rank>=3?nativeRange.length:rank);
   const distances=parameters.map(p=>{const value=row[p.kind==='program'?'program':'params'][p.key],aa=aaValues.get(normalize(p.key)),historicalParameter=nativeValues.get(normalize(p.key)),sourceValue=aa?.length?at(aa,rank>=3?aa.length:rank):historicalParameter?.length?at(historicalParameter,entry.domain==='native'?rank:rank>=3?historicalParameter.length:rank):undefined,referenceSource=aa?.length?'AA explicit':historicalParameter?.length?'historical Valve':'documented parameter provenance';const dotaValue=p.unit.includes('(程序)')?value*100:value,override=explicitOverrides[`${entry.id}:${p.key}`];return{key:p.key,meaning:p.meaning,kind:p.kind,unit:p.unit,value,dotaValue,originalBaseValue:sourceValue??null,policyOverride:override??null,comparison:override?'documented_AA_override':sourceValue===undefined?'source_not_numeric':rank>=6&&entry.domain==='aa'?'AA_upgrade_final_value':Math.abs(dotaValue-sourceValue)<1e-7?'same_numeric_value':'difference_requires_version_or_custom_policy',referenceSource,provenance:p.source,urls:[...new Set(p.note?.match(/https?:\/\/[^；\s]+/g)??[])]};});
   const rankRecord={rank,castRangeDota:row.range*100,rangePrecedence:typeof program?.range==='function'&&(entry.domain==='native'||program.dynamicRange)?'state-dependent program callback overrides row':'compiled row is the runtime authority',historicalCastRangeDota:historicalRange??null,castRangeApplicable:!!program?.cast&&!program?.passive&&program?.target!=='self',castRangeComparison:(!program?.cast||program?.passive||program?.target==='self')?'not_used_for_a_targeted_cast':historicalRange===undefined?'source_missing':Math.abs(row.range*100-historicalRange)<1e-7?'same_numeric_value':entry.domain==='aa'&&rank>=6?'AA_upgrade_or_project_override':'historical_difference_recorded',distances,probe:null};
   if(!ref&&program){
    try{
     const battle=createBattle(player(0,entry.id,rank),player(1,entry.id,rank),9182,[...GRANTED_SKILL_DEFINITIONS,...catalog]);
     // Controlled input only, followed by real engine steps. This is an
     // occurrence/stability probe, never a substitute for boundary evidence.
     const caster=battle.units.find(u=>u.side===0&&u.skills.some(s=>s?.id===entry.id));
     for(const unit of battle.units){unit.nextAttack=0;unit.hp=unit.maxHp/2;unit.mana=unit.maxMana;}
     const actualSkill=caster?.skills.find(s=>s?.id===entry.id),target=battle.units.find(u=>u.side===1),range=getSkillRange(battle,caster,actualSkill,target),rangeChecks={base:range,withBonuses:null,passed:true};
     const priorStatuses=[...caster.statuses];caster.statuses.push({kind:'castRange',until:100,value:2,source:caster.id},{kind:'castRangePct',until:100,value:.25,source:caster.id});
     rangeChecks.withBonuses=getSkillRange(battle,caster,actualSkill,target);caster.statuses=priorStatuses;
     const expected=program.ignoreCastRangeBonuses?range.baseRange:range.range+2+range.baseRange*.25;
     rangeChecks.passed=Number.isFinite(range.range)&&Math.abs(rangeChecks.withBonuses.range-expected)<1e-7;
     if(!rangeChecks.passed)failures.push(`${signature}/${rank}: actual range bonus contract failed`);
     const seenZones=new Map(),seenWorld=new Map(),placed=new Map(),placedZones=new Map();
     for(let tick=0;tick<120&&!battle.finished;tick++){
      stepBattle(battle,1/30,[...GRANTED_SKILL_DEFINITIONS,...catalog]);
      for(const z of battle.zones??[])if(z.skill===entry.id)seenZones.set(`${z.radius}:${z.layer??''}`,{radiusWorld:z.radius,layer:z.layer??null});
      for(const e of battle.visualWorldEffects??[])if(e.skill===entry.id)seenWorld.set(`${e.layer}:${e.kind}:${e.maxRadius??e.radius}`,{layer:e.layer,kind:e.kind,radiusWorld:e.radius??null,maxRadiusWorld:e.maxRadius??null,innerRadiusWorld:e.innerRadius??null,outerRadiusWorld:e.outerRadius??null});
      if(tick%15===0)for(const v of zoneVisuals(assets,battle,battle.time))placedZones.set(`${v.key}:${v.size}`,{key:v.key,image:v.clip.image,sizeWorld:v.size});
      if(tick%15===0)for(const v of worldVisuals(assets,battle,battle.time))if(v.key&&v.clip.image.includes(`/${definition?.art??entry.id}/`))placed.set(`${v.clip.image}:${v.size}`,{image:v.clip.image,sizeWorld:v.size,radialMapping:v.radialMapping??null});
     }
     const events=battle.events.filter(e=>e.skill===entry.id);
     const finite=battle.units.every(u=>[u.hp,u.mana,u.x,u.y].every(Number.isFinite));if(!finite)failures.push(`${signature}/${rank}: nonfinite probe state`);
     rankRecord.probe={elapsed:battle.time,finite,rangeChecks,renderedZoneSamples:[...placedZones.values()],castCount:events.filter(e=>e.type==='cast').length,hitCount:events.filter(e=>e.type==='hit').length,casterFound:!!caster,zones:[...seenZones.values()],world:[...seenWorld.values()],renderedSamples:[...placed.values()].slice(0,10),boundaryCertified:false};
    }catch(error){rankRecord.probe={error:String(error),boundaryCertified:false};failures.push(`${signature}/${rank}: ${error}`);}
   }
   const currentRank=entry.domain==='aa'?(rank>=3?Math.max(1,current?.max_level??3):rank):rank;
   const currentCastRange=at(current?.cast_ranges??[],currentRank);
   rankRecord.currentDotaComparison={mapped:!!current,currentId:currentId??null,comparedNativeRank:current?currentRank:null,aaUpgradeHasNoEquivalentNativeRank:entry.domain==='aa'&&rank>=6,castRangeDota:currentCastRange??null,castRangeComparison:currentCastRange===undefined?'not_available':!rankRecord.castRangeApplicable?'not_used_for_a_targeted_cast':Math.abs(row.range*100-currentCastRange)<1e-7?'same_numeric_value':'different_current_Dota_retained_as_comparison',parameters:distances.map(p=>{const field=currentValues.get(normalize(p.key)),value=field?at(field.values_float??[],currentRank):undefined;return{key:p.key,currentField:field?.name??null,currentBaseValue:value??null,comparison:value===undefined?'no_matching_official_numeric_field':Math.abs(p.dotaValue-value)<1e-7?'same_numeric_value':'different_current_Dota_retained_as_comparison',variantContext:field?{requiredFacet:field.required_facet??null,facetBonus:field.facet_bonus??null,shard:field.values_shard??[],scepter:field.values_scepter??[],talents:field.bonuses??[]}:null};})};
   record.ranks.push(rankRecord);
  }
  record.currentDota={snapshot:'references/dota-wiki/r13-current-valve-range-snapshot.json',mapped:!!current,currentId:currentId??null,candidates:currentCandidates,heroSources:currentMatches.map(m=>({hero:m.hero.name,url:m.source.url,accessedAt:m.source.accessedAt,rawResponseSha256:m.source.rawResponseSha256})),patch:null,note:current?'Official current Valve values are comparison only; AA custom upgrades and historical runtime values are retained.':'No exact internal-ID mapping in the official hero datafeed. A removed ability, hidden child, item or AA-only effect is not filled by a guessed current value.'};
  const art=assets.skills[definition?.art??entry.id];record.visual={artId:art?definition?.art??entry.id:null,layers:Object.entries(art?.layers??{}).map(([id,clip])=>({id,role:clip.role,authoredCellSize:clip.worldSize??null})),geometryPolicy:'Live zones use actual radius; calibrated explicit annuli use actual inner/outer radii. Other role-specific event/projectile/body art is decorative unless dedicated geometry evidence exists.'};
  (ref?referenceOnly:skills).push(record);
 }
 const report={schemaVersion:1,auditInstrumentation:'Function source file/line is tagged in the in-memory Vite transform only. The final callbacks are resolved after all registration overrides; repository runtime sources are not rewritten.',scope:'230 purchasable AA skills at 1/2/3/6/9 plus all 109 implemented granted skills at their native ranks; 18 research-only definitions listed separately.',policy:'Existing user tuning > explicit AA base/Super/Gaben > compatible 2023-02-10 Valve data > documented working values. Modern Dota is comparison only.',configHash:config.hash,sourceHash:coreHash,inputHashes,currentValveReference:{snapshot:'references/dota-wiki/r13-current-valve-range-snapshot.json',capturedAt:currentSnapshot.capturedAt,heroCount:currentSnapshot.heroCount,abilityCount:currentSnapshot.abilityCount,patch:null,mappedSkills:skills.filter(s=>s.currentDota.mapped).length,unmappedSkills:skills.filter(s=>!s.currentDota.mapped).length},simulationRevision:SIMULATION_REVISION,historicalSource:sources.find(s=>s.file==='npc_abilities.txt'),units:'100 Dota units = 1 world unit; body radius is additional collision tolerance, not the spell display boundary.',counts:{main:skills.filter(s=>s.domain==='aa').length,granted:skills.filter(s=>s.domain==='native').length,referenceOnly:referenceOnly.length,playableRankRows:skills.reduce((n,s)=>n+s.ranks.length,0),referenceRankRows:referenceOnly.reduce((n,s)=>n+s.ranks.length,0),probedRows:skills.reduce((n,s)=>n+s.ranks.filter(r=>r.probe).length,0),distanceParameters:skills.reduce((n,s)=>n+s.ranks.reduce((k,r)=>k+r.distances.length,0),0),failures:failures.length},limitations:['A four-second real-engine occurrence probe is not an exhaustive boundary/interaction test. Zero casts or hits is recorded without inventing an occurrence.','Source equality is numeric comparison, not source-version or mechanism certification. AA ranks 6/9 contain final custom upgrade values.','Detailed existing acceptance requirements and unresolved source conflicts are preserved per skill; missing historical fields remain explicit.','Texture alpha 5–95% defines a practical main ring band; persistent zone alpha95 is fitted to the real solver radius. Decorative glow outside the calibrated band does not change collision.'],failures,skills,referenceOnly};
 if(report.counts.main!==230||report.counts.granted!==109||report.counts.referenceOnly!==18)failures.push('Catalog count changed; explicitly review the expected scope.');
 report.counts.failures=failures.length;
 await fs.mkdir(path.join(root,'artifacts'),{recursive:true});
 await fs.writeFile(path.join(root,'artifacts/r13-range-audit.json'),JSON.stringify(report,null,2)+'\n');
 const lines=['# r13 全量技能范围核对','','范围：230个主技能五档、109个可执行授予技能原生档；18个参考技能单列。完整机器可读记录见 `artifacts/r13-range-audit.json`。当前Valve官方127位英雄/734技能数据另存 `references/dota-wiki/r13-current-valve-range-snapshot.json`，每响应记录取得时间与SHA256；官方未给补丁号，因此不猜补丁号。','','采用AA历史基准，保留Super/Gaben明确改动；当前Dota在各档currentDotaComparison单列数值与差异，不直接覆盖历史技能；AA升级没有同名原生等级时明确标注，天赋/神杖/魔晶/命石上下文保留。100 Dota单位=1世界单位，地图比例保持原值。','','每档记录最终注册程序的真实文件/行、几何调用表达式与回调指纹、配置距离参数与语义、AA/历史Valve数值、来源与未决条款、实际4秒引擎探测的施法/命中/区域/渲染证据。数值相同、执行稳定和实际出现不等同于边界保真通过；没有发生的效果如实记零。','','等离子场采用700（基础）/1100（AA Super、Gaben）的扩展距离。现有伤害环内缘=105起始偏移+当前扩展距离，外缘=内缘+100环宽；因此基础最远外缘为905，升级最远外缘为1305，单位均为Dota单位。本项目共享40单位受击体积另外参与碰撞，不能把700/1100称为实际总命中半径。','几何来源是[2023-02-15 Razor历史Wiki快照](https://web.archive.org/web/20230215191830id_/https://dota2.fandom.com/wiki/Razor)：其标题明确使用Max Extension Radius，并说明105起始偏移、扩展700后到805、再计100宽度可到905。已有原始HTML的SHA256已再次核对为44acfa7f20e152ab28ad737af84843096a7c4253aebc00ec717d1cb90b813519，与references/dota-wiki/plasma-pulse-source-snapshot.json一致。历史636速度下往返700约为2.201秒，与当前Valve官方数据中的2.2秒相容；这项算式只是相容性推断，当前官方radius=700字段本身没有说明完整环边界。','该历史资料同时说明原作图像落后伤害环105。本版按用户要求，将主要5–95% alpha带对齐当前实际伤害环的内外边界；保留装饰光晕，光晕不参与判定。这是本项目的显示改进，并不宣称复制原作图像偏移。区域贴图也不再用固定素材worldSize覆盖实时半径。','仍保留PF-P01等未决项：原版hull与环宽的精确碰撞约定、跨越环/中心的瞬移边界、原AA Lua及其准确版本均未闭合；AA增加400与此历史几何的组合仍是注明来源的工作解释。当前Valve数据仅作另列对照，不能据此声称本项目最远905/1305边缘及额外40受击体积已经原版实测认证。','','|技能|域|档数|有施法档数|距离参数项|历史来源|当前Valve映射|范围未决项|','|---|---|---:|---:|---:|---|---|---:|'];
 for(const s of skills)lines.push(`|${s.name} (${s.id})|${s.domain}|${s.ranks.length}|${s.ranks.filter(r=>r.probe?.castCount).length}|${s.ranks.reduce((n,r)=>n+r.distances.length,0)}|${s.source.historical?'固定Valve KV':'无匹配，见参数来源'}|${s.currentDota.mapped?s.currentDota.currentId:'未匹配，明确缺失'}|${s.source.sourceUnresolved.length}|`);
 lines.push('','## 仅参考定义','','这些条目保留数值/来源核对，不声明存在独立最终程序：',...referenceOnly.map(s=>`- ${s.id}：${s.ranks.length}个原生档。`),'','## 已知边界','','- 其他复杂投射物、锥形、长条和角色附着光效仍按各自已有呈现逻辑；记录保留原作范围与源版本未决项。','- 全量4秒运行探测不覆盖长冷却、条件技能、低概率触发和所有状态组合；具名边界测试独立执行并报告。','- 本报告不将此前尚未完成的全技能机制验收改称通过。','');
 await fs.writeFile(path.join(root,'docs/r13-range-audit.md'),lines.join('\n'));
 console.log(JSON.stringify(report.counts));if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
}finally{await server.close();}
