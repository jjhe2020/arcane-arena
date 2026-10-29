import {describe,it,expect} from 'vitest';
import {applyDamage,battleStats,createBattle,FIXED_STEP,stepBattle,restoreBattle,serializeBattle} from '../src/combat';
import {validateUnitStatistics} from '../src/combat/statistics';
import type {Player,CombatUnit} from '../src/model';
const player=(id:number):Player=>({id,name:`P${id}`,hp:100,gold:0,shopLevel:1,heroes:[{id:'h',name:`hero${id}`,role:'mage',skin:'female',x:0,y:-2,skills:[]}],reserve:[],shop:[],locked:false});
function setup(){const b=createBattle(player(0),player(1),54,[]);for(const u of b.units){u.armor=0;u.statuses.push({kind:'stun',until:100});}return b;}
const row=(u:CombatUnit,id:string)=>u.abilityStats?.filter(s=>s.abilityId===id).reduce((n,s)=>n+s.damage,0)??0;
describe('skill-level effective battle accounting',()=>{
 it('keeps attack semantics separate from the skill shown in statistics',()=>{
  const b=setup(),[a,t]=b.units;a.statuses.push({kind:'spellAmp',value:2,until:100});t.statuses.push({kind:'block',value:20,until:100},{kind:'magicImmune',until:100});
  const dealt=applyDamage(b,a,t,100,'physical','omnislash',false,0,false,undefined,{category:'attack',attribution:{abilityId:'omnislash'}});
  expect(dealt).toBe(80);expect(row(a,'omnislash')).toBe(80);expect(row(a,'basic_attack')).toBe(0);
  expect(validateUnitStatistics(battleStats(b)[0])).toBe(true);
 });
 it('records each damage type and trims overkill before assigning contributions',()=>{
  const b=setup(),[a,t]=b.units;t.hp=150;
  applyDamage(b,a,t,40,'physical');applyDamage(b,a,t,40,'magical','magic');applyDamage(b,a,t,1000,'pure','pure');
  expect(row(a,'basic_attack')).toBe(40);expect(row(a,'magic')).toBe(30);expect(row(a,'pure')).toBe(80);
  expect(a.damage).toBe(150);expect(t.taken).toBe(150);expect(battleStats(b).every(validateUnitStatistics)).toBe(true);
 });
 it('keeps original skills and damage types through nonlethal Rum repayment',()=>{
  const b=setup(),[a,t]=b.units;t.statuses.push({kind:'ghostshipRum',until:.1,value:.5,data:{paybackDuration:.2}} as never);
  applyDamage(b,a,t,100,'physical','first');applyDamage(b,a,t,100,'magical','second');
  stepBattle(b,.5,[]);
  expect(row(a,'first')).toBeCloseTo(100);expect(row(a,'second')).toBeCloseTo(75);
  expect(row(a,'kunkka_ghostship')).toBe(0);expect(a.abilityStats?.find(s=>s.abilityId==='second')?.damageTypes.magical).toBeCloseTo(75);
  expect(battleStats(b).every(validateUnitStatistics)).toBe(true);
 });
 it('attributes a False Promise net result to the original damaging skills once',()=>{
  const b=setup(),[a,t]=b.units;t.statuses.push({kind:'falsePromise',until:.1,data:{healMultiplier:2}} as never);
  applyDamage(b,a,t,40,'physical','first');applyDamage(b,a,t,80,'pure','second');
  expect(a.damage).toBe(0);stepBattle(b,.2,[]);
  expect(row(a,'first')).toBeCloseTo(40);expect(row(a,'second')).toBeCloseTo(80);expect(row(a,'oracle_false_promise')).toBe(0);
  expect(battleStats(b).every(validateUnitStatistics)).toBe(true);
 });
 it('shows shield absorption separately from actual damage and taken',()=>{
  const b=setup(),[a,t]=b.units;t.statuses.push({kind:'shield',source:t.id,skill:'shield',remaining:60,until:10} as never);
  applyDamage(b,a,t,100,'pure','nuke');
  expect(a.damage).toBe(40);expect(t.taken).toBe(40);expect(t.absorbed).toBe(60);
  expect(t.abilityStats?.find(s=>s.abilityId==='shield')?.absorbed).toBe(60);expect(battleStats(b).every(validateUnitStatistics)).toBe(true);
 });
 it('shares the effective spell-lifesteal cap across its providing skills',()=>{
  const b=setup(),[a,t]=b.units;a.hp=a.maxHp-10;
  a.statuses.push({kind:'spellLifesteal',value:.2,until:100,skill:'leechA'},{kind:'spellLifesteal',value:.3,until:100,skill:'leechB'});
  applyDamage(b,a,t,100,'pure','nuke');expect(a.healing).toBeCloseTo(10);
  expect(a.abilityStats?.find(s=>s.abilityId==='leechA')?.healing).toBeCloseTo(4);
  expect(a.abilityStats?.find(s=>s.abilityId==='leechB')?.healing).toBeCloseTo(6);
  expect(battleStats(b).every(validateUnitStatistics)).toBe(true);
 });
 it('does not let reflected damage amplify or generate spell lifesteal',()=>{
  const b=setup(),[a,t]=b.units;a.hp-=100;a.statuses.push({kind:'spellAmp',value:2,until:100},{kind:'spellLifesteal',value:1,until:100,skill:'leech'});
  expect(applyDamage(b,a,t,100,'pure','reflect',false,0,false,undefined,{flags:{reflection:true}})).toBe(100);
  expect(a.healing).toBe(0);expect(row(a,'reflect')).toBe(100);
 });
 it('retains both healing providers when False Promise pays a positive net result',()=>{
  const b=setup(),[a,t]=b.units;t.hp=900;t.statuses.push({kind:'falsePromise',until:.2,data:{healMultiplier:2}} as never);
  t.statuses.push({kind:'regen',source:a.id,skill:'healA',value:30,until:.15},{kind:'regen',source:a.id,skill:'healB',value:60,until:.15});
  stepBattle(b,.3,[]);expect(t.hp).toBeCloseTo(924);expect(a.healing).toBeCloseTo(24);
  expect(a.abilityStats?.find(s=>s.abilityId==='healA')?.healing).toBeCloseTo(8);
  expect(a.abilityStats?.find(s=>s.abilityId==='healB')?.healing).toBeCloseTo(16);expect(battleStats(b).every(validateUnitStatistics)).toBe(true);
 });
 it('combines independent magic resistance and damage reduction sources multiplicatively',()=>{
  const b=setup(),[a,t]=b.units;t.statuses.push({kind:'magicResist',value:.5,until:100,skill:'one'},{kind:'magicResist',value:.5,until:100,skill:'two'});
  expect(applyDamage(b,a,t,100,'magical','nuke')).toBeCloseTo(18.75);
  t.statuses.push({kind:'damageReduction',value:.5,until:100,skill:'one'},{kind:'damageReduction',value:.5,until:100,skill:'two'});
  expect(applyDamage(b,a,t,100,'pure','nuke')).toBeCloseTo(25);
 });
 it('preserves nonlethal flags and the damage order through False Promise',()=>{
  const b=setup(),[a,t]=b.units;t.hp=100;t.statuses.push({kind:'falsePromise',until:.1});
  applyDamage(b,a,t,1,'pure','normal');applyDamage(b,a,t,200,'pure','nonlethal',false,0,false,undefined,{flags:{nonLethal:true}});
  stepBattle(b,.2,[]);expect(t.hp).toBe(1);expect(t.dead).toBe(false);expect(t.taken).toBe(99);expect(b.events.some(e=>e.type==='death')).toBe(false);
 });
 it('keeps a parent healing identity after the original child slot disappears',()=>{
  const b=setup(),[a,t]=b.units;t.hp-=100;t.statuses.push({kind:'regen',source:a.id,skill:'child',value:30,until:1,attribution:{abilityId:'child',rootAbilityId:'parent'}} as never);
  stepBattle(b,.1,[]);expect(a.abilityStats?.find(s=>s.abilityId==='child')?.rootAbilityId).toBe('parent');expect(a.healing).toBeCloseTo(3);
 });
 it('settles ordinary attack lifesteal when delayed damage actually lands',()=>{
  const b=setup(),[a,t]=b.units;a.statuses=[];a.hp-=100;a.attack=75;a.range=1.5;a.x=t.x=0;a.y=0;t.y=.5;
  a.statuses.push({kind:'lifesteal',skill:'attack_leech',value:1,until:100});t.statuses.push({kind:'damageDelay',value:.5,until:100});
  stepBattle(b,1.1,[]);expect(a.damage).toBe(75);expect(a.healing).toBe(75);expect(a.abilityStats?.find(s=>s.abilityId==='attack_leech')?.healing).toBe(75);
 });
 it('deterministically reconstructs skill ledgers from normal battle inputs',()=>{
  const b=createBattle(player(0),player(1),19,[]);stepBattle(b,8,[]);
  const replay=restoreBattle(serializeBattle(b),[]);expect(battleStats(replay)).toEqual(battleStats(b));
  stepBattle(b,FIXED_STEP,[]);stepBattle(replay,FIXED_STEP,[]);expect(battleStats(replay)).toEqual(battleStats(b));
  expect(battleStats(b).every(validateUnitStatistics)).toBe(true);
 });
});
