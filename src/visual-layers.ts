import type { AnimationClip } from './model';

/** Classification is a vocabulary contract, not permission to invent an effect.
 * A caller must provide the corresponding live simulation evidence. In
 * particular, a cast is not evidence of a later explosion, heal, status, summon,
 * projectile trajectory or trail. Preview timelines are deliberately ignored. */
export type VisualEvidence = 'cast' | 'hit' | 'heal' | 'projectile' | 'zone' | 'status' | 'unit'
  | 'link' | 'world-event' | 'path' | 'barrier' | 'transition' | 'proc' | 'warning' | 'unbound';
export type VisualAnchor = 'source' | 'recipient' | 'world' | 'trajectory' | 'endpoints' | 'unit';
export interface VisualSkillArt {
  layers?: Record<string, AnimationClip>;
  tiers?: Record<string, { layer_refs?: readonly string[] }>;
  primary?: AnimationClip;
}
export interface VisualLayer {
  id: string;
  clip: AnimationClip;
  role: string;
  evidence: VisualEvidence;
  anchor: VisualAnchor;
}

const groups: Partial<Record<VisualEvidence, string>> = {
  cast: 'caster_enter caster_release global_cast release',
  hit: 'impact target_hit target_impact target_burst target_strike target_contact target_fragments target_delayed_hit target_hit_residue directional_hit attack_contact attack_hit attack_proc_hit attack_modifier_critical_hit target_instant_attack target_pulse_core target_pulse_residue target_ministun',
  heal: 'ally_heal ally_delayed_heal ally_restore attacker_heal caster_heal caster_restore friendly_feedback friendly_heal friendly_mana target_heal target_restore converted_damage_feedback',
  projectile: 'projectile projectile_local physical_projectile rigid_projectile attack_projectile triggered_projectile projectile_wave projectile_area reactive_damage_projectile short_projectile tracer',
  link: 'connection channel_link siphon tether stretch_link stretch_line stretch_path chain_tile chain_segment strike_segment instant_connection directional_connection world_connection target_to_caster_link transfer_segment ally_chain beam directed_channel attack_proc_chain',
  path: 'history_wake history_trail world_history world_history_child_segment projectile_history_ground moving_trail caster_jump_wake world_vine_path',
  zone: 'area area_air area_overlay channel_area passive_area ground ground_area ground_sustain ground_field ground_damage ground_portal area_status area_mark world_smoke remnant_aura ghost_aura',
  barrier: 'ground_barrier duel_boundary',
  unit: 'summon_body summon_idle summon_move summon_attack summon_cast summon_channel summon_disabled summon_flail summon_spawn summon_death summon_birth summon_rebirth form_body replacement_form transient_body friendly_swarm_unit hostile_swarm_unit entity_attack world_prop',
  'world-event': 'world_event ground_event area_event area_hit area_burst area_eruption area_pull area_pulse area_roar area_slam area_stun area_spawn area_start ground_hit ground_enter world_enter world_descent world_summon world_random_explosion world_heal_damage target_area_hit target_area_pulse distance_triggered_area_hit directional_event directional_ground_event line_open line_implosion landing_stun caster_pulse caster_sweep aoe_damage target_fall triggered_breathe_fire',
  warning: 'charge caster_charge caster_warning target_warning world_warning ground_warning line_telegraph',
  transition: 'caster_exit caster_arrival caster_arrive caster_depart caster_return caster_blink caster_transition caster_spawn caster_split form_enter form_exit target_enter target_exit target_apply target_transform_enter target_transform_exit target_grab target_pickup world_depart world_arrive world_exit ground_exit ground_fade area_exit area_fade channel_exit connection_exit clone_exit copy_enter entity_enter illusion_enter illusion_exit friendly_enter friendly_exit ally_enter ally_buff_apply portal_entry portal_transit portal_exit portal_occlusion summon_enter summon_exit summon_fx summon_sail summon_wreck recipient_carried_flight owner_death death_burst',
  status: 'target_status target_status_air target_stun target_slow target_root target_root_disarm target_shield target_state target_sustain target_prison target_mark target_stack target_counter target_buff target_break target_silence target_silence_item_mute target_slow_break target_fire_embers target_curse target_debuff target_damage target_damage_amplification target_armor_debuff target_resistance_reduction target_fear stun caster_sustain private_caster_sustain caster_status caster_state caster_buff caster_immunity caster_health_aura caster_strength_stacks caster_temporary_stats caster_aura caster_following_aura caster_magic_shield caster_trance caster_enrage caster_attack_buff caster_charged_attacks caster_stack caster_stack_sparks caster_counter caster_passive caster_passive_regeneration caster_passive_stack caster_hidden_state caster_phase caster_fury caster_toggle caster_resistance caster_windrun caster_aerodynamic_pressure caster_attachment caster_mechanism caster_moving_status body_buff body_regeneration body_attack_buff friendly_status ally_buff ally_damage_cleave_buff ally_attack_reduction ally_shell ally_shield ally_regeneration ally_passive ally_passive_regeneration ally_rampage attacker_buff enemy_debuff illusion_status clone_sustain summon_aura summon_buff summon_status active_damage_block passive_armor_regeneration permanent_stat_mark passive_ready weapon_status weapon_conditional_passive_buff pair_external_damage_reduction orbit_weapon individual_stack_segment world_placeholder',
  proc: 'caster_event caster_feedback caster_gain caster_passive_gain caster_stack_gain caster_stat_gain caster_stack_expire caster_cooldown_reset caster_reset caster_cleanse caster_dodge caster_evasion caster_self_damage caster_victory target_event target_feedback target_cleanse target_dispel friendly_event friendly_purge ally_cleanse cleanse damage_reflection damage_block_contact spell_block_contact shield_break kill_stack_gain passive_death_gain weapon_cast_trigger_gain weapon_passive_expire granted_active granted_ability ally_granted_ability granted_passive_proc attack_cleave attack_miss attack_modifier_proc actual_attack_arc_and_contact creep_execute retaliation periodic_damage pair_challenge world_feedback',
};
const roleEvidence = new Map<string, VisualEvidence>();
for (const [evidence, names] of Object.entries(groups)) for (const role of names.split(' ')) {
  if (roleEvidence.has(role)) throw new Error(`Duplicate visual role classification: ${role}`);
  roleEvidence.set(role, evidence as VisualEvidence);
}

