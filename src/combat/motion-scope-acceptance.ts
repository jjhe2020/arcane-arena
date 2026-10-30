import {BATTLE_CONFIG,UNIT_CONFIG,skillBalance} from '../config';
import type {BattleState,CombatUnit,SkillDefinition} from '../model';
import {skillValue,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {childValue} from './historical-children';
import {turnTowards} from './movement';
import {addVisualProjectile,addVisualWorldEffect,moveVisualProjectile,removeVisualProjectile} from './visual-state';

const SHOCK='custom_magnataur_shockwave',STAMP='centaur_stampede',RAY='custom_phoenix_sun_ray',TOSS='custom_tiny_toss',TRAMPLE='primal_beast_trample',STOP='phoenix_sun_ray_stop',TOGGLE='phoenix_sun_ray_toggle_move',NOVA='aa_granted_sun_ray_supernova',BLINK='queenofpain_blink',SUN='npc_dota_phoenix_sun',STEP=1/30,EPS=1e-8;
const S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9,v=(c:C,k:string,f=0)=>c.definition.grantedOnly?childValue(c,k,f):skillValue(c,k,f),own=(c:C)=>c.skill.instanceId??c.attackInstanceKey??c.skill.id,dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y),statuses=(u:CombatUnit)=>u.statuses as EffectStatus[],has=(c:C,u:CombatUnit,k:string)=>statuses(u).some(s=>s.kind===k&&s.until>c.battle.time+EPS),hidden=(c:C,u:CombatUnit)=>u.hiddenSpellBody||has(c,u,'hidden')||has(c,u,'banished')||statuses(u).some(s=>s.kind==='visualForm'&&s.until>c.battle.time&&s.data?.hidden===true),enemy=(c:C,u:CombatUnit)=>!u.dead&&u.side!==c.caster.side&&!u.ward&&!u.building&&!u.courier&&!hidden(c,u)&&!has(c,u,'invulnerable')&&!has(c,u,'magicImmune');
const native=(id:string,parent:string,name:string,nameEn:string,max:number,values:string[],cd:number[],mana:number[],point:number,back:number,range:number,sourceId=id):SkillDefinition=>({id,name,nameEn,description:'历史原生附属效果的独立等级；父技能免费触发不重复扣费，保留父来源归因。',descriptionEn:'Independent historical native child rank;free parent effect retains provenance.',icon:`/art/icons/${parent}.webp`,tags:[],categories:['ABILITY: No Target'],values,cooldowns:cd,mana,super:'',gaben:'',passive:false,ultimate:false,grantedOnly:true,balanceDomain:'native',sourceMaximumLevel:max,visualParentId:parent,historicalSource:{id:sourceId,maxLevel:max,date:'2023-02-10'},referencePublic:{castPoint:point,backswing:back,range}});
export const MOTION_SCOPE_CHILD_DEFINITIONS:SkillDefinition[]=[
 native(STOP,RAY,'停止烈日炙烤','Stop Sun Ray',4,[],[0],[0],0,0,0),
 native(TOGGLE,RAY,'切换炙烤移动','Toggle Movement',1,['MOVE SPEED: 250'],[0],[0],0,0,0),
 {...native(NOVA,RAY,'超新星（炙烤授予）','Supernova',3,['DURATION: 6','RADIUS: 1200','DAMAGE PER SECOND: 60 / 90 / 120','HERO ATTACKS TO DESTROY: 6 / 8 / 10','STUN DURATION: 2 / 2.5 / 3','AURA LINGER: 0.5','DAMAGE INTERVAL: 1'],[120],[150,200,250],.01,.5,0,'phoenix_supernova'),ultimate:true,categories:['ABILITY: No Target','DAMAGE TYPE: Magical']},
 {...native(BLINK,TOSS,'闪烁（投掷授予）','Blink',4,['MIN BLINK RANGE: 200'],[12,10,8,6],[60],.33,.53,13),categories:['ABILITY: Point Target']}
];

