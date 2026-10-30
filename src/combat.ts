import { arenaBlocksAttack } from './combat/arenas';
import {rollPrd,PRD_WORKING_ELIGIBILITY,type PrdState} from './combat/prd';
import { type BattleState, type CombatEvent, type CombatUnit, type Player, type SkillDefinition, type SkillStack, type UnitStats } from './model';
import { arrayValue, skillValue, getSkillProgram, GRANTED_SKILL_DEFINITIONS, referenceCastPoint, referenceRootDisables, isUnitTargetSkill, type DamageType, type EffectContext, type EffectStatus, type SkillProgram, type SummonOptions, type ZoneOptions, type InstantAttackOptions, type AttackResolution } from './skill-effects';
import { SIMULATION_REVISION } from './simulation-version';
import type {Attribution,DamageCategory,DamageFlags,AttackRecord} from './model';
import {BASIC_ATTACK_ID,recordDamage,recordHealing,recordAbsorption,resolveAttribution,snapshotBattleStats,distributeEffective} from './combat/statistics';
import {independentFraction,selectCritical,type CriticalRoll} from './combat/damage-rules';
import { addBarrier,barriers,constrainBarrierMotion,resolveBarrierOverlap,routeAroundBarriers } from './combat/barriers';
import { beginMovementFrame,constrainUnitMotion,slideUnitMotion,ignoresUnitCollision,limitOrdinaryMove,recordMovement,refreshMovementBudget,remainingMovementBudget,turnTowards,type ContinuousMoveOptions,type MotionController,type MotionPoint } from './combat/movement';
import { CONFIG_HASH,ATTRIBUTE_CONFIG,BATTLE_CONFIG,ROLE_CONFIG,UNIT_CONFIG,skillBalance,type SkillBalance } from './config';
import {applyNativeUnitProfile} from './combat/native-unit-profiles';
export {removeStatuses as dispelBattleStatuses};

export const FIXED_STEP = 1 / 30;
export const BATTLE_BOUNDS = { x: 14.57, y: 12.916 } as const;
/** An explicit project safeguard, not a recovered AA overtime rule. */
export const BATTLE_TIME_LIMIT = 120;
const COMBAT_VERSION = 1;
const BODY_RADIUS = BATTLE_CONFIG.bodyRadius;
/** Project profession balance, not recovered AA hero data. Role totals already
 * contain their base attributes; these conversions apply only to changes. */
export const ATTRIBUTE_CONVERSION = ATTRIBUTE_CONFIG;
type Attribute = 'strength'|'agility'|'intelligence';
interface AttributeState { base:Record<Attribute,number>; permanent:Record<Attribute,number>; primary:Attribute; hp:number;mana:number;attack:number;armor:number;attackSpeed:number;maxHpPct?:number;decayContributions?:Record<string,number>;maxOnlyFlat?:number;maxOnlyPct?:number;glaivesManaContribution?:number;maxHealthOnlyHp?:number;maxHealthOnlyPct?:number }
interface AttributeState {whirlingContributions?:Record<string,{value:number;restore:number}>;ratioManaContribution?:number}
const ATTRIBUTE_STATUSES = new Set(['strength','agility','intelligence','strengthPct','agilityPct','intelligencePct','statBonus','statPercent','maxHpPct','break']);
interface PendingAction { type: 'attack' | 'cast'; due: number; recoverUntil: number; target: string; slot?: number; token: number; range?:number; rangeBuffer?:number;attackPeriod?:number;attackReadyAt?:number;castPosition?:MotionPoint;attackRecord?:AttackRecord }
interface UnitRuntime { pending?: PendingAction; token: number; channelUntil: number;channelEnd?:(reason:'complete'|'interrupted')=>void; lastTarget?: string;attackPeriod?:number;attackWindup?:number;castScale?:number;recoveringCast?:boolean;recoveringAttackCast?:boolean; motion?:MotionController;toggleOffTick?:WeakMap<SkillStack,number> }
interface UnitRuntime {cooldownLocks?:Record<string,{slot:number;skill:SkillStack;duration:number;active:boolean}>;attackBackswing?:number}
interface Task { due: number; sequence: number; effect: () => void; source?: string; token?: number; cancelOnInterrupt?: boolean; stolenOrigin?:string }
interface VisualOrigin {points?:number;visualSkill?:string;visualPoints?:number;attribution?:Attribution;category?:DamageCategory;flags?:DamageFlags;lifesteal?:boolean;healingKind?:'heal'|'regen'|'lifesteal';lifestealProviders?:EffectStatus[];lifestealVictimScale?:number;lifestealAmplificationSource?:string}
interface Projectile extends VisualOrigin { id:string;createdAt:number;source: string; target: string; skill: string; x: number; y: number; speed: number; effect: (target: CombatUnit) => void;disjointable?:boolean;disjointOnInvisibility?:boolean;attackProjectile?:boolean;onMove?:(position:{x:number;y:number})=>void;line?:{angle:number;remaining:number;distance:number;width:number;endWidth?:number;stopOnHit:boolean;targets:'enemies'|'all';targetFilter?:(unit:CombatUnit)=>boolean;hit:string[];shouldContinue?:()=>boolean;onMove?:(position:{x:number;y:number})=>void;onEnd?:()=>void} }
interface Projectile {cancelled?:boolean;onDisjoint?:(position:{x:number;y:number})=>void;onTargetLost?:(position:{x:number;y:number},reason:'dead'|'missing')=>void;ignoreInitialInvisibility?:boolean;visualProjectile?:string}
interface Zone extends VisualOrigin { id:string;createdAt:number;source: string; skill: string; x: number; y: number; until: number; next: number; interval: number; tick: number; token: number; options: ZoneOptions; stolenOrigin?:string;ended?:boolean }
function endZone(zone:Zone):void {if(zone.ended)return;zone.ended=true;zone.options.onEnd?.();}
function removeZones(b:BattleState,remove:(zone:Zone)=>boolean):void {const r=runtime(b),removed=[...new Set([...r.zones,...(r.updatingZones??[])])].filter(remove);r.zones=r.zones.filter(zone=>!removed.includes(zone));for(const zone of removed)endZone(zone);}
interface Runtime { units: Map<string, UnitRuntime>; definitions: Map<string, SkillDefinition>; tasks: Task[]; projectiles: Projectile[]; zones: Zone[]; nextSequence: number; nextSummon: number;nextProjectile:number;nextZone:number; initializing: boolean; nestedCasts: number; stolen:Map<string,StolenRuntime>;nextStolen:number;initializedSkills:WeakSet<SkillStack> }
interface Runtime {updatingZones?:Zone[];updatingProjectiles?:Set<Projectile>;initialEffects:(()=>void)[]}
interface InitialBattle { a: Player; b: Player; seed: number; version: number; simulationRevision:string; configHash:string;round: number }
interface StolenAbility {slot:number;id:string;until:number;stolenAt:number;spellAmp:number;debuffAmp:number;token:string}
type RuntimeSkill=SkillStack&{stolenOrigin?:string;grantOwners?:string[];nativeGrant?:boolean;prdOrigin?:string;visualParentId?:string;visualParentPoints?:number;statParentId?:string;statRootId?:string};
type RecipientGrant={recipientOwnedGrant?:boolean};
interface StolenRuntime {entry:StolenAbility;active:boolean;fields:Record<string,unknown>;direct:Record<string,number>;unit:string}
const proxyUnits=new WeakMap<CombatUnit,CombatUnit>();
const unwrap=(u:CombatUnit)=>proxyUnits.get(u)??u;
// Core values remain shared; arbitrary ability counters are isolated per stolen
// instance. They cannot overwrite the same ability already equipped natively.
const UNIT_FIELDS=new Set('id name role skin side x y facing hp maxHp mana maxMana attack armor magicResist attackInterval range moveSpeed skills cooldowns statuses nextAttack castUntil action actionStart dead damage taken healing heroId damageHistory moveHistory attributes strength agility intelligence primaryAttribute owner summoned illusion expiresAt sourceSkill sourceUnitType visualBody damageTakenMultiplier inheritedMode inheritedInitialized reviveAt ancient stolenAbilities turnRate attackPoint attackBackswing projectileSpeed attackRangeBuffer previousTransform warpSequence transformTick'.split(' '));
const DIRECT_INIT_FIELDS=new Set(['maxHp','maxMana','attack','armor','magicResist','attackInterval','range','moveSpeed']);
for(const field of ['abilityStats','absorbed','nativeTemplateId','nativeBaseAttackSpeed','attackCapability','attackTargetCategory','heroClone'])UNIT_FIELDS.add(field);
const runtimeByBattle = new WeakMap<BattleState, Runtime>();
const battleByUnit = new WeakMap<CombatUnit,BattleState>();
const clamp = (n: number, bound: number) => Math.min(bound, Math.max(-bound, n));
const distance = (a: CombatUnit, b: CombatUnit) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = (n: number, fallback = 0) => Number.isFinite(n) ? n : fallback;
function runtime(b: BattleState): Runtime { const r = runtimeByBattle.get(b); if (!r) throw new Error('Battle runtime has not been restored.'); return r; }
function stolenOrigin(b:BattleState,skill:SkillStack):StolenRuntime|undefined {return runtime(b).stolen.get((skill as RuntimeSkill).stolenOrigin??'');}
function chanceIdentity(u:CombatUnit,skill:SkillStack):string {
  const s=skill as RuntimeSkill;
  return `${u.id}:${s.prdOrigin??s.stolenOrigin??s.instanceId??`slot:${u.skills.indexOf(skill)}`}:${s.id}`;
}
function chanceRoll(b:BattleState,u:CombatUnit,skill:SkillStack,probability:number,key:string):boolean {
  if(!PRD_WORKING_ELIGIBILITY[skill.id]?.includes(key))return nextRandom(b)<Math.max(0,Math.min(1,probability));
  const ledger=(u.prdState??={}) as Record<string,PrdState>,id=`${chanceIdentity(u,skill)}:${key}`;
  const state=ledger[id]??={probability,failures:0,trials:0,successes:0};return rollPrd(state,probability,()=>nextRandom(b));
}
function stolenView(u:CombatUnit,origin:StolenRuntime,initializing=false):CombatUnit {
  const proxy=new Proxy(u,{get(target,key){if(typeof key!=='string'||UNIT_FIELDS.has(key))return Reflect.get(target,key);return Object.prototype.hasOwnProperty.call(origin.fields,key)?origin.fields[key]:undefined;},set(target,key,value){if(typeof key!=='string'||UNIT_FIELDS.has(key)){if(initializing&&typeof key==='string'&&DIRECT_INIT_FIELDS.has(key))origin.direct[key]=(origin.direct[key]??0)+Number(value)-Number(target[key]??0);return Reflect.set(target,key,value);}origin.fields[key]=value;return true;},deleteProperty(target,key){if(typeof key!=='string'||UNIT_FIELDS.has(key))return Reflect.deleteProperty(target,key);delete origin.fields[key];return true;}});
  proxyUnits.set(proxy,u);return proxy;
}
function initializeSkill(b:BattleState,u:CombatUnit,skill:SkillStack):void {
  const r=runtime(b);if(r.initializedSkills.has(skill))return;r.initializedSkills.add(skill);
  const d=r.definitions.get(skill.id),p=getSkillProgram(skill.id);if(!d||!p?.init)return;
  const before=new Set(u.skills.filter(Boolean));p.init(context(b,u,u,skill,d,0,{},true));
  // Legacy grant helpers are still discovered. New helpers call grantAbility,
  // which also records shared ownership when the child already exists.
  for(const added of [...u.skills])if(added&&!before.has(added)){const s=added as RuntimeSkill;s.stolenOrigin??=(skill as RuntimeSkill).stolenOrigin;s.statParentId??=skill.id;s.statRootId??=(skill as RuntimeSkill).statRootId??skill.id;initializeSkill(b,u,s);}
}
function grantAbility(b:BattleState,u:CombatUnit,parent:SkillStack,id:string,points:number,options:{released?:boolean;instanceId?:string}={}):void {
  const owner=options.released?undefined:(parent as RuntimeSkill).stolenOrigin;let child=u.skills.find(s=>s?.id===id) as RuntimeSkill|undefined;
  if(child){if(options.released)(child as RuntimeSkill&RecipientGrant).recipientOwnedGrant=true;if(owner){child.grantOwners??=[];if(!child.grantOwners.includes(owner))child.grantOwners.push(owner);}else child.nativeGrant=true;return;}
  while(u.skills.length<5){u.skills.push(null);u.cooldowns.push(0);}
  child={id,points,...(options.released?{recipientOwnedGrant:true}:{}),...(options.instanceId?{instanceId:options.instanceId}:{}),statParentId:parent.id,statRootId:(parent as RuntimeSkill).statRootId??parent.id,visualParentId:parent.id,visualParentPoints:parent.points,...(owner?{stolenOrigin:owner,grantOwners:[owner]}:{nativeGrant:true})};u.skills.push(child);u.cooldowns.push(b.time);initializeSkill(b,u,child);
}
function removeStolenAbility(b:BattleState,u:CombatUnit,entry:StolenAbility):void {
  const r=runtime(b),origin=r.stolen.get(entry.token);if(!origin?.active)return;origin.active=false;
  for(let i=0;i<u.skills.length;i++){const skill=u.skills[i] as RuntimeSkill|null;if(!skill)continue;skill.grantOwners=skill.grantOwners?.filter(id=>id!==entry.token);if(skill.stolenOrigin!==entry.token)continue;
    const next=skill.grantOwners?.find(id=>r.stolen.get(id)?.active);if(next){skill.stolenOrigin=next;r.initializedSkills.delete(skill);initializeSkill(b,u,skill);}else if(skill.nativeGrant){delete skill.stolenOrigin;r.initializedSkills.delete(skill);initializeSkill(b,u,skill);}else {u.skills[i]=null;u.cooldowns[i]=0;}
  }
  const pending=r.units.get(u.id)?.pending;if(pending?.type==='cast'&&!u.skills[pending.slot!])interrupt(b,u,true);
  for(const body of b.units){body.statuses=effects(body).filter(s=>s.stolenOrigin!==entry.token);refreshAttributes(body);if(body.stolenInitOrigin===entry.token&&!body.dead){body.dead=true;body.hp=0;interrupt(b,body);setAction(b,body,'death',true);emit(b,{type:'status',source:u.id,target:body.id,skill:entry.id,x:body.x,y:body.y,status:'stolenInitSummonExpired'});}}
  r.tasks=r.tasks.filter(task=>task.stolenOrigin!==entry.token);removeZones(b,z=>z.stolenOrigin===entry.token);
  for(const [key,amount]of Object.entries(origin.direct))u[key]=Number(u[key])-amount;
  u.maxHp=Math.max(1,u.maxHp);u.hp=Math.min(u.hp,u.maxHp);u.maxMana=Math.max(0,u.maxMana);u.mana=Math.min(u.mana,u.maxMana);refreshAttributes(u);
  u.stolenAbilities=((u.stolenAbilities??[]) as StolenAbility[]).filter(s=>s.token!==entry.token);
  emit(b,{type:'status',source:u.id,skill:entry.id,x:u.x,y:u.y,status:'stolenAbilityRemoved',origin:entry.token});
}
function stealAbility(b:BattleState,u:CombatUnit,id:string,points:number,options:{duration:number;spellAmp:number;debuffAmp:number;maxSlots:number;persistentState?:Record<string,number>}):void {
  const r=runtime(b);if(!getSkillProgram(id)||!r.definitions.has(id))return;
  for(const expired of [...((u.stolenAbilities??[]) as StolenAbility[])])if(expired.until<=b.time)removeStolenAbility(b,u,expired);
  let active=(u.stolenAbilities??[]) as StolenAbility[];if(active.some(s=>s.id===id))return;
  while(active.length>=options.maxSlots){removeStolenAbility(b,u,[...active].sort((a,c)=>a.stolenAt-c.stolenAt||a.token.localeCompare(c.token))[0]);active=u.stolenAbilities as StolenAbility[];}
  let slot=u.skills.findIndex((s,i)=>i>=4&&!s);if(slot<0)slot=Math.max(4,u.skills.length);
  while(u.skills.length<slot){u.skills.push(null);u.cooldowns.push(0);}
  const entry:StolenAbility={slot,id,until:b.time+options.duration,stolenAt:b.time,spellAmp:options.spellAmp,debuffAmp:options.debuffAmp,token:`stolen:${r.nextStolen++}`};
  r.stolen.set(entry.token,{entry,active:true,unit:u.id,direct:{},fields:{skillState:structuredClone(options.persistentState??{}),permanentSkillGains:{}}});
  const skill:RuntimeSkill={id,points,stolenOrigin:entry.token};u.skills[slot]=skill;u.cooldowns[slot]=b.time;u.stolenAbilities=[...active,entry];initializeSkill(b,u,skill);
  emit(b,{type:'status',source:u.id,skill:id,x:u.x,y:u.y,status:'abilityStolen',origin:entry.token,duration:options.duration});
}
function live(b: BattleState): CombatUnit[] { return b.units.filter(u => !u.dead); }
function effects(u: CombatUnit): EffectStatus[] { return u.statuses as EffectStatus[]; }
export function hasStatus(u: CombatUnit, kind: string): boolean { return effects(u).some(s => s.kind === kind); }
/** Explicit non-stacking groups preserve each owner's duration and attribution.
 * Unmarked effects retain the normal additive/independent-source semantics. */
