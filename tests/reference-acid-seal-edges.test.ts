import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {applyDamage,createBattle,FIXED_STEP,getCombatStats,physicalDamageMultiplier,restoreBattle,serializeBattle,statusValue,stepBattle} from '../src/combat';
import type {BattleState,CombatUnit,Player,SkillDefinition,SkillStack} from '../src/model';

const ACID='custom_alchemist_acid_spray',SEAL='custom_skywrath_mage_ancient_seal',PACT='custom_slark_dark_pact',CHAKRA='keeper_of_the_light_chakra_magic';
const definitions=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
function player(id:number,loadouts:SkillStack[][]):Player{return{id,name:'P',hp:100,gold:0,shopLevel:1,locked:false,reserve:[],shop:[],heroes:loadouts.map((skills,i)=>({id:`h${i}`,name:`H${i}`,role:'mage',skin:'male',x:i*2,y:-2,skills}))};}
function match(id:string,points=3,{secondCaster,secondTarget=false,targetSkill,targetSupportSkill}:{secondCaster?:number;secondTarget?:boolean;targetSkill?:string;targetSupportSkill?:string}={}){
 const a=player(0,[[{id,points}],...(secondCaster?[[{id,points:secondCaster}]]:[])]),enemy=player(1,[targetSkill?[{id:targetSkill,points:3}]:[],...(secondTarget?[targetSupportSkill?[{id:targetSupportSkill,points:6}]:[]]:[])]),b=createBattle(a,enemy,97,definitions);
 const casters=b.units.filter(u=>u.side===0),targets=b.units.filter(u=>u.side===1);
 for(const u of b.units){u.nextAttack=1000;u.moveSpeed=0;u.hp=u.maxHp=1e6;u.mana=u.maxMana=10000;u.armor=0;u.magicResist=0;u.statuses.push({kind:'disarm',until:1000});}
 for(const [i,u]of casters.entries()){u.x=i*.2;u.y=-2;u.facing=Math.PI/2;}
 for(const [i,u]of targets.entries()){u.x=i*2;u.y=0;if(u.skills.length===0)u.statuses.push({kind:'silence',until:1000});}
 return{b,u:casters[0],second:casters[1],t:targets[0],other:targets[1],casters,targets};
}
function advance(b:BattleState,seconds:number){stepBattle(b,seconds,definitions);}
const hits=(b:BattleState,id:string,target?:CombatUnit)=>b.events.filter(e=>e.type==='hit'&&e.skill===id&&(!target||e.target===target.id)&&(e.amount??0)>0);
function castAt(b:BattleState,id:string){advance(b,.4);const event=b.events.find(e=>e.type==='cast'&&e.skill===id);expect(event).toBeDefined();return event!.time;}
const seals=(u:CombatUnit)=>u.statuses.filter(s=>s.skill===SEAL&&['silence','ancientSeal','magicResist'].includes(s.kind));

