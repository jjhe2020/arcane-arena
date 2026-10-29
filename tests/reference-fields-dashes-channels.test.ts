import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {applyDamage,createBattle,FIXED_STEP,restoreBattle,serializeBattle,statusValue,stepBattle} from '../src/combat';
import {getSkillProgram,type EffectStatus} from '../src/skill-effects';
import {barrierBlocksUnit,type BattleBarrier} from '../src/combat/barriers';
import type {BattleState,CombatUnit,Player,SkillDefinition,SkillStack} from '../src/model';

const ARENA='mars_arena_of_blood',SPIRIT='custom_elder_titan_ancestral_spirit',STEP='void_spirit_astral_step',HOLE='enigma_black_hole',BLAST='techies_suicide',PACT='custom_slark_dark_pact';
const definitions=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
function player(id:number,loadouts:SkillStack[][]):Player{return{id,name:'P',hp:100,gold:0,shopLevel:1,locked:false,reserve:[],shop:[],heroes:loadouts.map((skills,i)=>({id:`h${i}`,name:`H${i}`,role:'mage',skin:'male',x:i*2,y:-2,skills}))};}
function match(id:string,points=3,enemySkill?:string,allies=1,enemies=1){
 const b=createBattle(player(0,[[{id,points}],...Array.from({length:allies-1},()=>[])]),player(1,[enemySkill?[{id:enemySkill,points:3}]:[],...Array.from({length:enemies-1},()=>[])]),119,definitions),a=b.units.filter(u=>u.side===0),e=b.units.filter(u=>u.side===1);
 for(const u of b.units){u.nextAttack=1000;u.moveSpeed=0;u.hp=u.maxHp=1e6;u.mana=u.maxMana=10000;u.attack=100;u.armor=0;u.magicResist=0;u.statuses.push({kind:'disarm',until:1000});}
 for(const[i,u]of a.entries()){u.x=i*9;u.y=-2;u.facing=Math.PI/2;}
 for(const[i,u]of e.entries()){u.x=i*9;u.y=0;u.facing=-Math.PI/2;}
 return{b,u:a[0],t:e[0],ally:a[1],other:e[1],allies:a,enemies:e};
}
const advance=(b:BattleState,seconds:number)=>stepBattle(b,seconds,definitions);
const hits=(b:BattleState,id:string,t?:CombatUnit)=>b.events.filter(e=>e.type==='hit'&&e.skill===id&&(!t||e.target===t.id)&&(e.amount??0)>0);
function castOnce(b:BattleState,id:string,caster?:CombatUnit){const beginning=b.events.length;for(let i=0;i<90;i++){advance(b,FIXED_STEP);const e=b.events.slice(beginning).find(e=>e.type==='cast'&&e.skill===id&&(!caster||e.source===caster.id));if(e){const u=b.units.find(u=>u.id===e.source)!;if(id!==HOLE||!u.blackHoleRefresh)u.cooldowns[u.skills.findIndex(s=>s?.id===id)]=1000;return e.time;}}throw new Error(`No cast: ${id}`);}
const marks=(u:CombatUnit)=>u.statuses.filter(s=>(s as EffectStatus).data?.astralStepMark) as EffectStatus[];

