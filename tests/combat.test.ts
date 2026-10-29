import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyDamage, battleGains, battleStats, createBattle, FIXED_STEP, physicalDamageMultiplier, restoreBattle, serializeBattle, simulateBattle, stepBattle } from '../src/combat';
import { arrayValue, basicLevel, getMechanicCoverage, skillValue } from '../src/skill-effects';
import { ROLES, type Hero, type Player, type SkillDefinition, type SkillStack } from '../src/model';

const definition = (id:string, values:string[], extra:Partial<SkillDefinition>={}):SkillDefinition=>({id,name:id,nameEn:id,tags:[],description:'',descriptionEn:'',super:'',gaben:'',values,cooldowns:[8],mana:[50],categories:[],icon:'',passive:false,ultimate:false,...extra});
const missile=definition('custom_vengefulspirit_magic_missile',['DAMAGE: 90 / 180 / 360','STUN DURATION: 1.4 / 1.5 / 1.7']);
const blackHole=definition('enigma_black_hole',['DAMAGE PER SECOND: 20 / 60 / 100','DURATION: 4','RADIUS: 350'],{cooldowns:[30],mana:[100]});
const treants=definition('custom_furion_force_of_nature',['TREANT COUNT: 2 / 3 / 5','TREANT HEALTH: 550','TREANT DAMAGE: 18 / 26 / 42','TREANT DURATION: 4'],{cooldowns:[30]});
function player(id:number,skills:(SkillStack|null)[]=[],role:Hero['role']='mage'):Player {
  return {id,name:`P${id}`,hp:100,gold:10,shopLevel:1,heroes:[{id:'h0',name:`hero${id}`,role,skin:'female',x:0,y:-2,skills}],reserve:[],shop:[],locked:false};
}
function advance(b:ReturnType<typeof createBattle>,seconds:number,defs:SkillDefinition[],frame=FIXED_STEP) { for(let i=0;i<Math.round(seconds/frame);i++)stepBattle(b,frame,defs); }

describe('fixed-step combat state and replay',()=>{
  it('keeps player IDs, mirrored world coordinates and detached battle loadouts',()=>{
    const a=player(3,[{id:missile.id,points:1}]),b=player(9);a.heroes[0].x=4;b.heroes[0].x=-8;
    const battle=createBattle(a,b,12,[missile]);
    expect(battle.units.map(u=>[u.side,u.x,u.y])).toEqual([[3,4,-2],[9,8,2]]);
    a.heroes[0].skills[0]!.points=9;a.heroes[0].x=99;
    expect(battle.units[0].skills[0]!.points).toBe(1);expect(battle.units[0].x).toBe(4);
  });
  it('produces identical events and health at different render frame rates',()=>{
    const defs=[missile,treants],a=player(0,[{id:missile.id,points:3},{id:treants.id,points:1}]),other=player(7,[{id:missile.id,points:1}],'tank');
    const slow=createBattle(a,other,55,defs),fast=createBattle(a,other,55,defs);
    advance(slow,12,defs,1/15);advance(fast,12,defs,1/120);
    expect(slow.time).toBe(fast.time);expect(slow.rng).toBe(fast.rng);
    expect(slow.events).toEqual(fast.events);expect(slow.units).toEqual(fast.units);
  });
  it('restores in-flight projectiles and queued effects from JSON deterministically',()=>{
    const defs=[missile,treants],original=createBattle(player(0,[{id:missile.id,points:2},{id:treants.id,points:1}]),player(4,[],'tank'),11,defs);
    advance(original,.4,defs);expect((original.projectiles as unknown[]).length).toBeGreaterThan(0);
    const serialized=serializeBattle(original),restored=restoreBattle(serialized,defs),plain=JSON.parse(serialized);
    advance(original,5,defs);advance(restored,5,defs);advance(plain,5,defs);
    expect(restored.events).toEqual(original.events);expect(plain.events).toEqual(original.events);
    expect(restored.units).toEqual(original.units);expect(plain.units).toEqual(original.units);
  });
  it('does not turn an unimplemented skill into free generic damage',()=>{
    const unknown=definition('not_implemented',['DAMAGE: 999999'],{mana:[0],cooldowns:[0]});
    const equipped=simulateBattle(player(0,[{id:unknown.id,points:9}]),player(1),20,[unknown]);
    const empty=simulateBattle(player(0),player(1),20,[]);
    expect(equipped.events.filter(e=>e.type==='cast')).toHaveLength(0);
    expect(equipped.events).toEqual(empty.events);
    expect(getMechanicCoverage([unknown])[0]).toMatchObject({status:'unimplemented',base:false,super:false,gaben:false,verifiedAgainstReference:false});
  });
  it('finishes empty-sided matches without advancing time',()=>{
    const a=player(2),b=player(8);a.heroes=[];const battle=createBattle(a,b,1,[]);
    expect(battle.finished).toBe(true);expect(battle.winner).toBe(8);expect(battle.time).toBe(0);
  });
});

