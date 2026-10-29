import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {applyDamage,battleStats,createBattle,stepBattle} from '../src/combat';
import type {Player,SkillDefinition} from '../src/model';
import {validateUnitStatistics} from '../src/combat/statistics';
import type {EffectStatus} from '../src/skill-effects';
const catalog=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
const player=(id:number,skills:{id:string;points:number}[]=[]):Player=>({id,name:'P',gold:0,hp:100,shopLevel:1,locked:false,shop:[],reserve:[],heroes:[{id:'h',name:'H',role:'mage',skin:'male',x:0,y:-1,skills}]});
function world(skills:{id:string;points:number}[]=[],defs:SkillDefinition[]=[]){const b=createBattle(player(0,skills),player(1),198,defs),[source,target]=b.units;for(const u of b.units){u.hp=u.maxHp=10000;u.armor=u.magicResist=u.moveSpeed=0;u.nextAttack=1e6;u.statuses.push({kind:'disarm',until:100});}source.hp=100;source.x=target.x=0;source.y=0;target.y=2;return{b,source,target,step:(n:number)=>stepBattle(b,n,defs)};}
describe('historical restoration classes and ordinary creep spell lifesteal',()=>{
 it('ordinary physical attack lifesteal includes overkill while damage statistics remain capped to actual health',()=>{
  const w=world();w.target.hp=50;w.source.attack=w.source.attackMin=w.source.attackMax=100;w.source.range=2;w.source.attackPoint=w.source.attackBackswing=0;w.source.facing=Math.PI/2;w.source.nextAttack=0;
  w.source.statuses=[{kind:'lifesteal',skill:'attack_provider',value:.5,until:100}];w.step(.1);expect(w.target.dead).toBe(true);expect(w.source.damage).toBe(50);expect(w.target.taken).toBe(50);expect(w.source.healing).toBeCloseTo(50);expect(battleStats(w.b).every(validateUnitStatistics)).toBe(true);
 });
 it('ordinary summoned creeps use the historical one-fifth coefficient while hero spell lifesteal stays full',()=>{
  for(const creep of [false,true]){const w=world();w.target.summoned=creep;w.source.statuses.push({kind:'spellLifesteal',skill:'provider',value:.5,until:100});
   expect(applyDamage(w.b,w.source,w.target,100,'pure','spell')).toBe(100);expect(w.source.healing).toBeCloseTo(creep?10:50);expect(battleStats(w.b).every(validateUnitStatistics)).toBe(true);}
 });
 it('actual restoration respects passive Break and strongest-provider metadata before sharing its healing cap',()=>{
  const w=world();w.source.statuses.push({kind:'break',until:100},{kind:'spellLifesteal',passive:true,source:w.source.id,skill:'disabled',value:1,until:100} as EffectStatus);
  applyDamage(w.b,w.source,w.target,100,'pure','first');expect(w.source.healing).toBe(0);
  w.source.statuses.push({kind:'spellLifesteal',skill:'weak',value:.2,until:100,data:{stacking:'strongest',uniqueGroup:'one'}} as EffectStatus,{kind:'spellLifesteal',skill:'strong',value:.5,until:100,data:{stacking:'strongest',uniqueGroup:'one'}} as EffectStatus);
  applyDamage(w.b,w.source,w.target,100,'pure','second');expect(w.source.healing).toBe(50);expect(w.source.abilityStats?.find(s=>s.abilityId==='weak')).toBeUndefined();expect(w.source.abilityStats?.find(s=>s.abilityId==='disabled')).toBeUndefined();expect(battleStats(w.b).every(validateUnitStatistics)).toBe(true);
 });
 it('spell lifesteal uses effective remaining health before its creep coefficient and shares the missing-health cap',()=>{
  const w=world();w.target.summoned=true;w.target.hp=50;w.source.hp=w.source.maxHp-3;w.source.statuses.push({kind:'spellLifesteal',skill:'first',value:.2,until:100},{kind:'spellLifesteal',skill:'second',value:.3,until:100});
  applyDamage(w.b,w.source,w.target,1000,'pure','spell');expect(w.source.healing).toBeCloseTo(3);expect(w.source.abilityStats?.find(s=>s.abilityId==='first')?.healing).toBeCloseTo(1.2);expect(w.source.abilityStats?.find(s=>s.abilityId==='second')?.healing).toBeCloseTo(1.8);expect(battleStats(w.b).every(validateUnitStatistics)).toBe(true);
 });
 it('delayed spell damage snapshots its creep class and provider instead of reading replacement statuses',()=>{
  const w=world();w.target.summoned=true;w.target.statuses.push({kind:'damageDelay',until:100,value:.3});w.source.statuses.push({kind:'spellLifesteal',skill:'original',value:.5,until:100});
  expect(applyDamage(w.b,w.source,w.target,100,'pure','spell')).toBe(0);w.target.summoned=false;w.source.statuses=w.source.statuses.filter(s=>s.kind!=='spellLifesteal');w.source.statuses.push({kind:'spellLifesteal',skill:'replacement',value:1,until:100});w.step(.4);
  expect(w.source.healing).toBeCloseTo(10);expect(w.source.abilityStats?.find(s=>s.abilityId==='original')?.healing).toBeCloseTo(10);expect(w.source.abilityStats?.find(s=>s.abilityId==='replacement')).toBeUndefined();expect(battleStats(w.b).every(validateUnitStatistics)).toBe(true);
 });
 it('a real Rain of Destiny amplifies direct healing but neither regeneration nor spell lifesteal',()=>{
  const rain='custom_oracle_fortunes_end',sap='custom_bane_brain_sap',w=world([{id:rain,points:9},{id:sap,points:3}],catalog);w.source.mana=10000;w.source.maxMana=10000;w.source.cooldowns[1]=100;w.step(1.1);
  expect(w.source.statuses.some(s=>s.kind==='healAmplification'&&(s as EffectStatus).data?.healingOnly)).toBe(true);w.source.cooldowns[0]=100;w.source.hp=100;
  w.source.statuses=w.source.statuses.filter(s=>s.kind==='healAmplification'||s.kind==='disarm');w.source.statuses.push({kind:'regen',skill:'regeneration',source:w.source.id,value:30,until:w.b.time+.2},{kind:'spellLifesteal',skill:'provider',value:.5,until:100});
  const firstEvent=w.b.events.length;w.step(.1);expect(w.b.events.slice(firstEvent).filter(e=>e.type==='heal'&&e.skill==='regeneration').reduce((sum,e)=>sum+Number(e.amount),0)).toBeCloseTo(3);const beforeLifesteal=w.source.abilityStats?.find(s=>s.abilityId==='provider')?.healing??0;applyDamage(w.b,w.source,w.target,100,'pure','spell');expect((w.source.abilityStats?.find(s=>s.abilityId==='provider')?.healing??0)-beforeLifesteal).toBeCloseTo(50);
  w.source.cooldowns[1]=w.b.time;w.step(.4);const direct=w.b.events.find(e=>e.type==='heal'&&e.skill===sap);expect(direct?.amount).toBe(375);expect(battleStats(w.b).every(validateUnitStatistics)).toBe(true);
 });
 it('a real Feast uses lifesteal amplification and ignores real Rain direct-heal amplification',()=>{
  const rain='custom_oracle_fortunes_end',feast='life_stealer_feast',w=world([{id:rain,points:9},{id:feast,points:3}],catalog);w.source.mana=w.source.maxMana=10000;w.step(1.1);
  expect(w.source.statuses.some(s=>s.kind==='healAmplification')).toBe(true);w.source.cooldowns[0]=100;w.source.hp=1000;w.source.range=2;w.source.attackPoint=w.source.attackBackswing=0;w.source.attack=w.source.attackMin=w.source.attackMax=100;w.source.facing=Math.PI/2;w.source.statuses=w.source.statuses.filter(s=>s.kind==='healAmplification');w.source.statuses.push({kind:'lifestealAmplification',value:.5,until:100});w.source.nextAttack=w.b.time;
  w.step(.1);const healing=w.b.events.filter(e=>e.type==='heal'&&e.skill===feast);expect(healing).toHaveLength(1);expect(healing[0].amount).toBeCloseTo(510);expect(battleStats(w.b).every(validateUnitStatistics)).toBe(true);
 });
});
