import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {applyDamage,createBattle,effectiveStatusEffects,statusValue,stepBattle} from '../src/combat';
import type {Player,SkillDefinition} from '../src/model';
import type {EffectStatus} from '../src/skill-effects';

const defs=JSON.parse(readFileSync(new URL('../public/data/skills.json',import.meta.url),'utf8')) as SkillDefinition[];
const ids={aura:'crystal_maiden_brilliance_aura',atrophy:'custom_abyssal_underlord_atrophy_aura',blood:'custom_dragon_knight_dragon_blood',feral:'custom_lycan_feral_impulse',fervor:'troll_warlord_fervor'};
function player(side:number,skills:{id:string;points:number}[]=[],count=1):Player{return{id:side,name:`P${side}`,hp:100,gold:0,shopLevel:3,locked:false,reserve:[],shop:[],heroes:Array.from({length:count},(_,i)=>({id:`h${i}`,name:`h${i}`,role:'mage',skin:'male',x:i*2,y:-2,skills:i?[]:skills}))};}
function setup(id:string,points=3,allies=1,enemies=3,extras:{id:string;points:number}[]=[]){
  const b=createBattle(player(0,[{id,points},...extras],allies),player(1,[],enemies),137,defs),c=b.units[0],a=b.units[1],targets=b.units.filter(u=>u.side===1);
  for(const u of b.units){u.hp=u.maxHp=100000;u.mana=u.maxMana=10000;u.armor=0;u.magicResist=0;u.moveSpeed=0;u.nextAttack=99999;u.statuses.push({kind:'disarm',until:200});}
  c.x=0;c.y=0;c.facing=Math.PI/2;c.attack=100;c.attackMin=c.attackMax=100;
  targets.forEach((t,i)=>{t.x=0;t.y=2+i*2;});
  return{b,c,a,targets,t:targets[0],advance:(s:number)=>stepBattle(b,s,defs)};
}
function enableAttacks(u:ReturnType<typeof setup>['c'],interval=2){u.statuses=u.statuses.filter(s=>s.kind!=='disarm');u.range=2;u.attackInterval=interval;u.attackPoint=0;u.attackBackswing=0;u.nextAttack=0;}
const own=(u:ReturnType<typeof setup>['c'],kind:string,id:string)=>u.statuses.filter(s=>s.kind===kind&&s.skill===id) as EffectStatus[];
const sum=(u:ReturnType<typeof setup>['c'],kind:string,id:string)=>own(u,kind,id).reduce((n,s)=>n+(s.value??0),0);

