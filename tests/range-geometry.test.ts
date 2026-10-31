import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {createBattle,stepBattle} from '../src/combat';
import {BATTLE_CONFIG} from '../src/config';
import {plasmaAnnulus,sweptAnnulusIntersects,radialSourceRadius,zoneVisualSize} from '../src/range-geometry';
import {activeVisualWorldEffects,type VisualWorldEffect} from '../src/combat/visual-state';
import {worldVisuals} from '../src/visual-bindings';
import type {Player,SkillDefinition} from '../src/model';

const definitions=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
const assets=JSON.parse(readFileSync('public/data/assets.json','utf8'));
const PF='razor_plasma_field';
const player=(id:number,points:number):Player=>({id,name:'range',hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:[0,1,2].map(i=>({id:`h${id}-${i}`,name:'range',role:'mage',skin:'female',x:i*4,y:-2,persistentStrengthBonus:1000,skills:id===0&&i===0?[{id:PF,points}]:[]}))});
function fixture(points:number,defs=definitions){const battle=createBattle(player(0,points),player(1,points),191,defs),caster=battle.units[0],foes=battle.units.filter(u=>u.side===1);for(const u of battle.units){u.moveSpeed=0;u.nextAttack=1000;u.mana=u.maxMana;}caster.x=caster.y=0;for(const [i,u]of battle.units.filter(u=>u.side===0&&u!==caster).entries()){u.x=-8;u.y=-8+i*3;}foes.forEach((u,i)=>{u.x=2+i*3;u.y=0;});return{battle,caster,foes,step:(seconds:number)=>stepBattle(battle,seconds,defs)};}

describe('actual annulus boundaries and calibrated presentation',()=>{
 it('the initial offset annulus is visible on the same release tick that can already deal damage',()=>{
  const w=fixture(3);w.step(1/30);const effect=activeVisualWorldEffects(w.battle).find(e=>e.skill===PF)!;
  expect(effect.radius).toBe(0);expect(effect.innerRadius).toBeCloseTo(1.05);
  expect(worldVisuals(assets,w.battle,w.battle.time).find(v=>v.key.includes(effect.id))?.radialMapping?.outerRadius).toBeCloseTo(2.05);
 });
 it('the outward and inward sweep includes bodies touching either edge, excludes separated bodies, and has no false center disk',()=>{
  expect(plasmaAnnulus(4,1.05,1)).toEqual({innerRadius:5.05,outerRadius:6.05});
  for(const [previous,current]of [[3.8,4],[4,3.8]]){
   expect(sweptAnnulusIntersects(4.45,previous,current,1.05,1,.4)).toBe(true);
   expect(sweptAnnulusIntersects(4.449,previous,current,1.05,1,.4)).toBe(false);
   expect(sweptAnnulusIntersects(6.45,previous,current,1.05,1,.4)).toBe(true);
   expect(sweptAnnulusIntersects(6.451,previous,current,1.05,1,.4)).toBe(false);
   expect(sweptAnnulusIntersects(0,previous,current,1.05,1,.4)).toBe(false);
  }
 });
 it.each([1,2,3,6,9])('rank%s exposes the actual offset and width and maps both source texture boundaries to them',points=>{
  const w=fixture(points);w.step(.5);
  const effect=activeVisualWorldEffects(w.battle).find(e=>e.skill===PF)!;
  expect(effect).toBeDefined();expect(effect.maxRadius).toBe(points>=6?11:7);
  expect(effect.halfWidth).toBe(.5);
  expect(effect.innerRadius).toBeCloseTo(effect.radius!+1.05);
  expect(effect.outerRadius!-effect.innerRadius!).toBeCloseTo(1);
  const placed=worldVisuals(assets,w.battle,w.battle.time).find(v=>v.key.includes(effect.id))!;
  expect(placed.radialMapping).toBeDefined();const mapping=placed.radialMapping!;
  expect(mapping.innerRadius).toBe(effect.innerRadius);expect(mapping.outerRadius).toBe(effect.outerRadius);
  expect(radialSourceRadius(effect.innerRadius!,mapping)).toBeCloseTo(mapping.sourceInner);
  expect(radialSourceRadius(effect.outerRadius!,mapping)).toBeCloseTo(mapping.sourceOuter);
 });
 it('an edited radius, offset and width changes the real field and its visible band together',()=>{
  const defs=structuredClone(definitions),definition=defs.find(d=>d.id===PF)!;
  for(const row of Object.values(definition.balanceLevels as Record<string,{params:Record<string,number>}>)){row.params['RADIUS']=500;row.params['START OFFSET']=160;row.params['DAMAGE WIDTH']=60;}
  const w=fixture(3,defs);w.step(.5);const effect=activeVisualWorldEffects(w.battle).find(e=>e.skill===PF)!;
  expect(effect.maxRadius).toBe(5);expect(effect.innerRadius).toBeCloseTo(effect.radius!+1.6);expect(effect.outerRadius!-effect.innerRadius!).toBeCloseTo(.6);
  const placed=worldVisuals(assets,w.battle,w.battle.time).find(v=>v.key.includes(effect.id))!;expect(placed.radialMapping?.outerRadius).toBe(effect.outerRadius);
 });
 it('a target beyond the complete base-field outer edge plus its body radius is never hit',()=>{
  const w=fixture(3);w.foes[1].x=7+1.05+1+BATTLE_CONFIG.bodyRadius+.01;w.foes[2].x=6;w.foes[2].y=3;w.step(2.4);
  expect(w.battle.events.some(e=>e.type==='hit'&&e.skill===PF&&e.target===w.foes[1].id)).toBe(false);
  expect(w.battle.events.some(e=>e.type==='hit'&&e.skill===PF&&e.target===w.foes[0].id)).toBe(true);
 });
 it('both inward and outward visual phases preserve the same true width after caster movement',()=>{
  const w=fixture(6);w.step(.5);w.caster.x=1;w.step(1.5);
  const effect=activeVisualWorldEffects(w.battle).find(e=>e.skill===PF) as VisualWorldEffect;
  expect(effect.phase).toBe('inward');expect(effect.x).toBe(1);expect(effect.outerRadius!-effect.innerRadius!).toBeCloseTo(1);
 });
 it('zone visual size changes with the live radius rather than an unrelated atlas worldSize',()=>{expect(zoneVisualSize(3)).toBe(6);expect(zoneVisualSize(7)).toBe(14);});
});
