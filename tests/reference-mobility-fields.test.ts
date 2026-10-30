import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {applyDamage,createBattle,FIXED_STEP,getCombatStats,restoreBattle,serializeBattle,statusValue,stepBattle} from '../src/combat';
import type {BattleState,CombatUnit,Player,SkillDefinition,SkillStack} from '../src/model';
import type {EffectStatus} from '../src/skill-effects';
import {PRD_WORKING_ELIGIBILITY} from '../src/combat/prd';

const BARRAGE='clinkz_strafe',BURROW='sandking_burrowstrike',CHARGE='custom_spirit_breaker_charge_of_darkness',CHRONO='custom_faceless_void_chronosphere',CHAKRAM='custom_shredder_chakram';
const SECOND='aa_granted_second_chakram',RETURN='aa_return_chakram',RETURN_SECOND='aa_return_second_chakram',CAUSTIC='aa_granted_burrow_caustic_finale',FLAME='aa_granted_throwable_flamethrower',BASH='aa_granted_greater_bash';
const definitions=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
function player(id:number,loadouts:SkillStack[][]):Player{return{id,name:'P',hp:100,gold:0,shopLevel:1,locked:false,reserve:[],shop:[],heroes:loadouts.map((skills,i)=>({id:`h${i}`,name:`H${i}`,role:'mage',skin:'male',x:i*2,y:-2,skills}))};}
function match(id:string,points=3,allies=1,enemies=1){
 const b=createBattle(player(0,[[{id,points}],...Array.from({length:allies-1},()=>[])]),player(1,Array.from({length:enemies},()=>[])),119,definitions),a=b.units.filter(u=>u.side===0),e=b.units.filter(u=>u.side===1);
 for(const u of b.units){u.nextAttack=1000;u.moveSpeed=0;u.hp=u.maxHp=1e6;u.mana=u.maxMana=10000;u.attack=100;u.armor=0;u.magicResist=0;u.statuses.push({kind:'disarm',until:1000});}
 for(const[i,u]of a.entries()){u.x=i*9;u.y=-2;u.facing=Math.PI/2;}
 for(const[i,u]of e.entries()){u.x=i*9;u.y=0;u.facing=-Math.PI/2;}
 return{b,u:a[0],t:e[0],ally:a[1],other:e[1]};
}
const advance=(b:BattleState,seconds:number)=>stepBattle(b,seconds,definitions);
const hits=(b:BattleState,id:string,t?:CombatUnit)=>b.events.filter(e=>e.type==='hit'&&e.skill===id&&(!t||e.target===t.id)&&(e.amount??0)>0);
const casts=(b:BattleState,id:string)=>b.events.filter(e=>e.type==='cast'&&e.skill===id);
function lockChildren(u:CombatUnit,except:string[]=[]){u.skills.forEach((s,i)=>{if(s&&s.id!==CHAKRAM&&!except.includes(s.id))u.cooldowns[i]=1000;});}
function castOnce(b:BattleState,id:string,u=b.units[0],lock=true){const start=b.events.length;for(let i=0;i<120;i++){advance(b,FIXED_STEP);const event=b.events.slice(start).find(e=>e.type==='cast'&&e.skill===id&&e.source===u.id);if(event){if(lock)u.cooldowns[u.skills.findIndex(s=>s?.id===id)]=1000;return event.time;}}throw new Error(`No cast: ${id}`);}
const saw=(u:CombatUnit,id=CHAKRAM)=>(u.mobilityChakrams as {casts:Record<string,{returning:boolean;blades:{x:number;y:number;endX:number;endY:number;phase:string;nextTick:number}[]}>}).casts[id];