describe('Acid Spray reference edge results',()=>{
 it('AC-EDGE-01 has seventeen full pulses at 0 through 16 seconds and no eighteenth pulse',()=>{
  const{b,t}=match(ACID),at=castAt(b,ACID);advance(b,at+16.1-b.time);const damage=hits(b,ACID,t);expect(damage).toHaveLength(17);
  damage.forEach((event,index)=>expect(event.time-at).toBeCloseTo(index,6));expect(damage.every(event=>Math.abs(event.amount!-30*physicalDamageMultiplier(-7))<1e-7)).toBe(true);
  advance(b,.8);expect(hits(b,ACID,t)).toHaveLength(17);expect(statusValue(t,'armor')).toBe(0);
 });
 it('AC-EDGE-02 a victim leaving before the final boundary receives no out-of-area terminal pulse',()=>{
  const{b,t}=match(ACID),at=castAt(b,ACID);advance(b,at+16-FIXED_STEP-b.time);expect(hits(b,ACID,t)).toHaveLength(16);t.x=10;advance(b,2*FIXED_STEP);expect(hits(b,ACID,t)).toHaveLength(16);
 });
 it('AC-EDGE-03 exit immediately stops damage and reentry starts a new per-victim pulse clock',()=>{
  const{b,t}=match(ACID);castAt(b,ACID);expect(hits(b,ACID,t)).toHaveLength(1);t.x=10;advance(b,2*FIXED_STEP);t.x=0;advance(b,FIXED_STEP);expect(hits(b,ACID,t)).toHaveLength(2);const entered=b.time;
  advance(b,.9);expect(hits(b,ACID,t)).toHaveLength(2);advance(b,.1);expect(hits(b,ACID,t)).toHaveLength(3);expect(hits(b,ACID,t)[2].time-entered).toBeCloseTo(1,6);
 });
 it('AC-EDGE-04 overlapping casters stack physical pulses but use one strongest armor reduction',()=>{
  const{b,u,second,t}=match(ACID,3,{secondCaster:6});castAt(b,ACID);expect(hits(b,ACID,t).filter(e=>e.source===u.id)).toHaveLength(1);expect(hits(b,ACID,t).filter(e=>e.source===second.id)).toHaveLength(1);
  expect(t.statuses.filter(s=>s.kind==='armor'&&s.skill===ACID)).toHaveLength(2);expect(statusValue(t,'armor')).toBe(-10.5);expect(getCombatStats(t).armor).toBe(-10.5);const before=t.hp;
  expect(applyDamage(b,u,t,100,'physical','probe')).toBeCloseTo(100*physicalDamageMultiplier(-10.5));expect(t.hp).toBeLessThan(before);
 });
 it('AC-EDGE-05 the stronger armor source expires independently when only the weaker field still reaches the victim',()=>{
  const{b,second,t}=match(ACID,3,{secondCaster:6});second.cooldowns[0]=.5;castAt(b,ACID);t.x=4;advance(b,.6);expect(b.events.some(e=>e.type==='cast'&&e.skill===ACID&&e.source===second.id)).toBe(true);expect(statusValue(t,'armor')).toBe(-10.5);
  t.x=-4.7;advance(b,.6);expect(statusValue(t,'armor')).toBe(-7);expect(t.statuses.filter(s=>s.kind==='armor'&&s.skill===ACID)).toHaveLength(1);
 });
 it('AC-EDGE-06 a real Dark Pact strong dispel cannot remove armor supplied by the undispellable aura',()=>{
  const{b,t}=match(ACID,3,{targetSkill:PACT});castAt(b,ACID);advance(b,1.8);expect(b.events.some(e=>e.target===t.id&&e.status==='strongDispel')).toBe(true);expect(t.statuses.some(s=>s.kind==='armor'&&s.skill===ACID)).toBe(true);
 });
 it('AC-EDGE-07 spell immunity excludes damage and aura acquisition; losing it restarts immediately',()=>{
  const{b,t}=match(ACID);t.statuses.push({kind:'magicImmune',until:2});castAt(b,ACID);advance(b,1);expect(hits(b,ACID,t)).toHaveLength(0);expect(t.statuses.some(s=>s.kind==='armor'&&s.skill===ACID)).toBe(false);
  t.statuses=t.statuses.filter(s=>s.kind!=='magicImmune');advance(b,FIXED_STEP);expect(hits(b,ACID,t)).toHaveLength(1);expect(statusValue(t,'armor')).toBe(-7);
 });
 it('AC-EDGE-08 invisibility is affected while invulnerability and banishment do not acquire the aura',()=>{
  for(const kind of ['invisible','invulnerable','banished'] as const){const{b,other}=match(ACID,3,{secondTarget:true});other.x=10;castAt(b,ACID);other.statuses.push({kind,until:100});other.x=0;advance(b,FIXED_STEP);expect(hits(b,ACID,other)).toHaveLength(kind==='invisible'?1:0);expect(statusValue(other,'armor')).toBe(kind==='invisible'?-7:0);}
 });
 it('AC-EDGE-09 a stationary normal field survives source death and break and retains its damage owner',()=>{
  const{b,u,second,t}=match(ACID,3,{secondCaster:1});second.cooldowns[0]=1000;castAt(b,ACID);u.statuses.push({kind:'break',until:100});applyDamage(b,t,u,2e6,'pure','kill');const count=hits(b,ACID,t).length;advance(b,1);
  expect(u.dead).toBe(true);expect(b.finished).toBe(false);expect(hits(b,ACID,t)).toHaveLength(count+1);expect(hits(b,ACID,t).at(-1)!.source).toBe(u.id);
 });
 it('AC-EDGE-10 Gaben starts without cast, mana or cooldown cost and covers all arena positions',()=>{
  const{b,u,t}=match(ACID,9);expect(hits(b,ACID,t)).toHaveLength(1);expect(b.events.filter(e=>e.type==='cast'&&e.skill===ACID)).toHaveLength(0);expect(u.cooldowns[0]).toBe(0);const mana=u.mana;t.x=7;t.y=10;advance(b,1.1);expect(hits(b,ACID,t)).toHaveLength(2);expect(u.mana).toBe(mana);
 });
 it('AC-EDGE-11 active per-victim clocks and unique armor sources reconstruct deterministically on replay',()=>{
  const a=player(0,[[{id:ACID,points:6}],[{id:ACID,points:3}]]),enemy=player(1,[[]]),b=createBattle(a,enemy,16,definitions);advance(b,1.2);const restored=restoreBattle(serializeBattle(b),definitions);advance(b,1.5);advance(restored,1.5);expect(restored.events).toEqual(b.events);expect(restored.units).toEqual(b.units);
 });
 it('AC-EDGE-12 applies the historical 0.2-second cast point before committing resources and the sourced backswing afterward',()=>{
  const{b,u}=match(ACID),mana=u.mana;advance(b,.2);expect(hits(b,ACID)).toHaveLength(0);expect(u.mana).toBe(mana);expect(u.cooldowns[0]).toBe(0);advance(b,FIXED_STEP);const cast=b.events.find(e=>e.type==='cast'&&e.skill===ACID)!;
  expect(cast.time).toBeCloseTo(7*FIXED_STEP,6);expect(u.mana).toBeCloseTo(mana-160);expect(u.cooldowns[0]-cast.time).toBeCloseTo(22);expect(u.castUntil-cast.time).toBeCloseTo(.7,6);
 });
 it('AC-EDGE-13 turning from behind precedes windup and is continuous under the turn-rate limit',()=>{
  const{b,u}=match(ACID);u.facing=-Math.PI/2;advance(b,FIXED_STEP);expect(u.facing).toBeGreaterThan(-Math.PI/2);expect(u.facing).toBeLessThan(Math.PI/2);expect(b.events.some(e=>e.status==='castWindup'&&e.skill===ACID)).toBe(false);
  advance(b,.5);const windup=b.events.find(e=>e.status==='castWindup'&&e.skill===ACID)!,cast=b.events.find(e=>e.type==='cast'&&e.skill===ACID)!;expect(windup.time).toBeGreaterThan(FIXED_STEP);expect(cast.time-windup.time).toBeCloseTo(.2,6);
 });
 it('AC-EDGE-14 an actual Lucent Beam stun during windup cancels the field with no mana or cooldown cost',()=>{
  const{b,u}=match(ACID,3,{targetSkill:'custom_luna_lucent_beam'}),mana=u.mana;u.statuses.push({kind:'castTimePct',value:2,until:100});advance(b,.5);expect(b.events.some(e=>e.status==='stun'&&e.target===u.id&&e.skill==='custom_luna_lucent_beam')).toBe(true);expect(b.events.some(e=>e.type==='cast'&&e.skill===ACID)).toBe(false);expect(hits(b,ACID)).toHaveLength(0);expect(u.mana).toBe(mana);expect(u.cooldowns[0]).toBe(0);
 });
 it('AC-EDGE-15 cast-range bonus enables an otherwise out-of-range ground order',()=>{
  const{b,u,t}=match(ACID);u.y=0;t.y=10;advance(b,.3);expect(b.events.some(e=>e.status==='castWindup'&&e.skill===ACID)).toBe(false);u.statuses.push({kind:'castRange',value:2,until:100});advance(b,.3);expect(b.events.some(e=>e.type==='cast'&&e.skill===ACID)).toBe(true);expect(hits(b,ACID,t)).toHaveLength(1);
 });
 it('AC-EDGE-16 a cast-time debuff scales windup and backswing but leaves pulse cadence unchanged',()=>{
  const{b,u,t}=match(ACID);u.statuses.push({kind:'castTimePct',value:.5,until:100});const at=castAt(b,ACID),windup=b.events.find(e=>e.status==='castWindup'&&e.skill===ACID)!;expect(at-windup.time).toBeCloseTo(.3,6);expect(u.castUntil-at).toBeCloseTo(1.05,6);advance(b,1.1);expect(hits(b,ACID,t)[1].time-at).toBeCloseTo(1,6);
 });
 it('AC-EDGE-17 freezes the ground cursor when the original enemy moves out during windup',()=>{
  const{b,t,other}=match(ACID,3,{secondTarget:true});advance(b,FIXED_STEP);t.x=10;advance(b,.3);const cast=b.events.find(e=>e.type==='cast'&&e.skill===ACID)!;expect(cast).toBeDefined();expect(cast.toX).toBe(0);expect(cast.toY).toBe(0);expect(hits(b,ACID,t)).toHaveLength(0);expect(hits(b,ACID,other)).toHaveLength(1);expect((b.zones as {skill:string;x:number;y:number}[]).find(z=>z.skill===ACID)).toMatchObject({x:0,y:0});
 });
 it('AC-EDGE-18 original enemy death or invisibility cannot cancel the already ordered ground cast',()=>{
  for(const state of ['dead','invisible'] as const){const{b,u,t,other}=match(ACID,3,{secondTarget:true});advance(b,FIXED_STEP);if(state==='dead')applyDamage(b,u,t,2e6,'pure','kill_during_windup');else t.statuses.push({kind:'invisible',until:100});advance(b,.3);expect(b.events.some(e=>e.type==='cast'&&e.skill===ACID)).toBe(true);expect(hits(b,ACID,other)).toHaveLength(1);}
 });
 it('AC-EDGE-19 armor linger ignores status resistance and physical spell pulses bypass attack damage block',()=>{
  const{b,u,t}=match(ACID);t.statuses.push({kind:'statusResistance',value:.8,until:100},{kind:'block',value:10000,until:100});u.statuses.push({kind:'spellAmp',value:.5,until:100},{kind:'attackBonus',value:10000,until:100});castAt(b,ACID);expect(hits(b,ACID,t)[0].amount).toBeCloseTo(45*physicalDamageMultiplier(-7));t.x=10;advance(b,.3);expect(statusValue(t,'armor')).toBe(-7);advance(b,.3);expect(statusValue(t,'armor')).toBe(0);
 });
});

