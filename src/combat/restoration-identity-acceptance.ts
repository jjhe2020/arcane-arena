import {skillBalance} from '../config';
import type {CombatUnit,SkillStack} from '../model';
import {skillValue as v,type EffectContext as C,type EffectStatus,type SkillProgram} from '../skill-effects';

const ESSENCE='custom_slark_essence_shift',EYE='custom_razor_eye_of_the_storm',FADE='rubick_fade_bolt',PROMISE='oracle_false_promise',FEAST='life_stealer_feast',WOUNDS='life_stealer_open_wounds';
const statuses=(u:CombatUnit)=>u.statuses as EffectStatus[];
const has=(c:C,u:CombatUnit,kind:string)=>u.statuses.some(s=>s.kind===kind&&s.until>c.battle.time+1e-8);
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const identity=(c:C)=>c.skill.instanceId??c.skill.id;
const enemy=(c:C,t:CombatUnit)=>t.side!==c.caster.side&&!t.ward&&!t.building&&!t.courier;
const hero=(u:CombatUnit)=>!u.summoned||!!u.illusion||!!u.heroClone||!!u.consideredHero;
const essenceTarget=(c:C,t:CombatUnit)=>enemy(c,t)&&!t.illusion&&(!t.summoned||!!t.heroClone||!!t.extraSpiritBear);
const owner=(c:C,s:EffectStatus)=>s.source===c.caster.id&&s.skill===c.skill.id&&s.data?.ownerInstance===identity(c);
const compiled=(c:C)=>!!skillBalance(c.definition,c.skill.points);

function permanentAgility(c:C,amount:number):void{
 const name=`${c.skill.id}:agility`,state=(c.caster.skillState??{}) as Record<string,number>,gains=(c.caster.permanentSkillGains??{}) as Record<string,number>;
 state[name]=(state[name]??0)+amount;gains[name]=(gains[name]??0)+amount;c.caster.skillState=state;c.caster.permanentSkillGains=gains;
 const existing=statuses(c.caster).find(s=>s.kind==='agility'&&s.skill===`${c.skill.id}:persistent`&&s.source===c.caster.id);
 if(c.caster.dead&&existing)existing.value=state[name];
 else c.status(c.caster,'agility',1e6,state[name],{skill:`${c.skill.id}:persistent`,passive:false,dispel:'none'});
}
function essenceLoss(c:C):boolean{
 if(c.caster.illusion||has(c,c.caster,'break')||!essenceTarget(c,c.target)||c.target.dead)return false;
 const duration=v(c,'STACK DURATION'),data={ownerInstance:identity(c)},options={harmful:true,passive:false,dispel:'strong' as const,piercesImmunity:true,ignoreStatusResistance:true,removeOnDeath:true,maxStacks:Number.MAX_SAFE_INTEGER,data};
 for(const kind of['strength','agility','intelligence'])c.status(c.target,kind,duration,-v(c,'ALL ATTRIBUTE LOSS'),options);
 c.status(c.target,'essenceShift',duration,0,options);return true;
}
function essenceGain(c:C):void{c.status(c.caster,'agility',v(c,'STACK DURATION'),v(c,'AGILITY GAIN'),{passive:false,dispel:'none',removeOnDeath:true,maxStacks:Number.MAX_SAFE_INTEGER,data:{ownerInstance:identity(c)}});}

function eyeArmor(c:C,target:CombatUnit,amount:number):void{
 const old=statuses(target).find(s=>s.kind==='armor'&&owner(c,s)&&s.data?.eyeArmor),value=(old?.value??0)+amount;
 c.status(target,'armor',v(c,'DURATION'),value,{harmful:target.side!==c.caster.side,dispel:'strong',piercesImmunity:true,removeOnDeath:true,data:{ownerInstance:identity(c),eyeArmor:true,instanceKey:identity(c)}});
}
function eye(c:C):void{
 c.endChannel();
 c.status(c.caster,'eyeStormOwner',2*v(c,'DURATION'),1,{dispel:'none',removeOnDeath:true,data:{ownerInstance:identity(c)}});
 const interval=v(c,'STRIKE INTERVAL')-(!compiled(c)&&c.skill.points>=9?.2:0);
 c.zone({follow:true,radius:.01,duration:v(c,'DURATION'),interval,includeEnd:true,targets:'all',effect:body=>{
  if(body.id!==c.caster.id)return;
  const linked=new Set(statuses(c.caster).filter(s=>s.kind==='staticLinkActive'&&s.until>c.battle.time).map(s=>String(s.data?.targetId)));
  const pool=c.enemies().filter(t=>enemy(c,t)&&!t.dead&&!has(c,t,'attackImmune')&&!(has(c,t,'invisible')&&!has(c,t,'revealed'))&&!t.roshan&&distance(t,c.caster)<=v(c,'RADIUS')/100+1e-8);
  for(let n=0;n<v(c,'TARGETS')+(!compiled(c)&&c.skill.points>=6?2:0)&&pool.length;n++){
   const priority=pool.some(t=>linked.has(t.id)),best=pool.filter(t=>!priority||linked.has(t.id)),health=Math.min(...best.map(t=>t.hp)),ties=best.filter(t=>Math.abs(t.hp-health)<1e-8),target=ties[Math.floor(c.random()*ties.length)];
   pool.splice(pool.indexOf(target),1);eyeArmor(c,target,-v(c,'ARMOR REDUCTION'));c.damage(target,v(c,'DAMAGE'),'physical',true);
  }
  if(c.skill.points>=9){const fraction=v(c,'OPPOSITE EFFECT PERCENT',33)/100;eyeArmor(c,c.caster,v(c,'ARMOR REDUCTION')*fraction);c.heal(c.caster,v(c,'DAMAGE')*fraction);}
 }});
}

