import {BATTLE_CONFIG,skillBalance} from '../config';
import type {CombatUnit,SkillDefinition} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {addVisualProjectile,moveVisualProjectile,removeVisualProjectile} from './visual-state';
import {turnTowards} from './movement';

const STEP=1/30,BARRAGE='clinkz_strafe',BURROW='sandking_burrowstrike',CHARGE='custom_spirit_breaker_charge_of_darkness',CHRONO='custom_faceless_void_chronosphere',CHAKRAM='custom_shredder_chakram';
const SECOND='aa_granted_second_chakram',RETURN='aa_return_chakram',RETURN_SECOND='aa_return_second_chakram',CAUSTIC='aa_granted_burrow_caustic_finale',FLAME='aa_granted_throwable_flamethrower',BASH='aa_granted_greater_bash';
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const active=(u:CombatUnit,kind:string,time:number)=>u.statuses.filter(s=>s.kind===kind&&s.until>time) as EffectStatus[];
const amount=(u:CombatUnit,kind:string,time:number)=>active(u,kind,time).reduce((sum,s)=>sum+(s.value??0),0);
const baseCooldown=(c:C)=>c.definition.cooldowns[Math.min(c.definition.cooldowns.length-1,Math.max(0,Math.min(2,c.skill.points-1)))]??0;
const field=(cast:NonNullable<SkillProgram['cast']>,extra:Partial<SkillProgram>={}):SkillProgram=>({target:'enemy',range:7,cast,implemented:[],remaining:[],...extra});
function nativeChild(id:string,name:string,values:string[],extra:Partial<SkillDefinition>={}):SkillDefinition{return{id,name,nameEn:name,description:'升级授予的独立技能；数值与来源见验收记录',descriptionEn:'Granted ability; reference scope recorded in mobility-fields acceptance.',super:'',gaben:'',values,cooldowns:[0],mana:[0],categories:['ABILITY: No Target'],tags:[],icon:'',passive:false,ultimate:false,grantedOnly:true,...extra};}
export const MOBILITY_FIELDS_CHILD_DEFINITIONS:SkillDefinition[]=[
 nativeChild(SECOND,'第二锯齿飞轮',['DAMAGE PER SECOND: 70 / 140 / 210','MANA COST PER SECOND: 14 / 22 / 30','PASS DAMAGE: 110 / 155 / 200','RADIUS: 200','SLOW: 5','BLADE SPEED: 900','BREAK DISTANCE: 2000','DAMAGE INTERVAL: 0.5','PASS SLOW DURATION: 0.5','AURA LINGER: 0.5','HEALTH STEP: 5','RADIAL BLADE COUNT: 10','RADIAL DISTANCE: 1200','AI RETURN EMPTY: 1'],{cooldowns:[8],mana:[75],categories:['ABILITY: Point Target','DAMAGE TYPE: Pure','PIERCES SPELL IMMUNITY: No'],historicalSource:{id:'shredder_chakram_2',date:'2023-02-10'},visualParentId:CHAKRAM}),
 nativeChild(RETURN,'收回锯齿飞轮',[],{visualParentId:CHAKRAM}),nativeChild(RETURN_SECOND,'收回第二锯齿飞轮',[],{visualParentId:CHAKRAM}),
 nativeChild(CAUSTIC,'穿刺腐尸毒',['BASE DAMAGE: 130','MAX HEALTH DAMAGE: 22','RADIUS: 500','DURATION: 6','SLOW: 26'],{categories:['ABILITY: Unit Target','DAMAGE TYPE: Magical','PIERCES SPELL IMMUNITY: No'],historicalSource:{id:'sandking_caustic_finale',date:'2023-02-10'},visualParentId:BURROW}),
];