const sequences=new WeakMap<BattleState,number>();
function key(c:C){const n=(sequences.get(c.battle)??0)+1;sequences.set(c.battle,n);return`${c.caster.id}:${own(c)}:${n}`;}
function clear(u:CombatUnit,run:string){u.statuses=statuses(u).filter(s=>s.data?.motionScopeRun!==run);}
function direction(a:{x:number;y:number},b:{x:number;y:number},fallback=0){const length=dist(a,b);return length?{x:(b.x-a.x)/length,y:(b.y-a.y)/length}:{x:Math.cos(fallback),y:Math.sin(fallback)};}
function inRay(t:{x:number;y:number},a:{x:number;y:number},angle:number,length:number,radius:number){const dx=t.x-a.x,dy=t.y-a.y,along=dx*Math.cos(angle)+dy*Math.sin(angle),across=Math.abs(dx*Math.sin(angle)-dy*Math.cos(angle));return along>=0&&along<=length&&across<=radius;}
interface PullRun{c:C;target:CombatUnit;run:string;identity?:{expectedOwner:string;expectedStartedAt:number};done:boolean}
const pullRuns=new WeakMap<BattleState,Map<string,PullRun>>();
function finishPull(run:PullRun){if(run.done)return;run.done=true;clear(run.target,run.run);const m=run.c.motionActive?.(run.target);if(m&&run.identity&&m.owner===run.identity.expectedOwner&&Math.abs(m.startedAt-run.identity.expectedStartedAt)<EPS)run.c.cancelMotion?.(run.target);}
function pull(c:C,t:CombatUnit,to:{x:number;y:number},seconds:number,horn=false){
 const run:PullRun={c,target:t,run:key(c),done:false},data={instanceKey:run.run,motionScopeRun:run.run};let map=pullRuns.get(c.battle);if(!map){map=new Map;pullRuns.set(c.battle,map);}map.set(run.run,run);
 const marker=horn?'hornToss':'shockPull',time=seconds+STEP;
 c.status(t,marker,time,0,{harmful:true,dispel:horn?'none':'basic',removeOnDeath:true,data});
 if(!statuses(t).some(s=>s.kind===marker&&s.data?.motionScopeRun===run.run))return;
 c.status(t,'phased',time,0,{dispel:'none',removeOnDeath:true,data});
 if(horn){c.interrupt?.(t);c.status(t,'motionRoot',time,0,{dispel:'none',data});c.status(t,'disarm',time,0,{harmful:true,dispel:'none',data});c.status(t,'slow',time,1,{harmful:true,dispel:'none',data});}
 const moved=c.moveContinuous(t,to.x,to.y,{duration:time,lockActions:false,ignoreTerrainBarriers:true,onEnd:()=>finishPull(run)}),motion=c.motionActive?.(t);
 if(moved&&motion)run.identity={expectedOwner:motion.owner,expectedStartedAt:motion.startedAt};else finishPull(run);
}
interface RayRun{c:C;emitter:CombatUnit;run:string;started:number;until:number;moving:boolean;moveSpeed:number;done:boolean;parentOwned:boolean;options:{baseDamage:number;baseHeal:number;damagePct:number;healPct:number;radius:number;distance:number;interval:number;healthCost:number;turn:number}}
const rays=new WeakMap<BattleState,Map<string,RayRun>>();
function rayMap(c:C){let map=rays.get(c.battle);if(!map){map=new Map;rays.set(c.battle,map);}return map;}
function finishRay(run:RayRun){if(run.done)return;run.done=true;clear(run.emitter,run.run);addVisualWorldEffect(run.c.battle,{source:run.c.caster.id,skill:run.c.skill.id,artSkill:RAY,points:run.c.visualPoints??run.c.skill.points,layer:'beam_end',kind:'proc',x:run.emitter.x,y:run.emitter.y,until:run.c.battle.time+12/24});const map=rays.get(run.c.battle);if(map?.get(run.emitter.id)===run)map.delete(run.emitter.id);}
const disabledRay=(c:C,u:CombatUnit)=>['stun','selfStun','silence','cyclone','fear','hex','sleep'].some(k=>has(c,u,k));
function startRay(c:C,emitter=c.caster,parentOwned=true){
 const prior=rayMap(c).get(emitter.id);if(prior)finishRay(prior);
 const duration=v(c,'MAX DURATION',6),run:RayRun={c,emitter,run:key(c),started:c.battle.time,until:c.battle.time+duration,moving:false,moveSpeed:2.5,done:false,parentOwned,options:{baseDamage:v(c,'BASE DAMAGE'),baseHeal:v(c,'BASE HEAL'),damagePct:v(c,'MAX HEALTH DAMAGE')/100,healPct:v(c,'MAX HEALTH HEAL')/100,radius:v(c,'RAY RADIUS',130)/100,distance:v(c,'RAY DISTANCE',1150)/100,interval:v(c,'TICK INTERVAL',.2),healthCost:v(c,'HEALTH COST PER SECOND',6)/100,turn:v(c,'TURN RATE',25)*Math.PI/180}};
 rayMap(c).set(emitter.id,run);
 const data={instanceKey:run.run,motionScopeRun:run.run},time=duration+STEP;
 c.status(emitter,'sunRay',time,0,{dispel:'none',removeOnDeath:true,data});c.status(emitter,'disarm',time,0,{dispel:'none',removeOnDeath:true,data});
 if(parentOwned){c.status(emitter,'forceMoveSpeed',time,0,{dispel:'none',removeOnDeath:true,data:{...data,priority:100}});c.status(emitter,'motionRoot',time,0,{dispel:'none',removeOnDeath:true,data});c.status(emitter,'castWithoutTurning',time,0,{dispel:'none',removeOnDeath:true,data});c.status(emitter,'turnRateOverride',time,run.options.turn,{dispel:'none',removeOnDeath:true,data});}
 const visual=()=>c.status(emitter,'visualBeam',STEP*2,0,{dispel:'none',data:{...data,layer:'beam',aimX:Math.cos(emitter.facing),aimY:Math.sin(emitter.facing),length:run.options.distance,widthMultiplier:run.options.radius/1.3}});
 addVisualWorldEffect(c.battle,{source:c.caster.id,skill:c.skill.id,artSkill:RAY,points:c.visualPoints??c.skill.points,layer:'beam_start',kind:'proc',followUnit:emitter.id,x:emitter.x,y:emitter.y,until:c.battle.time+12/24});visual();let pulse=0;
 const tick=()=>{
  if(run.done)return;
  if(emitter.dead||parentOwned&&(!c.caster.skills.some(s=>s===c.skill)||disabledRay(c,emitter))){finishRay(run);return;}
  const elapsed=c.battle.time-run.started;
  if(elapsed>duration+EPS){finishRay(run);return;}
  const taunted=['taunt','duel','berserk'].some(k=>has(c,emitter,k));
  if(!taunted){const target=c.enemies().filter(t=>!t.ancient&&!t.courier).sort((a,b)=>dist(a,emitter)-dist(b,emitter)||a.id.localeCompare(b.id))[0];if(target)turnTowards(emitter,target,STEP,run.options.turn);}
  if(run.moving&&parentOwned&&!taunted&&!has(c,emitter,'root')){const d=run.moveSpeed*STEP;c.moveContinuous(emitter,emitter.x+Math.cos(emitter.facing)*d,emitter.y+Math.sin(emitter.facing)*d,{duration:STEP,lockActions:false,ignoreTerrainBarriers:true});}
  visual();
  if(elapsed+EPS>=(pulse+1)*run.options.interval){
   pulse++;
   if(parentOwned)c.setHealth?.(emitter,emitter.hp*(1-run.options.healthCost*run.options.interval),{nonLethal:true});
   // A sampled linear1→2ramp. The old Wiki aggregate9×formula and exact
   // first/last discrete values do not establish a hidden compensation rule.
   const factor=1+Math.min(1,elapsed/duration);
   const targets=c.battle.units.filter(t=>!t.dead&&t.id!==emitter.id&&!t.ancient&&!t.courier&&!t.ward&&!t.building&&!hidden(c,t)&&!has(c,t,'invulnerable')&&inRay(t,emitter,emitter.facing,run.options.distance,run.options.radius));
   for(const t of targets.filter(t=>t.side===c.caster.side))c.heal(t,(run.options.baseHeal+t.maxHp*run.options.healPct)*factor*run.options.interval);
   for(const t of targets.filter(t=>t.side!==c.caster.side&&!has(c,t,'magicImmune'))){c.damage(t,(run.options.baseDamage+t.maxHp*run.options.damagePct)*factor*run.options.interval,'magical',false,{flags:{damageOverTime:true}});addVisualWorldEffect(c.battle,{source:c.caster.id,skill:c.skill.id,artSkill:RAY,points:c.visualPoints??c.skill.points,layer:'burn',kind:'proc',followUnit:t.id,x:t.x,y:t.y,until:c.battle.time+run.options.interval});}
  }
  if(elapsed>=duration-EPS)finishRay(run);else c.delay(STEP,tick);
 };c.delay(STEP,tick);return run;
}

