import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const root=fileURLToPath(new URL('../',import.meta.url));
export const dimensions=['mechanism','timing','super','gaben','combination'];
export async function referenceTestFiles(base=root){
 const files=new Set((await fs.readdir(path.join(base,'tests'))).filter(name=>/^reference-.*\.test\.ts$/.test(name)).map(name=>`tests/${name}`));
 const directory=path.join(base,'references/dota-wiki/acceptance');
 for(const filename of (await fs.readdir(directory)).filter(name=>name.endsWith('.json'))){
  const group=JSON.parse(await fs.readFile(path.join(directory,filename),'utf8'));
  const requirements=[...(group.engineRequirements??[]),...(group.skills??[]).flatMap(skill=>skill.requirements??[])];
  for(const requirement of requirements)for(const evidence of requirement.testEvidence??[]){
   const file=evidence?.file;if(!file)continue;
   if(typeof file!=='string'||!/^(?:tests|src)\/.+\.test\.ts$/.test(file)||file.includes('\\')||file.split('/').some(part=>part==='..'||part===''))throw Error(`Invalid reference test path: ${file}`);
   await fs.access(path.join(base,file));files.add(file);
  }
 }
 return [...files].sort();
}
export async function referenceFingerprint(base=root){
 const files=[];
 async function walk(dir,filter){for(const entry of await fs.readdir(path.join(base,dir),{withFileTypes:true})){const name=path.posix.join(dir,entry.name);if(entry.isDirectory())await walk(name,filter);else if(filter(name))files.push(name);}}
 await walk('src',name=>/\.(ts|json)$/.test(name));await walk('tests',name=>name.endsWith('.ts'));
 await walk('config',name=>/\.(xlsx|json)$/.test(name));
 await walk('references/dota-wiki/acceptance',name=>name.endsWith('.json'));
 files.push('public/data/skills.json','vite.config.ts');
 await walk('scripts',name=>/(?:^|\/)(?:reference-acceptance|verify-reference-acceptance|build-reference-acceptance|config-compiler|config-schema|config-compile|config-check)\.mjs$/.test(name));
 const hash=createHash('sha256');for(const name of files.sort()){hash.update(name+'\0');const bytes=await fs.readFile(path.join(base,name));hash.update(name.endsWith('.xlsx')?bytes:bytes.toString('utf8').replaceAll('\r\n','\n'));hash.update('\0');}return hash.digest('hex');
}
export function evaluateRequirement(requirement,sources,proof,current){
 const testEvidence=(requirement.testEvidence??[]).map(test=>typeof test==='string'?{file:'',test}:test);
 const testResults=testEvidence.map(test=>({...test,passed:current&&proof?.tests?.some(result=>result.file===test.file&&result.title===test.test&&result.status==='passed')===true}));
 const sourceIds=requirement.sourceIds??requirement.sources??[];
 const sourceLinked=Array.isArray(sourceIds)&&sourceIds.length>0&&sourceIds.every(id=>sources.some(source=>source.id===id&&source.url&&(source.observation||source.paraphrase)&&source.versionContext));
 const implementedPass=['passed','verified'].includes(requirement.status);
 return {...requirement,testEvidence:testResults,sourceIds,sourceLinked,resultTestPassed:implementedPass&&testResults.length>0&&testResults.every(test=>test.passed),referenceVerified:implementedPass&&sourceLinked&&testResults.length>0&&testResults.every(test=>test.passed)};
}
export async function buildReferenceAcceptance(base=root){
 const catalog=JSON.parse(await fs.readFile(path.join(base,'public/data/skills.json'),'utf8'));
 const directory=path.join(base,'references/dota-wiki/acceptance');await fs.mkdir(directory,{recursive:true});
 const audits=new Map(),engineAudits=[];
 for(const filename of (await fs.readdir(directory)).filter(name=>name.endsWith('.json')).sort()){
  const group=JSON.parse(await fs.readFile(path.join(directory,filename),'utf8'));
  for(const requirement of group.engineRequirements??[])engineAudits.push({requirement,sources:group.sources??[]});
  for(const skill of group.skills??[]){
   if(!catalog.some(d=>d.id===skill.id))throw Error(`Unknown acceptance skill: ${skill.id}`);
   if(audits.has(skill.id))throw Error(`Duplicate acceptance skill: ${skill.id}`);
   if(!Array.isArray(skill.requirements)||!Array.isArray(skill.sources))throw Error(`Incomplete acceptance record: ${skill.id}`);
   if(new Set(skill.requirements.map(q=>q.id)).size!==skill.requirements.length)throw Error(`Duplicate requirement: ${skill.id}`);
   audits.set(skill.id,{...skill,file:`references/dota-wiki/acceptance/${filename}`});
  }
 }
 let proof;try{proof=JSON.parse(await fs.readFile(path.join(base,'artifacts/reference-acceptance-proof.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const fingerprint=await referenceFingerprint(base),current=proof?.sourceFingerprint===fingerprint&&proof?.passed===true;
 const engineRequirements=engineAudits.map(({requirement,sources})=>({...evaluateRequirement(requirement,sources,proof,current),sources}));
 const skills=catalog.map(definition=>{
  const audit=audits.get(definition.id),sources=audit?.sources??[];
  const requirements=(audit?.requirements??[]).map(q=>evaluateRequirement(q,sources,proof,current));
  const byDimension=Object.fromEntries(dimensions.map(kind=>{
   const selected=requirements.filter(q=>q.kind===kind);
   return [kind,{reviewedRequirements:selected.length,referenceVerified:selected.filter(q=>q.referenceVerified).length,resultTestPassed:selected.filter(q=>q.resultTestPassed).length,status:!selected.length?'unreviewed':selected.every(q=>q.referenceVerified)?'reviewed_clauses_verified':'partial'}];
  }));
  // Explicit clause-completeness is separate from the number of green tests.
  // A few passing examples must never promote a whole ability or catalog.
  const verified=!!audit?.reviewedAllDescriptionClauses&&!(audit.unresolved??[]).length&&dimensions.every(kind=>byDimension[kind].status==='reviewed_clauses_verified');
  return {id:definition.id,name:definition.name,nameEn:definition.nameEn,status:verified?'reference_verified':audit?'in_progress':'unreviewed',reviewedAllDescriptionClauses:audit?.reviewedAllDescriptionClauses===true,
   catalogClauses:{base:definition.descriptionEn,super:definition.superEn??definition.catalog?.superUpgrade??'',gaben:definition.gabenEn??definition.catalog?.gabenUpgrade??''},
   auditFile:audit?.file??null,byDimension,sources,requirements,upgradeProvenance:audit?.upgradeProvenance??[],unresolved:audit?.unresolved??['Mechanism clauses, source-version comparison, action clocks and relevant combinations have not yet been individually reviewed.']};
 });
 const requirements=skills.flatMap(skill=>skill.requirements);
 const report={schemaVersion:1,policy:'AA explicit custom clauses and values remain authoritative. Wiki non-numeric mechanisms are checked against historical versions; unresolved conflicts are not silently imported.',
  sourceFingerprint:fingerprint,proofCurrent:current,proofFile:proof?'artifacts/reference-acceptance-proof.json':null,
  engineRequirements,overallComplete:skills.every(skill=>skill.status==='reference_verified')&&engineRequirements.every(q=>q.referenceVerified),
  counts:{catalog:skills.length,reviewStarted:skills.filter(s=>s.status!=='unreviewed').length,unreviewed:skills.filter(s=>s.status==='unreviewed').length,fullyReferenceVerified:skills.filter(s=>s.status==='reference_verified').length,
   requirements:requirements.length,resultTestPassed:requirements.filter(q=>q.resultTestPassed).length,referenceVerifiedRequirements:requirements.filter(q=>q.referenceVerified).length,pendingRequirements:requirements.filter(q=>!q.referenceVerified).length,engineRequirements:engineRequirements.length,enginePending:engineRequirements.filter(q=>!q.referenceVerified).length},
  completionGate:'All 230 skills need complete clause review, evidence-linked mechanism/timing/Super/Gaben/combination requirements, current passing result tests and no unresolved requirements. Numeric stress coverage and branch registration cannot satisfy this gate.',skills};
 await fs.writeFile(path.join(base,'public/data/reference-acceptance.json'),JSON.stringify(report,null,2)+'\n');
 const label={unreviewed:'未逐项审查',in_progress:'审查中',reference_verified:'逐项通过'};
 const lines=['# 技能原作逐项验收','',`目录 ${skills.length} 项；已开始 ${report.counts.reviewStarted} 项；完整逐项通过 ${report.counts.fullyReferenceVerified} 项。`,
  `当前代码下，${report.counts.resultTestPassed} 条具名结果测试要求通过，${report.counts.referenceVerifiedRequirements} 条同时具备逐条来源绑定；另有${report.counts.enginePending}项跨技能引擎要求未闭合。测试证据${current?'与当前代码一致':'尚未生成或已过期'}。`,'',
  '这里的“审查中”不表示整项通过。完整规则、版本冲突、升级来源和具名测试见逐组 JSON；运行 `npm run reference:verify` 更新代码指纹与实际 Vitest 证据。所有未审查技能均保留在表内。','',
  '| 技能 | 状态 | 机制/时序/Super/Gaben/组合的已核查条款 | 未解决项 | 证据 |','|---|---|---|---:|---|',
  ...skills.map(s=>`| ${s.name} (${s.nameEn}) | ${label[s.status]} | ${dimensions.map(kind=>s.byDimension[kind].referenceVerified).join(' / ')} | ${s.unresolved.length} | ${s.auditFile?`[审查记录](../${s.auditFile})`:'待取证'} |`),''];
 await fs.writeFile(path.join(base,'docs/skill-reference-status.md'),lines.join('\n'));
 return report;
}