interface Charges{count:number;maximum:number;next:number|null;recharge:number}
function charges(c:C,maximum:number):Charges{
 const key=`mobilityCharges:${c.skill.id}`;let state=c.caster[key] as Charges|undefined;
 if(!state)state=c.caster[key]={count:maximum,maximum,next:null,recharge:0};
 while(state.next!==null&&state.next<=c.battle.time+1e-8&&state.count<state.maximum){state.count++;state.next=state.count===state.maximum?null:state.next+state.recharge;}
 return state;
}
function spendCharge(c:C,maximum:number,fallbackReduction=0){
 if(maximum<=1)return;const state=charges(c,maximum);state.count--;
 if(state.next===null){state.recharge=Math.max(STEP,v(c,'CHARGE RESTORE TIME',baseCooldown(c)-fallbackReduction)*Math.max(.1,1-amount(c.caster,'cooldownReduction',c.battle.time)));state.next=c.battle.time+state.recharge;}
}
function reduceRecharge(c:C,seconds:number){if(c.skill.points<9)return;const state=charges(c,2);if(state.next===null)return;state.next=Math.max(c.battle.time,state.next-Math.max(0,seconds));charges(c,2);}
function barrage(c:C){
 spendCharge(c,c.skill.points>=9?2:1);const start={x:c.caster.x,y:c.caster.y},point=c.castPosition??c.target,angle=distance(start,point)>1e-9?Math.atan2(point.y-start.y,point.x-start.x):c.caster.facing;
 const bonusRange=(c.attackRange?.(c.caster)??c.caster.range)-c.caster.range,range=v(c,'RANGE')/100+bonusRange,count=v(c,'ARROWS FIRED')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?3:0),channel=v(c,'CHANNEL TIME',2);
 const release=()=>c.linearProjectile({origin:start,angle,distance:Math.max(0,range),speed:v(c,'ARROW SPEED',1200)/100,width:v(c,'ARROW RADIUS',200)/100,effect:target=>{
  if(target.ward||active(target,'physicalImmune',c.battle.time).length||active(target,'attackImmune',c.battle.time).length)return;
  const fraction=(v(c,'DAMAGE PER ARROW')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?35:0))/100;
  // The native target-scoped outgoing modifier also scales conditional damage
  // and immediate on-hit procs, not merely the white attack-damage component.
  const reduction:EffectStatus={kind:'outgoingDamageReduction',until:c.battle.time+STEP,value:1-fraction,source:c.caster.id,skill:BARRAGE,data:{targetId:target.id}};
  c.caster.statuses.push(reduction);try{c.attack(target,1,true,undefined,true,{trueStrike:true,allowInvisibleTarget:true});}finally{c.caster.statuses=c.caster.statuses.filter(s=>s!==reduction);}
 }});
 release();for(let arrow=1;arrow<count;arrow++)c.delay(channel*arrow/count,release,true);
}
function burrow(c:C){
 spendCharge(c,c.skill.points>=9?2:1,c.skill.points>=6?2:0);const origin={x:c.caster.x,y:c.caster.y},point=c.castPosition??c.target,angle=distance(origin,point)>1e-9?Math.atan2(point.y-origin.y,point.x-origin.x):c.caster.facing;
 const maximum=(v(c,'CAST RANGE')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?650:0))/100,range=Math.min(distance(origin,point),maximum),end={x:origin.x+Math.cos(angle)*range,y:origin.y+Math.sin(angle)*range};
 c.status(c.caster,'selfStun',v(c,'SELF DISABLE DURATION',.53),0,{dispel:'none'});
 c.linearProjectile({origin,angle,distance:range,speed:v(c,'BURROW SPEED',2000)/100,width:v(c,'SPIKES RADIUS',150)/100,onEnd:()=>{if(!c.caster.dead)c.warp(c.caster,end.x,end.y);},effect:target=>{
  if(target.ward||active(target,'magicImmune',c.battle.time).length||c.trySpellBlock?.(target))return;
  const lift=v(c,'DAMAGE DELAY',.52),stun=v(c,'STUN DURATION')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?.3:0);
  c.status(target,'stun',stun,0,{harmful:true,dispel:'strong',maxStacks:1000});
  c.status(target,'selfStun',lift,0,{harmful:true,dispel:'strong',ignoreStatusResistance:true,maxStacks:1000,data:{burrowLift:true,damage:v(c,'DAMAGE')}});
  c.status(target,'phased',lift,0,{dispel:'none'});
  if(c.skill.points>=6&&!target.illusion)c.castAbility(CAUSTIC,1,target);
 }});
}
const caustic:SkillProgram=field(c=>{
 if(c.target.illusion||c.target.ward||active(c.target,'magicImmune',c.battle.time).length)return;
 const seconds=v(c,'DURATION',6),options:Partial<EffectStatus>={harmful:true,dispel:'basic',ignoreStatusResistance:true};
 c.status(c.target,'causticFinale',seconds,0,{...options,data:{baseDamage:v(c,'BASE DAMAGE',130),healthFactor:v(c,'MAX HEALTH DAMAGE',22)/100,radius:v(c,'RADIUS',500)/100}});
 c.status(c.target,'slow',seconds,v(c,'SLOW',26)/100,options);
},{onAffectedUnitDeath:(c,status)=>{
 if(status.kind!=='causticFinale')return;const damage=Number(status.data?.baseDamage??0)+c.target.maxHp*Number(status.data?.healthFactor??0),radius=Number(status.data?.radius??0);
 for(const target of c.enemies().filter(t=>!t.ward&&distance(t,c.target)<=radius))c.damage(target,damage,'magical',false);
},implemented:['Independent saved Caustic marker; immediate death explosion survives its source death'],remaining:['AA units includes ordinary creeps; historical illusion exclusion retained']});

