import {BATTLE_CONFIG,skillBalance} from '../config';
import type {CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {independentFraction} from './damage-rules';
import {applyMagmaBurn,magmaStatusRemoved} from './magma-burn';

const STEP=1/30,GRIP='custom_bane_fiends_grip',SOUL='custom_lina_fiery_soul',FINGER='custom_lion_finger_of_death',COOKIE='custom_snapfire_firesnap_cookie',FISSURE='custom_earthshaker_fissure';
const S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9,configured=(c:C)=>!!skillBalance(c.definition,c.skill.points);
const has=(c:C,u:CombatUnit,kind:string)=>u.statuses.some(s=>s.kind===kind&&s.until>c.battle.time);
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const areaEnemy=(c:C,t:CombatUnit,pierces=false)=>!t.dead&&t.side!==c.caster.side&&!t.ward&&!t.building&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&(pierces||!has(c,t,'magicImmune'));
const rewardHero=(u:CombatUnit)=>(!u.summoned||!!u.heroClone)&&!u.illusion&&!u.consideredHero&&!u.tempestDouble;
const read=(c:C,name:string)=>Number((c.caster.skillState as Record<string,number>|undefined)?.[`${c.skill.id}:${name}`]??0);
const gain=(c:C,name:string,n:number)=>{const key=`${c.skill.id}:${name}`,state=(c.caster.skillState??={})as Record<string,number>,gains=(c.caster.permanentSkillGains??={})as Record<string,number>;state[key]=(state[key]??0)+n;gains[key]=(gains[key]??0)+n;};
const executed=(c:C)=>!!c.executedAbility&&c.executedAbility.cooldown>0&&c.executedAbility.procsOnCast;
interface GripRun {key:string;source:string;target:CombatUnit;end:number;done:boolean;actors:CombatUnit[];finish:()=>void}
interface Ridge {from:{x:number;y:number};to:{x:number;y:number};until:number}
function projection(p:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number}){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,f=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return{x:a.x+dx*f,y:a.y+dy*f};}

/** AA custom clauses plus pinned native mechanisms. Unrecovered AA grants,
 * geometry and growth windows remain explicit in the associated ledger. */
