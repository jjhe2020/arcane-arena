import {skillBalance} from '../config';
import type {BattleState,CombatUnit,SkillDefinition} from '../model';
import {skillValue,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {childValue} from './historical-children';
import {addVisualWorldEffect} from './visual-state';

const ARMOR='shredder_reactive_armor',RIFT='custom_chaos_knight_reality_rift',SCYTHE='custom_necrolyte_reapers_scythe',REBOUND='marci_companion_run',REFRACTION='templar_assassin_refraction',WHIRL='shredder_whirling_death',BOLT='chaos_knight_chaos_bolt',DISPOSE='aa_granted_rebound_dispose';
const STEP=1/30,FOREVER=1_000_000,EPS=1e-8;
const list=(t:CombatUnit)=>t.statuses as EffectStatus[],has=(c:C,t:CombatUnit,k:string)=>list(t).some(s=>s.kind===k&&s.until>c.battle.time+EPS),v=(c:C,k:string,f=0)=>c.definition.grantedOnly?childValue(c,k,f):skillValue(c,k,f),S=(c:C)=>c.skill.points>=6,G=(c:C)=>c.skill.points>=9,compiled=(c:C)=>!!skillBalance(c.definition,c.skill.points),identity=(c:C)=>c.skill.instanceId??c.skill.id;
const data=(c:C)=>({ownerInstance:identity(c),instanceKey:identity(c)}),dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y),body=(c:C,t:CombatUnit)=>!t.dead&&!t.hiddenSpellBody&&!has(c,t,'invulnerable')&&!has(c,t,'banished');
const unit=(t:CombatUnit)=>!t.ward&&!t.building&&!t.courier,hero=(t:CombatUnit)=>unit(t)&&(!t.summoned||!!t.illusion||!!t.heroClone||!!t.consideredHero||!!t.extraSpiritBear||!!t.tempestDouble),visible=(c:C,t:CombatUnit)=>!has(c,t,'undetectable')&&!has(c,t,'shadowRealm')&&(!has(c,t,'invisible')||has(c,t,'revealed'));
const enemy=(c:C,t:CombatUnit,immune=false)=>t.side!==c.caster.side&&body(c,t)&&(immune||!has(c,t,'magicImmune'));
const sequences=new WeakMap<BattleState,number>(),token=(c:C)=>{const n=(sequences.get(c.battle)??0)+1;sequences.set(c.battle,n);return `${c.caster.id}:${identity(c)}:${n}`;};
const removeRun=(t:CombatUnit,run:string)=>{t.statuses=list(t).filter(s=>s.data?.reactiveRefractionRun!==run);};
const child=(id:string,parent:string,name:string,values:string[],cooldowns:number[],mana:number[],range:number,point:number,back:number):SkillDefinition=>({id,name:id===BOLT?'混乱之箭':'过肩摔（回跃授予）',nameEn:name,icon:`/art/icons/${parent}.webp`,description:'由父技能授予的独立历史原生效果；数值不使用可编辑的AA主技能等级。',descriptionEn:'Independent historical native child; numerical levels do not alias editable AA main ranks.',tags:[],super:'',gaben:'',values,cooldowns,mana,categories:['ABILITY: Unit Target','DAMAGE TYPE: Magical'],passive:false,ultimate:false,grantedOnly:true,balanceDomain:'native',visualParentId:parent,sourceMaximumLevel:4,historicalSource:{id:id===DISPOSE?'marci_grapple':id,maxLevel:4,date:'2023-02-10'},referencePublic:{range,castPoint:point,backswing:back}});
export const REACTIVE_REFRACTION_CHILD_DEFINITIONS=[
 child(BOLT,RIFT,'Chaos Bolt',['DAMAGE_MIN: 60 / 90 / 120 / 150','DAMAGE_MAX: 120 / 180 / 240 / 300','STUN_MIN: 1.25 / 1.5 / 1.75 / 2','STUN_MAX: 2.2 / 2.8 / 3.4 / 4','CHAOS_BOLT_SPEED: 700','ILLUSION COUNT: 1','ILLUSION DAMAGE: 100','ILLUSION DAMAGE TAKEN: 325','ILLUSION DURATION: 6','ILLUSION SPAWN DISTANCE: 87'],[13,12,11,10],[110,120,130,140],5,.4,.4),
 child(DISPOSE,REBOUND,'Dispose',['IMPACT DAMAGE: 70 / 120 / 170 / 220','MOVEMENT SLOW: 20 / 30 / 40 / 50','SLOW DURATION: 3','THROW DISTANCE: 250','THROW DURATION: 0.5','LANDING RADIUS: 275','FACING ANGLE: 115'],[16,14,12,10],[90],1.75,.2,1.04),
];

