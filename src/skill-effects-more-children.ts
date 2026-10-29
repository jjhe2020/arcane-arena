import {defaultMotionDuration} from './config';
import {configuredValue} from './config';
import {balanceNumber} from './config';
import type { CombatUnit, SkillDefinition } from './model';
import { addVisualProjectile, moveVisualProjectile, removeVisualProjectile } from './combat/visual-state';
import type { EffectContext, EffectStatus, SkillProgram } from './skill-effects';

/** Granted-only effects: never enter the 230-entry shop catalog.
 * Base fields are transcribed from references/dota-20230216/parsed/{npc_abilities,items}.json,
 * data.DOTAAbilities[id].AbilityValues / AbilitySpecial, Valve shipped KV mirrored by
 * SteamTracking commit 6abdd9d13de2f4330ca748082467b9ff6e6cd928 (2023-02-10).
 * This historic Dota baseline is NOT proof of the AA snapshot's engine version.
 * Parent abilities explicitly override fields when AA English supplies a value.
 */
const source = 'Valve shipped KV 2023-02-10, SteamTracking 6abdd9d13de2f4330ca748082467b9ff6e6cd928; AA version match unverified';
const H = { harmful: true };
const MOTION_STEP = 1 / 30;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const value = (c: EffectContext, key: string) => {
  const configured=configuredValue(c,key);if(configured!==undefined)return configured;
  const row = c.definition.values.find(r => r.slice(0, r.indexOf(':')).toUpperCase() === key.toUpperCase());
  const values = row?.slice(row.indexOf(':') + 1).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(c.skill.points) - 1))] ?? 0;
};
const v = value;
const definitions: SkillDefinition[] = [];
const programs: Record<string, SkillProgram> = {};
function register(id: string, fields: Record<string, string | number>, p: SkillProgram, metadata: { cooldown?: number[]; mana?: number[]; target?: string; historicalId?: string } = {}) {
  definitions.push({ id, name: id, nameEn: id, description: '升级授予的历史基线附属效果', descriptionEn: source, super: '', gaben: '',
    tags: [], values: Object.entries(fields).map(([k, n]) => `${k}: ${n}`), cooldowns: metadata.cooldown ?? [0], mana: metadata.mana ?? [0],
    categories: [`ABILITY: ${metadata.target ?? 'Point Target'}`], icon: '', passive: !!p.passive, ultimate: false,
    grantedOnly: true, historicalSource: { commit: '6abdd9d13de2f4330ca748082467b9ff6e6cd928', date: '2023-02-10', id: metadata.historicalId ?? id },
  });
  programs[id] = { ...p, remaining: [...p.remaining, source] };
}
function sweep(c: EffectContext, from: { x: number; y: number }, to: { x: number; y: number }, radius: number) {
  const dx = to.x - from.x, dy = to.y - from.y, l = dx * dx + dy * dy;
  return c.enemies().filter(t => { const q = l ? Math.max(0, Math.min(1, ((t.x - from.x) * dx + (t.y - from.y) * dy) / l)) : 0; return Math.hypot(t.x - from.x - q * dx, t.y - from.y - q * dy) <= radius; });
}
register('ancient_apparition_ice_vortex', { RADIUS: 300, DURATION: 14, SLOW: '16 / 19 / 22 / 25', 'MAGIC RESIST REDUCTION': '16 / 19 / 22 / 25' }, {
  cast: c => {
    const apply = (t: CombatUnit) => { c.status(t, 'slow', balanceNumber(c,'skill_effects_more_children.slow_duration.1',0.3), v(c, 'SLOW') / 100, H); c.status(t, 'magicResist', balanceNumber(c,'skill_effects_more_children.magicresist_duration.1',0.3), -v(c, 'MAGIC RESIST REDUCTION') / 100, H); };
    // Apply immediately so the parent Ice Blast impact benefits from its vortex.
    for (const t of c.enemies().filter(t => dist(t, c.target) <= v(c, 'RADIUS') / 100)) apply(t);
    c.zone({ x: c.target.x, y: c.target.y, radius: v(c, 'RADIUS') / 100, duration: v(c, 'DURATION'), interval: balanceNumber(c,'skill_effects_more_children.interval.1',0.2), effect: apply });
  }, implemented: ['stationary slowing vortex', 'negative magic resistance applied before parent impact'], remaining: ['Aura linger and resistance stacking require AA verification'],
}, { cooldown: [7, 6, 5, 4], mana: [40, 50, 60, 70] });

