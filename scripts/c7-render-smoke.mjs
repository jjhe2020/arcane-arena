import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.ARENA_TEST_URL??'http://localhost:5173',output='artifacts/r6-c7-render';
const configurationHash=JSON.parse(await fs.readFile('public/data/config-report.json','utf8')).hash;
const fixtureNote='Actual development-module createBattle/stepBattle with the compiled catalog. Stationary observation units have 100000HP/4000mana. Ordinary attacks are delayed except one real Frost Arrows attack. Snapshots freeze after genuine casts or projectile launches. No invented statuses, hits, summons, forms or moving visuals. This render-only check is separate from native acceptance, production smoke and physical-device performance.';
const browser=await chromium.launch({headless:true}),reports=[];
await fs.mkdir(output,{recursive:true});
try{
 for(const mobile of [false,true])for(const scenario of ['golem','ship','wave','splinter']){
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1600,height:900},isMobile:mobile,hasTouch:mobile}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.waitForFunction(()=>window.arena?.renderer);
  await page.locator('[data-action=close]').last().click();
  if(mobile)await page.locator('.mobile-nav [data-action=cinema]').tap();
  const fixture=await page.evaluate(async scenario=>{
   const {createBattle,stepBattle,FIXED_STEP}=await import('/src/combat.ts');
   const arena=window.arena,id={golem:'undying_flesh_golem',ship:'kunkka_ghostship',wave:'kunkka_ghostship',splinter:'custom_drow_ranger_frost_arrows'}[scenario];
   const player=side=>({id:side,name:`QA${side}`,hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:[0,1,2].map(i=>({id:`h${side}-${i}`,name:`QA${side}-${i}`,role:'mage',skin:i?'male':'female',x:i?10:0,y:i?-10:-2,skills:side===0&&i===0?[{id,points:9}]:[]}))});
   const battle=createBattle(player(0),player(1),944,arena.definitions),caster=battle.units[0],enemies=battle.units.filter(u=>u.side===1),target=enemies[0];
   for(const unit of battle.units){unit.hp=unit.maxHp=100000;unit.mana=unit.maxMana=4000;unit.moveSpeed=0;unit.nextAttack=100;}
   caster.x=caster.y=0;caster.facing=0;target.x=6;target.y=0;
   enemies.slice(1).forEach((unit,i)=>{unit.x=7;unit.y=i?2:-2;});
   for(let slot=1;slot<caster.cooldowns.length;slot++)caster.cooldowns[slot]=99999;
   if(scenario==='splinter'){
    caster.range=8;caster.projectileSpeed=2;caster.attackPoint=0;caster.attackInterval=100;caster.nextAttack=0;
    for(let tick=0;tick<150;tick++){stepBattle(battle,FIXED_STEP,arena.definitions);if(battle.events.some(e=>e.type==='hit'&&e.target===target.id&&Number(e.amount)>0)&&(battle.projectiles??[]).filter(p=>p.skill===id).length>=2)break;}
   }else stepBattle(battle,scenario==='wave'?3.8:scenario==='ship'?1.5:.5,arena.definitions);
   const moving=(battle.visualProjectiles??[]).filter(p=>p.until>battle.time);
   const tracking=(battle.projectiles??[]).filter(p=>p.skill===id);
   if(!battle.events.some(e=>scenario==='splinter'?e.type==='hit'&&Number(e.amount)>0:e.type==='cast'&&e.skill===id))throw Error('No real release or hit');
   if(scenario==='golem'&&!caster.statuses.some(s=>s.kind==='fleshGolem'))throw Error('No real golem form');
   if(scenario==='ship'&&!moving.some(p=>p.layer==='ghostship_sail'))throw Error('No real sailing ship');
   if(scenario==='wave'&&!moving.some(p=>p.layer==='tidal_wave'))throw Error('No real Tidal Wave');
   if(scenario==='splinter'&&tracking.length<2)throw Error('No real split attack projectiles');
   const effects=scenario==='golem'?[]:scenario==='splinter'?tracking.map(p=>({id:p.id,prefix:'p:',x:p.x,y:p.y})):moving.map(p=>({id:p.id,prefix:'motion:',x:p.x,y:p.y}));
   const originalDraw=arena.renderer.draw.bind(arena.renderer);window.qaC7Battle=battle;
   arena.renderer.mode='spectate';arena.renderer.layout();arena.renderer.draw=(_a,_b,_c,_d,dt)=>originalDraw([],[],window.qaC7Battle,0,dt);
   return{id,configurationHash:arena.definitions.find(definition=>definition.id===id)?.configHash,time:battle.time,caster:caster.id,effects,snapshot:JSON.stringify(battle)};
  },scenario);
  await page.waitForFunction(fixture=>{
   const renderer=window.arena.renderer,body=renderer.visuals.get(fixture.caster);
   return body?.mesh.visible&&body.mesh.material.map?.image&&fixture.effects.every(effect=>[...renderer.persistentFx].some(([key,visual])=>key.startsWith(`${effect.prefix}${effect.id}:`)&&visual.mesh.material.map?.image));
  },fixture);
  const actual=await page.evaluate(fixture=>{
   const renderer=window.arena.renderer;
   return{diagnostics:renderer.diagnostics(),snapshot:JSON.stringify(window.qaC7Battle),effects:fixture.effects.map(effect=>{const [key,visual]=[...renderer.persistentFx].find(([key])=>key.startsWith(`${effect.prefix}${effect.id}:`));return{id:effect.id,key,x:visual.group.position.x,y:visual.group.position.y,image:visual.clip?.image,opacity:visual.mesh.material.opacity};})};
  },fixture);
  assert.equal(actual.snapshot,fixture.snapshot,'Rendering changed the frozen simulation');assert.deepEqual(errors,[]);assert.deepEqual(actual.diagnostics.loadErrors,[]);
  assert.equal(fixture.configurationHash,configurationHash,'Render fixture loaded stale compiled data');
  if(scenario==='golem')assert(actual.diagnostics.unitBodies.find(body=>body.id===fixture.caster)?.image?.includes('/undying_flesh_golem/flesh_golem_'),'The released form did not select its real body atlas');
  for(const expected of fixture.effects){const rendered=actual.effects.find(effect=>effect.id===expected.id);assert(rendered?.image&&rendered.opacity>0);assert(Math.abs(rendered.x-expected.x)<1e-6&&Math.abs(rendered.y-expected.y)<1e-6);}
  await page.screenshot({path:`${output}/${scenario}${mobile?'-mobile':''}.png`});
  const{snapshot:_,...evidence}=fixture;delete actual.snapshot;reports.push({scenario,mobile,fixture:evidence,...actual,errors});await page.close();
 }
 await fs.writeFile(`${output}/report.json`,JSON.stringify({status:'passed',url,configurationHash,fixtureNote,reports},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',scenarios:reports.map(r=>({scenario:r.scenario,mobile:r.mobile,effects:r.effects.length}))}));
}finally{await browser.close();}
