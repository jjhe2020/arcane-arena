import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.ARENA_TEST_URL??'http://localhost:5173',output=process.env.ARENA_RENDER_OUTPUT??'artifacts/r6-c11-phantom-render';
const configurationHash=JSON.parse(await fs.readFile('public/data/config-report.json','utf8')).hash;
const scenarios=process.env.ARENA_RENDER_SCENARIOS?.split(',')??['phantasm-split','phantasm-images','phase-hidden','phase-ended','veil-transform','veil-form','ward-normal','ward-super'];
const fixtureNote='Actual compiled catalog createBattle/stepBattle, with observation hero HP/mana and zero movement/delayed ordinary attacks. PhaseShift caster begins below its documented arena AI threshold. No combat status, effect, summon or packet is injected. Screenshots prove rendered engine states and asset delivery, not source completeness or physical-device performance. Super wards have larger HP/damage and count; no undocumented model enlargement is asserted.';
const browser=await chromium.launch({headless:true}),reports=[];await fs.mkdir(output,{recursive:true});
try{
 for(const mobile of[false,true])for(const scenario of scenarios){
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1600,height:900},isMobile:mobile,hasTouch:mobile}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await page.waitForFunction(()=>window.arena?.renderer);
  await page.locator('[data-action=close]').last().click();if(mobile)await page.locator('.mobile-nav [data-action=cinema]').tap();
  const fixture=await page.evaluate(async scenario=>{
   const {createBattle,stepBattle}=await import('/src/combat.ts'),arena=window.arena;
   const id=scenario.startsWith('phantasm')?'custom_chaos_knight_phantasm':scenario.startsWith('phase')?'puck_phase_shift':scenario.startsWith('veil')?'muerta_pierce_the_veil':'custom_venomancer_plague_ward',points=scenario==='ward-normal'?3:6;
   const player=side=>({id:side,name:`QA${side}`,hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:[0,1].map(i=>({id:`h${side}-${i}`,name:`QA${side}-${i}`,role:'mage',skin:i?'male':'female',x:i?10:0,y:i?-10:-2,skills:side===0&&i===0?[{id,points}]:[]}))});
   const battle=createBattle(player(0),player(1),1111,arena.definitions),caster=battle.units[0],foes=battle.units.filter(u=>u.side===1);
   for(const unit of battle.units){unit.hp=unit.maxHp=100000;unit.mana=unit.maxMana=4000;unit.moveSpeed=0;unit.nextAttack=100;}
   caster.x=caster.y=0;caster.facing=0;foes.forEach((t,i)=>{t.x=6;t.y=i?3:0;});if(id==='puck_phase_shift')caster.hp=40000;
   const duration={'phantasm-split':.65,'phantasm-images':1.1,'phase-hidden':.4,'phase-ended':3.4,'veil-transform':.2,'veil-form':.6,'ward-normal':.1,'ward-super':.1}[scenario];stepBattle(battle,duration,arena.definitions);
   const images=battle.units.filter(t=>t.illusion&&t.sourceSkill===id&&!t.dead),wards=battle.units.filter(t=>t.ward&&t.sourceSkill===id&&!t.dead),hidden=['phantasm-split','phase-hidden'].includes(scenario),lock=caster.statuses.find(s=>s.kind==='actionLock'&&s.until>battle.time);
   if(!battle.events.some(e=>e.type==='cast'&&e.skill===id))throw Error(`No real cast:${scenario}`);
   if(scenario==='phantasm-split'&&(images.length||!caster.statuses.some(s=>s.kind==='visualForm'&&s.data?.hidden===true&&s.until>battle.time)))throw Error('Missing real hidden split');
   if(scenario==='phantasm-images'&&(images.length!==4||images.some(t=>!t.strongIllusion)))throw Error('Missing four strong Phantasm bodies');
   if(scenario==='phase-hidden'&&(caster.action!=='channel'||!caster.statuses.some(s=>s.kind==='visualForm'&&s.data?.hidden)))throw Error('No actual hidden Phase channel');
   if(scenario==='phase-ended'&&caster.statuses.some(s=>s.kind==='visualForm'&&s.data?.hidden&&s.until>battle.time))throw Error('Phase body failed to reappear');
   if(scenario==='veil-transform'&&(!lock||caster.statuses.some(s=>s.kind==='attackMagical')))throw Error('No actual action-locked pre-form');
   if(scenario==='veil-form'&&(!caster.statuses.some(s=>s.kind==='attackMagical')||!caster.statuses.some(s=>s.kind==='visualScale'&&s.value===1.3)))throw Error('No actual converted/scaled form');
   if(scenario.startsWith('ward')&&(wards.length!==(points===3?1:2)||wards.some(t=>t.nativeTemplateId!=='npc_dota_venomancer_plague_ward_1'||t.maxHp!==(points===3?450:1125))))throw Error('Wrong actual ward profile or final AA HP');
   const bodies=[caster,...images,...wards].map(t=>({id:t.id,x:t.x,y:t.y,hidden:t.id===caster.id&&hidden,scale:t.id===caster.id&&scenario==='veil-form'?1.3:1,ward:!!t.ward}));
   const draw=arena.renderer.draw.bind(arena.renderer);window.qaC11PhantomBattle=battle;arena.renderer.mode='spectate';arena.renderer.layout();arena.renderer.draw=(_a,_b,_c,_d,dt)=>draw([],[],window.qaC11PhantomBattle,0,dt);
   return{id,points,time:battle.time,configurationHash:arena.definitions.find(d=>d.id===id)?.configHash,bodies,snapshot:JSON.stringify(battle)};
  },scenario);
  await page.waitForFunction(f=>f.bodies.every(b=>{const v=window.arena.renderer.visuals.get(b.id);return v&&v.group.visible===!b.hidden&&(b.hidden||v.mesh.material.map?.image);}),fixture);
  const actual=await page.evaluate(f=>{const r=window.arena.renderer;return{diagnostics:r.diagnostics(),snapshot:JSON.stringify(window.qaC11PhantomBattle),bodies:f.bodies.map(b=>{const v=r.visuals.get(b.id);return{id:b.id,x:v.group.position.x,y:v.group.position.y,visible:v.group.visible,image:v.clip?.image,width:v.mesh.scale.x,clipSize:v.clip?.worldSize??3.6};})};},fixture);
  assert.equal(fixture.configurationHash,configurationHash);assert.equal(actual.snapshot,fixture.snapshot);assert.deepEqual(errors,[]);assert.deepEqual(actual.diagnostics.loadErrors,[]);
  fixture.bodies.forEach((b,i)=>{const a=actual.bodies[i];assert.equal(a.visible,!b.hidden);assert(Math.abs(a.x-b.x)<1e-6&&Math.abs(a.y-b.y)<1e-6);if(!b.hidden)assert(Math.abs(a.width-a.clipSize*b.scale)<1e-6,JSON.stringify({scenario,body:b,actual:a}));if(b.ward)assert(a.image.includes('/custom_venomancer_plague_ward/ward_idle.webp'),a.image);});
  await page.screenshot({path:`${output}/${scenario}${mobile?'-mobile':''}.png`});const{snapshot:_,...evidence}=fixture;delete actual.snapshot;reports.push({scenario,mobile,fixture:evidence,...actual,errors});await page.close();
 }
 await fs.writeFile(`${output}/report.json`,JSON.stringify({status:'passed',url,configurationHash,fixtureNote,reports},null,2)+'\n');console.log(JSON.stringify({status:'passed',scenarios:reports.map(r=>({scenario:r.scenario,mobile:r.mobile}))}));
}finally{await browser.close();}
