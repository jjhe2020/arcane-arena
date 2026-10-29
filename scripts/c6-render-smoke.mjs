import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.ARENA_TEST_URL??'http://localhost:5173';
const fixtureNote='Actual createBattle/stepBattle from the development module server with compiled catalog. Four stationary observation subjects have 100000HP/4000mana and delayed ordinary attacks; rendered snapshots are frozen after genuine form/channel releases. No synthetic statuses, hits, channels, or unit visuals. This is a desktop/mobile render check, separate from production browser smoke and native timing acceptance.';
const browser=await chromium.launch({headless:true}),reports=[];
await fs.mkdir('artifacts/r6-c6-render',{recursive:true});
try{
 for(const mobile of [false,true])for(const scenario of ['dragon','grip']){
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1600,height:900},isMobile:mobile,hasTouch:mobile}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.waitForFunction(()=>window.arena?.renderer);
  await page.locator('[data-action=close]').last().click();
  if(mobile)await page.locator('.mobile-nav [data-action=cinema]').tap();
  const fixture=await page.evaluate(async scenario=>{
   const {createBattle,stepBattle}=await import('/src/combat.ts');
   const arena=window.arena,id=scenario==='dragon'?'dragon_knight_elder_dragon_form':'custom_bane_fiends_grip';
   const player=side=>({id:side,name:`QA${side}`,hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:[0,1].map(i=>({id:`h${i}`,name:`QA${side}-${i}`,role:'mage',skin:i?'male':'female',x:i?10:0,y:i?-10:-2,skills:side===0&&i===0?[{id,points:scenario==='dragon'?9:6}]:[]}))});
   const battle=createBattle(player(0),player(1),761,arena.definitions),caster=battle.units[0],target=battle.units.find(u=>u.side===1);
   for(const unit of battle.units){unit.hp=unit.maxHp=100000;unit.mana=unit.maxMana=4000;unit.moveSpeed=0;unit.nextAttack=100;}
   caster.x=caster.y=0;caster.facing=0;target.x=4;target.y=0;
   for(let slot=1;slot<caster.cooldowns.length;slot++)caster.cooldowns[slot]=99999;
   stepBattle(battle,1,arena.definitions);
   const subjects=scenario==='dragon'?[caster]:battle.units.filter(u=>u.fiendsGripActor);
   if(scenario==='dragon'&&!caster.statuses.some(s=>s.kind==='elderDragon'))throw Error('No actual dragon form');
   if(scenario==='grip'&&(subjects.length!==2||subjects.some(u=>u.dead||u.action!=='channel')||!battle.events.some(e=>e.type==='hit'&&e.skill===id&&e.amount>0)))throw Error('No actual pair of damaging channeling images');
   const originalDraw=arena.renderer.draw.bind(arena.renderer);window.qaC6Battle=battle;
   arena.renderer.mode='spectate';arena.renderer.layout();arena.renderer.draw=(_a,_b,_c,_d,dt)=>originalDraw([],[],window.qaC6Battle,0,dt);
   return{id,time:battle.time,subjects:subjects.map(u=>({id:u.id,x:u.x,y:u.y,action:u.action})),snapshot:JSON.stringify(battle)};
  },scenario);
  await page.waitForFunction(subjects=>subjects.every(subject=>{const visual=window.arena.renderer.visuals.get(subject.id);return visual?.mesh.visible&&visual.mesh.material.map?.image;}),fixture.subjects);
  const actual=await page.evaluate(subjects=>({diagnostics:window.arena.renderer.diagnostics(),snapshot:JSON.stringify(window.qaC6Battle),subjects:subjects.map(subject=>{const visual=window.arena.renderer.visuals.get(subject.id);return{id:subject.id,x:visual.group.position.x,y:visual.group.position.y,image:visual.clip?.image,opacity:visual.mesh.material.opacity};})}),fixture.subjects);
  assert.equal(actual.snapshot,fixture.snapshot,'Rendering changed the frozen simulation');assert.deepEqual(errors,[]);assert.deepEqual(actual.diagnostics.loadErrors,[]);
  for(const expected of fixture.subjects){const rendered=actual.subjects.find(u=>u.id===expected.id);assert(rendered?.image&&rendered.opacity>0);assert(Math.abs(rendered.x-expected.x)<1e-6&&Math.abs(rendered.y-expected.y)<1e-6);}
  await page.screenshot({path:`artifacts/r6-c6-render/${scenario}${mobile?'-mobile':''}.png`});
  const{snapshot:_,...evidence}=fixture;delete actual.snapshot;reports.push({scenario,mobile,fixture:evidence,...actual,errors});await page.close();
 }
 await fs.writeFile('artifacts/r6-c6-render/report.json',JSON.stringify({status:'passed',url,fixtureNote,reports},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',scenarios:reports.map(r=>({scenario:r.scenario,mobile:r.mobile,subjects:r.subjects.length}))}));
}finally{await browser.close();}