interface ChargeState{active:boolean;targetId:string;lastTargetId:string}
const chargeControllers=new WeakMap<C['battle'],Map<string,()=>void>>();
function chargeState(c:C):ChargeState{return(c.caster.mobilityCharge??={active:false,targetId:'',lastTargetId:''}) as ChargeState;}
function charge(c:C){
 const state=chargeState(c);if(state.active)return;state.active=true;state.targetId=state.lastTargetId=c.target.id;c.caster.chargeTarget=c.target.id;
 const references:EffectStatus[]=[],seconds=Math.max(STEP,121-c.battle.time),bonus=(v(c,'CHARGE BONUS SPEED')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?600:0))/100;
 const put=(kind:string,value=0)=>{c.status(c.caster,kind,seconds,value,{dispel:'none'});const status=c.caster.statuses.find(s=>s.kind===kind&&s.source===c.caster.id&&s.skill===CHARGE);if(status)references.push(status as EffectStatus);};
 put('motionRoot');put('phased');put('moveFlat',bonus);put('maximumMoveSpeed',Number.MAX_SAFE_INTEGER);if(c.skill.points>=6)put('magicImmune');
 let map=chargeControllers.get(c.battle);if(!map){map=new Map();chargeControllers.set(c.battle,map);}
 const stop=()=>{if(!state.active)return;state.active=false;c.caster.statuses=c.caster.statuses.filter(s=>!references.includes(s as EffectStatus));if(c.motionActive?.(c.caster)?.skill===CHARGE)c.cancelMotion?.(c.caster);c.startCooldown?.();map!.delete(c.caster.id);};map.set(c.caster.id,stop);
 const passed=new Set<string>();let previousMoves=new Set((c.caster.moveHistory??[]) as object[]);
 const tick=()=>{
  if(!state.active)return;
  const interrupted=active(c.caster,'stun',c.battle.time).length||active(c.caster,'hex',c.battle.time).length||active(c.caster,'banished',c.battle.time).length||active(c.caster,'fear',c.battle.time).length||active(c.caster,'sleep',c.battle.time).length||active(c.caster,'selfStun',c.battle.time).length||active(c.caster,'root',c.battle.time).length;
  const foreign=((c.caster.moveHistory??[]) as {kind?:string;skill?:string}[]).some(move=>!previousMoves.has(move)&&(move.kind==='warp'||move.kind==='forced'&&move.skill!==CHARGE));
  if(c.caster.dead||interrupted||foreign){stop();return;}
  let target=c.battle.units.find(u=>u.id===state.targetId);
  if(!target||target.dead){
   if(c.skill.points>=9)c.resetCooldown?.();
   const old=target??c.target;target=c.enemies().filter(t=>!t.summoned&&distance(t,old)<=v(c,'RETARGET RADIUS',4000)/100).sort((a,b)=>distance(a,old)-distance(b,old)||a.id.localeCompare(b.id))[0];
   if(!target){stop();return;}state.targetId=state.lastTargetId=target.id;c.caster.chargeTarget=target.id;
  }
  const speed=c.movementSpeed(c.caster),from={x:c.caster.x,y:c.caster.y},length=distance(from,target),step=Math.min(length,speed*STEP),angle=length?Math.atan2(target.y-from.y,target.x-from.x):c.caster.facing;
  turnTowards(c.caster,target,STEP,Number(c.caster.turnRate??BATTLE_CONFIG.turnRate)*Math.max(0,1+amount(c.caster,'turnRatePct',c.battle.time)));
  if(!c.moveContinuous(c.caster,from.x+Math.cos(angle)*step,from.y+Math.sin(angle)*step,{duration:STEP,priority:-1,lockActions:false,ignoreBarriers:true})){stop();return;}
  const speedSnapshot=speed*100,offset=v(c,'BASH FORWARD OFFSET',20)/100,center={x:c.caster.x+Math.cos(angle)*offset,y:c.caster.y+Math.sin(angle)*offset};
  if(c.skill.points>=6)for(const unit of c.enemies().filter(t=>!t.ward&&t.id!==target!.id&&!passed.has(t.id)&&distance(t,center)<=v(c,'BASH RADIUS',300)/100)){passed.add(unit.id);c.castAbility(BASH,4,unit,{'CHARGE SPEED':speedSnapshot});}
  if(distance(c.caster,target)<=BATTLE_CONFIG.bodyRadius*2){c.castAbility(BASH,4,target,{'CHARGE SPEED':speedSnapshot});c.status(target,'stun',v(c,'STUN DURATION'),0,{harmful:true,dispel:'strong',piercesImmunity:false});stop();return;}
  previousMoves=new Set((c.caster.moveHistory??[]) as object[]);c.delay(STEP,tick);
 };tick();
}

