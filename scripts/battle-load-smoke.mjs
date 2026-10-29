import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});const reports=[];
await fs.mkdir('artifacts',{recursive:true});
try{for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:932,height:430}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile});const errors=[],webglWarnings=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning'&&/WebGL|GPU|GL_/i.test(m.text())&&webglWarnings.length<20)webglWarnings.push(m.text());});await page.addInitScript(()=>{window.qaContextLosses=0;document.addEventListener('webglcontextlost',()=>window.qaContextLosses++,true);});await page.routeWebSocket('**',()=>{});await page.goto(process.env.ARENA_TEST_URL??'http://localhost:5173');await page.waitForFunction(()=>window.arena?.state);await page.locator('[data-action=close]').last().click();
 const simulation=await page.evaluate(async()=>{
  const {createBattle,stepBattle}=await import('/src/combat.ts');const arena=window.arena;
  const teams=[
   ['custom_warlock_chaotic_offering','custom_beastmaster_call_of_the_wild','custom_furion_force_of_nature','custom_lycan_summon_wolves'],
   ['custom_visage_summon_familiars','custom_venomancer_plague_ward','custom_lina_dragon_slave','custom_skeleton_king_vampiric_aura'],
   ['custom_chaos_knight_phantasm','custom_earthshaker_fissure','custom_sven_warcry','dazzle_shadow_wave'],
   ['enigma_black_hole','custom_alchemist_acid_spray','viper_nethertoxin','custom_ember_spirit_flame_guard'],
   ['custom_crystal_maiden_freezing_field','custom_lion_mana_drain','custom_bristleback_quill_spray','custom_lone_druid_spirit_bear'],
  ];
  for(const id of teams.flat())if(!arena.definitions.some(d=>d.id===id)||!arena.assets.skills[id])throw Error(`Unknown load fixture: ${id}`);
  const player=id=>({id,name:`Load ${id}`,hp:100,gold:0,shopLevel:3,reserve:Array(4).fill(null),shop:Array(12).fill(null),locked:false,heroes:teams.map((skills,i)=>({id:`p${id}-h${i}`,name:`负载${i}`,role:'mage',skin:i%2?'male':'female',x:-8+i*4,y:-3,skills:skills.map(id=>({id,points:9}))}))});
  const battle=createBattle(player(0),player(1),971,arena.definitions,undefined,12);for(const u of battle.units){u.hp=u.maxHp=40000;u.mana=u.maxMana=4000;}
  let peakAlive=0,best;const started=performance.now();for(let i=0;i<360&&!battle.finished;i++){stepBattle(battle,1/30,arena.definitions);const alive=battle.units.filter(u=>!u.dead).length;if(alive>peakAlive){peakAlive=alive;best=structuredClone(battle);}}
  const milliseconds=performance.now()-started;for(const u of battle.units)if(![u.hp,u.mana,u.x,u.y,u.damage].every(Number.isFinite))throw Error('Nonfinite full-team state');
  const draw=arena.renderer.draw.bind(arena.renderer);arena.renderer.mode='spectate';arena.renderer.layout();arena.renderer.draw=(_a,_b,_c,_d,dt)=>draw([],[],best,0,dt);
  return{skillsPerTeam:20,points:9,simulatedSeconds:battle.time,simulationMs:Math.round(milliseconds),peakAlive,peakTime:best.time};
 });
 await page.waitForTimeout(1200);await page.screenshot({path:`artifacts/battle-load${mobile?'-mobile':''}.png`});const{renderer,contextLosses,webglContextLost}=await page.evaluate(()=>({renderer:window.arena.renderer.diagnostics(),contextLosses:window.qaContextLosses,webglContextLost:document.querySelector('#world').getContext('webgl2')?.isContextLost()??true}));assert(simulation.peakAlive>20,'未实际触发召唤密集战斗');assert.deepEqual(errors,[]);assert.deepEqual(renderer.loadErrors,[]);assert.equal(contextLosses,0,'发生WebGL上下文丢失');assert.equal(webglContextLost,false,'WebGL上下文不可用');assert(renderer.activeImageBytes<1024*1048576,'场景意外载入超过1GiB图集');
 reports.push({mobile,...simulation,renderer,errors,contextLosses,webglContextLost,webglWarnings});await page.close();
}await fs.writeFile('artifacts/battle-load-smoke.json',JSON.stringify({status:'passed',environment:'Windows headless Chromium; touch viewport emulation is not physical-phone FPS evidence',reports},null,2));console.log(reports.map(r=>({mobile:r.mobile,peakAlive:r.peakAlive,simulationMs:r.simulationMs,drawCalls:r.renderer.drawCalls,activeMiB:Math.round(r.renderer.activeImageBytes/1048576)})));
}finally{await browser.close();}