describe('Burning Barrage historical reference results',()=>{
 it('BARRAGE-01 the first arrow launches at release and six attacks follow the one-third-second cadence within one simulation tick',()=>{
  const{b,t}=match(BARRAGE);t.y=-1;const at=castOnce(b,BARRAGE);advance(b,FIXED_STEP);expect((b.projectiles as {createdAt:number}[])[0].createdAt).toBe(at);advance(b,2.5);const arrows=hits(b,BARRAGE,t);expect(arrows).toHaveLength(6);for(const arrow of arrows){expect(arrow.amount).toBeCloseTo(55);expect(arrow.category).toBe('attack');}expect(arrows[0].time-at).toBeCloseTo(2*FIXED_STEP);for(let i=1;i<arrows.length;i++)expect(Math.abs(arrows[i].time-arrows[i-1].time-1/3)).toBeLessThanOrEqual(FIXED_STEP+1e-8);
 });
 it('BARRAGE-02 Super produces nine final ninety-percent attacks without applying the upgrade twice',()=>{
  const{b,t}=match(BARRAGE,6);t.y=-1;castOnce(b,BARRAGE);advance(b,2.5);expect(hits(b,BARRAGE,t)).toHaveLength(9);expect(hits(b,BARRAGE,t).every(e=>e.amount===90)).toBe(true);
 });
 it('BARRAGE-03 a released arrow survives interruption while later scheduled arrows are cancelled',()=>{
  const{b,u,t}=match(BARRAGE);t.y=5;castOnce(b,BARRAGE);u.statuses.push({kind:'stun',until:100});advance(b,1);expect(hits(b,BARRAGE,t)).toHaveLength(1);
 });
 it('BARRAGE-04 disarm and evasion do not stop true-strike area attacks against invisible bodies',()=>{
  const{b,u,t,other}=match(BARRAGE,3,1,2);t.y=-1;other.x=0;other.y=1;other.statuses.push({kind:'invisible',until:100},{kind:'evasion',value:1,until:100});u.statuses.push({kind:'blind',value:1,until:100});castOnce(b,BARRAGE);advance(b,2.5);expect(hits(b,BARRAGE,t)).toHaveLength(6);expect(hits(b,BARRAGE,other)).toHaveLength(6);
 });
 it('BARRAGE-05 attack range extends full arrow travel while spell range does not',()=>{
  for(const kind of ['range','castRange']){const{b,u,t,other}=match(BARRAGE,3,1,2);t.y=-1;other.x=0;other.y=8;u.statuses.push({kind,until:100,value:3});castOnce(b,BARRAGE);advance(b,3);expect(hits(b,BARRAGE,other).length).toBe(kind==='range'?6:0);}
 });
 it('BARRAGE-06 Gaben has only two initial charges and restores them sequentially after ten seconds',()=>{
  const{b,u}=match(BARRAGE,9);advance(b,5);expect(casts(b,BARRAGE)).toHaveLength(2);const charges=u[`mobilityCharges:${BARRAGE}`] as {count:number;next:number};expect(charges.count).toBe(0);expect(charges.next-casts(b,BARRAGE)[0].time).toBeCloseTo(10);advance(b,charges.next+.3-b.time);expect(casts(b,BARRAGE)).toHaveLength(3);
 });
 it('BARRAGE-07 the real attack arrow is stopped at an enemy Arena boundary',()=>{
  const{b,t}=match(BARRAGE);t.y=4;b.arenas=[{source:t.id,side:1,x:0,y:4,radius:2,until:100}];castOnce(b,BARRAGE);advance(b,3);expect(hits(b,BARRAGE,t)).toHaveLength(0);expect(b.events.filter(e=>e.skill===BARRAGE&&e.outcome==='arenaBlocked')).toHaveLength(6);
 });
 it('BARRAGE-08 Searing Arrows is an independent physical spell outside the main attack critical',()=>{
  const{b,u,t}=match(BARRAGE);t.y=-1;u.skills.push({id:'clinkz_searing_arrows',points:3});u.cooldowns.push(1000);t.statuses.push({kind:'targetCritMultiplier',value:3,until:100});castOnce(b,BARRAGE);advance(b,2.5);expect(hits(b,BARRAGE,t)).toHaveLength(6);for(const hit of hits(b,BARRAGE,t))expect(hit.amount).toBeCloseTo(100*3*.55);const orb=hits(b,'clinkz_searing_arrows',t);expect(orb).toHaveLength(6);for(const hit of orb){expect(hit.amount).toBeCloseTo(80*.55);expect(hit.category).toBe('spell');expect(hit.damageType).toBe('physical');}
 });
 it('BARRAGE-09 source death preserves an emitted arrow and prevents the remaining channel releases',()=>{
  const{b,u,t}=match(BARRAGE,3,2);t.y=5;castOnce(b,BARRAGE);applyDamage(b,t,u,2e6,'pure','fixture');advance(b,1);expect(hits(b,BARRAGE,t)).toHaveLength(1);
 });
});

