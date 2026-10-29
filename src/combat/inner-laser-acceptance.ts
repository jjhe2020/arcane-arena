import {skillBalance} from '../config';
import type {CombatUnit} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';

const FIRE='custom_huskar_inner_fire',HUNGER='broodmother_insatiable_hunger',JINGU='custom_monkey_king_jingu_mastery',KRAKEN='tidehunter_kraken_shell',LASER='custom_tinker_laser',SNARE='broodmother_sticky_snare',BOUNDLESS='custom_monkey_king_boundless_strike';
const FOREVER=1_000_000,STEP=1/30;
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const has=(u:CombatUnit,k:string)=>u.statuses.some(s=>s.kind===k);
const key=(c:C)=>c.attackInstanceKey??c.skill.instanceId??c.skill.id;
const data=(c:C)=>({ownerInstance:key(c),instanceKey:key(c)});
const state=(c:C,k:string)=>`${c.skill.id}:${key(c)}:acceptance:${k}`;
const get=(c:C,k:string)=>Number(c.caster[state(c,k)]??0);
const set=(c:C,k:string,n:number)=>{c.caster[state(c,k)]=n;};
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const active=(c:C,u:CombatUnit,k:string)=>statuses(u).find(s=>s.kind===k&&s.source===c.caster.id&&s.skill===c.skill.id&&s.data?.ownerInstance===key(c)&&s.until>c.battle.time+1e-8);
const compiled=(c:C)=>!!skillBalance(c.definition,c.skill.points);
const body=(u:CombatUnit)=>!u.dead&&!has(u,'banished')&&!has(u,'invulnerable');
const hero=(u:CombatUnit)=>!u.summoned||!!u.illusion||!!u.heroClone;
const realHero=(u:CombatUnit)=>!u.illusion&&(!u.summoned||!!u.heroClone);
const validVisible=(c:C,u:CombatUnit)=>body(u)&&(!has(u,'invisible')||has(u,'revealed')||!!c.canTarget?.(u,true));
const owned=(c:C,u:CombatUnit,k:string)=>statuses(u).filter(s=>s.kind===k&&s.source===c.caster.id&&s.skill===c.skill.id&&s.data?.ownerInstance===key(c));
const buff=(c:C,u:CombatUnit,k:string,t:number,value:number,extra:Partial<EffectStatus>={})=>c.status(u,k,t,value,{dispel:'none',removeOnDeath:true,data:data(c),...extra});

/** Five captured AA descriptions, using dated native prototypes where identified.
 * Deliberately unresolved AA compositions and dates live in inner-laser.json. */