describe('damage, spells and interruption',()=>{
  it('uses physical armor, magic resistance, pure damage and actual rather than overkill stats',()=>{
    const battle=createBattle(player(0),player(1,[],'tank'),1,[]),[a,b]=battle.units;
    const physical=applyDamage(battle,a,b,100,'physical');expect(physical).toBeCloseTo(100*physicalDamageMultiplier(10));
    expect(applyDamage(battle,a,b,100,'magical')).toBeCloseTo(75);
    expect(applyDamage(battle,a,b,100,'pure')).toBeCloseTo(100);
    const remaining=b.hp;expect(applyDamage(battle,a,b,1e6,'pure')).toBeCloseTo(remaining);
    expect(a.damage).toBeCloseTo(b.maxHp);expect(b.taken).toBeCloseTo(b.maxHp);expect(b.dead).toBe(true);
    expect(battle.events.filter(e=>e.type==='death')).toHaveLength(1);
    expect(battleStats(battle)[0].damage).toBeCloseTo(b.maxHp);
  });
  it('respects spell immunity without making it physical immunity',()=>{
    const battle=createBattle(player(0),player(1),1,[]),[a,b]=battle.units;b.statuses.push({kind:'magicImmune',until:10});
    expect(applyDamage(battle,a,b,100,'magical')).toBe(0);
    expect(applyDamage(battle,a,b,100,'pure')).toBe(0);
    expect(applyDamage(battle,a,b,100,'pure',undefined,true)).toBe(100);
    expect(applyDamage(battle,a,b,100,'physical')).toBeGreaterThan(0);
    expect(applyDamage(battle,a,b,100,'physical','non_piercing_spell')).toBe(0);
    expect(applyDamage(battle,a,b,100,'physical','piercing_spell',true)).toBeGreaterThan(0);
  });
  it('limits flat attack blocking to attack damage rather than physical spell damage',()=>{
    const b=createBattle(player(0),player(1),1,[]),[source,target]=b.units;target.statuses.push({kind:'block',value:20,until:10});
    expect(applyDamage(b,source,target,100,'physical')).toBeCloseTo(80*physicalDamageMultiplier(target.armor));
    expect(applyDamage(b,source,target,100,'physical','physical_spell')).toBeCloseTo(100*physicalDamageMultiplier(target.armor));
  });
  it('lets hexed units move slowly while preventing attacks and spells',()=>{
    const a=player(0,[{id:missile.id,points:3}],'tank');a.heroes[0].y=-9;
    const b=createBattle(a,player(1),1,[missile]),[hexed,enemy]=b.units;
    hexed.statuses.push({kind:'hex',until:10});enemy.statuses.push({kind:'stun',until:10});stepBattle(b,1,[missile]);
    expect(hexed.y).toBeGreaterThan(-9);expect(hexed.y).toBeLessThan(-8);expect(hexed.action).toBe('move');
    expect(b.events.some(e=>e.source===hexed.id&&(e.type==='cast'||e.type==='attack'))).toBe(false);
  });
  it('interrupts a cast windup before spending mana or applying the effect',()=>{
    const battle=createBattle(player(0,[{id:missile.id,points:3}]),player(1),7,[missile]);stepBattle(battle,FIXED_STEP,[missile]);
    expect(battle.units[0].action).toBe('cast');battle.units[0].statuses.push({kind:'stun',until:2});
    advance(battle,.5,[missile]);expect(battle.events.filter(e=>e.type==='cast'&&e.source==='0:h0')).toHaveLength(0);
    expect(battle.units[0].mana).toBe(battle.units[0].maxMana);expect(battle.units[0].action).toBe('controlled');
  });
  it('stops channel damage on interruption instead of leaving a detached damage zone',()=>{
    const battle=createBattle(player(0,[{id:blackHole.id,points:3}]),player(1,[],'tank'),7,[blackHole]);
    advance(battle,2,[blackHole]);expect(battle.units[0].action).toBe('channel');
    const damageBefore=battle.events.filter(e=>e.type==='hit'&&e.skill===blackHole.id).length;expect(damageBefore).toBeGreaterThan(0);
    battle.units[0].statuses.push({kind:'stun',until:3});advance(battle,1,[blackHole]);
    expect(battle.events.filter(e=>e.type==='hit'&&e.skill===blackHole.id)).toHaveLength(damageBefore);
  });
  it('creates finite-lived independent summons and attributes their damage to the owner',()=>{
    const battle=createBattle(player(0,[{id:treants.id,points:1}]),player(1,[],'tank'),7,[treants]);
    advance(battle,1,[treants]);const summons=battle.units.filter(u=>u.summoned);expect(summons).toHaveLength(2);
    expect(new Set(summons.map(u=>u.id)).size).toBe(2);expect(summons.every(u=>u.owner==='0:h0')).toBe(true);
    advance(battle,4,[treants]);expect(summons.every(u=>u.dead)).toBe(true);
    expect(battle.events.some(e=>e.type==='hit'&&e.source.includes('summon'))).toBe(true);
    expect(battle.units[0].damage).toBeGreaterThan(0);
  });
  it('negates discrete refraction charges and consumes mana-funded shields',()=>{
    const b=createBattle(player(0),player(1),1,[]),[source,target]=b.units;
    target.statuses.push({kind:'refraction',until:10,value:2,remaining:2} as never);
    expect(applyDamage(b,source,target,100,'pure')).toBe(0);expect(applyDamage(b,source,target,100,'pure')).toBe(0);
    expect(applyDamage(b,source,target,100,'pure')).toBe(100);
    target.statuses.push({kind:'manaShield',until:10,value:.5},{kind:'damagePerMana',until:10,value:2});const mana=target.mana;
    expect(applyDamage(b,source,target,100,'pure')).toBe(50);expect(target.mana).toBe(mana-25);
  });
  it('waits for a scheduled resurrection before declaring a winner',()=>{
    const b=createBattle(player(0),player(1),3,[]),[source,target]=b.units;
    target.statuses.push({kind:'reincarnation',until:100,value:1});applyDamage(b,source,target,10000,'pure');
    stepBattle(b,1,[]);expect(target.dead).toBe(true);expect(b.finished).toBe(false);
    stepBattle(b,2,[]);expect(target.dead).toBe(false);expect(target.hp).toBeGreaterThan(0);
    expect(b.events.some(e=>e.status==='revived')).toBe(true);
  });
  it('tracks capped healing instead of treating all raw healing as useful',()=>{
    const sap=definition('custom_bane_brain_sap',['HEAL/DAMAGE: 75 / 150 / 300']);
    const b=createBattle(player(0,[{id:sap.id,points:3}]),player(1,[],'tank'),5,[sap]);b.units[0].hp-=50;
    advance(b,.5,[sap]);expect(b.units[0].healing).toBe(50);
    expect(b.events.find(e=>e.type==='heal')?.amount).toBe(50);
  });
  it('settles fractional remaining DoT duration instead of dropping its last half-second',()=>{
    const frost=definition('crystal_maiden_frostbite',['HERO DURATION: 1.5','DAMAGE PER SECOND: 100'],{cooldowns:[100],mana:[0]});
    const b=createBattle(player(0,[{id:frost.id,points:1}]),player(1,[],'tank'),4,[frost]);stepBattle(b,2,[frost]);
    const ticks=b.events.filter(e=>e.type==='hit'&&e.skill===frost.id).map(e=>e.amount??0);
    expect(ticks).toHaveLength(2);expect(ticks[0]).toBeCloseTo(75);expect(ticks[1]).toBeCloseTo(37.5);
  });
  it('settles deferred damage and doubled healing once when False Promise expires',()=>{
    const sap=definition('custom_bane_brain_sap',['HEAL/DAMAGE: 75 / 150 / 300']);
    const b=createBattle(player(0,[{id:sap.id,points:3}]),player(1,[],'tank'),4,[sap]),[protectedUnit,enemy]=b.units;
    protectedUnit.hp=700;protectedUnit.statuses.push({kind:'falsePromise',until:1,value:0,source:protectedUnit.id,data:{healMultiplier:2}} as never);
    expect(applyDamage(b,enemy,protectedUnit,300,'pure')).toBe(0);expect(protectedUnit.hp).toBe(700);
    advance(b,.5,[sap]);expect(protectedUnit.hp).toBe(700);
    advance(b,.5,[sap]);expect(protectedUnit.hp).toBe(1000);expect(protectedUnit.healing).toBe(300);
    expect(b.events.filter(e=>e.deferred===true&&e.type==='heal')).toHaveLength(1);
  });
  it('excludes an untargetable hero from single-target attacks while retaining area vulnerability',()=>{
    const b=createBattle(player(0),player(1),4,[]),[a,target]=b.units;
    target.statuses.push({kind:'shadowRealm',until:5},{kind:'disarm',until:5});advance(b,1,[]);
    expect(b.events.filter(e=>e.type==='attack'&&e.source===a.id)).toHaveLength(0);
    expect(applyDamage(b,a,target,100,'magical','area_damage')).toBe(75);
  });
  it('forces duel targets and prevents casting without disabling normal attacks',()=>{
    const b=createBattle(player(0,[{id:missile.id,points:3}]),player(1),8,[missile]),[a,target]=b.units;
    a.statuses.push({kind:'duel',until:3,data:{targetId:target.id}} as never);advance(b,1,[missile]);
    expect(b.events.some(e=>e.type==='attack'&&e.source===a.id)).toBe(true);
    expect(b.events.some(e=>e.type==='cast'&&e.source===a.id)).toBe(false);
  });
  it('settles delayed post-mitigation damage after leaving its protective field',()=>{
    const b=createBattle(player(0),player(1),3,[]),[source,target]=b.units;
    source.statuses.push({kind:'stun',until:20});target.statuses.push({kind:'stun',until:20},{kind:'damageDelay',until:.5,value:2.5});
    expect(applyDamage(b,source,target,100,'magical')).toBe(0);expect(target.hp).toBe(target.maxHp);
    stepBattle(b,2,[]);expect(target.hp).toBe(target.maxHp);expect(target.statuses.some(s=>s.kind==='damageDelay')).toBe(false);
    stepBattle(b,.5,[]);expect(target.maxHp-target.hp).toBe(75);expect(source.damage).toBe(75);
    expect(b.events.filter(e=>e.delayed===true)).toHaveLength(1);
  });
  it('keeps self-inflicted HP loss out of enemy damage totals',()=>{
    const b=createBattle(player(0),player(1),1,[]),u=b.units[0];
    expect(applyDamage(b,u,u,100,'pure','self_cost')).toBe(100);expect(u.taken).toBe(100);expect(u.damage).toBe(0);
  });
});

