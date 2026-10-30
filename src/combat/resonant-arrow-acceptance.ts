import {BATTLE_CONFIG,skillBalance,UNIT_CONFIG} from '../config';
import type {BattleState,CombatUnit,SkillDefinition} from '../model';
import {skillValue as value,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {childValue,HISTORICAL_CHILD_DEFINITIONS} from './historical-children';
import {charged} from './charges';
import {addVisualWorldEffect,removeVisualWorldEffect,updateVisualWorldEffect} from './visual-state';
import {constrainBarrierMotion} from './barriers';

const PULSE='void_spirit_resonant_pulse',BOULDER='earth_spirit_rolling_boulder',THUNDER='custom_pangolier_rolling_thunder',ROT='pudge_rot',ARROW='custom_mirana_arrow',DISMEMBER='pudge_dismember',STARFALL='mirana_starfall',STOP='pangolier_gyroshell_stop',STONE='npc_dota_earth_spirit_stone';
const STEP=1/30,EPS=1e-8,FOREVER=1_000_000;
const list=(t:CombatUnit)=>t.statuses as EffectStatus[],S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9;
const v=(c:C,key:string,fallback=0)=>c.definition.grantedOnly?childValue(c,key,fallback):value(c,key,fallback);
const has=(c:C,t:CombatUnit,kind:string)=>list(t).some(s=>s.kind===kind&&s.until>c.battle.time+EPS);
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const identity=(c:C)=>c.skill.instanceId??c.attackInstanceKey??c.skill.id;
const own=(c:C,s:EffectStatus)=>s.source===c.caster.id&&s.skill===c.skill.id;
const ordinary=(t:CombatUnit)=>!t.dead&&!t.ward&&!t.building&&!t.courier&&!t.hiddenSpellBody;
const visible=(c:C,t:CombatUnit)=>!has(c,t,'invisible')||has(c,t,'revealed');
const vulnerable=(c:C,t:CombatUnit)=>ordinary(t)&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&!has(c,t,'magicImmune');
function token(c:C):string{const key=`resonantArrowSerial:${identity(c)}`;c.caster[key]=Number(c.caster[key]??0)+1;return`${c.caster.id}:${identity(c)}:${c.caster[key]}`;}
const compiled=(c:C)=>!!skillBalance(c.definition,c.skill.points);
const final=(c:C,key:string,extra=0,fallback=0)=>v(c,key,fallback)+(compiled(c)?0:extra);
const publicRange=(c:C,fallback:number)=>skillBalance(c.definition,c.skill.points)?.range??fallback;

export const RESONANT_ARROW_CHILD_DEFINITIONS:SkillDefinition[]=[
 {id:STARFALL,name:'群星风暴陨星',nameEn:'Starstorm Meteor',description:'月神之箭触发的单个陨星分量，使用独立原生1至4级数值，不授予主动群星风暴槽。',descriptionEn:'A Sacred Arrow-triggered Starstorm meteor component with independent native ranks1to4,not a granted active Starstorm.',icon:'/art/icons/custom_mirana_arrow.webp',tags:['magicDamage'],super:'',gaben:'',values:['DAMAGE: 75 / 150 / 225 / 300','IMPACT DELAY: 0.57'],cooldowns:[0,0,0,0],mana:[0,0,0,0],categories:['ABILITY: Effect Only','DAMAGE TYPE: Magical','PIERCES SPELL IMMUNITY: No'],passive:false,ultimate:false,grantedOnly:true,sourceMaximumLevel:4,visualParentId:ARROW},
 {id:STOP,name:'停止滚动',nameEn:'Stop Rolling',description:'立即结束本次滚动雷霆，不额外消耗魔法或重置主体冷却。',descriptionEn:'Ends the current Rolling Thunder without additional mana or resetting its cooldown.',icon:'/art/icons/custom_pangolier_rolling_thunder.webp',tags:[],super:'',gaben:'',values:[],cooldowns:[0],mana:[0],categories:['ABILITY: No Target'],passive:false,ultimate:true,grantedOnly:true,sourceMaximumLevel:1,visualParentId:THUNDER}
];
function meteor(c:C):void{
 const target=c.target,amount=v(c,'DAMAGE')+v(c,'UPGRADE DAMAGE',0),delay=v(c,'IMPACT DELAY',.57);
 addVisualWorldEffect(c.battle,{source:c.caster.id,skill:STARFALL,artSkill:ARROW,points:c.visualPoints??c.skill.points,layer:'meteor',kind:'burst',x:target.x,y:target.y,until:c.battle.time+delay});
 c.delay(delay,()=>{if(target.dead||has(c,target,'invulnerable')||has(c,target,'banished')||has(c,target,'magicImmune')||target.hiddenSpellBody)return;c.damage(target,amount,'magical',false);});
}

function pulse(c:C):void{
 const key=token(c),origin={x:c.caster.x,y:c.caster.y},start=c.battle.time,radius=v(c,'PULSE RADIUS')/100,speed=v(c,'PULSE SPEED',1200)/100,end=start+v(c,'SHIELD DURATION'),seen=new Set<string>();
 const shield=(amount:number)=>{
  if(c.caster.dead||c.battle.time>=end-EPS)return;
  const old=list(c.caster).find(s=>s.kind==='physicalShield'&&s.data?.pulseRun===key);
  c.status(c.caster,'physicalShield',end-c.battle.time,(old?.value??0)+amount,{remaining:(old?.remaining??0)+amount,dispel:'basic',removeOnDeath:true,data:{pulseRun:key,instanceKey:key,physicalAttackOnly:true,damageStage:'afterArmorBeforeGeneric'}});
 };
 shield(v(c,'BASE SHIELD ABSORB'));c.status(c.caster,'resonantPulseRing',radius/speed+STEP,0,{dispel:'none',removeOnDeath:true,data:{pulseRun:key,instanceKey:key}});
 const visual=addVisualWorldEffect(c.battle,{source:c.caster.id,skill:PULSE,points:c.skill.points,layer:'pulse',kind:'ring',...origin,radius:0,previousRadius:0,maxRadius:radius,progress:0,until:start+.15,expiresWithSource:true});let previous=0;
 const tick=()=>{
  if(c.caster.dead||!list(c.caster).some(s=>s.kind==='resonantPulseRing'&&s.data?.pulseRun===key)){removeVisualWorldEffect(c.battle,visual);return;}
  const wave=Math.min(radius,(c.battle.time-start)*speed);
  updateVisualWorldEffect(c.battle,visual,{previousRadius:previous,radius:wave,progress:wave/Math.max(EPS,radius),until:c.battle.time+.15});
  for(const t of c.enemies()){
   const d=dist(t,origin);if(seen.has(t.id)||!vulnerable(c,t)||d>radius+BATTLE_CONFIG.bodyRadius||d+BATTLE_CONFIG.bodyRadius<previous-EPS||d-BATTLE_CONFIG.bodyRadius>wave+EPS)continue;
   seen.add(t.id);c.damage(t,final(c,'DAMAGE',S(c)?100:0),'magical',false);
   const silence=v(c,'SILENCE DURATION',G(c)?2:0);if(silence)c.status(t,'silence',silence,0,{harmful:true,dispel:'basic',removeOnDeath:true});
   const seconds=v(c,'IMMUNITY PER UNIT',S(c)?1:0);if(seconds){const old=list(c.caster).find(s=>s.kind==='magicImmune'&&own(c,s));c.status(c.caster,'magicImmune',Math.max(0,(old?.until??c.battle.time)-c.battle.time)+seconds,0,{dispel:'none',removeOnDeath:true});}
   // The legacy real-hero shield qualification is retained; special hero bodies remain an explicit source boundary.
   if(!t.summoned||t.heroClone)c.projectile(c.caster,v(c,'RETURN PROJECTILE SPEED',900)/100,()=>shield(v(c,'BONUS ABSORB PER HERO HIT')),{x:t.x,y:t.y},undefined,{visualProjectile:'magic_bolt'});
  }
  previous=wave;if(wave<radius-EPS)c.delay(STEP,tick);else removeVisualWorldEffect(c.battle,visual);
 };c.delay(STEP,tick);
}


interface BoulderRun {c:C;key:string;phase:'gather'|'roll'|'done';start:number;direction:{x:number;y:number};traveled:number;distance:number;speed:number;usedStone:boolean;hit:Set<string>;lastPosition?:{x:number;y:number}}
const boulderRuns=new WeakMap<BattleState,Map<string,BoulderRun>>();
function boulderMap(c:C){let m=boulderRuns.get(c.battle);if(!m){m=new Map;boulderRuns.set(c.battle,m);}return m;}
const runKey=(c:C)=>`${c.caster.id}:${identity(c)}`;
function clearRun(c:C,key:string):void{for(const body of c.battle.units)body.statuses=list(body).filter(s=>s.data?.resonantArrowRun!==key);}
function finishBoulder(run:BoulderRun):void{if(run.phase==='done')return;run.phase='done';clearRun(run.c,run.key);}
function boulderDisabled(c:C):boolean{return c.caster.dead||!!c.caster.hiddenSpellBody||list(c.caster).some(s=>s.until>c.battle.time+EPS&&(['stun','selfStun','hex','banished','sleep','cyclone','fear','hypnotized','hypnosis','hidden'].includes(s.kind)||s.kind==='visualForm'&&s.data?.hidden===true));}
function stone(c:C,dir:{x:number;y:number}):void{
 const raw=UNIT_CONFIG[STONE];if(!raw)throw Error('Missing native Stone Remnant profile');const duration=v(c,'REMNANT DURATION',60),offset=v(c,'REMNANT OFFSET',150)/100;
 const bodies=c.summon({name:'残岩',nativeTemplateId:STONE,visualBody:'remnant',count:1,hp:raw.StatusHealth,attack:0,armor:raw.ArmorPhysical,interval:raw.AttackRate,range:0,speed:0,lifetime:duration,position:{x:c.caster.x+dir.x*offset,y:c.caster.y+dir.y*offset}});
 for(const body of bodies){body.sourceUnitType=STONE;body.ward=true;body.hiddenSpellBody=true;body.illusion=false;body.heroClone=false;c.status(body,'invulnerable',duration,0,{dispel:'none',removeOnDeath:true});c.status(body,'phased',duration,0,{dispel:'none',removeOnDeath:true});}
}
function segmentDistance(p:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number}):number{const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,q=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;return Math.hypot(p.x-a.x-q*dx,p.y-a.y-q*dy);}
function boulder(c:C):void{
 const point=c.castPosition??c.target,dx=point.x-c.caster.x,dy=point.y-c.caster.y,length=Math.hypot(dx,dy)||1,dir={x:dx/length,y:dy/length},key=token(c),delay=v(c,'ROLL DELAY',.5),run:BoulderRun={c,key,phase:'gather',start:c.battle.time+delay,direction:dir,traveled:0,distance:v(c,'DISTANCE')/100,speed:v(c,'SPEED')/100,usedStone:false,hit:new Set};boulderMap(c).set(runKey(c),run);
 stone(c,dir);for(const kind of ['root','disarm'])c.status(c.caster,kind,FOREVER,0,{dispel:'none',removeOnDeath:true,data:{resonantArrowRun:key,instanceKey:key}});
 const resistance=v(c,'STATUS RESISTANCE',G(c)?80:0),resistDuration=v(c,'STATUS RESISTANCE DURATION',G(c)?2:0);if(resistance&&resistDuration)c.status(c.caster,'statusResistance',resistDuration,resistance/100,{dispel:'none',removeOnDeath:true});
 const tick=()=>{
  if(run.phase==='done')return;if(boulderDisabled(c)){finishBoulder(run);return;}
  if(c.battle.time<run.start-EPS){c.delay(STEP,tick);return;}
  if(run.phase==='roll'&&run.lastPosition&&dist(run.lastPosition,c.caster)>EPS){finishBoulder(run);return;}
  if(run.phase==='gather'){run.phase='roll';c.status(c.caster,'phased',FOREVER,0,{dispel:'none',removeOnDeath:true,data:{resonantArrowRun:key,instanceKey:key}});c.status(c.caster,'visualForm',FOREVER,0,{dispel:'none',removeOnDeath:true,data:{resonantArrowRun:key,instanceKey:key,form:'rolling_boulder'}});}
  const other=c.motionActive?.(c.caster);if(other&&other.skill!==BOULDER){finishBoulder(run);return;}
  const from={x:c.caster.x,y:c.caster.y},radius=v(c,'COLLISION RADIUS',160)/100;
  if(!run.usedStone){const nearEnd={x:from.x+dir.x*run.speed*STEP,y:from.y+dir.y*run.speed*STEP},remnant=c.battle.units.filter(t=>!t.dead&&t.nativeTemplateId===STONE&&segmentDistance(t,from,nearEnd)<=radius+EPS&&((t.x-from.x)*dir.x+(t.y-from.y)*dir.y)>=-EPS).sort((a,b)=>dist(a,from)-dist(b,from)||a.id.localeCompare(b.id))[0];if(remnant){run.usedStone=true;run.distance=v(c,'DISTANCE')*v(c,'DISTANCE MULTIPLIER (REMNANT)')/100;run.speed=v(c,'SPEED (REMNANT)')/100;c.despawn?.(remnant);}}
  const amount=Math.min(run.speed*STEP,Math.max(0,run.distance-run.traveled)),wanted={x:from.x+dir.x*amount,y:from.y+dir.y*amount};
  if(!c.moveContinuous(c.caster,wanted.x,wanted.y,{duration:STEP,lockActions:false,ignoreTerrainBarriers:true})){finishBoulder(run);return;}
  const actual={x:c.caster.x,y:c.caster.y};run.lastPosition=actual;run.traveled+=dist(from,actual);
  const targets=c.battle.units.filter(t=>ordinary(t)&&t.side!==c.caster.side&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&!run.hit.has(t.id)&&segmentDistance(t,from,actual)<=radius+BATTLE_CONFIG.bodyRadius+EPS).sort((a,b)=>(a.x-from.x)*dir.x+(a.y-from.y)*dir.y-((b.x-from.x)*dir.x+(b.y-from.y)*dir.y)||a.id.localeCompare(b.id));
  for(const t of targets){run.hit.add(t.id);const stop=!t.summoned||!!t.heroClone,damage=final(c,'DAMAGE',S(c)?150:0)+Number(c.caster.strength??0)*v(c,'STRENGTH DAMAGE PERCENT',S(c)?200:100)/100;
   if(!has(c,t,'magicImmune')){c.damage(t,damage,'magical',false);if(!t.dead)c.status(t,'stun',final(c,'STUN DURATION',S(c)?1:0)+(run.usedStone?v(c,'ROCK BONUS STUN DURATION'):0),0,{harmful:true,dispel:'strong',removeOnDeath:true});}
   if(stop){finishBoulder(run);const offset=v(c,'HERO COLLISION OFFSET',80)/100;c.warp(c.caster,t.x+dir.x*offset,t.y+dir.y*offset);return;}
  }
  if(run.traveled>=run.distance-EPS||dist(actual,from)<amount-EPS){finishBoulder(run);return;}c.delay(STEP,tick);
 };c.delay(STEP,tick);
}

