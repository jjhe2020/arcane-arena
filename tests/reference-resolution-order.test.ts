import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {applyDamage,battleStats,createBattle,stepBattle} from '../src/combat';
import type {CombatUnit,Player,SkillDefinition} from '../src/model';
import type {EffectStatus} from '../src/skill-effects';
import {validateUnitStatistics} from '../src/combat/statistics';
const FP='oracle_false_promise',SHIELD='custom_abaddon_aphotic_shield',BT='abaddon_borrowed_time';
const catalog=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
function player(id:number,skills:string[]=[]):Player{return{id,name:'P',gold:0,hp:100,shopLevel:1,locked:false,shop:[],reserve:[],heroes:[{id:'h',name:'H',role:'mage',skin:'male',x:0,y:-1,skills:skills.map(id=>({id,points:3}))}]};}
function world(skills:string[]=[]){
 const definitions=skills.map(id=>{const d=structuredClone(catalog.find(d=>d.id===id)!);for(const row of Object.values(d.balanceLevels!)){row.castPoint=0;row.backswing=0;row.mana=0;row.cooldown=100;if(id===FP)row.params.DURATION=.5;}return d;});
 const b=createBattle(player(0),player(1,skills),115,definitions),[source,target]=b.units;
 for(const u of b.units){u.moveSpeed=0;u.nextAttack=100;u.statuses.push({kind:'disarm',until:100});}
 source.hp=100;source.magicResist=target.magicResist=0;source.armor=target.armor=0;target.hp=300;target.maxHp=1000;
 return {b,source,target,definitions,step:(seconds:number)=>stepBattle(b,seconds,definitions)};
}
const status=(u:CombatUnit,kind:string)=>u.statuses.find(s=>s.kind===kind) as EffectStatus|undefined;
describe('historical False Promise and health-removal resolution',()=>{
 it('real False Promise records before real Aphotic Shield without consuming its capacity',()=>{
  const w=world([FP,SHIELD]);w.step(.1);const shield=status(w.target,'shield')!;
  expect(status(w.target,'falsePromise')).toBeDefined();expect(shield).toBeDefined();const capacity=shield.remaining;
  expect(applyDamage(w.b,w.source,w.target,100,'pure','probe')).toBe(0);expect(w.target.hp).toBe(300);expect(shield.remaining).toBe(capacity);expect(w.target.absorbed).toBe(0);
  w.step(.6);expect(w.target.hp).toBe(200);expect(w.target.taken).toBe(100);expect(w.source.damage).toBe(100);expect(shield.remaining).toBe(capacity);
  expect(applyDamage(w.b,w.source,w.target,50,'pure','after_promise')).toBe(0);expect(shield.remaining).toBe(Number(capacity)-50);expect(battleStats(w.b).every(validateUnitStatistics)).toBe(true);
 });
 it('real Borrowed Time records both original damage and its healing while False Promise is active',()=>{
  const w=world([FP,BT]);w.step(.1);expect(status(w.target,'borrowedTime')).toBeDefined();
  applyDamage(w.b,w.source,w.target,100,'pure','probe');expect(w.target.hp).toBe(300);expect(w.target.healing).toBe(0);
  const ledger=w.target.deferredHealth as {damage:{amount:number}[];healing:number};expect(ledger.damage.map(e=>e.amount)).toEqual([100]);expect(ledger.healing).toBe(100);
  w.step(.6);expect(w.target.hp).toBe(400);expect(w.target.healing).toBe(100);expect(w.source.damage).toBe(0);expect(w.target.abilityStats?.find(row=>row.abilityId===BT)?.healing).toBe(100);
  expect(battleStats(w.b).every(validateUnitStatistics)).toBe(true);
 });
 it('three real abilities preserve the shield while the two negation effects settle together',()=>{
  const w=world([FP,SHIELD,BT]);w.step(.15);const shield=status(w.target,'shield')!,capacity=shield.remaining;
  expect(status(w.target,'borrowedTime')).toBeDefined();applyDamage(w.b,w.source,w.target,100,'pure','probe');
  expect(shield.remaining).toBe(capacity);w.step(.6);expect(w.target.hp).toBe(400);expect(shield.remaining).toBe(capacity);
 });
 it('False Promise negation prevents creating an extra low-priority Rum debt for the same hit',()=>{
  const w=world([FP]);w.step(.1);w.target.statuses.push({kind:'ghostshipRum',until:1,value:.5,data:{paybackDuration:.5}} as EffectStatus);
  applyDamage(w.b,w.source,w.target,100,'pure','probe');expect(Object.keys(w.target.rumDebts??{})).toHaveLength(0);
  w.step(1.5);expect(w.target.hp).toBe(200);expect(w.target.taken).toBe(100);expect(w.b.events.some(e=>e.rumPayback)).toBe(false);
 });
 it('HP removal bypasses ordinary reductions, shields, Borrowed Time, Rum and mana shield',()=>{
  const w=world();w.source.statuses.push({kind:'spellAmp',until:100,value:10},{kind:'spellLifesteal',until:100,value:1,skill:'leech'});
  w.target.statuses.push({kind:'damageReduction',until:100,value:.9},{kind:'damageVulnerability',until:100,value:2},{kind:'allDamageBlock',until:100,value:1000},
   {kind:'borrowedTime',until:100},{kind:'ghostshipRum',until:100,value:.5},{kind:'manaShield',until:100,value:.9},{kind:'damagePerMana',until:100,value:10},
   {kind:'shield',until:100,value:400,remaining:400,skill:SHIELD} as EffectStatus);
  const mana=w.target.mana;expect(applyDamage(w.b,w.source,w.target,100,'pure','health_loss',false,0,false,undefined,{flags:{healthRemoval:true}})).toBe(100);
  expect(w.target.hp).toBe(200);expect(status(w.target,'shield')?.remaining).toBe(400);expect(w.target.mana).toBe(mana);expect(w.target.healing).toBe(0);expect(w.source.healing).toBe(0);
  expect(Object.keys(w.target.rumDebts??{})).toHaveLength(0);expect(w.target.damageHistory??[]).toEqual([]);
 });
 it('HP removal remains nonlethal when flagged and cannot activate automatic Borrowed Time',()=>{
  const w=world([BT]);w.target.statuses.push({kind:'stun',until:100});expect(applyDamage(w.b,w.source,w.target,1000,'pure','health_loss',false,0,false,undefined,{flags:{healthRemoval:true,nonLethal:true}})).toBe(299);
  expect(w.target.hp).toBe(1);expect(w.target.dead).toBe(false);expect(status(w.target,'borrowedTime')).toBeUndefined();
 });
 it('HP removal is delayed by False Promise without being converted by Borrowed Time',()=>{
  const w=world([FP,BT]);w.step(.1);applyDamage(w.b,w.source,w.target,100,'pure','health_loss',false,0,false,undefined,{flags:{healthRemoval:true}});
  expect(w.target.hp).toBe(300);expect((w.target.deferredHealth as {healing:number}).healing).toBe(0);w.step(.6);expect(w.target.hp).toBe(200);expect(w.target.healing).toBe(0);
 });
 it('invulnerability prevents a health-removal cost while spell immunity does not',()=>{
  const w=world();w.target.statuses.push({kind:'invulnerable',until:100});expect(applyDamage(w.b,w.source,w.target,100,'pure','health_loss',false,0,false,undefined,{flags:{healthRemoval:true}})).toBe(0);
  w.target.statuses=[{kind:'magicImmune',until:100}];expect(applyDamage(w.b,w.source,w.target,100,'pure','health_loss',false,0,false,undefined,{flags:{healthRemoval:true}})).toBe(100);
 });
});