const CHRONO_BLOCKED=['marci_grapple','custom_snapfire_firesnap_cookie','custom_tusk_snowball','force_staff','item_force_staff','aa_granted_force_staff','hurricane_pike','item_hurricane_pike','force_boots','item_force_boots','earth_spirit_geomagnetic_grip','rubick_telekinesis'].join(',');
function controlledBy(c:C,target:CombatUnit){let unit:CombatUnit|undefined=target;const seen=new Set<string>();while(unit&&!seen.has(unit.id)){if(unit.id===c.caster.id)return true;seen.add(unit.id);unit=c.battle.units.find(t=>t.id===unit!.owner);}return false;}
function chrono(c:C){
 const point=c.castPosition??c.target,seconds=v(c,'DURATION'),interval=v(c,'FIELD INTERVAL',STEP),linger=v(c,'AURA LINGER',.1),key=`chrono:${c.caster.id}:${c.battle.time}`,owned=new Map<CombatUnit,Map<string,EffectStatus>>();
 const refresh=(unit:CombatUnit,kind:string,value:number,options:Partial<EffectStatus>={})=>{
  let entries=owned.get(unit);if(!entries){entries=new Map();owned.set(unit,entries);}let status=entries.get(kind);const isNew=!status||!unit.statuses.includes(status);
  if(isNew){c.status(unit,kind,linger,value,{dispel:'none',ignoreStatusResistance:true,maxStacks:1000,...options,data:{...options.data,chronoField:key}});status=unit.statuses.find(s=>s.kind===kind&&(s as EffectStatus).data?.chronoField===key) as EffectStatus|undefined;if(status)entries.set(kind,status);}else{status!.until=c.battle.time+linger;status!.value=value;}return isNew&&!!status;
 };
 c.zone({x:point.x,y:point.y,radius:v(c,'RADIUS')/100,duration:seconds,interval,immediate:true,targets:'all',onEnd:()=>{for(const[unit,entries]of owned)unit.statuses=unit.statuses.filter(s=>![...entries.values()].includes(s as EffectStatus));},effect:unit=>{
  if(active(unit,'banished',c.battle.time).length||active(unit,'hidden',c.battle.time).length)return;
  if(controlledBy(c,unit)){
   refresh(unit,'forceMoveSpeed',v(c,'CASTER MOVE SPEED',1000)/100);refresh(unit,'phased',0);if(unit.id===c.caster.id&&c.skill.points>=6)refresh(unit,'attackSpeed',v(c,'SUPER ATTACK SPEED',200));return;
  }
  const hero=!unit.summoned||!!unit.illusion||!!unit.extraSpiritBear;if(hero&&active(unit,'invulnerable',c.battle.time).length)return;
  const hostile:Partial<EffectStatus>={harmful:true,piercesImmunity:true,affectsInvulnerable:!hero};
  if(unit.side!==c.caster.side&&active(unit,'invisible',c.battle.time).length&&!active(unit,'undetectable',c.battle.time).length&&!active(unit,'shadowRealm',c.battle.time).length)refresh(unit,'revealed',1,hostile);
  if(c.skill.points>=9&&unit.side===c.caster.side){const factor=v(c,'ALLY TIME FACTOR',6.5);refresh(unit,'slow',1-1/factor,hostile);refresh(unit,'attackTimePct',factor-1,hostile);refresh(unit,'castTimePct',factor-1,hostile);return;}
  const first=refresh(unit,'stun',0,hostile);refresh(unit,'chronosphereFreeze',0,{...hostile,data:{blockedMotionSkills:CHRONO_BLOCKED}});
  if(first){const motion=c.motionActive?.(unit);if(motion&&(motion.owner.startsWith(`${unit.id}:`)||CHRONO_BLOCKED.split(',').includes(motion.skill)))c.cancelMotion?.(unit);}
 }});
}