interface DismemberRun{c:C;key:string;done:boolean;end:number;nonChannel:boolean;packet:number;ticks:number;index:number;start:number}
const dismemberRuns=new WeakMap<BattleState,Map<string,DismemberRun>>();
function dmMap(c:C){let m=dismemberRuns.get(c.battle);if(!m){m=new Map;dismemberRuns.set(c.battle,m);}return m;}
const rotGranted=(c:C)=>(c.skill as typeof c.skill&{statParentId?:string}).statParentId===ROT;
const heroDuration=(t:CombatUnit)=>!t.summoned||!!t.illusion||!!t.heroClone||!!t.consideredHero;
const heroTicks=(t:CombatUnit)=>!t.summoned||!!t.illusion||!!t.heroClone;
function dmDuration(c:C):number{return v(c,heroDuration(c.target)?'ABILITYCHANNELTIME':'CREEP_DISMEMBER_DURATION_TOOLTIP',heroDuration(c.target)?3:6);}
function finishDismember(run:DismemberRun):void{if(run.done)return;run.done=true;clearRun(run.c,run.key);if(!run.nonChannel)run.c.endChannel();}
function dismember(c:C):void{
 const key=token(c),duration=dmDuration(c),ticks=v(c,heroTicks(c.target)?'TICKS':'CREEP TICKS',heroTicks(c.target)?6:9),run:DismemberRun={c,key,done:false,end:c.battle.time+duration,nonChannel:rotGranted(c),packet:(v(c,'DISMEMBER_DAMAGE')+Number(c.caster.strength??0)*v(c,'STRENGTH_DAMAGE'))*duration/ticks,ticks,index:0,start:c.battle.time};dmMap(c).set(key,run);
 c.status(c.target,'dismemberHold',duration+STEP,0,{harmful:true,dispel:'strong',piercesImmunity:true,ignoreStatusResistance:true,removeOnDeath:true,data:{resonantArrowRun:key,instanceKey:key}});
 c.status(c.target,'stun',duration,0,{harmful:true,dispel:'strong',piercesImmunity:true,ignoreStatusResistance:true,removeOnDeath:true,data:{resonantArrowRun:key,instanceKey:key}});
 c.status(c.target,'revealed',STEP,0,{harmful:true,dispel:'none',piercesImmunity:true,data:{resonantArrowRun:key,instanceKey:key}});
 if(!run.nonChannel)c.onChannelEnd?.(()=>finishDismember(run));
 const valid=()=>!run.done&&!c.caster.dead&&!c.target.dead&&!has(c,c.target,'invulnerable')&&!has(c,c.target,'banished')&&!has(c,c.target,'hidden')&&!list(c.target).some(s=>s.kind==='visualForm'&&s.data?.hidden===true)&&!c.target.hiddenSpellBody&&list(c.target).some(s=>s.kind==='dismemberHold'&&s.data?.resonantArrowRun===key)&&(!run.nonChannel||!has(c,c.caster,'stun')&&!has(c,c.caster,'selfStun'));
 const damage=()=>{if(!valid()){finishDismember(run);return;}c.damage(c.target,run.packet,'magical',true,{flags:{damageOverTime:true}});c.heal(c.caster,run.packet);run.index++;if(run.index<ticks)c.delay(Math.max(STEP,run.start+run.index*duration/(ticks-1)-c.battle.time),damage);else finishDismember(run);};damage();
 const pull=()=>{if(!valid()){finishDismember(run);return;}const gap=dist(c.caster,c.target),limit=v(c,'PULL_DISTANCE_LIMIT',125)/100;if(gap>limit+EPS){const amount=Math.min(gap-limit,v(c,'PULL_UNITS_PER_SECOND',75)/100*STEP);c.moveContinuous(c.target,c.target.x+(c.caster.x-c.target.x)/gap*amount,c.target.y+(c.caster.y-c.target.y)/gap*amount,{duration:STEP,lockActions:false});}if(c.battle.time<run.end-EPS)c.delay(STEP,pull);};c.delay(STEP,pull);
}