export function effectiveStatusEffects(u:CombatUnit,kind:string,include:(status:EffectStatus)=>boolean=()=>true):EffectStatus[] {
  const selected:EffectStatus[]=[],groups=new Map<string,number>();
  for(const status of effects(u).filter(s=>s.kind===kind&&include(s)&&!(s.passive&&s.source===u.id&&hasStatus(u,'break')))){
    if(status.data?.suppressWithSourceBreak){const source=battleByUnit.get(unwrap(u))?.units.find(unit=>unit.id===status.source);if(source&&hasStatus(source,'break'))continue;}
    const group=status.data?.stacking==='strongest'&&typeof status.data.uniqueGroup==='string'?status.data.uniqueGroup:undefined;
    if(!group){selected.push(status);continue;}
    const index=groups.get(group);
    if(index===undefined){groups.set(group,selected.length);selected.push(status);}
    else if(Math.abs(status.value??0)>Math.abs(selected[index].value??0))selected[index]=status;
  }
  return selected;
}
export function statusValue(u:CombatUnit,kind:string):number{return effectiveStatusEffects(u,kind).reduce((n,status)=>n+(status.value??0)*(kind==='spellAmp'&&status.data?.manaRatioSpellAmp?Math.min(1,Math.max(0,u.mana/Math.max(1,u.maxMana))):1),0);}
function effectiveArmor(u:CombatUnit,options:{excludeSourceId?:string;excludeSkillId?:string}={}):number{
  const excluding=options.excludeSourceId!==undefined||options.excludeSkillId!==undefined;
  const include=(s:EffectStatus)=>!excluding||!((options.excludeSourceId===undefined||s.source===options.excludeSourceId)&&(options.excludeSkillId===undefined||s.skill===options.excludeSkillId));
  const sum=(kind:string)=>effectiveStatusEffects(u,kind,include).reduce((n,s)=>n+(s.value??0),0);
  return u.armor*(1+sum('baseArmorPct'))+sum('armor');
}
function attributeTotal(u:CombatUnit,kind:Attribute,include:(status:EffectStatus)=>boolean=()=>true,extraFlat=0,extraPercent=0):number{
  const a=u.attributes as AttributeState;let flat=extraFlat,after=0;
  for(const status of [...effectiveStatusEffects(u,kind),...effectiveStatusEffects(u,'statBonus')].filter(include))if(status.data?.afterPercent)after+=status.value??0;else flat+=status.value??0;
  const percent=[...effectiveStatusEffects(u,`${kind}Pct`),...effectiveStatusEffects(u,'statPercent')].filter(include).reduce((sum,s)=>sum+(s.value??0),extraPercent);
  return Math.max(0,(a.base[kind]+a.permanent[kind]+flat)*(1+percent)+after);
}
function initializeAttributes(u:CombatUnit,base:Record<Attribute,number>,primary:Attribute,permanent:Record<Attribute,number>={strength:0,agility:0,intelligence:0}):void {
  u.attributes={base:{...base},permanent:{...permanent},primary,hp:0,mana:0,attack:0,armor:0,attackSpeed:0} satisfies AttributeState;
  u.strength=base.strength;u.agility=base.agility;u.intelligence=base.intelligence;u.primaryAttribute=primary;
  refreshAttributes(u);
}
function refreshAttributes(u:CombatUnit):void {
  const a=u.attributes as AttributeState|undefined;if(!a)return;
  const decayContributions:Record<string,number>={};
  for(const status of effectiveStatusEffects(u,'strength').filter(status=>status.data?.attributeHealthMode==='decay')){
    const key=JSON.stringify([status.source,status.skill,status.stolenOrigin,status.data?.instanceKey]);decayContributions[key]=(decayContributions[key]??0)+(status.value??0);
  }
  const removedDecay=Object.entries(a.decayContributions??{}).reduce((sum,[key,value])=>sum+(key in decayContributions?0:value),0);
  const maxOnly=(kind:string)=>effectiveStatusEffects(u,kind).filter(status=>status.data?.attributeHealthMode==='doubleEdge').reduce((sum,status)=>sum+(status.value??0),0);
  const maxOnlyFlat=maxOnly('strength')+maxOnly('statBonus'),maxOnlyPct=maxOnly('strengthPct')+maxOnly('statPercent');
  const flatAdjustment=removedDecay+(a.maxOnlyFlat??0)-maxOnlyFlat,pctAdjustment=(a.maxOnlyPct??0)-maxOnlyPct,specialHealthChange=flatAdjustment!==0||pctAdjustment!==0;
  for(const kind of ['strength','agility','intelligence'] as const)u[kind]=attributeTotal(u,kind);
  const strengthHp=(Number(u.strength)-a.base.strength)*ATTRIBUTE_CONVERSION.strengthHp,hpPct=statusValue(u,'maxHpPct');
  const maxHealthOnlyPct=effectiveStatusEffects(u,'maxHpPct').filter(s=>s.data?.maxHealthOnly===true).reduce((n,s)=>n+(s.value??0),0),maxHealthOnlyHp=(u.maxHp-a.hp+strengthHp)*maxHealthOnlyPct;
  const hp=strengthHp+(u.maxHp-a.hp+strengthHp)*hpPct;
  const mana=(Number(u.intelligence)-a.base.intelligence)*ATTRIBUTE_CONVERSION.intelligenceMana;
  const attack=(Number(u[a.primary])-a.base[a.primary])*ATTRIBUTE_CONVERSION.primaryAttack;
  const armor=(Number(u.agility)-a.base.agility)*ATTRIBUTE_CONVERSION.agilityArmor;
  const newMaxHp=Math.max(1,u.maxHp+hp-a.hp),hpDifference=newMaxHp-u.maxHp;
  // Decay changes current HP when applied, but returning expired/stolen
  // strength only changes the maximum. Keep ordinary attribute removals intact.
  const strengthWithRemoved=attributeTotal(u,'strength',()=>true,flatAdjustment,pctAdjustment);
  const hpWithRemoved=(strengthWithRemoved-a.base.strength)*ATTRIBUTE_CONVERSION.strengthHp;
  const maxBeforeDecayRemoval=Math.max(1,(u.maxHp-a.hp+hpWithRemoved)*(1+hpPct));
  const currentHealthDifference=specialHealthChange?maxBeforeDecayRemoval-u.maxHp:hpDifference;
  const newMaxMana=Math.max(0,u.maxMana+mana-a.mana),manaDifference=newMaxMana-u.maxMana;
  const glaivesManaContribution=effectiveStatusEffects(u,'intelligence').filter(status=>status.data?.attributeManaMode==='glaivesSource').reduce((sum,status)=>sum+(status.value??0),0),glaivesManaChange=(glaivesManaContribution-(a.glaivesManaContribution??0))*ATTRIBUTE_CONVERSION.intelligenceMana;
  const ratioStatus=(s:EffectStatus)=>s.data?.afterPercent&&s.data.attributeManaMode==='preserveRatio',ratioManaContribution=effectiveStatusEffects(u,'intelligence').filter(ratioStatus).reduce((sum,s)=>sum+(s.value??0),0),withoutRatio=attributeTotal(u,'intelligence',s=>!ratioStatus(s));
  const ratioManaChange=(Math.max(0,withoutRatio+ratioManaContribution)-Math.max(0,withoutRatio+(a.ratioManaContribution??0)))*ATTRIBUTE_CONVERSION.intelligenceMana;
  const whirlingContributions:NonNullable<AttributeState['whirlingContributions']>={};
  for(const status of effectiveStatusEffects(u,'strength').filter(s=>s.data?.afterPercent&&s.data.attributeHealthMode==='whirlingDeath')){
    const key=JSON.stringify([status.source,status.skill,status.stolenOrigin,status.data?.instanceKey]);const old=whirlingContributions[key];
    whirlingContributions[key]={value:(old?.value??0)+(status.value??0),restore:Number(status.data?.hpRestorePerStrength??ATTRIBUTE_CONVERSION.strengthHp)};
  }
  let whirlingHealth=0;
  for(const key of new Set([...Object.keys(a.whirlingContributions??{}),...Object.keys(whirlingContributions)])){
    const previous=a.whirlingContributions?.[key],current=whirlingContributions[key],delta=(current?.value??0)-(previous?.value??0);
    whirlingHealth+=delta*(delta>0?previous?.restore??ATTRIBUTE_CONVERSION.strengthHp:ATTRIBUTE_CONVERSION.strengthHp);
  }
  const oldWhirling=Object.values(a.whirlingContributions??{}).reduce((sum,s)=>sum+s.value,0),withoutWhirling=attributeTotal(u,'strength',s=>s.data?.attributeHealthMode!=='whirlingDeath');
  const whirlingStrengthChange=Number(u.strength)-Math.max(0,withoutWhirling+oldWhirling),whirlingHealthCorrection=whirlingHealth-whirlingStrengthChange*ATTRIBUTE_CONVERSION.strengthHp*(1+hpPct);
  const oldMaxMana=u.maxMana,oldMana=u.mana;
  const hpBeforeAttributes=u.hp;u.maxHp=newMaxHp;u.maxMana=newMaxMana;
  if(!u.dead)u.hp=Math.max(1,Math.min(newMaxHp,Math.abs(((a.maxHpPct??0)-(a.maxHealthOnlyPct??0))-(hpPct-maxHealthOnlyPct))>1e-9?u.hp*(((specialHealthChange?maxBeforeDecayRemoval:newMaxHp)-maxHealthOnlyHp)/Math.max(1,newMaxHp-hpDifference-(a.maxHealthOnlyHp??0))):u.hp+currentHealthDifference-maxHealthOnlyHp+(a.maxHealthOnlyHp??0)));
  // Whirling's removal sets its declared HP/STR before attributes return. This
  // is not a heal or an additional copy of the configured attribute HP gain.
  if(!u.dead&&whirlingHealthCorrection!==0)u.hp=Math.max(1,Math.min(newMaxHp,u.hp+whirlingHealthCorrection));
  if(hasStatus(u,'healthFreeze')&&u.hp>hpBeforeAttributes)u.hp=hpBeforeAttributes;
  // Glaives' source keeps its current mana percentage for only its own
  // temporary intelligence changes. Other simultaneous changes retain their
  // existing flat-current-mana behavior, including the victim's stolen INT.
  const preservedManaChange=glaivesManaChange+ratioManaChange,manaBeforeGlaives=Math.max(0,oldMaxMana+manaDifference-preservedManaChange),currentBeforeGlaives=Math.max(0,Math.min(manaBeforeGlaives,oldMana+manaDifference-preservedManaChange));
  u.mana=Math.max(0,Math.min(newMaxMana,preservedManaChange!==0?(manaBeforeGlaives>0?currentBeforeGlaives*newMaxMana/manaBeforeGlaives:0):oldMana+manaDifference));
  u.attack+=attack-a.attack;u.armor+=armor-a.armor;
  Object.assign(a,{hp,mana,attack,armor,maxHpPct:hpPct,decayContributions,maxOnlyFlat,maxOnlyPct,glaivesManaContribution,ratioManaContribution,whirlingContributions,maxHealthOnlyHp,maxHealthOnlyPct,attackSpeed:(Number(u.agility)-a.base.agility)*ATTRIBUTE_CONVERSION.agilityAttackSpeed});
}
function nextRandom(b: BattleState): number {
  let x = b.rng >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  b.rng = x >>> 0; return b.rng / 4294967296;
}
function emit(b: BattleState, event: { type: CombatEvent['type']; source: string; x: number; y: number; [key: string]: unknown }): void {
  const slot=event.skill?b.units.find(u=>u.id===event.source)?.skills.find(s=>s?.id===event.skill) as RuntimeSkill|undefined:undefined;
  const visual:VisualOrigin=event.skill?{points:slot?.points,visualSkill:slot?.visualParentId??String(event.skill),visualPoints:slot?.visualParentPoints??slot?.points}:{};
  b.events.push({ ...event,points:event.points??visual.points,visualSkill:event.visualSkill??visual.visualSkill,visualPoints:event.visualPoints??visual.visualPoints, time: b.time, sequence: b.events.length } as CombatEvent);
}
function setAction(b: BattleState, u: CombatUnit, action: string, restart = false) {
  if (u.action !== action || restart) { u.action = action; u.actionStart = b.time; }
}
const isDisabled = (u: CombatUnit) => hasStatus(u,'stun') || hasStatus(u,'selfStun') || hasStatus(u,'banished');
const cannotCast = (u: CombatUnit) => isDisabled(u) || hasStatus(u,'hex') || hasStatus(u,'silence') || hasStatus(u,'duel')||hasStatus(u,'taunt');
const cannotUseAbility=(u:CombatUnit,p:SkillProgram,disableException=false)=>hasStatus(u,'actionLock')||hasStatus(u,'hex')||(!p.itemActive&&hasStatus(u,'silence'))||(p.itemActive&&hasStatus(u,'mute'))||(!disableException&&(isDisabled(u)||hasStatus(u,'duel')||hasStatus(u,'taunt')&&!p.canAutocastWhileTaunted));
const canTarget = (u: CombatUnit, single = true) => !u.dead && !u.hiddenSpellBody&&!hasStatus(u,'invulnerable') && !hasStatus(u,'banished') && !(single&&(hasStatus(u,'shadowRealm')||hasStatus(u,'undetectable')||(hasStatus(u,'invisible')&&!hasStatus(u,'revealed'))));
const canReceiveDamage=(u:CombatUnit,flags:DamageFlags)=>!((hasStatus(u,'invulnerable')&&!flags.affectsInvulnerable)||(hasStatus(u,'banished')&&!flags.affectsBanished));
const attackTargetAllowed=(source:CombatUnit,target:CombatUnit)=>{
  if(target.building&&hasStatus(source,'attackMagical'))return false;
  if(target.building&&!isRangedAttackType(source)&&typeof source.buildingAttackOwnerRange==='number'){const owner=battleByUnit.get(source)?.units.find(u=>u.id===source.owner);if(!owner||distance(owner,target)>source.buildingAttackOwnerRange)return false;}
  return source.attackTargetCategory!=='heroes'||!target.summoned||!!target.illusion||!!target.heroClone;
};
const unitTarget=(program:SkillProgram,c:EffectContext)=>typeof program.unitTarget==='function'?program.unitTarget(c):program.unitTarget??isUnitTargetSkill(c.definition);
const castBackswing=(program:SkillProgram,c:EffectContext,balance:SkillBalance|undefined)=>Math.max(0,program.dynamicBackswing?.(c)??balance?.backswing??program.backswing??.2);
function interrupt(b: BattleState, u: CombatUnit, onlyCast = false): void {
  const state = runtime(b).units.get(u.id)!;
  if (!onlyCast || state.pending?.type === 'cast' || state.channelUntil > b.time) {
    if (state.pending || state.channelUntil > b.time || state.channelEnd) {
      // Cancelling an unreleased attack does not consume a new attack cycle.
      // Once released, pending is gone and backswing cancellation cannot reset BAT.
      if(state.pending?.type==='attack')u.nextAttack=Math.min(u.nextAttack,b.time);
      const onEnd=state.channelEnd;state.channelEnd=undefined;
      state.pending = undefined; state.token++; state.channelUntil = 0;state.recoveringCast=false;
      removeZones(b,z=>z.source===u.id&&!!z.options.channel);
      u.castUntil = b.time; emit(b, { type:'status', source:u.id,x:u.x,y:u.y,status:'interrupted' });
      onEnd?.('interrupted');
    }
  }
}
function channelUnit(b:BattleState,u:CombatUnit,duration:number,onEnd:(reason:'complete'|'interrupted')=>void):boolean{
  if(u.dead||!Number.isFinite(duration)||duration<=0)return false;
  const state=runtime(b).units.get(u.id);if(!state)return false;
  interrupt(b,u);if(u.dead||state.channelEnd||state.channelUntil>b.time)return false;
  state.token++;state.channelUntil=b.time+duration;state.channelEnd=onEnd;state.recoveringCast=false;u.castUntil=state.channelUntil;setAction(b,u,'channel',true);return true;
}
function shareUnitChannel(b:BattleState,u:CombatUnit,onEnd:(reason:'complete'|'interrupted')=>void):boolean{
  const state=runtime(b).units.get(u.id);if(u.dead||!state||state.channelUntil<=b.time)return false;
  const current=state.channelEnd;state.channelEnd=reason=>{current?.(reason);onEnd(reason);};return true;
}
function updateUnitChannels(b:BattleState):void{
  for(const u of b.units){const state=runtime(b).units.get(u.id);if(!state?.channelEnd||state.channelUntil>b.time+1e-8)continue;
    const onEnd=state.channelEnd;state.channelEnd=undefined;state.channelUntil=0;u.castUntil=b.time;if(!u.dead&&u.action==='channel')setAction(b,u,'idle');
    removeZones(b,zone=>zone.source===u.id&&!!zone.options.channel);onEnd(u.dead?'interrupted':'complete');
  }
}
function movementSpeed(u:CombatUnit):number {
  const absolute=effects(u).filter(s=>s.kind==='forceMoveSpeed').sort((a,b)=>Number(b.data?.priority??0)-Number(a.data?.priority??0))[0];
  const hex=effects(u).find(status=>status.kind==='hex'&&typeof status.data?.baseMoveSpeed==='number'),baseSpeed=hex?Number(hex.data!.baseMoveSpeed):u.moveSpeed;
  const limits=BATTLE_CONFIG as typeof BATTLE_CONFIG&{minimumMoveSpeed?:number;maximumMoveSpeed?:number};
  let speed=absolute?.value??(baseSpeed<=0?0:(baseSpeed+statusValue(u,'moveFlat'))*(1+statusValue(u,'haste'))*(1-(hasStatus(u,'slowImmune')||effects(u).some(s=>s.kind==='berserk'&&s.data?.engaged)?0:Math.min(.95,statusValue(u,'slow')))));
  if(!absolute&&statusValue(u,'minimumMoveSpeed')>0)speed=Math.max(speed,statusValue(u,'minimumMoveSpeed'));
  if(!absolute&&speed>0){const minimum=Math.max(limits.minimumMoveSpeed??1,statusValue(u,'minimumMoveSpeed')),caps=effects(u).filter(s=>s.kind==='maximumMoveSpeed'&&(s.value??0)>0).map(s=>s.value!);const maximum=caps.length?Math.min(...caps):(limits.maximumMoveSpeed??5.5);speed=Math.max(Math.min(minimum,maximum),Math.min(maximum,speed));}
  if(!hex&&hasStatus(u,'hex'))speed=Math.min(speed,.8);
  return Math.max(0,speed);
}
/** Remaining animation work follows entry/exit from speed modifiers. Channel
 * durations and periodic spell pulses intentionally use world time: cast speed
 * changes animation timing, not the number of seconds in a channel tooltip. */
function syncActionClocks(b:BattleState,u:CombatUnit):void {
  const state=runtime(b).units.get(u.id)!;
  const target=b.units.find(t=>t.id===state.lastTarget),period=attackInterval(u,target),windup=attackWindup(u,period,target),backswing=attackBackswing(u,period,target),cast=Math.max(.01,1+statusValue(u,'castTimePct'));
  const attackRatio=period/(state.attackPeriod??period),windupRatio=windup/(state.attackWindup??windup),backswingRatio=backswing/(state.attackBackswing??backswing),castRatio=cast/(state.castScale??1);
  const scale=(until:number,ratio:number)=>until>b.time?b.time+(until-b.time)*ratio:until;
  if(Math.abs(attackRatio-1)>1e-9){u.nextAttack=scale(u.nextAttack,attackRatio);if(state.pending?.type==='attack')state.pending.recoverUntil=scale(state.pending.recoverUntil,attackRatio);}
  if(Math.abs(windupRatio-1)>1e-9&&state.pending?.type==='attack')state.pending.due=scale(state.pending.due,windupRatio);
  const attackCast=state.pending?.type==='cast'&&state.pending.attackPeriod!==undefined?state.pending:undefined;
  if(attackCast){
    const backswing=Math.max(0,attackCast.recoverUntil-attackCast.due);
    attackCast.due=scale(attackCast.due,windupRatio);attackCast.recoverUntil=attackCast.due+backswing*backswingRatio;
    attackCast.attackReadyAt=scale(attackCast.attackReadyAt??u.actionStart+attackCast.attackPeriod!,attackRatio);attackCast.attackPeriod=period;u.castUntil=attackCast.recoverUntil;
  }else if(Math.abs(castRatio-1)>1e-9){if(state.pending?.type==='cast'){state.pending.due=scale(state.pending.due,castRatio);state.pending.recoverUntil=scale(state.pending.recoverUntil,castRatio);u.castUntil=state.pending.recoverUntil;}else if(state.recoveringCast&&!state.recoveringAttackCast&&state.channelUntil<=b.time)u.castUntil=scale(u.castUntil,castRatio);}
  if(state.recoveringAttackCast&&!state.pending&&state.channelUntil<=b.time)u.castUntil=scale(u.castUntil,backswingRatio);
  if(u.castUntil<=b.time)state.recoveringCast=false;
  if(state.attackPeriod!==undefined){state.attackPeriod=period;state.attackWindup=windup;state.attackBackswing=backswing;}state.castScale=cast;
}
function addStatus(b: BattleState, source: CombatUnit, target: CombatUnit, skill: string, kind: string, seconds: number, value = 0, options: Partial<EffectStatus> = {},originToken?:string): void {
  if (target.dead || seconds <= 0 || !Number.isFinite(seconds)) return;
  skill=options.skill??skill;const statusSource=options.source??source.id;
  const harmful = options.harmful ?? false;
  if (harmful && ((hasStatus(target,'invulnerable')&&!options.affectsInvulnerable) || (hasStatus(target,'magicImmune') && !options.piercesImmunity))) return;
  const reduction = harmful && source.side!==target.side && !options.ignoreStatusResistance && !['dot','armor','magicVulnerability'].includes(kind) ? Math.min(.9,independentFraction(effects(target).filter(s=>s.kind==='statusResistance').map(s=>s.value??0),-2)) : 0;
  const stolen=originToken?runtime(b).stolen.get(originToken)?.entry:undefined;
  const until = b.time + seconds * (1 - reduction) * (harmful?1+(stolen?.debuffAmp??0):1);
  const stack = !!options.maxStacks;
  let existing = effects(target).find(s => s.kind === kind && s.source === statusSource && s.skill === skill && s.stolenOrigin===options.stolenOrigin && s.data?.instanceKey===options.data?.instanceKey);
  if (stack) {
    const same = effects(target).filter(s => s.kind===kind && s.source===statusSource && s.skill===skill && s.stolenOrigin===options.stolenOrigin && s.data?.instanceKey===options.data?.instanceKey);
    if (same.length >= (options.maxStacks ?? 1)) existing = same.sort((a,b)=>a.until-b.until)[0]; else existing = undefined;
  }
  const nextTick = options.interval ? b.time + options.interval : kind==='arcaneCurse'?b.time+Math.max(FIXED_STEP,Number(options.data?.damageInterval??1)):undefined;
  if(existing?.kind==='shield'&&existing.data?.burstRadius){target.statuses=target.statuses.filter(s=>s!==existing);burstShield(b,target,existing);existing=undefined;}
  const status: EffectStatus = { kind, until, value, source:source.id, skill, harmful, dispel:options.dispel ?? 'basic', ...options, appliedAt:options.appliedAt??b.time, nextTick, stolenDamageOrigin:originToken };
  if(kind==='ghostshipRum'&&existing?.data?.debtKey)status.data={...status.data,debtKey:existing.data.debtKey};
  if (existing) Object.assign(existing, status, { nextTick: existing.nextTick ?? nextTick }); else target.statuses.push(status);
  if(ATTRIBUTE_STATUSES.has(kind))refreshAttributes(target);
  emit(b,{type:'status',source:source.id,target:target.id,skill,x:target.x,y:target.y,status:kind,duration:until-b.time,amount:value,points:status.points,visualSkill:status.visualSkill,visualPoints:status.visualPoints});
  if (['stun','hex','selfStun','banished','fear','actionLock'].includes(kind)) interrupt(b,target);
  else if (kind==='silence'||kind==='duel') interrupt(b,target,true);
  else if(kind==='root'||kind==='soulbind'){const pending=runtime(b).units.get(target.id)?.pending,ability=pending?.type==='cast'?target.skills[pending.slot!]:undefined;if(ability&&referenceRootDisables(ability.id))interrupt(b,target,true);}
  if(['root','soulbind','leash','duel'].includes(kind)){const state=runtime(b).units.get(target.id),motion=state?.motion;if(motion&&((kind==='duel'&&options.data?.duelRules)||(motion.cancelOnRoot&&kind!=='duel')))finishMotion(b,target,motion,'interrupted');}
  if(kind==='duel'&&options.data?.duelRules)addStatus(b,source,target,skill,'revealed',until-b.time,0,{harmful,dispel:'strong',piercesImmunity:true,ignoreStatusResistance:true,data:{duelKey:options.data.duelKey,duelRules:true}},originToken);
}
function notifyStatusRemoved(b:BattleState,target:CombatUnit,status:EffectStatus,reason:'dispel'|'expire'):void {
  if(target.dead||!status.skill)return;
  const source=b.units.find(u=>u.id===status.source),definition=runtime(b).definitions.get(status.skill),program=getSkillProgram(status.skill);
  if(!source||!definition||!program?.onStatusRemoved)return;
  const skill:RuntimeSkill={id:status.skill,points:status.points??1,instanceId:status.attribution?.skillInstanceId,statParentId:status.attribution?.parentAbilityId,statRootId:status.attribution?.rootAbilityId};
  const c=context(b,source,target,skill,definition);
  // A released mark retains its original owner/level even if the source dies,
  // steals a replacement spell, or changes its current ability slots.
  c.damage=(unit,amount,type='magical',pierces=status.piercesImmunity??false,options)=>applyDamage(b,source,unwrap(unit),amount,type,status.skill,pierces,0,false,status.stolenDamageOrigin,{points:status.points,visualSkill:status.visualSkill,visualPoints:status.visualPoints,attribution:status.attribution,...options});
  program.onStatusRemoved(c,status,reason);
}
function notifyAffectedDeath(b:BattleState,target:CombatUnit,status:EffectStatus,deathCredit?:EffectContext['deathCredit']):void {
  if(!status.skill)return;const source=b.units.find(unit=>unit.id===status.source),definition=runtime(b).definitions.get(status.skill),program=getSkillProgram(status.skill);
  if(!source||!definition||!program?.onAffectedUnitDeath)return;
  const skill:RuntimeSkill={id:status.skill,points:status.points??1,instanceId:status.attribution?.skillInstanceId,statParentId:status.attribution?.parentAbilityId,statRootId:status.attribution?.rootAbilityId},c=context(b,source,target,skill,definition,0,{deathCredit});
  c.damage=(unit,amount,type='magical',pierces=status.piercesImmunity??false,options)=>applyDamage(b,source,unwrap(unit),amount,type,status.skill,pierces,0,false,status.stolenDamageOrigin,{points:status.points,visualSkill:status.visualSkill,visualPoints:status.visualPoints,attribution:status.attribution,...options});
  program.onAffectedUnitDeath(c,status);
}
function notifyAffectedDamage(b:BattleState,target:CombatUnit,status:EffectStatus,attacker:CombatUnit,amount:number,type:DamageType,skill:string|undefined,category:DamageCategory,flags:DamageFlags,depth:number):void{
  if(!status.skill)return;const source=b.units.find(unit=>unit.id===status.source),definition=runtime(b).definitions.get(status.skill),program=getSkillProgram(status.skill);
  if(!source||!definition||!program?.onAffectedUnitDamage)return;
  const original:RuntimeSkill={id:status.skill,points:status.points??1,instanceId:status.attribution?.skillInstanceId,statParentId:status.attribution?.parentAbilityId,statRootId:status.attribution?.rootAbilityId};
  const c=context(b,source,target,original,definition,depth+1,{amount,damageType:type,damageFlags:{...flags},damageCategory:category,triggerSkillId:skill,triggerUnitId:attacker.id});
  c.damage=(unit,value,damageType='magical',pierces=status.piercesImmunity??false,options)=>applyDamage(b,source,unwrap(unit),value,damageType,status.skill,pierces,depth+1,false,status.stolenDamageOrigin,{points:status.points,visualSkill:status.visualSkill,visualPoints:status.visualPoints,attribution:status.attribution,...options});
  program.onAffectedUnitDamage(c,status);
}
function removeStatuses(b: BattleState, target: CombatUnit, strong = false, harmful = true) {
  const previous=[...effects(target)];
  target.statuses = effects(target).filter(s => {
    if (!!s.harmful !== harmful || s.dispel==='none') return true;
    return s.dispel==='strong' && !strong;
  });
  for(const s of previous)if(!target.statuses.includes(s)){if(s.kind==='ghostshipRum')beginRumPayback(b,target,s);if(s.kind==='shield')burstShield(b,target,s);notifyStatusRemoved(b,target,s,'dispel');}
  refreshAttributes(target);
  emit(b,{type:'status',source:target.id,target:target.id,x:target.x,y:target.y,status:strong?'strongDispel':'basicDispel'});
}
export function physicalDamageMultiplier(armor: number): number { return 1 - .06 * armor / (1 + .06 * Math.abs(armor)); }
function creditUnit(b: BattleState, unit: CombatUnit): CombatUnit {
  return unit.owner ? b.units.find(u=>u.id===unit.owner) ?? unit : unit;
}
function attributionFor(b:BattleState,source:CombatUnit,skill?:string,visual:VisualOrigin={}):Attribution {
  return resolveAttribution(b,source,{abilityId:skill??BASIC_ATTACK_ID,...visual.attribution});
}
function tetherPartner(b:BattleState,u:CombatUnit):{unit:CombatUnit;multiplier:number}|undefined {
  const s=effects(u).find(s=>s.kind==='tether'),partner=b.units.find(t=>t.id===s?.data?.partnerId&&!t.dead);
  if(s&&partner&&distance(u,partner)<=Number(s.data?.maxDistance??10))return {unit:partner,multiplier:s.value??0};
}
function changeMana(b:BattleState,u:CombatUnit,amount:number,transferred=false):number {
  const old=u.mana;u.mana=Math.max(0,Math.min(u.maxMana,u.mana+amount));const actual=u.mana-old;
  if(amount>0&&!transferred){const tether=tetherPartner(b,u);if(tether)changeMana(b,tether.unit,amount*tether.multiplier,true);}return actual;
}
function restorationFactor(unit:CombatUnit,kind:'heal'|'regen'|'lifesteal',amplificationSource=unit):number {
  const applicable=(name:string)=>effectiveStatusEffects(unit,name).filter(status=>kind==='heal'||!status.data?.healingOnly);
  const value=(name:string)=>applicable(name).reduce((sum,status)=>sum+(status.value??0),0);
  const reductions=[...applicable('healReduction'),...(kind==='lifesteal'?applicable('lifestealReduction'):[])];
  const additive=reductions.filter(status=>status.data?.restorationStacking!=='multiplicative').reduce((sum,status)=>sum+(status.value??0),0);
  const reductionFactor=reductions.filter(status=>status.data?.restorationStacking==='multiplicative').reduce((factor,status)=>factor*(1-Math.min(1,Math.max(0,status.value??0))),1-Math.min(1,Math.max(0,additive)));
  const amplification=kind==='lifesteal'?effectiveStatusEffects(amplificationSource,'lifestealAmplification').filter(status=>!status.data?.healingOnly).reduce((sum,status)=>sum+(status.value??0),0):value(kind==='heal'?'healAmplification':'regenAmplification');
  return reductionFactor*(1+Math.max(-1,amplification));
}
function heal(b: BattleState, source: CombatUnit, target: CombatUnit, amount: number, skill?: string,transferred=false,depth=0,visual:VisualOrigin={}): number {
  if (target.dead || amount<=0) return 0;
  const reduced=amount*restorationFactor(target,visual.lifesteal?'lifesteal':visual.healingKind??'heal',b.units.find(unit=>unit.id===visual.lifestealAmplificationSource)??target);
  const attribution=attributionFor(b,source,skill,visual);
  if(hasStatus(target,'falsePromise')){const ledger=deferredLedger(target);ledger.healing+=reduced;ledger.healingEntries.push({source:source.id,amount:reduced,attribution});return 0;}
  const actual = Math.max(0,Math.min(target.maxHp-target.hp,reduced));
  target.hp += actual;recordHealing(b,source,target,actual,attribution);
  if(actual>0)emit(b,{type:'heal',source:source.id,target:target.id,skill,x:target.x,y:target.y,amount:actual,...visual,attribution});
  if(reduced>0&&!transferred){const tether=tetherPartner(b,target);if(tether)heal(b,target,tether.unit,reduced*tether.multiplier,'wisp_tether',true,depth+1);}
  if(actual>0&&!transferred&&!visual.lifesteal&&depth===0&&skill&&!skill.toLowerCase().includes('lifesteal'))runHooks(b,source,'onHeal',target,actual,undefined,depth+1,skill);
  return actual;
}
interface HealthContribution {source:string;amount:number;attribution:Attribution;skill?:string;type?:DamageType;flags?:DamageFlags;lifestealProviders?:EffectStatus[]}
interface DeferredHealth { healing: number; healingEntries:HealthContribution[];damage: HealthContribution[] }
interface PendingPromise {ledger:DeferredHealth;healMultiplier:number}
interface RumLedger {total:number;entries:HealthContribution[]}
interface RumPayback extends RumLedger {remaining:number;rate:number;interval?:number;nextTick?:number}
function beginRumPayback(b:BattleState,u:CombatUnit,s:EffectStatus):void{
  const debts=(u.rumDebts??{}) as Record<string,RumLedger>,key=String(s.data?.debtKey??''),ledger=debts[key];if(!ledger)return;delete debts[key];
  const interval=Number(s.data?.paybackInterval??0),repayments=(u.rumPaybacks??[]) as RumPayback[];repayments.push({...ledger,remaining:ledger.total,rate:ledger.total/Math.max(FIXED_STEP,Number(s.data?.paybackDuration??10)),...(interval>0?{interval,nextTick:b.time+interval}:{})});u.rumPaybacks=repayments;
}
function repayRum(b:BattleState,u:CombatUnit):void{
  const repayments=(u.rumPaybacks??[]) as RumPayback[];
  for(const debt of repayments){
    if(debt.interval&&Number(debt.nextTick)>b.time+1e-8)continue;
    const scheduled=Math.min(debt.remaining,debt.rate*(debt.interval??FIXED_STEP)),actual=Math.min(scheduled,Math.max(0,u.hp-1));debt.remaining=Math.max(0,debt.remaining-scheduled);u.hp-=actual;
    if(debt.interval)debt.nextTick=Number(debt.nextTick)+debt.interval;
    const portions=distributeEffective(actual,debt.entries.map(entry=>entry.amount));
    debt.entries.forEach((entry,index)=>{const value=portions[index],source=b.units.find(t=>t.id===entry.source)??u;if(value<=0)return;const type=entry.type??'pure',flags={...entry.flags,delayed:true,nonLethal:true};recordDamage(b,source,u,value,type,entry.attribution,flags);emit(b,{type:'hit',source:source.id,target:u.id,skill:entry.skill,x:u.x,y:u.y,amount:value,attribution:entry.attribution,flags,rumPayback:true,damageType:type,originDamageType:type,resolutionKind:'rumRepayment'});});
  }
  u.rumPaybacks=repayments.filter(d=>d.remaining>1e-8);
}
function deferredLedger(u:CombatUnit):DeferredHealth { if(!u.deferredHealth)u.deferredHealth={healing:0,healingEntries:[],damage:[]};return u.deferredHealth as DeferredHealth; }
function settleDeferredHealth(b:BattleState,u:CombatUnit,status:EffectStatus){
  const ledger=deferredLedger(u);u.deferredHealth=undefined;
  const pending:PendingPromise={ledger,healMultiplier:Number(status.data?.healMultiplier??2)};
  if(!canReceiveDamage(u,{})){const queue=(u.pendingFalsePromises??=[]) as PendingPromise[];queue.push(pending);return;}
  resolveDeferredHealth(b,u,pending);
}
function resolveDeferredHealth(b:BattleState,u:CombatUnit,pending:PendingPromise):void{
  if(u.dead)return;
  const {ledger,healMultiplier}=pending,damage=ledger.damage.reduce((n,d)=>n+d.amount,0),healing=ledger.healing*healMultiplier,net=damage-healing;
  if(net>0){
    let lethalBudget=u.hp+healing,killer:HealthContribution|undefined;
    for(const entry of ledger.damage){const resolved=Math.min(entry.amount,Math.max(0,lethalBudget-(entry.flags?.nonLethal?1:0)));lethalBudget-=resolved;if(lethalBudget<=0){killer=entry;break;}}
    if(hasStatus(u,'undying'))lethalBudget=Math.max(1,lethalBudget);
    const actual=Math.min(u.hp,Math.max(0,u.hp-lethalBudget)),portions=distributeEffective(actual,ledger.damage.map(entry=>entry.amount));
    u.hp-=actual;ledger.damage.forEach((entry,index)=>{const value=portions[index];if(value<=0)return;const source=b.units.find(x=>x.id===entry.source)??u,type=entry.type??'pure',flags={...entry.flags,delayed:true};recordDamage(b,source,u,value,type,entry.attribution,flags);emit(b,{type:'hit',source:source.id,target:u.id,skill:entry.skill,x:u.x,y:u.y,amount:value,damageType:type,originDamageType:type,resolutionKind:'falsePromise',flags,attribution:entry.attribution,deferred:true});});
    if(u.hp<=0)kill(b,u,b.units.find(x=>x.id===killer?.source),killer?.skill);
  }else if(net<0){
    const actual=Math.min(u.maxHp-u.hp,-net),entries=ledger.healingEntries,portions=distributeEffective(actual,entries.map(entry=>entry.amount));u.hp+=actual;
    entries.forEach((entry,index)=>{const value=portions[index];if(value<=0)return;const source=b.units.find(x=>x.id===entry.source)??u;recordHealing(b,source,u,value,entry.attribution);emit(b,{type:'heal',source:source.id,target:u.id,skill:entry.attribution.abilityId,x:u.x,y:u.y,amount:value,attribution:entry.attribution,resolutionKind:'falsePromise',deferred:true});});
  }
}
function updatePendingPromises(b:BattleState,u:CombatUnit):void{
  if(u.dead){u.pendingFalsePromises=[];return;}if(!canReceiveDamage(u,{}))return;
  const queue=(u.pendingFalsePromises??[]) as PendingPromise[];u.pendingFalsePromises=[];
  for(const pending of queue){if(u.dead)break;resolveDeferredHealth(b,u,pending);}
}
function runHooks(b: BattleState, unit: CombatUnit, hook: 'onAttack'|'onAttacked'|'onIncomingAttackStart'|'onBeforeAttackDamageReceived'|'onBeforeDamageResolution'|'onDamage'|'onDealDamage'|'onAbilityDamageEvent'|'onIncomingDamageEvent'|'onCast'|'onSpellOrder'|'onKill'|'onDeath'|'onAllyCast'|'onAllyAttack'|'onAllyAttackPoint'|'onAttackPoint'|'onUnitDeath'|'onManaShieldSpent'|'onHeal'|'onAllyBeforeAttackDamage'|'onBeforeAbilityEffect'|'onAbilityExecuted', target: CombatUnit, amount = 0, damageType?: DamageType, depth = 0, triggerSkillId?: string,triggerUnitId?:string,hookMetadata?:Partial<EffectContext>) {
  if(unit.dead&&hook!=='onDeath'&&hook!=='onAllyBeforeAttackDamage')return;
  for (const skill of unit.skills) {
    if(!skill)continue;const p=getSkillProgram(skill.id),d=runtime(b).definitions.get(skill.id);
    if(unit.dead&&hook==='onAllyBeforeAttackDamage'&&!p?.onAllyBeforeAttackDamageAfterDeath)continue;
    if(p?.[hook]&&d&&!(p.passive&&!p.handlesBreak&&hasStatus(unit,'break'))) p[hook]!(context(b,unit,target,skill,d,depth,{amount,damageType,triggerSkillId,triggerUnitId,...hookMetadata},false,true));
  }
  refreshAttributes(unit);if(target!==unit)refreshAttributes(target);
}
function consumeSpellBlock(b:BattleState,source:CombatUnit,target:CombatUnit,skill:string):boolean {
  const block=effects(target).find(status=>status.kind==='spellBlock');if(!block)return false;
  target.statuses=target.statuses.filter(status=>status!==block);emit(b,{type:'status',source:target.id,target:source.id,skill,x:target.x,y:target.y,status:'spellBlocked'});return true;
}
function finishEffectCooldown(b:BattleState,unit:CombatUnit,skill:SkillStack,seconds?:number,options?:{force?:boolean}):void {
  const lock=runtime(b).units.get(unit.id)?.cooldownLocks?.[chanceIdentity(unit,skill)];
  if(!options?.force&&!lock?.active)return;
  const slot=options?.force?unit.skills.indexOf(skill):lock!.slot;
  if(slot<0||unit.skills[slot]!==skill||(!options?.force&&unit.skills[slot]!==lock!.skill))return;
  if(lock)lock.active=false;
  const duration=Math.max(0,seconds??lock?.duration??0);if(!Number.isFinite(duration))return;
  unit.cooldowns[slot]=b.time+duration;
  emit(b,{type:'status',source:unit.id,skill:skill.id,x:unit.x,y:unit.y,status:'cooldownStarted',duration});
}
function reduceCooldowns(b:BattleState,unit:CombatUnit,seconds:number,options:{includeUltimates?:boolean;excludeAbilityId?:string;onlyAbilityId?:string;includeChargeRecharge?:boolean;includeActiveEffect?:boolean}={}):void {
  if(!Number.isFinite(seconds)||seconds<=0)return;
  for(let slot=0;slot<unit.skills.length;slot++){
    const skill=unit.skills[slot];if(!skill||skill.id===options.excludeAbilityId||(options.onlyAbilityId&&skill.id!==options.onlyAbilityId))continue;
    const definition=runtime(b).definitions.get(skill.id),program=getSkillProgram(skill.id);if(!definition||(!options.includeUltimates&&definition.ultimate))continue;
    unit.cooldowns[slot]=Math.max(b.time,(unit.cooldowns[slot]??0)-seconds);
    if(options.includeChargeRecharge)program?.reduceRecharge?.(context(b,unit,unit,skill,definition),seconds);
    if(options.includeActiveEffect){const lock=runtime(b).units.get(unit.id)?.cooldownLocks?.[chanceIdentity(unit,skill)];if(lock?.active)lock.duration=Math.max(0,lock.duration-seconds);}
  }
}
function kill(b: BattleState, unit: CombatUnit, source?: CombatUnit, skill?: string): void {
  const duelKeys=new Set(effects(unit).filter(status=>status.kind==='duel'&&status.data?.duelKey).map(status=>String(status.data!.duelKey)));
  if(unit.dead)return;
  const marker=effects(unit).filter(s=>s.until>b.time+1e-8&&s.data?.mechanicalKillCredit&&s.source&&s.skill&&b.units.some(u=>u.id===s.source&&u.side!==unit.side)).sort((a,c)=>Number(c.data?.killCreditPriority??0)-Number(a.data?.killCreditPriority??0)||Number(c.appliedAt??0)-Number(a.appliedAt??0)||String(a.source).localeCompare(String(c.source)))[0];
  const actualSource=source?.id,actualSkill=skill;
  if(marker){source=b.units.find(u=>u.id===marker.source);skill=marker.skill;}
  const deathCredit:EffectContext['deathCredit']=source?{sourceId:source.id,skillId:skill??BASIC_ATTACK_ID,skillInstanceId:marker?.attribution?.skillInstanceId,statusInstanceKey:typeof marker?.data?.instanceKey==='string'?marker.data.instanceKey:undefined}:undefined;
  unit.hp=0;unit.dead=true;interrupt(b,unit);setAction(b,unit,'death',true);
  emit(b,{type:'death',source:source?.id??unit.id,target:unit.id,skill,x:unit.x,y:unit.y,...(marker?{actualSource,actualSkill,killCreditOverride:true}:{})});
  unit.rumDebts={};unit.rumPaybacks=[];unit.pendingFalsePromises=[];unit.deferredHealth=undefined;
  runHooks(b,unit,'onDeath',source??unit,0,undefined,0,undefined,undefined,{deathCredit});
  for(const status of [...effects(unit)])notifyAffectedDeath(b,unit,status,deathCredit);
  unit.statuses=effects(unit).filter(status=>!status.removeOnDeath);refreshAttributes(unit);
  if(source&&source.side!==unit.side)runHooks(b,source,'onKill',unit,0,undefined,0,skill,undefined,{deathCredit});
  for(const observer of live(b))runHooks(b,observer,'onUnitDeath',unit,0,undefined,0,undefined,undefined,{deathCredit});
  for(const body of b.units)body.statuses=effects(body).filter(s=>!duelKeys.has(String(s.data?.duelKey))&&(s.kind!=='duel'||(body.id!==unit.id&&s.data?.targetId!==unit.id)));
  const reincarnation=effects(unit).find(s=>s.kind==='reincarnation'&&(s.value??0)>0);
  if(reincarnation){reincarnation.value=0;scheduleRevive(b,unit,3,.5);}
}
export function applyDamage(b: BattleState, source: CombatUnit, target: CombatUnit, amount: number, type: DamageType='magical', skill?: string, piercesImmunity=false, depth=0,ignoreBaseArmor=false,originToken?:string,visual:VisualOrigin={}): number {
  if(target.dead||!Number.isFinite(amount)||depth>8)return 0;
  if(visual.flags?.healthLoss)visual={...visual,flags:{...visual.flags,noDamageHooks:true,noSpellLifesteal:true,noAmplification:true,noReflection:true,bypassGenericMultipliers:true}};
  const category=visual.category??(skill?'spell':'attack'),flags=visual.flags??{},attack=category==='attack';
  // Unit/ability eligibility is separate from post-mitigation HP loss. Full
  // barriers, Refraction, physical immunity and Borrowed Time still yield an
  // accepted zero-damage instance. Untargetable invulnerability, banishment or
  // non-pierced spell immunity reject the instance before damage processing.
  const accepted=category==='spell'&&!!skill&&skill!==BASIC_ATTACK_ID&&!flags.healthRemoval&&!flags.noDamageHooks&&!flags.reflection
    &&canReceiveDamage(target,flags)
    &&!((type!=='physical'||!attack)&&hasStatus(target,'magicImmune')&&!piercesImmunity)
    &&!(!attack&&(hasStatus(target,'immuneSpells')||effects(target).some(status=>status.kind==='hitCountBody'&&status.data?.immuneSpells)));
  // Native negative damage is corrected to zero; it is never converted to a
  // heal. Keep the original input on the dedicated event for source auditing.
  const incomingAccepted=amount>0&&category!=='hpRemoval'&&!flags.healthRemoval&&!flags.noDamageHooks&&canReceiveDamage(target,flags)
    &&!((type!=='physical'||!attack)&&hasStatus(target,'magicImmune')&&!piercesImmunity)
    &&!(!attack&&(hasStatus(target,'immuneSpells')||effects(target).some(status=>status.kind==='hitCountBody'&&status.data?.immuneSpells)));
  const actual=resolveDamage(b,source,target,Math.max(0,amount),type,skill,piercesImmunity,depth,ignoreBaseArmor,originToken,visual);
  if(incomingAccepted)runHooks(b,target,'onIncomingDamageEvent',source,actual,type,depth+1,skill,source.id,{incomingDamageEvent:{inputAmount:amount,actualDamage:actual,category,flags:{...flags}}});
  if(accepted)runHooks(b,source,'onAbilityDamageEvent',target,actual,type,depth+1,skill,source.id,{abilityDamageEvent:{inputAmount:amount,actualDamage:actual,category,flags:{...flags},attribution:attributionFor(b,source,skill,visual)}});
  return actual;
}
/** Effective damage accounting remains independent of accepted instance hooks.
 * Deferred settlements call commitResolvedDamage directly and cannot emit the
 * original ability instance a second time. */