export function applyFireFissureAcceptance(registry:Record<string,SkillProgram>):void{
 const runs=new WeakMap<C['battle'],Map<string,GripRun>>(),cooldownClocks=new WeakMap<C['battle'],Map<string,number>>();
 const records=(c:C)=>{let r=runs.get(c.battle);if(!r){r=new Map();runs.set(c.battle,r);}return r;};
 const grip=registry[GRIP];
 const gripSeconds=(c:C)=>v(c,'CHANNEL TIME',S(c)?12:c.skill.points>=3?6:c.skill.points>=2?5.5:5);
 const resistance=(c:C)=>1-Math.min(.9,independentFraction(statuses(c.target).filter(s=>s.kind==='statusResistance'&&s.until>c.battle.time&&!(s.passive&&has(c,c.target,'break'))).map(s=>s.value??0),-2));
 grip.target='enemy';grip.pointTarget=false;grip.backswing=0;grip.channel=c=>S(c)?0:gripSeconds(c)*resistance(c);
 grip.targetEligibility=(c,t)=>t.side!==c.caster.side&&!t.ward&&!t.building&&(c.canTarget?.(t)??!t.dead);
 grip.cast=c=>{
  const victim=c.target,nominal=gripSeconds(c),key=`${c.caster.id}:${c.skill.instanceId??GRIP}:${c.battle.time}`;
  // Reading the actual marker duration preserves the engine's resistance and
  // stolen-debuff duration rules without repeatedly refreshing short stuns.
  c.status(victim,'fiendGrip',nominal,1,{harmful:true,dispel:'strong',piercesImmunity:true,maxStacks:Number.MAX_SAFE_INTEGER,data:{instanceKey:key}});
  const marker=statuses(victim).find(s=>s.kind==='fiendGrip'&&s.data?.instanceKey===key);if(!marker)return;
  const seconds=marker.until-c.battle.time,interval=v(c,'DAMAGE INTERVAL',.5)*seconds/nominal,totalTicks=Math.round(nominal/v(c,'DAMAGE INTERVAL',.5));
  c.status(victim,'stun',seconds,0,{harmful:true,dispel:'strong',piercesImmunity:true,ignoreStatusResistance:true,maxStacks:Number.MAX_SAFE_INTEGER,data:{instanceKey:key}});
  c.status(victim,'revealed',seconds,1,{harmful:true,dispel:'strong',piercesImmunity:true,ignoreStatusResistance:true,maxStacks:Number.MAX_SAFE_INTEGER,data:{instanceKey:key}});
  const run:GripRun={key,source:c.caster.id,target:victim,end:c.battle.time+seconds,done:false,actors:[],finish:()=>{}};records(c).set(key,run);
  const finish=()=>{if(run.done)return;run.done=true;records(c).delete(key);victim.statuses=statuses(victim).filter(s=>s.data?.instanceKey!==key);if(S(c)){for(const body of [...run.actors])if(!body.dead)c.despawn?.(body);}else c.endChannel();};run.finish=finish;
  if(S(c)){
   run.actors=c.summon({name:'恶魔掌握幻象',count:v(c,'ILLUSION COUNT',2),hp:c.caster.maxHp,attack:0,attributeAttackScale:0,armor:c.caster.armor,speed:0,lifetime:seconds+STEP,illusion:true,damageTaken:v(c,'ILLUSION DAMAGE TAKEN',200)/100});
   const offset=v(c,'ILLUSION OFFSET',400)/100;run.actors.forEach((body,i)=>{body.fiendsGripActor=true;c.warp(body,c.caster.x+Math.cos(c.caster.facing+Math.PI/2)*(i?offset:-offset),c.caster.y+Math.sin(c.caster.facing+Math.PI/2)*(i?offset:-offset));c.channelUnit?.(body,seconds,()=>{run.actors=run.actors.filter(a=>a!==body);if(!body.dead)c.despawn?.(body);if(!run.actors.length)finish();});});
  }else{run.actors=[c.caster];c.channelUnit?.(c.caster,seconds,finish);}
  if(!run.actors.length){finish();return;}
  if(!cooldownClocks.has(c.battle))cooldownClocks.set(c.battle,new Map());const cdClock=cooldownClocks.get(c.battle)!;if(G(c))cdClock.set(c.caster.id,c.battle.time);
  let tick=0,next=c.battle.time;
  const advance=()=>{
   if(run.done)return;if(victim.dead||has(c,victim,'invulnerable')||has(c,victim,'banished')||!run.actors.some(a=>!a.dead)){finish();return;}
   if(G(c)){const last=cdClock.get(c.caster.id)??c.battle.time,delta=c.battle.time-last;if(delta>0)c.reduceCooldowns?.(c.caster,delta*v(c,'CHANNEL COOLDOWN REDUCTION',10),{onlyAbilityId:GRIP,includeUltimates:true});cdClock.set(c.caster.id,c.battle.time);}
   if(tick<totalTicks&&c.battle.time>=next-1e-8){
    // Separate channels never multiply the native damage/mana stream.
    const winner=[...records(c).values()].find(r=>!r.done&&r.target===victim&&r.actors.some(a=>!a.dead));
    if(winner===run){const actor=run.actors.find(a=>!a.dead)!,step=v(c,'DAMAGE INTERVAL',.5),damage=v(c,'DAMAGE')*step;
     (c.damageFrom?c.damageFrom(actor,victim,damage,'pure',true):c.damage(victim,damage,'pure',true));
     const mana=Math.min(victim.mana,victim.maxMana*v(c,'MANA DRAIN PER SECOND')/100*step);c.mana(actor,mana);c.mana(victim,-mana);
     if(S(c)){const amount=c.damage(victim,victim.maxHp*v(c,'HEALTH DRAIN',5)/100*step,'pure',true);c.heal(c.caster,amount);}
    }tick++;next+=interval;
   }
   if(c.battle.time>=run.end-1e-8){finish();return;}c.delay(STEP,advance);
  };advance();
 };
 grip.onStatusRemoved=(c,s)=>{if(['fiendGrip','stun'].includes(s.kind)&&s.data?.instanceKey)records(c).get(String(s.data.instanceKey))?.finish();};
 grip.onAffectedUnitDeath=(c,s)=>{if(s.kind==='fiendGrip'&&s.data?.instanceKey)records(c).get(String(s.data.instanceKey))?.finish();};
 grip.implemented=['Immediate first pure tick/mana drain;native5/5.5/6seconds and AA+6Super duration','Continuous disable/reveal;status-resistance duration/tick compression preserves total scheduled damage and mana','Real independent channeling illusion bodies;Stop/disable/death destroys that body,remaining channel keeps one damage stream','OfficialAA800cast range;Strong target dispel stops grip despite stale websiteCannot category','Gaben final50second cooldown and10per elapsed channel second once for the owner'];
 grip.remaining=['AA5%maximum-health stealing beneficiary/category is unrecovered;existing extra pure damage and holder heal remain a working interpretation','Simultaneous different-source grips and status-resistance/debuff-amplification extreme stacking require deeper source cases','WebsiteCannot-dispel category conflicts with the more specific officialAA dispel bugfix and nativeStrong behavior'];

 const soul=registry[SOUL];soul.onCast=undefined;soul.handlesBreak=true;
 soul.onAbilityExecuted=c=>{if(!executed(c)||has(c,c.caster,'break'))return;const old=statuses(c.caster).find(s=>s.kind==='fierySoul'&&s.skill===SOUL&&s.source===c.caster.id),cap=v(c,'MAX STACKS',4),count=Math.min(cap===0?Number.MAX_SAFE_INTEGER:cap,(old?.value??0)+v(c,'STACKS PER CAST',G(c)?2:1)),seconds=v(c,'DURATION');
  const options={dispel:'strong' as const,passive:false};c.status(c.caster,'fierySoul',seconds,count,options);c.status(c.caster,'attackSpeed',seconds,count*(v(c,'ATTACK SPEED BONUS')+(!configured(c)&&S(c)?20:0)),options);c.status(c.caster,'haste',seconds,count*(v(c,'MOVE SPEED BONUS')+(!configured(c)&&S(c)?2:0))/100,options);
 };
 soul.onStatusRemoved=(c,s)=>{if(s.skill===SOUL&&['fierySoul','attackSpeed','haste'].includes(s.kind))c.target.statuses=c.target.statuses.filter(t=>!(t.skill===SOUL&&t.source===s.source));};
 soul.implemented=['Explicit AA cast-based execution,not modernhit-based stacks','Only completed nonzero-cooldown/on-cast-qualified releases add stacks;blocked releases and actual queued grants qualify','All stacks refresh8seconds;Super final70AS/9%MS and Gaben unbounded2layers per spell','Break prevents new stacks but existing bonuses survive;AA Strong beneficial dispel clears every component'];
 soul.remaining=['Synthetic free castAbility child effects deliberately retain the engine no-execution-event policy pending originalAA eligibility evidence'];

 const perKillDamage=(c:C)=>v(c,'DAMAGE PER KILL')+(!configured(c)&&S(c)?20:0);
 const finger=registry[FINGER],killBonus=(c:C)=>read(c,'kills')?read(c,'legacyDamage')+read(c,'kills')*perKillDamage(c):read(c,'damage');
 const hpBonus=(c:C)=>read(c,'kills')?read(c,'legacyHp')+read(c,'kills')*(S(c)?v(c,'HEALTH PER KILL',70):0):read(c,'hp');
 const hpChange=(c:C,n:number)=>{if(n<=0)return;const ratio=c.caster.hp/c.caster.maxHp;c.caster.maxHp+=n;if(!c.caster.dead)c.caster.hp=c.caster.maxHp*ratio;};
 finger.init=c=>hpChange(c,hpBonus(c));finger.backswing=.5;finger.onKill=undefined;
 finger.cast=c=>{const targets=G(c)?c.battle.units.filter(t=>areaEnemy(c,t)&&distance(t,c.target)<=v(c,'SPLASH RADIUS',325)/100):[c.target],damage=v(c,'DAMAGE')+killBonus(c)+(!configured(c)&&G(c)?100:0),castKey=`${c.caster.id}:${c.skill.instanceId??FINGER}:${c.battle.time}`;
  for(const target of targets)c.delay(v(c,'DAMAGE DELAY',.25),()=>{if(!areaEnemy(c,target))return;c.status(target,'fingerCredit',v(c,'KILL GRACE',3),0,{harmful:true,dispel:'none',ignoreStatusResistance:true,maxStacks:Number.MAX_SAFE_INTEGER,data:{instanceKey:castKey}});c.damage(target,damage,'magical',false);});
 };
 finger.onAffectedUnitDeath=(c,s)=>{if(s.kind!=='fingerCredit'||s.data?.credited||!rewardHero(c.target))return;s.data??={};s.data.credited=true;const before=hpBonus(c);if(!read(c,'kills')){if(read(c,'damage'))gain(c,'legacyDamage',read(c,'damage'));if(read(c,'hp'))gain(c,'legacyHp',read(c,'hp'));}gain(c,'kills',1);gain(c,'damage',perKillDamage(c));if(S(c))gain(c,'hp',v(c,'HEALTH PER KILL',70));hpChange(c,hpBonus(c)-before);};
 finger.implemented=['300ms cast point/500ms recovery/900native range;250ms delayed magical damage can be avoided by immunity/hidden/invulnerable state','Independent death-credit marks reward allied/denied/self kills,including Reincarnation,while illusions/creep-heroes/TempestDouble give no stack','New persistent kill count makes per-layer damage and SuperHP retroactive;HP bonus preserves current health percentage,not a direct heal','Gaben final950base/20CD and325AOE are consumed once;primarySpellBlock cancels the whole cast'];
 finger.remaining=['AA explicitly greatly extends kill-credit duration but exact seconds are unrecovered;3second native baseline is an editable source-pending candidate','Meepo family deduplication and upgrade-during-delay snapshots require separate identity/version proof','Legacy saved flat damage/HP growth is preserved as anchored legacy amounts;only new kill counters support exact retroactive tier changes'];

 const cookie=registry[COOKIE];cookie.target='ally';cookie.pointTarget=false;cookie.dynamicCastPoint=true;cookie.castPoint=c=>c.target===c.caster?v(c,'SELF CAST POINT',.3):skillBalance(c.definition,c.skill.points)?.castPoint??.2;cookie.dynamicBackswing=c=>c.target===c.caster?v(c,'SELF CAST BACKSWING',0):skillBalance(c.definition,c.skill.points)?.backswing??.57;cookie.projectileDisjointable=false;
 const cookieEligible=(c:C,t:CombatUnit)=>t.side===c.caster.side&&!t.dead&&!t.ward&&!t.building&&!has(c,t,'banished')&&!has(c,t,'invulnerable')&&t.action!=='channel';
 cookie.targetEligibility=cookieEligible;cookie.canCast=c=>c.enemies().some(t=>distance(t,c.target)<=8);
 cookie.init=c=>{if(S(c)){const n=v(c,'HOLDER HEALTH BONUS',200);c.caster.maxHp+=n;c.caster.hp+=n;}};
 const burn=(c:C,target:CombatUnit)=>applyMagmaBurn(c,target,{damagePerSecond:v(c,'KISS DAMAGE PER SECOND',30),slow:v(c,'KISS SLOW',25)/100,interval:v(c,'BURN INTERVAL',.5),linger:v(c,'BURN LINGER',1)});
 const oldCookieRemoval=cookie.onStatusRemoved;cookie.onStatusRemoved=(c,s,reason)=>{oldCookieRemoval?.(c,s,reason);magmaStatusRemoved(c,s,reason);};
 cookie.cast=c=>{const receiver=c.target;const launch=()=>{if(receiver.dead)return;c.projectile(receiver,v(c,'PROJECTILE SPEED',1100)/100,target=>{
   if(!cookieEligible(c,target)||statuses(target).some(s=>String(s.data?.blockedMotionSkills??'').split(',').includes(COOKIE)||(s.skill==='enigma_black_hole'&&s.kind==='stun')))return;
   const seconds=v(c,'HOP DURATION',S(c)?.684:.484),length=(v(c,'HOP DISTANCE')+(!configured(c)&&S(c)?175:0))/100,key=`${c.caster.id}:${COOKIE}:${c.battle.time}`,x=target.x+Math.cos(target.facing)*length,y=target.y+Math.sin(target.facing)*length;let landed=false;
   const land=()=>{if(landed)return;landed=true;target.statuses=statuses(target).filter(s=>s.data?.instanceKey!==key);const point={x:target.x,y:target.y};if(target.dead)return;for(const t of c.battle.units.filter(t=>areaEnemy(c,t)&&distance(t,point)<=v(c,'IMPACT RADIUS')/100)){c.damage(t,v(c,'IMPACT DAMAGE'),'magical',false);c.status(t,'stun',v(c,'IMPACT STUN DURATION'),0,{harmful:true,dispel:'strong'});}if(S(c)){for(const t of c.battle.units.filter(t=>areaEnemy(c,t)&&distance(t,point)<=v(c,'KISS RADIUS',275)/100))c.damage(t,v(c,'KISS IMPACT DAMAGE',300),'magical',false);c.zone({x:point.x,y:point.y,radius:v(c,'KISS RADIUS',275)/100,duration:v(c,'PUDDLE DURATION',3),interval:v(c,'BURN INTERVAL',.5),immediate:true,includeEnd:true,effect:t=>{if(areaEnemy(c,t))burn(c,t);}});}};
   if(S(c))c.heal(target,v(c,'HEAL',200));c.status(target,'phased',seconds,1,{dispel:'none',data:{instanceKey:key}});c.status(target,'selfStun',seconds,1,{dispel:'none',data:{instanceKey:key}});
   if(!c.moveContinuous(target,x,y,{duration:seconds,ignoreBarriers:true,respectSoulbind:true,onEnd:land}))land();
  });};launch();if(G(c))for(let i=1;i<=v(c,'EXTRA COOKIE COUNT',3);i++)c.delay(v(c,'EXTRA COOKIE INTERVAL',1)*i,launch);
 };
 cookie.implemented=['Native nondisjointable1100speed allied projectile;self300ms/zero recovery versus ally200ms/570ms recovery','Arrival checks hidden/invulnerable/channel/Chrono/BlackHole;BKB allies remain eligible','Disabled phased forward425/.484hop or Super600/.684;interrupted motion lands exactly once at actual position','Soulbind boundary constrains each hop frame without banning the cast;ordinary root remains allowed;normal Fissure walls are traversed','AA200heal precedes damage/stun and one max-baseAA300impact/30DPS Mortimer glob;Cookie/Kisses/Spit puddles share one first-source burn','Gaben3additional independent cookie projectiles at one-second intervals'];
 cookie.remaining=['AA200maxHP recipient/duration is unspecified;existing once-per-holder battle bonus is retained as editable working policy','AA grantedKiss level is unspecified;existing max-baseAA glob values are retained','Shared magma first-provider behavior is tested;cross-caster status-resistance and every interruption/refresh order retain separate evidence scope'];

 const fissure=registry[FISSURE];fissure.pointTarget=true;fissure.backswing=0;fissure.onCast=undefined;
 fissure.cast=c=>{const origin={x:c.caster.x,y:c.caster.y},target=c.castPosition??c.target,angle=Math.atan2(target.y-origin.y,target.x-origin.x),dx=Math.cos(angle),dy=Math.sin(angle),length=(v(c,'FISSURE RANGE')+(!configured(c)&&S(c)?320:0))/100,width=v(c,'DAMAGE RADIUS',225)/100,end={x:origin.x+dx*length,y:origin.y+dy*length},victims=c.battle.units.filter(t=>areaEnemy(c,t)&&distance(t,projection(t,origin,end))<=width).sort((a,b)=>(a.x-origin.x)*dx+(a.y-origin.y)*dy-((b.x-origin.x)*dx+(b.y-origin.y)*dy)||a.id.localeCompare(b.id));
  const offset=v(c,'RIDGE START OFFSET',80)/100,segments:Ridge[]=[{from:{x:origin.x+dx*offset,y:origin.y+dy*offset},to:end,until:c.battle.time+v(c,'FISSURE DURATION')}];
  if(G(c)&&victims[0]){const center={x:victims[0].x-dx*offset,y:victims[0].y-dy*offset},from={x:center.x-dy*length/2,y:center.y+dx*length/2},to={x:center.x+dy*length/2,y:center.y-dx*length/2};segments.push({from,to,until:c.battle.time+v(c,'FISSURE DURATION')});for(const t of c.battle.units.filter(t=>areaEnemy(c,t)&&distance(t,projection(t,from,to))<=width))if(!victims.includes(t))victims.push(t);}
  for(const segment of segments)c.barrier({from:segment.from,to:segment.to,width:v(c,'RIDGE WIDTH',80)/100,duration:v(c,'FISSURE DURATION'),blocks:'enemies'});
  c.caster.fissureSegments=[...((c.caster.fissureSegments??[])as Ridge[]).filter(r=>r.until>c.battle.time),...segments];
  for(const t of victims){c.status(t,'stun',v(c,'STUN DURATION'),0,{harmful:true,dispel:'strong'});c.damage(t,v(c,'DAMAGE')+(!configured(c)&&S(c)?80:0),'magical',false);}
 };
 fissure.onBeforeAbilityEffect=c=>{if(!G(c)||!executed(c)||has(c,c.caster,'break'))return;const ridges=((c.caster.fissureSegments??[])as Ridge[]).filter(r=>r.until>c.battle.time),contact=v(c,'RIDGE WIDTH',80)/200+BATTLE_CONFIG.bodyRadius;if(!ridges.some(r=>distance(c.caster,projection(c.caster,r.from,r.to))<=contact+1e-8))return;
  for(const t of c.battle.units.filter(t=>areaEnemy(c,t)&&ridges.some(r=>distance(t,projection(t,r.from,r.to))<=v(c,'AFTERSHOCK RADIUS',300)/100))){c.status(t,'stun',v(c,'AFTERSHOCK STUN',.4),0,{harmful:true,dispel:'strong'});c.damage(t,v(c,'AFTERSHOCK DAMAGE',150),'magical',false);}
 };
 fissure.implemented=['690ms point/zero recovery;instant line stun before damage and timed enemy-blocking ridge;AA allies pass freely','Super final340damage and1720range are consumed once','Gaben perpendicular ridge uses first victim along the ray,not unit-array order;overlap hits once','Pre-effect on-cast gate requires physical contact with an older active own ridge;officialAA400msAftershock stun precedes150damage'];
 fissure.remaining=['Continuous80-wide ridge/start offset are retained flat-arena geometry candidates,not a proof of native24radius/56.25segmentation','ExactAA conditionalAftershock propagation shape is unrecovered;nativeShard-inspired full-own-ridge300radius interpretation is explicit','Secondary ridge extent/offset and cross-tier stolenAftershock identity need originalAA proof'];
}