describe('Burrowstrike historical reference results',()=>{
 it('BURROW-01 spikes precede one explicit terminal warp and damage follows the fixed airborne delay',()=>{
  const{b,u,t}=match(BURROW);u.y=-6;const at=castOnce(b,BURROW);expect(u.y).toBe(-6);advance(b,.2);expect(u.y).toBe(-6);expect(hits(b,BURROW,t)).toHaveLength(0);advance(b,.2);expect(u.y).toBeCloseTo(0);expect(b.events.filter(e=>e.type==='move'&&e.skill===BURROW&&e.teleport)).toHaveLength(1);advance(b,.5);expect(hits(b,BURROW,t)).toHaveLength(1);expect(hits(b,BURROW,t)[0].time-at).toBeGreaterThan(.52);
 });
 it('BURROW-02 the frozen ground cursor survives movement and death of the original unit target',()=>{
  const{b,u,t,other}=match(BURROW,3,1,2);other.x=10;u.y=-6;const at=castOnce(b,BURROW);t.x=3;applyDamage(b,u,t,2e6,'pure','fixture');advance(b,.5);expect(u.x).toBeCloseTo(0);expect(u.y).toBeCloseTo(0);expect(b.events.filter(e=>e.type==='move'&&e.skill===BURROW&&e.teleport)[0].time).toBeGreaterThan(at);
 });
 it('BURROW-03 each traversed victim independently consumes spell block',()=>{
  const{b,t,other}=match(BURROW,3,1,2);t.statuses.push({kind:'spellBlock',value:1,until:100});castOnce(b,BURROW);other.x=0;other.y=-1;advance(b,1);expect(hits(b,BURROW,t)).toHaveLength(0);expect(hits(b,BURROW,other)).toHaveLength(1);expect(t.statuses.some(s=>s.kind==='spellBlock')).toBe(false);
 });
 it('BURROW-04 immunity acquired after contact does not prevent saved landing damage',()=>{
  const{b,t}=match(BURROW);castOnce(b,BURROW);advance(b,.1);expect(t.statuses.some(s=>(s as EffectStatus).data?.burrowLift)).toBe(true);t.statuses.push({kind:'magicImmune',until:100});advance(b,.6);expect(hits(b,BURROW,t)).toHaveLength(1);expect(hits(b,BURROW,t)[0].amount).toBe(280);
 });
 it('BURROW-05 status resistance does not shorten the airborne clock',()=>{
  const{b,t}=match(BURROW);t.statuses.push({kind:'statusResistance',value:.8,until:100});castOnce(b,BURROW);advance(b,.1);const lift=t.statuses.find(s=>(s as EffectStatus).data?.burrowLift)!;expect(lift.until-b.time).toBeGreaterThan(.4);advance(b,.3);expect(hits(b,BURROW,t)).toHaveLength(0);advance(b,.3);expect(hits(b,BURROW,t)).toHaveLength(1);
 });
 it('BURROW-06 Super applies maximum Caustic to ordinary summons but excludes illusions',()=>{
  for(const illusion of [false,true]){const{b,t}=match(BURROW,6,1,2);t.summoned=true;t.illusion=illusion;castOnce(b,BURROW);advance(b,.15);expect(t.statuses.some(s=>s.kind==='causticFinale')).toBe(!illusion);}
 });
 it('BURROW-07 Caustic explodes immediately from the victim max health even after its caster dies',()=>{
  const{b,u,t,ally,other}=match(BURROW,6,2,2);other.x=3;other.y=0;t.maxHp=1000;t.hp=1000;castOnce(b,BURROW);advance(b,.15);expect(t.statuses.some(s=>s.kind==='causticFinale')).toBe(true);applyDamage(b,other,u,2e6,'pure','fixture');applyDamage(b,ally,t,2e6,'pure','fixture');expect(hits(b,CAUSTIC,other)).toHaveLength(1);expect(hits(b,CAUSTIC,other)[0].amount).toBe(350);expect(hits(b,CAUSTIC,other)[0].attribution?.rootAbilityId).toBe(BURROW);
 });
 it('BURROW-08 Gaben spends two finite charges before the ten-second Super restore boundary',()=>{
  const{b,u}=match(BURROW,9);advance(b,2);expect(casts(b,BURROW)).toHaveLength(2);const charges=u[`mobilityCharges:${BURROW}`] as {count:number;next:number};expect(charges.count).toBe(0);expect(charges.next-casts(b,BURROW)[0].time).toBeCloseTo(10);
 });
 it('BURROW-09 the caster remains damageable while spikes travel and a skill-created wall does not stop its terminal warp',()=>{
  const{b,u,t}=match(BURROW);u.y=-6;b.barriers=[{source:t.id,side:1,skill:'fixture',from:{x:-3,y:-3},to:{x:3,y:-3},width:.5,until:100,blocks:'enemies'}];castOnce(b,BURROW);expect(u.statuses.some(s=>s.kind==='invulnerable')).toBe(false);expect(applyDamage(b,t,u,100,'pure','fixture')).toBe(100);advance(b,.4);expect(u.y).toBeCloseTo(0);
 });
 it('BURROW-10 an already released Aphotic Shield strong dispel lands the airborne victim early exactly once',()=>{
  const{b,t,other}=match(BURROW,3,1,2);other.x=3;other.y=0;other.skills.push({id:'custom_abaddon_aphotic_shield',points:3});other.cooldowns.push(.1);t.hp=t.maxHp*.5;const at=castOnce(b,BURROW);advance(b,.8);const damage=hits(b,BURROW,t);expect(damage).toHaveLength(1);expect(damage[0].time-at).toBeLessThan(.52);expect(casts(b,'custom_abaddon_aphotic_shield')).toHaveLength(1);
 });
});

