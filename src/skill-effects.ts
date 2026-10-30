import {applyAttackModeAcceptance} from './combat/attack-modes';
import {applyProcAcceptance} from './combat/proc-acceptance';
import {applySummonRestorationAcceptance} from './combat/summon-restoration-acceptance';
import {applyMobilityFieldsAcceptance,MOBILITY_FIELDS_CHILD_DEFINITIONS} from './combat/mobility-fields-acceptance';
import {applyFervorAcceptance} from './combat/fervor-acceptance';
import {applyControlExecutionAcceptance,CONTROL_EXECUTION_CHILD_DEFINITIONS} from './combat/control-execution-acceptance';
import {applyDeathDemonicAcceptance} from './combat/death-demonic-acceptance';
import {applyAttackTriggerAcceptance} from './combat/attack-trigger-acceptance';
import {applyReflectionDemonAcceptance} from './combat/reflection-demon-acceptance';
import {applyEdgeEarthAcceptance} from './combat/edge-earth-acceptance';
import {applyDragonEchoAcceptance} from './combat/dragon-echo-acceptance';
import {applyRestorationIdentityAcceptance} from './combat/restoration-identity-acceptance';
import {applyFireFissureAcceptance} from './combat/fire-fissure-acceptance';
import {applyFlakFleshAcceptance} from './combat/flak-flesh-acceptance';
import {applyFuryGlobalAcceptance} from './combat/fury-global-acceptance';
import {applyFrostControlAcceptance,FROST_CONTROL_CHILD_DEFINITIONS} from './combat/frost-control-acceptance';
import {applyHandIceAcceptance,HAND_ICE_CHILD_DEFINITIONS} from './combat/hand-ice-acceptance';
import {applyGodGustAcceptance} from './combat/god-gust-acceptance';
import {applyIceInnerAcceptance} from './combat/ice-inner-acceptance';
import {applyLivingFieldAcceptance,LIVING_FIELD_CHILD_DEFINITIONS} from './combat/living-field-acceptance';
import {applyInnerLaserAcceptance} from './combat/inner-laser-acceptance';
import {applyLeechShredderAcceptance} from './combat/leech-shredder-acceptance';
import {applyManaMirrorAcceptance,MANA_MIRROR_CHILD_DEFINITIONS} from './combat/mana-mirror-acceptance';
import {applyMistFlareAcceptance,MIST_FLARE_CHILD_DEFINITIONS} from './combat/mist-flare-acceptance';
import {applyNatureOmniAcceptance} from './combat/nature-omni-acceptance';
import {applyPlasmaPulseAcceptance} from './combat/plasma-pulse-acceptance';
import {applyPhantomWardAcceptance} from './combat/phantom-ward-acceptance';
import {applyOverchargeCaskAcceptance,OVERCHARGE_CASK_CHILD_DEFINITIONS} from './combat/overcharge-cask-acceptance';
import {applyPulverizeRavageAcceptance,PULVERIZE_RAVAGE_CHILD_DEFINITIONS} from './combat/pulverize-ravage-acceptance';
import {applyReactiveRefractionAcceptance,REACTIVE_REFRACTION_CHILD_DEFINITIONS} from './combat/reactive-refraction-acceptance';
import {applyResonantArrowAcceptance,RESONANT_ARROW_CHILD_DEFINITIONS} from './combat/resonant-arrow-acceptance';
import {applyAuraArmorAcceptance,AURA_ARMOR_CHILD_DEFINITIONS} from './combat/aura-armor-acceptance';
import {applyMotionReleaseAcceptance,MOTION_RELEASE_CHILD_DEFINITIONS} from './combat/motion-release-acceptance';
import {applyRestorationLinkAcceptance,RESTORATION_LINK_CHILD_DEFINITIONS} from './combat/restoration-link-acceptance';
import {applyAttackStateAcceptance,ATTACK_STATE_CHILD_DEFINITIONS} from './combat/attack-state-acceptance';
import {applyControlTargetAcceptance,CONTROL_TARGET_CHILD_DEFINITIONS} from './combat/control-target-acceptance';
import {applySummonLineageAcceptance,SUMMON_LINEAGE_CHILD_DEFINITIONS} from './combat/summon-lineage-acceptance';
import {applyAttackTempoAcceptance,ATTACK_TEMPO_CHILD_DEFINITIONS} from './combat/attack-tempo-acceptance';
import {applyPassiveDamageAcceptance,PASSIVE_DAMAGE_CHILD_DEFINITIONS} from './combat/passive-damage-acceptance';
import {applyMotionScopeAcceptance,MOTION_SCOPE_CHILD_DEFINITIONS} from './combat/motion-scope-acceptance';
import {defaultMotionDuration} from './config';
import {skillBalance,attachSkillBalance} from './config';
import type {ContinuousMoveOptions} from './combat/movement';
import {configuredValue} from './config';
import {balanceNumber} from './config';
import historicalUnitTargeted from './data/historical-unit-targeted.json';
import historicalRootDisabled from './data/historical-root-disabled.json';
import {applySummonGapOverrides,SUMMON_GAP_CHILD_PROGRAMS,SUMMON_GAP_CHILD_DEFINITIONS} from './combat/main-summon-gaps';
import { applyMainGapOverrides } from './combat/main-gap-overrides';
import { applyEngineGapOverrides } from './combat/main-engine-gaps';
import { applyRemainingUpgrades } from './combat/main-upgrades-remaining';
import { applyAdvancedUpgrades } from './combat/main-upgrades-advanced';
import { HISTORICAL_UPGRADE_PROGRAMS,HISTORICAL_UPGRADE_DEFINITIONS } from './combat/historical-upgrades';
import type { BattleState, CombatUnit, SkillDefinition, SkillStack, Status } from './model';
import { EXTRA_PROGRAMS,EXTRA_CHILD_PROGRAMS,EXTRA_CHILD_DEFINITIONS } from './skill-effects-extra';
import { MORE_PROGRAMS } from './skill-effects-more';
import { applyMainUpgrades } from './combat/main-upgrades';
import historicalCastPoints from './data/historical-cast-points.json';
import { HISTORICAL_CHILD_DEFINITIONS,HISTORICAL_CHILD_PROGRAMS } from './combat/historical-children';
import { MORE_CHILD_DEFINITIONS,MORE_CHILD_PROGRAMS } from './skill-effects-more-children';
import { addVisualWorldEffect } from './combat/visual-state';
import { applyOmnislashClockOverride } from './combat/omnislash';
import {applyLinksAndGazeAcceptance,applyTetherAcceptance} from './combat/links-and-gaze';

/** Rules are explicit per stable catalog ID. Unknown spells never become generic nukes.
 * Distances currently use 100 reference units per board unit; this is a project
 * conversion awaiting the AA reference arena dimensions, not a fidelity claim. */
