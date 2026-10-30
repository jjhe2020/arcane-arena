import {BATTLE_CONFIG} from '../config';
import type {BattleState,CombatUnit} from '../model';
import {skillValue,type EffectContext,type EffectStatus,type SkillProgram} from '../skill-effects';
import {childValue} from './historical-children';
import {addVisualProjectile,moveVisualProjectile,removeVisualProjectile,type VisualProjectile} from './visual-state';

const LIFE_BREAK='custom_huskar_life_break',HOOK='custom_pudge_meat_hook',ARENA='mars_arena_of_blood',FISSURE='custom_earthshaker_fissure',BOOM='hoodwink_hunters_boomerang',SHARP='custom_hoodwink_sharpshooter',STEP=1/30;
interface Point {x:number;y:number}
interface FissureRidge {from:Point;to:Point;until:number;cells:Point[]}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const has=(c:EffectContext,t:CombatUnit,kind:string)=>t.statuses.some(s=>s.kind===kind&&s.until>c.battle.time);
const areaEnemy=(c:EffectContext,t:CombatUnit)=>!t.dead&&t.side!==c.caster.side&&!t.ward&&!t.building&&(c.canTarget?.(t,false)??(!has(c,t,'invulnerable')&&!has(c,t,'banished')))&&!has(c,t,'magicImmune');
const v=(c:EffectContext,key:string,fallback:number)=>c.definition.grantedOnly?childValue(c,key,fallback):skillValue(c,key,fallback);
function groundBoomerang(c:EffectContext,point:Point):void {
 const origin={x:c.caster.x,y:c.caster.y},destination={...point},seen=new Set<string>(),speed=v(c,'SPEED',900)/100,halfWidth=v(c,'SPREAD',400)/200;
 const curve=(from:Point,to:Point,sign:number)=>{const length=distance(from,to),dx=length?(to.x-from.x)/length:Math.cos(c.caster.facing),dy=length?(to.y-from.y)/length:Math.sin(c.caster.facing);return Array.from({length:97},(_,i)=>{const t=i/96,side=Math.sin(Math.PI*t)*halfWidth*sign;return{x:from.x+(to.x-from.x)*t-dy*side,y:from.y+(to.y-from.y)*t+dx*side};});};
 // The prior sinusoidal arc is retained as a disclosed geometry candidate.
 // Distance integration fixes the known ground speed without claiming that
 // this recovers the under-specified historical close-point triangle vertices.
 let path=curve(origin,destination,1),index=1,last={...origin},returning=false,done=false;
 const visual=addVisualProjectile(c.battle,{source:c.caster.id,skill:BOOM,artSkill:SHARP,points:c.visualPoints??9,layer:'boomerang',...origin,angle:Math.atan2(destination.y-origin.y,destination.x-origin.x),until:c.battle.time+STEP*2});
 const hitSegment=(from:Point,to:Point)=>{
  const dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy,radius=v(c,'RADIUS',150)/100;
  for(const target of c.battle.units.filter(t=>areaEnemy(c,t)&&!t.courier&&!seen.has(t.id))){const q=length?Math.max(0,Math.min(1,((target.x-from.x)*dx+(target.y-from.y)*dy)/length)):0;if(Math.hypot(target.x-from.x-q*dx,target.y-from.y-q*dy)>radius+1e-8)continue;
   seen.add(target.id);const duration=v(c,'MARK DURATION',7),data={instanceKey:c.skill.instanceId??c.attackInstanceKey??c.skill.id};c.status(target,'huntersMark',duration,0,{harmful:true,dispel:'basic',data});c.status(target,'slow',duration,v(c,'SLOW',20)/100,{harmful:true,dispel:'basic',data});c.status(target,'incomingSpellDamageAmp',duration,v(c,'SPELL AMP',20)/100,{harmful:true,dispel:'basic',data});c.damage(target,v(c,'DAMAGE',200),'magical');
  }
 };
 const tick=()=>{
  if(done)return;let budget=speed*STEP;
  while(budget>1e-9&&!done){
   if(index>=path.length){if(!returning){returning=true;path=curve(destination,{x:c.caster.x,y:c.caster.y},1);index=1;}else if(distance(last,c.caster)>1e-8){path=[last,{x:c.caster.x,y:c.caster.y}];index=1;}else{done=true;break;}}
   const next=path[index],gap=distance(last,next);if(gap<1e-10){index++;continue;}const moved=Math.min(budget,gap),at={x:last.x+(next.x-last.x)*moved/gap,y:last.y+(next.y-last.y)*moved/gap};hitSegment(last,at);last=at;budget-=moved;if(moved>=gap-1e-10)index++;
  }
  moveVisualProjectile(c.battle,visual,last,c.battle.time+STEP*2);if(done)removeVisualProjectile(c.battle,visual);else c.delay(STEP,tick);
 };c.delay(STEP,tick);
}
interface RedirectCohort {time:number;duplicates:Set<string>}
const cohorts=new WeakMap<BattleState,Map<string,RedirectCohort>>();
const liveBindings=(c:EffectContext)=>{
 const bind=(c.target.statuses as EffectStatus[]).find(s=>s.kind==='soulbind'&&s.until>c.battle.time);
 const ids=String(bind?.data?.group??bind?.data?.partnerId??'').split(',');
 return c.battle.units.filter(t=>ids.includes(t.id)&&t.id!==c.target.id&&!t.dead);
};
function presentedLeap(c:EffectContext):EffectContext {
 let visual:VisualProjectile|undefined;
 const finish=()=>{if(visual){removeVisualProjectile(c.battle,visual);visual=undefined;}};
 const watch=()=>{if(!visual)return;if(c.caster.dead||c.battle.time>=visual.until-1e-8){finish();return;}c.delay(STEP,watch);};
 return {...c,moveContinuous:(target,x,y,options)=>{
  const moved=c.moveContinuous(target,x,y,options);if(!moved||target.id!==c.caster.id)return moved;
  if(!visual){visual=addVisualProjectile(c.battle,{source:c.caster.id,skill:LIFE_BREAK,points:c.visualPoints??c.skill.points,layer:'leap',followUnit:c.caster.id,x:target.x,y:target.y,angle:c.caster.facing,until:c.battle.time+STEP*2});c.delay(STEP,watch);}
  else moveVisualProjectile(c.battle,visual,target,c.battle.time+STEP*2);
  return moved;
 },projectile:(target,speed,effect,origin,onMove,options)=>c.projectile(target,speed,hit=>{finish();effect(hit);},origin,onMove,{...options,onTargetLost:(position,reason)=>{finish();options?.onTargetLost?.(position,reason);},onDisjoint:position=>{finish();options?.onDisjoint?.(position);}})};
}

