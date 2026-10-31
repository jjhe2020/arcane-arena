import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const url=process.env.ARENA_TEST_URL??'http://localhost:4173';
const output=process.env.ARENA_REPLAY_OUTPUT??'artifacts/r13-replay';
const browser=await chromium.launch({headless:true});
const report={status:'running',url,startedAt:new Date().toISOString(),checks:[],errors:[],files:[],boundaries:['Uses actual UI purchases, deployment, natural combat and IndexedDB archival. No battle result, combat state, random seed state or replay result is injected.','Desktop and touch checks use Chromium emulation; physical iPad performance is not certified.']};
let currentPage,stage='initializing';
await fs.mkdir(output,{recursive:true});
const check=(name,details)=>report.checks.push({name,...(details===undefined?{}:{details})});

async function pageFor(options){
 const page=await browser.newPage({...options,acceptDownloads:true,serviceWorkers:'block'});
 page.on('pageerror',error=>report.errors.push(error.stack??error.message));
 page.on('response',response=>{if(response.status()>=400)report.errors.push(`HTTP ${response.status()} ${response.url()}`);});
 // Keep dev preflights stable while other agents edit source. This does not affect production.
 await page.routeWebSocket(/.*/,socket=>socket.close());
 await page.goto(url);await page.waitForFunction(()=>window.arena?.renderer);return page;
}
async function snapshot(page){return page.evaluate(()=>{
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])])):value;
 return JSON.stringify(canonical({state:window.arena.state,battles:window.arena.battles}));
});}
async function screenshot(page,name){const filename=path.join(output,name);await page.screenshot({path:filename,fullPage:true});report.files.push(filename);}
async function download(page,locator,name){
 const [download]=await Promise.all([page.waitForEvent('download'),locator.click()]);
 const filename=path.resolve(output,name);await download.saveAs(filename);assert.equal(await download.failure(),null);const file=JSON.parse(await fs.readFile(filename,'utf8'));
 assert.equal(file.format,'arcane-arena-battle');assert.equal(file.schemaVersion,1);assert(Number.isSafeInteger(file.targetTick)&&file.targetTick>0);assert.equal(file.expected.ticks,file.targetTick);report.files.push(filename);return{filename,file};
}
async function importFile(page,filename,touch=false){
 const action=page.locator('#dialog[open] [data-action=importReplay]').last();
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),touch?action.tap():action.click()]);await chooser.setFiles(filename);await page.locator('.replay-viewer').waitFor();
}
async function seek(page,tick){
 await page.locator('.replay-controls input').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('change',{bubbles:true}));},tick);
 await page.waitForFunction(value=>window.arena.replay?.state?.tickCount===value&&document.querySelector('[data-replay=play]')?.textContent!=='定位中…',tick,{timeout:30000});
}
async function exerciseViewer(page,file,label,touch=false){
 const click=async selector=>touch?await page.locator(selector).tap():await page.locator(selector).click();
 assert.equal(await page.locator('.replay-controls input').getAttribute('max'),String(file.targetTick));
 await click('[data-replay=play]');await page.waitForFunction(()=>Number(window.arena.replay?.state?.tickCount)>0);await click('[data-replay=play]');
 const pausedTick=await page.evaluate(()=>window.arena.replay.state.tickCount);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.arena.replay.state.tickCount),pausedTick);
 await click('[data-replay=speed]');assert.match(await page.locator('[data-replay=speed]').innerText(),/2/);await click('[data-replay=speed]');assert.match(await page.locator('[data-replay=speed]').innerText(),/4/);
 if(!touch){const input=page.locator('.replay-controls input'),box=await input.boundingBox(),start=Number(await input.inputValue())/Math.max(1,file.targetTick);assert(box);await page.mouse.move(box.x+8+(box.width-16)*start,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+8+(box.width-16)*.7,box.y+box.height/2,{steps:8});await page.waitForTimeout(250);const heldTick=Number(await input.inputValue());await page.mouse.up();await page.waitForFunction(value=>window.arena.replay.state.tickCount===value&&document.querySelector('[data-replay=play]')?.textContent==='▶ 播放',heldTick);assert(heldTick>=file.targetTick*.55&&heldTick<=file.targetTick*.85,`Dragging the slider was reset before release: ${heldTick}/${file.targetTick}`);check(`${label}: native pointer drag holds the seek target until release`,{heldTick});}
 const middle=Math.floor(file.targetTick/2);await seek(page,middle);assert.equal(await page.locator('.replay-controls input').inputValue(),String(middle));
 await seek(page,file.targetTick);await page.locator('.replay-validation[data-verified=true]').waitFor();
 assert.equal(await page.evaluate(()=>window.arena.replay.state.time),file.expected.duration);
 await screenshot(page,`${label}-verified.png`);check(`${label}: import, play/pause, 2x/4x speed, seek and checksum verification`,{id:file.id,targetTick:file.targetTick,pausedTick,middle});
 await click('[data-replay=close]');await page.locator('.replay-viewer').waitFor({state:'detached'});
}
async function archiveRows(page){return page.evaluate(async()=>{
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('arcane-arena-replays',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('battles','readonly'),request=tx.objectStore('battles').getAll();request.onsuccess=()=>resolve(request.result.map(file=>({id:file.id,targetTick:file.targetTick,finished:file.expected.finished})));request.onerror=()=>reject(request.error);});}finally{db.close();}
});}

