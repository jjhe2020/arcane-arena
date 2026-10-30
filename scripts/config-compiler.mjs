import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {FILES,SKILL_HEADERS,EXTRA_HEADERS,DICTIONARY_HEADERS,META_HEADERS,ROLE_HEADERS,ROLE_GROWTH_FIELDS,UNIT_HEADERS,UNIT_ATTACK_CLASS_FIELDS,RULE_HEADERS,SHOP_HEADERS,ECONOMY_HEADERS,SAFE_ID,FORBIDDEN,toRuntime} from './config-schema.mjs';

export const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(v=>canonical(v)??'null').join(',')}]`:`{${Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
export const contentHash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const defaultRoot=fileURLToPath(new URL('../',import.meta.url));

/** Excel's namespace prefixes are arbitrary. Artifact Tool uses x:, while
 * ExcelJS expects unprefixed SpreadsheetML tags. Normalize the read buffer,
 * preserving the actual workbook and every cell value. */
export async function loadWorkbook(filename){
 const zip=await JSZip.loadAsync(await fs.readFile(filename));let changed=false;
 for(const item of Object.values(zip.files)){if(item.dir||!item.name.endsWith('.xml')&&!item.name.endsWith('.rels'))continue;let xml=await item.async('string');const prefixes=[...xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/g)].map(m=>m[1]);for(const prefix of prefixes){xml=xml.replaceAll(`xmlns:${prefix}="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`,'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"').replace(new RegExp(`(<\\/?)(?:${prefix}):`,'g'),'$1');changed=true;}if(item.name.endsWith('.rels')){const base=path.posix.dirname(item.name).replace(/(?:^|\/)_rels$/,'');xml=xml.replace(/Target="\/([^"]+)"/g,(_,target)=>{changed=true;return `Target="${path.posix.relative(base,target)}"`;});}if(prefixes.length||item.name.endsWith('.rels'))zip.file(item.name,xml);}
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(changed?await zip.generateAsync({type:'nodebuffer'}):await fs.readFile(filename));return wb;
}

export async function readConfiguration(root=defaultRoot){
 const json=async name=>JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
 const [schema,baseline]=await Promise.all([json('config/schema.json'),json('config/reference/migration-baseline.json')]);
 const issues=[],books={};
 for(const [key,name]of Object.entries(FILES))books[key]=await loadWorkbook(path.join(root,'config',name));
 const issue=(where,message)=>issues.push(`${where}: ${message}`);
 const text=(cell,where,optional=false)=>{const value=cell.value;if((value===null||value===undefined||value==='')&&optional)return '';if(typeof value!=='string'){issue(where,'需要文本，不能使用公式或其它对象');return '';}return value;};
 const number=(cell,where,{min=-1e9,max=1e9,integer=false}={})=>{const value=cell.value;if(typeof value!=='number'||!Number.isFinite(value)){issue(where,'需要有限数字；空白、数字文本和公式缓存不能代替数值');return 0;}if(value<min||value>max||integer&&!Number.isInteger(value))issue(where,`数字必须在${min}至${max}${integer?'且为整数':''}`);return value;};
 const id=(cell,where)=>{const value=text(cell,where);if(!SAFE_ID.test(value)||FORBIDDEN.has(value))issue(where,'标识符无效');return value;};
 const rows=(book,name,headers)=>{const sheet=books[book].getWorksheet(name);if(!sheet){issue(`${FILES[book]}/${name}`,'缺少工作表');return [];}headers.forEach((header,i)=>{if(sheet.getRow(4).getCell(i+1).value!==header)issue(`${FILES[book]}/${name}/${sheet.getRow(4).getCell(i+1).address}`,`列名应为“${header}”`);});if(sheet.getRow(4).cellCount>headers.length)issue(`${FILES[book]}/${name}/4`,'存在未知列名');const result=[];for(let r=5;r<=sheet.rowCount;r++){const row=sheet.getRow(r);if(row.values.slice(1).every(v=>v===null||v===undefined||v===''))continue;result.push({row,where:`${FILES[book]}/${name}/${r}`});}return result;};
 const config={schemaVersion:1,roles:{},economy:{},shopLevels:[],attributes:{},battle:{},units:{},skills:{},nativeSkills:{},workingDefaults:{}};
 const metadata=new Map();
 const sourceDefs=new Map([...baseline.granted,...baseline.skills].map(d=>[d.id,d]));
 for(const {row,where}of rows('skills','技能资料',META_HEADERS)){const key=id(row.getCell(1),where+'/A');if(!sourceDefs.has(key)){issue(where,'未知技能ID；新增机制需先实现程序');continue;}if(metadata.has(key))issue(where,'重复技能ID');const source=sourceDefs.get(key),shop=number(row.getCell(6),where+'/F',{min:0,max:1,integer:true});if(shop!==Number(baseline.skills.some(d=>d.id===key)))issue(where,'不能通过数值表改变商店与授予技能分类');metadata.set(key,{...source,name:text(row.getCell(2),where+'/B'),nameEn:text(row.getCell(3),where+'/C'),passive:!!number(row.getCell(4),where+'/D',{min:0,max:1,integer:true}),ultimate:!!number(row.getCell(5),where+'/E',{min:0,max:1,integer:true}),description:text(row.getCell(7),where+'/G',true),super:text(row.getCell(8),where+'/H',true),gaben:text(row.getCell(9),where+'/I',true)});}
 if(metadata.size!==sourceDefs.size)issue('技能资料','技能资料缺失，必须包含全部主技能和授予技能');
 const dictionary=new Map();
 for(const {row,where}of rows('skills','参数说明',DICTIONARY_HEADERS)){
  const domain=text(row.getCell(1),where+'/A'),key=id(row.getCell(2),where+'/B'),signature=`${domain}:${key}`,entry=schema.skills[signature];
  if(!entry){issue(where,'未知技能或等级域');continue;}
  const index=number(row.getCell(3),where+'/C',{min:1,max:1000,integer:true}),param=text(row.getCell(4),where+'/D'),expected=entry.params[index-1];
  if(!expected||expected.key!==param||text(row.getCell(6),where+'/F')!==expected.unit){issue(where,'参数键、序号或单位与程序映射不一致');continue;}
  const signatureParam=`${signature}:${index}`;if(dictionary.has(signatureParam))issue(where,'重复参数映射');dictionary.set(signatureParam,expected);
  // Min/max metadata is validated against the declared contract rather than
  // trusting a spreadsheet edit to remove compiler safeguards.
  for(const [column,expectedValue]of [[7,expected.min],[8,expected.max],[9,expected.integer?1:0]])if(number(row.getCell(column),`${where}/${column}`)!==expectedValue)issue(where,'参数约束由schema管理，不能在表内绕过');
 }
 const expectedParamCount=Object.values(schema.skills).reduce((n,s)=>n+s.params.length,0);if(dictionary.size!==expectedParamCount)issue('参数说明','参数映射缺失');
 const seenRows=new Set(),pending=[];
 for(const [domain,sheet]of [['aa','技能等级'],['native','授予技能等级']])for(const {row,where}of rows('skills',sheet,SKILL_HEADERS)){
  const key=id(row.getCell(1),where+'/A'),entry=schema.skills[`${domain}:${key}`],tier=number(row.getCell(3),where+'/C',{min:1,max:9,integer:true}),signature=`${domain}:${key}:${tier}`;
  if(!entry||!entry.tiers.includes(tier)){issue(where,'未知技能或无效等级；主技能仅1/2/3/6/9，授予技能使用原生等级');continue;}
  if(seenRows.has(signature))issue(where,'重复技能等级行');seenRows.add(signature);
  const result={pointTier:tier,castPoint:number(row.getCell(4),where+'/D',{min:0})/1000,backswing:number(row.getCell(5),where+'/E',{min:0})/1000,cooldown:number(row.getCell(6),where+'/F',{min:0})/1000,mana:number(row.getCell(7),where+'/G',{min:0}),range:number(row.getCell(8),where+'/H',{min:0})/100,params:{},program:{}};
  const target=domain==='aa'?config.skills:config.nativeSkills;target[key]??={};target[key][tier]=result;
  for(let p=0;p<10;p++){const info=entry.params[p],cell=row.getCell(p+9);if(!info){if(cell.value!==null&&cell.value!==undefined&&cell.value!=='')issue(`${where}/${cell.address}`,'未映射参数必须为空');continue;}const value=number(cell,`${where}/${cell.address}`,info);result[info.kind==='program'?'program':'params'][info.key]=toRuntime(value,info.unit);}
  pending.push({domain,key,tier,entry,result,where});
 }
 for(const entry of Object.values(schema.skills))for(const tier of entry.tiers)if(!seenRows.has(`${entry.domain}:${entry.id}:${tier}`))issue(`${entry.domain}/${entry.id}/${tier}`,'缺少等级行');
 const seenExtra=new Set();
 for(const {row,where}of rows('skills','扩展参数',EXTRA_HEADERS)){
  const domain=text(row.getCell(1),where+'/A'),key=id(row.getCell(2),where+'/B'),tier=number(row.getCell(3),where+'/C',{min:1,max:9,integer:true}),param=text(row.getCell(4),where+'/D'),entry=schema.skills[`${domain}:${key}`],info=entry?.params.find((p,i)=>i>=10&&p.key===param),target=(domain==='aa'?config.skills:config.nativeSkills)[key]?.[tier];
  if(!entry||!info||!target){issue(where,'未知扩展参数或等级');continue;}const signature=`${domain}:${key}:${tier}:${param}`;if(seenExtra.has(signature))issue(where,'重复扩展参数');seenExtra.add(signature);target[info.kind==='program'?'program':'params'][info.key]=toRuntime(number(row.getCell(5),where+'/E',info),info.unit);
 }
 for(const item of pending)for(const info of item.entry.params.slice(10))if(!seenExtra.has(`${item.domain}:${item.key}:${item.tier}:${info.key}`))issue(item.where,`缺少扩展参数 ${info.key}`);
 const roleKeys=['hp','mana','attack','armor','attackInterval','range','moveSpeed','strength','agility','intelligence'];
 for(const {row,where}of rows('units','职业',ROLE_HEADERS)){
  const key=id(row.getCell(1),where+'/A');if(!schema.roles.includes(key)){issue(where,'未知职业；职业种类固定为四种');continue;}if(config.roles[key])issue(where,'重复职业');const r={name:text(row.getCell(2),where+'/B'),color:text(row.getCell(3),where+'/C')};if(!/^#[a-fA-F0-9]{6}$/.test(r.color))issue(where,'颜色应为六位十六进制');roleKeys.forEach((field,i)=>r[field]=number(row.getCell(i+4),`${where}/${i+4}`,{min:field==='armor'?-1000:0}));r.attackInterval/=1000;r.range/=100;r.moveSpeed/=100;r.primaryAttribute=text(row.getCell(14),where+'/N');if(!['strength','agility','intelligence'].includes(r.primaryAttribute))issue(where,'主属性无效');r.turnRate=number(row.getCell(15),where+'/O',{min:.01,max:1000});r.attackPoint=number(row.getCell(16),where+'/P',{min:0})/1000;r.attackBackswing=number(row.getCell(17),where+'/Q',{min:0})/1000;r.projectileSpeed=number(row.getCell(18),where+'/R',{min:0})/100;r.attackRangeBuffer=number(row.getCell(19),where+'/S',{min:0})/100;ROLE_GROWTH_FIELDS.forEach((field,i)=>r[field.key]=number(row.getCell(20+i),`${where}/${20+i}`,{min:0,max:1000}));if(r.hp<1||r.attackInterval<=0)issue(where,'生命与攻击间隔必须大于0');config.roles[key]=r;
 }
 if(Object.keys(config.roles).length!==4)issue('职业','必须包含四种职业');
 for(const {row,where}of rows('units','召唤单位',UNIT_HEADERS)){
  const key=id(row.getCell(1),where+'/A');if(!schema.units.includes(key)){issue(where,'未知召唤模板');continue;}if(config.units[key])issue(where,'重复单位模板');const u={};for(const [index,field]of [[3,'StatusHealth'],[4,'StatusMana'],[5,'AttackDamageMin'],[6,'AttackDamageMax'],[7,'ArmorPhysical'],[8,'MagicalResistance'],[9,'AttackRate'],[10,'BaseAttackSpeed'],[11,'AttackAnimationPoint'],[13,'AttackRange'],[14,'MovementSpeed'],[15,'StatusHealthRegen'],[16,'StatusManaRegen']])u[field]=number(row.getCell(index),`${where}/${index}`,{min:field==='ArmorPhysical'?-1000:0});u.AttackRate/=1000;u.AttackAnimationPoint/=1000;u.turnRate=number(row.getCell(17),where+'/Q',{min:.01,max:1000});u.attackPoint=u.AttackAnimationPoint;u.attackBackswing=number(row.getCell(12),where+'/L',{min:0})/1000;u.projectileSpeed=number(row.getCell(18),where+'/R',{min:0})/100;u.attackRangeBuffer=number(row.getCell(19),where+'/S',{min:0})/100;u.attackCapability=number(row.getCell(20),where+'/T',{min:0,max:2,integer:true});u.Level=number(row.getCell(21),where+'/U',{min:0,max:100,integer:true});if(u.StatusHealth<1||u.BaseAttackSpeed<=0||(u.AttackRate<=0&&u.attackCapability!==0)||u.AttackDamageMax<u.AttackDamageMin||u.MagicalResistance>100)issue(where,'生命、攻速、攻击区间或魔抗无效');const attackClassCells=UNIT_ATTACK_CLASS_FIELDS.map((f,i)=>row.getCell(22+i));if(attackClassCells.some(c=>c.value!==null&&c.value!==undefined&&c.value!=='')){UNIT_ATTACK_CLASS_FIELDS.forEach((field,i)=>u[field.key]=number(attackClassCells[i],where+'/'+(22+i),{min:0,max:1e9}));}config.units[key]=u;
 }
  if(Object.keys(config.units).length!==schema.units.length)issue('召唤单位','缺少单位模板');
 const seenRules=new Set();for(const {row,where}of rows('units','底层规则',RULE_HEADERS)){const group=text(row.getCell(1),where+'/A'),key=id(row.getCell(2),where+'/B'),signature=`${group}:${key}`,entry=schema.rules.find(r=>r.group===group&&r.key===key);if(!entry){issue(where,'未知底层配置项');continue;}if(seenRules.has(signature))issue(where,'重复底层配置');seenRules.add(signature);config[group][key]=toRuntime(number(row.getCell(4),where+'/D',{min:0}),entry.unit);}if(seenRules.size!==schema.rules.length)issue('底层规则','缺少底层配置');
 if(config.battle.magicResist>1||config.battle.bodyRadius<=0||config.battle.turnRate<=0||config.battle.maximumMoveSpeed<config.battle.minimumMoveSpeed)issue('底层规则','魔抗、碰撞半径、转身或移速边界无效');
 const seenEco=new Set();for(const {row,where}of rows('economy','经济规则',ECONOMY_HEADERS)){const key=id(row.getCell(1),where+'/A'),entry=schema.economy.find(e=>e.key===key);if(!entry){issue(where,'未知经济配置；结构容量不能由表任意扩展');continue;}if(seenEco.has(key))issue(where,'重复经济配置');seenEco.add(key);config.economy[key]=number(row.getCell(3),where+'/C',{min:0,integer:entry.integer});}if(seenEco.size!==schema.economy.length)issue('经济规则','经济配置缺失');
 config.economy.heroArrivalRounds=[1,2,3,4,5].map(i=>config.economy[`heroArrivalRound${i}`]);for(let i=1;i<=5;i++)delete config.economy[`heroArrivalRound${i}`];
 if(config.economy.initialHp<1||config.economy.copiesPerSkill<1||config.economy.matchPoolSize<1||config.economy.matchPoolSize>baseline.skills.length||config.economy.ultimateShopLevel<1||config.economy.ultimateShopLevel>5||config.economy.roundDamageDivisor<=0||config.economy.heroArrivalRounds[0]!==1||config.economy.heroArrivalRounds.some((n,i,a)=>i>0&&n<=a[i-1]))issue('经济规则','库存、随机池、终极等级、除数或英雄到场回合无效');
 const shopSeen=new Set();for(const {row,where}of rows('economy','商店等级',SHOP_HEADERS)){const level=number(row.getCell(1),where+'/A',{min:1,max:5,integer:true});if(shopSeen.has(level))issue(where,'重复商店等级');shopSeen.add(level);config.shopLevels.push({level,activeSlots:number(row.getCell(2),where+'/B',{min:1,max:10,integer:true}),upgradePrice:number(row.getCell(3),where+'/C',{min:0,integer:true})});}config.shopLevels.sort((a,b)=>a.level-b.level);if(shopSeen.size!==5||config.shopLevels[4]?.upgradePrice!==0||config.shopLevels.some((r,i,a)=>i>0&&r.activeSlots<a[i-1].activeSlots))issue('商店等级','必须为五级、开放数不递减且满级升级费用为0');
 if(issues.length)throw new Error(`配置编译失败（${issues.length}项）\n${issues.slice(0,80).join('\n')}`);
 config.skillMetadata=Object.fromEntries([...metadata].map(([id,d])=>[id,{name:d.name,nameEn:d.nameEn,description:d.description,super:d.super,gaben:d.gaben,passive:d.passive,ultimate:d.ultimate,balanceParamLabels:Object.fromEntries((schema.skills[`aa:${id}`]??schema.skills[`native:${id}`]).params.filter(p=>p.kind==='value').map(p=>[p.key,p.meaning]))}]));
 const hash=contentHash(config);const compiled={...config,hash};
 const defs=baseline.skills.map(original=>{
  const d=metadata.get(original.id),levels=config.skills[d.id];
  // Reference catalog/catalogZh remain the immutable source. Runtime/display
  // values follow the workbook, including intentional zeroes.
  return {...d,values:d.values.map(text=>{const at=text.indexOf(':'),key=text.slice(0,at).trim().toUpperCase();if(at<0||levels[1].params[key]===undefined)return text;const values=[1,2,3].map(t=>levels[t].params[key]);return `${key}: ${[...new Set(values)].length===1?values[0]:values.join(' / ')}`;}),valuesZh:undefined,cooldowns:[1,2,3].map(t=>levels[t].cooldown),mana:[1,2,3].map(t=>levels[t].mana),balanceLevels:levels,balanceDomain:'aa',balanceParamLabels:config.skillMetadata[d.id].balanceParamLabels,configHash:hash};
 });
 const report={schemaVersion:1,hash,counts:{skills:baseline.skills.length,granted:baseline.granted.filter(d=>!d.referenceOnly).length,referenceAbilities:baseline.granted.filter(d=>d.referenceOnly).length,skillTiers:seenRows.size,parameters:expectedParamCount,units:schema.units.length,roles:4},sources:FILES};
 defs.forEach(d=>d.balanceInputSignature=JSON.stringify([d.values,d.cooldowns,d.mana]));
 const serialize=value=>canonical(value)+'\n';
 return {config:compiled,definitions:defs,report,outputs:new Map([['src/generated/game-config.json',serialize(compiled)],['public/data/game-config.json',serialize(compiled)],['public/data/config-report.json',serialize(report)],['public/data/skills.json',serialize(defs)]])};
}

export async function compileConfiguration({root=defaultRoot,check=false}={}){
 const result=await readConfiguration(root),stale=[];
 for(const [file,expected]of result.outputs){const destination=path.join(root,file);let actual;try{actual=await fs.readFile(destination,'utf8');}catch{}if(actual!==expected)stale.push(file);}
 if(check&&stale.length)throw new Error(`Excel配置尚未编译或产物过期：${stale.join(', ')}。请手动运行 npm run config:compile。`);
 if(!check&&stale.length){const temporary=[];try{for(const [file,text]of result.outputs){const destination=path.join(root,file);await fs.mkdir(path.dirname(destination),{recursive:true});const tmp=destination+'.config-tmp';await fs.writeFile(tmp,text);temporary.push([tmp,destination]);}for(const [tmp,destination]of temporary)await fs.rename(tmp,destination);}finally{for(const [tmp]of temporary)await fs.rm(tmp,{force:true});}}
 return result;
}
