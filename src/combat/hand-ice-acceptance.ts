import {skillBalance} from '../config';
import type {CombatUnit,SkillDefinition} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {addVisualWorldEffect} from './visual-state';

const HAND='chen_hand_of_god',GRACE='custom_omniknight_repel',HEX='custom_shadow_shaman_voodoo',DIVE='phoenix_icarus_dive',BLAST='custom_ancient_apparition_ice_blast',MARTYR='chen_martyrdom',STOP='phoenix_icarus_dive_stop',RELEASE='ancient_apparition_ice_blast_release';
const STEP=1/30,EPS=1e-8;
const S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9;
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const has=(c:C,u:CombatUnit,kind:string)=>statuses(u).some(s=>s.kind===kind&&s.until>c.battle.time+EPS);
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const identity=(c:C)=>c.skill.instanceId??c.skill.id;
const sequence=(c:C)=>{c.caster.handIceSequence=Number(c.caster.handIceSequence??0)+1;return`${identity(c)}:${c.caster.handIceSequence}`;};
const ordinary=(t:CombatUnit)=>!t.dead&&!t.building&&!t.ward&&!t.courier;
const hero=(t:CombatUnit)=>ordinary(t)&&!t.illusion&&(!t.summoned||!!t.heroClone);
const own=(c:C,s:EffectStatus)=>s.source===c.caster.id&&s.skill===c.skill.id;
const compiled=(c:C)=>!!skillBalance(c.definition,c.skill.points);

interface HandValues {initial:number;perSecond:number;duration:number;interval:number;armor:number;purge:boolean;provider:string}
function handValues(c:C):HandValues{return{initial:v(c,'INITIAL HEAL')+(!compiled(c)&&S(c)?280:0),perSecond:v(c,'HEAL PER SECOND'),duration:v(c,'HOT DURATION',8),interval:v(c,'HEAL INTERVAL',1),armor:v(c,'ARMOR BONUS',S(c)?6:0),purge:G(c),provider:c.caster.id};}
/** AA explicitly puts the large heal first. The eight subsequent heals are
 * independent heal instances, rather than per-frame health regeneration. */