interface RotRun{c:C;key:string;active:boolean;anchor:number;next:number;offLatch:boolean;members:Map<string,{until:number;slow:number}>;visual?:ReturnType<typeof addVisualWorldEffect>}
const rotRuns=new WeakMap<BattleState,Map<string,RotRun>>();
function rotMap(c:C){let m=rotRuns.get(c.battle);if(!m){m=new Map;rotRuns.set(c.battle,m);}return m;}
const rotRun=(c:C)=>rotMap(c).get(runKey(c));
function stopRot(c:C):void{const run=rotRun(c);if(!run?.active)return;run.active=false;run.offLatch=true;clearRun(c,run.key);if(run.visual)removeVisualWorldEffect(c.battle,run.visual);delete c.caster.rotToggleOffRequested;}
function rotTargets(c:C):CombatUnit[]{return c.enemies().filter(t=>vulnerable(c,t)&&dist(t,c.caster)<=v(c,'RADIUS')/100+EPS);}
function startRot(c:C):void{
 let run=rotRun(c);const base=v(c,'DAMAGE INTERVAL',.2),fast=base/v(c,'CREEP TICK MULTIPLIER',2);if(!run){run={c,key:token(c),active:false,anchor:c.battle.time,next:c.battle.time+fast,offLatch:false,members:new Map};rotMap(c).set(runKey(c),run);}run.c=c;run.active=true;run.offLatch=false;run.key=token(c);run.members.clear();delete c.caster.rotToggleOnRequested;
 c.status(c.caster,'rotActive',FOREVER,0,{dispel:'none',removeOnDeath:true,data:{resonantArrowRun:run.key,instanceKey:run.key}});
 run.visual=addVisualWorldEffect(c.battle,{source:c.caster.id,followUnit:c.caster.id,skill:ROT,points:c.skill.points,layer:'cloud',kind:'pulse',x:c.caster.x,y:c.caster.y,size:v(c,'RADIUS')/50,loop:true,until:c.battle.time+.15,expiresWithSource:true});
 const state=run,key=run.key,packet=v(c,'DAMAGE')*base,linger=v(c,'AURA LINGER',.5),slow=Math.abs(v(c,'MOVE SLOW'))/100,reduction=v(c,'HEALTH RESTORATION REDUCTION',S(c)?25:0)/100;
 const tick=()=>{if(!state.active||state.key!==key)return;if(c.caster.dead){stopRot(c);return;}
  if(state.visual)updateVisualWorldEffect(c.battle,state.visual,{x:c.caster.x,y:c.caster.y,until:c.battle.time+.15});
  for(const t of rotTargets(c)){const member=state.members.get(t.id)??{until:c.battle.time+linger,slow};member.until=c.battle.time+linger;state.members.set(t.id,member);c.status(t,'slow',linger,member.slow,{harmful:true,dispel:'none',removeOnDeath:true,data:{rotAura:key,instanceKey:key}});if(reduction)c.status(t,'healReduction',linger,reduction,{harmful:true,dispel:'none',removeOnDeath:true,data:{rotAura:key,instanceKey:key,restorationStacking:'multiplicative'}});}
  while(state.next<=c.battle.time+EPS){const phase=Math.round((state.next-state.anchor)/fast),regular=phase%Math.round(base/fast)===0;if(regular)c.damage(c.caster,packet,'magical',false,{flags:{nonLethal:true,damageOverTime:true}});
   for(const [id,member]of state.members){const t=c.battle.units.find(t=>t.id===id);if(!t||!vulnerable(c,t)||member.until<=c.battle.time-EPS){state.members.delete(id);continue;}const creep=t.summoned&&!t.illusion&&!t.heroClone&&!t.consideredHero;if(regular||creep)c.damage(t,packet,'magical',false,{flags:{damageOverTime:true}});}
   state.next+=fast;
  }c.delay(STEP,tick);
 };state.next=state.anchor+(Math.floor((c.battle.time-state.anchor)/fast+EPS)+1)*fast;tick();
}