register('ancient_apparition_cold_feet', { 'DAMAGE PER SECOND': '30 / 50 / 70 / 90', 'BREAK DISTANCE': 715, 'STUN DURATION': '2 / 2.5 / 3 / 3.5', DURATION: 4 }, {
  cast: c => {
    const target = c.target, start = { x: target.x, y: target.y }, token = `${c.battle.time}:${target.taken}`, length = v(c, 'DURATION');
    c.status(target, 'coldFeet', length + balanceNumber(c,'skill_effects_more_children.coldfeet_duration.1',0.001), 0, { ...H, data: { token } });
    const marker = () => target.statuses.find(s => s.kind === 'coldFeet' && s.skill === c.skill.id && s.source === c.caster.id && (s as EffectStatus).data?.token === token);
    let elapsed = 0;
    const tick = () => {
      if (target.dead || !marker()) return;
      if (dist(target, start) > v(c, 'BREAK DISTANCE') / 100) { target.statuses = target.statuses.filter(s => s !== marker()); return; }
      elapsed += .1;
      if (Math.abs(elapsed - Math.round(elapsed)) < 1e-7) c.damage(target, v(c, 'DAMAGE PER SECOND'));
      if (elapsed >= length - 1e-8) { target.statuses = target.statuses.filter(s => s !== marker()); c.status(target, 'stun', v(c, 'STUN DURATION'), 0, { ...H, dispel: 'strong' }); }
      else c.delay(balanceNumber(c,'skill_effects_more_children.delay.1',0.1), tick);
    }; c.delay(balanceNumber(c,'skill_effects_more_children.delay.2',0.1), tick);
  }, implemented: ['dispellable anchored cold-feet debuff', 'break on distance from initial cast point', 'one-second damage ticks and delayed stun'], remaining: ['Status resistance treatment of pre-freeze timer requires AA verification'],
}, { target: 'Unit Target', cooldown: [12, 11, 10, 9], mana: [125] });

register('jakiro_macropyre', { DAMAGE: '110 / 155 / 200', RANGE: 1400, RADIUS: 260, DURATION: 10, 'BURN INTERVAL': .5, 'LINGER DURATION': 2 }, {
  cast: c => {
    const start = { x: c.caster.x, y: c.caster.y }, d = dist(start, c.target) || 1, length = v(c, 'RANGE') / 100;
    const end = { x: start.x + (c.target.x - start.x) / d * length, y: start.y + (c.target.y - start.y) / d * length };
    c.zone({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, radius: length / balanceNumber(c,'skill_effects_more_children.radius.1',2) + v(c, 'RADIUS') / 100, duration: v(c, 'DURATION'), interval: balanceNumber(c,'skill_effects_more_children.interval.1',0.1), effect: t => {
      if (sweep(c, start, end, v(c, 'RADIUS') / 100).includes(t)) c.status(t, 'dot', v(c, 'LINGER DURATION'), v(c, 'DAMAGE'), { ...H, interval: v(c, 'BURN INTERVAL'), damageType: 'magical' });
    } });
  }, implemented: ['persistent line fire', 'lingering magical burn', 'native three-level damage selection'], remaining: ['Flame propagation timing and exact line orientation require AA verification'],
}, { cooldown: [80, 70, 60], mana: [220, 330, 440] });

register('aa_granted_fire_spirits_debuff', { DURATION: 4, 'ATTACK SPEED SLOW': '-80 / -100 / -120 / -140', 'DAMAGE PER SECOND': '20 / 40 / 60 / 80' }, {
  cast: c => { c.status(c.target, 'attackSpeed', v(c, 'DURATION'), v(c, 'ATTACK SPEED SLOW'), H); c.status(c.target, 'dot', v(c, 'DURATION'), v(c, 'DAMAGE PER SECOND'), { ...H, interval: balanceNumber(c,'skill_effects_more_children.interval.1',1), damageType: 'magical' }); },
  implemented: ['Fire Spirits impact debuff only', 'four native levels', 'attack speed slow and burn'], remaining: ['Granted debuff deliberately excludes standalone spirit creation, health cost and launch controls'],
}, { historicalId: 'phoenix_fire_spirits', target: 'Unit Target' });

