import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.ARENA_TEST_URL??'http://localhost:5173',output=process.env.ARENA_RENDER_OUTPUT??'artifacts/r6-c10-render';
const configurationHash=JSON.parse(await fs.readFile('public/data/config-report.json','utf8')).hash;
const scenarios=process.env.ARENA_RENDER_SCENARIOS?.split(',')??['hook','mirror-split','mirror-images','kisses','toxin','toxin-field','treants','omni','multishot','spit'];
const fixtureNote='Actual development-module createBattle/stepBattle using the compiled catalog. Observation heroes have100000HP/4000mana,zero ordinary movement and delayed ordinary attacks. Freeze after real Hook pull, Mirror split/images, Kisses globe/pool, Toxin projectile/field, Treants or Omnislash. No injected combat statuses, packets, summons or visual effects. Render checks are distinct from original-mechanism certification, production smoke and physical-device performance.';
const browser=await chromium.launch({headless:true}),reports=[];
await fs.mkdir(output,{recursive:true});
try{
 for(const mobile of[false,true])for(const scenario of scenarios){
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1600,height:900},isMobile:mobile,hasTouch:mobile}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await page.waitForFunction(()=>window.arena?.renderer);
  await page.locator('[data-action=close]').last().click();if(mobile)await page.locator('.mobile-nav [data-action=cinema]').tap();
  const fixture=await page.evaluate(async scenario=>{
   const{createBattle,stepBattle}=await import('/src/combat.ts'),arena=window.arena,id={hook:'custom_pudge_meat_hook','mirror-split':'custom_naga_siren_mirror_image','mirror-images':'custom_naga_siren_mirror_image',kisses:'custom_snapfire_mortimer_kisses',toxin:'viper_nethertoxin','toxin-field':'viper_nethertoxin',treants:'custom_furion_force_of_nature',omni:'juggernaut_omni_slash',multishot:'custom_drow_ranger_multishot',spit:'custom_snapfire_mortimer_kisses'}[scenario];
   const player=side=>({id:side,name:`QA${side}`,hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:[0,1,2].map(i=>({id:`h${side}-${i}`,name:`QA${side}-${i}`,role:'mage',skin:i?'male':'female',x:i?10:0,y:i?-10:-2,skills:side===0&&i===0?[{id,points:9}]:[]}))});
   const battle=createBattle(player(0),player(1),1019,arena.definitions),caster=battle.units[0],foes=battle.units.filter(u=>u.side===1),target=foes[0];
   for(const unit of battle.units){unit.hp=unit.maxHp=100000;unit.mana=unit.maxMana=4000;unit.moveSpeed=0;unit.nextAttack=100;}
   caster.x=caster.y=0;caster.facing=0;target.x=scenario==='omni'?3:6;target.y=0;foes.slice(1).forEach((u,i)=>{u.x=scenario==='omni'?4:7;u.y=i?2:-2;});
   if(scenario==='spit'){caster.cooldowns[0]=99999;battle.units[1].x=1;battle.units[1].y=0;}
   const initialWarp=Number(target.warpSequence??0),time={hook:.8,'mirror-split':.7,'mirror-images':1.2,kisses:1.6,toxin:.4,'toxin-field':1.5,treants:.8,omni:1.2,multishot:.4,spit:1}[scenario];stepBattle(battle,time,arena.definitions);
   const images=battle.units.filter(u=>u.summoned&&u.sourceSkill===id&&!u.dead),projectiles=(battle.projectiles??[]).filter(p=>p.skill===id),moving=(battle.visualProjectiles??[]).filter(p=>p.skill===id&&p.until>battle.time),zones=(battle.zones??[]).filter(z=>z.skill===id&&z.until>battle.time),hits=battle.events.filter(e=>e.type==='hit'&&e.skill===id&&Number(e.amount)>0);
   const effects=[],bodyIds=scenario==='mirror-images'||scenario==='treants'?[caster.id,...images.map(u=>u.id)]:[caster.id,target.id],hiddenIds=scenario==='mirror-split'?[caster.id]:[];
   if(!battle.events.some(e=>e.type==='cast'&&e.skill===(scenario==='spit'?'aa_granted_spit_out':id)))throw Error(`No actual cast: ${scenario}`);
   if(scenario==='hook'){if(!hits.length||!(target.x>0&&target.x<6)||Number(target.warpSequence??0)!==initialWarp)throw Error('No genuine continuous pull');const linked=battle.units.filter(u=>u.statuses.some(s=>s.kind==='visualLink'&&s.skill===id&&s.until>battle.time));if(!linked.length)throw Error('No actual pull chain');for(const u of linked)effects.push({prefix:`link:${caster.id}:${u.id}:${id}`,image:`/${id}/chain_tile.webp`});}
   if(scenario==='mirror-split'&&(!caster.statuses.some(s=>s.kind==='visualForm'&&s.data?.hidden===true&&s.until>battle.time)||images.length))throw Error('No genuine hidden split phase');
   if(scenario==='mirror-images'&&(images.length!==4||caster.statuses.some(s=>s.kind==='visualForm'&&s.data?.hidden===true)))throw Error('No four actual completed images');
   if(scenario==='kisses'){if(!moving.length||!zones.length||!hits.length)throw Error('No real flying globe and impact pool');for(const p of moving)effects.push({prefix:`motion:${p.id}:`,image:`/${id}/projectile.webp`});for(const z of zones)effects.push({prefix:`z:${z.id}:`,image:`/${id}/burn.webp`});}
   if(scenario==='toxin'){if(!projectiles.length||zones.length)throw Error('Toxin did not travel before its field');for(const p of projectiles)effects.push({prefix:`p:${p.id}:`,image:`/${id}/projectile.webp`,x:p.x,y:p.y});}
   if(scenario==='toxin-field'){if(!zones.length||!hits.length||!target.statuses.some(s=>s.kind==='break'&&s.skill===id))throw Error('No actual damaging toxin field');for(const z of zones)effects.push({prefix:`z:${z.id}:`,image:`/${id}/pool.webp`,x:z.x,y:z.y});}
   if(scenario==='treants'&&(!images.length||images.some(u=>!u.nativeTemplateId||!u.sourceUnitType)))throw Error('No native Treant bodies');
   if(scenario==='omni'&&(!hits.length||!caster.statuses.some(s=>s.kind==='omnislash')||!Number(caster.warpSequence)))throw Error('No real Omnislash attack/movement');
   if(scenario==='multishot'){if(!projectiles.length)throw Error('No actual modifier-enabled swept arrows');for(const p of projectiles)effects.push({prefix:`p:${p.id}:`,image:`/${id}/arrow.webp`,x:p.x,y:p.y});}
   if(scenario==='spit'){const p=(battle.visualProjectiles??[]).find(p=>p.skill==='aa_granted_spit_out'&&p.until>battle.time),passenger=p&&battle.units.find(u=>u.id===p.followUnit);if(!passenger||!passenger.statuses.some(s=>s.kind==='visualForm'&&s.data?.passenger))throw Error('No actual flying carried body');bodyIds.push(passenger.id);hiddenIds.push(passenger.id);effects.push({prefix:`motion:${p.id}:`,image:`/${id}/projectile.webp`,x:passenger.x,y:passenger.y});}
   const bodies=bodyIds.map(id=>{const u=battle.units.find(u=>u.id===id);return{id,x:u.x,y:u.y,hidden:hiddenIds.includes(id),...(scenario==='treants'&&u.summoned?{image:`/${u.sourceSkill}/greater_`}:{})};});
   const draw=arena.renderer.draw.bind(arena.renderer);window.qaC10Battle=battle;arena.renderer.mode='spectate';arena.renderer.layout();arena.renderer.draw=(_a,_b,_c,_d,dt)=>draw([],[],window.qaC10Battle,0,dt);
   return{id,time:battle.time,configurationHash:arena.definitions.find(d=>d.id===id)?.configHash,effects,bodies,positiveHits:hits.length,snapshot:JSON.stringify(battle)};
  },scenario);
  await page.waitForFunction(f=>{const r=window.arena.renderer;return f.bodies.every(b=>{const v=r.visuals.get(b.id);return v&&v.group.visible!==b.hidden&&(b.hidden||v.mesh.material.map?.image);})&&f.effects.every(e=>[...r.persistentFx].some(([k,v])=>k.startsWith(e.prefix)&&v.clip?.image?.includes(e.image)&&v.mesh.material.map?.image));},fixture);
  const actual=await page.evaluate(f=>{const r=window.arena.renderer;return{diagnostics:r.diagnostics(),snapshot:JSON.stringify(window.qaC10Battle),bodies:f.bodies.map(b=>{const v=r.visuals.get(b.id);return{id:b.id,x:v.group.position.x,y:v.group.position.y,visible:v.group.visible,image:v.clip?.image};}),effects:f.effects.map(e=>{const[k,v]=[...r.persistentFx].find(([k,v])=>k.startsWith(e.prefix)&&v.clip?.image?.includes(e.image));return{key:k,x:v.group.position.x,y:v.group.position.y,image:v.clip?.image,opacity:v.mesh.material.opacity};})};},fixture);
  assert.equal(fixture.configurationHash,configurationHash);assert.equal(actual.snapshot,fixture.snapshot);assert.deepEqual(errors,[]);assert.deepEqual(actual.diagnostics.loadErrors,[]);
  fixture.bodies.forEach((b,i)=>{const a=actual.bodies[i];assert.equal(a.visible,!b.hidden);assert(Math.abs(a.x-b.x)<1e-6&&Math.abs(a.y-b.y)<1e-6);if(b.image)assert(a.image.includes(b.image),JSON.stringify({scenario,expected:b.image,actual:a.image}));});
  fixture.effects.forEach((e,i)=>{const a=actual.effects[i];assert(a.opacity>0&&a.image.includes(e.image));if(e.x!==undefined)assert(Math.abs(a.x-e.x)<1e-6&&Math.abs(a.y-e.y)<1e-6);});
  await page.screenshot({path:`${output}/${scenario}${mobile?'-mobile':''}.png`});const{snapshot:_,...evidence}=fixture;delete actual.snapshot;reports.push({scenario,mobile,fixture:evidence,...actual,errors});await page.close();
 }
 await fs.writeFile(`${output}/report.json`,JSON.stringify({status:'passed',url,configurationHash,fixtureNote,reports},null,2)+'\n');console.log(JSON.stringify({status:'passed',scenarios:reports.map(r=>({scenario:r.scenario,mobile:r.mobile,effects:r.effects.length}))}));
}finally{await browser.close();}
