import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {applyDamage,createBattle,FIXED_STEP,stepBattle} from '../src/combat';
import {attachSkillBalance,type SkillBalance} from '../src/config';
import type {BattleState,CombatUnit,Player,SkillDefinition,SkillStack} from '../src/model';

const catalog=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
const SHIELD='custom_abaddon_aphotic_shield',CROWN='custom_dark_willow_cursed_crown',PACT='custom_slark_dark_pact',CARAPACE='nyx_assassin_spiked_carapace',TIME='abaddon_borrowed_time';
function definition(id:string,fast=true){const source=catalog.find(d=>d.id===id);if(!source)throw Error(id);const d=structuredClone(attachSkillBalance(structuredClone(source)));if(fast)for(const row of Object.values(d.balanceLevels as Record<string,SkillBalance>)){row.castPoint=0;row.backswing=0;row.mana=0;row.cooldown=100;}return d;}
function player(id:number,skills:SkillStack[],extra=false):Player{return{id,name:`P${id}`,hp:100,gold:0,shopLevel:1,heroes:[{id:`h${id}`,name:`H${id}`,role:'mage',skin:'female',x:0,y:-1,skills},...(extra?[{id:`a${id}`,name:`A${id}`,role:'mage' as const,skin:'male' as const,x:10,y:-1,skills:[]}]:[])],reserve:[],shop:[],locked:false};}
function world(id:string,points=3,{ally=false,secondEnemy=false,enemySkill,casterSkill,fast=true}:{ally?:boolean;secondEnemy?:boolean;enemySkill?:string;casterSkill?:string;fast?:boolean}={}){
 const defs=[definition(id,fast),...(enemySkill?[definition(enemySkill)]:[]),...(casterSkill?[definition(casterSkill)]:[])],b=createBattle(player(0,[{id,points},...(casterSkill?[{id:casterSkill,points:3}]:[])],ally),player(1,enemySkill?[{id:enemySkill,points:3}]:[],secondEnemy),89,defs);
 for(const u of b.units){u.nextAttack=100;u.moveSpeed=0;u.statuses.push({kind:'disarm',until:100});}
 const caster=b.units.find(u=>u.id==='0:h0')!,target=b.units.find(u=>u.id==='1:h1')!,friend=b.units.find(u=>u.id==='0:a0'),other=b.units.find(u=>u.id==='1:a1');
 caster.x=target.x=0;caster.y=0;target.y=1;caster.facing=target.facing=Math.PI/2;if(friend){friend.x=10;friend.y=0;}if(other){other.x=secondEnemy&&ally?10:2;other.y=1;}
 if(id===SHIELD&&friend){friend.x=1;caster.facing=0;}
 if(!enemySkill)target.statuses.push({kind:'silence',until:100});
 return{b,defs,caster,target,friend,other};
}
function advance(w:{b:BattleState;defs:SkillDefinition[]},seconds:number){stepBattle(w.b,seconds,w.defs);}
const effect=(u:CombatUnit,kind:string,skill?:string)=>u.statuses.find(s=>s.kind===kind&&(!skill||s.skill===skill));
function started(w:ReturnType<typeof world>,id:string){advance(w,.1);const event=w.b.events.find(e=>e.type==='cast'&&e.skill===id);expect(event).toBeDefined();return event!.time;}