register('riki_smoke_screen', { RADIUS: 375, DURATION: 6, 'MISS RATE': '30 / 45 / 60 / 75' }, {
  cast: c => c.zone({ x: c.target.x, y: c.target.y, radius: v(c, 'RADIUS') / 100, duration: v(c, 'DURATION'), interval: balanceNumber(c,'skill_effects_more_children.interval.1',0.1), effect: t => { c.status(t, 'silence', balanceNumber(c,'skill_effects_more_children.silence_duration.1',0.2), 0, { ...H, dispel: 'none' }); c.status(t, 'blind', balanceNumber(c,'skill_effects_more_children.blind_duration.1',0.2), v(c, 'MISS RATE') / 100, { ...H, dispel: 'none' }); } }),
  implemented: ['stationary silence and attack-miss cloud', 'four native miss-chance levels', 'parent duration override'], remaining: ['Aura linger interval requires reference verification'],
}, { cooldown: [20, 17, 14, 11], mana: [65, 70, 75, 80] });

register('hoodwink_hunters_boomerang', { SPEED: 900, RADIUS: 150, DAMAGE: 200, 'MARK DURATION': 7, SLOW: 20, 'SPELL AMP': 20, SPREAD: 400, 'MIN THROW DURATION': .5, 'MAX THROW DURATION': 1.2 }, {
  cast: c => {
    const start = { x: c.caster.x, y: c.caster.y }, end = { x: c.target.x, y: c.target.y }, length = dist(start, end), dx = (end.x - start.x) / (length || 1), dy = (end.y - start.y) / (length || 1);
    const duration = Math.max(v(c, 'MIN THROW DURATION'), Math.min(v(c, 'MAX THROW DURATION'), length / (v(c, 'SPEED') / 100))), hit = new Set<string>(); let last = start, elapsed = 0;
    const tick = () => {
      elapsed += MOTION_STEP; const progress = Math.min(1, elapsed / (duration * 2)), along = progress < .5 ? progress * 2 : 2 - progress * 2, lateral = Math.sin(progress * Math.PI * 2) * v(c, 'SPREAD') / 100;
      const next = { x: start.x + dx * length * along - dy * lateral, y: start.y + dy * length * along + dx * lateral };
      for (const t of sweep(c, last, next, v(c, 'RADIUS') / 100)) if (!hit.has(t.id)) { hit.add(t.id); c.damage(t, v(c, 'DAMAGE')); c.status(t, 'huntersMark', v(c, 'MARK DURATION'), 0, H); c.status(t, 'slow', v(c, 'MARK DURATION'), v(c, 'SLOW') / 100, H); c.status(t, 'magicVulnerability', v(c, 'MARK DURATION'), v(c, 'SPELL AMP') / 100, H); }
      last = next; if (progress < 1) c.delay(MOTION_STEP, tick);
    }; c.delay(MOTION_STEP, tick);
  }, implemented: ['outward-and-return curved swept projectile', 'single damage and timed mark per victim', 'movement slow and magical damage vulnerability'], remaining: ['Exact curve, moving-caster return and spell-only amplification semantics require AA verification'],
}, { cooldown: [18], mana: [125] });

