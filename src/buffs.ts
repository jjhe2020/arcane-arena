import {STATUS_METADATA_CONFIG} from './config';
import type {CombatUnit,Hero,PersistentBuffSources,SkillDefinition} from './model';
import type {EffectStatus} from './skill-effects';
import {skillIconURL} from './skill-icons';
import {UI_CONFIG} from './global-config';

export type BuffPolarity='positive'|'negative';
export type BuffLifecycle='timed'|'permanent'|'aura';
export interface BuffCatalogEntry {key:string;skill:string;kind:string;name:string;description:string;polarity:'auto'|BuffPolarity;lifecycle:'auto'|BuffLifecycle;stackMode:'auto'|'none'|'instances'|'value'|'remaining';variant:string;hidden:boolean;valueFormat:'raw'|'percent'|'seconds'|'distance'|'counter'|'none'}
export interface UnitBuffView {key:string;skillId:string;icon:string;name:string;polarity:BuffPolarity;lifecycle:BuffLifecycle;stacks:number;appliedAt:number;expiresAt:number|null;description:string;effects:string[];sourceUnitId?:string;sourceName?:string;unknown?:boolean;independentStacks?:boolean;persistsAcrossRounds?:boolean}
type Definitions=ReadonlyMap<string,SkillDefinition>|readonly SkillDefinition[];
const EPS=1e-8;
const catalog=(STATUS_METADATA_CONFIG??[]) as BuffCatalogEntry[];
const generic=new Map(catalog.filter(r=>r.skill==='*').map(r=>[r.kind,r]));
const overrides=new Map(catalog.filter(r=>r.skill!=='*').map(r=>[`${r.skill}/${r.kind}`,r]));
const number=(v:number)=>Number.isInteger(v)?String(v):Number(v.toFixed(2)).toString();
const skillRoot=(id:string)=>id.replace(/:persistent$/,'');
const definitionsMap=(defs:Definitions):ReadonlyMap<string,SkillDefinition>=>Array.isArray(defs)?new Map(defs.map(d=>[d.id,d])):defs as ReadonlyMap<string,SkillDefinition>;
const signed=(v:number)=>`${v>0?'+':''}${number(v)}`;

export function buffMetadata(skillId:string,kind:string):BuffCatalogEntry|undefined {
 const base=generic.get(kind),specific=overrides.get(`${skillId}/${kind}`),family=overrides.get(`${skillId}/*`);
 if(!base&&!specific&&!family)return undefined;
 const result={key:kind,skill:skillId,kind,name:kind,description:'受到来源技能施加的状态影响。',polarity:'auto',lifecycle:'auto',stackMode:'auto',variant:'',hidden:false,valueFormat:'none',...base} as BuffCatalogEntry;
 for(const row of[family,specific])if(row){for(const field of['polarity','lifecycle','stackMode'] as const)if(row[field]!=='auto')Object.assign(result,{[field]:row[field]});if(row.valueFormat!=='none')result.valueFormat=row.valueFormat;for(const field of['name','description','variant'] as const)if(row[field])result[field]=row[field];result.hidden=row.hidden;}
 return result;
}

/** Diagnostics are explicit so newly introduced engine states cannot disappear silently. */
export function buffCatalogCoverage(kinds:Iterable<string>):{known:string[];unknown:string[]} {
 const all=[...new Set(kinds)].sort();return{known:all.filter(k=>generic.has(k)),unknown:all.filter(k=>!generic.has(k))};
}

function lifecycle(status:EffectStatus,metadata:BuffCatalogEntry|undefined):BuffLifecycle {
 if(status.presentation?.lifecycle)return status.presentation.lifecycle;
 if(status.skill?.endsWith(':persistent'))return'permanent';
 // Explicit engine convention used throughout the acceptance programs, not arbitrary duration guessing.
 if(status.until-(status.appliedAt??0)>=999_999)return'permanent';
 return metadata?.lifecycle&&metadata.lifecycle!=='auto'?metadata.lifecycle:'timed';
}

