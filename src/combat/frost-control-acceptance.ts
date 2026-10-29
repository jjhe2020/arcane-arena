import {skillBalance,UNIT_CONFIG} from '../config';
import type {CombatUnit,SkillDefinition} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';
import {addVisualWorldEffect} from './visual-state';

const STEP=1/30,FOREVER=1_000_000,EPS=1e-8;
const FORTUNE='custom_oracle_fortunes_end',FIELD='custom_crystal_maiden_freezing_field',ARROWS='custom_drow_ranger_frost_arrows',SHIELD='lich_frost_shield',BITE='crystal_maiden_frostbite';
const FLAMES='oracle_purifying_flames',RAIN='oracle_rain_of_destiny';
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const has=(c:C,u:CombatUnit,k:string)=>u.statuses.some(s=>s.kind===k&&s.until>c.battle.time+EPS);
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const identity=(c:C)=>c.skill.instanceId??c.skill.id;
const compiled=(c:C,key:string)=>skillBalance(c.definition,c.skill.points)?.params[key]!==undefined;
const nativeValue=(c:C,key:string,fallback:number)=>{if(skillBalance(c.definition,c.skill.points))return v(c,key,fallback);const row=c.definition.values.find(row=>row.split(':')[0].trim().toUpperCase()===key);const values=row?.split(':').slice(1).join(':').match(/-?\d+(?:\.\d+)?/g)?.map(Number);return values?.[Math.min(values.length-1,Math.max(0,c.skill.points-1))]??fallback;};
const enemy=(c:C,t:CombatUnit)=>t.side!==c.caster.side&&!t.dead&&!t.ward&&!t.building&&!t.courier;
const visible=(c:C,t:CombatUnit)=>!has(c,t,'invisible')||has(c,t,'revealed');
const ordinary=(c:C,t:CombatUnit)=>!t.dead&&!t.ward&&!t.building&&!t.courier&&!has(c,t,'banished');
const sequence=(c:C,label:string)=>{const key=`frostSequence:${identity(c)}:${label}`;c.caster[key]=Number(c.caster[key]??0)+1;return`${identity(c)}:${label}:${c.caster[key]}`;};
const owner=(c:C,s:EffectStatus)=>s.source===c.caster.id&&s.skill===c.skill.id&&s.data?.ownerInstance===identity(c);
const owned=(c:C,t:CombatUnit,kind:string)=>statuses(t).find(s=>s.kind===kind&&owner(c,s));
function removeComponents(c:C,target:CombatUnit,token:unknown):void{target.statuses=statuses(target).filter(s=>!(s.source===c.caster.id&&s.skill===c.skill.id&&s.data?.componentToken===token));}

/** Effect-only native children: AA invokes Flames at its real fourth rank and
 * Rain at its only rank for free. Neither creates an active action slot. */
export const FROST_CONTROL_CHILD_DEFINITIONS:SkillDefinition[]=[
 {id:FLAMES,name:'涤罪之焰',nameEn:'Purifying Flames',description:'气运之末超神免费触发四级涤罪之焰',descriptionEn:'Free native level-four AA Fortune\'s End Super effect.',values:['DAMAGE: 90 / 180 / 270 / 360','HEAL PER SECOND: 11 / 22 / 33 / 44','DURATION: 9','TICK INTERVAL: 1'],cooldowns:[2.5,2.5,2.5,2.5],mana:[75,75,75,75],categories:['ABILITY: Unit Target','DAMAGE TYPE: Magical','PIERCES SPELL IMMUNITY: No','DISPELLABLE: Yes'],tags:['healing','magicDamage'],icon:'',super:'',gaben:'',passive:false,ultimate:false,grantedOnly:true,balanceDomain:'native',visualParentId:FORTUNE,historicalSource:{id:'oracle_purifying_flames',date:'2023-02-10; AA explicitly360/44/9'}},
 {id:RAIN,name:'命运之雨',nameEn:'Rain of Destiny',description:'气运之末G胖触发的命运之雨',descriptionEn:'Free AA Fortune\'s End Gaben effect.',values:['RADIUS: 650','DURATION: 10','DAMAGE PER SECOND: 60','HEAL PER SECOND: 60','HEAL AMP: 25','TICK INTERVAL: 1','AURA LINGER: 0.5'],cooldowns:[40],mana:[150],categories:['ABILITY: Point Target','DAMAGE TYPE: Magical','PIERCES SPELL IMMUNITY: No'],tags:['healing','magicDamage'],icon:'',super:'',gaben:'',passive:false,ultimate:false,grantedOnly:true,balanceDomain:'native',visualParentId:FORTUNE,historicalSource:{id:'oracle_rain_of_destiny',date:'2023-02-10; AA explicitly60/25/10'}}
];

