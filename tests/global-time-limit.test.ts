import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/global-config',async original=>{const actual=await original<typeof import('../src/global-config')>();return{...actual,GLOBAL_BATTLE_CONFIG:{...actual.GLOBAL_BATTLE_CONFIG,timeLimit:240}};});
import {readFileSync} from 'node:fs';
import {createBattle,stepBattle,BATTLE_TIME_LIMIT} from '../src/combat';
import type {Player,SkillDefinition} from '../src/model';
const catalog=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
describe('round-long states follow configured combat duration',()=>{
 it('retains the Huskar permanent strength and passive updater after the former 120-second boundary',()=>{
  const id='huskar_berserkers_blood',a:Player={id:0,name:'A',hp:100,gold:0,shopLevel:1,locked:false,reserve:[],shop:[],heroes:[{id:'a',name:'A',role:'tank',skin:'male',x:-3,y:-3,skills:[{id,points:9}]}]},enemy=structuredClone(a);enemy.id=1;enemy.heroes[0].id='b';enemy.heroes[0].skills=[];
  const battle=createBattle(a,enemy,813,catalog);for(const u of battle.units){u.nextAttack=10000;u.moveSpeed=0;u.hp=u.maxHp=100000;}
  expect(BATTLE_TIME_LIMIT).toBe(240);stepBattle(battle,121,catalog);expect(battle.finished).toBe(false);expect(battle.units[0].statuses.find(s=>s.kind==='strength'&&s.skill===id)?.value).toBe(60);expect(battle.units[0].statuses.find(s=>s.kind==='strength'&&s.skill===id)?.until).toBe(240);
 });
});