export const REFERENCE_UNITS_PER_WORLD_UNIT = 100;
export type DamageType = 'physical' | 'magical' | 'pure';
export interface EffectStatus extends Status {
  appliedAt?:number;
  affectsInvulnerable?:boolean;
  removeOnDeath?:boolean;
  attribution?:import('./model').Attribution;
  points?:number;visualSkill?:string;visualPoints?:number;
  stolenOrigin?: string;
  stolenDamageOrigin?: string;
  harmful?: boolean; dispel?: 'basic' | 'strong' | 'none'; damageType?: DamageType;
  piercesImmunity?: boolean; remaining?: number; stacks?: number; maxStacks?: number;
  ignoreStatusResistance?:boolean;
  passive?: boolean;
  data?: Record<string, number | string | boolean>;
}
export interface SummonOptions {
  name: string; count: number; hp: number; attack: number; armor?: number;
  /** Explicit creation-time resources; default HP is the authored maximum. */
  currentHp?:number;mana?:number;maxMana?:number;
  /** The outgoing fraction also applies when rebasing excluded attributes. */
  attributeAttackScale?:number;
  /** Initial spawn placement, rather than a spatial jump of an existing body. */
  position?:{x:number;y:number};
  strongIllusion?:boolean;
  /** Cap copied AA points only; native ability ranks remain in their own domain. */
  inheritedPointsCap?:number;
  nativeTemplateId?:string;
  range?: number; interval?: number; speed?: number; lifetime: number;
  illusion?: boolean; damageTaken?: number; inheritsSkills?: boolean; initializeInherited?:boolean; inheritedMode?:'passives'|'attackEffects'; attackSnapshotIncludesBonuses?:boolean; visualBody?: string; template?:CombatUnit;
}
export interface ZoneOptions {
  x?: number; y?: number; follow?: boolean; radius: number; duration: number;
  /** Explicit authored presentation layer; never participates in the zone clock. */
  visualLayer?:string;
  interval: number; channel?: boolean; targets?: 'enemies' | 'allies' | 'all';
  /** Tick on creation, then at interval boundaries strictly before expiry. */
  immediate?:boolean;
  /** This source also applies a tick exactly at its expiry boundary. */
  includeEnd?:boolean;
  /** Lifecycle cleanup, once for expiry, cancellation or source loss. */
  onEnd?:()=>void;
  effect: (target: CombatUnit, tick: number) => void;
}
export interface BarrierOptions { blocks?:'all'|'enemies';from:{x:number;y:number};to:{x:number;y:number};width:number;duration:number;visual?:{group:string;centerX:number;centerY:number;angle:number}}
export interface InstantAttackOptions {
  /** Explicit attack geometry; the actual actor and statistical attribution stay unchanged. */
  attackOrigin?:{x:number;y:number};
  /** Per-projectile speed in world units/second; leaves the body's ordinary speed intact. */
  projectileSpeed?:number;
  /** An attack can split from a hit position while retaining its actual source/owner. */
  projectileOrigin?:{x:number;y:number};
  /** A native melee extra attack can fail outside its explicit reach tolerance. */
  meleeRangeBuffer?:number;
  modifierPolicy?:'all'|'none';
  attackBatchKey?:string;
  accuracy?:number;
  attackRecord?:import('./model').AttackRecord;
  /** Internal ordinary windup record; direct effect attacks default to instant. */
  isInstant?:boolean;
  /** Internal: launch already applied attack replacements. */
  preparedAttack?:boolean;
  trueStrike?:boolean;
  /** Blade Fury's separate granted attack keeps its normal damage. */
  ignoreBladeFuryPenalty?:boolean;
  /** A released area attack can hit invisible bodies without a single-unit target order. */
  allowInvisibleTarget?:boolean;
  /** Guaranteed critical candidate, compared with other criticals, never multiplied into them. */
  criticalMultiplier?:number;
  /** Fixed attack damage after the attack fraction, before its selected critical. */
  bonusDamage?:number;
  /** Conditional non-critical attack bonus; remains inside the attack packet. */
  postCriticalBonus?:number;
  /** A native attack fraction can also scale conditional bonuses. */
  scaleConditionalBonuses?:boolean;
  noCleave?:boolean;
  ignoreDamageBlock?:boolean;
  /** Internal: a normal attack already emitted its launch event before projectile flight. */
  attackPointEmitted?:boolean;
  /** Snapshot of the attack category when a normal projectile was released. */
  rangedAttackPoint?:boolean;
  /** Prevent mutually tethered follow-up attacks from feeding each other's point hook. */
  suppressAllyAttackPoint?:boolean;
}
export interface AttackResolution {landed:boolean;damage:number}
export interface EffectContext {
  /** Mechanical death credit does not replace settled damage-packet attribution. */
  deathCredit?:{sourceId:string;skillId:string;skillInstanceId?:string;statusInstanceKey?:string};
  beforeDamageResolution?:{inputAmount:number;damageAmount:number;category:import('./model').DamageCategory;flags:import('./model').DamageFlags;stage:'beforeTargetMitigation'};
  attackBatchKey?:string;
  addAttackBonus?(amount:number):void;
  battlefieldBounds?:Readonly<{x:number;y:number}>;
  /** A preferred ordinary attack target; explicit duel/taunt/trance still wins. */
  orderAttack?(attacker:CombatUnit,target:CombatUnit,options?:{withinRangeOnly?:boolean}):void;
  /** Flat stolen-instance reduction, also used by the shared sequential-charge clock. */
  stolenCooldownReduction?:number;
  flatAttackBonus?(unit:CombatUnit,options?:{excludeSkillIds?:string[]}):number;
  /** Flat average attack for an explicitly non-attack ability formula. No rolls. */
  averageFlatAttackDamage?():number;
  permanentAttribute?(target:CombatUnit,attribute:'strength'|'agility'|'intelligence',amount:number):number;
  /** Rebase an illusion's already-copied totals before adding a copied form multiplier. */
  inheritTemporaryAttributeMultiplier?(target:CombatUnit,attribute:'strength'|'agility'|'intelligence',fraction:number):boolean;
  executedAbility?:{id:string;cooldown:number;manaCost:number;procsOnCast:boolean;granted:boolean;itemActive?:boolean};
  attackInProgress?:boolean;
  launchAttack?(target:CombatUnit,multiplier?:number,triggerModifiers?:boolean,options?:InstantAttackOptions):boolean;
  interrupt?(target:CombatUnit):void;
  lifestealHeal?(target:CombatUnit,amount:number,amplificationSource?:CombatUnit):number;
  channelUnit?(target:CombatUnit,duration:number,onEnd:(reason:'complete'|'interrupted')=>void):boolean;
  /** Subscribe to this caster's existing channel without starting or extending it. */
  onChannelEnd?(onEnd:(reason:'complete'|'interrupted')=>void):boolean;
  despawn?(target:CombatUnit):void;
  reduceCooldowns?(target:CombatUnit,seconds:number,options?:{includeUltimates?:boolean;excludeAbilityId?:string;onlyAbilityId?:string;includeChargeRecharge?:boolean;includeActiveEffect?:boolean}):void;
  attackRecord?:import('./model').AttackRecord;
  attackIsInstant?:boolean;
  attackInstanceKey?:string;
  attackCritical?:boolean;
  criticalSourceKey?:string;
  damageFlags?:import('./model').DamageFlags;
  damageCategory?:import('./model').DamageCategory;
  castOrder?:{skillId:string;targetId:string;kind:'unit'|'point'|'none'};
  /** Frozen ground cursor for explicitly point-targeted orders. */
  castPosition?:{x:number;y:number};
  currentAttackTargetId?:string;
  battle: BattleState; caster: CombatUnit; target: CombatUnit; skill: SkillStack;
  definition: SkillDefinition; amount?: number; damageType?: DamageType; triggerSkillId?: string; triggerUnitId?:string; originSkillId?: string; originPoints?: number;
  /** Successful attack snapshots before victim armor: baseline and modified. */
  baseAttackDamage?:number; attackDamage?:number;attackCleaveDamage?:number;attackSourceSkill?:string;attackIsRanged?:boolean;
  /** Accepted spell input before any primary mitigation or HP mutation. */
  beforeAbilityDamageEvent?:{inputAmount:number;category:import('./model').DamageCategory;flags:import('./model').DamageFlags;attribution?:import('./model').Attribution};
  /** An accepted ability damage instance, independent of effective HP loss. */
  abilityDamageEvent?:{inputAmount:number;actualDamage:number;category:import('./model').DamageCategory;flags:import('./model').DamageFlags;attribution?:import('./model').Attribution};
  incomingDamageEvent?:{inputAmount:number;actualDamage:number;category:import('./model').DamageCategory;flags:import('./model').DamageFlags};
  points?:number;visualSkill?:string;visualPoints?:number;
  random(): number;
  /** Opt-in calibrated PRD; probability is a fraction, key identifies one proc. */
  chance?(probability:number,key:string):boolean;
  enemies(): CombatUnit[]; allies(): CombatUnit[];
  damage(target: CombatUnit, amount: number, type?: DamageType, piercesImmunity?: boolean, options?:{flags?:import('./model').DamageFlags;category?:import('./model').DamageCategory}): number;
  damageFrom?(source:CombatUnit,target:CombatUnit,amount:number,type?:DamageType,piercesImmunity?:boolean,options?:{flags?:import('./model').DamageFlags;category?:import('./model').DamageCategory}):number;
  heal(target: CombatUnit, amount: number, kind?:'heal'|'regen'|'lifesteal',options?:{lifestealAmplificationSource?:CombatUnit}): number;
  mana(target: CombatUnit, amount: number): number;
  /** Explicit nonlethal SetHealth; no damage, restoration or deferred ledger packet. */
  setHealth?(target:CombatUnit,nextHp:number,options:{nonLethal:true}):number;
  /** Pure effective-armor read. Both exclusion fields together identify one contribution. */
  armor?(target:CombatUnit,options?:{excludeSourceId?:string;excludeSkillId?:string}):number;
  status(target: CombatUnit, kind: string, duration: number, value?: number, options?: Partial<EffectStatus>): void;
  dispel(target: CombatUnit, strong?: boolean, harmful?: boolean): void;
  projectile(target: CombatUnit, speed: number, effect: (target: CombatUnit) => void, origin?: {x:number;y:number}, onMove?:(position:{x:number;y:number})=>void,options?:{onDisjoint?:(position:{x:number;y:number})=>void;onTargetLost?:(position:{x:number;y:number},reason:'dead'|'missing')=>void;allowInitiallyInvisible?:boolean;visualProjectile?:string;visualLayer?:string}): void;
  linearProjectile(options:{angle:number;distance:number;speed:number;width:number;endWidth?:number;stopOnHit?:boolean;targets?:'enemies'|'all';targetFilter?:(unit:CombatUnit)=>boolean;origin?:{x:number;y:number};followOrigin?:CombatUnit;shouldContinue?:()=>boolean;onMove?:(position:{x:number;y:number})=>void;onEnd?:()=>void;visualLayer?:string;effect:(target:CombatUnit)=>void}):void;
  disjoint(target:CombatUnit):void;
  execute(target:CombatUnit):void;
  executeFrom?(source:CombatUnit,target:CombatUnit):void;
  trySpellBlock?(target:CombatUnit):boolean;
  cancelMotion?(target:CombatUnit):boolean;
  startCooldown?(seconds?:number,options?:{force?:boolean}):void;
  resetCooldown?():void;
  endChannel():void;
  movementSpeed(target:CombatUnit):number;
  /** Effective attack cadence and ordinary single-target eligibility. */
  attackInterval?(unit:CombatUnit,target?:CombatUnit):number;
  attackRange?(unit:CombatUnit):number;
  isRangedAttack?(unit:CombatUnit):boolean;
  canTarget?(unit:CombatUnit,single?:boolean):boolean;
  delay(seconds: number, effect: () => void, cancelOnInterrupt?: boolean): void;
  zone(options: ZoneOptions): void;
  barrier(options: BarrierOptions): void;
  summon(options: SummonOptions): CombatUnit[];
  /** Compatibility only. Runtime programs use explicit warp/continuous motion. */
  teleport(target: CombatUnit, x: number, y: number): void;
  warp(target: CombatUnit, x: number, y: number): void;
  moveContinuous(target:CombatUnit,x:number,y:number,options?:ContinuousMoveOptions):boolean;
  /** Retarget this caller's existing controller, including a released dead body. */
  retargetMotion?(target:CombatUnit,x:number,y:number,identity:{expectedOwner:string;expectedStartedAt:number}):boolean;
  motionActive?(target:CombatUnit):Readonly<{skill:string;owner:string;startedAt:number}>|undefined;
  attack(target: CombatUnit, multiplier?: number, triggerModifiers?: boolean, baseDamage?: number, released?:boolean,options?:InstantAttackOptions): AttackResolution;
  revive(target: CombatUnit, delay: number, hpFraction: number): void;
  /** Immediate granted cast; caller owns mana, cooldown, charges and animation. */
  castAbility(id: string, points: number, target: CombatUnit, valueOverrides?: Record<string, number>): boolean;
  /** Released construct casts retain the parent ledger while using their own actual actor. */
  castAbilityFrom?(source:CombatUnit,id:string,points:number,target:CombatUnit,valueOverrides?:Record<string,number>):boolean;
  effectiveCastRange?(base:number):number;
  /** Combat-only ownership, initialization and cleanup are managed by the engine. */
  grantAbility?(id: string, points: number): void;
  /** A released grant creates a real ability on the recipient body. */
  grantAbilityTo?(target:CombatUnit,id:string,points:number):void;
  stealAbility?(id: string, points: number, options: {duration:number;spellAmp:number;debuffAmp:number;maxSlots:number;persistentState?:Record<string,number>;castPointCap?:number;cooldownReduction?:number;removeOnDeath?:boolean;refreshExisting?:boolean}): void;
}
export interface SkillProgram {
  /** Active toggle Off is an independent order, preserving another pending action. */
  toggleActive?:(c:EffectContext)=>boolean;
  canToggleOff?:(c:EffectContext)=>boolean;
  toggleOff?:(c:EffectContext)=>void;
  /** Item actions obey mute and ordinary disables, while ignoring spell silence. */
  itemActive?:boolean;
  /** A specific zero-point action may be issued under explicitly qualified controls. */
  canCastWhileDisabled?:(c:EffectContext)=>boolean;
  /** Automatic attack actions remain eligible during forced attacks, without lifting silence. */
  canAutocastWhileTaunted?:boolean;
  /** Pure main-damage property. Do not debit charges, roll procs or emit effects here. */
  attackMainDamage?:(c:EffectContext)=>{fixedDamage?:number;baseMultiplier?:number;baseBonus?:number;flatBonus?:number};
  /** A native secondary action may report its parent as the last stealable spell. */
  spellStealAs?:string;
  spellStealEligible?:boolean;
  rootDisables?:boolean;
  leashDisables?:boolean;
  onBeforeDamageResolution?:(c:EffectContext)=>void;
  unitTarget?:boolean|((c:EffectContext)=>boolean);
  /** This program handles the separately documented surviving effects itself. */
  handlesBreak?:boolean;
  onIncomingAttackStart?:(c:EffectContext)=>void;
  /** Accepted modifier-enabled contact, after miss checks and before attacker effects. */
  onBeforeAttackDamageReceived?:(c:EffectContext)=>void;
  onAllyBeforeAttackDamage?:(c:EffectContext)=>void;
  /** Only this contact hook can observe its already-issued lease after source death. */
  onAllyBeforeAttackDamageAfterDeath?:boolean;
  onBeforeAbilityEffect?:(c:EffectContext)=>void;
  onAbilityExecuted?:(c:EffectContext)=>void;
  /** Explicit per-ability targeting exception, including its ordinary checks. */
  targetEligibility?:(c:EffectContext,target:CombatUnit)=>boolean;
  reduceRecharge?:(c:EffectContext,seconds:number)=>void;
  procsOnCast?:boolean;
  allowZeroCooldown?:boolean;
  ignoreCastRangeBonuses?:boolean;
  onCastStart?:(c:EffectContext)=>void;
  onSpellOrder?:(c:EffectContext)=>void;
  onAffectedUnitDeath?:(c:EffectContext,status:EffectStatus)=>void;
  onAffectedUnitDamage?:(c:EffectContext,status:EffectStatus)=>void;
  /** Accepted incoming instance on a body carrying this program's real status. */
  onAffectedUnitIncomingDamageEvent?:(c:EffectContext,status:EffectStatus)=>void;
  /** Explicit illusion-only state copy after inherited totals are restored. */
  onIllusionCreated?:(c:EffectContext)=>void;
  cooldownStart?:'release'|'effectEnd';
  /** Pure begin profile. Selection may only mark this record, never spend or apply contact effects. */
  criticalAttack?:(c:EffectContext)=>{chance:number;multiplier:number;minMultiplier?:number;maxMultiplier?:number;lifesteal?:number;prdKey?:string;priority?:number;onSelected?:(record:import('./model').AttackRecord)=>void}|undefined;
  /** A real attack-based projectile; instantaneous attacks without a projectile omit this. */
  attackProjectile?:boolean;
  /** Fired once when an individual status is dispelled or naturally expires. */
  onStatusRemoved?:(c:EffectContext,status:EffectStatus,reason:'dispel'|'expire')=>void;
  /** Ground cursor remains fixed if the AI's original candidate moves or dies. */
  pointTarget?:boolean|((c:EffectContext)=>boolean);
  prepareAttack?: (c:EffectContext)=>InstantAttackOptions|undefined;
  beforeAttackDamage?: (c:EffectContext)=>void;
  dynamicRange?:boolean;
  dynamicCastPoint?:boolean;
  dynamicBackswing?:(c:EffectContext)=>number;
  /** Explicit native zero-point exception, preserving an existing channel. */
  canCastWhileChanneling?:boolean;
  attackCastPointFactor?:number|((c:EffectContext)=>number);
  /** Accepted attack-based cast contributes its ensured critical before windup. */
  attackCastOptions?:(c:EffectContext)=>InstantAttackOptions;
  /** A selected passive replacement executes one attack without an ability execution. */
  attackCastIsPassive?:(c:EffectContext)=>boolean;
  targetSelector?: (c:EffectContext,candidates:CombatUnit[])=>CombatUnit|undefined;
  target?: 'enemy' | 'ally' | 'self' | 'any'; range?: number | ((c: EffectContext) => number);
  castPoint?: number | ((c: EffectContext) => number); backswing?: number; channel?: number | ((c: EffectContext) => number);
  requiresFacing?:boolean|((c:EffectContext)=>boolean);
  spellBlockTiming?:'cast'|'impact'|'program';
  /** Explicit unit-target exceptions only affect the primary Soulbind target. */
  soulbindCopies?:boolean;
  projectileDisjointable?:boolean;
  projectileDisjointOnInvisibility?:boolean;
  /** A specific seeker loses a target that becomes immune to True Sight. */
  projectileDisjointOnUndetectable?:boolean;
  cooldown?: (c: EffectContext) => number; manaCost?: (c: EffectContext) => number;
  passive?: boolean; canCast?: (c: EffectContext) => boolean;
  cast?: (c: EffectContext) => void; init?: (c: EffectContext) => void;
  onAttack?: (c: EffectContext) => void; onAttacked?: (c: EffectContext) => void; onHeal?: (c: EffectContext) => void;
  onDamage?: (c: EffectContext) => void; onCast?: (c: EffectContext) => void;
  onDealDamage?: (c: EffectContext) => void;
  onBeforeAbilityDamageEvent?: (c:EffectContext)=>void;
  onAbilityDamageEvent?: (c:EffectContext)=>void;
  onIncomingDamageEvent?: (c:EffectContext)=>void;
  onDeath?: (c: EffectContext) => void; onAllyCast?: (c: EffectContext) => void; onAllyAttack?: (c: EffectContext) => void; onUnitDeath?: (c: EffectContext) => void; onManaShieldSpent?: (c: EffectContext) => void;
  onAllyAttackPoint?: (c:EffectContext)=>void;
  onAttackPoint?: (c:EffectContext)=>void;
  onKill?: (c: EffectContext) => void;
  attackModifier?: (c: EffectContext) => { bonus?: number; multiplier?: number; baseMultiplier?:number; postCriticalBonus?:number; postCriticalSpellAmplifiedBonus?:number; typedPostCriticalComponents?:{amount:number;type:DamageType;convertWithAttack?:boolean;countsForCleave?:boolean}[]; type?: DamageType };
  implemented: string[]; remaining: string[];
  superImplemented?: boolean; gabenImplemented?: boolean;
}

/** The first three points are three basic levels. Points 4/5 and 7/8 do not
 * interpolate values that the source never supplies. */
export function basicLevel(points: number): number { return Math.min(3, Math.max(1, Math.floor(points))); }
export function arrayValue(values: number[], points: number, fallback = 0): number {
  return values.length ? values[Math.min(values.length - 1, basicLevel(points) - 1)] : fallback;
}
/** Explicit historical candidate fallback: AA ranks 1/2/3 use Dota 1/2/4
 * for four-entry arrays; this project mapping is not an AA-version proof. */
export function referenceCastPoint(c:Pick<EffectContext,'skill'> & Partial<Pick<EffectContext,'definition'>>,fallback=.3):number {
  const configured=c.definition&&skillBalance(c.definition,c.skill.points);if(configured)return configured.castPoint;
  const rows=historicalCastPoints.abilities as Record<string,{seconds:number[]}>;
  const a=rows[c.skill.id]?.seconds;if(!a?.length)return fallback;
  const rank=basicLevel(c.skill.points),index=a.length===4?[0,1,3][rank-1]:Math.min(rank-1,a.length-1);return a[index];
}
export function skillValue(c: Pick<EffectContext, 'definition' | 'skill'>, key: string, fallback = 0): number {
  const configured=configuredValue(c,key);if(configured!==undefined)return configured;
  const normalized = key.trim().toUpperCase().replace(/:+$/, '');
  const row = c.definition.values.find(row => row.slice(0, row.indexOf(':')).trim().toUpperCase() === normalized);
  if (!row) return fallback;
  const nums = row.slice(row.indexOf(':') + 1).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return arrayValue(nums, c.skill.points, fallback);
}
const v = skillValue;
const dist = (a: CombatUnit, b: CombatUnit) => Math.hypot(a.x - b.x, a.y - b.y);
const units = (n: number) => n / REFERENCE_UNITS_PER_WORLD_UNIT;
const radius = (c: EffectContext, fallback = 400) => units(v(c, 'RADIUS', fallback));
const duration = (c: EffectContext, fallback = 5) => v(c, 'DURATION', fallback);
const enemiesAt = (c: EffectContext, x: number, y: number, r: number) => c.enemies().filter(t => Math.hypot(t.x - x, t.y - y) <= r);
const near = (c: EffectContext, r: number) => enemiesAt(c, c.caster.x, c.caster.y, r);
const percent = (n: number) => Math.abs(n) / 100;
const flag = (c: EffectContext, kind: string, amount: number, seconds = 1e6) => c.status(c.caster, kind, seconds, amount);
const hit = (c: EffectContext, t: CombatUnit, key = 'DAMAGE', type: DamageType = 'magical') => c.damage(t, v(c, key), type);
const stun = (c: EffectContext, t: CombatUnit, key = 'STUN DURATION', fallback = 0) => c.status(t, 'stun', v(c, key, fallback), 0, { harmful: true, dispel: 'strong' });
const slow = (c: EffectContext, t: CombatUnit, value: number, seconds: number) => c.status(t, 'slow', seconds, percent(value), { harmful: true });
const dot = (c: EffectContext, t: CombatUnit, dps: number, seconds: number, type: DamageType = 'magical') => c.status(t, 'dot', seconds, dps, { harmful: true, interval: 1, damageType: type });
const areaHit = (c: EffectContext, key = 'DAMAGE', r = radius(c), type: DamageType = 'magical', center = c.target) => {
  for (const t of enemiesAt(c, center.x, center.y, r)) hit(c, t, key, type);
};
function program(cast: (c: EffectContext) => void, implemented: string[], extra: Partial<SkillProgram> = {}): SkillProgram {
  return { target: 'enemy', range: 7, backswing: .2, cast,
    implemented, remaining: ['AA exact targeting/cast timing and interaction verification', 'Super and Gaben upgrades'], ...extra };
}
function passive(extra: Partial<SkillProgram>, implemented: string[]): SkillProgram {
  return { passive: true, implemented, remaining: ['AA interaction verification', 'Super and Gaben upgrades'], ...extra };
}
const registry: Record<string, SkillProgram> = {};
function register(id: string, p: SkillProgram) { registry[id] = p; }