describe('defense and dispel: Aphotic Shield',()=>{
 it('strong-dispels the ally and consumes capacity after mitigation, then bursts for full capacity',()=>{
  const w=world(SHIELD,3,{ally:true});w.friend!.hp=500;w.friend!.statuses.push({kind:'stun',source:w.target.id,skill:'enemy_stun',until:100,harmful:true,dispel:'strong'} as never);w.target.magicResist=0;
  started(w,SHIELD);expect(effect(w.friend!,'stun')).toBeUndefined();const shield=effect(w.friend!,'shield',SHIELD) as unknown as {remaining:number};expect(shield.remaining).toBe(150);
  expect(applyDamage(w.b,w.target,w.friend!,100,'magical','test')).toBe(0);expect(shield.remaining).toBe(75);
  const hp=w.target.hp;expect(applyDamage(w.b,w.target,w.friend!,100,'pure','test')).toBe(25);expect(w.target.hp).toBe(hp-150);expect(effect(w.friend!,'shield',SHIELD)).toBeUndefined();
 });
 it('replacing or expiring an incompletely consumed shield still bursts once for full capacity',()=>{
  for(const replacement of [false,true]){const w=world(SHIELD,3,{ally:true});w.friend!.hp=500;w.target.magicResist=0;started(w,SHIELD);applyDamage(w.b,w.target,w.friend!,20,'pure','test');const hp=w.target.hp;
   if(replacement){w.caster.cooldowns[0]=w.b.time;advance(w,.1);}else advance(w,15.1);
   expect(w.target.hp).toBe(hp-150);expect(w.b.events.filter(e=>e.type==='hit'&&e.skill===SHIELD&&e.target===w.target.id)).toHaveLength(1);
  }
 });
 it('Super gives the ally and caster one independent shield; Gaben adds its configured capacity once',()=>{
  const w=world(SHIELD,9,{ally:true});w.friend!.hp=500;started(w,SHIELD);expect(effect(w.caster,'shield',SHIELD)?.value).toBe(550);expect(effect(w.friend!,'shield',SHIELD)?.value).toBe(550);expect(w.caster.statuses.filter(s=>s.kind==='shield'&&s.skill===SHIELD)).toHaveLength(1);
 });
 it('burst skips unrevealed invisibility but can hit revealed invisibility and Shadow Realm',()=>{
  for(const kind of ['invisible','revealed','shadowRealm'] as const){const w=world(SHIELD,3,{ally:true});w.friend!.hp=500;w.target.magicResist=0;started(w,SHIELD);w.target.statuses.push({kind:kind==='revealed'?'invisible':kind,until:100});if(kind==='revealed')w.target.statuses.push({kind:'revealed',until:100});const hp=w.target.hp;
   applyDamage(w.b,w.target,w.friend!,150,'pure','break_shield');expect(w.target.hp).toBe(hp-(kind==='invisible'?0:150));
  }
 });
});

describe('defense and dispel: Cursed Crown',()=>{
 it('does not shorten the initial countdown with status resistance, but shortens the eventual stun',()=>{
  const w=world(CROWN);w.target.statuses.push({kind:'statusResistance',value:.5,until:100});const at=started(w,CROWN);advance(w,at+2.9-w.b.time);expect(effect(w.target,'stun',CROWN)).toBeUndefined();advance(w,.2);const stun=effect(w.target,'stun',CROWN);expect(stun).toBeDefined();expect(stun!.until-(at+3)).toBeCloseTo(1.5,6);
 });
 it.each([3,6])('a real Dark Pact purge cancels base stun and preserves removal brambles only for Super (tier %s)',points=>{
  const w=world(CROWN,points,{enemySkill:PACT});started(w,CROWN);advance(w,2.2);expect(effect(w.target,'stun',CROWN)).toBeUndefined();const zones=(w.b.zones as {skill:string;x:number;y:number}[]).filter(z=>z.skill===CROWN);expect(zones).toHaveLength(points>=6?4:0);
  if(points>=6){for(const zone of zones)expect(Math.hypot(zone.x-w.target.x,zone.y-w.target.y)).toBeCloseTo(1.75);expect(zones.some(zone=>Math.abs(zone.x-w.target.x)<1e-7&&zone.y>w.target.y)).toBe(true);}
 });
 it('survives caster death and only creates Gaben wisps on units actually stunned',()=>{
  const w=world(CROWN,9,{ally:true,secondEnemy:true});w.other!.x=1;w.other!.y=1;started(w,CROWN);w.target.statuses.push({kind:'magicImmune',until:20});applyDamage(w.b,w.target,w.caster,1e6,'pure','kill',true);advance(w,2.2);
  expect(effect(w.target,'cursedCrownWisp',CROWN)).toBeUndefined();expect(effect(w.other!,'stun',CROWN)).toBeDefined();expect(effect(w.other!,'cursedCrownWisp',CROWN)).toBeDefined();
 });
});