interface Blade{x:number;y:number;endX:number;endY:number;phase:'out'|'parked'|'return'|'done';outHits:string[];backHits:string[];nextTick:number}
const bladeVisuals=new WeakMap<Blade,ReturnType<typeof addVisualProjectile>>();
interface SawCast{token:string;blades:Blade[];returning:boolean;radius:number;autoReturn:boolean;breakDistance:number}
interface SawState{casts:Record<string,SawCast>}
const sawState=(c:C):SawState=>(c.caster.mobilityChakrams??={casts:{}}) as SawState;
const sawKey=(c:C)=>c.skill.id===SECOND?SECOND:CHAKRAM;
function onSegment(c:C,from:{x:number;y:number},to:{x:number;y:number},radius:number){const dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy;return c.enemies().filter(target=>{const q=length?Math.max(0,Math.min(1,((target.x-from.x)*dx+(target.y-from.y)*dy)/length)):0;return !target.ward&&Math.hypot(target.x-from.x-q*dx,target.y-from.y-q*dy)<=radius;});}
function slowValue(c:C,target:CombatUnit){const step=v(c,'HEALTH STEP',5)/100;return Math.min(1,(1+Math.floor(Math.max(0,1-target.hp/target.maxHp)/step+1e-8))*v(c,'SLOW')/100);}
function updateSawDisarm(c:C){
 const casts=sawState(c).casts,main=casts[CHAKRAM]?.blades.filter(b=>b.phase!=='done').length??0,second=casts[SECOND]?.blades.filter(b=>b.phase!=='done').length??0;
 c.caster.mainChakramBlades=main;c.caster.secondChakramBlades=second;
 if(main+second){for(const kind of ['disarm','chakramOut'])if(!c.caster.statuses.some(s=>s.kind===kind&&(s as EffectStatus).data?.chakramOwner===c.caster.id))c.status(c.caster,kind,Math.max(STEP,121-c.battle.time),0,{skill:CHAKRAM,dispel:'none',data:{chakramOwner:c.caster.id}});}
 else c.caster.statuses=c.caster.statuses.filter(s=>(s as EffectStatus).data?.chakramOwner!==c.caster.id);
}
function cancelChakrams(c:C){for(const cast of Object.values(sawState(c).casts))for(const blade of cast.blades){blade.phase='done';const visual=bladeVisuals.get(blade);if(visual)removeVisualProjectile(c.battle,visual);}updateSawDisarm(c);}
function returnSaw(c:C,key:string){const cast=sawState(c).casts[key];if(cast)cast.returning=true;}
function chakram(c:C){
 const key=sawKey(c),start={x:c.caster.x,y:c.caster.y},point=c.castPosition??c.target,count=c.skill.points>=9?v(c,'RADIAL BLADE COUNT',10):1,token=`saw:${c.caster.id}:${key}:${c.battle.time}`,radius=v(c,'RADIUS')/100;
 const cast:SawCast={token,returning:false,radius,autoReturn:v(c,'AI RETURN EMPTY',1)!==0,breakDistance:v(c,'BREAK DISTANCE',2000)/100,blades:Array.from({length:count},(_,index)=>{
  const angle=count===1?Math.atan2(point.y-start.y,point.x-start.x):index*Math.PI*2/count,end=count===1?point:{x:start.x+Math.cos(angle)*v(c,'RADIAL DISTANCE',1200)/100,y:start.y+Math.sin(angle)*v(c,'RADIAL DISTANCE',1200)/100};
  const blade:Blade={x:start.x,y:start.y,endX:end.x,endY:end.y,phase:'out',outHits:[],backHits:[],nextTick:0};bladeVisuals.set(blade,addVisualProjectile(c.battle,{source:c.caster.id,skill:CHAKRAM,points:c.skill.points,layer:'blade',role:'projectile_area',...start,angle,until:c.battle.time+.15,expiresWithSource:true}));return blade;
 })};sawState(c).casts[key]=cast;updateSawDisarm(c);
 const aura=new Map<string,EffectStatus>(),passing=new Map<string,EffectStatus>();
 const slow=(target:CombatUnit,stationary:boolean)=>{
  if(active(target,'magicImmune',c.battle.time).length)return;
  const cache=stationary?aura:passing,old=cache.get(target.id),seconds=stationary?v(c,'AURA LINGER',.5):v(c,'PASS SLOW DURATION',.5),value=slowValue(c,target);
  if(stationary&&old&&target.statuses.includes(old)){old.until=c.battle.time+seconds;old.value=value;return;}
  if(old)target.statuses=target.statuses.filter(s=>s!==old);
  c.status(target,'slow',seconds,value,{harmful:true,dispel:stationary?'none':'basic',ignoreStatusResistance:stationary,maxStacks:1000,data:{sawCast:token,sawComponent:stationary?'aura':'pass',uniqueGroup:`chakramSlow:${key}`,stacking:'strongest'}});
  const status=target.statuses.find(s=>(s as EffectStatus).data?.sawCast===token&&(s as EffectStatus).data?.sawComponent===(stationary?'aura':'pass')) as EffectStatus|undefined;if(status)cache.set(target.id,status);
 };
 const tick=()=>{
  if(sawState(c).casts[key]!==cast)return;if(c.caster.dead){cancelChakrams(c);return;}
  const parkedVictims=new Set<CombatUnit>();
  for(const blade of cast.blades){
   if(blade.phase==='done')continue;
   if((blade.phase==='out'||blade.phase==='parked')&&(cast.returning||distance(blade,c.caster)>cast.breakDistance||c.caster.mana<=0))blade.phase='return';
   if(blade.phase==='parked'){
    for(const unit of c.enemies().filter(t=>!t.ward&&distance(t,blade)<=radius))parkedVictims.add(unit);
    if(c.battle.time+1e-8>=blade.nextTick){
     const interval=v(c,'DAMAGE INTERVAL',.5),cost=v(c,'MANA COST PER SECOND')*interval;
     if(c.caster.mana+1e-8<cost)blade.phase='return';
     else{c.mana(c.caster,-cost);for(const unit of c.enemies().filter(t=>!t.ward&&distance(t,blade)<=radius))c.damage(unit,v(c,'DAMAGE PER SECOND')*interval,'pure',false,{flags:{damageOverTime:true}});blade.nextTick+=interval;}
    }
   }
   if(blade.phase==='out'||blade.phase==='return'){
    if(cast.returning)blade.phase='return';
    const from={x:blade.x,y:blade.y},end=blade.phase==='return'?c.caster:{x:blade.endX,y:blade.endY},length=distance(blade,end),travel=Math.min(length,v(c,'BLADE SPEED',900)/100*STEP),dx=length?(end.x-blade.x)/length:0,dy=length?(end.y-blade.y)/length:0;
    blade.x+=dx*travel;blade.y+=dy*travel;const seen=blade.phase==='out'?blade.outHits:blade.backHits;
    for(const target of onSegment(c,from,blade,radius))if(!seen.includes(target.id)){seen.push(target.id);c.damage(target,v(c,'PASS DAMAGE'),'pure',false);slow(target,false);}
    if(length<=travel+1e-8){if(blade.phase==='out'){blade.phase='parked';blade.nextTick=c.battle.time+v(c,'DAMAGE INTERVAL',.5);for(const unit of c.enemies().filter(t=>!t.ward&&distance(t,blade)<=radius))parkedVictims.add(unit);}else blade.phase='done';}
   }
   const visual=bladeVisuals.get(blade);if(visual){if(blade.phase==='done')removeVisualProjectile(c.battle,visual);else moveVisualProjectile(c.battle,visual,blade,c.battle.time+.15);}
  }
  for(const target of parkedVictims)slow(target,true);
  updateSawDisarm(c);if(cast.blades.some(b=>b.phase!=='done'))c.delay(STEP,tick);
 };c.delay(STEP,tick);
}
function returnProgram(key:string):SkillProgram{return field(c=>returnSaw(c,key),{target:'self',requiresFacing:false,castPoint:0,backswing:0,cooldown:()=>0,manaCost:()=>0,allowZeroCooldown:true,procsOnCast:false,canCastWhileChanneling:true,
 canCast:c=>!!sawState(c).casts[key]?.blades.some(b=>b.phase!=='done'),targetSelector:c=>{
  const cast=sawState(c).casts[key];if(!cast||!cast.blades.some(b=>b.phase==='parked')||cast.blades.some(b=>b.phase==='out')||!cast.autoReturn)return undefined;
  const main=c.battle.units.find(u=>u.id===c.caster.id)!;return c.enemies().some(t=>cast.blades.some(b=>b.phase==='parked'&&distance(t,b)<=cast.radius))?undefined:main;
 },implemented:['Independent zero-resource immediate Return that works during channels and emits no cast hooks'],remaining:['Automatic return when all parked blade areas are empty is explicit arena AI policy']});}