function flames(c:C):void{
 const target=c.target;if(!ordinary(c,target)||has(c,target,'invulnerable')||has(c,target,'magicImmune'))return;
 const token=sequence(c,'flames'),duration=nativeValue(c,'DURATION',9),interval=nativeValue(c,'TICK INTERVAL',1);
 c.status(target,'purifyingFlames',duration,1,{dispel:'basic',removeOnDeath:true,maxStacks:Number.MAX_SAFE_INTEGER,data:{ownerInstance:identity(c),token}});
 const marker=statuses(target).find(s=>s.kind==='purifyingFlames'&&s.data?.token===token)!;
 c.damage(target,nativeValue(c,'DAMAGE',360),'magical',false,{flags:{nonLethal:target.side===c.caster.side}});
 for(let time=interval;time<=duration+EPS;time+=interval)c.delay(time,()=>{
  if(target.dead||marker.data?.removed==='dispel'||c.battle.time>marker.until+EPS)return;
  if(target.statuses.includes(marker)||marker.data?.removed==='expire')c.heal(target,nativeValue(c,'HEAL PER SECOND',44)*interval);
 });
}
function rain(c:C):void{
 const x=c.target.x,y=c.target.y,duration=v(c,'DURATION',10),radius=v(c,'RADIUS',650)/100,interval=v(c,'TICK INTERVAL',1),amount=v(c,'HEAL AMP',25)/100;
 c.zone({x,y,radius,duration,interval:STEP,immediate:true,targets:'all',effect:t=>{
  if(!ordinary(c,t))return;
  const harmful=t.side!==c.caster.side;
  c.status(t,harmful?'healReduction':'healAmplification',v(c,'AURA LINGER',.5),amount,{harmful,dispel:'none',data:{healingOnly:true,...(harmful?{restorationStacking:'multiplicative'}:{}),uniqueGroup:harmful?'rainIncomingReduction':'rainIncomingAmplification',stacking:'strongest'}});
 }});
 c.zone({x,y,radius,duration,interval,includeEnd:true,targets:'all',effect:t=>{
  if(!ordinary(c,t))return;if(t.side===c.caster.side)c.heal(t,v(c,'HEAL PER SECOND',60)*interval);else c.damage(t,v(c,'DAMAGE PER SECOND',60)*interval);
 }});
}
function fortune(c:C):void{
 c.projectile(c.target,v(c,'BOLT SPEED',1000)/100,primary=>{
  if(primary.side!==c.caster.side&&c.trySpellBlock?.(primary))return;
  const targets=c.battle.units.filter(t=>ordinary(c,t)&&distance(t,primary)<=v(c,'RADIUS')/100+EPS);
  if(c.skill.points>=6)for(const t of targets)c.castAbility(FLAMES,4,t);
  if(primary.side===c.caster.side)c.dispel(primary);
  for(const t of targets){if(t.side===c.caster.side)continue;c.dispel(t,false,false);c.status(t,'root',v(c,'ROOT DURATION'),0,{harmful:true});c.status(t,'revealed',v(c,'ROOT DURATION'),1,{harmful:true});c.damage(t,v(c,'DAMAGE'));}
  if(c.skill.points>=9)c.castAbility(RAIN,1,primary);
 });
}

