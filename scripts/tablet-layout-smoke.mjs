import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const url=process.env.ARENA_TEST_URL??'http://127.0.0.1:5173',output=process.env.ARENA_TABLET_OUTPUT??'artifacts/tablet-layout';
const viewports=[[1600,900,false],[1366,768,false],[1024,768,true],[1180,820,true],[1366,1024,true],[768,1024,true],[844,390,false]];
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true}),results=[];
try{
 for(const [width,height,tablet]of viewports){
  const context=await browser.newContext({viewport:{width,height},hasTouch:tablet,isMobile:tablet}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  await page.routeWebSocket('**',()=>{});
  try{
   await page.goto(url);await page.waitForFunction(()=>window.arena?.state);
   if(!await page.locator('#seedInput').count())await page.locator('.session-controls [data-action=menu]').click();
   await page.locator('#seedInput').fill('743');await page.locator('[data-action=newGame]').click();
   await page.waitForTimeout(200);
   const layout=await page.evaluate(()=>{
    const shop=document.querySelector('#arenaShop'),grid=document.querySelector('#shopGrid');
    const buttons=[...shop.querySelectorAll('button')].map(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{action:el.dataset.action??el.dataset.buy??el.id,width:r.width,height:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom,reachable:hit===el||el.contains(hit),disabled:el.disabled};});
    const names=[...grid.querySelectorAll('.skill-name')].map(el=>{const r=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const t=range.getBoundingClientRect();return{text:el.textContent,width:r.width,textWidth:t.width,font:getComputedStyle(el).fontSize};});
    return{tablet:document.querySelector('#game').dataset.tabletShop,columns:getComputedStyle(grid).gridTemplateColumns,rows:[...new Set([...grid.children].map(el=>Math.round(el.getBoundingClientRect().y)))],buttons,names,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,shop:shop.getBoundingClientRect().toJSON()};
   });
   assert.equal(layout.tablet,String(tablet),`${width}x${height} layout mode`);
   assert.equal(layout.buttons.filter(x=>/^\d+$/.test(x.action)).length,12);
   assert.equal(layout.rows.length,tablet?2:1,`${width}x${height} shop rows`);
   assert(layout.documentWidth<=width+1,'Horizontal page overflow');
   const portrait=page.locator('#teamRoster [data-hero="0"]');const portraitBounds=await portrait.boundingBox();assert(portraitBounds&&portraitBounds.width>=28&&portraitBounds.height>=28,'Roster portrait must be visible and clickable');await portrait.click();
   for(const button of layout.buttons){if(!button.disabled)assert(button.reachable,`${width}x${height} ${button.action} covered`);assert(button.y>=0&&button.bottom<=height+1,'Offscreen shop button');if(tablet&&button.action!=='economy')assert(button.height>=35,`${width}x${height} ${button.action} too short`);}
   for(const name of layout.names)assert(name.textWidth<=name.width+1,`${width}x${height} clipped name ${name.text}`);
   if(tablet){const offer=page.locator('[data-buy="0"]');const gold=await page.evaluate(()=>window.arena.state.players[0].gold);await offer.tap();assert.equal(await page.evaluate(()=>window.arena.state.players[0].gold),gold-3,'Touch purchase');}
   await page.screenshot({path:`${output}/${width}x${height}.png`});assert.deepEqual(errors,[]);results.push({viewport:`${width}x${height}`,status:'passed',layout});
  }catch(error){await page.screenshot({path:`${output}/${width}x${height}-failure.png`}).catch(()=>{});results.push({viewport:`${width}x${height}`,status:'failed',error:String(error.stack??error),errors});throw error;}
  finally{await context.close();}
 }
 await fs.writeFile(`${output}/report.json`,JSON.stringify({status:'passed',results},null,2));console.log(JSON.stringify({status:'passed',viewports:results.length}));
}catch(error){await fs.writeFile(`${output}/report.json`,JSON.stringify({status:'failed',results},null,2));throw error;}
finally{await browser.close();}
