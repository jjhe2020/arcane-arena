import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {createBattle,getSkillRange,stepBattle,statusValue} from '../src/combat';
import {getSkillProgram,GRANTED_SKILL_DEFINITIONS,type SkillProgram} from '../src/skill-effects';
import {resolveSkillCastRange} from '../src/skill-range';
import {getCombatStats} from '../src/combat';
import type {Player,SkillDefinition} from '../src/model';

const definitions=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
const baseline=JSON.parse(readFileSync('config/reference/migration-baseline.json','utf8')) as {granted:(SkillDefinition&{referenceOnly?:boolean})[]};
const nativeIds=new Set(baseline.granted.filter(d=>!d.referenceOnly).map(d=>d.id));
const granted=GRANTED_SKILL_DEFINITIONS.filter(d=>nativeIds.has(d.id));
const allDefinitions=[...GRANTED_SKILL_DEFINITIONS,...definitions];
const player=(id:number,skill?:string,rank=1):Player=>({id,name:'range',hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:[{id:'h',name:'range',role:'mage',skin:'female',x:0,y:-2,persistentStrengthBonus:1000,persistentIntelligenceBonus:1000,skills:skill?[{id:skill,points:rank}]:[]}]});
const nativeRows=(definition:SkillDefinition)=>Object.keys(definition.balanceLevels as object).map(Number);

describe('all final registered skill cast ranges',()=>{
 it.each([['AA',definitions,[1,2,3,6,9]],['native',granted,[]]] as const)('%s ranks use actual runtime range precedence and respect additive/percentage bonuses',(_domain,catalog,ranks)=>{
  expect(catalog).toHaveLength(_domain==='AA'?230:109);
  for(const definition of catalog)for(const rank of ranks.length?ranks:nativeRows(definition)){
   const battle=createBattle(player(0,definition.id,rank),player(1),2271,allDefinitions),caster=battle.units[0],target=battle.units[1],skill=caster.skills.find(s=>s?.id===definition.id)!,program=getSkillProgram(definition.id)!;
   const result=getSkillRange(battle,caster,skill,target)!;
   expect(Number.isFinite(result.range),`${definition.id}/${rank}`).toBe(true);
   const dynamic=typeof program.range==='function'&&(definition.balanceDomain==='native'||program.dynamicRange===true);
   expect(result.source,`${definition.id}/${rank}`).toBe(dynamic?'dynamic':'configured');
   const statuses=[...caster.statuses],flatBefore=statusValue(caster,'castRange'),pctBefore=statusValue(caster,'castRangePct');
   caster.statuses.push({kind:'castRange',until:100,source:caster.id,value:2},{kind:'castRangePct',until:100,source:caster.id,value:.25});
   const increased=getSkillRange(battle,caster,skill,target)!;
   expect(increased.baseRange,`${definition.id}/${rank} base`).toBeCloseTo(result.baseRange);
   expect(increased.range,`${definition.id}/${rank} bonuses`).toBeCloseTo(program.ignoreCastRangeBonuses?result.baseRange:result.baseRange*(1+pctBefore+.25)+flatBefore+2);
   caster.statuses=statuses;
   // Dynamic attack ranges must observe a genuine range modifier through the
   // same actual context as casting; they must not freeze the sheet fallback.
   if(program.dynamicRange&&['doom_bringer_infernal_blade','custom_windrunner_focusfire','hoodwink_acorn_shot','custom_tusk_walrus_punch','custom_drow_ranger_multishot','clinkz_strafe'].includes(definition.id)){
    caster.statuses.push({kind:'range',until:100,source:caster.id,value:1});
    expect(getCombatStats(caster).range).toBeGreaterThan(caster.range);
    expect(getSkillRange(battle,caster,skill,target)!.baseRange,`${definition.id}/${rank} attack range`).toBeGreaterThan(result.baseRange);
   }
  }
 },30000);
 it('compiled rows override a stale program callback unless the skill explicitly has a dynamic/native range',()=>{
  const d=structuredClone(definitions.find(d=>d.id==='custom_luna_lucent_beam')!),row=(d.balanceLevels as Record<string,{range:number}>)['6'];row.range=13;
  const base={definition:d,skill:{id:d.id,points:6}} as Parameters<typeof resolveSkillCastRange>[1];
  const p={range:()=>8,implemented:[],remaining:[]} as SkillProgram;
  expect(resolveSkillCastRange(p,base).baseRange).toBe(13);
  expect(resolveSkillCastRange({...p,dynamicRange:true},base).baseRange).toBe(8);
  expect(resolveSkillCastRange(p,{...base,definition:{...d,balanceDomain:'native'}}).baseRange).toBe(8);
 });
 it.each([1,2,3,6,9])('a genuine unit-target cast at rank%s begins inside its effective range and does not begin beyond it',rank=>{
  const id='custom_luna_lucent_beam';
  for(const bonus of [false,true])for(const inside of[false,true]){
   const b=createBattle(player(0,id,rank),player(1),2272,allDefinitions),u=b.units[0],t=b.units[1];
   u.x=u.y=0;u.facing=0;u.moveSpeed=t.moveSpeed=0;u.nextAttack=t.nextAttack=1000;u.mana=u.maxMana;
   if(bonus)u.statuses.push({kind:'castRange',until:100,value:1},{kind:'castRangePct',until:100,value:.2});
   const range=getSkillRange(b,u,u.skills[0]!,t)!;t.x=range.range+range.bodyRadius+(inside?-.001:.001);t.y=0;
   stepBattle(b,1/30,allDefinitions);
   expect(b.events.some(e=>e.type==='status'&&e.status==='castWindup'&&e.skill===id),`rank${rank} bonus${bonus} inside${inside}`).toBe(inside);
  }
 });
});