function fade(c:C):void{
 const visited=new Set<string>(),damage=v(c,'DAMAGE'),decay=1-v(c,'JUMP REDUCTION')/100,duration=v(c,'DEBUFF DURATION'),reduction=v(c,'DAMAGE REDUCTION')/100;
 const valid=(t:CombatUnit)=>enemy(c,t)&&!t.dead&&!has(c,t,'invulnerable')&&!has(c,t,'banished')&&!(has(c,t,'invisible')&&!has(c,t,'revealed'));
 const hit=(target:CombatUnit,hop:number)=>{
  if(!valid(target))return;visited.add(target.id);const stolen=target.attack*reduction;
  c.damage(target,damage*Math.pow(decay,hop));
  c.status(target,'baseAttackDamageReduction',duration,reduction,{harmful:true,data:{ownerInstance:identity(c)},dispel:'basic'});
  if(c.skill.points>=6)c.attack(target,1,true,undefined,true);
  if(c.skill.points>=9)c.status(c.caster,'attackBonus',duration,stolen,{dispel:'basic',data:{ownerInstance:identity(c),instanceKey:`${identity(c)}:${target.id}`}});
  c.delay(v(c,'BOUNCE INTERVAL',.25),()=>{const next=c.enemies().filter(t=>valid(t)&&!visited.has(t.id)&&distance(t,target)<=v(c,'BOUNCE RADIUS',440)/100+1e-8);if(next.length)hit(next[Math.floor(c.random()*next.length)],hop+1);});
 };hit(c.target,0);
}

interface FeastProvider {unit:CombatUnit;skill:SkillStack;damage:number;heal:number}
function feastProvider(c:C,attacker:CombatUnit):FeastProvider|undefined{
 if(attacker.illusion||attacker.ward||attacker.building)return;
 const choices:FeastProvider[]=[];
 for(const unit of c.battle.units){if(unit.dead||unit.side!==attacker.side||unit.illusion||has(c,unit,'break'))continue;
  for(const skill of unit.skills){if(!skill||skill.id!==FEAST||(unit.id!==attacker.id&&skill.points<9))continue;const context={...c,caster:unit,skill};choices.push({unit,skill,damage:v(context,'MAX HEALTH DAMAGE')/100,heal:v(context,'MAX HEALTH LIFE STEAL')/100});}
 }
 return choices.sort((a,b)=>b.damage-a.damage||b.heal-a.heal||Number(b.unit.id===attacker.id)-Number(a.unit.id===attacker.id)||a.unit.id.localeCompare(b.unit.id))[0];
}
const feastVictim=(c:C)=>enemy(c,c.target)&&!c.target.roshan;
function applyWounds(c:C,target:CombatUnit):void{
 if(target.dead||!enemy(c,target)||has(c,target,'magicImmune'))return;
 const sequence=`woundsSequence:${identity(c)}`;c.caster[sequence]=Number(c.caster[sequence]??0)+1;const token=`${identity(c)}:${c.caster[sequence]}`;
 const duration=v(c,'duration',7),data={ownerInstance:identity(c),instanceKey:identity(c),token,received:0,spread:false,maxHpPct:v(c,'max_health_as_damage_pct',2)/100,threshold:v(c,'damage_threshold',500),radius:v(c,'spread_radius',700)/100};
 c.status(target,'openWounds',duration,v(c,'heal_percent',50)/100,{harmful:true,dispel:'basic',removeOnDeath:true,data});
 const clock=statuses(target).find(s=>s.kind==='openWounds'&&owner(c,s))!;
 const slow=(second:number)=>{if(!target.statuses.includes(clock)||clock.data?.token!==token||clock.until<=c.battle.time+1e-8)return;c.status(target,'slow',Math.min(v(c,'SLOW STEP INTERVAL',1),clock.until-c.battle.time),v(c,`SLOW SECOND ${Math.min(7,second+1)}`,[50,50,40,30,20,10,10][Math.min(6,second)])/100,{harmful:true,dispel:'basic',removeOnDeath:true,ignoreStatusResistance:true,data:{ownerInstance:identity(c),woundsSlow:true,instanceKey:`${identity(c)}:slow`}});};
 slow(0);for(let second=1;second<duration;second++)c.delay(second*v(c,'SLOW STEP INTERVAL',1),()=>slow(second));
}

