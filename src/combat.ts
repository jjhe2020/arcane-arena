import { arenaBlocksAttack } from './combat/arenas';
import {rollPrd,PRD_WORKING_ELIGIBILITY,type PrdState} from './combat/prd';
import { type BattleState, type CombatEvent, type CombatUnit, type Player, type SkillDefinition, type SkillStack, type UnitStats } from './model';
import { arrayValue, skillValue, getSkillProgram, GRANTED_SKILL_DEFINITIONS, referenceCastPoint, referenceRootDisables, isUnitTargetSkill, type DamageType, type EffectContext, type EffectStatus, type SkillProgram, type SummonOptions, type ZoneOptions, type InstantAttackOptions, type AttackResolution } from './skill-effects';
import { SIMULATION_REVISION } from './simulation-version';
import type {Attribution,DamageCategory,DamageFlags,AttackRecord} from './model';
import {BASIC_ATTACK_ID,recordDamage,recordHealing,recordAbsorption,resolveAttribution,snapshotBattleStats,distributeEffective} from './combat/statistics';
import {independentFraction,selectCritical,type CriticalRoll} from './combat/damage-rules';
import { addBarrier,barriers,constrainBarrierMotion,resolveBarrierOverlap,routeAroundBarriers } from './combat/barriers';
import { beginMovementFrame,constrainUnitMotion,ignoresUnitCollision,limitOrdinaryMove,recordMovement,refreshMovementBudget,remainingMovementBudget,turnTowards,type ContinuousMoveOptions,type MotionController,type MotionPoint } from './combat/movement';
import { CONFIG_HASH,ATTRIBUTE_CONFIG,BATTLE_CONFIG,ROLE_CONFIG,UNIT_CONFIG,skillBalance,type SkillBalance } from './config';
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
interface AttributeState { base:Record<Attribute,number>; permanent:Record<Attribute,number>; primary:Attribute; hp:number;mana:number;attack:number;armor:number;attackSpeed:number;maxHpPct?:number }
const ATTRIBUTE_STATUSES = new Set(['strength','agility','intelligence','strengthPct','agilityPct','intelligencePct','statBonus','statPercent','maxHpPct','break']);
interface PendingAction { type: 'attack' | 'cast'; due: number; recoverUntil: number; target: string; slot?: number; token: number; range?:number; rangeBuffer?:number;attackPeriod?:number;attackReadyAt?:number;castPosition?:MotionPoint }
interface UnitRuntime { pending?: PendingAction; token: number; channelUntil: number; lastTarget?: string;attackPeriod?:number;attackWindup?:number;castScale?:number;recoveringCast?:boolean;recoveringAttackCast?:boolean; motion?:MotionController }
interface UnitRuntime {cooldownLocks?:Record<string,{slot:number;skill:SkillStack;duration:number;active:boolean}>}
interface Task { due: number; sequence: number; effect: () => void; source?: string; token?: number; cancelOnInterrupt?: boolean; stolenOrigin?:string }
interface VisualOrigin {points?:number;visualSkill?:string;visualPoints?:number;attribution?:Attribution;category?:DamageCategory;flags?:DamageFlags;lifesteal?:boolean;healingKind?:'heal'|'regen'|'lifesteal';lifestealProviders?:EffectStatus[];lifestealVictimScale?:number}
interface Projectile extends VisualOrigin { id:string;createdAt:number;source: string; target: string; skill: string; x: number; y: number; speed: number; effect: (target: CombatUnit) => void;disjointable?:boolean;disjointOnInvisibility?:boolean;attackProjectile?:boolean;onMove?:(position:{x:number;y:number})=>void;line?:{angle:number;remaining:number;distance:number;width:number;endWidth?:number;stopOnHit:boolean;targets:'enemies'|'all';hit:string[];onMove?:(position:{x:number;y:number})=>void;onEnd?:()=>void} }
interface Zone extends VisualOrigin { id:string;createdAt:number;source: string; skill: string; x: number; y: number; until: number; next: number; interval: number; tick: number; token: number; options: ZoneOptions; stolenOrigin?:string;ended?:boolean }
function endZone(zone:Zone):void {if(zone.ended)return;zone.ended=true;zone.options.onEnd?.();}
function removeZones(b:BattleState,remove:(zone:Zone)=>boolean):void {const r=runtime(b),removed=[...new Set([...r.zones,...(r.updatingZones??[])])].filter(remove);r.zones=r.zones.filter(zone=>!removed.includes(zone));for(const zone of removed)endZone(zone);}
interface Runtime { units: Map<string, UnitRuntime>; definitions: Map<string, SkillDefinition>; tasks: Task[]; projectiles: Projectile[]; zones: Zone[]; nextSequence: number; nextSummon: number;nextProjectile:number;nextZone:number; initializing: boolean; nestedCasts: number; stolen:Map<string,StolenRuntime>;nextStolen:number;initializedSkills:WeakSet<SkillStack> }
interface Runtime {updatingZones?:Zone[]}
interface InitialBattle { a: Player; b: Player; seed: number; version: number; simulationRevision:string; configHash:string;round: number }
interface StolenAbility {slot:number;id:string;until:number;stolenAt:number;spellAmp:number;debuffAmp:number;token:string}
type RuntimeSkill=SkillStack&{stolenOrigin?:string;grantOwners?:string[];nativeGrant?:boolean;prdOrigin?:string;visualParentId?:string;visualParentPoints?:number;statParentId?:string;statRootId?:string};
interface StolenRuntime {entry:StolenAbility;active:boolean;fields:Record<string,unknown>;direct:Record<string,number>;unit:string}
const proxyUnits=new WeakMap<CombatUnit,CombatUnit>();
const unwrap=(u:CombatUnit)=>proxyUnits.get(u)??u;
// Core values remain shared; arbitrary ability counters are isolated per stolen
// instance. They cannot overwrite the same ability already equipped natively.
const UNIT_FIELDS=new Set('id name role skin side x y facing hp maxHp mana maxMana attack armor magicResist attackInterval range moveSpeed skills cooldowns statuses nextAttack castUntil action actionStart dead damage taken healing heroId damageHistory moveHistory attributes strength agility intelligence primaryAttribute owner summoned illusion expiresAt sourceSkill sourceUnitType visualBody damageTakenMultiplier inheritedMode inheritedInitialized reviveAt ancient stolenAbilities turnRate attackPoint attackBackswing projectileSpeed attackRangeBuffer previousTransform warpSequence transformTick'.split(' '));
const DIRECT_INIT_FIELDS=new Set(['maxHp','maxMana','attack','armor','magicResist','attackInterval','range','moveSpeed']);
UNIT_FIELDS.add('abilityStats');UNIT_FIELDS.add('absorbed');
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
function grantAbility(b:BattleState,u:CombatUnit,parent:SkillStack,id:string,points:number):void {
  const owner=(parent as RuntimeSkill).stolenOrigin;let child=u.skills.find(s=>s?.id===id) as RuntimeSkill|undefined;
  if(child){if(owner){child.grantOwners??=[];if(!child.grantOwners.includes(owner))child.grantOwners.push(owner);}else child.nativeGrant=true;return;}
  while(u.skills.length<5){u.skills.push(null);u.cooldowns.push(0);}
  child={id,points,statParentId:parent.id,statRootId:(parent as RuntimeSkill).statRootId??parent.id,visualParentId:parent.id,visualParentPoints:parent.points,...(owner?{stolenOrigin:owner,grantOwners:[owner]}:{nativeGrant:true})};u.skills.push(child);u.cooldowns.push(b.time);initializeSkill(b,u,child);
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
export function effectiveStatusEffects(u:CombatUnit,kind:string):EffectStatus[] {
  const selected:EffectStatus[]=[],groups=new Map<string,number>();
  for(const status of effects(u).filter(s=>s.kind===kind&&!(s.passive&&s.source===u.id&&hasStatus(u,'break')))){
    if(status.data?.suppressWithSourceBreak){const source=battleByUnit.get(unwrap(u))?.units.find(unit=>unit.id===status.source);if(source&&hasStatus(source,'break'))continue;}
    const group=status.data?.stacking==='strongest'&&typeof status.data.uniqueGroup==='string'?status.data.uniqueGroup:undefined;
    if(!group){selected.push(status);continue;}
    const index=groups.get(group);
    if(index===undefined){groups.set(group,selected.length);selected.push(status);}
    else if(Math.abs(status.value??0)>Math.abs(selected[index].value??0))selected[index]=status;
  }
  return selected;
}
export function statusValue(u:CombatUnit,kind:string):number{return effectiveStatusEffects(u,kind).reduce((n,status)=>n+(status.value??0),0);}
function initializeAttributes(u:CombatUnit,base:Record<Attribute,number>,primary:Attribute,permanent:Record<Attribute,number>={strength:0,agility:0,intelligence:0}):void {
  u.attributes={base:{...base},permanent:{...permanent},primary,hp:0,mana:0,attack:0,armor:0,attackSpeed:0} satisfies AttributeState;
  u.strength=base.strength;u.agility=base.agility;u.intelligence=base.intelligence;u.primaryAttribute=primary;
  refreshAttributes(u);
}
function refreshAttributes(u:CombatUnit):void {
  const a=u.attributes as AttributeState|undefined;if(!a)return;
  for(const kind of ['strength','agility','intelligence'] as const)u[kind]=Math.max(0,(a.base[kind]+a.permanent[kind]+statusValue(u,kind)+statusValue(u,'statBonus'))*(1+statusValue(u,`${kind}Pct`)+statusValue(u,'statPercent')));
  const strengthHp=(Number(u.strength)-a.base.strength)*ATTRIBUTE_CONVERSION.strengthHp,hpPct=statusValue(u,'maxHpPct');
  const hp=strengthHp+(u.maxHp-a.hp+strengthHp)*hpPct;
  const mana=(Number(u.intelligence)-a.base.intelligence)*ATTRIBUTE_CONVERSION.intelligenceMana;
  const attack=(Number(u[a.primary])-a.base[a.primary])*ATTRIBUTE_CONVERSION.primaryAttack;
  const armor=(Number(u.agility)-a.base.agility)*ATTRIBUTE_CONVERSION.agilityArmor;
  const newMaxHp=Math.max(1,u.maxHp+hp-a.hp),hpDifference=newMaxHp-u.maxHp;
  const newMaxMana=Math.max(0,u.maxMana+mana-a.mana),manaDifference=newMaxMana-u.maxMana;
  u.maxHp=newMaxHp;u.maxMana=newMaxMana;
  if(!u.dead)u.hp=Math.max(1,Math.min(newMaxHp,Math.abs((a.maxHpPct??0)-hpPct)>1e-9?u.hp*(newMaxHp/(newMaxHp-hpDifference)):u.hp+hpDifference));
  u.mana=Math.max(0,Math.min(newMaxMana,u.mana+manaDifference));
  u.attack+=attack-a.attack;u.armor+=armor-a.armor;
  Object.assign(a,{hp,mana,attack,armor,maxHpPct:hpPct,attackSpeed:(Number(u.agility)-a.base.agility)*ATTRIBUTE_CONVERSION.agilityAttackSpeed});
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
const cannotCast = (u: CombatUnit) => isDisabled(u) || hasStatus(u,'hex') || hasStatus(u,'silence') || hasStatus(u,'duel');
const canTarget = (u: CombatUnit, single = true) => !u.dead && !hasStatus(u,'invulnerable') && !hasStatus(u,'banished') && !(single&&(hasStatus(u,'shadowRealm')||hasStatus(u,'undetectable')||(hasStatus(u,'invisible')&&!hasStatus(u,'revealed'))));
function interrupt(b: BattleState, u: CombatUnit, onlyCast = false): void {
  const state = runtime(b).units.get(u.id)!;
  if (!onlyCast || state.pending?.type === 'cast' || state.channelUntil > b.time) {
    if (state.pending || state.channelUntil > b.time) {
      // Cancelling an unreleased attack does not consume a new attack cycle.
      // Once released, pending is gone and backswing cancellation cannot reset BAT.
      if(state.pending?.type==='attack')u.nextAttack=Math.min(u.nextAttack,b.time);
      state.pending = undefined; state.token++; state.channelUntil = 0;state.recoveringCast=false;
      u.castUntil = b.time; emit(b, { type:'status', source:u.id,x:u.x,y:u.y,status:'interrupted' });
    }
  }
}
function movementSpeed(u:CombatUnit):number {
  const absolute=effects(u).filter(s=>s.kind==='forceMoveSpeed').sort((a,b)=>Number(b.data?.priority??0)-Number(a.data?.priority??0))[0];
  const limits=BATTLE_CONFIG as typeof BATTLE_CONFIG&{minimumMoveSpeed?:number;maximumMoveSpeed?:number};
  let speed=absolute?.value??(u.moveSpeed<=0?0:(u.moveSpeed+statusValue(u,'moveFlat'))*(1+statusValue(u,'haste'))*(1-(hasStatus(u,'slowImmune')||effects(u).some(s=>s.kind==='berserk'&&s.data?.engaged)?0:Math.min(.95,statusValue(u,'slow')))));
  if(!absolute&&speed>0){const minimum=Math.max(limits.minimumMoveSpeed??1,statusValue(u,'minimumMoveSpeed')),caps=effects(u).filter(s=>s.kind==='maximumMoveSpeed'&&(s.value??0)>0).map(s=>s.value!);const maximum=caps.length?Math.min(...caps):(limits.maximumMoveSpeed??5.5);speed=Math.max(Math.min(minimum,maximum),Math.min(maximum,speed));}
  if(hasStatus(u,'hex'))speed=Math.min(speed,.8);
  return Math.max(0,speed);
}
/** Remaining animation work follows entry/exit from speed modifiers. Channel
 * durations and periodic spell pulses intentionally use world time: cast speed
 * changes animation timing, not the number of seconds in a channel tooltip. */
function syncActionClocks(b:BattleState,u:CombatUnit):void {
  const state=runtime(b).units.get(u.id)!;
  const target=b.units.find(t=>t.id===state.lastTarget),period=attackInterval(u,target),windup=attackWindup(u,period),cast=Math.max(.01,1+statusValue(u,'castTimePct'));
  const attackRatio=period/(state.attackPeriod??period),windupRatio=windup/(state.attackWindup??windup),castRatio=cast/(state.castScale??1);
  const scale=(until:number,ratio:number)=>until>b.time?b.time+(until-b.time)*ratio:until;
  if(Math.abs(attackRatio-1)>1e-9){u.nextAttack=scale(u.nextAttack,attackRatio);if(state.pending?.type==='attack')state.pending.recoverUntil=scale(state.pending.recoverUntil,attackRatio);}
  if(Math.abs(windupRatio-1)>1e-9&&state.pending?.type==='attack')state.pending.due=scale(state.pending.due,windupRatio);
  const attackCast=state.pending?.type==='cast'&&state.pending.attackPeriod!==undefined?state.pending:undefined;
  if(attackCast){
    const backswing=Math.max(0,attackCast.recoverUntil-attackCast.due);
    attackCast.due=scale(attackCast.due,windupRatio);attackCast.recoverUntil=attackCast.due+backswing*attackRatio;
    attackCast.attackReadyAt=scale(attackCast.attackReadyAt??u.actionStart+attackCast.attackPeriod!,attackRatio);attackCast.attackPeriod=period;u.castUntil=attackCast.recoverUntil;
  }else if(Math.abs(castRatio-1)>1e-9){if(state.pending?.type==='cast'){state.pending.due=scale(state.pending.due,castRatio);state.pending.recoverUntil=scale(state.pending.recoverUntil,castRatio);u.castUntil=state.pending.recoverUntil;}else if(state.recoveringCast&&!state.recoveringAttackCast&&state.channelUntil<=b.time)u.castUntil=scale(u.castUntil,castRatio);}
  if(state.recoveringAttackCast&&!state.pending&&state.channelUntil<=b.time)u.castUntil=scale(u.castUntil,attackRatio);
  if(u.castUntil<=b.time)state.recoveringCast=false;
  if(state.attackPeriod!==undefined){state.attackPeriod=period;state.attackWindup=windup;}state.castScale=cast;
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
  const nextTick = options.interval ? b.time + options.interval : undefined;
  if(existing?.kind==='shield'&&existing.data?.burstRadius){target.statuses=target.statuses.filter(s=>s!==existing);burstShield(b,target,existing);existing=undefined;}
  const status: EffectStatus = { kind, until, value, source:source.id, skill, harmful, dispel:options.dispel ?? 'basic', ...options, nextTick, stolenDamageOrigin:originToken };
  if(kind==='ghostshipRum'&&existing?.data?.debtKey)status.data={...status.data,debtKey:existing.data.debtKey};
  if (existing) Object.assign(existing, status, { nextTick: existing.nextTick ?? nextTick }); else target.statuses.push(status);
  if(ATTRIBUTE_STATUSES.has(kind))refreshAttributes(target);
  emit(b,{type:'status',source:source.id,target:target.id,skill,x:target.x,y:target.y,status:kind,duration:until-b.time,amount:value,points:status.points,visualSkill:status.visualSkill,visualPoints:status.visualPoints});
  if (['stun','hex','selfStun','banished','fear'].includes(kind)) interrupt(b,target);
  else if (kind==='silence'||kind==='duel') interrupt(b,target,true);
  else if(kind==='root'||kind==='soulbind'){const pending=runtime(b).units.get(target.id)?.pending,ability=pending?.type==='cast'?target.skills[pending.slot!]:undefined;if(ability&&referenceRootDisables(ability.id))interrupt(b,target,true);}
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
function notifyAffectedDeath(b:BattleState,target:CombatUnit,status:EffectStatus):void {
  if(!status.skill)return;const source=b.units.find(unit=>unit.id===status.source),definition=runtime(b).definitions.get(status.skill),program=getSkillProgram(status.skill);
  if(!source||!definition||!program?.onAffectedUnitDeath)return;
  const skill:RuntimeSkill={id:status.skill,points:status.points??1,instanceId:status.attribution?.skillInstanceId,statParentId:status.attribution?.parentAbilityId,statRootId:status.attribution?.rootAbilityId},c=context(b,source,target,skill,definition);
  c.damage=(unit,amount,type='magical',pierces=status.piercesImmunity??false,options)=>applyDamage(b,source,unwrap(unit),amount,type,status.skill,pierces,0,false,status.stolenDamageOrigin,{points:status.points,visualSkill:status.visualSkill,visualPoints:status.visualPoints,attribution:status.attribution,...options});
  program.onAffectedUnitDeath(c,status);
}
function removeStatuses(b: BattleState, target: CombatUnit, strong = false, harmful = true) {
  const previous=[...effects(target)];
  target.statuses = effects(target).filter(s => {
    if (!!s.harmful !== harmful || s.dispel==='none') return true;
    return s.dispel==='strong' && !strong;
  });
  for(const s of previous)if(!target.statuses.includes(s)){if(s.kind==='ghostshipRum')beginRumPayback(target,s);if(s.kind==='shield')burstShield(b,target,s);notifyStatusRemoved(b,target,s,'dispel');}
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
function restorationFactor(unit:CombatUnit,kind:'heal'|'regen'|'lifesteal'):number {
  const value=(name:string)=>effectiveStatusEffects(unit,name).filter(status=>kind==='heal'||!status.data?.healingOnly).reduce((sum,status)=>sum+(status.value??0),0);
  const reduction=value('healReduction')+(kind==='lifesteal'?value('lifestealReduction'):0),amplification=value(kind==='heal'?'healAmplification':kind==='regen'?'regenAmplification':'lifestealAmplification');
  return (1-Math.min(1,Math.max(0,reduction)))*(1+Math.max(-1,amplification));
}
function heal(b: BattleState, source: CombatUnit, target: CombatUnit, amount: number, skill?: string,transferred=false,depth=0,visual:VisualOrigin={}): number {
  if (target.dead || amount<=0) return 0;
  const reduced=amount*restorationFactor(target,visual.lifesteal?'lifesteal':visual.healingKind??'heal');
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
interface RumLedger {total:number;entries:HealthContribution[]}
interface RumPayback extends RumLedger {remaining:number;rate:number}
function beginRumPayback(u:CombatUnit,s:EffectStatus):void{
  const debts=(u.rumDebts??{}) as Record<string,RumLedger>,key=String(s.data?.debtKey??''),ledger=debts[key];if(!ledger)return;delete debts[key];
  const repayments=(u.rumPaybacks??[]) as RumPayback[];repayments.push({...ledger,remaining:ledger.total,rate:ledger.total/Math.max(FIXED_STEP,Number(s.data?.paybackDuration??10))});u.rumPaybacks=repayments;
}
function repayRum(b:BattleState,u:CombatUnit):void{
  const repayments=(u.rumPaybacks??[]) as RumPayback[];
  for(const debt of repayments){
    const scheduled=Math.min(debt.remaining,debt.rate*FIXED_STEP),actual=Math.min(scheduled,Math.max(0,u.hp-1));debt.remaining=Math.max(0,debt.remaining-scheduled);u.hp-=actual;
    const portions=distributeEffective(actual,debt.entries.map(entry=>entry.amount));
    debt.entries.forEach((entry,index)=>{const value=portions[index],source=b.units.find(t=>t.id===entry.source)??u;if(value<=0)return;const type=entry.type??'pure',flags={...entry.flags,delayed:true,nonLethal:true};recordDamage(b,source,u,value,type,entry.attribution,flags);emit(b,{type:'hit',source:source.id,target:u.id,skill:entry.skill,x:u.x,y:u.y,amount:value,attribution:entry.attribution,flags,rumPayback:true,damageType:type,originDamageType:type,resolutionKind:'rumRepayment'});});
  }
  u.rumPaybacks=repayments.filter(d=>d.remaining>1e-8);
}
function deferredLedger(u:CombatUnit):DeferredHealth { if(!u.deferredHealth)u.deferredHealth={healing:0,healingEntries:[],damage:[]};return u.deferredHealth as DeferredHealth; }
function settleDeferredHealth(b:BattleState,u:CombatUnit,status:EffectStatus){
  const ledger=deferredLedger(u);u.deferredHealth=undefined;
  const damage=ledger.damage.reduce((n,d)=>n+d.amount,0),healing=ledger.healing*Number(status.data?.healMultiplier??2),net=damage-healing;
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
function runHooks(b: BattleState, unit: CombatUnit, hook: 'onAttack'|'onAttacked'|'onDamage'|'onDealDamage'|'onAbilityDamageEvent'|'onIncomingDamageEvent'|'onCast'|'onSpellOrder'|'onKill'|'onDeath'|'onAllyCast'|'onAllyAttack'|'onAllyAttackPoint'|'onAttackPoint'|'onUnitDeath'|'onManaShieldSpent'|'onHeal', target: CombatUnit, amount = 0, damageType?: DamageType, depth = 0, triggerSkillId?: string,triggerUnitId?:string,hookMetadata?:Partial<EffectContext>) {
  if(unit.dead&&hook!=='onDeath')return;
  for (const skill of unit.skills) {
    if(!skill)continue;const p=getSkillProgram(skill.id),d=runtime(b).definitions.get(skill.id);
    if(p?.[hook]&&d&&!(p.passive&&hasStatus(unit,'break'))) p[hook]!(context(b,unit,target,skill,d,depth,{amount,damageType,triggerSkillId,triggerUnitId,...hookMetadata},false,true));
  }
  refreshAttributes(unit);if(target!==unit)refreshAttributes(target);
}
function consumeSpellBlock(b:BattleState,source:CombatUnit,target:CombatUnit,skill:string):boolean {
  const block=effects(target).find(status=>status.kind==='spellBlock');if(!block)return false;
  target.statuses=target.statuses.filter(status=>status!==block);emit(b,{type:'status',source:target.id,target:source.id,skill,x:target.x,y:target.y,status:'spellBlocked'});return true;
}
function finishEffectCooldown(b:BattleState,unit:CombatUnit,skill:SkillStack,seconds?:number):void {
  const lock=runtime(b).units.get(unit.id)?.cooldownLocks?.[chanceIdentity(unit,skill)];if(!lock?.active)return;lock.active=false;
  if(unit.skills[lock.slot]!==lock.skill)return;
  unit.cooldowns[lock.slot]=b.time+Math.max(0,seconds??lock.duration);
  emit(b,{type:'status',source:unit.id,skill:skill.id,x:unit.x,y:unit.y,status:'cooldownStarted',duration:Math.max(0,seconds??lock.duration)});
}
function kill(b: BattleState, unit: CombatUnit, source?: CombatUnit, skill?: string): void {
  if(unit.dead)return;unit.hp=0;unit.dead=true;interrupt(b,unit);setAction(b,unit,'death',true);
  emit(b,{type:'death',source:source?.id??unit.id,target:unit.id,skill,x:unit.x,y:unit.y});
  unit.rumDebts={};unit.rumPaybacks=[];
  runHooks(b,unit,'onDeath',source??unit);
  for(const status of [...effects(unit)])notifyAffectedDeath(b,unit,status);
  if(source&&source.side!==unit.side)runHooks(b,source,'onKill',unit,0,undefined,0,skill);
  for(const observer of live(b))runHooks(b,observer,'onUnitDeath',unit);
  for(const body of b.units)body.statuses=effects(body).filter(s=>s.kind!=='duel'||(body.id!==unit.id&&s.data?.targetId!==unit.id));
  const reincarnation=effects(unit).find(s=>s.kind==='reincarnation'&&(s.value??0)>0);
  if(reincarnation){reincarnation.value=0;scheduleRevive(b,unit,3,.5);}
}
export function applyDamage(b: BattleState, source: CombatUnit, target: CombatUnit, amount: number, type: DamageType='magical', skill?: string, piercesImmunity=false, depth=0,ignoreBaseArmor=false,originToken?:string,visual:VisualOrigin={}): number {
  if(target.dead||!Number.isFinite(amount)||depth>8)return 0;
  const category=visual.category??(skill?'spell':'attack'),flags=visual.flags??{},attack=category==='attack';
  // Unit/ability eligibility is separate from post-mitigation HP loss. Full
  // barriers, Refraction, physical immunity and Borrowed Time still yield an
  // accepted zero-damage instance. Untargetable invulnerability, banishment or
  // non-pierced spell immunity reject the instance before damage processing.
  const accepted=category==='spell'&&!!skill&&skill!==BASIC_ATTACK_ID&&!flags.healthRemoval&&!flags.noDamageHooks&&!flags.reflection
    &&!hasStatus(target,'invulnerable')&&!hasStatus(target,'banished')
    &&!((type!=='physical'||!attack)&&hasStatus(target,'magicImmune')&&!piercesImmunity)
    &&!(!attack&&(hasStatus(target,'immuneSpells')||effects(target).some(status=>status.kind==='hitCountBody'&&status.data?.immuneSpells)));
  // Native negative damage is corrected to zero; it is never converted to a
  // heal. Keep the original input on the dedicated event for source auditing.
  const incomingAccepted=amount>0&&category!=='hpRemoval'&&!flags.healthRemoval&&!flags.noDamageHooks&&!hasStatus(target,'invulnerable')&&!hasStatus(target,'banished')
    &&!((type!=='physical'||!attack)&&hasStatus(target,'magicImmune')&&!piercesImmunity)
    &&!(!attack&&(hasStatus(target,'immuneSpells')||effects(target).some(status=>status.kind==='hitCountBody'&&status.data?.immuneSpells)));
  const actual=resolveDamage(b,source,target,Math.max(0,amount),type,skill,piercesImmunity,depth,ignoreBaseArmor,originToken,visual);
  if(incomingAccepted)runHooks(b,target,'onIncomingDamageEvent',source,actual,type,depth+1,skill,source.id,{incomingDamageEvent:{inputAmount:amount,actualDamage:actual,category,flags:{...flags}}});
  if(accepted)runHooks(b,source,'onAbilityDamageEvent',target,actual,type,depth+1,skill,source.id,{abilityDamageEvent:{inputAmount:amount,actualDamage:actual,category,flags:{...flags}}});
  return actual;
}
/** Effective damage accounting remains independent of accepted instance hooks.
 * Deferred settlements call commitResolvedDamage directly and cannot emit the
 * original ability instance a second time. */
function resolveDamage(b: BattleState, source: CombatUnit, target: CombatUnit, amount: number, type: DamageType='magical', skill?: string, piercesImmunity=false, depth=0,ignoreBaseArmor=false,originToken?:string,visual:VisualOrigin={}): number {
  if(target.dead||!Number.isFinite(amount)||amount<=0||depth>8)return 0;
  const category=visual.category??(skill?'spell':'attack'),flags=visual.flags??{},attack=category==='attack';
  visual={...visual,category,flags,attribution:attributionFor(b,source,skill,visual)};
  refreshAttributes(source);refreshAttributes(target);
  if(hasStatus(target,'invulnerable')||hasStatus(target,'banished'))return 0;
  if(flags.healthRemoval||category==='hpRemoval')return commitResolvedDamage(b,source,target,amount,type,skill,depth,false,{...visual,category:'hpRemoval',lifestealProviders:[],flags:{...flags,healthRemoval:true,noAmplification:true,noSpellLifesteal:true,noReflection:true,noDamageHooks:true}});
  if(type==='physical'&&hasStatus(target,'physicalImmune'))return 0;
  if((type!=='physical'||!attack)&&hasStatus(target,'magicImmune')&&!piercesImmunity)return 0;
  const dodge=Math.min(1,Math.max(0,statusValue(target,'damageDodge')));if(dodge>0&&nextRandom(b)<dodge){emit(b,{type:'hit',source:source.id,target:target.id,skill,x:target.x,y:target.y,amount:0,outcome:'damageDodged'});return 0;}
  const hitCount=effects(target).find(s=>s.kind==='hitCountBody');
  if(!attack&&(hasStatus(target,'immuneSpells')||hitCount?.data?.immuneSpells))return 0;
  if(hitCount&&attack)return commitResolvedDamage(b,source,target,Number(source.summoned&&!source.illusion?hitCount.data?.basicDamage??1:hitCount.data?.heroDamage??2),type,skill,depth,false,visual);
  let damage=amount;
  if(!flags.bypassGenericMultipliers){
  if(type==='physical')damage*=1-Math.min(1,Math.max(0,statusValue(source,'physicalOutputReduction')));
  damage*=1-Math.min(1,Math.max(0,effectiveStatusEffects(source,'outgoingDamageReduction').filter(s=>s.data?.targetId===target.id).reduce((n,s)=>n+(s.value??0),0)));
  damage*=1+effectiveStatusEffects(target,'sourceDamageAmp').filter(s=>s.source===source.id||s.source===source.owner).reduce((n,s)=>n+(s.value??0),0);
  if(attack)damage*=1-Math.min(1,Math.max(0,statusValue(target,'attackDamageReduction')));
  if((!attack||flags.convertedAttack)&&!flags.noAmplification&&!flags.reflection&&!flags.healthRemoval){const stolen=originToken?runtime(b).stolen.get(originToken)?.entry:undefined;damage*=1+Math.max(-.99,statusValue(source,'spellAmp')+(stolen?.spellAmp??0));}
  }
  if(type==='physical'){
    let blocked=attack&&!flags.ignoreDamageBlock?statusValue(target,'block'):0;
    if(attack&&!flags.ignoreDamageBlock)for(const s of effectiveStatusEffects(target,'attackDamageBlock'))if(nextRandom(b)<Number(s.data?.chance??1))blocked=Math.max(blocked,s.value??0);
    damage=Math.max(0,damage-blocked)*physicalDamageMultiplier((ignoreBaseArmor||hasStatus(source,'baseArmorIgnore')?0:target.armor*(1+statusValue(target,'baseArmorPct')))+statusValue(target,'armor'));
  }
  if(type==='physical'&&!flags.bypassGenericMultipliers)damage*=1+statusValue(target,'physicalVulnerability');
  if(type==='magical') {
    const baseResist=target.magicResist*Math.max(0,1+statusValue(target,'baseMagicResistPct'));
    const resist=1-(1-baseResist)*(1-Math.min(.95,independentFraction(effectiveStatusEffects(target,'magicResist').map(s=>s.value??0),-2)));
    damage*=1-resist;if(!flags.bypassGenericMultipliers)damage*=1+statusValue(target,'magicVulnerability');
  }
  if(!flags.bypassGenericMultipliers){
  damage*=1-Math.min(1,independentFraction(effectiveStatusEffects(target,'damageReduction').map(s=>s.value??0)));
  damage*=1+statusValue(target,'damageVulnerability');
  damage=Math.max(0,damage-statusValue(target,'allDamageBlock'));
  const duel=effects(target).find(s=>s.kind==='duel');if(duel&&duel.data?.targetId!==source.id)damage*=1-Number(duel.data?.externalReduction??0);
  damage*=Number(target.damageTakenMultiplier??1);
  }
  const promised=hasStatus(target,'falsePromise');
  if(!promised){
    for(const transfer of effects(target).filter(s=>s.kind==='borrowedRedirect')){const owner=b.units.find(u=>u.id===transfer.source&&!u.dead&&hasStatus(u,'borrowedTime'));if(owner){const redirected=damage*Math.min(1,transfer.value??0);damage-=redirected;heal(b,owner,owner,redirected,transfer.skill);break;}}
    if(hasStatus(target,'borrowedTime')){heal(b,target,target,damage,'abaddon_borrowed_time');return 0;}
  }
  const carapace=effects(target).find(s=>s.kind==='spikedCarapace');
  if(carapace&&!flags.noReflection&&!flags.reflection&&!flags.healthRemoval&&source.id!==target.id&&source.side!==target.side){const key=`carapace:${carapace.until}`,seen=(target[key]??{}) as Record<string,boolean>;target[key]=seen;if(!seen[source.id]){seen[source.id]=true;recordAbsorption(b,target,target,damage,{abilityId:carapace.skill??'nyx_assassin_spiked_carapace',...carapace.attribution});applyDamage(b,target,source,damage*(carapace.value??1),type,carapace.skill,false,depth+1,false,undefined,{category:'spell',flags:{reflection:true,noSpellLifesteal:true,noAmplification:true,noReflection:true}});addStatus(b,target,source,carapace.skill??'nyx_assassin_spiked_carapace','stun',Number(carapace.data?.stunDuration??0),0,{harmful:true,dispel:'strong'});return 0;}}
  // Historical False Promise negates before ordinary barriers. Borrowed Time
  // still produces its heal, which is recorded alongside the original damage.
  if(promised){
    deferredLedger(target).damage.push({source:source.id,amount:damage,skill,type,attribution:attributionFor(b,source,skill,visual),flags:{...flags}});
    if(hasStatus(target,'borrowedTime'))heal(b,target,target,damage,'abaddon_borrowed_time');
    return 0;
  }
  const refraction=effects(target).find(s=>s.kind==='refraction'&&(s.remaining??0)>0);
  if(refraction&&damage>5){recordAbsorption(b,b.units.find(u=>u.id===refraction.source)??target,target,damage,{abilityId:refraction.skill??'templar_assassin_refraction',...refraction.attribution});refraction.remaining!--;if(refraction.remaining!<=0)target.statuses=target.statuses.filter(s=>s!==refraction);return 0;}
  const manaShield=statusValue(target,'manaShield'),perMana=statusValue(target,'damagePerMana');
  if(manaShield>0&&perMana>0){const absorb=Math.min(damage*manaShield,target.mana*perMana),spent=absorb/perMana,shield=effects(target).find(s=>s.kind==='manaShield');target.mana-=spent;damage-=absorb;recordAbsorption(b,b.units.find(u=>u.id===shield?.source)??target,target,absorb,{abilityId:shield?.skill??'medusa_mana_shield',...shield?.attribution});if(spent>0)runHooks(b,target,'onManaShieldSpent',source,spent,type,depth+1,skill);}
  for(const shield of [...effects(target)]) {
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
  const lifestealProviders=visual.lifestealProviders??(spellRestoration&&!flags.noSpellLifesteal&&!flags.reflection&&!flags.healthRemoval?structuredClone(effectiveStatusEffects(source,'spellLifesteal')):undefined);
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
  const actual=Math.max(0,Math.min(target.hp,damage));target.hp-=actual;recordDamage(b,source,target,actual,type,attribution,flags);
  if(!flags.healthRemoval){const history=(target.damageHistory??[]) as {time:number;amount:number}[];target.damageHistory=[...history.filter(x=>x.time>=b.time-6),{time:b.time,amount:actual}];}
  emit(b,{type:'hit',source:source.id,target:target.id,skill,x:target.x,y:target.y,amount:actual,damageType:type,...visual,attribution,category,flags,...(delayed?{delayed:true}:{})});
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
  providers.forEach((provider,index)=>{if(shares[index]>0)heal(b,unit,unit,shares[index],provider.skill??'lifesteal',false,1,{lifesteal:true,attribution:resolveAttribution(b,unit,{...provider.attribution,abilityId:provider.skill??'lifesteal',sourceUnitId:unit.id,ownerUnitId:creditUnit(b,unit).id})});});
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
  const rate=Number(u.turnRate??BATTLE_CONFIG.turnRate)*Math.max(0,1+statusValue(u,'turnRatePct'));
  const faced=turnTowards(u,target,FIXED_STEP,rate);if(!faced)setAction(b,u,'idle');return faced;
}
function scheduleContinuousMove(b:BattleState,target:CombatUnit,owner:string,skill:string,x:number,y:number,options:ContinuousMoveOptions={}):boolean{
  if(target.dead||![x,y].every(Number.isFinite))return false;
  if(effects(target).some(status=>status.until>b.time&&String(status.data?.blockedMotionSkills??'').split(',').includes(skill)))return false;
  const state=runtime(b).units.get(target.id);if(!state)return false;
  const priority=finite(options.priority??0),current=state.motion;
  if(current&&current.startedAt+current.duration>b.time-1e-9&&current.owner!==owner&&priority<=current.priority)return false;
  const duration=Math.max(FIXED_STEP,finite(options.duration??FIXED_STEP,FIXED_STEP));
  state.motion={owner,skill,from:{x:target.x,y:target.y},to:boundedPoint(x,y),startedAt:b.time-FIXED_STEP,duration,priority,lockActions:options.lockActions??true,ignoreBarriers:options.ignoreBarriers??false};
  if(state.motion.lockActions)interrupt(b,target);
  advanceMotion(b,target,state.motion);
  return true;
}
function warpUnit(b:BattleState,target:CombatUnit,skill:string,x:number,y:number,visual:VisualOrigin):void{
  if(target.dead||![x,y].every(Number.isFinite))return;
  const state=runtime(b).units.get(target.id);if(state)state.motion=undefined;
  const oldX=target.x,oldY=target.y;recordMovement(target,b.time,boundedPoint(x,y),'warp',skill);
  if(target.action==='spawn'&&target.actionStart===b.time){
    target.previousTransform={x:target.x,y:target.y,facing:target.facing,warpSequence:Number(target.warpSequence??0)};
    const birth=b.events.find(e=>e.type==='summon'&&e.target===target.id&&e.time===b.time);if(birth){birth.x=target.x;birth.y=target.y;}
  }
  emit(b,{type:'move',source:target.id,skill,x:oldX,y:oldY,toX:target.x,toY:target.y,teleport:true,movementKind:'warp',...visual});
}
function advanceMotion(b:BattleState,u:CombatUnit,motion:MotionController):number{
  const progress=Math.max(0,Math.min(1,(b.time-motion.startedAt)/motion.duration)),desired={x:motion.from.x+(motion.to.x-motion.from.x)*progress,y:motion.from.y+(motion.to.y-motion.from.y)*progress};
  const point=motion.ignoreBarriers?boundedPoint(desired.x,desired.y):constrainBarrierMotion(b,u,desired),oldX=u.x,oldY=u.y;
  if(recordMovement(u,b.time,point,'forced',motion.skill)>0)emit(b,{type:'move',source:u.id,skill:motion.skill,x:oldX,y:oldY,toX:u.x,toY:u.y,teleport:false,movementKind:'forced'});
  return progress;
}
function updateMotions(b:BattleState):void{
  for(const u of b.units){const state=runtime(b).units.get(u.id),motion=state?.motion;if(!state||!motion)continue;
    if(u.dead){state.motion=undefined;continue;}
    const progress=advanceMotion(b,u,motion);
    if(progress>=1-1e-9)state.motion=undefined;
  }
}
function ordinaryMove(b:BattleState,u:CombatUnit,point:MotionPoint,kind:'walk'|'collision'='walk'):void{
  let desired=limitOrdinaryMove(u,boundedPoint(point.x,point.y));
  for(const bind of effects(u).filter(s=>s.kind==='soulbind'))for(const partner of b.units.filter(t=>String(bind.data?.group??bind.data?.partnerId??'').split(',').includes(t.id)&&t.id!==u.id&&!t.dead)){
    const max=Number(bind.data?.radius??6),before=distance(u,partner),after=Math.hypot(desired.x-partner.x,desired.y-partner.y);
    if(after>max&&after>before+1e-9){
      if(before>=max-1e-9){desired={x:u.x,y:u.y};continue;}
      let low=0,high=1;for(let i=0;i<24;i++){const mid=(low+high)/2;if(Math.hypot(u.x+(desired.x-u.x)*mid-partner.x,u.y+(desired.y-u.y)*mid-partner.y)<=max)low=mid;else high=mid;}
      desired={x:u.x+(desired.x-u.x)*low,y:u.y+(desired.y-u.y)*low};
    }
  }
  desired=constrainBarrierMotion(b,u,desired);desired=constrainUnitMotion(u,desired,b.units,BODY_RADIUS);
  recordMovement(u,b.time,desired,kind);
}
function context(b: BattleState, caster: CombatUnit, target: CombatUnit, skill: SkillStack, definition: SkillDefinition, depth=0, extra: Partial<EffectContext>={},initializing=false,hook=false): EffectContext {
  caster=unwrap(caster);target=unwrap(target);
  const r=runtime(b),referencePierces=definition.categories.some(s=>/PIERCES SPELL IMMUNITY:\s*Yes/i.test(s)),origin=stolenOrigin(b,skill),token=origin?.entry.token;
  const stat=skill as RuntimeSkill,attribution=resolveAttribution(b,caster,{abilityId:skill.id,parentAbilityId:stat.statParentId??extra.originSkillId,rootAbilityId:stat.statRootId??stat.statParentId??extra.originSkillId,skillInstanceId:skill.instanceId??stat.stolenOrigin??stat.prdOrigin});
  const reflection=hook&&['custom_spectre_dispersion','tidehunter_kraken_shell','nyx_assassin_spiked_carapace'].includes(skill.id)&&extra.amount!==undefined;
  const visual:VisualOrigin={points:skill.points,visualSkill:extra.visualSkill??extra.originSkillId??stat.visualParentId??skill.id,visualPoints:extra.visualPoints??extra.originPoints??stat.visualParentPoints??skill.points,attribution,category:'spell',...(reflection?{flags:{reflection:true,noSpellLifesteal:true,noAmplification:true,noReflection:true}}:skill.id==='custom_luna_moon_glaive'?{flags:{noAmplification:true,noSpellLifesteal:true}}:{})};
  const view=origin?stolenView(caster,origin,initializing||hook):caster;
  const guard=<T extends unknown[]>(callback:(...args:T)=>void)=>(...args:T)=>{if(!initializing||!origin||origin.active)callback(...args);};
  return { battle:b,caster:view,target:target===caster?view:target,skill,definition,attackInstanceKey:chanceIdentity(caster,skill),currentAttackTargetId:r.units.get(caster.id)?.lastTarget,...extra,...visual,
    random:()=>nextRandom(b),chance:(probability,key)=>chanceRoll(b,caster,skill,probability,key),enemies:()=>live(b).filter(u=>u.side!==caster.side&&canTarget(u,false)),allies:()=>live(b).filter(u=>u.side===caster.side),
    damage:(t,n,type='magical',pierces=referencePierces,options)=>applyDamage(b,caster,unwrap(t),n,type,skill.id,pierces,depth,false,token,{...visual,...options,flags:{...visual.flags,...options?.flags}}),
    execute:t=>{if(t.dead)return;const amount=t.hp,flags={healthRemoval:true,noDamageHooks:true};recordDamage(b,caster,t,amount,'pure',attribution,flags);emit(b,{type:'hit',source:caster.id,target:t.id,skill:skill.id,x:t.x,y:t.y,amount,damageType:'pure',executed:true,...visual,category:'hpRemoval',flags});kill(b,t,caster,skill.id);},
    trySpellBlock:t=>consumeSpellBlock(b,caster,unwrap(t),skill.id),
    cancelMotion:t=>{const state=r.units.get(unwrap(t).id);if(!state?.motion)return false;state.motion=undefined;return true;},
    startCooldown:seconds=>finishEffectCooldown(b,caster,skill,seconds),
    resetCooldown:()=>{const state=r.units.get(caster.id),key=chanceIdentity(caster,skill),lock=state?.cooldownLocks?.[key];if(lock)lock.active=false;const slot=caster.skills.indexOf(skill);if(slot>=0)caster.cooldowns[slot]=b.time;},
    heal:(t,n,kind='heal')=>heal(b,caster,unwrap(t),n,skill.id,false,depth,{...visual,healingKind:kind,lifesteal:kind==='lifesteal'}),
    mana:(t,n)=>changeMana(b,unwrap(t),n),
    status:(t,kind,seconds,value=0,options={})=>addStatus(b,caster,unwrap(t),skill.id,kind,seconds,value,{passive:!!getSkillProgram(skill.id)?.passive,piercesImmunity:referencePierces,...visual,...options,...((initializing||(hook&&seconds>=BATTLE_TIME_LIMIT))&&token?{stolenOrigin:token}:{})},token),
    dispel:(t,strong=false,harmful=true)=>removeStatuses(b,unwrap(t),strong,harmful),
    projectile:(t,speed,effect,position,onMove)=>r.projectiles.push({id:`projectile:${r.nextProjectile++}`,createdAt:b.time,source:caster.id,target:t.id,skill:skill.id,...visual,x:position?.x??caster.x,y:position?.y??caster.y,speed,disjointable:getSkillProgram(skill.id)?.projectileDisjointable,disjointOnInvisibility:getSkillProgram(skill.id)?.projectileDisjointOnInvisibility,attackProjectile:getSkillProgram(skill.id)?.attackProjectile,effect:guard(effect),onMove:onMove&&guard(onMove)}),
    linearProjectile:o=>r.projectiles.push({id:`projectile:${r.nextProjectile++}`,createdAt:b.time,source:caster.id,target:'',skill:skill.id,...visual,x:o.origin?.x??caster.x,y:o.origin?.y??caster.y,speed:o.speed,attackProjectile:getSkillProgram(skill.id)?.attackProjectile,effect:guard(o.effect),line:{angle:o.angle,remaining:o.distance,distance:o.distance,width:o.width,endWidth:o.endWidth,stopOnHit:o.stopOnHit??false,targets:o.targets??'enemies',hit:[],onMove:o.onMove&&guard(o.onMove),onEnd:o.onEnd&&guard(o.onEnd)}}),
    disjoint:t=>{r.projectiles=r.projectiles.filter(p=>p.target!==t.id||p.disjointable===false);b.projectiles=r.projectiles.map(p=>({id:p.id,createdAt:p.createdAt,source:p.source,target:p.target,skill:p.skill,points:p.points,visualSkill:p.visualSkill,visualPoints:p.visualPoints,x:p.x,y:p.y,angle:p.line?.angle}));emit(b,{type:'status',source:t.id,skill:skill.id,x:t.x,y:t.y,status:'projectileDisjoint',...visual});},
    endChannel:()=>{const state=r.units.get(caster.id);if(!state)return;if(state.pending?.type==='cast')state.pending=undefined;state.token++;state.channelUntil=0;state.recoveringCast=false;caster.castUntil=b.time;removeZones(b,z=>z.source===caster.id&&!!z.options.channel);setAction(b,caster,'idle');emit(b,{type:'status',source:caster.id,skill:skill.id,x:caster.x,y:caster.y,status:'channelEnded',...visual});},
    movementSpeed,attackInterval,attackRange:effectiveAttackRange,isRangedAttack:isRangedAttackType,canTarget,
    delay:(seconds,effect,cancelOnInterrupt=false)=>r.tasks.push({due:b.time+seconds,sequence:r.nextSequence++,effect:guard(effect),source:caster.id,token:r.units.get(caster.id)?.token,cancelOnInterrupt,stolenOrigin:initializing?token:undefined}),
    zone:options=>{
      const interval=Math.max(FIXED_STEP,options.interval),zone:Zone={id:`zone:${r.nextZone++}`,createdAt:b.time,source:caster.id,skill:skill.id,...visual,x:options.x??caster.x,y:options.y??caster.y,until:b.time+options.duration,next:b.time+interval,interval,tick:0,token:r.units.get(caster.id)?.token??0,options:{...options,effect:guard(options.effect)},stolenOrigin:initializing?token:undefined};
      if(options.immediate&&options.duration>0){
        for(const unit of live(b).filter(t=>Math.hypot(t.x-zone.x,t.y-zone.y)<=options.radius&&((options.targets??'enemies')==='all'||(options.targets==='allies'?t.side===caster.side:t.side!==caster.side))))zone.options.effect(unit,0);
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
    revive:(t,delay,hp)=>scheduleRevive(b,t,delay,hp),
    grantAbility:(id,points)=>grantAbility(b,caster,skill,id,points),
    stealAbility:(id,points,options)=>stealAbility(b,caster,id,points,options),
    castAbility:(id,points,t,valueOverrides)=>{
      const p=getSkillProgram(id),d=r.definitions.get(id);if(!p?.cast||!d||r.nestedCasts>=8)return false;
      const overrides=Object.entries(valueOverrides??{}),levels=d.balanceLevels as Record<string,SkillBalance>|undefined;
      const params=Object.fromEntries(overrides.map(([key,value])=>[key.trim().toUpperCase().replace(/:+$/,''),value]));
      const definition=overrides.length?{...d,values:[...d.values.filter(row=>!overrides.some(([key])=>row.split(':')[0].trim().toUpperCase()===key.toUpperCase())),...overrides.map(([key,value])=>`${key}: ${value}`)],...(levels?{balanceLevels:Object.fromEntries(Object.entries(levels).map(([level,row])=>[level,{...row,params:{...row.params,...params}}]))}:{})}:d;
      // An authored parent override is part of this cast's configuration, not
      // an ad-hoc test definition: retain every other edited native parameter.
      if(overrides.length&&levels)definition.balanceInputSignature=JSON.stringify([definition.values,definition.cooldowns,definition.mana]);
      r.nestedCasts++;try {emit(b,{type:'cast',source:caster.id,target:t.id,skill:id,x:caster.x,y:caster.y,toX:t.x,toY:t.y,granted:true,originSkillId:skill.id,...visual,points});p.cast(context(b,caster,t,{id,points,statParentId:skill.id,statRootId:stat.statRootId??skill.id,visualParentId:visual.visualSkill,visualParentPoints:visual.visualPoints,prdOrigin:`${chanceIdentity(caster,skill)}:granted:${id}`,...(token?{stolenOrigin:token}:{})} as RuntimeSkill,definition,depth+1,{originSkillId:skill.id,originPoints:skill.points,...visual},initializing));return true;}finally{r.nestedCasts--;}
    },
  };
}
function summon(b: BattleState, source: CombatUnit, skill: SkillStack, options: SummonOptions): CombatUnit[] {
  const r=runtime(b),result:CombatUnit[]=[],template=options.template??source;
  // Per-cast guard prevents malformed source data from allocating infinite units.
  const count=Math.max(0,Math.min(32,Math.floor(options.count)));
  for(let i=0;i<count;i++) {
    const angle=(i/count)*Math.PI*2,unit:CombatUnit={...structuredClone(template),side:source.side,
      id:`${source.id}:summon:${r.nextSummon++}`,name:options.name,
      x:clamp(source.x+Math.cos(angle)*1.2,BATTLE_BOUNDS.x-BODY_RADIUS),y:clamp(source.y+Math.sin(angle)*1.2,BATTLE_BOUNDS.y-BODY_RADIUS),
      hp:options.hp,maxHp:options.hp,mana:0,maxMana:0,attack:options.attack,armor:options.armor??0,
      attackInterval:options.interval??template.attackInterval,range:options.range??template.range,moveSpeed:options.speed??template.moveSpeed,
      ...(!options.illusion&&options.interval!==undefined?{attackPoint:Math.min(.4,options.interval*.3),attackBackswing:Math.max(0,options.interval-Math.min(.4,options.interval*.3))}:{}),
      skills:options.inheritsSkills?structuredClone(template.skills).filter(s=>!s||!options.inheritedMode||(options.inheritedMode==='passives'?getSkillProgram(s.id)?.passive:!!(getSkillProgram(s.id)?.passive||getSkillProgram(s.id)?.onAttack||getSkillProgram(s.id)?.attackModifier))):[],cooldowns:[],statuses:[],nextAttack:b.time+.5,castUntil:b.time,
      action:'spawn',actionStart:b.time,dead:false,summoned:true,owner:source.owner??source.id,damage:0,taken:0,healing:0,abilityStats:[],absorbed:0,
      damageTakenMultiplier:options.damageTaken??1,illusion:options.illusion??false,expiresAt:b.time+options.lifetime,
      sourceSkill:skill.id,statSummonRootId:(skill as RuntimeSkill).statRootId??skill.id,visualBody:options.visualBody,inheritedMode:options.inheritedMode,
      deferredHealth:undefined,damageHistory:[],permanentAttackGain:0,reviveAt:undefined,stolenAbilities:[],prdState:{},warpSequence:0,previousTransform:undefined,
    };
    // Illusion totals are already snapshots. Fresh attributes must not reapply
    // the summoner's accumulated derived deltas or share a mutable ledger.
    initializeAttributes(unit,options.illusion?{strength:Number(template.strength??0),agility:Number(template.agility??0),intelligence:Number(template.intelligence??0)}:{strength:0,agility:0,intelligence:0},(template.primaryAttribute??'strength') as Attribute);
    // A released illusion is a snapshot, not the owner's temporary stealing
    // slot. Its copied counters and modifiers belong to its own lifetime.
    for(const inherited of unit.skills){if(!inherited)continue;const s=inherited as RuntimeSkill;delete s.stolenOrigin;delete s.grantOwners;}
    const native=UNIT_CONFIG[String(unit.sourceUnitType??'')];if(native)for(const key of ['turnRate','attackPoint','attackBackswing','projectileSpeed','attackRangeBuffer'])if(Number.isFinite(native[key]))unit[key]=native[key];
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
  }
  return result;
}
function attackPower(u: CombatUnit) { return Math.max(0,(u.attack*Math.max(0,1+statusValue(u,'attackPct'))*(1-Math.min(1,Math.max(0,statusValue(u,'baseAttackDamageReduction'))))+statusValue(u,'attackBonus'))*Math.max(0,1+statusValue(u,'attackDamagePct'))); }
function attackInterval(u: CombatUnit, target?:CombatUnit): number {
  const base=effects(u).find(s=>s.kind==='baseAttackTime')?.value??u.attackInterval;
  const focus=effects(u).find(s=>s.kind==='focusFire'&&s.data?.targetId===target?.id)?.value??0;
  const curse=target?(!u.summoned||u.illusion?statusValue(target,'avernusCurse'):0)+statusValue(target,'targetAttackSpeed'):0;
  const total=(100+Number((u.attributes as AttributeState|undefined)?.attackSpeed??0)+statusValue(u,'attackSpeed')+focus+curse)*Math.max(0,1+statusValue(u,'attackSpeedPct'));
  const limits=BATTLE_CONFIG as typeof BATTLE_CONFIG&{minimumAttackSpeed?:number;maximumAttackSpeed?:number;minimumAttackInterval?:number};
  const floor=limits.minimumAttackSpeed??20,ceiling=effects(u).find(s=>s.kind==='maximumAttackSpeed')?.value??limits.maximumAttackSpeed??700;
  const speed=effects(u).find(s=>s.kind==='absoluteAttackSpeed')?.value??Math.max(floor,Math.min(ceiling,total));
  return Math.max(limits.minimumAttackInterval??.12,base/(Math.max(1,speed)/100))*Math.max(.01,1+statusValue(u,'attackTimePct'));
}
function attackWindup(u:CombatUnit,interval:number):number {return Math.max(0,Number(effects(u).find(s=>s.kind==='attackPointOverride')?.value??u.attackPoint??Math.min(.4,u.attackInterval*.3)))*interval/Math.max(.01,u.attackInterval);}
function attackBackswing(u:CombatUnit,interval:number):number {return Math.max(0,Number(u.attackBackswing??Math.max(0,u.attackInterval-Number(u.attackPoint??Math.min(.4,u.attackInterval*.3)))))*interval/Math.max(.01,u.attackInterval);}
export function effectiveAttackRange(u:CombatUnit){return (effects(u).find(s=>s.kind==='attackRangeOverride')?.value??u.range)+statusValue(u,'range');}
const attackRange=effectiveAttackRange;
export function isRangedAttackType(u:CombatUnit):boolean{const override=effects(u).find(s=>s.kind==='attackTypeOverride')?.value;return override===2||(override!==1&&u.range>2);}
function newAttackRecord(b:BattleState,source:CombatUnit,target:CombatUnit,abilityId:string,options:InstantAttackOptions):AttackRecord {
  return{id:`attack:${runtime(b).nextSequence++}`,source:source.id,target:target.id,abilityId,ranged:options.rangedAttackPoint??isRangedAttackType(source),data:{}};
}
function prepareAttackOptions(b:BattleState,source:CombatUnit,target:CombatUnit,depth:number,abilityId:string,options:InstantAttackOptions):InstantAttackOptions{
  if(options.preparedAttack)return options;
  options={...options,attackRecord:options.attackRecord??newAttackRecord(b,source,target,abilityId,options)};
  for(const skill of source.skills){
    if(!skill)continue;const program=getSkillProgram(skill.id),definition=runtime(b).definitions.get(skill.id);
    if(!program?.prepareAttack||!definition||(program.passive&&hasStatus(source,'break')))continue;
    const prepared=program.prepareAttack(context(b,source,target,skill,definition,depth,{attackSourceSkill:abilityId,attackRecord:options.attackRecord,attackIsRanged:options.attackRecord?.ranged}));if(!prepared)continue;
    options={...options,trueStrike:options.trueStrike||prepared.trueStrike,noCleave:options.noCleave||prepared.noCleave,ignoreDamageBlock:options.ignoreDamageBlock||prepared.ignoreDamageBlock,criticalMultiplier:Math.max(options.criticalMultiplier??1,prepared.criticalMultiplier??1),bonusDamage:(options.bonusDamage??0)+(prepared.bonusDamage??0)};
  }
  return{...options,preparedAttack:true};
}
function snapshotCritical(b:BattleState,source:CombatUnit,target:CombatUnit,record:AttackRecord,options:InstantAttackOptions,depth:number,triggerModifiers=true):void{
  const choices:CriticalRoll[]=[];
  const variable=effectiveStatusEffects(source,'variableCrit').filter(status=>!(status.data?.excludeBuildingsAndWards&&(target.ward||target.building))).sort((a,c)=>(c.value??0)-(a.value??0))[0];
  if(variable){const creep=target.summoned&&!target.illusion&&!target.consideredHero?Number(variable.data?.creepMultiplier??1):1,max=Number(variable.data?.max??1)*creep,min=Number(variable.data?.min??variable.data?.max??1)*creep,candidate:CriticalRoll={key:variable.skill??'variableCrit',multiplier:max,lifesteal:Number(variable.data?.lifesteal??0),roll:()=>{
    const key=typeof variable.data?.prdKey==='string'?variable.data.prdKey:undefined;
    const passed=key?chanceRoll(b,source,{id:variable.skill??'variableCrit',points:variable.points??3,prdOrigin:`provider:${variable.data?.uniqueGroup??variable.skill}` } as RuntimeSkill,variable.value??0,key):nextRandom(b)<(variable.value??0);
    if(passed)candidate.multiplier=min+nextRandom(b)*(max-min);return passed;
  }};choices.push(candidate);}
  for(const chance of effectiveStatusEffects(source,'critChance')){const paired=effectiveStatusEffects(source,'critMultiplier').find(s=>s.skill===chance.skill&&s.source===chance.source);choices.push({key:chance.skill??'critical',multiplier:Math.max(1,paired?.value??1),roll:()=>nextRandom(b)<(chance.value??0)});}
  if(triggerModifiers)for(const skill of source.skills){
    if(!skill)continue;const program=getSkillProgram(skill.id),definition=runtime(b).definitions.get(skill.id);if(!program||!definition||(program.passive&&hasStatus(source,'break')))continue;
    const c=context(b,source,target,skill,definition,depth,{attackRecord:record,attackSourceSkill:record.abilityId,attackIsRanged:record.ranged});
    const profile=program.criticalAttack?.(c);
    if(profile){const max=profile.maxMultiplier??profile.multiplier,min=profile.minMultiplier??max,candidate:CriticalRoll={key:skill.id,multiplier:max,lifesteal:profile.lifesteal??0,roll:()=>{const passed=profile.prdKey?chanceRoll(b,source,skill,profile.chance,profile.prdKey):nextRandom(b)<profile.chance;if(passed)candidate.multiplier=min===max?min:min+nextRandom(b)*(max-min);return passed;}};choices.push(candidate);}
    else if(skill.id==='custom_phantom_assassin_coup_de_grace'&&program.attackModifier){const multiplier=program.attackModifier({...c,caster:{...c.caster},random:()=>0,chance:()=>true}).multiplier??1;choices.push({key:skill.id,multiplier,roll:()=>(program.attackModifier!(c).multiplier??1)>1});}
    if(skill.id==='custom_dawnbreaker_luminosity'&&program.attackModifier){const modifier=program.attackModifier({...c,caster:structuredClone(c.caster),random:()=>0,chance:()=>true});if((modifier.multiplier??1)>1)choices.push({key:skill.id,multiplier:modifier.multiplier!,roll:()=>true});}
  }
  if(statusValue(target,'targetCritMultiplier')>1)choices.push({key:'targetCritical',multiplier:statusValue(target,'targetCritMultiplier'),roll:()=>true});
  if((options.criticalMultiplier??1)>1)choices.push({key:'abilityCritical',multiplier:options.criticalMultiplier!,roll:()=>true});
  record.critical=selectCritical(choices);
}
function dispatchAttackPoint(b:BattleState,source:CombatUnit,target:CombatUnit,depth=0,abilityId=BASIC_ATTACK_ID,suppressAllies=false,options:InstantAttackOptions={},triggerModifiers=true):AttackRecord{
  const record=options.attackRecord??newAttackRecord(b,source,target,abilityId,options);
  if(triggerModifiers)emit(b,{type:'status',source:source.id,target:target.id,skill:abilityId,x:source.x,y:source.y,status:'attackPoint'});
  const metadata={attackRecord:record,attackSourceSkill:abilityId,attackIsRanged:record.ranged};
  if(triggerModifiers)runHooks(b,source,'onAttackPoint',target,0,undefined,depth+1,abilityId,source.id,metadata);
  if(triggerModifiers&&!suppressAllies)for(const ally of live(b).filter(unit=>unit.side===source.side&&unit.id!==source.id))runHooks(b,ally,'onAllyAttackPoint',target,0,undefined,depth+1,abilityId,source.id,metadata);
  snapshotCritical(b,source,target,record,options,depth,triggerModifiers);return record;
}
function performAttack(b: BattleState, source: CombatUnit, target: CombatUnit, multiplier=1, triggerModifiers=true, depth=0,baseDamage?:number,released=false,visual:VisualOrigin={},options:InstantAttackOptions={}): AttackResolution {
  if((source.dead&&!released)||target.dead||!canTarget(target,!options.allowInvisibleTarget)||depth>8)return {landed:false,damage:0};
  const abilityId=visual.attribution?.abilityId??BASIC_ATTACK_ID;
  if(triggerModifiers)options=prepareAttackOptions(b,source,target,depth,abilityId,options);
  const attackRecord=options.attackPointEmitted&&options.attackRecord?options.attackRecord:dispatchAttackPoint(b,source,target,depth,abilityId,!!options.suppressAllyAttackPoint,options,triggerModifiers);
  const marksmanship=effects(source).find(s=>s.kind==='marksmanship');
  const marksmanshipProc=!!marksmanship&&!hasStatus(source,'break')&&nextRandom(b)<(marksmanship.value??0);
  const fieldEvasion=effects(target).filter(s=>s.kind==='magneticField'&&Math.hypot(source.x-Number(s.data?.x??target.x),source.y-Number(s.data?.y??target.y))>Number(s.data?.radius??0)).reduce((n,s)=>Math.max(n,s.value??0),0);
  const piercing=effects(source).find(s=>s.kind==='piercingAttack'),pierced=!!piercing&&nextRandom(b)<(piercing.value??0);
  const evasion=independentFraction([...effects(target).filter(s=>s.kind==='evasion').map(s=>s.value??0),fieldEvasion]);
  const miss=options.trueStrike||marksmanshipProc||pierced||hasStatus(source,'trueStrike')||hasStatus(target,'targetTrueStrike')?0:1-(1-Math.min(1,statusValue(source,'blind')))*(1-evasion);
  if(miss>0&&nextRandom(b)<miss){emit(b,{type:'hit',source:source.id,target:target.id,x:target.x,y:target.y,amount:0,outcome:'miss'});return {landed:false,damage:0};}
  if(triggerModifiers)for(const skill of source.skills){
    if(!skill)continue;const program=getSkillProgram(skill.id),definition=runtime(b).definitions.get(skill.id);
    if(program?.beforeAttackDamage&&definition&&!(program.passive&&hasStatus(source,'break')))program.beforeAttackDamage(context(b,source,target,skill,definition,depth,{attackSourceSkill:abilityId,attackIsRanged:attackRecord.ranged,attackRecord}));
  }
  const mainMultiplier=Math.max(0,1+statusValue(source,'attackPct'))*(1-Math.min(1,Math.max(0,statusValue(source,'baseAttackDamageReduction'))))*Math.max(0,1+statusValue(source,'attackDamagePct'));
  const minimum=Number(source.attackMin),maximum=Number(source.attackMax),variance=baseDamage===undefined&&Number.isFinite(minimum)&&Number.isFinite(maximum)&&maximum>minimum?(minimum+nextRandom(b)*(maximum-minimum)-(minimum+maximum)/2)*mainMultiplier:0;
  const baseline=baseDamage??Math.max(0,attackPower(source)+variance);
  let damage=baseline+(marksmanshipProc?Number(marksmanship!.data?.bonus??0):0),postCriticalBonus=0,type:DamageType=hasStatus(source,'attackMagical')?'magical':'physical';
  const criticals:CriticalRoll[]=[];
  const focus=effects(source).find(s=>s.kind==='focusFire'&&s.data?.targetId===target.id);if(focus)damage*=Number(focus.data?.damageMultiplier??1);
  if(triggerModifiers)for(const skill of source.skills){
    if(!skill)continue;const p=getSkillProgram(skill.id),d=runtime(b).definitions.get(skill.id);
    if(p?.attackModifier&&d&&!(p.passive&&hasStatus(source,'break'))){
      const c=context(b,source,target,skill,d,depth,{attackSourceSkill:abilityId,attackRecord,attackIsRanged:attackRecord.ranged});
      if(skill.id==='custom_phantom_assassin_coup_de_grace'){/* Its legacy candidate was already sampled at release. */}else{const mod=p.attackModifier(c);damage+=mod.bonus??0;postCriticalBonus+=mod.postCriticalBonus??0;type=mod.type??type;
        if(baseDamage===undefined&&mod.baseMultiplier!==undefined)damage+=(source.attack*mainMultiplier+variance)*(mod.baseMultiplier-1);
        if(skill.id==='custom_dawnbreaker_luminosity')criticals.push({key:skill.id,multiplier:mod.multiplier??1,roll:()=>true});else damage*=mod.multiplier??1;
      }
    }
  }
  if(attackRecord.critical)criticals.push({...attackRecord.critical,key:attackRecord.critical.key??'snapshotCritical',roll:()=>true});
  const critical=selectCritical(criticals);damage=(hasStatus(source,'bladeFury')&&!options.ignoreBladeFuryPenalty&&!target.ward&&!target.building?0:(damage*multiplier+(options.bonusDamage??0))*critical.multiplier)+postCriticalBonus;
  attackRecord.critical=critical;const critLifesteal=critical.lifesteal;
  if(marksmanshipProc)emit(b,{type:'status',source:source.id,target:target.id,skill:marksmanship?.skill,x:target.x,y:target.y,status:'marksmanshipProc'});
  // Native attack conversion retains attack contacts and accounting while
  // changing this damage instance's amplification and lifesteal rules.
  const convertedAttack=hasStatus(source,'attackMagical');if(convertedAttack)type='magical';
  const lifestealProviders=structuredClone(convertedAttack?effectiveStatusEffects(source,'spellLifesteal'):[...effectiveStatusEffects(source,'lifesteal'),...(triggerModifiers?effectiveStatusEffects(target,'openWounds'):[]),...(critLifesteal>0?[{kind:'lifesteal',until:b.time+1,value:critLifesteal,skill:critical.key}]:[])]);
  const attackVisual={...visual,category:'attack' as const,attribution:attributionFor(b,source,visual.attribution?.abilityId,visual),flags:{...visual.flags,critical:critical.multiplier>1,ignoreDamageBlock:options.ignoreDamageBlock,...(convertedAttack?{convertedAttack:true}:{})},lifestealProviders};
  const attackSkill=visual.attribution?.abilityId;
  const actual=applyDamage(b,source,target,damage,type,attackSkill===BASIC_ATTACK_ID?undefined:attackSkill,false,depth,marksmanshipProc,undefined,attackVisual);
  if(actual>0&&triggerModifiers&&!options.noCleave)for(const cleave of effects(source).filter(s=>s.kind==='cleave')){
    const dx=target.x-source.x,dy=target.y-source.y,length=Math.hypot(dx,dy)||1;
    for(const other of live(b).filter(u=>u.side!==source.side&&u.id!==target.id)){
      let inside=false;
      if(cleave.data?.distance!==undefined){const reach=Number(cleave.data.distance),along=((other.x-source.x)*dx+(other.y-source.y)*dy)/length,across=Math.abs((other.x-source.x)*dy-(other.y-source.y)*dx)/length;inside=along>=0&&along<=reach&&across<=Number(cleave.data.startWidth)+(Number(cleave.data.endWidth)-Number(cleave.data.startWidth))*along/Math.max(.001,reach);}
      else inside=distance(other,target)<=Number(cleave.data?.radius??3.5);
      if(inside)applyDamage(b,source,other,damage*(cleave.value??0),'physical',cleave.skill,true,depth+1,false,undefined,{category:'spell',flags:{noAmplification:true,noSpellLifesteal:true}});
    }
  }
  if(pierced)applyDamage(b,source,target,Number(piercing?.data?.damage??0),'magical',piercing?.skill,false,depth+1);
  if(triggerModifiers&&target.side!==source.side&&!target.ward&&!target.building&&statusValue(source,'maxHpAttackLifesteal')>0){
    const amount=target.maxHp*statusValue(source,'maxHpAttackLifesteal'),provider=effectiveStatusEffects(source,'maxHpAttackLifesteal')[0];
    healFromLifesteal(b,source,amount,[{...provider,kind:'lifesteal',value:1,until:b.time+1,skill:provider?.skill??'bloodseeker_bloodrage'}]);
    applyDamage(b,source,target,amount,'pure',provider?.skill??'bloodseeker_bloodrage',false,depth+1,false,undefined,{category:'attack',flags:{noAmplification:true,noSpellLifesteal:true}});
  }
  if(actual>0)for(const s of effects(source).filter(s=>s.kind==='ownerLifesteal')){const owner=b.units.find(u=>u.id===s.data?.ownerId);if(owner)heal(b,source,owner,actual*(s.value??0),s.skill);}
  if(actual>0&&triggerModifiers)for(const tag of effects(target).filter(s=>s.kind==='tagTeam')){const owner=b.units.find(u=>u.id===tag.source);if(owner&&owner.side===source.side){applyDamage(b,owner,target,tag.value??0,'physical',tag.skill,false,depth+1);addStatus(b,owner,target,tag.skill??'tusk_tag_team','slow',Number(tag.data?.slowDuration??.5),Number(tag.data?.slow??.75),{harmful:true});if(Number(tag.data?.stunDuration??0)>0)addStatus(b,owner,target,tag.skill??'tusk_tag_team','stun',Number(tag.data!.stunDuration),0,{harmful:true,dispel:'strong'});}}
  if(triggerModifiers){const snapshot={baseAttackDamage:baseline*multiplier,attackDamage:damage,attackSourceSkill:abilityId,attackRecord,attackCritical:critical.multiplier>1,criticalSourceKey:critical.key};source.coupCritical=critical.key==='custom_phantom_assassin_coup_de_grace';runHooks(b,source,'onAttack',target,actual,type,depth+1,undefined,undefined,snapshot);runHooks(b,target,'onAttacked',source,actual,type,depth+1,undefined,source.id,snapshot);for(const ally of live(b).filter(u=>u.side===source.side&&u.id!==source.id))runHooks(b,ally,'onAllyAttack',target,actual,type,depth+1,undefined,source.id,snapshot);}
  if(triggerModifiers&&!target.dead){const guardian=effects(target).find(s=>s.kind==='guardianRetaliation');if(guardian&&nextRandom(b)<(guardian.value??0)){const id='omniknight_hammer_of_purity',p=getSkillProgram(id),d=runtime(b).definitions.get(id);if(p?.cast&&d){emit(b,{type:'cast',source:target.id,target:source.id,skill:id,x:target.x,y:target.y,toX:source.x,toY:source.y,granted:true});p.cast(context(b,target,source,{id,points:4},d,depth+1));}}}
  if(actual>0&&triggerModifiers)for(const slow of effects(source).filter(s=>s.kind==='onHitSlow')){addStatus(b,source,target,slow.skill??'summon_slow','slow',Number(slow.data?.duration??3),slow.value??0,{harmful:true});if(slow.data?.attackSpeedPct)addStatus(b,source,target,slow.skill??'summon_slow','attackSpeedPct',Number(slow.data.duration??3),-Number(slow.data.attackSpeedPct),{harmful:true});}
  if(actual>0&&triggerModifiers)for(const wound of effects(target).filter(s=>s.kind==='openWounds')){if(!source.summoned)applyDamage(b,source,target,target.maxHp*Number(wound.data?.maxHpPct??0),'physical',wound.skill,false,depth+1);if(wound.data&&!wound.data.spread&&target.taken-Number(wound.data.taken??0)>=Number(wound.data.threshold??500)){wound.data.spread=true;const owner=b.units.find(u=>u.id===wound.source),choices=live(b).filter(u=>u.side===target.side&&u.id!==target.id&&distance(u,target)<=Number(wound.data!.radius??7)&&!effects(u).some(s=>s.kind==='openWounds'&&s.source===wound.source)),next=choices[Math.floor(nextRandom(b)*choices.length)],p=getSkillProgram('life_stealer_open_wounds'),d=runtime(b).definitions.get('life_stealer_open_wounds');if(owner&&next&&p?.cast&&d)p.cast(context(b,owner,next,{id:'life_stealer_open_wounds',points:1},d,depth+1));}}
  const grave=effects(source).find(s=>s.kind==='gravesInvis');if(grave){source.statuses=source.statuses.filter(s=>!(s.skill===grave.skill&&['invisible','undetectable','gravesInvis','freePathing','haste'].includes(s.kind)));addStatus(b,source,source,grave.skill??'visage_silent_as_the_grave','attackPct',Number(grave.data?.bonusDuration??4),grave.value??.25);}
  const realm=effects(source).find(s=>s.kind==='shadowRealm');if(realm&&!realm.data?.persistOnAttack)source.statuses=source.statuses.filter(s=>!(s.skill===realm.skill&&(s.kind==='shadowRealm'||s.kind==='range')));
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
  const berserk=tranceTarget(b,u);if(berserk&&!spellTarget)return berserk;
  const locked=effects(u).find(s=>s.kind==='duel'||s.kind==='attackTarget'||s.kind==='focusFire');
  if(locked?.data?.targetId){const target=b.units.find(t=>t.id===locked.data!.targetId&&canTarget(t));if(target)return target;if(locked.kind==='duel')return undefined;}
  // Official FAQ: heroes do not attack summons. Hero illusions retain their
  // hero target category; explicit taunts/forced attacks above are preserved.
  return live(b).filter(t=>t.side!==u.side&&canTarget(t)&&(spellTarget||(u.summoned&&!u.illusion)||!t.summoned||t.illusion)).sort((a,c)=>(hasStatus(u,'berserk')?Number(!!a.summoned)-Number(!!c.summoned):0)||distance(u,a)-distance(u,c)||a.id.localeCompare(c.id))[0];
}
function selectTarget(b:BattleState,u:CombatUnit,p:SkillProgram):CombatUnit|undefined {
  if(p.target==='self')return u;
  if(p.target==='any')return live(b).filter(t=>t.id!==u.id&&(t.side===u.side||canTarget(t))).sort((a,c)=>distance(u,a)-distance(u,c)||a.id.localeCompare(c.id))[0];
  if(p.target==='ally')return live(b).filter(t=>t.side===u.side).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp||distance(u,a)-distance(u,c)||a.id.localeCompare(c.id))[0];
  return nearestEnemy(b,u,true);
}
function updateStatuses(b:BattleState,u:CombatUnit) {
  for(const s of [...effects(u)]) {
    if(u.dead)break;
    const source=b.units.find(t=>t.id===s.source)??u;
    if(s.kind==='arcaneCurse'){const silenced=hasStatus(u,'silence');if(silenced)s.until+=FIXED_STEP;const multiplier=silenced?Number(s.data?.multiplier??1.5):1;s.nextTick??=b.time+1;if(s.nextTick<=b.time+1e-8){applyDamage(b,source,u,(s.value??0)*multiplier,'magical',s.skill,false,0,false,s.stolenDamageOrigin,{attribution:s.attribution,flags:{damageOverTime:true}});s.nextTick+=1;}addStatus(b,source,u,s.skill??'silencer_curse_of_the_silent','slow',.1,Number(s.data?.slow??.25)*multiplier,{harmful:true});}
    if(s.kind==='rupture'){const dx=u.x-Number(s.data?.lastX??u.x),dy=u.y-Number(s.data?.lastY??u.y),moved=Math.hypot(dx,dy);if(s.data){s.data.lastX=u.x;s.data.lastY=u.y;}if(moved>0&&moved<=Number(s.data?.damageCapDistance??2))applyDamage(b,source,u,moved*100*(s.value??0),'pure',s.skill,true,0,false,s.stolenDamageOrigin,{attribution:s.attribution,flags:{damageOverTime:true}});}
    if(s.interval&&s.nextTick!==undefined&&s.nextTick<=b.time+1e-8&&s.nextTick<=s.until+1e-8){
      if(s.kind==='dot')applyDamage(b,source,u,(s.value??0)*s.interval,s.damageType??'magical',s.skill,!!s.piercesImmunity,0,false,s.stolenDamageOrigin,{points:s.points,visualSkill:s.visualSkill,visualPoints:s.visualPoints,attribution:s.attribution,flags:{damageOverTime:true}});
      s.nextTick+=s.interval;
    }
    if(s.until<=b.time+1e-8){
      if(s.kind==='dot'&&s.interval&&s.nextTick!==undefined){const remainder=s.until-(s.nextTick-s.interval);if(remainder>1e-8&&remainder<s.interval-1e-8)applyDamage(b,source,u,(s.value??0)*remainder,s.damageType??'magical',s.skill,!!s.piercesImmunity,0,false,s.stolenDamageOrigin,{points:s.points,visualSkill:s.visualSkill,visualPoints:s.visualPoints,attribution:s.attribution,flags:{damageOverTime:true}});}
      if(!u.statuses.includes(s))continue;
      u.statuses=u.statuses.filter(x=>x!==s);if(s.kind==='shield'&&(s.remaining??0)>0)burstShield(b,u,s);if(s.kind==='falsePromise')settleDeferredHealth(b,u,s);if(s.kind==='ghostshipRum')beginRumPayback(u,s);notifyStatusRemoved(b,u,s,'expire');
    }
  }
  refreshAttributes(u);
  if(u.dead)return;
  repayRum(b,u);
  for(const s of effectiveStatusEffects(u,'regen'))heal(b,b.units.find(t=>t.id===s.source)??u,u,(s.value??0)*FIXED_STEP,s.skill,false,0,{attribution:s.attribution,healingKind:'regen'});
  changeMana(b,u,(3+statusValue(u,'manaRegen'))*FIXED_STEP);
  if(Number(u.expiresAt??Infinity)<=b.time)kill(b,u);
}
function updateTasks(b:BattleState) {
  const r=runtime(b);
  r.tasks.sort((a,c)=>a.due-c.due||a.sequence-c.sequence);
  const due=r.tasks.filter(t=>t.due<=b.time+1e-8);r.tasks=r.tasks.filter(t=>t.due>b.time+1e-8);
  for(const task of due){if(task.cancelOnInterrupt&&task.source){const u=b.units.find(u=>u.id===task.source);if(!u||u.dead||r.units.get(task.source)?.token!==task.token)continue;}task.effect();}
}
function updateProjectiles(b:BattleState) {
  const r=runtime(b),projectiles=r.projectiles;r.projectiles=[];
  for(const p of projectiles){
    if(p.line){const l=p.line,source=b.units.find(t=>t.id===p.source),travel=Math.min(l.remaining,p.speed*FIXED_STEP),dx=Math.cos(l.angle),dy=Math.sin(l.angle);if(p.attackProjectile&&source&&arenaBlocksAttack(b,source,p,{x:p.x+dx*travel,y:p.y+dy*travel})){emit(b,{type:'hit',source:p.source,skill:p.skill,x:p.x,y:p.y,amount:0,outcome:'arenaBlocked'});l.onEnd?.();continue;}const candidates=live(b).filter(t=>t.id!==p.source&&!l.hit.includes(t.id)&&canTarget(t,false)&&(l.targets==='all'||t.side!==source?.side)).map(t=>({t,along:(t.x-p.x)*dx+(t.y-p.y)*dy,across:Math.abs((t.x-p.x)*dy-(t.y-p.y)*dx)})).filter(t=>t.along>=-BODY_RADIUS&&t.along<=travel+BODY_RADIUS&&t.across<=l.width+((l.endWidth??l.width)-l.width)*Math.max(0,Math.min(1,(l.distance-l.remaining+t.along)/Math.max(1e-8,l.distance)))+BODY_RADIUS).sort((a,b)=>a.along-b.along||a.t.id.localeCompare(b.t.id));for(const item of candidates){l.hit.push(item.t.id);p.effect(item.t);if(l.stopOnHit){l.remaining=0;break;}}p.x+=dx*travel;p.y+=dy*travel;l.remaining-=travel;l.onMove?.({x:p.x,y:p.y});if(l.remaining>1e-8)r.projectiles.push(p);else l.onEnd?.();continue;}
    const target=b.units.find(u=>u.id===p.target);if(!target||target.dead)continue;
    if(p.disjointOnInvisibility&&hasStatus(target,'invisible')&&!hasStatus(target,'revealed')){emit(b,{type:'status',source:target.id,target:p.source,skill:p.skill,x:p.x,y:p.y,status:'projectileDisjoint',projectileId:p.id});continue;}
    const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),travel=p.speed*FIXED_STEP;
    const source=b.units.find(u=>u.id===p.source);if((p.skill==='basic_attack'||p.attackProjectile)&&source&&arenaBlocksAttack(b,source,p,{x:p.x+dx/(d||1)*Math.min(travel,d),y:p.y+dy/(d||1)*Math.min(travel,d)})){emit(b,{type:'hit',source:p.source,target:p.target,x:p.x,y:p.y,amount:0,outcome:'arenaBlocked'});continue;}
    if(d<=travel+BODY_RADIUS){
      p.onMove?.({x:target.x,y:target.y});
      const block=getSkillProgram(p.skill)?.spellBlockTiming==='impact'?effects(target).find(s=>s.kind==='spellBlock'):undefined;
      if(block){target.statuses=target.statuses.filter(s=>s!==block);emit(b,{type:'status',source:target.id,target:p.source,skill:p.skill,x:target.x,y:target.y,status:'spellBlocked'});}else p.effect(target);
      continue;
    }
    p.x+=dx/d*travel;p.y+=dy/d*travel;p.onMove?.({x:p.x,y:p.y});r.projectiles.push(p);
  }
  b.projectiles=r.projectiles.map(p=>({id:p.id,createdAt:p.createdAt,source:p.source,target:p.target,skill:p.skill,points:p.points,visualSkill:p.visualSkill,visualPoints:p.visualPoints,x:p.x,y:p.y,angle:p.line?.angle}));
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
    if(isDisabled(u)||hasStatus(u,'hex')||hasStatus(u,'disarm'))return;
    const range=attackRange(u);if(!canTarget(target)||distance(u,target)>range+BODY_RADIUS+Number(u.attackRangeBuffer??BATTLE_CONFIG.attackRangeBuffer)){u.nextAttack=Math.min(u.nextAttack,b.time);return;}
    const prepared=prepareAttackOptions(b,u,target,0,BASIC_ATTACK_ID,{rangedAttackPoint:isRangedAttackType(u)}),record=dispatchAttackPoint(b,u,target,0,BASIC_ATTACK_ID,false,prepared),options={...prepared,attackPointEmitted:true,attackRecord:record};
    if(record.ranged){
      r.projectiles.push({id:`projectile:${r.nextProjectile++}`,createdAt:b.time,source:u.id,target:target.id,skill:'basic_attack',x:u.x,y:u.y,speed:Number(u.projectileSpeed??BATTLE_CONFIG.basicAttackProjectileSpeed)+statusValue(u,'projectileSpeedBonus'),effect:t=>performAttack(b,u,t,1,true,0,undefined,true,{}, options)});
    }else performAttack(b,u,target,1,true,0,undefined,true,{},options);
    return;
  }
  if(cannotCast(u))return;
  const skill=u.skills[pending.slot!]!;if(!skill)return;const definition=r.definitions.get(skill.id),p=getSkillProgram(skill.id);if(!definition||!p?.cast||!tranceAllowsAbility(b,u,skill.id)||((hasStatus(u,'root')||hasStatus(u,'soulbind'))&&referenceRootDisables(skill.id)))return;
  if(target.side!==u.side&&isUnitTargetSkill(definition)&&(!canTarget(target)||distance(u,target)>(pending.range??Infinity)+BODY_RADIUS+(pending.rangeBuffer??2.5))){if(!virtualPending)u.castUntil=b.time;return;}
  const c=context(b,u,target,skill,definition,0,{castPosition:pending.castPosition}),balance=skillBalance(definition,skill.points),native=definition.balanceDomain==='native',cost=native&&p.manaCost?p.manaCost(c):balance?.mana??(p.manaCost?p.manaCost(c):arrayValue(definition.mana,skill.points));
  if(u.mana<cost)return;u.mana-=cost;
  if(p.attackCastPointFactor!==undefined)u.nextAttack=Math.max(u.nextAttack,pending.attackReadyAt??u.actionStart+(pending.attackPeriod??attackInterval(u,target)));
  const nextReduction=Math.min(1,Math.max(0,statusValue(u,'nextCastCooldownReduction')));
  const cooldown=Math.max(p.allowZeroCooldown?0:.2,(native&&p.cooldown?p.cooldown(c):balance?.cooldown??(p.cooldown?p.cooldown(c):arrayValue(definition.cooldowns,skill.points,10)))*(1-Math.min(.9,Math.max(0,statusValue(u,'cooldownReduction'))))*(1-nextReduction));
  if(p.cooldownStart==='effectEnd'){state.cooldownLocks??={};state.cooldownLocks[chanceIdentity(u,skill)]={slot:pending.slot!,skill,duration:cooldown,active:true};u.cooldowns[pending.slot!]=b.time;}else u.cooldowns[pending.slot!]=b.time+cooldown;
  if(nextReduction>0)u.statuses=u.statuses.filter(s=>s.kind!=='nextCastCooldownReduction');
  if(target.side!==u.side&&isUnitTargetSkill(definition)&&p.spellBlockTiming!=='impact'&&consumeSpellBlock(b,u,target,skill.id)){finishEffectCooldown(b,u,skill);if(!virtualPending){u.castUntil=pending.recoverUntil;state.recoveringCast=true;}return;}
  const channel=typeof p.channel==='function'?p.channel(c):p.channel??0;
  if(!virtualPending){if(channel>0){state.channelUntil=b.time+channel;u.castUntil=state.channelUntil;state.recoveringCast=false;state.recoveringAttackCast=false;setAction(b,u,'channel',true);}else {u.castUntil=pending.recoverUntil;state.recoveringCast=true;state.recoveringAttackCast=p.attackCastPointFactor!==undefined;}}
  emit(b,{type:'cast',source:u.id,target:target.id,skill:skill.id,x:u.x,y:u.y,toX:pending.castPosition?.x??target.x,toY:pending.castPosition?.y??target.y,duration:channel||balance?.backswing||p.backswing||.2});
  const existingBinding=effects(target).find(s=>s.kind==='soulbind'),boundIds=String(existingBinding?.data?.group??existingBinding?.data?.partnerId??'').split(',');
  if(p.procsOnCast!==false)for(const curse of effects(u).filter(s=>s.kind==='arcaneCurse'))curse.until+=Number(curse.data?.penaltyDuration??2);
  p.cast(c);if(skill.id==='troll_warlord_battle_trance')tranceTarget(b,u);
  if(p.procsOnCast!==false){runHooks(b,u,'onCast',target,0,undefined,0,skill.id);for(const ally of live(b).filter(t=>t.side===u.side&&t.id!==u.id))runHooks(b,ally,'onAllyCast',u,0,undefined,0,skill.id);}
  if(skill.id!=='custom_grimstroke_soul_bind'&&isUnitTargetSkill(definition))for(const partner of b.units.filter(t=>boundIds.includes(t.id)&&t.id!==target.id&&!t.dead)){
    emit(b,{type:'cast',source:u.id,target:partner.id,skill:skill.id,x:u.x,y:u.y,toX:partner.x,toY:partner.y,duplicatedBy:'custom_grimstroke_soul_bind'});const duplicate=context(b,u,partner,skill,definition);if(channel>0)duplicate.endChannel=()=>{};p.cast(duplicate);
  }
}
function startCast(b:BattleState,u:CombatUnit,duringChannel=false):boolean {
  if(cannotCast(u)||u.inheritedMode)return false;
  const r=runtime(b),state=r.units.get(u.id)!;
  for(let slot=0;slot<u.skills.length;slot++) {
    const skill=u.skills[slot];if(!skill||(u.cooldowns[slot]??0)>b.time+1e-8||state.cooldownLocks?.[chanceIdentity(u,skill)]?.active)continue;
    const d=r.definitions.get(skill.id),p=getSkillProgram(skill.id);if(!d||!p?.cast||p.passive||(duringChannel&&!p.canCastWhileChanneling)||!tranceAllowsAbility(b,u,skill.id)||((hasStatus(u,'root')||hasStatus(u,'soulbind'))&&referenceRootDisables(skill.id)))continue;
    if(p.attackCastPointFactor!==undefined&&(u.nextAttack>b.time+1e-8||hasStatus(u,'disarm')))continue;
    let target=selectTarget(b,u,p)??(p.targetSelector?u:undefined);if(!target)continue;
    let c=context(b,u,target,skill,d);const balance=skillBalance(d,skill.points),native=d.balanceDomain==='native',baseRange=((native||p.dynamicRange)&&typeof p.range==='function'?p.range(c):balance?.range??(typeof p.range==='function'?p.range(c):p.range??7)),range=p.ignoreCastRangeBonuses?baseRange:baseRange*(1+statusValue(u,'castRangePct'))+statusValue(u,'castRange');
    if(p.targetSelector){const candidates=live(b).filter(t=>(p.target==='ally'?t.side===u.side:p.target==='self'?t.id===u.id:p.target==='any'?t.id!==u.id&&(t.side===u.side||canTarget(t)):t.side!==u.side&&canTarget(t))&&(t.id===u.id||distance(t,u)<=range+BODY_RADIUS));target=p.targetSelector(c,candidates);if(!target)continue;c=context(b,u,target,skill,d);}
    if(u.mana<(native&&p.manaCost?p.manaCost(c):balance?.mana??(p.manaCost?p.manaCost(c):arrayValue(d.mana,skill.points))))continue;
    if(target.id!==u.id&&distance(u,target)>range+BODY_RADIUS)continue;
    if(p.canCast&&!p.canCast(c))continue;
    if(!duringChannel)cancelCastRecovery(b,u);
    const requiresFacing=typeof p.requiresFacing==='function'?p.requiresFacing(c):p.requiresFacing??(p.target!=='self'&&!d.categories.some(kind=>/no target|toggle/i.test(kind)));
    if(target!==u&&requiresFacing&&!faceOrder(b,u,target))return true;
    const speedScale=Math.max(.01,1+statusValue(u,'castTimePct')),period=p.attackCastPointFactor!==undefined?attackInterval(u,target):undefined;
    const attackFactor=typeof p.attackCastPointFactor==='function'?p.attackCastPointFactor(c):p.attackCastPointFactor;
    const point=attackFactor!==undefined?attackWindup(u,period!)*attackFactor:((native||p.dynamicCastPoint)&&typeof p.castPoint==='function'?p.castPoint(c):balance?.castPoint??(typeof p.castPoint==='function'?p.castPoint(c):p.castPoint??referenceCastPoint(c)))*speedScale,backswing=period!==undefined?attackBackswing(u,period):(balance?.backswing??p.backswing??.2)*speedScale;
    if(duringChannel&&point!==0)continue;
    const nativeId=skill.id.replace(/^custom_/,''),rangeBuffer=point===0?0:period!==undefined?Number(u.attackRangeBuffer??BATTLE_CONFIG.attackRangeBuffer):Number((p as SkillProgram&{castRangeBuffer?:number}).castRangeBuffer??(nativeId==='sniper_assassinate'?6:nativeId==='spirit_breaker_nether_strike'?5:2.5));
    const pending:PendingAction={type:'cast',due:b.time+point,recoverUntil:b.time+point+backswing,target:target.id,slot,token:state.token,range,rangeBuffer,attackPeriod:period,attackReadyAt:period!==undefined?b.time+period:undefined,castPosition:p.pointTarget?{x:target.x,y:target.y}:undefined};
    const order={castOrder:{skillId:skill.id,targetId:target.id,kind:p.pointTarget?'point' as const:isUnitTargetSkill(d)?'unit' as const:'none' as const}};
    if(duringChannel){p.onCastStart?.(c);runHooks(b,u,'onSpellOrder',target,0,undefined,0,skill.id,u.id,order);completePending(b,u,pending);return true;}
    state.pending=pending;
    if(period!==undefined){state.lastTarget=target.id;state.attackPeriod=period;state.attackWindup=attackWindup(u,period);}
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
  const definition=pending.type==='cast'?runtime(b).definitions.get(u.skills[pending.slot!]?.id??''):undefined;
  if(!target||target.dead||(target.side!==u.side&&(pending.type==='attack'||(definition&&isUnitTargetSkill(definition)))&&!canTarget(target))){interrupt(b,u);setAction(b,u,'idle');}
}
function moveToPoint(b:BattleState,u:CombatUnit,target:MotionPoint,stopDistance=0) {
  if(hasStatus(u,'root')||hasStatus(u,'motionRoot')||u.moveSpeed<=0){setAction(b,u,'idle');return;}
  const speed=movementSpeed(u);
  const waypoint=routeAroundBarriers(b,u,target),dx=waypoint.x-u.x,dy=waypoint.y-u.y,d=Math.hypot(dx,dy)||1,stop=waypoint===target?stopDistance:0;
  const step=Math.min(speed*FIXED_STEP,Math.max(0,d-stop));
  if(!faceOrder(b,u,waypoint))return;
  ordinaryMove(b,u,{x:u.x+dx/d*step,y:u.y+dy/d*step});setAction(b,u,'move');
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
  for(const u of units)resolveBarrierOverlap(b,u,remainingMovementBudget(u));
}
function endIfNeeded(b:BattleState) {
  const potential=b.units.filter(u=>(!u.summoned||u.illusion)&&(!u.dead||Number(u.reviveAt??-1)>b.time)),sides=new Set(potential.map(u=>u.side));
  if(sides.size<=1){b.finished=true;b.winner=sides.size?[...sides][0]:null;b.endReason=sides.size?'elimination':'mutual_elimination';}
  else if(b.time>=BATTLE_TIME_LIMIT){b.finished=true;b.winner=null;b.endReason='time_limit';}
}
function tick(b:BattleState) {
  b.tickCount=Number(b.tickCount??0)+1;b.time=Number(b.tickCount)*FIXED_STEP;
  for(const u of b.units){const nativeId=String(u.sourceUnitType??''),native=UNIT_CONFIG[nativeId];if(native&&u.motionConfigSource!==nativeId){for(const key of ['turnRate','attackPoint','attackBackswing','projectileSpeed','attackRangeBuffer'])if(Number.isFinite(native[key]))u[key]=native[key];u.motionConfigSource=nativeId;}beginMovementFrame(u,Number(b.tickCount),movementSpeed(u),FIXED_STEP);}
  for(const u of b.units)for(const entry of [...((u.stolenAbilities??[]) as StolenAbility[])])if(entry.until<=b.time+1e-8)removeStolenAbility(b,u,entry);
  b.barriers=barriers(b).filter(w=>w.until>b.time+1e-8);
  for(const u of [...b.units])if(!u.dead)updateStatuses(b,u);
  updateTasks(b);updateProjectiles(b);updateZones(b);
  for(const u of live(b)){refreshMovementBudget(u,movementSpeed(u),FIXED_STEP);syncActionClocks(b,u);}
  // Rotate evaluation order every tick: neither player permanently owns first processing.
  const active=live(b),offset=active.length?Number(b.tickCount)%active.length:0;
  const order=[...active.slice(offset),...active.slice(0,offset)];
  for(const u of order){
    if(u.dead)continue;const state=runtime(b).units.get(u.id)!;
    if(isDisabled(u)){interrupt(b,u);setAction(b,u,'controlled');continue;}
    if(state.motion?.lockActions){setAction(b,u,'move');continue;}
    if(hasStatus(u,'fear')){interrupt(b,u);cancelCastRecovery(b,u);const threat=nearestEnemy(b,u);if(threat){const dx=u.x-threat.x,dy=u.y-threat.y,d=Math.hypot(dx,dy)||1;moveToPoint(b,u,boundedPoint(u.x+dx/d*100,u.y+dy/d*100));}continue;}
    cancelLostTarget(b,u);
    completePending(b,u);if(u.dead)continue;
    if(state.pending)continue;
    if(state.channelUntil>b.time+1e-8){startCast(b,u,true);continue;}
    if(startCast(b,u))continue;
    const target=nearestEnemy(b,u);if(!target){setAction(b,u,'idle');continue;}
    const range=attackRange(u);
    if(distance(u,target)<=range+BODY_RADIUS){
      if(!hasStatus(u,'disarm')&&!hasStatus(u,'hex')&&u.nextAttack<=b.time+1e-8){
        cancelCastRecovery(b,u);if(!faceOrder(b,u,target))continue;
        const interval=attackInterval(u,target),windup=attackWindup(u,interval);state.lastTarget=target.id;state.attackPeriod=interval;state.attackWindup=windup;
        u.nextAttack=b.time+interval;setAction(b,u,'attack',true);
        state.pending={type:'attack',due:b.time+windup,recoverUntil:b.time+interval,target:target.id,token:state.token};
        emit(b,{type:'attack',source:u.id,target:target.id,x:u.x,y:u.y,toX:target.x,toY:target.y,duration:windup+attackBackswing(u,interval),windup,ranged:isRangedAttackType(u)});
      }else if(!(state.recoveringCast&&u.castUntil>b.time)&&(u.action!=='attack'||b.time-u.actionStart>.5))setAction(b,u,'idle');
    }else {cancelCastRecovery(b,u);moveTowards(b,u,target);}
  }
  updateMotions(b);separateUnits(b);endIfNeeded(b);
}

export function createBattle(a:Player,b:Player,seed:number,definitions:SkillDefinition[],restoreTarget?:BattleState,round=1):BattleState {
  if(a.id===b.id)throw new Error('A battle requires two distinct player IDs.');
  const initialState:BattleState={time:0,units:[],events:[],finished:false,winner:null,rng:(seed>>>0)||0x9e3779b9,tickCount:0,accumulator:0,
    initial:{a:structuredClone(a),b:structuredClone(b),seed,version:COMBAT_VERSION,simulationRevision:SIMULATION_REVISION,configHash:CONFIG_HASH,round} satisfies InitialBattle,round,
    fidelity:'prototype_mechanisms_not_AA_verified',endReason:null,projectiles:[],zones:[],barriers:[],nextBarrierId:0};
  const state=restoreTarget?Object.assign(restoreTarget,initialState):initialState;
  const r:Runtime={units:new Map(),definitions:new Map([...GRANTED_SKILL_DEFINITIONS,...definitions].map(d=>[d.id,d])),tasks:[],projectiles:[],zones:[],nextSequence:0,nextSummon:0,nextProjectile:0,nextZone:0,initializing:true,nestedCasts:0,stolen:new Map(),nextStolen:0,initializedSkills:new WeakSet()};runtimeByBattle.set(state,r);
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
  state.skillUltimates=Object.fromEntries([...r.definitions.values()].map(d=>[d.id,d.ultimate]));r.initializing=false;endIfNeeded(state);return state;
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
  return b.units.filter(u=>!u.summoned&&['Attack','Strength','Agility','Intelligence'].some(a=>Number(u[`permanent${a}Gain`]??0)>0)||(!u.summoned&&Object.keys((u.permanentSkillGains??{}) as object).length>0)).map(u=>({heroId:String(u.heroId??u.id.slice(u.id.indexOf(':')+1)),attack:Number(u.permanentAttackGain??0),strength:Number(u.permanentStrengthGain??0),agility:Number(u.permanentAgilityGain??0),intelligence:Number(u.permanentIntelligenceGain??0),...(Object.keys((u.permanentSkillGains??{}) as object).length?{skillState:structuredClone((u.permanentSkillGains??{}) as Record<string,number>)}:{})}));
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
export function getCombatStats(u:CombatUnit){return {attack:attackPower(u),armor:u.armor*(1+statusValue(u,'baseArmorPct'))+statusValue(u,'armor'),attackInterval:attackInterval(u),range:attackRange(u),moveSpeed:movementSpeed(u),magicResist:1-(1-u.magicResist*Math.max(0,1+statusValue(u,'baseMagicResistPct')))*(1-Math.min(.95,independentFraction(effects(u).filter(s=>s.kind==='magicResist').map(s=>s.value??0),-2)))};}