describe('Arena of Blood reference results',()=>{
 it('FIELD-01 formation precedes the complete AA arena duration at the frozen ground cursor',()=>{
  const{b,u,t}=match(ARENA),at=castOnce(b,ARENA);expect(u.mana).toBe(9750);t.x=10;advance(b,.3-FIXED_STEP);expect((b.arenas as unknown[]|undefined)?.length??0).toBe(0);advance(b,FIXED_STEP);const arena=(b.arenas as {x:number;y:number;until:number}[])[0];expect(arena.x).toBe(0);expect(arena.y).toBe(0);expect(arena.until-at).toBeCloseTo(5.3,6);
 });
 it('FIELD-02 a hero near the inner wall takes one spear and moves continuously inward without a stun',()=>{
  const{b,t}=match(ARENA),at=castOnce(b,ARENA);t.x=4.5;advance(b,.4);expect(hits(b,ARENA,t)).toHaveLength(1);expect(hits(b,ARENA,t)[0].amount).toBe(225);expect(t.statuses.some(s=>s.kind==='stun')).toBe(false);const x=t.x;advance(b,.1);expect(t.x).toBeLessThan(x);advance(b,.2);expect(t.x).toBeCloseTo(2.9,4);expect(hits(b,ARENA,t)[0].time-at).toBeCloseTo(.4,6);
 });
 it('FIELD-03 the same hero cannot take a second spear during its independent one-second cooldown',()=>{
  const{b,t}=match(ARENA);castOnce(b,ARENA);t.x=4.5;advance(b,.65);t.x=4.5;advance(b,.3);expect(hits(b,ARENA,t)).toHaveLength(1);advance(b,.5);expect(hits(b,ARENA,t)).toHaveLength(2);
 });
 it('FIELD-04 Super regeneration begins after formation, only covers allies inside, and lingers for half a second',()=>{
  const{b,u,ally}=match(ARENA,6,undefined,2);u.hp=5e5;ally.hp=5e5;castOnce(b,ARENA);expect(statusValue(u,'regen')).toBe(0);advance(b,.3);expect(statusValue(u,'regen')).toBe(180);expect(statusValue(ally,'regen')).toBe(0);u.x=10;advance(b,.4);expect(statusValue(u,'regen')).toBe(180);advance(b,.2);expect(statusValue(u,'regen')).toBe(0);
 });
 it('FIELD-05 Gaben lava deals fifty magical pulses totaling 1500 over the five-second arena',()=>{
  const{b,t}=match(ARENA,9);castOnce(b,ARENA);advance(b,5.5);const lava=hits(b,ARENA,t);expect(lava).toHaveLength(50);expect(lava.every(e=>e.damageType==='magical'&&e.flags?.damageOverTime)).toBe(true);expect(lava.reduce((n,e)=>n+e.amount!,0)).toBe(1500);
 });
 it('FIELD-06 enemy ranged attack projectiles are negated while melee attacks can cross the same wall',()=>{
  for(const ranged of [false,true]){const{b,u,t}=match(ARENA);castOnce(b,ARENA);advance(b,.3);u.x=ranged?0:4.4;u.y=0;t.x=ranged?7:5.6;t.y=0;t.facing=Math.PI;t.range=ranged?10:1.6;t.nextAttack=b.time;t.statuses=t.statuses.filter(s=>s.kind!=='disarm');advance(b,1);const attacks=b.events.filter(e=>e.type==='hit'&&e.source===t.id);if(ranged){expect(attacks.some(e=>e.outcome==='arenaBlocked')).toBe(true);expect(attacks.some(e=>(e.amount??0)>0)).toBe(false);}else expect(attacks.some(e=>(e.amount??0)>0)).toBe(true);}
 });
 it('FIELD-07 Acorn attack projectiles are blocked but an actual Arcane Bolt projectile crosses the arena',()=>{
  for(const id of ['hoodwink_acorn_shot','custom_skywrath_mage_arcane_bolt']){const{b,u,t}=match(ARENA,3,id);t.cooldowns[0]=1000;castOnce(b,ARENA);advance(b,.3);u.x=0;u.y=0;t.x=7;t.y=0;t.statuses.push({kind:'castRange',until:100,value:10});t.cooldowns[0]=b.time;advance(b,2);if(id==='hoodwink_acorn_shot'){expect(b.events.some(e=>e.source===t.id&&e.outcome==='arenaBlocked')).toBe(true);expect(hits(b,id,u)).toHaveLength(0);}else expect(hits(b,id,u).length).toBeGreaterThan(0);}
 });
 it('FIELD-08 flight and spell immunity bypass only the explicitly exempted arena movement wall',()=>{
  const{b,t}=match(ARENA);castOnce(b,ARENA);advance(b,.3);const wall=(b.barriers as BattleBarrier[])[0];expect(barrierBlocksUnit(t,wall)).toBe(true);for(const kind of ['fly','flying','magicImmune']){t.statuses.push({kind,until:100});expect(barrierBlocksUnit(t,wall)).toBe(false);t.statuses=t.statuses.filter(s=>s.kind!==kind);}
 });
 it('FIELD-09 an already released arena forms and keeps dealing damage after its caster dies',()=>{
  const{b,u,t}=match(ARENA,9,undefined,2);castOnce(b,ARENA);applyDamage(b,t,u,2e6,'pure','kill');advance(b,.5);expect((b.arenas as unknown[]).length).toBe(1);expect(hits(b,ARENA,t).length).toBeGreaterThan(0);
 });
});

