import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyDamage,createBattle,restoreBattle,serializeBattle,stepBattle } from '../src/combat';
import { GRANTED_SKILL_DEFINITIONS,referenceCastPoint } from '../src/skill-effects';
import type { Player,SkillDefinition,SkillStack } from '../src/model';
import {ROLE_CONFIG} from '../src/config';
const source=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
const definition=(id:string,overrides:Partial<SkillDefinition>={})=>({...source.find(d=>d.id===id)!,...overrides});
function player(id:number,skills:SkillStack[]=[],two=false):Player {return {id,name:`P${id}`,hp:100,gold:0,shopLevel:1,locked:false,shop:[],reserve:[],heroes:[{id:'h0',name:'Caster',role:'mage',skin:'female',x:0,y:-2,skills},...(two?[{id:'h1',name:'Ally',role:'tank' as const,skin:'male' as const,x:1,y:-2,skills:[]}]:[])]};}
function match(id:string,points:number,overrides:Partial<SkillDefinition>={},two=false){const def=definition(id,{mana:[0],cooldowns:[100],...overrides});const b=createBattle(player(0,[{id,points}],two),player(1),51,[def]);b.units.find(t=>t.side===1)!.statuses.push({kind:'stun',until:100});return {b,def,caster:b.units[0]};}
describe('English-catalog upgrade effects',()=>{
  it('Aphotic Shield Super shields both selected ally and caster and Gaben adds capacity',()=>{
    const {b,def,caster}=match('custom_abaddon_aphotic_shield',9,{},true),ally=b.units[1];ally.hp=100;
    stepBattle(b,.5,[def]);
    for(const t of [caster,ally])expect(t.statuses.find(s=>s.kind==='shield')?.value).toBe(550);
  });
  it('Repel adds source strength to the ally and caster without dispellable Gaben buffs',()=>{
    const {b,def,caster}=match('custom_omniknight_repel',9,{},true),ally=b.units[1];ally.hp=100;
    stepBattle(b,.5,[def]);expect(caster.strength).toBe(ROLE_CONFIG.mage.strength+82);expect(ally.strength).toBe(ROLE_CONFIG.tank.strength+82);
    expect(caster.maxHp).toBe(ROLE_CONFIG.mage.hp+82*22);expect(ally.maxHp).toBe(ROLE_CONFIG.tank.hp+82*22);
    expect((ally.statuses.find(s=>s.kind==='strength') as {dispel?:string}).dispel).toBe('none');
  });
  it('Purification repeats on the original ally three and six seconds later',()=>{
    const {b,def,caster}=match('omniknight_purification',9,{values:['HEAL/DAMAGE: 90','DAMAGE RADIUS: 300']});caster.maxHp=1000;caster.hp=100;
    stepBattle(b,.5,[def]);caster.statuses.push({kind:'stun',until:100});stepBattle(b,6,[def]);
    expect(b.events.filter(e=>e.type==='heal'&&e.skill===def.id).map(e=>e.amount)).toEqual([250,250,250]);
    expect(caster.hp).toBe(850);expect(caster.statuses.find(s=>s.kind==='damageReduction')?.value).toBe(.5);
  });
  it('Cold Embrace Super permits the protected hero to cast while rooted and disarmed',()=>{
    const cold=definition('custom_winter_wyvern_cold_embrace',{mana:[0],cooldowns:[100]}),missile=definition('custom_vengefulspirit_magic_missile',{mana:[0],cooldowns:[100]});
    const b=createBattle(player(0,[{id:cold.id,points:6},{id:missile.id,points:3}]),player(1),1,[cold,missile]);b.units[0].hp=200;b.units[1].statuses.push({kind:'stun',until:100});
    stepBattle(b,1,[cold,missile]);expect(b.units[0].statuses.some(s=>s.kind==='selfStun')).toBe(false);expect(b.units[0].statuses.some(s=>s.kind==='root')).toBe(true);
    expect(b.events.some(e=>e.type==='cast'&&e.skill===missile.id)).toBe(true);
  });
  it('Windrun Gaben spends two charges and waits for sequential recharge',()=>{
    const {b,def}=match('custom_windrunner_windrun',9,{cooldowns:[4]});
    // A complete compiled-rank fixture keeps the charge clock and public CD in one source.
    (def.balanceLevels as Record<string,{cooldown:number;mana:number}>)['9'].cooldown=4;(def.balanceLevels as Record<string,{cooldown:number;mana:number}>)['9'].mana=0;def.balanceInputSignature=JSON.stringify([def.values,def.cooldowns,def.mana]);stepBattle(b,2,[def]);
    expect(b.events.filter(e=>e.type==='cast'&&e.skill===def.id)).toHaveLength(2);
    stepBattle(b,3,[def]);expect(b.events.filter(e=>e.type==='cast'&&e.skill===def.id)).toHaveLength(3);
    stepBattle(b,3,[def]);expect(b.events.filter(e=>e.type==='cast'&&e.skill===def.id)).toHaveLength(3);
  });
  it('Static Link cannot resume after its tether was broken and transfers attack speed at Gaben',()=>{
    const {b,def,caster}=match('custom_razor_static_link',9),target=b.units[1];stepBattle(b,1,[def]);
    const gained=caster.statuses.find(s=>s.kind==='attackSpeed')?.value??0;expect(gained).toBeGreaterThan(0);
    target.x=13;stepBattle(b,.2,[def]);const frozen=caster.statuses.find(s=>s.kind==='attackSpeed')?.value;
    target.x=0;stepBattle(b,1,[def]);expect(caster.statuses.find(s=>s.kind==='attackSpeed')?.value).toBe(frozen);
  });
  it('Inner Fire upgraded zero-cast-point effect blocks healing and uses the fixed pre-mitigation hero heal',()=>{
    const {b,def,caster}=match('custom_huskar_inner_fire',9,{values:['DAMAGE: 100','RADIUS: 600','DURATION: 2']});caster.hp=500;
    stepBattle(b,1/30,[def]);expect(caster.hp).toBeCloseTo(550);expect(b.events.find(e=>e.type==='hit'&&e.skill===def.id)?.amount).toBe(75);
    expect(b.units[1].statuses.find(s=>s.kind==='healReduction')?.value).toBe(1);
    expect(b.units[1].statuses.find(s=>s.kind==='slow')?.value).toBe(.4);
  });
});