describe('project profession attributes',()=>{
  it('does not add base attribute conversions a second time to profession totals',()=>{
    for(const role of ['tank','mage','archer','assassin'] as const){
      const u=createBattle(player(0,[],role),player(1),2,[]).units[0],r=ROLES[role];
      expect([u.strength,u.agility,u.intelligence]).toEqual([r.strength,r.agility,r.intelligence]);
      expect([u.maxHp,u.maxMana,u.attack,u.armor]).toEqual([r.hp,r.mana,r.attack,r.armor]);
    }
  });
  it('updates and expires flat/percentage attribute deltas without destroying unrelated buffs',()=>{
    const b=createBattle(player(0,[],'tank'),player(1),2,[]),u=b.units[0],r=ROLES.tank;
    u.maxHp+=100;u.hp+=100;u.attack+=20;
    u.statuses.push({kind:'stun',until:10},{kind:'statBonus',value:5,until:1},{kind:'strengthPct',value:.5,until:1});
    stepBattle(b,FIXED_STEP,[]);
    expect(u.strength).toBe(55.5);expect(u.agility).toBe(19);expect(u.intelligence).toBe(23);
    expect(u.maxHp).toBe(r.hp+100+23.5*22);expect(u.maxMana).toBe(r.mana+5*12);
    expect(u.attack).toBe(r.attack+20+23.5);expect(u.armor).toBeCloseTo(r.armor+5*.167);
    stepBattle(b,1,[]);
    expect([u.strength,u.agility,u.intelligence]).toEqual([r.strength,r.agility,r.intelligence]);
    expect([u.maxHp,u.maxMana,u.attack,u.armor]).toEqual([r.hp+100,r.mana,r.attack+20,r.armor]);
  });
  it('restores persistent attributes once and reports attribute-only gains',()=>{
    const a=player(0,[],'mage');Object.assign(a.heroes[0],{persistentStrengthBonus:2,persistentAgilityBonus:3,persistentIntelligenceBonus:4,persistentAttackBonus:7});
    const b=createBattle(a,player(1),1,[]),u=b.units[0];
    expect([u.strength,u.agility,u.intelligence]).toEqual([20,19,36]);
    expect([u.maxHp,u.maxMana,u.attack]).toEqual([1044,1048,76]);expect(u.armor).toBeCloseTo(2+3*.167);
    u.statuses.push({kind:'stun',until:10});stepBattle(b,.5,[]);
    expect([u.maxHp,u.maxMana,u.attack]).toEqual([1044,1048,76]);
    u.permanentStrengthGain=1.5;expect(battleGains(b)).toEqual([{heroId:'h0',attack:0,strength:1.5,agility:0,intelligence:0}]);
  });
  it('uses derived intelligence in the Glaives damage coefficient without double-counting',()=>{
    const glaives=definition('custom_silencer_glaives_of_wisdom',['INT TO DAMAGE: 100%','INT STEAL: 2','INT STEAL DURATION: 10'],{passive:true});
    const b=createBattle(player(0,[{id:glaives.id,points:3}]),player(1,[],'tank'),3,[glaives]),u=b.units[0];
    u.statuses.push({kind:'intelligence',value:10,until:20});stepBattle(b,1,[glaives]);
    expect(b.events.filter(e=>e.type==='hit'&&e.skill===glaives.id).map(e=>e.amount)).toEqual([42]);
    expect(u.intelligence).toBe(44);expect(u.maxMana).toBe(1144);
  });
  it('records the last enemy death as persistent intelligence before battle completion',()=>{
    const glaives=definition('custom_silencer_glaives_of_wisdom',['INT TO DAMAGE: 100%','INT STEAL: 2','INT STEAL DURATION: 10'],{passive:false,mana:[15]});
    const b=createBattle(player(0,[{id:glaives.id,points:6}]),player(1),3,[glaives]),[u,enemy]=b.units;
    applyDamage(b,u,enemy,10000,'pure','test_execution');expect(u.intelligence).toBe(34);
    expect(battleGains(b)).toEqual([{heroId:'h0',attack:0,strength:0,agility:0,intelligence:0,skillState:{'custom_silencer_glaives_of_wisdom:intelligence':2}}]);
    stepBattle(b,FIXED_STEP,[glaives]);expect(b.finished).toBe(true);expect(b.winner).toBe(0);
  });
});