register('aa_granted_greater_bash', { DAMAGE: '15 / 20 / 25 / 30', DURATION: '.9 / 1.2 / 1.5 / 1.8', 'KNOCKBACK DISTANCE': '143 / 152 / 158 / 162', 'KNOCKBACK DURATION': .5, 'BONUS MOVEMENT SPEED': 17, 'SPEED DURATION': 3, 'CHARGE SPEED': 0 }, {
  cast: c => {
    const speed = v(c, 'CHARGE SPEED') || c.movementSpeed(c.caster) * 100, d = dist(c.caster, c.target) || 1;
    c.damage(c.target, speed * v(c, 'DAMAGE') / 100, 'magical', true); c.status(c.target, 'stun', v(c, 'DURATION'), 0, { ...H, dispel: 'strong', piercesImmunity: true });
    const start = { x: c.target.x, y: c.target.y }, direction = { x: (c.target.x - c.caster.x) / d, y: (c.target.y - c.caster.y) / d }, duration = v(c, 'KNOCKBACK DURATION');
    const token = Number(c.target.greaterBashMotionToken ?? 0) + 1; c.target.greaterBashMotionToken = token;
    c.status(c.target, 'phased', duration, 0, { dispel: 'none' }); let elapsed = 0;
    const move = () => { if (c.target.dead || c.target.greaterBashMotionToken !== token) return; elapsed = Math.min(duration, elapsed + MOTION_STEP); const amount = v(c, 'KNOCKBACK DISTANCE') / 100 * elapsed / duration; c.moveContinuous(c.target,start.x + direction.x * amount,start.y + direction.y * amount,{duration:1/30}); if (elapsed < duration - 1e-8) c.delay(MOTION_STEP, move); }; c.delay(MOTION_STEP, move);
    c.status(c.caster, 'haste', v(c, 'SPEED DURATION'), v(c, 'BONUS MOVEMENT SPEED') / 100);
  }, implemented: ['forced Greater Bash proc', 'core-effective-movement-speed-scaled piercing damage and disable', 'half-second continuous historical knockback and movement buff'], remaining: ['Overlapping forced movement replaces earlier Greater Bash motion; vertical arc and status-resistance influence require reference validation'],
}, { historicalId: 'spirit_breaker_greater_bash', target: 'Unit Target', cooldown: [1.5] });

register('aa_granted_meteor_hammer', { 'LAND TIME': .5, RADIUS: 400, 'IMPACT DAMAGE': 150, 'STUN DURATION': 1.25, 'BURN DAMAGE': 60, 'BURN DURATION': 6 }, {
  cast: c => { const center = { x: c.target.x, y: c.target.y }; c.delay(v(c, 'LAND TIME'), () => { for (const t of c.enemies().filter(t => dist(t, center) <= v(c, 'RADIUS') / 100)) { c.damage(t, v(c, 'IMPACT DAMAGE')); c.status(t, 'stun', v(c, 'STUN DURATION'), 0, { ...H, dispel: 'strong' }); c.status(t, 'dot', v(c, 'BURN DURATION'), v(c, 'BURN DAMAGE'), { ...H, interval: balanceNumber(c,'skill_effects_more_children.interval.1',1), damageType: 'magical' }); } }); },
  implemented: ['granted meteor drop without standalone item channel', 'delayed area impact, stun and burn'], remaining: ['Dive selects drop positions; AA item-version correspondence unverified'],
}, { historicalId: 'item_meteor_hammer' });

register('aa_granted_solar_crest', { ARMOR: 6, 'MOVEMENT SPEED': 10, 'ATTACK SPEED': 50, DURATION: 12 }, {
  cast: c => {
    const ally = c.target.side === c.caster.side, sign = ally ? 1 : -1, options = { harmful: !ally };
    c.status(c.target, 'armor', v(c, 'DURATION'), sign * v(c, 'ARMOR'), options); c.status(c.target, 'attackSpeed', v(c, 'DURATION'), sign * v(c, 'ATTACK SPEED'), options);
    c.status(c.target, ally ? 'haste' : 'slow', v(c, 'DURATION'), v(c, 'MOVEMENT SPEED') / 100, options);
  }, implemented: ['ally armor/attack/movement bonuses or matching enemy penalties'], remaining: ['Granted active effect excludes item inventory stats and owner armor sacrifice'],
}, { historicalId: 'item_solar_crest', target: 'Unit Target', cooldown: [12] });

