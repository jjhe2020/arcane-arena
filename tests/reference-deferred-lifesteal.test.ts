import {describe,it,expect} from 'vitest';
import {applyDamage,battleStats,createBattle,stepBattle} from '../src/combat';
import type {Player} from '../src/model';
import type {EffectStatus} from '../src/skill-effects';
import {validateUnitStatistics} from '../src/combat/statistics';
const player=(id:number):Player=>({id,name:'P',gold:0,hp:100,shopLevel:1,locked:false,shop:[],reserve:[],heroes:[{id:'h',name:'H',role:'mage',skin:'male',x:0,y:-1,skills:[]}]});
function world(){const b=createBattle(player(0),player(1),123,[]),[source,target]=b.units;for(const unit of b.units){unit.moveSpeed=0;unit.nextAttack=100;unit.statuses.push({kind:'stun',until:100});}source.hp=100;source.statuses.push({kind:'spellLifesteal',until:100,value:.5,skill:'provider'});target.statuses.push({kind:'falsePromise',until:.2,data:{healMultiplier:2}} as EffectStatus);return {b,source,target};}
describe('historical delayed settlement and spell lifesteal',()=>{
 it('False Promise neither the negated original hit nor the final HP removal grants spell lifesteal',()=>{
  const {b,source,target}=world();const hp=source.hp;expect(applyDamage(b,source,target,100,'pure','spell')).toBe(0);
  expect(source.hp).toBe(hp);expect(source.healing).toBe(0);stepBattle(b,.3,[]);
  expect(target.taken).toBe(100);expect(source.damage).toBe(100);expect(source.hp).toBe(hp);expect(source.healing).toBe(0);
  expect(b.events.some(event=>event.type==='heal'&&event.skill==='provider')).toBe(false);expect(battleStats(b).every(validateUnitStatistics)).toBe(true);
 });
 it('False Promise retains damage ownership without reviving an expired provider at settlement',()=>{
  const {b,source,target}=world();applyDamage(b,source,target,80,'pure','first_spell');applyDamage(b,source,target,120,'physical','second_spell');
  source.statuses=source.statuses.filter(status=>status.kind!=='spellLifesteal');stepBattle(b,.3,[]);
  expect(source.healing).toBe(0);expect(source.abilityStats?.find(row=>row.abilityId==='first_spell')?.damage).toBeCloseTo(80);
  expect(source.abilityStats?.find(row=>row.abilityId==='second_spell')?.damage).toBeGreaterThan(0);expect(battleStats(b).every(validateUnitStatistics)).toBe(true);
 });
});