describe('Wiki acceptance: selected auras and passive growth',()=>{
  it('Arcane Aura regenerates mana continuously before the first whole second and does not stack duplicate owners',()=>{
    const h=setup(ids.aura,3,2);h.c.mana=h.a.mana=1000;h.advance(.5);expect(h.c.mana).toBeCloseTo(1004.5);expect(h.a.mana).toBeCloseTo(1004.5);
    h.a.skills=[{id:ids.aura,points:3}]; // Midbattle skill initialization is part of the engine.
    h.advance(.5);expect(h.c.mana).toBeCloseTo(1009);expect(h.a.mana).toBeCloseTo(1009);
  });
  it('Arcane Aura Super emits the final 160 mana and 40 health burst to allies on a completed cast',()=>{
    const h=setup(ids.aura,6,2,3,[{id:'custom_vengefulspirit_magic_missile',points:1}]);h.a.mana=1000;h.c.hp=h.a.hp=5000;h.advance(.5);
    expect(h.b.events.some(e=>e.type==='cast'&&e.skill==='custom_vengefulspirit_magic_missile')).toBe(true);expect(h.a.mana).toBeCloseTo(1164.5);expect(h.a.hp).toBe(5040);expect(h.c.hp).toBe(5040);
  });
  it('Arcane Aura Gaben supplies its cooldown aura immediately and reduces an ally cast cooldown by one quarter',()=>{
    const h=setup(ids.aura,9,2);h.a.skills=[{id:'custom_vengefulspirit_magic_missile',points:1}];h.a.cooldowns=[0];h.advance(.5);const cast=h.b.events.find(e=>e.type==='cast'&&e.source===h.a.id)!;expect(statusValue(h.a,'cooldownReduction')).toBe(.25);expect(h.a.cooldowns[0]-cast.time).toBeCloseTo(12*.75);
  });
  it('Arcane Aura Break suppresses foreign mana regeneration and cooldown reduction immediately',()=>{
    const h=setup(ids.aura,9,2);h.a.mana=1000;h.c.statuses.push({kind:'break',until:2});expect(statusValue(h.a,'manaRegen')).toBe(0);expect(statusValue(h.a,'cooldownReduction')).toBe(0);h.advance(.5);expect(h.a.mana).toBeCloseTo(1001.5);
  });
  it('Atrophy reduces only main attack damage, not the flat attack bonus, and Super extends across the arena',()=>{
    const h=setup(ids.atrophy,6);h.t.attack=100;h.t.attackMin=h.t.attackMax=100;h.t.statuses.push({kind:'attackBonus',until:100,value:50});enableAttacks(h.t);const hp=h.c.hp;h.advance(.2);expect(hp-h.c.hp).toBeCloseTo(100);h.t.y=20;h.advance(.2);expect(statusValue(h.t,'baseAttackDamageReduction')).toBe(.5);
  });
  it('Atrophy gains separate temporary death stacks with independent historical expiry',()=>{
    const h=setup(ids.atrophy,1);applyDamage(h.b,h.c,h.targets[0],1e9,'pure');expect(sum(h.c,'attackBonus',ids.atrophy)).toBe(30);h.advance(10);applyDamage(h.b,h.c,h.targets[1],1e9,'pure');expect(sum(h.c,'attackBonus',ids.atrophy)).toBe(60);h.advance(20.1);expect(sum(h.c,'attackBonus',ids.atrophy)).toBe(30);h.advance(10);expect(sum(h.c,'attackBonus',ids.atrophy)).toBe(0);
  });
  it('Atrophy death eligibility follows lingering aura membership and excludes illusion and ward deaths',()=>{
    const h=setup(ids.atrophy,3,1,4);h.advance(.1);h.t.y=20;applyDamage(h.b,h.c,h.t,1e9,'pure');expect(sum(h.c,'attackBonus',ids.atrophy)).toBe(45);h.targets[1].illusion=true;applyDamage(h.b,h.c,h.targets[1],1e9,'pure');h.targets[2].ward=true;applyDamage(h.b,h.c,h.targets[2],1e9,'pure');expect(sum(h.c,'attackBonus',ids.atrophy)).toBe(45);
  });
  it('Atrophy creep death grants the creep amount and Gaben shares only currently unexpired bonus',()=>{
    const h=setup(ids.atrophy,9,2);h.t.summoned=true;h.t.owner=h.targets[1].id;applyDamage(h.b,h.c,h.t,1e9,'pure');expect(sum(h.c,'attackBonus',ids.atrophy)).toBe(8);expect(statusValue(h.a,'attackBonus')).toBe(8);h.advance(75.6);expect(sum(h.c,'attackBonus',ids.atrophy)).toBe(0);expect(statusValue(h.a,'attackBonus')).toBe(0);
  });
  it('Atrophy Break disables the enemy aura and new gains while preserving existing temporary bonus',()=>{
    const h=setup(ids.atrophy,3);applyDamage(h.b,h.c,h.t,1e9,'pure');h.c.statuses.push({kind:'break',until:100});expect(statusValue(h.c,'attackBonus')).toBe(45);expect(statusValue(h.targets[1],'baseAttackDamageReduction')).toBe(0);applyDamage(h.b,h.c,h.targets[1],1e9,'pure');expect(sum(h.c,'attackBonus',ids.atrophy)).toBe(45);
  });
  it('Dragon Blood Super grants its final 24 armor and regeneration without repeated upgrades',()=>{
    const h=setup(ids.blood,6);h.c.hp=1000;expect(statusValue(h.c,'armor')).toBe(24);h.advance(.5);expect(h.c.hp).toBeCloseTo(1012);
  });
  it('Dragon Blood Break removes both effective armor and healing while its passive buffs survive ordinary dispels',()=>{
    const h=setup(ids.blood,3);h.c.hp=1000;h.c.statuses.push({kind:'break',until:1});expect(statusValue(h.c,'armor')).toBe(0);h.advance(.5);expect(h.c.hp).toBe(1000);h.advance(1);expect(h.c.hp).toBeGreaterThan(1000);expect(own(h.c,'armor',ids.blood)[0].dispel).toBe('none');expect(own(h.c,'regen',ids.blood)[0].dispel).toBe('none');
  });
  it('Dragon Blood inherited by real Phantasm illusions grants regeneration without passive bonus armor',()=>{
    const h=setup(ids.blood,3,1,3,[{id:'custom_chaos_knight_phantasm',points:1}]);h.advance(1.2);const clone=h.b.units.find(u=>u.illusion)!;expect(clone).toBeDefined();expect(own(clone,'armor',ids.blood)).toHaveLength(0);expect(statusValue(clone,'regen')).toBe(12);clone.hp=1000;h.advance(.2);expect(clone.hp).toBeCloseTo(1002.4);
  });
  it('Dragon Blood Gaben reacts with max-level traveling Breathe Fire and separate pre-conditional damage reduction',()=>{
    const h=setup(ids.blood,9);enableAttacks(h.t,.12);h.t.attack=1;h.t.attackMin=h.t.attackMax=1;h.t.statuses.push({kind:'attackBonus',until:100,value:50});h.advance(8);const flames=h.b.events.filter(e=>e.type==='cast'&&e.skill==='dragon_knight_breathe_fire');expect(flames.length).toBeGreaterThan(0);expect(flames.every(e=>e.points===4)).toBe(true);expect(h.b.events.some(e=>e.type==='hit'&&e.skill==='dragon_knight_breathe_fire'&&e.amount===320)).toBe(true);expect(statusValue(h.t,'attackDamagePct')).toBe(-.3);
  });
  it('Feral Impulse affects the owner and controlled bodies, and grants only regeneration to controlled illusions',()=>{
    const h=setup(ids.feral,3,3);h.a.owner=h.c.id;h.a.summoned=true;const illusion=h.b.units[2];illusion.owner=h.c.id;illusion.summoned=true;illusion.illusion=true;h.a.hp=illusion.hp=1000;h.advance(.2);expect(statusValue(h.a,'attackPct')).toBe(.4);expect(statusValue(illusion,'attackPct')).toBe(0);expect(h.a.hp).toBeGreaterThan(1000);expect(illusion.hp).toBeGreaterThan(1000);
  });
  it('Feral Impulse Super reads final 65 percent main damage and 17 regeneration, excluding flat attack bonuses',()=>{
    const h=setup(ids.feral,6);h.c.hp=1000;h.c.statuses.push({kind:'attackBonus',until:100,value:50});enableAttacks(h.c);h.advance(.2);expect(100000-h.t.hp).toBeCloseTo(215);expect(h.c.hp).toBeCloseTo(1003.4);
  });
  it('Feral source Break suppresses controlled-unit bonuses immediately and source death leaves only the aura linger',()=>{
    const h=setup(ids.feral,3,3);h.a.owner=h.c.id;h.a.summoned=true;h.advance(.2);expect(statusValue(h.a,'attackPct')).toBe(.4);h.c.statuses.push({kind:'break',until:.4});expect(statusValue(h.a,'attackPct')).toBe(0);h.advance(.3);expect(statusValue(h.a,'attackPct')).toBe(.4);applyDamage(h.b,h.t,h.c,1e9,'pure');h.advance(.6);expect(statusValue(h.a,'attackPct')).toBe(0);expect(statusValue(h.a,'regen')).toBe(0);
  });
  it('Feral Gaben stacks armor reduction from successful owner and aura-affected controlled-unit attacks',()=>{
    const h=setup(ids.feral,9,2);h.a.owner=h.c.id;h.a.summoned=true;h.a.x=0;h.a.y=0;h.advance(.2);enableAttacks(h.c);enableAttacks(h.a);h.advance(.2);expect(sum(h.t,'armor',ids.feral)).toBe(-2);h.t.statuses.push({kind:'evasion',until:100,value:1});h.c.nextAttack=h.a.nextAttack=0;h.advance(.2);expect(sum(h.t,'armor',ids.feral)).toBe(-2);
  });
  it('Fervor gains capped stacks on successful repeated hits and its Super speed per stack is final',()=>{
    const h=setup(ids.fervor,6);enableAttacks(h.c,.12);h.advance(4);expect(h.c.fervorStacks).toBe(12);expect(statusValue(h.c,'attackSpeed')).toBe(552);
  });
  it('Fervor keeps the current landed-hit rule for blind and projectile timing without inventing historical equivalence',()=>{
    const h=setup(ids.fervor,3);enableAttacks(h.c);h.c.range=7;h.c.projectileSpeed=2;h.c.statuses.push({kind:'blind',until:.5,value:1});h.advance(.3);expect(h.c.fervorStacks??0).toBe(0);h.advance(1);expect(h.c.fervorStacks).toBe(1);h.c.nextAttack=0;h.t.statuses.push({kind:'evasion',until:100,value:1});h.advance(1.2);expect(h.c.fervorStacks).toBe(1);
  });
  it('Fervor target switches reset ordinary stacks while Gaben retains them',()=>{
    for(const points of [3,9]){const h=setup(ids.fervor,points);enableAttacks(h.c,.12);h.advance(.6);const previous=Number(h.c.fervorStacks);h.t.y=20;h.targets[1].y=2;h.c.nextAttack=0;h.advance(.1);expect(Number(h.c.fervorStacks)).toBe(points===9?previous+1:1);}
  });
  it('Fervor Break suppresses existing speed and new stack gain; the AA strong-dispel counter can reset cleanly',()=>{
    const h=setup(ids.fervor,3);enableAttacks(h.c,.12);h.advance(.4);const stacks=h.c.fervorStacks;h.c.statuses.push({kind:'break',until:1});expect(statusValue(h.c,'attackSpeed')).toBe(0);h.advance(.3);expect(h.c.fervorStacks).toBe(stacks);expect(own(h.c,'fervorCounter',ids.fervor)[0].dispel).toBe('strong');h.c.statuses=h.c.statuses.filter(s=>s.skill!==ids.fervor);h.advance(.7);expect(Number(h.c.fervorStacks)).toBeGreaterThan(0);expect(effectiveStatusEffects(h.c,'attackSpeed').length).toBeGreaterThan(0);
  });
});
