import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',()=>{});let requests=0;
 await page.route('**/art/characters/tank-female/idle.webp',route=>requests++<2?route.fulfill({status:503,body:'temporary fixture failure'}):route.continue());
 await page.goto(process.env.ARENA_TEST_URL??'http://localhost:5173');await page.waitForFunction(()=>window.arena?.state);
 await page.waitForFunction(()=>window.arena.renderer.diagnostics().unitBodies.some(b=>b.image?.includes('tank-female/idle.webp'))&&window.arena.renderer.loadErrors.length===0,{},{timeout:12000});
 assert(requests>=3);assert.deepEqual(errors,[]);await page.setViewportSize({width:667,height:275});await page.waitForTimeout(200);await page.locator('[data-action=newGame]').click();
 const bounds=await page.evaluate(()=>{const r=document.querySelector('#ready').getBoundingClientRect(),b=document.querySelector('#teamRoster').getBoundingClientRect();return{readyBottom:r.bottom,rosterBottom:b.bottom,viewport:innerHeight}});assert(bounds.readyBottom<=bounds.viewport);assert(bounds.rosterBottom<=bounds.viewport);
 const report={status:'passed',checks:['temporary character atlas failure recovers without reload','successful retry clears active asset errors','667x275 browser-bars viewport retains ready and roster'],requests,bounds,errors};await fs.writeFile('artifacts/asset-recovery-smoke.json',JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();}