export function applyInnerLaserAcceptance(registry:Record<string,SkillProgram>):void{
 const fire=registry[FIRE];fire.backswing=.64;fire.dynamicBackswing=c=>c.skill.points>=6?0:.64;fire.requiresFacing=false;fire.canCastWhileDisabled=c=>c.skill.points>=6;
 fire.cast=c=>{
  const origin={x:c.caster.x,y:c.caster.y},damage=v(c,'DAMAGE'),seconds=v(c,'DURATION')+(!compiled(c)&&c.skill.points>=6?1:0);
  for(const t of c.enemies().filter(t=>body(t)&&distance(t,origin)<=v(c,'RADIUS')/100&&!has(t,'magicImmune'))){
   c.damage(t,damage,'magical');
   const group={...data(c),castSequence:get(c,'sequence')};
   c.status(t,'disarm',seconds,0,{harmful:true,dispel:'basic',removeOnDeath:true,data:group});
   if(c.skill.points>=6){c.status(t,'slow',seconds,v(c,'MOVEMENT SLOW',40)/100,{harmful:true,dispel:'basic',removeOnDeath:true,data:group});c.heal(c.caster,damage*v(c,hero(t)?'HERO HEAL PERCENT':'CREEP HEAL PERCENT',hero(t)?50:10)/100);}
   if(c.skill.points>=9)c.status(t,'healReduction',seconds,v(c,'HEAL PREVENTION',100)/100,{harmful:true,dispel:'basic',removeOnDeath:true,data:group});
   if(t.dead||t.nativeTemplateId==='npc_dota_roshan')continue;
   const n=distance(origin,t),d=n>1e-8?{x:(t.x-origin.x)/n,y:(t.y-origin.y)/n}:{x:Math.cos(c.caster.facing),y:Math.sin(c.caster.facing)},motionSeconds=v(c,'KNOCKBACK DURATION',1),radius=v(c,'KNOCKBACK DISTANCE',400)/100;
   buff(c,t,'innerFireKnockback',motionSeconds,0,{harmful:true,ignoreStatusResistance:true});
   const marker=active(c,t,'innerFireKnockback');
   if(!c.moveContinuous(t,origin.x+d.x*radius,origin.y+d.y*radius,{duration:motionSeconds,lockActions:false,ignoreTerrainBarriers:true}))continue;
   const controller=c.motionActive?.(t);if(marker)marker.data={...marker.data,motionStartedAt:controller?.startedAt??-1,motionOwner:controller?.owner??''};
   const check=()=>{if(!marker||!t.statuses.includes(marker))return;if(has(t,'magicImmune')){const m=c.motionActive?.(t);if(m?.skill===FIRE&&m.owner===marker.data?.motionOwner&&m.startedAt===marker.data?.motionStartedAt)c.cancelMotion?.(t);t.statuses=t.statuses.filter(s=>s!==marker);return;}if(c.battle.time<marker.until-1e-8)c.delay(STEP,check);};c.delay(STEP,check);
  }
  set(c,'sequence',get(c,'sequence')+1);
 };
 fire.implemented=['Dated non-disabling continuous knockback to400radius','Super zero-point disabled cast and fixed per-body self healing','AA final disarm/slow and Gaben restoration prevention'];fire.remaining=['AA damage-dealt wording versus native fixed-per-hit healing compatibility','Exact independent controller priority and hidden-unit qualifications'];

 const hunger=registry[HUNGER];hunger.backswing=.5;
 hunger.cast=c=>{const t=v(c,'DURATION');buff(c,c.caster,'attackBonus',t,v(c,'BONUS DAMAGE')+(!compiled(c)&&c.skill.points>=6?50:0),{dispel:'strong'});buff(c,c.caster,'lifesteal',t,(v(c,'LIFESTEAL')+(!compiled(c)&&c.skill.points>=6?50:0))/100,{dispel:'strong'});};
 hunger.onAttack=c=>{if(c.skill.points<9)return;set(c,'hits',get(c,'hits')+1);if(get(c,'hits')%v(c,'SNARE ATTACKS',4)===0)c.castAbility(SNARE,1,c.target);};
 hunger.implemented=['AA flat bonus and full creep lifesteal, strong dispel and expiration','Gaben four landed attacks place historical forming multi-hero wire'];hunger.remaining=['AA automatic wire orientation and out-of-buff attack counting use explicit candidates','Original Spin Web environment and normal charged Snare are not granted by this upgrade'];
 const snare=registry[SNARE];if(snare){snare.backswing=.56;snare.cast=c=>{
  type Wire={active:boolean;created:number;end:number};const listKey=state(c,'wires'),wires=(c.caster[listKey]??=[]) as Wire[],wire:Wire={active:true,created:c.battle.time,end:Infinity};wires.push(wire);while(wires.filter(w=>w.active).length>v(c,'COUNT',5)){const first=wires.find(w=>w.active);if(first)first.active=false;}
  const center={x:c.target.x,y:c.target.y},length=v(c,'WIDTH',900)/100,width=v(c,'LINE WIDTH',50)/100,n=distance(c.caster,center),direction=n>1e-8?{x:(center.x-c.caster.x)/n,y:(center.y-c.caster.y)/n}:{x:1,y:0},hit=new Set<string>();
  const scan=()=>{if(!wire.active||c.battle.time>=wire.end-1e-8){wire.active=false;for(let i=wires.length-1;i>=0;i--)if(!wires[i].active)wires.splice(i,1);return;}
   for(const t of c.enemies().filter(t=>realHero(t)&&body(t)&&!has(t,'magicImmune')&&!hit.has(t.id))){const dx=t.x-center.x,dy=t.y-center.y,along=dx*direction.x+dy*direction.y,across=Math.abs(dx*direction.y-dy*direction.x);if(Math.abs(along)>length/2||across>width/2)continue;
    hit.add(t.id);const duration=v(c,'ROOT_DURATION',3),delay=v(c,'ROOT DELAY',.25),instance=`${key(c)}:${wire.created}`;wire.end=Math.min(wire.end,c.battle.time+duration);
    const d={ownerInstance:key(c),instanceKey:instance};for(const k of ['slow','revealed'])c.status(t,k,duration,k==='slow'?v(c,'MOVEMENT SLOW',100)/100:0,{harmful:true,dispel:'basic',removeOnDeath:true,data:d});
    const marker=statuses(t).find(s=>s.kind==='slow'&&s.skill===SNARE&&s.data?.instanceKey===instance),ends=marker?.until??c.battle.time;
    c.delay(delay,()=>{if(!marker||!t.statuses.includes(marker)||t.dead)return;c.status(t,'root',Math.max(0,ends-c.battle.time),0,{harmful:true,dispel:'basic',removeOnDeath:true,ignoreStatusResistance:true,data:d});for(let i=0;i<3;i++)c.delay(i*v(c,'DAMAGE INTERVAL',1),()=>{if(!t.dead&&t.statuses.includes(marker))c.damage(t,v(c,'DAMAGE_PER_SECOND',100)*v(c,'DAMAGE INTERVAL',1),'magical');});});
   }c.delay(Math.max(STEP,v(c,'SCAN INTERVAL',STEP)),scan);
  };c.delay(v(c,'FORMATION_DELAY',2),scan);
 };}

 const jingu=registry[JINGU];jingu.handlesBreak=true;
 const legacyKey=(c:C,k:string)=>`${c.skill.id}:${k}`;
 const chargeMarker=(c:C)=>active(c,c.caster,'jinguCharges');
 const batch=(c:C)=>statuses(c.caster).find(s=>s.kind==='boundlessJinguBatch'&&s.until>c.battle.time);
 const batchKey=(c:C)=>`charges:${c.skill.instanceId??String((c.skill as unknown as {stolenOrigin?:string}).stolenOrigin??c.skill.id)}`;
 // Retain the established Boundless scalar/batch protocol. Real earned pools
 // additionally carry an expiring, dispellable marker; its removal zeros this
 // scalar, so compatibility never resurrects an expired real pool.
 const charges=(c:C)=>{const marker=chargeMarker(c);let n=marker?.remaining??Number(c.caster[legacyKey(c,'charges')]??0);const b=c.attackSourceSkill===BOUNDLESS?batch(c):undefined;if(b){const d=(b.data??={}),k=batchKey(c);if(d[k]===undefined)d[k]=n;n=Number(d[k]);}return n;};
 const update=(c:C,n:number)=>{const s=chargeMarker(c);if(s)s.remaining=Math.max(0,n);c.caster[legacyKey(c,'charges')]=Math.max(0,n);if(n<=0)c.caster.statuses=c.caster.statuses.filter(s=>s!==chargeMarker(c));};
 jingu.attackMainDamage=c=>({flatBonus:!has(c.caster,'break')&&charges(c)>0?v(c,'BONUS DAMAGE')+(!compiled(c)&&c.skill.points>=6?130:0):0});
 jingu.attackModifier=undefined;
 jingu.onAttackPoint=c=>{if(!c.attackRecord?.abilityId||c.attackRecord.abilityId==='basic_attack')c.caster.statuses=statuses(c.caster).filter(s=>!(s.kind==='attackSpeed'&&s.skill===JINGU&&s.data?.echoStrike));};
 jingu.onAttack=c=>{
  if(c.skill.points>=6&&!c.isRangedAttack?.(c.caster)){
   const excluded=['custom_monkey_king_boundless_strike','custom_phantom_assassin_stifling_dagger','riki_blink_strike','tiny_tree_volley','void_spirit_astral_step','life_stealer_infest'].includes(c.attackSourceSkill??'');
   if(excluded||c.battle.time>=get(c,'echoReady')){if(!c.caster.extraJinguSoldier)c.status(c.target,'slow',v(c,'ECHO SLOW DURATION',.8),v(c,'ECHO SLOW',100)/100,{harmful:true,dispel:'basic',removeOnDeath:true,data:data(c)});if(!excluded){set(c,'echoReady',c.battle.time+v(c,'ECHO COOLDOWN',6));buff(c,c.caster,'attackSpeed',FOREVER,v(c,'ECHO STRIKE ATTACK SPEED',490),{data:{...data(c),echoStrike:true}});c.caster.nextAttack=Math.min(c.caster.nextAttack,c.battle.time+(c.attackInterval?.(c.caster,c.target)??.3));}}
  }
  if(has(c.caster,'break')||c.caster.illusion)return;
  if(charges(c)>0){if(c.attackSourceSkill!==BOUNDLESS)update(c,Number(chargeMarker(c)?.remaining??c.caster[legacyKey(c,'charges')]??0)-1);if(c.target.side!==c.caster.side&&!c.target.building&&!c.target.hitCountBody)c.heal(c.caster,(c.amount??0)*v(c,'BONUS LIFESTEAL')/100);return;}
  const soldier=!!c.caster.extraJinguSoldier;if(!(realHero(c.target)||soldier&&!!c.target.consideredHero))return;
  const counterBody=soldier?c.caster:c.target,old=active(c,counterBody,'jinguHits')??statuses(counterBody).find(s=>s.kind==='jinguHits'&&s.source===c.caster.id&&!s.skill),count=(old?.value??0)+1;
  c.status(counterBody,'jinguHits',v(c,'COUNTER DURATION'),count,{harmful:!soldier,dispel:'none',removeOnDeath:true,piercesImmunity:true,data:data(c)});
  if(count>=v(c,'REQUIRED HITS',4)){counterBody.statuses=counterBody.statuses.filter(s=>!owned(c,counterBody,'jinguHits').includes(s as EffectStatus));buff(c,c.caster,'jinguCharges',v(c,'CHARGE DURATION',35),v(c,'BONUS DAMAGE'),{dispel:'strong',remaining:v(c,'CHARGES',4)});update(c,v(c,'CHARGES',4));}
 };
 jingu.onCast=c=>{if(c.triggerSkillId!==BOUNDLESS||has(c.caster,'break'))return;const n=Number(batch(c)?.data?.[batchKey(c)]??chargeMarker(c)?.remaining??c.caster[legacyKey(c,'charges')]??0);if(n>0)update(c,Number(chargeMarker(c)?.remaining??c.caster[legacyKey(c,'charges')]??0)-1);};
 jingu.onStatusRemoved=(c,s)=>{if(s.kind==='jinguCharges'&&c.target.id===c.caster.id)c.caster[legacyKey(c,'charges')]=0;};
 jingu.init=c=>{
  if(c.caster.extraJinguSoldier)return;
  if(c.skill.points>=6)for(const[k,param,fallback]of[['strength','ECHO STRENGTH',13],['intelligence','ECHO INTELLIGENCE',10],['attackBonus','ECHO DAMAGE',15],['attackSpeed','ECHO ATTACK SPEED',10],['manaRegen','ECHO MANA REGEN',1.75]] as const)buff(c,c.caster,k,FOREVER,v(c,param,fallback),{removeOnDeath:false,passive:false});
  if(c.skill.points<9)return;
  const next=()=>{if(!c.caster.dead&&!has(c.caster,'invisible')&&!has(c.caster,'banished')&&!has(c.caster,'break')){
    const allowed=new Set([JINGU,'custom_drow_ranger_frost_arrows','custom_slardar_bash','custom_abaddon_curse_of_avernus','custom_dawnbreaker_luminosity','custom_troll_warlord_fervor','custom_phantom_assassin_coup_de_grace','custom_luna_moon_glaive']);
    const template={...c.caster,extraJinguSoldier:true,heroClone:true,hiddenSpellBody:true,skills:c.caster.skills.filter(s=>s&&allowed.has(s.id))};for(const k of Object.keys(template))if(k.startsWith(`${JINGU}:`))delete (template as CombatUnit)[k];
    const attack=c.caster.attack*(1+statuses(c.caster).filter(s=>s.kind==='attackPct').reduce((n,s)=>n+(s.value??0),0))+statuses(c.caster).filter(s=>s.kind==='attackBonus').reduce((n,s)=>n+(s.value??0),0);
    const lifetime=v(c,'SOLDIER LIFETIME',12),soldiers=c.summon({name:'石猴战士',count:1,hp:1,attack,armor:0,range:(c.attackRange?.(c.caster)??c.caster.range)+v(c,'SOLDIER RANGE BONUS',400)/100,interval:v(c,'SOLDIER MINIMUM ATTACK INTERVAL',1.2),speed:0,lifetime,template,inheritsSkills:true,initializeInherited:true,inheritedMode:'attackEffects',attackSnapshotIncludesBonuses:true});
    const angle=get(c,'soldierCount')*Math.PI/3;set(c,'soldierCount',get(c,'soldierCount')+1);for(const soldier of soldiers){c.warp(soldier,c.caster.x+Math.cos(angle)*v(c,'SOLDIER SPAWN RADIUS',120)/100,c.caster.y+Math.sin(angle)*v(c,'SOLDIER SPAWN RADIUS',120)/100);for(const k of ['invulnerable','phased'])buff(c,soldier,k,lifetime,1,{removeOnDeath:false});buff(c,soldier,'minimumAttackInterval',lifetime,v(c,'SOLDIER MINIMUM ATTACK INTERVAL',1.2),{removeOnDeath:false});soldier.attackCapability=c.isRangedAttack?.(c.caster)?'ranged':'melee';soldier.buildingAttackOwnerRange=v(c,'SOLDIER BUILDING OWNER RANGE',500)/100;}
   }c.delay(v(c,'SOLDIER SPAWN INTERVAL',2),next);};c.delay(v(c,'SOLDIER SPAWN INTERVAL',2),next);
 };
 jingu.onDeath=c=>{update(c,0);for(const t of c.battle.units.filter(u=>u.owner===c.caster.id&&u.extraJinguSoldier))c.despawn?.(t);};
 jingu.implemented=['Hero/clone hit counter, charged flat damage and dated restoration','AA strong dispel and35second expiry, Boundless single-charge batch','Echo native attack-speed second ordinary attack and item stats','Independent nonrecursive AA two-second stone soldier bodies and minimum cadence'];jingu.remaining=['AA conservative inherited-effect allowlist and body targeting/selection remain candidates','Exact AA Echo instant-attack exceptions versus modern item list','Pre7.38b Jingu restoration amplification and absorbed/overkill basis not fully sourced'];

 const kraken=registry[KRAKEN];kraken.init=c=>buff(c,c.caster,'attackDamageBlock',FOREVER,v(c,'DAMAGE BLOCK')+(!compiled(c)&&c.skill.points>=6?40:0),{passive:true,removeOnDeath:false,data:{...data(c),chance:1,excludeWardAttacks:true}});kraken.onDamage=undefined;
 kraken.onIncomingDamageEvent=c=>{const event=c.incomingDamageEvent;if(!event||event.actualDamage<=0||c.caster.illusion||c.target.side===c.caster.side)return;
  const playerControlled=c.target.owner!==undefined||!c.target.summoned||!!c.target.heroClone;
  if(playerControlled){const timer=v(c,'THRESHOLD TIMER',7);if(c.battle.time-get(c,'lastDamage')>=timer)set(c,'damage',0);set(c,'lastDamage',c.battle.time);set(c,'damage',get(c,'damage')+event.actualDamage);if(get(c,'damage')>=v(c,'DAMAGE THRESHOLD')-(!compiled(c)&&c.skill.points>=6?100:0)){set(c,'damage',0);c.dispel(c.caster,true,true);}}
  if(c.skill.points>=9&&!event.flags.reflection&&!event.flags.noReflection&&!event.flags.healthLoss&&!event.flags.healthRemoval&&body(c.target))c.damage(c.target,event.actualDamage*v(c,'REFLECTION PERCENT',35)/100,c.damageType??'magical',true,{flags:{reflection:true,noReflection:true,noAmplification:true,noSpellLifesteal:true}});
 };kraken.implemented=['Ensured highest physical attack block excluding ward attacks','Player-controlled post-reduction counter including nested accepted instances, seven-second reset and strong dispel','Bounded Gaben same-type reflection'];kraken.remaining=['AA reflection35percent basis preserves effective-HP-loss candidate; original Lua unavailable','Deferred damage, HPLOSS and zero-damage counter qualification remain specifically unproven'];

 const laser=registry[LASER];laser.backswing=1;laser.spellBlockTiming='program';laser.range=c=>skillBalance(c.definition,c.skill.points)?.range??(v(c,'CAST RANGE')+(c.skill.points>=9?200:0))/100;
 laser.cast=c=>{if(c.trySpellBlock?.(c.target))return;const primary=c.target,targets=[primary];if(c.skill.points>=9){const bounce=c.enemies().filter(t=>t.id!==primary.id&&validVisible(c,t)&&(hero(t)||t.consideredHero)&&distance(t,primary)<=v(c,'BOUNCE RADIUS',700)/100).sort((a,b)=>distance(b,primary)-distance(a,primary))[0];if(bounce&&v(c,'BOUNCE COUNT',1)>0)targets.push(bounce);}
  const sequence=get(c,'sequence')+1;set(c,'sequence',sequence);
  for(const target of targets){if(!body(target)||has(target,'magicImmune')&&c.skill.points<9)continue;const duration=v(c,target.summoned&&!target.illusion&&!target.heroClone?'CREEP BLIND DURATION':'HERO BLIND DURATION')+(!compiled(c)&&c.skill.points>=6?2:0),shrink=c.skill.points>=9&&(hero(target)||target.nativeTemplateId==='npc_dota_lone_druid_bear'),instance=shrink?`${key(c)}:${sequence}`:key(c),d={ownerInstance:key(c),instanceKey:instance};
   // Authored beam playback follows the accepted real segment, independently
   // from the caster identity used by damage, healing and attribution.
   const from=target.id===primary.id?c.caster:primary;c.status(target,'visualLink',.4,0,{source:from.id,dispel:'none',ignoreStatusResistance:true,data:{layer:'beam',beneficiaryId:from.id}});
   c.status(target,'blind',duration,v(c,'BLIND MISS RATE',100)/100,{harmful:true,dispel:'basic',removeOnDeath:true,piercesImmunity:c.skill.points>=9,data:d});
   const blind=statuses(target).find(s=>s.kind==='blind'&&s.source===c.caster.id&&s.skill===LASER&&s.data?.instanceKey===instance);
   if(shrink&&blind){const before=target.hp,ratio=v(c,'SHRINK PERCENT',10)/100,seconds=blind.until-c.battle.time;c.status(target,'maxHpPct',seconds,-ratio,{harmful:true,dispel:'basic',removeOnDeath:true,piercesImmunity:true,ignoreStatusResistance:true,data:{...d,maxHealthOnly:true}});c.status(target,'visualScale',seconds,1-ratio,{harmful:true,dispel:'basic',removeOnDeath:true,piercesImmunity:true,ignoreStatusResistance:true,data:d});target.hp=Math.min(target.maxHp,before*(1-ratio));}
   for(const t of c.enemies().filter(t=>validVisible(c,t)&&distance(t,target)<=v(c,'RADIUS SECONDARY DAMAGE')/100))c.damage(t,(v(c,'LASER DAMAGE')+(!compiled(c)&&c.skill.points>=6?100:0))*(t.id===target.id?1:v(c,'SECONDARY DAMAGE',100)/100),'pure',c.skill.points>=9);
  }
 };laser.implemented=['AA five-rank beam/blind/range with.4+1animation','Visible area damage, main-only blind, primary-only block and instant hero-body farthest bounce','Stacked same-duration blind/max-health/model reduction, raw current-health loss without damage hooks'];laser.remaining=['AA Scepter wording omitsmaxHP; datednative linked max reduction adopted as compatibility candidate','Exact overlap area order and all HP-freeze interactions require source-specific combinations'];
}