interface ThunderRun{c:C;key:string;end:number;heading:number;speed:number;pauseUntil:number;boostUntil:number;turnUntil:number;done:boolean;timeouts:Map<string,number>;order:{x:number;y:number}}
const thunderRuns=new WeakMap<BattleState,Map<string,ThunderRun>>();
function thunderMap(c:C){let m=thunderRuns.get(c.battle);if(!m){m=new Map;thunderRuns.set(c.battle,m);}return m;}
const thunderRun=(c:C)=>thunderMap(c).get(c.caster.id);
function stopThunder(run:ThunderRun|undefined):void{if(!run||run.done)return;run.done=true;clearRun(run.c,run.key);}
function turnAngle(current:number,goal:number,max:number):number{const d=Math.atan2(Math.sin(goal-current),Math.cos(goal-current));return current+Math.max(-max,Math.min(max,d));}
function thunder(c:C):void{
 const key=token(c),enemy=c.enemies().filter(t=>ordinary(t)&&visible(c,t)).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster)||a.id.localeCompare(b.id))[0],run:ThunderRun={c,key,end:c.battle.time+v(c,'DURATION'),heading:c.caster.facing,speed:v(c,'ROLL SPEED',550)/100,pauseUntil:0,boostUntil:c.battle.time+v(c,'TURN BOOST DURATION',.25),turnUntil:c.battle.time+1,done:false,timeouts:new Map,order:enemy?{x:enemy.x,y:enemy.y}:{x:c.caster.x+Math.cos(c.caster.facing)*30,y:c.caster.y+Math.sin(c.caster.facing)*30}};thunderMap(c).set(c.caster.id,run);c.dispel(c.caster,false,true);
 for(const kind of ['magicImmune','disarm','motionRoot','phased','castWithoutTurning'])c.status(c.caster,kind,run.end-c.battle.time,0,{dispel:'none',removeOnDeath:true,data:{resonantArrowRun:key,instanceKey:key}});
 c.status(c.caster,'visualForm',run.end-c.battle.time,0,{dispel:'none',removeOnDeath:true,data:{resonantArrowRun:key,instanceKey:key,form:'rolling_thunder'}});c.grantAbility?.(STOP,1);
 const tick=()=>{if(run.done)return;if(c.caster.dead||c.battle.time>=run.end-EPS||!list(c.caster).some(s=>s.data?.resonantArrowRun===key)){stopThunder(run);return;}if(c.battle.time<run.pauseUntil-EPS){c.delay(STEP,tick);return;}
  if(c.battle.time<run.turnUntil-EPS){const target={x:Number(c.caster.rollingThunderTargetX??run.order.x),y:Number(c.caster.rollingThunderTargetY??run.order.y)},rate=(v(c,'TURN RATE',120)+(c.battle.time<run.boostUntil?v(c,'TURN RATE BOOST',165):0))*Math.PI/180;run.heading=turnAngle(run.heading,Math.atan2(target.y-c.caster.y,target.x-c.caster.x),rate*STEP);}c.caster.facing=run.heading;
  const from={x:c.caster.x,y:c.caster.y},wanted={x:from.x+Math.cos(run.heading)*run.speed*STEP,y:from.y+Math.sin(run.heading)*run.speed*STEP},limited=constrainBarrierMotion(c.battle,c.caster,wanted);
  if(dist(limited,wanted)>1e-5){c.moveContinuous(c.caster,limited.x,limited.y,{duration:STEP,lockActions:false});run.heading+=Math.PI;run.turnUntil=0;run.pauseUntil=c.battle.time+v(c,'WALL PAUSE',.2);run.boostUntil=run.pauseUntil+v(c,'TURN BOOST DURATION',.25);run.speed+=v(c,'SPEED PER COLLISION',G(c)?40:0)/100;c.delay(STEP,tick);return;}
  c.moveContinuous(c.caster,wanted.x,wanted.y,{duration:STEP,lockActions:false});const actual={x:c.caster.x,y:c.caster.y},radius=v(c,'RADIUS',150)/100;
  for(const t of c.enemies()){if(!vulnerable(c,t)||segmentDistance(t,from,actual)>radius+BATTLE_CONFIG.bodyRadius+EPS||(run.timeouts.get(t.id)??0)>c.battle.time+EPS)continue;const bounce=v(c,'KNOCKBACK DURATION',.6),stun=v(c,'STUN DURATION'),timeout=bounce+stun;run.timeouts.set(t.id,c.battle.time+timeout);if(!t.summoned||t.heroClone)run.speed+=v(c,'SPEED PER COLLISION',G(c)?40:0)/100;c.damage(t,v(c,'DAMAGE'),'magical',false);if(t.dead)continue;
   c.status(t,'stun',bounce,0,{harmful:true,dispel:'none',ignoreStatusResistance:true,removeOnDeath:true,data:{instanceKey:key+':bounce:'+t.id}});const dx=t.x-c.caster.x,dy=t.y-c.caster.y,len=Math.hypot(dx,dy),d=v(c,'KNOCKBACK DISTANCE',150)/100;c.moveContinuous(t,t.x+(len>EPS?dx/len:Math.cos(run.heading))*d,t.y+(len>EPS?dy/len:Math.sin(run.heading))*d,{duration:bounce,lockActions:false,ignoreTerrainBarriers:true});c.delay(bounce,()=>{if(vulnerable(c,t))c.status(t,'stun',stun,0,{harmful:true,dispel:'strong',removeOnDeath:true,data:{instanceKey:key+':landing:'+t.id}});});
  }c.delay(STEP,tick);
 };c.delay(STEP,tick);
}

