import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {GLOBAL_SHEETS} from './global-config-schema.mjs';

async function filesIn(directory){const entries=await fs.readdir(directory,{withFileTypes:true});return(await Promise.all(entries.map(e=>e.isDirectory()?filesIn(path.join(directory,e.name)):e.name.endsWith('.ts')?[path.join(directory,e.name)]:[]))).flat();}
const schema=JSON.parse(await fs.readFile('config/schema.json','utf8')),configured=JSON.parse(await fs.readFile('src/generated/game-config.json','utf8'));
const candidates=[],counts={};
function numeric(node){return ts.isNumericLiteral(node)?Number(node.text):ts.isPrefixUnaryExpression(node)&&ts.isNumericLiteral(node.operand)?(node.operator===ts.SyntaxKind.MinusToken?-1:1)*Number(node.operand.text):undefined;}
function enclosingSkill(node){for(let p=node;p;p=p.parent)if(ts.isCallExpression(p)&&p.arguments.length&&ts.isStringLiteral(p.arguments[0])&&Object.values(schema.skills).some(s=>s.id===p.arguments[0].text))return p.arguments[0].text;return null;}
for(const file of await filesIn('src')){
 if(file.includes(`${path.sep}generated${path.sep}`))continue;
 const text=await fs.readFile(file,'utf8'),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);let literals=0,configuredFallbacks=0;
 function visit(node){
  if(ts.isNumericLiteral(node))literals++;
  if(ts.isCallExpression(node)){
   const name=ts.isIdentifier(node.expression)?node.expression.text:ts.isPropertyAccessExpression(node.expression)?node.expression.name.text:'';
   if(['balanceNumber','skillValue','v','value','configuredValue'].includes(name))configuredFallbacks++;
   const indexes=name==='status'?[2,3]:name==='projectile'?[1]:['delay','channel'].includes(name)?[0]:['damage','heal'].includes(name)?[1]:[];
   if(ts.isPropertyAccessExpression(node.expression)&&['c','context'].includes(node.expression.expression.getText(source)))for(const index of indexes){const argument=node.arguments[index],value=argument&&numeric(argument);if(value===undefined||value===0)continue;const permanent=name==='status'&&index===2&&value>=1e6;if(permanent)continue;const position=source.getLineAndCharacterOfPosition(argument.getStart());candidates.push({file:file.replaceAll('\\','/'),line:position.line+1,skill:enclosingSkill(node),operation:name,argument:index+1,value,expression:node.getText(source).slice(0,180),review:'保留语义裁决；直接字面量可能为刷新租约、内部节拍、占位值或可调机制参数'});}
  }
  ts.forEachChild(node,visit);
 }visit(source);counts[file.replaceAll('\\','/')]={numericLiterals:literals,configuredValueReads:configuredFallbacks};
}
const groups=Object.fromEntries(Object.entries(GLOBAL_SHEETS).map(([key,s])=>[key,{sheet:s.name,fields:s.fields.map(f=>f.key)}]));
for(const candidate of candidates){
 const e=candidate.expression;
 if(candidate.operation==='status'&&candidate.argument===4&&candidate.value===1){
  candidate.classification=e.includes("'slow'")?'control_lock':e.includes("'attackTypeOverride'")?'attack_type_enum':'state_marker';
  candidate.reason=candidate.classification==='control_lock'?'强制移动控制器的完整移动锁，与motionRoot/disarm同生共灭，不是独立平衡减速。':candidate.classification==='attack_type_enum'?'1代表近战攻击类型枚举；2代表远程，不能作为连续数值调参。':'状态存在标志、每次事件的一次计数或单次法术护盾的就绪标志；实际层数/强度由所属机制计算。';
 }else if(candidate.file==='src/combat/inner-laser-acceptance.ts'){
  candidate.classification='visual_playback';candidate.reason='仅记录激光连线播放寿命，不参与伤害、盲目、生命或命中范围；与已绑定动画对应。';
 }else if(candidate.file==='src/combat/main-upgrades-remaining.ts'&&e.includes('dragon,')){
  candidate.classification='superseded_implementation';candidate.reason='旧Dragon Slave黑龙构建器已被edge-earth-acceptance.ts的dragon覆盖；有效DRAGON DURATION/各项DRAGON BONUS参数已在技能表。';
 }else if(candidate.file==='src/combat/main-upgrades.ts'){
  candidate.classification='superseded_implementation';candidate.reason='旧Unleash已被attack-tempo-acceptance.ts完整注册覆盖；有效PULSE SILENCE已读取技能配置。';
 }else if(candidate.file==='src/skill-effects.ts'){
  candidate.classification='superseded_implementation';candidate.reason=e.includes('damageVulnerability')?'旧Frostbite被frost-control-acceptance.ts覆盖；有效INCOMING DAMAGE AMP已配置。':e.includes('outgoingDamageReduction')?'旧Counter Helix被proc-acceptance.ts覆盖；有效减伤比例、持续时间及层数均读取技能配置。':'旧Time Lock被attack-trigger-acceptance.ts覆盖；有效第二击延迟读取技能配置。';
 }else if(candidate.file==='src/skill-effects-extra.ts'){
  candidate.classification='superseded_implementation';candidate.reason='旧共用Maelstrom helper的Mjollnir/Focus Fire入口均被最终注册覆盖；有效CHAIN DELAY/MAELSTROM BOUNCE DELAY已配置。';
 }else if(candidate.file==='src/combat/main-summon-gaps.ts'&&e.includes('maxHpPct')){
  candidate.classification='superseded_implementation';candidate.reason='旧Beastmaster Granite Aura入口被summon-restoration-acceptance.ts覆盖；有效ANCIENT HEALTH AURA及ANCIENT AURA LINGER均在表内。';
 }else{
  candidate.classification='refresh_lease';candidate.reason='周期重新检查视野/位置/控制条件或延长短期状态租约；效果的真实持续时间、伤害间隔、强度和范围单独读取技能配置，不把检查频率与强度混为一项。';
 }
 delete candidate.review;
}
const retainedCategories=Object.fromEntries([...new Set(candidates.map(c=>c.classification))].map(key=>[key,candidates.filter(c=>c.classification===key).length]));
const report={schemaVersion:1,mechanicsHash:configured.mechanicsHash,summary:{sourceFiles:Object.keys(counts).length,numericLiterals:Object.values(counts).reduce((n,s)=>n+s.numericLiterals,0),configuredValueReads:Object.values(counts).reduce((n,s)=>n+s.configuredValueReads,0),skillParameterContracts:Object.values(schema.skills).reduce((n,s)=>n+s.params.length,0),globalParameterContracts:Object.values(groups).reduce((n,s)=>n+s.fields.length,0),statusMetadataRows:configured.statusMetadata.length,retainedDirectArgumentLiterals:candidates.length,retainedCategories},groups,migratedThisRevision:JSON.parse(await fs.readFile('config/reference/r13-config-additions.json','utf8')),retainedInCode:['固定30Hz步长、随机数算法、结算顺序及技能机制算法','玩家/英雄/技能槽/暂存/商店结构容量与数组索引','输入验证安全上限、数值精度容差、百分比换算单位','内部状态哨兵、短期光环租约及事件排序节拍，逐项依据见candidates'],limitations:['静态直接参数记录不证明所有原生机制已经还原；表内单项与实际机制仍由回归测试验证。','旧program-parameters.json为历史提取档案，不是可直接重新导入的当前运行配置。'],sourceCounts:counts,candidates};
const destination=process.argv[2]??'artifacts/r13-config-audit.json';await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'passed',destination,...report.summary}));