function resolveDamage(b: BattleState, source: CombatUnit, target: CombatUnit, amount: number, type: DamageType='magical', skill?: string, piercesImmunity=false, depth=0,ignoreBaseArmor=false,originToken?:string,visual:VisualOrigin={}): number {
  if(target.dead||!Number.isFinite(amount)||amount<=0||depth>8)return 0;
  const category=visual.category??(skill?'spell':'attack'),flags=visual.flags??{},attack=category==='attack';
  const heroAttacker=!source.building&&!source.ward&&!source.courier&&(!source.summoned||!!source.illusion||!!source.heroClone||!!source.extraSpiritBear);
  visual={...visual,category,flags,attribution:attributionFor(b,source,skill,visual)};
  refreshAttributes(source);refreshAttributes(target);
  if(!canReceiveDamage(target,flags))return 0;
  if(!flags.healthLoss&&(flags.healthRemoval||category==='hpRemoval'))return commitResolvedDamage(b,source,target,amount,type,skill,depth,false,{...visual,category:'hpRemoval',lifestealProviders:[],flags:{...flags,healthRemoval:true,noAmplification:true,noSpellLifesteal:true,noReflection:true,noDamageHooks:true}});
  if(type==='physical'&&hasStatus(target,'physicalImmune'))return 0;
  if((type!=='physical'||!attack)&&hasStatus(target,'magicImmune')&&!piercesImmunity)return 0;
  const dodge=Math.min(1,Math.max(0,statusValue(target,'damageDodge')));if(dodge>0&&nextRandom(b)<dodge){emit(b,{type:'hit',source:source.id,target:target.id,skill,x:target.x,y:target.y,amount:0,outcome:'damageDodged'});return 0;}
  const hitCount=effects(target).find(s=>s.kind==='hitCountBody');
  if(!attack&&(hasStatus(target,'immuneSpells')||hitCount?.data?.immuneSpells))return 0;
  if(hitCount&&attack)return commitResolvedDamage(b,source,target,Number(source.summoned&&!source.illusion?hitCount.data?.basicDamage??1:(isRangedAttackType(source)?hitCount.data?.heroRangedDamage:hitCount.data?.heroMeleeDamage)??hitCount.data?.heroDamage??2),type,skill,depth,false,visual);
  let damage=amount;
  if(!flags.bypassGenericMultipliers){
  // Only declared piercing bodies use the dated attack-class table. The whole
  // physical attack packet participates; independent spells retain their type.
  if(attack&&type==='physical'&&!flags.healthLoss&&source.piercingAttackClass){
    const heroTarget=!target.ward&&!target.courier&&!target.roshan&&(!target.summoned||!!target.illusion||!!target.heroClone||!!target.consideredHero||!!target.extraSpiritBear);
    const multiplier=source.piercingAttackClass[target.building||target.reinforced?'reinforced':heroTarget?'hero':'creep'];
    if(Number.isFinite(multiplier)&&multiplier>=0)damage*=multiplier;
  }
  if(type==='physical')damage*=1-Math.min(1,Math.max(0,statusValue(source,'physicalOutputReduction')));
  damage*=1-Math.min(1,Math.max(0,effectiveStatusEffects(source,'outgoingDamageReduction').filter(s=>s.data?.targetId===target.id).reduce((n,s)=>n+(s.value??0),0)));
  damage*=1+effectiveStatusEffects(target,'sourceDamageAmp').filter(s=>!s.data?.genericIncoming&&(s.source===source.id||s.source===source.owner)).reduce((n,s)=>n+(s.value??0),0);
  if(attack)damage*=1-Math.min(1,Math.max(0,effectiveStatusEffects(target,'attackDamageReduction').filter(status=>!status.data?.genericIncoming&&(!status.data?.heroAttackOnly||heroAttacker)).reduce((sum,status)=>sum+(status.value??0),0)));
  if((!attack||flags.convertedAttack)&&!flags.noAmplification&&!flags.reflection&&!flags.healthRemoval){const stolen=originToken?runtime(b).stolen.get(originToken)?.entry:undefined;damage*=1+Math.max(-.99,statusValue(source,'spellAmp')+(stolen?.spellAmp??0));}
  }
  if(!flags.noDamageHooks&&!flags.healthRemoval)runHooks(b,target,'onBeforeDamageResolution',source,damage,type,depth+1,skill,source.id,{beforeDamageResolution:{inputAmount:amount,damageAmount:damage,category,flags:{...flags},stage:'beforeTargetMitigation'}});
  if(target.dead)return 0;
  const absorbManaShield=(preMitigation:boolean)=>{
    const shields=effectiveStatusEffects(target,'manaShield').filter(s=>(s.data?.preMitigation===true)===preMitigation),fraction=shields.reduce((sum,s)=>sum+(s.value??0),0),perMana=statusValue(target,'damagePerMana');
    if(!(fraction>0&&perMana>0)||preMitigation&&flags.healthLoss)return;
    const absorb=Math.min(damage*Math.min(1,fraction),Math.max(0,target.mana)*perMana),spent=absorb/perMana,shield=shields[0];target.mana-=spent;damage-=absorb;
    recordAbsorption(b,b.units.find(u=>u.id===shield.source)??target,target,absorb,{abilityId:shield.skill??'medusa_mana_shield',...shield.attribution});
    if(spent>0)runHooks(b,target,'onManaShieldSpent',source,spent,type,depth+1,skill);
  };
  // Only a declared historical mana shield uses this incoming-reduction stage.
  // Rejected instances and HP removal have already returned; HPLOSS is excluded.
  absorbManaShield(true);if(target.dead)return 0;
  if(type==='physical'){
    const acceptsBlock=(attack||flags.physicalAttackBlock)&&!flags.ignoreDamageBlock;
    let blocked=acceptsBlock?statusValue(target,'block'):0;
    if(acceptsBlock){
      const groups=new Map<string,EffectStatus[]>();
      for(const s of effectiveStatusEffects(target,'attackDamageBlock')){
        if(s.data?.excludeWardAttacks&&source.ward)continue;
        const group=typeof s.data?.blockGroup==='string'?s.data.blockGroup:undefined;
        if(group){const members=groups.get(group)??[];members.push(s);groups.set(group,members);}
        else if(nextRandom(b)<Number(s.data?.chance??1))blocked=Math.max(blocked,s.value??0);
      }
      // Only explicitly grouped native providers opt into descending short-circuit
      // trials. Unmarked providers retain their existing compatibility behavior.
      for(const providers of groups.values())for(const s of providers.sort((a,c)=>(c.value??0)-(a.value??0)||Number(Number(c.data?.chance??1)>=1)-Number(Number(a.data?.chance??1)>=1))){
        const probability=Math.max(0,Math.min(1,Number(s.data?.chance??1))),provider:RuntimeSkill={id:s.skill??'damageBlock',points:s.points??1,prdOrigin:String(s.data?.providerInstance??s.attribution?.skillInstanceId??s.skill??'damageBlock')};
        const success=probability>=1||probability>0&&(typeof s.data?.prdKey==='string'?chanceRoll(b,target,provider,probability,s.data.prdKey):nextRandom(b)<probability);
        if(success){blocked=Math.max(blocked,s.value??0);break;}
      }
    }
    damage=Math.max(0,damage-blocked)*physicalDamageMultiplier((ignoreBaseArmor||hasStatus(source,'baseArmorIgnore')?0:target.armor*(1+statusValue(target,'baseArmorPct')))+statusValue(target,'armor'));
  }
  if(type==='physical'&&!flags.bypassGenericMultipliers)damage*=1+statusValue(target,'physicalVulnerability');
  if(type==='magical') {
    // Pre-7.33 magic barriers consume their raw incoming capacity before MR.
    // Only explicitly authored historical shields use this stage.
    for(const shield of [...effects(target)].filter(status=>status.kind==='magicShield'&&status.data?.damageStage==='beforeMagicResistance')){
      const percentage=Math.max(0,Math.min(1,Number(shield.data?.absorbPercentage??1))),absorbed=Math.min(damage*percentage,Math.max(0,shield.remaining??shield.value??0));shield.remaining=Math.max(0,(shield.remaining??shield.value??0)-absorbed);damage-=absorbed;
      recordAbsorption(b,b.units.find(unit=>unit.id===shield.source)??target,target,absorbed,{abilityId:shield.skill??'shield',...shield.attribution});
      if(shield.remaining<=0)target.statuses=target.statuses.filter(status=>status!==shield);
      if(damage<=0)return 0;
    }
    const baseResist=target.magicResist*Math.max(0,1+statusValue(target,'baseMagicResistPct'));
    const resist=1-(1-baseResist)*(1-Math.min(.95,independentFraction(effectiveStatusEffects(target,'magicResist').map(s=>s.value??0),-2)));
    damage*=1-resist;if(!flags.bypassGenericMultipliers)damage*=1+statusValue(target,'magicVulnerability');
  }
  const afterArmorDamage=damage;
  // Pure target modifiers can be evaluated after an explicitly earlier barrier
  // without re-running any proc, event, armor/block roll or mana expenditure.
  const afterArmorModifiers=(input:number):number=>{
    if(flags.bypassGenericMultipliers)return input;
    const duel=effects(target).find(s=>s.kind==='duel'),externalDuel=duel&&duel.data?.targetId!==source.id?Number(duel.data?.externalReduction??0):0;
    const attackReduction=attack?effectiveStatusEffects(target,'attackDamageReduction').filter(status=>status.data?.genericIncoming&&(!status.data?.heroAttackOnly||heroAttacker)).reduce((sum,status)=>sum+(status.value??0),0):0;
    const sourceIncoming=effectiveStatusEffects(target,'sourceDamageAmp').filter(s=>s.data?.genericIncoming&&(s.source===source.id||s.source===source.owner)).reduce((sum,s)=>sum+(s.value??0),0);
    const providers=effectiveStatusEffects(target,'damageReduction'),grouped=attackReduction+providers.filter(status=>status.data?.genericIncoming).reduce((sum,status)=>sum+(status.value??0),0)-sourceIncoming,ungrouped=independentFraction(providers.filter(status=>!status.data?.genericIncoming).map(status=>status.value??0));
    let value=input*(1-Math.min(1,1-(1-Math.min(1,grouped))*(1-ungrouped)+(duel?.data?.duelRules?externalDuel:0)));
    value*=1+statusValue(target,'damageVulnerability');value=Math.max(0,value-statusValue(target,'allDamageBlock'));
    if(duel&&!duel.data?.duelRules)value*=1-externalDuel;
    return value*Number(target.damageTakenMultiplier??1);
  };
  damage=afterArmorModifiers(damage);const afterGenericDamage=damage;
  const promised=hasStatus(target,'falsePromise');
  if(!promised){
    for(const transfer of effects(target).filter(s=>s.kind==='borrowedRedirect')){const owner=b.units.find(u=>u.id===transfer.source&&!u.dead&&hasStatus(u,'borrowedTime'));if(owner){const redirected=damage*Math.min(1,transfer.value??0);damage-=redirected;heal(b,owner,owner,redirected,transfer.skill);break;}}
    if(hasStatus(target,'borrowedTime')){heal(b,target,target,damage,'abaddon_borrowed_time');return 0;}
  }
  const carapace=effects(target).find(s=>s.kind==='spikedCarapace');
  if(carapace&&!flags.noReflection&&!flags.reflection&&!flags.healthRemoval&&source.id!==target.id&&source.side!==target.side){const key=`carapace:${carapace.until}`,seen=(target[key]??{}) as Record<string,boolean>;target[key]=seen;if(!seen[source.id]){seen[source.id]=true;recordAbsorption(b,target,target,damage,{abilityId:carapace.skill??'nyx_assassin_spiked_carapace',...carapace.attribution});applyDamage(b,target,source,damage*(carapace.value??1),type,carapace.skill,false,depth+1,false,undefined,{category:'spell',flags:{reflection:true,noSpellLifesteal:true,noAmplification:true,noReflection:true}});addStatus(b,target,source,carapace.skill??'nyx_assassin_spiked_carapace','stun',Number(carapace.data?.stunDuration??0),0,{harmful:true,dispel:'strong'});return 0;}}
  // Historical False Promise negates before ordinary barriers. Borrowed Time
  // still produces its heal, which is recorded alongside the original damage.
  const refraction=effects(target).find(s=>s.kind==='refraction'&&(s.remaining??0)>0),refractionThreshold=Number(refraction?.data?.damageThreshold??5);
  const refractionAccepts=!!refraction&&(refraction.data?.thresholdInclusive?damage>=refractionThreshold:damage>refractionThreshold);
  const consumeRefraction=()=>{if(!refraction)return;refraction.remaining!--;if(refraction.remaining!<=0)target.statuses=target.statuses.filter(s=>s!==refraction);};
  if(promised){
    if(refractionAccepts&&refraction?.data?.consumesThroughFalsePromise)consumeRefraction();
    deferredLedger(target).damage.push({source:source.id,amount:damage,skill,type,attribution:attributionFor(b,source,skill,visual),flags:{...flags}});
    if(hasStatus(target,'borrowedTime'))heal(b,target,target,damage,'abaddon_borrowed_time');
    return 0;
  }
  if(refractionAccepts&&refraction){recordAbsorption(b,b.units.find(u=>u.id===refraction.source)??target,target,damage,{abilityId:refraction.skill??'templar_assassin_refraction',...refraction.attribution});consumeRefraction();return 0;}
  absorbManaShield(false);
  if(attack&&type==='physical'&&!flags.healthLoss){
    // Existing redirects / legacy late mana shields keep their old late basis
    // until their combination order is separately sourced. Named negations
    // above retain their current priority and do not consume this barrier.
    const lateBasis=damage!==afterGenericDamage;let basis=lateBasis?damage:afterArmorDamage,changed=false;
    for(const shield of [...effects(target)].filter(s=>s.kind==='physicalShield'&&s.data?.physicalAttackOnly&&s.data.damageStage==='afterArmorBeforeGeneric')){
      const absorbed=Math.min(Math.max(0,basis),Math.max(0,shield.remaining??shield.value??0));if(absorbed<=0)continue;
      shield.remaining=(shield.remaining??shield.value??0)-absorbed;basis-=absorbed;changed=true;
      recordAbsorption(b,b.units.find(u=>u.id===shield.source)??target,target,absorbed,{abilityId:shield.skill??'shield',...shield.attribution});
      if(shield.remaining<=0){target.statuses=target.statuses.filter(s=>s!==shield);burstShield(b,target,shield,depth+1);}
    }
    if(changed)damage=lateBasis?basis:afterArmorModifiers(basis);
  }
  for(const shield of [...effects(target)]) {
    if(shield.data?.damageStage==='beforeMagicResistance'||shield.data?.physicalAttackOnly&&shield.data.damageStage==='afterArmorBeforeGeneric')continue;
    if(shield.kind!=='shield'&&(shield.kind!=='magicShield'||type!=='magical')&&(shield.kind!=='physicalShield'||type!=='physical'))continue;
    const absorbed=Math.min(damage,shield.remaining??shield.value??0);shield.remaining=(shield.remaining??shield.value??0)-absorbed;damage-=absorbed;
    recordAbsorption(b,b.units.find(u=>u.id===shield.source)??target,target,absorbed,{abilityId:shield.skill??'shield',...shield.attribution});
    if(shield.remaining<=0){target.statuses=target.statuses.filter(s=>s!==shield);burstShield(b,target,shield,depth+1);}
    if(damage<=0)return 0;
  }
  return commitResolvedDamage(b,source,target,damage,type,skill,depth,false,visual);
}
/** Damage delay stores a post-mitigation result and never applies armor twice.
 * Entry/exit and combinations with temporary protection still require AA validation. */
