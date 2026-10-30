/** A calibrated increasing-hazard PRD working model. This is a mathematical
 * implementation, not a recovered Valve coefficient table or AA eligibility map.
 * Trial n after a success uses min(1, C * n); C is solved to give the requested
 * long-run success frequency. First trial is n=1, with no preloaded failures. */
export interface PrdState { probability:number;failures:number;trials:number;successes:number }
const coefficients=new Map<number,number>();
export function prdExpectedRate(coefficient:number):number {
  if(coefficient<=0)return 0;if(coefficient>=1)return 1;
  let survival=1,expectedTrials=0;
  for(let n=1;n<=1000000&&survival>1e-15;n++){
    expectedTrials+=survival;survival*=1-Math.min(1,coefficient*n);
  }
  return 1/expectedTrials;
}
export function prdCoefficient(probability:number):number {
  const p=Math.max(0,Math.min(1,Number.isFinite(probability)?probability:0));
  if(p===0||p===1)return p;
  const cached=coefficients.get(p);if(cached!==undefined)return cached;
  // Current allowlisted gameplay probabilities are >= .12. For an exceptional
  // caller below .001%, use the rare-event asymptote to bound calibration cost;
  // no current catalog proc uses this approximate path.
  if(p<1e-5)return p*p*Math.PI/2;
  let low=0,high=p;
  for(let i=0;i<60;i++){const mid=(low+high)/2;if(prdExpectedRate(mid)>p)high=mid;else low=mid;}
  const result=(low+high)/2;coefficients.set(p,result);return result;
}
export function rollPrd(state:PrdState,probability:number,random:()=>number):boolean {
  const p=Math.max(0,Math.min(1,Number.isFinite(probability)?probability:0));
  if(state.probability!==p){state.probability=p;state.failures=0;}
  state.trials++;
  if(p===0)return false;
  const chance=Math.min(1,prdCoefficient(p)*(state.failures+1));
  const success=p===1||random()<chance;
  if(success){state.failures=0;state.successes++;}else state.failures++;
  return success;
}

/** Deliberate project allowlist. Eligibility for the unknown AA patch is not
 * certified. Random target selection, scalar rolls and unspecified procs keep
 * their existing uniform draws. Each key is independent per combat skill slot. */
export const PRD_WORKING_ELIGIBILITY:Readonly<Record<string,readonly string[]>>={
  custom_phantom_assassin_coup_de_grace:['critical'],
  custom_chaos_knight_chaos_strike:['critical'],
  custom_axe_counter_helix:['helix'],
  // Native Time Lock enabled PRD in the November 2012 patch history.
  faceless_void_time_lock:['timeLock'],
  // The 7.23 Essence Flux replacement explicitly uses PRD.
  custom_obsidian_destroyer_equilibrium:['essenceFlux'],
  // The7.00 Craggy Exterior lineage explicitly switched to PRD; AA Belch keeps its own probability.
  tiny_grow:['belchExterior'],
  // Native Greater Bash switched to PRD in 6.85; AA grants this proc at Gaben.
  custom_spirit_breaker_charge_of_darkness:['greater_bash'],
  legion_commander_moment_of_courage:['defensiveCounterattack','offensiveCounterattack'],
  custom_windrunner_focusfire:['maelstrom'],
  ursa_overpower:['bash','overpowerBasher'],
  // Wiki PRD history dates Tusk's attack-proc talent to 7.22 (2019-05-24).
  // AA's custom 20% probability is retained independently of the old 12% talent.
  custom_tusk_walrus_punch:['walrusPunch'],
  // The 7.30 Anchor Smash attack-proc talent is documented as PRD.
  tidehunter_anchor_smash:['anchorSmash'],
  // The dated 2023 Marksmanship notes explicitly name PRD.
  drow_ranger_marksmanship:['marksmanship'],
  // The dated 2023 Gunslinger notes explicitly name PRD.
  muerta_pierce_the_veil:['gunslinger'],
  // Dated2023 Crimson Guard passive block explicitly uses PRD; its active guarantee never rolls.
  item_crimson_guard:['crimsonGuardBlock'],
  // Dated2023 Entangling Claws explicitly uses PRD; True Form owns this trial.
  lone_druid_true_form:['entanglingClaws'],
  // Dated2023 Monkey King Bar explicitly uses PRD for Pierce.
  item_monkey_king_bar:['mkbPierce'],
  custom_lone_druid_spirit_bear:['entangle'],
  lycan_shapeshift:['shapeshift'],
  lycan_summon_wolves_critical_strike:['cripple'],
  item_mjollnir:['chain','staticCharge'],
  item_basher:['bash'],
};