describe('Astral Spirit reference results',()=>{
 it('SPIRIT-01 the spirit contacts the selected point immediately and grants bonuses only on its return',()=>{
  const{b,u,t}=match(SPIRIT);u.y=-8;const at=castOnce(b,SPIRIT);expect(hits(b,SPIRIT,t)).toHaveLength(1);expect(hits(b,SPIRIT,t)[0].time).toBe(at);expect(statusValue(u,'attackBonus')).toBe(0);advance(b,.7);expect(statusValue(u,'attackBonus')).toBe(0);advance(b,.15);expect(statusValue(u,'attackBonus')).toBe(32);expect(statusValue(u,'armor')).toBe(6);expect(statusValue(u,'haste')).toBeCloseTo(.08);
 });
 it('SPIRIT-02 contact along the homing return path hits each body once rather than once per frame',()=>{
  const{b,u,t,other}=match(SPIRIT,3,undefined,1,2);u.y=-8;other.x=10;castOnce(b,SPIRIT);other.x=0;other.y=-4;advance(b,1);expect(hits(b,SPIRIT,t)).toHaveLength(1);expect(hits(b,SPIRIT,other)).toHaveLength(1);expect(statusValue(u,'attackBonus')).toBe(64);
 });
 it('SPIRIT-03 Super adds forty per hero and five per creep exactly once to the final return values',()=>{
  const{b,u}=match(SPIRIT,6);castOnce(b,SPIRIT);advance(b,.3);expect(statusValue(u,'attackBonus')).toBe(72);
 });
 it('SPIRIT-04 actual Mirror Image illusions take contact damage without adding hero or creep bonuses',()=>{
  const{b,u,t}=match(SPIRIT,3,'custom_naga_siren_mirror_image');u.cooldowns[0]=1000;advance(b,.9);expect(b.units.some(v=>v.side===1&&v.illusion)).toBe(true);for(const v of b.units.filter(v=>v.side===1)){v.x=0;v.y=0;v.cooldowns=v.cooldowns.map(()=>1000);v.moveSpeed=0;v.nextAttack=1000;}u.cooldowns[0]=b.time;castOnce(b,SPIRIT);advance(b,.4);expect(hits(b,SPIRIT).some(e=>b.units.find(v=>v.id===e.target)?.illusion)).toBe(true);expect(statusValue(u,'attackBonus')).toBe(32);expect(t.dead).toBe(false);
 });
 it('SPIRIT-05 an actual Spirit Bear counts as a creep rather than a hero for damage, armor and Gaben duration',()=>{
  const{b,u}=match(SPIRIT,9,'custom_lone_druid_spirit_bear');u.cooldowns[0]=1000;advance(b,.8);const bear=b.units.find(v=>v.extraSpiritBear)!;expect(bear).toBeDefined();for(const v of b.units.filter(v=>v.side===1)){v.x=0;v.y=0;v.cooldowns=v.cooldowns.map(()=>1000);v.moveSpeed=0;v.nextAttack=1000;}u.cooldowns[0]=b.time;castOnce(b,SPIRIT);advance(b,.4);expect(statusValue(u,'attackBonus')).toBe(92);expect(statusValue(u,'armor')).toBe(7);const immunity=u.statuses.find(s=>s.kind==='magicImmune'&&s.skill===SPIRIT)!;expect(immunity.until-b.time).toBeGreaterThan(1);expect(immunity.until-b.time).toBeLessThan(1.5);
 });
 it('SPIRIT-06 a no-contact return does not place or refresh a previous bonus',()=>{
  const{b,u,t}=match(SPIRIT);castOnce(b,SPIRIT);advance(b,.3);const original=u.statuses.find(s=>s.kind==='attackBonus'&&s.skill===SPIRIT)!.until;u.cooldowns[0]=b.time;advance(b,FIXED_STEP);t.x=10;advance(b,.8);expect(u.statuses.find(s=>s.kind==='attackBonus'&&s.skill===SPIRIT)!.until).toBe(original);
 });
 it('SPIRIT-07 Gaben return applies a basic dispel and adds its duration to the previous immunity',()=>{
  const{b,u}=match(SPIRIT,9);u.statuses.push({kind:'slow',until:100,value:.5,harmful:true,dispel:'basic'} as EffectStatus);castOnce(b,SPIRIT);advance(b,.3);expect(statusValue(u,'slow')).toBe(0);const first=u.statuses.find(s=>s.kind==='magicImmune'&&s.skill===SPIRIT)!.until;u.cooldowns[0]=b.time;castOnce(b,SPIRIT);advance(b,.3);expect(u.statuses.find(s=>s.kind==='magicImmune'&&s.skill===SPIRIT)!.until).toBeCloseTo(first+1.5,6);
 });
 it('SPIRIT-08 caster death prevents return buffs and further return-path contacts',()=>{
  const{b,u,t,other}=match(SPIRIT,9,undefined,2,2);u.y=-8;other.x=10;castOnce(b,SPIRIT);applyDamage(b,t,u,2e6,'pure','kill');other.x=0;other.y=-4;advance(b,1);expect(statusValue(u,'attackBonus')).toBe(0);expect(hits(b,SPIRIT,other)).toHaveLength(0);
 });
 it('SPIRIT-09 actual Demonic Purge removes all three dispellable returned bonuses',()=>{
  const{b,u,t}=match(SPIRIT,3,'custom_shadow_demon_demonic_purge');t.cooldowns[0]=1000;castOnce(b,SPIRIT);advance(b,.3);expect(statusValue(u,'attackBonus')).toBe(32);t.cooldowns[0]=b.time;advance(b,.6);expect(b.events.some(e=>e.type==='cast'&&e.skill==='custom_shadow_demon_demonic_purge')).toBe(true);for(const kind of ['attackBonus','armor','haste'])expect(u.statuses.some(s=>s.kind===kind&&s.skill===SPIRIT)).toBe(false);
 });
 it('SPIRIT-10 movement bonuses cap at forty percent while hero damage and armor remain uncapped',()=>{
  const{b,u,enemies}=match(SPIRIT,3,undefined,1,8);for(const[i,t]of enemies.entries()){t.x=i*.03;t.y=0;}castOnce(b,SPIRIT);advance(b,.3);expect(statusValue(u,'haste')).toBe(.4);expect(statusValue(u,'attackBonus')).toBe(256);expect(statusValue(u,'armor')).toBe(48);
 });
});