function arrow(c:C):void{
 const cursor=c.castPosition??c.target,angle=Math.atan2(cursor.y-c.caster.y,cursor.x-c.caster.x),origin={x:c.caster.x,y:c.caster.y},hit=new Set<string>(),meteors=new Set<string>(),offset=v(c,'PROJECTILE OFFSET',51)/100,speed=v(c,'PROJECTILE SPEED',900)/100,width=v(c,'PROJECTILE WIDTH',115)/100,range=publicRange(c,30),bonus=v(c,'METEOR DAMAGE BONUS',G(c)?200:0),meteorRadius=v(c,'METEOR RADIUS',500)/100;
 const drop=(t:CombatUnit)=>c.castAbility(STARFALL,4,t,{'UPGRADE DAMAGE':bonus});
 const scan=(point:{x:number;y:number})=>{if(!S(c))return;for(const t of c.enemies())if(vulnerable(c,t)&&visible(c,t)&&!meteors.has(t.id)&&dist(t,point)<=meteorRadius+EPS){meteors.add(t.id);drop(t);}};
 const side=v(c,'SIDE ARROWS',G(c)?1:0),spread=v(c,'SIDE ANGLE',30)*Math.PI/180;
 for(let n=-side;n<=side;n++){const a=angle+n*spread,start={x:origin.x+Math.cos(a)*offset,y:origin.y+Math.sin(a)*offset};if(n===0)scan(start);c.linearProjectile({angle:a,distance:range,speed,width,origin:start,stopOnHit:true,targetFilter:t=>ordinary(t)&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&!hit.has(t.id),onMove:n===0?scan:undefined,effect:t=>{hit.add(t.id);if(has(c,t,'magicImmune'))return;const traveled=Math.max(0,(t.x-start.x)*Math.cos(a)+(t.y-start.y)*Math.sin(a)),q=Math.min(1,traveled/(v(c,'MAX VALUES DISTANCE',1500)/100));if(t.summoned&&!t.illusion&&!t.heroClone&&!t.consideredHero&&!t.ancient)c.execute(t);else{c.damage(t,v(c,'DAMAGE')+v(c,'MAXIMUM BONUS DAMAGE')*q,'magical',false);if(!t.dead)c.status(t,'stun',Math.max(v(c,'MINIMUM STUN',.01),v(c,'MAXIMUM STUN')*q),0,{harmful:true,dispel:'strong',removeOnDeath:true});}if(n===0&&S(c)&&!t.dead)drop(t);}});}
}