register('aa_granted_bloodthorn', { DURATION: 5, 'DELAYED DAMAGE PERCENT': 30, 'TARGET CRITICAL MULTIPLIER': 130 }, {
  cast: c => {
    const target = c.target, token = `${c.battle.time}:${target.taken}`, startDamage = target.taken, length = v(c, 'DURATION');
    for (const [kind, amount] of [['bloodthorn', 0], ['silence', 0], ['targetTrueStrike', 1], ['targetCritMultiplier', v(c, 'TARGET CRITICAL MULTIPLIER') / 100]] as const) c.status(target, kind, length, amount, { ...H, data: { token } });
    const marker = target.statuses.find(s => s.kind === 'bloodthorn' && s.skill === c.skill.id && s.source === c.caster.id) as EffectStatus | undefined; if (!marker || marker.data?.token !== token) return;
    const expires = marker.until;
    const tick = () => {
      if (target.dead) return;
      const current = target.statuses.find(s => s.kind === 'bloodthorn' && s.skill === c.skill.id && s.source === c.caster.id) as EffectStatus | undefined;
      if (current && current.data?.token !== token) return;
      if (!current || c.battle.time >= expires - 1e-8) {
        target.statuses = target.statuses.filter(s => !(s.skill === c.skill.id && s.source === c.caster.id && (s as EffectStatus).data?.token === token));
        c.damage(target, Math.max(0, target.taken - startDamage) * v(c, 'DELAYED DAMAGE PERCENT') / 100);
      } else c.delay(balanceNumber(c,'skill_effects_more_children.delay.1',0.05), tick);
    }; c.delay(balanceNumber(c,'skill_effects_more_children.delay.2',0.05), tick);
  }, implemented: ['dispellable silence', 'target true strike and critical multiplier', 'damage ledger released on expiry or dispel'], remaining: ['Historical Bloodthorn KV has multiple duration/unused upgrade fields; silence_duration 5 selected', 'Refresh and simultaneous-caster ledger semantics require AA verification'],
}, { historicalId: 'item_bloodthorn', target: 'Unit Target', cooldown: [15], mana: [100] });

register('aa_granted_voodoo_switcheroo', { DURATION: 3, 'ATTACK SPEED REDUCTION': 30, 'ATTACK DAMAGE': 0, 'ATTACK RANGE': 700 }, {
  cast: c => {
    const duration = v(c, 'DURATION');
    c.status(c.caster, 'banished', duration, 0, { dispel: 'none' });
    c.status(c.caster, 'visualForm', duration, 0, { dispel: 'none', data: { form: 'voodoo_switcheroo', hidden: true } });
    const wards = c.summon({ name: '巫毒守卫', count: balanceNumber(c,'skill_effects_more_children.count.1',1), hp: balanceNumber(c,'skill_effects_more_children.hp.1',1), attack: v(c, 'ATTACK DAMAGE'), range: v(c, 'ATTACK RANGE') / 100, interval: balanceNumber(c,'skill_effects_more_children.interval.1',0.22) / (balanceNumber(c,'skill_effects_more_children.interval.2',1) - v(c, 'ATTACK SPEED REDUCTION') / 100), speed: 0, lifetime: duration });
    for (const ward of wards) { c.warp(ward,c.caster.x,c.caster.y); c.status(ward, 'invulnerable', duration, 0, { dispel: 'none' }); if ((c.originPoints ?? 0) >= 9) { c.status(ward, 'trueStrike', duration); ward.skills = [{ id: 'custom_witch_doctor_death_ward', points: c.originPoints! }]; } }
  }, implemented: ['three-second caster-to-ward replacement', 'untargetable caster', 'historical 30% attack-speed penalty', 'parent AA damage/range overrides and Gaben bounce inheritance'], remaining: ['Replacement ward appearance', 'Automatic activation policy belongs to the parent skill'],
}, { historicalId: 'witch_doctor_voodoo_switcheroo', target: 'No Target', cooldown: [40], mana: [150] });