function frostbite(c:C,target:CombatUnit):void{
 if(!enemy(c,target)||has(c,target,'invulnerable')||has(c,target,'banished')||has(c,target,'magicImmune'))return;
 const raw=target.nativeTemplateId?UNIT_CONFIG[target.nativeTemplateId]:undefined,level=Number(target.nativeLevel??raw?.Level),creep=target.summoned&&!target.illusion&&!target.heroClone&&!target.consideredHero&&!target.ancient&&Number.isFinite(level)&&level<=v(c,'CREEP MAX LEVEL',6);
 const duration=v(c,creep?'CREEP DURATION':'HERO DURATION')+(!compiled(c,'DAMAGE INTERVAL')&&c.skill.points>=6?1.25:0),dps=v(c,'DAMAGE PER SECOND')+(!compiled(c,'DAMAGE INTERVAL')&&c.skill.points>=9?100:0),token=sequence(c,'bite'),data={ownerInstance:identity(c),componentToken:token,frostbite:true};
 // This DOT owns the death callback, including a lethal final boundary tick.
 // Its native damage clock is separate from root/disarm presentation entries.
 c.status(target,'dot',duration,dps,{harmful:true,removeOnDeath:true,dispel:'basic',interval:v(c,'DAMAGE INTERVAL',.25),damageType:'magical',data});
 for(const kind of['root','disarm','frostbite','revealed'])c.status(target,kind,duration,kind==='revealed'?1:0,{harmful:true,dispel:'basic',removeOnDeath:true,data});
 if(c.skill.points>=6)c.status(target,'damageVulnerability',duration,v(c,'INCOMING DAMAGE AMP',25)/100,{harmful:true,removeOnDeath:true,data});
}

function frostShield(c:C):void{
 const target=c.target,duration=v(c,'BUFF DURATION'),token=sequence(c,'shield'),data={ownerInstance:identity(c),componentToken:token,token};
 c.status(target,'frostShield',duration,1,{dispel:'basic',removeOnDeath:true,piercesImmunity:true,affectsInvulnerable:true,data});
 const marker=owned(c,target,'frostShield');if(!marker)return;
 c.status(target,'attackDamageReduction',duration,v(c,'DAMAGE REDUCTION')/100+(!compiled(c,'PULSE RADIUS')&&c.skill.points>=6?.1:0),{dispel:'basic',removeOnDeath:true,piercesImmunity:true,affectsInvulnerable:true,data:{...data,heroAttackOnly:true}});
 if(c.skill.points>=6)c.status(target,'regen',duration,v(c,'HEALTH REGEN',50),{dispel:'basic',removeOnDeath:true,piercesImmunity:true,affectsInvulnerable:true,data});
 for(let time=v(c,'FIRST PULSE DELAY',.1);time<duration-EPS;time+=v(c,'PULSE INTERVAL',1))c.delay(time,()=>{
  if(target.dead||!target.statuses.includes(marker)||marker.data?.token!==token||marker.until<=c.battle.time+EPS)return;
  for(const t of c.enemies().filter(t=>enemy(c,t)&&visible(c,t)&&distance(t,target)<=v(c,'PULSE RADIUS',600)/100+EPS)){
   c.damage(t,v(c,'DAMAGE')+(c.skill.points>=9?target.maxHp*v(c,'MAX HEALTH DAMAGE',6)/100:0));
   c.status(t,'slow',v(c,'SLOW DURATION'),Math.abs(v(c,'SLOW'))/100,{harmful:true});
  }
  if(target.chainFrostSpire){const body=statuses(target).find(s=>s.kind==='hitCountBody');c.heal(target,Number(body?.data?.heroDamage??0));}
 });
}