/** AA-specific values remain table-authored. Native identities, attack bonus
 * composition and frozen deferred ledgers are reviewed separately in the
 * restoration-identity ledger, including precise unresolved custom clauses. */
export function applyRestorationIdentityAcceptance(registry:Record<string,SkillProgram>):void{
 const essence=registry[ESSENCE],oldInit=essence.init;essence.init=c=>oldInit?.(c);essence.handlesBreak=true;essence.onUnitDeath=undefined;essence.onDealDamage=undefined;
 essence.beforeAttackDamage=c=>{if(essenceLoss(c)&&c.attackRecord)c.attackRecord.data[`essence:${identity(c)}`]=true;};
 essence.onAttack=c=>{if(c.attackRecord?.data[`essence:${identity(c)}`])essenceGain(c);};
 essence.onAbilityDamageEvent=c=>{if(c.skill.points<9||!essenceTarget(c,c.target)||c.caster.illusion||has(c,c.caster,'break'))return;const event=c.abilityDamageEvent;if(!event||event.inputAmount<=0||event.flags.reflection||event.flags.healthRemoval||event.flags.noDamageHooks)return;const spell=event.attribution?.skillInstanceId??event.attribution?.abilityId??c.triggerSkillId;if(!spell)return;const key=`essenceSpell:${identity(c)}:${spell}:${c.target.id}`;if(Number(c.caster[key]??-1)>c.battle.time+1e-8)return;c.caster[key]=c.battle.time+v(c,'SPELL PROC COOLDOWN',1);if(essenceLoss(c))essenceGain(c);};
 essence.onAffectedUnitDeath=(c,status)=>{if(status.kind!=='essenceShift'||c.skill.points<6)return;const death=[...c.battle.events].reverse().find(e=>e.type==='death'&&e.target===c.target.id),token=death?.sequence??c.battle.time,key=`essenceReward:${identity(c)}:${c.target.id}`;if(c.caster[key]===token)return;c.caster[key]=token;permanentAgility(c,v(c,'PERMANENT AGILITY',2));};
 essence.implemented=['Victim independent attribute-loss entries before attack and caster agility after contact;no arbitrary100-stack cap','Existing temporary agility survives Break;new gains suppressed while source-owned permanent affected-death rewards survive Break/deadowner','AA strong-dispellable victim loss,Super+2persistentagility and instance-isolated Gaben per-spell/per-victim one-second damage-event clock'];essence.remaining=['Gaben accepted-zero and first-lethal-spell ordering are explicit AA working choices,not recoveredcustomLua','Exact historical clone/SpiritBear and attribute-underflow interactions remain separately qualified'];

 const storm=registry[EYE];storm.cast=eye;storm.canCastWhileChanneling=true;const clearStormArmor=(c:C)=>{for(const unit of c.battle.units)unit.statuses=statuses(unit).filter(s=>!(s.skill===EYE&&s.source===c.caster.id&&s.data?.eyeArmor));};storm.onDeath=clearStormArmor;storm.onAffectedUnitDeath=(c,status)=>{if(status.kind==='eyeStormOwner')clearStormArmor(c);};
 storm.implemented=['Independent following storm clocks;StaticLink target priority then lowestHP with seeded randomties','Source-counter armor reduction before physical strike;AAstrongdispel and owner-death cleanup','FinalSuperthree targets;Gaben.3interval and33percent opposite selfhealing/armor'];storm.remaining=['Different-owner armor stacking and AAstrong-dispel category scope on the storm itself require exactcustom qualification','Fog/couriers/Roshan are not normal autonomous arena units'];

 const bolt=registry[FADE];bolt.cast=fade;bolt.projectileDisjointable=false;bolt.implemented=['Immediate primary effect and fixed.25-second random unique440-radius bounces','Damage decay,main attack reduction,secondaryspell-block bypass and independently purgable source buff/debuff','AA modifier-enabled Super instant attacks and Gaben per-victim attack-steal refresh with final6-secondcooldown'];bolt.remaining=['AA Gaben says attackdamage without the native old-talent hero qualifier;existing all-valid-victim policy is retained explicitly','ReleasedSuper instant attacks aftercasterdeath and exactcurrent-versus-base-mainattack steal snapshot remain source boundaries'];

 const promise=registry[PROMISE];promise.targetEligibility=(c,t)=>t.side===c.caster.side&&hero(t)&&!t.dead&&!has(c,t,'invulnerable')&&!has(c,t,'banished');promise.cast=c=>{const duration=v(c,'DURATION')+(!compiled(c)&&c.skill.points>=6?1.5:0);c.dispel(c.target,true);c.status(c.target,'falsePromise',duration,1,{dispel:'none',data:{healMultiplier:1+v(c,'DELAYED HEAL AMPLIFICATION')/100}});if(c.skill.points>=6)c.status(c.target,'armor',duration,v(c,'BONUS ARMOR',15),{dispel:'none'});if(c.skill.points>=9){c.status(c.target,'lifesteal',duration,v(c,'ATTACK LIFESTEAL',25)/100,{dispel:'none'});c.status(c.target,'spellLifesteal',duration,v(c,'SPELL LIFESTEAL',25)/100,{dispel:'none'});}};
 promise.implemented=['Hero-type ally targeting and one initial strongdispel','Frozen net ledger waits through invulnerability after timer ends without continuing protection or doublehealing','AA finalSuperduration/armor/CD and Gaben attack/spell-lifesteal period'];promise.remaining=['Crosscaster reapplication and AAcategoryStrongDispelsOnly versus nativeundispellable timer remain explicit source conflicts','HistoricalTether/on-heal transfer timing and final netheal manipulation require separate native evidence'];

 const feast=registry[FEAST];feast.onAttack=undefined;feast.onAllyAttack=undefined;
 feast.beforeAttackDamage=c=>{if(!feastVictim(c))return;const provider=feastProvider(c,c.caster);if(provider?.unit.id===c.caster.id&&provider.skill===c.skill)c.lifestealHeal?.(c.caster,c.target.maxHp*provider.heal,c.caster);};
 feast.attackModifier=c=>{if(!feastVictim(c))return{};const provider=feastProvider(c,c.caster);return provider?.unit.id===c.caster.id&&provider.skill===c.skill?{bonus:c.target.maxHp*provider.damage}:{};};
 feast.onAllyBeforeAttackDamage=c=>{if(c.skill.points<9||!feastVictim(c))return;const attacker=c.battle.units.find(u=>u.id===c.triggerUnitId);if(!attacker)return;const provider=feastProvider(c,attacker);if(provider?.unit.id!==c.caster.id||provider.skill!==c.skill)return;c.addAttackBonus?.(c.target.maxHp*provider.damage);c.lifestealHeal?.(attacker,c.target.maxHp*provider.heal,attacker);};
 feast.implemented=['Conditional attack bonus before critical/armor/block,eligible for normal lifesteal/cleave but not spelllifesteal','Independent max-health selfrestoration before attack with provider-owned lifesteal statistics','AA global aura selects one strongest own/aura provider and uses actualattackerlifesteal amplification;Super independentOpenWounds retained'];feast.remaining=['Strongest-provider/no-double stacking and illusion eligibility of AAglobal aura remain disclosed custom working policies','Full source-specific HPRemoval and return-damage exceptions for OpenWounds need historical qualification'];

 const wounds=registry[WOUNDS];wounds.cast=c=>applyWounds(c,c.target);
 wounds.onAffectedUnitDamage=(c,status)=>{if(status.kind!=='openWounds'||!status.data)return;const attacker=c.battle.units.find(u=>u.id===c.triggerUnitId);
  if(attacker&&attacker.side===c.caster.side&&attacker.id!==c.target.id&&!c.damageFlags?.reflection)c.lifestealHeal?.(attacker,(c.amount??0)*(status.value??0),attacker);
  status.data.received=Number(status.data.received??0)+(c.amount??0);if(status.data.spread||Number(status.data.received)<Number(status.data.threshold??500))return;status.data.spread=true;
  const candidates=c.enemies().filter(t=>t.id!==c.target.id&&enemy(c,t)&&!has(c,t,'magicImmune')&&distance(t,c.target)<=Number(status.data!.radius??7)&&!statuses(t).some(s=>s.kind==='openWounds'&&owner(c,s)));if(candidates.length)applyWounds(c,candidates[Math.floor(c.random()*candidates.length)]);
 };
 wounds.onStatusRemoved=(c,status)=>{if(status.kind==='openWounds')c.target.statuses=statuses(c.target).filter(s=>!(s.kind==='slow'&&s.data?.woundsSlow&&owner(c,s)));};
 wounds.implemented=['Source-owned seven-second OpenWounds,50percent actual-damage lifesteal and native independent slow stages','Any eligible actual damage crossing500 immediately spreads once to a random700-radius neighbor','Dispel/expiry removes owned slow immediately;damage callbacks retain originalprovider even aftersource death'];wounds.remaining=['AA2percent realhero attack packet composition retains the existing core path;clone qualification and exotic HPRemoval exceptions require their separate result'];
}