describe('Astral Step reference results',()=>{
 it('STEP-01 the minimum jump is two world units and the path radius is 170 reference units',()=>{
  const{b,u,t,other}=match(STEP,3,undefined,1,2);u.y=-1;t.y=0;other.x=1.6;other.y=0;castOnce(b,STEP);expect(u.y).toBeCloseTo(1);expect(hits(b,STEP,other).some(e=>e.category==='attack')).toBe(true);expect(b.events.some(e=>e.status==='projectileDisjoint'&&e.skill===STEP)).toBe(false);
 });
 it('STEP-02 path attacks have true strike, ignore disarm and invisibility, and exclude cleave',()=>{
  const{b,u,t,other}=match(STEP,3,undefined,1,2);other.x=3;other.y=0;t.statuses.push({kind:'evasion',until:100,value:1},{kind:'invisible',until:100});u.statuses.push({kind:'cleave',until:100,value:1,skill:'probe',data:{radius:10}} as EffectStatus);t.statuses.push({kind:'revealed',until:100});castOnce(b,STEP);expect(hits(b,STEP,t).find(e=>e.category==='attack')?.amount).toBe(100);expect(hits(b,'probe',other)).toHaveLength(0);
 });
 it('STEP-03 a void mark explodes on resistance-scaled expiry with the released damage snapshot',()=>{
  const{b,u,t}=match(STEP);t.statuses.push({kind:'statusResistance',until:100,value:.5});const at=castOnce(b,STEP);u.skills[0]=null;expect(marks(t)).toHaveLength(1);advance(b,.6);expect(hits(b,STEP,t).filter(e=>e.category==='spell')).toHaveLength(0);advance(b,FIXED_STEP);const damage=hits(b,STEP,t).find(e=>e.category==='spell')!;expect(damage.amount).toBe(350);expect(damage.time-at).toBeCloseTo(19*FIXED_STEP,6);expect(marks(t)).toHaveLength(0);
 });
 it('STEP-04 a real Dark Pact strong dispel detonates the mark early and exactly once',()=>{
  const{b,u,t}=match(STEP,3,PACT);u.cooldowns[0]=1.1;const at=castOnce(b,STEP);u.statuses.push({kind:'silence',until:100});advance(b,.9);const damage=hits(b,STEP,t).filter(e=>e.category==='spell');expect(damage).toHaveLength(1);expect(damage[0].time-at).toBeLessThan(1.25);advance(b,1);expect(hits(b,STEP,t).filter(e=>e.category==='spell')).toHaveLength(1);
 });
 it('STEP-05 repeated casts keep two independent marks and both explode once',()=>{
  const{b,u,t}=match(STEP),first=castOnce(b,STEP);u.cooldowns[0]=b.time;advance(b,.3);u.cooldowns[0]=1000;expect(marks(t)).toHaveLength(2);advance(b,first+1.7-b.time);expect(hits(b,STEP,t).filter(e=>e.category==='spell')).toHaveLength(2);
 });
 it('STEP-06 a mark survives source death and retains its source ability statistics',()=>{
  const{b,u,t}=match(STEP,3,undefined,2);castOnce(b,STEP);applyDamage(b,t,u,2e6,'pure','kill');advance(b,1.4);expect(hits(b,STEP,t).find(e=>e.category==='spell')?.amount).toBe(350);expect(u.abilityStats?.find(s=>s.abilityId===STEP)?.damage).toBe(450);
 });
 it('STEP-07 Super critical competes with stronger criticals instead of multiplying into them',()=>{
  const{b,u,t}=match(STEP,6);u.statuses.push({kind:'critChance',until:100,value:1,skill:'probeCrit'},{kind:'critMultiplier',until:100,value:4,skill:'probeCrit'});castOnce(b,STEP);expect(hits(b,STEP,t).find(e=>e.category==='attack')?.amount).toBe(400);
 });
 it('STEP-08 normal and Gaben charges are finite and restore sequentially at the final charge time',()=>{
  for(const points of [3,9]){const{b,u}=match(STEP,points);advance(b,2);const casts=b.events.filter(e=>e.type==='cast'&&e.skill===STEP);expect(casts).toHaveLength(points===9?4:2);const state=u[`charges:${STEP}`] as {count:number;maximum:number;next:number};expect(state.maximum).toBe(points===9?4:2);expect(state.next-casts[0].time).toBeCloseTo(points===9?14:18);const old=casts.length;advance(b,state.next+.4-b.time);expect(b.events.filter(e=>e.type==='cast'&&e.skill===STEP)).toHaveLength(old+1);}
 });
 it('STEP-09 root blocks a new step order without spending mana or charges',()=>{
  const{b,u}=match(STEP);u.statuses.push({kind:'root',until:10});advance(b,.5);expect(b.events.some(e=>e.type==='cast'&&e.skill===STEP)).toBe(false);expect(u.mana).toBe(10000);expect((u[`charges:${STEP}`] as {count:number}).count).toBe(2);
 });
 it('STEP-10 a real allied Chakra basic dispel detonates the mark without waiting for natural expiry',()=>{
  const{b,u,t,other}=match(STEP,3,undefined,1,2);other.skills=[{id:'keeper_of_the_light_chakra_magic',points:6}];other.cooldowns=[1000];other.mana=10000;t.mana=1000;const at=castOnce(b,STEP);u.statuses.push({kind:'silence',until:100});other.x=2;other.y=0;other.cooldowns[0]=b.time;advance(b,.5);expect(b.events.some(e=>e.target===t.id&&e.status==='basicDispel')).toBe(true);const damage=hits(b,STEP,t).filter(e=>e.category==='spell');expect(damage).toHaveLength(1);expect(damage[0].time-at).toBeLessThan(1.25);advance(b,1.2);expect(hits(b,STEP,t).filter(e=>e.category==='spell')).toHaveLength(1);
 });
});

