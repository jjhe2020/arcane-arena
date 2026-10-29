import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {worldVisuals} from '../src/visual-bindings';
import {addVisualWorldEffect} from '../src/combat/visual-state';
import {atlasFrame} from '../src/animation';
import calibration from '../src/radial-art-calibration.json';
import type {AssetManifest,BattleState} from '../src/model';
const assets=JSON.parse(readFileSync('public/data/assets.json','utf8')) as AssetManifest;
const battle=()=>({time:3,events:[],units:[],finished:false,winner:null,rng:1}) as BattleState;
describe('actual world geometry fitted to approved art',()=>{
 it('keeps calibration tied to the delivered pixels',()=>{
  for(const[key,measurement]of Object.entries(calibration)){const slash=key.indexOf('/'),skill=key.slice(0,slash),layer=key.slice(slash+1),clip=(assets.skills[skill] as {layers:Record<string,{image:string;frames:number}>}).layers[layer];
   expect(createHash('sha256').update(readFileSync(`public${clip.image}`)).digest('hex')).toBe(measurement.atlasSha256);
   expect(measurement.meanRadius).toHaveLength(clip.frames);expect(Math.max(...measurement.meanRadius)).toBeGreaterThan(0);
  }
 });
 it.each(['outward','inward'] as const)('fits the %s Plasma annulus to actual radius, independent of render lease',phase=>{
  const b=battle(),e=addVisualWorldEffect(b,{source:'s',skill:'razor_plasma_field',points:9,layer:'wave',kind:'ring',x:2,y:4,radius:5,progress:.4,phase,until:3.1});
  const a=worldVisuals(assets,b,3.01);expect(a).toHaveLength(1);e.until=99;const extended=worldVisuals(assets,b,3.01);expect(extended).toEqual(a);
  const v=a[0],frame=atlasFrame(v.clip,v.age,false).index,measured=calibration['razor_plasma_field/wave'].meanRadius[frame];
  expect(v.size*measured).toBeCloseTo(5);expect({x:v.x,y:v.y}).toEqual({x:2,y:4});expect(v.loop).toBe(false);
  expect(frame).toBe(phase==='outward'?8:28);
 });
 it('uses only allowed real world layers; outward Ravage has the matching crest, return does not invent one',()=>{
  const b=battle();addVisualWorldEffect(b,{source:'s',skill:'custom_tidehunter_ravage',points:9,layer:'eruption',kind:'ring',x:0,y:0,radius:4,progress:.5,phase:'outward',until:4});
  expect(worldVisuals(assets,b,3).map(v=>v.key.split(':').at(-1))).toEqual(['eruption','crest']);
  b.visualWorldEffects=[];addVisualWorldEffect(b,{source:'s',skill:'custom_tidehunter_ravage',points:3,layer:'return',kind:'ring',x:0,y:0,radius:4,progress:.5,phase:'inward',until:4});
  expect(worldVisuals(assets,b,3)).toEqual([]);
 });
 it('keeps a real random blast centered on its metadata and removes it exactly on expiry',()=>{
  const b=battle();addVisualWorldEffect(b,{source:'dead-source',skill:'custom_crystal_maiden_freezing_field',points:3,layer:'ice_burst',kind:'burst',x:-2.35,y:7.1,radius:3,until:3.6});
  const v=worldVisuals(assets,b,3.1);expect(v).toHaveLength(1);expect({x:v[0].x,y:v[0].y}).toEqual({x:-2.35,y:7.1});expect(v[0].age).toBeCloseTo(.1);
  expect(worldVisuals(assets,b,3.6)).toEqual([]);b.finished=true;expect(worldVisuals(assets,b,3.1)).toEqual([]);
 });
 it('lets a real earned Duel victory finish after the last kill while suppressing ordinary finished battle effects',()=>{
  const b=battle();addVisualWorldEffect(b,{source:'winner',skill:'custom_legion_commander_duel',points:9,layer:'victory',kind:'proc',x:0,y:0,until:4});
  addVisualWorldEffect(b,{source:'winner',skill:'custom_axe_counter_helix',points:9,layer:'helix',kind:'proc',x:0,y:0,until:4});b.finished=true;
  const visual=worldVisuals(assets,b,3.2);expect(visual).toHaveLength(1);expect(visual[0].clip.image).toContain('/victory.webp');
  expect(worldVisuals(assets,b,4)).toEqual([]);
 });
});