interface RiftStart {caster:{x:number;y:number};target:{x:number;y:number};targetId:string;images:string[]}
const rifts=new WeakMap<BattleState,Map<string,RiftStart>>();
const riftMap=(b:BattleState)=>{let m=rifts.get(b);if(!m){m=new Map;rifts.set(b,m);}return m;};

export function applyReactiveRefractionAcceptance(registry:Record<string,SkillProgram>):void{
 const armor=registry[ARMOR];armor.onAttacked=undefined;
 armor.onBeforeAttackDamageReceived=c=>{
  const limit=v(c,'MAX STACKS')+(!compiled(c)&&S(c)?12:0),seconds=v(c,'STACK DURATION')+(!compiled(c)&&S(c)?6:0),count=v(c,hero(c.target)?'STACKS PER HERO ATTACK':'STACKS PER UNIT ATTACK',hero(c.target)?2:1);
  for(let i=0;i<count;i++){
   const opts={dispel:'none' as const,passive:false,maxStacks:limit,removeOnDeath:true,data:data(c)};
   c.status(c.caster,'reactiveArmor',seconds,1,opts);
   if(!c.caster.illusion)c.status(c.caster,'armor',seconds,v(c,'BONUS ARMOR'),opts);
   c.status(c.caster,'regen',seconds,v(c,'BONUS HP REGEN'),opts);
  }
 };
 armor.onAttacked=c=>{if(G(c)&&c.random()<v(c,'WHIRLING DEATH CHANCE',10)/100)c.castAbility(WHIRL,v(c,'WHIRLING DEATH LEVEL',4),c.caster);};
 armor.implemented=['Dated landed-contact armor before incoming damage;independent native-classified stack lifetimes','Existing stacks retain armor/regen under Break;illusion defenders gain independent regen without armor','AA final stack limits/durations and one post-contact Gaben WhirlingDeath trial'];armor.remaining=['AA Strong-only category conflicts with dated Death-only stacks;not treated as proved custom Lua','Gaben original grant level and exact before/after-damage timing remain existing working choices','Exact capped-stack replacement tie behavior is not recovered'];

 const whirl=registry[WHIRL];whirl.castPoint=0;whirl.backswing=0;
 whirl.cast=c=>{for(const target of c.battle.units.filter(t=>unit(t)&&enemy(c,t)&&dist(t,c.caster)<=v(c,'whirling_radius',325)/100)){
  if(hero(target)){
   const primary=String(target.primaryAttribute??'strength') as 'strength'|'agility'|'intelligence',loss=Math.max(0,Number(target[primary]??0))*v(c,'stat_loss_pct',10)/100,run=token(c);
   c.status(target,primary,v(c,'duration',15),-loss,{harmful:true,dispel:'basic',removeOnDeath:true,data:{instanceKey:run,afterPercent:true,copyToIllusion:false,...(primary==='strength'?{attributeHealthMode:'whirlingDeath',hpRestorePerStrength:v(c,'HP RESTORE PER STRENGTH',19)}:{}),...(primary==='intelligence'?{attributeManaMode:'preserveRatio'}:{})}});
  }
  c.damage(target,v(c,'whirling_damage',200),'pure');
 }};
 whirl.implemented=['Dated snapshot of current total primary attribute before pure damage;independent additive fixed losses','Strength application/current-health restoration and intelligence mana-percentage modes are explicit engine opt-ins','Temporary attribute losses are excluded from newly created illusion base snapshots'];whirl.remaining=['Tree cutting/damage and vision require environment outside the confirmed flat arena','Complete simultaneous attribute-provider and illusion current-health edge matrix remains bounded'];

 const rift=registry[RIFT];rift.backswing=.5;rift.spellBlockTiming='cast';rift.range=c=>skillBalance(c.definition,c.skill.points)?.range??(v(c,'CAST RANGE')+(S(c)?500:0))/100;
 rift.targetEligibility=(c,t)=>unit(t)&&enemy(c,t,S(c))&&visible(c,t);
 rift.onCastStart=c=>{riftMap(c.battle).set(`${c.caster.id}:${identity(c)}`,{caster:{x:c.caster.x,y:c.caster.y},target:{x:c.target.x,y:c.target.y},targetId:c.target.id,images:c.allies().filter(t=>t.illusion&&t.owner===c.caster.id&&body(c,t)&&dist(t,c.caster)<=v(c,'ILLUSION SEARCH RADIUS',1375)/100).map(t=>t.id)});};
 rift.cast=c=>{
  const key=`${c.caster.id}:${identity(c)}`,snap=riftMap(c.battle).get(key)??{caster:{x:c.caster.x,y:c.caster.y},target:{x:c.target.x,y:c.target.y},targetId:c.target.id,images:[]};riftMap(c.battle).delete(key);
  const dx=snap.target.x-snap.caster.x,dy=snap.target.y-snap.caster.y,length=Math.hypot(dx,dy)||1,nx=dx/length,ny=dy/length,pull=G(c)?length:Math.min(length,v(c,'PULL DISTANCE')/100),landing={x:snap.target.x-nx*pull,y:snap.target.y-ny*pull},separation=v(c,'TARGET SEPARATION',62)/100;
  c.warp(c.caster,landing.x,landing.y);if(!c.target.roshan)c.warp(c.target,landing.x+nx*separation,landing.y+ny*separation);
  for(const image of c.battle.units.filter(t=>snap.images.includes(t.id)&&!t.dead)){const angle=c.random()*2*Math.PI;c.warp(image,c.target.x+Math.cos(angle)*separation,c.target.y+Math.sin(angle)*separation);image.facing=Math.atan2(c.target.y-image.y,c.target.x-image.x);c.status(image,'attackTarget',v(c,'ARMOR DEBUFF DURATION',6),1,{dispel:'none',data:{targetId:c.target.id}});}
  c.caster.facing=Math.atan2(c.target.y-c.caster.y,c.target.x-c.caster.x);c.status(c.target,'armor',v(c,'ARMOR DEBUFF DURATION',6),-v(c,'ARMOR REDUCTION')*(!compiled(c)&&G(c)?2:1),{harmful:true,dispel:'basic',piercesImmunity:S(c),data:data(c)});
  if(S(c))c.castAbility(BOLT,v(c,'CHAOS BOLT LEVEL',4),c.target);
 };
 rift.implemented=['Dated cast-start fixed positions with native caster pull and62target separation;no disjoint or target channel stop','Nearby owned-illusion ring reposition and facing;AA backline selector retained','AA Super immunity/range and real independent native4Bolt;Gaben direct pull/final doubled armor'];rift.remaining=['AA any-images exact search/filter scope and illusion-ring collision clearspace remain bounded','Full issued attack-order queue is represented by arena AI/temporary illusion target lock','Reflected order and unavailable Roshan-specific body require their own paired acceptance'];

 registry[BOLT]={target:'enemy',unitTarget:true,castPoint:.4,backswing:.4,range:5,spellBlockTiming:'impact',projectileDisjointable:true,projectileDisjointOnInvisibility:true,targetEligibility:(c,t)=>unit(t)&&enemy(c,t)&&visible(c,t),implemented:['Native4inverse damage/stun and700speed impact block/disjoint','AA explicit unconditional six-second100percent strong image overrides native Phantasm-draft prerequisite'],remaining:['Continuous inverse random trial is existing work distribution,not recovered native generator','Exact spawn angle and arbitrary-body collision policy remain bounded'],cast:c=>{
  const roll=c.random(),damage=v(c,'DAMAGE_MIN')+(v(c,'DAMAGE_MAX')-v(c,'DAMAGE_MIN'))*roll,stun=v(c,'STUN_MAX')-(v(c,'STUN_MAX')-v(c,'STUN_MIN'))*roll;
  c.projectile(c.target,v(c,'CHAOS_BOLT_SPEED',700)/100,target=>{
   if(!enemy(c,target))return;
   c.status(target,'stun',stun,0,{harmful:true,dispel:'strong'});
   const images=c.summon({name:'混乱之箭幻象',count:v(c,'ILLUSION COUNT',1),hp:c.caster.maxHp,currentHp:c.caster.hp,mana:c.caster.mana,maxMana:c.caster.maxMana,attack:c.caster.attack*v(c,'ILLUSION DAMAGE',100)/100,attributeAttackScale:v(c,'ILLUSION DAMAGE',100)/100,armor:c.caster.armor,range:c.caster.range,interval:c.caster.attackInterval,speed:c.caster.moveSpeed,lifetime:v(c,'ILLUSION DURATION',6),illusion:true,strongIllusion:true,damageTaken:v(c,'ILLUSION DAMAGE TAKEN',325)/100,inheritsSkills:true,initializeInherited:true,inheritedMode:'passives',position:{x:target.x,y:target.y+v(c,'ILLUSION SPAWN DISTANCE',87)/100}});
   for(const image of images)c.status(image,'attackTarget',v(c,'ILLUSION DURATION',6),1,{dispel:'none',data:{targetId:target.id}});
   c.damage(target,damage,'magical');
  });
 }};

 const refraction=registry[REFRACTION];refraction.backswing=0;refraction.attackModifier=undefined;
 refraction.cast=c=>{const n=v(c,'INSTANCES')+(!compiled(c)&&G(c)?8:0),duration=v(c,'DURATION');c.status(c.caster,'refraction',duration,n,{remaining:n,dispel:'none',removeOnDeath:true,data:{...data(c),damageThreshold:v(c,'DAMAGE THRESHOLD',5),thresholdInclusive:true,consumesThroughFalsePromise:true}});c.status(c.caster,'refractionAttack',duration,v(c,'BONUS DAMAGE')+(!compiled(c)&&S(c)?100:0),{remaining:n,dispel:'none',removeOnDeath:true,data:data(c)});};
 refraction.attackMainDamage=c=>({flatBonus:c.target.side===c.caster.side?0:list(c.caster).find(s=>s.kind==='refractionAttack'&&s.data?.instanceKey===identity(c)&&Number(s.remaining)>0)?.value??0});
 refraction.onAttack=c=>{if(c.target.side===c.caster.side)return;const status=list(c.caster).find(s=>s.kind==='refractionAttack'&&s.data?.instanceKey===identity(c)&&Number(s.remaining)>0);if(!status)return;status.remaining!--;if(status.remaining!<=0)c.caster.statuses=list(c.caster).filter(s=>s!==status);};
 refraction.implemented=['Separate dated Death-only damage and defense pools with final AA Super/Gaben values','Flat main bonus frozen at attack begin;landed contact consumes current pool including one gained during flight','Five-after-reductions inclusive source threshold;FalsePromise priority consumes a charge without fake absorption'];refraction.remaining=['AA Strong-only metadata contradicts dated Death-only/KVNOdispel;not assumed a custom implementation','HPLOSS versus non-damage health removal and complete barrier-family order need precise paired sources'];

 const rebound=registry[REBOUND];rebound.target='ally';rebound.unitTarget=true;rebound.backswing=0;rebound.range=c=>skillBalance(c.definition,c.skill.points)?.range??v(c,'CAST / JUMP RANGE')/100;rebound.targetEligibility=(c,t)=>t.id!==c.caster.id&&unit(t)&&body(c,t);rebound.targetSelector=(c,ts)=>ts.sort((a,b)=>dist(a,c.caster)-dist(b,c.caster)||a.id.localeCompare(b.id))[0];rebound.canCast=c=>c.battle.units.some(t=>enemy(c,t)&&visible(c,t));
 rebound.cast=c=>{
  const ally=c.target,target=c.battle.units.filter(t=>unit(t)&&enemy(c,t)&&visible(c,t)).sort((a,b)=>dist(b,c.caster)-dist(a,c.caster))[0];if(!target)return;
  const run=token(c),base=skillBalance(c.definition,c.skill.points)?.range??v(c,'CAST / JUMP RANGE')/100,castRange=c.effectiveCastRange?.(base)??base,maximum=c.effectiveCastRange?.(base+v(c,'SUPER LEAP BONUS',S(c)?1000:0)/100)??base+v(c,'SUPER LEAP BONUS',S(c)?1000:0)/100;
  let phase:'dash'|'leap'|'ended'='dash';
  let lastWake={x:c.caster.x,y:c.caster.y};
  const stampWake=()=>{const point={x:c.caster.x,y:c.caster.y};if(dist(point,lastWake)>EPS){addVisualWorldEffect(c.battle,{source:c.caster.id,skill:REBOUND,points:c.visualPoints??c.skill.points,layer:'wind_wake',kind:'burst',...point,angle:Math.atan2(point.y-lastWake.y,point.x-lastWake.x),until:c.battle.time+12/24});lastWake=point;}};
  // Sample only visited body positions; these short art leases never predict
  // the route, schedule damage, or change the active movement controller.
  const wake=()=>{if(phase==='ended')return;stampWake();c.delay(STEP,wake);};c.delay(STEP,wake);
  const cleanup=()=>{phase='ended';removeRun(c.caster,run);};
  c.status(c.caster,'actionLock',FOREVER,0,{dispel:'none',removeOnDeath:true,data:{reactiveRefractionRun:run}});
  if(S(c))for(const t of[c.caster,ally])c.status(t,'magicImmune',v(c,'SUPER IMMUNITY DURATION',2),0,{dispel:'none',removeOnDeath:true,data:{instanceKey:run}});
  const cancel=()=>{if(phase!=='dash')return;phase='ended';if(c.motionActive?.(c.caster)?.skill===REBOUND)c.cancelMotion?.(c.caster);cleanup();};
  const leap=()=>{
   if(phase!=='dash'||c.caster.dead)return cancel();phase='leap';
   c.status(ally,'haste',v(c,'ALLY BUFF DURATION',5),v(c,'ALLY MOVEMENT SPEED',c.skill.points===1?25:c.skill.points===2?30:40)/100,{dispel:'basic',piercesImmunity:true,affectsInvulnerable:true});
   const origin={x:c.caster.x,y:c.caster.y},dx=target.x-origin.x,dy=target.y-origin.y,gap=Math.hypot(dx,dy)||1,nx=dx/gap,ny=dy/gap,min=v(c,'MIN LEAP DISTANCE',450)/100,length=Math.max(min,Math.min(maximum,gap)),offset=v(c,'LANDING OFFSET',64)/100,travel=maximum<=min?v(c,'MAX LEAP DURATION',.2):v(c,'MIN LEAP DURATION',.1)+(v(c,'MAX LEAP DURATION',.2)-v(c,'MIN LEAP DURATION',.1))*Math.max(0,Math.min(1,(length-min)/(maximum-min)));
   c.caster.facing=Math.atan2(ny,nx);
   const moved=c.moveContinuous(c.caster,origin.x+nx*(length-offset),origin.y+ny*(length-offset),{duration:travel,ignoreTerrainBarriers:true,continueAfterDeath:true,onEnd:reason=>{if(phase!=='leap')return;stampWake();cleanup();if(reason!=='complete')return;const center={x:c.caster.x+nx*offset,y:c.caster.y+ny*offset};addVisualWorldEffect(c.battle,{source:c.caster.id,skill:REBOUND,points:c.visualPoints??c.skill.points,layer:'land',kind:'burst',...center,radius:v(c,'LANDING RADIUS',275)/100,until:c.battle.time+16/24});for(const t of c.battle.units.filter(t=>unit(t)&&enemy(c,t)&&dist(t,center)<=v(c,'LANDING RADIUS',275)/100)){
    c.damage(t,v(c,'IMPACT DAMAGE'),'magical');if(t.dead)continue;c.status(t,'stun',v(c,'STUN DURATION'),0,{harmful:true,dispel:'strong',data:{...data(c),reactiveRefractionRun:run}});if(G(c)&&list(t).some(s=>s.kind==='stun'&&s.skill===REBOUND&&s.data?.reactiveRefractionRun===run&&s.until>c.battle.time))c.castAbility(DISPOSE,v(c,'DISPOSE LEVEL',4),t);
   }}});if(!moved)cleanup();
  };
  c.projectile(ally,v(c,'APPROACH SPEED',1700)/100,leap,undefined,position=>{if(phase!=='dash')return;if(c.caster.dead||dist(c.caster,ally)>castRange+v(c,'ABORT DISTANCE BUFFER',700)/100)return cancel();if(!c.moveContinuous(c.caster,position.x,position.y,{duration:STEP,ignoreTerrainBarriers:true}))cancel();},{onDisjoint:cancel,onTargetLost:cancel});
 };
 rebound.implemented=['Real ally unit-target and homing dash;arrival-only ally speed,disjoint/abort and terrain-wall traversal','Continuous offset leap with authoritative landing callback:damage then stun;root/stun do not cancel existing motion','AA Super separate leap-only bonus and immunity;Gaben independent four-level native Dispose'];rebound.remaining=['Exact native ballistic duration curve is not recovered;bounded old linear policy remains','AA Super immunity starts at cast per retained candidate;exact original Lua timing unavailable','Primary ally death and arbitrary spell-wall intersection exceptions remain specific boundaries'];

 const dispose=registry.marci_grapple;
 registry[DISPOSE]={...dispose,castPoint:.2,backswing:1.04,range:1.75,superImplemented:false,gabenImplemented:false,implemented:['Independent native four-rank Dispose numerical table uses the already audited throw/landing program'],remaining:['Parent-AA freely triggered effect has no extra mana/animation;native ordinary slot retains its own public values','Full Dispose mechanism acceptance remains owned by its earlier ledger']};

 const scythe=registry[SCYTHE],rewarded=new WeakMap<BattleState,Set<string>>();
 const state=(c:C)=>(c.caster.skillState??={}) as Record<string,number>;
 const gain=(c:C,key:string,amount:number)=>{const gains=(c.caster.permanentSkillGains??={}) as Record<string,number>;state(c)[key]=(state(c)[key]??0)+amount;gains[key]=(gains[key]??0)+amount;};
 const regen=(c:C)=>{
  for(const[kind,key]of[['regen','hpRegen'],['manaRegen','manaRegen'],['scytheRegenStacks','kills']]as const){const value=state(c)[`${SCYTHE}:${key}`]??0,old=list(c.caster).find(s=>s.skill===SCYTHE&&s.kind===kind&&s.data?.instanceKey===identity(c));if(old){old.value=value;old.until=c.battle.time+FOREVER;}else c.status(c.caster,kind,FOREVER,value,{dispel:'none',passive:false,removeOnDeath:false,data:data(c)});}
 };
 scythe.init=regen;scythe.backswing=1.5;scythe.range=c=>skillBalance(c.definition,c.skill.points)?.range??(S(c)?11:6);scythe.onUnitDeath=undefined;
 scythe.targetEligibility=(c,t)=>hero(t)&&enemy(c,t)&&visible(c,t);
 scythe.cast=c=>{
  const target=c.target,seconds=v(c,'STUN DURATION',1.5),run=token(c),options:Partial<EffectStatus>={harmful:true,dispel:'none',removeOnDeath:true,ignoreStatusResistance:true,data:{instanceKey:run,reactiveRefractionRun:run}};
  c.status(target,'stun',seconds,0,options);
  c.status(target,'scytheCredit',seconds+STEP,0,{...options,data:{...options.data,mechanicalKillCredit:true,killCreditPriority:1000}});
  if(!list(target).some(s=>s.kind==='scytheCredit'&&s.data?.instanceKey===run))return;
  c.delay(seconds,()=>{
   if(!target.dead){const damage=Math.max(0,target.maxHp-target.hp)*v(c,'DAMAGE PER MISSING HP'),center={x:target.x,y:target.y};c.damage(target,damage,'magical',true);
    if(G(c)){const others=c.battle.units.filter(t=>t.id!==target.id&&unit(t)&&enemy(c,t,true)&&dist(t,center)<=v(c,'GABEN RADIUS',400)/100);for(const other of others)c.damage(other,damage*v(c,'GABEN DAMAGE PERCENT',100)/100/Math.max(1,others.length),'magical');}
   }
   removeRun(target,run);
  });
 };
 scythe.onAffectedUnitDeath=(c,status)=>{
  if(status.kind!=='scytheCredit')return;
  const credit=(c as C&{deathCredit?:{sourceId:string;skillId:string;skillInstanceId?:string;statusInstanceKey?:string}}).deathCredit;
  if(!credit||credit.sourceId!==c.caster.id||credit.skillId!==SCYTHE||credit.statusInstanceKey!==status.data?.instanceKey)return;
  let seen=rewarded.get(c.battle);if(!seen){seen=new Set;rewarded.set(c.battle,seen);}const key=`${c.caster.id}:${c.target.id}:${c.battle.time}`;if(seen.has(key))return;seen.add(key);
  if(!c.target.tempestDouble){gain(c,`${SCYTHE}:hpRegen`,v(c,'HP REGEN')+(!compiled(c)&&S(c)?9:0));gain(c,`${SCYTHE}:manaRegen`,v(c,'MANA REGEN')+(!compiled(c)&&S(c)?6:0));gain(c,`${SCYTHE}:kills`,1);regen(c);}
  if(S(c)&&!c.caster.dead){const health=c.caster.hp,mana=c.caster.mana;c.heal(c.caster,health);c.mana(c.caster,mana);}
 };
 scythe.implemented=['Dated1.5second status-resistance-independent Death-only mark and end-of-duration missing-health damage','Later spell immunity cannot stop an established mark;mechanical highest-priority killcredit leaves user4A original damage statistics intact','Nonretroactive persistent regen on credited eligible deaths,including illusion/creepHero/reincarnation and postmortem source;TempestDouble excluded','AA final Super reward/range/current-resource restoration and Gaben extra divided-damage working policy'];
 scythe.remaining=['AA Gaben raw-versus-effective basis,denominator/immunity and early-death/secondary-kill rewards are unrecovered originalLua choices','Same-priority multi-caster latest-mark tie policy is engineering arbitration,not native-version proof','Custom Super restoration after source death,spell loss and special hidden/swallowed/clone-family deaths remain individually unproved'];
}