describe('Black Hole reference results',()=>{
 it('HOLE-01 disables immediately but deals exactly four pure pulses at one through four seconds',()=>{
  const{b,t}=match(HOLE),at=castOnce(b,HOLE);expect(t.statuses.some(s=>s.kind==='stun'&&s.skill===HOLE)).toBe(true);advance(b,.9);expect(hits(b,HOLE,t)).toHaveLength(0);advance(b,3.2);const damage=hits(b,HOLE,t);expect(damage).toHaveLength(4);damage.forEach((e,i)=>{expect(e.time-at).toBeCloseTo(i+1,6);expect(e.amount).toBe(100);expect(e.damageType).toBe('pure');});expect(t.statuses.some(s=>s.kind==='stun'&&s.skill===HOLE)).toBe(false);
 });
 it('HOLE-02 Super adds its final DPS once and disable ignores immunity, status resistance and dispel',()=>{
  const{b,t}=match(HOLE,6,PACT);t.statuses.push({kind:'magicImmune',until:100},{kind:'statusResistance',until:100,value:.9});castOnce(b,HOLE);expect(t.statuses.find(s=>s.kind==='stun'&&s.skill===HOLE)!.until-b.time).toBeCloseTo(.5);advance(b,1.1);expect(hits(b,HOLE,t)[0].amount).toBe(200);expect(t.statuses.some(s=>s.kind==='stun'&&s.skill===HOLE)).toBe(true);
 });
 it('HOLE-03 a real Lucent Beam interrupt removes only this channel control and prevents later pulses',()=>{
  const{b,u,t,other}=match(HOLE,3,undefined,1,2);other.skills=[{id:'custom_luna_lucent_beam',points:3}];other.cooldowns=[1000];other.statuses.push({kind:'castRange',until:100,value:20});castOnce(b,HOLE);advance(b,1.1);const before=hits(b,HOLE,t).length;other.cooldowns[0]=b.time;t.statuses.push({kind:'stun',until:100,skill:'independent_control'});advance(b,.5);expect(b.events.some(e=>e.skill==='custom_luna_lucent_beam'&&e.status==='stun'&&e.target===u.id)).toBe(true);expect(t.statuses.some(s=>s.kind==='stun'&&s.skill===HOLE)).toBe(false);expect(t.statuses.some(s=>s.skill==='independent_control')).toBe(true);advance(b,2);expect(hits(b,HOLE,t)).toHaveLength(before);
 });
 it('HOLE-04 a late entrant is disabled on contact but shares the original global damage clock',()=>{
  const{b,other}=match(HOLE,3,undefined,1,2),at=castOnce(b,HOLE);advance(b,1.5);other.x=1;other.y=0;advance(b,.1);expect(other.statuses.some(s=>s.kind==='stun'&&s.skill===HOLE)).toBe(true);expect(hits(b,HOLE,other)).toHaveLength(0);advance(b,.5);expect(hits(b,HOLE,other)[0].time-at).toBeCloseTo(2,6);
 });
 it('HOLE-05 Gaben refresh includes its own slot once while leaving the channel running',()=>{
  const{b,u}=match(HOLE,9);u.skills.push({id:'custom_luna_lucent_beam',points:3});u.cooldowns.push(1000);const at=castOnce(b,HOLE);expect(u.cooldowns[0]).toBe(at);expect(u.cooldowns[1]).toBe(at);expect(u.action).toBe('channel');advance(b,4.4);const casts=b.events.filter(e=>e.type==='cast'&&e.skill===HOLE);expect(casts).toHaveLength(2);expect(u.cooldowns[0]).toBeGreaterThan(casts[1].time+100);
 });
 it('HOLE-06 caster death ends its channel and removes its disable without clearing another caster Black Hole',()=>{
  const{b,u,t,ally}=match(HOLE,3,undefined,2);ally.x=1;ally.y=-2;ally.skills=[{id:HOLE,points:3}];ally.cooldowns=[0];castOnce(b,HOLE,u);advance(b,.1);expect(t.statuses.filter(s=>s.kind==='stun'&&s.skill===HOLE)).toHaveLength(2);applyDamage(b,t,u,2e6,'pure','kill');advance(b,.1);const active=t.statuses.filter(s=>s.kind==='stun'&&s.skill===HOLE);expect(active).toHaveLength(1);expect(active[0].source).toBe(ally.id);advance(b,1);expect(hits(b,HOLE,t).some(e=>e.source===ally.id)).toBe(true);expect(hits(b,HOLE,t).some(e=>e.source===u.id)).toBe(false);
 });
});

