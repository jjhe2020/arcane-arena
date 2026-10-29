import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser=await chromium.launch({headless:true}),reports=[];
const output='artifacts/skill-stats';await fs.mkdir(output,{recursive:true});
try{
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1600,height:900},hasTouch:mobile,isMobile:mobile}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.ARENA_TEST_URL??'http://localhost:4173');await page.waitForFunction(()=>window.arena?.state);
  await page.locator('[data-action=newGame]').click();await page.locator('#ready').click();await page.waitForFunction(()=>window.arena.battles.length>0);
  await page.locator('[data-action=pause]').click();
  // A deterministic ledger fixture tests the shipped UI contract. Engine damage,
  // clipping, summons, and replay have their own integration tests.
  const fixture=await page.evaluate(()=>{
   const arena=window.arena,b=arena.battles.find(battle=>battle.units.some(unit=>unit.side===0)),hero=b.units.find(unit=>unit.side===0&&!unit.summoned),enemy=b.units.find(unit=>unit.side!==0&&!unit.summoned);
   const ids={magic:'custom_lina_dragon_slave',pure:'custom_bane_brain_sap',summon:'custom_lycan_summon_wolves',shield:'custom_abaddon_aphotic_shield'};
   for(const unit of b.units){unit.damage=unit.taken=unit.healing=unit.absorbed=0;unit.abilityStats=[];}
   const amounts=(type,amount)=>({physical:type==='physical'?amount:0,magical:type==='magical'?amount:0,pure:type==='pure'?amount:0});
   const row=(abilityId,rootAbilityId,source,damage=0,taken=0,healing=0,absorbed=0,type='physical')=>({key:JSON.stringify([rootAbilityId,abilityId,source.id]),abilityId,rootAbilityId,sourceUnitId:source.id,sourceName:source.name,damage,taken,healing,absorbed,damageTypes:amounts(type,damage),takenTypes:amounts(type,taken)});
   hero.damage=180;hero.taken=90;hero.healing=35;hero.absorbed=60;
   hero.abilityStats=[row('basic_attack','basic_attack',hero,50),row(ids.magic,ids.magic,hero,70,0,0,0,'magical'),row(ids.pure,ids.pure,hero,40,0,35,0,'pure'),row(ids.shield,ids.shield,hero,0,0,0,60),row(ids.magic,ids.magic,enemy,0,90,0,0,'magical')];
   const summon={...hero,id:'qa:summon',name:'狼 · 验证',owner:hero.id,summoned:true,sourceSkill:ids.summon,damage:0,taken:20,healing:0,absorbed:0,skills:[],abilityStats:[row(ids.magic,ids.magic,enemy,0,20,0,0,'magical')]};
   b.units.push(summon);hero.abilityStats.push(row('basic_attack',ids.summon,summon,20));enemy.taken=180;enemy.damage=110;enemy.abilityStats=[row('basic_attack','basic_attack',hero,0,50),row(ids.magic,ids.magic,hero,0,70,0,0,'magical'),row(ids.pure,ids.pure,hero,0,40,0,0,'pure'),row('basic_attack',ids.summon,summon,0,20),row(ids.magic,ids.magic,enemy,110,0,0,0,'magical')];
   return{heroId:hero.id,heroName:hero.name,ids};
  });
  if(mobile)await page.locator('[data-action=mobileInfo]').click();
  await page.locator('#tabStats').click();
  for(const type of ['physical','magical','pure'])assert(await page.locator(`#infoContent .damage-legend .damage-${type}`).isVisible(),`Missing ${type} legend`);
  const detailsFor=metric=>page.locator(`#infoContent [data-stat-key=${JSON.stringify(`unit:${fixture.heroId}:${metric}`)}]`);
  const openUnit=async metric=>{await page.locator(`#infoContent [data-metric=${metric}]`).click();const details=detailsFor(metric);await details.locator(':scope > summary').click();await details.locator('.unit-statistics-detail').waitFor({state:'visible'});return details;};
  let unit=await openUnit('damage');assert((await unit.innerText()).includes('180'),'Damage total must be 180');
  for(const text of ['物理 50','魔法 70','纯粹 40'])assert((await unit.innerText()).includes(text),`Missing damage split: ${text}`);
  const summonGroup=unit.locator(`[data-stat-key=${JSON.stringify(`ability:${fixture.heroId}:damage:${fixture.ids.summon}`)}]`);await summonGroup.locator(':scope > summary').click();assert(await summonGroup.locator('.ability-stat-leaves').isVisible(),'Summon ability must expand');
  await page.waitForTimeout(650);assert(await detailsFor('damage').evaluate(element=>element.open),'Unit expansion must survive real-time refresh');assert(await page.locator(`[data-stat-key=${JSON.stringify(`ability:${fixture.heroId}:damage:${fixture.ids.summon}`)}]`).evaluate(element=>element.open),'Ability expansion must survive refresh');
  if(mobile){await page.screenshot({path:`${output}/mobile-summon-detail.png`});await page.locator('#infoContent').evaluate(element=>element.scrollTop=0);}
  await page.screenshot({path:`${output}/${mobile?'mobile':'desktop'}-damage.png`});
  unit=await openUnit('taken');assert((await unit.innerText()).includes('魔法 90'),'Incoming skill/type missing');await unit.locator('.summon-statistics > summary').click();assert((await unit.innerText()).includes('独立于英雄本体承伤'),'Summon received damage must be separate');await page.screenshot({path:`${output}/${mobile?'mobile':'desktop'}-taken.png`});
  unit=await openUnit('healing');assert((await unit.innerText()).includes('35'),'Effective skill healing missing');
  unit=await openUnit('absorbed');assert((await unit.innerText()).includes('60'),'Shield absorption missing');await page.screenshot({path:`${output}/${mobile?'mobile':'desktop'}-absorbed.png`});
  const geometry=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,panel:document.querySelector('#infoContent').getBoundingClientRect().toJSON()}));assert(geometry.scrollWidth<=geometry.viewport+1,'Horizontal page overflow');
  assert.deepEqual(errors,[]);reports.push({mobile,viewport:mobile?'844×390':'1600×900',fixture:'Deterministic UI ledger fixture in a real paused battle; engine verified separately',checks:['unit and summon ability expansion','three labeled damage colors','incoming abilities and separate summon received damage','effective healing','shield absorption','expansion survives refresh','no horizontal overflow'],geometry,errors});await page.close();
 }
 await fs.writeFile(`${output}/report.json`,JSON.stringify({status:'passed',reports},null,2));console.log(JSON.stringify({status:'passed',reports},null,2));
}catch(error){await fs.writeFile(`${output}/report.json`,JSON.stringify({status:'failed',reports,error:String(error)},null,2));throw error;}finally{await browser.close();}
