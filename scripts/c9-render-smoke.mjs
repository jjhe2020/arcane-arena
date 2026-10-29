import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=process.env.ARENA_TEST_URL??'http://localhost:5173',output='artifacts/r6-c9-render';
const configurationHash=JSON.parse(await fs.readFile('public/data/config-report.json','utf8')).hash;
const fixtureNote='Actual development-module createBattle/stepBattle and compiled catalog. Observation heroes have100000HP/4000mana,zero ordinary movement and delayed ordinary attacks; genuine spawned bodies retain native configured HP/actions. Freeze after real Laser, Nimbus, Jingu soldier, Missile bounce or Life Drain links. No injected visual statuses, hits or summons. Cosmetic model-scale composition is not a native-stack formula certification.';
const browser=await chromium.launch({headless:true}),reports=[];await fs.mkdir(output,{recursive:true});
try{
 for(const mobile of[false,true])for(const scenario of['laser','nimbus','soldier','missile','drain']){
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1600,height:900},isMobile:mobile,hasTouch:mobile}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>window.arena?.renderer);await page.locator('[data-action=close]').last().click();if(mobile)await page.locator('.mobile-nav [data-action=cinema]').tap();
  const fixture=await page.evaluate(async scenario=>{
   const{createBattle,stepBattle,FIXED_STEP}=await import('/src/combat.ts');const arena=window.arena,id={laser:'custom_tinker_laser',nimbus:'zuus_lightning_bolt',soldier:'custom_monkey_king_jingu_mastery',missile:'custom_vengefulspirit_magic_missile',drain:'custom_pugna_life_drain'}[scenario];
   const player=side=>({id:side,name:`QA${side}`,hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:[0,1,2].map(i=>({id:`h${side}-${i}`,name:`QA${side}-${i}`,role:'mage',skin:i?'male':'female',x:i?10:0,y:i?-10:-2,skills:side===0&&i===0?[{id,points:9}]:[]}))});
   const battle=createBattle(player(0),player(1),949,arena.definitions),caster=battle.units[0],foes=battle.units.filter(u=>u.side===1),target=foes[0];
   for(const unit of battle.units.filter(u=>!u.summoned)){unit.hp=unit.maxHp=100000;unit.mana=unit.maxMana=4000;unit.moveSpeed=0;unit.nextAttack=100;}
   caster.x=caster.y=0;caster.facing=0;target.x=6;target.y=0;foes.slice(1).forEach((u,i)=>{u.x=7;u.y=i?2:-2;});
   if(scenario==='missile'){for(let i=0;i<150;i++){stepBattle(battle,FIXED_STEP,arena.definitions);if(battle.events.some(e=>e.type==='hit'&&e.skill===id&&Number(e.amount)>0)&&(battle.projectiles??[]).some(p=>p.skill===id))break;}}
   else stepBattle(battle,scenario==='laser'?.7:scenario==='soldier'?2.6:scenario==='drain'?2:1.5,arena.definitions);
   const spawned=scenario==='nimbus'?battle.units.find(u=>u.nativeTemplateId==='npc_dota_zeus_cloud'):scenario==='soldier'?battle.units.find(u=>u.extraJinguSoldier):undefined,body=spawned??target;
   const links=battle.units.flatMap(u=>u.statuses.filter(s=>s.kind==='visualLink'&&s.skill===id&&s.until>battle.time).map(s=>({source:s.source,target:u.id}))),projectiles=(battle.projectiles??[]).filter(p=>p.skill===id);
   if(scenario==='laser'&&(!target.statuses.some(s=>s.kind==='visualScale')||links.length!==2))throw Error('No real shrink and two successful beam links');
   if(scenario==='nimbus'&&(!spawned||spawned.dead||spawned.maxHp!==16||spawned.attackCapability!=='none'))throw Error('No actual native16HP Nimbus');
   if(scenario==='soldier'&&(!spawned||!spawned.skills.some(s=>s?.id===id)||!spawned.statuses.some(s=>s.kind==='minimumAttackInterval')))throw Error('No independent actual Jingu soldier');
   if(scenario==='missile'&&(!projectiles.length||!battle.events.some(e=>e.skill===id&&e.type==='hit'&&Number(e.amount)>0)))throw Error('No actual post-impact bounce projectile');
   if(scenario==='drain'&&(caster.action!=='channel'||links.length<2||!battle.events.some(e=>e.type==='hit'&&e.skill===id&&Number(e.amount)>0)))throw Error('No actual primary and secondary Drain channels');
   const effects=scenario==='laser'||scenario==='drain'?links.map(link=>({prefix:`link:${link.source}:${link.target}:${id}`,image:scenario==='laser'?'/custom_tinker_laser/beam.webp':'/custom_pugna_life_drain/link.webp'})):scenario==='missile'?projectiles.map(p=>({prefix:`p:${p.id}:`,image:'/custom_vengefulspirit_magic_missile/projectile.webp',x:p.x,y:p.y})):[];
   const scale=body.statuses.filter(s=>s.kind==='visualScale'&&s.until>battle.time).reduce((n,s)=>n*Number(s.value??1),1),expectedImage=scenario==='nimbus'?'/zuus_lightning_bolt/nimbus_':scenario==='soldier'?'/custom_monkey_king_jingu_mastery/soldier_':undefined;
   const draw=arena.renderer.draw.bind(arena.renderer);window.qaC9Battle=battle;arena.renderer.mode='spectate';arena.renderer.layout();arena.renderer.draw=(_a,_b,_c,_d,dt)=>draw([],[],window.qaC9Battle,0,dt);
   return{id,configurationHash:arena.definitions.find(d=>d.id===id)?.configHash,time:battle.time,body:body.id,bodyPosition:{x:body.x,y:body.y},scale,expectedImage,effects,snapshot:JSON.stringify(battle)};
  },scenario);
  await page.waitForFunction(f=>{const r=window.arena.renderer,b=r.visuals.get(f.body);return b?.mesh.visible&&b.mesh.material.map?.image&&f.effects.every(e=>[...r.persistentFx].some(([k,v])=>k.startsWith(e.prefix)&&v.clip?.image?.includes(e.image)&&v.mesh.material.map?.image));},fixture);
  const actual=await page.evaluate(f=>{const r=window.arena.renderer,b=r.visuals.get(f.body);return{diagnostics:r.diagnostics(),body:{image:b.clip?.image,x:b.group.position.x,y:b.group.position.y,width:b.mesh.scale.x,clipSize:b.clip?.worldSize??3.6},snapshot:JSON.stringify(window.qaC9Battle),effects:f.effects.map(e=>{const[k,v]=[...r.persistentFx].find(([k,v])=>k.startsWith(e.prefix)&&v.clip?.image?.includes(e.image));return{key:k,x:v.group.position.x,y:v.group.position.y,image:v.clip?.image,opacity:v.mesh.material.opacity};})};},fixture);
  assert.equal(actual.snapshot,fixture.snapshot);assert.equal(fixture.configurationHash,configurationHash);assert.deepEqual(errors,[]);assert.deepEqual(actual.diagnostics.loadErrors,[]);
  assert(Math.abs(actual.body.x-fixture.bodyPosition.x)<1e-6&&Math.abs(actual.body.y-fixture.bodyPosition.y)<1e-6);assert(Math.abs(actual.body.width-actual.body.clipSize*fixture.scale)<1e-6);
  if(fixture.expectedImage)assert(actual.body.image?.includes(fixture.expectedImage));fixture.effects.forEach((e,i)=>{const a=actual.effects[i];assert(a.image&&a.opacity>0);if(e.x!==undefined)assert(Math.abs(a.x-e.x)<1e-6&&Math.abs(a.y-e.y)<1e-6);});
  await page.screenshot({path:`${output}/${scenario}${mobile?'-mobile':''}.png`});const{snapshot:_,...evidence}=fixture;delete actual.snapshot;reports.push({scenario,mobile,fixture:evidence,...actual,errors});await page.close();
 }
 await fs.writeFile(`${output}/report.json`,JSON.stringify({status:'passed',url,configurationHash,fixtureNote,reports},null,2)+'\n');console.log(JSON.stringify({status:'passed',scenarios:reports.map(r=>({scenario:r.scenario,mobile:r.mobile,effects:r.effects.length}))}));
}finally{await browser.close();}
