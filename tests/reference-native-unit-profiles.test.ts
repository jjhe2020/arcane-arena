import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {applyDamage,createBattle,FIXED_STEP,getCombatStats,isRangedAttackType,restoreBattle,serializeBattle,statusValue,stepBattle} from '../src/combat';
import {UNIT_CONFIG} from '../src/config';
import type {BattleState,CombatUnit,Player,Role,SkillDefinition} from '../src/model';

const WILD='custom_beastmaster_call_of_the_wild',TREANTS='custom_furion_force_of_nature',WOLVES='custom_lycan_summon_wolves',GAZE='medusa_stone_gaze',WARD='custom_witch_doctor_death_ward';
const catalog=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
function player(side:number,id='',points=3,role:Role='mage'):Player{if(id&&!catalog.some(d=>d.id===id))throw new Error(`Unknown test skill: ${id}`);return{id:side,name:'P',hp:100,gold:0,shopLevel:1,locked:false,reserve:[],shop:[],heroes:[{id:'h',name:'H',role,skin:'male',x:0,y:-2,skills:id?[{id,points}]:[]},{id:'survivor',name:'Survivor',role:'tank',skin:'female',x:12,y:-12,skills:[]}]};}
function setup(id:string,points=3,seed=1){
 const b=createBattle(player(0,id,points),player(1),seed,catalog),u=b.units[0],t=b.units.find(unit=>unit.side===1)!;
 for(const unit of b.units){unit.hp=unit.maxHp=1e6;unit.mana=unit.maxMana=10000;unit.nextAttack=1000;unit.moveSpeed=0;unit.magicResist=0;unit.armor=0;unit.statuses.push({kind:'disarm',until:1000});}
 u.x=u.y=0;u.facing=Math.PI/2;t.x=0;t.y=4;t.facing=-Math.PI/2;
 return{b,u,t};
}
const advance=(b:BattleState,seconds:number)=>stepBattle(b,seconds,catalog);
function spawn(id:string,points:number,template:string,seed=1){
 const h=setup(id,points,seed);for(let n=0;n<180;n++){advance(h.b,FIXED_STEP);const body=h.b.units.find(unit=>unit.summoned&&unit.nativeTemplateId===template);if(body){h.u.cooldowns[0]=1000;return{...h,body};}}
 throw new Error(`No actual native summon ${template} from ${id}`);
}
function isolate(h:ReturnType<typeof spawn>,distance=5){
 for(const unit of h.b.units){unit.moveSpeed=0;unit.nextAttack=1000;unit.cooldowns=unit.skills.map(()=>1000);if(unit!==h.body)unit.statuses.push({kind:'disarm',until:1000});}
 h.body.x=h.body.y=0;h.body.facing=Math.PI/2;h.body.nextAttack=h.b.time;h.body.statuses=h.body.statuses.filter(s=>s.kind!=='disarm');h.t.x=0;h.t.y=distance;
}
const cases:[string,string,number,number][]=[
 ['npc_dota_beastmaster_boar',WILD,3,1],['npc_dota_warlock_golem','custom_warlock_chaotic_offering',3,1],
 ['npc_dota_beastmaster_hawk_4',WILD,3,1],['npc_dota_furion_treant_4',TREANTS,3,1],['npc_dota_furion_treant_large',TREANTS,6,1],['npc_dota_lycan_wolf4',WOLVES,3,1],
 ['npc_dota_necronomicon_archer_3',WILD,6,1],['npc_dota_necronomicon_warrior_3',WILD,6,1],['npc_dota_neutral_big_thunder_lizard',WILD,9,12345],['npc_dota_neutral_black_dragon',WILD,9,1],['npc_dota_neutral_granite_golem',WILD,9,8192],['npc_dota_neutral_mud_golem',GAZE,9,1],['npc_dota_witch_doctor_death_ward',WARD,3,1],['npc_dota_lich_ice_spire','custom_lich_chain_frost',9,1],
];

