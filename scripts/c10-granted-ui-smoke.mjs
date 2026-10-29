import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=process.env.ARENA_TEST_URL??'http://localhost:4182',output='artifacts/r6-c10-granted-ui';
const cases=[{parent:'custom_naga_siren_mirror_image',points:9,child:'naga_siren_rip_tide',name:'激流',level:4},{parent:'custom_drow_ranger_multishot',points:9,child:'drow_ranger_marksmanship',name:'射手天赋',level:3},{parent:'custom_snapfire_mortimer_kisses',points:6,child:'aa_granted_spit_out',name:'吐出',level:1}];
const hash=JSON.parse(await fs.readFile('public/data/config-report.json','utf8')).hash,browser=await chromium.launch({headless:true}),results=[];await fs.mkdir(output,{recursive:true});
try{
 for(const item of cases){
  const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[],badImages=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',response=>{if(response.request().resourceType()==='image'&&!response.ok())badImages.push(response.url());});
  await page.goto(url);await page.waitForFunction(()=>window.arena?.state);let seed;
  for(let n=1;n<=64;n++){const candidate=Math.imul(n,0x9e3779b9)>>>0;await page.locator('#seedInput').fill(String(candidate));await page.locator('[data-action=newGame]').click();if(await page.evaluate(id=>window.arena.state.matchSkillIds.includes(id),item.parent)){seed=candidate;break;}await page.locator('.session-controls [data-action=menu]').click();}
  assert.notEqual(seed,undefined);
  const acquired=await page.evaluate(({parent,points})=>{const p=window.arena.state.players[0];p.gold=5000;for(let i=0;i<2;i++)document.querySelector('#shopUpgrade').click();for(let n=0;n<1200&&(p.heroes[0].skills.find(s=>s?.id===parent)?.points??0)<points;n++){const slot=p.shop.indexOf(parent);document.querySelector(slot>=0?`[data-buy="${slot}"]`:'#reroll').click();}for(const owner of window.arena.state.players)for(const hero of owner.heroes){hero.x=0;hero.y=-2;}if(!window.arena.save())throw Error('Normal fixture serialization failed');return p.heroes[0].skills.find(s=>s?.id===parent)?.points??0;},item);
  assert.equal(acquired,item.points);await page.locator('[data-action=plan]').click();await page.locator('#ready').click();
  await page.waitForFunction(id=>window.arena.battles.some(b=>b.units.some(u=>u.side===0&&!u.summoned&&u.skills.some(s=>s?.id===id))),item.child);await page.locator('[data-action=pause]').click();
  const slot=page.locator(`#infoContent .equipped-list [data-detail="${item.child}"]`);await slot.waitFor();assert.equal(await slot.count(),1);
  const actual=await page.evaluate(id=>{const battle=window.arena.battles.find(b=>b.units.some(u=>u.side===0)),unit=battle.units.find(u=>u.side===0&&!u.summoned),skill=unit.skills.find(s=>s?.id===id);return{points:skill.points,parent:skill.statParentId,hash:window.arena.definitions[0].configHash};},item.child);
  assert.equal(actual.points,item.level);assert.equal(actual.parent,item.parent);assert.equal(actual.hash,hash);await slot.click();assert.equal(await page.locator('#dialogTitle').innerText(),item.name);assert.match(await page.locator('#dialogBody').innerText(),/升级授予效果/);
  await page.locator('#dialogBody img.sprite-icon').evaluate(img=>img.decode());const icon=await page.locator('#dialogBody img.sprite-icon').evaluate(img=>({source:img.getAttribute('src'),width:img.naturalWidth}));assert(icon.source.startsWith('/art/icons/')&&icon.width>0);assert.deepEqual(errors,[]);assert.deepEqual(badImages,[]);
  await page.screenshot({path:`${output}/${item.child}.png`});results.push({...item,seed,acquired,actual,icon,errors,badImages});await page.close();
 }
 await fs.writeFile(`${output}/report.json`,JSON.stringify({status:'passed',url,configurationHash:hash,fixture:'Funded game fixture; actual public seed selection, shop upgrades, rerolls, purchases and battle initialization. No native child slot or level is fabricated.',results},null,2)+'\n');console.log(JSON.stringify({status:'passed',children:results.map(r=>({child:r.child,level:r.actual.points,name:r.name,iconWidth:r.icon.width}))}));
}finally{await browser.close();}
