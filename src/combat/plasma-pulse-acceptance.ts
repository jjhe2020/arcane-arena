import {BATTLE_CONFIG,skillBalance} from '../config';
import type {BattleState,CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {historicalValue} from './historical-upgrades';
import {addVisualWorldEffect,removeVisualWorldEffect,updateVisualWorldEffect} from './visual-state';
import {plasmaAnnulus,sweptAnnulusIntersects} from '../range-geometry';

const PF='razor_plasma_field',PA='custom_viper_poison_attack',PTA='legion_commander_press_the_attack',ROAR='beastmaster_primal_roar',NOVA='leshrac_pulse_nova',EDICT='leshrac_diabolic_edict';
const STEP=1/30,EPS=1e-8,FOREVER=1_000_000;
const list=(t:CombatUnit)=>t.statuses as EffectStatus[],S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9;
const has=(c:C,t:CombatUnit,kind:string)=>list(t).some(s=>s.kind===kind&&s.until>c.battle.time+EPS);
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const identity=(c:C)=>c.skill.instanceId??c.attackInstanceKey??c.skill.id;
function token(c:C):string{const key=`plasmaPulseSerial:${identity(c)}`;c.caster[key]=Number(c.caster[key]??0)+1;return`${c.caster.id}:${identity(c)}:${c.caster[key]}`;}
const final=(c:C,key:string,extra=0,fallback=0)=>v(c,key,fallback)+(skillBalance(c.definition,c.skill.points)?0:extra);
const vulnerable=(c:C,t:CombatUnit)=>!t.dead&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&!has(c,t,'magicImmune');
const visible=(c:C,t:CombatUnit)=>!has(c,t,'invisible')||has(c,t,'revealed');

function plasma(c:C):void{
 const extension=final(c,'RADIUS',S(c)?400:0)/100,speed=v(c,'WAVE SPEED',636)/100,offset=v(c,'START OFFSET',105)/100,width=v(c,'DAMAGE WIDTH',100)/100,half=extension/speed,total=2*half,start=c.battle.time,key=token(c),seen=[new Set<string>(),new Set<string>()];
 let previous=0,lastDirection=0;
 let visual=addVisualWorldEffect(c.battle,{source:c.caster.id,skill:PF,followUnit:c.caster.id,expiresWithSource:true,points:c.skill.points,layer:'wave',role:'ground_event',kind:'ring',x:c.caster.x,y:c.caster.y,radius:0,previousRadius:0,maxRadius:extension,halfWidth:width/2,...plasmaAnnulus(0,offset,width),phase:'outward',progress:0,until:start+.15});
 const sample=(elapsed:number)=>{
  const direction=elapsed>half+EPS?1:0,wave=direction?Math.max(0,(total-elapsed)*speed):Math.min(extension,elapsed*speed);
  if(direction!==lastDirection){removeVisualWorldEffect(c.battle,visual);visual=addVisualWorldEffect(c.battle,{source:c.caster.id,skill:PF,followUnit:c.caster.id,expiresWithSource:true,points:c.skill.points,layer:'wave',role:'ground_event',kind:'ring',x:c.caster.x,y:c.caster.y,radius:extension,previousRadius:extension,maxRadius:extension,halfWidth:width/2,...plasmaAnnulus(extension,offset,width),phase:'inward',progress:0,until:c.battle.time+.15});}
  const old=direction!==lastDirection?extension:previous;
  updateVisualWorldEffect(c.battle,visual,{x:c.caster.x,y:c.caster.y,previousRadius:visual.radius,radius:wave,...plasmaAnnulus(wave,offset,width),progress:Math.min(1,direction?(elapsed-half)/half:elapsed/half),until:c.battle.time+.15});
  for(const t of c.enemies()){
   const d=dist(t,c.caster);if(seen[direction].has(t.id)||!vulnerable(c,t)||!visible(c,t)||!sweptAnnulusIntersects(d,old,wave,offset,width,BATTLE_CONFIG.bodyRadius))continue;
   seen[direction].add(t.id);const fraction=Math.max(0,Math.min(1,(d-offset)/extension)),min=final(c,'DAMAGE MIN',S(c)?30:0),max=final(c,'DAMAGE MAX',S(c)?30:0);
   c.damage(t,G(c)?max:min+(max-min)*fraction,'magical',false);
   c.status(t,'slow',v(c,'SLOW DURATION'),(v(c,'SLOW MIN')+(v(c,'SLOW MAX')-v(c,'SLOW MIN'))*fraction)/100,{harmful:true,dispel:'basic',data:{instanceKey:`${key}:${direction}`}});
   // AA only states a maximum distance; the retained full-fraction/.3s choice is disclosed in the ledger.
   if(G(c)&&!direction&&d>EPS){const push=extension*v(c,'OUTWARD PUSH MAX FRACTION',40)/100;c.moveContinuous(t,t.x+(t.x-c.caster.x)/d*push,t.y+(t.y-c.caster.y)/d*push,{duration:v(c,'PUSH DURATION',.3)});}
  }
  previous=wave;lastDirection=direction;
 };
 sample(0);let next=start+STEP;
 const tick=()=>{sample(Math.min(total,c.battle.time-start));if(c.battle.time<start+total-EPS){next+=STEP;c.delay(Math.max(STEP,next-c.battle.time),tick);}else removeVisualWorldEffect(c.battle,visual);};c.delay(STEP,tick);
}

function poison(c:C):void{
 const t=c.target;if(t.side===c.caster.side||t.ward||t.building||!vulnerable(c,t))return;
 const key=`poison:${identity(c)}`,old=list(t).find(s=>s.kind==='poisonAttack'&&s.source===c.caster.id&&s.data?.poisonKey===key),cap=final(c,'MAX STACKS',G(c)?3:0),n=Math.min(cap,(old?.value??0)+1),seconds=v(c,'DURATION'),options:Partial<EffectStatus>={harmful:true,dispel:'basic',removeOnDeath:true,data:{poisonKey:key,instanceKey:key}};
 c.status(t,'poisonAttack',seconds,n,options);
 const marker=list(t).find(s=>s.kind==='poisonAttack'&&s.source===c.caster.id&&s.data?.poisonKey===key);if(!marker)return;
 const remaining=marker.until-c.battle.time,components={...options,ignoreStatusResistance:true},mr=final(c,'MAGIC RESISTANCE PER STACK',S(c)?10:0)/100;
 c.status(t,'slow',remaining,n*v(c,'MOVE SLOW PER STACK')/100,components);
 c.status(t,'magicResist',remaining,-n*mr,components);
 c.status(t,'dot',remaining,n*v(c,'DAMAGE PER SECOND'),{...components,interval:v(c,'DAMAGE INTERVAL',1),damageType:'magical'});
 const armor=final(c,'ARMOR REDUCTION PER STACK',G(c)?1:0);if(armor)c.status(t,'armor',remaining,-n*armor,components);
 if(S(c)){
  // Original AA Lua is unrecovered: retain nominal coefficient, at-cap refresh gains and death-reset as explicit working policies.
  const own=list(c.caster).find(s=>s.kind==='magicResist'&&s.skill===PA&&s.data?.poisonLeechKey===key),value=(own?.value??0)+mr;
  c.status(c.caster,'magicResist',FOREVER,value,{dispel:'basic',removeOnDeath:true,data:{poisonLeechKey:key}});
 }
}
function press(c:C):void{
 const radius=v(c,'SUPER RADIUS',S(c)?400:0)/100,targets=S(c)?c.allies().filter(t=>t.id===c.caster.id||dist(t,c.target)<=radius+EPS):[c.target];
 for(const t of targets){
  c.status(t,'regen',v(c,'DURATION'),v(c,'HP REGEN'),{dispel:'basic',removeOnDeath:true});
  c.status(t,'attackSpeed',v(c,'DURATION'),v(c,'BONUS ATTACK SPEED'),{dispel:'basic',removeOnDeath:true});
  c.dispel(t,true,true);
  const seconds=v(c,'SPELL IMMUNITY DURATION',G(c)?2:0);if(seconds)c.status(t,'magicImmune',seconds,0,{dispel:'none',removeOnDeath:true});
 }
}
function roarRemoved(c:C,status:EffectStatus):void{if(!status.data?.roarPush||typeof status.data.motionStartedAt!=='number')return;const motion=c.motionActive?.(c.target);if(motion?.skill===ROAR&&motion.owner.startsWith(`${c.caster.id}:${ROAR}:`)&&motion.startedAt===status.data.motionStartedAt)c.cancelMotion?.(c.target);}
function roar(c:C):void{
 if(c.trySpellBlock?.(c.target))return;
 const origin={x:c.caster.x,y:c.caster.y},end={x:c.target.x,y:c.target.y},distance=dist(origin,end),dx=(end.x-origin.x)/(distance||1),dy=(end.y-origin.y)/(distance||1),width=v(c,'SHOUT WIDTH')/100,key=token(c);
 const damage=final(c,'DAMAGE',S(c)?200:0),stun=final(c,'STUN DURATION',S(c)?1:0),duration=v(c,'SLOW DURATION');
 // The two authored32-frame/24fps clips display this actual directional roar; no extra damage clock.
 for(const layer of ['roar','path_dust'])addVisualWorldEffect(c.battle,{source:c.caster.id,skill:ROAR,points:c.skill.points,layer,kind:'burst',x:(origin.x+end.x)/2,y:(origin.y+end.y)/2,angle:Math.atan2(dy,dx),size:Math.max(3,distance),until:c.battle.time+32/24});
 c.status(c.target,'stun',stun,0,{harmful:true,dispel:'strong',piercesImmunity:true,removeOnDeath:true});c.damage(c.target,damage,'magical',true);
 for(const t of c.enemies()){
  if(t.id===c.target.id||!vulnerable(c,t))continue;
  const x=t.x-origin.x,y=t.y-origin.y,along=x*dx+y*dy,across=-x*dy+y*dx,cap=Math.min(width/2,distance),closest=Math.max(-distance/2+cap,Math.min(distance*1.5-cap,along)),radial=Math.hypot(along-closest,across);
  // Native describes a stadium with fixed300 width; radius convention is retained and bounded in the ledger.
  if(along < -distance/2-BATTLE_CONFIG.bodyRadius-EPS||along>distance*1.5+BATTLE_CONFIG.bodyRadius+EPS||radial>width/2+BATTLE_CONFIG.bodyRadius+EPS)continue;
  c.damage(t,damage,'magical',false);
  const pushSeconds=v(c,'PUSH DURATION',1);
  c.status(t,'stun',pushSeconds,0,{harmful:true,dispel:'basic',removeOnDeath:true,data:{instanceKey:`${key}:push`,roarPush:key}});
  c.status(t,'slow',duration,Math.abs(v(c,'MOVEMENT SLOW'))/100,{harmful:true,dispel:'basic',removeOnDeath:true});
  c.status(t,'attackSpeed',duration,v(c,'ATTACK SLOW'),{harmful:true,dispel:'basic',removeOnDeath:true});
  if(G(c))c.status(t,'stun',stun,0,{harmful:true,dispel:'strong',removeOnDeath:true,data:{instanceKey:`${key}:gaben`}});
  if(Math.abs(across)>EPS&&!t.roshan){const sign=Math.sign(across),push=v(c,'PUSH DISTANCE',450)/100;t.facing=Math.atan2(dx*sign,-dy*sign);c.moveContinuous(t,t.x-dy*sign*push,t.y+dx*sign*push,{duration:pushSeconds,lockActions:true});const marker=list(t).find(s=>s.data?.roarPush===key),motion=c.motionActive?.(t);if(marker?.data&&motion)marker.data.motionStartedAt=motion.startedAt;}
 }
 for(const t of c.allies().filter(t=>(t.id===c.caster.id||t.owner===c.caster.id)&&dist(t,c.caster)<=v(c,'OWNED MOVE SPEED RADIUS',900)/100+EPS))c.status(t,'haste',v(c,'MOVE SPEED DURATION',3),v(c,'MOVE SPEED BONUS',40)/100,{dispel:'basic',removeOnDeath:true});
}

interface NovaRun {c:C;key:string;active:boolean;next:number;nextEdict:number}
const novaRuns=new WeakMap<BattleState,Map<string,NovaRun>>();
const novaKey=(c:C)=>`${c.caster.id}:${identity(c)}`;
function novaMap(c:C){let map=novaRuns.get(c.battle);if(!map){map=new Map;novaRuns.set(c.battle,map);}return map;}
const novaActive=(c:C)=>list(c.caster).some(s=>s.kind==='pulseNova'&&s.skill===NOVA&&s.source===c.caster.id&&s.until>c.battle.time+EPS);
const novaTargets=(c:C)=>c.enemies().filter(t=>vulnerable(c,t)&&dist(t,c.caster)<=v(c,'RADIUS')/100+EPS);
function stopNova(c:C):void{
 const run=novaMap(c).get(novaKey(c)),wasActive=!!run?.active||novaActive(c);if(run)run.active=false;
 if(wasActive&&!c.caster.dead)addVisualWorldEffect(c.battle,{source:c.caster.id,skill:NOVA,points:c.skill.points,layer:'stop',kind:'proc',x:c.caster.x,y:c.caster.y,until:c.battle.time+12/24});
 c.caster.statuses=list(c.caster).filter(s=>!(s.kind==='pulseNova'&&s.skill===NOVA&&s.source===c.caster.id));
 delete c.caster.pulseNovaToggleOffRequested;c.startCooldown?.(v(c,'OFF COOLDOWN',1),{force:true});
}
function startNova(c:C):void{
 const interval=v(c,'PULSE INTERVAL',1),start=c.battle.time,run:NovaRun={c,key:token(c),active:true,next:start+interval,nextEdict:start};novaMap(c).set(novaKey(c),run);
 c.status(c.caster,'pulseNova',FOREVER,0,{dispel:'none',removeOnDeath:true,data:{novaToken:run.key}});
 const pulse=()=>{
  // Authored pulse atlas:16frames at24fps. Presentation lifetime never schedules a damage instance.
  addVisualWorldEffect(c.battle,{source:c.caster.id,skill:NOVA,points:c.skill.points,layer:'pulse',kind:'pulse',x:c.caster.x,y:c.caster.y,radius:v(c,'RADIUS')/100,until:c.battle.time+16/24});
  for(const t of novaTargets(c))c.damage(t,v(c,'DAMAGE'),'magical',false,{flags:{damageOverTime:true}});};
 const edict=()=>{if(S(c)&&c.battle.time>=run.nextEdict-EPS){c.castAbility(EDICT,4,c.caster,{ALL_TARGETS:G(c)?1:0});run.nextEdict+=v(c,'EDICT RENEW INTERVAL',10);}};
 pulse();edict();
 const tick=()=>{
  if(!run.active)return;if(c.caster.dead||!novaActive(c)){stopNova(c);return;}
  if(c.battle.time>=run.next-EPS){const cost=v(c,'MANA/SEC')*interval;if(c.caster.mana+EPS<cost){stopNova(c);return;}c.mana(c.caster,-cost);pulse();edict();run.next+=interval;}
  c.delay(STEP,tick);
 };c.delay(STEP,tick);
}
function edict(c:C):void{
 const n=(key:string,fallback?:number)=>historicalValue(EDICT,key,c.skill.points,fallback),duration=n('AbilityDuration'),count=n('num_explosions'),interval=duration/count,start=c.battle.time,all=v(c,'ALL_TARGETS',0)!==0;
 const explode=()=>{const targets=c.enemies().filter(t=>vulnerable(c,t)&&dist(t,c.caster)<=n('radius')/100+EPS);if(!targets.length)return;for(const t of all?targets:[targets[Math.floor(c.random()*targets.length)]])c.damage(t,n('AbilityDamage'),'pure',false);};
 explode();let index=1;const tick=()=>{explode();index++;if(index<count)c.delay(Math.max(STEP,start+index*interval-c.battle.time),tick);};if(count>1)c.delay(interval,tick);
}

/** Final opt-in overrides. Unknown custom-AA timing policies remain disclosed in the acceptance ledger. */
export function applyPlasmaPulseAcceptance(programs:Record<string,SkillProgram>):void{
 programs[PF]={target:'self',castPoint:0,backswing:0,canCast:c=>c.enemies().some(t=>visible(c,t)&&vulnerable(c,t)&&dist(t,c.caster)<=final(c,'RADIUS',S(c)?400:0)/100+2.05),cast:plasma,superImplemented:true,gabenImplemented:true,implemented:['Caster-centered constant-speed swept outward/inward rings','Independent directional slow instances; invisible immunity dispatch','Final AA radius/damage; Gaben damage independent from slow'],remaining:['Ring hull/width convention and custom push trajectory are explicit working policies','Flying vision and trees are outside this arena; caster-death behavior not original-AA proven']};
 programs[PA]={passive:true,handlesBreak:true,init:c=>{const range=final(c,'BONUS ATTACK RANGE',S(c)?150:0);if(range)c.status(c.caster,'range',FOREVER,range/100,{dispel:'none',removeOnDeath:false});},beforeAttackDamage:poison,onStatusRemoved:(c,s)=>{if(s.kind!=='poisonAttack'||!s.data?.poisonKey)return;c.target.statuses=list(c.target).filter(x=>x.source!==s.source||x.skill!==PA||x.data?.poisonKey!==s.data?.poisonKey);},superImplemented:true,gabenImplemented:true,implemented:['Apply one refreshed whole poison stack before main attack damage','One-second DOT clock with additive own MR and independent providers','Ward/immunity exclusion; final8stack armor upgrade; successful-application-only leech'],remaining:['AA infinite leech lifetime, cap-refresh and nominal coefficient policies need original Lua','Building Shard clause is not imported from partially matched AA upgrade; clone/illusion exact qualification remains bounded']};
 programs[PTA]={target:'ally',range:7,castPoint:.2,backswing:.93,targetSelector:(c,targets)=>targets.filter(t=>t.hp<t.maxHp*.8-EPS).sort((a,b)=>dist(a,c.caster)-dist(b,c.caster)||a.id.localeCompare(b.id))[0],cast:press,superImplemented:true,gabenImplemented:true,implemented:['Nearest below80percent AA target AI','Buff then strong dispel then separate immunity','Target-centered400 Super area plus guaranteed caster; final AA regeneration/AS/immunity'],remaining:['AA self-eligible nearest ally policy is explicit; native point-target talent is not imported']};
 programs[ROAR]={target:'enemy',unitTarget:true,spellBlockTiming:'program',castPoint:.5,backswing:.63,range:c=>(S(c)?8:6),cast:roar,onStatusRemoved:roarRemoved,superImplemented:true,gabenImplemented:true,implemented:['Primary stun-before-piercing-damage; secondary damage-before-control and immunity exclusion','One-second450 continuous side knockback, collinear disable without displacement','Strong primary stun despite AA category conflict; owned-unit haste and final upgrade fields'],remaining:['Stadium width/hull edge convention, courier contradiction and obstacle termination require precise boundary review']};
 programs[NOVA]={target:'self',castPoint:0,backswing:0,canCastWhileChanneling:true,cooldownStart:'effectEnd',allowZeroCooldown:true,canCast:c=>!novaActive(c)&&novaTargets(c).length>0,toggleActive:novaActive,canToggleOff:c=>!!c.caster.pulseNovaToggleOffRequested||novaTargets(c).length===0,toggleOff:stopNova,cast:startNova,superImplemented:true,gabenImplemented:true,implemented:['Immediate activation damage, one-second delayed upkeep, finite standalone active state','Real zero-cost Off keeps existing actions and fixed resettable cooldown','Death-only native marker; Super immediate native4 Edict and Gaben full all-target explosions'],remaining:['Original AA Edict renewal cadence and Off hook/disabled/AI policy are source-pending','AA StrongOnly metadata conflicts with historical Death modifier']};
 programs[EDICT]={...programs[EDICT],target:'self',cast:edict,implemented:['Forty independent pure explosions at0 through9.75 seconds','Random no-priority target including invisible/building; follows source and continues at corpse','AA Gaben explicit all-target override preserves each full native4 explosion'],remaining:['No fog/building economy exists; original-AA renewal trigger policy remains on parent ledger']};
}