register('aa_granted_gobble_up', { 'PROJECTILE SPEED': 1400, 'MIN FLIGHT': .1, 'MAX FLIGHT': 2, RADIUS: 400, 'STUN DURATION': 1.5, 'BURN DAMAGE': 100, 'BURN DURATION': 3, SLOW: 25, 'IMPACT DAMAGE': 0 }, {
  cast: c => {
    const ally = c.target, enemy = c.enemies().filter(t => dist(t, c.caster) <= 30).sort((a, b) => dist(b, c.caster) - dist(a, c.caster))[0]; if (!enemy || ally.id === c.caster.id) return;
    const destination = { x: enemy.x, y: enemy.y }, start = { x: c.caster.x, y: c.caster.y }, travel = Math.max(v(c, 'MIN FLIGHT'), Math.min(v(c, 'MAX FLIGHT'), dist(start, destination) / (v(c, 'PROJECTILE SPEED') / 100))), duration = travel + .3;
    let launched = false, released = false;
    const release = () => { released = true; ally.statuses = ally.statuses.filter(s => !(s.source === c.caster.id && s.skill === c.skill.id && ['banished', 'visualForm'].includes(s.kind))); };
    c.status(ally, 'banished', duration + balanceNumber(c,'skill_effects_more_children.banished_duration.1',0.1), 0, { dispel: 'none' }); c.status(ally, 'visualForm', duration + balanceNumber(c,'skill_effects_more_children.visualform_duration.1',0.1), 0, { dispel: 'none', data: { form: 'gobble_up', passenger: true, leader: c.caster.id } });
    c.warp(ally,start.x,start.y);
    const holding = () => {
      if (released || launched) return;
      if (ally.dead) { release(); return; }
      c.warp(ally,c.caster.x,c.caster.y);
      if (c.caster.dead) { release(); return; }
      c.delay(MOTION_STEP, holding);
    }; c.delay(MOTION_STEP, holding);
    c.delay(balanceNumber(c,'skill_effects_more_children.delay.1',0.3), () => {
      if (released) return;
      if (c.caster.dead || ally.dead) { release(); return; }
      launched = true; start.x = c.caster.x; start.y = c.caster.y;
      const visual = addVisualProjectile(c.battle, { source: c.caster.id, skill: c.skill.id, artSkill: 'custom_snapfire_mortimer_kisses', points: c.originPoints ?? c.skill.points, layer: 'projectile', role: 'projectile', ...start, angle: Math.atan2(destination.y - start.y, destination.x - start.x), until: c.battle.time + travel + MOTION_STEP });
      let elapsed = 0; const tick = () => {
        if (ally.dead) { removeVisualProjectile(c.battle, visual); return; }
        elapsed += MOTION_STEP; const progress = Math.min(1, elapsed / travel); c.moveContinuous(ally,start.x + (destination.x - start.x) * progress,start.y + (destination.y - start.y) * progress,{duration:1/30});
        moveVisualProjectile(c.battle, visual, ally);
        if (progress < 1) { c.delay(MOTION_STEP, tick); return; }
        removeVisualProjectile(c.battle, visual);
        release();
        if (ally.summoned && !ally.illusion && !ally.consideredHero) c.execute(ally);
        for (const t of c.enemies().filter(t => dist(t, destination) <= v(c, 'RADIUS') / 100)) { c.damage(t, v(c, 'IMPACT DAMAGE')); c.status(t, 'stun', v(c, 'STUN DURATION'), 0, { ...H, dispel: 'strong' }); }
        c.zone({ x: destination.x, y: destination.y, radius: v(c, 'RADIUS') / 100, duration: v(c, 'BURN DURATION'), interval: balanceNumber(c,'skill_effects_more_children.interval.1',0.5), effect: t => { c.status(t, 'dot', balanceNumber(c,'skill_effects_more_children.dot_duration.1',1), v(c, 'BURN DAMAGE'), { ...H, interval: balanceNumber(c,'skill_effects_more_children.interval.2',0.5), damageType: 'magical' }); c.status(t, 'slow', balanceNumber(c,'skill_effects_more_children.slow_duration.1',1), v(c, 'SLOW') / 100, H); } });
      }; c.delay(MOTION_STEP, tick);
    });
  }, implemented: ['ally or ordinary-creep swallow with temporary untargetability', 'held passenger follows caster and is released promptly on pre-launch caster death', 'automatic spit and continuous passenger travel', 'swallowed ordinary creep dies at impact', 'area impact/stun and lingering firespit'], remaining: ['Automatic 0.3-second spit is project AI choice within historical three-second holding limit', 'Parent supplies AA Mortimer impact damage because historical spit-creep KV omits impact value', 'Ordinary non-ancient creep fallback and release alive without impact when caster dies before launch are explicit eligibility/interruption policies', 'No creep bounty payment exists in the project round-income economy'],
}, { historicalId: 'snapfire_gobble_up / snapfire_spit_creep', target: 'Unit Target', cooldown: [40], mana: [120] });

