import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const output='artifacts/skill-stats',browser=await chromium.launch({headless:true}),errors=[];
await fs.mkdir(output,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.ARENA_TEST_URL??'http://localhost:4173');await page.waitForFunction(()=>window.arena?.state);
 await page.locator('#seedInput').fill('126789');await page.locator('[data-action=newGame]').click();
 const bought=await page.locator('[data-buy]:not(:disabled)').first().getAttribute('data-buy');await page.locator(`[data-buy="${bought}"]`).click();
 const reserved=await page.evaluate(()=>{const p=window.arena.state.players[0];return{stack:p.reserve[0],gold:p.gold,reserveCount:p.reserve.filter(Boolean).length,equipped:p.heroes.flatMap(hero=>hero.skills).filter(Boolean).length};});
 assert(reserved.stack&&reserved.reserveCount===1&&reserved.equipped===0,'A real independent shop purchase must enter reserve first');
 await page.locator('[data-reserve="0"]').click();await page.locator('#teamRoster [data-team-hero="0"][data-slot="0"]').click();
 const deployed=await page.evaluate(()=>{const p=window.arena.state.players[0];return{stack:p.heroes[0].skills[0],reserve:p.reserve[0],gold:p.gold};});
 assert.deepEqual(deployed.stack,reserved.stack,'Actual UI deployment must preserve the purchased instance and points');assert.equal(deployed.reserve,null);assert.equal(deployed.gold,reserved.gold,'Reserve-to-hero UI deployment must be free');
 const purchase=await page.evaluate(()=>window.arena.state.players[0].heroes.flatMap(hero=>hero.skills).filter(Boolean).map(skill=>skill.id));assert(purchase.length>0,'The real purchased skill must be deployed before starting combat');
 await page.locator('#ready').click();
 await page.waitForFunction(()=>window.arena.battles.find(battle=>battle.units.some(unit=>unit.side===0))?.units.some(unit=>unit.damage>0),{},{timeout:25000});
 await page.locator('[data-action=pause]').click();
 const evidence=await page.evaluate(()=>{
  const arena=window.arena,battle=arena.battles.find(battle=>battle.units.some(unit=>unit.side===0)),names=new Map(arena.definitions.map(definition=>[definition.id,definition.name]));
  const units=battle.units.map(unit=>({id:unit.id,name:unit.name,summoned:!!unit.summoned,damage:unit.damage,taken:unit.taken,healing:unit.healing,absorbed:unit.absorbed??0,abilityStats:unit.abilityStats??[]}));
  const selected=units.find(unit=>!unit.summoned&&unit.damage>0&&unit.abilityStats.some(row=>row.damage>0)),root=selected?.abilityStats.find(row=>row.damage>0)?.rootAbilityId;
  return{time:battle.time,units,selectedId:selected?.id,displayLabel:root==='basic_attack'?'普通攻击':names.get(root)??root,positiveHits:battle.events.filter(event=>event.type==='hit'&&(event.amount??0)>0).length};
 });
 const close=(a,b)=>Math.abs(a-b)<=1e-6*Math.max(1,a,b);
 for(const unit of evidence.units){
  for(const metric of ['damage','taken','healing','absorbed']){const sum=unit.abilityStats.reduce((total,row)=>total+(row[metric]??0),0);assert(Number.isFinite(unit[metric])&&unit[metric]>=0&&close(sum,unit[metric]),`${unit.id}: ${metric} ledger does not reconcile`);}
  for(const row of unit.abilityStats)for(const [metric,types] of [['damage','damageTypes'],['taken','takenTypes']]){const split=['physical','magical','pure'].reduce((sum,type)=>sum+row[types][type],0);assert(close(split,row[metric]),`${unit.id}: ${row.abilityId} ${metric} types do not reconcile`);}
 }
 assert(evidence.positiveHits>0&&evidence.selectedId&&evidence.displayLabel,'Real battle must have recorded actual damage');
 await page.locator('#tabStats').click();const key=`unit:${evidence.selectedId}:damage`,unitDetails=page.locator(`#infoContent [data-stat-key=${JSON.stringify(key)}]`);
 await unitDetails.locator(':scope > summary').click();assert((await unitDetails.innerText()).includes(evidence.displayLabel),'Real attack or skill must appear in the live expanded statistics');await page.screenshot({path:`${output}/real-engine-damage.png`});
 await page.locator('[data-action=roundResult]').click();const reportDetails=page.locator(`#dialogBody [data-stat-key=${JSON.stringify(key)}]`);if(!await reportDetails.evaluate(element=>element.open))await reportDetails.locator(':scope > summary').click();assert((await reportDetails.innerText()).includes(evidence.displayLabel),'Battle report must show the same real ability');await page.screenshot({path:`${output}/real-engine-report.png`});
 assert.deepEqual(errors,[]);await fs.writeFile(`${output}/engine-report.json`,JSON.stringify({status:'passed',method:'Actual UI new game, real shop purchase into reserve, free UI deployment, real battle hits, pause, read-only ledger inspection; no injected units or statistics',purchase,reserved,deployed,evidence,errors},null,2));console.log(JSON.stringify({status:'passed',purchase,time:evidence.time,units:evidence.units.length,positiveHits:evidence.positiveHits,errors},null,2));
}catch(error){await fs.writeFile(`${output}/engine-report.json`,JSON.stringify({status:'failed',error:String(error),errors},null,2));throw error;}finally{await browser.close();}