/** Unknown roles fail closed. They remain visible to an audit as `unbound`. */
export function visualRoleEvidence(role: unknown): VisualEvidence {
  return typeof role === 'string' ? roleEvidence.get(role) ?? 'unbound' : 'unbound';
}
export function visualRoleAnchor(role: string): VisualAnchor {
  const evidence = visualRoleEvidence(role);
  if (evidence === 'projectile' || evidence === 'path') return 'trajectory';
  if (evidence === 'link') return 'endpoints';
  if (evidence === 'unit' || evidence === 'status') return 'unit';
  if (evidence === 'zone' || evidence === 'barrier' || evidence === 'world-event') return 'world';
  if (/^(caster_|attacker_|weapon_|body_)/.test(role) || role === 'charge' || role === 'release' || role === 'global_cast') return 'source';
  if (/^(target_|ally_|friendly_|attack_)/.test(role) || role === 'impact') return 'recipient';
  return 'world';
}

/** Tier references are the allowed art layers, not executable gameplay. Never
 * add a primary layer excluded by this tier, or infer timing from runtime_delta. */
export function tierVisualLayers(art: VisualSkillArt, points: number): VisualLayer[] {
  const tier = points >= 9 ? 'gaben' : points >= 6 ? 'super' : 'normal';
  const refs = art.tiers?.[tier]?.layer_refs;
  const allowed = refs?.length ? new Set(refs) : undefined;
  return Object.entries(art.layers ?? {}).filter(([id]) => !allowed || allowed.has(id)).map(([id, clip]) => {
    const role = typeof clip.role === 'string' ? clip.role : '';
    return { id, clip, role, evidence: visualRoleEvidence(role), anchor: visualRoleAnchor(role) };
  });
}

/** Pure selector. `layerIds` is useful when a real status/child spell maps to a
 * specific authored layer. It prevents painting every aura/status of a skill
 * merely because one unrelated numeric modifier from that skill exists. */
export function selectVisualLayers(art: VisualSkillArt, points: number, evidence: VisualEvidence, layerIds?: readonly string[]): VisualLayer[] {
  if (evidence === 'unbound') return [];
  const allowed = layerIds ? new Set(layerIds) : undefined;
  return tierVisualLayers(art, points).filter(layer => layer.evidence === evidence && (!allowed || allowed.has(layer.id)));
}