function commitResolvedDamage(b:BattleState,source:CombatUnit,target:CombatUnit,damage:number,type:DamageType,skill?:string,depth=0,delayed=false,visual:VisualOrigin={}):number {
  if(target.dead)return 0;
  const attribution=attributionFor(b,source,skill,visual),flags={...visual.flags,...(delayed?{delayed:true}:{})},category=visual.category??(skill?'spell':'attack');
  const spellRestoration=category==='spell'||flags.convertedAttack;
  const availableLifesteal=visual.lifestealProviders??(spellRestoration&&!flags.noSpellLifesteal&&!flags.reflection&&!flags.healthRemoval?structuredClone(effectiveStatusEffects(source,'spellLifesteal')):undefined);
  const lifestealProviders=availableLifesteal?.flatMap(provider=>{
    if(!provider.data?.requiresHealthVictim)return[provider];
    const eligible=provider.data.healthVictimSnapshot??(!target.building&&!hasStatus(target,'hitCountBody')&&source.side!==target.side);
    return eligible?[{...provider,data:{...provider.data,healthVictimSnapshot:true}}]:[];
  });
  const lifestealVictimScale=visual.lifestealVictimScale??(spellRestoration&&target.summoned&&!target.illusion&&!target.consideredHero?BATTLE_CONFIG.spellLifestealCreepFactor:1);
  visual={...visual,lifestealProviders,lifestealVictimScale};
  const rum=delayed||flags.healthRemoval?undefined:effects(target).find(s=>s.kind==='ghostshipRum');if(rum){const deferred=damage*Math.min(1,Math.max(0,rum.value??0));if(deferred>0){rum.data??={};rum.data.debtKey??=`${rum.source}:${rum.skill}:${b.time}`;const key=String(rum.data.debtKey),debts=(target.rumDebts??{}) as Record<string,RumLedger>;debts[key]??={total:0,entries:[]};debts[key].total+=deferred;debts[key].entries.push({source:source.id,amount:deferred,skill,type,attribution,flags,lifestealProviders});target.rumDebts=debts;damage-=deferred;}}
  if(hasStatus(target,'falsePromise')){deferredLedger(target).damage.push({source:source.id,amount:damage,skill,type,attribution,flags,lifestealProviders});return 0;}
  const delay=delayed||flags.healthRemoval?0:statusValue(target,'damageDelay');
  if(delay>0){
    runtime(b).tasks.push({due:b.time+delay,sequence:runtime(b).nextSequence++,effect:()=>commitResolvedDamage(b,source,target,damage,type,skill,depth,true,visual)});
    emit(b,{type:'status',source:source.id,target:target.id,skill,x:target.x,y:target.y,status:'damageDeferred',amount:damage,duration:delay});return 0;
  }
  if(hasStatus(target,'undying')||flags.nonLethal)damage=Math.min(damage,Math.max(0,target.hp-1));
  const affected=[...effects(target)],actual=Math.max(0,Math.min(target.hp,damage));target.hp-=actual;recordDamage(b,source,target,actual,type,attribution,flags);
  if(!flags.healthRemoval&&!flags.healthLoss){const history=(target.damageHistory??[]) as {time:number;amount:number}[];target.damageHistory=[...history.filter(x=>x.time>=b.time-6),{time:b.time,amount:actual}];}
  emit(b,{type:'hit',source:source.id,target:target.id,skill,x:target.x,y:target.y,amount:actual,damageType:type,...visual,attribution,category,flags,...(delayed?{delayed:true}:{})});
  if(actual>0&&!flags.noDamageHooks&&!flags.healthRemoval)for(const status of affected)notifyAffectedDamage(b,target,status,source,actual,type,skill,category,flags,depth);
  if(target.hp<=0)kill(b,target,source,skill);
  else if(actual>0&&!flags.noDamageHooks&&!flags.healthRemoval){
    tryAutomaticBorrowedTime(b,target);
    if(depth===0)runHooks(b,target,'onDamage',source,actual,type,depth+1,skill,source.id,{damageFlags:{...flags},damageCategory:category});
  }
  if(depth===0&&actual>0&&!flags.noDamageHooks&&!flags.healthRemoval)runHooks(b,source,'onDealDamage',target,actual,type,depth+1,skill);
  const lifestealDamage=category==='attack'&&!flags.convertedAttack?damage:actual;
  if(lifestealDamage>0&&lifestealProviders&&source.side!==target.side)healFromLifesteal(b,source,lifestealDamage*lifestealVictimScale,lifestealProviders,lifestealProviders.map(provider=>(provider.kind==='openWounds'?actual:lifestealDamage)*lifestealVictimScale));
  return actual;
}
/** Automatic Borrowed Time is a damage event, not an AI cast or periodic HP
 * scan. It is allowed through control/silence, preserves the current channel,
 * and does not emit cast hooks. A lethal hit from above threshold still kills. */