function flame(c:C){
 const holder=c.target,duration=v(c,'DURATION',8),until=c.battle.time+duration;c.status(holder,'flamethrower',duration,0,{dispel:'none'});
 const tick=()=>{
  if(holder.dead||c.battle.time>until+1e-8)return;const length=v(c,'LENGTH',400)/100,width=v(c,'WIDTH',275)/100;
  for(const target of c.enemies().filter(t=>!t.ward)){
   const dx=target.x-holder.x,dy=target.y-holder.y,forward=dx*Math.cos(holder.facing)+dy*Math.sin(holder.facing),across=Math.abs(-dx*Math.sin(holder.facing)+dy*Math.cos(holder.facing));if(forward<0||forward>length||across>width*forward/length)continue;
   const existing=target.statuses.find(s=>s.kind==='dot'&&s.skill===FLAME&&s.source===c.caster.id),seconds=v(c,'LINGER DURATION',2);
   c.status(target,'dot',seconds,v(c,'DAMAGE',80),{harmful:true,dispel:'basic',interval:.5,damageType:'magical'});c.status(target,'slow',seconds,v(c,'SLOW',30)/100,{harmful:true,dispel:'basic'});
   if(!existing)c.damage(target,v(c,'DAMAGE',80)*.5,'magical',false,{flags:{damageOverTime:true}});
  }
  if(c.battle.time<until-1e-8)c.delay(.1,tick);
 };tick();
}

