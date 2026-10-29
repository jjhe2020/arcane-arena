import { createServer } from 'vite';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const server=await createServer({server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[],entries:[]}});
try{
 const [{getMechanicCoverage,GRANTED_SKILL_DEFINITIONS},{ATTRIBUTE_CONVERSION},{SIMULATION_REVISION},{PRD_WORKING_ELIGIBILITY},catalog]=await Promise.all([
  server.ssrLoadModule('/src/skill-effects.ts'),server.ssrLoadModule('/src/combat.ts'),server.ssrLoadModule('/src/simulation-version.ts'),server.ssrLoadModule('/src/combat/prd.ts'),readFile('public/data/skills.json','utf8'),
 ]);
 // Known simplifications must not disappear into a generic "needs validation"
 // bucket just because the ability has all three registered branches.
 const classify=text=>/tree cutting absent|tree destruction|no board tree geometry|no fog of war/i.test(text)?'environment_not_modeled':/backswing\/channel durations are unchanged|circular neighbor approximation|do not copy arbitrary other attack modifiers|bounce uses base attack damage|per-hit damage variance is not modeled|not (yet )?(implemented|attached)|incomplete|still lacks|remains missing|not swept|not supported|requires.*implementation/i.test(text)?'mechanism_missing':/default|interpretation|provisional|placeholder|fallback|candidate|currently|uses? .*instead/i.test(text)?'working_default':/absent|omits|missing.*(field|value|data)|source.*missing/i.test(text)?'parameter_source_missing':'reference_validation';
 const skills=getMechanicCoverage(JSON.parse(catalog)).map(s=>({...s,remainingDetails:s.remaining.map(description=>({category:classify(description),description}))}));
 const referenceResearch=JSON.parse(await readFile('references/dota-wiki/r5-mechanics.json','utf8'));
 const compiled=JSON.parse(await readFile('src/generated/game-config.json','utf8'));
 const engineAudit=[
  ['M01','turning','Facing gate and configurable angular speed; native acceleration curve remains unverified.'],
  ['M02','continuous_movement','Normal movement, fear, separation and barrier recovery share bounded movement.'],
  ['M03','skill_displacement','Continuous skill displacement is distinct from an explicit skill warp. Per-skill motion conflicts need historical comparison.'],
  ['M04','pathing_collision','Unit phasing, flying travel and skill-barrier restrictions are distinct; flat arena geometry only.'],
  ['M05','cast_clocks','Configured cast point/backswing, release eligibility and interruption; Wiki and AA source differences remain visible.'],
  ['M06','attack_clocks','Configured attack point, cadence, buffer and projectile travel; custom bodies are not mapped to native heroes.'],
  ['M07','speed_rules','Configurable work limits and remaining-work clocks; uncommon native priority exceptions need source comparison.'],
  ['M08','attack_modifiers','Independent evasion groups and nonmultiplying critical sources; per-ability attack effects retain explicit behavior.'],
  ['M09','damage_semantics','Attack/spell semantics and damage flags are independent of statistical skill attribution.'],
  ['M10','statuses','Source-isolated refresh, independent resistance sources, dispel strengths and explicit aura/status exceptions.'],
  ['M11','resolution_order','Post-mitigation delay ledgers, effective healing and per-source settlement attribution.'],
  ['M12','ownership_lifecycle','Summon, illusion, granted and stolen ownership remain explicit; arbitrary program writes still require per-effect collision tests.'],
  ['M13','probability','Seeded randomness and calibrated opt-in PRD; original AA eligibility and initial counters remain unverified.'],
 ].map(([id,mechanism,boundary])=>({id,mechanism,status:'working_implementation',referenceVerified:false,boundary}));
 const engineMechanismGaps=engineAudit.filter(entry=>entry.status==='mechanism_missing');
 const probabilityModel={status:'working_default',model:'min(1,C*n), where C is numerically calibrated to the requested stationary probability; successes reset failure history.',eligibility:PRD_WORKING_ELIGIBILITY,isolation:'Battle unit + skill instance/temporary slot + trigger key; new battle and probability changes reset failures; death does not.',unlisted:'Existing seeded uniform draws; random target/angle/damage rolls are not changed.',nativeEligibilityVerified:false,rareInputBoundary:'Below 0.001% uses a documented rare-event asymptote; no allowlisted catalog proc uses that path.'};
 const skillMechanismGaps=skills.flatMap(s=>s.remainingDetails.filter(x=>x.category==='mechanism_missing').map(x=>({id:s.id,...x})));
 const report={generatedAt:new Date().toISOString(),simulationRevision:SIMULATION_REVISION,targetSkillCount:230,referencePatch:'unknown',referenceSnapshot:'2026-10-26',catalogSha256:createHash('sha256').update(catalog).digest('hex'),historicalCandidate:{commit:'6abdd9d13de2f4330ca748082467b9ff6e6cd928',date:'2023-02-10',matchedToAA:false},strictReferenceVerifiedCount:0,engineMechanismGaps,skillMechanismGaps,engineWorkingDefaults:[{id:'spell_steal_lifecycle',description:'Stolen initialization, private caster counters, child action slots, direct init bonuses and maintained effects use explicit origins. Expiry removes these; already completed casts finish naturally. Copied permanent charges are temporary snapshots and never write rewards to a purchased skill instance.'},{id:'hero_summon_classification',description:'Official FAQ excludes ordinary summons from default hero attacks. Forced targeting and spell targeting remain possible; real heroes, their scheduled revivals and hero illusions determine survival. Hero-illusion classification is an explicit engine interpretation.'}],engineReferenceValidation:['Original-version status/immune/dispel ordering, illusion inheritance allowlists and aura stacking groups remain unverified.','Non-caster custom program counters require per-effect collision tests; Spell Steal does not generically sandbox arbitrary writes into battle or target objects.'],counts:{partial:skills.filter(s=>s.status==='partial').length,unimplemented:skills.filter(s=>s.status==='unimplemented').length,superBranches:skills.filter(s=>s.super).length,gabenBranches:skills.filter(s=>s.gaben).length,grantedOnly:GRANTED_SKILL_DEFINITIONS.length},projectAttributeModel:{baseTotalsAlreadyIncludeBaseAttributes:true,formula:'Changes only; not recovered AA hero values',conversions:ATTRIBUTE_CONVERSION},limitations:['Registered base and upgrade branch flags report working behavior, not full fidelity or original-engine verification.','Remaining classifications are conservative text routing; the full original description remains authoritative.','Historical granted definitions never enter the 230-entry purchasable catalog.'],unimplementedIds:skills.filter(s=>!s.base).map(s=>s.id),grantedOnlySkills:GRANTED_SKILL_DEFINITIONS.map(d=>({id:d.id,historicalSource:d.historicalSource})),skills};
 report.probabilityModel=probabilityModel;
 report.configHash=compiled.hash;
 const configReport=JSON.parse(await readFile('public/data/config-report.json','utf8'));
 report.configurationCoverage={mainSkills:configReport.counts.skills,grantedSkills:configReport.counts.granted,referenceAbilities:configReport.counts.referenceAbilities??0,aaPointTiers:[1,2,3,6,9],nativeRanksSeparated:true};
 report.engineMechanismAudit=engineAudit;
 report.referenceResearch=referenceResearch;
 report.environmentPolicy={mode:'flat_visible_arena',excluded:['fog_of_war','day_night_map_vision','trees','elevation','uphill_miss'],retained:['invisibility','true_sight','undetectable'],note:'Unmodeled environmental branches are explicit exclusions, not invented damage or targeting substitutes.'};
 for(const skill of report.skills){skill.configuration={aaTiers:Object.keys(compiled.skills[skill.id]??{}).map(Number),sourcePolicy:'AA overrides > compatible historical Valve fields > explicitly labeled working defaults'};}
 report.engineWorkingDefaults.push({id:'responsive_action_clocks',description:'Attack animation/cadence and cast windup/backswing retain completed progress when explicit time scales change. Chronosphere channels, cooldowns, periodic effects and projectiles remain on world time; channel scaling is not stated by the AA text.'},{id:'attack_inheritance_and_geometry',description:'Jingu soldiers use an explicit seven-skill attack-effect allowlist without recursive Jingu. Moon Glaives use the impact-time base attack snapshot and serial bounces. Skeletons sample their declared damage interval. Empower uses the historical taper, with Super +200 interpreted as ending half-width.'});
 report.engineReferenceValidation.push('The calibrated PRD model and its four-skill trigger allowlist are project working rules; native AA eligibility, initial counters and coefficient conventions have not been reference-matched.');
 await writeFile('public/data/mechanics-coverage.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({simulationRevision:SIMULATION_REVISION,...report.counts,strictReferenceVerified:0}));
}finally{await server.close();}