describe('Charge of Darkness historical reference results',()=>{
 it('CHARGE-01 the effect lock prevents recasting and the actual cooldown starts only on contact',()=>{
  const{b,u,t}=match(CHARGE);u.moveSpeed=3;t.y=8;const at=castOnce(b,CHARGE,u,false);advance(b,.3);expect(casts(b,CHARGE)).toHaveLength(1);expect(u.cooldowns[0]).toBe(at);expect((u.mobilityCharge as {active:boolean}).active).toBe(true);advance(b,2);expect(hits(b,BASH,t)).toHaveLength(1);expect(u.cooldowns[0]).toBeGreaterThan(b.time);expect((u.mobilityCharge as {active:boolean}).active).toBe(false);
 });
 it('CHARGE-02 a real stun cancels movement and begins the same snapshot cooldown without impact',()=>{
  const{b,u,t}=match(CHARGE);u.moveSpeed=3;t.y=10;castOnce(b,CHARGE,u,false);advance(b,.1);u.statuses.push({kind:'stun',until:100});advance(b,.1);const y=u.y;advance(b,.3);expect(u.y).toBe(y);expect(hits(b,BASH,t)).toHaveLength(0);expect(u.cooldowns[0]).toBeGreaterThan(b.time);
 });
 it('CHARGE-03 flat charge speed is multiplied by effective bonus and slow before Greater Bash snapshots it',()=>{
  const{b,u,t}=match(CHARGE);u.moveSpeed=3;u.statuses.push({kind:'moveFlat',value:1,until:100},{kind:'haste',value:.5,until:100},{kind:'slow',value:.2,until:100});castOnce(b,CHARGE,u,false);advance(b,1);expect(hits(b,BASH,t)[0].amount).toBeCloseTo((3+1+3.75)*1.5*.8*100*.3);
 });
 it('CHARGE-04 Super is immune during travel and each nearby non-primary body is bashed only once',()=>{
  const{b,u,t,other}=match(CHARGE,6,1,2);u.moveSpeed=3;t.y=8;other.x=12;other.y=10;castOnce(b,CHARGE,u,false);other.x=2;other.y=0;expect(statusValue(u,'magicImmune')).toBe(0);expect(u.statuses.some(s=>s.kind==='magicImmune')).toBe(true);advance(b,2);expect(hits(b,BASH,other)).toHaveLength(1);expect(hits(b,BASH,t)).toHaveLength(1);expect(u.statuses.some(s=>s.kind==='magicImmune')).toBe(false);
 });
 it('CHARGE-05 Gaben target death retargets the nearest real hero and its reset survives later cancellation',()=>{
  const{b,u,t,other}=match(CHARGE,9,1,2);u.moveSpeed=3;t.y=8;other.x=3;other.y=8;castOnce(b,CHARGE,u,false);applyDamage(b,u,t,2e6,'pure','fixture');advance(b,.1);expect((u.mobilityCharge as {targetId:string}).targetId).toBe(other.id);u.statuses.push({kind:'stun',until:100});advance(b,.1);expect(u.cooldowns[0]).toBeLessThanOrEqual(b.time);expect(casts(b,CHARGE)).toHaveLength(1);
 });
 it('CHARGE-06 unit-targeted spell orders stop charging but a no-target Warcry does not',()=>{
  for(const id of ['custom_vengefulspirit_magic_missile','custom_sven_warcry']){const{b,u,t}=match(CHARGE);u.moveSpeed=3;t.y=6;castOnce(b,CHARGE,u,false);u.skills.push({id,points:3});u.cooldowns.push(0);u.statuses.push({kind:'castRange',value:20,until:100});advance(b,.2);expect(b.events.some(e=>e.skill===id&&e.status==='castWindup')).toBe(true);expect((u.mobilityCharge as {active:boolean}).active).toBe(id==='custom_sven_warcry');}
 });
 it('CHARGE-07 the end-started cooldown retains the release-time cooldown reduction snapshot',()=>{
  const{b,u,t}=match(CHARGE);u.moveSpeed=3;t.y=8;u.statuses.push({kind:'cooldownReduction',until:100,value:.5});castOnce(b,CHARGE,u,false);u.statuses=u.statuses.filter(s=>s.kind!=='cooldownReduction');advance(b,.1);const cancelledAt=b.time+FIXED_STEP;u.statuses.push({kind:'stun',until:100});advance(b,.1);expect(u.cooldowns[0]-cancelledAt).toBeCloseTo(5.5,6);
 });
 it('CHARGE-08 an initially spell-immune target causes no accepted order or resource consumption',()=>{
  const{b,u,t}=match(CHARGE);u.moveSpeed=3;t.statuses.push({kind:'magicImmune',until:100});advance(b,1);expect(casts(b,CHARGE)).toHaveLength(0);expect(u.mana).toBe(10000);expect(u.cooldowns[0]).toBe(0);
 });
});