function tryAutomaticBorrowedTime(b:BattleState,u:CombatUnit):void {
  const id='abaddon_borrowed_time',slot=u.skills.findIndex(skill=>skill?.id===id);
  if(slot<0||u.dead||hasStatus(u,'break')||hasStatus(u,'borrowedTime')||(u.cooldowns[slot]??0)>b.time)return;
  const skill=u.skills[slot]!,definition=runtime(b).definitions.get(id),program=getSkillProgram(id);
  if(!definition||!program?.cast)return;
  const c=context(b,u,u,skill,definition),balance=skillBalance(definition,skill.points);
  if(u.hp>=skillValue(c,'HEALTH THRESHOLD'))return;
  const cost=balance?.mana??(program.manaCost?program.manaCost(c):arrayValue(definition.mana,skill.points));
  if(u.mana<cost)return;u.mana-=cost;
  const cooldown=balance?.cooldown??(program.cooldown?program.cooldown(c):arrayValue(definition.cooldowns,skill.points));
  u.cooldowns[slot]=b.time+Math.max(.2,cooldown*(1-Math.min(.9,Math.max(0,statusValue(u,'cooldownReduction')))));
  program.cast(c);
  emit(b,{type:'status',source:u.id,target:u.id,skill:id,x:u.x,y:u.y,status:'borrowedTimeAutomatic'});
}
/** All providers share the same effective-healing cap before attribution. */
function healFromLifesteal(b:BattleState,unit:CombatUnit,damage:number,providers:EffectStatus[],providerDamage?:number[]):void {
  const requests=providers.map((provider,index)=>(providerDamage?.[index]??damage)*Math.max(0,provider.value??0)),total=requests.reduce((n,value)=>n+value,0);if(total<=0||unit.dead)return;
  const scale=restorationFactor(unit,'lifesteal');if(scale<=0)return;
  const shares=hasStatus(unit,'falsePromise')?requests:distributeEffective(Math.min(Math.max(0,unit.maxHp-unit.hp),total*scale),requests).map(value=>value/scale);
  providers.forEach((provider,index)=>{if(shares[index]>0)heal(b,unit,unit,shares[index],provider.skill??'lifesteal',true,1,{lifesteal:true,attribution:resolveAttribution(b,unit,{...provider.attribution,abilityId:provider.skill??'lifesteal',sourceUnitId:unit.id,ownerUnitId:creditUnit(b,unit).id})});});
  if(!hasStatus(unit,'falsePromise')){const tether=tetherPartner(b,unit);if(tether)heal(b,unit,tether.unit,total*scale*tether.multiplier,'wisp_tether',true,2);}
}
function burstShield(b: BattleState, owner: CombatUnit, status: EffectStatus, depth=0) {
  if(!status.data?.burstRadius)return;
  const source=b.units.find(u=>u.id===status.source)??owner;
  for(const t of live(b).filter(u=>u.side!==owner.side&&!(hasStatus(u,'invisible')&&!hasStatus(u,'revealed'))&&distance(u,owner)<=Number(status.data!.burstRadius)))applyDamage(b,source,t,Number(status.data!.burstDamage),'magical',status.skill,false,depth,false,status.stolenDamageOrigin,{points:status.points,visualSkill:status.visualSkill,visualPoints:status.visualPoints,attribution:status.attribution});
}
function scheduleRevive(b: BattleState, unit: CombatUnit, delay: number, hpFraction: number) {
  unit.reviveAt=b.time+delay;
  runtime(b).tasks.push({due:b.time+delay,sequence:runtime(b).nextSequence++,effect:()=>{
    if(!unit.dead)return;unit.dead=false;unit.hp=Math.max(1,unit.maxHp*hpFraction);unit.mana=unit.maxMana;
    unit.statuses=unit.statuses.filter(s=>!((s as EffectStatus).harmful));unit.reviveAt=undefined;unit.nextAttack=b.time+.4;setAction(b,unit,'spawn',true);
    refreshAttributes(unit);
    emit(b,{type:'status',source:unit.id,target:unit.id,x:unit.x,y:unit.y,status:'revived'});
  }});
}
function boundedPoint(x:number,y:number):MotionPoint{return {x:clamp(finite(x),BATTLE_BOUNDS.x-BODY_RADIUS),y:clamp(finite(y),BATTLE_BOUNDS.y-BODY_RADIUS)};}
function faceOrder(b:BattleState,u:CombatUnit,target:MotionPoint):boolean{
  const lock=effects(u).find(status=>status.kind==='facingLock');if(lock){u.facing=finite(lock.value??u.facing,u.facing);return turnTowards(u,target,0,0);}
  const rate=Number(u.turnRate??BATTLE_CONFIG.turnRate)*Math.max(0,1+statusValue(u,'turnRatePct'));
  const faced=turnTowards(u,target,FIXED_STEP,rate);if(!faced)setAction(b,u,'idle');return faced;
}
function scheduleContinuousMove(b:BattleState,target:CombatUnit,owner:string,skill:string,x:number,y:number,options:ContinuousMoveOptions={}):boolean{
  if(target.dead||![x,y].every(Number.isFinite))return false;
  if(effects(target).some(status=>status.until>b.time&&String(status.data?.blockedMotionSkills??'').split(',').includes(skill)))return false;
  if(effects(target).some(status=>status.kind==='duel'&&status.data?.duelRules))return false;
  if(options.cancelOnRoot&&['root','soulbind','leash'].some(kind=>hasStatus(target,kind)))return false;
  const state=runtime(b).units.get(target.id);if(!state)return false;
  const priority=finite(options.priority??0),current=state.motion;
  if(current&&current.startedAt+current.duration>b.time-1e-9&&current.owner!==owner&&priority<=current.priority)return false;
  if(current)finishMotion(b,target,current,'interrupted');
  // Ending an old controller can resolve landing damage or install another
  // controller. Recheck that callback's result before claiming this body.
  if(target.dead||state.motion)return false;
  const duration=Math.max(FIXED_STEP,finite(options.duration??FIXED_STEP,FIXED_STEP));
  const motion:MotionController={owner,skill,from:{x:target.x,y:target.y},to:boundedPoint(x,y),startedAt:b.time-FIXED_STEP,duration,priority,lockActions:options.lockActions??true,ignoreBarriers:options.ignoreBarriers??false,ignoreTerrainBarriers:options.ignoreTerrainBarriers??false,respectSoulbind:options.respectSoulbind,cancelOnRoot:options.cancelOnRoot,continueAfterDeath:options.continueAfterDeath,onMove:options.onMove,onEnd:options.onEnd};
  state.motion=motion;if(motion.lockActions)interrupt(b,target);
  if(target.dead){finishMotion(b,target,motion,'interrupted');return false;}
  if(state.motion!==motion)return false;
  if(advanceMotion(b,target,motion)>=1-1e-9)finishMotion(b,target,motion,'complete');
  return true;
}
function warpUnit(b:BattleState,target:CombatUnit,skill:string,x:number,y:number,visual:VisualOrigin):void{
  if(target.dead||![x,y].every(Number.isFinite))return;
  const state=runtime(b).units.get(target.id);if(state?.motion)finishMotion(b,target,state.motion,'interrupted');
  if(target.dead||state?.motion)return;
  const oldX=target.x,oldY=target.y;recordMovement(target,b.time,boundedPoint(x,y),'warp',skill);
  if(target.action==='spawn'&&target.actionStart===b.time){
    target.previousTransform={x:target.x,y:target.y,facing:target.facing,warpSequence:Number(target.warpSequence??0)};
    const birth=b.events.find(e=>e.type==='summon'&&e.target===target.id&&e.time===b.time);if(birth){birth.x=target.x;birth.y=target.y;}
  }
  emit(b,{type:'move',source:target.id,skill,x:oldX,y:oldY,toX:target.x,toY:target.y,teleport:true,movementKind:'warp',...visual});
}
function advanceMotion(b:BattleState,u:CombatUnit,motion:MotionController):number{
  const progress=Math.max(0,Math.min(1,(b.time-motion.startedAt)/motion.duration)),desired={x:motion.from.x+(motion.to.x-motion.from.x)*progress,y:motion.from.y+(motion.to.y-motion.from.y)*progress};
  const bound=motion.respectSoulbind?constrainSoulbindMotion(b,u,desired):desired,point=motion.ignoreBarriers?boundedPoint(bound.x,bound.y):constrainBarrierMotion(b,u,bound,motion.ignoreTerrainBarriers),oldX=u.x,oldY=u.y;
  if(recordMovement(u,b.time,point,'forced',motion.skill)>0){
    emit(b,{type:'move',source:u.id,skill:motion.skill,x:oldX,y:oldY,toX:u.x,toY:u.y,teleport:false,movementKind:'forced'});
    motion.onMove?.({x:oldX,y:oldY},{x:u.x,y:u.y});
  }
  return progress;
}
function finishMotion(b:BattleState,u:CombatUnit,motion:MotionController,reason:'complete'|'interrupted'):void{
  const state=runtime(b).units.get(u.id);if(state?.motion!==motion)return;state.motion=undefined;motion.onEnd?.(reason);
}
function updateMotions(b:BattleState):void{
  for(const u of b.units){const state=runtime(b).units.get(u.id),motion=state?.motion;if(!state||!motion)continue;
    if(u.dead&&!motion.continueAfterDeath||(motion.cancelOnRoot&&['root','soulbind','leash'].some(kind=>hasStatus(u,kind)))){finishMotion(b,u,motion,'interrupted');continue;}
    const progress=advanceMotion(b,u,motion);
    if(progress>=1-1e-9)finishMotion(b,u,motion,'complete');
  }
}
function constrainSoulbindMotion(b:BattleState,u:CombatUnit,point:MotionPoint):MotionPoint{
  let desired=point;
  for(const bind of effects(u).filter(s=>s.kind==='soulbind'))for(const partner of b.units.filter(t=>String(bind.data?.group??bind.data?.partnerId??'').split(',').includes(t.id)&&t.id!==u.id&&!t.dead)){
    const max=Number(bind.data?.radius??6),before=distance(u,partner),after=Math.hypot(desired.x-partner.x,desired.y-partner.y);
    if(after>max&&after>before+1e-9){
      if(before>=max-1e-9){desired={x:u.x,y:u.y};continue;}
      let low=0,high=1;for(let i=0;i<24;i++){const mid=(low+high)/2;if(Math.hypot(u.x+(desired.x-u.x)*mid-partner.x,u.y+(desired.y-u.y)*mid-partner.y)<=max)low=mid;else high=mid;}
      desired={x:u.x+(desired.x-u.x)*low,y:u.y+(desired.y-u.y)*low};
    }
  }
  return desired;
}
function ordinaryMove(b:BattleState,u:CombatUnit,point:MotionPoint,kind:'walk'|'collision'='walk'):void{
  let desired=constrainSoulbindMotion(b,u,limitOrdinaryMove(u,boundedPoint(point.x,point.y)));
  desired=constrainBarrierMotion(b,u,desired);desired=constrainUnitMotion(u,desired,b.units,BODY_RADIUS);
  recordMovement(u,b.time,desired,kind);
}
function context(b: BattleState, caster: CombatUnit, target: CombatUnit, skill: SkillStack, definition: SkillDefinition, depth=0, extra: Partial<EffectContext>={},initializing=false,hook=false): EffectContext {
  caster=unwrap(caster);target=unwrap(target);
  const r=runtime(b),createdAt=b.time,referencePierces=definition.categories.some(s=>/PIERCES SPELL IMMUNITY:\s*Yes/i.test(s)),origin=stolenOrigin(b,skill),token=origin?.entry.token;
  const stat=skill as RuntimeSkill,attribution=resolveAttribution(b,caster,{abilityId:skill.id,parentAbilityId:stat.statParentId??extra.originSkillId,rootAbilityId:stat.statRootId??stat.statParentId??extra.originSkillId,skillInstanceId:skill.instanceId??stat.stolenOrigin??stat.prdOrigin});
  const reflection=hook&&['custom_spectre_dispersion','tidehunter_kraken_shell','nyx_assassin_spiked_carapace'].includes(skill.id)&&extra.amount!==undefined;
  const visual:VisualOrigin={points:skill.points,visualSkill:extra.visualSkill??extra.originSkillId??stat.visualParentId??skill.id,visualPoints:extra.visualPoints??extra.originPoints??stat.visualParentPoints??skill.points,attribution,category:'spell',...(reflection?{flags:{reflection:true,noSpellLifesteal:true,noAmplification:true,noReflection:true}}:skill.id==='custom_luna_moon_glaive'?{flags:{noAmplification:true,noSpellLifesteal:true}}:{})};
  const view=origin?stolenView(caster,origin,initializing||hook):caster;
  const guard=<T extends unknown[]>(callback:(...args:T)=>void)=>(...args:T)=>{if(!initializing||!origin||origin.active)callback(...args);};
  const castGrantedFrom=(actor:CombatUnit,id:string,points:number,t:CombatUnit,valueOverrides?:Record<string,number>):boolean=>{
    actor=unwrap(actor);t=unwrap(t);const p=getSkillProgram(id),d=r.definitions.get(id);if(!p?.cast||!d||r.nestedCasts>=8)return false;
    const overrides=Object.entries(valueOverrides??{}),levels=d.balanceLevels as Record<string,SkillBalance>|undefined,params=Object.fromEntries(overrides.map(([key,value])=>[key.trim().toUpperCase().replace(/:+$/,''),value]));
    const definition=overrides.length?{...d,values:[...d.values.filter(row=>!overrides.some(([key])=>row.split(':')[0].trim().toUpperCase()===key.toUpperCase())),...overrides.map(([key,value])=>`${key}: ${value}`)],...(levels?{balanceLevels:Object.fromEntries(Object.entries(levels).map(([level,row])=>[level,{...row,params:{...row.params,...params}}]))}:{})}:d;
    if(overrides.length&&levels)definition.balanceInputSignature=JSON.stringify([definition.values,definition.cooldowns,definition.mana]);
    const sameActor=actor===caster,child:RuntimeSkill={id,points,statParentId:skill.id,statRootId:stat.statRootId??skill.id,visualParentId:visual.visualSkill,visualParentPoints:visual.visualPoints,prdOrigin:`${chanceIdentity(caster,skill)}:granted:${sameActor?'':actor.id+':'}${id}`,...(sameActor&&token?{stolenOrigin:token}:{})};
    const actualVisual={...visual,attribution:resolveAttribution(b,actor,{abilityId:id,parentAbilityId:skill.id,rootAbilityId:child.statRootId})};
    r.nestedCasts++;try{emit(b,{type:'cast',source:actor.id,target:t.id,skill:id,x:actor.x,y:actor.y,toX:t.x,toY:t.y,granted:true,originSkillId:skill.id,...actualVisual,points});p.cast(context(b,actor,t,child,definition,depth+1,{originSkillId:skill.id,originPoints:skill.points,...actualVisual},initializing&&sameActor));return true;}finally{r.nestedCasts--;}
  };
  return { battle:b,caster:view,target:target===caster?view:target,skill,definition,attackInstanceKey:chanceIdentity(caster,skill),currentAttackTargetId:r.units.get(caster.id)?.lastTarget,attackInProgress:!isDisabled(caster)&&!hasStatus(caster,'actionLock')&&!hasStatus(caster,'disarm')&&(r.units.get(caster.id)?.pending?.type==='attack'||(caster.action==='attack'&&caster.nextAttack>b.time)),...extra,attackIsInstant:extra.attackRecord?extra.attackRecord.data.isInstant===true:extra.attackIsInstant,...visual,
    random:()=>nextRandom(b),chance:(probability,key)=>chanceRoll(b,caster,skill,probability,key),enemies:()=>live(b).filter(u=>u.side!==caster.side&&canTarget(u,false)),allies:()=>live(b).filter(u=>u.side===caster.side),
    damage:(t,n,type='magical',pierces=referencePierces,options)=>applyDamage(b,caster,unwrap(t),n,type,skill.id,pierces,depth,false,token,{...visual,...options,flags:{...visual.flags,...options?.flags}}),
    damageFrom:(source,t,n,type='magical',pierces=referencePierces,options)=>{const actor=unwrap(source);return applyDamage(b,actor,unwrap(t),n,type,skill.id,pierces,depth,false,token,{...visual,...options,flags:{...visual.flags,...options?.flags},attribution:resolveAttribution(b,actor,{...attribution,sourceUnitId:actor.id,ownerUnitId:creditUnit(b,actor).id,sourceName:actor.name,...(actor.summoned?{summonAbilityId:String(actor.statSummonRootId??actor.sourceSkill??skill.id)}:{})})});},
    execute:t=>{if(t.dead)return;const amount=t.hp,flags={healthRemoval:true,noDamageHooks:true};recordDamage(b,caster,t,amount,'pure',attribution,flags);emit(b,{type:'hit',source:caster.id,target:t.id,skill:skill.id,x:t.x,y:t.y,amount,damageType:'pure',executed:true,...visual,category:'hpRemoval',flags});kill(b,t,caster,skill.id);},
    executeFrom:(source,target)=>{const actor=unwrap(source),unit=unwrap(target);if(unit.dead)return;const amount=unit.hp,flags={healthRemoval:true,noDamageHooks:true},credit=resolveAttribution(b,actor,{...attribution,sourceUnitId:actor.id,ownerUnitId:creditUnit(b,actor).id,sourceName:actor.name});recordDamage(b,actor,unit,amount,'pure',credit,flags);emit(b,{type:'hit',source:actor.id,target:unit.id,skill:skill.id,x:unit.x,y:unit.y,amount,damageType:'pure',executed:true,...visual,attribution:credit,category:'hpRemoval',flags});kill(b,unit,actor,skill.id);},
    trySpellBlock:t=>consumeSpellBlock(b,caster,unwrap(t),skill.id),
    cancelMotion:t=>{const target=unwrap(t),state=r.units.get(target.id);if(!state?.motion)return false;finishMotion(b,target,state.motion,'interrupted');return true;},
    interrupt:t=>{const target=unwrap(t);if(target.dead)return;interrupt(b,target);const state=r.units.get(target.id);if(state){state.recoveringCast=false;state.recoveringAttackCast=false;}target.castUntil=b.time;setAction(b,target,'idle');},
    channelUnit:(target,duration,onEnd)=>channelUnit(b,unwrap(target),duration,onEnd),
    onChannelEnd:onEnd=>shareUnitChannel(b,caster,onEnd),
    permanentAttribute:(target,attribute,amount)=>{const unit=unwrap(target),state=unit.attributes as AttributeState|undefined;if(!state||!Number.isFinite(amount))return 0;state.permanent[attribute]+=amount;const key=`permanent${attribute[0].toUpperCase()}${attribute.slice(1)}Gain`;unit[key]=Number(unit[key]??0)+amount;refreshAttributes(unit);return amount;},
    inheritTemporaryAttributeMultiplier:(target,attribute,fraction)=>{const unit=unwrap(target),state=unit.attributes as AttributeState|undefined;if(!unit.illusion||!state||!Number.isFinite(fraction)||fraction<=-1)return false;const baseline=state.base[attribute]/(1+fraction),delta=state.base[attribute]-baseline;state.base[attribute]=baseline;if(attribute==='strength')state.hp+=delta*ATTRIBUTE_CONVERSION.strengthHp;if(attribute==='intelligence')state.mana+=delta*ATTRIBUTE_CONVERSION.intelligenceMana;if(attribute==='agility'){state.armor+=delta*ATTRIBUTE_CONVERSION.agilityArmor;state.attackSpeed+=delta*ATTRIBUTE_CONVERSION.agilityAttackSpeed;}if(state.primary===attribute)state.attack+=delta*ATTRIBUTE_CONVERSION.primaryAttack;return true;},
    despawn:target=>kill(b,unwrap(target)),
    startCooldown:(seconds,options)=>finishEffectCooldown(b,caster,skill,seconds,options),
    resetCooldown:()=>{const state=r.units.get(caster.id),key=chanceIdentity(caster,skill),lock=state?.cooldownLocks?.[key];if(lock)lock.active=false;const slot=caster.skills.indexOf(skill);if(slot>=0)caster.cooldowns[slot]=b.time;},
    heal:(t,n,kind='heal',options)=>heal(b,caster,unwrap(t),n,skill.id,false,depth,{...visual,healingKind:kind,lifesteal:kind==='lifesteal',lifestealAmplificationSource:options?.lifestealAmplificationSource?.id}),
    lifestealHeal:(t,n,amplificationSource=caster)=>heal(b,caster,unwrap(t),n,skill.id,false,depth,{...visual,healingKind:'lifesteal',lifesteal:true,lifestealAmplificationSource:unwrap(amplificationSource).id}),
    mana:(t,n)=>changeMana(b,unwrap(t),n),
    setHealth:(target,nextHp)=>{const unit=unwrap(target);if(unit.dead||!Number.isFinite(nextHp))return 0;const previous=unit.hp;unit.hp=Math.max(1,Math.min(unit.maxHp,nextHp));return unit.hp-previous;},
    armor:(target,options)=>effectiveArmor(unwrap(target),options),
    status:(t,kind,seconds,value=0,options={})=>addStatus(b,caster,unwrap(t),skill.id,kind,seconds,value,{passive:!!getSkillProgram(skill.id)?.passive,piercesImmunity:referencePierces,...visual,...options,...((initializing||(hook&&seconds>=BATTLE_TIME_LIMIT))&&token?{stolenOrigin:token}:{})},token),
    dispel:(t,strong=false,harmful=true)=>removeStatuses(b,unwrap(t),strong,harmful),
    projectile:(t,speed,effect,position,onMove,options)=>r.projectiles.push({id:`projectile:${r.nextProjectile++}`,createdAt:b.time,source:caster.id,target:t.id,skill:skill.id,...visual,x:position?.x??caster.x,y:position?.y??caster.y,speed,disjointable:getSkillProgram(skill.id)?.projectileDisjointable,disjointOnInvisibility:getSkillProgram(skill.id)?.projectileDisjointOnInvisibility,attackProjectile:getSkillProgram(skill.id)?.attackProjectile,effect:guard(effect),onMove:onMove&&guard(onMove),onDisjoint:options?.onDisjoint&&guard(options.onDisjoint),onTargetLost:options?.onTargetLost&&guard(options.onTargetLost),visualProjectile:options?.visualProjectile,ignoreInitialInvisibility:options?.allowInitiallyInvisible&&hasStatus(unwrap(t),'invisible')&&!hasStatus(unwrap(t),'revealed')}),
    linearProjectile:o=>r.projectiles.push({id:`projectile:${r.nextProjectile++}`,createdAt:b.time,source:caster.id,target:'',skill:skill.id,...visual,x:o.origin?.x??caster.x,y:o.origin?.y??caster.y,speed:o.speed,attackProjectile:getSkillProgram(skill.id)?.attackProjectile,effect:guard(o.effect),line:{angle:o.angle,remaining:o.distance,distance:o.distance,width:o.width,endWidth:o.endWidth,stopOnHit:o.stopOnHit??false,targets:o.targets??'enemies',targetFilter:o.targetFilter,hit:[],shouldContinue:o.shouldContinue,onMove:o.onMove&&guard(o.onMove),onEnd:o.onEnd&&guard(o.onEnd)}}),
    disjoint:t=>{const removed=[...new Set([...r.projectiles,...(r.updatingProjectiles??[])])].filter(p=>!p.cancelled&&p.target===t.id&&p.disjointable!==false);for(const p of removed){p.cancelled=true;r.updatingProjectiles?.delete(p);}r.projectiles=r.projectiles.filter(p=>!p.cancelled);for(const p of removed)p.onDisjoint?.({x:p.x,y:p.y});b.projectiles=r.projectiles.map(p=>({id:p.id,createdAt:p.createdAt,source:p.source,target:p.target,skill:p.skill,points:p.points,visualSkill:p.visualSkill,visualPoints:p.visualPoints,visualProjectile:p.visualProjectile,x:p.x,y:p.y,angle:p.line?.angle}));emit(b,{type:'status',source:t.id,skill:skill.id,x:t.x,y:t.y,status:'projectileDisjoint',...visual});},
    endChannel:()=>{const state=r.units.get(caster.id);if(!state)return;const onEnd=state.channelEnd;state.channelEnd=undefined;if(state.pending?.type==='cast')state.pending=undefined;state.token++;state.channelUntil=0;state.recoveringCast=false;caster.castUntil=b.time;removeZones(b,z=>z.source===caster.id&&!!z.options.channel);setAction(b,caster,'idle');emit(b,{type:'status',source:caster.id,skill:skill.id,x:caster.x,y:caster.y,status:'channelEnded',...visual});onEnd?.('interrupted');},
    movementSpeed,attackInterval,attackRange:effectiveAttackRange,isRangedAttack:isRangedAttackType,canTarget,effectiveCastRange:base=>base*(1+statusValue(caster,'castRangePct'))+statusValue(caster,'castRange'),
    reduceCooldowns:(target,seconds,options)=>reduceCooldowns(b,unwrap(target),seconds,options),
    delay:(seconds,effect,cancelOnInterrupt=false)=>r.tasks.push({due:b.time+seconds,sequence:r.nextSequence++,effect:guard(effect),source:caster.id,token:r.units.get(caster.id)?.token,cancelOnInterrupt,stolenOrigin:initializing?token:undefined}),
    zone:options=>{
      const interval=Math.max(FIXED_STEP,options.interval),zone:Zone={id:`zone:${r.nextZone++}`,createdAt:b.time,source:caster.id,skill:skill.id,...visual,x:options.x??caster.x,y:options.y??caster.y,until:b.time+options.duration,next:b.time+interval,interval,tick:0,token:r.units.get(caster.id)?.token??0,options:{...options,effect:guard(options.effect)},stolenOrigin:initializing?token:undefined};
      if(options.immediate&&options.duration>0){
        const apply=()=>{if(zone.ended||((options.follow||options.channel)&&caster.dead)||(getSkillProgram(skill.id)?.passive&&hasStatus(caster,'break')))return;for(const unit of live(b).filter(t=>Math.hypot(t.x-zone.x,t.y-zone.y)<=options.radius&&((options.targets??'enemies')==='all'||(options.targets==='allies'?t.side===caster.side:t.side!==caster.side))))zone.options.effect(unit,0);};
        if(r.initializing)r.initialEffects.push(apply);else apply();
        zone.tick=1;
      }
      r.zones.push(zone);
    },
    barrier:options=>{addBarrier(b,caster,skill.id,options.from,options.to,options.width,options.duration,options.visual,options.blocks);emit(b,{type:'status',source:caster.id,skill:skill.id,x:options.from.x,y:options.from.y,toX:options.to.x,toY:options.to.y,status:'barrier',duration:options.duration,width:options.width,...visual});},
    summon:options=>{const bodies=summon(b,caster,skill,{...options,template:options.template&&unwrap(options.template)});if(initializing&&token)for(const unit of bodies)unit.stolenInitOrigin=token;return bodies;},
    warp:(t,x,y)=>warpUnit(b,unwrap(t),skill.id,x,y,visual),
    moveContinuous:(t,x,y,options)=>scheduleContinuousMove(b,unwrap(t),`${caster.id}:${skill.id}:${token??''}`,skill.id,x,y,options),
    motionActive:t=>{const motion=r.units.get(unwrap(t).id)?.motion;return motion&&{skill:motion.skill,owner:motion.owner,startedAt:motion.startedAt};},
    // Compatibility for external skill programs; repository programs use the
    // explicit warp / moveContinuous APIs so their intent is reviewable.
    teleport:(t,x,y)=>warpUnit(b,unwrap(t),skill.id,x,y,visual),
    attack:(t,multiplier=1,triggerModifiers=true,baseDamage,released=false,options)=>performAttack(b,caster,t,multiplier,triggerModifiers,depth+1,baseDamage,released,{...visual,category:'attack'},options),
    launchAttack:(t,multiplier=1,triggerModifiers=true,options={})=>launchAttack(b,caster,unwrap(t),multiplier,triggerModifiers,b.time>createdAt+1e-9?1:depth+1,{...visual,category:'attack'},options),
    revive:(t,delay,hp)=>scheduleRevive(b,t,delay,hp),
    grantAbility:(id,points)=>grantAbility(b,caster,skill,id,points),
    grantAbilityTo:(target,id,points)=>{const recipient=unwrap(target);if(recipient.dead)return;grantAbility(b,recipient,skill,id,points,{released:true,instanceId:`granted:${chanceIdentity(caster,skill)}:${recipient.id}:${id}`});},
    stealAbility:(id,points,options)=>stealAbility(b,caster,id,points,options),
    castAbility:(id,points,t,valueOverrides)=>castGrantedFrom(caster,id,points,t,valueOverrides),
    castAbilityFrom:(actor,id,points,t,valueOverrides)=>castGrantedFrom(actor,id,points,t,valueOverrides),
  };
}
function summon(b: BattleState, source: CombatUnit, skill: SkillStack, options: SummonOptions): CombatUnit[] {
  const r=runtime(b),result:CombatUnit[]=[],template=options.template??source;
  const templateAttributes=template.attributes as AttributeState|undefined,hasExcludedAttributes=!!options.illusion&&!!templateAttributes&&effects(template).some(s=>ATTRIBUTE_STATUSES.has(s.kind)&&s.data?.copyToIllusion===false);
  const copiedAttributes={strength:Number(template.strength??0),agility:Number(template.agility??0),intelligence:Number(template.intelligence??0)},attributeDelta={strength:0,agility:0,intelligence:0};
  if(hasExcludedAttributes)for(const kind of ['strength','agility','intelligence'] as const){const value=attributeTotal(template,kind,s=>s.data?.copyToIllusion!==false);attributeDelta[kind]=value-copiedAttributes[kind];copiedAttributes[kind]=value;}
  const attackScale=options.attributeAttackScale??(template.attack!==0?options.attack/template.attack:0),primary=templateAttributes?.primary??'strength';
  const copiedHpPercent=effectiveStatusEffects(template,'maxHpPct').filter(s=>s.data?.copyToIllusion!==false).reduce((sum,s)=>sum+(s.value??0),0);
  const excludedHp=hasExcludedAttributes?Math.max(1,(template.maxHp-templateAttributes!.hp+(copiedAttributes.strength-templateAttributes!.base.strength)*ATTRIBUTE_CONVERSION.strengthHp)*(1+copiedHpPercent))-template.maxHp:0;
  const maximumHp=options.hp+(template.maxHp>0?excludedHp*options.hp/template.maxHp:0),maximumMana=Math.max(0,(options.maxMana??0)+(options.maxMana===undefined?0:attributeDelta.intelligence*ATTRIBUTE_CONVERSION.intelligenceMana));
  // Per-cast guard prevents malformed source data from allocating infinite units.
  const count=Math.max(0,Math.min(32,Math.floor(options.count)));
  for(let i=0;i<count;i++) {
    const angle=(i/count)*Math.PI*2,unit:CombatUnit={...structuredClone(template),side:source.side,
      id:`${source.id}:summon:${r.nextSummon++}`,name:options.name,
      x:clamp(options.position?.x??source.x+Math.cos(angle)*1.2,BATTLE_BOUNDS.x-BODY_RADIUS),y:clamp(options.position?.y??source.y+Math.sin(angle)*1.2,BATTLE_BOUNDS.y-BODY_RADIUS),
      hp:Math.max(0,Math.min(maximumHp,options.currentHp??maximumHp)),maxHp:maximumHp,mana:Math.max(0,Math.min(maximumMana,options.mana??0)),maxMana:maximumMana,attack:options.attack+attributeDelta[primary]*ATTRIBUTE_CONVERSION.primaryAttack*attackScale,armor:(options.armor??0)+attributeDelta.agility*ATTRIBUTE_CONVERSION.agilityArmor,
      attackInterval:options.interval??template.attackInterval,range:options.range??template.range,moveSpeed:options.speed??template.moveSpeed,
      ...(!options.illusion&&options.interval!==undefined?{attackPoint:Math.min(.4,options.interval*.3),attackBackswing:Math.max(0,options.interval-Math.min(.4,options.interval*.3))}:{}),
      skills:options.inheritsSkills?structuredClone(template.skills).filter(s=>!s||!options.inheritedMode||(options.inheritedMode==='passives'?getSkillProgram(s.id)?.passive:!!(getSkillProgram(s.id)?.passive||getSkillProgram(s.id)?.onAttack||getSkillProgram(s.id)?.attackModifier))||options.illusion&&!!getSkillProgram(s.id)?.onIllusionCreated):[],cooldowns:[],statuses:[],nextAttack:b.time+.5,castUntil:b.time,
      action:'spawn',actionStart:b.time,dead:false,summoned:true,owner:source.owner??source.id,damage:0,taken:0,healing:0,abilityStats:[],absorbed:0,
      damageTakenMultiplier:options.damageTaken??1,illusion:options.illusion??false,strongIllusion:options.strongIllusion??false,expiresAt:b.time+options.lifetime,
      nativeTemplateId:options.illusion?template.nativeTemplateId:undefined,sourceUnitType:options.illusion?template.sourceUnitType:undefined,nativeBaseAttackSpeed:options.illusion?template.nativeBaseAttackSpeed:undefined,attackCapability:options.illusion?template.attackCapability:undefined,attackTargetCategory:options.illusion?template.attackTargetCategory:undefined,
      sourceSkill:skill.id,statSummonRootId:(skill as RuntimeSkill).statRootId??skill.id,visualBody:options.visualBody,inheritedMode:options.inheritedMode,
      deferredHealth:undefined,pendingFalsePromises:[],damageHistory:[],permanentAttackGain:0,reviveAt:undefined,stolenAbilities:[],prdState:{},warpSequence:0,previousTransform:undefined,
    };
    if(options.illusion)for(const inherited of template.skills){if(!inherited||!getSkillProgram(inherited.id)?.onIllusionCreated||unit.skills.some(skill=>skill?.id===inherited.id&&skill.instanceId===inherited.instanceId))continue;unit.skills.push(structuredClone(inherited));}
    if(options.inheritedPointsCap!==undefined)for(const inherited of unit.skills)if(inherited&&r.definitions.get(inherited.id)?.balanceDomain!=='native')inherited.points=Math.max(1,Math.min(inherited.points,Math.floor(options.inheritedPointsCap)));
    // Illusion totals are already snapshots. Fresh attributes must not reapply
    // the summoner's accumulated derived deltas or share a mutable ledger.
    initializeAttributes(unit,options.illusion?copiedAttributes:{strength:0,agility:0,intelligence:0},(template.primaryAttribute??'strength') as Attribute);
    if(hasExcludedAttributes)(unit.attributes as AttributeState).attackSpeed=(templateAttributes?.attackSpeed??0)+attributeDelta.agility*ATTRIBUTE_CONVERSION.agilityAttackSpeed;
    // A released illusion is a snapshot, not the owner's temporary stealing
    // slot. Its copied counters and modifiers belong to its own lifetime.
    for(const inherited of unit.skills){if(!inherited)continue;const s=inherited as RuntimeSkill;delete s.stolenOrigin;delete s.grantOwners;}
    if(options.nativeTemplateId)applyNativeUnitProfile(unit,options.nativeTemplateId);
    beginMovementFrame(unit,Number(b.tickCount??0),movementSpeed(unit),FIXED_STEP);
    b.units.push(unit);battleByUnit.set(unit,b);r.units.set(unit.id,{token:0,channelUntil:0});result.push(unit);
    emit(b,{type:'summon',source:source.id,target:unit.id,skill:skill.id,x:unit.x,y:unit.y,duration:options.lifetime});
    if(options.inheritsSkills&&options.initializeInherited){
      // Direct totals and attributes already come from the illusion snapshot.
      // Initialize charge counters, auras and ordinary modifiers, then discard
      // only duplicated direct totals / self attribute initialization.
      const keys=['hp','maxHp','mana','maxMana','attack','armor','magicResist','attackInterval','range','moveSpeed','strength','agility','intelligence','primaryAttribute'] as const;
      const totals=Object.fromEntries(keys.map(key=>[key,unit[key]])),attributes=structuredClone(unit.attributes);
      for(const inherited of [...unit.skills]){if(!inherited)continue;const definition=r.definitions.get(inherited.id),program=getSkillProgram(inherited.id);if(definition&&program?.init)program.init(context(b,unit,unit,inherited,definition));}
      unit.statuses=effects(unit).filter(s=>!(s.source===unit.id&&((ATTRIBUTE_STATUSES.has(s.kind)&&s.kind!=='break')||(options.attackSnapshotIncludesBonuses&&['attackBonus','attackPct'].includes(s.kind)))));
      Object.assign(unit,totals);unit.attributes=attributes;unit.inheritedInitialized=true;
    }
    if(options.illusion)for(const inherited of [...unit.skills]){if(!inherited)continue;const program=getSkillProgram(inherited.id),definition=r.definitions.get(inherited.id);if(program?.onIllusionCreated&&definition)program.onIllusionCreated(context(b,unit,template,inherited,definition));}
  }
  return result;
}
function attackPower(u: CombatUnit) { return Math.max(0,(u.attack*Math.max(0,1+statusValue(u,'attackPct'))*(1-Math.min(1,Math.max(0,statusValue(u,'baseAttackDamageReduction'))))+statusValue(u,'attackBonus'))*Math.max(0,1+statusValue(u,'attackDamagePct'))); }
function attackProjectileSpeed(u:CombatUnit):number{return Math.max(.01,effects(u).find(status=>status.kind==='projectileSpeedOverride')?.value??Number(u.projectileSpeed??BATTLE_CONFIG.basicAttackProjectileSpeed))+statusValue(u,'projectileSpeedBonus');}
function effectiveAttackSpeed(u:CombatUnit,target?:CombatUnit):number {
  const focus=effects(u).find(s=>s.kind==='focusFire'&&s.data?.targetId===target?.id)?.value??0;
  const curse=target?(!u.summoned||u.illusion?statusValue(target,'avernusCurse'):0)+statusValue(target,'targetAttackSpeed'):0;
  const total=((u.nativeBaseAttackSpeed??100)+Number((u.attributes as AttributeState|undefined)?.attackSpeed??0)+statusValue(u,'attackSpeed')+focus+curse)*Math.max(0,1+statusValue(u,'attackSpeedPct'));
  const limits=BATTLE_CONFIG as typeof BATTLE_CONFIG&{minimumAttackSpeed?:number;maximumAttackSpeed?:number;minimumAttackInterval?:number};
  const floor=limits.minimumAttackSpeed??20,ceiling=effects(u).find(s=>s.kind==='maximumAttackSpeed')?.value??limits.maximumAttackSpeed??700;
  return Math.max(1,effects(u).find(s=>s.kind==='absoluteAttackSpeed')?.value??Math.max(floor,Math.min(ceiling,total)));
}
function attackInterval(u: CombatUnit, target?:CombatUnit): number {
  const base=effects(u).find(s=>s.kind==='baseAttackTime')?.value??u.attackInterval;
  return Math.max(statusValue(u,'minimumAttackInterval'),Math.max(BATTLE_CONFIG.minimumAttackInterval??.12,base/(effectiveAttackSpeed(u,target)/100))*Math.max(.01,1+statusValue(u,'attackTimePct')));
}
function attackWindup(u:CombatUnit,_interval:number,target?:CombatUnit):number {return Math.max(0,Number(effects(u).find(s=>s.kind==='attackPointOverride')?.value??u.attackPoint??Math.min(.4,u.attackInterval*.3)))*100/effectiveAttackSpeed(u,target)*Math.max(.01,1+statusValue(u,'attackTimePct'));}
function attackBackswing(u:CombatUnit,_interval:number,target?:CombatUnit):number {return Math.max(0,Number(u.attackBackswing??Math.max(0,u.attackInterval-Number(u.attackPoint??Math.min(.4,u.attackInterval*.3)))))*100/effectiveAttackSpeed(u,target)*Math.max(.01,1+statusValue(u,'attackTimePct'));}
export function effectiveAttackRange(u:CombatUnit){return (effects(u).find(s=>s.kind==='attackRangeOverride')?.value??u.range)+statusValue(u,'range');}
const attackRange=effectiveAttackRange;
export function isRangedAttackType(u:CombatUnit):boolean{const override=effects(u).find(s=>s.kind==='attackTypeOverride')?.value;return override===2||(override!==1&&(u.attackCapability?u.attackCapability==='ranged':u.range>2));}
const attackCriticalProfiles=new WeakMap<AttackRecord,CriticalRoll[]>();
function newAttackRecord(b:BattleState,source:CombatUnit,target:CombatUnit,abilityId:string,options:InstantAttackOptions,fraction=1,baseDamage?:number,triggerModifiers=true,depth=0):AttackRecord {
  const focus=effects(source).find(status=>status.kind==='focusFire'&&status.data?.targetId===target.id);
  const record:AttackRecord=options.attackRecord??{id:`attack:${runtime(b).nextSequence++}`,source:source.id,target:target.id,abilityId,ranged:options.rangedAttackPoint??isRangedAttackType(source),data:{isInstant:options.isInstant??true,focusMultiplier:Number(focus?.data?.damageMultiplier??1),...(options.attackBatchKey?{attackBatchKey:options.attackBatchKey}:{})}};
  record.data.isInstant??=options.isInstant??true;
  if(record.mainDamageSnapshot)return record;record.data.focusMultiplier??=Number(focus?.data?.damageMultiplier??1);
  let fixed=baseDamage,baseExtra=0,flatBonus=0;
  if(triggerModifiers&&options.modifierPolicy!=='none')for(const skill of source.skills){const p=skill&&getSkillProgram(skill.id),d=skill&&runtime(b).definitions.get(skill.id);if(!skill||!p?.attackMainDamage||!d||(p.passive&&!p.handlesBreak&&hasStatus(source,'break')))continue;const value=p.attackMainDamage(context(b,source,target,skill,d,depth,{attackSourceSkill:abilityId,attackRecord:record,attackIsRanged:record.ranged,attackBatchKey:options.attackBatchKey,baseAttackDamage:baseDamage}));if(baseDamage===undefined&&value.fixedDamage!==undefined)fixed=value.fixedDamage;baseExtra+=(value.baseMultiplier??1)-1;flatBonus+=value.flatBonus??0;}
  const mainOnly=(1-Math.min(1,Math.max(0,statusValue(source,'baseAttackDamageReduction'))))*Math.max(0,1+statusValue(source,'attackDamagePct')),minimum=Number(source.attackMin),maximum=Number(source.attackMax),variance=fixed===undefined&&Number.isFinite(minimum)&&Number.isFinite(maximum)&&maximum>minimum?minimum+nextRandom(b)*(maximum-minimum)-(minimum+maximum)/2:0;
  const baseline=fixed??Math.max(0,attackPower(source)+flatBonus*Math.max(0,1+statusValue(source,'attackDamagePct'))+variance*Math.max(0,1+statusValue(source,'attackPct'))*mainOnly),unscaled=(baseline+(fixed===undefined?(source.attack+variance)*mainOnly*baseExtra:0))*Number(record.data.focusMultiplier);
  record.data.fixedAttackBonus=options.bonusDamage??0;
  record.mainDamageSnapshot={stage:'attackBegin',at:b.time,baseline,unscaled,fraction,beforeCritical:unscaled*fraction+(options.bonusDamage??0)};
  attackCriticalProfiles.set(record,collectCriticalChoices(b,source,target,record,options,depth,triggerModifiers));
  return record;
}
function prepareAttackOptions(b:BattleState,source:CombatUnit,target:CombatUnit,depth:number,abilityId:string,options:InstantAttackOptions):InstantAttackOptions{
  if(options.preparedAttack)return options;
  options={...options,attackRecord:newAttackRecord(b,source,target,abilityId,options)};
  for(const skill of source.skills){
    if(!skill)continue;const program=getSkillProgram(skill.id),definition=runtime(b).definitions.get(skill.id);
    if(!program?.prepareAttack||!definition||(program.passive&&hasStatus(source,'break')))continue;
    const prepared=program.prepareAttack(context(b,source,target,skill,definition,depth,{attackSourceSkill:abilityId,attackRecord:options.attackRecord,attackIsRanged:options.attackRecord?.ranged}));if(!prepared)continue;
    options={...options,trueStrike:options.trueStrike||prepared.trueStrike,noCleave:options.noCleave||prepared.noCleave,ignoreDamageBlock:options.ignoreDamageBlock||prepared.ignoreDamageBlock,accuracy:1-(1-(options.accuracy??0))*(1-(prepared.accuracy??0)),criticalMultiplier:Math.max(options.criticalMultiplier??1,prepared.criticalMultiplier??1),bonusDamage:(options.bonusDamage??0)+(prepared.bonusDamage??0)};
  }
  const record=options.attackRecord;if(record?.mainDamageSnapshot&&record.mainDamageSnapshot.damage===undefined){record.mainDamageSnapshot.beforeCritical+=(options.bonusDamage??0)-Number(record.data.fixedAttackBonus??0);record.data.fixedAttackBonus=options.bonusDamage??0;}
  return{...options,preparedAttack:true};
}
function collectCriticalChoices(b:BattleState,source:CombatUnit,target:CombatUnit,record:AttackRecord,options:InstantAttackOptions,depth:number,triggerModifiers=true):CriticalRoll[]{
  if(options.modifierPolicy==='none')return[];
  const choices:CriticalRoll[]=[];
  const variable=effectiveStatusEffects(source,'variableCrit').filter(status=>!(status.data?.excludeBuildingsAndWards&&(target.ward||target.building))).sort((a,c)=>(c.value??0)-(a.value??0))[0];
  if(variable){const probability=variable.value??0,key=typeof variable.data?.prdKey==='string'?variable.data.prdKey:undefined,provider={id:variable.skill??'variableCrit',points:variable.points??3,prdOrigin:`provider:${variable.data?.uniqueGroup??variable.skill}`}as RuntimeSkill;
    const creep=target.summoned&&!target.illusion&&!target.consideredHero?Number(variable.data?.creepMultiplier??1):1,max=Number(variable.data?.max??1)*creep,min=Number(variable.data?.min??variable.data?.max??1)*creep,candidate:CriticalRoll={key:variable.skill??'variableCrit',multiplier:max,lifesteal:Number(variable.data?.lifesteal??0),roll:()=>{
    const passed=key?chanceRoll(b,source,provider,probability,key):nextRandom(b)<probability;
    if(passed)candidate.multiplier=min+nextRandom(b)*(max-min);return passed;
  }};choices.push(candidate);}
  for(const chance of effectiveStatusEffects(source,'critChance')){const paired=effectiveStatusEffects(source,'critMultiplier').find(s=>s.skill===chance.skill&&s.source===chance.source),probability=chance.value??0;choices.push({key:chance.skill??'critical',multiplier:Math.max(1,paired?.value??1),roll:()=>nextRandom(b)<probability});}
  if(triggerModifiers)for(const skill of source.skills){
    if(!skill)continue;const program=getSkillProgram(skill.id),definition=runtime(b).definitions.get(skill.id);if(!program||!definition||(program.passive&&!program.handlesBreak&&hasStatus(source,'break')))continue;
    const c=context(b,source,target,skill,definition,depth,{attackRecord:record,attackSourceSkill:record.abilityId,attackIsRanged:record.ranged,attackBatchKey:options.attackBatchKey});
    const profile=program.criticalAttack?.(c);
    if(profile){const max=profile.maxMultiplier??profile.multiplier,min=profile.minMultiplier??max,candidate:CriticalRoll={key:skill.id,multiplier:max,lifesteal:profile.lifesteal??0,roll:()=>{const passed=profile.prdKey?chanceRoll(b,source,skill,profile.chance,profile.prdKey):nextRandom(b)<profile.chance;if(passed)candidate.multiplier=min===max?min:min+nextRandom(b)*(max-min);return passed;}};choices.push(candidate);}
    else if(skill.id==='custom_phantom_assassin_coup_de_grace'&&program.attackModifier){const multiplier=program.attackModifier({...c,caster:{...c.caster},random:()=>0,chance:()=>true}).multiplier??1;choices.push({key:skill.id,multiplier,roll:()=>(program.attackModifier!(c).multiplier??1)>1});}
    if(skill.id==='custom_dawnbreaker_luminosity'&&!program.criticalAttack&&program.attackModifier){const modifier=program.attackModifier({...c,caster:structuredClone(c.caster),random:()=>0,chance:()=>true});if((modifier.multiplier??1)>1)choices.push({key:skill.id,multiplier:modifier.multiplier!,roll:()=>true});}
  }
  return choices;
}
function snapshotCritical(b:BattleState,source:CombatUnit,target:CombatUnit,record:AttackRecord,options:InstantAttackOptions,depth:number,triggerModifiers=true):void{
  // Numeric source profiles are frozen at begin. Trials still occur at point
  // alongside effectful preparation; E-CRITICAL-ROLL-START remains an open gate
  // for cancelled attacks and RNG/PRD ordering, rather than claiming native parity.
  if(!record.critical){const choices=options.modifierPolicy==='none'?[]:[...(attackCriticalProfiles.get(record)??collectCriticalChoices(b,source,target,record,options,depth,triggerModifiers))];
    if(options.modifierPolicy!=='none'){if(statusValue(target,'targetCritMultiplier')>1)choices.push({key:'targetCritical',multiplier:statusValue(target,'targetCritMultiplier'),roll:()=>true});if((options.criticalMultiplier??1)>1)choices.push({key:'abilityCritical',multiplier:options.criticalMultiplier!,roll:()=>true});}
    record.critical=selectCritical(choices);
  }
  if(record.mainDamageSnapshot&&record.mainDamageSnapshot.damage===undefined)record.mainDamageSnapshot.damage=record.mainDamageSnapshot.beforeCritical*record.critical.multiplier;
}
function snapshotMarksmanship(b:BattleState,source:CombatUnit,target:CombatUnit,record:AttackRecord,enabled:boolean):void {
  if(record.data.marksmanship!==undefined)return;
  const provider=enabled&&!source.illusion&&!hasStatus(source,'break')&&target.side!==source.side&&!target.building?effects(source).find(s=>s.kind==='marksmanship'):undefined;
  const sourceKey=provider?.attribution?.skillInstanceId??provider?.skill??'drow_ranger_marksmanship';
  const skill:RuntimeSkill={id:provider?.skill??'drow_ranger_marksmanship',points:provider?.points??3,prdOrigin:`marksmanship:${sourceKey}`};
  const proc=!!provider&&chanceRoll(b,source,skill,provider.value??0,String(provider.data?.prdKey??'marksmanship'));
  record.data.marksmanship={proc,bonus:proc?Number(provider?.data?.bonus??0):0,skill:skill.id,sourceKey};
}
function dispatchAttackPoint(b:BattleState,source:CombatUnit,target:CombatUnit,depth=0,abilityId=BASIC_ATTACK_ID,suppressAllies=false,options:InstantAttackOptions={},triggerModifiers=true):AttackRecord{
  triggerModifiers=options.modifierPolicy==='none'?false:options.modifierPolicy==='all'?true:triggerModifiers;
  const record=newAttackRecord(b,source,target,abilityId,options);
  snapshotMarksmanship(b,source,target,record,triggerModifiers);
  if(triggerModifiers)emit(b,{type:'status',source:source.id,target:target.id,skill:abilityId,x:source.x,y:source.y,status:'attackPoint'});
  const metadata={attackRecord:record,attackSourceSkill:abilityId,attackIsRanged:record.ranged,attackBatchKey:options.attackBatchKey};
  if(triggerModifiers)runHooks(b,source,'onAttackPoint',target,0,undefined,depth+1,abilityId,source.id,metadata);
  if(triggerModifiers&&!suppressAllies)for(const ally of live(b).filter(unit=>unit.side===source.side&&unit.id!==source.id))runHooks(b,ally,'onAllyAttackPoint',target,0,undefined,depth+1,abilityId,source.id,metadata);
  snapshotCritical(b,source,target,record,options,depth,triggerModifiers);return record;
}
function launchAttack(b:BattleState,source:CombatUnit,target:CombatUnit,multiplier:number,triggerModifiers:boolean,depth:number,visual:VisualOrigin,options:InstantAttackOptions):boolean{
  if(source.dead||target.dead||depth>8||target.building&&hasStatus(source,'attackMagical'))return false;
  triggerModifiers=options.modifierPolicy==='none'?false:options.modifierPolicy==='all'?true:triggerModifiers;
  const abilityId=visual.attribution?.abilityId??BASIC_ATTACK_ID,initial={...options,attackRecord:newAttackRecord(b,source,target,abilityId,options,multiplier,undefined,triggerModifiers,depth)},prepared=triggerModifiers?prepareAttackOptions(b,source,target,depth,abilityId,initial):initial;
  const record=dispatchAttackPoint(b,source,target,depth,abilityId,!!options.suppressAllyAttackPoint,prepared,triggerModifiers),released={...prepared,attackPointEmitted:true,attackRecord:record};
  if(record.ranged){const speed=Number.isFinite(prepared.projectileSpeed)?Math.max(.01,prepared.projectileSpeed!):attackProjectileSpeed(source);record.data.projectileSpeed=speed;runtime(b).projectiles.push({id:`projectile:${runtime(b).nextProjectile++}`,createdAt:b.time,source:source.id,target:target.id,skill:abilityId,...visual,x:prepared.projectileOrigin?.x??source.x,y:prepared.projectileOrigin?.y??source.y,speed,attackProjectile:true,effect:t=>performAttack(b,source,t,multiplier,triggerModifiers,depth,undefined,true,visual,released)});}
  else performAttack(b,source,target,multiplier,triggerModifiers,depth,undefined,true,visual,released);
  return true;
}
function performAttack(b: BattleState, source: CombatUnit, target: CombatUnit, multiplier=1, triggerModifiers=true, depth=0,baseDamage?:number,released=false,visual:VisualOrigin={},options:InstantAttackOptions={}): AttackResolution {
  if((source.dead&&!released)||target.dead||!canTarget(target,!options.allowInvisibleTarget)||depth>8)return {landed:false,damage:0};
  const abilityId=visual.attribution?.abilityId??BASIC_ATTACK_ID;
  const noModifiers=options.modifierPolicy==='none';triggerModifiers=noModifiers?false:options.modifierPolicy==='all'?true:triggerModifiers;
  if((abilityId===BASIC_ATTACK_ID||target.building&&hasStatus(source,'attackMagical'))&&!attackTargetAllowed(source,target))return {landed:false,damage:0};
  options={...options,attackRecord:newAttackRecord(b,source,target,abilityId,options,multiplier,baseDamage,triggerModifiers,depth)};
  if(triggerModifiers)options=prepareAttackOptions(b,source,target,depth,abilityId,options);
  const attackRecord=options.attackPointEmitted&&options.attackRecord?options.attackRecord:dispatchAttackPoint(b,source,target,depth,abilityId,!!options.suppressAllyAttackPoint,options,triggerModifiers);
  if(!attackRecord.ranged&&options.meleeRangeBuffer!==undefined&&distance(source,target)>attackRange(source)+options.meleeRangeBuffer){emit(b,{type:'hit',source:source.id,target:target.id,x:target.x,y:target.y,amount:0,outcome:'miss'});return {landed:false,damage:0};}
  const marksmanship=attackRecord.data.marksmanship as {proc:boolean;bonus:number;skill:string}|undefined,marksmanshipProc=!!marksmanship?.proc;
  const attackOrigin=options.attackOrigin??source;
  const fieldEvasion=effects(target).filter(s=>s.kind==='magneticField'&&Math.hypot(attackOrigin.x-Number(s.data?.x??target.x),attackOrigin.y-Number(s.data?.y??target.y))>Number(s.data?.radius??0)).reduce((n,s)=>Math.max(n,s.value??0),0);
  const piercing=noModifiers?undefined:effects(source).find(s=>s.kind==='piercingAttack'),pierced=!!piercing&&nextRandom(b)<(piercing.value??0);
  const evasion=independentFraction([...effects(target).filter(s=>s.kind==='evasion').map(s=>s.value??0),fieldEvasion]);
  const miss=options.trueStrike||marksmanshipProc||pierced||hasStatus(source,'trueStrike')||hasStatus(target,'targetTrueStrike')?0:(1-(1-Math.min(1,statusValue(source,'blind')))*(1-evasion))*(1-Math.max(0,Math.min(1,options.accuracy??0)));
  if(miss>0&&nextRandom(b)<miss){emit(b,{type:'hit',source:source.id,target:target.id,x:target.x,y:target.y,amount:0,outcome:'miss'});return {landed:false,damage:0};}
  if(triggerModifiers)runHooks(b,target,'onBeforeAttackDamageReceived',source,0,undefined,depth+1,abilityId,source.id,{attackSourceSkill:abilityId,attackIsRanged:attackRecord.ranged,attackRecord,attackBatchKey:options.attackBatchKey});
  if(triggerModifiers)for(const skill of source.skills){
    if(!skill)continue;const program=getSkillProgram(skill.id),definition=runtime(b).definitions.get(skill.id);
    if(program?.beforeAttackDamage&&definition&&!(program.passive&&!program.handlesBreak&&hasStatus(source,'break')))program.beforeAttackDamage(context(b,source,target,skill,definition,depth,{attackSourceSkill:abilityId,attackIsRanged:attackRecord.ranged,attackRecord,attackBatchKey:options.attackBatchKey}));
  }
  let allyBonus=0;
  if(triggerModifiers)for(const ally of b.units.filter(unit=>unit.side===source.side&&unit.id!==source.id&&(!unit.dead||unit.skills.some(skill=>skill&&getSkillProgram(skill.id)?.onAllyBeforeAttackDamageAfterDeath))))runHooks(b,ally,'onAllyBeforeAttackDamage',target,0,undefined,depth+1,abilityId,source.id,{attackSourceSkill:abilityId,attackIsRanged:attackRecord.ranged,attackRecord,attackBatchKey:options.attackBatchKey,addAttackBonus:amount=>{if(Number.isFinite(amount))allyBonus+=amount;}});
  attackRecord.data.allyAttackBonus=allyBonus;
  const baseline=attackRecord.mainDamageSnapshot!.baseline;
  let damage=attackRecord.mainDamageSnapshot!.unscaled+allyBonus,postCriticalBonus=marksmanshipProc?marksmanship!.bonus:0,postCriticalSpellAmplifiedBonus=0,primaryAttackDamage=attackRecord.mainDamageSnapshot!.unscaled,type:DamageType=hasStatus(source,'attackMagical')?'magical':'physical';
  const typedComponents:{amount:number;type:DamageType;convertWithAttack?:boolean;countsForCleave?:boolean}[]=[];
  const criticals:CriticalRoll[]=[];
  if(triggerModifiers)for(const skill of source.skills){
    if(!skill)continue;const p=getSkillProgram(skill.id),d=runtime(b).definitions.get(skill.id);
    if(p?.attackModifier&&d&&!(p.passive&&!p.handlesBreak&&hasStatus(source,'break'))){
      const c=context(b,source,target,skill,d,depth,{attackSourceSkill:abilityId,attackRecord,attackIsRanged:attackRecord.ranged,attackBatchKey:options.attackBatchKey});
      if(skill.id==='custom_phantom_assassin_coup_de_grace'){/* Its legacy candidate was already sampled at release. */}else{const mod=p.attackModifier(c);damage+=mod.bonus??0;postCriticalBonus+=mod.postCriticalBonus??0;postCriticalSpellAmplifiedBonus+=mod.postCriticalSpellAmplifiedBonus??0;typedComponents.push(...(mod.typedPostCriticalComponents??[]));type=mod.type??type;
        if(skill.id==='custom_dawnbreaker_luminosity')criticals.push({key:skill.id,multiplier:mod.multiplier??1,roll:()=>true});else {damage*=mod.multiplier??1;primaryAttackDamage*=mod.multiplier??1;}
      }
    }
  }
  if(attackRecord.critical)criticals.push({...attackRecord.critical,key:attackRecord.critical.key??'snapshotCritical',roll:()=>true});
  const critical=selectCritical(criticals),suppressMain=hasStatus(source,'bladeFury')&&!options.ignoreBladeFuryPenalty&&!target.ward&&!target.building;
  attackRecord.data.primaryAttackDamage=suppressMain?0:primaryAttackDamage*multiplier*critical.multiplier;
  // Fury Swipes' conditional component is an attack bonus after crit, but
  // independently accepts spell amplification. Converted attacks amp the whole
  // packet later, so this component must not receive it a second time here.
  const conditionalSpellAmp=hasStatus(source,'attackMagical')?1:1+Math.max(-.99,statusValue(source,'spellAmp'));
  const conditionalScale=options.scaleConditionalBonuses?multiplier:1;
  damage=(suppressMain?0:(damage*multiplier+(options.bonusDamage??0))*critical.multiplier)+(postCriticalBonus+(options.postCriticalBonus??0)+postCriticalSpellAmplifiedBonus*conditionalSpellAmp)*conditionalScale;
  attackRecord.critical=critical;const critLifesteal=critical.lifesteal;
  if(marksmanshipProc)emit(b,{type:'status',source:source.id,target:target.id,skill:marksmanship?.skill,x:target.x,y:target.y,status:'marksmanshipProc'});
  // Native attack conversion retains attack contacts and accounting while
  // changing this damage instance's amplification and lifesteal rules.
  const convertedAttack=hasStatus(source,'attackMagical');if(convertedAttack)type='magical';
  const separateComponents=new Map<DamageType,number>();let nonCleaveComponents=0;
  for(const component of typedComponents){const amount=component.amount*conditionalScale;if(!Number.isFinite(amount)||amount<=0)continue;const componentType=convertedAttack&&component.convertWithAttack!==false?'magical':component.type;if(componentType===type)damage+=amount;else separateComponents.set(componentType,(separateComponents.get(componentType)??0)+amount);if(component.countsForCleave===false)nonCleaveComponents+=amount;}
  const lifestealProviders=structuredClone(noModifiers?[]:convertedAttack?effectiveStatusEffects(source,'spellLifesteal'):[...effectiveStatusEffects(source,'lifesteal'),...(critLifesteal>0?[{kind:'lifesteal',until:b.time+1,value:critLifesteal,skill:critical.key}]:[])]);
  const attackVisual={...visual,category:'attack' as const,attribution:attributionFor(b,source,visual.attribution?.abilityId,visual),flags:{...visual.flags,critical:critical.multiplier>1,ignoreDamageBlock:options.ignoreDamageBlock,...(convertedAttack?{convertedAttack:true}:{})},lifestealProviders};
  const attackSkill=visual.attribution?.abilityId;
  let actual=applyDamage(b,source,target,damage,type,attackSkill===BASIC_ATTACK_ID?undefined:attackSkill,false,depth,marksmanshipProc,undefined,attackVisual);
  // A same-type conditional component shares one block/armor/attack-lifesteal
  // resolution. A declared conversion exception retains a separate typed
  // packet, while the attack contact and on-attack hooks still fire only once.
  for(const[componentType,amount]of separateComponents)actual+=applyDamage(b,source,target,amount,componentType,attackSkill===BASIC_ATTACK_ID?undefined:attackSkill,false,depth,false,undefined,{...visual,category:'attack',attribution:attackVisual.attribution,flags:{...visual.flags,noAmplification:true,noSpellLifesteal:true,ignoreDamageBlock:options.ignoreDamageBlock},lifestealProviders:structuredClone(noModifiers?[]:effectiveStatusEffects(source,'lifesteal'))});
  const cleaveDamage=Math.max(0,damage+[...separateComponents.values()].reduce((sum,value)=>sum+value,0)-nonCleaveComponents);
  if(triggerModifiers&&!options.noCleave&&!attackRecord.ranged&&!target.ward&&!target.building)for(const cleave of effectiveStatusEffects(source,'cleave')){
    const dx=target.x-attackOrigin.x,dy=target.y-attackOrigin.y,length=Math.hypot(dx,dy)||1;
    for(const other of live(b).filter(u=>u.side!==source.side&&u.id!==target.id&&!u.ward&&!u.building)){
      let inside=false;
      if(cleave.data?.distance!==undefined){const reach=Number(cleave.data.distance),along=((other.x-attackOrigin.x)*dx+(other.y-attackOrigin.y)*dy)/length,across=Math.abs((other.x-attackOrigin.x)*dy-(other.y-attackOrigin.y)*dx)/length;inside=along>=0&&along<=reach&&across<=Number(cleave.data.startWidth)+(Number(cleave.data.endWidth)-Number(cleave.data.startWidth))*along/Math.max(.001,reach);}
      else inside=distance(other,target)<=Number(cleave.data?.radius??3.5);
      if(inside)applyDamage(b,source,other,cleaveDamage*(cleave.value??0),'physical',cleave.skill,true,depth+1,false,undefined,{category:'spell',flags:{noAmplification:true,noSpellLifesteal:true,physicalAttackBlock:true}});
    }
  }
  if(pierced)applyDamage(b,source,target,Number(piercing?.data?.damage??0),'magical',piercing?.skill,false,depth+1);
  if(triggerModifiers&&target.side!==source.side&&!target.ward&&!target.building&&statusValue(source,'maxHpAttackLifesteal')>0){
    const amount=target.maxHp*statusValue(source,'maxHpAttackLifesteal'),provider=effectiveStatusEffects(source,'maxHpAttackLifesteal')[0];
    healFromLifesteal(b,source,amount,[{...provider,kind:'lifesteal',value:1,until:b.time+1,skill:provider?.skill??'bloodseeker_bloodrage'}]);
    applyDamage(b,source,target,amount,'pure',provider?.skill??'bloodseeker_bloodrage',false,depth+1,false,undefined,{category:'attack',flags:{noAmplification:true,noSpellLifesteal:true}});
  }
  if(actual>0&&!noModifiers)for(const s of effects(source).filter(s=>s.kind==='ownerLifesteal')){const owner=b.units.find(u=>u.id===s.data?.ownerId);if(owner)heal(b,source,owner,actual*(s.value??0),s.skill);}
  if(actual>0&&triggerModifiers)for(const tag of effects(target).filter(s=>s.kind==='tagTeam')){const owner=b.units.find(u=>u.id===tag.source);if(owner&&owner.side===source.side){applyDamage(b,owner,target,tag.value??0,'physical',tag.skill,false,depth+1);addStatus(b,owner,target,tag.skill??'tusk_tag_team','slow',Number(tag.data?.slowDuration??.5),Number(tag.data?.slow??.75),{harmful:true});if(Number(tag.data?.stunDuration??0)>0)addStatus(b,owner,target,tag.skill??'tusk_tag_team','stun',Number(tag.data!.stunDuration),0,{harmful:true,dispel:'strong'});}}
  if(triggerModifiers){const snapshot={baseAttackDamage:baseline*multiplier,attackDamage:damage,attackSourceSkill:abilityId,attackRecord,attackCritical:critical.multiplier>1,criticalSourceKey:critical.key,attackBatchKey:options.attackBatchKey};source.coupCritical=critical.key==='custom_phantom_assassin_coup_de_grace';runHooks(b,source,'onAttack',target,actual,type,depth+1,undefined,undefined,snapshot);runHooks(b,target,'onAttacked',source,actual,type,depth+1,undefined,source.id,snapshot);for(const ally of live(b).filter(u=>u.side===source.side&&u.id!==source.id))runHooks(b,ally,'onAllyAttack',target,actual,type,depth+1,undefined,source.id,snapshot);}
  if(triggerModifiers&&!target.dead){const guardian=effects(target).find(s=>s.kind==='guardianRetaliation');if(guardian&&nextRandom(b)<(guardian.value??0)){const id='omniknight_hammer_of_purity',p=getSkillProgram(id),d=runtime(b).definitions.get(id);if(p?.cast&&d){const child:RuntimeSkill={id,points:4,instanceId:guardian.attribution?.skillInstanceId,statParentId:guardian.skill,statRootId:guardian.attribution?.rootAbilityId??guardian.skill,visualParentId:guardian.visualSkill??guardian.skill,visualParentPoints:guardian.visualPoints??guardian.points};emit(b,{type:'cast',source:target.id,target:source.id,skill:id,x:target.x,y:target.y,toX:source.x,toY:source.y,granted:true,originSkillId:guardian.skill,points:4,visualSkill:child.visualParentId,visualPoints:child.visualParentPoints});p.cast(context(b,target,source,child,d,depth+1));}}}
  if(actual>0&&triggerModifiers)for(const slow of effects(source).filter(s=>s.kind==='onHitSlow')){addStatus(b,source,target,slow.skill??'summon_slow','slow',Number(slow.data?.duration??3),slow.value??0,{harmful:true});if(slow.data?.attackSpeedPct)addStatus(b,source,target,slow.skill??'summon_slow','attackSpeedPct',Number(slow.data.duration??3),-Number(slow.data.attackSpeedPct),{harmful:true});}
  if(triggerModifiers)for(const wound of effects(target).filter(s=>s.kind==='openWounds'))if(!source.summoned)applyDamage(b,source,target,target.maxHp*Number(wound.data?.maxHpPct??0),'physical',wound.skill,false,depth+1,false,undefined,{category:'spell',attribution:{...wound.attribution,abilityId:wound.skill??'life_stealer_open_wounds',sourceUnitId:source.id,ownerUnitId:creditUnit(b,source).id,sourceName:source.name},flags:{noAmplification:true,noSpellLifesteal:true}});
  const grave=noModifiers?undefined:effects(source).find(s=>s.kind==='gravesInvis');if(grave){source.statuses=source.statuses.filter(s=>!(s.skill===grave.skill&&['invisible','undetectable','gravesInvis','freePathing','haste'].includes(s.kind)));addStatus(b,source,source,grave.skill??'visage_silent_as_the_grave','attackPct',Number(grave.data?.bonusDuration??4),grave.value??.25);}
  const realm=noModifiers?undefined:effects(source).find(s=>s.kind==='shadowRealm');if(realm&&!realm.data?.persistOnAttack)source.statuses=source.statuses.filter(s=>!(s.skill===realm.skill&&(s.kind==='shadowRealm'||s.kind==='range')));
  return {landed:true,damage:actual};
}
function tranceTarget(b:BattleState,u:CombatUnit):CombatUnit|undefined{
  const marker=effects(u).find(s=>s.kind==='berserk');if(!marker)return;
  const valid=(t:CombatUnit)=>t.side!==u.side&&canTarget(t)&&!t.ward&&!t.building&&!hasStatus(t,'attackImmune')&&!hasStatus(t,'sleep');
  let target=b.units.find(t=>t.id===marker.data?.targetId&&valid(t));
  if(!target)target=live(b).filter(t=>valid(t)&&distance(u,t)<=Number(marker.data?.searchRadius??9)).sort((a,c)=>Number(!!a.summoned&&!a.illusion)-Number(!!c.summoned&&!c.illusion)||distance(u,a)-distance(u,c)||a.id.localeCompare(c.id))[0];
  marker.data??={};marker.data.targetId=target?.id??'';marker.data.engaged=!!target;return target;
}
const TRANCE_CASTS=new Set(['custom_troll_warlord_berserkers_rage','troll_warlord_whirling_axes_melee','troll_warlord_whirling_axes_ranged','troll_warlord_rampage']);
function tranceAllowsAbility(b:BattleState,u:CombatUnit,id:string):boolean{return !tranceTarget(b,u)||TRANCE_CASTS.has(id);}
function nearestEnemy(b: BattleState,u:CombatUnit,spellTarget=false):CombatUnit|undefined {
  const duel=effects(u).find(s=>s.kind==='duel'||s.kind==='taunt');
  const berserk=!duel&&tranceTarget(b,u);if(berserk&&!spellTarget)return berserk;
  const locked=duel??effects(u).find(s=>s.kind==='attackTarget'||s.kind==='focusFire');
  if(locked?.data?.targetId){const target=b.units.find(t=>t.id===locked.data!.targetId&&canTarget(t)&&(spellTarget||attackTargetAllowed(u,t)));if(target)return target;if(locked.kind==='duel'||locked.kind==='taunt')return undefined;}
  // Official FAQ: heroes do not attack summons. Hero illusions retain their
  // hero target category; explicit taunts/forced attacks above are preserved.
  return live(b).filter(t=>t.side!==u.side&&canTarget(t)&&(spellTarget||attackTargetAllowed(u,t))&&(spellTarget||(u.summoned&&!u.illusion)||!t.summoned||t.illusion)).sort((a,c)=>(hasStatus(u,'berserk')?Number(!!a.summoned)-Number(!!c.summoned):0)||distance(u,a)-distance(u,c)||a.id.localeCompare(c.id))[0];
}
function selectTarget(b:BattleState,u:CombatUnit,p:SkillProgram,eligible?:(target:CombatUnit)=>boolean):CombatUnit|undefined {
  if(p.target==='self')return !eligible||eligible(u)?u:undefined;
  if(p.target==='any')return live(b).filter(t=>t.id!==u.id&&(eligible?eligible(t):t.side===u.side||canTarget(t))).sort((a,c)=>distance(u,a)-distance(u,c)||a.id.localeCompare(c.id))[0];
  if(p.target==='ally')return live(b).filter(t=>t.side===u.side&&(!eligible||eligible(t))).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp||distance(u,a)-distance(u,c)||a.id.localeCompare(c.id))[0];
  if(eligible)return live(b).filter(t=>t.side!==u.side&&eligible(t)).sort((a,c)=>distance(u,a)-distance(u,c)||a.id.localeCompare(c.id))[0];
  return nearestEnemy(b,u,true);
}
function updateStatuses(b:BattleState,u:CombatUnit) {
  const selectedDots=new Set(effectiveStatusEffects(u,'dot'));
  for(const s of [...effects(u)]) {
    if(u.dead)break;
    const source=b.units.find(t=>t.id===s.source)??u;
    if(s.kind==='arcaneCurse'){const silenced=hasStatus(u,'silence');if(silenced)s.until+=FIXED_STEP;const multiplier=silenced?Number(s.data?.multiplier??1.5):1,interval=Math.max(FIXED_STEP,Number(s.data?.damageInterval??1));s.nextTick??=b.time+interval;if(s.nextTick<=b.time+1e-8&&s.nextTick<=s.until+1e-8){applyDamage(b,source,u,(s.value??0)*interval*multiplier,'magical',s.skill,false,0,false,s.stolenDamageOrigin,{attribution:s.attribution,flags:{damageOverTime:true}});s.nextTick+=interval;}if(s.until>b.time+1e-8)addStatus(b,source,u,s.skill??'silencer_curse_of_the_silent','slow',s.until-b.time,Number(s.data?.slow??.25)*multiplier,{harmful:true,ignoreStatusResistance:true,piercesImmunity:s.piercesImmunity,affectsInvulnerable:s.affectsInvulnerable,dispel:s.dispel,data:{instanceKey:s.data?.instanceKey??'',arcaneCurseSlow:true,...(s.data?.slowStacking?{stacking:s.data.slowStacking}:{}),...(s.data?.slowUniqueGroup?{uniqueGroup:s.data.slowUniqueGroup}:{})}});}
    if(s.kind==='rupture'){const dx=u.x-Number(s.data?.lastX??u.x),dy=u.y-Number(s.data?.lastY??u.y),moved=Math.hypot(dx,dy);if(s.data){s.data.lastX=u.x;s.data.lastY=u.y;}if(moved>0&&moved<=Number(s.data?.damageCapDistance??2))applyDamage(b,source,u,moved*100*(s.value??0),'pure',s.skill,true,0,false,s.stolenDamageOrigin,{attribution:s.attribution,flags:{damageOverTime:true}});}
    const dotEnabled=s.data?.stacking!=='strongest'||typeof s.data?.uniqueGroup!=='string'||selectedDots.has(s),dotPierces=typeof s.data?.damagePiercesImmunity==='boolean'?s.data.damagePiercesImmunity:!!s.piercesImmunity;
    if(s.interval&&s.nextTick!==undefined&&s.nextTick<=b.time+1e-8&&s.nextTick<=s.until+1e-8){
      if(s.kind==='dot'&&dotEnabled)applyDamage(b,source,u,(s.value??0)*s.interval,s.damageType??'magical',s.skill,dotPierces,0,false,s.stolenDamageOrigin,{points:s.points,visualSkill:s.visualSkill,visualPoints:s.visualPoints,attribution:s.attribution,flags:{damageOverTime:true}});
      s.nextTick+=s.interval;
    }
    if(s.until<=b.time+1e-8){
      if(s.kind==='dot'&&dotEnabled&&!s.data?.fullTicksOnly&&s.interval&&s.nextTick!==undefined){const remainder=s.until-(s.nextTick-s.interval);if(remainder>1e-8&&remainder<s.interval-1e-8)applyDamage(b,source,u,(s.value??0)*remainder,s.damageType??'magical',s.skill,dotPierces,0,false,s.stolenDamageOrigin,{points:s.points,visualSkill:s.visualSkill,visualPoints:s.visualPoints,attribution:s.attribution,flags:{damageOverTime:true}});}
      if(!u.statuses.includes(s))continue;
      u.statuses=u.statuses.filter(x=>x!==s);if(s.kind==='shield'&&(s.remaining??0)>0)burstShield(b,u,s);if(s.kind==='falsePromise')settleDeferredHealth(b,u,s);if(s.kind==='ghostshipRum')beginRumPayback(b,u,s);notifyStatusRemoved(b,u,s,'expire');
    }
  }
  refreshAttributes(u);
  if(u.dead)return;
  updatePendingPromises(b,u);if(u.dead)return;
  repayRum(b,u);
  for(const s of effectiveStatusEffects(u,'regen'))heal(b,b.units.find(t=>t.id===s.source)??u,u,(s.value??0)*FIXED_STEP,s.skill,false,0,{attribution:s.attribution,healingKind:'regen'});
  changeMana(b,u,(BATTLE_CONFIG.baseManaRegen+statusValue(u,'manaRegen'))*FIXED_STEP);
  if(Number(u.expiresAt??Infinity)<=b.time)kill(b,u);
}
function updateTasks(b:BattleState) {
  const r=runtime(b);
  r.tasks.sort((a,c)=>a.due-c.due||a.sequence-c.sequence);
  const due=r.tasks.filter(t=>t.due<=b.time+1e-8);r.tasks=r.tasks.filter(t=>t.due>b.time+1e-8);
  for(const task of due){if(task.cancelOnInterrupt&&task.source){const u=b.units.find(u=>u.id===task.source);if(!u||u.dead||r.units.get(task.source)?.token!==task.token)continue;}task.effect();}
}
function publishProjectiles(b:BattleState):void {
  b.projectiles=runtime(b).projectiles.filter(p=>!p.cancelled).map(p=>({id:p.id,createdAt:p.createdAt,source:p.source,target:p.target,skill:p.skill,points:p.points,visualSkill:p.visualSkill,visualPoints:p.visualPoints,visualProjectile:p.visualProjectile,x:p.x,y:p.y,angle:p.line?.angle}));
}
function updateProjectiles(b:BattleState) {
  const r=runtime(b),projectiles=r.projectiles;r.projectiles=[];r.updatingProjectiles=new Set(projectiles);
  for(const p of projectiles){
    r.updatingProjectiles.delete(p);if(p.cancelled||p.line?.shouldContinue?.()===false)continue;
    if(p.line){const l=p.line,source=b.units.find(t=>t.id===p.source),travel=Math.min(l.remaining,p.speed*FIXED_STEP),dx=Math.cos(l.angle),dy=Math.sin(l.angle);if(p.attackProjectile&&source&&arenaBlocksAttack(b,source,p,{x:p.x+dx*travel,y:p.y+dy*travel})){emit(b,{type:'hit',source:p.source,skill:p.skill,x:p.x,y:p.y,amount:0,outcome:'arenaBlocked'});l.onEnd?.();continue;}const candidates=live(b).filter(t=>t.id!==p.source&&!l.hit.includes(t.id)&&(!l.targetFilter||l.targetFilter(t))&&canTarget(t,false)&&(l.targets==='all'||t.side!==source?.side)).map(t=>({t,along:(t.x-p.x)*dx+(t.y-p.y)*dy,across:Math.abs((t.x-p.x)*dy-(t.y-p.y)*dx)})).filter(t=>t.along>=-BODY_RADIUS&&t.along<=travel+BODY_RADIUS&&t.across<=l.width+((l.endWidth??l.width)-l.width)*Math.max(0,Math.min(1,(l.distance-l.remaining+t.along)/Math.max(1e-8,l.distance)))+BODY_RADIUS).sort((a,b)=>a.along-b.along||a.t.id.localeCompare(b.t.id));for(const item of candidates){l.hit.push(item.t.id);p.effect(item.t);if(l.stopOnHit){l.remaining=0;break;}}p.x+=dx*travel;p.y+=dy*travel;l.remaining-=travel;l.onMove?.({x:p.x,y:p.y});if(l.remaining>1e-8)r.projectiles.push(p);else l.onEnd?.();continue;}
    const target=b.units.find(u=>u.id===p.target);if(!target||target.dead){p.cancelled=true;p.onTargetLost?.({x:p.x,y:p.y},target?'dead':'missing');continue;}
    const invisible=hasStatus(target,'invisible')&&!hasStatus(target,'revealed');if(!invisible)p.ignoreInitialInvisibility=false;
    if(p.disjointOnInvisibility&&invisible&&!p.ignoreInitialInvisibility){p.cancelled=true;emit(b,{type:'status',source:target.id,target:p.source,skill:p.skill,x:p.x,y:p.y,status:'projectileDisjoint',projectileId:p.id});p.onDisjoint?.({x:p.x,y:p.y});continue;}
    const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),travel=p.speed*FIXED_STEP;
    const source=b.units.find(u=>u.id===p.source);if((p.skill==='basic_attack'||p.attackProjectile)&&source&&arenaBlocksAttack(b,source,p,{x:p.x+dx/(d||1)*Math.min(travel,d),y:p.y+dy/(d||1)*Math.min(travel,d)})){emit(b,{type:'hit',source:p.source,target:p.target,skill:p.skill,points:p.points,visualSkill:p.visualSkill,visualPoints:p.visualPoints,attribution:p.attribution,x:p.x,y:p.y,amount:0,outcome:'arenaBlocked'});continue;}
    if(d<=travel+BODY_RADIUS){
      p.onMove?.({x:target.x,y:target.y});
      const block=getSkillProgram(p.skill)?.spellBlockTiming==='impact'?effects(target).find(s=>s.kind==='spellBlock'):undefined;
      if(block){target.statuses=target.statuses.filter(s=>s!==block);emit(b,{type:'status',source:target.id,target:p.source,skill:p.skill,x:target.x,y:target.y,status:'spellBlocked'});}else p.effect(target);
      continue;
    }
    p.x+=dx/d*travel;p.y+=dy/d*travel;p.onMove?.({x:p.x,y:p.y});r.projectiles.push(p);
  }
  r.updatingProjectiles=undefined;
  b.projectiles=r.projectiles.map(p=>({id:p.id,createdAt:p.createdAt,source:p.source,target:p.target,skill:p.skill,points:p.points,visualSkill:p.visualSkill,visualPoints:p.visualPoints,visualProjectile:p.visualProjectile,x:p.x,y:p.y,angle:p.line?.angle}));
}
function updateZones(b:BattleState) {
  const r=runtime(b),zones=r.zones;r.zones=[];r.updatingZones=zones;
  for(const z of zones){
    if(z.ended)continue;
    const source=b.units.find(u=>u.id===z.source);if(!source){endZone(z);continue;}
    if((z.options.follow||z.options.channel)&&source.dead){endZone(z);continue;}
    if(z.options.channel&&(r.units.get(source.id)?.token!==z.token||cannotCast(source))){endZone(z);continue;}
    if(z.options.follow){z.x=source.x;z.y=source.y;}
    if(z.next<=b.time+1e-8&&(z.options.immediate&&!z.options.includeEnd?z.next<z.until-1e-8:z.next<=z.until+1e-8)){
      const candidates=live(b).filter(t=>Math.hypot(t.x-z.x,t.y-z.y)<=z.options.radius&&((z.options.targets??'enemies')==='all'||(z.options.targets==='allies'?t.side===source.side:t.side!==source.side)));
      if(!getSkillProgram(z.skill)?.passive||!hasStatus(source,'break'))for(const target of candidates)z.options.effect(target,z.tick);
      z.next+=z.interval;z.tick++;
    }
    if(z.until>b.time+1e-8&&!z.ended)r.zones.push(z);else endZone(z);
  }
  r.updatingZones=undefined;
  b.zones=r.zones.map(z=>({id:z.id,createdAt:z.createdAt,source:z.source,skill:z.skill,layer:z.options.visualLayer,points:z.points,visualSkill:z.visualSkill,visualPoints:z.visualPoints,x:z.x,y:z.y,radius:z.options.radius,until:z.until}));
}
function completePending(b:BattleState,u:CombatUnit,virtualPending?:PendingAction) {
  const r=runtime(b),state=r.units.get(u.id)!,pending=virtualPending??state.pending;if(!pending||pending.due>b.time+1e-8)return;
  if(!virtualPending)state.pending=undefined;const target=b.units.find(t=>t.id===pending.target);if(!target||u.dead||(target.dead&&!pending.castPosition))return;
  if(pending.type==='attack'){
    if(isDisabled(u)||hasStatus(u,'hex')||hasStatus(u,'disarm')||u.attackCapability==='none')return;
    const range=attackRange(u);if(!canTarget(target)||!attackTargetAllowed(u,target)||distance(u,target)>range+BODY_RADIUS+Number(u.attackRangeBuffer??BATTLE_CONFIG.attackRangeBuffer)){u.nextAttack=Math.min(u.nextAttack,b.time);return;}
    if(pending.attackRecord)pending.attackRecord.ranged=isRangedAttackType(u);
    const prepared=prepareAttackOptions(b,u,target,0,BASIC_ATTACK_ID,{rangedAttackPoint:isRangedAttackType(u),attackRecord:pending.attackRecord}),record=dispatchAttackPoint(b,u,target,0,BASIC_ATTACK_ID,false,prepared),options={...prepared,attackPointEmitted:true,attackRecord:record};
    if(record.ranged){
      const speed=attackProjectileSpeed(u);record.data.projectileSpeed=speed;r.projectiles.push({id:`projectile:${r.nextProjectile++}`,createdAt:b.time,source:u.id,target:target.id,skill:'basic_attack',visualSkill:record.projectileVisual?.skill,visualPoints:record.projectileVisual?.points,x:u.x,y:u.y,speed,effect:t=>performAttack(b,u,t,1,true,0,undefined,true,{},options)});
    }else performAttack(b,u,target,1,true,0,undefined,true,{},options);
    return;
  }
  const skill=u.skills[pending.slot!]!;if(!skill)return;const definition=r.definitions.get(skill.id),p=getSkillProgram(skill.id);if(!definition||!p?.cast||!tranceAllowsAbility(b,u,skill.id)||((hasStatus(u,'root')||hasStatus(u,'soulbind'))&&referenceRootDisables(skill.id)))return;
  if(cannotUseAbility(u,p,p.canCastWhileDisabled?.(context(b,u,target,skill,definition))??false))return;
  if(unitTarget(p,context(b,u,target,skill,definition))&&((p.targetEligibility?!p.targetEligibility(context(b,u,target,skill,definition),target):target.side!==u.side&&!canTarget(target))||(target.side!==u.side&&distance(u,target)>(pending.range??Infinity)+BODY_RADIUS+(pending.rangeBuffer??2.5)))){if(!virtualPending)u.castUntil=b.time;return;}
  const c=context(b,u,target,skill,definition,0,{castPosition:pending.castPosition}),balance=skillBalance(definition,skill.points),native=definition.balanceDomain==='native',cost=native&&p.manaCost?p.manaCost(c):balance?.mana??(p.manaCost?p.manaCost(c):arrayValue(definition.mana,skill.points));
  if(u.mana<cost)return;u.mana-=cost;
  if(p.attackCastPointFactor!==undefined)u.nextAttack=Math.max(u.nextAttack,pending.attackReadyAt??u.actionStart+(pending.attackPeriod??attackInterval(u,target)));
  const nextReduction=Math.min(1,Math.max(0,statusValue(u,'nextCastCooldownReduction')));
  const configuredCooldown=native&&p.cooldown?p.cooldown(c):balance?.cooldown??(p.cooldown?p.cooldown(c):arrayValue(definition.cooldowns,skill.points,10));
  const cooldown=Math.max(p.allowZeroCooldown?0:.2,configuredCooldown*(1-Math.min(.9,Math.max(0,statusValue(u,'cooldownReduction'))))*(1-nextReduction));
  if(p.cooldownStart==='effectEnd'){state.cooldownLocks??={};state.cooldownLocks[chanceIdentity(u,skill)]={slot:pending.slot!,skill,duration:cooldown,active:true};u.cooldowns[pending.slot!]=b.time;}else u.cooldowns[pending.slot!]=b.time+cooldown;
  if(nextReduction>0)u.statuses=u.statuses.filter(s=>s.kind!=='nextCastCooldownReduction');
  const execution={executedAbility:{id:skill.id,cooldown:configuredCooldown,manaCost:cost,procsOnCast:p.procsOnCast!==false,granted:!!(skill as RuntimeSkill).statParentId,itemActive:!!p.itemActive}};
  const executed=()=>{runHooks(b,u,'onAbilityExecuted',target,0,undefined,0,skill.id,u.id,execution);if(p.procsOnCast!==false){runHooks(b,u,'onCast',target,0,undefined,0,skill.id,u.id,execution);for(const ally of live(b).filter(t=>t.side===u.side&&t.id!==u.id))runHooks(b,ally,'onAllyCast',u,0,undefined,0,skill.id,u.id,execution);}};
  runHooks(b,u,'onBeforeAbilityEffect',target,0,undefined,0,skill.id,u.id,execution);
  if(target.side!==u.side&&unitTarget(p,c)&&(p.spellBlockTiming??'cast')==='cast'&&consumeSpellBlock(b,u,target,skill.id)){finishEffectCooldown(b,u,skill);if(!virtualPending){u.castUntil=pending.recoverUntil;state.recoveringCast=true;}emit(b,{type:'cast',source:u.id,target:target.id,skill:skill.id,x:u.x,y:u.y,toX:target.x,toY:target.y,duration:castBackswing(p,c,balance),blocked:true});executed();return;}
  const channel=typeof p.channel==='function'?p.channel(c):p.channel??0;
  if(!virtualPending){if(channel>0){state.channelUntil=b.time+channel;u.castUntil=state.channelUntil;state.recoveringCast=false;state.recoveringAttackCast=false;setAction(b,u,'channel',true);}else {u.castUntil=pending.recoverUntil;state.recoveringCast=true;state.recoveringAttackCast=p.attackCastPointFactor!==undefined;}}
  emit(b,{type:'cast',source:u.id,target:target.id,skill:skill.id,x:u.x,y:u.y,toX:pending.castPosition?.x??target.x,toY:pending.castPosition?.y??target.y,duration:channel>0?channel:castBackswing(p,c,balance)});
  const existingBinding=effects(target).find(s=>s.kind==='soulbind'),boundIds=String(existingBinding?.data?.group??existingBinding?.data?.partnerId??'').split(',');
  if(p.procsOnCast!==false)for(const curse of effects(u).filter(s=>s.kind==='arcaneCurse'))curse.until+=Number(curse.data?.penaltyDuration??2);
  p.cast(c);if(skill.id==='troll_warlord_battle_trance')tranceTarget(b,u);
  executed();
  if(p.soulbindCopies!==false&&skill.id!=='custom_grimstroke_soul_bind'&&unitTarget(p,c))for(const partner of b.units.filter(t=>boundIds.includes(t.id)&&t.id!==target.id&&!t.dead)){
    emit(b,{type:'cast',source:u.id,target:partner.id,skill:skill.id,x:u.x,y:u.y,toX:partner.x,toY:partner.y,duplicatedBy:'custom_grimstroke_soul_bind'});const duplicate=context(b,u,partner,skill,definition);if(channel>0){duplicate.endChannel=()=>{};duplicate.channelUnit=(body,duration,onEnd)=>body.id===u.id?shareUnitChannel(b,u,onEnd):channelUnit(b,unwrap(body),duration,onEnd);}p.cast(duplicate);
  }
}
function processToggleOff(b:BattleState,u:CombatUnit):void {
  if(u.dead||hasStatus(u,'fear')||hasStatus(u,'taunt'))return;
  const r=runtime(b);
  for(const skill of [...u.skills]){
    if(!skill||u.inheritedMode&&!(skill as RuntimeSkill&RecipientGrant).recipientOwnedGrant)continue;
    const p=getSkillProgram(skill.id),definition=r.definitions.get(skill.id);
    if(!p?.toggleActive||!p.toggleOff||!definition||cannotUseAbility(u,p)||!tranceAllowsAbility(b,u,skill.id))continue;
    if(effects(u).some(s=>typeof s.data?.blockedCastingSkills==='string'&&s.data.blockedCastingSkills.split(',').some(id=>id.trim()===skill.id)))continue;
    const c=context(b,u,u,skill,definition);if(!p.toggleActive(c)||!p.canToggleOff?.(c))continue;
    p.toggleOff(c);
    const state=r.units.get(u.id)!;state.toggleOffTick??=new WeakMap();state.toggleOffTick.set(skill,Number(b.tickCount));
    emit(b,{type:'cast',source:u.id,target:u.id,skill:skill.id,x:u.x,y:u.y,toX:u.x,toY:u.y,duration:0,toggleOff:true,procsOnCast:false});
  }
}
function startCast(b:BattleState,u:CombatUnit,duringChannel=false,disabledOnly=false):boolean {
  if(hasStatus(u,'hex'))return false;
  const r=runtime(b),state=r.units.get(u.id)!;
  for(let slot=0;slot<u.skills.length;slot++) {
    const skill=u.skills[slot] as (RuntimeSkill&RecipientGrant)|null;if(!skill||state.toggleOffTick?.get(skill)===Number(b.tickCount)||u.inheritedMode&&!skill.recipientOwnedGrant||(u.cooldowns[slot]??0)>b.time+1e-8||state.cooldownLocks?.[chanceIdentity(u,skill)]?.active)continue;
    if(effects(u).some(status=>{const ids=status.data?.blockedCastingSkills;return typeof ids==='string'&&ids.split(',').some(id=>id.trim()===skill.id);}))continue;
    const d=r.definitions.get(skill.id),p=getSkillProgram(skill.id);if(!d||!p?.cast||p.passive||disabledOnly&&!p.canCastWhileDisabled||(duringChannel&&!p.canCastWhileChanneling)||!tranceAllowsAbility(b,u,skill.id)||((hasStatus(u,'root')||hasStatus(u,'soulbind'))&&referenceRootDisables(skill.id)))continue;
    if(p.attackCastPointFactor!==undefined&&(u.nextAttack>b.time+1e-8||hasStatus(u,'disarm')))continue;
    const eligible=p.targetEligibility?(target:CombatUnit)=>p.targetEligibility!(context(b,u,target,skill,d),target):undefined;
    let target=selectTarget(b,u,p,eligible)??(p.targetSelector?u:undefined);if(!target)continue;
    let c=context(b,u,target,skill,d);const balance=skillBalance(d,skill.points),native=d.balanceDomain==='native',baseRange=((native||p.dynamicRange)&&typeof p.range==='function'?p.range(c):balance?.range??(typeof p.range==='function'?p.range(c):p.range??7)),range=p.ignoreCastRangeBonuses?baseRange:baseRange*(1+statusValue(u,'castRangePct'))+statusValue(u,'castRange');
    if(p.targetSelector){const candidates=live(b).filter(t=>(p.target==='ally'?t.side===u.side:p.target==='self'?t.id===u.id:p.target==='any'?t.id!==u.id:t.side!==u.side)&&(eligible?eligible(t):t.side===u.side||canTarget(t))&&(t.id===u.id||distance(t,u)<=range+BODY_RADIUS));target=p.targetSelector(c,candidates);if(!target)continue;c=context(b,u,target,skill,d);}
    const disableException=p.canCastWhileDisabled?.(c)??false;if(disabledOnly&&!disableException||cannotUseAbility(u,p,disableException))continue;
    if(u.mana<(native&&p.manaCost?p.manaCost(c):balance?.mana??(p.manaCost?p.manaCost(c):arrayValue(d.mana,skill.points))))continue;
    if(target.id!==u.id&&distance(u,target)>range+BODY_RADIUS)continue;
    if(p.canCast&&!p.canCast(c))continue;
    if(!duringChannel)cancelCastRecovery(b,u);
    const requiresFacing=typeof p.requiresFacing==='function'?p.requiresFacing(c):p.requiresFacing??(p.target!=='self'&&!d.categories.some(kind=>/no target|toggle/i.test(kind)));
    if(target!==u&&requiresFacing&&!hasStatus(u,'castWithoutTurning')&&!faceOrder(b,u,target))return true;
    const speedScale=Math.max(.01,1+statusValue(u,'castTimePct')),period=p.attackCastPointFactor!==undefined?attackInterval(u,target):undefined;
    const attackFactor=typeof p.attackCastPointFactor==='function'?p.attackCastPointFactor(c):p.attackCastPointFactor;
    const point=attackFactor!==undefined?attackWindup(u,period!,target)*attackFactor:((native||p.dynamicCastPoint)&&typeof p.castPoint==='function'?p.castPoint(c):balance?.castPoint??(typeof p.castPoint==='function'?p.castPoint(c):p.castPoint??referenceCastPoint(c)))*speedScale,backswing=period!==undefined?attackBackswing(u,period,target):castBackswing(p,c,balance)*speedScale;
    if((duringChannel||disableException)&&point!==0)continue;
    if(disableException&&!duringChannel&&state.channelUntil>b.time+1e-8)interrupt(b,u);
    const nativeId=skill.id.replace(/^custom_/,''),rangeBuffer=point===0?0:period!==undefined?Number(u.attackRangeBuffer??BATTLE_CONFIG.attackRangeBuffer):Number((p as SkillProgram&{castRangeBuffer?:number}).castRangeBuffer??(nativeId==='sniper_assassinate'?6:nativeId==='spirit_breaker_nether_strike'?5:2.5));
    const isPointTarget=typeof p.pointTarget==='function'?p.pointTarget(c):!!p.pointTarget;
    const pending:PendingAction={type:'cast',due:b.time+point,recoverUntil:b.time+point+backswing,target:target.id,slot,token:state.token,range,rangeBuffer,attackPeriod:period,attackReadyAt:period!==undefined?b.time+period:undefined,castPosition:isPointTarget?{x:target.x,y:target.y}:undefined};
    const order={castOrder:{skillId:skill.id,targetId:target.id,kind:isPointTarget?'point' as const:unitTarget(p,c)?'unit' as const:'none' as const}};
    if(duringChannel){p.onCastStart?.(c);runHooks(b,u,'onSpellOrder',target,0,undefined,0,skill.id,u.id,order);completePending(b,u,pending);return true;}
    state.pending=pending;
    if(period!==undefined){state.lastTarget=target.id;state.attackPeriod=period;state.attackWindup=attackWindup(u,period,target);state.attackBackswing=attackBackswing(u,period,target);}
    state.castScale=speedScale;state.recoveringCast=false;state.recoveringAttackCast=false;u.castUntil=b.time+point+backswing;setAction(b,u,'cast',true);
    emit(b,{type:'status',source:u.id,target:target.id,skill:skill.id,x:u.x,y:u.y,status:'castWindup',duration:point});
    p.onCastStart?.(c);
    runHooks(b,u,'onSpellOrder',target,0,undefined,0,skill.id,u.id,order);
    if(point===0)completePending(b,u);
    return true;
  }
  return false;
}
function cancelCastRecovery(b:BattleState,u:CombatUnit):void{const state=runtime(b).units.get(u.id)!;if(state.recoveringCast){state.recoveringCast=false;u.castUntil=b.time;}}
function cancelLostTarget(b:BattleState,u:CombatUnit):void{
  const state=runtime(b).units.get(u.id)!,pending=state.pending;if(!pending)return;
  if(pending.type==='cast'&&pending.castPosition)return;
  const target=b.units.find(t=>t.id===pending.target);
  const skill=pending.type==='cast'?u.skills[pending.slot!]:undefined,definition=skill?runtime(b).definitions.get(skill.id):undefined,program=skill?getSkillProgram(skill.id):undefined;
  const invalid=target&&(pending.type==='attack'?!canTarget(target):definition&&program&&unitTarget(program,context(b,u,target,skill!,definition))&&(program.targetEligibility?!program.targetEligibility(context(b,u,target,skill!,definition),target):target.side!==u.side&&!canTarget(target)));
  if(!target||target.dead||invalid){interrupt(b,u);setAction(b,u,'idle');}
}
function moveToPoint(b:BattleState,u:CombatUnit,target:MotionPoint,stopDistance=0) {
  if(hasStatus(u,'root')||hasStatus(u,'motionRoot')||(u.moveSpeed<=0&&statusValue(u,'minimumMoveSpeed')<=0)){setAction(b,u,'idle');return;}
  const speed=movementSpeed(u);
  const waypoint=routeAroundBarriers(b,u,target),dx=waypoint.x-u.x,dy=waypoint.y-u.y,d=Math.hypot(dx,dy)||1,stop=waypoint===target?stopDistance:0;
  const step=Math.min(speed*FIXED_STEP,Math.max(0,d-stop));
  const requested=constrainBarrierMotion(b,u,constrainSoulbindMotion(b,u,limitOrdinaryMove(u,boundedPoint(u.x+dx/d*step,u.y+dy/d*step)))),sliding=slideUnitMotion(u,requested,b.units,BODY_RADIUS),planned=constrainBarrierMotion(b,u,constrainSoulbindMotion(b,u,sliding));
  const facing=Math.hypot(planned.x-u.x,planned.y-u.y)>1e-9?planned:waypoint;
  if(!effects(u).some(status=>status.kind==='facingLock'&&status.data?.allowMovement)&&!faceOrder(b,u,facing))return;
  ordinaryMove(b,u,planned);setAction(b,u,'move');
}
function moveTowards(b:BattleState,u:CombatUnit,target:CombatUnit){moveToPoint(b,u,target,attackRange(u)+.2);}
function separateUnits(b:BattleState) {
  const units=live(b);
  for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){
    const a=units[i],c=units[j];if(ignoresUnitCollision(a)||ignoresUnitCollision(c))continue;
    let dx=c.x-a.x,dy=c.y-a.y,d=Math.hypot(dx,dy);if(d>=BODY_RADIUS*2)continue;
    if(d<1e-7){dx=((i+j)%2?1:-1);dy=0;d=1;}
    const overlap=(BODY_RADIUS*2-Math.min(BODY_RADIUS*2,Math.hypot(c.x-a.x,c.y-a.y)))/2;
    ordinaryMove(b,a,{x:a.x-dx/d*overlap,y:a.y-dy/d*overlap},'collision');
    ordinaryMove(b,c,{x:c.x+dx/d*overlap,y:c.y+dy/d*overlap},'collision');
  }
  for(const u of units)resolveBarrierOverlap(b,u,remainingMovementBudget(u),runtime(b).units.get(u.id)?.motion?.ignoreTerrainBarriers);
}
function endIfNeeded(b:BattleState) {
  const potential=b.units.filter(u=>(!u.summoned||u.illusion)&&(!u.dead||Number(u.reviveAt??-1)>b.time)),sides=new Set(potential.map(u=>u.side));
  if(sides.size<=1){b.finished=true;b.winner=sides.size?[...sides][0]:null;b.endReason=sides.size?'elimination':'mutual_elimination';}
  else if(b.time>=BATTLE_TIME_LIMIT){b.finished=true;b.winner=null;b.endReason='time_limit';}
}
function updateDuels(b:BattleState):void{
  for(const unit of b.units)for(const status of [...effects(unit)].filter(status=>status.kind==='duel'&&status.data?.duelRules)){
    const partner=b.units.find(other=>other.id===status.data?.targetId),key=status.data?.duelKey;
    if(!key||!partner||unit.dead||partner.dead||distance(unit,partner)>Number(status.data?.breakDistance??20)){
      for(const body of b.units)body.statuses=effects(body).filter(other=>key?other.data?.duelKey!==key:other!==status);
      emit(b,{type:'status',source:unit.id,target:partner?.id,skill:status.skill,x:unit.x,y:unit.y,status:'duelEnded',reason:'invalidPartnerOrDistance'});
    }
  }
}
function tick(b:BattleState) {
  b.tickCount=Number(b.tickCount??0)+1;b.time=Number(b.tickCount)*FIXED_STEP;
  for(const u of b.units)beginMovementFrame(u,Number(b.tickCount),movementSpeed(u),FIXED_STEP);
  for(const u of b.units)for(const entry of [...((u.stolenAbilities??[]) as StolenAbility[])])if(entry.until<=b.time+1e-8)removeStolenAbility(b,u,entry);
  b.barriers=barriers(b).filter(w=>w.until>b.time+1e-8);
  updateDuels(b);
  for(const u of [...b.units])if(!u.dead)updateStatuses(b,u);
  // Off orders precede interval tasks and do not cancel a different windup/channel.
  for(const u of [...b.units])processToggleOff(b,u);
  updateTasks(b);updateProjectiles(b);updateZones(b);updateUnitChannels(b);
  for(const u of live(b)){refreshMovementBudget(u,movementSpeed(u),FIXED_STEP);syncActionClocks(b,u);}
  // Rotate evaluation order every tick: neither player permanently owns first processing.
  const active=live(b),offset=active.length?Number(b.tickCount)%active.length:0;
  const order=[...active.slice(offset),...active.slice(0,offset)];
  for(const u of order){
    if(u.dead)continue;const state=runtime(b).units.get(u.id)!;
    if(hasStatus(u,'actionLock')){setAction(b,u,'controlled');continue;}
    if(isDisabled(u)){interrupt(b,u);if(!startCast(b,u,false,true))setAction(b,u,'controlled');continue;}
    if(state.motion?.lockActions){if(!startCast(b,u,false,true))setAction(b,u,'move');continue;}
    if(hasStatus(u,'fear')){interrupt(b,u);cancelCastRecovery(b,u);if(startCast(b,u,false,true))continue;if(hasStatus(u,'duel')){setAction(b,u,'controlled');continue;}const threat=nearestEnemy(b,u);if(threat){const dx=u.x-threat.x,dy=u.y-threat.y,d=Math.hypot(dx,dy)||1;moveToPoint(b,u,boundedPoint(u.x+dx/d*100,u.y+dy/d*100));}continue;}
    cancelLostTarget(b,u);
    completePending(b,u);if(u.dead)continue;
    if(state.pending)continue;
    if(state.channelUntil>b.time+1e-8){if(!startCast(b,u,false,true))startCast(b,u,true);continue;}
    if(startCast(b,u))continue;
    const target=nearestEnemy(b,u);if(!target){setAction(b,u,'idle');continue;}
    const range=attackRange(u);
    if(distance(u,target)<=range+BODY_RADIUS){
      if(!hasStatus(u,'disarm')&&!hasStatus(u,'hex')&&u.attackCapability!=='none'&&u.nextAttack<=b.time+1e-8){
        cancelCastRecovery(b,u);if(!faceOrder(b,u,target))continue;
        const interval=attackInterval(u,target),windup=attackWindup(u,interval,target);state.lastTarget=target.id;state.attackPeriod=interval;state.attackWindup=windup;state.attackBackswing=attackBackswing(u,interval,target);
        u.nextAttack=b.time+interval;setAction(b,u,'attack',true);
        const record=newAttackRecord(b,u,target,BASIC_ATTACK_ID,{isInstant:false});
        state.pending={type:'attack',due:b.time+windup,recoverUntil:b.time+interval,target:target.id,token:state.token,attackRecord:record};
        emit(b,{type:'attack',source:u.id,target:target.id,x:u.x,y:u.y,toX:target.x,toY:target.y,duration:windup+attackBackswing(u,interval,target),windup,ranged:isRangedAttackType(u)});
        runHooks(b,target,'onIncomingAttackStart',u,0,undefined,1,BASIC_ATTACK_ID,u.id,{attackRecord:record,attackSourceSkill:BASIC_ATTACK_ID,attackIsRanged:record.ranged});
        if(windup===0)completePending(b,u);
      }else if(!(state.recoveringCast&&u.castUntil>b.time)&&(u.action!=='attack'||b.time-u.actionStart>.5))setAction(b,u,'idle');
    }else {cancelCastRecovery(b,u);moveTowards(b,u,target);}
  }
  updateMotions(b);separateUnits(b);publishProjectiles(b);endIfNeeded(b);
}