function arrowsEligible(c:C):boolean{return !c.caster.illusion&&enemy(c,c.target)&&!has(c,c.target,'magicImmune');}
const isFrostSplinter=(c:C)=>c.attackSourceSkill===ARROWS&&c.attackBatchKey?.startsWith('frostSplinter:');
function frostArrows(c:C):void{
 if(!arrowsEligible(c))return;
 const old=owned(c,c.target,'hypothermia'),count=Math.min(v(c,'HYPOTHERMIA MAX STACKS',7),Number(old?.value??0)+1),duration=v(c,'HYPOTHERMIA DURATION',7),reduction=Math.abs(v(c,'HYPOTHERMIA REGEN REDUCTION'))/100+(!compiled(c,'HYPOTHERMIA MAX STACKS')&&c.skill.points>=6?.04:0),data={ownerInstance:identity(c)};
 c.status(c.target,'hypothermia',duration,count,{harmful:true,removeOnDeath:true,data});
 c.status(c.target,'healReduction',duration,Math.min(1,count*reduction),{harmful:true,removeOnDeath:true,data:{...data,restorationStacking:'multiplicative'}});
 c.status(c.target,'slow',v(c,'SLOW DURATION',1.5),Math.abs(v(c,'MOVEMENT SLOW'))/100,{harmful:true,removeOnDeath:true,data});
}
function hypothermiaBurst(c:C,status:EffectStatus):void{
 if(status.kind!=='hypothermia'||!status.value)return;
 const origin={x:c.target.x,y:c.target.y},damage=status.value*v(c,'HYPOTHERMIA BURST DAMAGE');
 for(const t of c.enemies().filter(t=>enemy(c,t)&&distance(t,origin)<=v(c,'HYPOTHERMIA BURST RADIUS',650)/100+EPS))c.projectile(t,v(c,'HYPOTHERMIA PROJECTILE SPEED',1300)/100,target=>{
  c.damage(target,damage);c.status(target,'slow',v(c,'HYPOTHERMIA BURST SLOW DURATION',2),v(c,'HYPOTHERMIA BURST SLOW',40)/100,{harmful:true});
 },origin);
}

function freezingField(c:C):void{
 const token=sequence(c,'field'),duration=v(c,'DURATION',10),until=c.battle.time+duration,data={ownerInstance:identity(c),componentToken:token},exposure=new Map<string,{since:number;last:number}>(),frozen=new Set<string>();
 c.status(c.caster,'armor',duration,v(c,'BONUS ARMOR'),{dispel:'none',removeOnDeath:true,data});
 if(c.skill.points>=6)c.status(c.caster,'slow',duration,v(c,'SELF MOVEMENT SLOW',75)/100,{dispel:'none',removeOnDeath:true,data});
 const cleanup=()=>removeComponents(c,c.caster,token),radius=v(c,'RADIUS')/100;
 c.zone({follow:true,radius,duration,interval:STEP,immediate:true,channel:true,effect:t=>{
  if(!enemy(c,t)||has(c,t,'invulnerable')||has(c,t,'banished'))return;
  c.status(t,'slow',v(c,'SLOW LINGER',1),Math.abs(v(c,'MOVEMENT SLOW'))/100,{harmful:true});
  c.status(t,'attackSpeed',v(c,'SLOW LINGER',1),v(c,'ATTACK SLOW'),{harmful:true});
  if(c.skill.points<9||frozen.has(t.id))return;
  let clock=exposure.get(t.id);if(!clock||c.battle.time-clock.last>.1+EPS){clock={since:c.battle.time,last:c.battle.time};exposure.set(t.id,clock);}else clock.last=c.battle.time;
  if(c.battle.time-clock.since+EPS>=v(c,'FROSTBITE EXPOSURE',1.75)){frozen.add(t.id);const own=c.caster.skills.find(s=>s?.id===BITE);c.castAbility(BITE,Math.min(3,own?.points??3),t);}
 }});
 let quadrant=0;
 c.zone({follow:true,radius:0,duration,interval:v(c,'EXPLOSION INTERVAL')-(!compiled(c,'DURATION')&&c.skill.points>=6?.02:0),channel:true,targets:'all',onEnd:cleanup,effect:t=>{
  if(t.id!==c.caster.id||c.battle.time>=until-EPS)return;
  const angle=(quadrant++%4+c.random())*Math.PI/2,r=(v(c,'EXPLOSION MIN DIST',195)+c.random()*(v(c,'EXPLOSION MAX DIST',785)-v(c,'EXPLOSION MIN DIST',195)))/100,x=c.caster.x+Math.cos(angle)*r,y=c.caster.y+Math.sin(angle)*r;
  addVisualWorldEffect(c.battle,{source:c.caster.id,skill:c.skill.id,points:c.skill.points,layer:'ice_burst',role:'world_random_explosion',kind:'burst',x,y,radius:v(c,'EXPLOSION RADIUS')/100,until:c.battle.time+16/24});
  for(const target of c.enemies().filter(t=>enemy(c,t)&&distance(t,{x,y})<=v(c,'EXPLOSION RADIUS')/100+EPS))c.damage(target,v(c,'DAMAGE'));
 }});
}
function linkens(c:C):void{
 if(c.skill.points<9)return;
 for(const[k,n]of[['statBonus',v(c,'LINKENS ALL STATS',16)],['regen',v(c,'LINKENS HP REGEN',7)],['manaRegen',v(c,'LINKENS MANA REGEN',5)]] as const)c.status(c.caster,k,FOREVER,n,{dispel:'none'});
 c.status(c.caster,'spellBlock',FOREVER,1,{dispel:'none'});
 let readyAt:number|undefined;
 const poll=()=>{const present=statuses(c.caster).some(s=>s.kind==='spellBlock'&&s.source===c.caster.id&&s.skill===c.skill.id);if(present)readyAt=undefined;else if(readyAt===undefined)readyAt=c.battle.time+v(c,'LINKENS BLOCK COOLDOWN',14);else if(!c.caster.dead&&c.battle.time>=readyAt-EPS){c.status(c.caster,'spellBlock',FOREVER,1,{dispel:'none'});readyAt=undefined;}c.delay(STEP,poll);};
 c.delay(STEP,poll);
}