describe('historical candidate child abilities and replay revision',()=>{
  it('uses the fourth historical Whirling Death level while keeping child skills out of the shop list',()=>{
    const a=player(0,[{id:'shredder_whirling_death',points:4}]);a.heroes[0].y=-1;
    const enemy=player(1);enemy.heroes[0].role='tank';enemy.heroes[0].y=-1;
    const b=createBattle(a,enemy,1,[]);b.units[1].statuses.push({kind:'stun',until:100});stepBattle(b,1/30,[]);
    expect(source.some(s=>s.id==='shredder_whirling_death')).toBe(false);
    expect(GRANTED_SKILL_DEFINITIONS.some(s=>s.id==='shredder_whirling_death')).toBe(true);
    expect(b.events.find(e=>e.type==='hit'&&e.skill==='shredder_whirling_death')?.amount).toBe(200);
    expect(b.units[1].strength).toBeCloseTo(ROLE_CONFIG.tank.strength*.9);
    expect(b.units[0].mana).toBe(ROLE_CONFIG.mage.mana-80);
  });
  it('triggers Mystic Snake from actual shield mana spent and applies AA overrides instead of historical petrification values',()=>{
    const shield=definition('custom_medusa_mana_shield'),b=createBattle(player(0,[{id:shield.id,points:9}]),player(1),1,[shield]),[caster,enemy]=b.units;
    b.units.forEach(u=>{u.mana=u.maxMana=1000;u.statuses.push({kind:'stun',until:100});});
    // Fixed resource budget includes the shield's bonus independently of the role baseline.
    caster.mana=caster.maxMana=1200;
    applyDamage(b,enemy,caster,1429,'pure','test_damage',true);stepBattle(b,1.2,[shield]);
    expect(b.events.filter(e=>e.type==='cast'&&e.skill==='medusa_mystic_snake')).toHaveLength(1);
    expect(b.events.find(e=>e.type==='hit'&&e.skill==='medusa_mystic_snake')?.amount).toBe(150);
    expect(caster.mana).toBeCloseTo(783.45,1);expect(enemy.mana).toBe(1000);
    expect(enemy.statuses.find(s=>s.kind==='physicalVulnerability')?.value).toBe(.5);
    const petrify=b.events.find(e=>e.type==='status'&&e.skill==='medusa_mystic_snake'&&e.status==='stun');expect(petrify?.duration).toBeCloseTo(1);
  });
  it('lets Rot Gaben use nonchanneled Dismember but stops its ticks after a stun',()=>{
    const rot=definition('pudge_rot'),a=player(0,[{id:rot.id,points:9}]),enemy=player(1);a.heroes[0].y=-.6;enemy.heroes[0].y=-.6;enemy.heroes[0].role='tank';
    const b=createBattle(a,enemy,3,[rot]);b.units[1].statuses.push({kind:'stun',until:100});stepBattle(b,.8,[rot]);
    const hits=b.events.filter(e=>e.type==='hit'&&e.skill==='pudge_dismember');expect(hits.length).toBeGreaterThan(0);
    expect(b.units[0].action).not.toBe('channel');expect(b.events.some(e=>e.type==='attack'&&e.source===b.units[0].id)).toBe(true);
    b.units[0].statuses.push({kind:'stun',until:100});stepBattle(b,1,[rot]);
    expect(b.events.filter(e=>e.type==='hit'&&e.skill==='pudge_dismember')).toHaveLength(hits.length);
  });
  it('uses distinct historical cast points and rejects a replay recorded with a different simulation revision',()=>{
    expect(referenceCastPoint({skill:{id:'custom_alchemist_acid_spray',points:3}})).toBe(.2);
    expect(referenceCastPoint({skill:{id:'custom_skywrath_mage_ancient_seal',points:3}})).toBe(.1);
    const b=createBattle(player(0),player(1),2,[]),saved=JSON.parse(serializeBattle(b));saved.initial.simulationRevision='older';
    expect(()=>restoreBattle(saved,[])).toThrow(/simulation revision/i);
    expect(()=>stepBattle(saved,.1,[])).toThrow(/simulation revision/i);
  });
  it('keeps simultaneous same-caster zones distinct and restores their deterministic IDs and ages',()=>{
    const flare=definition('custom_skywrath_mage_mystic_flare',{mana:[0],cooldowns:[100]}),enemies=player(1,[],true);enemies.heroes[1].x=4;
    const b=createBattle(player(0,[{id:flare.id,points:6}]),enemies,3,[flare]);
    stepBattle(b,.5,[flare]);const zones=b.zones as {id:string;createdAt:number}[];
    expect(zones).toHaveLength(2);expect(new Set(zones.map(z=>z.id)).size).toBe(2);expect(zones.every(z=>z.createdAt>=0&&z.createdAt<=b.time)).toBe(true);
    expect(restoreBattle(serializeBattle(b),[flare]).zones).toEqual(zones);
  });
  it('steals two spells into free slots without replacing another granted ability',()=>{
    const steal=definition('custom_rubick_spell_steal',{mana:[0],cooldowns:[1]}),missile=definition('custom_vengefulspirit_magic_missile',{mana:[0],cooldowns:[100]}),sap=definition('custom_bane_brain_sap',{mana:[0],cooldowns:[100]});
    const a=player(0,[{id:steal.id,points:9}]);a.heroes[0].skills=[{id:steal.id,points:9},null,null,null,null,{id:'slark_depth_shroud',points:1}];
    const b=createBattle(a,player(1,[{id:missile.id,points:1},{id:sap.id,points:1}]),7,[steal,missile,sap]);b.units[0].cooldowns[5]=100;stepBattle(b,4,[steal,missile,sap]);
    expect(b.units[0].skills[5]?.id).toBe('slark_depth_shroud');
    expect((b.units[0].stolenAbilities as {id:string}[]).map(s=>s.id).sort()).toEqual([missile.id,sap.id].sort());
    const hit=b.events.find(e=>e.type==='hit'&&e.source===b.units[0].id&&e.skill===missile.id);expect(hit?.amount).toBeCloseTo(81);
    const stun=b.events.find(e=>e.type==='status'&&e.source===b.units[0].id&&e.skill===missile.id&&e.status==='stun');expect(stun?.duration).toBeCloseTo(1.82);
  });
  it('defers Rum damage and pays it back after expiration without a second resistance calculation',()=>{
    const b=createBattle(player(0),player(1),1,[]),[source,target]=b.units;b.units.forEach(u=>u.statuses.push({kind:'stun',until:100}));
    const initialHp=target.hp;target.statuses.push({kind:'ghostshipRum',until:1,value:.4,data:{paybackDuration:2}} as never);
    expect(applyDamage(b,source,target,400,'magical')).toBeCloseTo(180);stepBattle(b,.5,[]);expect(target.hp).toBeCloseTo(initialHp-180);
    stepBattle(b,2.5,[]);expect(target.hp).toBeCloseTo(initialHp-300);expect(source.damage).toBeCloseTo(300);expect(target.taken).toBeCloseTo(300);
  });
  it('Rum repayment is nonlethal even when little health remains',()=>{
    const b=createBattle(player(0),player(1),1,[]),[source,target]=b.units;b.units.forEach(u=>u.statuses.push({kind:'stun',until:100}));
    target.hp=100;target.statuses.push({kind:'ghostshipRum',until:1,value:.9,data:{paybackDuration:1}} as never);applyDamage(b,source,target,100,'pure');target.hp=20;
    stepBattle(b,3,[]);expect(target.hp).toBe(1);expect(target.dead).toBe(false);expect((target.rumPaybacks as unknown[]).length).toBe(0);
  });
});
