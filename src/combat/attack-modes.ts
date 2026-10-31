import {GLOBAL_BATTLE_CONFIG} from '../global-config';
import {skillBalance,balanceNumber} from '../config';
import type {CombatUnit} from '../model';
import {skillValue as value,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
const STEP=1/30,FOREVER=GLOBAL_BATTLE_CONFIG.timeLimit;
const has=(u:CombatUnit,kind:string)=>u.statuses.some(s=>s.kind===kind);
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const own=(c:C,u:CombatUnit,kind:string)=>statuses(u).find(s=>s.kind===kind&&s.skill===c.skill.id&&s.source===c.caster.id);
function refresh(c:C,kind:string,amount:number,passive=true){const old=own(c,c.caster,kind);if(old){old.value=amount;old.until=c.battle.time+2*STEP;}else c.status(c.caster,kind,2*STEP,amount,{passive,dispel:'none'});}
function stance(c:C):boolean{return c.caster.statuses.find(s=>s.kind==='attackTypeOverride')?.value===1||(c.caster.statuses.find(s=>s.kind==='attackTypeOverride')?.value!==2&&c.caster.range<=2);}
function eligible(c:C,target:CombatUnit){return target.side!==c.caster.side&&!target.ward&&!target.building&&!has(target,'magicImmune')&&(c.canTarget?.(target,false)??!target.dead);}

/** AA explicit values/custom rules override these native 2023 mechanism paths.
 * Exact sources and remaining native curve issues are recorded in attack-modes.json. */
export function applyAttackModeAcceptance(registry:Record<string,SkillProgram>):void{
 const burn=registry.winter_wyvern_arctic_burn;
 burn.cast=c=>{
  const seconds=c.skill.points>=9?FOREVER:value(c,'FLIGHT DURATION'),token=`${c.caster.id}:${c.battle.time}`;
  c.status(c.caster,'arcticBurn',seconds,1,{dispel:'none',data:{token,hitTargets:''}});
  c.status(c.caster,'range',seconds,value(c,'BONUS ATTACK RANGE')/100,{dispel:'none'});
  c.status(c.caster,'flying',seconds,1,{dispel:'none'});
  c.status(c.caster,'attackPointOverride',seconds,value(c,'ATTACK POINT',.1),{dispel:'none'});
  c.status(c.caster,'projectileSpeedBonus',seconds,value(c,'PROJECTILE SPEED BONUS',500)/100,{dispel:'none'});
  if(c.skill.points>=9)c.status(c.caster,'haste',seconds,value(c,'GABEN MOVE SPEED',25)/100,{dispel:'none'});
 };
 burn.onAttack=undefined;
 burn.beforeAttackDamage=c=>{
  const active=own(c,c.caster,'arcticBurn');if(!active||!c.attackIsRanged||!eligible(c,c.target))return;
  const hitTargets=String(active.data!.hitTargets??'').split(',').filter(Boolean);
  if(c.skill.points<9&&hitTargets.includes(c.target.id))return;
  if(!hitTargets.includes(c.target.id)){hitTargets.push(c.target.id);active.data!.hitTargets=hitTargets.join(',');}
  const duration=value(c,'BURN DURATION')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?2:0),slow=(value(c,'MOVEMENT SLOW')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?12:0))/100,interval=value(c,'BURN INTERVAL',1);
  const previous=own(c,c.target,'arcticBurnDot');
  if(previous){c.status(c.target,'slow',duration,slow,{harmful:true});c.status(c.target,'arcticBurnDot',duration,1,{harmful:true,data:previous.data});return;}
  const token=`${active.data!.token}:${c.target.id}:${c.battle.time}`,target=c.target;
  c.status(target,'arcticBurnDot',duration,1,{harmful:true,data:{token}});c.status(target,'slow',duration,slow,{harmful:true});
  const clock=own(c,target,'arcticBurnDot')!;
  // Status cleanup runs before tasks. The final boundary tick survives natural
  // expiry, while an earlier dispel cancels this individual source clock.
  const tick=()=>{if(target.dead||clock.data?.cancelled||clock.data?.token!==token||clock.until<c.battle.time-1e-8)return;c.damage(target,target.hp*value(c,'HEALTH BURN')/100);if(c.battle.time+interval<=clock.until+1e-8)c.delay(interval,tick);};
  c.delay(interval,tick);
 };
 burn.onStatusRemoved=(_c,status,reason)=>{if(status.kind==='arcticBurnDot'&&reason==='dispel'){status.data??={};status.data.cancelled=true;}};
 burn.implemented=['AA flight/range/current-health burn with native .1 attack point and +500 projectile speed','Debuff before attack damage; each victim once per cast, Gaben refreshes a source-isolated clock','Super slow/debuff duration; permanent Gaben flight and 25 percent movement'];
 burn.remaining=['Fog/night vision and tree destruction have no flat-arena simulation counterpart','Status-resistance partial-interval and overlapping independent casters require exact comparison'];

 const blood=registry.huskar_berserkers_blood;
 blood.init=c=>{
  if(c.skill.points>=9)c.status(c.caster,'strength',FOREVER,balanceNumber(c,'skill_effects_extra.buff_amount.1',60),{dispel:'none',passive:false});
  const update=()=>{const raw=Math.max(0,Math.min(1,(1-c.caster.hp/c.caster.maxHp)/(1-value(c,'HP FOR MAX BONUS')/100))),scale=Math.pow(raw,value(c,'BONUS EXPONENT',1.85));
   refresh(c,'attackSpeed',value(c,'MAX ATTACK SPEED')*scale);
   refresh(c,'magicResist',c.caster.illusion?0:value(c,'MAX MAGIC RESIST')/100*scale);
   refresh(c,'regen',Number(c.caster.strength??0)*(value(c,'MAX STR REGEN')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?30:0))/100*scale);
  };
  update();c.zone({follow:true,radius:.01,duration:FOREVER,interval:Math.min(STEP,Math.max(.001,value(c,'UPDATE INTERVAL',STEP))),targets:'all',effect:t=>{if(t.id===c.caster.id)update();}});
 };
 blood.implemented=['Per-server-tick nonlinear missing-health bonuses and full-health zero/max-threshold cap','Strength-based regen; Super adds thirty percentage points only to regen','Gaben fixed sixty strength survives Break; illusion magic-resistance component is disabled'];
 blood.remaining=['The 2023 article confirms nonlinear ramping; exact exponent1.85 is from the current Wiki and remains a historical formula candidate'];

 const fury=registry.custom_juggernaut_blade_fury;
 const furyAllowed=fury.canCast;fury.canCast=c=>!has(c.caster,'omnislash')&&(!furyAllowed||furyAllowed(c));
 fury.canCastWhileChanneling=true;
 fury.cast=c=>{
  const duration=value(c,'DURATION'),radius=(value(c,'RADIUS')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?75:0))/100,interval=value(c,'DAMAGE INTERVAL',.2),damage=value(c,'DAMAGE PER SECOND')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?80:0);
  c.dispel(c.caster);c.status(c.caster,'bladeFury',duration,1,{dispel:'none'});c.status(c.caster,'magicImmune',c.skill.points>=6?duration:value(c,'MAGIC IMMUNITY DURATION'),1,{dispel:'none'});
  c.zone({follow:true,radius,duration,interval,includeEnd:true,effect:t=>{if(!t.ward&&!t.building)c.damage(t,damage*interval);}});
  if(c.skill.points>=9){
   c.status(c.caster,'moveFlat',duration,value(c,'GABEN MOVE SPEED',100)/100,{dispel:'none'});
   const until=c.battle.time+duration,attack=()=>{if(c.caster.dead||c.battle.time>=until-1e-8||!own(c,c.caster,'bladeFury'))return;
    const targets=c.enemies().filter(t=>!t.ward&&!t.building&&distance(t,c.caster)<=radius&&(c.canTarget?.(t,true)??true));
    if(targets.length)c.attack(targets[Math.floor(c.random()*targets.length)],value(c,'GABEN ATTACK DAMAGE',100)/100,true,undefined,false,{ignoreBladeFuryPenalty:true});
    c.delay(value(c,'GABEN ATTACK INTERVAL',1),attack);
   };c.delay(value(c,'GABEN ATTACK START',.2),attack);
  }
 };
 fury.implemented=['Basic dispel, AA partial/full spell immunity and .2-second magical pulses through the endpoint','Ordinary attacks retain modifiers but suppress their main damage; Gaben independently attacks one random eligible victim from .2 seconds','Gaben AA100 percent attack every second and +100 movement'];
 fury.remaining=['No buildings/couriers in the normal arena; exact source-specific modifier exceptions are separately tested'];

 const trance=registry.troll_warlord_battle_trance;
 trance.cast=c=>{
  const seconds=value(c,'TRANCE DURATION')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?2:0);
  c.status(c.caster,'undying',seconds,1,{dispel:'none'});c.status(c.caster,'attackSpeed',seconds,value(c,'ATTACK SPEED')+(!skillBalance(c.definition,c.skill.points)&&c.skill.points>=6?200:0),{dispel:'none'});
  c.status(c.caster,'lifesteal',seconds,value(c,'LIFESTEAL')/100,{dispel:'none'});c.status(c.caster,'haste',seconds,value(c,'MOVEMENT SPEED')/100,{dispel:'none'});
  c.status(c.caster,'berserk',seconds,1,{dispel:'none',data:{targetId:c.currentAttackTargetId??'',searchRadius:value(c,'SEARCH RADIUS',900)/100,engaged:false}});c.dispel(c.caster);
 };
 trance.implemented=['AA duration/attack speed with native basic dispel and minimum-one-health protection','Source-backed locked-target control, hero-prioritized900 search and permitted axes/stance/Rampage casts'];
 trance.remaining=['The autonomous AI still chooses when to activate; manual control is not an arena UI feature'];
 registry.troll_warlord_rampage.cast=c=>{for(const t of c.allies()){c.status(t,'attackSpeed',value(c,'duration',5),value(c,'attack_speed',70),{dispel:'basic',piercesImmunity:true});c.status(t,'statusResistance',value(c,'duration',5),value(c,'status_resistance',25)/100,{dispel:'basic',piercesImmunity:true});}};
 registry.troll_warlord_rampage.implemented=['AA4.5 globally grants both seventy attack speed and twenty-five percent status resistance regardless of stance'];registry.troll_warlord_rampage.remaining=[];

 const rage=registry.custom_troll_warlord_berserkers_rage;
 rage.canCastWhileChanneling=true;
 rage.cast=c=>{const melee=c.caster.range>2;c.status(c.caster,'berserkersStance',FOREVER,melee?1:2,{dispel:'none'});c.status(c.caster,'attackTypeOverride',FOREVER,melee?1:2,{dispel:'none'});c.status(c.caster,'attackRangeOverride',FOREVER,value(c,melee?'MELEE ATTACK RANGE':'RANGED ATTACK RANGE')/100,{dispel:'none'});
  if(melee){c.status(c.caster,'armor',FOREVER,value(c,'BONUS ARMOR'),{dispel:'none'});c.status(c.caster,'moveFlat',FOREVER,value(c,'BONUS MOVE SPEED')/100,{dispel:'none'});c.status(c.caster,'baseAttackTime',FOREVER,value(c,'MELEE BASE ATTACK TIME'),{dispel:'none'});}
 };
 rage.onAttack=undefined;
 rage.onAttackPoint=c=>{c.caster.rageRootReady=stance(c)&&!c.caster.illusion&&!has(c.caster,'break')&&!c.target.ward&&!c.target.building&&c.target.side!==c.caster.side&&(c.chance?.(value(c,'ENSNARE CHANCE')/100,'ensnare')??c.random()<value(c,'ENSNARE CHANCE')/100);c.caster.rageRootTarget=c.target.id;};
 rage.beforeAttackDamage=c=>{if(!c.caster.rageRootReady||c.caster.rageRootTarget!==c.target.id)return;c.caster.rageRootReady=false;c.status(c.target,'root',value(c,'ENSNARE DURATION'),0,{harmful:true,piercesImmunity:true});c.status(c.target,'revealed',value(c,'ENSNARE DURATION'),0,{harmful:true,piercesImmunity:true});};
 rage.implemented=['AA opposite-original-style selection with persistent melee/ranged category and additive bonus attack range','Native PRD root decided at attack point, applied before damage with True Sight; Break/illusion restrictions','Super independently owned form-specific axes and AA Gaben resource/dispel upgrades'];
 rage.remaining=['One automatic opposite-form choice is the existing AA arena control policy; no manual toggle button exists','Melee axes exact native angular trajectory is not claimed by the original radius envelope'];
 const ranged=registry.troll_warlord_whirling_axes_ranged;
 ranged.pointTarget=true;ranged.dynamicCastPoint=true;ranged.castPoint=c=>has(c.caster,'berserk')?0:skillBalance(c.definition,c.skill.points)?.castPoint??.2;ranged.requiresFacing=c=>!has(c.caster,'berserk');
 ranged.cast=c=>{const target=c.castPosition??c.target,angle=Math.atan2(target.y-c.caster.y,target.x-c.caster.x),seen=new Set<string>(),count=value(c,'AXE COUNT',5),spread=value(c,'AXE SPREAD',25)*Math.PI/180;
  for(let i=0;i<count;i++)c.linearProjectile({angle:angle-spread/2+(count===1?0:spread*i/(count-1)),distance:value(c,'RANGE',950)/100,speed:value(c,'AXE SPEED',1500)/100,width:value(c,'AXE RADIUS',100)/100,effect:t=>{if(seen.has(t.id)||!eligible(c,t))return;seen.add(t.id);if(c.caster.extraAxesGaben)c.dispel(t,false,false);c.damage(t,value(c,'DAMAGE',90));c.status(t,'slow',value(c,'SLOW DURATION',4),value(c,'SLOW',40)/100,{harmful:true});}});
 };
 ranged.implemented=['Five ground-directed linear axes at1500 speed with once-per-target fan collision','Gaben basic dispel before damage/slow; instant no-facing cast under Trance'];ranged.remaining=[];
 const melee=registry.troll_warlord_whirling_axes_melee;
 const meleeCast=melee.cast!;melee.cast=c=>meleeCast({...c,zone:o=>c.zone({...o,effect:(t,tick)=>{if(c.caster.dead||!eligible(c,t))return;o.effect(t,tick);}})});
 for(const id of['juggernaut_omni_slash','juggernaut_swift_slash'])if(registry[id]){const p=registry[id],allowed=p.canCast;p.canCast=c=>!has(c.caster,'bladeFury')&&(!allowed||allowed(c));}
}
