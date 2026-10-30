import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
await fs.mkdir('artifacts',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:667,height:375},hasTouch:true,isMobile:true});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',()=>{});await page.goto(process.env.ARENA_TEST_URL??'http://localhost:5173');await page.waitForFunction(()=>window.arena?.state);await page.locator('[data-action=newGame]').tap();
 // Capacity fixture: fund the actual upgrade actions, retaining 6 gold for purchase/movement.
 // This script needs Vite's /src modules; browser-smoke covers the production bundle.
 await page.evaluate(async()=>{const{shopUpgradeCost}=await import('/src/game.ts');const s=window.arena.state,p=s.players[0],level=p.shopLevel;let budget=6;for(let next=level;next<5;next++){p.shopLevel=next;budget+=shopUpgradeCost(s,0);}p.shopLevel=level;p.gold=budget;});
 const shopLevels=[];
 for(let level=1;level<=5;level++){
  if(level>1)await page.locator('#shopUpgrade').tap();
  const count=await page.locator('[data-buy]:not(:disabled)').count();shopLevels.push(count);assert.equal(count,[4,6,6,8,10][level-1],`商店${level}级普通商品数量错误`);
  assert.equal(await page.evaluate(()=>window.arena.state.players[0].shopLevel),level);
 }
 assert.equal(await page.evaluate(()=>window.arena.state.players[0].gold),6,'升级fixture预算应保留6金币');
 assert.equal(await page.locator('.god-placeholder [data-buy]:disabled').count(),2,'God应保留两格且禁用');
 assert.equal(await page.locator('[data-buy="10"]').isDisabled(),true);assert.equal(await page.locator('[data-buy="11"]').isDisabled(),true);
 const pool=await page.evaluate(()=>({ids:window.arena.state.matchSkillIds,offers:window.arena.state.players.flatMap(p=>p.shop.filter(Boolean))}));assert.equal(pool.ids.length,100);assert.equal(new Set(pool.ids).size,100);assert(pool.offers.every(id=>pool.ids.includes(id)),'商店出现本局随机池以外的技能');
 const cdp=await page.context().newCDPSession(page);
 async function swipe(selector,direction=-1){
  const box=await page.locator(selector).boundingBox();assert(box);
  const start=direction<0?box.x+box.width-20:box.x+20,end=direction<0?box.x+20:box.x+box.width-20,y=box.y+box.height*.65;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
  for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/12,y}]});await page.waitForTimeout(20);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(350);
 }
 const shopBefore=await page.locator('#shopGrid').evaluate(e=>e.scrollLeft);await swipe('#shopGrid');
 assert(await page.locator('#shopGrid').evaluate(e=>e.scrollLeft)>shopBefore+50,'真实触摸手势不能横向滑动商店');
 const last=page.locator('[data-buy="9"]');
 async function lastVisible(){const box=await last.boundingBox(),grid=await page.locator('#shopGrid').boundingBox();return box&&grid&&box.x>=grid.x&&box.x+box.width<=grid.x+grid.width+1;}
 for(let pass=0;pass<8&&!await lastVisible();pass++)await swipe('#shopGrid');
 assert(await lastVisible(),'原生横滑后第10个普通商品仍不可达');
 const shopAfter=await page.locator('#shopGrid').evaluate(e=>e.scrollLeft);
 const goods=await page.evaluate(()=>window.arena.state.players[0].shop[9]);assert(goods);await last.tap();
 assert.equal(await page.evaluate(()=>window.arena.state.players[0].gold),3);assert.equal(await page.evaluate(()=>window.arena.state.players[0].reserve[0]?.id),goods,'购买应先进入暂存');assert.equal(await page.evaluate(()=>window.arena.state.players[0].heroes[0].skills[0]),null,'购买不应自动装备英雄');
 const preserved=await page.locator('#shopGrid').evaluate(e=>e.scrollLeft);assert(Math.abs(preserved-shopAfter)<2,'购买后商店滚动位置复位');
 await page.locator('[data-action=mobileInfo]').tap();await page.locator('[data-reserve="0"]').tap();await page.locator('[data-action=closeMobileInfo]').tap();await page.locator('#teamRoster [data-slot="0"]').first().tap();
 assert.equal(await page.evaluate(()=>window.arena.state.players[0].heroes[0].skills[0]?.id),goods,'暂存技能触摸装备失败');assert.equal(await page.evaluate(()=>window.arena.state.players[0].reserve[0]),null);assert.equal(await page.evaluate(()=>window.arena.state.players[0].gold),3,'从暂存装备应免费');
 await page.locator('#teamRoster [data-slot="0"]').first().tap();await page.locator('[data-action=mobileInfo]').tap();await page.locator('[data-reserve="3"]').tap();
 assert.equal(await page.evaluate(()=>window.arena.state.players[0].reserve[3]?.id),goods);
 assert.equal(await page.evaluate(()=>window.arena.state.players[0].gold),2,'英雄移入暂存应扣1金币');
 await page.screenshot({path:'artifacts/mobile-touch.png'});await page.locator('[data-action=closeMobileInfo]').tap();await page.locator('#ready').tap();await page.locator('[data-action=pause]').tap();
 const viewBefore=await page.evaluate(()=>{const r=window.arena.renderer;return{span:r.project(0,-12).y-r.project(0,12).y,units:JSON.stringify(window.arena.battles.map(b=>b.units))};});
 await page.locator('[data-action=cinema]').tap();await page.waitForTimeout(200);
 const viewAfter=await page.evaluate(()=>{const r=window.arena.renderer;return{span:r.project(0,-12).y-r.project(0,12).y,units:JSON.stringify(window.arena.battles.map(b=>b.units))};});
 assert(viewAfter.span>viewBefore.span*1.4,'纯净观战未扩大有效战场');assert.equal(viewAfter.units,viewBefore.units,'相机切换改变实际战斗');
 await page.locator('[data-action=cinemaSpeed]').tap();assert.equal(await page.locator('[data-action=cinemaSpeed]').textContent(),'2×');await page.screenshot({path:'artifacts/mobile-cinema.png'});await page.locator('[data-action=exitCinema]').tap();assert(await page.locator('#arenaShop').isVisible());assert.deepEqual(errors,[]);
 const report={status:'passed',viewport:'667x375',checks:['五级普通商品4/6/6/8/10、两格God禁用','本局100技能随机池','原生触摸横滑购买第10个普通商品','购买后保持滚动位置','购买进入暂存后触摸免费装备','扣1金触摸分配至第4暂存槽','纯净观战扩大画面且不改变模拟','纯净观战中速度按钮同步和返回构筑'],shopLevels,shopBefore,shopAfter,preserved,viewScaleGain:viewAfter.span/viewBefore.span,errors};await fs.writeFile('artifacts/mobile-touch-smoke.json',JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();}
