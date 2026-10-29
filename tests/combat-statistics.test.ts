import {describe,expect,it} from 'vitest';
import type {BattleState,CombatEvent,CombatUnit} from '../src/model';
import {BASIC_ATTACK_ID,distributeEffective,groupAbilityStats,recordAbsorption,recordDamage,recordHealing,snapshotBattleStats,validateUnitStatistics} from '../src/combat/statistics';
import {unitStatisticsDetails} from '../src/combat/statistics-ui';
import {combatTextEvents,recentCombatEvents} from '../src/animation';
import {interpolatedTransform} from '../src/combat/presentation';

const unit=(id:string,side:number,extra:Partial<CombatUnit>={})=>({id,name:id,side,x:0,y:0,facing:0,skills:[],damage:0,taken:0,healing:0,...extra}) as CombatUnit;
const battle=(...units:CombatUnit[])=>({time:1,units,events:[],finished:false,winner:null,rng:1}) as BattleState;

describe('effective ability statistics',()=>{
 it('keeps basic attacks separate from independent skill damage and never doubles parent totals',()=>{
  const source=unit('hero',0),target=unit('enemy',1),b=battle(source,target);
  recordDamage(b,source,target,70,'physical');recordDamage(b,source,target,20,'magical',{abilityId:'orb'});
  recordDamage(b,source,target,30,'pure',{abilityId:'child',rootAbilityId:'parent'});
  recordHealing(b,source,source,11,{abilityId:'healing_provider'});
  const rows=snapshotBattleStats(b),groups=groupAbilityStats(rows[0].abilityStats!);
  expect(source.damage).toBe(120);expect(target.taken).toBe(120);expect(source.healing).toBe(11);
  expect(groups.find(g=>g.abilityId===BASIC_ATTACK_ID)?.damage).toBe(70);
  expect(groups.find(g=>g.abilityId==='parent')?.children.map(c=>c.abilityId)).toEqual(['child']);
  expect(groups.reduce((n,g)=>n+g.damage,0)).toBe(120);expect(rows.every(validateUnitStatistics)).toBe(true);
 });
 it('credits owned summon output to its summon root while preserving summon incoming damage separately',()=>{
  const owner=unit('hero',0),summon=unit('wolf',0,{summoned:true,owner:'hero',sourceSkill:'summon_wolves'}),enemy=unit('enemy',1),b=battle(owner,summon,enemy);
  recordDamage(b,summon,enemy,40,'physical');recordDamage(b,enemy,summon,25,'magical',{abilityId:'bolt'});
  const row=snapshotBattleStats(b)[0];expect(row.damage).toBe(40);expect(row.taken).toBe(0);
  expect(row.abilityStats![0]).toMatchObject({rootAbilityId:'summon_wolves',abilityId:BASIC_ATTACK_ID,sourceUnitId:'wolf'});
  expect(row.summons![0].taken).toBe(25);expect(validateUnitStatistics(row)).toBe(true);
  const html=unitStatisticsDetails(row,'taken',new Map([['bolt','魔法箭']]));expect(html).toContain('召唤物承伤');expect(html).toContain('独立于英雄本体承伤');expect(html).toContain('魔法箭');
 });
 it('records absorption independently and resolves runtime child roots without using visual parents',()=>{
  const provider=unit('support',0,{skills:[{id:'child',points:1,statParentId:'parent',statRootId:'root',visualParentId:'wrong'} as never]}),target=unit('hero',0),b=battle(provider,target);
  recordAbsorption(b,provider,target,80,{abilityId:'child'});const row=snapshotBattleStats(b)[1];
  expect(row).toMatchObject({absorbed:80,damage:0,taken:0});expect(row.abilityStats![0].rootAbilityId).toBe('root');expect(validateUnitStatistics(row)).toBe(true);
  expect(unitStatisticsDetails(row,'absorbed',new Map([['root','守护盾']]))).toContain('守护盾');
 });
 it('conserves effective totals during proportional clipping and rejects corrupted reports',()=>{
  expect(distributeEffective(10,[20,30,50])).toEqual([2,3,5]);expect(distributeEffective(10,[0,0])).toEqual([0,0]);
  const parts=distributeEffective(7,[1,1,1]);expect(parts.reduce((n,v)=>n+v,0)).toBe(7);
  const source=unit('hero',0),target=unit('enemy',1),b=battle(source,target);recordDamage(b,source,target,10,'pure');
  const stats=snapshotBattleStats(b)[0];stats.abilityStats![0].damageTypes.pure=20;expect(validateUnitStatistics(stats)).toBe(false);
  expect(validateUnitStatistics({...stats,summons:[null]})).toBe(false);
 });
 it('renders escaped source names, labeled damage types, and preserved expansion keys',()=>{
  const source=unit('<enemy>',1),target=unit('hero',0),b=battle(source,target);recordDamage(b,source,target,12,'magical',{abilityId:'bolt'});
  const html=unitStatisticsDetails(snapshotBattleStats(b)[1],'taken',new Map([['bolt','魔法箭']]),new Set(['ability:hero:taken:bolt']));
  expect(html).toContain('魔法 12');expect(html).toContain('来源：&lt;enemy&gt;');expect(html).toContain('data-stat-key="ability:hero:taken:bolt" open');
 });
});

