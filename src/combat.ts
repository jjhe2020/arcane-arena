import { arenaBlocksAttack } from './combat/arenas';
import {rollPrd,PRD_WORKING_ELIGIBILITY,type PrdState} from './combat/prd';
import { ROLES, type BattleState, type CombatEvent, type CombatUnit, type Player, type SkillDefinition, type SkillStack, type UnitStats } from './model';
import { arrayValue, getSkillProgram, GRANTED_SKILL_DEFINITIONS, referenceCastPoint, referenceRootDisables, isUnitTargetSkill, type DamageType, type EffectContext, type EffectStatus, type SkillProgram, type SummonOptions, type ZoneOptions } from './skill-effects';
import { SIMULATION_REVISION } from './simulation-version';
import { addBarrier,barriers,resolveBarrierOverlap,routeAroundBarriers } from './combat/barriers';

export const FIXED_STEP = 1 / 30;
export const BATTLE_BOUNDS = { x: 14.57, y: 12.916 } as const;
/** An explicit project safeguard, not a recovered AA overtime rule. */
export const BATTLE_TIME_LIMIT = 120;
const COMBAT_VERSION = 1;
const BODY_RADIUS = .4;
/** Project profession balance, not recovered AA hero data. Role totals already
 * contain their base attributes; these conversions apply only to changes. */