function healHand(c:C,target:CombatUnit,values:HandValues,factor=1):void{
 const token=sequence(c),options:Partial<EffectStatus>={dispel:'basic',removeOnDeath:true,affectsInvulnerable:true,piercesImmunity:true,data:{handToken:token}};
 c.status(target,'handOfGodHot',values.duration,values.perSecond*factor,options);
 const marker=statuses(target).find(s=>s.kind==='handOfGodHot'&&own(c,s)&&s.data?.handToken===token);
 if(values.armor)c.status(target,'armor',values.duration,values.armor,{...options,data:{handToken:token,uniqueGroup:'handOfGodArmor',stacking:'strongest'}});
 c.heal(target,values.initial*factor);
 if(values.purge)c.dispel(target,true);
 if(!marker)return;
 const tick=(scheduled:number)=>{
  if(target.dead||marker.data?.handToken!==token||marker.data?.removed==='dispel'||scheduled>marker.until+EPS)return;
  if(!target.statuses.includes(marker)&&marker.data?.removed!=='expire')return;
  c.heal(target,values.perSecond*factor*values.interval);
  const next=scheduled+values.interval;if(next<=marker.until+EPS)c.delay(Math.max(STEP,next-c.battle.time),()=>tick(next));
 };
 c.delay(values.interval,()=>tick(c.battle.time));
}
function hand(c:C):void{
 const values=handValues(c);
 for(const t of c.allies().filter(t=>!t.dead&&(hero(t)||t.owner===c.caster.id)))healHand(c,t,values);
 if(G(c))for(const t of c.allies().filter(t=>!t.dead&&t.summoned)){
  // AA grants on this cast, including another ally's current summons. The
  // transferred action belongs to that body and remains after Chen dies.
  t.handIceMartyrSnapshot={...values};c.grantAbilityTo?.(t,MARTYR,1);
 }
}
function martyrValues(c:C):HandValues|undefined{return c.caster.handIceMartyrSnapshot as HandValues|undefined;}
function martyrProvider(c:C,values:HandValues):CombatUnit|undefined{return c.battle.units.find(t=>t.id===values.provider);}
function martyr(c:C):void{
 const values=martyrValues(c);if(!values||!ordinary(c.target)||c.target.side!==c.caster.side)return;
 const provider=martyrProvider(c,values),key='handIceMartyrSharedReady';
 const providerState=(provider?.skillState??{}) as Record<string,number>;if(Number(providerState[key]??0)>c.battle.time+EPS)return;
 const ready=c.battle.time+(skillBalance(c.definition,c.skill.points)?.cooldown??8);
 if(provider){const state=(provider.skillState??={}) as Record<string,number>;state[key]=ready;}
 for(const body of c.battle.units.filter(t=>(t.handIceMartyrSnapshot as HandValues|undefined)?.provider===values.provider))for(let i=0;i<body.skills.length;i++)if(body.skills[i]?.id===MARTYR)body.cooldowns[i]=Math.max(body.cooldowns[i]??0,ready);
 healHand(c,c.target,values,v(c,'HEAL FACTOR',50)/100);
 // A sacrifice is an uncredited death, not damage or an enemy execution.
 c.despawn?.(c.caster);
}
export const HAND_ICE_CHILD_DEFINITIONS:SkillDefinition[]=[{
 id:MARTYR,name:'殉道',nameEn:'Martyrdom',description:'牺牲召唤物，对友方英雄施放50%治疗量的单体上帝之手。',descriptionEn:'AA Hand of Gaben grants this body a single-target half-heal Hand of God sacrifice.',values:['HEAL FACTOR: 50','AI LOW HEALTH THRESHOLD: 40'],cooldowns:[8],mana:[0],categories:['ABILITY: Unit Target','PIERCES SPELL IMMUNITY: Yes'],tags:['healing'],icon:'',super:'',gaben:'',passive:false,ultimate:false,grantedOnly:true,balanceDomain:'native',visualParentId:HAND,historicalSource:{id:MARTYR,date:'2023-02-10; AA half-heal override'}
},{id:STOP,name:'停止烈火精灵',nameEn:'Stop Icarus Dive',description:'立即停止当前烈火精灵冲刺。',descriptionEn:'Immediately stops the current Icarus Dive. Default AI completes the ellipse; an explicit stop request uses this real action.',values:[],cooldowns:[0],mana:[0],categories:['ABILITY: No Target'],tags:[],icon:'',super:'',gaben:'',passive:false,ultimate:false,grantedOnly:true,balanceDomain:'native',visualParentId:DIVE,historicalSource:{id:STOP,date:'2023-02-10 zero-point immediate helper'}},
{id:RELEASE,name:'释放冰晶爆轰',nameEn:'Release Ice Blast',description:'在当前示踪弹位置释放冰球。',descriptionEn:'Releases Ice Blast at the current tracer position. Default AI requests release when its frozen point is reached.',values:[],cooldowns:[1],mana:[0],categories:['ABILITY: No Target'],tags:[],icon:'',super:'',gaben:'',passive:false,ultimate:true,grantedOnly:true,balanceDomain:'native',visualParentId:BLAST,historicalSource:{id:RELEASE,date:'2023-02-10 zero point and one-second cooldown'}}];
export const HAND_ICE_CHILD_PROGRAMS:Record<string,SkillProgram>={
 [MARTYR]:{target:'ally',castPoint:.3,backswing:.93,range:999.99,
  targetEligibility:(c,t)=>ordinary(t)&&t.side===c.caster.side&&hero(t)&&!has(c,t,'invulnerable')&&!has(c,t,'banished'),
  targetSelector:(c,candidates)=>candidates.filter(t=>t.hp/t.maxHp<v(c,'AI LOW HEALTH THRESHOLD',40)/100).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id.localeCompare(b.id))[0],
  canCast:c=>{const values=martyrValues(c);if(!values)return false;return Number((martyrProvider(c,values)?.skillState as Record<string,number>|undefined)?.handIceMartyrSharedReady??0)<=c.battle.time+EPS;},
  cast:martyr,implemented:['Real recipient-owned action, cast point, shared provider cooldown and disable eligibility','AA half initial/periodic healing, inherited armor and strong cleanse','Uncredited sacrifice and surviving released HoT'],remaining:['AA 50%-value wording does not independently prove halving armor or buff duration; current branch halves healing only','AI40% target selection and retained grant after provider loses Hand are explicit project policies']},
 [STOP]:{target:'self',castPoint:0,backswing:0,allowZeroCooldown:true,procsOnCast:false,canCast:c=>!!dives.get(c.caster)?.active&&c.caster.handIceDiveStopRequested===true,cast:c=>{delete c.caster.handIceDiveStopRequested;const state=dives.get(c.caster);if(state)stopDive(state);},implemented:['Real zero-resource zero-point stop action during an active Dive','Default AI does not issue an early-stop request'],remaining:['Stop interaction with simultaneous channels, silence exemptions and native Spell Steal qualification require precise historical evidence']},
 [RELEASE]:{target:'self',castPoint:0,backswing:1.1,procsOnCast:false,spellStealAs:BLAST,canCast:c=>{const state=blasts.get(c.caster);return!!state?.active&&!state.released&&c.caster.handIceBlastReleaseRequested===true;},cast:c=>{delete c.caster.handIceBlastReleaseRequested;const state=blasts.get(c.caster);if(state)releaseBlast(state);},implemented:['Real zero-point one-second-cooldown release action at the current tracer point','No second parent mana or cooldown consumption; Spell Steal maps to its parent'],remaining:['Silence and simultaneous-channel helper exceptions need historical evidence; hidden helper slot presentation is not a UI replacement']}
};