function spawnSun(c:C){
 const profile=UNIT_CONFIG[SUN],duration=v(c,'DURATION',6),hp=profile?.StatusHealth??100,egg=c.summon({name:'超新星',count:1,nativeTemplateId:SUN,hp,attack:0,armor:profile?.ArmorPhysical??0,range:0,interval:profile?.AttackRate??1,speed:0,lifetime:duration+STEP*2,position:{x:c.caster.x,y:c.caster.y},mana:0,maxMana:0})[0];if(!egg)return;
 egg.ward=true;egg.sourceUnitType=SUN;egg.attackCapability='none';egg.facing=c.caster.facing;
 const hits=v(c,'HERO ATTACKS TO DESTROY',10);c.status(egg,'hitCountBody',duration+STEP*2,0,{dispel:'none',data:{heroDamage:hp/hits,basicDamage:0,immuneSpells:true,treatIllusionsAsCreeps:true,treatClonesAsHeroes:true}});c.status(egg,'phased',duration+STEP*2,0,{dispel:'none'});c.status(egg,'visualForm',duration+STEP*2,0,{dispel:'none',data:{form:'supernova',aimX:Math.cos(egg.facing),aimY:Math.sin(egg.facing)}});
 const ray=startRay(c,egg,false),entered=new Map<string,{next:number;until:number;target:CombatUnit}>(),started=c.battle.time,interval=v(c,'DAMAGE INTERVAL',1),linger=v(c,'AURA LINGER',.5),radius=v(c,'RADIUS',1200)/100;
 const aura=()=>{
  const alive=!egg.dead&&c.battle.time<=started+duration+EPS;
  if(alive)for(const t of c.battle.units.filter(t=>enemy(c,t)&&dist(t,egg)<=radius)){const old=entered.get(t.id);if(old)old.until=c.battle.time+linger;else entered.set(t.id,{target:t,next:c.battle.time+interval,until:c.battle.time+linger});}
  for(const[id,state]of entered){if(state.target.dead||state.until<c.battle.time-EPS){entered.delete(id);continue;}if(c.battle.time+EPS>=state.next){c.damage(state.target,v(c,'DAMAGE PER SECOND',120)*interval,'magical',false,{flags:{damageOverTime:true}});state.next+=interval;}}
  if(alive||entered.size)c.delay(STEP,aura);
 };aura();
 c.delay(duration,()=>{if(egg.dead){finishRay(ray);return;}for(const t of c.battle.units.filter(t=>!t.dead&&t.side!==c.caster.side&&!t.ward&&!t.building&&!t.courier&&!hidden(c,t)&&!has(c,t,'invulnerable')&&dist(t,egg)<=radius))c.status(t,'stun',v(c,'STUN DURATION',3),0,{harmful:true,piercesImmunity:true,dispel:'strong'});finishRay(ray);egg.expiresAt=c.battle.time;addVisualWorldEffect(c.battle,{source:c.caster.id,skill:NOVA,artSkill:RAY,points:c.visualPoints??9,layer:'nova',kind:'burst',x:egg.x,y:egg.y,until:c.battle.time+24/24});});
}

