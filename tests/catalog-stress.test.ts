import {describe,it,expect} from 'vitest';
import definitions from '../public/data/skills.json';
import {createBattle,stepBattle} from '../src/combat';
import type {Player,Role,SkillDefinition} from '../src/model';
const defs=definitions as SkillDefinition[];
function player(id:number,skill:string,points:number):Player{return{id,name:`P${id}`,hp:100,gold:0,shopLevel:3,locked:false,reserve:[null,null,null,null],shop:Array(12).fill(null),heroes:[{id:`p${id}-h0`,name:`单位${id}`,role:(id?'tank':'mage') as Role,skin:'female',x:0,y:-3,skills:[{id:skill,points},null,null,null]}]};}
describe('真实230项目录的执行稳定性（不作为机制保真证明）',()=>{
 it.each([1,3,6,9])('所有目录技能在%d点不崩溃、无非有限值并可结束',points=>{
  expect(defs).toHaveLength(230);expect(new Set(defs.map(d=>d.id)).size).toBe(230);
  for(const d of defs){const b=createBattle(player(0,d.id,points),player(1,'custom_vengefulspirit_magic_missile',3),31,defs);let steps=0;
   while(!b.finished&&steps++<4500)stepBattle(b,1/30,defs);
   expect(b.finished,`${d.id}: 超时未结算`).toBe(true);
   for(const u of b.units){expect(Number.isFinite(u.hp)&&Number.isFinite(u.mana)&&Number.isFinite(u.x)&&Number.isFinite(u.y)&&Number.isFinite(u.damage),`${d.id}: 非有限单位状态`).toBe(true);}
  }
 },30000);
});