describe('Blast Off reference results',()=>{
 it('BLAST-01 uses the historical one-second windup and a continuous fixed three-quarter-second leap',()=>{
  const{b,u,t}=match(BLAST);const mana=u.mana;advance(b,1);expect(b.events.some(e=>e.type==='cast'&&e.skill===BLAST)).toBe(false);expect(u.mana).toBe(mana);const at=castOnce(b,BLAST);expect(u.mana).toBe(9825);expect(u.y).toBeGreaterThan(-2);expect(u.y).toBeLessThan(0);advance(b,.7);expect(hits(b,BLAST,t)).toHaveLength(0);advance(b,.1);expect(hits(b,BLAST,t)[0].time-at).toBeCloseTo(23*FIXED_STEP,6);expect(u.warpSequence??0).toBe(0);
 });
 it('BLAST-02 landing order is silence then enemy damage then self damage then the Super stun',()=>{
  const{b,u,t}=match(BLAST,6);castOnce(b,BLAST);advance(b,.8);const events=b.events.filter(e=>e.skill===BLAST),silence=events.findIndex(e=>e.status==='silence'&&e.target===t.id),damage=events.findIndex(e=>e.type==='hit'&&e.target===t.id),self=events.findIndex(e=>e.type==='hit'&&e.target===u.id),stun=events.findIndex(e=>e.status==='stun'&&e.target===t.id);expect(silence).toBeGreaterThan(-1);expect(damage).toBeGreaterThan(silence);expect(self).toBeGreaterThan(damage);expect(stun).toBeGreaterThan(self);expect(u.cooldowns[0]).toBe(1000);
 });
 it('BLAST-03 self damage retains magic resistance but ignores generic amplifiers and reductions',()=>{
  const{b,u}=match(BLAST);u.hp=u.maxHp=1000;u.magicResist=.25;u.statuses.push({kind:'spellAmp',until:100,value:2},{kind:'damageReduction',until:100,value:.8},{kind:'magicVulnerability',until:100,value:2},{kind:'damageVulnerability',until:100,value:2});castOnce(b,BLAST);advance(b,.8);const self=hits(b,BLAST,u)[0];expect(self.amount).toBeCloseTo(150);expect(self.flags?.nonLethal).toBe(true);expect(self.flags?.healthRemoval).not.toBe(true);expect(u.taken).toBeCloseTo(150);
 });
 it('BLAST-04 an actual allied Aphotic Shield absorbs the real self-damage event',()=>{
  const{b,u,ally}=match(BLAST,3,undefined,2);u.hp=100;u.maxHp=1000;ally.x=1;ally.y=-2;ally.skills=[{id:'custom_abaddon_aphotic_shield',points:3}];ally.cooldowns=[0];castOnce(b,BLAST);expect(u.statuses.some(s=>s.kind==='shield'&&s.skill==='custom_abaddon_aphotic_shield')).toBe(true);advance(b,.8);expect(hits(b,BLAST,u)).toHaveLength(0);expect(u.absorbed).toBe(20);const shield=u.abilityStats?.find(s=>s.abilityId==='custom_abaddon_aphotic_shield');expect(shield?.absorbed).toBe(u.absorbed);expect(shield?.sourceUnitId).toBe(ally.id);
 });
 it.each(['stun','silence','root'])('BLAST-05 a %s received during the already released leap does not cancel landing',kind=>{
  const{b,u,t}=match(BLAST);castOnce(b,BLAST);u.statuses.push({kind,until:10});advance(b,.8);expect(hits(b,BLAST,t)).toHaveLength(1);
 });
 it('BLAST-06 actual hostile Inner Fire movement cancels the leap and every landing effect',()=>{
  const{b,u,t}=match(BLAST,3,'custom_huskar_inner_fire');t.cooldowns[0]=1000;castOnce(b,BLAST);t.cooldowns[0]=b.time;advance(b,1);expect(b.events.some(e=>e.type==='cast'&&e.skill==='custom_huskar_inner_fire')).toBe(true);expect(hits(b,BLAST,t)).toHaveLength(0);expect(hits(b,BLAST,u)).toHaveLength(0);expect(t.statuses.some(s=>s.skill===BLAST&&s.kind==='silence')).toBe(false);
 });
 it('BLAST-07 Gaben invulnerability starts on release, covers flight and expires three seconds after release',()=>{
  const{b,u,t}=match(BLAST,9),at=castOnce(b,BLAST),invul=u.statuses.find(s=>s.kind==='invulnerable'&&s.skill===BLAST)!;expect(at).toBe(FIXED_STEP);expect(invul.until-at).toBe(3);expect(applyDamage(b,t,u,100,'pure','probe')).toBe(0);advance(b,.8);expect(hits(b,BLAST,t)).toHaveLength(1);expect(hits(b,BLAST,u)).toHaveLength(0);advance(b,2.3);expect(applyDamage(b,t,u,100,'pure','probe')).toBe(100);
 });
 it('BLAST-08 Gaben adds two world units to explosion radius without importing the modern silence-to-stun replacement',()=>{
  const{b,t,other}=match(BLAST,9,undefined,1,2);castOnce(b,BLAST);other.x=5;other.y=0;advance(b,.8);expect(hits(b,BLAST,other)).toHaveLength(1);expect(statusValue(other,'silence')).toBe(0);expect(other.statuses.some(s=>s.kind==='silence'&&s.skill===BLAST)).toBe(true);expect(t.statuses.some(s=>s.kind==='silence'&&s.skill===BLAST)).toBe(true);
 });
 it('BLAST-09 the self cost uses current health instead of maximum health and remains nonlethal at one HP',()=>{
  const{b,u}=match(BLAST);u.hp=100;u.maxHp=1000;castOnce(b,BLAST);advance(b,23*FIXED_STEP);const amount=hits(b,BLAST,u)[0].amount!;expect(amount).toBeCloseTo((u.hp+amount)*.2,6);expect(amount).toBeLessThan(25);
  const low=match(BLAST);low.u.hp=low.u.maxHp=1;castOnce(low.b,BLAST);advance(low.b,.8);expect(low.u.hp).toBe(1);expect(low.u.dead).toBe(false);expect(low.u.taken).toBe(0);
 });
 it('BLAST-10 immune enemies take no explosion damage, silence or Super stun while self cost still occurs',()=>{
  const{b,u,t}=match(BLAST,6);t.statuses.push({kind:'magicImmune',until:100});castOnce(b,BLAST);advance(b,.8);expect(hits(b,BLAST,t)).toHaveLength(0);expect(t.statuses.some(s=>s.skill===BLAST)).toBe(false);expect(hits(b,BLAST,u)).toHaveLength(1);
 });
 it('BLAST-11 a real Nether Swap during the last leap frames cancels rather than impersonating a natural motion end',()=>{
  const{b,u,t}=match(BLAST,3,'vengefulspirit_nether_swap');t.cooldowns[0]=1000;const at=castOnce(b,BLAST);t.cooldowns[0]=at+.3;advance(b,.8);expect(b.events.some(e=>e.type==='cast'&&e.skill==='vengefulspirit_nether_swap')).toBe(true);expect(Number(u.warpSequence)).toBeGreaterThan(0);expect(hits(b,BLAST,t)).toHaveLength(0);expect(hits(b,BLAST,u)).toHaveLength(0);
 });
 it('BLAST-12 Super enables the thirteen-unit ground order and commits a fifteen-second cooldown',()=>{
  for(const points of [3,6]){const{b,u,t}=match(BLAST,points);u.y=-10;t.y=3;advance(b,1.2);const cast=b.events.find(e=>e.type==='cast'&&e.skill===BLAST);if(points===3){expect(cast).toBeUndefined();expect(u.mana).toBe(10000);}else{expect(cast).toBeDefined();expect(cast!.toY).toBe(3);expect(u.cooldowns[0]-cast!.time).toBeCloseTo(15,6);}}
 });
 it('FIELD-REPLAY-01 channel pulses and delayed mark callbacks reconstruct from the recorded initial setup',()=>{
  for(const id of [HOLE,STEP,BLAST]){const a=player(0,[[{id,points:9}]]),e=player(1,[[]]),b=createBattle(a,e,139,definitions);advance(b,.5);const restored=restoreBattle(serializeBattle(b),definitions);advance(b,1);advance(restored,1);expect(restored.events).toEqual(b.events);expect(restored.units).toEqual(b.units);}
 });
});
