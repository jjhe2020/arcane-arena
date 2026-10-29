import {skillBalance} from './config';
import {defaultMotionDuration} from './config';
import {configuredValue} from './config';
import {balanceNumber} from './config';
import type { CombatUnit } from './model';
import type { EffectContext, EffectStatus, InstantAttackOptions, SkillProgram } from './skill-effects';
import { addVisualProjectile, moveVisualProjectile, removeVisualProjectile, addVisualWorldEffect, updateVisualWorldEffect, removeVisualWorldEffect } from './combat/visual-state';

/** Explicit catalog programs. Geometry/timing assumptions are listed per skill;
 * an executable base program is not a claim of AA reference verification. */
const value = (c: EffectContext, key: string, fallback = 0): number => {
  const configured=configuredValue(c,key);if(configured!==undefined)return configured;
  const row = c.definition.values.filter(r => r.slice(0, r.indexOf(':')).trim().toUpperCase() === key.toUpperCase()).at(-1);
  const numbers = row?.slice(row.indexOf(':') + 1).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return numbers[Math.min(numbers.length - 1, Math.max(0, Math.min(2, c.skill.points - 1)))] ?? fallback;
};
const v = value, U = (n: number) => n / 100, P = (n: number) => Math.abs(n) / 100;
const superLevel = (c: EffectContext) => c.skill.points >= 6;
const gabenLevel = (c: EffectContext) => c.skill.points >= 9;
const MOTION_STEP = 1 / 30;
// Authored atlas frame counts / FPS, only for already-triggered presentation.
// These do not determine pulse timing, damage, targeting or random samples.
const EPICENTER_VISUAL_SECONDS = 20 / 24, FREEZING_BURST_VISUAL_SECONDS = 16 / 24;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const around = (c: EffectContext, x: number, y: number, radius: number) => c.enemies().filter(t => Math.hypot(t.x - x, t.y - y) <= radius);
const near = (c: EffectContext, radius: number) => around(c, c.caster.x, c.caster.y, radius);
const backline = (c: EffectContext, range = Infinity) => c.enemies().filter(t => distance(t, c.caster) <= range).sort((a, b) => (c.caster.side === 0 ? b.y - a.y : a.y - b.y) || distance(b, c.caster) - distance(a, c.caster) || a.id.localeCompare(b.id))[0];
const harmful = { harmful: true };
function slow(c: EffectContext, t: CombatUnit, amount: number, seconds: number) { c.status(t, 'slow', seconds, P(amount), harmful); }
function stun(c: EffectContext, t: CombatUnit, seconds: number, pierce = false) { c.status(t, 'stun', seconds, 0, { harmful: true, dispel: 'strong', piercesImmunity: pierce }); }
function cooldown(c: EffectContext, reduction = 0): number { return Math.max(0, (c.definition.cooldowns[Math.min(2, c.skill.points - 1, c.definition.cooldowns.length - 1)] ?? 10) - reduction); }
function direction(from: { x: number; y: number }, to: { x: number; y: number }) {
  const d = distance(from, to) || 1; return { x: (to.x - from.x) / d, y: (to.y - from.y) / d };
}
function lineTargets(c: EffectContext, start: { x: number; y: number }, end: { x: number; y: number }, width: number): CombatUnit[] {
  const dx = end.x - start.x, dy = end.y - start.y, length2 = dx * dx + dy * dy;
  return c.enemies().filter(t => {
    const q = length2 ? Math.max(0, Math.min(1, ((t.x - start.x) * dx + (t.y - start.y) * dy) / length2)) : 0;
    return Math.hypot(t.x - start.x - q * dx, t.y - start.y - q * dy) <= width;
  }).sort((a, b) => distance(a, start) - distance(b, start) || (a.id < b.id ? -1 : 1));
}
function endpoint(c: EffectContext, length: number) {
  const d = direction(c.caster, c.target); return { x: c.caster.x + d.x * length, y: c.caster.y + d.y * length };
}
function instantAttack(c: EffectContext, target: CombatUnit, multiplier = 1, bonus = 0, trueStrike = false, options:InstantAttackOptions = {}) {
  return c.attack(target, multiplier, true, undefined, false, {trueStrike,bonusDamage:bonus,...options});
}
const effectiveAttackRange = (c:EffectContext) => c.attackRange?.(c.caster) ?? ((c.caster.statuses.find(s=>s.kind==='attackRangeOverride'&&s.until>c.battle.time)?.value ?? c.caster.range)+c.caster.statuses.filter(s=>s.kind==='range'&&s.until>c.battle.time).reduce((n,s)=>n+(s.value??0),0));
function clock(c: EffectContext, duration: number, interval: number, effect: (tick: number) => void, channel = false) {
  c.zone({ follow: true, radius: 0, targets: 'all', duration, interval, channel, effect: (t, tick) => { if (t.id === c.caster.id) effect(tick); } });
}
/** Granted actives have their own mana/cooldown and obey action disables.
 * Choosing a target is this project's deterministic AI policy, not player input. */
function grantActive(c: EffectContext, id: string, points: number, mana: number, cooldownSeconds: number, select: () => CombatUnit | undefined, overrides?: Record<string, number>) {
  let next = 0;
  clock(c, 120, .1, () => {
    if (c.battle.time < next || c.caster.mana < mana || c.caster.castUntil > c.battle.time || c.caster.statuses.some(s => ['stun', 'hex', 'selfStun', 'silence', 'banished', 'duel', 'fear'].includes(s.kind))) return;
    const target = select(); if (!target) return;
    if (c.castAbility(id, points, target, overrides)) { c.mana(c.caster, -mana); next = c.battle.time + cooldownSeconds * (1 - Math.min(.9, c.caster.statuses.filter(s => s.kind === 'cooldownReduction').reduce((n, s) => n + (s.value ?? 0), 0))); c.caster.castUntil = Math.max(c.caster.castUntil, c.battle.time + .2); }
  });
}
function active(cast: NonNullable<SkillProgram['cast']>, implemented: string[], remaining: string[], options: Partial<SkillProgram> = {}): SkillProgram {
  return { target: 'enemy', range: 7, backswing: .2, cast, implemented,
    remaining: [...remaining, 'AA reference targeting, geometry and timing verification'], ...options };
}
const programs: Record<string, SkillProgram> = {};
const put = (id: string, program: SkillProgram) => { programs[id] = program; };

put('hoodwink_acorn_shot', active(c => {
  const compiled=!!skillBalance(c.definition,c.skill.points),count=v(c,'BOUNCE COUNT')+(!compiled&&superLevel(c)?2:0);
  const bounce = (target: CombatUnit, number: number, origin?:{x:number;y:number}) => c.projectile(target, number===0?U(v(c,'FIRST PROJECTILE SPEED',2200)):Number(c.caster.projectileSpeed??14)*v(c,'BOUNCE PROJECTILE SPEED MULTIPLIER',.5), t => {
    instantAttack(c,t,P(v(c,'BASE DAMAGE'))+(!compiled&&superLevel(c)?.5:0),v(c,'BONUS DAMAGE'));
    // The spell slow is independent of whether its attack missed.
    slow(c,t,v(c,'MOVEMENT SLOW'),v(c,'SLOW DURATION'));
    const impact={x:t.x,y:t.y};
    if(number<count)c.delay(v(c,'BOUNCE DELAY',.1),()=>{
      const next=c.enemies().filter(e=>e.id!==t.id&&!e.ward&&(c.canTarget?.(e,true)??true)&&distance(e,impact)<=U(v(c,'BOUNCE RADIUS',525))).sort((a,b)=>distance(a,impact)-distance(b,impact)||a.id.localeCompare(b.id))[0];
      if(next)bounce(next,number+1,impact);
    });
  },origin); bounce(c.target,0);
}, ['one attack combines attack fraction and fixed bonus before critical/lifesteal', 'independent slow even on miss', '2200-speed initial projectile; delayed half-attack-projectile-speed bounces from previous impact', 'Super final damage/bounce parameters', 'Gaben historical Stygian Desolator corrosion before the current successful attack'], ['Point-target trees/fog/disjoint continuation absent from arena', 'Nearest eligible bounce selection is deterministic project AI; native random selection not certified', 'Multiple corruption providers sharing one native item debuff group unverified'], {
  attackProjectile:true,dynamicRange:true,range:c=>effectiveAttackRange(c)+U(v(c,'BONUS ATTACK RANGE')),
  init: c => { if (gabenLevel(c)) c.caster.attack += 60; },
  beforeAttackDamage:c=>{if(gabenLevel(c))c.status(c.target,'armor',balanceNumber(c,'skill_effects_more.armor_duration.1',7),balanceNumber(c,'skill_effects_more.armor_amount.1',-10),harmful);},superImplemented:true,gabenImplemented:true,
}));

function anchor(c: EffectContext) {
  if (c.caster.anchorBusy) return; c.caster.anchorBusy = true;
  try { for (const t of near(c,U(v(c,'RADIUS'))).filter(t=>!t.ward&&!t.statuses.some(s=>s.kind==='magicImmune'))) { const compiled=!!skillBalance(c.definition,c.skill.points);c.status(t,'baseAttackDamageReduction',v(c,'DURATION'),Math.min(1,P(v(c,'DAMAGE REDUCTION'))+(!compiled&&superLevel(c)?.2:0)),harmful);instantAttack(c,t,1,v(c,'ATTACK BONUS DAMAGE')+(!compiled&&superLevel(c)?100:0),true,{noCleave:true,allowInvisibleTarget:true}); } }
  finally { c.caster.anchorBusy = false; }
}
put('tidehunter_anchor_smash', active(anchor, ['debuff precedes True Strike instant attacks', 'attack modifiers except cleave', 'Super final numerical parameters', 'bounded Gaben PRD attack-triggered casts with AA 40%'], ['Buildings and terrain absent from the combat plane', 'Anchor damage-block behavior differs between pre-instant-attack changelog and later attack semantics; exact selected patch remains unverified'], {
  target: 'self', canCast: c => near(c, U(v(c, 'RADIUS'))).length > 0,
  cooldown:c=>cooldown(c,superLevel(c)?1:0),onAttack:c=>{if(!gabenLevel(c)||c.caster.anchorBusy)return;const probability=balanceNumber(c,'skill_effects_more.trigger_chance.1',.4);if(c.chance?.(probability,'anchorSmash')??c.random()<probability)anchor(c);},superImplemented:true,gabenImplemented:true,
}));

put('custom_skywrath_mage_arcane_bolt', active(c => {
  const damage=v(c,'BASE DAMAGE')+Number(c.caster.intelligence??0)*v(c,'INT DAMAGE MULTIPLIER');
  const available=c.enemies().filter(t=>t.id!==c.target.id&&!t.ward&&distance(t,c.target)<=7&&(c.canTarget?.(t,true)??true)&&!t.statuses.some(s=>s.kind==='magicImmune'));
  const targets=[c.target];for(let i=0;superLevel(c)&&i<2&&available.length;i++){
    // The native upgrade treats illusions as heroes, but creep-heroes such as
    // the Spirit Bear remain in the ordinary-unit fallback pool.
    const heroes=available.filter(t=>!t.summoned||t.illusion),pool=heroes.length?heroes:available;
    const target=pool[Math.floor(c.random()*pool.length)];targets.push(target);available.splice(available.indexOf(target),1);
  }
  for (const target of targets) c.projectile(target, balanceNumber(c,'skill_effects_more.projectile_speed.1',5), t => {
    c.damage(t,damage);
  });
}, ['slow homing bolt', 'catalog flat damage', 'effective intelligence coefficient', 'Super extra targets', 'independent Gaben armor/intelligence stacks'], ['Four-class attribute mapping is a project rule pending AA calibration', 'Projectile speed verification'], {
  projectileDisjointable:false,spellBlockTiming:'impact',
  targetSelector:(c,candidates)=>candidates.filter(t=>!t.ward&&!t.statuses.some(s=>s.kind==='magicImmune')).sort((a,b)=>distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0],
  onAbilityDamageEvent: c => { if (gabenLevel(c) && c.triggerSkillId && !c.abilityDamageEvent?.flags.itemEffect && c.target.side !== c.caster.side&&!c.caster.illusion) { c.status(c.caster, 'armor', balanceNumber(c,'skill_effects_more.armor_duration.1',35), balanceNumber(c,'skill_effects_more.armor_amount.1',0.5), { maxStacks: balanceNumber(c,'skill_effects_more.maxstacks.1',500),dispel:'none' }); c.status(c.caster, 'intelligence', balanceNumber(c,'skill_effects_more.intelligence_duration.1',35), balanceNumber(c,'skill_effects_more.intelligence_amount.1',2), { maxStacks: balanceNumber(c,'skill_effects_more.maxstacks.2',500),dispel:'none' }); } }, superImplemented: true, gabenImplemented: true,
}));

put('void_spirit_astral_step', active(c => {
  const start={x:c.caster.x,y:c.caster.y},point=c.castPosition??c.target,dx=point.x-start.x,dy=point.y-start.y,d=Math.hypot(dx,dy),angle=d?Math.atan2(dy,dx):c.caster.facing;
  const extraRange=c.caster.statuses.filter(s=>s.kind==='castRange'&&s.until>c.battle.time).reduce((n,s)=>n+(s.value??0),0),rangeFactor=1+c.caster.statuses.filter(s=>s.kind==='castRangePct'&&s.until>c.battle.time).reduce((n,s)=>n+(s.value??0),0),length=Math.max(U(v(c,'MIN TRAVEL DISTANCE',200)),Math.min(d,U(v(c,'RANGE'))*rangeFactor+extraRange)),end={x:start.x+Math.cos(angle)*length,y:start.y+Math.sin(angle)*length};
  const targets=lineTargets(c,start,end,U(v(c,'PATH WIDTH',170))).filter(t=>!t.ward);
  c.warp(c.caster,end.x,end.y);
  for(const target of targets){
    instantAttack(c,target,1,0,true,{criticalMultiplier:P(v(c,'CRITICAL DAMAGE',superLevel(c)?200:100)),noCleave:true,allowInvisibleTarget:true});
    c.status(target,'slow',balanceNumber(c,'skill_effects_more.slow_duration.1',1.25),P(v(c,'MOVEMENT SLOW')),{harmful:true,piercesImmunity:true,maxStacks:1000,data:{astralStepMark:true,damage:v(c,'VOID MARK DAMAGE')}});
  }
}, ['instant ground-cursor teleport with minimum/maximum distance and no disjoint', 'true-strike path attacks ignore disarm and never cleave', 'independent resistance-scaled void marks detonate on expiry or dispel', 'Super ensured critical and faster sequential charge restoration'], ['AA +200% crit uses 200% total critical candidate; native talent has a different numerical value'], {pointTarget:true,range:c=>U(v(c,'RANGE')),cooldown:c=>v(c,'BASE CHARGE RESTORE TIME')-(!skillBalance(c.definition,c.skill.points)&&superLevel(c)?4:0),onStatusRemoved:(c,status)=>{if(status.kind==='slow'&&status.data?.astralStepMark)c.damage(c.target,Number(status.data.damage),'magical',true);},superImplemented:true}));

put('techies_suicide', active(c => {
  const destination=c.castPosition??{x:c.target.x,y:c.target.y},flight=balanceNumber(c,'skill_effects_more.delay.1',.75),started=c.battle.time,priorMoves=new Set((c.caster.moveHistory??[]) as object[]);
  if(gabenLevel(c))c.status(c.caster,'invulnerable',balanceNumber(c,'skill_effects_more.invulnerable_duration.1',3),0,{dispel:'none'});
  if(!c.moveContinuous(c.caster,destination.x,destination.y,{duration:flight,priority:-1,ignoreBarriers:true}))return;
  const identity=c.motionActive?.(c.caster);let cancelled=false;
  c.status(c.caster,'selfStun',flight,0,{dispel:'none'});
  const leap=c.caster.statuses.find(s=>s.kind==='selfStun'&&s.skill===c.skill.id&&s.source===c.caster.id);
  const check=()=>{
    if(cancelled)return;
    const current=c.motionActive?.(c.caster),elapsed=c.battle.time-started,foreignMove=((c.caster.moveHistory??[]) as {kind?:string;skill?:string}[]).some(move=>!priorMoves.has(move)&&(move.kind==='warp'||move.kind==='forced'&&move.skill!==c.skill.id));
    if(c.caster.dead||foreignMove||(identity&&current&&(identity.owner!==current.owner||identity.startedAt!==current.startedAt))||(identity&&!current&&elapsed<flight-MOTION_STEP-1e-8)){
      cancelled=true;c.caster.statuses=c.caster.statuses.filter(s=>s!==leap);return;
    }
    if(elapsed<flight-1e-8)c.delay(MOTION_STEP,check);
  };c.delay(MOTION_STEP,check);
  c.delay(flight,()=>{
    check();if(cancelled||c.caster.dead)return;
    const targets=near(c,U(v(c,'RADIUS')+(gabenLevel(c)?200:0))).filter(t=>!t.ward&&!t.statuses.some(s=>s.kind==='magicImmune'));
    for(const target of targets)c.status(target,'silence',v(c,'SILENCE DURATION'),0,harmful);
    for(const target of targets)c.damage(target,v(c,'FULL DAMAGE'));
    c.damage(c.caster,c.caster.hp*P(v(c,'CURRENT HP SELF DAMAGE')),'magical',true,{flags:{nonLethal:true,noAmplification:true,noSpellLifesteal:true,noReflection:true,bypassGenericMultipliers:true}});
    if(superLevel(c))for(const target of targets)stun(c,target,balanceNumber(c,'skill_effects_more.stun_duration.1',1.75));
  });
}, ['fixed-duration continuous leap; other forced movement cancels but ordinary disables do not', 'historical landing order: silence, area damage, nonlethal current-HP self damage, Super stun', 'self damage retains magic resistance and barriers but bypasses generic multipliers', 'Super historical shard range/stun and talent cooldown', 'Gaben instant cast, increased radius and invulnerability beginning at release'], [], {pointTarget:true,castPoint:c=>gabenLevel(c)?0:1,backswing:.9,range:c=>balanceNumber(c,'skill_effects_more.range.1',10)+(superLevel(c)?balanceNumber(c,'skill_effects_more.range.2',3):0),cooldown:c=>cooldown(c,superLevel(c)?15:0),superImplemented:true,gabenImplemented:true}));

put('custom_monkey_king_boundless_strike', active(c => {
  const compiled=!!skillBalance(c.definition,c.skill.points),start={x:c.caster.x,y:c.caster.y},end=endpoint(c,U(v(c,'DISTANCE'))),width=U(v(c,'STRIKE RADIUS',150));
  // Shared transient batch, with per-Jingu-slot snapshots filled by its hooks.
  // Charges are consumed once by the following onCast hooks, including empty casts.
  c.caster.statuses.push({kind:'boundlessJinguBatch',source:c.caster.id,until:c.battle.time+MOTION_STEP,data:{}} as EffectStatus);
  const targets=lineTargets(c,start,end,width);
  if(superLevel(c)){const dir=direction(start,end),extent=U(v(c,'DISTANCE'))/2;for(const t of lineTargets(c,{x:end.x-dir.y*extent,y:end.y+dir.x*extent},{x:end.x+dir.y*extent,y:end.y-dir.x*extent},width))if(!targets.includes(t))targets.push(t);}
  for(const t of targets.filter(t=>!t.ward&&!t.statuses.some(s=>s.kind==='magicImmune'))){instantAttack(c,t,1,0,true,{criticalMultiplier:P(v(c,'CRITICAL DAMAGE'))+(!compiled&&superLevel(c)?.75:0),noCleave:true,allowInvisibleTarget:true});stun(c,t,v(c,'STUN DURATION')+(!compiled&&superLevel(c)?balanceNumber(c,'skill_effects_more.stun_duration.1',.3):0));if(gabenLevel(c))c.castAbility('aa_granted_bloodthorn',1,t);}
}, ['150-radius True Strike line instant attacks without cleave', 'ensured critical competes with other criticals', 'stun independent of damage', 'Jingu one-charge cast batch; Echo slow without extra attack', 'Super perpendicular strike and final values', 'Gaben historical Bloodthorn child'], ['Exact line end caps/backward start differ across Wiki revisions', 'Perpendicular overlap deduplication is a project interpretation', 'Bloodthorn historical child AA grant rank/item patch match unverified', 'Immediate granted Boundless casts bypass ordinary onCast hooks; no current grant uses this route'], {range:c=>U(v(c,'DISTANCE')),superImplemented:true,gabenImplemented:true}));

put('clinkz_strafe', active(c => {
  const start = { x: c.caster.x, y: c.caster.y }, end = endpoint(c, U(v(c, 'RANGE'))), count = v(c, 'ARROWS FIRED') + (superLevel(c) ? 3 : 0);
  for (let i = 0; i < count; i++) c.delay((i + balanceNumber(c,'skill_effects_more.delay.1',1)) * balanceNumber(c,'skill_effects_more.delay.2',2.4) / count, () => { for (const t of lineTargets(c, start, end, 1.2)) instantAttack(c, t, P(v(c, 'DAMAGE PER ARROW')) + (superLevel(c) ? .35 : 0)); }, true);
}, ['interruptible arrow barrage', 'piercing line attacks with modifiers', 'Super arrow count and damage'], ['2.4-second channel and arrow width provisional', 'Projectile travel', 'Gaben charges'], { range: c => U(v(c, 'RANGE')), channel: 2.4, superImplemented: true }));

