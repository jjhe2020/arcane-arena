import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {createBattle,stepBattle} from '../src/combat';
import {GRANTED_SKILL_DEFINITIONS} from '../src/skill-effects';
import type {Player,SkillDefinition} from '../src/model';
const FIRE='dragon_knight_fireball',DRAGON='dragon_knight_elder_dragon_form';
const catalog=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
const player=(id:number,skill?:string):Player=>({id,name:'P',hp:100,gold:0,shopLevel:3,locked:false,reserve:[],shop:[],heroes:[{id:'h',name:'H',role:'mage',skin:'male',x:0,y:-2,skills:skill?[{id:skill,points:skill===DRAGON?9:1}]:[]}]});
function setup(skill:string){const definitions=structuredClone([...GRANTED_SKILL_DEFINITIONS,...catalog]),b=createBattle(player(0,skill),player(1),883,definitions),u=b.units[0],target=b.units[1];for(const unit of b.units){unit.hp=unit.maxHp=100000;unit.mana=unit.maxMana=10000;unit.nextAttack=100;unit.moveSpeed=0;}u.x=u.y=0;u.facing=0;target.x=7;target.y=0;target.statuses.push({kind:'stun',until:100});return{b,u,target,definition:definitions.find(d=>d.id===FIRE)!,step:(seconds:number)=>stepBattle(b,seconds,definitions),casts:()=>b.events.filter(e=>e.type==='cast'&&e.skill===FIRE)};}
describe('Conditional ability ranges consume the authored public or state-specific value',()=>{
 it('editing Fireball public range changes real non-dragon cast eligibility',()=>{const w=setup(FIRE);w.step(.4);expect(w.casts()).toHaveLength(0);for(const row of Object.values(w.definition.balanceLevels!))row.range=8;w.step(.4);expect(w.casts()).toHaveLength(1);expect(w.casts()[0].toX).toBe(7);});
 it('dragon Fireball uses its independent authored range instead of the non-dragon public range',()=>{const w=setup(DRAGON);for(const row of Object.values(w.definition.balanceLevels!)){row.range=20;row.params['DRAGON CAST RANGE']=600;}w.step(.5);expect(w.u.statuses.some(s=>s.kind==='elderDragon')).toBe(true);expect(w.casts()).toHaveLength(0);for(const row of Object.values(w.definition.balanceLevels!))row.params['DRAGON CAST RANGE']=800;w.step(.4);expect(w.casts()).toHaveLength(1);});
});
