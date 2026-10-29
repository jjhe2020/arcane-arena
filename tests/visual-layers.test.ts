import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { selectVisualLayers, tierVisualLayers, visualRoleEvidence, type VisualSkillArt } from '../src/visual-layers';

const assets = JSON.parse(readFileSync('public/data/assets.json', 'utf8')) as { skills: Record<string, VisualSkillArt> };
const art = (id: string) => assets.skills[id];
const selected = (id: string, evidence: Parameters<typeof selectVisualLayers>[2], points = 9) => selectVisualLayers(art(id), points, evidence).map(layer => layer.id);

describe('actual runtime art role vocabulary', () => {
  it('accounts for every imported layer without pretending classification is runtime coverage', () => {
    const layers = Object.entries(assets.skills).flatMap(([skill, spec]) => Object.entries(spec.layers ?? {}).map(([id, clip]) => ({ skill, id, clip })));
    expect(layers.length).toBeGreaterThanOrEqual(1218);
    expect(layers.filter(layer => visualRoleEvidence(layer.clip.role) === 'unbound').map(layer => `${layer.skill}/${layer.id}:${String(layer.clip.role)}`)).toEqual([]);
    expect(visualRoleEvidence('new_unreviewed_role')).toBe('unbound');
    expect(selectVisualLayers({ layers: { unknown: { ...layers[0].clip, role: 'new_unreviewed_role' } } }, 9, 'unbound')).toEqual([]);
  });
  it('accepts actual Dragon Slave, Chakram and Refraction roles only with projectile evidence', () => {
    expect(selected('custom_lina_dragon_slave', 'projectile', 3)).toEqual(['dragon_wave']);
    expect(selected('custom_shredder_chakram', 'projectile', 3)).toEqual(['blade']);
    expect(selected('templar_assassin_refraction', 'projectile')).toContain('refract');
    expect(selected('custom_lina_dragon_slave', 'cast', 3)).not.toContain('dragon_wave');
  });
  it('classifies Mana Drain channel_link, instant Finger beam and Arc Lightning endpoints explicitly', () => {
    expect(selected('custom_lion_mana_drain', 'link')).toEqual(['beam']);
    expect(selected('custom_lion_finger_of_death', 'link')).toEqual(['finger_beam']);
    expect(selected('custom_zuus_arc_lightning', 'link')).toEqual(['link_a', 'link_b']);
    expect(selected('custom_phoenix_sun_ray', 'link')).toEqual(['beam']);
  });
  it('never invents Ravage/Torrent pulses or projectile wakes from a cast event', () => {
    expect(selected('custom_tidehunter_ravage', 'world-event')).toContain('eruption');
    expect(selected('custom_tidehunter_ravage', 'cast')).not.toContain('eruption');
    expect(selected('kunkka_torrent', 'world-event')).toContain('geyser');
    expect(selected('kunkka_torrent', 'warning')).toEqual(['warning']);
    expect(selected('custom_vengefulspirit_magic_missile', 'path')).toEqual(['trail_a', 'trail_b', 'trail_c']);
    expect(selected('custom_vengefulspirit_magic_missile', 'projectile')).toEqual(['projectile', 'trail']);
  });
  it('requires active statuses for Chemical Rage and lets a caller bind exact status layers', () => {
    expect(selected('alchemist_chemical_rage', 'status')).toEqual(['rage', 'regen']);
    expect(selected('alchemist_chemical_rage', 'cast')).toEqual(['enter']);
    expect(selectVisualLayers(art('alchemist_chemical_rage'), 9, 'status', ['regen']).map(layer => layer.id)).toEqual(['regen']);
    expect(selected('custom_lion_mana_drain', 'status')).toEqual(['immunity']);
    expect(selected('custom_lion_mana_drain', 'status', 3)).not.toContain('immunity');
  });
  it('honors actual tier exclusions and does not add primary outside the selected tier', () => {
    const normal = tierVisualLayers(art('custom_chaos_knight_reality_rift'), 3);
    expect(normal.map(layer => layer.id)).not.toContain('bolt');
    expect(selected('custom_chaos_knight_reality_rift', 'projectile', 3)).toEqual([]);
    expect(selected('custom_chaos_knight_reality_rift', 'projectile', 6)).toEqual(['bolt']);
    expect(selected('custom_void_spirit_dissimilate', 'zone', 3)).toEqual(['portal']);
    expect(selected('custom_void_spirit_dissimilate', 'cast', 3)).not.toContain('portal');
  });
  it('distinguishes actual entity bodies and collision barriers from aura overlays', () => {
    expect(selected('custom_lich_chain_frost', 'unit')).toContain('spire');
    expect(selected('custom_earthshaker_fissure', 'barrier')).toEqual(['ridge']);
    expect(selected('custom_phoenix_sun_ray', 'unit')).toContain('egg_idle');
    expect(selected('custom_phoenix_sun_ray', 'status')).toContain('corona');
  });
});