put('custom_shredder_chakram', active(c => {
  const start = { x: c.caster.x, y: c.caster.y }, target = c.enemies().filter(t => distance(t, c.caster) <= 12).sort((a, b) => distance(b, c.caster) - distance(a, c.caster))[0] ?? c.target;
  const second = !!v(c, 'SECOND CHAKRAM'), count = gabenLevel(c) ? 10 : 1, key = second ? 'secondChakramBlades' : 'mainChakramBlades'; c.caster[key] = count;
  const blades = Array.from({ length: count }, (_, i) => ({ x: start.x, y: start.y, end: count === 1 ? { x: target.x, y: target.y } : { x: start.x + Math.cos(i / count * Math.PI * 2) * 12, y: start.y + Math.sin(i / count * Math.PI * 2) * 12 }, phase: 'out' as 'out' | 'parked' | 'return' | 'done', hit: new Set<string>(), manaAt: 0,
    visual: addVisualProjectile(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'blade', role: 'projectile_area', ...start, angle: Math.atan2(target.y - start.y, target.x - start.x), until: c.battle.time + .15, expiresWithSource: true }) }));
  clock(c, Math.max(.05, 120 - c.battle.time), .05, () => {
    for (const blade of blades) {
      if (blade.phase === 'done') continue;
      if (blade.phase === 'parked') {
        if (distance(blade, c.caster) > 20 || c.caster.mana < v(c, 'MANA COST PER SECOND') * .5) { blade.phase = 'return'; blade.hit.clear(); }
        else if (c.battle.time >= blade.manaAt) {
          blade.manaAt = c.battle.time + .5; c.mana(c.caster, -v(c, 'MANA COST PER SECOND') * .5);
          for (const t of around(c, blade.x, blade.y, U(v(c, 'RADIUS')))) { c.damage(t, v(c, 'DAMAGE PER SECOND') * balanceNumber(c,'skill_effects_more.damage.1',0.5), 'pure'); slow(c, t, Math.floor((1 - t.hp / t.maxHp) / .05) * v(c, 'SLOW'), balanceNumber(c,'skill_effects_more.slow_duration.1',0.6)); }
        }
      }
      if (blade.phase === 'out' || blade.phase === 'return') {
        const from = { x: blade.x, y: blade.y }, end = blade.phase === 'return' ? c.caster : blade.end, d = direction(blade, end), remaining = distance(blade, end), step = Math.min(.45, remaining);
        blade.x += d.x * step; blade.y += d.y * step;
        for (const t of lineTargets(c, from, blade, U(v(c, 'RADIUS')))) if (!blade.hit.has(t.id)) { blade.hit.add(t.id); c.damage(t, v(c, 'PASS DAMAGE'), 'pure'); slow(c, t, Math.floor((1 - t.hp / t.maxHp) / .05) * v(c, 'SLOW'), balanceNumber(c,'skill_effects_more.slow_duration.2',0.5)); }
        if (remaining <= .45 + 1e-8) { if (blade.phase === 'out') { blade.phase = 'parked'; blade.manaAt = c.battle.time + .5; } else { blade.phase = 'done'; c.caster[key] = Math.max(0, Number(c.caster[key]) - 1); } }
      }
      if (blade.phase === 'done') removeVisualProjectile(c.battle, blade.visual);
      else moveVisualProjectile(c.battle, blade.visual, blade, c.battle.time + .15);
    }
    if (Number(c.caster.mainChakramBlades ?? 0) + Number(c.caster.secondChakramBlades ?? 0) > 0) { c.status(c.caster, 'chakramOut', balanceNumber(c,'skill_effects_more.chakramout_duration.1',0.15)); c.status(c.caster, 'disarm', balanceNumber(c,'skill_effects_more.disarm_duration.1',0.15)); }
    else c.caster.statuses = c.caster.statuses.filter(s => !(s.skill === c.skill.id && ['disarm', 'chakramOut'].includes(s.kind)));
  });
}, ['furthest-enemy saw targeting', 'continuous outbound/return swept blade damage', 'stationary pure damage and per-blade mana drain', 'disarm until every blade returns', 'missing-health slow', 'Super independent second blade and transferable ally Flamethrower', 'Gaben ten radial blades'], ['Manual retraction and visual blade trajectories', 'AA calls Throwable Flamethrower buffed without numbers; child uses historical 80 DPS baseline with unspecified extra amplification left explicit', 'Historical Dota 2023-02-10: 900 travel speed, 1200 cast range, 2000 tether break, 0.5-second damage tick', 'AA radial blade reach and per-blade mana policy need reference validation', 'Current AA catalog says radial around caster; older official Season 4.5 notes instead describe ten extra blades from landing point'], { range: 12, canCast: c => Number(c.caster.mainChakramBlades ?? 0) === 0, init: c => {
  if (!superLevel(c)) return;
  grantActive(c, 'custom_shredder_chakram', c.skill.points, c.definition.mana.at(-1) ?? 175, 8, () => Number(c.caster.mainChakramBlades ?? 0) > 0 && Number(c.caster.secondChakramBlades ?? 0) === 0 ? c.enemies().filter(t => distance(t, c.caster) <= 12).sort((a, b) => distance(b, c.caster) - distance(a, c.caster))[0] : undefined, { 'SECOND CHAKRAM': 1 });
  grantActive(c, 'aa_granted_throwable_flamethrower', 1, 100, 20, () => c.allies().filter(t => t.id !== c.caster.id && !t.summoned && c.enemies().some(e => distance(e, t) <= 4)).sort((a, b) => Math.min(...c.enemies().map(e => distance(e, a))) - Math.min(...c.enemies().map(e => distance(e, b))))[0]);
}, superImplemented: true, gabenImplemented: true }));