export function createBattle(a:Player,b:Player,seed:number,definitions:SkillDefinition[],restoreTarget?:BattleState,round=1):BattleState {
  if(a.id===b.id)throw new Error('A battle requires two distinct player IDs.');
  const initialState:BattleState={time:0,units:[],events:[],finished:false,winner:null,rng:(seed>>>0)||0x9e3779b9,tickCount:0,accumulator:0,
    initial:{a:structuredClone(a),b:structuredClone(b),seed,version:COMBAT_VERSION,simulationRevision:SIMULATION_REVISION,configHash:CONFIG_HASH,round} satisfies InitialBattle,round,
    fidelity:'prototype_mechanisms_not_AA_verified',endReason:null,projectiles:[],zones:[],barriers:[],nextBarrierId:0};
  const state=restoreTarget?Object.assign(restoreTarget,initialState):initialState;
  const r:Runtime={units:new Map(),definitions:new Map([...GRANTED_SKILL_DEFINITIONS,...definitions].map(d=>[d.id,d])),tasks:[],projectiles:[],zones:[],nextSequence:0,nextSummon:0,nextProjectile:0,nextZone:0,initializing:true,initialEffects:[],nestedCasts:0,stolen:new Map(),nextStolen:0,initializedSkills:new WeakSet()};runtimeByBattle.set(state,r);
  for(const [player,mirror] of [[a,false],[b,true]] as const)for(const hero of player.heroes){
    const stats=ROLE_CONFIG[hero.role];const u:CombatUnit={id:`${player.id}:${hero.id}`,name:hero.name,role:hero.role,skin:hero.skin,side:player.id,
      x:clamp(mirror?-hero.x:hero.x,BATTLE_BOUNDS.x-BODY_RADIUS),y:clamp(mirror?-hero.y:hero.y,BATTLE_BOUNDS.y-BODY_RADIUS),
      facing:mirror?-Math.PI/2:Math.PI/2,turnRate:stats.turnRate??BATTLE_CONFIG.turnRate,attackPoint:stats.attackPoint,attackBackswing:stats.attackBackswing,projectileSpeed:stats.projectileSpeed??BATTLE_CONFIG.basicAttackProjectileSpeed,attackRangeBuffer:stats.attackRangeBuffer??BATTLE_CONFIG.attackRangeBuffer,warpSequence:0,hp:stats.hp,maxHp:stats.hp,mana:stats.mana,maxMana:stats.mana,attack:stats.attack+Number((hero as typeof hero&{persistentAttackBonus?:number}).persistentAttackBonus??0),armor:stats.armor,magicResist:BATTLE_CONFIG.magicResist,
      attackInterval:stats.attackInterval,range:stats.range,moveSpeed:stats.moveSpeed,skills:structuredClone(hero.skills),cooldowns:hero.skills.map(()=>0),statuses:[],nextAttack:0,castUntil:0,
      action:'idle',actionStart:0,dead:false,damage:0,taken:0,healing:0,heroId:hero.id,permanentAttackGain:0,skillState:hero.skills.reduce<Record<string,number>>((state,skill)=>{for(const[key,value]of Object.entries((skill as (SkillStack&{persistentState?:Record<string,number>})|null)?.persistentState??{}))state[key]=(state[key]??0)+value;return state;},{}),permanentSkillGains:{}};
    initializeAttributes(u,{strength:stats.strength,agility:stats.agility,intelligence:stats.intelligence},stats.primaryAttribute,{strength:Number(hero.persistentStrengthBonus??0),agility:Number(hero.persistentAgilityBonus??0),intelligence:Number(hero.persistentIntelligenceBonus??0)});
    state.units.push(u);battleByUnit.set(u,state);r.units.set(u.id,{token:0,channelUntil:0});
  }
  // An init hook may immediately damage another unit. Every ledger must exist
  // before any hook runs, otherwise a later unit would erase incoming rows.
  for(const u of state.units){u.abilityStats=[];u.absorbed=0;}
  for(const u of state.units)for(const skill of u.skills)if(skill)initializeSkill(state,u,skill);
  state.skillUltimates=Object.fromEntries([...r.definitions.values()].map(d=>[d.id,d.ultimate]));r.initializing=false;
  for(const effect of r.initialEffects.splice(0))effect();
  publishProjectiles(state);endIfNeeded(state);return state;
}
/** frame dt only fills an accumulator; simulation results depend on ticks, never on rendering FPS. */
export function stepBattle(b:BattleState,dt:number,definitions:SkillDefinition[]):void {
  if(!Number.isFinite(dt)||dt<0)throw new Error('Battle dt must be finite and nonnegative.');
  if(!runtimeByBattle.has(b)){
    const initial=b.initial as InitialBattle|undefined,ticks=Number(b.tickCount??0),accumulator=Number(b.accumulator??0);
    if(!initial||initial.version!==COMBAT_VERSION||initial.simulationRevision!==SIMULATION_REVISION||initial.configHash!==CONFIG_HASH||!Number.isSafeInteger(ticks)||ticks<0||ticks>BATTLE_TIME_LIMIT/FIXED_STEP+1)throw new Error('Incompatible simulation revision/configuration or invalid serialized battle replay.');
    createBattle(initial.a,initial.b,initial.seed,definitions,b,initial.round??1);
    for(let i=0;i<ticks&&!b.finished;i++)tick(b);
    b.accumulator=Math.max(0,accumulator);
  }
  if(b.finished)return;
  b.accumulator=Number(b.accumulator??0)+dt;
  while(Number(b.accumulator)+1e-9>=FIXED_STEP&&!b.finished){b.accumulator=Math.max(0,Number(b.accumulator)-FIXED_STEP);tick(b);}
  if(b.finished)b.accumulator=0;
}
export function simulateBattle(a:Player,b:Player,seed:number,definitions:SkillDefinition[],round=1):BattleState {
  const battle=createBattle(a,b,seed,definitions,undefined,round);while(!battle.finished)stepBattle(battle,1,definitions);return battle;
}
export function battleStats(b:BattleState):UnitStats[] {
  return snapshotBattleStats(b);
}
export function battleGains(b:BattleState):{heroId:string;attack:number;strength?:number;agility?:number;intelligence?:number;skillState?:Record<string,number>}[] {
  return b.units.filter(u=>!u.summoned&&['Attack','Strength','Agility','Intelligence'].some(a=>Number(u[`permanent${a}Gain`]??0)!==0)||(!u.summoned&&Object.keys((u.permanentSkillGains??{}) as object).length>0)).map(u=>({heroId:String(u.heroId??u.id.slice(u.id.indexOf(':')+1)),attack:Number(u.permanentAttackGain??0),strength:Number(u.permanentStrengthGain??0),agility:Number(u.permanentAgilityGain??0),intelligence:Number(u.permanentIntelligenceGain??0),...(Object.keys((u.permanentSkillGains??{}) as object).length?{skillState:structuredClone((u.permanentSkillGains??{}) as Record<string,number>)}:{})}));
}
export function serializeBattle(b:BattleState):string { return JSON.stringify(b); }
/** Replaying the recorded deterministic input reconstructs in-flight closures, channels
 * and timers. No function or hidden mutable object is embedded in a save file. */