describe('Ancient Seal reference edge results',()=>{
 it('ASL-EDGE-01 all three components have the same resistance-scaled expiration',()=>{
  const{b,t}=match(SEAL);t.statuses.push({kind:'statusResistance',value:.5,until:100});const at=castAt(b,SEAL);expect(seals(t)).toHaveLength(3);for(const effect of seals(t))expect(effect.until-at).toBeCloseTo(3,6);advance(b,at+3.1-b.time);expect(seals(t)).toHaveLength(0);
 });
 it('ASL-EDGE-02 a real basic dispel removes silence, resistance reduction and affected-death credit together',()=>{
  const{b,u,t,other}=match(SEAL,9,{secondTarget:true,targetSupportSkill:CHAKRA});t.hp=5e5;t.mana=1000;other.cooldowns[0]=.5;other.x=8;castAt(b,SEAL);expect(seals(t)).toHaveLength(3);other.x=2;advance(b,.8);expect(b.events.some(e=>e.target===t.id&&e.status==='basicDispel')).toBe(true);expect(seals(t)).toHaveLength(0);
  u.mana=10;applyDamage(b,u,t,2e6,'pure','finisher',true);expect(u.mana).toBe(10);
 });
 it('ASL-EDGE-03 a real strong dispel also removes every component rather than leaving hidden death credit',()=>{
  const{b,u,t}=match(SEAL,9,{targetSkill:PACT});castAt(b,SEAL);advance(b,1.8);expect(b.events.some(e=>e.target===t.id&&e.status==='strongDispel')).toBe(true);expect(seals(t)).toHaveLength(0);u.mana=10;applyDamage(b,u,t,2e6,'pure','finisher');expect(u.mana).toBe(10);
 });
 it('ASL-EDGE-04 same-caster reapplication refreshes one debuff without compounding reduction',()=>{
  const{b,u,t}=match(SEAL);const at=castAt(b,SEAL);advance(b,.9);u.cooldowns[0]=b.time;advance(b,.8);const last=b.events.filter(e=>e.type==='cast'&&e.skill===SEAL).at(-1)!;expect(last.time).toBeGreaterThan(at);expect(seals(t)).toHaveLength(3);for(const effect of seals(t))expect(effect.until-last.time).toBeCloseTo(6,6);expect(applyDamage(b,u,t,100,'magical','probe')).toBeCloseTo(145);
 });
 it('ASL-EDGE-05 an existing seal persists after source death while a surviving ally keeps battle active',()=>{
  const{b,u,second,t}=match(SEAL,3,{secondCaster:1});second.cooldowns[0]=1000;castAt(b,SEAL);applyDamage(b,t,u,2e6,'pure','kill');advance(b,1);expect(seals(t)).toHaveLength(3);expect(applyDamage(b,second,t,100,'magical','probe')).toBeCloseTo(145);
 });
 it('ASL-EDGE-06 Super selects one eligible secondary and skips immune, invisible and untargetable units',()=>{
  for(const kind of ['magicImmune','invisible','shadowRealm'] as const){const{b,t,other}=match(SEAL,6,{secondTarget:true});other.statuses.push({kind,until:100});castAt(b,SEAL);expect(seals(t)).toHaveLength(3);expect(seals(other)).toHaveLength(0);}
 });
 it('ASL-EDGE-07 Gaben mana refill credits the sealing caster even when an ally gets the actual kill',()=>{
  const{b,u,second,t}=match(SEAL,9,{secondCaster:1});second.cooldowns[0]=1000;castAt(b,SEAL);u.mana=10;const cooldown=u.cooldowns[0];applyDamage(b,second,t,2e6,'pure','ally_finisher');expect(u.mana).toBe(u.maxMana);expect(u.cooldowns[0]).toBe(cooldown);expect(u.statuses.some(s=>s.kind==='magicResist'&&s.skill===SEAL)).toBe(false);
 });
 it('ASL-EDGE-08 expired seals cannot grant Gaben mana refill on a later kill',()=>{
  const{b,u,t}=match(SEAL,9);const at=castAt(b,SEAL);u.cooldowns[0]=1000;advance(b,at+6.1-b.time);u.mana=10;applyDamage(b,u,t,2e6,'pure','late_finisher');expect(u.mana).toBe(10);
 });
 it('ASL-EDGE-09 a stun during cast point cancels Seal before effect, mana and cooldown commit',()=>{
  const{b,u,t}=match(SEAL);advance(b,FIXED_STEP);expect(b.events.some(e=>e.status==='castWindup'&&e.skill===SEAL)).toBe(true);const mana=u.mana;applyDamage(b,t,u,1,'pure','control');u.statuses.push({kind:'stun',until:10});advance(b,.3);expect(seals(t)).toHaveLength(0);expect(b.events.some(e=>e.type==='cast'&&e.skill===SEAL)).toBe(false);expect(u.cooldowns[0]).toBe(0);expect(u.mana).toBe(mana);
 });
 it('ASL-EDGE-10 a real hero receives silence and magic resistance reduction',()=>{
  const{b,u,t}=match(SEAL);castAt(b,SEAL);expect(t.summoned).toBeUndefined();expect(t.statuses.some(s=>s.kind==='silence'&&s.skill===SEAL)).toBe(true);expect(t.statuses.find(s=>s.kind==='magicResist'&&s.skill===SEAL)?.value).toBe(-.45);expect(applyDamage(b,u,t,100,'magical','hero_probe')).toBeCloseTo(145);
 });
 it.each(['ordinary summon','hero illusion','creep hero'] as const)('ASL-EDGE-11 a real %s is silenced without receiving the hero-only resistance reduction',kind=>{
  const spawn=kind==='ordinary summon'?'custom_beastmaster_call_of_the_wild':kind==='hero illusion'?'custom_naga_siren_mirror_image':'custom_lone_druid_spirit_bear',w=match(SEAL,3,{targetSkill:spawn});w.u.cooldowns[0]=1000;advance(w.b,kind==='hero illusion'?1.1:.85);
  const victim=w.b.units.find(unit=>unit.side===1&&unit.summoned&&(kind==='hero illusion'?unit.illusion:kind==='creep hero'?unit.extraSpiritBear:unit.name==='豪猪'))!;expect(victim).toBeDefined();expect(victim.owner).toBe(w.t.id);
  if(kind==='hero illusion'){expect(victim.illusion).toBe(true);expect(victim.role).toBe(w.t.role);}if(kind==='creep hero')expect(victim.consideredHero).toBe(true);
  for(const body of w.b.units){body.moveSpeed=0;body.nextAttack=1000;body.cooldowns=body.cooldowns.map(()=>1000);body.statuses.push({kind:'disarm',until:100});if(body.side===1){body.x=7;body.y=10;}}
  victim.x=0;victim.y=0;victim.magicResist=0;w.u.cooldowns[0]=w.b.time;advance(w.b,.4);expect(w.b.events.some(e=>e.type==='cast'&&e.skill===SEAL&&e.target===victim.id)).toBe(true);expect(victim.statuses.some(s=>s.kind==='silence'&&s.skill===SEAL)).toBe(true);expect(victim.statuses.some(s=>s.kind==='ancientSeal'&&s.skill===SEAL)).toBe(true);expect(victim.statuses.some(s=>s.kind==='magicResist'&&s.skill===SEAL)).toBe(false);expect(applyDamage(w.b,w.u,victim,100,'magical','nonhero_probe')).toBeCloseTo(100*Number(victim.damageTakenMultiplier??1));
 });
});
