import {skillBalance} from '../config';
import {configuredValue} from '../config';
import type { CombatUnit } from '../model';
import type { EffectContext as C, EffectStatus, SkillProgram } from '../skill-effects';
import { historicalValue as historical } from './historical-upgrades';
import { addVisualWorldEffect, updateVisualWorldEffect, removeVisualWorldEffect } from './visual-state';

const S = (c: C) => c.skill.points >= 6, G = (c: C) => c.skill.points >= 9;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
function value(c: C, key: string, fallback = 0): number {
  const configured=configuredValue(c,key);if(configured!==undefined)return configured;
  const row = c.definition.values.filter(v => v.split(':')[0].trim().toUpperCase() === key.toUpperCase()).at(-1);
  const values = row?.slice(row.indexOf(':') + 1).match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return values[Math.min(values.length - 1, Math.max(0, Math.min(2, c.skill.points - 1)))] ?? fallback;
}
const hero = (unit: CombatUnit) => !unit.summoned || !!unit.illusion || !!unit.consideredHero;
const pointOnSegment = (unit: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, radius: number) => {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const p = length ? Math.max(0, Math.min(1, ((unit.x - a.x) * dx + (unit.y - a.y) * dy) / length)) : 0;
  return Math.hypot(unit.x - a.x - p * dx, unit.y - a.y - p * dy) <= radius;
};

/** Final overrides are deliberately applied after main upgrades and granted
 * child registration. Captured AA wording wins; historical numbers remain a
 * disclosed 2023-02-10 candidate, not a claim about the unknown AA build. */
