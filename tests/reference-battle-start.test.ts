import {describe,it,expect} from 'vitest';
import catalog from '../public/data/skills.json';
import type {Player,SkillDefinition,SkillStack} from '../src/model';
import {battleStats,createBattle,FIXED_STEP,restoreBattle,serializeBattle,stepBattle} from '../src/combat';
import {validateUnitStatistics} from '../src/combat/statistics';
const definitions=catalog as SkillDefinition[];
const ACID='custom_alchemist_acid_spray',DRAGON='custom_dragon_knight_dragon_blood',DISPERSION='custom_spectre_dispersion';
const player=(id:number,skills:SkillStack[]):Player=>({id,name:`P${id}`,hp:100,gold:0,shopLevel:1,locked:false,shop:[],reserve:[],heroes:[{id:'h',name:'H',role:'mage',skin:'male',x:0,y:-2,skills}]});
describe('immediate battle-start areas after constant passive initialization',()=>{
 it.each([DRAGON,DISPERSION])('opening Acid Spray sees %s in either player initialization order',defense=>{
  const attacker=player(0,[{id:ACID,points:9}]),defender=player(1,[{id:defense,points:3}]);
  const first=createBattle(attacker,defender,53,definitions),second=createBattle(defender,attacker,53,definitions);
  const incoming=(b:typeof first)=>b.units.find(u=>u.side===1)!.taken;
  expect(incoming(first)).toBeGreaterThan(0);expect(incoming(first)).toBeCloseTo(incoming(second),10);
  const unprotected=createBattle(attacker,player(1,[]),53,definitions);
  expect(incoming(first)).toBeLessThan(incoming(unprotected));
  expect([...battleStats(first),...battleStats(second)].every(validateUnitStatistics)).toBe(true);
 });
 it('opening defenses also initialize before an earlier skill slot creates its area',()=>{
  const defender=player(1,[{id:ACID,points:9},{id:DRAGON,points:3}]),reverse=structuredClone(defender);reverse.heroes[0].skills.reverse();
  const attacker=player(0,[{id:ACID,points:9}]);
  const first=createBattle(defender,attacker,7,definitions),second=createBattle(reverse,attacker,7,definitions);
  expect(first.units.find(u=>u.side===1)!.taken).toBeGreaterThan(0);
  expect(first.units.find(u=>u.side===1)!.taken).toBeCloseTo(second.units.find(u=>u.side===1)!.taken,10);
  expect(battleStats(first).every(validateUnitStatistics)).toBe(true);
 });
 it('the deferred initial area remains a time-zero hit and replays its ledger exactly',()=>{
  const b=createBattle(player(0,[{id:ACID,points:9}]),player(1,[{id:DRAGON,points:3}]),19,definitions);
  const opening=b.events.filter(e=>e.type==='hit'&&e.skill===ACID&&Number(e.amount)>0);
  expect(opening).toHaveLength(1);expect(opening[0].time).toBe(0);
  const replay=restoreBattle(serializeBattle(b),definitions);expect(battleStats(replay)).toEqual(battleStats(b));
  stepBattle(b,2*FIXED_STEP,definitions);stepBattle(replay,FIXED_STEP,definitions);stepBattle(replay,FIXED_STEP,definitions);
  expect(battleStats(replay)).toEqual(battleStats(b));expect(battleStats(b).every(validateUnitStatistics)).toBe(true);
 });
});