// Single-target spells. Each ID names a specific behavior and exact data fields.
register('custom_vengefulspirit_magic_missile', program(c => {
  const superTier=c.skill.points>=6,seen=new Set<string>();
  const missile=(target:CombatUnit)=>c.projectile(target,balanceNumber(c,'skill_effects.projectile_speed.1',13.5),t=>{
    if(seen.has(t.id))return;seen.add(t.id);c.damage(t,(skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE"):(((v(c,'DAMAGE')+(superTier?balanceNumber(c,'skill_effects.damage.1',100):0))))),'magical',superTier);
    c.status(t,'stun',v(c,'STUN DURATION'),0,{harmful:true,dispel:'strong',piercesImmunity:superTier});
    if(superTier)c.status(t,'break',v(c,'STUN DURATION'),0,{harmful:true,piercesImmunity:true});
    if(c.skill.points>=9){const next=c.enemies().filter(x=>!seen.has(x.id)).sort((a,b)=>dist(a,t)-dist(b,t)||a.id.localeCompare(b.id))[0];if(next)missile(next);}
  });missile(c.target);
}, ['homing projectile','stun','Super +100 damage/break/immunity piercing','Gaben unique-unit chain'], {superImplemented:true,gabenImplemented:true,remaining:['Projectile speed, bounce search radius and cast timing verification','Super retained at Gaben is an explicit working interpretation']}));
register('zuus_lightning_bolt', program(c => { hit(c, c.target); stun(c, c.target, 'MINISTUN DURATION'); }, ['instant magical damage', 'ministun'], { range: c => units(v(c, 'CAST RANGE', balanceNumber(c,'skill_effects.cast_range_fallback.1',700))) }));
register('custom_luna_lucent_beam', program(c => {
  const strike=(t:CombatUnit,factor=1)=>{c.damage(t,(skillBalance(c.definition,c.skill.points)?v(c,"BEAM DAMAGE"):((((v(c,'BEAM DAMAGE')+(c.skill.points>=6?balanceNumber(c,'skill_effects.damage.1',100):0))))))*factor);stun(c,t);if(c.skill.points>=6){const candidates=enemiesAt(c,t.x,t.y,5);if(candidates.length)c.attack(candidates[Math.floor(c.random()*candidates.length)]);}};
  strike(c.target);if(c.skill.points>=9){let previous=c.target;for(let i=1;i<=4;i++)c.delay(i*balanceNumber(c,'skill_effects.delay.1',0.2),()=>{const candidates=c.enemies().filter(t=>t.id!==previous.id&&dist(t,previous)<=6.75);if(!candidates.length)return;previous=candidates[Math.floor(c.random()*candidates.length)];strike(previous,Math.pow(.85,i));});}
}, ['beam magical damage','stun','Super instant attack, damage/range/mana/cooldown','Gaben four timed diminishing bounces'],{range:c=>balanceNumber(c,'skill_effects.range.1',7)+(c.skill.points>=6?balanceNumber(c,'skill_effects.range.2',3.25):0),manaCost:c=>Math.max(0,arrayValue(c.definition.mana,c.skill.points)-(c.skill.points>=6?50:0)),cooldown:c=>Math.max(0,arrayValue(c.definition.cooldowns,c.skill.points)-(c.skill.points>=6?3.5:0)),superImplemented:true,gabenImplemented:true,remaining:['Original base cast range and bounce re-targeting rules','Super retention at Gaben and attack modifiers need version verification']}));
register('custom_bane_brain_sap', program(c => { const dealt = hit(c, c.target, 'HEAL/DAMAGE', 'pure'); c.heal(c.caster, dealt); }, ['pure damage', 'caster healing']));
register('custom_lion_finger_of_death', program(c => { hit(c, c.target); }, ['magical burst'], { remaining: ['kill-based persistent damage', 'Super and Gaben', 'cast timings'] }));
register('custom_tinker_laser', program(c => { hit(c, c.target, 'LASER DAMAGE', 'pure'); c.status(c.target, 'blind', v(c, 'HERO BLIND DURATION'), percent(v(c, 'BLIND MISS RATE')), { harmful: true }); }, ['pure damage', 'blind'], { range: c => units(v(c, 'CAST RANGE', balanceNumber(c,'skill_effects.cast_range_fallback.1',650))) }));
register('custom_shadow_shaman_voodoo', program(c => {for(const t of c.skill.points>=9?enemiesAt(c,c.target.x,c.target.y,4):[c.target]){c.status(t,'hex',duration(c),0,{harmful:true});if(c.skill.points>=6)c.status(t,'break',duration(c),0,{harmful:true});}}, ['hex: silence, disarm, movement limit','Super break/cooldown reduction','Gaben area hex'], { castPoint:.1,cooldown:c=>arrayValue(c.definition.cooldowns,c.skill.points)-(c.skill.points>=6?3:0),superImplemented:true,gabenImplemented:true,remaining:['Exact cast timing, hex movement floor and dispel verification'] }));
function frostbite(c:EffectContext,t:CombatUnit){const d=v(c,t.summoned?'CREEP DURATION':'HERO DURATION')+(c.skill.points>=6?1.25:0);c.status(t,'root',d,0,{harmful:true});c.status(t,'disarm',d,0,{harmful:true});c.status(t,'frostbite',d,0,{harmful:true});dot(c,t,v(c,'DAMAGE PER SECOND')+(c.skill.points>=9?100:0),d);if(c.skill.points>=6)c.status(t,'damageVulnerability',d,.25,{harmful:true});}
register('crystal_maiden_frostbite', program(c => frostbite(c,c.target), ['root','disarm','damage over time','Super duration/vulnerability','Gaben shatter propagates globally on affected death'],{onUnitDeath:c=>{if(c.skill.points>=9&&c.target.side!==c.caster.side&&c.target.statuses.some(s=>s.kind==='frostbite'&&s.source===c.caster.id))for(const t of c.enemies())frostbite(c,t);},superImplemented:true,gabenImplemented:true,remaining:['Creep level unavailable: all summon bodies use creep duration','Global shatter enemy-only interpretation and tick subdivision require reference verification']}));
register('custom_skywrath_mage_ancient_seal', program(c => {
  const targets=[c.target],others=c.enemies().filter(t=>t.id!==c.target.id&&dist(t,c.target)<=units(v(c,'SECONDARY SEARCH RADIUS',700))&&(c.canTarget?.(t,true)??true)&&!t.statuses.some(s=>s.kind==='magicImmune'));
  for(let i=0;i<v(c,'SECONDARY TARGET COUNT',c.skill.points>=6?1:0)&&others.length;i++)targets.push(others.splice(Math.floor(c.random()*others.length),1)[0]);
  for(const t of targets){
    if(!(c.canTarget?.(t,false)??true)||t.statuses.some(status=>status.kind==='magicImmune'&&status.until>c.battle.time))continue;
    c.status(t,'silence',duration(c),0,{harmful:true});
    c.status(t,'ancientSeal',duration(c),0,{harmful:true});
    // Pinned 2023 Note0 and its contemporary Wiki exclude creeps from this
    // component; that Wiki explicitly treats illusions/creep-heroes as creeps.
    if(!t.summoned&&!t.illusion)c.status(t,'magicResist',duration(c),-percent(v(c,'INCREASED MAGIC DAMAGE')),{harmful:true});
  }
}, ['silence','multiplicative magic resistance reduction','Super random eligible secondary target without a second cast','Gaben fixed cooldown/reduction upgrades and affected-death mana refill'],{
  onUnitDeath:c=>{if(c.skill.points>=9&&c.target.side!==c.caster.side&&c.target.statuses.some(s=>s.kind==='ancientSeal'&&s.source===c.caster.id))c.mana(c.caster,c.caster.maxMana*percent(v(c,'MANA RESTORE PERCENT',100)));},
  superImplemented:true,gabenImplemented:true,remaining:['Multiple casters and independently dispelled marker/resistance components require further comparison','AA Gaben fixed -8s cooldown and +16 percentage points are compiled as effective values; death only conditions mana refill']
}));
register('custom_slardar_amplify_damage', program(c => {const superTier=c.skill.points>=6;const targets=c.skill.points>=9?enemiesAt(c,c.target.x,c.target.y,3.5):[c.target];for(const t of targets)c.status(t,'armor',superTier?balanceNumber(c,'skill_effects.armor_duration.1',1000000):duration(c),v(c,'ARMOR REDUCTION'),{harmful:true,dispel:superTier?'none':'basic',maxStacks:superTier?balanceNumber(c,'skill_effects.maxstacks.1',100):undefined});}, ['armor reduction','Super permanent undispellable stacks','Gaben radius application'],{superImplemented:true,gabenImplemented:true,remaining:['Exact casting/targeting','Super retained at Gaben is an explicit working interpretation']}));
register('custom_doom_bringer_doom', program(c => { const d = duration(c); c.status(c.target, 'silence', d, 0, { harmful: true, dispel: 'none' }); c.status(c.target, 'healReduction', d, balanceNumber(c,'skill_effects.healreduction_amount.1',1), { harmful: true, dispel: 'none' }); dot(c, c.target, v(c, 'DAMAGE PER SECOND'), d, 'pure'); }, ['silence', 'healing prevention', 'pure damage over time'], { remaining: ['Reference-version mute/break and pierce semantics', 'Super/Gaben', 'cast timing'] }));
register('custom_axe_culling_blade', program(c => {
  if(c.target.hp>v(c,'KILL THRESHOLD')+(c.skill.points>=6?150:0))return;c.execute(c.target);if(!c.target.dead||c.target.summoned)return;
  const gain=(skillBalance(c.definition,c.skill.points)?v(c,"ARMOR PER KILL"):(((v(c,'ARMOR PER KILL')+(c.skill.points>=6?1:0))))),key=`${c.skill.id}:armor`,state=(c.caster.skillState??{}) as Record<string,number>,gains=(c.caster.permanentSkillGains??{}) as Record<string,number>;state[key]=(state[key]??0)+gain;gains[key]=(gains[key]??0)+gain;c.caster.skillState=state;c.caster.permanentSkillGains=gains;c.status(c.caster,'armor',balanceNumber(c,'skill_effects.armor_duration.1',1000000),state[key],{dispel:'none'});const slot=c.caster.skills.findIndex(s=>s?.id===c.skill.id);if(slot>=0)c.caster.cooldowns[slot]=c.battle.time;
  for(const ally of c.allies()){if(dist(ally,c.caster)<=units(v(c,'KILL SPEED RADIUS'))){c.status(ally,'haste',v(c,'KILL SPEED DURATION'),percent(v(c,'KILL MOVE SPEED BONUS')));c.status(ally,'attackSpeed',v(c,'KILL SPEED DURATION'),v(c,'KILL ATTACK SPEED BONUS'));}if(c.skill.points>=9)c.status(ally,'physicalImmune',balanceNumber(c,'skill_effects.physicalimmune_duration.1',2));}
}, ['health threshold execution','stacking armor on hero kill','kill cooldown reset and ally speed','Super threshold/range/armor','Gaben allied physical immunity'], { init:c=>c.status(c.caster,'armor',balanceNumber(c,'skill_effects.armor_duration.2',1000000),Number((c.caster.skillState as Record<string,number>|undefined)?.[`${c.skill.id}:armor`]??0),{dispel:'none'}),range:c=>balanceNumber(c,'skill_effects.range.1',1.5)+(c.skill.points>=6?balanceNumber(c,'skill_effects.range.2',2):0),canCast:c=>c.target.hp<=v(c,'KILL THRESHOLD')+(c.skill.points>=6?150:0),superImplemented:true,gabenImplemented:true,remaining:['Exact base cast range150 is a project working default','Armor charge persists on its skill instance per official FAQ; execution intentionally bypasses damage-negation']}));
register('custom_necrolyte_reapers_scythe', program(c => { stun(c, c.target); c.delay(v(c, 'STUN DURATION'), () => c.damage(c.target, (c.target.maxHp - c.target.hp) * v(c, 'DAMAGE PER MISSING HP'))); }, ['stun', 'delayed missing-health damage'], { remaining: ['kill regen rewards', 'Super/Gaben', 'cast timing'] }));
register('custom_dark_willow_cursed_crown', program(c => { c.status(c.target, 'cursedCrown', v(c, 'DELAY')+balanceNumber(c,'skill_effects.cursedcrown_duration.1',0.1), 0, { harmful: true }); c.delay(v(c, 'DELAY'), () => { if (c.target.dead || !c.target.statuses.some(s=>s.kind==='cursedCrown'&&s.source===c.caster.id)) return; c.target.statuses=c.target.statuses.filter(s=>!(s.kind==='cursedCrown'&&s.source===c.caster.id)); for (const t of enemiesAt(c, c.target.x, c.target.y, units(v(c, 'STUN RADIUS')))) stun(c, t); }); }, ['delayed area stun', 'dispel cancels detonation']));

// Chain projectiles use seeded target ordering; subsequent impacts have real travel time.
register('custom_zuus_arc_lightning', program(c => {
  const seen=new Set<string>(),damage=skillBalance(c.definition,c.skill.points)?v(c,'DAMAGE'):v(c,'DAMAGE')+(c.skill.points>=6?110:0);
  const jump=(target:CombatUnit,index:number)=>{
    seen.add(target.id);c.damage(target,damage);
    if(index+1>=v(c,'JUMPS'))return;
    c.delay(v(c,'BOUNCE INTERVAL',.25),()=>{
      const candidates=c.enemies().filter(t=>!seen.has(t.id)&&!t.ward&&dist(t,target)<=units(v(c,'BOUNCE RADIUS',500))&&(c.canTarget?.(t,true)??true)&&!t.statuses.some(s=>s.kind==='magicImmune'));
      candidates.sort((a,b)=>dist(a,target)-dist(b,target)||a.id.localeCompare(b.id));
      if(candidates.length)jump(candidates[0],index+1);
    });
  };jump(c.target,0);
}, ['interval-based unique-victim nearest-neighbor chain with live eligible target search','magical spell damage','Super +110 damage','Gaben spell amplification/lifesteal'],{targetSelector:(c,candidates)=>candidates.filter(t=>!t.ward&&!t.statuses.some(s=>s.kind==='magicImmune')).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster)||a.id.localeCompare(b.id))[0],init:c=>{if(c.skill.points>=9){c.status(c.caster,'spellAmp',1e6,percent(v(c,'SPELL AMPLIFICATION',20)),{dispel:'none'});c.status(c.caster,'spellLifesteal',1e6,percent(v(c,'SPELL LIFESTEAL',20)),{dispel:'none'});}},superImplemented:true,gabenImplemented:true,remaining:['Secondary invulnerability, spell reflection and same-tick expiration combinations still require complete source comparison'] }));
register('custom_lich_chain_frost', program(c => {
  const bounce = (target: CombatUnit, index: number) => c.projectile(target, balanceNumber(c,'skill_effects.projectile_speed.1',8.5), t => {
    c.damage(t, v(c, 'DAMAGE EACH BOUNCE') + index * v(c, 'INCREMENTAL DAMAGE'));
    slow(c, t, v(c, 'MOVEMENT SLOW'), v(c, 'SLOW DURATION'));
    c.status(t, 'attackSpeed', v(c, 'SLOW DURATION'), v(c, 'ATTACK SLOW'), { harmful: true });
    if (index >= v(c, 'BOUNCES')) return;
    const options = c.enemies().filter(x => x.id !== t.id && dist(x,t) <= units(v(c, 'BOUNCE RANGE')));
    if (options.length) bounce(options[Math.floor(c.random()*options.length)], index+1);
  }); bounce(c.target, 0);
}, ['bouncing projectile', 'incremental bounce damage', 'movement/attack slow'], { remaining: ['Bounce origin travel distance verification', 'Super/Gaben', 'cast timing'] }));
register('witch_doctor_paralyzing_cask', program(c => {
  const bounce = (t: CombatUnit, i: number) => c.projectile(t, balanceNumber(c,'skill_effects.projectile_speed.1',10), target => { c.damage(target, v(c, 'BASE DAMAGE') + v(c, 'BONUS DAMAGE PER BOUNCE') * i); stun(c,target); if (i < v(c, 'BOUNCES')) { const next=c.enemies().filter(x=>x.id!==target.id && dist(x,target)<=5.75); if(next.length) bounce(next[Math.floor(c.random()*next.length)],i+1); } }); bounce(c.target,0);
}, ['bouncing stun projectile', 'per-bounce damage'], { remaining: ['Exact bounce origin/speed/radius', 'Super/Gaben'] }));