/** Finite corrections to previously audited callers; this is not a new ability family. */
export function applyGeometryOrderAcceptance(registry:Record<string,SkillProgram>):void {
 const boomerang=registry[BOOM],originalBoomerang=boomerang.cast!;
 boomerang.castOrderModes=['unit','point'];
 boomerang.unitTarget=c=>!c.castPosition;
 const originalBoomerangEligibility=boomerang.targetEligibility;
 boomerang.targetEligibility=(c,target)=>!!c.castPosition||(originalBoomerangEligibility?.(c,target)??true);
 boomerang.cast=c=>c.castPosition?groundBoomerang(c,c.castPosition):originalBoomerang(c);
 boomerang.implemented.push('A genuine point-order cast uses a frozen ground point and integrates900speed over its retained arc;unit-target homing keeps its original independent clock');
 boomerang.remaining.push('Close-point400triangle vertices are not specified by the recovered paragraph;the existing sinusoidal working geometry is not relabelled a native triangle');
 const fissure=registry[FISSURE];
 fissure.cast=c=>{
  const origin={x:c.caster.x,y:c.caster.y},aim=c.castPosition??c.target,angle=Math.atan2(aim.y-origin.y,aim.x-origin.x),dx=Math.cos(angle),dy=Math.sin(angle),length=skillValue(c,'FISSURE RANGE',1400)/100,step=skillValue(c,'CELL SPACING',56.25)/100,offset=skillValue(c,'CELL START OFFSET',56.25)/100,count=Math.max(1,Math.floor((length+1e-8)/step)),radius=skillValue(c,'CELL COLLISION RADIUS',24)/100,damageRadius=skillValue(c,'DAMAGE RADIUS',225)/100,duration=skillValue(c,'FISSURE DURATION',8);
  // Use the explicit edge-gap candidate24+24+8.25. The page's behind-edge
  // endpoint arithmetic is not reconciled by an invented extra endpoint cell.
  const cells=(from:Point,x:number,y:number)=>Array.from({length:count},(_,i)=>({x:from.x+x*(offset+i*step),y:from.y+y*(offset+i*step)}));
  const primary=cells(origin,dx,dy),victims=c.battle.units.filter(t=>areaEnemy(c,t)&&primary.some(p=>distance(t,p)<=damageRadius)).sort((a,b)=>(a.x-origin.x)*dx+(a.y-origin.y)*dy-((b.x-origin.x)*dx+(b.y-origin.y)*dy)||a.id.localeCompare(b.id));
  const groups:Point[][]=[primary];
  if(c.skill.points>=9&&victims[0]){
   const shift=skillValue(c,'SECONDARY CENTER OFFSET',80)/100,center={x:victims[0].x-dx*shift,y:victims[0].y-dy*shift},from={x:center.x+dy*length/2,y:center.y-dx*length/2},secondary=cells(from,-dy,dx);groups.push(secondary);
   for(const t of c.battle.units.filter(t=>areaEnemy(c,t)&&secondary.some(p=>distance(t,p)<=damageRadius)))if(!victims.includes(t))victims.push(t);
  }
  const ridges:FissureRidge[]=[];
  for(const points of groups){const group=`fissure:${Number(c.battle.nextBarrierId??0)+1}`,first=points[0],last=points.at(-1)!,heading=Math.atan2(last.y-first.y,last.x-first.x),visual={group,centerX:(first.x+last.x)/2,centerY:(first.y+last.y)/2,angle:heading};for(const point of points)c.barrier({from:point,to:point,width:radius*2,duration,blocks:'enemies',visual});ridges.push({from:first,to:last,cells:points,until:c.battle.time+duration});}
  c.caster.fissureSegments=[...((c.caster.fissureSegments??[])as FissureRidge[]).filter(r=>r.until>c.battle.time),...ridges];
  for(const target of victims){c.status(target,'stun',skillValue(c,'STUN DURATION'),0,{harmful:true,dispel:'strong'});c.damage(target,skillValue(c,'DAMAGE'),'magical',false);}
 };
 fissure.onBeforeAbilityEffect=c=>{
  if(c.skill.points<9||!c.executedAbility||c.executedAbility.cooldown<=0||!c.executedAbility.procsOnCast||has(c,c.caster,'break'))return;
  const ridges=((c.caster.fissureSegments??[])as FissureRidge[]).filter(r=>r.until>c.battle.time),cells=ridges.flatMap(r=>r.cells??[]),contact=skillValue(c,'CELL COLLISION RADIUS',24)/100+Number(BATTLE_CONFIG.bodyRadius);
  if(!cells.some(p=>distance(c.caster,p)<=contact+1e-8))return;
  for(const target of c.battle.units.filter(t=>areaEnemy(c,t)&&cells.some(p=>distance(t,p)<=skillValue(c,'AFTERSHOCK RADIUS',300)/100))){c.status(target,'stun',skillValue(c,'AFTERSHOCK STUN',.4),0,{harmful:true,dispel:'strong'});c.damage(target,skillValue(c,'AFTERSHOCK DAMAGE',150),'magical',false);}
 };
 fissure.implemented.push('Discrete24radius/56.25spacing Fissure cells;damage225circles de-duplicate victims;AAallies continue to pass');
 fissure.remaining=fissure.remaining.filter(text=>!text.startsWith('Continuous80-wide'));
 fissure.remaining.push('First56.25cell phase is a calculated edge-gap candidate;behind216.75arithmetic and initial push-aside need exact source/result reconciliation');

 const life=registry[LIFE_BREAK],originalLeap=life.cast!;
 life.cast=c=>{
  const identity=`${c.caster.id}:${c.skill.instanceId??c.attackInstanceKey??c.skill.id}`;
  let map=cohorts.get(c.battle);if(!map){map=new Map;cohorts.set(c.battle,map);}
  const previous=map.get(identity);
  // The real generic Soulbind dispatch still emits its redirected cast event.
  // Its immediate effect must not replace the primary's in-flight leap state.
  if(previous?.time===c.battle.time&&previous.duplicates.delete(c.target.id))return;
  const partners=liveBindings(c);if(!partners.length){originalLeap(presentedLeap(c));return;}
  const targets=[c.target,...partners];map.set(identity,{time:c.battle.time,duplicates:new Set(partners.map(t=>t.id))});
  const launch=(index:number)=>{
   const target=targets[index];if(!target||target.dead||c.caster.dead)return;
   let accepted=false;
   const stage:EffectContext={...c,target,
    trySpellBlock:t=>{accepted=true;return c.trySpellBlock?.(t)??false;},
    damage:(t,...args)=>{accepted=true;return c.damage(t,...args);},
    projectile:(body,speed,effect,origin,onMove,options)=>c.projectile(body,speed,hit=>{
     effect(hit);
     // A cancelled old projectile may still arrive. Only a genuinely accepted
     // impact/block proceeds to the next native leap, never a cancelled callback.
     if(accepted&&index+1<targets.length)launch(index+1);
    },origin,onMove,options)
   };
   originalLeap(presentedLeap(stage));
  };
  launch(0);
 };
 life.implemented.push('Actual Soulbind redirects no longer replace one another in the caster leap map;retainedGuide timing candidate starts the next linked-target native leap after an accepted impact');
 life.remaining.push('Sequential primary-then-secondary timing has a retainedGuide prototype;exact historical2023intermediate timings and AAthree-linked order remain qualified');

 const arena=registry[ARENA],originalArena=arena.cast!;
 arena.cast=c=>originalArena({...c,moveContinuous:(target:CombatUnit,x,y,options)=>{
  // Historical Arena explicitly allows horizontal travel through its wall,
  // while an actual qualified inner-edge spear can cancel that motion.
  // Keep this exception local to the verified Hook caller, not global priority.
  if(c.motionActive?.(target)?.skill===HOOK)c.cancelMotion?.(target);
  return c.moveContinuous(target,x,y,options);
 }});
 arena.implemented.push('A qualified Arena inner-edge knockback interrupts the foreign MeatHook controller before applying its own movement');
}
