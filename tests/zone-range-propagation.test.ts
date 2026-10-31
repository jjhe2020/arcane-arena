import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {createBattle,stepBattle} from '../src/combat';
import {SKILL_IMPLEMENTATIONS,type SkillProgram} from '../src/skill-effects';
import {zoneVisuals} from '../src/visual-bindings';
import calibration from '../src/zone-art-calibration.json';
import type {AssetManifest,BattleState,Player,SkillDefinition} from '../src/model';

const definitions=JSON.parse(readFileSync('public/data/skills.json','utf8')) as SkillDefinition[];
const assets=JSON.parse(readFileSync('public/data/assets.json','utf8')) as AssetManifest;
const audit=JSON.parse(readFileSync('artifacts/r13-range-audit.json','utf8')) as {skills:{id:string;ranks:{probe:{zones:{radiusWorld:number;layer:string|null}[]} |null}[]}[]};
const player=(id:number,withSkill=false):Player=>({id,name:'zone',hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:Array.from({length:id?2:1},(_,i)=>({id:`h${i}`,name:'zone',role:'mage',skin:'female',x:i*4,y:-2,persistentStrengthBonus:1000,skills:withSkill?[{id:'custom_alchemist_acid_spray',points:1}]:[]}))});

describe('published zone radius is the shared renderer and solver input',()=>{
 it('every actual observed zone propagates a radius edit to all selected visual layers',()=>{
  let visible=0;
  for(const record of audit.skills)for(const rank of record.ranks)for(const zone of rank.probe?.zones??[]){
   if(zone.radiusWorld<=.1)continue;
   const battle={time:1,finished:false,winner:null,rng:1,events:[],units:[{id:'caster',skills:[{id:record.id,points:3}]}],zones:[{id:'observed',createdAt:0,source:'caster',skill:record.id,layer:zone.layer??undefined,points:3,x:0,y:0,radius:zone.radiusWorld,until:2}]} as unknown as BattleState;
   const before=zoneVisuals(assets,battle,1);
   (battle.zones as {radius:number}[])[0].radius*=1.5;
   const after=zoneVisuals(assets,battle,1);
   expect(after).toHaveLength(before.length);
   for(let i=0;i<before.length;i++){
    visible++;expect(after[i].size,`${record.id}/${zone.radiusWorld}`).toBeCloseTo(before[i].size*1.5);
    const measured=(calibration as Record<string,{outerRadius95:number}>)[after[i].clip.image];
    expect(after[i].size*(measured?.outerRadius95??.5)).toBeCloseTo(zone.radiusWorld*1.5);
   }
  }
  expect(visible).toBeGreaterThan(50);
 });
 it('all calibrated persistent area layers retain the imported atlas and finite visible boundary measurements',()=>{
  expect(Object.keys(calibration).length).toBeGreaterThan(30);
  for(const [image,entry]of Object.entries(calibration)){
   expect(entry.outerRadius95, image).toBeGreaterThan(0);expect(entry.outerRadius95,image).toBeLessThan(1);
   expect(entry.atlasSha256).toMatch(/^[a-f0-9]{64}$/);
  }
 });
 it('the actual circular zone solver includes inside targets and excludes outside targets at every observed on-board radius',()=>{
  const registry=SKILL_IMPLEMENTATIONS as Record<string,SkillProgram>,id='custom_alchemist_acid_spray',original=registry[id];
  const radii=[...new Set(audit.skills.flatMap(s=>s.ranks.flatMap(r=>(r.probe?.zones??[]).map(z=>z.radiusWorld))))].filter(r=>r>=.9&&r<=9);
  expect(radii.length).toBeGreaterThan(15);
  try{for(const radius of radii){
   const touched:string[]=[];
   // This controlled fixture tests the shared zone primitive, not the
   // original ability's conditional effect or its source-version fidelity.
   registry[id]={passive:true,target:'self',implemented:[],remaining:[],init:c=>c.zone({x:0,y:0,radius,duration:1,interval:1/30,immediate:true,effect:t=>{touched.push(t.id);}})};
   const battle=createBattle(player(0,true),player(1),2951,definitions),caster=battle.units[0],foes=battle.units.filter(u=>u.side===1);
   for(const u of battle.units){u.moveSpeed=0;u.nextAttack=1000;}caster.x=caster.y=0;
   foes[0].x=radius-.001;foes[0].y=0;foes[1].x=0;foes[1].y=radius+.001;
   touched.length=0;
   stepBattle(battle,1/30,definitions);
   expect(touched,`radius${radius}`).toContain(foes[0].id);expect(touched,`radius${radius}`).not.toContain(foes[1].id);
   expect((battle.zones as {radius:number}[])[0].radius).toBe(radius);
  }}finally{registry[id]=original;}
 });
});