export const ATTRIBUTE_CONVERSION = { strengthHp:22, intelligenceMana:12, agilityAttackSpeed:1, agilityArmor:.167, primaryAttack:1 } as const;
type Attribute = 'strength'|'agility'|'intelligence';
interface AttributeState { base:Record<Attribute,number>; permanent:Record<Attribute,number>; primary:Attribute; hp:number;mana:number;attack:number;armor:number;attackSpeed:number;maxHpPct?:number }
const ATTRIBUTE_STATUSES = new Set(['strength','agility','intelligence','strengthPct','agilityPct','intelligencePct','statBonus','statPercent','maxHpPct','break']);
interface PendingAction { type: 'attack' | 'cast'; due: number; recoverUntil: number; target: string; slot?: number; token: number }
interface UnitRuntime { pending?: PendingAction; token: number; channelUntil: number; lastTarget?: string;attackPeriod?:number;attackWindup?:number;castScale?:number;recoveringCast?:boolean }
interface Task { due: number; sequence: number; effect: () => void; source?: string; token?: number; cancelOnInterrupt?: boolean; stolenOrigin?:string }
interface VisualOrigin {points?:number;visualSkill?:string;visualPoints?:number}
interface Projectile extends VisualOrigin { id:string;createdAt:number;source: string; target: string; skill: string; x: number; y: number; speed: number; effect: (target: CombatUnit) => void;onMove?:(position:{x:number;y:number})=>void;line?:{angle:number;remaining:number;distance:number;width:number;endWidth?:number;stopOnHit:boolean;targets:'enemies'|'all';hit:string[];onMove?:(position:{x:number;y:number})=>void;onEnd?:()=>void} }
interface Zone extends VisualOrigin { id:string;createdAt:number;source: string; skill: string; x: number; y: number; until: number; next: number; interval: number; tick: number; token: number; options: ZoneOptions; stolenOrigin?:string }
interface Runtime { units: Map<string, UnitRuntime>; definitions: Map<string, SkillDefinition>; tasks: Task[]; projectiles: Projectile[]; zones: Zone[]; nextSequence: number; nextSummon: number;nextProjectile:number;nextZone:number; initializing: boolean; nestedCasts: number; stolen:Map<string,StolenRuntime>;nextStolen:number;initializedSkills:WeakSet<SkillStack> }
interface InitialBattle { a: Player; b: Player; seed: number; version: number; simulationRevision:string; round: number }
interface StolenAbility {slot:number;id:string;until:number;stolenAt:number;spellAmp:number;debuffAmp:number;token:string}
type RuntimeSkill=SkillStack&{stolenOrigin?:string;grantOwners?:string[];nativeGrant?:boolean;prdOrigin?:string;visualParentId?:string;visualParentPoints?:number};
interface StolenRuntime {entry:StolenAbility;active:boolean;fields:Record<string,unknown>;direct:Record<string,number>;unit:string}
const proxyUnits=new WeakMap<CombatUnit,CombatUnit>();
const unwrap=(u:CombatUnit)=>proxyUnits.get(u)??u;
// Core values remain shared; arbitrary ability counters are isolated per stolen
// instance. They cannot overwrite the same ability already equipped natively.
const UNIT_FIELDS=new Set('id name role skin side x y facing hp maxHp mana maxMana attack armor magicResist attackInterval range moveSpeed skills cooldowns statuses nextAttack castUntil action actionStart dead damage taken healing heroId damageHistory moveHistory attributes strength agility intelligence primaryAttribute owner summoned illusion expiresAt sourceSkill sourceUnitType visualBody damageTakenMultiplier inheritedMode inheritedInitialized reviveAt ancient stolenAbilities'.split(' '));
const DIRECT_INIT_FIELDS=new Set(['maxHp','maxMana','attack','armor','magicResist','attackInterval','range','moveSpeed']);
const runtimeByBattle = new WeakMap<BattleState, Runtime>();
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
  for(const added of [...u.skills])if(added&&!before.has(added)){const s=added as RuntimeSkill;s.stolenOrigin??=(skill as RuntimeSkill).stolenOrigin;initializeSkill(b,u,s);}
}
function grantAbility(b:BattleState,u:CombatUnit,parent:SkillStack,id:string,points:number):void {
  const owner=(parent as RuntimeSkill).stolenOrigin;let child=u.skills.find(s=>s?.id===id) as RuntimeSkill|undefined;
  if(child){if(owner){child.grantOwners??=[];if(!child.grantOwners.includes(owner))child.grantOwners.push(owner);}else child.nativeGrant=true;return;}
  while(u.skills.length<5){u.skills.push(null);u.cooldowns.push(0);}
  child={id,points,visualParentId:parent.id,visualParentPoints:parent.points,...(owner?{stolenOrigin:owner,grantOwners:[owner]}:{nativeGrant:true})};u.skills.push(child);u.cooldowns.push(b.time);initializeSkill(b,u,child);
}
function removeStolenAbility(b:BattleState,u:CombatUnit,entry:StolenAbility):void {
  const r=runtime(b),origin=r.stolen.get(entry.token);if(!origin?.active)return;origin.active=false;
  for(let i=0;i<u.skills.length;i++){const skill=u.skills[i] as RuntimeSkill|null;if(!skill)continue;skill.grantOwners=skill.grantOwners?.filter(id=>id!==entry.token);if(skill.stolenOrigin!==entry.token)continue;
    const next=skill.grantOwners?.find(id=>r.stolen.get(id)?.active);if(next){skill.stolenOrigin=next;r.initializedSkills.delete(skill);initializeSkill(b,u,skill);}else if(skill.nativeGrant){delete skill.stolenOrigin;r.initializedSkills.delete(skill);initializeSkill(b,u,skill);}else {u.skills[i]=null;u.cooldowns[i]=0;}
  }
  const pending=r.units.get(u.id)?.pending;if(pending?.type==='cast'&&!u.skills[pending.slot!])interrupt(b,u,true);
  for(const body of b.units){body.statuses=effects(body).filter(s=>s.stolenOrigin!==entry.token);refreshAttributes(body);if(body.stolenInitOrigin===entry.token&&!body.dead){body.dead=true;body.hp=0;interrupt(b,body);setAction(b,body,'death',true);emit(b,{type:'status',source:u.id,target:body.id,skill:entry.id,x:body.x,y:body.y,status:'stolenInitSummonExpired'});}}
  r.tasks=r.tasks.filter(task=>task.stolenOrigin!==entry.token);r.zones=r.zones.filter(z=>z.stolenOrigin!==entry.token);
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
export function statusValue(u: CombatUnit, kind: string): number { return effects(u).filter(s => s.kind === kind && !(s.passive && s.source===u.id && hasStatus(u,'break'))).reduce((n, s) => n + (s.value ?? 0), 0); }
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
const cannotCast = (u: CombatUnit) => isDisabled(u) || hasStatus(u,'hex') || hasStatus(u,'silence') || hasStatus(u,'duel') || hasStatus(u,'berserk');
const canTarget = (u: CombatUnit, single = true) => !u.dead && !hasStatus(u,'invulnerable') && !hasStatus(u,'banished') && !(single&&(hasStatus(u,'shadowRealm')||hasStatus(u,'undetectable')||(hasStatus(u,'invisible')&&!hasStatus(u,'revealed'))));
function interrupt(b: BattleState, u: CombatUnit, onlyCast = false): void {
  const state = runtime(b).units.get(u.id)!;
  if (!onlyCast || state.pending?.type === 'cast' || state.channelUntil > b.time) {
    if (state.pending || state.channelUntil > b.time) {
      state.pending = undefined; state.token++; state.channelUntil = 0;state.recoveringCast=false;
      u.castUntil = b.time; emit(b, { type:'status', source:u.id,x:u.x,y:u.y,status:'interrupted' });
    }
  }
}
function movementSpeed(u:CombatUnit):number {
  let speed=effects(u).find(s=>s.kind==='forceMoveSpeed')?.value??(u.moveSpeed+statusValue(u,'moveFlat'))*(1+statusValue(u,'haste'))*(1-(hasStatus(u,'slowImmune')?0:Math.min(.95,statusValue(u,'slow'))));
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
  if(Math.abs(castRatio-1)>1e-9){if(state.pending?.type==='cast'){state.pending.due=scale(state.pending.due,castRatio);state.pending.recoverUntil=scale(state.pending.recoverUntil,castRatio);u.castUntil=state.pending.recoverUntil;}else if(state.recoveringCast&&state.channelUntil<=b.time)u.castUntil=scale(u.castUntil,castRatio);}
  if(u.castUntil<=b.time)state.recoveringCast=false;
  if(state.attackPeriod!==undefined){state.attackPeriod=period;state.attackWindup=windup;}state.castScale=cast;
}
function addStatus(b: BattleState, source: CombatUnit, target: CombatUnit, skill: string, kind: string, seconds: number, value = 0, options: Partial<EffectStatus> = {},originToken?:string): void {
  if (target.dead || seconds <= 0 || !Number.isFinite(seconds)) return;
  skill=options.skill??skill;const statusSource=options.source??source.id;
  const harmful = options.harmful ?? false;
  if (harmful && (hasStatus(target,'invulnerable') || (hasStatus(target,'magicImmune') && !options.piercesImmunity))) return;
  const reduction = harmful && !options.ignoreStatusResistance && !['dot','armor','magicVulnerability'].includes(kind) ? Math.min(.9,Math.max(-2,statusValue(target,'statusResistance'))) : 0;
  const stolen=originToken?runtime(b).stolen.get(originToken)?.entry:undefined;
  const until = b.time + seconds * (1 - reduction) * (harmful?1+(stolen?.debuffAmp??0):1);
  const stack = !!options.maxStacks;
  let existing = effects(target).find(s => s.kind === kind && s.source === statusSource && s.skill === skill && s.stolenOrigin===options.stolenOrigin);
  if (stack) {
    const same = effects(target).filter(s => s.kind===kind && s.source===statusSource && s.skill===skill && s.stolenOrigin===options.stolenOrigin);
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
  else if(kind==='root'){const pending=runtime(b).units.get(target.id)?.pending,ability=pending?.type==='cast'?target.skills[pending.slot!]:undefined;if(ability&&referenceRootDisables(ability.id))interrupt(b,target,true);}
}
function removeStatuses(b: BattleState, target: CombatUnit, strong = false, harmful = true) {
  const previous=[...effects(target)];
  target.statuses = effects(target).filter(s => {
    if (!!s.harmful !== harmful || s.dispel==='none') return true;
    return s.dispel==='strong' && !strong;
  });
  for(const s of previous)if(!target.statuses.includes(s)){if(s.kind==='ghostshipRum')beginRumPayback(target,s);if(s.kind==='shield')burstShield(b,target,s);}
  refreshAttributes(target);
  emit(b,{type:'status',source:target.id,target:target.id,x:target.x,y:target.y,status:strong?'strongDispel':'basicDispel'});
}
export function physicalDamageMultiplier(armor: number): number { return 1 - .06 * armor / (1 + .06 * Math.abs(armor)); }
function creditUnit(b: BattleState, unit: CombatUnit): CombatUnit {
  return unit.owner ? b.units.find(u=>u.id===unit.owner) ?? unit : unit;
}
function tetherPartner(b:BattleState,u:CombatUnit):{unit:CombatUnit;multiplier:number}|undefined {
  const s=effects(u).find(s=>s.kind==='tether'),partner=b.units.find(t=>t.id===s?.data?.partnerId&&!t.dead);
  if(s&&partner&&distance(u,partner)<=Number(s.data?.maxDistance??10))return {unit:partner,multiplier:s.value??0};
}
function changeMana(b:BattleState,u:CombatUnit,amount:number,transferred=false):number {
  const old=u.mana;u.mana=Math.max(0,Math.min(u.maxMana,u.mana+amount));const actual=u.mana-old;
  if(actual>0&&!transferred){const tether=tetherPartner(b,u);if(tether)changeMana(b,tether.unit,actual*tether.multiplier,true);}return actual;
}
function heal(b: BattleState, source: CombatUnit, target: CombatUnit, amount: number, skill?: string,transferred=false,depth=0,visual:VisualOrigin={}): number {
  if (target.dead || amount<=0) return 0;
  const reduced = amount * (1-Math.min(1,Math.max(0,statusValue(target,'healReduction')))) * (1+Math.max(-1,statusValue(target,'healAmplification')));
  if(hasStatus(target,'falsePromise')){const ledger=deferredLedger(target);ledger.healing+=reduced;return 0;}
  const actual = Math.max(0,Math.min(target.maxHp-target.hp,reduced));
  target.hp += actual; creditUnit(b,source).healing += actual;
  if(actual>0)emit(b,{type:'heal',source:source.id,target:target.id,skill,x:target.x,y:target.y,amount:actual,...visual});
  if(actual>0&&!transferred){const tether=tetherPartner(b,target);if(tether)heal(b,target,tether.unit,actual*tether.multiplier,'wisp_tether',true,depth+1);}
  if(actual>0&&!transferred&&depth===0&&skill&&!skill.toLowerCase().includes('lifesteal'))runHooks(b,source,'onHeal',target,actual,undefined,depth+1,skill);
  return actual;
}
interface DeferredHealth { healing: number; damage: {source:string;amount:number;skill?:string}[] }
interface RumLedger {total:number;entries:{source:string;amount:number}[]}
interface RumPayback extends RumLedger {remaining:number;rate:number}
function beginRumPayback(u:CombatUnit,s:EffectStatus):void{
  const debts=(u.rumDebts??{}) as Record<string,RumLedger>,key=String(s.data?.debtKey??''),ledger=debts[key];if(!ledger)return;delete debts[key];
  const repayments=(u.rumPaybacks??[]) as RumPayback[];repayments.push({...ledger,remaining:ledger.total,rate:ledger.total/Math.max(FIXED_STEP,Number(s.data?.paybackDuration??10))});u.rumPaybacks=repayments;
}
function repayRum(b:BattleState,u:CombatUnit):void{
  const repayments=(u.rumPaybacks??[]) as RumPayback[];
  for(const debt of repayments){const scheduled=Math.min(debt.remaining,debt.rate*FIXED_STEP),actual=Math.min(scheduled,Math.max(0,u.hp-1));debt.remaining=Math.max(0,debt.remaining-scheduled);u.hp-=actual;u.taken+=actual;if(actual>0){for(const entry of debt.entries){const source=b.units.find(t=>t.id===entry.source);if(source&&source.side!==u.side)creditUnit(b,source).damage+=actual*entry.amount/debt.total;}emit(b,{type:'hit',source:debt.entries[0]?.source??u.id,target:u.id,skill:'kunkka_ghostship',x:u.x,y:u.y,amount:actual,rumPayback:true,damageType:'pure'});}}
  u.rumPaybacks=repayments.filter(d=>d.remaining>1e-8);
}
function deferredLedger(u:CombatUnit):DeferredHealth { if(!u.deferredHealth)u.deferredHealth={healing:0,damage:[]};return u.deferredHealth as DeferredHealth; }
function settleDeferredHealth(b:BattleState,u:CombatUnit,status:EffectStatus){
  const ledger=deferredLedger(u);u.deferredHealth=undefined;
  const damage=ledger.damage.reduce((n,d)=>n+d.amount,0),healing=ledger.healing*Number(status.data?.healMultiplier??2),net=damage-healing;
  if(net>0){const actual=Math.min(u.hp,net);u.hp-=actual;u.taken+=actual;for(const d of ledger.damage){const source=b.units.find(x=>x.id===d.source);if(source&&source.side!==u.side)creditUnit(b,source).damage+=actual*d.amount/Math.max(1,damage);}const last=ledger.damage.at(-1);emit(b,{type:'hit',source:last?.source??u.id,target:u.id,skill:'oracle_false_promise',x:u.x,y:u.y,amount:actual,deferred:true});if(u.hp<=0)kill(b,u,b.units.find(x=>x.id===last?.source),'oracle_false_promise');}
  else if(net<0){const actual=Math.min(u.maxHp-u.hp,-net);u.hp+=actual;const source=b.units.find(x=>x.id===status.source)??u;creditUnit(b,source).healing+=actual;emit(b,{type:'heal',source:source.id,target:u.id,skill:'oracle_false_promise',x:u.x,y:u.y,amount:actual,deferred:true});}
}
function runHooks(b: BattleState, unit: CombatUnit, hook: 'onAttack'|'onAttacked'|'onDamage'|'onDealDamage'|'onCast'|'onKill'|'onDeath'|'onAllyCast'|'onAllyAttack'|'onUnitDeath'|'onManaShieldSpent'|'onHeal', target: CombatUnit, amount = 0, damageType?: DamageType, depth = 0, triggerSkillId?: string,triggerUnitId?:string,attackSnapshot?:{baseAttackDamage:number;attackDamage:number}) {
  if(unit.dead&&hook!=='onDeath')return;
  for (const skill of unit.skills) {
    if(!skill)continue;const p=getSkillProgram(skill.id),d=runtime(b).definitions.get(skill.id);
    if(p?.[hook]&&d&&!(p.passive&&hasStatus(unit,'break'))) p[hook]!(context(b,unit,target,skill,d,depth,{amount,damageType,triggerSkillId,triggerUnitId,...attackSnapshot},false,true));
  }
  refreshAttributes(unit);if(target!==unit)refreshAttributes(target);
}
function kill(b: BattleState, unit: CombatUnit, source?: CombatUnit, skill?: string): void {
  if(unit.dead)return;unit.hp=0;unit.dead=true;interrupt(b,unit);setAction(b,unit,'death',true);
  emit(b,{type:'death',source:source?.id??unit.id,target:unit.id,skill,x:unit.x,y:unit.y});
  unit.rumDebts={};unit.rumPaybacks=[];
  runHooks(b,unit,'onDeath',source??unit);
  if(source&&source.side!==unit.side)runHooks(b,source,'onKill',unit,0,undefined,0,skill);
  for(const observer of live(b))runHooks(b,observer,'onUnitDeath',unit);
  for(const body of b.units)body.statuses=effects(body).filter(s=>s.kind!=='duel'||(body.id!==unit.id&&s.data?.targetId!==unit.id));
  const reincarnation=effects(unit).find(s=>s.kind==='reincarnation'&&(s.value??0)>0);
  if(reincarnation){reincarnation.value=0;scheduleRevive(b,unit,3,.5);}
}
export function applyDamage(b: BattleState, source: CombatUnit, target: CombatUnit, amount: number, type: DamageType='magical', skill?: string, piercesImmunity=false, depth=0,ignoreBaseArmor=false,originToken?:string,visual:VisualOrigin={}): number {
  if(target.dead||!Number.isFinite(amount)||amount<=0||depth>8)return 0;
  refreshAttributes(source);refreshAttributes(target);
  if(hasStatus(target,'invulnerable')||hasStatus(target,'banished'))return 0;
  if(type==='physical'&&hasStatus(target,'physicalImmune'))return 0;
  if((type!=='physical'||!!skill)&&hasStatus(target,'magicImmune')&&!piercesImmunity)return 0;
  const dodge=Math.min(1,Math.max(0,statusValue(target,'damageDodge')));if(dodge>0&&nextRandom(b)<dodge){emit(b,{type:'hit',source:source.id,target:target.id,skill,x:target.x,y:target.y,amount:0,outcome:'damageDodged'});return 0;}
  const hitCount=effects(target).find(s=>s.kind==='hitCountBody');
  if(skill&&(hasStatus(target,'immuneSpells')||hitCount?.data?.immuneSpells))return 0;
  if(hitCount&&!skill)return commitResolvedDamage(b,source,target,Number(source.summoned&&!source.illusion?hitCount.data?.basicDamage??1:hitCount.data?.heroDamage??2),type,undefined,depth);
  let damage=amount;
  if(type==='physical')damage*=1-Math.min(1,Math.max(0,statusValue(source,'physicalOutputReduction')));
  damage*=1-Math.min(1,Math.max(0,effects(source).filter(s=>s.kind==='outgoingDamageReduction'&&s.data?.targetId===target.id).reduce((n,s)=>n+(s.value??0),0)));
  damage*=1+effects(target).filter(s=>s.kind==='sourceDamageAmp'&&(s.source===source.id||s.source===source.owner)).reduce((n,s)=>n+(s.value??0),0);
  if(!skill)damage*=1-Math.min(1,Math.max(0,statusValue(target,'attackDamageReduction')));
  if(skill){const stolen=originToken?runtime(b).stolen.get(originToken)?.entry:undefined;damage*=1+Math.max(-.99,statusValue(source,'spellAmp')+(stolen?.spellAmp??0));}
  if(type==='physical'){
    let blocked=!skill?statusValue(target,'block'):0;
    if(!skill)for(const s of effects(target).filter(s=>s.kind==='attackDamageBlock'))if(nextRandom(b)<Number(s.data?.chance??1))blocked=Math.max(blocked,s.value??0);
    damage=Math.max(0,damage-blocked)*physicalDamageMultiplier((ignoreBaseArmor||hasStatus(source,'baseArmorIgnore')?0:target.armor*(1+statusValue(target,'baseArmorPct')))+statusValue(target,'armor'));
  }
  if(type==='physical')damage*=1+statusValue(target,'physicalVulnerability');
  if(type==='magical') {
    const baseResist=target.magicResist*Math.max(0,1+statusValue(target,'baseMagicResistPct'));
    const resist=1-(1-baseResist)*(1-Math.min(.95,statusValue(target,'magicResist')));
    damage*=1-resist;damage*=1+statusValue(target,'magicVulnerability');
  }
  damage*=1-Math.min(1,Math.max(0,statusValue(target,'damageReduction')));
  damage*=1+statusValue(target,'damageVulnerability');
  damage=Math.max(0,damage-statusValue(target,'allDamageBlock'));
  const duel=effects(target).find(s=>s.kind==='duel');if(duel&&duel.data?.targetId!==source.id)damage*=1-Number(duel.data?.externalReduction??0);
  damage*=Number(target.damageTakenMultiplier??1);
  for(const transfer of effects(target).filter(s=>s.kind==='borrowedRedirect')){const owner=b.units.find(u=>u.id===transfer.source&&!u.dead&&hasStatus(u,'borrowedTime'));if(owner){const redirected=damage*Math.min(1,transfer.value??0);damage-=redirected;heal(b,owner,owner,redirected,transfer.skill);break;}}
  if(hasStatus(target,'borrowedTime')){heal(b,target,target,damage,'abaddon_borrowed_time');return 0;}
  const carapace=effects(target).find(s=>s.kind==='spikedCarapace');
  if(carapace&&source.id!==target.id&&depth===0){const key=`carapace:${carapace.until}`,seen=(target[key]??{}) as Record<string,boolean>;target[key]=seen;if(!seen[source.id]){seen[source.id]=true;applyDamage(b,target,source,damage*(carapace.value??1),type,carapace.skill,false,depth+1);addStatus(b,target,source,carapace.skill??'nyx_assassin_spiked_carapace','stun',Number(carapace.data?.stunDuration??0),0,{harmful:true,dispel:'strong'});return 0;}}
  const refraction=effects(target).find(s=>s.kind==='refraction'&&(s.remaining??0)>0);
  if(refraction&&damage>5){refraction.remaining!--;if(refraction.remaining!<=0)target.statuses=target.statuses.filter(s=>s!==refraction);return 0;}
  const manaShield=statusValue(target,'manaShield'),perMana=statusValue(target,'damagePerMana');
  if(manaShield>0&&perMana>0){const absorb=Math.min(damage*manaShield,target.mana*perMana),spent=absorb/perMana;target.mana-=spent;damage-=absorb;if(spent>0)runHooks(b,target,'onManaShieldSpent',source,spent,type,depth+1,skill);}
  for(const shield of [...effects(target)]) {
    if(shield.kind!=='shield'&&(shield.kind!=='magicShield'||type!=='magical')&&(shield.kind!=='physicalShield'||type!=='physical'))continue;
    const absorbed=Math.min(damage,shield.remaining??shield.value??0);shield.remaining=(shield.remaining??shield.value??0)-absorbed;damage-=absorbed;
    if(shield.remaining<=0){target.statuses=target.statuses.filter(s=>s!==shield);burstShield(b,target,shield,depth+1);}
    if(damage<=0)return 0;
  }
  return commitResolvedDamage(b,source,target,damage,type,skill,depth,false,visual);
}
/** Damage delay stores a post-mitigation result and never applies armor twice.
 * Entry/exit and combinations with temporary protection still require AA validation. */
function commitResolvedDamage(b:BattleState,source:CombatUnit,target:CombatUnit,damage:number,type:DamageType,skill?:string,depth=0,delayed=false,visual:VisualOrigin={}):number {
  if(target.dead)return 0;
  const rum=delayed?undefined:effects(target).find(s=>s.kind==='ghostshipRum');if(rum){const deferred=damage*Math.min(1,Math.max(0,rum.value??0));if(deferred>0){rum.data??={};rum.data.debtKey??=`${rum.source}:${rum.skill}:${b.time}`;const key=String(rum.data.debtKey),debts=(target.rumDebts??{}) as Record<string,RumLedger>;debts[key]??={total:0,entries:[]};debts[key].total+=deferred;debts[key].entries.push({source:source.id,amount:deferred});target.rumDebts=debts;damage-=deferred;}}
  if(hasStatus(target,'falsePromise')){deferredLedger(target).damage.push({source:source.id,amount:damage,skill});return 0;}
  const delay=delayed?0:statusValue(target,'damageDelay');
  if(delay>0){
    runtime(b).tasks.push({due:b.time+delay,sequence:runtime(b).nextSequence++,effect:()=>commitResolvedDamage(b,source,target,damage,type,skill,depth,true,visual)});
    emit(b,{type:'status',source:source.id,target:target.id,skill,x:target.x,y:target.y,status:'damageDeferred',amount:damage,duration:delay});return 0;
  }
  if(hasStatus(target,'undying'))damage=Math.min(damage,Math.max(0,target.hp-1));
  const actual=Math.max(0,Math.min(target.hp,damage));target.hp-=actual;target.taken+=actual;
  const history=(target.damageHistory??[]) as {time:number;amount:number}[];target.damageHistory=[...history.filter(x=>x.time>=b.time-6),{time:b.time,amount:actual}];
  if(source.side!==target.side)creditUnit(b,source).damage+=actual;
  emit(b,{type:'hit',source:source.id,target:target.id,skill,x:target.x,y:target.y,amount:actual,damageType:type,...visual,...(delayed?{delayed:true}:{})});
  if(target.hp<=0)kill(b,target,source,skill);
  else if(depth===0&&actual>0)runHooks(b,target,'onDamage',source,actual,type,depth+1,skill);
  if(depth===0&&actual>0)runHooks(b,source,'onDealDamage',target,actual,type,depth+1,skill);
  if(actual>0&&skill&&source.side!==target.side)heal(b,source,source,actual*Math.max(0,statusValue(source,'spellLifesteal')),'spell_lifesteal');
  return actual;
}
function burstShield(b: BattleState, owner: CombatUnit, status: EffectStatus, depth=0) {
  if(!status.data?.burstRadius)return;
  const source=b.units.find(u=>u.id===status.source)??owner;
  for(const t of live(b).filter(u=>u.side!==owner.side&&distance(u,owner)<=Number(status.data!.burstRadius)))applyDamage(b,source,t,Number(status.data!.burstDamage),'magical',status.skill,false,depth,false,status.stolenDamageOrigin,{points:status.points,visualSkill:status.visualSkill,visualPoints:status.visualPoints});
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
function context(b: BattleState, caster: CombatUnit, target: CombatUnit, skill: SkillStack, definition: SkillDefinition, depth=0, extra: Partial<EffectContext>={},initializing=false,hook=false): EffectContext {
  caster=unwrap(caster);target=unwrap(target);
  const r=runtime(b),referencePierces=definition.categories.some(s=>/PIERCES SPELL IMMUNITY:\s*Yes/i.test(s)),origin=stolenOrigin(b,skill),token=origin?.entry.token;
  const visual:VisualOrigin={points:skill.points,visualSkill:extra.visualSkill??extra.originSkillId??(skill as RuntimeSkill).visualParentId??skill.id,visualPoints:extra.visualPoints??extra.originPoints??(skill as RuntimeSkill).visualParentPoints??skill.points};
  const view=origin?stolenView(caster,origin,initializing||hook):caster;
  const guard=<T extends unknown[]>(callback:(...args:T)=>void)=>(...args:T)=>{if(!initializing||!origin||origin.active)callback(...args);};
  return { battle:b,caster:view,target:target===caster?view:target,skill,definition,...extra,...visual,
    random:()=>nextRandom(b),chance:(probability,key)=>chanceRoll(b,caster,skill,probability,key),enemies:()=>live(b).filter(u=>u.side!==caster.side&&canTarget(u,false)),allies:()=>live(b).filter(u=>u.side===caster.side),
    damage:(t,n,type='magical',pierces=referencePierces)=>applyDamage(b,caster,unwrap(t),n,type,skill.id,pierces,depth,false,token,visual),
    execute:t=>{if(t.dead)return;const amount=t.hp;t.taken+=amount;if(caster.side!==t.side)creditUnit(b,caster).damage+=amount;emit(b,{type:'hit',source:caster.id,target:t.id,skill:skill.id,x:t.x,y:t.y,amount,damageType:'pure',executed:true,...visual});kill(b,t,caster,skill.id);},
    heal:(t,n)=>heal(b,caster,unwrap(t),n,skill.id,false,depth,visual),
    mana:(t,n)=>changeMana(b,unwrap(t),n),
    status:(t,kind,seconds,value=0,options={})=>addStatus(b,caster,unwrap(t),skill.id,kind,seconds,value,{passive:!!getSkillProgram(skill.id)?.passive,piercesImmunity:referencePierces,...visual,...options,...((initializing||(hook&&seconds>=BATTLE_TIME_LIMIT))&&token?{stolenOrigin:token}:{})},token),
    dispel:(t,strong=false,harmful=true)=>removeStatuses(b,unwrap(t),strong,harmful),
    projectile:(t,speed,effect,position,onMove)=>r.projectiles.push({id:`projectile:${r.nextProjectile++}`,createdAt:b.time,source:caster.id,target:t.id,skill:skill.id,...visual,x:position?.x??caster.x,y:position?.y??caster.y,speed,effect:guard(effect),onMove:onMove&&guard(onMove)}),
    linearProjectile:o=>r.projectiles.push({id:`projectile:${r.nextProjectile++}`,createdAt:b.time,source:caster.id,target:'',skill:skill.id,...visual,x:o.origin?.x??caster.x,y:o.origin?.y??caster.y,speed:o.speed,effect:guard(o.effect),line:{angle:o.angle,remaining:o.distance,distance:o.distance,width:o.width,endWidth:o.endWidth,stopOnHit:o.stopOnHit??false,targets:o.targets??'enemies',hit:[],onMove:o.onMove&&guard(o.onMove),onEnd:o.onEnd&&guard(o.onEnd)}}),
    disjoint:t=>{r.projectiles=r.projectiles.filter(p=>p.target!==t.id);b.projectiles=r.projectiles.map(p=>({id:p.id,createdAt:p.createdAt,source:p.source,target:p.target,skill:p.skill,points:p.points,visualSkill:p.visualSkill,visualPoints:p.visualPoints,x:p.x,y:p.y,angle:p.line?.angle}));emit(b,{type:'status',source:t.id,skill:skill.id,x:t.x,y:t.y,status:'projectileDisjoint',...visual});},
    endChannel:()=>{const state=r.units.get(caster.id);if(!state)return;if(state.pending?.type==='cast')state.pending=undefined;state.token++;state.channelUntil=0;state.recoveringCast=false;caster.castUntil=b.time;r.zones=r.zones.filter(z=>!(z.source===caster.id&&z.options.channel));setAction(b,caster,'idle');emit(b,{type:'status',source:caster.id,skill:skill.id,x:caster.x,y:caster.y,status:'channelEnded',...visual});},
    movementSpeed,attackInterval,canTarget,
    delay:(seconds,effect,cancelOnInterrupt=false)=>r.tasks.push({due:b.time+seconds,sequence:r.nextSequence++,effect:guard(effect),source:caster.id,token:r.units.get(caster.id)?.token,cancelOnInterrupt,stolenOrigin:initializing?token:undefined}),
    zone:options=>{const interval=Math.max(FIXED_STEP,options.interval);r.zones.push({id:`zone:${r.nextZone++}`,createdAt:b.time,source:caster.id,skill:skill.id,...visual,x:options.x??caster.x,y:options.y??caster.y,until:b.time+options.duration,next:b.time+interval,interval,tick:0,token:r.units.get(caster.id)?.token??0,options:{...options,effect:guard(options.effect)},stolenOrigin:initializing?token:undefined});},
    barrier:options=>{addBarrier(b,caster,skill.id,options.from,options.to,options.width,options.duration,options.visual,options.blocks);emit(b,{type:'status',source:caster.id,skill:skill.id,x:options.from.x,y:options.from.y,toX:options.to.x,toY:options.to.y,status:'barrier',duration:options.duration,width:options.width,...visual});},
    summon:options=>{const bodies=summon(b,caster,skill,{...options,template:options.template&&unwrap(options.template)});if(initializing&&token)for(const unit of bodies)unit.stolenInitOrigin=token;return bodies;},
    teleport:(t,x,y)=>{const oldX=t.x,oldY=t.y;t.moveHistory=[...((t.moveHistory??[]) as {time:number;distance:number}[]).filter(x=>x.time>=b.time-3),{time:b.time,distance:Math.hypot(x-oldX,y-oldY)}];t.x=clamp(finite(x),BATTLE_BOUNDS.x-BODY_RADIUS);t.y=clamp(finite(y),BATTLE_BOUNDS.y-BODY_RADIUS);emit(b,{type:'move',source:t.id,skill:skill.id,x:oldX,y:oldY,toX:t.x,toY:t.y,teleport:true,...visual});},
    attack:(t,multiplier=1,triggerModifiers=true,baseDamage,released=false)=>performAttack(b,caster,t,multiplier,triggerModifiers,depth+1,baseDamage,released),
    revive:(t,delay,hp)=>scheduleRevive(b,t,delay,hp),
    grantAbility:(id,points)=>grantAbility(b,caster,skill,id,points),
    stealAbility:(id,points,options)=>stealAbility(b,caster,id,points,options),
    castAbility:(id,points,t,valueOverrides)=>{
      const p=getSkillProgram(id),d=r.definitions.get(id);if(!p?.cast||!d||r.nestedCasts>=8)return false;
      const overrides=Object.entries(valueOverrides??{}),definition=overrides.length?{...d,values:[...d.values.filter(row=>!overrides.some(([key])=>row.split(':')[0].trim().toUpperCase()===key.toUpperCase())),...overrides.map(([key,value])=>`${key}: ${value}`)]}:d;
      r.nestedCasts++;try {emit(b,{type:'cast',source:caster.id,target:t.id,skill:id,x:caster.x,y:caster.y,toX:t.x,toY:t.y,granted:true,originSkillId:skill.id,...visual,points});p.cast(context(b,caster,t,{id,points,visualParentId:visual.visualSkill,visualParentPoints:visual.visualPoints,prdOrigin:`${chanceIdentity(caster,skill)}:granted:${id}`,...(token?{stolenOrigin:token}:{})} as RuntimeSkill,definition,depth+1,{originSkillId:skill.id,originPoints:skill.points,...visual},initializing));return true;}finally{r.nestedCasts--;}
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
      skills:options.inheritsSkills?structuredClone(template.skills).filter(s=>!s||!options.inheritedMode||(options.inheritedMode==='passives'?getSkillProgram(s.id)?.passive:!!(getSkillProgram(s.id)?.passive||getSkillProgram(s.id)?.onAttack||getSkillProgram(s.id)?.attackModifier))):[],cooldowns:[],statuses:[],nextAttack:b.time+.5,castUntil:b.time,
      action:'spawn',actionStart:b.time,dead:false,summoned:true,owner:source.owner??source.id,damage:0,taken:0,healing:0,
      damageTakenMultiplier:options.damageTaken??1,illusion:options.illusion??false,expiresAt:b.time+options.lifetime,
      sourceSkill:skill.id,visualBody:options.visualBody,inheritedMode:options.inheritedMode,
      deferredHealth:undefined,damageHistory:[],permanentAttackGain:0,reviveAt:undefined,stolenAbilities:[],prdState:{},
    };
    // Illusion totals are already snapshots. Fresh attributes must not reapply
    // the summoner's accumulated derived deltas or share a mutable ledger.
    initializeAttributes(unit,options.illusion?{strength:Number(template.strength??0),agility:Number(template.agility??0),intelligence:Number(template.intelligence??0)}:{strength:0,agility:0,intelligence:0},(template.primaryAttribute??'strength') as Attribute);
    // A released illusion is a snapshot, not the owner's temporary stealing
    // slot. Its copied counters and modifiers belong to its own lifetime.
    for(const inherited of unit.skills){if(!inherited)continue;const s=inherited as RuntimeSkill;delete s.stolenOrigin;delete s.grantOwners;}
    b.units.push(unit);r.units.set(unit.id,{token:0,channelUntil:0});result.push(unit);
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
function attackPower(u: CombatUnit) { return Math.max(0,(u.attack+statusValue(u,'attackBonus'))*(1+statusValue(u,'attackPct'))); }
function attackInterval(u: CombatUnit, target?:CombatUnit): number {
  const base=effects(u).find(s=>s.kind==='baseAttackTime')?.value??u.attackInterval;
  const focus=effects(u).find(s=>s.kind==='focusFire'&&s.data?.targetId===target?.id)?.value??0;
  const curse=target?statusValue(target,'avernusCurse')+statusValue(target,'targetAttackSpeed'):0;
  const total=(100+Number((u.attributes as AttributeState|undefined)?.attackSpeed??0)+statusValue(u,'attackSpeed')+focus+curse)*Math.max(0,1+statusValue(u,'attackSpeedPct'));
  return Math.max(.12,base/(Math.max(20,total)/100))*Math.max(.01,1+statusValue(u,'attackTimePct'));
}
function attackWindup(u:CombatUnit,interval:number):number {const timeScale=Math.max(.01,1+statusValue(u,'attackTimePct'));return Math.min(.4,interval/timeScale*.3)*timeScale;}
function attackRange(u:CombatUnit){return effects(u).find(s=>s.kind==='attackRangeOverride')?.value??u.range+statusValue(u,'range');}
function performAttack(b: BattleState, source: CombatUnit, target: CombatUnit, multiplier=1, triggerModifiers=true, depth=0,baseDamage?:number,released=false): number {
  if((source.dead&&!released)||target.dead||!canTarget(target)||depth>8)return 0;
  if(arenaBlocksAttack(b,source,source,target)){emit(b,{type:'hit',source:source.id,target:target.id,x:target.x,y:target.y,amount:0,outcome:'arenaBlocked'});return 0;}
  const marksmanship=effects(source).find(s=>s.kind==='marksmanship');
  const marksmanshipProc=!!marksmanship&&!hasStatus(source,'break')&&nextRandom(b)<(marksmanship.value??0);
  const fieldEvasion=effects(target).filter(s=>s.kind==='magneticField'&&Math.hypot(source.x-Number(s.data?.x??target.x),source.y-Number(s.data?.y??target.y))>Number(s.data?.radius??0)).reduce((n,s)=>Math.max(n,s.value??0),0);
  const piercing=effects(source).find(s=>s.kind==='piercingAttack'),pierced=!!piercing&&nextRandom(b)<(piercing.value??0);
  const miss=marksmanshipProc||pierced||hasStatus(source,'trueStrike')||hasStatus(target,'targetTrueStrike')?0:1-(1-Math.min(1,statusValue(source,'blind')))*(1-Math.min(1,Math.max(fieldEvasion,statusValue(target,'evasion'))));
  if(miss>0&&nextRandom(b)<miss){emit(b,{type:'hit',source:source.id,target:target.id,x:target.x,y:target.y,amount:0,outcome:'miss'});return 0;}
  const minimum=Number(source.attackMin),maximum=Number(source.attackMax),variance=baseDamage===undefined&&Number.isFinite(minimum)&&Number.isFinite(maximum)&&maximum>minimum?(minimum+nextRandom(b)*(maximum-minimum)-(minimum+maximum)/2)*(1+statusValue(source,'attackPct')):0;
  const baseline=baseDamage??Math.max(0,attackPower(source)+variance);
  let damage=baseline+(marksmanshipProc?Number(marksmanship!.data?.bonus??0):0),type:DamageType=hasStatus(source,'attackMagical')?'magical':'physical';const uncriticalDamage=damage;
  const variableCrit=effects(source).filter(s=>s.kind==='variableCrit'&&!(s.passive&&s.source===source.id&&hasStatus(source,'break'))).sort((a,b)=>(b.value??0)-(a.value??0))[0];let critLifesteal=0;if(variableCrit&&nextRandom(b)<(variableCrit.value??0)){damage*=Number(variableCrit.data?.min??1)+nextRandom(b)*(Number(variableCrit.data?.max??1)-Number(variableCrit.data?.min??1));critLifesteal=Number(variableCrit.data?.lifesteal??0);}
  const focus=effects(source).find(s=>s.kind==='focusFire'&&s.data?.targetId===target.id);if(focus)damage*=Number(focus.data?.damageMultiplier??1);
  if(statusValue(source,'critChance')>0&&nextRandom(b)<statusValue(source,'critChance'))damage*=Math.max(1,statusValue(source,'critMultiplier'));
  if(triggerModifiers)for(const skill of source.skills){
    if(!skill)continue;const p=getSkillProgram(skill.id),d=runtime(b).definitions.get(skill.id);
    if(p?.attackModifier&&d&&!(p.passive&&hasStatus(source,'break'))){const mod=p.attackModifier(context(b,source,target,skill,d,depth));damage+=mod.bonus??0;damage*=mod.multiplier??1;type=mod.type??type;}
  }
  if(statusValue(target,'targetCritMultiplier')>1)damage=Math.max(damage,uncriticalDamage*statusValue(target,'targetCritMultiplier'));
  if(marksmanshipProc)emit(b,{type:'status',source:source.id,target:target.id,skill:marksmanship?.skill,x:target.x,y:target.y,status:'marksmanshipProc'});
  const actual=applyDamage(b,source,target,damage*multiplier,type,undefined,false,depth,marksmanshipProc);
  if(actual>0&&triggerModifiers)for(const cleave of effects(source).filter(s=>s.kind==='cleave')){
    const dx=target.x-source.x,dy=target.y-source.y,length=Math.hypot(dx,dy)||1;
    for(const other of live(b).filter(u=>u.side!==source.side&&u.id!==target.id)){
      let inside=false;
      if(cleave.data?.distance!==undefined){const reach=Number(cleave.data.distance),along=((other.x-source.x)*dx+(other.y-source.y)*dy)/length,across=Math.abs((other.x-source.x)*dy-(other.y-source.y)*dx)/length;inside=along>=0&&along<=reach&&across<=Number(cleave.data.startWidth)+(Number(cleave.data.endWidth)-Number(cleave.data.startWidth))*along/Math.max(.001,reach);}
      else inside=distance(other,target)<=Number(cleave.data?.radius??3.5);
      if(inside)applyDamage(b,source,other,damage*multiplier*(cleave.value??0),'physical',undefined,false,depth+1);
    }
  }
  if(pierced)applyDamage(b,source,target,Number(piercing?.data?.damage??0),'magical',piercing?.skill,false,depth+1);
  if(actual>0)heal(b,source,source,actual*(Math.max(0,statusValue(source,'lifesteal'))+critLifesteal),'lifesteal');
  if(actual>0&&triggerModifiers&&statusValue(source,'maxHpAttackLifesteal')>0){const amount=target.maxHp*statusValue(source,'maxHpAttackLifesteal');applyDamage(b,source,target,amount,'pure','bloodseeker_bloodrage',false,depth+1);heal(b,source,source,amount,'bloodseeker_bloodrage');}
  if(actual>0)for(const s of effects(source).filter(s=>s.kind==='ownerLifesteal')){const owner=b.units.find(u=>u.id===s.data?.ownerId);if(owner)heal(b,source,owner,actual*(s.value??0),s.skill);}
  if(actual>0&&triggerModifiers)for(const tag of effects(target).filter(s=>s.kind==='tagTeam')){const owner=b.units.find(u=>u.id===tag.source);if(owner&&owner.side===source.side){applyDamage(b,owner,target,tag.value??0,'physical',tag.skill,false,depth+1);addStatus(b,owner,target,tag.skill??'tusk_tag_team','slow',Number(tag.data?.slowDuration??.5),Number(tag.data?.slow??.75),{harmful:true});if(Number(tag.data?.stunDuration??0)>0)addStatus(b,owner,target,tag.skill??'tusk_tag_team','stun',Number(tag.data!.stunDuration),0,{harmful:true,dispel:'strong'});}}
  if(triggerModifiers){const snapshot={baseAttackDamage:baseline*multiplier,attackDamage:damage*multiplier};runHooks(b,source,'onAttack',target,actual,type,depth+1,undefined,undefined,snapshot);runHooks(b,target,'onAttacked',source,actual,type,depth+1,undefined,source.id,snapshot);for(const ally of live(b).filter(u=>u.side===source.side&&u.id!==source.id))runHooks(b,ally,'onAllyAttack',target,actual,type,depth+1,undefined,source.id,snapshot);}
  if(triggerModifiers&&!target.dead){const guardian=effects(target).find(s=>s.kind==='guardianRetaliation');if(guardian&&nextRandom(b)<(guardian.value??0)){const id='omniknight_hammer_of_purity',p=getSkillProgram(id),d=runtime(b).definitions.get(id);if(p?.cast&&d){emit(b,{type:'cast',source:target.id,target:source.id,skill:id,x:target.x,y:target.y,toX:source.x,toY:source.y,granted:true});p.cast(context(b,target,source,{id,points:4},d,depth+1));}}}
  if(actual>0&&triggerModifiers)for(const slow of effects(source).filter(s=>s.kind==='onHitSlow')){addStatus(b,source,target,slow.skill??'summon_slow','slow',Number(slow.data?.duration??3),slow.value??0,{harmful:true});if(slow.data?.attackSpeedPct)addStatus(b,source,target,slow.skill??'summon_slow','attackSpeedPct',Number(slow.data.duration??3),-Number(slow.data.attackSpeedPct),{harmful:true});}
  if(actual>0&&triggerModifiers)for(const wound of effects(target).filter(s=>s.kind==='openWounds')){heal(b,source,source,actual*(wound.value??0),'lifesteal');if(!source.summoned)applyDamage(b,source,target,target.maxHp*Number(wound.data?.maxHpPct??0),'physical',wound.skill,false,depth+1);if(wound.data&&!wound.data.spread&&target.taken-Number(wound.data.taken??0)>=Number(wound.data.threshold??500)){wound.data.spread=true;const owner=b.units.find(u=>u.id===wound.source),choices=live(b).filter(u=>u.side===target.side&&u.id!==target.id&&distance(u,target)<=Number(wound.data!.radius??7)&&!effects(u).some(s=>s.kind==='openWounds'&&s.source===wound.source)),next=choices[Math.floor(nextRandom(b)*choices.length)],p=getSkillProgram('life_stealer_open_wounds'),d=runtime(b).definitions.get('life_stealer_open_wounds');if(owner&&next&&p?.cast&&d)p.cast(context(b,owner,next,{id:'life_stealer_open_wounds',points:1},d,depth+1));}}
  const grave=effects(source).find(s=>s.kind==='gravesInvis');if(grave){source.statuses=source.statuses.filter(s=>!(s.skill===grave.skill&&['invisible','undetectable','gravesInvis','freePathing','haste'].includes(s.kind)));addStatus(b,source,source,grave.skill??'visage_silent_as_the_grave','attackPct',Number(grave.data?.bonusDuration??4),grave.value??.25);}
  const realm=effects(source).find(s=>s.kind==='shadowRealm');if(realm&&!realm.data?.persistOnAttack)source.statuses=source.statuses.filter(s=>!(s.skill===realm.skill&&(s.kind==='shadowRealm'||s.kind==='range')));
  return actual;
}
function nearestEnemy(b: BattleState,u:CombatUnit,spellTarget=false):CombatUnit|undefined {
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
    if(s.kind==='arcaneCurse'){const silenced=hasStatus(u,'silence');if(silenced)s.until+=FIXED_STEP;const multiplier=silenced?Number(s.data?.multiplier??1.5):1;s.nextTick??=b.time+1;if(s.nextTick<=b.time+1e-8){applyDamage(b,source,u,(s.value??0)*multiplier,'magical',s.skill);s.nextTick+=1;}addStatus(b,source,u,s.skill??'silencer_curse_of_the_silent','slow',.1,Number(s.data?.slow??.25)*multiplier,{harmful:true});}
    if(s.kind==='rupture'){const dx=u.x-Number(s.data?.lastX??u.x),dy=u.y-Number(s.data?.lastY??u.y),moved=Math.hypot(dx,dy);if(s.data){s.data.lastX=u.x;s.data.lastY=u.y;}if(moved>0&&moved<=Number(s.data?.damageCapDistance??2))applyDamage(b,source,u,moved*100*(s.value??0),'pure',s.skill,true);}
    if(s.interval&&s.nextTick!==undefined&&s.nextTick<=b.time+1e-8&&s.nextTick<=s.until+1e-8){
      if(s.kind==='dot')applyDamage(b,source,u,(s.value??0)*s.interval,s.damageType??'magical',s.skill,!!s.piercesImmunity,0,false,s.stolenDamageOrigin,{points:s.points,visualSkill:s.visualSkill,visualPoints:s.visualPoints});
      s.nextTick+=s.interval;
    }
    if(s.until<=b.time+1e-8){
      if(s.kind==='dot'&&s.interval&&s.nextTick!==undefined){const remainder=s.until-(s.nextTick-s.interval);if(remainder>1e-8&&remainder<s.interval-1e-8)applyDamage(b,source,u,(s.value??0)*remainder,s.damageType??'magical',s.skill,!!s.piercesImmunity,0,false,s.stolenDamageOrigin,{points:s.points,visualSkill:s.visualSkill,visualPoints:s.visualPoints});}
      u.statuses=u.statuses.filter(x=>x!==s);if(s.kind==='shield'&&(s.remaining??0)>0)burstShield(b,u,s);if(s.kind==='falsePromise')settleDeferredHealth(b,u,s);if(s.kind==='ghostshipRum')beginRumPayback(u,s);
    }
  }
  refreshAttributes(u);
  if(u.dead)return;
  repayRum(b,u);
  for(const s of effects(u).filter(s=>s.kind==='regen'))heal(b,b.units.find(t=>t.id===s.source)??u,u,(s.value??0)*FIXED_STEP,s.skill);
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
    if(p.line){const l=p.line,source=b.units.find(t=>t.id===p.source),travel=Math.min(l.remaining,p.speed*FIXED_STEP),dx=Math.cos(l.angle),dy=Math.sin(l.angle);const candidates=live(b).filter(t=>t.id!==p.source&&!l.hit.includes(t.id)&&canTarget(t,false)&&(l.targets==='all'||t.side!==source?.side)).map(t=>({t,along:(t.x-p.x)*dx+(t.y-p.y)*dy,across:Math.abs((t.x-p.x)*dy-(t.y-p.y)*dx)})).filter(t=>t.along>=-BODY_RADIUS&&t.along<=travel+BODY_RADIUS&&t.across<=l.width+((l.endWidth??l.width)-l.width)*Math.max(0,Math.min(1,(l.distance-l.remaining+t.along)/Math.max(1e-8,l.distance)))+BODY_RADIUS).sort((a,b)=>a.along-b.along||a.t.id.localeCompare(b.t.id));for(const item of candidates){l.hit.push(item.t.id);p.effect(item.t);if(l.stopOnHit){l.remaining=0;break;}}p.x+=dx*travel;p.y+=dy*travel;l.remaining-=travel;l.onMove?.({x:p.x,y:p.y});if(l.remaining>1e-8)r.projectiles.push(p);else l.onEnd?.();continue;}
    const target=b.units.find(u=>u.id===p.target);if(!target||target.dead)continue;
    const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),travel=p.speed*FIXED_STEP;
    const source=b.units.find(u=>u.id===p.source);if(p.skill==='basic_attack'&&source&&arenaBlocksAttack(b,source,p,{x:p.x+dx/(d||1)*Math.min(travel,d),y:p.y+dy/(d||1)*Math.min(travel,d)})){emit(b,{type:'hit',source:p.source,target:p.target,x:p.x,y:p.y,amount:0,outcome:'arenaBlocked'});continue;}
    if(d<=travel+BODY_RADIUS){p.onMove?.({x:target.x,y:target.y});p.effect(target);continue;}
    p.x+=dx/d*travel;p.y+=dy/d*travel;p.onMove?.({x:p.x,y:p.y});r.projectiles.push(p);
  }
  b.projectiles=r.projectiles.map(p=>({id:p.id,createdAt:p.createdAt,source:p.source,target:p.target,skill:p.skill,points:p.points,visualSkill:p.visualSkill,visualPoints:p.visualPoints,x:p.x,y:p.y,angle:p.line?.angle}));
}
function updateZones(b:BattleState) {
  const r=runtime(b),zones=r.zones;r.zones=[];
  for(const z of zones){
    const source=b.units.find(u=>u.id===z.source);if(!source)continue;
    if((z.options.follow||z.options.channel)&&source.dead)continue;
    if(z.options.channel&&(r.units.get(source.id)?.token!==z.token||cannotCast(source)))continue;
    if(z.options.follow){z.x=source.x;z.y=source.y;}
    if(z.next<=b.time+1e-8&&z.next<=z.until+1e-8){
      const candidates=live(b).filter(t=>Math.hypot(t.x-z.x,t.y-z.y)<=z.options.radius&&((z.options.targets??'enemies')==='all'||(z.options.targets==='allies'?t.side===source.side:t.side!==source.side)));
      if(!getSkillProgram(z.skill)?.passive||!hasStatus(source,'break'))for(const target of candidates)z.options.effect(target,z.tick);
      z.next+=z.interval;z.tick++;
    }
    if(z.until>b.time+1e-8)r.zones.push(z);
  }
  b.zones=r.zones.map(z=>({id:z.id,createdAt:z.createdAt,source:z.source,skill:z.skill,layer:z.options.visualLayer,points:z.points,visualSkill:z.visualSkill,visualPoints:z.visualPoints,x:z.x,y:z.y,radius:z.options.radius,until:z.until}));
}
function completePending(b:BattleState,u:CombatUnit) {
  const r=runtime(b),state=r.units.get(u.id)!,pending=state.pending;if(!pending||pending.due>b.time+1e-8)return;
  state.pending=undefined;const target=b.units.find(t=>t.id===pending.target);if(!target||target.dead||u.dead)return;
  if(pending.type==='attack'){
    if(isDisabled(u)||hasStatus(u,'hex')||hasStatus(u,'disarm'))return;
    const range=attackRange(u);
    if(range>2){
      r.projectiles.push({id:`projectile:${r.nextProjectile++}`,createdAt:b.time,source:u.id,target:target.id,skill:'basic_attack',x:u.x,y:u.y,speed:14,effect:t=>performAttack(b,u,t,1,true,0,undefined,true)});
    }else if(distance(u,target)<=range+BODY_RADIUS+.5)performAttack(b,u,target);
    return;
  }
  if(cannotCast(u))return;
  const skill=u.skills[pending.slot!]!;if(!skill)return;const definition=r.definitions.get(skill.id),p=getSkillProgram(skill.id);if(!definition||!p?.cast||(hasStatus(u,'root')&&referenceRootDisables(skill.id)))return;
  const c=context(b,u,target,skill,definition),cost=p.manaCost?p.manaCost(c):arrayValue(definition.mana,skill.points);
  if(u.mana<cost)return;u.mana-=cost;
  const nextReduction=Math.min(1,Math.max(0,statusValue(u,'nextCastCooldownReduction')));
  u.cooldowns[pending.slot!]=b.time+Math.max(.2,(p.cooldown?p.cooldown(c):arrayValue(definition.cooldowns,skill.points,10))*(1-Math.min(.9,Math.max(0,statusValue(u,'cooldownReduction'))))*(1-nextReduction));
  if(nextReduction>0)u.statuses=u.statuses.filter(s=>s.kind!=='nextCastCooldownReduction');
  if(target.side!==u.side&&isUnitTargetSkill(definition)){const block=effects(target).find(s=>s.kind==='spellBlock');if(block){target.statuses=target.statuses.filter(s=>s!==block);emit(b,{type:'status',source:target.id,target:u.id,skill:skill.id,x:target.x,y:target.y,status:'spellBlocked'});u.castUntil=pending.recoverUntil;state.recoveringCast=true;return;}}
  const channel=typeof p.channel==='function'?p.channel(c):p.channel??0;
  if(channel>0){state.channelUntil=b.time+channel;u.castUntil=state.channelUntil;state.recoveringCast=false;setAction(b,u,'channel',true);}else {u.castUntil=pending.recoverUntil;state.recoveringCast=true;}
  emit(b,{type:'cast',source:u.id,target:target.id,skill:skill.id,x:u.x,y:u.y,toX:target.x,toY:target.y,duration:channel||p.backswing||.2});
  const existingBinding=effects(target).find(s=>s.kind==='soulbind'),boundIds=String(existingBinding?.data?.group??existingBinding?.data?.partnerId??'').split(',');
  for(const curse of effects(u).filter(s=>s.kind==='arcaneCurse'))curse.until+=Number(curse.data?.penaltyDuration??2);
  p.cast(c);runHooks(b,u,'onCast',target,0,undefined,0,skill.id);
  for(const ally of live(b).filter(t=>t.side===u.side&&t.id!==u.id))runHooks(b,ally,'onAllyCast',u,0,undefined,0,skill.id);
  if(skill.id!=='custom_grimstroke_soul_bind'&&isUnitTargetSkill(definition))for(const partner of b.units.filter(t=>boundIds.includes(t.id)&&t.id!==target.id&&!t.dead)){
    emit(b,{type:'cast',source:u.id,target:partner.id,skill:skill.id,x:u.x,y:u.y,toX:partner.x,toY:partner.y,duplicatedBy:'custom_grimstroke_soul_bind'});const duplicate=context(b,u,partner,skill,definition);if(channel>0)duplicate.endChannel=()=>{};p.cast(duplicate);
  }
}
function startCast(b:BattleState,u:CombatUnit):boolean {
  if(cannotCast(u)||u.inheritedMode)return false;
  const r=runtime(b),state=r.units.get(u.id)!;
  for(let slot=0;slot<u.skills.length;slot++) {
    const skill=u.skills[slot];if(!skill||(u.cooldowns[slot]??0)>b.time+1e-8)continue;
    const d=r.definitions.get(skill.id),p=getSkillProgram(skill.id);if(!d||!p?.cast||p.passive||(hasStatus(u,'root')&&referenceRootDisables(skill.id)))continue;
    let target=selectTarget(b,u,p)??(p.targetSelector?u:undefined);if(!target)continue;
    let c=context(b,u,target,skill,d);const range=(typeof p.range==='function'?p.range(c):p.range??7)*(1+statusValue(u,'castRangePct'))+statusValue(u,'castRange');
    if(p.targetSelector){const candidates=live(b).filter(t=>(p.target==='ally'?t.side===u.side:p.target==='self'?t.id===u.id:p.target==='any'?t.id!==u.id&&(t.side===u.side||canTarget(t)):t.side!==u.side&&canTarget(t))&&(t.id===u.id||distance(t,u)<=range+BODY_RADIUS));target=p.targetSelector(c,candidates);if(!target)continue;c=context(b,u,target,skill,d);}
    if(u.mana<(p.manaCost?p.manaCost(c):arrayValue(d.mana,skill.points)))continue;
    if(target.id!==u.id&&distance(u,target)>range+BODY_RADIUS)continue;
    if(p.canCast&&!p.canCast(c))continue;
    const speedScale=Math.max(.01,1+statusValue(u,'castTimePct')),point=(typeof p.castPoint==='function'?p.castPoint(c):p.castPoint??referenceCastPoint(c))*speedScale,backswing=(p.backswing??.2)*speedScale;
    state.pending={type:'cast',due:b.time+point,recoverUntil:b.time+point+backswing,target:target.id,slot,token:state.token};
    state.castScale=speedScale;state.recoveringCast=false;u.castUntil=b.time+point+backswing;u.facing=Math.atan2(target.y-u.y,target.x-u.x);setAction(b,u,'cast',true);
    emit(b,{type:'status',source:u.id,target:target.id,skill:skill.id,x:u.x,y:u.y,status:'castWindup',duration:point});
    if(point===0)completePending(b,u);
    return true;
  }
  return false;
}
function moveTowards(b:BattleState,u:CombatUnit,target:CombatUnit) {
  if(hasStatus(u,'root')||u.moveSpeed<=0){setAction(b,u,'idle');return;}
  const speed=movementSpeed(u);
  const waypoint=routeAroundBarriers(b,u,target),dx=waypoint.x-u.x,dy=waypoint.y-u.y,d=Math.hypot(dx,dy)||1,stop=waypoint===target?attackRange(u)+.2:0;
  const step=Math.min(speed*FIXED_STEP,Math.max(0,d-stop));
  const nx=clamp(u.x+dx/d*step,BATTLE_BOUNDS.x-BODY_RADIUS),ny=clamp(u.y+dy/d*step,BATTLE_BOUNDS.y-BODY_RADIUS);
  u.moveHistory=[...((u.moveHistory??[]) as {time:number;distance:number}[]).filter(x=>x.time>=b.time-3),{time:b.time,distance:Math.hypot(nx-u.x,ny-u.y)}];u.facing=Math.atan2(dy,dx);u.x=nx;u.y=ny;setAction(b,u,'move');
  for(const bind of effects(u).filter(s=>s.kind==='soulbind'))for(const partner of b.units.filter(t=>String(bind.data?.group??bind.data?.partnerId??'').split(',').includes(t.id)&&t.id!==u.id&&!t.dead)){const gap=distance(u,partner),max=Number(bind.data?.radius??6);if(gap>max){u.x=partner.x+(u.x-partner.x)/gap*max;u.y=partner.y+(u.y-partner.y)/gap*max;}}
  resolveBarrierOverlap(b,u);
}
function separateUnits(b:BattleState) {
  const units=live(b);
  for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){
    const a=units[i],c=units[j];if(['banished','phased','freePathing','fly','flying'].some(kind=>hasStatus(a,kind)||hasStatus(c,kind)))continue;
    let dx=c.x-a.x,dy=c.y-a.y,d=Math.hypot(dx,dy);if(d>=BODY_RADIUS*2)continue;
    if(d<1e-7){dx=((i+j)%2?1:-1);dy=0;d=1;}
    const overlap=(BODY_RADIUS*2-Math.min(BODY_RADIUS*2,Math.hypot(c.x-a.x,c.y-a.y)))/2;
    a.x=clamp(a.x-dx/d*overlap,BATTLE_BOUNDS.x-BODY_RADIUS);a.y=clamp(a.y-dy/d*overlap,BATTLE_BOUNDS.y-BODY_RADIUS);
    c.x=clamp(c.x+dx/d*overlap,BATTLE_BOUNDS.x-BODY_RADIUS);c.y=clamp(c.y+dy/d*overlap,BATTLE_BOUNDS.y-BODY_RADIUS);
  }
  for(const u of units)resolveBarrierOverlap(b,u);
}
function endIfNeeded(b:BattleState) {
  const potential=b.units.filter(u=>(!u.summoned||u.illusion)&&(!u.dead||Number(u.reviveAt??-1)>b.time)),sides=new Set(potential.map(u=>u.side));
  if(sides.size<=1){b.finished=true;b.winner=sides.size?[...sides][0]:null;b.endReason=sides.size?'elimination':'mutual_elimination';}
  else if(b.time>=BATTLE_TIME_LIMIT){b.finished=true;b.winner=null;b.endReason='time_limit';}
}
function tick(b:BattleState) {
  b.tickCount=Number(b.tickCount??0)+1;b.time=Number(b.tickCount)*FIXED_STEP;
  for(const u of b.units)for(const entry of [...((u.stolenAbilities??[]) as StolenAbility[])])if(entry.until<=b.time+1e-8)removeStolenAbility(b,u,entry);
  b.barriers=barriers(b).filter(w=>w.until>b.time+1e-8);
  for(const u of [...b.units])if(!u.dead)updateStatuses(b,u);
  updateTasks(b);updateProjectiles(b);updateZones(b);
  for(const u of live(b))syncActionClocks(b,u);
  // Rotate evaluation order every tick: neither player permanently owns first processing.
  const active=live(b),offset=active.length?Number(b.tickCount)%active.length:0;
  const order=[...active.slice(offset),...active.slice(0,offset)];
  for(const u of order){
    if(u.dead)continue;const state=runtime(b).units.get(u.id)!;
    if(isDisabled(u)){interrupt(b,u);setAction(b,u,'controlled');continue;}
    if(hasStatus(u,'fear')){interrupt(b,u);const threat=nearestEnemy(b,u);if(threat){const dx=u.x-threat.x,dy=u.y-threat.y,d=Math.hypot(dx,dy)||1;u.x=clamp(u.x+dx/d*u.moveSpeed*FIXED_STEP,BATTLE_BOUNDS.x-BODY_RADIUS);u.y=clamp(u.y+dy/d*u.moveSpeed*FIXED_STEP,BATTLE_BOUNDS.y-BODY_RADIUS);setAction(b,u,'move');}continue;}
    completePending(b,u);if(u.dead)continue;
    if(state.pending||u.castUntil>b.time+1e-8)continue;
    if(startCast(b,u))continue;
    const target=nearestEnemy(b,u);if(!target){setAction(b,u,'idle');continue;}
    const range=attackRange(u);
    if(distance(u,target)<=range+BODY_RADIUS){
      if(!hasStatus(u,'disarm')&&!hasStatus(u,'hex')&&u.nextAttack<=b.time+1e-8){
        const interval=attackInterval(u,target),windup=attackWindup(u,interval);state.lastTarget=target.id;state.attackPeriod=interval;state.attackWindup=windup;
        u.nextAttack=b.time+interval;u.facing=Math.atan2(target.y-u.y,target.x-u.x);setAction(b,u,'attack',true);
        state.pending={type:'attack',due:b.time+windup,recoverUntil:b.time+interval,target:target.id,token:state.token};
        emit(b,{type:'attack',source:u.id,target:target.id,x:u.x,y:u.y,toX:target.x,toY:target.y,duration:interval,windup});
      }else if(u.action!=='attack'||b.time-u.actionStart>.5)setAction(b,u,'idle');
    }else moveTowards(b,u,target);
  }
  separateUnits(b);endIfNeeded(b);
}

export function createBattle(a:Player,b:Player,seed:number,definitions:SkillDefinition[],restoreTarget?:BattleState,round=1):BattleState {
  if(a.id===b.id)throw new Error('A battle requires two distinct player IDs.');
  const initialState:BattleState={time:0,units:[],events:[],finished:false,winner:null,rng:(seed>>>0)||0x9e3779b9,tickCount:0,accumulator:0,
    initial:{a:structuredClone(a),b:structuredClone(b),seed,version:COMBAT_VERSION,simulationRevision:SIMULATION_REVISION,round} satisfies InitialBattle,round,
    fidelity:'prototype_mechanisms_not_AA_verified',endReason:null,projectiles:[],zones:[],barriers:[],nextBarrierId:0};
  const state=restoreTarget?Object.assign(restoreTarget,initialState):initialState;
  const r:Runtime={units:new Map(),definitions:new Map([...GRANTED_SKILL_DEFINITIONS,...definitions].map(d=>[d.id,d])),tasks:[],projectiles:[],zones:[],nextSequence:0,nextSummon:0,nextProjectile:0,nextZone:0,initializing:true,nestedCasts:0,stolen:new Map(),nextStolen:0,initializedSkills:new WeakSet()};runtimeByBattle.set(state,r);
  for(const [player,mirror] of [[a,false],[b,true]] as const)for(const hero of player.heroes){
    const stats=ROLES[hero.role];const u:CombatUnit={id:`${player.id}:${hero.id}`,name:hero.name,role:hero.role,skin:hero.skin,side:player.id,
      x:clamp(mirror?-hero.x:hero.x,BATTLE_BOUNDS.x-BODY_RADIUS),y:clamp(mirror?-hero.y:hero.y,BATTLE_BOUNDS.y-BODY_RADIUS),
      facing:mirror?-Math.PI/2:Math.PI/2,hp:stats.hp,maxHp:stats.hp,mana:stats.mana,maxMana:stats.mana,attack:stats.attack+Number((hero as typeof hero&{persistentAttackBonus?:number}).persistentAttackBonus??0),armor:stats.armor,magicResist:.25,
      attackInterval:stats.attackInterval,range:stats.range,moveSpeed:stats.moveSpeed,skills:structuredClone(hero.skills),cooldowns:hero.skills.map(()=>0),statuses:[],nextAttack:0,castUntil:0,
      action:'idle',actionStart:0,dead:false,damage:0,taken:0,healing:0,heroId:hero.id,permanentAttackGain:0,skillState:hero.skills.reduce<Record<string,number>>((state,skill)=>{for(const[key,value]of Object.entries((skill as (SkillStack&{persistentState?:Record<string,number>})|null)?.persistentState??{}))state[key]=(state[key]??0)+value;return state;},{}),permanentSkillGains:{}};
    initializeAttributes(u,{strength:stats.strength,agility:stats.agility,intelligence:stats.intelligence},stats.primaryAttribute,{strength:Number(hero.persistentStrengthBonus??0),agility:Number(hero.persistentAgilityBonus??0),intelligence:Number(hero.persistentIntelligenceBonus??0)});
    state.units.push(u);r.units.set(u.id,{token:0,channelUntil:0});
  }
  for(const u of state.units)for(const skill of u.skills)if(skill)initializeSkill(state,u,skill);
  state.skillUltimates=Object.fromEntries([...r.definitions.values()].map(d=>[d.id,d.ultimate]));r.initializing=false;endIfNeeded(state);return state;
}
/** frame dt only fills an accumulator; simulation results depend on ticks, never on rendering FPS. */
export function stepBattle(b:BattleState,dt:number,definitions:SkillDefinition[]):void {
  if(!Number.isFinite(dt)||dt<0)throw new Error('Battle dt must be finite and nonnegative.');
  if(!runtimeByBattle.has(b)){
    const initial=b.initial as InitialBattle|undefined,ticks=Number(b.tickCount??0),accumulator=Number(b.accumulator??0);
    if(!initial||initial.version!==COMBAT_VERSION||initial.simulationRevision!==SIMULATION_REVISION||!Number.isSafeInteger(ticks)||ticks<0||ticks>BATTLE_TIME_LIMIT/FIXED_STEP+1)throw new Error('Incompatible simulation revision or invalid serialized battle replay.');
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
  return b.units.filter(u=>!u.summoned).map(({id,name,side,damage,taken,healing})=>({id,name,side,damage,taken,healing}));
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
  if(!initial||initial.version!==COMBAT_VERSION||initial.simulationRevision!==SIMULATION_REVISION)throw new Error('Unsupported battle replay version or incompatible simulation revision.');
  const b=createBattle(initial.a,initial.b,initial.seed,definitions,undefined,initial.round??1),ticks=Number(saved.tickCount??0);
  if(!Number.isSafeInteger(ticks)||ticks<0||ticks>BATTLE_TIME_LIMIT/FIXED_STEP+1)throw new Error('Invalid battle tick count.');
  for(let i=0;i<ticks&&!b.finished;i++)tick(b);
  b.accumulator=Math.max(0,Number(saved.accumulator??0));return b;
}

/** Read-only effective values for inspector UI; target-specific attack effects are excluded. */
export function getCombatStats(u:CombatUnit){return {attack:attackPower(u),armor:u.armor*(1+statusValue(u,'baseArmorPct'))+statusValue(u,'armor'),attackInterval:attackInterval(u),range:attackRange(u),moveSpeed:movementSpeed(u),magicResist:1-(1-u.magicResist*Math.max(0,1+statusValue(u,'baseMagicResistPct')))*(1-Math.min(.95,statusValue(u,'magicResist')))};}
