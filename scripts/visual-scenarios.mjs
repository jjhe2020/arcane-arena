import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});const reports=[];
await fs.mkdir('artifacts',{recursive:true});
try{
 for(const mobile of [false,true])for(const scenario of ['forms','projectiles','summons','barriers']){
  const p=await browser.newPage({viewport:mobile?{width:932,height:430}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile});const errors=[],webglWarnings=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning'&&/WebGL|GPU|GL_/i.test(m.text())&&webglWarnings.length<20)webglWarnings.push(m.text());});await p.addInitScript(()=>{window.qaContextLosses=0;document.addEventListener('webglcontextlost',()=>window.qaContextLosses++,true);});await p.routeWebSocket('**',()=>{});await p.goto(process.env.ARENA_TEST_URL??'http://localhost:5173');await p.waitForFunction(()=>window.arena?.state);await p.locator('[data-action=close]').last().click();
  await p.evaluate(async scenario=>{const{createBattle,stepBattle}=await import('/src/combat.ts');const a=window.arena;const ids=scenario==='forms'?['dragon_knight_elder_dragon_form','lycan_shapeshift','undying_flesh_golem','custom_pangolier_rolling_thunder']:scenario==='summons'?['custom_beastmaster_call_of_the_wild','custom_furion_force_of_nature','custom_lone_druid_spirit_bear','custom_warlock_chaotic_offering']:scenario==='barriers'?['custom_earthshaker_fissure','custom_tusk_ice_shards','custom_phoenix_sun_ray','custom_witch_doctor_death_ward']:['custom_vengefulspirit_magic_missile','custom_lina_dragon_slave','enigma_black_hole','custom_tusk_snowball'];
   const player=(id)=>({id,name:`P${id}`,hp:100,gold:0,shopLevel:3,reserve:[null,null,null,null],shop:Array(12).fill(null),locked:false,heroes:ids.map((skill,i)=>({id:`p${id}-h${i}`,name:`测试${i}`,role:'mage',skin:i%2?'male':'female',x:-6+i*4,y:-3,skills:id===0?[{id:skill,points:9},null,null,null]:[null,null,null,null]}))});
   if(ids.some(id=>!a.definitions.some(d=>d.id===id)||!a.assets.skills[id]))throw Error('Unknown visual fixture skill');const battle=createBattle(player(0),player(1),71,a.definitions,undefined,12);for(const u of battle.units){u.maxHp=12000;u.hp=12000;u.maxMana=4000;u.mana=4000;}
   const draw=a.renderer.draw.bind(a.renderer);a.renderer.mode='spectate';a.renderer.layout();a.renderer.draw=(heroes,enemy,ignored,side,dt)=>{if(!battle.finished)stepBattle(battle,dt,a.definitions);draw([],[],battle,0,dt);};window.visualBattle=battle;
  },scenario);
  await p.waitForTimeout(2200);await p.screenshot({path:`artifacts/visual-${scenario}${mobile?'-mobile':''}.png`});const diagnostic=await p.evaluate(()=>({renderer:window.arena.renderer.diagnostics(),time:window.visualBattle.time,units:window.visualBattle.units.length,events:window.visualBattle.events.length,contextLosses:window.qaContextLosses,webglContextLost:document.querySelector('#world').getContext('webgl2')?.isContextLost()??true}));
  if(errors.length||diagnostic.renderer.loadErrors.length||diagnostic.contextLosses||diagnostic.webglContextLost)throw Error(JSON.stringify({scenario,errors,diagnostic,webglWarnings}));
  if(scenario==='forms'){const images=diagnostic.renderer.unitBodies.filter(u=>u.visible).map(u=>u.image??'');for(const fragment of ['dragon_black','wolf_','flesh_golem_','ball.webp'])if(!images.some(i=>i.includes(fragment)))throw Error(`Missing rendered form ${fragment}`);}
  if(scenario==='barriers'){const keys=diagnostic.renderer.persistentEffectKeys;if(!keys.some(k=>k.startsWith('wall:'))||!keys.some(k=>k.startsWith('beam:')))throw Error('Missing actual wall or beam render');if(!diagnostic.renderer.unitBodies.some(u=>u.image?.includes('/egg_idle.webp')))throw Error('Missing independent Sun Ray egg');}
  if(mobile&&!diagnostic.renderer.unitBodies.filter(u=>u.visible).every(u=>u.image.includes('/art/mobile/')))throw Error('Phone loaded desktop body atlas');
  reports.push({scenario,mobile,...diagnostic,errors,webglWarnings});await p.close();
 }
 await fs.writeFile('artifacts/visual-scenarios.json',JSON.stringify({status:'passed',reports},null,2));console.log(reports.map(r=>({scenario:r.scenario,mobile:r.mobile,units:r.units,drawCalls:r.renderer.drawCalls,activeMiB:Math.round(r.renderer.activeImageBytes/1048576)})));
}finally{await browser.close();}