describe('defense and dispel: Dark Pact',()=>{
 it('starts after the AA delay, damages first, then strongly dispels, over ten pulses',()=>{
  const w=world(PACT,1);w.target.magicResist=0;const at=started(w,PACT);w.caster.statuses.push({kind:'spellAmp',value:-.5,until:100,harmful:true,dispel:'basic'} as never,{kind:'stun',until:100,harmful:true,dispel:'strong'} as never);
  advance(w,at+1.49-w.b.time);expect(w.b.events.filter(e=>e.type==='hit'&&e.skill===PACT)).toHaveLength(0);advance(w,.05);expect(effect(w.caster,'stun')).toBeUndefined();w.caster.statuses.push({kind:'stun',until:100,harmful:true,dispel:'strong'} as never);advance(w,1.0);
  const hits=w.b.events.filter(e=>e.type==='hit'&&e.skill===PACT&&e.target===w.target.id);expect(hits).toHaveLength(10);expect(hits[0].amount).toBeCloseTo(4.5);expect(hits.reduce((n,e)=>n+(e.amount??0),0)).toBeCloseTo(85.5);expect(effect(w.caster,'stun')).toBeUndefined();
 });
 it('uses nonlethal magical self damage, including resistance and barriers rather than HP removal',()=>{
  for(const shield of [false,true]){const w=world(PACT);w.target.magicResist=0;if(shield)w.caster.statuses.push({kind:'magicShield',value:100,remaining:100,source:w.caster.id,skill:'barrier',until:100} as never);const hp=w.caster.hp;started(w,PACT);advance(w,2.5);expect(hp-w.caster.hp).toBeCloseTo(shield?0:67.5);if(shield)expect(w.caster.absorbed).toBeCloseTo(67.5);}
  const low=world(PACT);low.caster.hp=1;started(low,PACT);advance(low,2.5);expect(low.caster.hp).toBe(1);expect(low.caster.dead).toBe(false);
 });
 it('Gaben copies use half the normal tier-three damage and omit Super offensive dispel',()=>{
  const w=world(PACT,9,{ally:true,secondEnemy:true});w.target.magicResist=w.other!.magicResist=0;for(const enemy of [w.target,w.other!])enemy.statuses.push({kind:'attackBonus',value:10,until:100,harmful:false,dispel:'basic'} as never);started(w,PACT);advance(w,2.5);
  const damage=(id:string)=>w.b.events.filter(e=>e.type==='hit'&&e.skill===PACT&&e.target===id).reduce((n,e)=>n+(e.amount??0),0);expect(damage(w.target.id)).toBeCloseTo(450);expect(damage(w.other!.id)).toBeCloseTo(150);expect(effect(w.target,'attackBonus')).toBeUndefined();expect(effect(w.other!,'attackBonus')).toBeDefined();
 });
});

describe('defense and dispel: Spiked Carapace',()=>{
 it('protects once per enemy source, including nested independent spell damage, before consuming shields',()=>{
  const w=world(CARAPACE,3,{secondEnemy:true});started(w,CARAPACE);w.caster.statuses.push({kind:'shield',value:100,remaining:100,source:w.caster.id,skill:'test_shield',until:100} as never);const hp=w.target.hp;
  expect(applyDamage(w.b,w.target,w.caster,80,'pure','child_proc',false,1)).toBe(0);expect(w.target.hp).toBe(hp-80);expect((effect(w.caster,'shield') as unknown as {remaining:number}).remaining).toBe(100);
  applyDamage(w.b,w.target,w.caster,40,'pure','second');expect((effect(w.caster,'shield') as unknown as {remaining:number}).remaining).toBe(60);const hp2=w.other!.hp;applyDamage(w.b,w.other!,w.caster,30,'pure','other');expect(w.other!.hp).toBe(hp2-30);
 });
 it('does not reflect allies, HP removal or reflection, and keeps an undispellable stance',()=>{
  const w=world(CARAPACE,3,{ally:true});started(w,CARAPACE);expect((effect(w.caster,'spikedCarapace') as unknown as {dispel:string}).dispel).toBe('none');const allyHp=w.friend!.hp;
  expect(applyDamage(w.b,w.friend!,w.caster,20,'pure','ally')).toBe(20);expect(w.friend!.hp).toBe(allyHp);
  const enemyHp=w.target.hp;expect(applyDamage(w.b,w.target,w.caster,20,'pure','hp_removal',false,0,false,undefined,{flags:{healthRemoval:true}})).toBe(20);expect(applyDamage(w.b,w.target,w.caster,20,'pure','reflection',false,0,false,undefined,{flags:{reflection:true}})).toBe(20);expect(w.target.hp).toBe(enemyHp);
 });
 it('retains AA Super stun and Gaben reflection values without modern innate mana burn',()=>{
  const w=world(CARAPACE,9);started(w,CARAPACE);const mana=w.target.mana;applyDamage(w.b,w.target,w.caster,100,'pure','test');expect(w.target.taken).toBe(400);expect(effect(w.target,'stun',CARAPACE)!.until-w.b.time).toBeCloseTo(3);expect(w.target.mana).toBe(mana);
 });
});