// Area damage, displacement and zones.
function acidSpray(c:EffectContext,global=false){
  const scale=skillBalance(c.definition,c.skill.points)?1:c.skill.points>=6?1.5:1,x=global?0:(c.castPosition?.x??c.target.x),y=global?0:(c.castPosition?.y??c.target.y),r=global?50:radius(c),seconds=global?120:duration(c);
  const armor=-Math.abs(v(c,'ARMOR REDUCTION'))*scale,dps=v(c,'DAMAGE PER SECOND')*scale,interval=v(c,'DAMAGE INTERVAL',1),linger=v(c,'ARMOR LINGER',.5);
  const affected=new Map<string,{next:number;lastSeen:number}>();
  c.zone({x,y,radius:r,duration:seconds,interval:1/30,immediate:true,includeEnd:true,effect:t=>{
    if(!(c.canTarget?.(t,false)??true)||t.statuses.some(status=>status.kind==='magicImmune'&&status.until>c.battle.time)){affected.delete(t.id);return;}
    c.status(t,'armor',linger,armor,{harmful:true,dispel:'none',ignoreStatusResistance:true,data:{uniqueGroup:'acidSprayArmor',stacking:'strongest'}});
    let state=affected.get(t.id);
    if(!state||c.battle.time-state.lastSeen>1/30+1e-8){state={next:c.battle.time,lastSeen:c.battle.time};affected.set(t.id,state);}
    state.lastSeen=c.battle.time;
    if(state.next<=c.battle.time+1e-8){state.next+=interval;c.damage(t,dps*interval,'physical');}
  }});
}
register('custom_alchemist_acid_spray', program(c=>acidSpray(c),['stationary ground-cursor damage zone','physical per-victim pulses including the endpoint; independent damage and unique armor aura','Super 1.5x damage and armor reduction','Gaben battle-start arena-wide persistent field'],{pointTarget:true,init:c=>{if(c.skill.points>=9)acidSpray(c,true);},canCast:c=>c.skill.points<9,superImplemented:true,gabenImplemented:true,remaining:['Different-level armor aura priority uses strongest-active selection; native priority is not directly specified','Fog-of-war, couriers and buildings are outside the arena model']}));
register('custom_juggernaut_blade_fury', program(c => {const d=duration(c),r=radius(c)+(c.skill.points>=6?.75:0);c.dispel(c.caster);c.status(c.caster,'magicImmune',c.skill.points>=6?d:v(c,'MAGIC IMMUNITY DURATION'));c.zone({follow:true,radius:r,duration:d,interval:balanceNumber(c,'skill_effects.interval.1',0.2),effect:t=>c.damage(t,(((skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE PER SECOND"):((v(c,'DAMAGE PER SECOND')+(c.skill.points>=6?balanceNumber(c,'skill_effects.damage.1',80):0))))*balanceNumber(c,'skill_effects.damage.2',0.2))))});if(c.skill.points>=9){flag(c,'moveFlat',1,d);c.zone({follow:true,radius:r,duration:d,interval:balanceNumber(c,'skill_effects.interval.2',1),effect:t=>c.attack(t)});}}, ['mobile magical damage zone','temporary spell immunity/basic dispel','Super damage/radius/full-duration immunity','Gaben speed and periodic attacks'], { target:'self',canCast:c=>near(c,radius(c)+(c.skill.points>=6?.75:0)).length>0,cooldown:c=>arrayValue(c.definition.cooldowns,c.skill.points)-(c.skill.points>=9?6:0),superImplemented:true,gabenImplemented:true,remaining:['Ordinary attack suppression during spin and Gaben victim-selection rule require source']}));
interface BatteryRun{until:number;interval:number;start:number;tick:number;radius:number}
const batteryTargets=(c:EffectContext,r:number)=>near(c,r).filter(t=>!t.ward&&(c.canTarget?.(t,true)??true)&&!t.statuses.some(s=>s.kind==='magicImmune'));
register('custom_clockwerk_battery_assault',program(c=>{
  const existing=c.caster.batteryAssaultRun as BatteryRun|undefined;
  c.status(c.caster,'batteryAssault',duration(c),1,{dispel:'none'});
  if(existing&&existing.until>=c.battle.time){existing.until=c.battle.time+duration(c);return;}
  const compiled=!!skillBalance(c.definition,c.skill.points),run:BatteryRun={until:c.battle.time+duration(c),start:c.battle.time,tick:0,interval:v(c,'INTERVAL',.7)-(!compiled&&c.skill.points>=6?.25:0),radius:radius(c)+(!compiled&&c.skill.points>=9?2.75:0)};c.caster.batteryAssaultRun=run;
  const pulse=()=>{if(c.caster.dead||c.caster.batteryAssaultRun!==run||c.battle.time>run.until+1e-8)return;const targets=batteryTargets(c,run.radius),selected=c.skill.points>=9?targets:targets.length?[targets[Math.floor(c.random()*targets.length)]]:[];for(const victim of selected){const creep=victim.summoned&&!victim.illusion&&!victim.consideredHero;c.damage(victim,v(c,'DAMAGE')*(creep?v(c,'CREEP DAMAGE MULTIPLIER',2):1));c.status(victim,'stun',v(c,'STUN DURATION',.1),0,{harmful:true,dispel:'strong'});}run.tick++;const next=run.start+run.tick*run.interval;c.delay(Math.max(0,next-c.battle.time),pulse);};pulse();
},['Immediate first shrapnel and inclusive final pulse on an absolute interval clock','Single random visible eligible target; Gaben all eligible bodies in final radius','Historical double ordinary-creep damage; illusions and creep-heroes take hero damage','Damage precedes 0.1-second strong-dispellable ministun','Persists through caster disables; death stops the discharge','Recast refreshes duration without duplicate pulse clock or interval resnapshot'],{target:'self',castPoint:0,backswing:0,canCast:c=>batteryTargets(c,radius(c)+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=9?2.75:0)).length>0,onDeath:c=>{c.caster.batteryAssaultRun=undefined;},superImplemented:true,gabenImplemented:true,remaining:[]}));
register('enigma_black_hole',program(c=>{
 if(c.skill.points>=9&&!c.caster.blackHoleRefresh){c.caster.blackHoleRefresh=true;c.caster.cooldowns=c.caster.cooldowns.map(()=>c.battle.time);}
 const{x,y}=c.castPosition??c.target,seconds=duration(c,4),interval=balanceNumber(c,'skill_effects.black_hole_damage_interval',1),key=`${c.caster.id}:${c.battle.time}`,affected=new Map<CombatUnit,EffectStatus>();let ended=false;
 c.zone({x,y,radius:radius(c),duration:seconds,interval:balanceNumber(c,'skill_effects.interval.1',.1),immediate:true,includeEnd:true,channel:true,onEnd:()=>{
  ended=true;for(const[target,status]of affected){target.statuses=target.statuses.filter(s=>s!==status);c.moveContinuous(target,target.x,target.y,{duration:1/30,priority:100,lockActions:false,ignoreBarriers:true});}
 },effect:target=>{
  if(target.ward)return;let status=affected.get(target);const linger=balanceNumber(c,'skill_effects.stun_duration.1',.5);
  if(!status||!target.statuses.includes(status)){c.status(target,'stun',linger,0,{harmful:true,dispel:'none',piercesImmunity:true,ignoreStatusResistance:true,maxStacks:1000,data:{blackHoleCast:key}});status=target.statuses.find(s=>(s as EffectStatus).data?.blackHoleCast===key) as EffectStatus;affected.set(target,status);}else status.until=c.battle.time+linger;
 }});
 for(let at=interval;at<=seconds+1e-8;at+=interval)c.delay(at,()=>{if(ended||c.caster.dead)return;for(const target of c.enemies().filter(t=>!t.ward&&Math.hypot(t.x-x,t.y-y)<=radius(c)))c.damage(target,skillBalance(c.definition,c.skill.points)?v(c,'DAMAGE PER SECOND'):v(c,'DAMAGE PER SECOND')+(c.skill.points>=6?100:0),'pure',true);},true);
},['interruptible fixed channel with immediate immunity-piercing disable','one-second pure damage pulses starting one second after cast','resistance-independent half-second aura linger, immediately removed when channel ends','Super final DPS increase and Gaben once-per-round all-slot cooldown refresh'],{pointTarget:true,range:2.75,backswing:0,channel:c=>duration(c,4),superImplemented:true,gabenImplemented:true,remaining:['Exact native spiral trajectory and independent charge reset semantics require additional verification']}));
register('custom_bane_fiends_grip', program(c => { const t=c.target; c.zone({follow:true,radius:balanceNumber(c,'skill_effects.radius.1',1000),duration:balanceNumber(c,'skill_effects.duration.1',6),interval:balanceNumber(c,'skill_effects.interval.1',0.1),channel:true,effect:x=>{if(x.id!==t.id)return; c.damage(x,v(c,'DAMAGE')*balanceNumber(c,'skill_effects.damage.1',0.1),'pure',true); c.status(x,'stun',balanceNumber(c,'skill_effects.stun_duration.1',0.15),0,{harmful:true,dispel:'strong',piercesImmunity:true}); c.mana(x,-x.maxMana*percent(v(c,'MANA DRAIN PER SECOND'))*.1);}}); }, ['interruptible single-target channel','pure damage','mana drain'],{channel:6,remaining:['Channel duration absent from catalog: 6s provisional','Super/Gaben','range break']}));
register('custom_skywrath_mage_mystic_flare', program(c => {const targets=[c.target];if(c.skill.points>=6){const nearby=c.enemies().filter(t=>t.id!==c.target.id&&dist(t,c.target)<=7),heroes=nearby.filter(t=>!t.summoned),choices=heroes.length?heroes:nearby;if(choices.length)targets.push(choices[Math.floor(c.random()*choices.length)]);}for(const target of targets){const x=target.x,y=target.y;c.zone({x,y,radius:radius(c),duration:duration(c),interval:balanceNumber(c,'skill_effects.interval.1',0.1),effect:t=>{const count=enemiesAt(c,x,y,radius(c)).filter(x=>!x.summoned).length;if(count&&!t.summoned)c.damage(t,(skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE"):((((v(c,'DAMAGE')+(c.skill.points>=9?balanceNumber(c,'skill_effects.damage.1',450):0))))))/duration(c)*balanceNumber(c,'skill_effects.damage.2',0.1)/(c.skill.points>=9?balanceNumber(c,'skill_effects.damage.3',1):count));}});}},['area damage divided among heroes','Super secondary nearby field','Gaben bonus damage without division'],{superImplemented:true,gabenImplemented:true,remaining:['Secondary search centered on target versus caster and exact tick phase require reference']}));
register('leshrac_pulse_nova', program(c => {c.status(c.caster,'pulseNova',balanceNumber(c,'skill_effects.pulsenova_duration.1',30));c.zone({follow:true,radius:radius(c),duration:balanceNumber(c,'skill_effects.duration.1',30),interval:balanceNumber(c,'skill_effects.interval.1',1),targets:'all',effect:t=>{if(t.id!==c.caster.id)return; const cost=v(c,'MANA/SEC');if(c.caster.mana<cost)return;c.mana(c.caster,-cost);for(const e of near(c,radius(c)))hit(c,e);}});},['toggle-like pulsing damage','mana consumption'],{target:'self',canCast:c=>!c.caster.statuses.some(s=>s.kind==='pulseNova')&&near(c,radius(c)).length>0,remaining:['Toggle shutdown and recast state','Super/Gaben','initial cost/timing']}));
register('pudge_rot', program(c => {c.status(c.caster,'rotActive',balanceNumber(c,'skill_effects.rotactive_duration.1',1000000));c.zone({follow:true,radius:radius(c),duration:balanceNumber(c,'skill_effects.duration.1',120),interval:balanceNumber(c,'skill_effects.interval.1',0.2),targets:'all',effect:t=>{if(t.side!==c.caster.side||t.id===c.caster.id){c.damage(t,v(c,'DAMAGE')*balanceNumber(c,'skill_effects.damage.1',0.2));if(t.side!==c.caster.side)slow(c,t,v(c,'MOVE SLOW'),balanceNumber(c,'skill_effects.slow_duration.1',0.3));}}});},['mobile damaging aura','self damage','movement slow'],{target:'self',canCast:c=>!c.caster.statuses.some(s=>s.kind==='rotActive')&&near(c,radius(c)).length>0}));
register('treant_overgrowth',program(c=>{for(const t of near(c,radius(c))){c.status(t,'root',duration(c),0,{harmful:true,piercesImmunity:true});c.status(t,'disarm',duration(c),0,{harmful:true,piercesImmunity:true});dot(c,t,v(c,'DAMAGE PER SECOND'),duration(c));}},['area root/disarm','damage over time'],{target:'self',canCast:c=>near(c,radius(c)).length>0}));
register('custom_tidehunter_ravage',program(c=>{for(const t of near(c,radius(c))){hit(c,t);c.status(t,'stun',duration(c),0,{harmful:true,dispel:'strong'});}},['area magical damage','stun'],{target:'self',canCast:c=>near(c,radius(c)).length>0,remaining:['Expanding wave travel time','Super/Gaben']}));
register('custom_leshrac_split_earth',program(c=>{const x=c.target.x,y=c.target.y;c.delay(v(c,'STUN DELAY'),()=>{for(const t of enemiesAt(c,x,y,radius(c))){hit(c,t);stun(c,t);}});},['delayed ground area damage','stun']));
register('kunkka_torrent',program(c=>{const x=c.target.x,y=c.target.y;c.delay(v(c,'DELAY'),()=>{for(const t of enemiesAt(c,x,y,radius(c))){hit(c,t);stun(c,t);slow(c,t,v(c,'MOVE SLOW'),v(c,'SLOW DURATION'));}});},['delayed ground area burst','stun','slow'],{remaining:['Damage tick subdivision and vertical animation','Super/Gaben']}));
register('custom_bristleback_quill_spray',program(c=>{for(const t of near(c,radius(c))){const old=t.statuses.find(s=>s.kind==='quillStack'&&s.source===c.caster.id)?.value??0;c.damage(t,Math.min(v(c,'MAX DAMAGE'),v(c,'QUILL BASE DAMAGE')+old*v(c,'QUILL STACK DAMAGE')),'physical');c.status(t,'quillStack',v(c,'STACK DURATION'),old+balanceNumber(c,'skill_effects.quillstack_amount.1',1),{harmful:true});}},['stacking physical area damage'],{target:'self',canCast:c=>near(c,radius(c)).length>0}));
register('custom_ursa_earthshock',program(c=>{for(const t of near(c,radius(c))){hit(c,t);slow(c,t,v(c,'MOVEMENT SLOW'),balanceNumber(c,'skill_effects.slow_duration.1',4));c.status(t,'attackSpeed',balanceNumber(c,'skill_effects.attackspeed_duration.1',4),v(c,'ATTACK SLOW'),{harmful:true});}},['area damage','movement and attack slow'],{target:'self',canCast:c=>near(c,radius(c)).length>0,remaining:['Leap and slow duration','Super/Gaben']}));
register('custom_huskar_inner_fire',program(c=>{for(const t of near(c,radius(c))){hit(c,t);c.status(t,'disarm',duration(c),0,{harmful:true});}},['area damage','disarm'],{target:'self',canCast:c=>near(c,radius(c)).length>0,remaining:['Knockback','Super/Gaben']}));
register('custom_lina_dragon_slave',program(c=>{const dx=c.target.x-c.caster.x,dy=c.target.y-c.caster.y,len=Math.hypot(dx,dy)||1;for(const t of c.enemies()){const along=((t.x-c.caster.x)*dx+(t.y-c.caster.y)*dy)/len;const across=Math.abs((t.x-c.caster.x)*dy-(t.y-c.caster.y)*dx)/len;if(along>=0&&along<=10.75&&across<=1.5)hit(c,t);}},['directional line damage'],{remaining:['Projectile travel and exact width/range','Super/Gaben']}));
register('custom_magnataur_shockwave',program(c=>{const dx=c.target.x-c.caster.x,dy=c.target.y-c.caster.y,l=Math.hypot(dx,dy)||1;for(const t of c.enemies()){const a=((t.x-c.caster.x)*dx+(t.y-c.caster.y)*dy)/l,p=Math.abs((t.x-c.caster.x)*dy-(t.y-c.caster.y)*dx)/l;if(a>=0&&a<=units(v(c,'DISTANCE'))&&p<=units(v(c,'WIDTH'))){hit(c,t);slow(c,t,v(c,'SLOW'),v(c,'SLOW DURATION'));}}},['line damage','slow'],{remaining:['Travel and pull','Super/Gaben']}));

// Healing, dispels and defensive casts.
register('omniknight_purification',program(c=>{c.heal(c.target,v(c,'HEAL/DAMAGE'));for(const t of enemiesAt(c,c.target.x,c.target.y,units(v(c,'DAMAGE RADIUS'))))hit(c,t,'HEAL/DAMAGE','pure');},['ally heal','pure damage around ally'],{target:'ally',canCast:c=>c.target.hp<c.target.maxHp*.8}));
register('custom_necrolyte_death_pulse',program(c=>{for(const t of near(c,radius(c)))hit(c,t);for(const t of c.allies().filter(x=>dist(x,c.caster)<=radius(c)))c.heal(t,v(c,'HEAL'));},['area ally heal','area enemy damage'],{target:'self',canCast:c=>near(c,radius(c)).length>0||c.allies().some(x=>x.hp<x.maxHp*.7&&dist(x,c.caster)<=radius(c))}));
register('legion_commander_press_the_attack',program(c=>{c.dispel(c.target,true);c.status(c.target,'regen',duration(c),v(c,'HP REGEN'));c.status(c.target,'attackSpeed',duration(c),v(c,'BONUS ATTACK SPEED'));},['strong dispel','regeneration','attack speed'],{target:'ally'}));
register('custom_omniknight_repel',program(c=>{c.dispel(c.target,true);c.status(c.target,'regen',duration(c),v(c,'HP REGEN'));c.status(c.target,'statusResistance',duration(c),percent(v(c,'STATUS RESISTANCE')));},['strong dispel','regeneration','status resistance'],{target:'ally',remaining:['Strength mapping to custom professions','Super/Gaben']}));
register('custom_omniknight_guardian_angel',program(c=>{for(const t of c.allies().filter(x=>dist(x,c.caster)<=radius(c)))c.status(t,'physicalImmune',duration(c));},['area physical immunity'],{target:'self',canCast:c=>near(c,8).length>0}));
register('custom_winter_wyvern_cold_embrace',program(c=>{c.status(c.target,'physicalImmune',duration(c));c.status(c.target,'selfStun',duration(c));c.status(c.target,'regen',duration(c),v(c,'BASE HEAL PER SECOND')+c.target.maxHp*percent(v(c,'MAX HEAL PER SECOND')));},['physical immunity','ally immobilization','flat and max-health regeneration'],{target:'ally',canCast:c=>c.target.hp<c.target.maxHp*.5}));
register('chen_hand_of_god',program(c=>{for(const t of c.allies()){c.heal(t,v(c,'INITIAL HEAL'));c.status(t,'regen',balanceNumber(c,'skill_effects.regen_duration.1',8),v(c,'HEAL PER SECOND'));}},['team-wide heal','regeneration'],{target:'self',canCast:c=>c.allies().some(t=>t.hp<t.maxHp*.6),remaining:['Regeneration duration absent from supplied values','Super/Gaben']}));
register('keeper_of_the_light_chakra_magic',program(c=>{c.mana(c.target,v(c,'MANA RESTORE'));c.target.cooldowns=c.target.cooldowns.map(end=>Math.max(c.battle.time,end-v(c,'COOLDOWN REDUCTION')));},['ally mana restoration','cooldown reduction'],{target:'ally',canCast:c=>c.target.mana<c.target.maxMana*.5,remaining:['Exclude ultimate cooldowns per reference version','Super/Gaben','targeting priority']}));
register('custom_life_stealer_rage',program(c=>{const d=duration(c)+(c.skill.points>=6?2:0);c.dispel(c.caster);c.status(c.caster,'magicImmune',d);c.status(c.caster,'haste',d,percent(v(c,'MOVE SPEED BONUS')+(c.skill.points>=6?20:0)));},['basic self dispel','spell immunity','Super duration/movement bonuses','Gaben cooldown reduction'],{target:'self',canCast:c=>near(c,8).length>0,cooldown:c=>Math.max(.2,arrayValue(c.definition.cooldowns,c.skill.points)-(c.skill.points>=9?12:0)),superImplemented:true,gabenImplemented:true,remaining:['Exact dispel/immunity matrix for target patch','Super retained at Gaben is an explicit working interpretation']}));
register('custom_windrunner_windrun',program(c=>{c.status(c.caster,'evasion',duration(c),percent(v(c,'EVASION')));c.status(c.caster,'haste',duration(c),percent(v(c,'MOVE SPEED BONUS')));c.zone({follow:true,radius:units(v(c,'ENEMY SLOW RADIUS')),duration:duration(c),interval:balanceNumber(c,'skill_effects.interval.1',0.2),effect:t=>slow(c,t,v(c,'ENEMY SLOW'),balanceNumber(c,'skill_effects.slow_duration.1',0.3))});},['evasion','haste','nearby slow'],{target:'self',canCast:c=>near(c,8).length>0}));
register('abaddon_borrowed_time',program(c=>{c.dispel(c.caster,true);c.status(c.caster,'borrowedTime',duration(c),balanceNumber(c,'skill_effects.borrowedtime_amount.1',1),{dispel:'none'});},['strong dispel','damage converted to healing'],{target:'self',castPoint:0,canCast:c=>c.caster.hp<v(c,'HEALTH THRESHOLD'),remaining:['Automatic activation while disabled','Ally transfer and upgrades']}));
register('custom_abaddon_aphotic_shield',program(c=>{c.dispel(c.target,true);c.status(c.target,'shield',duration(c),v(c,'MAX DAMAGE ABSORBED'),{remaining:v(c,'MAX DAMAGE ABSORBED'),data:{burstRadius:units(v(c,'BURST RADIUS')),burstDamage:v(c,'MAX DAMAGE ABSORBED')}});},['strong dispel','damage absorption','shield burst'],{target:'ally'}));
register('templar_assassin_refraction',program(c=>{c.status(c.caster,'refraction',duration(c),v(c,'INSTANCES'),{remaining:v(c,'INSTANCES')});c.status(c.caster,'attackBonus',duration(c),v(c,'BONUS DAMAGE'));},['finite damage-negating charges','attack bonus'],{target:'self',remaining:['Separate attack-bonus charges','damage threshold','Super/Gaben']}));
register('puck_phase_shift',program(c=>{c.status(c.caster,'invulnerable',duration(c));},['channeled invulnerability'],{target:'self',channel:c=>duration(c),canCast:c=>c.caster.hp<c.caster.maxHp*.5,remaining:['Automated dodge timing','Super/Gaben']}));
register('treant_living_armor',program(c=>{for(const t of c.skill.points>=9?c.allies():[c.target]){c.status(t,'armor',duration(c),(skillBalance(c.definition,c.skill.points)?v(c,"BONUS ARMOR"):(((v(c,'BONUS ARMOR')+(c.skill.points>=6?balanceNumber(c,'skill_effects.armor_amount.1',8):0))))));c.status(t,'regen',duration(c),(skillBalance(c.definition,c.skill.points)?v(c,"HEAL PER SECOND"):(((v(c,'HEAL PER SECOND')+(c.skill.points>=6?balanceNumber(c,'skill_effects.regen_amount.1',20):0))))));}},['ally armor','regeneration','Super armor/heal bonuses','Gaben whole-team cast'],{target:'ally',superImplemented:true,gabenImplemented:true,remaining:['Exact target selection and cast timing','Super retained at Gaben is an explicit working interpretation']}));

// Team buffs and attack buffs. Numeric keys come from the captured catalog.
register('ogre_magi_bloodlust',program(c=>{c.status(c.target,'attackSpeed',duration(c),v(c,c.target.id===c.caster.id?'SELF BONUS ATTACK SPEED':'BONUS ATTACK SPEED'));c.status(c.target,'haste',duration(c),percent(v(c,'BONUS MOVE SPEED')));},['ally attack speed','movement bonus'],{target:'ally'}));
register('custom_sven_warcry',program(c=>{const s=c.skill.points>=6,g=c.skill.points>=9,d=duration(c)+(s?3:0),r=radius(c)+(s?4:0);for(const t of c.allies().filter(x=>dist(x,c.caster)<=r)){const o:Partial<EffectStatus>={dispel:g?'none':'basic'};c.status(t,'armor',d,v(c,'BONUS ARMOR')+(s?balanceNumber(c,'skill_effects.armor_amount.1',10):0),o);c.status(t,'haste',d,percent(v(c,'BONUS SPEED')+(s?20:0)),o);if(g){const armor=t.armor+t.statuses.filter(x=>x.kind==='armor').reduce((n,x)=>n+(x.value??0),0);c.status(t,'attackBonus',d,armor*(t.id===c.caster.id?balanceNumber(c,'skill_effects.attackbonus_amount.1',4):balanceNumber(c,'skill_effects.attackbonus_amount.2',2)),o);}}},['area armor/movement','Super armor/duration/speed/radius','Gaben undispellable armor-based damage'],{target:'self',canCast:c=>near(c,10).length>0,superImplemented:true,gabenImplemented:true,remaining:['Armor-to-damage snapshot versus continuously recomputed reference behavior','Super retained at Gaben is an explicit working interpretation']}));
register('custom_sven_gods_strength',program(c=>c.status(c.caster,'attackPct',duration(c),percent(v(c,'BONUS DAMAGE'))),['attack-damage amplification'],{target:'self',canCast:c=>near(c,8).length>0}));
register('broodmother_insatiable_hunger',program(c=>{c.status(c.caster,'attackBonus',duration(c),v(c,'BONUS DAMAGE'));c.status(c.caster,'lifesteal',duration(c),percent(v(c,'LIFESTEAL')));},['attack damage','lifesteal'],{target:'self',canCast:c=>near(c,8).length>0}));
register('troll_warlord_battle_trance',program(c=>{const d=v(c,'TRANCE DURATION');c.status(c.caster,'undying',d);c.status(c.caster,'attackSpeed',d,v(c,'ATTACK SPEED'));c.status(c.caster,'lifesteal',d,percent(v(c,'LIFESTEAL')));c.status(c.caster,'haste',d,percent(v(c,'MOVEMENT SPEED')));},['minimum-one HP','attack speed','lifesteal','haste'],{target:'self',canCast:c=>c.caster.hp<c.caster.maxHp*.5,remaining:['Forced target/taunt behavior','Super/Gaben']}));
register('wisp_overcharge',program(c=>{const d=duration(c);c.status(c.caster,'attackSpeed',d,v(c,'ATTACK SPEED'));c.status(c.caster,'regen',d,c.caster.maxHp*percent(v(c,'MAX HEALTH REGEN')));c.status(c.caster,'spellAmp',d,percent(v(c,'SPELL AMPLIFICATION')));},['attack speed','max-health regeneration','spell amplification'],{target:'self',canCast:c=>near(c,8).length>0,remaining:['Tether sharing','Super/Gaben']}));
register('alchemist_chemical_rage',program(c=>{const d=duration(c);c.status(c.caster,'baseAttackTime',d,v(c,c.caster.range<=2?'BASE ATTACK TIME (MELEE)':'BASE ATTACK TIME (RANGED)'));c.status(c.caster,'regen',d,v(c,'BONUS HEALTH REGEN'));c.status(c.caster,'moveFlat',d,units(v(c,'BONUS MOVE SPEED')));},['base attack time replacement','regeneration','movement bonus'],{target:'self',canCast:c=>near(c,8).length>0}));
register('marci_guardian',program(c=>{for(const t of [c.caster,...c.allies().filter(t=>t.id!==c.caster.id).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster)).slice(0,1)]){c.status(t,'attackBonus',duration(c),v(c,'BONUS DAMAGE'));c.status(t,'lifesteal',duration(c),percent(v(c,'LIFESTEAL')));}},['caster and nearest ally buff','attack damage','lifesteal'],{target:'self'}));
register('custom_silencer_global_silence',program(c=>{for(const t of c.enemies())c.status(t,'silence',duration(c),0,{harmful:true,piercesImmunity:true});},['global silence'],{target:'self',canCast:c=>near(c,14).length>0}));

// Mobility: destinations are clamped by the simulation, with persistent unit identity.
register('custom_queenofpain_blink',program(c=>{const enemies=c.enemies();const t=enemies.sort((a,b)=>b.side*(b.y-a.y)||a.id.localeCompare(b.id))[0]??c.target;const range=units(v(c,'RANGE')),d=dist(c.caster,t),q=Math.min(1,range/Math.max(.01,d));c.warp(c.caster,c.caster.x+(t.x-c.caster.x)*q,c.caster.y+(t.y-c.caster.y)*q-c.caster.side*.7);},['bounded teleport toward backline'],{range:100,target:'enemy',remaining:['Damage/silence from Differences to Dota','precise target priority','Super/Gaben']}));
register('phantom_assassin_phantom_strike',program(c=>{c.warp(c.caster,c.target.x,c.target.y+(c.caster.side===0?-1:1)*.8);c.status(c.caster,'attackSpeed',duration(c),v(c,'BONUS ATTACK SPEED'));c.status(c.caster,'lifesteal',duration(c),percent(v(c,'LIFESTEAL')));},['targeted blink','attack speed','lifesteal'],{range:c=>units(v(c,'CAST RANGE'))}));
register('sandking_burrowstrike',program(c=>{const start={x:c.caster.x,y:c.caster.y};c.moveContinuous(c.caster,c.target.x,c.target.y,{duration:defaultMotionDuration()});for(const t of enemiesAt(c,c.target.x,c.target.y,1.5)){hit(c,t);stun(c,t);}},['targeted displacement','damage','stun'],{range:c=>units(v(c,'CAST RANGE')),remaining:['Swept path hit detection','Super/Gaben']}));
register('vengefulspirit_nether_swap',program(c=>{const x=c.caster.x,y=c.caster.y;c.warp(c.caster,c.target.x,c.target.y);c.warp(c.target,x,y);hit(c,c.target);c.status(c.caster,'damageReduction',v(c,'DAMAGE REDUCTION DURATION'),percent(v(c,'DAMAGE REDUCTION')));},['position swap','damage','caster damage reduction'],{range:c=>units(v(c,'CAST RANGE'))}));
register('custom_pudge_meat_hook',program(c=>c.projectile(c.target,balanceNumber(c,'skill_effects.projectile_speed.1',16),t=>{hit(c,t,'DAMAGE','pure');const dx=t.x-c.caster.x,dy=t.y-c.caster.y,d=Math.hypot(dx,dy)||1;c.moveContinuous(t,c.caster.x+dx/d,c.caster.y+dy/d,{duration:defaultMotionDuration()});}),['traveling hook','pure damage','pull'],{range:c=>units(v(c,'CAST RANGE')),remaining:['Nonhoming first-collision hook','travel interruption','Super/Gaben']}));
register('terrorblade_sunder',program(c=>{const a=c.caster.hp/c.caster.maxHp,b=c.target.hp/c.target.maxHp,min=percent(v(c,'MINIMUM HP SWAP'));c.caster.hp=c.caster.maxHp*Math.max(min,b);c.target.hp=c.target.maxHp*Math.max(min,a);},['health-fraction exchange'],{canCast:c=>c.caster.hp/c.caster.maxHp<.4&&c.target.hp/c.target.maxHp>.6,remaining:['Immunity/HP-removal semantics','Super/Gaben']}));
register('dark_seer_vacuum',program(c=>{for(const t of enemiesAt(c,c.target.x,c.target.y,radius(c))){hit(c,t);c.moveContinuous(t,c.target.x,c.target.y,{duration:defaultMotionDuration()});}},['area damage','pull to center'],{range:c=>units(v(c,'CAST RANGE')),remaining:['Pull duration and collision','Super/Gaben']}));

// Summons use actual individual simulation bodies, lifespan and owner attribution.
register('custom_furion_force_of_nature',program(c=>c.summon({name:'树人',count:v(c,'TREANT COUNT'),hp:v(c,'TREANT HEALTH'),attack:v(c,'TREANT DAMAGE'),lifetime:v(c,'TREANT DURATION'),armor:0,range:balanceNumber(c,'skill_effects.range.1',1),interval:balanceNumber(c,'skill_effects.interval.1',1.5),speed:balanceNumber(c,'skill_effects.speed.1',2.8)}),['summoned bodies','lifespan','owner damage attribution'],{target:'self',remaining:['Summon armor/attack/movement timing verification','Super/Gaben']}));
register('custom_lycan_summon_wolves',program(c=>c.summon({name:'狼',count:v(c,'WOLF COUNT'),hp:v(c,'HP'),attack:v(c,'DAMAGE'),lifetime:duration(c),interval:v(c,'BASE ATTACK TIME'),range:balanceNumber(c,'skill_effects.range.1',1),speed:balanceNumber(c,'skill_effects.speed.1',4)}),['two independent wolves','lifespan','attack interval'],{target:'self',remaining:['Wolf passives and movement stats','Super/Gaben']}));
register('custom_visage_summon_familiars',program(c=>c.summon({name:'佣兽',count:v(c,'FAMILIAR COUNT'),hp:v(c,'FAMILIAR MAX HEALTH'),attack:v(c,'FAMILIAR ATTACK DAMAGE'),armor:v(c,'FAMILIAR ARMOR'),lifetime:balanceNumber(c,'skill_effects.lifetime.1',120),interval:balanceNumber(c,'skill_effects.interval.1',1),range:balanceNumber(c,'skill_effects.range.1',1.5),speed:balanceNumber(c,'skill_effects.speed.1',3.5)}),['independent familiars'],{target:'self',remaining:['Stone form and familiar behavior','Super/Gaben']}));
register('custom_beastmaster_call_of_the_wild',program(c=>c.summon({name:'豪猪',count:balanceNumber(c,'skill_effects.count.1',1),hp:v(c,'BOAR HEALTH'),attack:v(c,'BOAR ATTACK DAMAGE'),lifetime:v(c,'SUMMON DURATION'),range:balanceNumber(c,'skill_effects.range.1',5),interval:balanceNumber(c,'skill_effects.interval.1',1.5),speed:balanceNumber(c,'skill_effects.speed.1',3)}),['boar body','lifespan'],{target:'self',remaining:['Hawk','boar poison','Super/Gaben']}));
register('custom_venomancer_plague_ward',program(c=>c.summon({name:'瘟疫守卫',count:v(c,'WARD COUNT'),hp:v(c,'WARD HP'),attack:v(c,'WARD DAMAGE'),lifetime:duration(c),range:balanceNumber(c,'skill_effects.range.1',6),interval:balanceNumber(c,'skill_effects.interval.1',1.5),speed:0}),['stationary attack ward','lifespan'],{target:'self',remaining:['Poison and immunities','Super/Gaben']}));
register('custom_naga_siren_mirror_image',program(c=>{c.dispel(c.caster);c.summon({name:'镜像',count:v(c,'IMAGE COUNT'),hp:c.caster.maxHp,attack:c.caster.attack*percent(v(c,'IMAGE DAMAGE')),armor:c.caster.armor,lifetime:v(c,'IMAGE DURATION'),illusion:true,damageTaken:percent(v(c,'IMAGE DAMAGE TAKEN')),inheritsSkills:false});},['three independent illusions','incoming/outgoing damage','basic dispel'],{target:'self',remaining:['Illusion stat and ability inheritance','invulnerability frame','Super/Gaben']}));

// Passives are event-driven; no hidden free active spell is substituted.
register('custom_dragon_knight_dragon_blood',passive({init:c=>{if(!c.caster.illusion)c.status(c.caster,'armor',1e6,v(c,'ARMOR')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?12:0),{dispel:'none'});c.status(c.caster,'regen',1e6,v(c,'HEALTH REGEN')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?12:0),{dispel:'none'});},superImplemented:true,remaining:['Gaben historical Breathe Fire patch match and exact attack-received reaction timing']},['undispellable passive armor and health regeneration suppressed by Break','illusions receive regeneration without passive bonus armor','Super final +12 armor/regeneration profile']));
register('custom_sniper_take_aim',passive({init:c=>flag(c,'range',units(v(c,'BONUS RANGE')))},['attack range bonus']));
register('custom_phantom_assassin_coup_de_grace',passive({attackModifier:c=>({multiplier:c.random()<percent(v(c,'CRITICAL CHANCE'))?percent(v(c,'CRITICAL DAMAGE')):1})},['seeded critical hit']));
register('clinkz_searing_arrows',passive({attackModifier:c=>({bonus:v(c,'BONUS DAMAGE')})},['attack bonus'],));
register('custom_slardar_bash_of_the_deep',passive({onAttack:c=>{const key='bash:'+c.skill.id;const n=Number(c.caster[key]??0)+1;c.caster[key]=n;if(n%v(c,'MELEE ATTACK COUNT',balanceNumber(c,'skill_effects.melee_attack_count_fallback.1',4))===0){hit(c,c.target,'BONUS DAMAGE','physical');stun(c,c.target,'BASH DURATION');}}},['every-fourth attack bash']));
function timeLock(c:EffectContext,t:CombatUnit){c.damage(t,v(c,'BONUS DAMAGE')+(c.skill.points>=6?70:0));c.status(t,'stun',duration(c),0,{harmful:true,dispel:'strong'});c.delay(.1,()=>c.attack(t,1,false));}
register('faceless_void_time_lock',passive({onAttack:c=>{if(c.random()<percent(v(c,'CHANCE')+(c.skill.points>=6?4:0)))timeLock(c,c.target);},init:c=>{if(c.skill.points>=9)c.zone({follow:true,radius:balanceNumber(c,'skill_effects.radius.1',4.5),duration:balanceNumber(c,'skill_effects.duration.1',120),interval:balanceNumber(c,'skill_effects.interval.1',4),effect:t=>timeLock(c,t)});},superImplemented:true,gabenImplemented:true,remaining:['Second-strike delay 0.1s and attack-modifier recursion rules need reference verification']},['seeded bash','bonus damage and second attack','Super damage/proc increase','Gaben four-second area Time Lock']));
register('life_stealer_feast',passive({onAttack:c=>{const n=c.target.maxHp*percent(v(c,'MAX HEALTH DAMAGE'));c.damage(c.target,n,'physical');c.heal(c.caster,c.target.maxHp*percent(v(c,'MAX HEALTH LIFE STEAL')),'lifesteal');}},['target-max-health damage','self healing']));
register('antimage_mana_break',passive({onAttack:c=>{const n=Math.min(c.target.mana,v(c,'MANA BURNED PER HIT')+c.target.maxMana*percent(v(c,'MAX MANA BURNED PER HIT')));c.mana(c.target,-n);c.damage(c.target,n*percent(v(c,'MANA BURNED AS DAMAGE')),'physical');if(c.target.mana===0)slow(c,c.target,v(c,'MOVE SPEED SLOW ON FULL DRAIN'),v(c,'SLOW DURATION'));}},['mana burn','burn-based physical damage','empty-mana slow']));
register('ursa_fury_swipes',passive({onAttack:c=>{const d=c.skill.points>=6?120:v(c,'RESET TIME'),s=c.target.statuses.find(s=>s.kind==='furySwipes'&&s.source===c.caster.id),n=(s?.value??0)+1;c.status(c.target,'furySwipes',d,n,{harmful:true,dispel:'none'});c.damage(c.target,n*(skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE PER ATTACK"):((((v(c,'DAMAGE PER ATTACK')+(c.skill.points>=6?balanceNumber(c,'skill_effects.damage.1',12):0)))))),'physical');if(c.skill.points>=9){const key=`furyAttacks:${c.target.id}`;c.caster[key]=Number(c.caster[key]??0)+1;if(Number(c.caster[key])%2===0)for(const t of c.enemies().filter(t=>t.id!==c.target.id)){const stacks=t.statuses.find(s=>s.kind==='furySwipes'&&s.source===c.caster.id)?.value??0;c.status(t,'furySwipes',d,stacks+balanceNumber(c,'skill_effects.furyswipes_amount.1',1),{harmful:true,dispel:'none'});}}},superImplemented:true,gabenImplemented:true,remaining:['Attack damage categorization and summoned-unit interactions need reference verification']},['per-target stacking damage','Super round-long stacks and +12 damage','Gaben every-second-attack global extra stack']));
register('troll_warlord_fervor',passive({onAttack:c=>{const previous=c.caster.statuses.find(s=>s.kind==='fervorCounter'&&s.source===c.caster.id&&s.skill===c.skill.id&&s.until>c.battle.time)?.value??0;let stacks=c.skill.points>=9||c.caster.fervorTarget===c.target.id?previous+1:1;c.caster.fervorTarget=c.target.id;stacks=Math.min(stacks,v(c,'MAX STACKS'));c.caster.fervorStacks=stacks;c.status(c.caster,'fervorCounter',1e6,stacks,{dispel:'strong'});c.status(c.caster,'attackSpeed',1e6,stacks*(v(c,'ATTACK SPEED PER STACK')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?15:0)),{dispel:'strong'});},superImplemented:true,gabenImplemented:true,remaining:['Historical Wiki attack-point counting conflicts with current landed-hit counting; exact AA miss/disjoint version unresolved','First switched-target attack retaining one new stack is an explicit pending interpretation']},['same-target successful-hit attack-speed stacks and cap','AA strong dispel removes both bonus and counter','Break suppresses existing attack speed and new stack gain','Super final speed per stack','Gaben retains stacks on target switch']));
register('custom_huskar_burning_spear',passive({passive:false,onAttack:c=>{c.caster.hp=Math.max(1,c.caster.hp*(1-percent(v(c,'CURRENT HEALTH COST'))));const targets=[c.target,...(c.skill.points>=6?near(c,4).filter(t=>t.id!==c.target.id):[])];for(const t of targets)c.status(t,'dot',duration(c),v(c,'BURN DAMAGE PER SECOND'),{harmful:true,damageType:c.skill.points>=9?'pure':'magical',interval:balanceNumber(c,'skill_effects.interval.1',1),maxStacks:balanceNumber(c,'skill_effects.maxstacks.1',100),piercesImmunity:c.skill.points>=9});},superImplemented:true,gabenImplemented:true,remaining:['Attack orb activation/silence interactions and first damage tick require reference verification']},['single health cost per attack','independent burning damage stacks','Super attacker-centered area stacks','Gaben pure damage and spell-immunity piercing']));
register('custom_lina_fiery_soul',passive({onCast:c=>{const s=c.caster.statuses.find(s=>s.kind==='fierySoul'),n=Math.min(c.skill.points>=9?Infinity:v(c,'MAX STACKS'),(s?.value??0)+(c.skill.points>=9?2:1));c.status(c.caster,'fierySoul',duration(c),n);flag(c,'attackSpeed',n*(v(c,'ATTACK SPEED BONUS')+(c.skill.points>=6?20:0)),duration(c));flag(c,'haste',n*percent(v(c,'MOVE SPEED BONUS')+(c.skill.points>=6?2:0)),duration(c));},superImplemented:true,gabenImplemented:true,remaining:['Granted casts, toggles and multi-cast eligibility require reference verification']},['cast-triggered attack/movement speed stacks','Super speed bonuses','Gaben uncapped double stacks']));
register('bristleback_warpath',passive({onCast:c=>{const s=c.caster.statuses.find(s=>s.kind==='warpath'),n=Math.min(v(c,'MAX STACKS')+(c.skill.points>=9?5:0),(s?.value??0)+(c.skill.points>=9?2:1));c.status(c.caster,'warpath',v(c,'STACK DURATION'),n);flag(c,'attackBonus',n*v(c,'DAMAGE PER STACK'),v(c,'STACK DURATION'));flag(c,'haste',n*percent(v(c,'MOVEMENT PER STACK')),v(c,'STACK DURATION'));if(c.skill.points>=6)flag(c,'lifesteal',n*.05,v(c,'STACK DURATION'));},superImplemented:true,gabenImplemented:true,remaining:['Independent stack expiry versus refresh and granted-cast eligibility require reference verification']},['cast-triggered damage/movement stacks','Super per-stack lifesteal','Gaben +5 maximum and double cast stacks']));
register('custom_obsidian_destroyer_equilibrium',passive({init:c=>{if(c.skill.points>=6){flag(c,'range',3);flag(c,'castRange',3);}if(c.skill.points>=9)c.zone({follow:true,radius:balanceNumber(c,'skill_effects.radius.1',0.1),duration:balanceNumber(c,'skill_effects.duration.1',120),interval:balanceNumber(c,'skill_effects.interval.1',0.1),targets:'all',effect:t=>{if(t.id===c.caster.id)flag(c,'spellAmp',c.caster.mana/Math.max(1,c.caster.maxMana),.15);}});},onCast:c=>{if(c.random()<percent(v(c,'CHANCE')))c.mana(c.caster,c.caster.maxMana*percent(v(c,'MAX MANA RESTORE')));},superImplemented:true,gabenImplemented:true,remaining:['Mana-ratio buff currently refreshed each 0.1s','Super retained at Gaben is an explicit working interpretation']},['seeded mana restore on cast','Super cast/attack range','Gaben remaining-mana spell amplification']));
function helix(c:EffectContext,outgoing=false){const key=outgoing?'helixAttackReady':'helixDefendReady';if(Number(c.caster[key]??0)>c.battle.time||c.random()>=percent(v(c,'CHANCE TO HELIX')+(c.skill.points>=9?10:0)))return;c.caster[key]=c.battle.time+arrayValue(c.definition.cooldowns,c.skill.points,.3);addVisualWorldEffect(c.battle,{source:c.caster.id,skill:c.skill.id,points:c.skill.points,layer:'helix',x:c.caster.x,y:c.caster.y,until:c.battle.time+16/24,kind:'proc',loop:false});for(const t of near(c,radius(c))){c.damage(t,v(c,'DAMAGE')+(c.skill.points>=6?120:0),'pure');if(c.skill.points>=9)c.status(t,'outgoingDamageReduction',120,.15,{harmful:true,maxStacks:6,data:{targetId:c.caster.id}});}}
register('custom_axe_counter_helix',passive({onAttacked:c=>helix(c),onAttack:c=>{if(c.skill.points>=6)helix(c,true);},superImplemented:true,gabenImplemented:true,remaining:['Gaben debuff duration absent: current-battle duration working value','Seeded uniform proc versus original pseudo-random distribution']},['incoming-attack seeded area pure damage','Super independent outgoing-attack cooldown and damage','Gaben victim-specific stacking damage reduction/proc bonus']));
register('shredder_reactive_armor',passive({onAttacked:c=>{const s=c.caster.statuses.find(s=>s.kind==='reactiveArmor'),n=Math.min(v(c,'MAX STACKS')+(c.skill.points>=6?12:0),(s?.value??0)+(c.target.summoned?1:2)),d=v(c,'STACK DURATION')+(c.skill.points>=6?6:0);c.status(c.caster,'reactiveArmor',d,n);flag(c,'armor',n*v(c,'BONUS ARMOR'),d);flag(c,'regen',n*v(c,'BONUS HP REGEN'),d);},superImplemented:true,remaining:['Gaben Whirling Death child ability missing from source catalog','Independent per-stack expiry versus shared refresh requires reference verification']},['incoming-attack armor/regeneration stacks','double stacks from heroes','Super stack limit/duration increase']));
register('tidehunter_kraken_shell',passive({init:c=>flag(c,'block',(skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE BLOCK"):(((v(c,'DAMAGE BLOCK')+(c.skill.points>=6?40:0)))))),onDamage:c=>{const key='krakenDamage';if(c.battle.time-Number(c.caster.krakenLastDamage??0)>v(c,'THRESHOLD TIMER'))c.caster[key]=0;c.caster.krakenLastDamage=c.battle.time;c.caster[key]=Number(c.caster[key]??0)+(c.amount??0);if(Number(c.caster[key])>=(skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE THRESHOLD"):(((v(c,'DAMAGE THRESHOLD')-(c.skill.points>=6?100:0)))))){c.dispel(c.caster,true);c.caster[key]=0;}if(c.skill.points>=9&&c.target.side!==c.caster.side)c.damage(c.target,(c.amount??0)*balanceNumber(c,'skill_effects.damage.1',0.35),c.damageType);},superImplemented:true,gabenImplemented:true,remaining:['Gaben reflection damage basis and reflection flags require exact reference','Damage-threshold inclusion rules and lethal-hit interactions']},['flat attack damage block','damage-threshold strong dispel with idle timer','Super block/threshold improvements','Gaben incoming-damage reflection']));
function corrosive(c:EffectContext,t:CombatUnit){dot(c,t,v(c,'DAMAGE PER SECOND'),duration(c));c.status(t,'attackSpeed',duration(c),-v(c,'ATTACK SLOW')*(c.skill.points>=6?2:1),{harmful:true});}
register('viper_corrosive_skin',passive({init:c=>{flag(c,'magicResist',percent(v(c,'MAGIC RESISTANCE'))*(c.skill.points>=6?2:1));if(c.skill.points>=9)c.zone({follow:true,radius:balanceNumber(c,'skill_effects.radius.1',12),duration:balanceNumber(c,'skill_effects.duration.1',120),interval:balanceNumber(c,'skill_effects.interval.1',0.5),effect:t=>corrosive(c,t)});},onDamage:c=>{if(c.target.id!==c.caster.id&&dist(c.caster,c.target)<=units(v(c,'MAX RANGE RADIUS')))corrosive(c,c.target);},superImplemented:true,gabenImplemented:true,remaining:['Aura first tick and resistance stacking need reference verification']},['magic resistance','damage-triggered poison/attack slow','Super double slow/resistance','Gaben twelve-world-unit poison aura']));
register('custom_spectre_dispersion',passive({init:c=>flag(c,'damageReduction',percent(v(c,'DAMAGE REFLECTED'))),onDamage:c=>{for(const t of near(c,units(v(c,'MAX RADIUS')))){const d=dist(t,c.caster),min=units(v(c,'MIN RADIUS')),max=units(v(c,'MAX RADIUS'));c.damage(t,(c.amount??0)*percent(v(c,'DAMAGE REFLECTED'))*Math.max(0,balanceNumber(c,'skill_effects.damage.1',1)-Math.max(0,d-min)/(max-min)),c.damageType);}}},['damage reduction','distance-weighted reflection'],));
register('custom_medusa_mana_shield',passive({init:c=>{c.caster.maxMana+=v(c,'BONUS MANA');c.caster.mana+=v(c,'BONUS MANA');flag(c,'manaShield',percent(v(c,'DAMAGE ABSORBED')));flag(c,'damagePerMana',v(c,'DAMAGE PER MANA'));}},['mana-funded absorption','bonus mana']));
register('tiny_grow',passive({init:c=>{flag(c,'armor',v(c,'BONUS ARMOR'));flag(c,'attackBonus',(skillBalance(c.definition,c.skill.points)?v(c,"BONUS DAMAGE"):(((v(c,'BONUS DAMAGE')+(c.skill.points>=6?51:0))))));if(c.skill.points<6)flag(c,'attackSpeed',v(c,'ATTACK SPEED REDUCTION'));if(c.skill.points>=9)flag(c,'statusResistance',.3);},onAttacked:c=>{if(c.skill.points>=9&&c.random()<balanceNumber(c,'skill_effects.trigger_chance.1',0.3))c.status(c.target,'stun',balanceNumber(c,'skill_effects.stun_duration.1',2),0,{harmful:true,dispel:'strong'});},superImplemented:true,gabenImplemented:true,remaining:['Toss/tree synergy and incoming-attack Belch range/trigger rules need reference verification']},['armor','attack damage','base attack speed penalty','Super removes penalty and adds damage','Gaben status resistance and seeded retaliatory stun']));
register('custom_lycan_feral_impulse',passive({init:c=>{flag(c,'attackPct',percent(v(c,'BONUS DAMAGE')));flag(c,'regen',v(c,'BONUS HP REGEN'));}},['caster damage and regeneration'],));
register('custom_chaos_knight_chaos_strike',passive({attackModifier:c=>{const crit=c.random()<percent(v(c,'CHANCE'));c.caster.chaosCrit=crit;return {multiplier:crit?percent(v(c,'CRITICAL MIN')+c.random()*(v(c,'CRITICAL MAX')-v(c,'CRITICAL MIN'))):1};},onAttack:c=>{if(c.caster.chaosCrit)c.heal(c.caster,(c.amount??0)*percent(v(c,'CRITICAL LIFESTEAL')));}},['seeded variable crit','critical lifesteal']));

// Remaining complex families keep explicit state and retain their evidence gaps.
register('custom_elder_titan_ancestral_spirit',program(c=>{
  const targets=enemiesAt(c,c.target.x,c.target.y,radius(c));let armor=0,attack=0,speed=0;
  for(const t of targets){hit(c,t);armor+=v(c,t.summoned?'BONUS ARMOR (CREEPS)':'BONUS ARMOR (HEROES)');attack+=v(c,t.summoned?'BONUS DAMAGE (CREEPS)':'BONUS DAMAGE (HEROES)');speed+=percent(v(c,t.summoned?'BONUS SPEED (CREEPS)':'BONUS SPEED (HEROES)'));}
  c.delay(balanceNumber(c,'skill_effects.delay.1',0.5),()=>{flag(c,'armor',armor,v(c,'BUFF DURATION'));flag(c,'attackBonus',attack,v(c,'BUFF DURATION'));flag(c,'haste',speed,v(c,'BUFF DURATION'));});
},['spirit contact damage','per-hero/creep return armor, attack and speed buffs'],{remaining:['Spirit movement, independent entity and actual return duration','Super/Gaben','exact target AI']}));
register('custom_undying_decay',program(c=>{
  const x=c.target.x,y=c.target.y,steal=v(c,'STRENGTH STEAL')+(c.skill.points>=6?6:0);
  const pulse=()=>{const targets=enemiesAt(c,x,y,radius(c));let count=0;for(const t of targets){hit(c,t,'BASE DAMAGE');if(t.summoned)continue;count++;c.status(t,'strength',v(c,'STEAL DURATION'),-steal,{harmful:true,dispel:'strong',maxStacks:balanceNumber(c,'skill_effects.maxstacks.1',100)});}c.status(c.caster,'strength',v(c,'STEAL DURATION'),count*steal,{dispel:'none',maxStacks:balanceNumber(c,'skill_effects.maxstacks.2',100)});};pulse();if(c.skill.points>=9){c.delay(balanceNumber(c,'skill_effects.delay.1',3),pulse);c.delay(balanceNumber(c,'skill_effects.delay.2',6),pulse);}
},['area magical damage','timed hero strength transfer','project profession strength-derived totals','Super +6 steal and -1s cooldown','Gaben two additional fixed-location pulses'],{cooldown:c=>arrayValue(c.definition.cooldowns,c.skill.points)-(c.skill.points>=6?1:0),superImplemented:true,gabenImplemented:true,remaining:['Project attribute conversion requires reference-version validation; strength regen not assigned','Dispel and target-stat minimum interactions require reference']}));
function persistentAttribute(c:EffectContext,attribute:'agility'|'intelligence',increment=0){
  const key=`${c.skill.id}:${attribute}`,state=(c.caster.skillState??{}) as Record<string,number>,gains=(c.caster.permanentSkillGains??{}) as Record<string,number>;
  if(increment){state[key]=(state[key]??0)+increment;gains[key]=(gains[key]??0)+increment;}
  c.caster.skillState=state;c.caster.permanentSkillGains=gains;c.status(c.caster,attribute,1e6,state[key]??0,{skill:`${c.skill.id}:persistent`,passive:false,dispel:'none'});
}
function essenceShift(c:EffectContext){
  if(c.target.summoned||c.target.dead||c.target.side===c.caster.side)return;
  const d=v(c,'STACK DURATION');c.status(c.caster,'agility',d,v(c,'AGILITY GAIN'),{maxStacks:balanceNumber(c,'skill_effects.maxstacks.1',100),dispel:'none'});
  for(const kind of ['strength','agility','intelligence'])c.status(c.target,kind,d,-v(c,'ALL ATTRIBUTE LOSS'),{harmful:true,dispel:'strong',maxStacks:balanceNumber(c,'skill_effects.maxstacks.2',100),piercesImmunity:true});
  c.status(c.target,'essenceShift',d,0,{harmful:true,dispel:'strong',piercesImmunity:true});
}
register('custom_slark_essence_shift',passive({init:c=>persistentAttribute(c,'agility'),onAttack:essenceShift,onDealDamage:c=>{if(c.skill.points<9||!c.triggerSkillId)return;const key=`essenceSpell:${c.triggerSkillId}:${c.target.id}`;if(Number(c.caster[key]??-1)>c.battle.time)return;c.caster[key]=c.battle.time+1;essenceShift(c);},onUnitDeath:c=>{if(c.skill.points<6||c.target.side===c.caster.side||!c.target.statuses.some(s=>s.kind==='essenceShift'&&s.source===c.caster.id))return;persistentAttribute(c,'agility',2);},superImplemented:true,gabenImplemented:true,remaining:['Project attribute conversions and exact spell-proc eligibility need reference verification','Illusion/passive break/permanent reward eligibility requires reference']},['per-attack timed attribute transfer','Super affected-kill persistent agility','Gaben per-spell per-victim one-second proc lock']));
register('custom_silencer_glaives_of_wisdom',passive({init:c=>persistentAttribute(c,'intelligence'),onAttack:c=>{
  const cost=arrayValue(c.definition.mana,c.skill.points);if(c.caster.mana<cost)return;c.mana(c.caster,-cost);
  const intellect=Number(c.caster.intelligence??0);c.damage(c.target,Math.max(0,intellect)*percent((skillBalance(c.definition,c.skill.points)?v(c,"INT TO DAMAGE"):(((v(c,'INT TO DAMAGE')+(c.skill.points>=9?15:0)))))),'pure');
  c.status(c.caster,'intelligence',v(c,'INT STEAL DURATION'),v(c,'INT STEAL'),{maxStacks:balanceNumber(c,'skill_effects.maxstacks.1',100),dispel:'none'});c.status(c.target,'intelligence',v(c,'INT STEAL DURATION'),-v(c,'INT STEAL'),{harmful:true,maxStacks:balanceNumber(c,'skill_effects.maxstacks.2',100),dispel:'none'});
  if(c.skill.points>=9){const target=c.enemies().filter(t=>t.id!==c.target.id&&dist(t,c.target)<=5).sort((a,b)=>dist(a,c.target)-dist(b,c.target))[0];if(target)c.attack(target,balanceNumber(c,'skill_effects.attack_multiplier.1',0.5),false);}
},passive:false,onUnitDeath:c=>{if(c.skill.points<6||c.target.side===c.caster.side||c.target.summoned||dist(c.target,c.caster)>9.25)return;persistentAttribute(c,'intelligence',2);},superImplemented:true,gabenImplemented:true,remaining:['Project intelligence-to-mana conversion requires reference-version validation','Gaben bounce radius 500 is provisional and secondary attack modifiers require reference','Death reward summon/illusion eligibility requires reference']},['intelligence-scaled pure attack damage','orb mana payment','timed intelligence transfer','Super nearby-death persistent intelligence','Gaben damage scaling and half-damage secondary attack']));
register('custom_treant_leech_seed',program(c=>{
  const target=c.target,d=duration(c);slow(c,target,v(c,'MOVEMENT SLOW'),d);c.status(target,'leechSeed',d+balanceNumber(c,'skill_effects.leechseed_duration.1',0.1),0,{harmful:true});
  for(let i=1;i<=d;i++)c.delay(i,()=>{if(target.dead||!target.statuses.some(s=>s.kind==='leechSeed'&&s.source===c.caster.id))return;hit(c,target,'DAMAGE PER SECOND');for(const ally of c.allies().filter(t=>dist(t,target)<=radius(c)))c.heal(ally,v(c,'DAMAGE PER SECOND'));});
},['dispellable timed damage','pulsing healing around victim','movement slow']));
register('nyx_assassin_spiked_carapace',program(c=>c.status(c.caster,'spikedCarapace',v(c,'REFLECT DURATION'),percent(v(c,'DAMAGE REFLECTED')),{data:{stunDuration:v(c,'STUN DURATION')}}),['one reflected damage instance per attacker','damage negation','attacker stun'],{target:'self',canCast:c=>near(c,10).length>0}));
register('custom_razor_static_link',program(c=>{
  const target=c.target,d=v(c,'LINK DURATION'),step=.1;let drained=0;
  for(let i=step;i<=d+1e-6;i+=step)c.delay(i,()=>{if(c.caster.dead||target.dead||dist(c.caster,target)>8)return;drained+=v(c,'DAMAGE DRAIN RATE')*step;c.status(c.caster,'attackBonus',v(c,'BUFF DURATION'),drained);c.status(target,'attackBonus',v(c,'BUFF DURATION'),-drained,{harmful:true,dispel:'none'});});
},['time-based attack damage transfer','distance/death limits'],{range:c=>Math.max(c.caster.range,units(v(c,'MIN CAST RANGE'))),remaining:['Exact break range; link currently stops individual pulses rather than permanently breaking','Super/Gaben']}));
register('medusa_stone_gaze',program(c=>{
  const exposed=new Map<string,number>(),r=radius(c),d=duration(c);c.status(c.caster,'haste',d,percent(v(c,'SPEED BOOST')));
  c.zone({follow:true,radius:r,duration:d,interval:balanceNumber(c,'skill_effects.interval.1',0.1),effect:t=>{const toCaster=Math.atan2(c.caster.y-t.y,c.caster.x-t.x),angle=Math.atan2(Math.sin(t.facing-toCaster),Math.cos(t.facing-toCaster));if(Math.abs(angle)>Math.PI/2){exposed.set(t.id,0);return;}slow(c,t,v(c,'SLOW'),balanceNumber(c,'skill_effects.slow_duration.1',0.2));const n=(exposed.get(t.id)??0)+.1;exposed.set(t.id,n);if(n>=2){c.status(t,'stun',v(c,'STONE DURATION'),0,{harmful:true,dispel:'strong',piercesImmunity:true});c.status(t,'physicalVulnerability',v(c,'STONE DURATION'),percent(v(c,'BONUS PHYSICAL ATTACK DAMAGE')),{harmful:true});exposed.set(t.id,-100);}}});
},['facing-sensitive gaze exposure','movement slow','petrification','physical vulnerability'],{target:'self',canCast:c=>near(c,radius(c)).length>0,remaining:['Gaze exposure threshold 2s is provisional','One petrification per target per cast working interpretation','Super/Gaben']}));
register('tusk_tag_team',program(c=>c.zone({follow:true,radius:radius(c),duration:v(c,'DEBUFF DURATION'),interval:balanceNumber(c,'skill_effects.interval.1',0.1),effect:t=>c.status(t,'tagTeam',balanceNumber(c,'skill_effects.tagteam_duration.1',0.2),v(c,'BONUS DAMAGE'),{harmful:true,data:{slow:percent(v(c,'MOVEMENT SLOW')),slowDuration:v(c,'SLOW DURATION')}})}),['radius debuff','bonus physical damage from allied attacks','attack-triggered slow'],{target:'self',canCast:c=>near(c,radius(c)).length>0}));
register('faceless_void_time_walk',program(c=>{
  const history=(c.caster.damageHistory??[]) as {time:number;amount:number}[];c.heal(c.caster,history.filter(x=>x.time>=c.battle.time-v(c,'BACKTRACK DURATION')).reduce((n,x)=>n+x.amount,0));
  const dx=c.target.x-c.caster.x,dy=c.target.y-c.caster.y,d=dist(c.caster,c.target)||1,travel=Math.min(d-.8,units(v(c,'RANGE')));c.moveContinuous(c.caster,c.caster.x+dx/d*travel,c.caster.y+dy/d*travel,{duration:defaultMotionDuration()});
},['recent-health-loss restoration','bounded targeted displacement'],{range:100,canCast:c=>c.caster.hp<c.caster.maxHp*.85,remaining:['AA destination targeting and invulnerability window','Super/Gaben']}));
register('marci_unleash',program(c=>{c.status(c.caster,'unleash',duration(c),v(c,'STRIKES PER FURY'));flag(c,'attackSpeed',v(c,'BONUS ATTACK SPEED'),duration(c));c.caster.unleashHits=0;},['temporary rapid attacks','strike-count pulses and slow'],{target:'self',canCast:c=>near(c,8).length>0,onAttack:c=>{if(!c.caster.statuses.some(s=>s.kind==='unleash'))return;c.caster.unleashHits=Number(c.caster.unleashHits??0)+1;if(Number(c.caster.unleashHits)%v(c,'STRIKES PER FURY')===0)for(const t of enemiesAt(c,c.target.x,c.target.y,units(v(c,'PULSE RADIUS')))){hit(c,t,'PULSE DAMAGE');slow(c,t,v(c,'MOVEMENT SLOW'),balanceNumber(c,'skill_effects.slow_duration.1',2));c.status(t,'attackSpeed',balanceNumber(c,'skill_effects.attackspeed_duration.1',2),-v(c,'BASE ATTACK SPEED SLOW'),{harmful:true});}},remaining:['Fury recovery interval and per-burst timing','Slow duration needs reference','Super/Gaben']}));
register('primal_beast_uproar',program(c=>{const stacks=Math.min(v(c,'MAX STACKS'),Number(c.caster.uproarStacks??0));c.caster.uproarStacks=0;flag(c,'attackBonus',v(c,'BASE BONUS DAMAGE')+stacks*v(c,'BONUS DAMAGE PER STACK'),v(c,'SLOW DURATION'));flag(c,'armor',stacks*v(c,'ROAR ARMOR BONUS PER STACK'),v(c,'SLOW DURATION'));for(const t of near(c,units(v(c,'ROAR RADIUS'))))slow(c,t,stacks*v(c,'SLOW PER STACK'),v(c,'SLOW DURATION'));},['damage-received stacks','stack-dependent attack/armor buff','area slow'],{target:'self',canCast:c=>Number(c.caster.uproarStacks??0)>0,onDamage:c=>{if((c.amount??0)>=balanceNumber(c,'skill_effects.damage_threshold.1',50))c.caster.uproarStacks=Math.min(v(c,'MAX STACKS'),Number(c.caster.uproarStacks??0)+1);},remaining:['Damage threshold 50 and stack expiry require reference','Buff duration distinct from slow requires source','Super/Gaben']}));
register('mars_arena_of_blood',program(c=>{const x=c.target.x,y=c.target.y,r=radius(c),cooldowns=new Map<string,number>();c.delay(v(c,'FORMATION TIME'),()=>c.zone({x,y,radius:r+balanceNumber(c,'skill_effects.radius.1',0.5),duration:duration(c),interval:balanceNumber(c,'skill_effects.interval.1',0.1),effect:t=>{const dx=t.x-x,dy=t.y-y,d=Math.hypot(dx,dy);if(d<r-.5)return;c.moveContinuous(t,x+dx/(d||1)*(r-.55),y+dy/(d||1)*(r-.55),{duration:balanceNumber(c,'skill_effects.interval.1',0.1)});if((cooldowns.get(t.id)??0)<=c.battle.time){hit(c,t,'SPEAR DAMAGE');cooldowns.set(t.id,c.battle.time+1);}}}));},['temporary perimeter','boundary knockback','per-victim periodic spear hits'],{remaining:['Swept boundary collision, projectile blocking and formation geometry','Spear hit cooldown 1s provisional','Super/Gaben']}));
register('custom_shadow_demon_disruption',program(c=>{const t=c.target,d=v(c,'BANISH DURATION');c.status(t,'banished',d,0,{harmful:true,dispel:'none'});c.delay(d,()=>{if(t.dead)return;const images=c.summon({name:'禁锢幻象',count:balanceNumber(c,'skill_effects.count.1',2),hp:t.maxHp,attack:t.attack*percent(v(c,'ILLUSION DAMAGE')),armor:t.armor,range:t.range,interval:t.attackInterval,speed:t.moveSpeed,lifetime:v(c,'ILLUSION DURATION'),illusion:true,damageTaken:percent(v(c,'ILLUSION DAMAGE TAKEN'))});for(const image of images){image.role=t.role;image.skin=t.skin;c.warp(image,t.x+(image===images[0]?1:-1),t.y);}});},['temporary banishment','victim-stat illusion bodies'],{remaining:['Illusion abilities/stat inheritance','Ally-target AI','Super/Gaben']}));
register('custom_grimstroke_soul_bind',program(c=>{const t=c.target,partner=c.enemies().filter(x=>x.id!==t.id&&dist(x,t)<=units(v(c,'BIND RADIUS'))).sort((a,b)=>dist(a,t)-dist(b,t))[0];if(!partner)return;for(const [unit,other]of[[t,partner],[partner,t]])c.status(unit,'soulbind',duration(c),0,{harmful:true,data:{partnerId:other.id},dispel:'none'});},['linked enemy pair','duplicate single-target nonchanneled spell casts'],{range:c=>units(v(c,'CAST RANGE')),canCast:c=>c.enemies().some(t=>t.id!==c.target.id&&dist(t,c.target)<=units(v(c,'BIND RADIUS'))),remaining:['Leash, rebinding and channel/secondary-target interaction','Super/Gaben']}));
register('custom_rubick_spell_steal',program(c=>{const event=[...c.battle.events].reverse().find(e=>e.type==='cast'&&e.source===c.target.id&&e.skill!==c.skill.id),copied=event?.skill;if(!copied||!getSkillProgram(copied))return;const skill=c.target.skills.find(s=>s?.id===copied);if(!skill)return;c.caster.skills[4]={...skill};c.caster.cooldowns[4]=c.battle.time;c.caster.stolenAbilityExpires=c.battle.time+duration(c);},['copy last supported cast into temporary combat-only ability slot'],{canCast:c=>!c.caster.skills[4]&&c.battle.events.some(e=>e.type==='cast'&&e.source===c.target.id&&e.skill!==c.skill.id),remaining:['Steal duration cleanup and spell-specific inheritance','Stolen debuff amplification','Upgrades and unsupported child abilities']}));
register('wisp_tether',program(c=>{const partner=c.allies().filter(t=>t.id!==c.caster.id).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster))[0];if(!partner)return;c.status(c.caster,'tether',balanceNumber(c,'skill_effects.tether_duration.1',120),percent(v(c,'HP/MANA TRANSFER')),{data:{partnerId:partner.id,maxDistance:units(v(c,'MAX TETHER DISTANCE'))}});flag(c,'haste',percent(v(c,'MOVEMENT SPEED BONUS')),120);c.zone({follow:true,radius:balanceNumber(c,'skill_effects.radius.1',30),duration:balanceNumber(c,'skill_effects.duration.1',120),interval:balanceNumber(c,'skill_effects.interval.1',0.1),effect:t=>{if(partner.dead||dist(c.caster,partner)>units(v(c,'MAX TETHER DISTANCE')))return;const dx=partner.x-c.caster.x,dy=partner.y-c.caster.y,l=Math.hypot(dx,dy)||1,a=((t.x-c.caster.x)*dx+(t.y-c.caster.y)*dy)/l,p=Math.abs((t.x-c.caster.x)*dy-(t.y-c.caster.y)*dx)/l;if(a>=0&&a<=l&&p<.4){slow(c,t,v(c,'ENEMY MOVE/ATTACK SLOW'),balanceNumber(c,'skill_effects.slow_duration.1',0.2));c.status(t,'attackSpeed',balanceNumber(c,'skill_effects.attackspeed_duration.1',0.2),-v(c,'ENEMY MOVE/ATTACK SLOW'),{harmful:true});}}});},['linked ally health/mana transfer','tether-line enemy slow','caster movement bonus'],{target:'self',canCast:c=>!c.caster.statuses.some(s=>s.kind==='tether')&&c.allies().length>1,remaining:['Break/recast behavior and pull-to-ally','Transferred regeneration edge cases','Super/Gaben']}));

applyMainUpgrades(registry);
applyAdvancedUpgrades(registry);
applyRemainingUpgrades(registry);
applyEngineGapOverrides(registry);
Object.assign(registry, EXTRA_PROGRAMS, MORE_PROGRAMS,HISTORICAL_CHILD_PROGRAMS,MORE_CHILD_PROGRAMS,EXTRA_CHILD_PROGRAMS,HISTORICAL_UPGRADE_PROGRAMS,SUMMON_GAP_CHILD_PROGRAMS);
applyMainGapOverrides(registry);
applyLinksAndGazeAcceptance(registry);
applySummonGapOverrides(registry);
applyTetherAcceptance(registry);
applyOmnislashClockOverride(registry);
applyAttackModeAcceptance(registry);
applyProcAcceptance(registry);
applySummonRestorationAcceptance(registry);
applyMobilityFieldsAcceptance(registry);
applyFervorAcceptance(registry);
applyControlExecutionAcceptance(registry);
applyDeathDemonicAcceptance(registry);
applyAttackTriggerAcceptance(registry);
applyReflectionDemonAcceptance(registry);
applyEdgeEarthAcceptance(registry);
applyDragonEchoAcceptance(registry);
applyRestorationIdentityAcceptance(registry);
applyFireFissureAcceptance(registry);
applyFlakFleshAcceptance(registry);
applyFuryGlobalAcceptance(registry);
applyFrostControlAcceptance(registry);
applyHandIceAcceptance(registry);
applyGodGustAcceptance(registry);
applyIceInnerAcceptance(registry);
applyLivingFieldAcceptance(registry);
applyInnerLaserAcceptance(registry);
applyLeechShredderAcceptance(registry);
applyManaMirrorAcceptance(registry);
applyMistFlareAcceptance(registry);
applyNatureOmniAcceptance(registry);
applyPhantomWardAcceptance(registry);
applyPlasmaPulseAcceptance(registry);
applyOverchargeCaskAcceptance(registry);
applyPulverizeRavageAcceptance(registry);
applyReactiveRefractionAcceptance(registry);
applyResonantArrowAcceptance(registry);
applyAuraArmorAcceptance(registry);
applyMotionReleaseAcceptance(registry);
applyRestorationLinkAcceptance(registry);
applyAttackStateAcceptance(registry);
applyControlTargetAcceptance(registry);
applySummonLineageAcceptance(registry);
applyAttackTempoAcceptance(registry);
applyPassiveDamageAcceptance(registry);
applyMotionScopeAcceptance(registry);
export const GRANTED_SKILL_DEFINITIONS:SkillDefinition[]=[...HISTORICAL_CHILD_DEFINITIONS,...MORE_CHILD_DEFINITIONS,...EXTRA_CHILD_DEFINITIONS,...HISTORICAL_UPGRADE_DEFINITIONS,...SUMMON_GAP_CHILD_DEFINITIONS,...MOBILITY_FIELDS_CHILD_DEFINITIONS,...CONTROL_EXECUTION_CHILD_DEFINITIONS,...FROST_CONTROL_CHILD_DEFINITIONS,...HAND_ICE_CHILD_DEFINITIONS,...LIVING_FIELD_CHILD_DEFINITIONS,...MANA_MIRROR_CHILD_DEFINITIONS,...MIST_FLARE_CHILD_DEFINITIONS,...OVERCHARGE_CASK_CHILD_DEFINITIONS];
for(const definition of [...PULVERIZE_RAVAGE_CHILD_DEFINITIONS,...REACTIVE_REFRACTION_CHILD_DEFINITIONS,...RESONANT_ARROW_CHILD_DEFINITIONS,...AURA_ARMOR_CHILD_DEFINITIONS,...MOTION_RELEASE_CHILD_DEFINITIONS,...RESTORATION_LINK_CHILD_DEFINITIONS,...ATTACK_STATE_CHILD_DEFINITIONS,...CONTROL_TARGET_CHILD_DEFINITIONS,...SUMMON_LINEAGE_CHILD_DEFINITIONS,...ATTACK_TEMPO_CHILD_DEFINITIONS,...PASSIVE_DAMAGE_CHILD_DEFINITIONS,...MOTION_SCOPE_CHILD_DEFINITIONS]){const i=GRANTED_SKILL_DEFINITIONS.findIndex(d=>d.id===definition.id);if(i<0)GRANTED_SKILL_DEFINITIONS.push(definition);else GRANTED_SKILL_DEFINITIONS[i]=definition;}
for(const definition of GRANTED_SKILL_DEFINITIONS)if(['extra_granted_demonic_cleanse','extra_granted_demonic_purge'].includes(definition.id))definition.categories=['ABILITY: Unit Target','PIERCES SPELL IMMUNITY: Yes'];
GRANTED_SKILL_DEFINITIONS.forEach(d=>attachSkillBalance(d,true));
export const SKILL_IMPLEMENTATIONS: Readonly<Record<string, SkillProgram>> = registry;
export function getSkillProgram(id: string): SkillProgram | undefined { return registry[id]; }
export interface MechanicCoverage { id: string; name: string; status: 'partial' | 'unimplemented'; base: boolean; super: boolean; gaben: boolean; verifiedAgainstReference: false; implemented: string[]; remaining: string[] }
export function getMechanicCoverage(definitions: SkillDefinition[]): MechanicCoverage[] {
  return definitions.map(d=>{const p=registry[d.id];return {id:d.id,name:d.name,status:p?'partial':'unimplemented',base:!!p,super:!!p?.superImplemented,gaben:!!p?.gabenImplemented,verifiedAgainstReference:false,implemented:p?.implemented??[],remaining:p?.remaining??['Explicit skill mechanism not implemented; no damage fallback is applied','AA source version and reference behavior verification']};});
}

export function referenceRootDisables(id:string):boolean{return id in historicalRootDisabled.abilities;}

export function isUnitTargetSkill(d:SkillDefinition):boolean{return d.categories.some(s=>/unit target/i.test(s))||(d.categories.some(s=>/channeled/i.test(s))&&d.id in historicalUnitTargeted.abilities);}