function grace(c:C):void{
 const targets=new Map([[c.caster.id,c.caster],[c.target.id,c.target]]),duration=v(c,'DURATION');
 for(const t of targets.values()){
  c.dispel(t,true);
  const options:Partial<EffectStatus>={dispel:G(c)?'none':'basic',piercesImmunity:true,removeOnDeath:true};
  c.status(t,'strength',duration,v(c,'BONUS STRENGTH')+(!compiled(c)&&G(c)?50:0),options);
  c.status(t,'regen',duration,v(c,'HP REGEN')+(!compiled(c)&&S(c)?20:0),options);
  c.status(t,'statusResistance',duration,v(c,'STATUS RESISTANCE',S(c)?50:0)/100,options);
 }
}
function hex(c:C):void{
 const point=c.castPosition??c.target,radius=v(c,'AREA RADIUS',G(c)?400:0)/100;
 const targets=radius?c.enemies().filter(t=>distance(t,point)<=radius):[c.target];
 for(const t of targets.filter(ordinary)){
  if(has(c,t,'invulnerable')||has(c,t,'banished')||has(c,t,'magicImmune'))continue;
  if(t.illusion){c.execute(t);continue;}
  const options:Partial<EffectStatus>={harmful:true,dispel:'none',removeOnDeath:true,data:{baseMoveSpeed:v(c,'BASE MOVE SPEED',100)/100}};
  c.status(t,'hex',v(c,'DURATION'),0,options);
  if(S(c))c.status(t,'break',v(c,'DURATION'),0,{...options,data:undefined});
 }
}