function effectDescription(status:EffectStatus,metadata:BuffCatalogEntry|undefined):string {
 const value=status.value??0,format=metadata?.valueFormat;
 const display=format==='percent'?`${signed(value*100)}%`:format==='seconds'?`${number(value)}秒`:format==='distance'?`${signed(value*100)}`:signed(value);
 return(status.presentation?.description??metadata?.description??'受到来源技能施加的状态影响。').replaceAll('{value}',display).replaceAll('{remaining}',number(status.remaining??value));
}

function polarity(status:EffectStatus,metadata:BuffCatalogEntry|undefined):BuffPolarity {
 if(metadata?.polarity&&metadata.polarity!=='auto')return metadata.polarity;
 if(status.harmful)return'negative';
 if((status.value??0)<0&&['strength','agility','intelligence','armor','attackBonus','attackPct','attackSpeed','attackSpeedPct','magicResist','statusResistance','moveFlat','movePct','regen','manaRegen','statBonus','statPercent','healAmplification'].includes(status.kind))return'negative';
 return'positive';
}

function stackCount(statuses:EffectStatus[],metadata:BuffCatalogEntry|undefined):number {
 const mode=statuses[0]?.presentation?.stackMode??metadata?.stackMode??'auto';
 if(mode==='none')return 1;
 if(mode==='remaining')return Math.max(1,...statuses.map(s=>s.remaining??s.value??1));
 if(mode==='value')return Math.max(1,...statuses.map(s=>s.stacks??s.value??1));
 if(mode==='instances')return statuses.length;
 return Math.max(1,statuses.length>1&&statuses.some(s=>(s.maxStacks??0)>1)?statuses.length:1,...statuses.map(s=>s.stacks??1));
}

const persistentNames:Record<string,string>={attack:'攻击力',strength:'力量',agility:'敏捷',intelligence:'智力',armor:'护甲',hp:'最大生命',damage:'技能伤害',legacyDamage:'历史技能伤害',legacyHp:'历史最大生命',hpRegen:'每秒生命恢复',manaRegen:'每秒魔法恢复',kills:'累计击杀'};
function permanentViews(state:Record<string,number>,sources:PersistentBuffSources|undefined,legacy:Record<string,number>,defs:ReadonlyMap<string,SkillDefinition>,unitId:string):UnitBuffView[] {
 const groups=new Map<string,Record<string,number>>();
 for(const[key,value]of Object.entries(state)){if(!Number.isFinite(value)||!value)continue;const colon=key.indexOf(':');if(colon<0)continue;const id=key.slice(0,colon),field=key.slice(colon+1);const fields=groups.get(id)??{};fields[field]=(fields[field]??0)+value;groups.set(id,fields);}
 for(const[id,fields]of Object.entries(sources??{})){const target=groups.get(id)??{};for(const[field,value]of Object.entries(fields))if(Number.isFinite(value)&&value)target[field]=(target[field]??0)+value;groups.set(id,target);}
 const unowned={...legacy};for(const fields of Object.values(sources??{}))for(const[field,value]of Object.entries(fields))if(field in unowned)unowned[field]-=value;
 if(Object.values(unowned).some(v=>Math.abs(v)>EPS))groups.set('legacy-permanent',unowned);
 return[...groups].flatMap(([id,fields])=>{
  const entries=Object.entries(fields).filter(([,value])=>Number.isFinite(value)&&Math.abs(value)>EPS);if(!entries.length)return[];
  const d=defs.get(id),effects=entries.map(([key,value])=>`${persistentNames[key]??key} ${signed(value)}`),negative=entries.every(([,v])=>v<0),kills=fields.kills;
  return[{key:`${unitId}|${id}|permanent`,skillId:id,icon:d?skillIconURL(d):'',name:id==='legacy-permanent'?'历史永久属性':`${d?.name??id} · 永久成长`,polarity:negative?'negative':'positive',lifecycle:'permanent',stacks:kills&&kills>1?kills:1,appliedAt:0,expiresAt:null,description:id==='legacy-permanent'?'旧存档已保存的永久属性，原始来源未记录。':sources?.[id]?'此永久属性跨回合保留，来源由实际结算记录。':'此成长跨回合保留。技能专属成长随技能实例移动、合并；出售原技能后不转移给新购技能。',effects,sourceUnitId:unitId,persistsAcrossRounds:true} satisfies UnitBuffView];
 });
}