describe('explicit upgrade programs',()=>{
  it('starts Gaben Acid Spray across the arena without spending active-cast mana',()=>{
    const acid=definition('custom_alchemist_acid_spray',['DAMAGE PER SECOND: 30','ARMOR REDUCTION: 7','RADIUS: 475','DURATION: 16'],{mana:[160],cooldowns:[22]});
    const a=player(0,[{id:acid.id,points:9}]);a.heroes[0].x=-12;a.heroes[0].y=-10;
    const b=createBattle(a,player(1),2,[acid]);b.units.forEach(u=>u.statuses.push({kind:'stun',until:10}));stepBattle(b,1,[acid]);
    expect(b.units[0].mana).toBe(b.units[0].maxMana);expect(b.events.some(e=>e.type==='cast'&&e.skill===acid.id)).toBe(false);
    expect(b.events.filter(e=>e.type==='hit'&&e.skill===acid.id).map(e=>e.time)).toEqual([0,1]);
    expect(b.units[1].statuses.find(s=>s.kind==='armor')?.value).toBe(-10.5);
  });
  it('keeps Gaben Decay follow-up pulses at the original target position',()=>{
    const decay=definition('custom_undying_decay',['BASE DAMAGE: 110','RADIUS: 325','STEAL DURATION: 45','STRENGTH STEAL: 4'],{mana:[50],cooldowns:[4]});
    const b=createBattle(player(0,[{id:decay.id,points:9}]),player(1,[],'tank'),2,[decay]),[caster,target]=b.units;
    target.statuses.push({kind:'stun',until:20});stepBattle(b,.4,[decay]);caster.statuses.push({kind:'stun',until:20});
    expect(target.strength).toBe(22);stepBattle(b,3,[decay]);expect(target.strength).toBe(12);
    target.x=12;stepBattle(b,3,[decay]);expect(target.strength).toBe(12);
    expect(b.events.filter(e=>e.type==='hit'&&e.skill===decay.id)).toHaveLength(2);
  });
});