put('custom_witch_doctor_death_ward', active(c => {
  const wards = c.summon({ name: '死亡守卫', count: balanceNumber(c,'skill_effects_more.count.1',1), hp: balanceNumber(c,'skill_effects_more.hp.1',1), attack: (skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE"):(((v(c, 'DAMAGE') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.attack.1',60) : 0))))), range: U(v(c, 'ATTACK RANGE') + (superLevel(c) ? 100 : 0)), interval: balanceNumber(c,'skill_effects_more.interval.1',0.22), speed: 0, lifetime: balanceNumber(c,'skill_effects_more.lifetime.1',0.25) });
  for (const ward of wards) { c.status(ward, 'invulnerable', balanceNumber(c,'skill_effects_more.invulnerable_duration.1',8.2)); if (gabenLevel(c)) { c.status(ward, 'trueStrike', balanceNumber(c,'skill_effects_more.truestrike_duration.1',8.2)); ward.skills = [{ ...c.skill }]; } }
  clock(c, 8, .1, () => { for (const ward of wards) if (!ward.dead) ward.expiresAt = c.battle.time + .15; }, true);
}, ['independent stationary physical-attack ward', 'channel-dependent lifetime', 'ward invulnerability', 'Super attack/range bonuses and independent Voodoo Switcheroo', 'Gaben true strike and unique-target bounce chain'], ['Historical Dota 2023-02-10 ward AttackRate .22 and Switcheroo values; AA patch match unverified', 'Hero-priority targeting and bounce travel', 'Switcheroo automatic activation below 50% HP is a project AI policy'], { channel: 8, target: 'self', canCast: c => near(c, U(v(c, 'ATTACK RANGE'))).length > 0,
  init: c => { if (superLevel(c)) grantActive(c, 'aa_granted_voodoo_switcheroo', 1, 150, 40, () => c.caster.hp < c.caster.maxHp * .5 && near(c, U(v(c, 'ATTACK RANGE') + 100)).length ? c.caster : undefined, { 'ATTACK DAMAGE': v(c, 'DAMAGE') + (skillBalance(c.definition,c.skill.points)?0:60), 'ATTACK RANGE': v(c, 'ATTACK RANGE') + 100 }); },
  onAttack: c => { if (!gabenLevel(c) || !c.caster.summoned) return; const hit = new Set([c.target.id]); let previous = c.target; for (let i = 0; i < 32; i++) { const next = c.enemies().filter(t => !t.summoned && !hit.has(t.id) && distance(t, previous) <= 6.5).sort((a, b) => distance(a, previous) - distance(b, previous))[0]; if (!next) break; hit.add(next.id); c.attack(next, balanceNumber(c,'skill_effects_more.attack_multiplier.1',1), false); previous = next; } }, superImplemented: true, gabenImplemented: true }));

put('marci_grapple', active(c => {
  const dir = direction(c.caster, c.target), x = c.caster.x - dir.x * U(v(c, 'THROW DISTANCE')), y = c.caster.y - dir.y * U(v(c, 'THROW DISTANCE'));
  c.moveContinuous(c.target,x,y,{duration:defaultMotionDuration()});
  c.delay(defaultMotionDuration(),()=>{if(c.target.dead)return;
    if (gabenLevel(c)) c.status(c.target, 'targetAttackSpeed', balanceNumber(c,'skill_effects_more.targetattackspeed_duration.1',8), balanceNumber(c,'skill_effects_more.targetattackspeed_amount.1',120), harmful);
    for (const t of around(c,c.target.x,c.target.y,2.75)) { c.damage(t, v(c, 'IMPACT DAMAGE')); slow(c, t, v(c, 'MOVEMENT SLOW'), v(c, 'SLOW DURATION')); }
  });
}, ['throws enemy behind caster', 'landing area damage and slow', 'Super cast range', 'Gaben target-specific attacker speed'], ['Ally targeting', 'Landing radius and travel timing'], { range: c => balanceNumber(c,'skill_effects_more.range.1',1.75) + (superLevel(c) ? balanceNumber(c,'skill_effects_more.range.2',2.25) : 0), superImplemented: true, gabenImplemented: true }));

put('custom_void_spirit_dissimilate', active(c => {
  const start = { x: c.caster.x, y: c.caster.y }, angle = Math.atan2(c.target.y - start.y, c.target.x - start.x), portals = [start];
  for (let i = 0; i < 6; i++) portals.push({ x: start.x + Math.cos(angle + i * Math.PI / 3) * 5.2, y: start.y + Math.sin(angle + i * Math.PI / 3) * 5.2 });
  // Historical KV specifies six 60-degree inner portals and 520 spacing, but
  // leaves partial-outer-ring construction in engine code. Use three forward
  // outer portals at twice the radius as a transparent geometry default.
  if (superLevel(c)) for (const offset of [-Math.PI / 3, 0, Math.PI / 3]) portals.push({ x: start.x + Math.cos(angle + offset) * 10.4, y: start.y + Math.sin(angle + offset) * 10.4 });
  const valid = portals.filter(p => Math.abs(p.x) <= 14.17 && Math.abs(p.y) <= 12.516);
  const destination = valid.sort((a, b) => around(c, b.x, b.y, 2.75).length - around(c, a.x, a.y, 2.75).length || distance(a, c.target) - distance(b, c.target))[0] ?? start;
  travelLock(c, c.caster, v(c, 'PHASE DURATION') + .05, 'dissimilate');
  c.status(c.caster, 'visualForm', v(c, 'PHASE DURATION') + balanceNumber(c,'skill_effects_more.visualform_duration.1',0.05), 0, { dispel: 'none', data: { form: 'dissimilate', hidden: true, portals: JSON.stringify(valid) } });
  c.delay(v(c, 'PHASE DURATION'), () => { if (c.caster.dead) return; releaseTravel(c, c.caster); c.warp(c.caster,destination.x,destination.y); for (const t of near(c, 2.75)) { c.damage(t, (skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE"):(((v(c, 'DAMAGE') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',175) : 0)))))); if (gabenLevel(c)) stun(c, t, balanceNumber(c,'skill_effects_more.stun_duration.1',2.5)); } });
}, ['phase invulnerability and action lock', 'discrete portal generation and deterministic maximum-victim exit selection', 'delayed reappearance and damage', 'Super partial outer portals and damage', 'Gaben stun'], ['Historical Dota 2023-02-10: six inner portals, 60-degree spacing, 520 offset, 275 damage radius', 'Super partial outer ring uses three forward portals at 1040 offset; explicit project geometry default pending AA reference', 'AI exit tie-break and portal appearance'], { range: c => superLevel(c) ? balanceNumber(c,'skill_effects_more.range.1',13.15) : balanceNumber(c,'skill_effects_more.range.2',7.95), superImplemented: true, gabenImplemented: true }));

put('centaur_double_edge', active(c => {
  const damage = v(c, 'DAMAGE') + Number(c.caster.strength ?? 0) * P(v(c, 'STRENGTH DAMAGE'));
  for (const t of around(c, c.target.x, c.target.y, 1.9 + (superLevel(c) ? 2 : 0))) {
    c.damage(t, damage);
    if (superLevel(c)) { slow(c, t, balanceNumber(c,'skill_effects_more.slow_amount.1',25), balanceNumber(c,'skill_effects_more.slow_duration.1',2)); c.status(t, 'attackSpeedPct', balanceNumber(c,'skill_effects_more.attackspeedpct_duration.1',2), balanceNumber(c,'skill_effects_more.attackspeedpct_amount.1',-0.25), harmful); if (!t.summoned) { for (const status of c.caster.statuses) if (status.skill === c.skill.id && status.kind === 'strengthPct') status.until = c.battle.time + 15; c.status(c.caster, 'strengthPct', balanceNumber(c,'skill_effects_more.strengthpct_duration.1',15), balanceNumber(c,'skill_effects_more.strengthpct_amount.1',0.3), { maxStacks: balanceNumber(c,'skill_effects_more.maxstacks.1',5) }); } }
  }
  if (!gabenLevel(c)) { c.status(c.caster, 'undying', balanceNumber(c,'skill_effects_more.undying_duration.1',0.01)); c.damage(c.caster, damage); }
}, ['small-area magical damage', 'effective strength coefficient', 'nonlethal self damage', 'Super slows/radius/refreshing strength stacks', 'Gaben removes self damage and grants per-stack regeneration'], ['Four-class attribute mapping is a project rule pending AA calibration', 'Base damage radius provisional'], { range: 1.5, init: c => { if (gabenLevel(c)) clock(c, 120, .1, () => { const count = c.caster.statuses.filter(s => s.skill === c.skill.id && s.kind === 'strengthPct').length; if (count) c.status(c.caster, 'regen', balanceNumber(c,'skill_effects_more.regen_duration.1',0.15), c.caster.maxHp * balanceNumber(c,'skill_effects_more.regen_amount.1',0.005) * count); }); }, superImplemented: true, gabenImplemented: true }));

put('elder_titan_earth_splitter', active(c => {
  const start = { x: c.caster.x, y: c.caster.y }, end = endpoint(c, U(v(c, 'CRACK LENGTH')));
  c.delay(v(c, 'IMPLODE DELAY'), () => {
    for (const t of lineTargets(c, start, end, U(v(c, 'CRACK WIDTH') + (superLevel(c) ? 75 : 0)))) {
      const damage = t.maxHp * (P(v(c, 'MAX HP AS DAMAGE')) + (superLevel(c) ? .1 : 0));
      c.damage(t, damage / balanceNumber(c,'skill_effects_more.damage.1',2), 'magical', true); c.damage(t, damage / balanceNumber(c,'skill_effects_more.damage.2',2), 'physical', true); slow(c, t, v(c, 'MOVEMENT SLOW'), v(c, 'SLOW DURATION'));
      if (gabenLevel(c)) { c.status(t, 'armor', v(c, 'SLOW DURATION'), -t.armor, { harmful: true, piercesImmunity: true }); c.status(t, 'baseMagicResistPct', v(c, 'SLOW DURATION'), balanceNumber(c,'skill_effects_more.basemagicresistpct_amount.1',-1), { harmful: true, piercesImmunity: true }); }
    }
  });
}, ['delayed line crack', 'half physical/half magical max-health damage', 'slow', 'Super damage/width/cooldown', 'Gaben base armor and magic-resistance removal'], ['Crack-width radius versus diameter verification', 'Armor removal uses base armor sampled at impact'], { range: c => U(v(c, 'CRACK LENGTH')), cooldown: c => cooldown(c, superLevel(c) ? 60 : 0), superImplemented: true, gabenImplemented: true }));

put('custom_sandking_epicenter', active(c => {
  const pulses = v(c, 'PULSES') + (superLevel(c) ? 3 : 0);
  for (let i = 0; i < pulses; i++) c.delay(i * balanceNumber(c,'skill_effects_more.delay.1',0.3), () => {
    if (c.caster.dead) return;
    const pulseRadius = U(v(c, 'RADIUS') + (superLevel(c) ? 100 : 0) + i * v(c, 'RADIUS INCREASE PER PULSE'));
    addVisualWorldEffect(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'wave', role: 'ground_event', kind: 'pulse', x: c.caster.x, y: c.caster.y, radius: pulseRadius, until: c.battle.time + EPICENTER_VISUAL_SECONDS });
    for (const t of near(c, pulseRadius)) {
      const damage = (skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE"):((((v(c, 'DAMAGE') + (superLevel(c) ? 20 : 0)))))) * (gabenLevel(c) && distance(t, c.caster) <= 3 ? 2 : 1);
      c.damage(t, damage); slow(c, t, v(c, 'MOVEMENT SLOW'), v(c, 'SLOW DURATION')); c.status(t, 'attackSpeed', v(c, 'SLOW DURATION'), -v(c, 'ATTACK SLOW'), harmful);
    }
  });
}, ['expanding caster-following pulses', 'movement and attack slows', 'Super pulse count/radius/damage and movement pulse', 'Gaben immediate cast and close-range amplification'], ['Pulse interval .3s provisional', 'Teleports versus walked distance for passive pulses'], { target: 'self', castPoint: c => gabenLevel(c) ? 0 : 2, canCast: c => near(c, 5).length > 0, init: c => { if (!superLevel(c)) return; let previous = { x: c.caster.x, y: c.caster.y }, traveled = 0; clock(c, 120, .1, () => { traveled += distance(previous, c.caster); previous = { x: c.caster.x, y: c.caster.y }; while (traveled >= 7) { traveled -= 7; addVisualWorldEffect(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'wave', role: 'ground_event', kind: 'pulse', x: c.caster.x, y: c.caster.y, radius: U(v(c, 'RADIUS') + 100), until: c.battle.time + EPICENTER_VISUAL_SECONDS }); for (const target of near(c, U(v(c, 'RADIUS') + 100))) { c.damage(target, (v(c, 'DAMAGE') + (skillBalance(c.definition,c.skill.points)?0:balanceNumber(c,'skill_effects_more.damage.1',20))) * (gabenLevel(c) && distance(target, c.caster) <= balanceNumber(c,'skill_effects_more.damage.2',3) ? balanceNumber(c,'skill_effects_more.damage.3',2) : balanceNumber(c,'skill_effects_more.damage.4',1))); slow(c, target, v(c, 'MOVEMENT SLOW'), v(c, 'SLOW DURATION')); c.status(target, 'attackSpeed', v(c, 'SLOW DURATION'), -v(c, 'ATTACK SLOW'), harmful); } } }); }, superImplemented: true, gabenImplemented: true }));

put('custom_razor_eye_of_the_storm', active(c => {
  clock(c, v(c, 'DURATION'), Math.max(.1, v(c, 'STRIKE INTERVAL') - (gabenLevel(c) ? .2 : 0)), () => {
    const targets = near(c, U(v(c, 'RADIUS'))).sort((a, b) => a.hp - b.hp).slice(0, v(c, 'TARGETS') + (superLevel(c) ? 2 : 0));
    for (const t of targets) { c.damage(t, v(c, 'DAMAGE'), 'physical', true); c.status(t, 'armor', v(c, 'DURATION'), -v(c, 'ARMOR REDUCTION'), { ...harmful, maxStacks: balanceNumber(c,'skill_effects_more.maxstacks.1',1000) }); }
    if (gabenLevel(c)) { c.heal(c.caster, v(c, 'DAMAGE') * balanceNumber(c,'skill_effects_more.heal.1',0.33)); c.status(c.caster, 'armor', v(c, 'DURATION'), v(c, 'ARMOR REDUCTION') * balanceNumber(c,'skill_effects_more.armor_amount.1',0.33), { maxStacks: balanceNumber(c,'skill_effects_more.maxstacks.2',1000) }); }
  });
}, ['lowest-health periodic targets', 'physical lightning', 'stacking armor reduction', 'Super additional targets', 'Gaben healing/armor and interval'], ['Armor debuff lifetime verification', 'Target priority tie behavior'], { target: 'self', canCast: c => near(c, U(v(c, 'RADIUS'))).length > 0, superImplemented: true, gabenImplemented: true }));

put('rubick_fade_bolt', active(c => {
  const visited = new Set<string>();
  const bounce = (target: CombatUnit, hop: number) => c.projectile(target, balanceNumber(c,'skill_effects_more.projectile_speed.1',12), t => {
    visited.add(t.id); c.damage(t, v(c, 'DAMAGE') * Math.pow(1 - P(v(c, 'JUMP REDUCTION')), hop));
    c.status(t, 'baseAttackDamageReduction', v(c, 'DEBUFF DURATION'), P(v(c, 'DAMAGE REDUCTION')), harmful);
    if (superLevel(c)) instantAttack(c, t);
    if (gabenLevel(c)) c.status(c.caster, 'attackBonus', v(c, 'DEBUFF DURATION'), t.attack * P(v(c, 'DAMAGE REDUCTION')), { maxStacks: balanceNumber(c,'skill_effects_more.maxstacks.1',1000) });
    const next = c.enemies().filter(e => !visited.has(e.id) && distance(e, t) <= 4.4).sort((a, b) => distance(a, t) - distance(b, t))[0];
    if (next) bounce(next, hop + 1);
  }); bounce(c.target, 0);
}, ['unique-target damage-decaying chain', 'attack damage reduction', 'Super instant attacks', 'Gaben attack-damage theft and cooldown'], ['Bounce range and projectile speed provisional', 'Steal derived from target base attack; exact reference basis unresolved'], { cooldown: c => cooldown(c, gabenLevel(c) ? 4 : 0), superImplemented: true, gabenImplemented: true }));

put('custom_snapfire_firesnap_cookie', active(c => {
  const ally = c.target;
  const hop = () => {
    if (ally.dead) return;
    const enemy = c.enemies().sort((a, b) => distance(ally, a) - distance(ally, b))[0]; if (!enemy) return;
    const d = direction(ally, enemy), length = U(v(c, 'HOP DISTANCE') + (superLevel(c) ? 175 : 0)), x = ally.x + d.x * length, y = ally.y + d.y * length, duration = .484 + (superLevel(c) ? .2 : 0);
    if (superLevel(c)) c.heal(ally, balanceNumber(c,'skill_effects_more.heal.1',200));
    c.moveContinuous(ally,x,y,{duration,ignoreBarriers:true});
    c.delay(duration, () => {
      if (ally.dead) return;
      for (const t of around(c, x, y, U(v(c, 'IMPACT RADIUS')))) { c.damage(t, v(c, 'IMPACT DAMAGE')); stun(c, t, v(c, 'IMPACT STUN DURATION')); }
      // The AA catalog's maximum base Mortimer Kiss is 300 impact / 30 DPS,
      // 25% slow / 3s / 275 radius. Only one glob is granted, not a barrage.
      if (superLevel(c)) { for (const t of around(c, x, y, 2.75)) c.damage(t, balanceNumber(c,'skill_effects_more.damage.1',300)); c.zone({ x, y, radius: balanceNumber(c,'skill_effects_more.radius.1',2.75), duration: balanceNumber(c,'skill_effects_more.duration.1',3), interval: balanceNumber(c,'skill_effects_more.interval.1',0.2), effect: t => { c.damage(t, balanceNumber(c,'skill_effects_more.damage.2',6)); slow(c, t, balanceNumber(c,'skill_effects_more.slow_amount.1',25), balanceNumber(c,'skill_effects_more.slow_duration.1',0.3)); } }); }
    });
  };
  hop(); if (gabenLevel(c)) for (let second = 1; second <= 3; second++) c.delay(second, hop);
}, ['ally hop toward enemies', 'landing damage and stun', 'Super extended hop/200 heal/single Mortimer Kiss and 200 caster max health', 'Gaben three additional cookies one second apart'], ['Reference hop trajectory and target priority', 'Super max health applies once to the skill holder for the battle; explicit semantic default, AA recipient/duration unspecified', 'Granted Mortimer Kiss uses AA max-base rank; AA grant rank unspecified', 'Historical Dota 2023-02-10 Cookie shard adds 175 range/0.2s flight; AA version match unverified', '800 cast range follows official AA Season 2 notes, newer override not found'], { target: 'ally', range: 8, canCast: c => c.enemies().some(t => distance(t, c.target) <= 8), init: c => { if (superLevel(c)) { c.caster.maxHp += 200; c.caster.hp += 200; } }, superImplemented: true, gabenImplemented: true }));

put('custom_earthshaker_fissure', active(c => {
  const length = U(v(c, 'FISSURE RANGE') + (superLevel(c) ? 320 : 0)), dir = direction(c.caster, c.target), start = { x: c.caster.x, y: c.caster.y }, end = endpoint(c, length), victims = lineTargets(c, start, end, 2.25);
  const segments = [{ from: { x: start.x + dir.x * .8, y: start.y + dir.y * .8 }, to: end, until: c.battle.time + v(c, 'FISSURE DURATION') }];
  if (gabenLevel(c) && victims[0]) { const center = { x: victims[0].x - dir.x * .8, y: victims[0].y - dir.y * .8 }, from = { x: center.x - dir.y * length / 2, y: center.y + dir.x * length / 2 }, to = { x: center.x + dir.y * length / 2, y: center.y - dir.x * length / 2 }; segments.push({ from, to, until: c.battle.time + v(c, 'FISSURE DURATION') }); for (const t of lineTargets(c, from, to, 2.25)) if (!victims.includes(t)) victims.push(t); }
  for (const segment of segments) c.barrier({ from: segment.from, to: segment.to, width: .8, duration: v(c, 'FISSURE DURATION'), blocks: 'enemies' });
  c.caster.fissureSegments = [...((c.caster.fissureSegments ?? []) as typeof segments).filter(s => s.until > c.battle.time), ...segments];
  for (const t of victims) { c.damage(t, (skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE"):(((v(c, 'DAMAGE') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',80) : 0)))))); stun(c, t, v(c, 'STUN DURATION')); }
}, ['line damage and stun', 'persistent enemy-blocking ridge with endpoint pathfinding', 'AA ally/caster free passage on fissures', 'Super damage/range', 'Gaben perpendicular fissure and Aftershock for casts while physically touching a surviving own fissure'], ['Historical Dota 2023-02-10 Fissure damage radius 225 and max Aftershock 150 damage/1.5s stun/300 radius', 'Physical ridge width 80 plus body radius 40 defines on-fissure contact; width remains explicit geometry assumption', 'Perpendicular ridge uses main range symmetrically; overlapping damage once per cast needs AA verification'], { range: c => U(v(c, 'FISSURE RANGE') + (superLevel(c) ? 320 : 0)), onCast: c => { if (!gabenLevel(c)) return; const segments = (c.caster.fissureSegments ?? []) as { from: { x: number; y: number }; to: { x: number; y: number }; until: number }[]; if (segments.some(s => s.until > c.battle.time && pointOnLine(c.caster, s.from, s.to, .8 + 1e-8))) for (const t of near(c, 3)) { c.damage(t, balanceNumber(c,'skill_effects_more.damage.2',150)); stun(c, t, balanceNumber(c,'skill_effects_more.stun_duration.1',1.5)); } }, superImplemented: true, gabenImplemented: true }));

put('custom_crystal_maiden_freezing_field', active(c => {
  const exposure = new Map<string, { seconds: number; last: number }>(), frozen = new Set<string>();
  c.status(c.caster, 'armor', balanceNumber(c,'skill_effects_more.armor_duration.1',0.25), v(c, 'BONUS ARMOR')); if (superLevel(c)) c.status(c.caster, 'slow', balanceNumber(c,'skill_effects_more.slow_duration.1',10), balanceNumber(c,'skill_effects_more.slow_amount.1',0.75));
  clock(c, 10, v(c, 'EXPLOSION INTERVAL') - (superLevel(c) ? .02 : 0), () => {
    c.status(c.caster, 'armor', balanceNumber(c,'skill_effects_more.armor_duration.2',0.25), v(c, 'BONUS ARMOR')); if (superLevel(c)) c.status(c.caster, 'slow', balanceNumber(c,'skill_effects_more.slow_duration.2',0.25), balanceNumber(c,'skill_effects_more.slow_amount.2',0.75));
    const angle = c.random() * Math.PI * 2, r = Math.sqrt(c.random()) * U(v(c, 'RADIUS')), x = c.caster.x + Math.cos(angle) * r, y = c.caster.y + Math.sin(angle) * r;
    addVisualWorldEffect(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'ice_burst', role: 'world_random_explosion', kind: 'burst', x, y, radius: U(v(c, 'EXPLOSION RADIUS')), until: c.battle.time + FREEZING_BURST_VISUAL_SECONDS });
    for (const t of near(c, U(v(c, 'RADIUS')))) {
      slow(c, t, v(c, 'MOVEMENT SLOW'), balanceNumber(c,'skill_effects_more.slow_duration.3',0.3)); c.status(t, 'attackSpeed', balanceNumber(c,'skill_effects_more.attackspeed_duration.1',0.3), v(c, 'ATTACK SLOW'), harmful);
      if (gabenLevel(c) && !frozen.has(t.id)) { const old = exposure.get(t.id), interval = v(c, 'EXPLOSION INTERVAL') - .02, seconds = old && c.battle.time - old.last <= interval + .05 ? old.seconds + interval : interval; exposure.set(t.id, { seconds, last: c.battle.time }); if (seconds >= 1.75) { frozen.add(t.id); c.castAbility('crystal_maiden_frostbite', 3, t); } }
    }
    for (const t of around(c, x, y, U(v(c, 'EXPLOSION RADIUS')))) c.damage(t, (skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE"):(((v(c, 'DAMAGE') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',50) : 0))))));
  }, true);
}, ['interruptible field', 'seeded spatial explosions', 'area slows', 'field-bound armor', 'Super free movement/casting/attacks at reduced speed', 'Gaben Linkens stats/recharging spell block and continuous-exposure Frostbite'], ['Explosion sector distribution verification', 'Buffs expire within .25s after interruption', 'Historical Dota 2023-02-10 Linkens values and max-base Frostbite mapping require AA verification'], { target: 'self', channel: c => superLevel(c) ? 0 : 10, canCast: c => near(c, U(v(c, 'RADIUS'))).length > 0, init: c => {
  if (!gabenLevel(c)) return;
  c.status(c.caster, 'statBonus', balanceNumber(c,'skill_effects_more.statbonus_duration.1',1000000), balanceNumber(c,'skill_effects_more.statbonus_amount.1',16), { dispel: 'none' }); c.status(c.caster, 'regen', balanceNumber(c,'skill_effects_more.regen_duration.1',1000000), balanceNumber(c,'skill_effects_more.regen_amount.1',7), { dispel: 'none' }); c.status(c.caster, 'manaRegen', balanceNumber(c,'skill_effects_more.manaregen_duration.1',1000000), balanceNumber(c,'skill_effects_more.manaregen_amount.1',5), { dispel: 'none' }); c.status(c.caster, 'spellBlock', balanceNumber(c,'skill_effects_more.spellblock_duration.1',1000000), balanceNumber(c,'skill_effects_more.spellblock_amount.1',1), { dispel: 'none' });
  let armed = true, next = Infinity;
  clock(c, 120, .1, () => { const present = c.caster.statuses.some(s => s.kind === 'spellBlock' && s.skill === c.skill.id); if (present) return; if (armed) { armed = false; next = c.battle.time + 14; } if (c.battle.time >= next) { c.status(c.caster, 'spellBlock', balanceNumber(c,'skill_effects_more.spellblock_duration.2',1000000), balanceNumber(c,'skill_effects_more.spellblock_amount.2',1), { dispel: 'none' }); armed = true; } });
}, superImplemented: true, gabenImplemented: true }));

put('kunkka_ghostship', active(c => {
  const end = { x: c.target.x, y: c.target.y }, dir = direction(c.caster, end), start = { x: end.x - dir.x * U(v(c, 'RANGE')), y: end.y - dir.y * U(v(c, 'RANGE')) };
  const crash = () => { for (const t of around(c, end.x, end.y, U(v(c, 'WIDTH')))) { c.damage(t, v(c, 'DAMAGE')); stun(c, t, v(c, 'STUN DURATION')); } if (superLevel(c)) c.castAbility('aa_granted_tidal_wave', 1, { ...c.target, x: end.x, y: end.y }); };
  const launch = () => {
    const touched = new Set<string>(); let elapsed = 0, previous = start;
    const visual = addVisualProjectile(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'ghostship_sail', role: 'summon_sail', ...start, angle: Math.atan2(dir.y, dir.x), until: c.battle.time + v(c, 'IMPACT DELAY') + MOTION_STEP });
    const travel = () => {
      elapsed += MOTION_STEP; const q = Math.min(1, elapsed / v(c, 'IMPACT DELAY')), next = { x: start.x + (end.x - start.x) * q, y: start.y + (end.y - start.y) * q };
      moveVisualProjectile(c.battle, visual, next);
      for (const ally of c.allies().filter(t => !t.summoned || t.illusion)) if (!touched.has(ally.id) && pointOnLine(ally, previous, next, U(v(c, 'WIDTH')))) {
        touched.add(ally.id); c.status(ally, 'haste', v(c, 'RUM DURATION'), P(v(c, 'RUM BONUS SPEED')), { dispel: 'none' });
        c.status(ally, 'ghostshipRum', v(c, 'RUM DURATION'), P(v(c, 'DAMAGE DELAYED')) + (superLevel(c) ? balanceNumber(c,'skill_effects_more.ghostshiprum_amount.1',0.1) : 0), { dispel: 'none', data: { paybackDuration: 10 } });
      }
      previous = next; if (q < 1) c.delay(MOTION_STEP, travel); else removeVisualProjectile(c.battle, visual);
    }; c.delay(MOTION_STEP, travel); c.delay(v(c, 'IMPACT DELAY'), crash);
  };
  launch(); if (gabenLevel(c)) { c.delay(balanceNumber(c,'skill_effects_more.delay.1',3.5), launch); c.delay(balanceNumber(c,'skill_effects_more.delay.2',7), launch); }
}, ['continuous ghost-ship sweep buffs touched allied heroes', 'delayed area crash damage and stun', 'Rum delays a fraction of post-mitigation damage then repays nonlethal HP loss', 'Super extra 10% deferral and enemy-directed Tidal Wave on each crash', 'Gaben additional ships'], ['Ship traverses source range during AA impact delay; visual origin/radius need AA reference', 'Rum repays evenly over ten seconds as explicit timing default; historical English Note0 confirms nonlethal repayment but KV lacks payback duration', 'Historical Dota 2023-02-10 Tidal Wave values need AA version validation'], { range: c => U(v(c, 'RANGE')), superImplemented: true, gabenImplemented: true }));

put('mars_gods_rebuke', active(c => {
  const d = direction(c.caster, c.target);
  for (const t of near(c, U(v(c, 'DISTANCE'))).filter(t => { const n = direction(c.caster, t); return n.x * d.x + n.y * d.y >= Math.cos(70 * Math.PI / 180); })) {
    instantAttack(c, t, P(v(c, 'CRITICAL DAMAGE')) + (superLevel(c) ? .65 : 0), t.summoned ? 0 : v(c, 'BONUS DAMAGE VS HEROES'), true);
    const away = direction(c.caster, t), start = { x: t.x, y: t.y }; let elapsed = 0;
    c.status(t, 'phased', balanceNumber(c,'skill_effects_more.phased_duration.1',0.3), 0, { dispel: 'none' }); c.status(t, 'selfStun', balanceNumber(c,'skill_effects_more.selfstun_duration.1',0.3), 0, { harmful: true, dispel: 'none' });
    const push = () => { if (t.dead) return; elapsed = Math.min(.3, elapsed + MOTION_STEP); c.moveContinuous(t,start.x + away.x * 1.5 * elapsed / .3,start.y + away.y * 1.5 * elapsed / .3,{duration:1/30}); if (elapsed < .3 - 1e-8) c.delay(MOTION_STEP, push); }; c.delay(MOTION_STEP, push);
    slow(c, t, v(c, 'KNOCKBACK SLOW'), (skillBalance(c.definition,c.skill.points)?v(c,"KNOCKBACK SLOW DURATION"):(((v(c, 'KNOCKBACK SLOW DURATION') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.slow_duration.1',1.5) : 0))))));
    if (gabenLevel(c)) { stun(c, t, balanceNumber(c,'skill_effects_more.stun_duration.1',1)); c.status(t, 'break', balanceNumber(c,'skill_effects_more.break_duration.1',1), 0, harmful); }
  }
}, ['frontal 140-degree cone critical attacks', 'true strike', 'hero bonus', 'continuous 150-distance knockback over 0.3 seconds and slow', 'Super bonuses', 'Gaben stun/break'], ['Cone and knockback use historical Dota 2023-02-10 candidate values', 'Bonus-damage critical ordering and immunity to forced movement require AA comparison'], { range: c => U(v(c, 'DISTANCE')), cooldown: c => cooldown(c, superLevel(c) ? 4 : 0), superImplemented: true, gabenImplemented: true }));

put('custom_ancient_apparition_ice_blast', active(c => {
  const origin = { x: c.caster.x, y: c.caster.y }, destination = { x: c.target.x, y: c.target.y }, length = distance(origin, destination), seen = new Set<string>();
  const radius = Math.min(10, 2.75 + .5 * length / 15), threshold = P((skillBalance(c.definition,c.skill.points)?v(c,"SHATTER HEALTH THRESHOLD"):(((v(c, 'SHATTER HEALTH THRESHOLD') + (superLevel(c) ? 4 : 0))))));
  const frostbite = (target: CombatUnit) => {
    if (target.dead || seen.has(target.id)) return; seen.add(target.id);
    const token = `${c.caster.id}:${c.battle.time}:${target.id}`, duration = v(c, 'FROSTBITTEN DURATION');
    c.status(target, 'iceBlastFrostbite', duration, 0, { harmful: true, dispel: 'strong', piercesImmunity: true, data: { token } });
    c.status(target, 'healReduction', duration, balanceNumber(c,'skill_effects_more.healreduction_amount.1',1), { harmful: true, dispel: 'strong', piercesImmunity: true });
    const marker = (target.statuses as EffectStatus[]).find(s => s.kind === 'iceBlastFrostbite' && s.source === c.caster.id && s.data?.token === token); if (!marker) return;
    const expires = marker.until; let previous = c.battle.time, accumulated = 0;
    const check = () => {
      if (target.dead) return;
      const current = (target.statuses as EffectStatus[]).find(s => s.kind === 'iceBlastFrostbite' && s.source === c.caster.id);
      if ((current && current.data?.token !== token) || (!current && c.battle.time < expires - 1e-8)) return;
      accumulated += Math.max(0, Math.min(expires, c.battle.time) - previous); previous = Math.min(expires, c.battle.time);
      if (accumulated >= .2 - 1e-8 || c.battle.time >= expires - 1e-8) { c.damage(target, v(c, 'FROSTBITTEN DAMAGE PER SECOND') * accumulated, 'magical', true); accumulated = 0; }
      if (!target.dead && !target.statuses.some(s=>s.kind==='berserk') && target.hp / target.maxHp < threshold) c.execute(target);
      if (!target.dead && c.battle.time < expires - 1e-8) c.delay(1 / 30, check);
    };
    check();
  };
  c.linearProjectile({ origin, angle: Math.atan2(destination.y - origin.y, destination.x - origin.x), distance: length, speed: balanceNumber(c,'skill_effects_more.speed.1',15), width: 2.75, effect: frostbite, onEnd: () => {
    if (superLevel(c)) c.castAbility('ancient_apparition_ice_vortex', 4, { ...c.target, ...destination });
    for (const target of around(c, destination.x, destination.y, radius)) { c.damage(target, v(c, 'IMPACT DAMAGE'), 'magical', true); frostbite(target); }
  } });
  if (gabenLevel(c)) for (const t of c.enemies()) c.castAbility('ancient_apparition_cold_feet', 4, t, { 'DAMAGE PER SECOND': 90, 'STUN DURATION': 3.5 });
}, ['independent swept hail and fixed chosen-point impact', 'frostbite on traversed and explosion victims', 'strong-dispellable damage/healing prevention persists after caster death', 'fixed-step low-health execution bypasses damage protection', 'distance-dependent explosion radius', 'Super vortex before damage and threshold', 'Gaben arena-wide Cold Feet on Ice Blast cast with AA 90 DPS/3.5-second stun'], ['AI automatically releases at the initially chosen point; native two-stage tracer/release input remains simplified', 'Historical Dota 2023-02-10: 1500 speed/275 path radius/275 minimum and 1000 maximum radius; +50 radius per flight second is the explicit distance-growth interpretation', 'A victim touched in flight keeps its original frostbite timer when also inside the terminal explosion', 'Second Ice Age cast trigger confirmed by official AA Season 4.5 notes (2023-02-01)', 'Historical child defaults need AA version validation'], { range: 40, superImplemented: true, gabenImplemented: true }));

put('jakiro_ice_path', active(c => {
  const start = { x: c.caster.x, y: c.caster.y }, end = endpoint(c, 12 + (superLevel(c) ? 10 : 0));
  c.delay(v(c, 'FORMATION DELAY'), () => {
    if (gabenLevel(c)) c.castAbility('jakiro_macropyre', 2, { ...c.target, x: end.x, y: end.y }, { RANGE: (12 + (superLevel(c) ? 10 : 0)) * 100 });
    const touched = new Set<string>(), duration = v(c, 'PATH DURATION') + (superLevel(c) ? .5 : 0), until = c.battle.time + duration;
    c.zone({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, radius: distance(start, end) / balanceNumber(c,'skill_effects_more.radius.1',2) + U(v(c, 'RADIUS')), duration, interval: balanceNumber(c,'skill_effects_more.interval.1',0.1), effect: t => {
      if (!touched.has(t.id) && !t.statuses.some(s => ['invulnerable', 'banished'].includes(s.kind) && s.until > c.battle.time) && pointOnLine(t, start, end, U(v(c, 'RADIUS')))) { touched.add(t.id); c.damage(t, v(c, 'DAMAGE')); stun(c, t, Math.max(0, Math.min(until - c.battle.time, v(c, 'MAX STUN DURATION') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.stun_duration.1',0.5) : 0)))); }
    } });
  });
}, ['delayed fixed ice path persists after caster death', 'first-touch damage and stun capped by remaining path lifetime', 'Super range/duration', 'Gaben native level-two Macropyre following Ice Path length'], ['Catalog contains conflicting DAMAGE 0 and 50 rows; last row chosen provisionally', 'Base range 1200 not supplied', 'Historical Dota 2023-02-10 Macropyre and aligning its length to Ice Path need AA verification'], { range: c => balanceNumber(c,'skill_effects_more.range.1',12) + (superLevel(c) ? balanceNumber(c,'skill_effects_more.range.2',10) : 0), superImplemented: true, gabenImplemented: true }));

put('custom_tusk_ice_shards', active(c => {
  const start = { x: c.caster.x, y: c.caster.y }, end = { x: c.target.x, y: c.target.y }, direction0 = direction(start, end), length = distance(start, end), angle = Math.atan2(direction0.y, direction0.x);
  c.linearProjectile({ origin: start, angle, distance: length, speed: balanceNumber(c,'skill_effects_more.speed.1',12), width: U(v(c, 'RADIUS')), effect: t => c.damage(t, v(c, 'SHARD DAMAGE')), onEnd: () => {
    const visual = { group: `${c.caster.id}:${c.skill.id}:${c.battle.time}`, centerX: end.x, centerY: end.y, angle };
    const points = Array.from({ length: 7 }, (_, i) => ({ x: end.x + Math.cos(angle + (i - 3) * 40 * Math.PI / 180) * 2, y: end.y + Math.sin(angle + (i - 3) * 40 * Math.PI / 180) * 2 }));
    for (let i = 1; i < points.length; i++) c.barrier({ from: points[i - 1], to: points[i], width: .5, duration: v(c, 'SHARD DURATION'), visual });
    if (superLevel(c)) {
      for (const edge of [points[0], points[6]]) c.barrier({ from: edge, to: { x: edge.x - direction0.x * 3, y: edge.y - direction0.y * 3 }, width: .5, duration: v(c, 'SHARD DURATION'), visual });
      c.zone({ x: end.x, y: end.y, radius: gabenLevel(c) ? balanceNumber(c,'skill_effects_more.radius.1',100) : balanceNumber(c,'skill_effects_more.radius.2',5), duration: v(c, 'SHARD DURATION'), interval: balanceNumber(c,'skill_effects_more.interval.1',0.2), effect: t => { const dx = t.x - end.x, dy = t.y - end.y, along = dx * direction0.x + dy * direction0.y, across = -dx * direction0.y + dy * direction0.x; if (gabenLevel(c) || (along >= -4 && along <= 2 && Math.abs(across) <= 2)) { slow(c, t, balanceNumber(c,'skill_effects_more.slow_amount.1',40), balanceNumber(c,'skill_effects_more.slow_duration.1',0.3)); c.damage(t, balanceNumber(c,'skill_effects_more.damage.1',12)); } } });
    }
  } });
}, ['continuous swept shard projectile that survives caster death', 'grouped persistent curved ice barrier and path obstruction at real projectile arrival', 'Super cooldown/60 DPS/40% slow and 300 extra wall depth', 'Gaben arena-wide lingering damage/slow while walls exist'], ['Historical Dota 2023-02-10 1800 range/1200 speed/seven shards/40-degree spacing/200 placement distance', 'Arc placement, physical wall thickness and trapped-area polygon need AA visual/reference verification'], { range: 18, cooldown: c => cooldown(c, superLevel(c) ? 6 : 0), superImplemented: true, gabenImplemented: true }));

put('custom_huskar_life_break', active(c => {
  const target = c.target, touched = new Set<CombatUnit>(); let ended = false;
  c.dispel(c.caster); const envelope = Math.max(.05, 120 - c.battle.time); motionLock(c, envelope); c.status(c.caster, 'magicImmune', envelope, 0, { dispel: 'none' });
  const stop = () => { ended = true; unlockMotion(c); c.caster.statuses = c.caster.statuses.filter(s => !(s.skill === c.skill.id && s.kind === 'magicImmune')); };
  clock(c, envelope, .05, () => {
    if (ended) return; if (target.dead || c.caster.statuses.some(s => ['stun', 'hex', 'banished'].includes(s.kind))) { stop(); return; }
    const from = { x: c.caster.x, y: c.caster.y }, d = direction(c.caster, target), step = Math.min(distance(c.caster, target), .6); c.moveContinuous(c.caster,from.x + d.x * step,from.y + d.y * step,{duration:.05});
    for (const t of lineTargets(c, from, c.caster, .8)) if (t.id !== target.id) touched.add(t);
    if (distance(c.caster, target) <= .5) {
      const self = c.caster.hp * P(v(c, 'DAMAGE TAKEN')), enemy = target.hp * P(v(c, 'DAMAGE DEALT'));
      c.caster.hp = Math.max(1, c.caster.hp - self); c.damage(target, enemy + (superLevel(c) ? self : 0), 'magical', true); slow(c, target, v(c, 'MOVEMENT SLOW'), v(c, 'SLOW DURATION'));
      if (gabenLevel(c)) c.status(target, 'duel', balanceNumber(c,'skill_effects_more.duel_duration.1',3), 0, { harmful: true, piercesImmunity: true, data: { targetId: c.caster.id } });
      if (superLevel(c)) for (const t of touched) c.damage(t, self, 'magical', true); stop();
    }
  });
}, ['continuous leap toward farthest eligible enemy with travel immunity/action lock', 'basic dispel', 'current-health damage/cost', 'slow', 'Super self-cost damage on target and swept traversed units', 'Gaben forced attack and +45 strength'], ['Self-damage mitigation/health cost semantics', 'Historical Dota 2023-02-10 550 cast range/1200 charge speed; collision width 80 remains working geometry', 'Farthest eligible target is locked at cast windup; exact moving-target AI priority and taunt restrictions need AA verification'], { range: 5.5, targetSelector: (c, candidates) => candidates.sort((a, b) => distance(b, c.caster) - distance(a, c.caster) || a.id.localeCompare(b.id))[0], init: c => { if (gabenLevel(c)) c.status(c.caster, 'strength', balanceNumber(c,'skill_effects_more.strength_duration.1',1000000), balanceNumber(c,'skill_effects_more.strength_amount.1',45)); }, superImplemented: true, gabenImplemented: true }));

put('custom_pugna_life_drain', active(c => {
  const primary = c.target;
  const token = `${c.skill.id}:${c.battle.time}`, targets = [primary], used = new Set([primary.id]); let ended = false;
  const add = (t: CombatUnit, duration: number) => c.status(t, 'lifeDrainLink', duration, 0, { harmful: t.side !== c.caster.side, dispel: 'strong', data: { link: token } });
  const linked = (t: CombatUnit) => t.statuses.some(s => s.skill === c.skill.id && s.source === c.caster.id && s.kind === 'lifeDrainLink' && (s as EffectStatus).data?.link === token);
  const clear = () => { ended = true; for (const t of targets) t.statuses = t.statuses.filter(s => !(s.skill === c.skill.id && s.source === c.caster.id && (s as EffectStatus).data?.link === token)); };
  const end = () => { clear(); c.endChannel(); };
  const invalid = (t: CombatUnit) => t.dead || distance(t, c.caster) > 9 || !linked(t) || t.statuses.some(s => ['invulnerable', 'banished', ...(t.side !== c.caster.side ? ['magicImmune'] : [])].includes(s.kind));
  add(primary, 10.001);
  const cleanup = () => { if (ended) return; if (c.caster.dead || c.caster.action !== 'channel' || c.caster.castUntil <= c.battle.time) { clear(); return; } c.delay(balanceNumber(c,'skill_effects_more.delay.1',0.1), cleanup); }; c.delay(balanceNumber(c,'skill_effects_more.delay.2',0.1), cleanup);
  clock(c, 10, .1, tick => {
    if (ended) return; if (invalid(primary)) { end(); return; }
    if (superLevel(c) && (tick + 1) % 10 === 0) { const eligible = c.enemies().filter(t => !t.summoned && !used.has(t.id) && distance(t, c.caster) <= 9 && !t.statuses.some(s => ['magicImmune', 'invulnerable', 'banished'].includes(s.kind))); if (eligible.length) { const chosen = eligible[Math.floor(c.random() * eligible.length)]; targets.push(chosen); used.add(chosen.id); add(chosen, Math.max(.1, 10 - (tick + 1) * .1 + .001)); } }
    for (const drained of targets) {
      if (invalid(drained)) { drained.statuses = drained.statuses.filter(s => !(s.skill === c.skill.id && s.source === c.caster.id && (s as EffectStatus).data?.link === token)); continue; }
      c.status(drained, 'visualLink', balanceNumber(c,'skill_effects_more.visuallink_duration.1',0.15), 0, { dispel: 'none', data: { link: token, mode: 'health', ally: drained.side === c.caster.side } });
      const amount = (v(c, 'DRAIN PER SECOND') + (gabenLevel(c) ? 200 : 0)) * .1;
      if (drained.side === c.caster.side) {
        const paid = Math.min(amount, drained.maxHp - drained.hp, Math.max(0, c.caster.hp - 1)); c.caster.hp -= paid; c.heal(drained, paid);
        if (drained.hp >= drained.maxHp - 1e-8 || c.caster.hp <= 1) { end(); return; }
      } else if (drained.illusion && !drained.strongIllusion) {
        c.execute(drained); if (drained === primary && drained.dead) { end(); return; }
      } else {
        const hpMissing = c.caster.hp < c.caster.maxHp, dealt = c.damage(drained, amount); if (hpMissing) c.heal(c.caster, dealt); else if (!drained.summoned || drained.consideredHero) c.mana(c.caster, dealt);
        if (drained === primary && drained.dead) { end(); return; }
      }
    }
  }, true);
}, ['interruptible enemy drain or self-health-to-ally transfer', 'real ally/enemy unit target preserves spell block and Soulbind dispatch', 'AA AI only heals low allies when caster starts above 90% HP', 'actual enemy-damage healing and full-HP mana restoration', 'immediate channel end on primary range/death/dispel/untargetability break', 'weak illusion destruction and strong-illusion exemption', 'Super distinct secondary drains and live visual links', 'Gaben damage/cooldown'], ['Low ally means below 50% HP as explicit project AI threshold', 'Ally transfer uses one-for-one direct HP cost, stops at full ally or one caster HP; exact self-damage mitigation/event accounting needs AA verification', 'Historical 10-second channel, 700 cast range plus 200 break buffer, AA tick interval still 0.1s', 'Primary break ends every Super secondary; overlapping Soulbind-copy versus Super links require reference validation'], { target: 'any', range: 7, targetSelector: (c, candidates) => {
  const allowed = candidates.filter(t => !t.statuses.some(s => ['invulnerable', 'banished'].includes(s.kind) && s.until > c.battle.time));
  const ally = c.caster.hp > c.caster.maxHp * .9 ? allowed.filter(t => t.side === c.caster.side && t.hp < t.maxHp * .5).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || distance(a, c.caster) - distance(b, c.caster))[0] : undefined;
  return ally ?? allowed.filter(t => t.side !== c.caster.side && !t.statuses.some(s => s.kind === 'magicImmune' && s.until > c.battle.time)).sort((a, b) => distance(a, c.caster) - distance(b, c.caster))[0];
}, channel: 10, cooldown: c => gabenLevel(c) ? 0 : cooldown(c), superImplemented: true, gabenImplemented: true }));

put('custom_lion_mana_drain', active(c => {
  const primary = c.target;
  const length = v(c, 'CHANNEL DURATION'), targets = [primary, ...(gabenLevel(c) ? c.enemies().filter(t => t.id !== primary.id && distance(t, c.caster) <= U(v(c, 'BREAK DISTANCE')) && !t.statuses.some(s => ['magicImmune', 'invulnerable', 'banished'].includes(s.kind))).slice(0, 2) : [])], token = `${c.skill.id}:${c.battle.time}`; let ended = false;
  for (const target of targets) c.status(target, 'manaDrainLink', length + balanceNumber(c,'skill_effects_more.manadrainlink_duration.1',0.001), 0, { harmful: true, dispel: 'strong', data: { link: token } });
  const valid = (t: CombatUnit) => !t.dead && distance(t, c.caster) <= U(v(c, 'BREAK DISTANCE')) && !t.statuses.some(s => ['magicImmune', 'invulnerable', 'banished'].includes(s.kind)) && t.statuses.some(s => s.kind === 'manaDrainLink' && s.skill === c.skill.id && s.source === c.caster.id && (s as EffectStatus).data?.link === token);
  const clear = () => { ended = true; for (const t of targets) t.statuses = t.statuses.filter(s => !(s.skill === c.skill.id && s.source === c.caster.id && (s as EffectStatus).data?.link === token)); c.caster.statuses = c.caster.statuses.filter(s => !(s.skill === c.skill.id && s.kind === 'magicImmune')); };
  const cleanup = () => { if (ended) return; if (c.caster.dead || c.caster.action !== 'channel' || c.caster.castUntil <= c.battle.time) { clear(); return; } c.delay(balanceNumber(c,'skill_effects_more.delay.1',0.1), cleanup); }; c.delay(balanceNumber(c,'skill_effects_more.delay.2',0.1), cleanup);
  if (superLevel(c)) c.status(c.caster, 'magicImmune', balanceNumber(c,'skill_effects_more.magicimmune_duration.1',0.2));
  clock(c, length, .1, () => {
    if (ended) return; if (!valid(primary)) { clear(); c.endChannel(); return; }
    if (superLevel(c)) c.status(c.caster, 'magicImmune', balanceNumber(c,'skill_effects_more.magicimmune_duration.2',0.15));
    for (const t of targets) {
      if (!valid(t)) { t.statuses = t.statuses.filter(s => !(s.skill === c.skill.id && s.source === c.caster.id && (s as EffectStatus).data?.link === token)); continue; }
      c.status(t, 'visualLink', balanceNumber(c,'skill_effects_more.visuallink_duration.1',0.15), 0, { dispel: 'none', data: { link: token, mode: 'mana', ally: false } });
      const drained = -c.mana(t, -v(c, 'MANA PER SECOND') * .1); slow(c, t, v(c, 'MOVEMENT SLOW'), balanceNumber(c,'skill_effects_more.slow_duration.1',0.2)); if (superLevel(c)) { const allies = c.allies().filter(a => distance(a, c.caster) <= 9); for (const ally of allies) c.mana(ally, drained / Math.max(1, allies.length)); } else c.mana(c.caster, drained); if (gabenLevel(c)) c.damage(t, drained * balanceNumber(c,'skill_effects_more.damage.1',1.5));
    }
  }, true);
}, ['mana-conserving channel transfer', 'real enemy unit target preserves spell block and Soulbind dispatch', 'strong-dispellable fixed-target links with live visuals', 'primary range/death/dispel/untargetability break ends channel and immunity immediately', 'movement slow', 'Super ally distribution and channel-bound immunity', 'Gaben mana-drain damage and extra targets'], ['Historical Dota 2023-02-10 Mana Drain damage talent gives 150% drained-mana damage; AA coefficient unspecified', 'Ally distribution split policy and secondary target priority need AA verification'], { target: 'enemy', range: 7, channel: c => v(c, 'CHANNEL DURATION'), targetSelector: (c, candidates) => candidates.filter(t => t.mana > 0 && !t.statuses.some(s => ['magicImmune', 'invulnerable', 'banished'].includes(s.kind) && s.until > c.battle.time)).sort((a, b) => distance(a, c.caster) - distance(b, c.caster))[0], superImplemented: true, gabenImplemented: true }));

put('custom_abaddon_death_coil', active(c => {
  const target = c.target;
  if (!superLevel(c)) c.caster.hp = Math.max(1, c.caster.hp - v(c, 'DAMAGE/HEAL') * P(v(c, 'SELF DAMAGE')));
  c.projectile(target, balanceNumber(c,'skill_effects_more.projectile_speed.1',13), t => {
    const targets = superLevel(c) ? (t.side === c.caster.side ? c.allies() : c.enemies()).filter(u => distance(u, t) <= 10) : [t];
    for (const u of targets) { if (u.side === c.caster.side) c.heal(u, v(c, 'DAMAGE/HEAL')); else c.damage(u, v(c, 'DAMAGE/HEAL')); if (gabenLevel(c)) { if (u.side !== c.caster.side) instantAttack(c, u); c.dispel(u, false, u.side === c.caster.side); c.castAbility('aa_granted_solar_crest', 1, u); } }
  });
}, ['automatic ally heal or enemy damage selection', 'real unit target preserves spell block and Soulbind dispatch', 'projectile', 'self health cost', 'Super area effect and no self cost', 'Gaben enemy attacks, team-appropriate basic dispel and Solar Crest'], ['Reference target-selection priority', 'Self-damage percentage base interpretation', 'Historical Dota 2023-02-10 Solar Crest values and ally instant-attack exclusion need AA verification'], { target: 'any', range: c => U(v(c, 'CAST RANGE')), targetSelector: (c, candidates) => candidates.filter(t => t.side === c.caster.side && t.hp < t.maxHp * .75).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] ?? candidates.filter(t => t.side !== c.caster.side).sort((a, b) => distance(a, c.caster) - distance(b, c.caster))[0], superImplemented: true, gabenImplemented: true }));

put('custom_snapfire_mortimer_kisses', active(c => {
  const count = v(c, 'GLOB COUNT');
  for (let i = 0; i < count; i++) c.delay((i + balanceNumber(c,'skill_effects_more.delay.1',1)) * balanceNumber(c,'skill_effects_more.delay.2',5.5) / count, () => {
    const enemies = c.enemies().filter(t => distance(t, c.caster) >= 6); if (!enemies.length) return;
    const target = enemies[Math.floor(c.random() * enemies.length)], center = { x: target.x, y: target.y };
    const origin = { x: c.caster.x, y: c.caster.y }, visual = addVisualProjectile(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'projectile', role: 'projectile', ...origin, origin, destination: center, arrival: c.battle.time + .6, until: c.battle.time + .6 + MOTION_STEP, angle: Math.atan2(center.y - origin.y, center.x - origin.x) });
    c.delay(balanceNumber(c,'skill_effects_more.delay.3',0.6), () => { removeVisualProjectile(c.battle, visual); for (const t of around(c, center.x, center.y, U(v(c, 'IMPACT RADIUS')))) c.damage(t, v(c, 'DAMAGE PER GLOB'));
      c.zone({ ...center, radius: U(v(c, 'IMPACT RADIUS')), duration: v(c, 'FIRESPIT POOL DURATION'), interval: balanceNumber(c,'skill_effects_more.interval.1',0.2), effect: t => { c.damage(t, (v(c, 'BURN DPS') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',20) : 0)) * balanceNumber(c,'skill_effects_more.damage.2',0.2)); slow(c, t, (skillBalance(c.definition,c.skill.points)?v(c,"ENEMY MOVEMENT SLOW"):(((v(c, 'ENEMY MOVEMENT SLOW') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.slow_amount.1',20) : 0))))), balanceNumber(c,'skill_effects_more.slow_duration.1',0.3)); } });
    });
  }, !gabenLevel(c));
}, ['channelled lob barrage', 'minimum launch range', 'delayed area impacts', 'persistent firespit pools', 'Super burn/slow and independent Gobble Up/Spit Out with ally-first ordinary-creep fallback', 'Gaben nonchannelled barrage'], ['Reference aim/maximum range and projectile flight time', 'Gobble Up prefers closest allied hero in 150 range, otherwise ordinary non-ancient enemy creep; explicit project AI policy', 'Historical Dota 2023-02-10 Gobble/Spit parameters with parent AA glob damage; version/impact inheritance unverified'], { channel: c => gabenLevel(c) ? 0 : 5.5, range: 30, canCast: c => c.enemies().some(t => distance(c.caster, t) >= 6), init: c => { if (superLevel(c)) grantActive(c, 'aa_granted_gobble_up', 1, 120, 40, () => {
  if (!c.enemies().length) return undefined;
  return c.allies().filter(t => !t.summoned && t.id !== c.caster.id && distance(t, c.caster) <= 1.5).sort((a, b) => distance(a, c.caster) - distance(b, c.caster))[0]
    ?? c.enemies().filter(t => t.summoned && !t.ancient && !t.illusion && !t.consideredHero && !t.ward && !t.statuses.some(s => s.kind === 'hitCountBody') && distance(t, c.caster) <= 1.5).sort((a, b) => distance(a, c.caster) - distance(b, c.caster))[0];
}, { 'IMPACT DAMAGE': v(c, 'DAMAGE PER GLOB') }); }, superImplemented: true, gabenImplemented: true }));

put('custom_drow_ranger_multishot', active(c => {
  const start = { x: c.caster.x, y: c.caster.y }, dir = direction(c.caster, c.target), waves = v(c, 'WAVE COUNT') + (superLevel(c) ? 2 : 0), arrows = v(c, 'ARROWS PER WAVE') + (superLevel(c) ? 2 : 0);
  for (let wave = 0; wave < waves; wave++) c.delay((wave + balanceNumber(c,'skill_effects_more.delay.1',1)) * balanceNumber(c,'skill_effects_more.delay.2',1.75) / waves, () => {
    const hit = new Set<string>();
    for (let arrow = 0; arrow < arrows; arrow++) {
      const angle = Math.atan2(dir.y, dir.x) + (arrow / Math.max(1, arrows - 1) - .5) * 50 * Math.PI / 180;
      const vector = { x: Math.cos(angle), y: Math.sin(angle) }, length = c.caster.range * v(c, 'ARROW RANGE MULTIPLIER');
      let moved = 0, previous = { ...start };
      const visual = addVisualProjectile(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'arrow', role: 'projectile', ...start, angle, until: c.battle.time + length / 12 + MOTION_STEP });
      const fly = () => {
        moved = Math.min(length, moved + 12 * MOTION_STEP);
        const next = { x: start.x + vector.x * moved, y: start.y + vector.y * moved };
        moveVisualProjectile(c.battle, visual, next);
        const target = lineTargets(c, previous, next, .9).find(t => !hit.has(t.id) && !t.statuses.some(s => s.kind === 'magicImmune' && s.until > c.battle.time));
        if (target) { removeVisualProjectile(c.battle, visual); hit.add(target.id); c.attack(target, P(v(c, 'ARROW BASE DAMAGE BONUS')), true, undefined, true); slow(c, target, [balanceNumber(c,'skill_effects_more.slow_amount.1',10), balanceNumber(c,'skill_effects_more.slow_amount.2',25), balanceNumber(c,'skill_effects_more.slow_amount.3',55)][Math.min(balanceNumber(c,'skill_effects_more.slow_amount.4',2), c.skill.points - balanceNumber(c,'skill_effects_more.slow_amount.5',1))], v(c, 'ARROW SLOW DURATION')); return; }
        previous = next;
        if (moved < length) c.delay(MOTION_STEP, fly); else removeVisualProjectile(c.battle, visual);
      };
      c.delay(MOTION_STEP, fly);
    }
  }, true);
}, ['channelled fan of continuously travelling arrows in salvos', 'one hit per target per wave; released arrows survive channel interruption and caster death', 'attack-scaled damage with all attack modifiers per AA Differences', 'extended Frost Arrow slow', 'Super wave/arrow counts', 'Gaben Marksmanship proc and ranged agility aura with nearby-enemy disabling'], ['Intrinsic slow uses corresponding AA Frost Arrows 10/25/55%; equipped Frost Arrow slow stacking needs reference validation', 'Historical Dota 2023-02-10 width 90, speed 1200, full fan angle 50 degrees; wave release spacing is evenly distributed over AA channel length', 'Attack modifier scaling order and dead-source passive post-hit eligibility require AA reference', 'Historical Dota 2023-02-10 max-level Marksmanship: 40% chance, 80 bonus damage, 50% agility aura within 1200, disabled by enemy heroes within 400; AA level/illusion eligibility unverified'], { channel: 1.75, range: c => c.caster.range * v(c, 'ARROW RANGE MULTIPLIER'), init: c => {
  if (!gabenLevel(c)) return;
  clock(c, 120, .1, () => {
    if (c.caster.statuses.some(s => s.kind === 'break') || c.enemies().some(t => !t.summoned && distance(t, c.caster) <= 4)) return;
    c.status(c.caster, 'marksmanship', balanceNumber(c,'skill_effects_more.marksmanship_duration.1',0.2), balanceNumber(c,'skill_effects_more.marksmanship_amount.1',0.4), { passive: true, data: { bonus: 80 } });
    for (const ally of c.allies().filter(t => t.range > 2 && distance(t, c.caster) <= 12)) {
      const other = ally.statuses.find(s => s.kind === 'agilityPct' && s.skill === c.skill.id && s.source !== c.caster.id && (s.value ?? 0) >= .5);
      if (!other) c.status(ally, 'agilityPct', balanceNumber(c,'skill_effects_more.agilitypct_duration.1',0.2), balanceNumber(c,'skill_effects_more.agilitypct_amount.1',0.5), { passive: true });
    }
  });
}, superImplemented: true, gabenImplemented: true }));

put('viper_nethertoxin', active(c => {
  const exposure = new Map<string, { last: number; seconds: number }>();
  c.zone({ x: c.target.x, y: c.target.y, radius: U(v(c, 'RADIUS')), duration: v(c, 'DURATION'), interval: balanceNumber(c,'skill_effects_more.interval.1',0.2), effect: t => {
    const old = exposure.get(t.id), seconds = old && c.battle.time - old.last < .25 ? old.seconds + .2 : .2; exposure.set(t.id, { last: c.battle.time, seconds });
    const amount = v(c, 'MIN DPS') + (v(c, 'MAX DPS') + (superLevel(c) ? 130 : 0) - v(c, 'MIN DPS')) * Math.min(1, seconds / v(c, 'MAX DPS DURATION'));
    c.damage(t, amount * balanceNumber(c,'skill_effects_more.damage.1',0.2)); c.status(t, 'break', balanceNumber(c,'skill_effects_more.break_duration.1',0.3), 0, harmful); if (gabenLevel(c)) c.status(t, 'silence', balanceNumber(c,'skill_effects_more.silence_duration.1',0.3), 0, harmful);
  } });
}, ['stationary toxin zone', 'exposure-dependent escalating damage', 'leaving area resets exposure', 'break', 'Super maximum damage', 'Gaben silence'], ['Exposure ramp timing and lingering durations'], { superImplemented: true, gabenImplemented: true }));

function omnislash(c: EffectContext, overrideDuration?: number) {
  const duration = overrideDuration ?? v(c, 'DURATION') + (superLevel(c) ? 1.5 : 0), speed = 1 + v(c, 'BONUS ATTACK SPEED') / 100;
  const interval = Math.max(.1, c.caster.attackInterval / speed / v(c, 'SLASHES RATE MULTIPLIER'));
  c.dispel(c.caster); c.status(c.caster, 'invulnerable', duration); c.status(c.caster, 'disarm', duration); c.status(c.caster, 'omnislash', duration);
  let previous = c.target; c.warp(c.caster,previous.x,previous.y);
  for (let time = 0; time < duration; time += interval) c.delay(time, () => {
    const targets = c.enemies().filter(t => distance(t, previous) <= U(v(c, 'SLASH JUMP RADIUS'))); if (!targets.length || c.caster.dead) return;
    const t = targets[Math.floor(c.random() * targets.length)]; c.warp(c.caster,t.x + .5,t.y); instantAttack(c, t, 1, v(c, 'BONUS DAMAGE')); previous = t;
  });
}
put('juggernaut_omni_slash', active(c => omnislash(c), ['invulnerable rapid slash sequence', 'basic dispel', 'seeded nearby target jumps', 'bonus attack damage', 'Super duration', 'Gaben nonrecursive 0.8-second mini Omnislash on attack'], ['Full attack-speed status integration and early end without targets'], { range: c => U(v(c, 'CAST RANGE')), canCast: c => !c.caster.statuses.some(s => s.kind === 'omnislash'), onAttack: c => { if (gabenLevel(c) && !c.caster.statuses.some(s => s.kind === 'omnislash') && c.random() < balanceNumber(c,'skill_effects_more.trigger_chance.1',0.2)) omnislash(c, .8); }, superImplemented: true, gabenImplemented: true }));

put('custom_chaos_knight_phantasm', active(c => {
  c.dispel(c.caster);
  travelLock(c, c.caster, .55, 'phantasm');
  c.status(c.caster, 'visualForm', balanceNumber(c,'skill_effects_more.visualform_duration.1',0.55), 0, { dispel: 'none', data: { form: 'phantasm', hidden: true } });
  const make = (body: CombatUnit, count: number) => { const clones = c.summon({ template: body, name: `${body.name}幻象`, count, hp: body.maxHp, attack: body.attack, armor: body.armor, range: body.range, interval: body.attackInterval, speed: body.moveSpeed, lifetime: superLevel(c) ? balanceNumber(c,'skill_effects_more.lifetime.1',120) : v(c, 'PHANTASM DURATION'), illusion: true, damageTaken: balanceNumber(c,'skill_effects_more.damagetaken.1',3.25), inheritsSkills: true, initializeInherited: true, inheritedMode: 'passives' }); for (const clone of clones) clone.strongIllusion = true; };
  c.delay(balanceNumber(c,'skill_effects_more.delay.1',0.5), () => { if (c.caster.dead) return; releaseTravel(c, c.caster); make(c.caster, v(c, 'NUMBER OF ILLUSIONS') + (superLevel(c) ? 1 : 0)); if (gabenLevel(c)) for (const ally of c.allies().filter(t => !t.summoned && t.id !== c.caster.id)) make(ally, 1); });
}, ['independent 100%-damage strong illusions with 325% incoming damage', 'basic dispel', 'half-second invulnerable split with action lock before illusions appear', 'fresh passive-skill inheritance without automatic active casting or duplicated base attributes', 'Super extra illusion/lifetime', 'Gaben copies every ally appearance and current combat/attribute snapshot under caster ownership'], ['Catalog numeric DAMAGE/DAMAGE TAKEN labels reversed; prose 100%/325% used pending source resolution', 'Passive-program eligibility is a working inheritance policy; exact Dota/AA illusion-specific allowlist and per-passive effects remain reference-sensitive', 'Historical Dota 2023-02-10 invuln_duration 0.5 and strong-illusion immunity to instant destruction'], { target: 'self', superImplemented: true, gabenImplemented: true }));

put('razor_plasma_field', active(c => {
  const radius = U(v(c, 'RADIUS') + (superLevel(c) ? 400 : 0)), origin = { x: c.caster.x, y: c.caster.y }, outward = new Set<string>(), inward = new Set<string>(), total = 2.2;
  const makeWave = (returning: boolean) => addVisualWorldEffect(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'wave', role: 'ground_event', kind: 'ring', ...origin, radius: returning ? radius : 0, previousRadius: returning ? radius : 0, maxRadius: radius, halfWidth: radius * .05 / (total / 2) + .4, phase: returning ? 'inward' : 'outward', progress: 0, until: c.battle.time + .15, expiresWithSource: true });
  let visual = makeWave(false), returningVisual = false;
  clock(c, total, .05, tick => {
    const elapsed = (tick + 1) * .05, expanding = elapsed <= total / 2, wave = radius * (expanding ? elapsed / (total / 2) : (total - elapsed) / (total / 2)), seen = expanding ? outward : inward;
    if (!expanding && !returningVisual) { removeVisualWorldEffect(c.battle, visual); visual = makeWave(true); returningVisual = true; }
    updateVisualWorldEffect(c.battle, visual, { previousRadius: visual.radius, radius: Math.max(0, wave), progress: Math.min(1, expanding ? elapsed / (total / 2) : elapsed / (total / 2) - 1), until: c.battle.time + .15 });
    for (const t of around(c, origin.x, origin.y, radius)) {
      const d = distance(t, origin); if (seen.has(t.id) || Math.abs(d - wave) > radius * .05 / (total / 2) + .4) continue; seen.add(t.id);
      const fraction = gabenLevel(c) ? 1 : Math.min(1, d / radius);
      c.damage(t, (skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE MIN"):(((v(c, 'DAMAGE MIN') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',30) : 0))))) + (v(c, 'DAMAGE MAX') - v(c, 'DAMAGE MIN')) * fraction);
      slow(c, t, v(c, 'SLOW MIN') + (v(c, 'SLOW MAX') - v(c, 'SLOW MIN')) * fraction, v(c, 'SLOW DURATION'));
      if (gabenLevel(c) && expanding) { const dir = direction(origin, t); c.moveContinuous(t,t.x + dir.x * radius * .4,t.y + dir.y * radius * .4,{duration:.05}); }
    }
    if (elapsed >= total - 1e-8) removeVisualWorldEffect(c.battle, visual);
  });
}, ['expanding and contracting wave', 'separate once-per-direction hits', 'distance-scaled damage and slow', 'Super radius/damage', 'Gaben max damage/outward push'], ['Wave speed 2.2-second sweep provisional', 'Collision tolerance and exact knockback trajectory'], { target: 'self', canCast: c => near(c, U(v(c, 'RADIUS') + (superLevel(c) ? 400 : 0))).length > 0, superImplemented: true, gabenImplemented: true }));

put('primal_beast_pulverize', active(c => {
  const length = superLevel(c) ? 4.6 : 2.3; c.status(c.target, 'stun', length, 0, { harmful: true, dispel: 'strong', piercesImmunity: superLevel(c) });
  clock(c, length, v(c, 'HIT INTERVAL'), () => {
    if (c.target.dead) return;
    for (const t of around(c, c.target.x, c.target.y, U(v(c, 'AOE RADIUS')))) { c.damage(t, v(c, 'HIT DAMAGE'), 'magical', superLevel(c)); stun(c, t, v(c, 'STUN DURATION'), superLevel(c)); }
    if (gabenLevel(c)) for (let rock = 0; rock < 3; rock++) {
      const x = (c.random() * 2 - 1) * 14.17, y = (c.random() * 2 - 1) * 12.516;
      c.delay(balanceNumber(c,'skill_effects_more.delay.1',0.3), () => { for (const t of around(c, x, y, 2.55)) { c.damage(t, balanceNumber(c,'skill_effects_more.damage.1',325)); stun(c, t, balanceNumber(c,'skill_effects_more.stun_duration.1',1.75)); } }, true);
    }
  }, true);
}, ['channeled grab and repeated area slams', 'ministuns', 'Super channel duration and immunity pierce', 'Gaben three seeded arena rocks per slam with independent damage/stun'], ['Release grabbed target immediately on channel interruption', 'Rock placement distribution and flight delay verification'], { range: 2, channel: c => superLevel(c) ? 4.6 : 2.3, superImplemented: true, gabenImplemented: true }));

put('void_spirit_resonant_pulse', active(c => {
  const targets = near(c, U(v(c, 'PULSE RADIUS'))), amount = v(c, 'BASE SHIELD ABSORB') + targets.filter(t => !t.summoned).length * v(c, 'BONUS ABSORB PER HERO HIT');
  for (const t of targets) { c.damage(t, (skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE"):(((v(c, 'DAMAGE') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',100) : 0)))))); if (gabenLevel(c)) c.status(t, 'silence', balanceNumber(c,'skill_effects_more.silence_duration.1',2), 0, harmful); }
  c.status(c.caster, 'physicalShield', v(c, 'SHIELD DURATION'), amount, { remaining: amount });
  if (superLevel(c)) c.status(c.caster, 'magicImmune', targets.length);
}, ['radial damage', 'physical-only shield', 'bonus absorption for heroes hit', 'Super immunity/damage', 'Gaben silence and casts only near a non-silenced hero'], ['Gaben charge system', 'Immunity application ordering'], { target: 'self', canCast: c => near(c, U(v(c, 'PULSE RADIUS'))).some(t => !gabenLevel(c) || ((!t.summoned || t.consideredHero) && !t.statuses.some(s => s.kind === 'silence'))), superImplemented: true }));

put('custom_mirana_arrow', active(c => {
  const origin = { x: c.caster.x, y: c.caster.y }, angle = Math.atan2(c.target.y - origin.y, c.target.x - origin.x), range = U(v(c, 'RANGE'));
  for (const offset of gabenLevel(c) ? [-.18, 0, .18] : [0]) {
    const meteors = new Set<string>();
    const meteor = (target: CombatUnit) => c.delay(balanceNumber(c,'skill_effects_more.delay.1',0.4), () => c.damage(target, gabenLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',500) : balanceNumber(c,'skill_effects_more.damage.2',300)));
    c.linearProjectile({ origin, angle: angle + offset, distance: range, speed: balanceNumber(c,'skill_effects_more.speed.1',9), width: 1.15, stopOnHit: true,
      onMove: position => { if (superLevel(c)) for (const t of around(c, position.x, position.y, 5)) if (!meteors.has(t.id)) { meteors.add(t.id); meteor(t); } },
      effect: target => { const q = Math.min(1, distance(origin, target) / 15), ordinaryCreep = target.summoned && !target.illusion && !target.ancient && !target.consideredHero && !target.ward && !target.statuses.some(s => s.kind === 'hitCountBody');
        if (ordinaryCreep) c.execute(target); else c.damage(target, v(c, 'DAMAGE') + v(c, 'MAXIMUM BONUS DAMAGE') * q, 'magical'); if (!target.dead) stun(c, target, v(c, 'MINIMUM STUN') + (v(c, 'MAXIMUM STUN') - v(c, 'MINIMUM STUN')) * q); if (superLevel(c)) meteor(target); }
    });
  }
}, ['nonhoming swept arrow survives caster death', 'first collision', 'distance-scaled damage/stun', 'direct ordinary non-ancient summon execution bypassing damage protection with hero/illusion/ward/attack-count-body exemptions', 'Super nearby and impact meteors', 'Gaben two side arrows and meteor damage'], ['Historical Dota 2023-02-10 arrow speed 900/width 115/max-stun distance 1500', 'Nearby meteors limited to one per enemy per arrow; reference frequency unresolved', 'Side-arrow angle and meteor flight delay are explicit working geometry/timing'], { range: c => U(v(c, 'RANGE')), cooldown: c => cooldown(c, superLevel(c) ? 2 : 0), superImplemented: true, gabenImplemented: true }));

put('ember_spirit_sleight_of_fist', active(c => {
  const origin = { x: c.caster.x, y: c.caster.y }, targets = around(c, c.target.x, c.target.y, U(v(c, 'RADIUS'))), interval = v(c, 'ATTACK INTERVAL');
  c.status(c.caster, 'invulnerable', targets.length * interval + balanceNumber(c,'skill_effects_more.invulnerable_duration.1',0.05)); c.status(c.caster, 'disarm', targets.length * interval + balanceNumber(c,'skill_effects_more.disarm_duration.1',0.05));
  targets.forEach((t, i) => c.delay(i * interval, () => { if (!t.dead && !c.caster.dead) { c.warp(c.caster,t.x + .5,t.y); instantAttack(c, t, 1, t.summoned ? 0 : v(c, 'BONUS HERO DAMAGE'), superLevel(c)); } }));
  c.delay(targets.length * interval, () => { if (!c.caster.dead) c.warp(c.caster,origin.x,origin.y); });
}, ['one attack per selected enemy', 'timed target-to-target jumps', 'invulnerability', 'return to original position', 'Super true strike/range'], ['Base cast range and target order verification', 'Gaben charges'], { range: c => balanceNumber(c,'skill_effects_more.range.1',7) + (superLevel(c) ? balanceNumber(c,'skill_effects_more.range.2',10) : 0), superImplemented: true }));

put('custom_tusk_snowball', active(c => {
  const passengers = c.allies().filter(t => t.id !== c.caster.id && distance(t, c.caster) <= U(v(c, 'GATHER RADIUS'))), travelers = [c.caster, ...passengers], target = c.target, speed = U(v(c, 'SNOWBALL SPEED'));
  // Follow the moving target at the catalog speed. The 120-second envelope is
  // the shared battle safeguard, not a new duration for Snowball.
  const envelope = Math.max(.05, 120 - c.battle.time), hit = new Set<string>(); let finished = false;
  for (const unit of travelers) travelLock(c, unit, envelope, 'snowball', unit.id !== c.caster.id);
  clock(c, envelope, .05, () => {
    if (finished) return;
    const from = { x: c.caster.x, y: c.caster.y }, d = direction(c.caster, target), remaining = distance(c.caster, target), step = Math.min(remaining, speed * .05);
    c.moveContinuous(c.caster,from.x + d.x * step,from.y + d.y * step,{duration:.05});
    for (const passenger of passengers) if (!passenger.dead) c.moveContinuous(passenger,from.x + d.x * step,from.y + d.y * step,{duration:.05});
    for (const t of lineTargets(c, from, c.caster, 1.5)) if (!hit.has(t.id)) { hit.add(t.id); c.damage(t, v(c, 'BASE DAMAGE') + passengers.filter(unit => !unit.summoned && !unit.dead).length * v(c, 'BONUS DAMAGE PER ALLY') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',120) : 0)); stun(c, t, v(c, 'STUN DURATION')); }
    if (hit.has(target.id) || remaining <= speed * .05 + .4) {
      finished = true;
      for (const unit of travelers) if (!unit.dead) { releaseTravel(c, unit); if (superLevel(c)) c.status(unit, 'attackSpeed', balanceNumber(c,'skill_effects_more.attackspeed_duration.1',2), balanceNumber(c,'skill_effects_more.attackspeed_amount.1',60)); }
      if (gabenLevel(c)) for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; c.castAbility('custom_tusk_ice_shards', 3, { ...c.caster, x: c.caster.x + Math.cos(angle) * 14, y: c.caster.y + Math.sin(angle) * 14 }); }
    }
  });
}, ['gathers and moves nearby allies together', 'travel invulnerability and action lock', 'immediate catalog-speed pursuit of most-backline eligible enemy', 'swept once-per-target path stun/damage', 'Super damage/attack speed/cooldown', 'Gaben eight 280-damage radial Ice Shards'], ['Historical Dota 2023-02-10 cast range 1150; board-depth target priority breaks ties by distance', 'Collision radius and passenger hero eligibility need reference verification', 'Radial shards inherit base Ice Shards wall geometry assumptions'], { range: 11.5, targetSelector: (c, candidates) => candidates.sort((a, b) => (c.caster.side === 0 ? b.y - a.y : a.y - b.y) || distance(b, c.caster) - distance(a, c.caster) || a.id.localeCompare(b.id))[0], cooldown: c => cooldown(c, superLevel(c) ? 2 : 0), superImplemented: true, gabenImplemented: true }));

put('custom_phantom_lancer_spirit_lance', active(c => {
  const launch = (target: CombatUnit, canBounce: boolean) => c.projectile(target, balanceNumber(c,'skill_effects_more.projectile_speed.1',10), t => {
    c.damage(t, v(c, 'LANCE DAMAGE')); slow(c, t, v(c, 'MOVEMENT SLOW'), v(c, 'SLOW DURATION'));
    const illusions = c.summon({ name: '灵魂幻象', count: balanceNumber(c,'skill_effects_more.count.1',1), hp: c.caster.maxHp, attack: c.caster.attack * (P(v(c, 'ILLUSION DAMAGE')) + (superLevel(c) ? balanceNumber(c,'skill_effects_more.attack.1',0.4) : 0)), armor: c.caster.armor, lifetime: v(c, 'ILLUSION DURATION'), illusion: true, damageTaken: P(v(c, 'ILLUSION DAMAGE TAKEN')), inheritsSkills: true, initializeInherited: true, inheritedMode: 'passives' });
    for (const illusion of illusions) c.warp(illusion,t.x + 1,t.y);
    if (canBounce) { const next = c.enemies().filter(e => e.id !== t.id && distance(e, t) <= 7.5).sort((a, b) => Number(!!a.summoned) - Number(!!b.summoned) || distance(a, t) - distance(b, t))[0]; if (next) launch(next, false); }
  }); launch(c.target, superLevel(c));
}, ['homing damage/slow projectile', 'target-adjacent illusion', 'illusion incoming/outgoing multipliers', 'fresh passive-only inheritance with active casting suppressed', 'Super bounce/damage/range/cooldown', 'Gaben cooldown reduction and primary attribute'], ['Exact illusion passive allowlist and scaling of flat attack-modifier bonuses require AA verification', 'Four-class primary attribute is a project mapping'], { range: c => balanceNumber(c,'skill_effects_more.range.1',7.5) + (superLevel(c) ? balanceNumber(c,'skill_effects_more.range.2',2.25) : 0), cooldown: c => cooldown(c, superLevel(c) ? 4 : 0), init: c => { if (gabenLevel(c)) { c.status(c.caster, 'cooldownReduction', balanceNumber(c,'skill_effects_more.cooldownreduction_duration.1',1000000), balanceNumber(c,'skill_effects_more.cooldownreduction_amount.1',0.25)); const attribute = String(c.caster.primaryAttribute ?? (c.caster.role === 'mage' ? 'intelligence' : c.caster.role === 'tank' ? 'strength' : 'agility')); c.status(c.caster, attribute, balanceNumber(c,'skill_effects_more.attribute_duration.1',1000000), balanceNumber(c,'skill_effects_more.attribute_amount.1',45)); } }, superImplemented: true, gabenImplemented: true }));

put('custom_tiny_toss', active(c => {
  const grabbed = near(c, gabenLevel(c) ? 3 : U(v(c, 'RADIUS'))).sort((a, b) => distance(a, c.caster) - distance(b, c.caster)); if (!grabbed.length) return;
  const victims = gabenLevel(c) ? grabbed : grabbed.slice(0, 1), destination = { x: c.target.x, y: c.target.y };
  for (const t of victims) {
    const flight=balanceNumber(c,'skill_effects_more.delay.1',1);stun(c,t,flight);c.moveContinuous(t,destination.x,destination.y,{duration:flight,ignoreBarriers:true}); c.delay(flight, () => { if (t.dead) return; for (const enemy of around(c, destination.x, destination.y, U(v(c, 'RADIUS')))) c.damage(enemy, v(c, 'DAMAGE') * (enemy.id === t.id ? balanceNumber(c,'skill_effects_more.damage.1',1.3) : balanceNumber(c,'skill_effects_more.damage.2',1)), 'magical', true); if (superLevel(c)) { slow(c, t, balanceNumber(c,'skill_effects_more.slow_amount.1',30), balanceNumber(c,'skill_effects_more.slow_duration.1',2)); c.status(t, 'blind', balanceNumber(c,'skill_effects_more.blind_duration.1',2), balanceNumber(c,'skill_effects_more.blind_amount.1',0.3), harmful); } });
  }
}, ['nearest-enemy pickup', 'throw delay/displacement', 'landing area damage', 'extra damage to tossed unit', 'Super slow/blind and independently scheduled Blink', 'Gaben all-enemy pickups within 300'], ['Throw trajectory', 'Blink uses catalog max-base Queen of Pain Blink with its 60 mana/6-second cooldown; grant level not specified in AA', 'Gaben all units interpreted as all eligible enemies from the base enemy-only rule; explicit semantic default'], { range: c => U(v(c, 'CAST RANGE')), canCast: c => near(c, gabenLevel(c) ? 3 : U(v(c, 'RADIUS'))).length > 0, init: c => { if (superLevel(c)) grantActive(c, 'custom_queenofpain_blink', 3, 60, 6, () => { const target = c.enemies().sort((a, b) => distance(a, c.caster) - distance(b, c.caster))[0]; return target && distance(target, c.caster) > 3 && distance(target, c.caster) <= 13 ? target : undefined; }); }, superImplemented: true, gabenImplemented: true }));

put('custom_riki_tricks_of_the_trade', active(c => {
  const duration = v(c, 'DURATION'), count = v(c, 'ATTACK RATE') + (superLevel(c) ? 1 : 0);
  if (gabenLevel(c)) c.castAbility('riki_smoke_screen', 4, c.caster, { DURATION: 2 });
  c.status(c.caster, 'invulnerable', duration);
  for (let i = 0; i < count; i++) c.delay((i + balanceNumber(c,'skill_effects_more.delay.1',0.5)) * duration / count, () => {
    const targets = near(c, U(v(c, 'RADIUS'))).filter(t => !t.summoned); if (!targets.length) return;
    const first = Math.floor(c.random() * targets.length); instantAttack(c, targets[first]);
    if (superLevel(c) && targets.length > 1) instantAttack(c, targets[(first + 1) % targets.length]);
  }, true);
}, ['invulnerable channel', 'seeded random hero attacks', 'Super extra attack and target', 'Gaben native fourth-level two-second Smoke Screen'], ['ATTACK RATE interpreted as total attack count over duration', 'Backstab orientation/passive interactions', 'Historical Dota 2023-02-10 Smoke Screen radius/miss rate need AA version validation'], { target: 'self', channel: c => v(c, 'DURATION'), canCast: c => near(c, U(v(c, 'RADIUS'))).some(t => !t.summoned), cooldown: c => cooldown(c, superLevel(c) ? 4 : 0), superImplemented: true, gabenImplemented: true }));

const inSnowball=(c:EffectContext)=>c.caster.statuses.some(s=>s.until>c.battle.time&&s.kind==='visualForm'&&(s as EffectStatus).data?.form==='snowball');
function walrusEffects(c:EffectContext){
  const air=v(c,'AIR TIME')+(!skillBalance(c.definition,c.skill.points)&&superLevel(c)?.4:0);stun(c,c.target,air,true);
  c.delay(air,()=>{slow(c,c.target,v(c,'MOVEMENT SLOW'),v(c,'SLOW DURATION'));if(superLevel(c))c.status(c.target,'break',v(c,'SLOW DURATION'),0,{harmful:true,piercesImmunity:true});});
}
function walrus(c:EffectContext){
  if(c.caster.walrusBusy)return;c.caster.walrusBusy=true;
  try{if(instantAttack(c,c.target,1,0,true,{criticalMultiplier:P(v(c,'CRITICAL DAMAGE'))}).landed)walrusEffects(c);}
  finally{c.caster.walrusBusy=false;}
}
put('custom_tusk_walrus_punch',active(walrus,['attack-point factor .6 and ordinary attack cadence', 'True Strike ensured critical competes with other criticals', 'air disable then historical landing slow', 'Super final air/free cast/cooldown and landing break', 'Gaben PRD replaces this attack without extra attack, mana or cooldown'],['Exact airborne presentation', 'AA Super break begins at landing as existing interpretation; native equivalent not established', 'Autocast/silence interaction and passive eligibility on every secondary attack require historical AA evidence'],{
  dynamicRange:true,range:effectiveAttackRange,attackCastPointFactor:c=>v(c,'ATTACK POINT FACTOR',.6),canCast:c=>!inSnowball(c),
  manaCost:c=>superLevel(c)?0:c.definition.mana[Math.min(2,c.skill.points-1,c.definition.mana.length-1)]??0,cooldown:c=>cooldown(c,superLevel(c)?4:0),
  prepareAttack:c=>{if(!gabenLevel(c)||c.caster.walrusBusy||c.caster.illusion||inSnowball(c))return;const probability=balanceNumber(c,'skill_effects_more.trigger_chance.1',.2);if(!(c.chance?.(probability,'walrusPunch')??c.random()<probability))return;if(c.attackRecord)c.attackRecord.data[`walrus:${c.attackInstanceKey??c.skill.instanceId??c.skill.id}`]=true;return{trueStrike:true,criticalMultiplier:P(v(c,'CRITICAL DAMAGE'))};},
  onAttack:c=>{const key=`walrus:${c.attackInstanceKey??c.skill.instanceId??c.skill.id}`;if(c.attackRecord?.data[key]){delete c.attackRecord.data[key];walrusEffects(c);}},superImplemented:true,gabenImplemented:true,
}));

put('vengefulspirit_wave_of_terror', active(c => {
  const start = { x: c.caster.x, y: c.caster.y }, end = endpoint(c, 14);
  c.delay(balanceNumber(c,'skill_effects_more.delay.1',0.2), () => { for (const t of lineTargets(c, start, end, 1.5)) {
    if (t.statuses.some(s => s.kind === 'magicImmune')) continue;
    c.damage(t, v(c, 'DAMAGE')); c.status(t, 'armor', balanceNumber(c,'skill_effects_more.armor_duration.1',8), v(c, 'ARMOR REDUCTION') - (superLevel(c) ? balanceNumber(c,'skill_effects_more.armor_amount.1',2) + t.armor * balanceNumber(c,'skill_effects_more.armor_amount.2',0.2) : 0), harmful);
    if (superLevel(c)) { c.status(t, 'attackBonus', balanceNumber(c,'skill_effects_more.attackbonus_duration.1',8), -t.attack * balanceNumber(c,'skill_effects_more.attackbonus_amount.1',0.2), harmful); c.status(c.caster, 'attackBonus', balanceNumber(c,'skill_effects_more.attackbonus_duration.2',8), t.attack * balanceNumber(c,'skill_effects_more.attackbonus_amount.2',0.2), { maxStacks: balanceNumber(c,'skill_effects_more.maxstacks.1',1000) }); c.status(c.caster, 'armor', balanceNumber(c,'skill_effects_more.armor_duration.2',8), t.armor * balanceNumber(c,'skill_effects_more.armor_amount.3',0.2), { maxStacks: balanceNumber(c,'skill_effects_more.maxstacks.2',1000) }); }
    if (gabenLevel(c)) c.status(t, 'fear', balanceNumber(c,'skill_effects_more.fear_duration.1',2), 0, harmful);
  } });
}, ['line magical damage', 'armor reduction', 'Super armor reduction and base attack/armor theft', 'Gaben fear'], ['Range/width/speed and 8-second armor debuff absent from catalog', 'Vision system'], { range: 14, superImplemented: true, gabenImplemented: true }));

put('morphling_waveform', active(c => {
  const start = { x: c.caster.x, y: c.caster.y }, end = endpoint(c, Math.min(distance(c.caster, c.target) + .5, U(v(c, 'CAST RANGE') + (superLevel(c) ? 250 : 0)))), travel = distance(start, end) / 12.5;
  const ticks = Math.max(1, Math.ceil(travel / .05)), duration = ticks * .05, hit = new Set<string>();
  travelLock(c, c.caster, duration + .05, 'waveform');
  clock(c, duration, .05, tick => {
    const from = { x: c.caster.x, y: c.caster.y }, progress = Math.min(1, (tick + 1) / ticks);
    c.moveContinuous(c.caster,start.x + (end.x - start.x) * progress,start.y + (end.y - start.y) * progress,{duration:.05,ignoreBarriers:true});
    for (const t of lineTargets(c, from, c.caster, 2)) if (!hit.has(t.id)) { hit.add(t.id); c.damage(t, v(c, 'DAMAGE')); if (gabenLevel(c)) instantAttack(c, t); }
    if (progress >= 1) releaseTravel(c, c.caster);
  });
}, ['continuous invulnerable wave traversal', 'swept once-per-target path damage', 'action lock during transit', 'Super range/charges', 'Gaben attacks along path'], ['Historical Dota 2023-02-10 Waveform speed 1250 and width 200; AA patch match unverified'], { range: c => U(v(c, 'CAST RANGE') + (superLevel(c) ? 250 : 0)), gabenImplemented: true }));

// Remaining movement/beam programs use simulation-time paths, never wall time.
function motionLock(c: EffectContext, duration: number, silence = true) {
  c.status(c.caster, 'root', duration); c.status(c.caster, 'disarm', duration);
  c.status(c.caster, 'phased', duration, 0, { dispel: 'none' });
  if (silence) c.status(c.caster, 'silence', duration);
}
function unlockMotion(c: EffectContext) { c.caster.statuses = c.caster.statuses.filter(s => !(s.skill === c.skill.id && ['root', 'disarm', 'silence', 'phased', 'visualForm'].includes(s.kind))); }
function travelLock(c: EffectContext, unit: CombatUnit, duration: number, form: string, passenger = false) {
  for (const kind of ['invulnerable', 'root', 'disarm', 'silence', 'phased']) c.status(unit, kind, duration, 0, { dispel: 'none' });
  c.status(unit, 'visualForm', duration, 0, { dispel: 'none', data: { form, passenger, leader: c.caster.id } });
}
function releaseTravel(c: EffectContext, unit: CombatUnit) {
  unit.statuses = unit.statuses.filter(s => !(s.skill === c.skill.id && s.source === c.caster.id && ['invulnerable', 'root', 'disarm', 'silence', 'phased', 'visualForm'].includes(s.kind)));
}
function pointOnLine(t: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }, width: number): boolean {
  const dx = end.x - start.x, dy = end.y - start.y, length = dx * dx + dy * dy;
  const q = length ? Math.max(0, Math.min(1, ((t.x - start.x) * dx + (t.y - start.y) * dy) / length)) : 0;
  return Math.hypot(t.x - start.x - q * dx, t.y - start.y - q * dy) <= width;
}

put('custom_spirit_breaker_charge_of_darkness', active(c => {
  let target = c.target, finished = false; const hit = new Set<string>();
  c.caster.chargeTarget = target.id;
  motionLock(c, 20); if (superLevel(c)) c.status(c.caster, 'magicImmune', balanceNumber(c,'skill_effects_more.magicimmune_duration.1',20));
  const stop = () => { finished = true; unlockMotion(c); c.caster.statuses = c.caster.statuses.filter(s => !(s.skill === c.skill.id && s.kind === 'magicImmune')); };
  clock(c, 20, .05, () => {
    if (finished) return;
    if (c.caster.statuses.some(s => ['stun', 'hex'].includes(s.kind))) { stop(); return; }
    if (target.dead) {
      if (gabenLevel(c)) { const slot = c.caster.skills.findIndex(s => s?.id === c.skill.id); if (slot >= 0) c.caster.cooldowns[slot] = c.battle.time; }
      const next = c.enemies().filter(t => !t.summoned).sort((a, b) => distance(a, target) - distance(b, target))[0]; if (!next) { stop(); return; } target = next; c.caster.chargeTarget = target.id;
    }
    const d = direction(c.caster, target), travel = Math.min(distance(c.caster, target), (c.movementSpeed(c.caster) + U(v(c, 'CHARGE BONUS SPEED') + (superLevel(c) ? 600 : 0))) * .05);
    c.moveContinuous(c.caster,c.caster.x + d.x * travel,c.caster.y + d.y * travel,{duration:.05});
    const chargeSpeed = c.movementSpeed(c.caster) * 100 + v(c, 'CHARGE BONUS SPEED') + (superLevel(c) ? 600 : 0);
    if (superLevel(c)) for (const t of near(c, 1)) if (t.id !== target.id && !hit.has(t.id)) { hit.add(t.id); c.castAbility('aa_granted_greater_bash', 4, t, { 'CHARGE SPEED': chargeSpeed }); }
    if (distance(c.caster, target) <= .8) { c.castAbility('aa_granted_greater_bash', 4, target, { 'CHARGE SPEED': chargeSpeed }); stun(c, target, v(c, 'STUN DURATION')); stop(); }
  });
}, ['continuous targeted charge', 'retarget after target death', 'impact Greater Bash and stun', 'Super immunity/speed, zero cast point and passed-unit bashes', 'Gaben tracked-target-death cooldown reset and permanent attack-triggered Greater Bash'], ['Historical Dota 2023-02-10 max-level Greater Bash uses 30% speed damage, 17% attack chance, 1.5s cooldown; AA granted rank unverified', 'AA Super reduced cast point has no number: working default removes historical base 0.1s cast point; explicit project timing assumption', 'Reference collision size'], { range: 50, castPoint: c => superLevel(c) ? 0 : .1, onAttack: c => { if (!gabenLevel(c) || c.caster.statuses.some(s => s.kind === 'break') || Number(c.caster.greaterBashAt ?? -1) > c.battle.time || c.random() >= balanceNumber(c,'skill_effects_more.trigger_chance.1',0.17)) return; c.caster.greaterBashAt = c.battle.time + 1.5; c.castAbility('aa_granted_greater_bash', 4, c.target); }, onUnitDeath: c => { if (gabenLevel(c) && c.caster.chargeTarget === c.target.id) { const slot = c.caster.skills.findIndex(s => s?.id === c.skill.id); if (slot >= 0) c.caster.cooldowns[slot] = c.battle.time; } }, superImplemented: true, gabenImplemented: true }));

put('phoenix_icarus_dive', active(c => {
  const start = { x: c.caster.x, y: c.caster.y }, dir = direction(c.caster, c.target), length = U(v(c, 'DIVE LENGTH')), duration = 2;
  c.caster.hp = Math.max(1, c.caster.hp * (1 - P(v(c, 'HP COST')))); motionLock(c, duration, false);
  if (superLevel(c)) c.status(c.caster, 'magicImmune', duration);
  clock(c, duration, .05, tick => {
    const angle = Math.min(1, (tick + 1) * .05 / duration) * Math.PI * 2;
    c.moveContinuous(c.caster,start.x + dir.x * length * (1 - Math.cos(angle)) / 2 - dir.y * length * .2 * Math.sin(angle),start.y + dir.y * length * (1 - Math.cos(angle)) / 2 + dir.x * length * .2 * Math.sin(angle),{duration:.05,ignoreBarriers:true});
    for (const t of near(c, 1.5)) { c.status(t, 'dot', v(c, 'BURN DURATION'), v(c, 'DAMAGE PER SECOND'), { ...harmful, interval: balanceNumber(c,'skill_effects_more.interval.1',1), damageType: 'magical' }); slow(c, t, v(c, 'MOVE SLOW'), v(c, 'BURN DURATION')); c.status(t, 'attackSpeed', v(c, 'BURN DURATION'), -v(c, 'ATTACK SPEED SLOW'), harmful); if (superLevel(c)) c.castAbility('aa_granted_fire_spirits_debuff', 4, t); }
    if (gabenLevel(c) && (tick + 1) % 6 === 0) c.castAbility('aa_granted_meteor_hammer', 1, { ...c.caster });
  });
}, ['elliptical outbound/return path', 'contact burn and movement/attack slows', 'Super immunity and native level-four Fire Spirits debuff', 'Gaben meteor drop each 0.3 seconds'], ['2-second duration and path width provisional', 'Interruption/Supernova early end', 'Historical Dota 2023-02-10 child values need AA version validation'], { range: c => U(v(c, 'DIVE LENGTH')), superImplemented: true, gabenImplemented: true }));

put('beastmaster_primal_roar', active(c => {
  const end = { x: c.target.x, y: c.target.y }, dir = direction(c.caster, end), targets = lineTargets(c, c.caster, end, U(v(c, 'SHOUT WIDTH')));
  if (!targets.includes(c.target)) targets.push(c.target);
  for (const t of targets) {
    c.damage(t, (skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE"):(((v(c, 'DAMAGE') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',200) : 0))))), 'magical', true);
    if (t.id === c.target.id || gabenLevel(c)) stun(c, t, v(c, 'STUN DURATION') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.stun_duration.1',1) : 0), true);
    if (t.id !== c.target.id) { const side = (t.x - c.caster.x) * -dir.y + (t.y - c.caster.y) * dir.x >= 0 ? 1 : -1; c.moveContinuous(t,t.x - dir.y * side * 2,t.y + dir.x * side * 2,{duration:defaultMotionDuration()}); slow(c, t, v(c, 'MOVEMENT SLOW'), v(c, 'SLOW DURATION')); c.status(t, 'attackSpeed', v(c, 'SLOW DURATION'), v(c, 'ATTACK SLOW'), harmful); }
  }
  for (const ally of c.allies().filter(t => t.id === c.caster.id || t.owner === c.caster.id)) c.status(ally, 'haste', balanceNumber(c,'skill_effects_more.haste_duration.1',3), balanceNumber(c,'skill_effects_more.haste_amount.1',0.4));
}, ['primary-target piercing stun', 'damaging path with side displacement', 'secondary slows', 'caster/owned-unit speed', 'Super numerical upgrades', 'Gaben secondary stuns'], ['Base cast range and displacement length/timing provisional'], { range: c => balanceNumber(c,'skill_effects_more.range.1',6) + (superLevel(c) ? balanceNumber(c,'skill_effects_more.range.2',2) : 0), cooldown: c => cooldown(c, superLevel(c) ? 40 : 0), superImplemented: true, gabenImplemented: true }));

put('marci_companion_run', active(c => {
  const range = U(v(c, 'CAST / JUMP RANGE'));
  const ally = c.allies().filter(t => t.id !== c.caster.id && distance(t, c.caster) <= range).sort((a, b) => distance(a, c.caster) - distance(b, c.caster))[0];
  const target = c.enemies().sort((a, b) => distance(b, c.caster) - distance(a, c.caster))[0]; if (!ally || !target) return;
  c.status(ally, 'haste', balanceNumber(c,'skill_effects_more.haste_duration.1',5), [balanceNumber(c,'skill_effects_more.haste_amount.1',25), balanceNumber(c,'skill_effects_more.haste_amount.2',30), balanceNumber(c,'skill_effects_more.haste_amount.3',40)][Math.min(balanceNumber(c,'skill_effects_more.haste_amount.4',2), c.skill.points - balanceNumber(c,'skill_effects_more.haste_amount.5',1))] / 100);
  if (superLevel(c)) { c.status(c.caster, 'magicImmune', balanceNumber(c,'skill_effects_more.magicimmune_duration.1',2)); c.status(ally, 'magicImmune', balanceNumber(c,'skill_effects_more.magicimmune_duration.2',2)); }
  motionLock(c, Math.max(.1, 120 - c.battle.time));
  const aborted = () => c.caster.dead || c.caster.statuses.some(s => ['stun', 'hex', 'banished'].includes(s.kind) && s.until > c.battle.time);
  const approach = () => {
    if (aborted() || ally.dead) { unlockMotion(c); return; }
    const d = direction(c.caster, ally), gap = distance(c.caster, ally), step = Math.min(gap, 17 * MOTION_STEP);
    c.moveContinuous(c.caster,c.caster.x + d.x * step,c.caster.y + d.y * step,{duration:1/30});
    if (gap > step + .01) { c.delay(MOTION_STEP, approach); return; }
    const start = { x: c.caster.x, y: c.caster.y }, aim = direction(start, target), maximum = range + (superLevel(c) ? 10 : 0), length = Math.min(maximum, Math.max(4.5, distance(start, target)));
    const duration = maximum <= 4.5 ? .2 : .1 + .1 * (length - 4.5) / (maximum - 4.5); let elapsed = 0;
    const leap = () => {
      if (aborted()) { unlockMotion(c); return; }
      elapsed = Math.min(duration, elapsed + MOTION_STEP); c.moveContinuous(c.caster,start.x + aim.x * length * elapsed / duration,start.y + aim.y * length * elapsed / duration,{duration:1/30});
      if (elapsed < duration - 1e-8) { c.delay(MOTION_STEP, leap); return; }
      unlockMotion(c);
      for (const t of near(c, 2.75)) { c.damage(t, v(c, 'IMPACT DAMAGE')); stun(c, t, v(c, 'STUN DURATION')); if (gabenLevel(c) && !t.dead) c.castAbility('marci_grapple', 3, t); }
    }; c.delay(MOTION_STEP, leap);
  }; c.delay(MOTION_STEP, approach);
}, ['continuous two-stage rebound via nearest ally toward farthest enemy', 'five-second ally movement buff', 'action lock through approach and leap', 'bounded landing movement', 'landing damage/stun', 'Super leap range and dual immunity', 'Gaben max-base Dispose on stunned enemies'], ['Ally speed 25/30/40% maps historical Dota 1/2/4 levels matching AA impact damage tiers', 'Historical 1700 approach speed/450 minimum leap/275 landing radius; leap time linearly interpolates historical 0.1–0.2s endpoints as a working motion policy', 'Dota level-four Dispose mapped to AA third basic value'], { target: 'self', canCast: c => c.allies().some(t => t.id !== c.caster.id && distance(t, c.caster) <= U(v(c, 'CAST / JUMP RANGE'))) && c.enemies().length > 0, superImplemented: true, gabenImplemented: true }));

put('earth_spirit_rolling_boulder', active(c => {
  // AA's Differences explicitly auto-places a Stone Remnant in front on cast.
  const aim = backline(c) ?? c.target;
  const start = { x: c.caster.x, y: c.caster.y }, dir = direction(c.caster, aim), length = U(v(c, 'DISTANCE')) * v(c, 'DISTANCE MULTIPLIER (REMNANT)'), speed = U(v(c, 'SPEED (REMNANT)')); let traveled = 0, ended = false; const hit = new Set<string>();
  motionLock(c, .5 + length / speed + .1);
  if (gabenLevel(c)) c.status(c.caster, 'statusResistance', balanceNumber(c,'skill_effects_more.statusresistance_duration.1',2), balanceNumber(c,'skill_effects_more.statusresistance_amount.1',0.8));
  c.delay(balanceNumber(c,'skill_effects_more.delay.1',0.5), () => { c.status(c.caster, 'visualForm', length / speed + balanceNumber(c,'skill_effects_more.visualform_duration.1',0.1), 0, { dispel: 'none', data: { form: 'rolling_boulder' } }); clock(c, length / speed + .1, .05, () => {
    if (ended) return;
    if (c.caster.statuses.some(s => ['stun', 'hex'].includes(s.kind))) { ended = true; unlockMotion(c); return; }
    const from = { x: c.caster.x, y: c.caster.y }; traveled = Math.min(length, traveled + speed * .05); const end = { x: start.x + dir.x * traveled, y: start.y + dir.y * traveled };
    c.moveContinuous(c.caster,end.x,end.y,{duration:.05});
    for (const t of lineTargets(c, from, end, 1.6)) if (!hit.has(t.id)) { hit.add(t.id); const strength = Number(c.caster.strength ?? 0); c.damage(t, v(c, 'DAMAGE') + strength + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',150) + strength : 0)); stun(c, t, v(c, 'STUN DURATION') + v(c, 'ROCK BONUS STUN DURATION') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.stun_duration.1',1) : 0)); if (!t.summoned) { ended = true; unlockMotion(c); break; } }
    if (traveled >= length) { ended = true; unlockMotion(c); }
  }); }, true);
}, ['delayed continuous roll toward backline', 'automatic Stone Remnant grants doubled travel, enhanced speed and stun', 'first-hero collision stops movement', 'path damage/stun', 'existing strength coefficient', 'Super damage/stun', 'Gaben two-second resistance at cast'], ['Four-class strength mapping', 'Automatically created Stone Remnant has no independent world representation', 'Historical Dota 2023-02-10 collision radius 160; AA version/Gaben activation timing unverified'], { range: c => U(v(c, 'DISTANCE')) * v(c, 'DISTANCE MULTIPLIER (REMNANT)'), superImplemented: true, gabenImplemented: true }));

put('custom_pangolier_rolling_thunder', active(c => {
  const length = v(c, 'DURATION') + (superLevel(c) ? 3 : 0); let dir = direction(c.caster, c.target), bonusSpeed = 0; const hitAt = new Map<string, number>();
  c.dispel(c.caster); c.status(c.caster, 'magicImmune', length); motionLock(c, length); c.status(c.caster, 'visualForm', length, 0, { dispel: 'none', data: { form: 'rolling_thunder' } });
  clock(c, length, .05, () => {
    const speed = U(v(c, 'ROLL SPEED')) + bonusSpeed, x = c.caster.x + dir.x * speed * .05, y = c.caster.y + dir.y * speed * .05;
    let bounced = false; if (Math.abs(x) > 14.17) { dir.x *= -1; bounced = true; } if (Math.abs(y) > 12.516) { dir.y *= -1; bounced = true; }
    if (bounced && gabenLevel(c)) bonusSpeed += .4;
    c.moveContinuous(c.caster,bounced ? c.caster.x + dir.x * speed * .05 : x,bounced ? c.caster.y + dir.y * speed * .05 : y,{duration:.05});
    for (const t of near(c, U(v(c, 'RADIUS')))) if (c.battle.time - (hitAt.get(t.id) ?? -Infinity) >= v(c, 'STUN DURATION') + .3) {
      hitAt.set(t.id, c.battle.time); c.damage(t, v(c, 'DAMAGE')); c.moveContinuous(t,t.x + dir.x * U(v(c, 'KNOCKBACK DISTANCE')),t.y + dir.y * U(v(c, 'KNOCKBACK DISTANCE')),{duration:.05}); stun(c, t, v(c, 'STUN DURATION')); if (gabenLevel(c)) bonusSpeed += .4;
    }
  });
}, ['spell-immune rolling movement', 'arena-wall reflection', 'collision damage/knockback/stun', 'Super duration/cooldown', 'Gaben instant transformation/collision speed growth'], ['Reduced-turn-rate steering and wall pause', 'Per-target hit lockout verification'], { castPoint: c => gabenLevel(c) ? 0 : 1.2, range: 20, cooldown: c => cooldown(c, superLevel(c) ? 25 : 0), superImplemented: true, gabenImplemented: true }));

put('custom_hoodwink_sharpshooter', active(c => {
  const aim = direction(c.caster, c.target);
  c.delay(balanceNumber(c,'skill_effects_more.delay.1',5), () => {
    if (c.caster.dead) return;
    const start = { x: c.caster.x, y: c.caster.y };
    c.linearProjectile({ origin: start, angle: Math.atan2(aim.y, aim.x), distance: 30, speed: balanceNumber(c,'skill_effects_more.speed.1',22) * balanceNumber(c,'skill_effects_more.speed.2',1.25), width: 1.25, stopOnHit: !superLevel(c), effect: t => { c.damage(t, v(c, 'MAX DAMAGE')); c.status(t, 'break', v(c, 'MAX DEBUFF DURATION'), 0, harmful); slow(c, t, v(c, 'MOVE SLOW'), v(c, 'MAX DEBUFF DURATION')); } });
    motionLock(c, .4); let elapsed = 0;
    const recoil = () => { if (c.caster.dead) return; elapsed = Math.min(.4, elapsed + MOTION_STEP); c.moveContinuous(c.caster,start.x - aim.x * 3.5 * elapsed / .4,start.y - aim.y * 3.5 * elapsed / .4,{duration:1/30}); if (elapsed < .4 - 1e-8) c.delay(MOTION_STEP, recoil); else unlockMotion(c); }; c.delay(MOTION_STEP, recoil);
  }, true);
}, ['automatic full-charge release after five seconds', 'continuous aimed projectile with AA 25% speed increase', 'break and slow', '350-distance recoil over historical 0.4 seconds', 'Super piercing', 'Gaben independently cast Hunter Boomerang and marked-death cooldown refund regardless of killer'], ['Early manual release and scaling are absent from autonomous full-charge AI policy', 'Historical Dota 2023-02-10 base arrow speed 2200/range 3000/width 125; AA explicit 25% projectile-speed bonus applied', 'Historical Hunter Boomerang values and automatic target priority need AA verification'], { range: 30, channel: 5, init: c => { if (gabenLevel(c)) grantActive(c, 'hoodwink_hunters_boomerang', 1, 125, 18, () => c.enemies().filter(t => distance(t, c.caster) <= 9).sort((a, b) => distance(a, c.caster) - distance(b, c.caster))[0]); }, onUnitDeath: c => { if (gabenLevel(c) && c.target.side !== c.caster.side && c.target.statuses.some(s => s.kind === 'huntersMark' && s.source === c.caster.id)) { const slot = c.caster.skills.findIndex(s => s?.id === c.skill.id); if (slot >= 0) c.caster.cooldowns[slot] = Math.max(c.battle.time, c.caster.cooldowns[slot] - 20); } }, superImplemented: true, gabenImplemented: true }));

put('custom_mars_spear_of_mars', active(c => {
  const direction0 = direction(c.caster, c.target);
  const range = [9, 10, 12][Math.min(2, c.skill.points - 1)] + (gabenLevel(c) ? 16 : 0);
  const seen = new Set<string>(), token = `${c.caster.id}:${c.battle.time}`, trails: { from: { x: number; y: number }; to: { x: number; y: number }; until: number }[] = [];
  if (superLevel(c)) c.zone({ x: 0, y: 0, radius: balanceNumber(c,'skill_effects_more.radius.1',100), duration: range / balanceNumber(c,'skill_effects_more.duration.1',14) + balanceNumber(c,'skill_effects_more.duration.2',10), interval: balanceNumber(c,'skill_effects_more.interval.1',0.2), effect: t => { if (trails.some(trail => trail.until > c.battle.time && pointOnLine(t, trail.from, trail.to, 2))) { c.status(t, 'dot', balanceNumber(c,'skill_effects_more.dot_duration.1',2), balanceNumber(c,'skill_effects_more.dot_amount.1',35), { ...harmful, interval: balanceNumber(c,'skill_effects_more.interval.2',0.2), damageType: 'magical' }); slow(c, t, balanceNumber(c,'skill_effects_more.slow_amount.1',20), balanceNumber(c,'skill_effects_more.slow_duration.1',2)); } } });
  const segment = (start: { x: number; y: number }, dir: { x: number; y: number }, bounces: number, budget: number) => {
    const tx = Math.abs(dir.x) > 1e-6 ? ((dir.x > 0 ? 14.17 : -14.17) - start.x) / dir.x : Infinity;
    const ty = Math.abs(dir.y) > 1e-6 ? ((dir.y > 0 ? 12.516 : -12.516) - start.y) / dir.y : Infinity;
    const wallDistance = Math.max(0, Math.min(tx, ty)), length = Math.min(wallDistance, budget), wall = wallDistance <= budget + 1e-8;
    const end = { x: start.x + dir.x * length, y: start.y + dir.y * length };
    const skewered: CombatUnit[] = []; let previous = start;
    c.linearProjectile({ origin: start, angle: Math.atan2(dir.y, dir.x), distance: length, speed: balanceNumber(c,'skill_effects_more.speed.1',14), width: 1.25,
      effect: target => {
        if (seen.has(target.id) || target.statuses.some(s => ['magicImmune', 'invulnerable', 'banished'].includes(s.kind) && s.until > c.battle.time)) return;
        seen.add(target.id); c.damage(target, (skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE"):(((v(c, 'DAMAGE') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',100) : 0))))));
        if (!target.dead && (!target.summoned || target.consideredHero || target.illusion) && skewered.length < (superLevel(c) ? 2 : 1)) {
          skewered.push(target);
          c.status(target, 'selfStun', length / balanceNumber(c,'skill_effects_more.selfstun_duration.1',14) + balanceNumber(c,'skill_effects_more.selfstun_duration.2',0.1), 0, { harmful: true, dispel: 'none', data: { spearToken: token } });
          c.status(target, 'phased', length / balanceNumber(c,'skill_effects_more.phased_duration.1',14) + balanceNumber(c,'skill_effects_more.phased_duration.2',0.1), 0, { dispel: 'none', data: { spearToken: token } });
        }
      },
      onMove: position => {
        if (superLevel(c)) trails.push({ from: previous, to: position, until: c.battle.time + 10 }); previous = position;
        for (const target of skewered) if (!target.dead) c.moveContinuous(target,position.x,position.y,{duration:1/30});
      },
      onEnd: () => {
        for (const target of skewered) { target.statuses = (target.statuses as EffectStatus[]).filter(s => s.data?.spearToken !== token); if (!target.dead && wall) stun(c, target, v(c, 'STUN DURATION') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.stun_duration.1',1) : 0)); }
        if (wall && bounces > 0 && budget > length + 1e-8) segment(end, { x: tx <= ty ? -dir.x : dir.x, y: ty <= tx ? -dir.y : dir.y }, bounces - 1, budget - length);
      }
    });
  }; segment({ x: c.caster.x, y: c.caster.y }, direction0, gabenLevel(c) ? 2 : 0, range);
}, ['continuous swept projectile and carried skewered heroes', 'forced-movement action lock and wall-only pin/stun', 'Super double impale and ten-second trails laid during travel', 'Gaben 1600 bonus range and up to two wall bounces sharing the range budget; carried heroes stay pinned before bounce'], ['Historical Dota 2023-02-10 mars_spear: 900/1000/1200 range, 1400 speed, 125 width, 200 fire-trail radius; AA version match unverified', 'Whether Gaben refreshes distance budget on bounce needs AA reference', 'One direct damage/impale per unit per cast and hero/illusion/creep-hero eligibility are explicit working policies', 'AA prose says entire arena but has no base range number; historical range remains an explicit candidate'], { range: c => [balanceNumber(c,'skill_effects_more.range.1',9), balanceNumber(c,'skill_effects_more.range.2',10), balanceNumber(c,'skill_effects_more.range.3',12)][Math.min(balanceNumber(c,'skill_effects_more.range.4',2), c.skill.points - balanceNumber(c,'skill_effects_more.range.5',1))] + (gabenLevel(c) ? balanceNumber(c,'skill_effects_more.range.6',16) : 0), superImplemented: true, gabenImplemented: true }));

put('death_prophet_spirit_siphon', active(c => {
  const target = c.target;
  let broken = false, elapsed = 0, feared = false;
  c.status(target, 'spiritSiphon', v(c, 'DURATION'), 0, { harmful: true, dispel: 'strong' });
  clock(c, v(c, 'DURATION'), .1, () => {
    if (broken || target.dead) return;
    if (distance(c.caster, target) > 7.5 || !target.statuses.some(s => s.skill === c.skill.id && s.source === c.caster.id && s.kind === 'spiritSiphon')) { broken = true; target.statuses = target.statuses.filter(s => !(s.skill === c.skill.id && s.source === c.caster.id && s.kind === 'spiritSiphon')); return; }
    const dealt = c.damage(target, (v(c, 'DAMAGE') + (superLevel(c) ? target.maxHp * balanceNumber(c,'skill_effects_more.damage.1',0.035) : 0)) * balanceNumber(c,'skill_effects_more.damage.2',0.1)); c.heal(c.caster, dealt); if (superLevel(c)) slow(c, target, balanceNumber(c,'skill_effects_more.slow_amount.1',20), balanceNumber(c,'skill_effects_more.slow_duration.1',0.2));
    elapsed += .1; if (gabenLevel(c) && !feared && elapsed >= 3 - 1e-8) { feared = true; c.status(target, 'fear', balanceNumber(c,'skill_effects_more.fear_duration.1',1.5), 0, harmful); }
  });
}, ['nonchannelled distinct-target damage/healing links', 'chosen unlinked unit is the actual cast target for spell-block dispatch', 'strong-dispellable link', 'permanent break on range loss', 'Super percent-health drain/slow/recharge', 'Gaben extra charge and fear after three uninterrupted seconds'], ['Historical Dota 2023-02-10 base: 1/2/4 charges, 38s recharge, 250 break buffer; AA snapshot version unverified', 'Dota levels 1/2/4 mapped to AA three base levels using supplied damage rows'], { range: 5, castPoint: .1, targetSelector: (c, candidates) => candidates.filter(t => !t.statuses.some(s => s.skill === c.skill.id && s.source === c.caster.id && s.kind === 'spiritSiphon')).sort((a, b) => distance(a, c.caster) - distance(b, c.caster))[0], superImplemented: true, gabenImplemented: true }));

put('dawnbreaker_fire_wreath', active(c => {
  const duration = v(c, 'COMBO DURATION'), radius = U(v(c, 'SWIPE/SMASH RADIUS') + (superLevel(c) ? 150 : 0)), forward = direction(c.caster, c.target);
  c.status(c.caster, 'disarm', duration); if (superLevel(c)) c.status(c.caster, 'magicImmune', duration);
  for (let strike = 0; strike < 3; strike++) c.delay((strike + balanceNumber(c,'skill_effects_more.delay.1',1)) * duration / balanceNumber(c,'skill_effects_more.delay.2',3), () => {
    if (c.caster.dead || c.caster.statuses.some(s => ['stun', 'hex'].includes(s.kind))) return;
    for (const t of near(c, radius)) { const d = direction(c.caster, t); if (strike === 2 && d.x * forward.x + d.y * forward.y < 0) continue; instantAttack(c, t, 1, v(c, 'SWIPE/SMASH BONUS DAMAGE')); if (strike === 2) stun(c, t, v(c, 'SMASH STUN DURATION')); }
  }, true);
}, ['three timed attacks', 'final frontal stun', 'bonus attack damage', 'Super radius/immunity', 'Gaben stacking refreshable armor debuff on attacks'], ['Combo movement and interruption behavior', 'Super charges'], { range: c => U(v(c, 'SWIPE/SMASH RADIUS') + (superLevel(c) ? 150 : 0)), onAttack: c => { if (gabenLevel(c)) { for (const s of c.target.statuses) if (s.skill === c.skill.id && s.source === c.caster.id && s.kind === 'armor') s.until = c.battle.time + 5; c.status(c.target, 'armor', balanceNumber(c,'skill_effects_more.armor_duration.1',5), balanceNumber(c,'skill_effects_more.armor_amount.1',-1), { ...harmful, maxStacks: balanceNumber(c,'skill_effects_more.maxstacks.1',1000) }); } }, gabenImplemented: true }));

put('custom_phoenix_sun_ray', active(c => {
  const aim = direction(c.caster, c.target), duration = v(c, 'MAX DURATION');
  if (gabenLevel(c)) {
    // AA spawns an independent Supernova beam emitter; the original hero is
    // neither killed nor given Dota Phoenix's rebirth/cooldown reset.
    const egg = c.summon({ name: '超新星', count: balanceNumber(c,'skill_effects_more.count.1',1), hp: balanceNumber(c,'skill_effects_more.hp.1',20), attack: 0, range: 0, speed: 0, lifetime: duration + balanceNumber(c,'skill_effects_more.lifetime.1',0.1) })[0];
    c.warp(egg,c.caster.x,c.caster.y); c.status(egg, 'disarm', duration + balanceNumber(c,'skill_effects_more.disarm_duration.1',0.1), 0, { dispel: 'none' });
    c.status(egg, 'hitCountBody', duration + balanceNumber(c,'skill_effects_more.hitcountbody_duration.1',0.1), 0, { dispel: 'none', data: { heroDamage: 2, basicDamage: 1, immuneSpells: true } });
    c.status(egg, 'visualForm', duration + balanceNumber(c,'skill_effects_more.visualform_duration.1',0.1), 0, { dispel: 'none', data: { form: 'supernova', aimX: aim.x, aimY: aim.y } });
    c.status(egg, 'visualBeam', duration, 0, { dispel: 'none', data: { aimX: aim.x, aimY: aim.y, length: 12, widthMultiplier: 1.25 } });
    const start = { x: egg.x, y: egg.y }, end = { x: egg.x + aim.x * 12, y: egg.y + aim.y * 12 };
    c.zone({ x: egg.x, y: egg.y, radius: balanceNumber(c,'skill_effects_more.radius.1',13), targets: 'all', duration, interval: balanceNumber(c,'skill_effects_more.interval.1',0.1), effect: (t, tick) => {
      if (egg.dead || t.id === egg.id) return; const fraction = Math.min(1, (tick + 1) * .1 / duration);
      if (t.side !== c.caster.side) { if (distance(t, egg) <= 12) c.damage(t, balanceNumber(c,'skill_effects_more.damage.1',12)); if (pointOnLine(t, start, end, 1.625)) c.damage(t, (v(c, 'BASE DAMAGE') + t.maxHp * (P(v(c, 'MAX HEALTH DAMAGE')) + balanceNumber(c,'skill_effects_more.damage.2',0.015)) * fraction) * balanceNumber(c,'skill_effects_more.damage.3',0.1)); }
      else if (pointOnLine(t, start, end, 1.625)) c.heal(t, (v(c, 'BASE HEAL') + t.maxHp * (P(v(c, 'MAX HEALTH HEAL')) + balanceNumber(c,'skill_effects_more.heal.1',0.015)) * fraction) * balanceNumber(c,'skill_effects_more.heal.2',0.1));
    } });
    c.delay(duration, () => { if (egg.dead) return; for (const t of around(c, egg.x, egg.y, 12)) stun(c, t, balanceNumber(c,'skill_effects_more.stun_duration.1',3), true); egg.expiresAt = c.battle.time; });
    return;
  }
  c.status(c.caster, 'visualBeam', balanceNumber(c,'skill_effects_more.visualbeam_duration.1',0.15), 0, { dispel: 'none', data: { aimX: aim.x, aimY: aim.y, length: 12, widthMultiplier: superLevel(c) ? 1.25 : 1 } });
  clock(c, duration, .1, tick => {
    c.status(c.caster, 'visualBeam', balanceNumber(c,'skill_effects_more.visualbeam_duration.2',0.15), 0, { dispel: 'none', data: { aimX: aim.x, aimY: aim.y, length: 12, widthMultiplier: superLevel(c) ? 1.25 : 1 } });
    const fraction = Math.min(1, (tick + 1) * .1 / duration), start = { x: c.caster.x, y: c.caster.y }, end = { x: start.x + aim.x * 12, y: start.y + aim.y * 12 }, width = superLevel(c) ? 1.625 : 1.3;
    c.caster.hp = Math.max(1, c.caster.hp * (1 - P(v(c, 'HEALTH COST PER SECOND')) * .1));
    for (const t of c.enemies().filter(t => pointOnLine(t, start, end, width))) c.damage(t, (v(c, 'BASE DAMAGE') + t.maxHp * (P(v(c, 'MAX HEALTH DAMAGE')) + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.4',0.015) : 0)) * fraction) * balanceNumber(c,'skill_effects_more.damage.5',0.1));
    for (const t of c.allies().filter(t => t.id !== c.caster.id && pointOnLine(t, start, end, width))) c.heal(t, (v(c, 'BASE HEAL') + t.maxHp * (P(v(c, 'MAX HEALTH HEAL')) + (superLevel(c) ? balanceNumber(c,'skill_effects_more.heal.3',0.015) : 0)) * fraction) * balanceNumber(c,'skill_effects_more.heal.4',0.1));
  }, true);
}, ['interruptible aimed beam', 'increasing percent-health enemy damage and ally healing', 'ongoing caster health cost', 'Super percentages/width', 'Gaben independent attack-count Supernova beam emitter, ambient burn and end stun'], ['Historical Dota 2023-02-10 1200 ray range/130 width; steering and damage ramp need AA verification', 'Supernova fallback uses max native level: ten hero attacks, 120 DPS/1200 radius/3s stun; AA grant rank unspecified', 'Spawned emitter does not rebirth/reset original hero; AA wording says spawn rather than transform'], { range: 12, channel: c => gabenLevel(c) ? 0 : v(c, 'MAX DURATION'), superImplemented: true, gabenImplemented: true }));

function swash(c: EffectContext, passive = false) {
  const dir = passive ? { x: Math.cos(c.caster.facing), y: Math.sin(c.caster.facing) } : direction(c.caster, c.target);
  const dash=passive?0:Math.min(U(v(c,'DASH RANGE')),Math.max(0,distance(c.caster,c.target)-2)),travel=dash/Math.max(.01,U(v(c,'DASH SPEED',2000))),interval=v(c,'SLASH INTERVAL',.1),count=skillBalance(c.definition,c.skill.points)?v(c,'STRIKES'):(gabenLevel(c)?6:v(c,'STRIKES')),strikes=passive?Math.ceil(count/2):count;
  const begin=()=>{if(c.caster.dead)return;const start={x:c.caster.x,y:c.caster.y},end={x:start.x+dir.x*U(v(c,'SLASH RANGE')),y:start.y+dir.y*U(v(c,'SLASH RANGE'))},slash=()=>{if(c.caster.dead)return;for(const t of lineTargets(c,start,end,U(v(c,'SLASH WIDTH'))))c.attack(t,1,true,v(c,'DAMAGE PER STRIKE'),false,{trueStrike:true,ignoreDamageBlock:true,allowInvisibleTarget:true});};for(let i=0;i<strikes;i++)if(i)c.delay(i*interval,slash);else slash();};
  if(!passive)c.status(c.caster,'selfStun',travel+Math.max(0,strikes-1)*interval+MOTION_STEP,0,{dispel:'none'});
  if(dash>0){c.moveContinuous(c.caster,c.caster.x+dir.x*dash,c.caster.y+dir.y*dash,{duration:travel,ignoreBarriers:true});c.delay(travel,begin);}else begin();
}
put('pangolier_swashbuckle',active(c=>swash(c),['2000-speed continuous dash finishes before .1-second slash series', 'True Strike fixed-base instant attacks ignore flat damage block and allow cleave/attack effects', 'active action lock during dash and slash series', 'Super periodic breakable half-count slash', 'Gaben final six-strike profile'],['AI stops two world units short of target; no player ground targeting', 'Precise active sequence interruption and unusual fixed-damage/base-attack-buff interactions need further coverage', 'Modern slow and extra dash attack are excluded from the historical 2023 model'],{range:c=>U(v(c,'DASH RANGE')+v(c,'SLASH RANGE')),init:c=>{if(superLevel(c))clock(c,120,6,()=>{if(!c.caster.statuses.some(s=>s.kind==='break'))swash(c,true);});},superImplemented:true,gabenImplemented:true}));

put('beastmaster_wild_axes', active(c => {
  const start = { x: c.caster.x, y: c.caster.y }, end = { x: c.target.x, y: c.target.y }, dir = direction(start, end), length = distance(start, end), hit = [new Set<string>(), new Set<string>()], old = [{ ...start }, { ...start }];
  const visuals = [0, 1].map(() => addVisualProjectile(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: 'axe', role: 'projectile', ...start, angle: Math.atan2(dir.y, dir.x), until: c.battle.time + 1.4 + MOTION_STEP }));
  let elapsed = 0;
  const fly = () => {
    elapsed = Math.min(1.4, elapsed + MOTION_STEP);
    const t = elapsed / 1.4, along = t < .5 ? t * 2 : (1 - t) * 2;
    for (let axe = 0; axe < 2; axe++) {
      const lateral = Math.sin(Math.PI * along) * 2 * (axe === 0 ? -1 : 1), next = { x: start.x + dir.x * length * along - dir.y * lateral, y: start.y + dir.y * length * along + dir.x * lateral };
      moveVisualProjectile(c.battle, visuals[axe], next);
      for (const target of lineTargets(c, old[axe], next, .75)) if (!hit[axe].has(target.id)) { hit[axe].add(target.id); c.damage(target, (skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE PER AXE"):(((v(c, 'DAMAGE PER AXE') + (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',30) : 0)))))); c.status(target, 'sourceDamageAmp', v(c, 'DEBUFF DURATION'), P(v(c, 'DAMAGE AMP PER STACK')) + (superLevel(c) ? balanceNumber(c,'skill_effects_more.sourcedamageamp_amount.1',0.04) : 0), { ...harmful, maxStacks: balanceNumber(c,'skill_effects_more.maxstacks.1',1000) }); }
      old[axe] = next;
    }
    if (elapsed < 1.4 - 1e-8) c.delay(MOTION_STEP, fly); else for (const visual of visuals) removeVisualProjectile(c.battle, visual);
  }; c.delay(MOTION_STEP, fly);
}, ['two independent outward-and-return axe paths survive caster death', 'each axe hits each enemy once', 'source/owned-unit damage amplification stacks', 'Super damage/amplification', 'Gaben cooldown override'], ['Travel/arc geometry provisional', 'Tree cutting absent', 'Stack refresh/expiry semantics', 'Engine minimum cast scheduling remains 0.2s'], { range: c => U(v(c, 'CAST RANGE')), cooldown: c => gabenLevel(c) ? 0 : cooldown(c), superImplemented: true, gabenImplemented: true }));

put('centaur_stampede', active(c => {
  const duration = v(c, 'STAMPEDE DURATION') + (gabenLevel(c) ? 1 : 0), allies = c.allies(), hit = new Set<string>();
  for (const t of allies) { c.status(t, 'forceMoveSpeed', duration, balanceNumber(c,'skill_effects_more.forcemovespeed_amount.1',5.5)); c.status(t, 'phased', duration, 0, { dispel: 'none' }); if (gabenLevel(c)) c.status(t, 'damageReduction', duration, balanceNumber(c,'skill_effects_more.damagereduction_amount.1',0.4)); }
  const until = c.battle.time + duration;
  const trample = () => { for (const t of c.enemies()) if (!hit.has(t.id) && allies.some(a => !a.dead && distance(a, t) <= U(v(c, 'TRAMPLE RADIUS')))) { hit.add(t.id); c.damage(t, Number(c.caster.strength ?? 0) * v(c, 'STRENGTH MULTIPLIER DAMAGE')); slow(c, t, balanceNumber(c,'skill_effects_more.slow_amount.1',100), v(c, 'SLOW DURATION')); if (superLevel(c)) stun(c, t, balanceNumber(c,'skill_effects_more.stun_duration.1',1.5)); } if (c.battle.time + MOTION_STEP <= until + 1e-8) c.delay(MOTION_STEP, trample); }; c.delay(MOTION_STEP, trample);
}, ['fixed-speed team charge with unit phasing', 'once-per-enemy contact trample persists for surviving allies after caster death', 'effective strength damage coefficient', 'slow', 'Super stun/cooldown', 'Gaben duration/damage reduction'], ['Four-class strength and movement-speed mapping need reference calibration'], { target: 'self', canCast: c => near(c, 12).length > 0, cooldown: c => cooldown(c, superLevel(c) ? 50 : 0), superImplemented: true, gabenImplemented: true }));

put('primal_beast_trample', active(c => {
  const duration = v(c, 'DURATION'); let last = { x: c.caster.x, y: c.caster.y }, traveled = 0;
  c.status(c.caster, 'disarm', duration); c.status(c.caster, 'trampling', duration);
  if (superLevel(c)) { c.status(c.caster, 'magicResist', duration, balanceNumber(c,'skill_effects_more.magicresist_amount.1',0.5)); c.status(c.caster, 'statusResistance', duration, balanceNumber(c,'skill_effects_more.statusresistance_amount.1',0.5)); }
  clock(c, duration, .05, () => {
    traveled += distance(last, c.caster); last = { x: c.caster.x, y: c.caster.y };
    while (traveled >= 1.4) { traveled -= 1.4; const amount = v(c, 'BASE DAMAGE') + c.caster.attack * (P(v(c, 'ATTACK DAMAGE MULTIPLIER')) + (superLevel(c) ? .25 : 0));
      for (const t of near(c, U((skillBalance(c.definition,c.skill.points)?v(c,"DAMAGE AOE"):(((v(c, 'DAMAGE AOE') + (superLevel(c) ? 70 : 0)))))))) { c.damage(t, amount); if (gabenLevel(c)) c.attack(t, balanceNumber(c,'skill_effects_more.attack_multiplier.1',1), true, 0); }
    }
  });
}, ['damage triggered by actual distance traveled', 'disarm while active', 'base plus attack-scaled damage', 'Super resistances/radius/scaling', 'Gaben modifier-only attack and cooldown'], ['Trampling AI path/chase behavior', 'Teleport versus walked-distance distinction', 'Gaben attack modifier physical bonus damage ordering'], { target: 'self', canCast: c => !c.caster.statuses.some(s => s.kind === 'trampling') && near(c, 8).length > 0, cooldown: c => gabenLevel(c) ? 0 : cooldown(c), superImplemented: true, gabenImplemented: true }));

put('venomancer_venomous_gale', active(c => {
  c.linearProjectile({ origin: { x: c.caster.x, y: c.caster.y }, angle: Math.atan2(c.target.y - c.caster.y, c.target.x - c.caster.x), distance: 8 + (superLevel(c) ? 4 : 0), speed: balanceNumber(c,'skill_effects_more.speed.1',12), width: 1.25, effect: target => {
    c.damage(target, (skillBalance(c.definition,c.skill.points)?v(c,"INITIAL DAMAGE"):(((v(c, 'INITIAL DAMAGE') * (superLevel(c) ? balanceNumber(c,'skill_effects_more.damage.1',2) : balanceNumber(c,'skill_effects_more.damage.2',1))))))); if (gabenLevel(c)) c.status(target, 'statusResistance', v(c, 'DURATION'), balanceNumber(c,'skill_effects_more.statusresistance_amount.1',-0.4), harmful);
    c.status(target, 'dot', v(c, 'DURATION'), v(c, 'DAMAGE PER TICK') / balanceNumber(c,'skill_effects_more.dot_amount.1',3), { ...harmful, interval: balanceNumber(c,'skill_effects_more.interval.1',3), damageType: 'magical' }); slow(c, target, v(c, 'SLOW'), v(c, 'DURATION')); if (superLevel(c)) c.status(target, 'attackSpeedPct', v(c, 'DURATION'), balanceNumber(c,'skill_effects_more.attackspeedpct_amount.1',-0.1), harmful);
  } });
}, ['independent nonhoming piercing venom projectile persists after caster death', 'once-per-target impact', 'three-second poison ticks', 'slow', 'Super impact/cooldown/range and percent attack-speed penalty', 'Gaben negative status resistance'], ['Historical Dota 2023-02-10: 125 radius/1200 speed/800 base range candidate parameters', 'Status-resistance application ordering and self-interaction verification'], { range: c => balanceNumber(c,'skill_effects_more.range.1',8) + (superLevel(c) ? balanceNumber(c,'skill_effects_more.range.2',4) : 0), cooldown: c => cooldown(c, superLevel(c) ? 6 : 0), superImplemented: true, gabenImplemented: true }));

interface ChargeState { count: number; maximum: number; next: number | null }
/** Sequential charge recovery is independent of whether the caster is currently
 * able to act. No wall-clock timer, free refresh, or per-cast timer reset. */
function withCharges(id: string, maximum: (c: EffectContext) => number, replenish: (c: EffectContext) => number, enabled = (c: EffectContext) => maximum(c) > 1) {
  const p = programs[id], cast = p.cast!, init = p.init, canCast = p.canCast, normalCooldown = p.cooldown;
  const time = (c: EffectContext) => Math.max(.2, replenish(c) * (1 - Math.min(.9, Math.max(0, c.caster.statuses.filter(s => s.kind === 'cooldownReduction').reduce((sum, s) => sum + (s.value ?? 0), 0)))));
  const state = (c: EffectContext): ChargeState => {
    const key = `charges:${id}`; let data = c.caster[key] as ChargeState | undefined;
    if (!data) { data = { count: maximum(c), maximum: maximum(c), next: null }; c.caster[key] = data; }
    while (data.next !== null && data.next <= c.battle.time + 1e-8 && data.count < data.maximum) {
      data.count++; data.next = data.count < data.maximum ? data.next + time(c) : null;
    }
    return data;
  };
  p.init = c => { init?.(c); if (enabled(c)) state(c); };
  p.canCast = c => (!enabled(c) || state(c).count > 0) && (canCast?.(c) ?? true);
  p.cooldown = c => {
    if (!enabled(c)) return normalCooldown?.(c) ?? cooldown(c);
    const data = state(c); return data.count > 1 ? 0 : Math.max(0, (data.next ?? c.battle.time + time(c)) - c.battle.time);
  };
  p.cast = c => {
    if (enabled(c)) {
      const data = state(c); if (data.count <= 0) return; data.count--;
      if (data.next === null) data.next = c.battle.time + time(c);
      const slot = c.caster.skills.findIndex(s => s?.id === id);
      if (slot >= 0) c.caster.cooldowns[slot] = data.count > 0 ? c.battle.time : data.next;
    }
    cast(c);
  };
  p.implemented.push('finite ability charges with sequential simulation-time replenishment');
}
withCharges('void_spirit_astral_step',c=>v(c,'MAX CHARGES')+(!skillBalance(c.definition,c.skill.points)&&gabenLevel(c)?2:0),c=>v(c,'BASE CHARGE RESTORE TIME')-(!skillBalance(c.definition,c.skill.points)&&superLevel(c)?4:0));
programs.void_spirit_astral_step.gabenImplemented = true;
programs.void_spirit_astral_step.remaining = programs.void_spirit_astral_step.remaining.filter(s => !s.includes('charge/recharge'));
withCharges('clinkz_strafe', c => gabenLevel(c) ? 2 : 1, c => cooldown(c));
programs.clinkz_strafe.gabenImplemented = true;
programs.clinkz_strafe.remaining = programs.clinkz_strafe.remaining.filter(s => !s.includes('Gaben charges'));
withCharges('dawnbreaker_fire_wreath', c => superLevel(c) ? 2 : 1, c => cooldown(c));
programs.dawnbreaker_fire_wreath.superImplemented = true;
programs.dawnbreaker_fire_wreath.remaining = programs.dawnbreaker_fire_wreath.remaining.filter(s => !s.includes('Super charges'));
withCharges('morphling_waveform', c => superLevel(c) ? 2 : 1, c => cooldown(c));
programs.morphling_waveform.superImplemented = true;
programs.morphling_waveform.remaining = programs.morphling_waveform.remaining.filter(s => !s.includes('Super charge system'));
withCharges('void_spirit_resonant_pulse', c => gabenLevel(c) ? 2 : 1, c => cooldown(c));
programs.void_spirit_resonant_pulse.gabenImplemented = true;
programs.void_spirit_resonant_pulse.remaining = programs.void_spirit_resonant_pulse.remaining.filter(s => !s.includes('Gaben charge system'));
withCharges('ember_spirit_sleight_of_fist', c => gabenLevel(c) ? 3 : 1, c => cooldown(c));
programs.ember_spirit_sleight_of_fist.gabenImplemented = true;
programs.ember_spirit_sleight_of_fist.remaining = programs.ember_spirit_sleight_of_fist.remaining.filter(s => !s.includes('Gaben charges'));
// Historical shipped KV: death_prophet_spirit_siphon AbilityCharges and
// AbilityValues.AbilityChargeRestoreTime; AA Super/Gaben override these bases.
withCharges('death_prophet_spirit_siphon', c => [1, 2, 4][Math.min(2, c.skill.points - 1)] + (gabenLevel(c) ? 1 : 0), c => 38 - (superLevel(c) ? 20 : 0), () => true);

export const MORE_PROGRAMS: Record<string, SkillProgram> = programs;