describe('defense and dispel: Borrowed Time',()=>{
 it('activates immediately after a nonlethal hit across the threshold, even while silenced and stunned',()=>{
  const w=world(TIME,6,{fast:false});w.caster.hp=450;w.caster.mana=0;w.caster.statuses.push({kind:'stun',until:100,harmful:true,dispel:'strong'} as never,{kind:'silence',until:100,harmful:true,dispel:'basic'} as never);
  applyDamage(w.b,w.target,w.caster,100,'pure','first');expect(w.caster.hp).toBe(350);expect(effect(w.caster,'borrowedTime')).toBeDefined();expect(effect(w.caster,'stun')).toBeUndefined();expect(effect(w.caster,'silence')).toBeUndefined();expect(w.b.events.some(e=>e.type==='cast'&&e.skill===TIME)).toBe(false);
  applyDamage(w.b,w.target,w.caster,100,'pure','same_tick_second');expect(w.caster.hp).toBe(450);expect(w.caster.cooldowns[0]).toBeGreaterThan(w.b.time);
 });
 it('does not trigger on setting HP, HP removal, break, or a lethal hit from above the threshold',()=>{
  for(const mode of ['set','hpRemoval','break','lethal'] as const){const w=world(TIME,3,{fast:false});w.caster.statuses.push({kind:'silence',until:100});w.caster.hp=mode==='set'?350:450;if(mode==='break')w.caster.statuses.push({kind:'break',until:100});
   if(mode==='set')advance(w,FIXED_STEP);else applyDamage(w.b,w.target,w.caster,mode==='lethal'?500:100,'pure','test',false,0,false,undefined,mode==='hpRemoval'?{flags:{healthRemoval:true}}:{});
   expect(effect(w.caster,'borrowedTime'),mode).toBeUndefined();if(mode==='lethal')expect(w.caster.dead).toBe(true);
  }
 });
 it('Gaben reduces eligible nearby ally damage by 40% and heals for the redirected portion',()=>{
  const w=world(TIME,9,{ally:true,fast:false});w.friend!.x=2;w.caster.hp=450;w.caster.statuses.push({kind:'silence',until:100});applyDamage(w.b,w.target,w.caster,100,'pure','trigger');advance(w,.2);const own=w.caster.hp,ally=w.friend!.hp;
  expect(applyDamage(w.b,w.target,w.friend!,200,'pure','ally_hit')).toBeCloseTo(120);expect(w.friend!.hp).toBeCloseTo(ally-120);expect(w.caster.hp).toBeCloseTo(own+80);
 });
 it('automatic activation preserves an already running channel and uses the same slot cooldown',()=>{
  const field='custom_crystal_maiden_freezing_field',w=world(TIME,3,{fast:false,casterSkill:field});w.caster.hp=450;started(w,field);expect(w.caster.action).toBe('channel');const until=w.caster.castUntil;
  applyDamage(w.b,w.target,w.caster,100,'pure','trigger_channel');expect(effect(w.caster,'borrowedTime')).toBeDefined();expect(w.caster.action).toBe('channel');expect(w.caster.castUntil).toBe(until);expect(w.b.events.filter(e=>e.type==='cast'&&e.skill===TIME)).toHaveLength(0);
  const cooldown=w.caster.cooldowns[0];advance(w,2.1);expect(effect(w.caster,'borrowedTime')).toBeUndefined();applyDamage(w.b,w.target,w.caster,100,'pure','still_cooling');expect(effect(w.caster,'borrowedTime')).toBeUndefined();expect(w.caster.cooldowns[0]).toBe(cooldown);
 });
 it('documents the current Gaben aura first-pulse boundary at 0.1 seconds',()=>{
  const w=world(TIME,9,{ally:true,fast:false});w.friend!.x=2;w.caster.hp=450;applyDamage(w.b,w.target,w.caster,100,'pure','trigger');expect(effect(w.friend!,'borrowedRedirect')).toBeUndefined();advance(w,2*FIXED_STEP);expect(effect(w.friend!,'borrowedRedirect')).toBeUndefined();advance(w,2*FIXED_STEP);expect(effect(w.friend!,'borrowedRedirect')).toBeDefined();
 });
});
