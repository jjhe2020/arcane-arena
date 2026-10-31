import {describe,it,expect} from 'vitest';
import {applyDamage,battleGains,createBattle} from '../src/combat';
import {combatUnitBuffs,heroPersistentBuffs} from '../src/buffs';
import type {Player,SkillDefinition} from '../src/model';
import catalog from '../public/data/skills.json';
const defs=catalog as SkillDefinition[],glaives='custom_silencer_glaives_of_wisdom';
function player(side:number):Player{return{id:side,name:`P${side}`,hp:100,gold:0,shopLevel:1,locked:false,reserve:[],shop:[],heroes:[0,1].map(i=>({id:`h${side}-${i}`,name:`h${side}-${i}`,role:'mage',skin:'male',x:i*2,y:-1,skills:side===0&&i===0?[{id:glaives,points:6,instanceId:'glaives-instance'}]:[]}))};}
describe('真实技能永久来源展示',()=>{
 it('智慧之刃死亡奖励给双方归因，不产生虚构的负历史抵销',()=>{
  const b=createBattle(player(0),player(1),731,defs),caster=b.units[0],victim=b.units.find(u=>u.side===1)!;
  applyDamage(b,caster,victim,1e8,'pure');
  expect(caster.persistentBuffs).toMatchObject({[glaives]:{intelligence:2}});expect(victim.persistentBuffs).toMatchObject({[glaives]:{intelligence:-2}});
  for(const[u,polarity,effect]of[[caster,'positive','智力 +2'],[victim,'negative','智力 -2']]as const){const buffs=combatUnitBuffs(u,b.time,defs,b.units).filter(x=>x.persistsAcrossRounds);expect(buffs).toHaveLength(1);expect(buffs[0]).toMatchObject({skillId:glaives,polarity,effects:[effect]});}
  expect(battleGains(b).find(g=>g.heroId==='h0-0')).toMatchObject({intelligence:2,persistentBuffs:{[glaives]:{intelligence:2}}});expect(battleGains(b).find(g=>g.heroId==='h1-0')).toMatchObject({intelligence:-2,persistentBuffs:{[glaives]:{intelligence:-2}}});
 });
 it('历史汇总与已归因永久成长同时存在时，仅剩余未归因值显示为历史',()=>{
  const p=player(0),h=p.heroes[0];h.persistentIntelligenceBonus=5;h.persistentBuffs={[glaives]:{intelligence:3}};
  const planning=heroPersistentBuffs(h,defs);expect(planning.find(b=>b.skillId==='legacy-permanent')?.effects).toEqual(['智力 +2']);
  const b=createBattle(p,player(1),731,defs),caster=b.units[0],victim=b.units.find(u=>u.side===1)!;applyDamage(b,caster,victim,1e8,'pure');const live=combatUnitBuffs(caster,b.time,defs,b.units);
  expect(live.find(b=>b.skillId==='legacy-permanent')?.effects).toEqual(['智力 +2']);expect(live.find(b=>b.skillId===glaives&&b.persistsAcrossRounds)?.effects).toEqual(['智力 +5']);
 });
 it('决斗/淘汰之刃的技能永久成长与实例状态不重复',()=>{
  const p=player(0),h=p.heroes[0];h.skills=[{id:'custom_legion_commander_duel',points:6,persistentState:{'custom_legion_commander_duel:attack':30}},{id:'axe_culling_blade',points:6,persistentState:{'axe_culling_blade:armor':4}}];
  const b=createBattle(p,player(1),731,defs),views=combatUnitBuffs(b.units[0],0,defs,b.units).filter(v=>v.persistsAcrossRounds);expect(views).toHaveLength(2);expect(views.find(v=>v.skillId==='custom_legion_commander_duel')?.effects).toEqual(['攻击力 +30']);expect(views.find(v=>v.skillId==='axe_culling_blade')?.effects).toEqual(['护甲 +4']);
 });
});