describe('Chronosphere historical reference results',()=>{
 it('CHRONO-01 the first field frame freezes through immunity and preserves passives and source death',()=>{
  const{b,u,t,ally}=match(CHRONO,3,2);t.statuses.push({kind:'magicImmune',until:100});castOnce(b,CHRONO);expect(t.statuses.some(s=>s.kind==='stun')).toBe(true);expect(t.statuses.some(s=>s.kind==='break')).toBe(false);applyDamage(b,t,u,2e6,'pure','fixture');advance(b,.5);expect(t.statuses.some(s=>s.kind==='stun')).toBe(true);expect(ally.dead).toBe(false);
 });
 it('CHRONO-02 recursively controlled summons receive 1000 movement and phasing but Super attack speed belongs to the caster',()=>{
  const{b,u,t,ally}=match(CHRONO,6,2);ally.x=1;ally.y=-1;ally.owner=u.id;ally.summoned=true;ally.moveSpeed=3;castOnce(b,CHRONO);expect(getCombatStats(ally).moveSpeed).toBe(10);expect(ally.statuses.some(s=>s.kind==='phased')).toBe(true);expect(statusValue(u,'attackSpeed')).toBe(200);expect(statusValue(ally,'attackSpeed')).toBe(0);expect(t.statuses.some(s=>s.kind==='stun')).toBe(true);
 });
 it('CHRONO-03 invulnerable heroes are excluded while invulnerable ordinary wards are frozen',()=>{
  for(const ward of [false,true]){const{b,t,other}=match(CHRONO,3,1,2);other.x=4;t.statuses.push({kind:'invulnerable',until:100});if(ward){t.summoned=true;t.ward=true;}castOnce(b,CHRONO);expect(t.statuses.some(s=>s.kind==='stun')).toBe(ward);}
 });
 it('CHRONO-04 ordinary invisible enemies are revealed inside the frozen point even after the aim unit moves',()=>{
  const{b,t,other}=match(CHRONO,3,1,2);other.x=1;other.y=0;other.statuses.push({kind:'invisible',until:100});castOnce(b,CHRONO);t.x=10;advance(b,.2);expect(other.statuses.some(s=>s.kind==='revealed')).toBe(true);expect(t.statuses.some(s=>s.kind==='stun')).toBe(false);
 });
 it('CHRONO-05 Gaben allied heroes remain unfrozen with the explicitly retained six-and-a-half time-factor candidate',()=>{
  const{b,ally}=match(CHRONO,9,2);ally.x=1;ally.y=-1;castOnce(b,CHRONO);expect(ally.statuses.some(s=>s.kind==='stun')).toBe(false);expect(statusValue(ally,'slow')).toBeCloseTo(1-1/6.5);expect(statusValue(ally,'attackTimePct')).toBe(5.5);expect(statusValue(ally,'castTimePct')).toBe(5.5);
 });
 it('CHRONO-06 field expiry removes only its own controls and speed components',()=>{
  const{b,u,t}=match(CHRONO);t.statuses.push({kind:'stun',until:100,skill:'fixture',source:u.id});castOnce(b,CHRONO);advance(b,5.2);expect(t.statuses.some(s=>s.skill===CHRONO)).toBe(false);expect(t.statuses.some(s=>s.skill==='fixture')).toBe(true);expect(statusValue(u,'forceMoveSpeed')).toBe(0);
 });
 it('CHRONO-07 an outside enemy Cookie cannot move a frozen ally through the explicitly blocked motion entry',()=>{
  const{b,t,other}=match(CHRONO,3,1,2);other.x=8;other.y=0;other.skills.push({id:'custom_snapfire_firesnap_cookie',points:3});other.cooldowns.push(0);t.hp=t.maxHp*.5;castOnce(b,CHRONO);const start={x:t.x,y:t.y};advance(b,1.5);expect(casts(b,'custom_snapfire_firesnap_cookie').length).toBeGreaterThan(0);expect(t.x).toBe(start.x);expect(t.y).toBe(start.y);
 });
 it('CHRONO-08 an outside allied Meat Hook can pull an enemy out while the freeze source remains alive',()=>{
  const{b,u,t,ally}=match(CHRONO,3,2);ally.x=8;ally.y=0;ally.facing=Math.PI;ally.skills.push({id:'custom_pudge_meat_hook',points:3});ally.cooldowns.push(.5);castOnce(b,CHRONO);advance(b,2);expect(casts(b,'custom_pudge_meat_hook')).toHaveLength(1);expect(t.x).toBeGreaterThan(5);expect(t.statuses.some(s=>s.kind==='chronosphereFreeze')).toBe(false);expect(u.dead).toBe(false);
 });
});

