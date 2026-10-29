import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {applyDamage,createBattle,stepBattle,serializeBattle,restoreBattle} from '../src/combat';
import {skillBalance} from '../src/config';
import type {BattleState,Player,SkillDefinition,SkillStack} from '../src/model';
import type {EffectStatus} from '../src/skill-effects';
const definitions=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
const ARC='custom_zuus_arc_lightning',BOLT='custom_skywrath_mage_arcane_bolt',SEAL='custom_skywrath_mage_ancient_seal',ACID='custom_alchemist_acid_spray',BLINK='custom_queenofpain_blink',MISSILE='custom_vengefulspirit_magic_missile';
const definition=(id:string)=>definitions.find(d=>d.id===id)!;
const projectiles=(b:BattleState)=>b.projectiles as {skill:string;target:string}[];
function player(id:number,skills:SkillStack[]=[],count=1):Player{return {id,name:'P',gold:0,hp:100,shopLevel:1,locked:false,shop:[],reserve:[],heroes:Array.from({length:count},(_,i)=>({id:`h${i}`,name:'H',skin:'male',role:'mage',x:i*2,y:-3,skills:i===0?skills:[]}))};}
function match(id:string,points=3,count=3){
 const b=createBattle(player(0,[{id,points}]),player(1,[],count),33,definitions),u=b.units[0],targets=b.units.slice(1);
 u.x=0;u.y=-3;u.facing=Math.PI/2;
 for(const [index,t]of targets.entries()){t.x=index*2;t.y=0;t.statuses.push({kind:'stun',until:100});t.hp=t.maxHp=100000;t.magicResist=0;t.armor=0;}
 for(const t of b.units){t.nextAttack=100;t.moveSpeed=0;}
 const hits=()=>b.events.filter(e=>e.type==='hit'&&e.skill===id&&(e.amount??0)>0);
 return {b,u,targets,t:targets[0],hits};
}
describe('reference projectile, field and Skywrath clauses',()=>{
 it('Arc Lightning damages one new victim per historical bounce interval instead of all on release',()=>{
  const {b,hits}=match(ARC,3);stepBattle(b,.24,definitions);expect(hits()).toHaveLength(1);
  stepBattle(b,.27,definitions);expect(hits()).toHaveLength(2);
  stepBattle(b,.27,definitions);expect(hits()).toHaveLength(3);
  expect(new Set(hits().map(e=>e.target)).size).toBe(3);
  for(let i=1;i<hits().length;i++)expect(hits()[i].time-hits()[i-1].time).toBeCloseTo(8/30,8);
 });
 it('Arc Lightning searches current positions and skips hidden, immune and already-hit units at the next jump',()=>{
  const {b,t,targets,hits}=match(ARC,3,4);stepBattle(b,.24,definitions);
  targets[1].statuses.push({kind:'invisible',until:100});targets[2].statuses.push({kind:'magicImmune',until:100});targets[3].x=4;
  stepBattle(b,.6,definitions);expect(hits().map(e=>e.target)).toEqual([t.id,targets[3].id]);
 });
 it('Arc Lightning chooses the nearest eligible jump rather than a random farther unit',()=>{
  const {b,t,targets,hits}=match(ARC,3,4);targets[1].x=4;targets[2].x=1;targets[3].x=3;
  stepBattle(b,.6,definitions);expect(hits().slice(0,2).map(e=>e.target)).toEqual([t.id,targets[2].id]);
 });
 it('Arc Lightning Gaben amplification and spell lifesteal use the effective compiled damage once',()=>{
  const {b,u,t,hits}=match(ARC,9,1);u.hp=100;const old=u.hp;stepBattle(b,.25,definitions);
  expect(hits()[0].amount).toBeCloseTo(250*1.2);expect(u.hp-old).toBeGreaterThanOrEqual(60);
  expect(t.taken).toBeCloseTo(300);
 });
 it('Arcane Bolt snapshots intelligence at launch so later Gaben stacks do not amplify an in-flight bolt',()=>{
  const {b,u,t,hits}=match(BOLT,9,1),initial=Number(u.intelligence);stepBattle(b,.2,definitions);
  expect(projectiles(b).some(p=>p.skill===BOLT)).toBe(true);
  applyDamage(b,u,t,1,'pure','separate_spell');expect(Number(u.intelligence)).toBe(initial+2);
  stepBattle(b,.8,definitions);expect(hits()[0].amount).toBeCloseTo(135+initial*1.5);
 });
 it('Arcane Bolt checks independently acquired spell block on impact for both primary and extra bolts',()=>{
  const {b,targets,hits}=match(BOLT,6,3);stepBattle(b,.2,definitions);
  expect(projectiles(b).filter(p=>p.skill===BOLT)).toHaveLength(3);
  for(const t of [targets[0],targets[2]])t.statuses.push({kind:'spellBlock',until:100});
  stepBattle(b,1.5,definitions);expect(hits().map(e=>e.target)).toEqual([targets[1].id]);
  expect(b.events.filter(e=>e.skill===BOLT&&e.status==='spellBlocked')).toHaveLength(2);
 });
 it('Arcane Bolt Super cannot select an invisible or spell-immune secondary target',()=>{
  const {b,targets}=match(BOLT,6,4);targets[1].statuses.push({kind:'invisible',until:100});targets[2].statuses.push({kind:'magicImmune',until:100});
  stepBattle(b,.2,definitions);expect(projectiles(b).filter(p=>p.skill===BOLT).map(p=>p.target).sort()).toEqual([targets[0].id,targets[3].id].sort());
 });
 it('Arcane Bolt Gaben carries independent undispellable stacks and excludes illusion owners',()=>{
  const {b,u,t}=match(BOLT,9,1);u.cooldowns[0]=100;
  applyDamage(b,u,t,1,'pure','spell_a');stepBattle(b,.5,definitions);applyDamage(b,u,t,1,'pure','spell_b');
  const stacks=u.statuses.filter(s=>s.kind==='intelligence') as EffectStatus[];
  expect(stacks).toHaveLength(2);expect(stacks.every(s=>s.dispel==='none')).toBe(true);expect(stacks[1].until-stacks[0].until).toBeCloseTo(.5);
  u.illusion=true;applyDamage(b,u,t,1,'pure','spell_c');expect(u.statuses.filter(s=>s.kind==='intelligence')).toHaveLength(2);
 });
 it('Ancient Seal Gaben has fixed cooldown and stronger victim reduction before any kill and refills mana only on affected death',()=>{
  const {b,u,t}=match(SEAL,9,1);stepBattle(b,.2,definitions);const cast=b.events.find(e=>e.type==='cast'&&e.skill===SEAL)!;
  expect(u.cooldowns[0]-cast.time).toBeCloseTo(6);expect(t.statuses.find(s=>s.kind==='magicResist')?.value).toBeCloseTo(-.61);
  u.mana=1;const cooldown=u.cooldowns[0];applyDamage(b,u,t,t.hp,'pure','finisher');
  expect(u.mana).toBe(u.maxMana);expect(u.cooldowns[0]).toBe(cooldown);expect(u.statuses.some(s=>s.kind==='magicResist')).toBe(false);
 });
 it('Ancient Seal reduction multiplies with independent resistance without amplifying physical or pure damage',()=>{
  const {b,u,t}=match(SEAL,3,1);t.magicResist=.25;t.statuses.push({kind:'magicResist',value:.2,until:100});stepBattle(b,.2,definitions);
  expect(applyDamage(b,u,t,100,'magical','probe')).toBeCloseTo(100*.75*.8*1.45);
  expect(applyDamage(b,u,t,100,'physical','probe')).toBeCloseTo(100);expect(applyDamage(b,u,t,100,'pure','probe')).toBeCloseTo(100);
 });
 it('Ancient Seal secondary application bypasses spell block without generating a second cast',()=>{
  const {b,targets}=match(SEAL,6,2);targets[1].statuses.push({kind:'spellBlock',until:100});stepBattle(b,.2,definitions);
  expect(targets.every(t=>t.statuses.some(s=>s.kind==='silence'))).toBe(true);
  expect(targets[1].statuses.some(s=>s.kind==='spellBlock')).toBe(true);expect(b.events.filter(e=>e.type==='cast'&&e.skill===SEAL)).toHaveLength(1);
 });
 it('Acid Spray applies armor before immediate physical damage and stops damage outside its area',()=>{
  const {b,t,hits}=match(ACID,3,1);stepBattle(b,.27,definitions);expect(hits()).toHaveLength(1);const first=hits()[0];
  expect(t.statuses.find(s=>s.kind==='armor')?.value).toBe(-7);expect(first.amount).toBeGreaterThan(30);
  t.x=12;stepBattle(b,.6,definitions);expect(t.statuses.some(s=>s.kind==='armor')).toBe(false);
  stepBattle(b,.6,definitions);expect(hits()).toHaveLength(1);
 });
 it('Acid Spray Super uses effective Excel values without applying its multiplier twice',()=>{
  const {b,t,hits}=match(ACID,6,1);stepBattle(b,.27,definitions);
  expect(skillBalance(definition(ACID),6)?.params['DAMAGE PER SECOND']).toBe(45);
  expect(t.statuses.find(s=>s.kind==='armor')?.value).toBe(-10.5);expect(hits()).toHaveLength(1);expect(hits()[0].amount).toBeLessThan(90);
 });
 it('Acid Spray starts a newly entering victim immediately and has no lingering damage outside its radius',()=>{
  const {b,targets,hits}=match(ACID,3,2);targets[1].x=10;stepBattle(b,.4,definitions);
  expect(hits().filter(e=>e.target===targets[1].id)).toHaveLength(0);targets[1].x=4;stepBattle(b,1/30,definitions);
  expect(hits().filter(e=>e.target===targets[1].id)).toHaveLength(1);targets[1].x=10;stepBattle(b,1.1,definitions);
  expect(hits().filter(e=>e.target===targets[1].id)).toHaveLength(1);
 });
 it('Acid Spray Gaben is present at battle start and persists after its caster dies while an ally survives',()=>{
  const a=player(0,[{id:ACID,points:9}],2),b=createBattle(a,player(1),44,definitions),[u,ally,t]=b.units;
  expect(b.events.some(e=>e.type==='hit'&&e.skill===ACID&&e.time===0)).toBe(true);
  for(const unit of b.units){unit.nextAttack=100;unit.moveSpeed=0;unit.cooldowns=unit.cooldowns.map(()=>100);}
  t.hp=t.maxHp=100000;ally.statuses.push({kind:'stun',until:100});t.statuses.push({kind:'stun',until:100});applyDamage(b,t,u,100000,'pure','kill');
  const taken=t.taken;stepBattle(b,1.1,definitions);expect(t.taken).toBeGreaterThan(taken);expect(b.finished).toBe(false);
 });
 it('Blink disjoints a Magic Missile while an undisjointable Arcane Bolt keeps pursuing',()=>{
  const a=player(0,[{id:BOLT,points:3}],2);a.heroes[1].skills=[{id:MISSILE,points:3}];
  const q=structuredClone(definition(BLINK));for(const rank of Object.values(q.balanceLevels!))rank.castPoint=0;
  const defs=definitions.map(d=>d.id===BLINK?q:d),b=createBattle(a,player(1,[{id:BLINK,points:3}]),55,defs),t=b.units[2];
  for(const u of b.units){u.nextAttack=100;u.moveSpeed=0;u.hp=u.maxHp=100000;}
  t.statuses.push({kind:'stun',until:100});stepBattle(b,.4,defs);
  expect(projectiles(b).some(p=>p.skill===MISSILE)).toBe(true);expect(projectiles(b).some(p=>p.skill===BOLT)).toBe(true);
  t.statuses=[];stepBattle(b,1/30,defs);expect(b.events.some(e=>e.status==='projectileDisjoint')).toBe(true);
  expect(projectiles(b).some(p=>p.skill===MISSILE)).toBe(false);stepBattle(b,1.5,defs);
  expect(b.events.some(e=>e.type==='hit'&&e.skill===BOLT&&(e.amount??0)>0)).toBe(true);
  expect(b.events.some(e=>e.type==='hit'&&e.skill===MISSILE)).toBe(false);
 });
 it('real catalog chains, stacks and blink replay identically across a mid-battle save',()=>{
  const a=player(0,[{id:ARC,points:9},{id:BOLT,points:9}]),enemy=player(1,[{id:BLINK,points:9}],3),b=createBattle(a,enemy,123,definitions);
  stepBattle(b,1.1,definitions);const restored=restoreBattle(serializeBattle(b),definitions);
  for(let i=0;i<50;i++){stepBattle(b,1/30,definitions);stepBattle(restored,1/30,definitions);}
  expect(restored.events).toEqual(b.events);expect(restored.rng).toBe(b.rng);expect(restored.units).toEqual(b.units);
 });
});