export function restoreBattle(snapshot:string|BattleState,definitions:SkillDefinition[]):BattleState {
  const saved=typeof snapshot==='string'?JSON.parse(snapshot) as BattleState:snapshot;
  const initial=saved.initial as InitialBattle|undefined;
  if(!initial||initial.version!==COMBAT_VERSION||initial.simulationRevision!==SIMULATION_REVISION||initial.configHash!==CONFIG_HASH)throw new Error('Unsupported battle replay version or incompatible simulation revision/configuration.');
  const b=createBattle(initial.a,initial.b,initial.seed,definitions,undefined,initial.round??1),ticks=Number(saved.tickCount??0);
  if(!Number.isSafeInteger(ticks)||ticks<0||ticks>BATTLE_TIME_LIMIT/FIXED_STEP+1)throw new Error('Invalid battle tick count.');
  for(let i=0;i<ticks&&!b.finished;i++)tick(b);
  b.accumulator=Math.max(0,Number(saved.accumulator??0));return b;
}

/** Read-only effective values for inspector UI; target-specific attack effects are excluded. */
export function getCombatStats(u:CombatUnit){return {attack:attackPower(u),armor:effectiveArmor(u),attackInterval:attackInterval(u),range:attackRange(u),moveSpeed:movementSpeed(u),magicResist:1-(1-u.magicResist*Math.max(0,1+statusValue(u,'baseMagicResistPct')))*(1-Math.min(.95,independentFraction(effectiveStatusEffects(u,'magicResist').map(s=>s.value??0),-2)))};}