interface DiveState {context:C;token:string;start:number;duration:number;active:boolean;warp:number;equipped:boolean;from:{x:number;y:number};direction:{x:number;y:number};last:{x:number;y:number}}
const dives=new WeakMap<CombatUnit,DiveState>();
function stopDive(state:DiveState):void{
 if(!state.active)return;state.active=false;const c=state.context;
 if(c.motionActive?.(c.caster)?.skill===DIVE)c.cancelMotion?.(c.caster);
 c.caster.statuses=statuses(c.caster).filter(s=>!(own(c,s)&&s.data?.diveToken===state.token));
}
function sweep(from:{x:number;y:number},to:{x:number;y:number},target:CombatUnit,radius:number):boolean{
 const dx=to.x-from.x,dy=to.y-from.y,len=dx*dx+dy*dy,q=len?Math.max(0,Math.min(1,((target.x-from.x)*dx+(target.y-from.y)*dy)/len)):0;
 return Math.hypot(target.x-from.x-q*dx,target.y-from.y-q*dy)<=radius;
}
function dive(c:C):void{
 const old=dives.get(c.caster);if(old)stopDive(old);
 const from={x:c.caster.x,y:c.caster.y},point=c.castPosition??c.target,length=distance(from,point)||1,duration=v(c,'DIVE DURATION',2),token=sequence(c);
 const state:DiveState={context:c,token,start:c.battle.time,duration,active:true,warp:Number(c.caster.warpSequence??0),equipped:c.caster.skills.some(s=>s?.id===DIVE),from,direction:{x:(point.x-from.x)/length,y:(point.y-from.y)/length},last:from};dives.set(c.caster,state);
 delete c.caster.handIceDiveStopRequested;c.grantAbility?.(STOP,1);
 const cost=v(c,'HP COST')/100;if(cost)c.caster.hp=Math.max(1,Math.floor(c.caster.hp*(1-cost)));
 const options:Partial<EffectStatus>={dispel:'none',removeOnDeath:true,data:{diveToken:token,blockedCastingSkills:'custom_phoenix_sun_ray'}};
 for(const kind of ['motionRoot','phased','castWithoutTurning'])c.status(c.caster,kind,duration,0,options);
 if(S(c))c.status(c.caster,'magicImmune',duration,0,options);
 const frame=()=>{
  if(!state.active)return;
  const motion=c.motionActive?.(c.caster),lost=state.equipped&&!c.caster.skills.some(s=>s?.id===DIVE&&(c.skill.instanceId===undefined||s.instanceId===c.skill.instanceId));
  if(c.caster.dead||lost||Number(c.caster.warpSequence??0)!==state.warp||['stun','hex','selfStun','banished','sleep','nightmare','cyclone'].some(k=>has(c,c.caster,k))||(motion&&motion.skill!==DIVE)){stopDive(state);return;}
  const progress=Math.min(1,(c.battle.time-state.start)/duration),angle=progress*Math.PI*2,along=v(c,'DIVE LENGTH')/100*(1-Math.cos(angle))/2,lateral=v(c,'DIVE WIDTH',500)/200*Math.sin(angle);
  const next={x:from.x+state.direction.x*along-state.direction.y*lateral,y:from.y+state.direction.y*along+state.direction.x*lateral};
  if(!c.moveContinuous(c.caster,next.x,next.y,{duration:STEP,ignoreBarriers:true,lockActions:false})){stopDive(state);return;}
  for(const t of c.enemies().filter(t=>ordinary(t)&&sweep(state.last,next,t,v(c,'HIT RADIUS',200)/100))){
   const effects:Partial<EffectStatus>={harmful:true,dispel:'basic',removeOnDeath:true};
   c.status(t,'dot',v(c,'BURN DURATION'),v(c,'DAMAGE PER SECOND'),{...effects,interval:v(c,'BURN INTERVAL',1),damageType:'magical'});
   c.status(t,'slow',v(c,'BURN DURATION'),v(c,'MOVE SLOW')/100,effects);
   c.status(t,'attackSpeed',v(c,'BURN DURATION'),-v(c,'ATTACK SPEED SLOW'),effects);
   if(S(c))c.castAbility('aa_granted_fire_spirits_debuff',4,t);
  }
  state.last={x:c.caster.x,y:c.caster.y};
  if(progress>=1-EPS)stopDive(state);else c.delay(STEP,frame);
 };
 c.delay(STEP,frame);
 if(G(c)){const interval=v(c,'METEOR INTERVAL',.3);for(let elapsed=interval;elapsed<duration-EPS;elapsed+=interval)c.delay(elapsed,()=>{if(state.active&&!c.caster.dead)c.castAbility('aa_granted_meteor_hammer',1,{...c.caster});});}
}

