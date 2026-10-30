import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.ARENA_TEST_URL??'http://localhost:5173',output=process.env.ARENA_RENDER_OUTPUT??'artifacts/r6-c14-control-render';
const configurationHash=JSON.parse(await fs.readFile('public/data/config-report.json','utf8')).hash;
const scenarios=process.env.ARENA_RENDER_SCENARIOS?.split(',')??['steal-return','steal-memory','sunder-exchange','sunder-dagon','vacuum-pull','vacuum-replica','sharp-aim','sharp-bolt','boomerang-flight','realm-before','realm-inside','realm-shot'];
const fixtureNote='Actual compiled createBattle/stepBattle on desktop/mobile. HP/mana100000/10000, zero ordinary movement, ordinary attacks delayed,100attack, zero armor/MR, starting positions and AI cooldown gates are explicit observation fixtures. No status/damage/effect/program/summon injection. Real spells earn every modifier, stolen slot, projectile and replica. Snapshot equality includes the battle/RNG state. Finite loaded-clip evidence does not certify whole native abilities or physical-device performance.';
const browser=await chromium.launch({headless:true}),reports=[];await fs.mkdir(output,{recursive:true});
try{
 for(const mobile of[false,true])for(const scenario of scenarios){
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1600,height:900},isMobile:mobile,hasTouch:mobile}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(url);await page.waitForFunction(()=>window.arena?.renderer);await page.locator('[data-action=close]').last().click();if(mobile)await page.locator('.mobile-nav [data-action=cinema]').tap();
   const fixture=await page.evaluate(async scenario=>{
    const {createBattle,stepBattle}=await import('/src/combat.ts'),{statusVisuals,worldVisuals,eventVisuals,movingVisuals,resolveVisualArt}=await import('/src/visual-bindings.ts'),{linePresentations,bodyPresentation,bodyVisibility}=await import('/src/animation.ts'),{selectVisualLayers}=await import('/src/visual-layers.ts'),arena=window.arena,assets=arena.renderer.assets;
    const ST='custom_rubick_spell_steal',SU='terrorblade_sunder',VA='dark_seer_vacuum',SH='custom_hoodwink_sharpshooter',SR='custom_dark_willow_shadow_realm',OP='ursa_overpower',BOOM='hoodwink_hunters_boomerang',PUNCH='dark_seer_normal_punch',DAGON='aa_granted_sunder_dagon';
    const id=scenario.startsWith('steal')?ST:scenario.startsWith('sunder')?SU:scenario.startsWith('vacuum')?VA:scenario.startsWith('realm')?SR:SH,points=['sunder-dagon','vacuum-replica','sharp-bolt','boomerang-flight'].includes(scenario)?9:3;
    const player=side=>({id:side,name:`QA${side}`,hp:100,gold:0,shopLevel:5,locked:false,reserve:[],shop:[],heroes:Array.from({length:side===1&&scenario==='vacuum-pull'?2:1},(_,i)=>({id:`h${side}-${i}`,name:`QA${side}-${i}`,role:'mage',skin:side?'male':'female',x:i,y:-2,skills:side===0?[{id,points}]:id===ST?[{id:OP,points:3}]:[]}))});
    const battle=createBattle(player(0),player(1),1414,arena.definitions),caster=battle.units[0],targets=battle.units.filter(u=>u.side===1),target=targets[0];
    for(const u of battle.units){u.hp=u.maxHp=100000;u.mana=u.maxMana=10000;u.moveSpeed=0;u.nextAttack=99999;u.armor=u.magicResist=0;u.attack=u.attackMin=u.attackMax=100;}
    caster.x=caster.y=0;caster.facing=0;targets.forEach((u,i)=>{u.x=i?5.5:scenario==='sharp-bolt'?12:4;u.y=i?1:0;u.facing=Math.PI;});caster.cooldowns.fill(99999,1);
    const step=s=>stepBattle(battle,s,arena.definitions),live=(u,kind,skill=id)=>u.statuses.filter(s=>s.kind===kind&&s.skill===skill&&s.until>battle.time),hits=(skill=id)=>battle.events.filter(e=>e.type==='hit'&&e.skill===skill&&Number(e.amount)>0);
    const release=(skill=id,actor=caster)=>{const from=battle.events.length;for(let i=0;i<300;i++){step(1/30);const e=battle.events.slice(from).find(e=>e.type==='cast'&&e.skill===skill&&e.source===actor.id);if(e){actor.cooldowns.fill(99999);return e;}}throw Error('Missing actual release '+skill);};
    if(id===ST){caster.cooldowns[0]=99999;release(OP,target);caster.cooldowns[0]=0;caster.castUntil=battle.time;}
    if(id===SU){caster.hp=20000;target.hp=90000;}
    const releaseEvent=release();
    if(scenario==='steal-return')step(.1);
    if(scenario==='steal-memory')step(.45);
    if(scenario.startsWith('sunder'))step(.1);
    if(scenario==='vacuum-pull')step(.15);
    if(scenario==='vacuum-replica')step(.95);
    if(scenario==='sharp-aim')step(.7);
    if(scenario==='sharp-bolt')step(5.08);
    if(scenario==='boomerang-flight'){caster.cooldowns[caster.skills.findIndex(s=>s?.id===BOOM)]=0;caster.castUntil=battle.time;release(BOOM);step(.2);}
    if(scenario==='realm-before')step(.1);
    if(scenario==='realm-inside')step(.65);
    if(scenario==='realm-shot'){step(.9);caster.attackPoint=.1;caster.projectileSpeed=2;caster.nextAttack=0;for(let i=0;i<90&&!battle.events.some(e=>e.status==='attackPoint'&&e.source===caster.id);i++)step(1/30);caster.nextAttack=99999;step(.1);}
    const statuses=statusVisuals(assets,battle.units,battle.time),world=worldVisuals(assets,battle,battle.time),moving=movingVisuals(assets,battle,battle.time),links=linePresentations(assets,battle.units,battle.time),events=battle.events.flatMap(e=>eventVisuals(assets,e,battle.units).map(v=>({...v,eventTime:e.time}))),projectiles=[];
    for(const p of battle.projectiles??[]){const source=battle.units.find(u=>u.id===p.source),resolved=resolveVisualArt(assets,p,source?.skills.find(s=>s?.id===p.skill)?.points??1);if(!resolved)continue;for(const layer of selectVisualLayers(resolved.art,resolved.points,'projectile',p.visualLayer?[p.visualLayer]:undefined).slice(0,p.skill==='basic_attack'?1:2))projectiles.push({key:`p:${p.id}:${p.skill==='basic_attack'?'basic':layer.id}`,clip:layer.clip,x:p.x,y:p.y});}
    const pools={status:statuses,world,moving,link:links,transient:events,projectile:projectiles},checks=[],absent=[],mechanics={releaseTime:releaseEvent.time,time:battle.time,hits:hits().map(e=>({skill:e.skill,time:e.time,amount:e.amount,category:e.category}))};
    const add=(kind,art,layer,position)=>{const image=`/${art}/${layer}.webp`,matches=pools[kind].filter(v=>v.clip.image.includes(image)),binding=position?matches.find(v=>Math.hypot(v.x-position.x,v.y-position.y)<1e-6):matches[0];checks.push({kind,art,layer,image,resourceAvailable:!!assets.skills[art]?.layers?.[layer],...(binding?{projectedKey:binding.key,x:binding.x,y:binding.y}:{})});};
    const forbid=(kind,art,layer)=>{const image=`/${art}/${layer}.webp`;if(pools[kind].some(v=>v.clip.image.includes(image)))throw Error('Actual state projected forbidden clip '+image);absent.push({kind,image});};
    if(scenario==='steal-return'){if(caster.stolenAbilities?.length||!(battle.projectiles??[]).some(p=>p.skill===ST))throw Error('Acquired before real returning projectile arrived');add('projectile',ST,'steal');}
    if(scenario==='steal-memory'){if(caster.stolenAbilities?.length!==1||!caster.skills.some(s=>s?.id===OP))throw Error('No actual acquired Overpower');add('status',ST,'memory',caster);add('world',ST,'learn',caster);mechanics.borrowed=OP;}
    if(scenario.startsWith('sunder')){if(caster.hp!==90000||target.hp!==(points===9?24200:25000)||caster.healing!==0)throw Error('Actual nonlethal exchange missing');add('link',SU,'exchange');add('world',SU,'receive',caster);if(points===9){if(hits(DAGON)[0]?.amount!==800)throw Error('Free real Dagon5missing');add('link',SU,'dagon');mechanics.dagonDamage=800;}mechanics.health={caster:caster.hp,target:target.hp};}
    if(scenario==='vacuum-pull'){if(!live(targets[1],'vacuum').length||targets[1].x>=5.5||hits().length)throw Error('Not an actual continuous pre-damage pull');add('world',VA,'inward');mechanics.collateral={x:targets[1].x,y:targets[1].y,warpSequence:targets[1].warpSequence};}
    if(scenario==='vacuum-replica'){const images=battle.units.filter(u=>u.illusion);if(images.length!==1||caster.warpSequence!==1||!hits(PUNCH).length)throw Error('No actual Gaben sourcewarp/Punch/replica');add('world',VA,'replica_enter',images[0]);mechanics.images=images.map(u=>({id:u.id,x:u.x,y:u.y,attack:u.attack,taken:u.damageTakenMultiplier}));}
    if(scenario==='sharp-aim'){if(!live(caster,'motionRoot').length||caster.action==='channel')throw Error('Missing actual non-channel aim');add('world',SH,'charge',caster);}
    if(scenario==='sharp-bolt'){if(!(battle.projectiles??[]).some(p=>p.skill===SH)||live(caster,'motionRoot').length)throw Error('No real released linear bolt');add('projectile',SH,'bolt');forbid('projectile',SH,'boomerang');forbid('world',SH,'charge');}
    if(scenario==='boomerang-flight'){if(!battle.events.some(e=>e.type==='cast'&&e.skill===BOOM))throw Error('Native child did not really cast');add('moving',SH,'boomerang');mechanics.child=BOOM;}
    if(scenario==='realm-before'){if(live(caster,'shadowRealm').length)throw Error('Realm granted before.3delay');forbid('status',SR,'realm');}
    if(scenario==='realm-inside'){if(!live(caster,'shadowRealm').length||Math.abs(live(caster,'shadowRealm')[0].until-releaseEvent.time-5.3)>1e-6)throw Error('Not actual delayed Realm');add('status',SR,'realm',caster);mechanics.untargetable=true;}
    if(scenario==='realm-shot'){const projectile=(battle.projectiles??[]).find(p=>p.skill==='basic_attack'&&p.source===caster.id);if(!projectile||projectile.visualSkill!==SR||live(caster,'shadowRealm').length)throw Error('No launch-frozen charged projectile after actual Realm consumption');add('projectile',SR,'charged');forbid('status',SR,'realm');mechanics.attackStatisticsSkill=projectile.skill;}
    const hidden=u=>bodyPresentation(assets,u,u.action,battle.time).hidden||bodyVisibility(u,0,battle.time).hidden,bodies=battle.units.map(u=>({id:u.id,x:u.x,y:u.y,dead:u.dead,hidden:hidden(u)})),draw=arena.renderer.draw.bind(arena.renderer);window.qaC14ControlBattle=battle;arena.renderer.mode='spectate';arena.renderer.layout();arena.renderer.draw=(_a,_b,_c,_d,dt)=>draw([],[],window.qaC14ControlBattle,0,dt);
    return{id,points,time:battle.time,configurationHash:arena.definitions.find(d=>d.id===id)?.configHash,bodies,checks,absent,mechanics,snapshot:JSON.stringify(battle)};
   },scenario);
   await page.waitForFunction(f=>{const r=window.arena.renderer;return f.bodies.filter(b=>!b.dead).every(b=>{const v=r.visuals.get(b.id);return v&&v.group.visible===!b.hidden&&(b.hidden||v.mesh.material.map?.image);})&&f.checks.filter(c=>c.projectedKey).every(c=>c.kind==='transient'?r.fx.some(v=>v.key===c.projectedKey&&v.visual.mesh.material.map?.image):r.persistentFx.get(c.projectedKey)?.mesh.material.map?.image);},fixture);
   const actual=await page.evaluate(f=>{const r=window.arena.renderer,persistent=[...r.persistentFx].map(([key,v])=>({key,image:v.clip?.image,x:v.group.position.x,y:v.group.position.y,opacity:v.mesh.material.opacity})),transient=r.fx.map(v=>({key:v.key,image:v.visual.clip?.image,x:v.visual.group.position.x,y:v.visual.group.position.y,opacity:v.visual.mesh.material.opacity}));return{snapshot:JSON.stringify(window.qaC14ControlBattle),diagnostics:r.diagnostics(),checks:f.checks.map(c=>({...c,actual:(c.kind==='transient'?transient:persistent).filter(v=>v.key===c.projectedKey)})),absent:f.absent.map(c=>({...c,actual:(c.kind==='transient'?transient:persistent).filter(v=>v.image?.includes(c.image))})),bodies:f.bodies.filter(b=>!b.dead).map(b=>{const v=r.visuals.get(b.id);return{id:b.id,x:v.group.position.x,y:v.group.position.y,visible:v.group.visible,image:v.clip?.image};})};},fixture);
   assert.equal(fixture.configurationHash,configurationHash);assert.equal(actual.snapshot,fixture.snapshot);assert.deepEqual(errors,[]);assert.deepEqual(actual.diagnostics.loadErrors,[]);
   for(const body of actual.bodies){const expected=fixture.bodies.find(b=>b.id===body.id);assert.equal(body.visible,!expected.hidden);assert(Math.hypot(body.x-expected.x,body.y-expected.y)<1e-6);}
   for(const forbidden of actual.absent)assert.deepEqual(forbidden.actual,[],'Renderer kept forbidden clip '+forbidden.image);
   const missing=actual.checks.filter(c=>!c.resourceAvailable||!c.actual.some(v=>v.image?.includes(c.image)&&v.opacity>0&&Math.hypot(v.x-c.x,v.y-c.y)<1e-6)).map(c=>({kind:c.kind,art:c.art,layer:c.layer,expected:{image:c.image,x:c.x,y:c.y},reason:!c.resourceAvailable?'no_delivered_resource':!c.projectedKey?'active_state_has_no_binding':'renderer_uses_other_or_no_clip',actual:c.actual}));
   await page.screenshot({path:`${output}/${scenario}${mobile?'-mobile':''}.png`});const{snapshot:_,...evidence}=fixture;delete actual.snapshot;reports.push({scenario,mobile,status:missing.length?'needs_visual_fixes':'passed',fixture:evidence,...actual,missing,errors});
  }catch(error){reports.push({scenario,mobile,status:'fixture_or_render_error',error:String(error),errors});}finally{await page.close();}
 }
 const status=reports.every(r=>r.status==='passed')?'passed':'needs_visual_fixes',missing=reports.flatMap(r=>(r.missing??[]).map(m=>({scenario:r.scenario,mobile:r.mobile,...m})));
 await fs.writeFile(`${output}/report.json`,JSON.stringify({status,url,configurationHash,fixtureNote,boundaries:['Source/version gaps remain in control-target acceptance; finite render checks do not close them.','Private manual aim indicator/ground-target Boomerang remain explicit missing features, not substituted by a generic line.','Invisible/FoW is not assigned to visible-but-untargetable Realm bodies.'],reports,missing},null,2)+'\n');console.log(JSON.stringify({status,scenarios:reports.map(r=>({scenario:r.scenario,mobile:r.mobile,status:r.status,missing:r.missing?.map(m=>m.layer),error:r.error})),missing:missing.length}));if(status!=='passed')process.exitCode=1;
}finally{await browser.close();}