export function applyMotionScopeAcceptance(registry:Record<string,SkillProgram>):void {
 const shock=registry[SHOCK];shock.pointTarget=true;shock.unitTarget=false;shock.backswing=1.2;
 shock.cast=c=>{
  const origin={x:c.caster.x,y:c.caster.y},to=c.castPosition??c.target,dir=direction(origin,to,c.caster.facing),angle=Math.atan2(dir.y,dir.x),length=v(c,'DISTANCE',1200)/100,width=v(c,'WIDTH',200)/100;
  c.linearProjectile({origin,angle,distance:length,width,speed:v(c,'PROJECTILE SPEED',900)/100,onMove:p=>addVisualWorldEffect(c.battle,{source:c.caster.id,skill:SHOCK,points:c.skill.points,layer:'wake',kind:'proc',...p,angle,until:c.battle.time+12/24}),effect:t=>{
   if(!enemy(c,t))return;
   if(!t.ancient){if(G(c))pull(c,t,{x:c.caster.x,y:c.caster.y},v(c,'HORN TOSS DURATION',.6),true);else {const projection=(t.x-origin.x)*dir.x+(t.y-origin.y)*dir.y,aim={x:origin.x+dir.x*Math.max(0,projection-v(c,'PULL DISTANCE',150)/100),y:origin.y+dir.y*Math.max(0,projection-v(c,'PULL DISTANCE',150)/100)},force=direction(t,aim,angle+Math.PI),distance=Math.min(v(c,'PULL DISTANCE',150)/100,dist(t,aim));pull(c,t,{x:t.x+force.x*distance,y:t.y+force.y*distance},v(c,'PULL DURATION',.2));}}
   c.status(t,'slow',v(c,'SLOW DURATION',.9),v(c,'SLOW',75)/100,{harmful:true,dispel:'basic'});c.damage(t,v(c,'DAMAGE'),'magical');
  }});
  if(S(c))c.delay(v(c,'ERUPT DELAY',1.5),()=>{
   addVisualWorldEffect(c.battle,{source:c.caster.id,skill:SHOCK,points:c.skill.points,layer:'erupt',kind:'burst',x:origin.x+dir.x*length/2,y:origin.y+dir.y*length/2,angle,until:c.battle.time+24/24});
   for(const t of c.battle.units.filter(t=>enemy(c,t)&&!t.ancient&&inRay(t,origin,angle,length,width))){c.damage(t,v(c,'DAMAGE')*v(c,'ERUPT DAMAGE PERCENT',50)/100,'magical');const run=key(c),started=c.battle.time,duration=v(c,'ERUPT DEBUFF DURATION',5),data={instanceKey:own(c),motionScopeRun:run};c.status(t,'slow',duration,v(c,'ERUPT MOVE SLOW',50)/100,{harmful:true,dispel:'basic',data});c.status(t,'baseArmorPct',duration,-v(c,'ERUPT BASE ARMOR REDUCTION',50)/100,{harmful:true,dispel:'basic',data});
    const decay=()=>{const live=statuses(t).filter(s=>s.data?.motionScopeRun===run&&s.until>c.battle.time);if(!live.length)return;const fraction=Math.max(0,1-(c.battle.time-started)/duration);for(const s of live)s.value=(s.kind==='slow'?v(c,'ERUPT MOVE SLOW',50)/100:-v(c,'ERUPT BASE ARMOR REDUCTION',50)/100)*fraction;c.delay(STEP,decay);};c.delay(STEP,decay);
   }
  });
 };
 shock.onStatusRemoved=(c,s)=>{if(s.kind==='shockPull'){const run=pullRuns.get(c.battle)?.get(String(s.data?.motionScopeRun));if(run)finishPull(run);}};
 shock.implemented=['Dated traveling900-speed wave;pull/slow/damage order and150/.2centerward continuous pull','AA final Super range/width and frozen rectangular eruption at1.5seconds','AA Gaben caster-directed HornToss preserves ability casting while airborne'];shock.remaining=['Exact eruption per-server-tick restoration curve is a transparent linear work candidate','AA HornToss extra200/landing debuff scope and exact all-controller arbitration remain source-qualified','Trees/Fog/height branches are outside the accepted flat arena'];

 const stamp=registry[STAMP];stamp.target='self';stamp.unitTarget=false;stamp.castPoint=0;stamp.backswing=0;stamp.canCastWhileChanneling=true;
 stamp.cast=c=>{
  c.endChannel();const run=key(c),duration=v(c,'STAMPEDE DURATION'),until=c.battle.time+duration,allies=c.battle.units.filter(t=>!t.dead&&t.side===c.caster.side&&!t.ward&&!t.building&&!t.courier&&!t.uncontrollable&&!t.hauntIllusion),hit=new Set<string>(),coefficient=v(c,'STRENGTH MULTIPLIER DAMAGE');
  for(const t of allies){const data={instanceKey:own(c),motionScopeRun:run};c.status(t,'stampede',duration,0,{dispel:'none',removeOnDeath:true,data});c.status(t,'minimumMoveSpeed',duration,v(c,'HASTE SPEED',550)/100,{dispel:'none',removeOnDeath:true,data});c.status(t,'phased',duration,0,{dispel:'none',removeOnDeath:true,data});if(G(c))c.status(t,'damageReduction',duration,v(c,'GABEN DAMAGE REDUCTION',40)/100,{dispel:'none',removeOnDeath:true,data:{...data,genericIncoming:true,stacking:'strongest',uniqueGroup:'stampedeDamageReduction'}});}
  const tick=()=>{if(c.battle.time>until+EPS)return;for(const t of c.battle.units.filter(t=>enemy(c,t)&&!hit.has(t.id))){const actor=allies.find(a=>!a.dead&&statuses(a).some(s=>s.kind==='stampede'&&s.data?.motionScopeRun===run&&s.until>c.battle.time)&&dist(a,t)<=v(c,'TRAMPLE RADIUS',105)/100);if(!actor)continue;hit.add(t.id);c.damageFrom?.(actor,t,Math.max(0,Number(c.caster.strength??0)*coefficient),'magical');c.status(t,'slow',v(c,'SLOW DURATION',3),v(c,'MOVEMENT SLOW',100)/100,{harmful:true,dispel:'basic'});if(S(c))c.status(t,'stun',v(c,'SUPER STUN DURATION',1.5),0,{harmful:true,dispel:'strong'});}if(c.battle.time+STEP<until+EPS)c.delay(STEP,tick);};tick();
 };stamp.implemented=['Native zero-point release interrupts its previous channel;global eligible allied snapshot','Haste floor550and unit phasing persist independently on surviving buffed allies','Current caster strength coefficient,actual allied contact actor,damage before debuff,one hit per victim per cast','AA final Super stun/CD and Gaben duration/40percent damage reduction'];stamp.remaining=['Exact AA automatic activation condition remains a work policy; wards/buildings/couriers excluded by dated native family','Multiple-source haste/DR/refresh and all hidden controlled-unit subfamilies remain finite result boundaries'];

 const ray=registry[RAY];ray.pointTarget=true;ray.unitTarget=false;ray.channel=0;ray.backswing=.5;ray.init=c=>{c.grantAbility?.(STOP,Math.min(4,c.skill.points>=3?4:c.skill.points));c.grantAbility?.(TOGGLE,1);};
 ray.canCast=c=>!rayMap(c).has(c.caster.id)&&!has(c,c.caster,'icarusDive');
 ray.cast=c=>{if(G(c)){const overrides:Record<string,number>={};for(const k of['BASE DAMAGE','BASE HEAL','MAX HEALTH DAMAGE','MAX HEALTH HEAL','RAY RADIUS','RAY DISTANCE','TICK INTERVAL','HEALTH COST PER SECOND','TURN RATE','MAX DURATION'])overrides[k]=v(c,k);c.castAbility(NOVA,v(c,'SUPERNOVA LEVEL',3),c.target,overrides);}else startRay(c);};
 ray.implemented=['Non-channel native Ray permits other casts/channels and uses existing castWithoutTurning','Thirty.2second cost/heal/damage ticks;nonlethal currentHPSetHealth cost and dynamic1→2ramp','Dated1150length/130width with AA Super final coefficients/width','Independent AA Gaben Sun uses pinned100HPnative template and native3hit-count/burn/stun candidate'];ray.remaining=['Exact discrete ramp sample/end-linger and initial250degree turning phase remain source-qualified','Gaben native3choice and originalAAspawn-specific destruction/steal/owner-death semantics are not original Lua proof','Manual Stop/Toggle effects exist,but automatic combat has no direct human order UI'];
 registry[STOP]={target:'self',unitTarget:false,castPoint:0,backswing:0,allowZeroCooldown:true,spellStealEligible:false,canCast:()=>false,implemented:['Native stop effect ends the current Ray and interrupts a separate channel'],remaining:['Human combat command UI outside automatic arena'],cast:c=>{if(has(c,c.caster,'taunt')||has(c,c.caster,'duel'))return;c.endChannel();const run=rayMap(c).get(c.caster.id);if(run)finishRay(run);}};
 registry[TOGGLE]={target:'self',unitTarget:false,castPoint:0,backswing:0,allowZeroCooldown:true,spellStealEligible:false,canCast:()=>false,implemented:['Native fixed250forward movement toggle,root/taunt restrictions and channel interruption'],remaining:['Toggle is an explicit subeffect;no automatic AI toggle policy is invented'],cast:c=>{if(['root','taunt','duel'].some(k=>has(c,c.caster,k)))return;const run=rayMap(c).get(c.caster.id);if(!run)return;c.endChannel();run.moveSpeed=v(c,'MOVE SPEED',250)/100;run.moving=!run.moving;}};
 registry[NOVA]={target:'self',unitTarget:false,castPoint:.01,backswing:.5,canCast:()=>false,implemented:['Independent native3data-domain Sun entity for AA Gaben,not original hero transformation/rebirth','Only real hero/clone attacks reduce hit count;spells/basic/illusion attacks do not','Native one-second ambient burn and ending immunity-piercing stun'],remaining:['Full native Supernova self/ally rebirth is not granted by AA spawn wording','Exact AAchildrank and inherited Ray/emitter aim lifecycle remain source-qualified'],cast:spawnSun};

 const toss=registry[TOSS];toss.target='any';toss.unitTarget=true;toss.pointTarget=false;toss.backswing=.53;toss.spellBlockTiming='program';
 toss.targetEligibility=(c,t)=>t.id!==c.caster.id&&!t.dead&&!t.ward&&!t.building&&!t.courier&&!hidden(c,t)&&(c.canTarget?.(t)??true);
 toss.targetSelector=(c,targets)=>targets.sort((a,b)=>Number(a.side===c.caster.side)-Number(b.side===c.caster.side)||dist(a,c.caster)-dist(b,c.caster)||a.id.localeCompare(b.id))[0];
 toss.init=c=>{if(S(c))c.grantAbility?.(BLINK,v(c,'BLINK LEVEL',4));};
 toss.canCast=c=>c.battle.units.some(t=>t.id!==c.caster.id&&!t.dead&&!t.ward&&!t.building&&!t.courier&&!t.ancient&&!hidden(c,t)&&!has(c,t,'invulnerable')&&(G(c)||t.side!==c.caster.side)&&!(t.side!==c.caster.side&&(has(c,t,'magicImmune')||has(c,t,'invisible')&&!has(c,t,'revealed')))&&dist(t,c.caster)<=v(c,'GRAB RADIUS',G(c)?300:275)/100);
 toss.cast=c=>{
  const pool=c.battle.units.filter(t=>t.id!==c.caster.id&&!t.dead&&!t.ward&&!t.building&&!t.courier&&!t.ancient&&!hidden(c,t)&&!has(c,t,'invulnerable')&&(G(c)||t.side!==c.caster.side)&&!(t.side!==c.caster.side&&(has(c,t,'magicImmune')||has(c,t,'invisible')&&!has(c,t,'revealed')))&&dist(t,c.caster)<=v(c,'GRAB RADIUS',G(c)?300:275)/100).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster)||a.id.localeCompare(b.id)),victims=G(c)?pool:pool.slice(0,1),primary=c.target,duration=v(c,'TOSS DURATION',1.4);
  for(const victim of victims){const run=key(c),data={instanceKey:run,motionScopeRun:run};let done=false;const landing=()=>{if(done)return;done=true;clear(victim,run);const damage=v(c,'DAMAGE')+statuses(c.caster).filter(s=>s.kind==='growTossBonus'&&s.until>c.battle.time).reduce((n,s)=>n+(s.value??0),0);for(const t of c.battle.units.filter(t=>!t.dead&&t.side!==c.caster.side&&!t.ward&&!t.courier&&!hidden(c,t)&&!has(c,t,'invulnerable')&&dist(t,victim)<=v(c,'RADIUS',275)/100)){const fraction=(t.id===victim.id?1+v(c,'TOSSED DAMAGE BONUS',30)/100:1)*(t.building?v(c,'BUILDING DAMAGE PERCENT',100/3)/100:1);c.damage(t,damage*fraction,'magical',false);}if(S(c)&&!victim.dead&&victim.side!==c.caster.side){c.status(victim,'slow',v(c,'LANDING DEBUFF DURATION',2),v(c,'LANDING MOVE SLOW',30)/100,{harmful:true,dispel:'basic'});c.status(victim,'blind',v(c,'LANDING DEBUFF DURATION',2),v(c,'LANDING MISS CHANCE',30)/100,{harmful:true,dispel:'basic'});}addVisualWorldEffect(c.battle,{source:c.caster.id,skill:TOSS,points:c.skill.points,layer:'landing',kind:'burst',x:victim.x,y:victim.y,until:c.battle.time+24/24});};
   c.status(victim,'stun',duration+STEP,0,{harmful:true,piercesImmunity:victim.side===c.caster.side,dispel:'none',removeOnDeath:false,data});c.status(victim,'phased',duration+STEP,0,{dispel:'none',removeOnDeath:false,data});
   const moved=c.moveContinuous(victim,primary.x,primary.y,{duration:duration+STEP,maxSpeed:v(c,'MAX TOSS SPEED',2308)/100,ignoreTerrainBarriers:true,continueAfterDeath:true,onEnd:landing}),motion=c.motionActive?.(victim);if(!moved||!motion){clear(victim,run);continue;}addVisualWorldEffect(c.battle,{source:c.caster.id,skill:TOSS,points:c.skill.points,layer:'pickup',kind:'proc',x:victim.x,y:victim.y,until:c.battle.time+12/24});const identity={expectedOwner:motion.owner,expectedStartedAt:motion.startedAt};
   const home=()=>{if(done)return;if(!c.retargetMotion?.(victim,primary.x,primary.y,identity))return;c.delay(STEP,home);};c.delay(STEP,home);
  }
 };toss.implemented=['AAenemy-onlynearest275base pickup/Galllegitimate300pool','One native1.4second controller homes on primary and continues after tossed-body death;landinguses actualbodyposition','Native2308cap,building one-third damage;AAextra30percent and Super landing slow/blind','Independent native4QueenofPainBlink grant'];toss.remaining=['Homing acceleration/deceleration is a bounded work trajectory,not recovered native physics','OriginalAA Gabenallyeligibility/friendlyfire and exact foreign-motion arbitration remain qualified','Grow bonus-beforeAA1.3 remains the previous explicit candidate'];
 registry[BLINK]={pointTarget:true,unitTarget:false,castPoint:.33,backswing:.53,requiresFacing:false,range:13,canCast:c=>dist(c.caster,c.target)>3,implemented:['Independent native four-rank Blink resources/range;frozen destination and minimum200overshoot'],remaining:['AAgrant rank4and exact2023backswing.53 remain candidates;AI forward-target choice is a work policy'],cast:c=>{const to=c.castPosition??c.target,d=direction(c.caster,to,c.caster.facing),distance=Math.min(skillBalance(c.definition,c.skill.points)?.range??13,Math.max(v(c,'MIN BLINK RANGE',200)/100,dist(c.caster,to)));c.disjoint(c.caster);c.warp(c.caster,c.caster.x+d.x*distance,c.caster.y+d.y*distance);}};

 const trample=registry[TRAMPLE];trample.target='self';trample.unitTarget=false;trample.castPoint=0;trample.backswing=0;trample.canCastWhileChanneling=true;trample.allowZeroCooldown=true;
 trample.cast=c=>{
  const run=key(c),duration=v(c,'DURATION',5.5),until=c.battle.time+duration,data={instanceKey:own(c),motionScopeRun:run},step=v(c,'STEP DISTANCE',140)/100,window=v(c,'DISTANCE WINDOW',.1);let moved=0,last={x:c.caster.x,y:c.caster.y},warp=Number(c.caster.warpSequence??0),checked=c.battle.time;
  c.status(c.caster,'trampling',duration,0,{dispel:'none',removeOnDeath:true,data});c.status(c.caster,'disarm',duration,0,{dispel:'none',removeOnDeath:true,data});if(S(c)){c.status(c.caster,'magicResist',duration,v(c,'MAGIC RESISTANCE',50)/100,{dispel:'none',removeOnDeath:true,data});c.status(c.caster,'statusResistance',duration,v(c,'STATUS RESISTANCE',50)/100,{dispel:'none',removeOnDeath:true,data});}
  const stomp=()=>{const attack=c.averageFlatAttackDamage?.()??c.caster.attack,damage=Math.max(0,v(c,'BASE DAMAGE')+attack*v(c,'ATTACK DAMAGE MULTIPLIER',35)/100);for(const t of c.battle.units.filter(t=>enemy(c,t)&&dist(t,c.caster)<=v(c,'DAMAGE AOE',230)/100)){c.damage(t,damage,'magical');if(G(c)&&!t.dead)c.attack(t,1,true,0,false,{allowInvisibleTarget:true});}addVisualWorldEffect(c.battle,{source:c.caster.id,skill:TRAMPLE,points:c.skill.points,layer:'stomp',kind:'burst',x:c.caster.x,y:c.caster.y,until:c.battle.time+12/24});};
  stomp();const tick=()=>{if(c.caster.dead||c.battle.time>=until-EPS||!statuses(c.caster).some(s=>s.kind==='trampling'&&s.data?.motionScopeRun===run)){clear(c.caster,run);return;}
   const elapsed=c.battle.time-checked;if(elapsed+EPS>=window){const distance=dist(last,c.caster),newWarp=Number(c.caster.warpSequence??0);if(distance<=v(c,'DISTANCE CAP',500)/100+EPS){moved+=newWarp!==warp?Math.min(step,distance):distance;if(moved>=step-EPS){moved%=step;stomp();}}last={x:c.caster.x,y:c.caster.y};warp=newWarp;checked=c.battle.time;}
   c.delay(STEP,tick);
  };c.delay(STEP,tick);
 };trample.implemented=['AA35→60percent final attack coefficient and230→300radius;native immediate/ignore-channel zero-point action','Average flat-main/bonus attack read without randomcrit/prepare/chargeconsumption;separate spell damage','Version-qualified single stomp per140movement,shortwarp cap140and0.1>500suppression','AA Super active resistances and Gaben modifier-only fixed0attack with truezero cooldown'];trample.remaining=['Immediate stomp/movement cap and flat-attack classification are retained7.35candidates,not falsely dated2023','Automatic native Trample steering/orbit policy is not recovered;current ordinary AIcanstopinsideattackrange','All foreignmotion/source-itemexceptions and every attackmodifier eligibility matrix need specific results'];
}