interface BlastState {context:C;token:string;start:number;origin:{x:number;y:number};destination:{x:number;y:number};position:{x:number;y:number};released:boolean;active:boolean}
const blasts=new WeakMap<CombatUnit,BlastState>();
function shatter(c:C,target:CombatUnit,damageSource:CombatUnit):void{
 if(target.dead||target.illusion||has(c,target,'invulnerable')||has(c,target,'banished')||has(c,target,'berserk')||has(c,target,'undying'))return;
 const marker=statuses(target).find(s=>s.kind==='iceBlastFrostbite'&&own(c,s)&&s.until>=c.battle.time-EPS);
 if(!marker||target.hp/target.maxHp>=Number(marker.value??0))return;
 // Self damage grants Ancient Apparition the kill; other actual attackers keep
 // their own kill credit. The execution still identifies this Ice Blast.
 const source=damageSource.id===target.id?c.caster:damageSource;
 c.executeFrom?.(source,target);
}
function frostbite(c:C,target:CombatUnit,castToken:string):void{
 if(!ordinary(target)||has(c,target,'invulnerable')||has(c,target,'banished'))return;
 const duration=v(c,'FROSTBITTEN DURATION'),existing=statuses(target).find(s=>s.kind==='iceBlastFrostbite'&&own(c,s));
 if(existing?.data?.castToken===castToken){
  for(const status of statuses(target).filter(s=>own(c,s)&&s.data?.castToken===castToken))status.until=c.battle.time+Number(existing.data?.appliedDuration??duration);
  return;
 }
 const token=sequence(c),data={castToken,iceToken:token},options:Partial<EffectStatus>={harmful:true,dispel:'strong',piercesImmunity:true,removeOnDeath:true,data};
 c.status(target,'iceBlastFrostbite',duration,(v(c,'SHATTER HEALTH THRESHOLD')+(!compiled(c)&&S(c)?4:0))/100,options);
 const marker=statuses(target).find(s=>s.kind==='iceBlastFrostbite'&&own(c,s));if(!marker)return;
 const effectiveDuration=marker.until-c.battle.time;
 marker.data={...marker.data,appliedDuration:effectiveDuration};
 for(const kind of ['healReduction','healthFreeze'])c.status(target,kind,effectiveDuration,1,{...options,ignoreStatusResistance:true});
 const interval=v(c,'FROSTBITE INTERVAL',1);
 const tick=()=>{
  if(target.dead||marker.data?.iceToken!==token||marker.data?.removed==='dispel'||c.battle.time>marker.until+EPS)return;
  if(!target.statuses.includes(marker)&&marker.data?.removed!=='expire')return;
  c.damage(target,v(c,'FROSTBITTEN DAMAGE PER SECOND')*interval,'magical',true);
  // The native periodic threshold check still runs when mitigation or a
  // deferred-damage protector makes this tick's effective HP damage zero.
  shatter(c,target,c.caster);
  if(c.battle.time+interval<=marker.until+EPS)c.delay(interval,tick);
 };
 c.delay(interval,tick);
}
function releaseBlast(state:BlastState):void{
 if(state.released||!state.active)return;state.released=true;const c=state.context,destination={...state.position},length=distance(state.origin,destination),angle=Math.atan2(destination.y-state.origin.y,destination.x-state.origin.x);
 const tracerDuration=c.battle.time-state.start,radius=Math.min(v(c,'MAX IMPACT RADIUS',1000),v(c,'MIN IMPACT RADIUS',275)+v(c,'RADIUS GROW PER SECOND',50)*tracerDuration)/100;
 const speed=Math.max(v(c,'HAIL MIN SPEED',750)/100,length/v(c,'HAIL MAX TRAVEL TIME',1.75)),pathRadius=v(c,'PATH RADIUS',275)/100;
 const touch=(position:{x:number;y:number})=>{for(const t of c.enemies().filter(t=>distance(t,position)<=pathRadius))frostbite(c,t,state.token);};
 const impact=()=>{
  if(!state.active)return;state.active=false;
  addVisualWorldEffect(c.battle,{source:c.caster.id,skill:BLAST,points:c.skill.points,layer:'burst',kind:'burst',...destination,radius,until:c.battle.time+16/24});
  if(S(c))c.castAbility('ancient_apparition_ice_vortex',4,{...c.target,...destination});
  for(const t of c.enemies().filter(t=>ordinary(t)&&distance(t,destination)<=radius)){
   frostbite(c,t,state.token);c.damage(t,v(c,'IMPACT DAMAGE'),'magical',true);
  }
 };
 if(length<=EPS){impact();return;}
 c.linearProjectile({origin:state.origin,angle,distance:length,speed,width:pathRadius,onMove:touch,onEnd:impact,effect:t=>frostbite(c,t,state.token)});
}
function blast(c:C):void{
 const previous=blasts.get(c.caster);if(previous&&!previous.released)previous.active=false;
 const origin={x:c.caster.x,y:c.caster.y},destination={...(c.castPosition??c.target)},length=distance(origin,destination),state:BlastState={context:c,token:sequence(c),start:c.battle.time,origin,destination,position:origin,released:false,active:true};blasts.set(c.caster,state);
 delete c.caster.handIceBlastReleaseRequested;c.grantAbility?.(RELEASE,1);
 if(G(c))for(const t of c.enemies().filter(ordinary))c.castAbility('ancient_apparition_cold_feet',4,t);
 if(length<=EPS){releaseBlast(state);return;}
 // Autonomous battle policy releases when the tracer reaches the frozen AI
 // cursor. Tracer flight has no combat effect; only the released hail applies.
 c.linearProjectile({origin,angle:Math.atan2(destination.y-origin.y,destination.x-origin.x),distance:length,speed:v(c,'TRACER SPEED',1500)/100,width:0,shouldContinue:()=>state.active&&!state.released,onMove:point=>{state.position=point;},onEnd:()=>{c.caster.handIceBlastReleaseRequested=true;},effect:()=>{}});
}