register('aa_granted_throwable_flamethrower', { DAMAGE: 80, DURATION: 8, WIDTH: 275, LENGTH: 400, SLOW: 30, 'LINGER DURATION': 2 }, {
  cast: c => {
    const ally = c.target; c.status(ally, 'flamethrower', v(c, 'DURATION'), 0, { dispel: 'none' });
    let elapsed = 0; const tick = () => {
      if (ally.dead || !ally.statuses.some(s => s.kind === 'flamethrower' && s.source === c.caster.id)) return;
      const facing = ally.facing, end = { x: ally.x + Math.cos(facing) * v(c, 'LENGTH') / 100, y: ally.y + Math.sin(facing) * v(c, 'LENGTH') / 100 };
      for (const target of sweep(c, ally, end, v(c, 'WIDTH') / 100 / 2)) {
        const forward = (target.x - ally.x) * Math.cos(facing) + (target.y - ally.y) * Math.sin(facing); if (forward < 0) continue;
        c.status(target, 'dot', v(c, 'LINGER DURATION'), v(c, 'DAMAGE'), { ...H, interval: balanceNumber(c,'skill_effects_more_children.interval.1',0.2), damageType: 'magical' }); c.status(target, 'slow', v(c, 'LINGER DURATION'), v(c, 'SLOW') / 100, H);
      }
      elapsed += .1; if (elapsed < v(c, 'DURATION') - 1e-8) c.delay(balanceNumber(c,'skill_effects_more_children.delay.1',0.1), tick);
    }; tick();
  }, implemented: ['transferable ally-following frontal flame buff', 'lingering magical burn and slow'], remaining: ['AA calls this buffed without numbers; historical 80 DPS baseline is used rather than inventing an amplification', 'Throw flight/range and ally facing policy require AA reference'],
}, { historicalId: 'shredder_flamethrower', target: 'Unit Target', cooldown: [20], mana: [100] });

register('aa_granted_tidal_wave', { SPEED: 700, RADIUS: 750, DAMAGE: 250, DURATION: 1.25, 'KNOCKBACK DISTANCE': 600 }, {
  cast: c => {
    const origin = { x: c.target.x, y: c.target.y }, sign = c.caster.side === 0 ? 1 : -1, seen = new Set<string>(); let elapsed = 0, previous = origin;
    const visual = addVisualProjectile(c.battle, { source: c.caster.id, skill: c.skill.id, artSkill: 'kunkka_ghostship', points: c.originPoints ?? c.skill.points, layer: 'tidal_wave', role: 'projectile_wave', ...origin, angle: sign * Math.PI / 2, until: c.battle.time + v(c, 'DURATION') + MOTION_STEP });
    const tick = () => {
      elapsed = Math.min(v(c, 'DURATION'), elapsed + MOTION_STEP); const next = { x: origin.x, y: origin.y + sign * v(c, 'SPEED') / 100 * elapsed };
      moveVisualProjectile(c.battle, visual, next);
      for (const target of sweep(c, previous, next, v(c, 'RADIUS') / 100)) if (!seen.has(target.id) && !target.statuses.some(s => ['magicImmune', 'invulnerable', 'banished'].includes(s.kind))) {
        seen.add(target.id); c.damage(target, v(c, 'DAMAGE')); const start = { x: target.x, y: target.y }, duration = v(c, 'DURATION');
        c.status(target, 'root', duration, 0, { ...H, dispel: 'none' }); c.status(target, 'disarm', duration, 0, { ...H, dispel: 'none' }); c.status(target, 'phased', duration, 0, { dispel: 'none' });
        let moved = 0; const push = () => { if (target.dead) return; moved += MOTION_STEP; c.moveContinuous(target,start.x,start.y + sign * v(c, 'KNOCKBACK DISTANCE') / 100 * Math.min(1, moved / duration),{duration:1/30}); if (moved < duration - 1e-8) c.delay(MOTION_STEP, push); }; c.delay(MOTION_STEP, push);
      }
      previous = next; if (elapsed < v(c, 'DURATION') - 1e-8) c.delay(MOTION_STEP, tick); else removeVisualProjectile(c.battle, visual);
    }; c.delay(MOTION_STEP, tick);
  }, implemented: ['crash-position wave toward the enemy side', 'one damage hit per victim', 'continuous enemy displacement with unit phasing'], remaining: ['Historical radius 750 treated as swept radius, knockback geometry and action restrictions need AA verification'],
}, { historicalId: 'kunkka_tidal_wave', cooldown: [12], mana: [75] });

export const MORE_CHILD_DEFINITIONS = definitions;
export const MORE_CHILD_PROGRAMS = programs;