export function heroPersistentBuffs(hero:Hero,definitions:Definitions):UnitBuffView[] {
 const state:Record<string,number>={};for(const skill of hero.skills)for(const[k,v]of Object.entries(skill?.persistentState??{}))state[k]=(state[k]??0)+v;
 return permanentViews(state,hero.persistentBuffs,{attack:hero.persistentAttackBonus??0,strength:hero.persistentStrengthBonus??0,agility:hero.persistentAgilityBonus??0,intelligence:hero.persistentIntelligenceBonus??0},definitionsMap(definitions),hero.id);
}

/** Shared projection for the battlefield, details panel and detached replay. No simulation mutation. */
export function combatUnitBuffs(unit:CombatUnit,time:number,definitions:Definitions,units:readonly CombatUnit[]=[]):UnitBuffView[] {
 const defs=definitionsMap(definitions),groups=new Map<string,{statuses:EffectStatus[];skillId:string;variant:string;life:BuffLifecycle;polarity:BuffPolarity;source?:string;instance:string}>();
 const attributes=unit.attributes as {permanent?:Record<string,number>}|undefined;
 const permanentTotals:Record<string,number>={attack:Number(unit.persistentAttackBonus??0)+Number(unit.permanentAttackGain??0)};
 for(const stat of['strength','agility','intelligence']){const field=stat[0].toUpperCase()+stat.slice(1);permanentTotals[stat]=attributes?.permanent?.[stat]??Number(unit[`persistent${field}Bonus`]??0)+Number(unit[`permanent${field}Gain`]??0);}
 const inheritsHeroGrowth=!unit.summoned||!!unit.illusion||!!unit.heroClone;
 const permanent=inheritsHeroGrowth?permanentViews((unit.skillState??{}) as Record<string,number>,unit.persistentBuffs,permanentTotals,defs,unit.id):[];
 const permanentSkills=new Set(permanent.map(b=>b.skillId));
 for(const original of unit.statuses as EffectStatus[]){
  if(original.until<=time+EPS)continue;
  let status=original;
  // Some sustained effects refresh short component leases while a source-owned
  // marker holds the actual cast duration. Match their run token, not a duration
  // threshold, so sharing the effect retains the original countdown.
  const originalId=skillRoot(original.skill??original.attribution?.abilityId??''),originalMeta=buffMetadata(originalId,original.kind);
  if(originalMeta?.lifecycle==='aura'&&!original.presentation?.lifecycle){const source=original.source===unit.id?unit:units.find(u=>u.id===original.source),tokens=Object.entries(original.data??{}).filter(([key])=>/run|token/i.test(key));
   const anchor=tokens.length?(source?.statuses as EffectStatus[]|undefined)?.find(candidate=>candidate.until>time+EPS&&skillRoot(candidate.skill??'')===originalId&&buffMetadata(originalId,candidate.kind)?.lifecycle==='timed'&&tokens.some(([key,value])=>candidate.data?.[key]===value)):undefined;
   if(anchor)status={...original,appliedAt:anchor.appliedAt,until:anchor.until,presentation:{...original.presentation,lifecycle:'timed'}};
  }
  if(status.until<=time+EPS)continue;
  const id=skillRoot(status.skill??status.attribution?.abilityId??''),meta=buffMetadata(id,status.kind);if(status.presentation?.hidden??meta?.hidden)continue;
  const life=lifecycle(status,meta);if(life==='permanent'&&permanentSkills.has(id))continue;
  // Zero-valued permanent counters are not earned buffs, while zero-valued controls remain meaningful.
  if(life==='permanent'&&(status.value??0)===0&&['strength','agility','intelligence','armor','attackBonus','regen','manaRegen','scytheRegenStacks'].includes(status.kind))continue;
  const sign=polarity(status,meta),variant=status.presentation?.variant??meta?.variant??'',instance=String(status.attribution?.skillInstanceId??status.data?.ownerInstance??status.stolenOrigin??''),key=[id||`unknown:${status.kind}`,status.source??'',instance,variant,life,sign].join('|');
  const group=groups.get(key)??{statuses:[],skillId:id,variant,life,polarity:sign,source:status.source,instance};group.statuses.push(status);groups.set(key,group);
 }
 const views:UnitBuffView[]=[...groups].map(([key,g])=>{
  const byKind=new Map<string,EffectStatus[]>();for(const s of g.statuses){const list=byKind.get(s.kind)??[];list.push(s);byKind.set(s.kind,list);}
  const first=g.statuses[0],d=defs.get(g.skillId),firstMeta=buffMetadata(g.skillId,first.kind),earliest=[...g.statuses].sort((a,b)=>a.until-b.until)[0];
  const effects:string[]=[],counts:number[]=[];let independent=false;
  for(const[kind,statuses]of byKind){const meta=buffMetadata(g.skillId,kind),count=stackCount(statuses,meta);counts.push(count);independent||=statuses.length>1&&(meta?.stackMode==='instances'||statuses.some(s=>(s.maxStacks??0)>1));
   // Component values add for independently stacking stat modifiers; marker counters do not.
   const aggregate={...statuses[0]};if(statuses.length>1&&meta?.stackMode!=='value'&&meta?.stackMode!=='remaining')aggregate.value=statuses.reduce((n,s)=>n+(s.value??0),0);
   const description=effectDescription(aggregate,meta);if(!effects.includes(description))effects.push(description);
  }
  const isUnknown=g.statuses.some(s=>!buffMetadata(g.skillId,s.kind)),sourceName=units.find(u=>u.id===g.source)?.name;
  let name=first.presentation?.name??d?.name??firstMeta?.name??'未知状态';
  if(g.variant&&d?.name&&firstMeta?.name)name=`${d.name} · ${firstMeta.name}`;
  return{key:`${unit.id}|${key}`,skillId:g.skillId,icon:d?skillIconURL(d):'',name,polarity:g.polarity,lifecycle:g.life,stacks:Math.max(1,...counts),appliedAt:earliest.appliedAt??time,expiresAt:g.life==='timed'?earliest.until:null,description:independent?'各层独立计时，边框显示最早到期的一层。':'',effects,sourceUnitId:g.source,sourceName,unknown:isUnknown,independentStacks:independent};
 });
 return[...views,...permanent].sort((a,b)=>a.appliedAt-b.appliedAt||a.key.localeCompare(b.key));
}

export function buffRemainingFraction(buff:Pick<UnitBuffView,'lifecycle'|'appliedAt'|'expiresAt'>,time:number):number {
 if(buff.lifecycle!=='timed'||buff.expiresAt===null)return 1;
 const duration=buff.expiresAt-buff.appliedAt;return duration>EPS?Math.min(1,Math.max(0,(buff.expiresAt-time)/duration)):0;
}

/** Clip the rectangular border with a clock-face sector; start at twelve o'clock. */
export function drawBuffBorder(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,buff:UnitBuffView,time:number):void {
 const fraction=buffRemainingFraction(buff,time);if(fraction<=0)return;ctx.save();
 if(fraction<1){const cx=x+size/2,cy=y+size/2,r=size;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,-Math.PI/2+(1-fraction)*Math.PI*2,Math.PI*1.5);ctx.closePath();ctx.clip();}
 ctx.strokeStyle=buff.polarity==='negative'?'#ef6666':'#63dc83';ctx.lineWidth=UI_CONFIG.buffBorderWidth;const inset=ctx.lineWidth/2;ctx.strokeRect(x+inset,y+inset,size-ctx.lineWidth,size-ctx.lineWidth);ctx.restore();
}