describe('reference value handling',()=>{
  it('does not invent fourth and fifth basic values between upgrade thresholds',()=>{
    expect([1,2,3,4,5,6,9].map(basicLevel)).toEqual([1,2,3,3,3,3,3]);
    expect(arrayValue([10,20,40],5)).toBe(40);expect(arrayValue([10],9)).toBe(10);
    expect(skillValue({definition:missile,skill:{id:missile.id,points:2}},'DAMAGE')).toBe(180);
  });
  it('executes every available catalog program at basic, Super and Gaben thresholds without invalid state',()=>{
    const definitions=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
    expect(definitions.length).toBe(230);
    expect(new Set(getMechanicCoverage(definitions).map(row=>row.id)).size).toBe(230);
    for(const d of definitions)for(const points of [3,6,9]){
      const battle=createBattle(player(0,[{id:d.id,points}]),player(1,[],'tank'),134,definitions);
      stepBattle(battle,4,definitions);
      for(const u of battle.units){
        for(const value of [u.x,u.y,u.hp,u.maxHp,u.mana,u.damage,u.taken,u.healing])expect(Number.isFinite(value),`${d.id}@${points}: invalid unit value`).toBe(true);
        expect(u.hp).toBeGreaterThanOrEqual(0);expect(u.hp).toBeLessThanOrEqual(u.maxHp+.001);
        expect(Math.abs(u.x)).toBeLessThanOrEqual(14.57);expect(Math.abs(u.y)).toBeLessThanOrEqual(12.916);
      }
    }
  },15000);
});