export const MOBILITY_FIELDS_CHILD_PROGRAMS:Record<string,SkillProgram>={
 [CAUSTIC]:caustic,[SECOND]:field(chakram,{pointTarget:true,range:12,castPoint:.15,backswing:0,targetSelector:(c,units)=>units.sort((a,b)=>distance(b,c.caster)-distance(a,c.caster)||a.id.localeCompare(b.id))[0],canCast:c=>!sawState(c).casts[SECOND]?.blades.some(b=>b.phase!=='done'),onDeath:cancelChakrams,implemented:['Independent Second Chakram with captured AA-equivalent values'],remaining:[]}),
 [RETURN]:returnProgram(CHAKRAM),[RETURN_SECOND]:returnProgram(SECOND),
 [FLAME]:field(flame,{target:'ally',castPoint:0,backswing:0,targetSelector:(c,units)=>units.filter(t=>t.id!==c.caster.id&&!t.summoned&&c.enemies().some(enemy=>distance(enemy,t)<=v(c,'LENGTH',400)/100)).sort((a,b)=>Math.min(...c.enemies().map(t=>distance(t,a)))-Math.min(...c.enemies().map(t=>distance(t,b)))||a.id.localeCompare(b.id))[0],implemented:['Ally-held cone with immediate half-second burn ticks and independent two-second debuff linger'],remaining:['AA buffed amplification and thrown delivery speed/range remain unprovided; native80DPS and unprovided700-range delivery candidate disclosed']}),
};
export function applyMobilityFieldsAcceptance(registry:Record<string,SkillProgram>):void{
 Object.assign(registry,MOBILITY_FIELDS_CHILD_PROGRAMS);
 registry[BARRAGE]=field(barrage,{superImplemented:true,gabenImplemented:true,pointTarget:true,attackProjectile:true,ignoreCastRangeBonuses:true,range:c=>v(c,'RANGE')/100+(c.attackRange?.(c.caster)??c.caster.range)-c.caster.range,dynamicRange:true,channel:c=>v(c,'CHANNEL TIME',2),backswing:0,
  cooldown:c=>c.skill.points>=9?0:baseCooldown(c),
  init:c=>{if(c.skill.points>=9)charges(c,2);},canCast:c=>c.skill.points<9||charges(c,2).count>0,reduceRecharge,
  implemented:['Immediate first arrow; fixed channel cadence; released1200-speed piercing attack arrows continue after interruption','True strike/disarm bypass and target-scoped total outgoing attack multiplier','Super final arrow/damage values and finite sequential Gaben charges'],remaining:['Attack-range bonuses affect arrow travel; spell-range bonuses do not','Searing Arrows application conditional on channel/autocast remains shared modifier work']});
 registry[BURROW]=field(burrow,{superImplemented:true,gabenImplemented:true,pointTarget:true,range:c=>v(c,'CAST RANGE')/100,backswing:.53,spellBlockTiming:'impact',
  cooldown:c=>c.skill.points>=9?0:Math.max(0,baseCooldown(c)-(c.skill.points>=6?2:0)),
  init:c=>{if(c.skill.points>=9)charges(c,2);},canCast:c=>c.skill.points<9||charges(c,2).count>0,reduceRecharge,
  onStatusRemoved:(c,status)=>{if(status.data?.burrowLift)c.damage(c.target,Number(status.data.damage),'magical',true);},
  implemented:['Spikes travel before the skill-authorized terminal warp; no disjoint or invented caster invulnerability','Independent fixed airborne delay, landing damage and per-victim spell block','Strong dispel may end the airborne marker early; Super max-level Caustic with saved death attribution','Finite sequential Gaben charges with final Super recharge'],remaining:['350-unit vertical art is not represented by a3D transform','AA Super travel-speed match to native3000-speed Scepter has no direct AA evidence;2000 retained']});
 registry[CHARGE]=field(charge,{superImplemented:true,gabenImplemented:true,range:50,castPoint:c=>c.skill.points>=6?0:.1,backswing:.5,cooldownStart:'effectEnd',canCast:c=>!chargeState(c).active,
  targetSelector:(c,units)=>units.filter(t=>!t.ward&&!active(t,'magicImmune',c.battle.time).length).sort((a,b)=>distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0],
  onSpellOrder:c=>{if(c.castOrder&&c.castOrder.skillId!==CHARGE&&c.castOrder.kind!=='none')chargeControllers.get(c.battle)?.get(c.caster.id)?.();},onDeath:c=>chargeControllers.get(c.battle)?.get(c.caster.id)?.(),
  onUnitDeath:c=>{if(c.skill.points>=9&&chargeState(c).lastTargetId===c.target.id)c.resetCooldown?.();},
  onAttack:c=>{if(c.skill.points<9||c.caster.illusion||c.target.ward||active(c.caster,'break',c.battle.time).length||Number(c.caster.mobilityBashReady??0)>c.battle.time)return;if(!(c.chance?.(v(c,'BASH CHANCE',17)/100,'greater_bash')??c.random()<v(c,'BASH CHANCE',17)/100))return;c.caster.mobilityBashReady=c.battle.time+v(c,'BASH COOLDOWN',1.5);c.castAbility(BASH,4,c.target);},
  implemented:['Continuous unobstructed speed-bonus movement; cooldown starts only on end/cancel','External controls/forced movement or accepted targeted orders cancel; ordinary non-target spells remain usable','Super per-body300-radius Greater Bash; Gaben target-death reset and PRD attack Bash'],remaining:['AA reduced Super cast point has no explicit amount;0 remains documented candidate','Impact uses project body-contact radius; original AA body geometry is not recovered']});
 registry[CHRONO]=field(chrono,{superImplemented:true,gabenImplemented:true,pointTarget:true,range:5,backswing:.35,implemented:['Immediate immunity-piercing freeze with instance-owned cleanup; caster and recursively controlled units gain1000 movement/phasing','Invulnerable heroes excluded while invulnerable ordinary summons/wards are frozen','Explicit blocked movement sources versus allowed external rescue; Super200 caster AS'],remaining:['AA Gaben-550% remains documented6.5x time-factor interpretation, not a native talent','Depth Shroud reveal changed2023-04-25; current undetectability exception retained pending exact AA version']});
 registry[CHAKRAM]=field(chakram,{superImplemented:true,gabenImplemented:true,pointTarget:true,range:12,backswing:0,
  targetSelector:(c,units)=>units.sort((a,b)=>distance(b,c.caster)-distance(a,c.caster)||a.id.localeCompare(b.id))[0],canCast:c=>!sawState(c).casts[CHAKRAM]?.blades.some(b=>b.phase!=='done'),
  init:c=>{c.grantAbility?.(RETURN,1);if(c.skill.points>=6){c.grantAbility?.(SECOND,c.skill.points);c.grantAbility?.(RETURN_SECOND,1);c.grantAbility?.(FLAME,1);}},onDeath:cancelChakrams,
  implemented:['900-speed independently tracked out/return passes; damage/mana start .5s after parking','Minimum5% missing-health slow; undispellable adaptive stationary aura independent of passing debuff','Immediate undispellable disarm until all main/second blades return; death clears counters before resurrection','Independent Second/Return/Throwable Flamethrower action slots; Gaben ten caster-centered radial blades'],remaining:['AA radial reach and per-blade mana policy are explicit native-compatible candidates','AA buffed Throwable Flamethrower extra amplification/delivery parameters not supplied']});
}