export function applyHandIceAcceptance(registry:Record<string,SkillProgram>):void{
 Object.assign(registry,HAND_ICE_CHILD_PROGRAMS);
 registry[HAND]={target:'self',cast:hand,onStatusRemoved:(_c,status,reason)=>{if(status.kind==='handOfGodHot')status.data={...status.data,removed:reason};},superImplemented:true,gabenImplemented:true,implemented:['AA global eligible heroes and caster-controlled units','Initial heal then refreshable one-second heal instances with immunity/hidden support','Super final heal/armor/CD and real recipient-owned Gaben Martyrdom'],remaining:['AA immediate initial heal versus indexed native first-one-second wording is an explicit AA ordering interpretation','Cross-caster HoT replacement and nonancient creep-hero controlled-body exceptions require exact AA evidence','Martyrdom50% nonhealing component and removal when provider loses Hand remain scoped custom boundaries']};
 registry[GRACE]={target:'ally',cast:grace,superImplemented:true,gabenImplemented:true,implemented:['Strong dispel and independent self plus target buffs','Final AA strength, regen, status resistance and undispellable Gaben components'],remaining:['AA hybrid legacy Grace versus active2023 martyr per-dispel bonuses and buff/dispel order require original AA source','Current .25 point/.2 backswing retained pending precise AA timing source']};
 registry[HEX]={target:'enemy',unitTarget:c=>!G(c),pointTarget:c=>G(c),targetEligibility:(c,t)=>ordinary(t)&&t.side!==c.caster.side&&(c.canTarget?.(t,!G(c))??true)&&(G(c)||!has(c,t,'magicImmune')),spellBlockTiming:'program',cast:c=>{if(!G(c)&&c.trySpellBlock?.(c.target))return;hex(c);},superImplemented:true,gabenImplemented:true,implemented:['AA undispellable Hex and Super break','Native100 base movement speed plus modifiers and instant illusion destruction','Gaben frozen ground400area with no unit Spell Block'],remaining:['AA400area targeting model is a point-area compatibility interpretation pending modified Lua','Overlapping different-caster transformation priority requires dedicated native evidence']};
 registry[DIVE]={target:'enemy',pointTarget:true,cast:dive,canCast:c=>!has(c,c.caster,'root')&&!has(c,c.caster,'soulbind')&&!has(c,c.caster,'leash')&&!dives.get(c.caster)?.active,onDeath:c=>{const state=dives.get(c.caster);if(state)stopDive(state);},onAbilityExecuted:c=>{if(c.executedAbility?.id==='phoenix_supernova'){const state=dives.get(c.caster);if(state)stopDive(state);}},superImplemented:true,gabenImplemented:true,implemented:['Two-second clockwise ellipse with native500minoraxis/200sweptcontact and AA distance/cost','Actions allowed without spell-facing during travel, ordinary walking locked','Stun/hex/sleep/cyclone/foreign-motion/warp/source-loss cleanup; root/silence retained flight','Super immunity and max Fire Spirits; Gaben released meteors every.3s','Real zero-point Stop helper obeys action eligibility; explicit request is independent of the full-flight default AI'],remaining:['Battle UI does not expose manual helper commands; deterministic AI uses the full-flight default unless explicitly requested','Standalone transforming Supernova is absent from catalog; independent SunRay egg is not substituted','Terrain elevation/tree destruction and exact nonuniform native ellipse easing remain environment/shape boundaries']};
 registry[BLAST]={target:'enemy',pointTarget:true,cast:blast,onDeath:c=>{const state=blasts.get(c.caster);if(state&&!state.released)releaseBlast(state);},onAffectedUnitDamage:(c,status)=>{if(status.kind!=='iceBlastFrostbite')return;const source=c.battle.units.find(t=>t.id===c.triggerUnitId)??c.caster;shatter(c,c.target,source);},onStatusRemoved:(c,status,reason)=>{
  if(status.kind!=='iceBlastFrostbite'&&status.kind!=='healReduction'&&status.kind!=='healthFreeze')return;
  status.data={...status.data,removed:reason};if(reason!=='dispel')return;
  const token=status.data.iceToken;c.target.statuses=statuses(c.target).filter(s=>!(own(c,s)&&s.data?.iceToken===token));
 },superImplemented:true,gabenImplemented:true,implemented:['Frozen ground tracer then separately released hail,750minimum and historical1.75maximum flight','Tracer-time radius growth, path refresh and frostbite before piercing impact','One-second AA DOT, strong-discharge linked heal/attribute freeze, actual damage-source shatter credit and illusion/minimum-health exceptions','Super vortex before damage; Gaben max Cold Feet globally at cast'],remaining:['Manual Release choice/UI and finite arena boundary are explicit project targeting policies','Status resistance refresh clocks and cross-caster frostbite priority require narrower historical evidence','Winter Curse/Reaper Scythe exclusive kill-credit priority requires a shared execution-priority protocol','FP/BorrowedTime damage-conversion crossings and rare health-setting exceptions require scoped outcome evidence']};
}
