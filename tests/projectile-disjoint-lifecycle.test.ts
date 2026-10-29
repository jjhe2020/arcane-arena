import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {createBattle,FIXED_STEP,stepBattle} from '../src/combat';
import {getSkillProgram,type SkillProgram} from '../src/skill-effects';
import type {Player,SkillDefinition} from '../src/model';

const ID='custom_vengefulspirit_magic_missile';
const catalog=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
const player=(id:number,skill=false):Player=>({id,name:'P',hp:100,gold:0,shopLevel:1,locked:false,reserve:[],shop:[],heroes:[{id:`h${id}`,name:'H',role:'mage',skin:'male',x:0,y:0,skills:skill?[{id:ID,points:1}]:[]}]});
function fixture(){
 const definitions=structuredClone(catalog),definition=definitions.find(d=>d.id===ID)!;
 for(const row of Object.values(definition.balanceLevels!)){row.castPoint=0;row.cooldown=99999;}
 const b=createBattle(player(0,true),player(1),663,definitions),[u,t]=b.units;
 for(const unit of b.units){unit.hp=unit.maxHp=10000;unit.mana=unit.maxMana=10000;unit.nextAttack=99999;unit.moveSpeed=unit.magicResist=unit.armor=0;}
 u.x=u.y=0;u.facing=0;t.x=3;t.y=0;t.statuses.push({kind:'stun',until:100});
 return{b,u,t,step:(seconds:number)=>stepBattle(b,seconds,definitions)};
}
function withProgram(run:(program:SkillProgram)=>void){const program=getSkillProgram(ID)!,saved={...program};try{run(program);}finally{for(const key of Object.keys(program))delete (program as unknown as Record<string,unknown>)[key];Object.assign(program,saved);}}

// These tests exercise the engine API and its update queue. Their fixture
// program is deliberately synthetic and is not native Magic Missile proof.
describe('Tracking projectile disjoint lifecycle',()=>{
 it('cancels a later in-flight projectile once during another impact and retains a new callback projectile',()=>withProgram(program=>{
  const positions:{x:number;y:number}[]=[];
  program.projectileDisjointable=true;program.castPoint=0;
  program.cast=c=>{
   c.projectile(c.target,100,t=>{c.damage(t,100);c.disjoint(t);});
   c.projectile(c.target,1,t=>c.damage(t,999),undefined,undefined,{onDisjoint:position=>{positions.push({...position});c.projectile(c.target,100,t=>c.damage(t,10));}});
  };
  const w=fixture();w.step(.5);
  expect(positions).toHaveLength(1);expect(positions[0]).toEqual({x:0,y:0});
  expect(w.t.taken).toBe(110);expect(w.b.events.filter(e=>e.type==='hit'&&Number(e.amount)>0).map(e=>e.amount)).toEqual([100,10]);
 }));
 it('freezes the last flight position for invisibility disjoint and never later impacts',()=>withProgram(program=>{
  const positions:{x:number;y:number}[]=[];
  program.projectileDisjointable=true;program.projectileDisjointOnInvisibility=true;program.castPoint=0;
  program.cast=c=>c.projectile(c.target,1,t=>c.damage(t,999),undefined,undefined,{onDisjoint:position=>positions.push({...position})});
  const w=fixture();w.step(.3);const live=(w.b.projectiles as {x:number;y:number}[])[0];expect(live.x).toBeGreaterThan(0);const position={x:live.x,y:live.y};
  w.t.statuses.push({kind:'invisible',until:100});w.step(FIXED_STEP);w.step(4);
  expect(positions).toEqual([position]);expect(w.t.taken).toBe(0);expect(w.b.projectiles).toEqual([]);
 }));
});
