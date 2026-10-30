import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**',()=>{});await page.goto(process.env.ARENA_TEST_URL??'http://localhost:5173');await page.waitForFunction(()=>window.arena?.state);await page.locator('[data-action=newGame]').click();
 const active=()=>page.locator('.player-row.active').getAttribute('data-player');
 // Force only match outcomes to exercise elimination/UI transitions. Combat
 // fidelity is tested separately; no forced outcome is saved as a replay.
 async function finishAgainst(player){await page.evaluate(id=>{for(const b of window.arena.battles){const sides=[...new Set(b.units.map(u=>u.side))],winner=sides.includes(id)?sides.find(s=>s!==id):sides[0];for(const u of b.units)if(u.side!==winner){u.dead=true;u.hp=0;}b.winner=winner;b.finished=true;}},player);await page.waitForFunction(()=>window.arena.state.phase!=='battle');}
 await page.evaluate(()=>window.arena.state.players[0].hp=1);await page.locator('#ready').click();await finishAgainst(0);await page.locator('[data-action=close]').last().click();const first=Number(await active());assert(first>0);assert(await page.evaluate(id=>window.arena.state.players[id].hp>0,first));
 await page.locator('#ready').click();await page.evaluate(id=>window.arena.state.players[id].hp=1,first);await page.locator('#ready').click();await finishAgainst(first);const second=Number(await active());assert.notEqual(second,first);assert(await page.evaluate(id=>window.arena.state.players[id].hp>0,second));
 await page.locator('#ready').click();await page.evaluate(()=>window.arena.save());await page.reload();await page.waitForFunction(()=>window.arena?.state);assert.equal(Number(await active()),second,'刷新后丢失仍存活的观战对象');
 await page.evaluate(()=>{const key='arcane-arena.save.v1',save=JSON.parse(localStorage.getItem(key));save.viewed=0;localStorage.setItem(key,JSON.stringify(save));});await page.reload();await page.waitForFunction(()=>window.arena?.state);assert(await page.evaluate(id=>window.arena.state.players[id].hp>0,Number(await active())),'旧观战对象已淘汰但恢复仍未切换');
 await page.locator('#ready').click();await page.waitForFunction(()=>window.arena.renderer.battleIntroReady&&window.arena.battles.some(b=>b.time>=1)&&document.querySelector('#timer').textContent!=='0s');assert.notEqual(await page.locator('#timer').textContent(),'0s');assert.deepEqual(errors,[]);await page.screenshot({path:'artifacts/spectator.png'});
 const report={status:'passed',checks:['玩家淘汰后转看存活AI','被观看AI再次淘汰后自动切换','刷新保留存活观战对象','恢复已淘汰对象时自动选择存活对象','新回合计时持续推进'],first,second,errors};await fs.writeFile('artifacts/spectator-smoke.json',JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();}
