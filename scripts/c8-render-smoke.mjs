import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.ARENA_TEST_URL??'http://localhost:5173',output='artifacts/r6-c8-render';
const configurationHash=JSON.parse(await fs.readFile('public/data/config-report.json','utf8')).hash;
const fixtureNote='Actual development-module createBattle/stepBattle with the compiled catalog. Stationary observation heroes have 100000HP/4000mana and delayed ordinary attacks. Snapshots freeze after genuine Dive, Wraith Pact summon, Ice Shards cells or positive Ink tendril damage. No invented statuses, hits, summons or moving visuals. Render integration is separate from native acceptance, production smoke and physical-device performance.';
const browser=await chromium.launch({headless:true}),reports=[];
await fs.mkdir(output,{recursive:true});
try{
 for(const mobile of [false,true])for(const scenario of ['dive','pact','shards','ink']){
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1600,height:900},isMobile:mobile,hasTouch:mobile}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.waitForFunction(()=>window.arena?.renderer);
  await page.locator('[data-action=close]').last().click();
  if(mobile)await page.locator('.mobile-nav [data-action=cinema]').tap();
  const fixture=await page.evaluate(async scenario=>{
   const {createBattle,stepBattle}=await import('/src/combat.ts');
   const arena=window.arena,id={dive:'phoenix_icarus_dive',pact:'custom_beastmaster_inner_beast',shards:'custom_tusk_ice_shards',ink:'custom_grimstroke_ink_swell'}[scenario];
   const player=side=>({id:side,name:`QA${side}`,hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:[0,1,2].map(i=>({id:`h${side}-${i}`,name:`QA${side}-${i}`,role:'mage',skin:i?'male':'female',x:i?10:0,y:i?-10:-2,skills:side===0&&i===0?[{id,points:scenario==='ink'?6:9}]:[]}))});
   const battle=createBattle(player(0),player(1),948,arena.definitions),caster=battle.units.find(u=>u.side===0&&!u.summoned),enemies=battle.units.filter(u=>u.side===1),target=enemies[0],ally=battle.units.filter(u=>u.side===0&&!u.summoned)[1];
   for(const unit of battle.units.filter(u=>!u.summoned)){unit.hp=unit.maxHp=100000;unit.mana=unit.maxMana=4000;unit.moveSpeed=0;unit.nextAttack=100;}
   caster.x=caster.y=0;caster.facing=0;target.x=6;target.y=0;
   enemies.slice(1).forEach((unit,i)=>{unit.x=7;unit.y=i?2:-2;});
   if(scenario==='ink'){ally.x=4.5;ally.y=.8;ally.hp=50000;}
   stepBattle(battle,scenario==='dive'?1.1:scenario==='shards'?1:.6,arena.definitions);
   const ward=battle.units.find(u=>u.nativeTemplateId==='npc_dota_item_wraith_pact_totem');
   const cells=(battle.barriers??[]).filter(w=>w.skill===id),contact=target.statuses.find(s=>s.kind==='visualLink'&&s.skill===id&&s.until>battle.time);
   if(scenario!=='pact'&&!battle.events.some(e=>e.type==='cast'&&e.skill===id))throw Error('No real release');
   if(scenario==='dive'&&(!caster.statuses.some(s=>s.kind==='motionRoot'&&s.skill===id)||Math.hypot(caster.x,caster.y)<2))throw Error('No actual Dive motion');
   if(scenario==='pact'&&(!ward||ward.dead||!ward.ward||ward.attackCapability!=='none'))throw Error('No actual native Wraith Pact body');
   if(scenario==='shards'&&cells.length!==11)throw Error(`Expected actual seven-plus-four Shards cells, found ${cells.length}`);
   if(scenario==='ink'&&(!contact||!battle.events.some(e=>e.type==='hit'&&e.skill===id&&Number(e.amount)>0)))throw Error(`No positive actual Ink tendril contact: ${JSON.stringify({casts:battle.events.filter(e=>e.type==='cast'),units:battle.units.map(u=>({id:u.id,x:u.x,y:u.y,statuses:u.statuses.filter(s=>s.skill===id)}))})}`);
   const body=scenario==='pact'?ward:caster,expectedImage=scenario==='pact'?'/custom_beastmaster_inner_beast/pact_':undefined;
   const effects=scenario==='dive'?[{prefix:`s:${caster.id}:${caster.id}:${id}:`,image:'/phoenix_icarus_dive/head.webp',x:caster.x,y:caster.y}]:scenario==='shards'?[{prefix:`wall:${cells[0].visual.group}`,image:'/custom_tusk_ice_shards/barrier.webp'}]:scenario==='ink'?[{prefix:`link:${contact.source}:${target.id}:${id}`,image:'/custom_grimstroke_ink_swell/tendril.webp',x:(battle.units.find(u=>u.id===contact.source).x+target.x)/2,y:(battle.units.find(u=>u.id===contact.source).y+target.y)/2}]:[];
   const originalDraw=arena.renderer.draw.bind(arena.renderer);window.qaC8Battle=battle;
   arena.renderer.mode='spectate';arena.renderer.layout();arena.renderer.draw=(_a,_b,_c,_d,dt)=>originalDraw([],[],window.qaC8Battle,0,dt);
   return{id,configurationHash:arena.definitions.find(d=>d.id===id)?.configHash,time:battle.time,body:body.id,bodyPosition:{x:body.x,y:body.y},expectedImage,effects,collisionCells:cells.length,snapshot:JSON.stringify(battle)};
  },scenario);
  await page.waitForFunction(fixture=>{
   const renderer=window.arena.renderer,body=renderer.visuals.get(fixture.body);
   return body?.mesh.visible&&body.mesh.material.map?.image&&fixture.effects.every(effect=>[...renderer.persistentFx].some(([key,visual])=>key.startsWith(effect.prefix)&&visual.clip?.image?.includes(effect.image)&&visual.mesh.material.map?.image));
  },fixture);
  const actual=await page.evaluate(fixture=>{
   const renderer=window.arena.renderer,body=renderer.visuals.get(fixture.body);
   return{diagnostics:renderer.diagnostics(),body:{image:body.clip?.image,x:body.group.position.x,y:body.group.position.y},snapshot:JSON.stringify(window.qaC8Battle),effects:fixture.effects.map(effect=>{const [key,visual]=[...renderer.persistentFx].find(([key,visual])=>key.startsWith(effect.prefix)&&visual.clip?.image?.includes(effect.image));return{key,x:visual.group.position.x,y:visual.group.position.y,image:visual.clip?.image,opacity:visual.mesh.material.opacity};})};
  },fixture);
  assert.equal(actual.snapshot,fixture.snapshot,'Rendering changed the frozen simulation');assert.deepEqual(errors,[]);assert.deepEqual(actual.diagnostics.loadErrors,[]);
  assert.equal(fixture.configurationHash,configurationHash,'Render fixture loaded stale compiled data');
  if(fixture.expectedImage)assert(actual.body.image?.includes(fixture.expectedImage),'Real summon did not select its own body atlas');
  assert(Math.abs(actual.body.x-fixture.bodyPosition.x)<1e-6&&Math.abs(actual.body.y-fixture.bodyPosition.y)<1e-6,'Displayed body differs from the frozen simulation');
  fixture.effects.forEach((expected,i)=>{const rendered=actual.effects[i];assert(rendered?.image&&rendered.opacity>0);if(expected.x!==undefined)assert(Math.abs(rendered.x-expected.x)<1e-6&&Math.abs(rendered.y-expected.y)<1e-6);});
  await page.screenshot({path:`${output}/${scenario}${mobile?'-mobile':''}.png`});
  const{snapshot:_,...evidence}=fixture;delete actual.snapshot;reports.push({scenario,mobile,fixture:evidence,...actual,errors});await page.close();
 }
 await fs.writeFile(`${output}/report.json`,JSON.stringify({status:'passed',url,configurationHash,fixtureNote,reports},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',scenarios:reports.map(r=>({scenario:r.scenario,mobile:r.mobile,effects:r.effects.length}))}));
}finally{await browser.close();}