describe('Chakram historical reference results',()=>{
 it('CHAKRAM-01 pass damage occurs once outward and stationary damage starts half a second after arrival',()=>{
  const{b,u,t}=match(CHAKRAM);lockChildren(u);castOnce(b,CHAKRAM);advance(b,.25);expect(hits(b,CHAKRAM,t)).toHaveLength(1);expect(hits(b,CHAKRAM,t)[0].amount).toBe(200);const blade=saw(u).blades[0];expect(blade.phase).toBe('parked');advance(b,blade.nextTick-FIXED_STEP-b.time);expect(hits(b,CHAKRAM,t)).toHaveLength(1);advance(b,FIXED_STEP);expect(hits(b,CHAKRAM,t).map(e=>e.amount)).toEqual([200,105]);
 });
 it('CHAKRAM-02 minimum slow is five percent and stationary aura follows current missing health immediately',()=>{
  const{b,u,t}=match(CHAKRAM);lockChildren(u);castOnce(b,CHAKRAM);advance(b,.3);expect(statusValue(t,'slow')).toBeCloseTo(.05);t.hp=t.maxHp*.5;advance(b,FIXED_STEP);expect(statusValue(t,'slow')).toBeCloseTo(.55);const aura=t.statuses.find(s=>(s as EffectStatus).data?.sawComponent==='aura') as EffectStatus;expect(aura.dispel).toBe('none');
 });
 it('CHAKRAM-03 explicit Return is zero-resource, gives one new return pass, and clears only Chakram disarm',()=>{
  const{b,u,t}=match(CHAKRAM);lockChildren(u);castOnce(b,CHAKRAM);advance(b,.3);const i=u.skills.findIndex(s=>s?.id===RETURN);u.cooldowns[i]=0;t.x=10;castOnce(b,RETURN,u);t.x=0;advance(b,.4);expect(hits(b,CHAKRAM,t).filter(e=>e.amount===200)).toHaveLength(2);expect(saw(u).blades[0].phase).toBe('done');expect(u.mainChakramBlades).toBe(0);expect(u.statuses.some(s=>s.kind==='disarm'&&!s.skill)).toBe(true);expect(u.statuses.some(s=>(s as EffectStatus).data?.chakramOwner)).toBe(false);
 });
 it('CHAKRAM-04 Super owns independently priced and cooled Second Chakram and both Return slots',()=>{
  const{b,u}=match(CHAKRAM,6);expect(u.skills.filter(s=>[SECOND,RETURN,RETURN_SECOND,FLAME].includes(s?.id??''))).toHaveLength(4);lockChildren(u,[SECOND]);castOnce(b,CHAKRAM);castOnce(b,SECOND);expect(saw(u).blades[0]).not.toBe(saw(u,SECOND).blades[0]);expect(casts(b,CHAKRAM)).toHaveLength(1);expect(casts(b,SECOND)).toHaveLength(1);expect(u.cooldowns[u.skills.findIndex(s=>s?.id===SECOND)]).toBe(1000);
 });
 it('CHAKRAM-05 main and second stationary slows stack independently while their own pass and aura do not double',()=>{
  const{b,u,t}=match(CHAKRAM,6);lockChildren(u,[SECOND]);t.hp=t.maxHp*.5;castOnce(b,CHAKRAM);castOnce(b,SECOND);advance(b,.3);expect(statusValue(t,'slow')).toBeCloseTo(1.1);expect(t.statuses.filter(s=>(s as EffectStatus).data?.sawComponent==='aura')).toHaveLength(2);
 });
 it('CHAKRAM-06 Gaben emits exactly ten caster-centered radial blades for each independent ability',()=>{
  const{b,u}=match(CHAKRAM,9);lockChildren(u,[SECOND]);castOnce(b,CHAKRAM);castOnce(b,SECOND);for(const id of [CHAKRAM,SECOND]){const blades=saw(u,id).blades;expect(blades).toHaveLength(10);for(const blade of blades)expect(Math.hypot(blade.endX-u.x,blade.endY-u.y)).toBeCloseTo(12);expect(new Set(blades.map(blade=>Math.atan2(blade.endY-u.y,blade.endX-u.x).toFixed(6))).size).toBe(10);}expect(u.mainChakramBlades).toBe(10);expect(u.secondChakramBlades).toBe(10);
 });
 it('CHAKRAM-07 source death removes all blades immediately and a later reincarnation can launch a fresh set',()=>{
  const{b,u,t,ally}=match(CHAKRAM,3,2);lockChildren(u);u.statuses.push({kind:'reincarnation',until:100,value:1});castOnce(b,CHAKRAM);advance(b,.3);applyDamage(b,t,u,2e6,'pure','fixture');expect(u.mainChakramBlades).toBe(0);expect(saw(u).blades.every(blade=>blade.phase==='done')).toBe(true);advance(b,3.1);expect(u.dead).toBe(false);u.cooldowns[0]=b.time;castOnce(b,CHAKRAM);expect(u.mainChakramBlades).toBe(1);expect(ally.dead).toBe(false);
 });
 it('CHAKRAM-08 discarded visual metadata cannot alter gameplay damage RNG events or blade state',()=>{
  const{b,u}=match(CHAKRAM,6),other=match(CHAKRAM,6);lockChildren(u,[SECOND]);lockChildren(other.u,[SECOND]);const copy=other.b;for(let i=0;i<60;i++){advance(b,FIXED_STEP);delete b.visualProjectiles;delete b.nextVisualProjectile;advance(copy,FIXED_STEP);}const gameplay=(state:BattleState)=>{const{visualProjectiles:_v,nextVisualProjectile:_n,...rest}=JSON.parse(serializeBattle(state));return rest;};expect(gameplay(b)).toEqual(gameplay(copy));
 });
 it('CHAKRAM-09 a gifted ally-held Flamethrower applies an immediate forty-damage burn outside the caster cone',()=>{
  const{b,u,t,ally}=match(CHAKRAM,6,2);u.y=-6;ally.x=0;ally.y=-1;ally.facing=Math.PI/2;lockChildren(u,[FLAME]);u.cooldowns[0]=1000;castOnce(b,FLAME,u);expect(ally.statuses.some(s=>s.kind==='flamethrower')).toBe(true);expect(hits(b,FLAME,t)[0].amount).toBe(40);expect(u.statuses.some(s=>s.kind==='flamethrower')).toBe(false);
 });
 it('CHAKRAM-10 insufficient mana returns a parked blade without charging or applying its next area pulse',()=>{
  const{b,u,t}=match(CHAKRAM);lockChildren(u);castOnce(b,CHAKRAM);advance(b,.3);u.mana=0;advance(b,.8);expect(saw(u).blades[0].phase).toBe('done');expect(hits(b,CHAKRAM,t).every(e=>e.amount===200)).toBe(true);expect(u.mainChakramBlades).toBe(0);
 });
 it('CHAKRAM-11 a blade exceeding its twenty-world-unit leash returns even during outbound travel',()=>{
  const{b,u}=match(CHAKRAM);u.y=-8;lockChildren(u);castOnce(b,CHAKRAM);u.x=12;u.y=12;advance(b,FIXED_STEP);expect(saw(u).blades[0].phase).toBe('return');
 });
 it('CHAKRAM-12 an ally-held full native Flamethrower burns for exactly twenty-one forty-damage pulses including linger',()=>{
  const{b,u,t,ally}=match(CHAKRAM,6,2);u.y=-6;ally.x=0;ally.y=-1;ally.facing=Math.PI/2;lockChildren(u,[FLAME]);u.cooldowns[0]=1000;castOnce(b,FLAME,u);advance(b,10.2);expect(hits(b,FLAME,t)).toHaveLength(21);expect(hits(b,FLAME,t).reduce((n,e)=>n+e.amount!,0)).toBe(840);
 });
});