describe('Native summon profile creation and attack results',()=>{
 it('PROFILE-C15-03 actual Frostbite reads the newly bound boar level and applies the ordinary-creep duration',()=>{const h=spawn(WILD,3,'npc_dota_beastmaster_boar');for(const unit of h.b.units){unit.moveSpeed=0;unit.nextAttack=1000;unit.cooldowns=unit.skills.map(()=>1000);}h.u.x=h.u.y=12;h.body.x=h.body.y=0;h.t.x=0;h.t.y=1;h.t.facing=-Math.PI/2;h.t.skills=[{id:'crystal_maiden_frostbite',points:3}];h.t.cooldowns=[0];h.t.statuses=h.t.statuses.filter(s=>s.kind!=='disarm');advance(h.b,1);const root=h.b.events.find(e=>e.type==='status'&&e.source===h.t.id&&e.target===h.body.id&&e.skill==='crystal_maiden_frostbite'&&e.status==='root');expect(root).toBeDefined();expect(root?.duration).toBe(10);expect(h.body.nativeLevel).toBe(1);for(const profile of Object.values(UNIT_CONFIG))expect(Number.isInteger(profile.Level)&&profile.Level>=0).toBe(true);});
 it('PROFILE-C15-01 boar identity migration preserves its AA stats without duplicate skill clocks',()=>{const h=spawn(WILD,3,'npc_dota_beastmaster_boar');expect(h.body.maxHp).toBe(750);expect(h.body.attack).toBe(50);expect(h.body.range).toBe(5.5);expect(h.body.attackInterval).toBe(1.25);expect(h.body.moveSpeed).toBe(3.5);expect(h.body.attackPoint).toBe(.5);expect(h.body.projectileSpeed).toBe(15);expect(h.body.attackCapability).toBe('ranged');expect(h.body.nativeLevel).toBe(1);});
 it('PROFILE-C15-02 golem uses a genuine melee native identity while retaining AA zero attack',()=>{const h=spawn('custom_warlock_chaotic_offering',3,'npc_dota_warlock_golem');expect(h.body.attack).toBe(0);expect(h.body.range).toBe(2.25);expect(h.body.attackInterval).toBe(1.2);expect(h.body.attackPoint).toBe(.26);expect(h.body.attackBackswing).toBe(.57);expect(h.body.projectileSpeed).toBe(0);expect(h.body.turnRate).toBe(15);expect(h.body.nativeLevel).toBe(1);expect(h.body.skills.some(s=>s?.id==='custom_warlock_chaotic_offering')).toBe(true);});
 it.each(cases)('PROFILE-01 %s is configured on its actual creation frame', (template,id,points,seed)=>{
  const{body}=spawn(id,points,template,seed),raw=UNIT_CONFIG[template];expect(body.sourceUnitType).toBe(template);expect(body.nativeBaseAttackSpeed).toBe(raw.BaseAttackSpeed);expect(body.attackCapability).toBe(raw.attackCapability===0?'none':raw.attackCapability===1?'melee':'ranged');
  for(const key of ['attackPoint','attackBackswing','projectileSpeed','turnRate','attackRangeBuffer'])expect(body[key]).toBe(raw[key]);
 });
 it('PROFILE-02 Shard Split binds both new native shard profiles immediately on their actual death spawn',()=>{
  const h=spawn(GAZE,9,'npc_dota_neutral_mud_golem');applyDamage(h.b,h.t,h.body,2e6,'pure','fixture');const shards=h.b.units.filter(u=>u.nativeTemplateId==='npc_dota_neutral_mud_golem_split');expect(shards).toHaveLength(2);
  for(const shard of shards){expect(shard.nativeBaseAttackSpeed).toBe(150);expect(shard.attackInterval).toBe(2);expect(shard.attackPoint).toBe(.3);expect(shard.attackBackswing).toBe(.5);expect(shard.attackCapability).toBe('melee');}
 });
 it('PROFILE-03 native profiles preserve AA summon health damage range movement duration and granted skills',()=>{
  const h=spawn(WOLVES,9,'npc_dota_lycan_wolf4'),wolves=h.b.units.filter(u=>u.nativeTemplateId==='npc_dota_lycan_wolf4');expect(wolves).toHaveLength(5);const normal=wolves.find(u=>!u.bigBadWolf)!,big=wolves.find(u=>u.bigBadWolf)!;expect(big.maxHp).toBe(normal.maxHp*5);expect(big.attack).toBe(normal.attack*5);expect(big.moveSpeed).toBe(normal.moveSpeed);expect(big.attackInterval).toBe(normal.attackInterval);expect(big.expiresAt).toBe(normal.expiresAt);
 });
 it('PROFILE-04 native109 base attack speed adds flat attack speed instead of predividing BAT',()=>{
  const h=spawn(WILD,6,'npc_dota_necronomicon_archer_3');expect(h.body.attackInterval).toBe(1);expect(getCombatStats(h.body).attackInterval).toBeCloseTo(100/109);h.body.statuses.push({kind:'attackSpeed',value:100,until:100});expect(getCombatStats(h.body).attackInterval).toBeCloseTo(100/209);
 });
 it('PROFILE-05 a real Archer attack launches after its native scaled point with the independently authored backswing',()=>{
  const h=spawn(WILD,6,'npc_dota_necronomicon_archer_3');isolate(h);advance(h.b,FIXED_STEP);const order=h.b.events.find(e=>e.type==='attack'&&e.source===h.body.id)!;expect(order.windup).toBeCloseTo(.7*100/109);expect(order.duration).toBeCloseTo((.7+.3)*100/109);advance(h.b,.7);expect((h.b.projectiles as {source:string}[]).some(p=>p.source===h.body.id)).toBe(true);
 });
 it('PROFILE-06 an Archer missile travels at nine world units per second rather than the hero default fourteen',()=>{
  const h=spawn(WILD,6,'npc_dota_necronomicon_archer_3');isolate(h);let p:{id:string;x:number;y:number}|undefined;
  for(let tick=0;tick<60&&!p;tick++){advance(h.b,FIXED_STEP);p=(h.b.projectiles as {id:string;source:string;x:number;y:number}[]).find(p=>p.source===h.body.id);}
  expect(p).toBeDefined();const start={x:p!.x,y:p!.y};advance(h.b,FIXED_STEP);const moved=(h.b.projectiles as {id:string;x:number;y:number}[]).find(q=>q.id===p!.id)!;expect(Math.hypot(moved.x-start.x,moved.y-start.y)/FIXED_STEP).toBeCloseTo(9);
 });
 it('PROFILE-07 no-attack Hawk cannot issue attacks even when disarm is absent and damage and range preconditions would allow them',()=>{
  const h=spawn(WILD,3,'npc_dota_beastmaster_hawk_4');isolate(h,1);h.body.range=5;h.body.attack=100;advance(h.b,2);expect(h.b.events.some(e=>e.type==='attack'&&e.source===h.body.id)).toBe(false);expect(h.body.damage).toBe(0);
 });
 it('PROFILE-08 native melee identity remains melee with a custom long range and native ranged identity remains ranged at short range',()=>{
  const melee=spawn(TREANTS,3,'npc_dota_furion_treant_4');melee.body.range=5.5;expect(isRangedAttackType(melee.body)).toBe(false);const ranged=spawn(WILD,6,'npc_dota_necronomicon_archer_3');ranged.body.range=1;expect(isRangedAttackType(ranged.body)).toBe(true);ranged.body.statuses.push({kind:'attackTypeOverride',value:1,until:100});expect(isRangedAttackType(ranged.body)).toBe(false);
 });
 it('PROFILE-09 an actual melee native attack resolves at its point without creating a default-speed projectile',()=>{
  const h=spawn(TREANTS,3,'npc_dota_furion_treant_4');isolate(h,.9);advance(h.b,.6);expect(h.b.events.some(e=>e.type==='hit'&&e.source===h.body.id&&(e.amount??0)>0)).toBe(true);expect((h.b.projectiles as {source:string}[]).some(p=>p.source===h.body.id)).toBe(false);
 });
 it('PROFILE-10 BAT replacement changes attack cadence while native attack point and backswing remain governed by total attack speed',()=>{
  const h=spawn(WILD,6,'npc_dota_necronomicon_archer_3');h.body.statuses.push({kind:'baseAttackTime',value:1.5,until:100});isolate(h);advance(h.b,FIXED_STEP);const order=h.b.events.find(e=>e.type==='attack'&&e.source===h.body.id)!;expect(order.windup).toBeCloseTo(.7*100/109);expect(order.duration).toBeCloseTo(100/109);expect(getCombatStats(h.body).attackInterval).toBeCloseTo(1.5*100/109);
 });
 it('PROFILE-11 the flat-turn native profile requires facing before its real ordinary attack and never snaps by pi',()=>{
  const h=spawn(WILD,6,'npc_dota_necronomicon_archer_3');isolate(h);h.body.facing=-Math.PI/2;advance(h.b,FIXED_STEP);expect(Math.abs(Math.atan2(Math.sin(h.body.facing+Math.PI/2),Math.cos(h.body.facing+Math.PI/2)))).toBeLessThanOrEqual(h.body.turnRate!*FIXED_STEP+1e-8);expect(h.b.events.some(e=>e.type==='attack'&&e.source===h.body.id)).toBe(false);advance(h.b,.3);expect(h.b.events.some(e=>e.type==='attack'&&e.source===h.body.id)).toBe(true);
 });
 it('PROFILE-12 the inherited native250 attack buffer permits an already winding attack after the victim moves beyond range',()=>{
  const h=spawn(WILD,6,'npc_dota_necronomicon_archer_3');isolate(h,5);advance(h.b,FIXED_STEP);h.t.y=7;advance(h.b,1.5);expect(h.b.events.some(e=>e.type==='status'&&e.source===h.body.id&&e.status==='attackPoint')).toBe(true);expect(h.b.events.some(e=>e.type==='hit'&&e.source===h.body.id&&(e.amount??0)>0)).toBe(true);
 });
 it('PROFILE-13 all four custom hero roles keep their configured profile and the confirmed eighteen-radian default',()=>{
  for(const role of ['mage','archer','tank','assassin'] as const){const b=createBattle(player(0,'',3,role),player(1),1,catalog),u=b.units[0];expect(u.nativeTemplateId).toBeUndefined();expect(u.nativeBaseAttackSpeed).toBeUndefined();expect(u.turnRate).toBe(18);}
 });
 it('PROFILE-14 a project attack-time factor scales native cadence point and backswing together without changing baseAS',()=>{
  const h=spawn(WILD,6,'npc_dota_necronomicon_archer_3');h.body.statuses.push({kind:'attackTimePct',value:5.5,until:100});isolate(h);advance(h.b,FIXED_STEP);const order=h.b.events.find(e=>e.type==='attack'&&e.source===h.body.id)!;expect(order.windup).toBeCloseTo(.7*100/109*6.5);expect(order.duration).toBeCloseTo(100/109*6.5);expect(getCombatStats(h.body).attackInterval).toBeCloseTo(100/109*6.5);expect(h.body.nativeBaseAttackSpeed).toBe(109);
 });
 it('PROFILE-15 a real Inner Beast aura adds its AA flat forty-five attack speed to the native109 base',()=>{
  const a=player(0,WILD,6);a.heroes[0].skills.push({id:'custom_beastmaster_inner_beast',points:3});const b=createBattle(a,player(1),1,catalog);for(const u of b.units){u.hp=u.maxHp=1e6;u.nextAttack=1000;u.moveSpeed=0;u.statuses.push({kind:'disarm',until:100});}advance(b,.8);const archer=b.units.find(u=>u.nativeTemplateId==='npc_dota_necronomicon_archer_3')!;expect(archer).toBeDefined();expect(statusValue(archer,'attackSpeed')).toBe(45);expect(getCombatStats(archer).attackInterval).toBeCloseTo(100/154);
 });
 it('PROFILE-16 flat attack-speed changes during a real native windup rescale its remaining work once',()=>{
  const h=spawn(WILD,6,'npc_dota_necronomicon_archer_3');isolate(h);advance(h.b,FIXED_STEP);const order=h.b.events.find(e=>e.type==='attack'&&e.source===h.body.id)!;advance(h.b,.2);h.body.statuses.push({kind:'attackSpeed',value:100,until:100});advance(h.b,.6);const point=h.b.events.find(e=>e.type==='status'&&e.source===h.body.id&&e.status==='attackPoint')!;const expected=order.time+.2+(.7*100/109-.2)*109/209;expect(point).toBeDefined();expect(Math.abs(point.time-expected)).toBeLessThanOrEqual(2*FIXED_STEP);
 });
 it('PROFILE-17 a new ordinary summon made by a native caster does not inherit its native attack identity or baseAS',()=>{
  const h=spawn(WILD,6,'npc_dota_necronomicon_archer_3');h.body.skills.push({id:WILD,points:3});h.body.cooldowns=h.body.skills.map(()=>1000);h.body.cooldowns[h.body.skills.length-1]=0;h.body.mana=h.body.maxMana=10000;const old=new Set(h.b.units.map(u=>u.id));advance(h.b,.7);const boar=h.b.units.find(u=>!old.has(u.id)&&u.beastmasterBoar)!;expect(boar).toBeDefined();expect(boar.nativeTemplateId).toBe('npc_dota_beastmaster_boar');expect(boar.nativeTemplateId).not.toBe(h.body.nativeTemplateId);expect(boar.sourceUnitType).toBe('npc_dota_beastmaster_boar');expect(boar.nativeBaseAttackSpeed).toBe(100);expect(boar.attackPoint).toBe(.5);expect(boar.attackCapability).toBe('ranged');expect(getCombatStats(boar).attackInterval).toBe(1.25);
 });
 it('PROFILE-18 an actual illusion cast copies its native caster profile snapshot without rereading the template table',()=>{
  const h=spawn(WILD,6,'npc_dota_necronomicon_archer_3');h.body.skills.push({id:'custom_naga_siren_mirror_image',points:3});h.body.cooldowns=h.body.skills.map(()=>1000);h.body.cooldowns[h.body.skills.length-1]=0;h.body.mana=h.body.maxMana=10000;h.body.attackPoint=.123;h.body.attackBackswing=.234;h.body.nativeBaseAttackSpeed=150;const old=new Set(h.b.units.map(u=>u.id));advance(h.b,1);const images=h.b.units.filter(u=>!old.has(u.id)&&u.illusion);expect(images.length).toBeGreaterThan(0);for(const image of images){expect(image.attackPoint).toBe(.123);expect(image.attackBackswing).toBe(.234);expect(image.nativeBaseAttackSpeed).toBe(150);expect(image.attackCapability).toBe('ranged');}
 });
 it('PROFILE-19 a real zero-point Death Ward releases on its attack-order tick and damage follows projectile processing',()=>{
  const h=spawn(WARD,3,'npc_dota_witch_doctor_death_ward');advance(h.b,.2);const order=h.b.events.find(e=>e.type==='attack'&&e.source===h.body.id)!,point=h.b.events.find(e=>e.type==='status'&&e.source===h.body.id&&e.status==='attackPoint')!,hit=h.b.events.find(e=>e.type==='hit'&&e.source===h.body.id&&(e.amount??0)>0)!;expect(order).toBeDefined();expect(order.windup).toBe(0);expect(point.time).toBe(order.time);expect(hit).toBeDefined();expect(hit.time-point.time).toBeCloseTo(FIXED_STEP);
 });
 it.each([WILD,TREANTS,WOLVES,GAZE,WARD])('PROFILE-REPLAY %s recreates native profiles and their attack clocks from recorded inputs',id=>{
  const a=player(0,id,9),enemy=player(1);for(const p of [a,enemy])for(const h of p.heroes)h.persistentStrengthBonus=250;const b=createBattle(a,enemy,12345,catalog);advance(b,3);const restored=restoreBattle(serializeBattle(b),catalog);advance(b,2);advance(restored,2);expect(serializeBattle(restored)).toBe(serializeBattle(b));
 });
});