export function applyMainGapOverrides(registry: Record<string, SkillProgram>): void {
  const frost = registry.custom_lich_chain_frost, frostCast = frost.cast;
  if (frostCast) frost.cast = c => frostCast({ ...c, summon: options => {
    const units = c.summon(options);
    // The Ice Spire is a real non-hero entity, not the holder's hero skin.
    if (options.name === '冰柱') for (const unit of units) unit.visualBody = 'spire';
    return units;
  } });
  const ravage = registry.custom_tidehunter_ravage;
  ravage.cast = c => {
    const origin = { x: c.caster.x, y: c.caster.y }, maximum = value(c, 'RADIUS') / 100 + (G(c) ? 6 : 0), speed = historical('tidehunter_ravage', 'speed') / 100;
    let radius = 0, inward = false, previous = new Map<string, number>(), hit = new Set<string>();
    for (const unit of c.enemies()) previous.set(unit.id, distance(unit, origin));
    const step = 1 / 30;
    const makeWave = (returning: boolean) => addVisualWorldEffect(c.battle, { source: c.caster.id, skill: c.skill.id, points: c.skill.points, layer: returning ? 'return' : 'eruption', role: 'world_event', kind: 'ring', ...origin, radius: returning ? maximum : 0, previousRadius: returning ? maximum : 0, maxRadius: maximum, halfWidth: .4, phase: returning ? 'inward' : 'outward', progress: 0, until: c.battle.time + .1 });
    let visual = makeWave(false);
    const expand = () => {
      const next = inward ? Math.max(0, radius - speed * step) : Math.min(maximum, radius + speed * step);
      updateVisualWorldEffect(c.battle, visual, { previousRadius: radius, radius: next, progress: inward ? 1 - next / maximum : next / maximum, until: c.battle.time + .1 });
      for (const unit of c.enemies()) {
        const currentDistance = distance(unit, origin), priorDistance = previous.get(unit.id) ?? currentDistance;
        const before = priorDistance - radius, after = currentDistance - next;
        if (!hit.has(unit.id) && Math.min(before, after) <= .4 && Math.max(before, after) >= -.4) {
          hit.add(unit.id); c.damage(unit, value(c, 'DAMAGE'));
          c.status(unit, 'stun', value(c, 'DURATION') + (S(c) ? 1 : 0), 0, { harmful: true, dispel: 'strong' });
        }
        previous.set(unit.id, currentDistance);
      }
      radius = next;
      if (!inward && radius >= maximum - 1e-8) {
        removeVisualWorldEffect(c.battle, visual);
        if (!G(c)) return;
        inward = true; hit = new Set(); previous = new Map(c.enemies().map(unit => [unit.id, distance(unit, origin)]));
        visual = makeWave(true);
      } else if (inward && radius <= 1e-8) { removeVisualWorldEffect(c.battle, visual); return; }
      c.delay(step, expand);
    };
    c.delay(step, expand);
  };
  ravage.implemented = [...ravage.implemented.filter(s => !s.includes('Historical-speed outward wave')), 'Dynamic outward annular sweep catches moving entrants; independent inward hit set at Gaben', 'Wave persists after caster death and uses pinned historical 725 speed'];
  ravage.remaining = ['Wave/hull contact uses the shared 40-unit body radius; exact visual and vertical-toss timing need AA comparison', 'Return wave deals the same AA damage as outward wave by existing working interpretation'];

  const soulbind = registry.custom_grimstroke_soul_bind;
  soulbind.targetSelector = (c, candidates) => candidates.filter(hero).sort((a, b) => distance(a, c.caster) - distance(b, c.caster) || a.id.localeCompare(b.id))[0];
  soulbind.canCast = c => hero(c.target);
  soulbind.cast = c => {
    const anchor = c.target, radius = value(c, 'BIND RADIUS') / 100, breakDistance = 7, maximum = G(c) ? 3 : 2;
    const token = `${c.caster.id}:${c.skill.id}:${c.battle.time}`;
    c.status(anchor, 'soulbindAnchor', value(c, 'DURATION'), 0, { harmful: true, dispel: 'none', piercesImmunity: true, data: { token } });
    const marker = (anchor.statuses as EffectStatus[]).find(s => s.kind === 'soulbindAnchor' && s.source === c.caster.id && s.data?.token === token);
    if (!marker) return;
    const expires = marker.until; let members: CombatUnit[] = [anchor];
    const own = (status: EffectStatus) => status.skill === c.skill.id && status.source === c.caster.id && status.data?.token === token;
    const remove = (unit: CombatUnit) => { unit.statuses = (unit.statuses as EffectStatus[]).filter(s => !own(s)); };
    const update = () => {
      if (anchor.dead || expires <= c.battle.time + 1e-8 || !(anchor.statuses as EffectStatus[]).some(s => own(s) && s.kind === 'soulbindAnchor')) { for (const unit of members) remove(unit); return; }
      const survivors = members.filter(unit => unit.id === anchor.id || (!unit.dead && distance(unit, anchor) <= breakDistance));
      for (const unit of members) if (!survivors.includes(unit)) remove(unit);
      members = survivors;
      const choices = c.enemies().filter(unit => hero(unit) && !members.includes(unit) && distance(unit, anchor) <= radius).sort((a, b) => distance(a, anchor) - distance(b, anchor) || a.id.localeCompare(b.id));
      members.push(...choices.slice(0, maximum - members.length));
      const group = members.length > 1 ? members.map(unit => unit.id).join(',') : '';
      for (const unit of members) {
        const old = (unit.statuses as EffectStatus[]).find(s => own(s) && s.kind === 'soulbind');
        if (!group) { unit.statuses = (unit.statuses as EffectStatus[]).filter(s => !(own(s) && s.kind === 'soulbind')); continue; }
        const data = { token, group, anchorId: anchor.id, partnerId: members.find(other => other.id !== unit.id)!.id, radius };
        if (old) old.data = data;
        else {
          c.status(unit, 'soulbind', expires - c.battle.time, 0, { harmful: true, dispel: 'none', piercesImmunity: true, data });
          const status = (unit.statuses as EffectStatus[]).find(s => own(s) && s.kind === 'soulbind');
          // All replacements inherit the original anchor's remaining timer.
          if (status) status.until = expires;
        }
      }
      c.delay(1 / 30, update);
    };
    update();
  };
  soulbind.implemented = [...soulbind.implemented, 'Persistent initial hero anchor reacquires nearest valid partners after death or forced range break', 'Unpaired initial target may bind a later entrant; replacement links share original expiry', 'Gaben independently replaces missing members of its three-hero group'];
  soulbind.remaining = ['Historical 700 forced-break distance; AA binds within captured 600 radius', 'Primary target status resistance governs common group expiry; per-member resistance needs reference matching', 'Initial-target death ends this bind; Gaben star-group and same-tick duplicate-spell order need reference comparison', 'Primary channel controls copied stream lifetime; secondary termination does not end original, exact original target-death/Linken semantics await reference'];

  const dagger = registry.spectre_spectral_dagger;
  dagger.cast = c => {
    const h = (key: string) => historical('spectre_spectral_dagger', key, Math.max(1, Math.min(4, Math.floor(c.skill.points))));
    type Path = { id: string; source: string; skill: string; from: { x: number; y: number }; to: { x: number; y: number }; createdAt: number; until: number };
    const paths: Path[] = [], hit = new Set<string>(), marked = new Map<string, { unit: CombatUnit; until: number; previous: { x: number; y: number } }>();
    const token = `${c.caster.id}:${c.battle.time}`, interval = 1 / 30;
    let position = { x: c.caster.x, y: c.caster.y }, flying = true, sequence = 0;
    const addPath = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const same = distance(from, to) < 1e-8 ? paths.find(path => distance(path.from, from) < 1e-8 && distance(path.to, to) < 1e-8) : undefined;
      if (same) same.until = c.battle.time + h('dagger_path_duration');
      else {
        const path: Path = { id: `shadow:${token}:${sequence++}`, source: c.caster.id, skill: c.skill.id, from, to, createdAt: c.battle.time, until: c.battle.time + h('dagger_path_duration') };
        paths.push(path); c.battle.shadowPaths = [...((c.battle.shadowPaths ?? []) as Path[]), path];
      }
    };
    const strike = (unit: CombatUnit) => {
      if (hit.has(unit.id)) return;
      hit.add(unit.id); c.damage(unit, h('damage'), 'magical', true);
      if (!unit.dead) {
        c.status(unit, 'spectralDaggerTrail', h('hero_path_duration'), 0, { harmful: true, piercesImmunity: true, data: { token } });
        c.status(unit, 'slow', h('hero_path_duration'), h('bonus_movespeed') / 100, { harmful: true, piercesImmunity: true });
        marked.set(unit.id, { unit, until: c.battle.time + h('hero_path_duration'), previous: { x: unit.x, y: unit.y } });
      }
    };
    addPath(position, position);
    const pulse = () => {
      if (flying) {
        const gap = distance(position, c.target), step = Math.min(gap, h('speed') / 100 * interval), scale = gap ? step / gap : 0;
        const next = { x: position.x + (c.target.x - position.x) * scale, y: position.y + (c.target.y - position.y) * scale };
        addPath(position, next);
        for (const enemy of c.enemies()) if (pointOnSegment(enemy, position, next, h('dagger_radius') / 100 + .4)) strike(enemy);
        position = next; if (gap <= step + .4 || c.target.dead) flying = false;
      }
      for (const [id, entry] of marked) {
        const current = { x: entry.unit.x, y: entry.unit.y };
        if (entry.unit.dead || entry.until <= c.battle.time || !(entry.unit.statuses as EffectStatus[]).some(s => s.kind === 'spectralDaggerTrail' && s.source === c.caster.id && s.data?.token === token)) { marked.delete(id); continue; }
        addPath(entry.previous, current); entry.previous = current;
      }
      for (let i = paths.length - 1; i >= 0; i--) if (paths[i].until <= c.battle.time) paths.splice(i, 1);
      c.battle.shadowPaths = ((c.battle.shadowPaths ?? []) as Path[]).filter(path => path.until > c.battle.time);
      const onPath = (unit: CombatUnit) => paths.some(path => pointOnSegment(unit, path.from, path.to, h('path_radius') / 100));
      for (const enemy of c.enemies()) if (onPath(enemy)) c.status(enemy, 'slow', h('buff_persistence'), h('bonus_movespeed') / 100, { harmful: true, piercesImmunity: true });
      if (!c.caster.dead && onPath(c.caster)) { c.status(c.caster, 'haste', h('buff_persistence'), h('bonus_movespeed') / 100); c.status(c.caster, 'freePathing', h('dagger_grace_period')); }
      if (flying || paths.length || marked.size) c.delay(interval, pulse);
    };
    c.delay(interval, pulse);
  };
  dagger.implemented = ['Homing dagger sweeps all crossed enemies once and persists after caster death', 'Twelve-second ground path and seven-second victim trails slow later crossing enemies', 'Caster gains path-local speed and free pathing with one-second off-path grace'];
  dagger.remaining = ['Pinned 2023-02-10 candidate: 800 speed, 125 dagger radius, 175 path radius, four-second slow/speed linger', 'Only the projectile deals direct damage; later ground crossing refreshes slow as an explicit working policy', 'Native conditional Desolate requires a separate learned/passive-level mapping absent from this AA granted context'];

  const dispersion = registry.custom_spectre_dispersion;
  dispersion.onDamage = c => {
    const reflected = (value(c, 'DAMAGE REFLECTED') + (skillBalance(c.definition,c.skill.points)?0:S(c)?5:0)) / 100, raw = (c.amount ?? 0) / Math.max(.01, 1 - reflected);
    const min = value(c, 'MIN RADIUS') / 100, max = value(c, 'MAX RADIUS') / 100;
    for (const target of c.enemies().filter(unit => distance(unit, c.caster) <= max)) c.damage(target, raw * reflected * Math.max(0, 1 - Math.max(0, distance(target, c.caster) - min) / Math.max(.01, max - min)), c.damageType);
    if (!S(c)) return;
    c.caster.dispersionReceived = Number(c.caster.dispersionReceived ?? 0) + (c.amount ?? 0);
    if (Number(c.caster.dispersionReceived) < 300 || Number(c.caster.dispersionDaggerReady ?? 0) > c.battle.time) return;
    const candidates = c.enemies().sort((a, b) => a.id.localeCompare(b.id));
    if (!candidates.length) return;
    const target = candidates[Math.floor(c.random() * candidates.length)];
    c.caster.dispersionReceived = Number(c.caster.dispersionReceived) - 300; c.caster.dispersionDaggerReady = c.battle.time + (G(c) ? 1 : 7);
    c.castAbility('spectre_spectral_dagger', 4, target);
  };
  dispersion.implemented.push('AA passive Spectral Dagger chooses a seeded random living enemy rather than always retaliating against the attacker', 'Granted dagger now creates traversable ground and victim trails');
  dispersion.remaining = ['Reflection reconstructs pre-Dispersion damage only; overlapping reductions require exact ordering validation', 'Granted Spectral Dagger level four uses disclosed historical candidate values', ...dagger.remaining];
}