describe('Mobility field replay results from original recorded player inputs',()=>{
 it.each([BARRAGE,BURROW,CHARGE,CHRONO,CHAKRAM])('MOBILITY-REPLAY %s reconstructs its released projectiles channels fields charges and clocks',id=>{
  const a=player(0,[[{id,points:9}],[]]),enemy=player(1,[[],[]]);for(const p of [a,enemy])for(const h of p.heroes)h.persistentStrengthBonus=250;
  const b=createBattle(a,enemy,673,definitions);advance(b,.8);const restored=restoreBattle(serializeBattle(b),definitions);advance(b,3);advance(restored,3);expect(serializeBattle(restored)).toEqual(serializeBattle(b));
 });
});

describe('Greater Bash native PRD eligibility',()=>{
 it('CHARGE-11 Gaben attack procs actually use the native-eligible independent PRD ledger',()=>{
  const{b,u,t}=match(CHARGE,9);u.mana=0;u.statuses=[];u.nextAttack=0;u.range=20;u.projectileSpeed=1000;u.attackPoint=u.attackBackswing=0;u.attackInterval=.12;t.statuses.push({kind:'stun',until:100});
  advance(b,8);expect(PRD_WORKING_ELIGIBILITY[CHARGE]).toContain('greater_bash');
  const ledgers=Object.entries((u.prdState??{}) as Record<string,{trials:number;successes:number}>).filter(([key])=>key.includes(CHARGE)&&key.endsWith(':greater_bash'));
  expect(ledgers).toHaveLength(1);expect(ledgers[0][1].trials).toBeGreaterThan(0);expect(ledgers[0][1].successes).toBeGreaterThan(0);expect(casts(b,BASH)).toHaveLength(ledgers[0][1].successes);expect(casts(b,CHARGE)).toHaveLength(0);
 });
});