try{
 stage='desktop new game';const desktop=currentPage=await pageFor({viewport:{width:1600,height:900}});await desktop.locator('#dialog[open]').waitFor();await desktop.locator('#seedInput').fill('743');await desktop.locator('[data-action=newGame]').click();
 await desktop.locator('[data-buy="0"]').click();await desktop.locator('[data-reserve="0"]').click();await desktop.locator('#teamRoster [data-team-hero="0"][data-slot="0"]').click();
 const equipped=await desktop.evaluate(()=>window.arena.state.players[0].heroes[0].skills[0]);assert(equipped?.id&&equipped.instanceId);check('Real UI purchase and deployment',{skillId:equipped.id,instanceId:equipped.instanceId});
 await desktop.locator('#ready').click();await desktop.waitForFunction(()=>window.arena.state.phase==='battle'&&window.arena.battles.some(battle=>battle.units.some(unit=>unit.side===0)&&battle.time>=2),null,{timeout:30000});await desktop.locator('[data-action=pause]').first().click();
 stage='desktop enemy inspection';const selected=await desktop.evaluate(()=>{const a=window.arena,b=a.battles.find(battle=>battle.units.some(unit=>unit.side===0)),enemy=b.units.find(unit=>unit.side!==0&&!unit.summoned&&!unit.dead)??b.units.find(unit=>unit.side!==0&&!unit.summoned),p=a.renderer.project(enemy.x,enemy.y),rect=document.querySelector('#world').getBoundingClientRect();return{id:enemy.id,x:rect.x+p.x,y:rect.y+p.y,view:a.renderer.diagnostics().view};});
 await desktop.mouse.click(selected.x,selected.y);assert.equal(await desktop.locator('#infoContent .unit-heading').getAttribute('data-unit-id'),selected.id);const afterSelect=await desktop.evaluate(()=>window.arena.renderer.diagnostics().view);assert.deepEqual(afterSelect,selected.view);check('Enemy canvas selection opens enemy details without moving the observation camera',{unitId:selected.id});await screenshot(desktop,'desktop-enemy-inspection.png');
 stage='download current replay';await desktop.locator('[data-action=roundResult]').click();const partial=await download(desktop,desktop.locator('#dialog [data-action=downloadCurrentReplay]'),'current-battle.json');await desktop.locator('#dialogFooter [data-action=close]').click();
 const beforeReplay=await snapshot(desktop);await desktop.locator('[data-action=menu]').click();await importFile(desktop,partial.filename);await exerciseViewer(desktop,partial.file,'desktop-partial');assert.equal(await snapshot(desktop),beforeReplay);check('Closing imported replay leaves current GameState and all BattleStates unchanged');
 stage='refresh paused battle';await desktop.reload();await desktop.waitForFunction(()=>window.arena?.renderer);assert.equal(await snapshot(desktop),beforeReplay);check('Paused main game and battles restore after refresh');
 stage='natural battle completion and archive';await desktop.locator('[data-action=speed]').first().click();await desktop.locator('[data-action=speed]').first().click();assert.match(await desktop.locator('[data-action=speed]').first().innerText(),/4/);await desktop.locator('[data-action=pause]').first().click();
 await desktop.waitForFunction(()=>window.arena.state.phase==='result'||window.arena.state.phase==='finished',null,{timeout:65000});
 const completed=await desktop.evaluate(()=>({phase:window.arena.state.phase,round:window.arena.state.round,reports:window.arena.state.history.map(report=>({round:report.round,a:report.a,b:report.b,replayId:report.replayId}))}));assert.equal(completed.phase,'result');assert(completed.reports.length>0&&completed.reports.every(row=>row.replayId));
 let archive=[];for(let tries=0;tries<20;tries++){archive=await archiveRows(desktop);if(completed.reports.every(row=>archive.some(file=>file.id===row.replayId&&file.finished)))break;await desktop.waitForTimeout(100);}
 assert(completed.reports.every(row=>archive.some(file=>file.id===row.replayId&&file.finished)));check('Natural round completion archives every RoundReport.replayId in IndexedDB',{completed,archive});
 await desktop.locator('#ready').click();await desktop.waitForFunction(()=>window.arena.state.phase==='prep'&&window.arena.state.round===2);await desktop.locator('[data-action=summary]').first().click();
 const historyId=completed.reports.find(row=>row.a===0||row.b===0).replayId;const archived=await download(desktop,desktop.locator(`[data-replay-download="${historyId}"]`),'archived-round-one.json');assert.equal(archived.file.id,historyId);assert.equal(archived.file.expected.finished,true);await desktop.locator('#dialogFooter [data-action=close]').click();const nextRound=await snapshot(desktop);
 await desktop.locator('[data-action=summary]').first().click();await desktop.locator(`[data-replay-open="${historyId}"]`).click();await seek(desktop,archived.file.targetTick);await desktop.locator('.replay-validation[data-verified=true]').waitFor();await screenshot(desktop,'desktop-archived-round-verified.png');await desktop.locator('[data-replay=close]').click();assert.equal(await snapshot(desktop),nextRound);check('Previous round remains downloadable and replays identically after advancing to the next planning round',{historyId});
 await desktop.reload();await desktop.waitForFunction(()=>window.arena?.renderer);assert.equal(await snapshot(desktop),nextRound);const restoredArchive=await archiveRows(desktop);assert(restoredArchive.some(file=>file.id===historyId));check('Next-round save and archived replay both survive refresh');await desktop.close();
 stage='touch import and seek';const touch=currentPage=await pageFor({viewport:{width:1024,height:768},hasTouch:true,isMobile:true});await touch.locator('#dialog[open]').waitFor();const touchBefore=await snapshot(touch);await importFile(touch,archived.filename,true);await exerciseViewer(touch,archived.file,'touch-archived',true);assert.equal(await snapshot(touch),touchBefore);check('Touch replay exit preserves the underlying planning game');await touch.close();
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.stage=stage;report.message=String(error);if(currentPage&&!currentPage.isClosed()){try{await screenshot(currentPage,'failure.png');report.diagnostic=await currentPage.evaluate(()=>({game:window.arena?.state?.phase,round:window.arena?.state?.round,replayTick:window.arena?.replay?.state?.tickCount,dialog:document.querySelector('#dialogTitle')?.textContent,toast:document.querySelector('#toast')?.textContent,body:document.body.innerText.slice(-2500)}));}catch{}}process.exitCode=1;
}finally{report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await browser.close();}