describe('combat text and interpolated transforms',()=>{
 it('separates physical, magical, pure, critical and periodic packets and keeps every in-window event',()=>{
  const base:CombatEvent={time:.5,type:'hit',source:'s',target:'t',x:0,y:0,amount:10};
  const packets=combatTextEvents([{...base,damageType:'physical'},{...base,damageType:'magical'},{...base,damageType:'pure'},{...base,damageType:'physical',flags:{critical:true}},{...base,damageType:'physical',flags:{damageOverTime:true}}],.6);
  expect(packets).toHaveLength(5);expect(packets.reduce((n,p)=>n+p.amount,0)).toBe(50);
  const many=Array.from({length:1000},(_,i)=>({...base,time:i/1000}));expect(recentCombatEvents(many,1)).toHaveLength(1000);
  expect(combatTextEvents(recentCombatEvents(many,1),1).reduce((n,p)=>n+p.amount,0)).toBe(10000);
 });
 it('uses shortest-arc interpolation, snaps real warps, and never edits simulation state',()=>{
  const u=unit('hero',0,{x:10,y:4,facing:-Math.PI+.1,warpSequence:0,previousTransform:{x:0,y:0,facing:Math.PI-.1,warpSequence:0}}),saved=structuredClone(u);
  const middle=interpolatedTransform(u,.5);expect(middle.x).toBe(5);expect(middle.y).toBe(2);expect(Math.abs(middle.facing)).toBeCloseTo(Math.PI);expect(u).toEqual(saved);
  u.warpSequence=1;expect(interpolatedTransform(u,.5)).toMatchObject({x:10,y:4,facing:u.facing});
 });
 it('shows ordinary impacts separately while merging only same-type periodic damage',()=>{
  const base:CombatEvent={time:.5,type:'hit',source:'s',target:'t',skill:'ability',x:0,y:0,amount:10,damageType:'magical'};
  const events=[{...base,sequence:1},{...base,time:.55,sequence:2},{...base,time:.56,sequence:3,flags:{damageOverTime:true}},{...base,time:.57,sequence:4,flags:{damageOverTime:true}},{...base,time:.58,sequence:5,damageType:'pure' as const,flags:{damageOverTime:true}}],before=structuredClone(events);
  const packets=combatTextEvents(events,.6);expect(packets.filter(p=>!p.damageOverTime).map(p=>p.amount)).toEqual([10,10]);expect(packets.filter(p=>p.damageOverTime).map(p=>[p.damageType,p.amount])).toEqual([['magical',20],['pure',10]]);expect(events).toEqual(before);
  expect(combatTextEvents(events.slice(1),.6).find(p=>!p.damageOverTime)?.key).toBe(packets.filter(p=>!p.damageOverTime)[1].key);
 });
});