export function applyFrostControlAcceptance(registry:Record<string,SkillProgram>):void{
 registry[FLAMES]={target:'any',cast:flames,onStatusRemoved:(_c,s,reason)=>{if(s.kind==='purifyingFlames'&&s.data)s.data.removed=reason;},implemented:['Effect-only AA360 magical Flames;friendlynonlethalflag and nine44HP heal ticks with independent lifetimes'],remaining:['Exact old magic-immunity/hidden-target exception scope remains in frost-control ledger'],procsOnCast:false};
 registry[RAIN]={target:'enemy',cast:rain,implemented:['Effect-only650radius rain with direct-heal-only25%aura and independent60heal/damage clocks'],remaining:['Historical first/end pulse asymmetry remains separately pending'],procsOnCast:false};
 const fortuneProgram=registry[FORTUNE];fortuneProgram.target='any';fortuneProgram.cast=fortune;fortuneProgram.spellBlockTiming='program';fortuneProgram.projectileDisjointable=false;fortuneProgram.projectileDisjointOnInvisibility=false;
 fortuneProgram.targetEligibility=(c,t)=>ordinary(c,t)&&(t.side===c.caster.side||visible(c,t));
 fortuneProgram.targetSelector=(c,targets)=>[...targets,c.caster].filter((t,i,list)=>list.findIndex(x=>x.id===t.id)===i&&fortuneProgram.targetEligibility!(c,t)&&(t.side!==c.caster.side||statuses(t).some(s=>s.harmful&&s.dispel==='basic'))).sort((a,b)=>Number(a.side!==c.caster.side)-Number(b.side!==c.caster.side)||distance(a,c.caster)-distance(b,c.caster)||a.id.localeCompare(b.id))[0];
 fortuneProgram.implemented=['Full-power no-channel undisjointable homing Fortune;primary-only impact block','Primary-ally-only basic purge;enemy purge/root/TrueSight/damage order','Independent child Flames before purge and fixed-impact Rain'];fortuneProgram.remaining=['Exact primary hidden/invulnerability exceptions and Rain first/end pulse asymmetry remain version-qualified'];
 const bite=registry[BITE];bite.cast=c=>frostbite(c,c.target);bite.onUnitDeath=undefined;bite.onAffectedUnitDeath=(c,s)=>{if(s.kind!=='dot'||!s.data?.frostbite||c.skill.points<9)return;for(const t of c.enemies())frostbite(c,t);};
 bite.onStatusRemoved=(c,s)=>{if(s.kind==='dot'&&s.data?.frostbite)removeComponents(c,c.target,s.data.componentToken);};bite.implemented=['Native quarter-second DOT clock and owned root/disarm/TrueSight','Level-bounded ordinary-creep duration and final AA Super/Gaben values','Saved-source affected-death global enemy shatter'];bite.remaining=['Exact SR clock,AA global ally wording and Freezing child upgrade inheritance remain explicit boundaries'];
 const shield=registry[SHIELD];shield.cast=frostShield;shield.targetEligibility=(c,t)=>t.side===c.caster.side&&!t.dead&&!has(c,t,'banished');shield.onStatusRemoved=(c,s)=>{if(s.kind==='frostShield')removeComponents(c,c.target,s.data?.componentToken);};shield.implemented=['First.1pulse and one-second source-owned clock;refresh invalidates old timers','Hero-only attack reduction and AA final Super/Gaben effects','Living shield/Spire pulses retain originalsource aftercasterdeath'];shield.remaining=['Different-caster stacking and Spire fixed-health healing manipulation remain separately qualified'];
 const arrows=registry[ARROWS];arrows.passive=false;arrows.handlesBreak=true;arrows.beforeAttackDamage=frostArrows;arrows.attackModifier=c=>({postCriticalBonus:arrowsEligible(c)?(v(c,'BONUS DAMAGE')+Number(owned(c,c.target,'hypothermia')?.value??0)*v(c,'HYPOTHERMIA BONUS DAMAGE PER STACK',5))*(isFrostSplinter(c)?v(c,'SPLINTER DAMAGE',50)/100:1):0});arrows.onUnitDeath=undefined;arrows.onAffectedUnitDeath=hypothermiaBurst;arrows.projectileDisjointable=true;arrows.projectileDisjointOnInvisibility=false;
 arrows.onAttack=c=>{if(c.skill.points<9||c.caster.illusion||has(c,c.caster,'break')||c.target.side===c.caster.side||c.target.ward||c.target.building||c.target.courier||isFrostSplinter(c))return;const pool=c.enemies().filter(t=>t.id!==c.target.id&&enemy(c,t)&&visible(c,t)&&distance(t,c.target)<=v(c,'SPLINTER RADIUS',375)/100+EPS),key=`frostSplinter:${sequence(c,'split')}`;for(let i=0;i<v(c,'SPLINTER TARGETS',2)&&pool.length;i++){const n=Math.floor(c.random()*pool.length),target=pool.splice(n,1)[0];c.launchAttack?.(target,v(c,'SPLINTER DAMAGE',50)/100,true,{modifierPolicy:'all',attackBatchKey:key,rangedAttackPoint:true,projectileOrigin:{x:c.target.x,y:c.target.y}});}};
 arrows.implemented=['Zero-mana active orb:ownedHypothermia beforeattack,noncritconditionalflatbonus plusnativeShard damageperstack','650-radius victim-origin deathprojectiles retain deadsource;AA final suppression','Randommodifier-enabled projectile splinters use primaryvictim origin and suppress onlyrecursiveFrostsplitting'];arrows.remaining=['Exact same-hit stack damage order,splinter bonusfactor,orbBreak/crosscaster qualification and1300deathprojectile speed remain source-qualified candidates'];
 const field=registry[FIELD];field.cast=freezingField;field.channel=c=>c.skill.points>=6?0:v(c,'DURATION',10);field.init=linkens;field.canCast=c=>c.enemies().some(t=>distance(t,c.caster)<=v(c,'RADIUS')/100);field.implemented=['Separate slow/exposure and sector-explosion clocks;ownedarmor/selfslowcleanedonend','AA freeactionSuper with strong-controlinterrupt;independentnativeLinkens recharge','Continuous1.75exposure oncepervictimpercast;freeFrostbite child'];field.remaining=['AA600aura versus native195/785spawngeometry,exactradialdistribution,Linkensactive and freeFrostbite upgrade mapping remain qualified'];
 for(const id of[FORTUNE,FIELD,ARROWS,SHIELD,BITE]){registry[id].superImplemented=true;registry[id].gabenImplemented=true;}
}