/** Final mechanisms are installed below only after the recorded pre-override diagnosis. */
export function applyResonantArrowAcceptance(programs:Record<string,SkillProgram>):void{
 const dismemberDefinition=HISTORICAL_CHILD_DEFINITIONS.find(d=>d.id===DISMEMBER);if(dismemberDefinition){dismemberDefinition.name='肢解';dismemberDefinition.nameEn='Dismember';dismemberDefinition.icon='/art/icons/pudge_rot.webp';dismemberDefinition.passive=false;dismemberDefinition.description='原生肢解；腐烂Gaben授予的实例无需自身持续施法，但会被眩晕打断。';}
 programs[STARFALL]={target:'enemy',cast:meteor,implemented:['Native1to4single meteor component;AAparent upgrades only add their explicit bonus','Real released.57second fall and independent child attribution'],remaining:['This effect-only component does not grant the active Starstorm secondary-meteor routine','Visibility changes after selection and AAfull impact meteor versus native50percent remain precise boundaries']};
 programs[PULSE]={target:'self',castPoint:0,backswing:0,projectileDisjointable:false,canCast:c=>c.enemies().some(t=>vulnerable(c,t)&&dist(t,c.caster)<=v(c,'PULSE RADIUS')/100&&(!G(c)||(!t.summoned||t.heroClone||t.consideredHero)&&!has(c,t,'silence'))),cast:pulse,superImplemented:true,gabenImplemented:true,implemented:['Actual1200outward ring with immediate physical-attack barrier and900non-disjointable hero returns','Independent per-cast shields;accepted shielded contacts count and immune contacts do not','Final AA damage,per-unit immunity,two charges and damage-before-silence'],remaining:['Shield special-hero qualification,return refresh duration and custom immunity extension policy are explicitly bounded','Pulse cast-center versus caster-following and exact hull edges need direct geometric evidence']};
 programs[BOULDER]={target:'enemy',pointTarget:true,castPoint:0,backswing:0,range:()=>30,targetSelector:(c,candidates)=>candidates.filter(t=>ordinary(t)&&visible(c,t)).sort((a,b)=>dist(b,c.caster)-dist(a,c.caster)||a.id.localeCompare(b.id))[0],canCast:c=>boulderMap(c).get(runKey(c))?.phase!=='gather'&&boulderMap(c).get(runKey(c))?.phase!=='roll',cast:boulder,superImplemented:true,gabenImplemented:true,implemented:['Actual placed/consumed native remnant and delayed real-transform continuous roll','Root/disarm without blanket silence;other abilities remain usable','Real-path damage before stun,immune hero stop,non-stopping illusions/creepHero and explicit terminal80hero relocation','Final AA strength coefficients/stun upgrades and2second80percent status resistance'],remaining:['Native hull edges and special-hero clone qualification remain bounded','Default remnant150placement,exact gathering forced-motion direction and noattack profile animation remain candidates']};
 programs[THUNDER]={target:'self',castPoint:1.2,backswing:0,canCast:c=>!thunderRun(c)||!!thunderRun(c)?.done,cast:thunder,onSpellOrder:c=>{if(c.castOrder?.skillId==='pangolier_swashbuckle')stopThunder(thunderRun(c));},onDeath:c=>stopThunder(thunderRun(c)),superImplemented:true,gabenImplemented:true,implemented:['Continuous fixed-speed roll with bounded120degree steering and initial/bounce boost','Actual barrier contact,0.2second pause/reverse and AA per-collision speed increase','Contact damage,0.6second disabling continuous bounce,then full landing stun;unscaled rehit timeout','Spell immunity/basic purge/disarm without blanket silence;real native Stop Rolling'],remaining:['One-second steering is an explicit AI order policy;arbitrary native input orders are outside this simulator','Wiki0.6bounce conflicts with pinned0.4;vertical bounce/trees/cliffs are outside the flat arena','Piercing hard-control/forced-motion and exact helper HUD/last-spell behavior remain bounded']};
 programs[STOP]={target:'self',castPoint:0,backswing:0,procsOnCast:false,allowZeroCooldown:true,spellStealAs:THUNDER,canCast:c=>!!thunderRun(c)&&!thunderRun(c)?.done&&!!c.caster.rollingThunderStopRequested,cast:c=>{stopThunder(thunderRun(c));delete c.caster.rollingThunderStopRequested;},implemented:['Free native1Stop ends only the current roll without another parent resource debit'],remaining:['Real helper slot does not replace the parent HUD;last-stealable spell semantics remain a declared policy']};
 programs[ROT]={target:'self',castPoint:0,backswing:0,canCastWhileChanneling:true,allowZeroCooldown:true,init:c=>{if(G(c))c.grantAbility?.(DISMEMBER,v(c,'DISMEMBER LEVEL',3));},canCast:c=>{const r=rotRun(c);if(r?.active)return false;if(c.caster.rotToggleOnRequested){if(r)r.offLatch=false;return true;}if(!rotTargets(c).length){if(r)r.offLatch=false;return false;}return !r?.offLatch;},toggleActive:c=>!!rotRun(c)?.active,canToggleOff:c=>!!c.caster.rotToggleOffRequested,toggleOff:stopRot,cast:startRot,onDeath:stopRot,superImplemented:true,gabenImplemented:true,implemented:['Real zero-resource toggle preserves channels and its first-On global tick phase','Independent nonlethal self damage,ordinary-creep double-frequency equal packets,0.5second damaging aura linger','Off stops lingering damage while the aura slow persists;active works under disables','Final AA Super slow/radius/DPS/restoration reduction and real native3Dismember grant'],remaining:['AI manual-Off latch/re-entry is an explicit engineering input policy,not native AI proof','Live rank/item changes and same-name cross-caster aura policy require distinct qualification']};
 programs[DISMEMBER]={...programs[DISMEMBER],target:'enemy',unitTarget:true,castPoint:.3,backswing:0,range:1.6,channel:c=>rotGranted(c)?0:dmDuration(c)+STEP,cast:dismember,onStatusRemoved:(c,s,reason)=>{if(reason!=='dispel'||s.kind!=='dismemberHold'&&s.kind!=='stun')return;const key=String(s.data?.resonantArrowRun??''),run=dmMap(c).get(key);if(run)finishDismember(run);},implemented:['Independent native1to3resources and hero/creep/creepHero inclusive tick counts','Immediate first damage and full raw heal;continuous75pull until125gap','Strong target dispel/invulnerable target/death cleanup;ordinary native channel preserved','Only mechanical Rot-parent grant removes caster channel and retains stun interruption'],remaining:['Live STR and healing amplification coupling;AA non-stun interruption and Soulbind dual-channel lifecycle remain bounded','No unrelated Shard Swallow/Eject mechanics are imported']};
 programs[ARROW]={target:'enemy',pointTarget:true,castPoint:.5,backswing:0,range:30,cast:arrow,superImplemented:true,gabenImplemented:true,implemented:['Frozen ground cursor,real900speed nonhoming collision with51spawn offset','Immune creep blocks without execution;damage precedes strong stun with distance scaling','One shared collision set for Gaben three arrows;only primary triggers native4meteor components','Visible eligible primary-path meteors use real0.57fall and separate child attribution'],remaining:['Pinned115width versus Wiki96and AA3000versus empirical3067are explicit conflicts','Shared-hit skip/consume policy and AAfull impact meteor versus native50percent remain source boundaries','Precise ward/hit-count qualification and visibility changes during released meteor need separate evidence']};
 charged(programs[PULSE],c=>v(c,'CHARGES',G(c)?2:1)>1,c=>v(c,'CHARGES',G(c)?2:1),c=>v(c,'CHARGE RESTORE TIME',18));
}
